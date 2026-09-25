import type * as vscode from 'vscode';
import WebSocket from 'ws';
import { upsample16kTo24k } from '../audio/resample';
import type { SessionTicket } from './tokenProvider';

const CONNECT_TIMEOUT_MS = 15_000;
/** AssemblyAI drops audio sent faster than real time, so only a small burst is allowed. */
const BURST_MS = 120;
const PACER_TICK_MS = 20;
/** The server keeps a dropped session for 30 s; stay safely inside that. */
const RESUME_WINDOW_MS = 25_000;
/** Silence sent after the hotkey is released, so turn detection can close the question. */
const RELEASE_SILENCE_MS = 320;
/** If no reply has started this long after release, ask for one explicitly. */
const REPLY_FALLBACK_MS = 1200;
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
  /** AssemblyAI may answer before the hotkey is released; then no nudge is needed. */
  private repliedThisQuestion = false;
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

  /** Adds the editor context to the conversation without asking for a reply. */
  sendContext(text: string): void {
    this.enqueue({ kind: 'message', payload: { type: 'conversation.message', role: 'system', content: text } });
  }

  /** A question starts. AssemblyAI detects turns from the audio itself, so nothing to send. */
  startActivity(): void {
    this.repliedThisQuestion = false;
  }

  /** Streams one 16 kHz microphone frame, converted to 24 kHz and paced to real time. */
  sendAudio(pcm16k: Int16Array): void {
    const pcm = upsample16kTo24k(pcm16k);
    const data = Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength).toString('base64');
    this.enqueue({ kind: 'audio', data, ms: (pcm16k.length / MIC_RATE) * 1000 });
  }

  /** The hotkey was released: close the question and make sure a reply follows. */
  endActivity(): void {
    for (let ms = 0; ms < RELEASE_SILENCE_MS; ms += 32) this.enqueue({ kind: 'audio', data: SILENCE_FRAME, ms: 32 });
    this.enqueue({ kind: 'released' });
  }

  /** Closes the session. `end` also tells AssemblyAI it's over, so it can't be resumed. */
  close(end = true): void {
    const socket = this.socket;
    this.socket = undefined;
    this.ready = false;
    this.stopTimers();
    this.queue = [];
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
      case 'reply.started':
        clearTimeout(this.replyFallback);
        this.repliedThisQuestion = true;
        this.replyText = '';
        break;
      case 'reply.audio':
        if (typeof message.data === 'string') this.events.audio(message.data);
        break;
      case 'transcript.agent.delta':
        if (typeof message.delta === 'string') this.onAgentWord(message.delta, message.start_ms);
        break;
      case 'transcript.user':
        if (typeof message.text === 'string' && message.text.trim()) this.events.inputTranscript(message.text.trim());
        break;
      case 'reply.done':
        if (message.status === 'interrupted') this.events.interrupted();
        else this.events.turnComplete();
        break;
      case 'session.error':
        this.log.warn(`AssemblyAI error ${String(message.code)}: ${String(message.message)}`);
        break;
    }
  }

  /** Words arrive one at a time; add a space unless the word is punctuation. */
  private onAgentWord(word: string, startMs: unknown): void {
    const needsSpace = this.replyText.length > 0 && !/^[\s.,!?;:'")\]]/.test(word);
    const chunk = needsSpace ? ` ${word}` : word;
    this.replyText += chunk;
    this.events.outputTranscript(chunk, typeof startMs === 'number' ? startMs : null);
  }

  private enqueue(item: Outgoing): void {
    if (!this.socket) return;
    this.queue.push(item);
    this.pump();
  }

  /** Sends queued items in order, never faster than real-time audio. */
  private pump(): void {
    clearTimeout(this.pacer);
    this.pacer = undefined;
    const now = Date.now();
    this.budgetMs = Math.min(BURST_MS, this.budgetMs + (now - this.lastPump));
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
        this.armReplyFallback();
      }
      this.queue.shift();
    }
    if (this.queue.length > 0) this.pacer = setTimeout(() => this.pump(), PACER_TICK_MS);
  }

  private armReplyFallback(): void {
    clearTimeout(this.replyFallback);
    if (this.repliedThisQuestion) return;
    this.replyFallback = setTimeout(() => {
      this.log.info('No reply yet after release; asking for one');
      this.send({ type: 'reply.create' });
    }, REPLY_FALLBACK_MS);
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
