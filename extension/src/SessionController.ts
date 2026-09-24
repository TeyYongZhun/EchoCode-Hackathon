import * as vscode from 'vscode';
import { FRAME_MS, MicRecorder } from './audio/MicRecorder';
import { base64PcmSeconds, pcm16ToBase64, rmsLevel } from './audio/pcm';
import { SilenceDetector } from './audio/silenceDetector';
import { readSettings } from './config';
import { captureEditorContext, type EditorTracker } from './context/editorContext';
import { LiveClient } from './gemini/LiveClient';
import { fetchSessionTicket } from './gemini/tokenProvider';
import { HotkeyPresses } from './hotkeyPresses';
import type { SessionState } from './protocol';
import type { AssistantViewProvider } from './ui/AssistantViewProvider';

const OUTPUT_SAMPLE_RATE = 24000;
/** A question can't run longer than this, in case the user forgets to send it. */
const MAX_QUESTION_MS = 60_000;
/** Small margin after the last audio chunk before returning to idle. */
const PLAYBACK_TAIL_MS = 200;
/** Audio kept from just before speech starts (about half a second), so the first word isn't clipped. */
const PRE_ROLL_FRAMES = 16;
const NOTHING_HEARD = "I didn't hear anything. Try again, a little closer to the microphone.";

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Runs push-to-talk turns: hotkey → capture editor context and mic audio →
 * Gemini Live → spoken answer in the panel.
 *
 *   idle ─talk─► connecting ─► listening ─talk/silence─► thinking ─audio─► speaking ─done─► idle
 *                                  ▲                                          │
 *                                  └───────────── talk (barge in) ────────────┘
 *
 * Gemini only hears about a question once the user actually speaks. It rejects
 * a question with no audio ("Precondition check failed") and answers silence
 * with nonsense, so a turn with no speech is cancelled locally.
 */
export class SessionController implements vscode.Disposable {
  private state: SessionState = 'idle';
  private readonly live: LiveClient;
  private readonly mic = new MicRecorder();
  private readonly presses = new HotkeyPresses();
  private holding = false;
  private releaseTimer: NodeJS.Timeout | undefined;

  /** Increments on every new turn and on stop, so stale async work can tell it's stale. */
  private turnId = 0;
  private userText = '';
  private modelText = '';
  /** Editor context captured when this turn started. */
  private turnContext = '';
  /** The editor context Gemini already has, so it's only resent when it changes. */
  private lastContext: string | undefined;
  /** Mic audio not yet sent: captured while connecting or before speech began. */
  private pendingAudio: string[] = [];
  /** The Live session is open and ready for this turn's audio. */
  private sessionReady = false;
  /** Gemini has been told a question started (activityStart sent). */
  private activityOpen = false;
  private finishRequested = false;
  private silence = new SilenceDetector(FRAME_MS, 0);
  private frameCount = 0;
  private endOfSpeechAt = 0;
  private sawAudio = false;
  private playbackEndsAt = 0;
  private idleTimer: NodeJS.Timeout | undefined;
  private questionTimer: NodeJS.Timeout | undefined;

  private readonly view: AssistantViewProvider;
  private readonly editors: EditorTracker;
  private readonly log: vscode.LogOutputChannel;
  private readonly installId: string;
  private readonly subscription: vscode.Disposable;
  private readonly stateChanged = new vscode.EventEmitter<SessionState>();

  readonly onDidChangeState = this.stateChanged.event;

  constructor(view: AssistantViewProvider, editors: EditorTracker, log: vscode.LogOutputChannel, installId: string) {
    this.view = view;
    this.editors = editors;
    this.log = log;
    this.installId = installId;
    this.live = new LiveClient(
      {
        audio: (data) => this.onAudio(data),
        inputTranscript: (text) => this.onInputTranscript(text),
        outputTranscript: (text) => this.onOutputTranscript(text),
        turnComplete: () => this.onTurnComplete(),
        interrupted: () => this.view.post({ type: 'flushAudio' }),
        closed: (reason) => this.onSessionClosed(reason),
      },
      log,
    );
    this.subscription = view.onMessage((msg) => {
      if (msg.type === 'ready') this.view.post({ type: 'state', state: this.state });
      if (msg.type === 'toggleTalk') void this.toggleTalk();
      if (msg.type === 'stop') void this.stop();
    });
  }

  get currentState(): SessionState {
    return this.state;
  }

  /**
   * The hotkey, status bar robot and panel button all land here. Tap to start
   * and tap to send, or hold the hotkey while talking and let go to send.
   */
  async toggleTalk(): Promise<void> {
    const press = this.presses.press(Date.now());
    if (press.kind === 'ignored') return;
    if (press.kind === 'held') {
      if (!this.holding) this.log.info('Hotkey held: release it to send the question');
      this.holding = true;
      clearTimeout(this.releaseTimer);
      this.releaseTimer = setTimeout(() => this.onHotkeyReleased(), press.releaseAfterMs);
      return;
    }
    this.log.info(`Talk pressed (state: ${this.state})`);
    await this.guarded(() => this.handleTalk());
  }

  /** Cancels whatever is happening and goes quiet. */
  async stop(): Promise<void> {
    const hadActivity = this.activityOpen;
    this.turnId++;
    this.clearTimers();
    this.setState('idle');
    this.activityOpen = false;
    this.sessionReady = false;
    await this.mic.stop();
    // Close the open question; the reply is ignored because we're idle.
    if (hadActivity) this.live.endActivity();
    this.view.post({ type: 'flushAudio' });
  }

  dispose(): void {
    this.clearTimers();
    void this.mic.stop();
    this.live.close();
    this.subscription.dispose();
    this.stateChanged.dispose();
  }

  private async handleTalk(): Promise<void> {
    switch (this.state) {
      case 'idle':
        return this.startTurn();
      case 'connecting':
      case 'listening':
        return this.sessionReady ? this.finishSpeaking() : this.requestFinish();
      case 'thinking':
      case 'speaking':
        return this.bargeIn();
    }
  }

  private onHotkeyReleased(): void {
    this.holding = false;
    if (this.state !== 'listening' && this.state !== 'connecting') return;
    this.log.info('Hotkey released: sending the question');
    void this.guarded(() => this.handleTalk());
  }

  private async guarded(action: () => Promise<void>): Promise<void> {
    try {
      await action();
    } catch (err) {
      this.fail(`Something went wrong: ${errorMessage(err)}`);
    }
  }

  private async startTurn(): Promise<void> {
    const settings = readSettings();
    const editor = this.editors.editor;
    const turn = ++this.turnId;
    this.turnContext = captureEditorContext(editor, settings.maxContextLines);
    this.userText = '';
    this.modelText = '';
    this.pendingAudio = [];
    this.sessionReady = false;
    this.activityOpen = false;
    this.finishRequested = false;
    this.frameCount = 0;
    this.silence = new SilenceDetector(FRAME_MS, settings.autoStopSilenceMs);
    this.setState(this.live.isOpen ? 'listening' : 'connecting');
    void this.view.ensureVisible(editor);

    // A previous recording may still be winding down.
    await this.mic.stop();
    if (turn !== this.turnId) return;

    // Record straight away so nothing said while connecting is lost.
    try {
      const device = await this.mic.start(
        settings.micDeviceIndex,
        (pcm) => this.onMicFrame(pcm),
        (message) => this.fail(`Microphone error: ${message}`),
      );
      this.log.info(`Turn ${turn}: recording from "${device}"`);
    } catch (err) {
      if (turn === this.turnId) this.fail(`Couldn't open the microphone: ${errorMessage(err)}`);
      return;
    }
    if (turn !== this.turnId) return void this.mic.stop();

    if (!this.live.isOpen) {
      try {
        const started = Date.now();
        const ticket = await fetchSessionTicket(settings.backendUrl, this.installId);
        await this.live.connect(ticket);
        this.lastContext = undefined;
        this.log.info(`Connected in ${Date.now() - started} ms`);
      } catch (err) {
        if (turn === this.turnId) this.fail(errorMessage(err));
        return;
      }
      if (turn !== this.turnId) return;
    }

    this.sessionReady = true;
    this.setState('listening');
    this.openActivityIfSpeaking();
    if (this.finishRequested) {
      await this.finishSpeaking();
      return;
    }
    this.questionTimer = setTimeout(() => void this.guarded(() => this.finishSpeaking()), MAX_QUESTION_MS);
  }

  /** Tells Gemini a question has started, once the session is ready and the user is speaking. */
  private openActivityIfSpeaking(): void {
    if (!this.sessionReady || this.activityOpen || !this.silence.speechDetected) return;
    if (this.turnContext !== this.lastContext) {
      this.live.sendContext(this.turnContext);
      this.lastContext = this.turnContext;
    }
    this.live.startActivity();
    for (const chunk of this.pendingAudio) this.live.sendAudio(chunk);
    this.pendingAudio = [];
    this.activityOpen = true;
  }

  /** The user finished before the session was ready; send as soon as it is. */
  private async requestFinish(): Promise<void> {
    if (this.finishRequested) return;
    this.finishRequested = true;
    await this.mic.stop();
  }

  private async finishSpeaking(): Promise<void> {
    if (this.state !== 'listening' || !this.sessionReady) return;
    clearTimeout(this.questionTimer);
    this.setState('thinking');
    await this.mic.stop();
    this.openActivityIfSpeaking();

    if (!this.activityOpen) {
      this.log.warn('No speech detected, so nothing was sent to Gemini.');
      this.pendingAudio = [];
      this.setState('idle');
      this.view.post({ type: 'error', message: NOTHING_HEARD });
      return;
    }
    this.live.endActivity();
    this.activityOpen = false;
    this.endOfSpeechAt = Date.now();
    this.sawAudio = false;
    this.playbackEndsAt = 0;
  }

  private async bargeIn(): Promise<void> {
    this.clearTimers();
    this.view.post({ type: 'flushAudio' });
    this.playbackEndsAt = 0;
    await this.startTurn();
  }

  private onMicFrame(pcm: Int16Array): void {
    const level = rmsLevel(pcm);
    // About 15 updates a second is plenty for a visualizer.
    if (++this.frameCount % 2 === 0) this.view.post({ type: 'micLevel', level });

    const chunk = pcm16ToBase64(pcm);
    if (this.activityOpen) {
      this.live.sendAudio(chunk);
    } else {
      this.pendingAudio.push(chunk);
      // Before anyone speaks, only a short pre-roll is worth keeping.
      if (!this.silence.speechDetected && this.pendingAudio.length > PRE_ROLL_FRAMES) this.pendingAudio.shift();
    }

    const ended = this.silence.push(level);
    this.openActivityIfSpeaking();
    if (ended && (this.state === 'listening' || this.state === 'connecting')) {
      void this.guarded(() => (this.sessionReady ? this.finishSpeaking() : this.requestFinish()));
    }
  }

  private onAudio(data: string): void {
    if (this.state !== 'thinking' && this.state !== 'speaking') return;
    if (!this.sawAudio) {
      this.sawAudio = true;
      const ms = Date.now() - this.endOfSpeechAt;
      this.log.info(`Turn ${this.turnId}: first audio after ${ms} ms`);
      this.view.post({ type: 'latency', turnId: this.turnId, ms });
      this.setState('speaking');
    }
    this.view.post({ type: 'audio', data });
    const seconds = base64PcmSeconds(data, OUTPUT_SAMPLE_RATE);
    this.playbackEndsAt = Math.max(Date.now(), this.playbackEndsAt) + seconds * 1000;
  }

  private onInputTranscript(text: string): void {
    if (this.state === 'idle') return;
    this.userText += text;
    this.view.post({ type: 'userTranscript', turnId: this.turnId, text: this.userText });
  }

  private onOutputTranscript(text: string): void {
    if (this.state !== 'thinking' && this.state !== 'speaking') return;
    this.modelText += text;
    this.view.post({ type: 'modelTranscript', turnId: this.turnId, text: this.modelText });
  }

  private onTurnComplete(): void {
    if (this.state !== 'thinking' && this.state !== 'speaking') return;
    const turn = this.turnId;
    this.view.post({ type: 'turnComplete', turnId: turn });
    this.log.info(`Turn ${turn} complete. You: "${this.userText.trim()}" / EchoCode: "${this.modelText.trim()}"`);
    // Gemini sends audio faster than real time, so wait for playback to finish.
    const wait = Math.max(0, this.playbackEndsAt - Date.now()) + PLAYBACK_TAIL_MS;
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      if (turn === this.turnId && (this.state === 'speaking' || this.state === 'thinking')) this.setState('idle');
    }, wait);
  }

  private onSessionClosed(reason: string): void {
    this.lastContext = undefined;
    this.sessionReady = false;
    this.activityOpen = false;
    if (this.state === 'listening' || this.state === 'thinking') {
      this.fail(`Gemini ended the session (${reason}). Press the hotkey to start again.`);
    }
  }

  private fail(message: string): void {
    this.log.error(message);
    this.turnId++;
    this.clearTimers();
    this.sessionReady = false;
    this.activityOpen = false;
    void this.mic.stop();
    this.setState('idle');
    this.view.post({ type: 'error', message });
    void vscode.window.showErrorMessage(`EchoCode: ${message}`);
  }

  private setState(state: SessionState): void {
    if (this.state === state) return;
    this.state = state;
    this.view.post({ type: 'state', state });
    this.stateChanged.fire(state);
    void vscode.commands.executeCommand('setContext', 'echocode.state', state);
  }

  private clearTimers(): void {
    clearTimeout(this.idleTimer);
    clearTimeout(this.questionTimer);
  }
}
