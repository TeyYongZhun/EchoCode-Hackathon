import type * as vscode from 'vscode';
import WebSocket from 'ws';
import { upsample16kTo24k } from '../audio/resample';
import type { SessionTicket } from './tokenProvider';

const CONNECT_TIMEOUT_MS = 15_000;
/** Most audio sent in one go. */
const BURST_MS = 120;
/**
 * Audio queued while connecting or while speech is confirmed is sent at up to
 * twice real time until it catches up with the mic. Tested live: nothing is
 * dropped, and the answer comes sooner; much faster than 2x gains nothing,
 * because AssemblyAI still works through the audio at about real time.
 */
const CATCH_UP_RATE = 2;
const PACER_TICK_MS = 20;
/** The server keeps a dropped session for 30 s; stay safely inside that. */
const RESUME_WINDOW_MS = 25_000;
/** Silence sent after the hotkey is released, so turn detection can close the question. */
const RELEASE_SILENCE_MS = 320;
/** If no reply has started this long after release, ask for one explicitly. */
const REPLY_FALLBACK_MS = 1200;
/** If AssemblyAI still hasn't finished hearing the question this long after release, ask anyway. */
const HEARING_TIMEOUT_MS = 4000;
const MIC_RATE = 16_000;
const AGENT_RATE = 24_000;
const SILENCE_FRAME = Buffer.alloc((AGENT_RATE / 1000) * 32 * 2).toString('base64'); // 32 ms at 24 kHz

/** A resume attempt failed (session expired or unknown); connect again with a fresh session. */
export class ResumeFailedError extends Error {}

export interface AgentClientEvents {
  /** A chunk of the spoken reply: base64 16-bit PCM, mono, 24 kHz. */
  audio(data: string): void;
  /** The user's finished utterance, as transcribed. */
  inputTranscript(text: string): void;
  /** The next word(s) of the reply, and where they start in the reply's audio (ms), when known. */
  outputTranscript(text: string, startMs: number | null): void;
  turnComplete(): void;
  /** The reply stopped because the user spoke over it. */
  interrupted(): void;
  /** The session ended; the next question needs a new connection. */
  closed(reason: string): void;
}

type Outgoing =
  | { kind: 'audio'; data: string; ms: number }
  | { kind: 'message'; payload: object }
  | { kind: 'released' };

interface ServerMessage {
  type: string;
  [field: string]: unknown;
}

/** One AssemblyAI Voice Agent session over a WebSocket, opened with a single-use token. */
export class AgentClient {
  private socket: WebSocket | undefined;
  private ready = false;
  private sessionId: string | undefined;
  private disconnectedAt = 0;
  private queue: Outgoing[] = [];
  private budgetMs = BURST_MS;
  private lastPump = Date.now();
  private pacer: NodeJS.Timeout | undefined;
  private replyFallback: NodeJS.Timeout | undefined;
  /** Text of the current reply so far, to space incoming words correctly. */
  private replyText = '';
  /** The system prompt the session started with; editor context is appended to it per question. */
  private basePrompt = '';
  /**
   * True while the hotkey is held. AssemblyAI ends a turn at any complete
   * sentence, so it may start answering mid-question; while the user is still
   * holding the key, the reply is kept back here instead of played. If the user
   * keeps talking, AssemblyAI cancels that reply and answers the whole question.
   */
  private holding = false;
  private held: (() => void)[] = [];
  private replyActive = false;
  /**
   * The reply in progress answers a question the user has moved on from
   * (stopped, or asked something new over it). The server can't be told to
   * cancel it, so the rest of it is dropped here until the next reply starts.
   */
  private discarding = false;
  /** A reply with content finished for this question, so it's the answer; no nudge needed. */
  private replyCompletedThisQuestion = false;
  /** The reply in progress has passed on some audio or words. */
  private replyHasContent = false;
  /** EchoCode already asked for this question's answer with reply.create. */
  private askedForReply = false;
  /** AssemblyAI reported speech it hasn't transcribed yet. */
  private userSpeaking = false;
  /** A transcript of this question has arrived. */
  private heardThisQuestion = false;
  /** The release nudge waits for the question's transcript before counting down. */
  private nudgeAfterTranscript = false;
  /** The hotkey was released and this question's answer hasn't started yet. */
  private awaitingAnswer = false;
  private readonly events: AgentClientEvents;
  private readonly log: vscode.LogOutputChannel;

  constructor(events: AgentClientEvents, log: vscode.LogOutputChannel) {
    this.events = events;
    this.log = log;
  }

  get isOpen(): boolean {
    return this.socket !== undefined && this.ready;
  }

  /** True when a recently dropped session can still be resumed with its conversation. */
  get canResume(): boolean {
    return this.sessionId !== undefined && Date.now() - this.disconnectedAt < RESUME_WINDOW_MS;
  }

  /**
   * Opens a session and resolves once AssemblyAI reports it ready. Resumes the
   * previous session when possible; throws ResumeFailedError if that fails.
   */
  async connect(ticket: SessionTicket): Promise<void> {
    this.close(false);
    const resumeId = this.canResume ? this.sessionId : undefined;
    const prompt = ticket.session.system_prompt;
    this.basePrompt = typeof prompt === 'string' ? prompt : '';
    const socket = new WebSocket(`${ticket.url}?token=${encodeURIComponent(ticket.token)}`);
    this.socket = socket;
    this.ready = false;

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const settle = (err?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (err) {
          if (resumeId) this.sessionId = undefined;
          if (this.socket === socket) this.socket = undefined;
          socket.terminate();
          reject(err);
        } else {
          resolve();
        }
      };
      const timer = setTimeout(() => settle(new Error('Timed out connecting to AssemblyAI.')), CONNECT_TIMEOUT_MS);
      const startupError = (message: string) =>
        resumeId ? new ResumeFailedError(message) : new Error(`AssemblyAI: ${message}`);

      socket.on('open', () => {
        const first = resumeId
          ? { type: 'session.resume', session_id: resumeId }
          : { type: 'session.update', session: ticket.session };
        socket.send(JSON.stringify(first));
      });
      socket.on('message', (raw) => {
        const message = this.parse(raw.toString());
        if (!message) return;
        if (!this.ready) {
          if (message.type === 'session.ready') {
            this.ready = true;
            if (typeof message.session_id === 'string') this.sessionId = message.session_id;
            this.log.info(`AssemblyAI session ${resumeId ? 'resumed' : 'ready'} (${this.sessionId ?? 'no id'})`);
            settle();
          } else if (message.type === 'session.error') {
            settle(startupError(`${String(message.code)}: ${String(message.message)}`));
          }
          return;
        }
        this.handleMessage(message);
      });
      socket.on('error', (err) => {
        this.log.error(`AssemblyAI socket error: ${err.message}`);
        settle(startupError(`connection error: ${err.message}`));
      });
      socket.on('close', (code, reason) => {
        const why = reason.toString() || `code ${code}`;
        if (!this.ready || this.socket !== socket) {
          settle(startupError(`closed before the session started (${why})`));
          return;
        }
        this.log.info(`AssemblyAI session closed (${why})`);
        this.socket = undefined;
        this.ready = false;
        this.disconnectedAt = Date.now();
        this.stopTimers();
        this.events.closed(why);
      });
    });
  }

  /**
   * Gives the agent the editor context for the next question. It goes into the
   * system prompt: tested live, the agent ignored context sent as a conversation
   * message (system or user role) but uses a system_prompt update straight away.
   */
  sendContext(text: string): void {
    const session = { system_prompt: `${this.basePrompt}\n\n${text}` };
    this.enqueue({ kind: 'message', payload: { type: 'session.update', session } });
  }

  /** A question starts: hold back any reply until the hotkey is released. */
  startActivity(): void {
    // A reply still arriving now answers an earlier question.
    if (this.replyActive) this.discarding = true;
    this.holding = true;
    this.held = [];
    this.replyCompletedThisQuestion = false;
    this.askedForReply = false;
    this.heardThisQuestion = false;
    this.nudgeAfterTranscript = false;
    this.awaitingAnswer = false;
  }

  /** Streams one 16 kHz microphone frame, converted to 24 kHz and paced to real time. */
  sendAudio(pcm16k: Int16Array): void {
    const pcm = upsample16kTo24k(pcm16k);
    const data = Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength).toString('base64');
    this.enqueue({ kind: 'audio', data, ms: (pcm16k.length / MIC_RATE) * 1000 });
  }

  /**
   * The hotkey was released. A reply that's already under way plays from its
   * first word; otherwise a short silence lets turn detection close the
   * question, with a nudge if no reply starts.
   */
  endActivity(): void {
    this.holding = false;
    const held = this.held;
    this.held = [];
    for (const deliver of held) deliver();
    for (let ms = 0; ms < RELEASE_SILENCE_MS; ms += 32) this.enqueue({ kind: 'audio', data: SILENCE_FRAME, ms: 32 });
    this.enqueue({ kind: 'released' });
  }

  /**
   * An answer is still arriving from AssemblyAI (not one being dropped). Tested
   * live, AssemblyAI keeps "playing" such an answer after EchoCode silences it,
   * and throws away a short question asked over it; the API can't cancel it.
   * So interrupting it ends the session, and the question goes to a fresh one.
   */
  get replyInProgress(): boolean {
    return this.replyActive && !this.discarding;
  }

  /**
   * The user stopped the conversation or interrupted the answer: drop the rest
   * of the reply in progress, and don't ask for one to a question just closed.
   */
  cancelReply(): void {
    clearTimeout(this.replyFallback);
    this.nudgeAfterTranscript = false;
    this.awaitingAnswer = false;
    this.queue = this.queue.filter((item) => item.kind !== 'released');
    if (this.replyActive) this.discarding = true;
    this.holding = false;
    this.held = [];
  }

  /** Closes the session. `end` also tells AssemblyAI it's over, so it can't be resumed. */
  close(end = true): void {
    const socket = this.socket;
    this.socket = undefined;
    this.ready = false;
    this.stopTimers();
    this.queue = [];
    this.holding = false;
    this.held = [];
    this.replyActive = false;
    this.discarding = false;
    if (!socket) return;
    try {
      if (end && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'session.end' }));
        this.sessionId = undefined;
      }
      socket.close();
    } catch {
      // Already closed.
    }
  }

  private handleMessage(message: ServerMessage): void {
    switch (message.type) {
      case 'input.speech.started':
        this.userSpeaking = true;
        break;
      case 'input.speech.stopped':
        this.userSpeaking = false;
        break;
      case 'reply.started':
        this.replyActive = true;
        clearTimeout(this.replyFallback);
        this.nudgeAfterTranscript = false;
        this.awaitingAnswer = false;
        this.discarding = false;
        this.replyCompletedThisQuestion = false;
        this.replyHasContent = false;
        this.replyText = '';
        // A newer reply supersedes anything kept back from an earlier one.
        if (this.holding) this.held = [];
        break;
      case 'reply.audio': {
        const data = message.data;
        if (typeof data === 'string' && !this.discarding) {
          this.replyHasContent = true;
          this.deliver(() => this.events.audio(data));
        }
        break;
      }
      case 'transcript.agent.delta':
        if (typeof message.delta === 'string' && !this.discarding) {
          this.replyHasContent = true;
          this.onAgentWord(message.delta, message.start_ms);
        }
        break;
      case 'transcript.agent':
        // The reply's full text, normally already passed on word by word. When no words came
        // (seen once: an answer that played with no text), pass it on whole.
        if (typeof message.text === 'string' && message.text.trim() && !this.replyText.trim() && !this.discarding) {
          this.replyHasContent = true;
          this.onAgentWord(message.text.trim(), undefined);
        }
        break;
      case 'transcript.user':
        this.userSpeaking = false;
        this.heardThisQuestion = true;
        if (typeof message.text === 'string' && message.text.trim()) this.events.inputTranscript(message.text.trim());
        if (this.nudgeAfterTranscript) {
          // AssemblyAI has the whole question now; the answer normally starts right away.
          this.nudgeAfterTranscript = false;
          this.armReplyFallback();
        }
        break;
      case 'reply.done':
        this.replyActive = false;
        if (this.discarding) {
          this.discarding = false;
          // A dropped answer ending doesn't answer the question that's waiting.
          if (this.awaitingAnswer && !this.holding) this.armReplyFallback();
        } else if (message.status === 'interrupted') {
          // Cancelled because the agent heard more of the question. While
          // holding, just drop it; after release, a new reply follows.
          if (this.holding) {
            this.held = [];
          } else {
            this.events.interrupted();
            this.armReplyFallback();
          }
        } else if (!this.replyHasContent) {
          this.onEmptyReply(message.status);
        } else if (this.holding) {
          this.replyCompletedThisQuestion = true;
          this.held.push(() => this.events.turnComplete());
        } else {
          // Also stops the release nudge still queued behind the closing silence from asking again.
          this.replyCompletedThisQuestion = true;
          this.events.turnComplete();
        }
        break;
      case 'session.error':
        this.log.warn(`AssemblyAI error ${String(message.code)}: ${String(message.message)}`);
        break;
    }
  }

  /**
   * A reply ended without a word or a sound. Taken as the answer, it silently
   * ended the question. Tested live, AssemblyAI ends a reply this way when it
   * started answering before the question's transcript was final, and the
   * real answer usually starts right after; asking for one at that moment
   * cuts the real one off too. So wait for it, and ask only if none starts;
   * if that answer is empty as well, end the question.
   */
  private onEmptyReply(status: unknown): void {
    this.log.info(`A reply ended with nothing in it (status: ${String(status)})`);
    // While the key is held the question isn't finished; release asks for a reply if none comes.
    if (this.holding) return;
    clearTimeout(this.replyFallback);
    // Cleared by reply.started when the real answer follows.
    this.replyFallback = setTimeout(() => {
      if (this.askedForReply) {
        this.events.turnComplete();
        return;
      }
      this.askedForReply = true;
      this.log.info('No answer followed; asking for one');
      this.send({ type: 'reply.create' });
    }, REPLY_FALLBACK_MS);
  }

  /**
   * Words arrive one at a time, sometimes with their own spaces and sometimes
   * without; add a space only where one is missing.
   */
  private onAgentWord(word: string, startMs: unknown): void {
    const needsSpace = this.replyText.length > 0 && !/\s$/.test(this.replyText) && !/^[\s.,!?;:'")\]]/.test(word);
    const chunk = needsSpace ? ` ${word}` : word;
    this.replyText += chunk;
    const timing = typeof startMs === 'number' ? startMs : null;
    this.deliver(() => this.events.outputTranscript(chunk, timing));
  }

  /** Passes a reply event on now, or keeps it until the hotkey is released. */
  private deliver(event: () => void): void {
    if (this.holding) this.held.push(event);
    else event();
  }

  private enqueue(item: Outgoing): void {
    if (!this.socket) return;
    this.queue.push(item);
    this.pump();
  }

  /** Sends queued items in order, never faster than CATCH_UP_RATE times real-time audio. */
  private pump(): void {
    clearTimeout(this.pacer);
    this.pacer = undefined;
    const now = Date.now();
    this.budgetMs = Math.min(BURST_MS, this.budgetMs + (now - this.lastPump) * CATCH_UP_RATE);
    this.lastPump = now;

    while (this.queue.length > 0) {
      const item = this.queue[0];
      if (item.kind === 'audio') {
        if (this.budgetMs < item.ms) break;
        this.budgetMs -= item.ms;
        this.send({ type: 'input.audio', audio: item.data });
      } else if (item.kind === 'message') {
        this.send(item.payload);
      } else {
        this.awaitingAnswer = !this.replyCompletedThisQuestion;
        this.armReplyFallback();
      }
      this.queue.shift();
    }
    if (this.queue.length > 0) this.pacer = setTimeout(() => this.pump(), PACER_TICK_MS);
  }

  /**
   * Asks for an answer if none starts. Not while AssemblyAI is still working
   * through the question, though: tested live, asking then gets an empty
   * answer (and sometimes none at all). That happened whenever question audio
   * was still queued at release, as on the first question after connecting.
   */
  private armReplyFallback(): void {
    clearTimeout(this.replyFallback);
    // A reply is already playing, or one finished while the key was held. A reply being
    // dropped doesn't count: waiting on it is how interrupting used to leave EchoCode stuck.
    if ((this.replyActive && !this.discarding) || this.replyCompletedThisQuestion) return;
    const hearing = this.userSpeaking || !this.heardThisQuestion;
    this.nudgeAfterTranscript = hearing;
    this.replyFallback = setTimeout(
      () => {
        this.nudgeAfterTranscript = false;
        this.log.info('No reply yet after release; asking for one');
        this.askedForReply = true;
        this.send({ type: 'reply.create' });
      },
      hearing ? HEARING_TIMEOUT_MS : REPLY_FALLBACK_MS,
    );
  }

  private send(payload: object): void {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    try {
      socket.send(JSON.stringify(payload));
    } catch (err) {
      this.log.error(`Failed to send to AssemblyAI: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private parse(text: string): ServerMessage | undefined {
    try {
      const value = JSON.parse(text) as ServerMessage;
      return typeof value?.type === 'string' ? value : undefined;
    } catch {
      return undefined;
    }
  }

  private stopTimers(): void {
    clearTimeout(this.pacer);
    clearTimeout(this.replyFallback);
    this.pacer = undefined;
  }
}
