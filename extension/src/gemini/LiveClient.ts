import { GoogleGenAI, type LiveServerMessage, type Session } from '@google/genai';
import type * as vscode from 'vscode';
import type { SessionTicket } from './tokenProvider';

const CONNECT_TIMEOUT_MS = 15_000;
const MIC_MIME_TYPE = 'audio/pcm;rate=16000';

export interface LiveClientEvents {
  /** A chunk of spoken reply: base64 16-bit PCM, mono, 24 kHz. */
  audio(data: string): void;
  inputTranscript(text: string): void;
  outputTranscript(text: string): void;
  turnComplete(): void;
  /** The model stopped talking because the user started a new question. */
  interrupted(): void;
  /** The session ended; the next question needs a new connection. */
  closed(reason: string): void;
  /** Gemini will close this connection soon (connections have a time limit). */
  goAway(): void;
}

/** A thin wrapper around one Gemini Live session opened with an ephemeral token. */
export class LiveClient {
  private session: Session | undefined;
  /** Lets a later session resume this conversation (see the token route). */
  private handle: string | undefined;
  private readonly events: LiveClientEvents;
  private readonly log: vscode.LogOutputChannel;

  constructor(events: LiveClientEvents, log: vscode.LogOutputChannel) {
    this.events = events;
    this.log = log;
  }

  get isOpen(): boolean {
    return this.session !== undefined;
  }

  /** The latest handle for resuming this conversation in a new session, if Gemini has offered one. */
  get resumeHandle(): string | undefined {
    return this.handle;
  }

  forgetResumeHandle(): void {
    this.handle = undefined;
  }

  /** Opens the session and resolves once Gemini has accepted the setup. */
  async connect(ticket: SessionTicket): Promise<void> {
    this.close();
    const ai = new GoogleGenAI({ apiKey: ticket.token, httpOptions: { apiVersion: ticket.apiVersion } });

    // live.connect() waits for the server's setupComplete and never settles if
    // the socket closes first, so race it against close, error and a timeout.
    let failEarly!: (err: Error) => void;
    const earlyFailure = new Promise<never>((_, reject) => (failEarly = reject));
    let session: Session | undefined;
    let closed = false;

    const connecting = ai.live.connect({
      model: ticket.model,
      config: ticket.config,
      callbacks: {
        onmessage: (message) => this.handleMessage(message),
        onerror: (e) => {
          this.log.error(`Gemini Live socket error: ${e.message}`);
          failEarly(new Error(`Gemini Live connection error: ${e.message}`));
        },
        onclose: (e) => {
          closed = true;
          const reason = e.reason || `code ${e.code}`;
          this.log.info(`Gemini Live session closed (${reason})`);
          failEarly(new Error(`Gemini closed the session: ${reason}`));
          if (session && this.session === session) {
            this.session = undefined;
            this.events.closed(reason);
          }
        },
      },
    });

    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Timed out connecting to Gemini Live.')), CONNECT_TIMEOUT_MS);
    });
    try {
      session = await Promise.race([connecting, earlyFailure, timeout]);
    } catch (err) {
      // If the losing connect attempt finishes later, don't leave it open.
      connecting.then((late) => late.close(), () => undefined);
      throw err;
    } finally {
      clearTimeout(timer);
    }
    if (closed) throw new Error('Gemini closed the session while it was starting.');
    this.session = session;
    this.log.info(`Gemini Live session ready (${ticket.model})`);
  }

  /** Adds the editor context to the conversation without asking for a reply yet. */
  sendContext(text: string): void {
    this.send((s) => s.sendClientContent({ turns: [{ role: 'user', parts: [{ text }] }], turnComplete: false }));
  }

  startActivity(): void {
    this.send((s) => s.sendRealtimeInput({ activityStart: {} }));
  }

  sendAudio(base64Pcm: string): void {
    this.send((s) => s.sendRealtimeInput({ audio: { data: base64Pcm, mimeType: MIC_MIME_TYPE } }));
  }

  /** Marks the end of the question; Gemini starts answering. */
  endActivity(): void {
    this.send((s) => s.sendRealtimeInput({ activityEnd: {} }));
  }

  close(): void {
    const session = this.session;
    this.session = undefined;
    try {
      session?.close();
    } catch {
      // Already closed.
    }
  }

  private send(action: (session: Session) => void): void {
    if (!this.session) return;
    try {
      action(this.session);
    } catch (err) {
      this.log.error(`Failed to send to Gemini Live: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private handleMessage(message: LiveServerMessage): void {
    const content = message.serverContent;
    if (content) {
      if (content.interrupted) this.events.interrupted();
      for (const part of content.modelTurn?.parts ?? []) {
        const data = part.inlineData?.data;
        if (data && !part.thought) this.events.audio(data);
      }
      if (content.inputTranscription?.text) this.events.inputTranscript(content.inputTranscription.text);
      if (content.outputTranscription?.text) this.events.outputTranscript(content.outputTranscription.text);
      if (content.turnComplete) this.events.turnComplete();
    }
    const update = message.sessionResumptionUpdate;
    if (update?.resumable && update.newHandle) this.handle = update.newHandle;
    if (message.goAway) {
      this.log.info(`Gemini will end this connection in ${message.goAway.timeLeft ?? 'a moment'}`);
      this.events.goAway();
    }
  }
}
