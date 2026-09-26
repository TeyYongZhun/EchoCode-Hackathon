import * as vscode from 'vscode';
import { FRAME_MS, MicRecorder } from './audio/MicRecorder';
import { base64PcmSeconds, rmsLevel } from './audio/pcm';
import { SilenceDetector } from './audio/silenceDetector';
import { readSettings } from './config';
import { captureEditorContext, captureTarget, type EditorTracker, type QuestionTarget } from './context/editorContext';
import { findLineReferences } from './context/lineReferences';
import { AgentClient, ResumeFailedError } from './voice/AgentClient';
import { fetchSuggestion } from './voice/suggestionClient';
import { fetchSessionTicket } from './voice/tokenProvider';
import { reportUsage } from './voice/usageClient';
import { HotkeyPresses } from './hotkeyPresses';
import type { SessionState } from './protocol';
import type { AssistantViewProvider } from './ui/AssistantViewProvider';
import { CodeCards } from './ui/CodeCards';
import { LineHighlighter } from './ui/LineHighlighter';

const OUTPUT_SAMPLE_RATE = 24000;
/** A question can't run longer than this, in case the user forgets to send it. */
const MAX_QUESTION_MS = 60_000;
/** Small margin after the last audio chunk before returning to idle. */
const PLAYBACK_TAIL_MS = 200;
/** Audio kept from just before speech starts (about half a second), so the first word isn't clipped. */
const PRE_ROLL_FRAMES = 16;
/**
 * Once anything loud is heard, audio is kept until speech is confirmed (about
 * five seconds at most). Quiet speech takes a while to confirm, and trimming
 * to the pre-roll meanwhile cut off the first word: "Hello, hello" became "I know".
 */
const MAX_UNCONFIRMED_FRAMES = 156;
const NOTHING_HEARD = "I didn't hear anything. Try again, a little closer to the microphone.";
/** Show a highlight slightly before the words are heard, since reading lags listening. */
const HIGHLIGHT_LEAD_MS = 300;
/** How long the last highlight stays once the answer has finished playing. */
const HIGHLIGHT_LINGER_MS = 8000;
/** Answers shorter than this can't describe a code change. */
const MIN_ANSWER_FOR_CODE = 40;
/** The default talk hotkey; users can rebind "EchoCode: Talk" in Keyboard Shortcuts. */
export const HOTKEY_LABEL = process.platform === 'darwin' ? 'Ctrl+Shift+Space' : 'Ctrl+Alt+Space';
/** Keep a connection warm in the background only while EchoCode is in active use. */
const WARM_WINDOW_MS = 10 * 60_000;
const MIN_WARM_INTERVAL_MS = 60_000;
/** End an unused session after this long; AssemblyAI bills by session time. */
const IDLE_CLOSE_MS = 3 * 60_000;
/** The panel starts playing a reply's first chunk about this long after it arrives. */
const PLAYBACK_START_DELAY_MS = 50;
/** Give up on a question if its answer hasn't started this long after it was sent. */
const REPLY_TIMEOUT_MS = 20_000;
const NO_REPLY = "EchoCode didn't answer that time. Please ask again.";

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Runs push-to-talk turns: hotkey → capture editor context and mic audio →
 * AssemblyAI Voice Agent → spoken answer in the panel.
 *
 *   idle ─talk─► connecting ─► listening ─talk/silence─► thinking ─audio─► speaking ─done─► idle
 *                                  ▲                                          │
 *                                  └───────────── talk (barge in) ────────────┘
 *
 * The agent only hears a question once the user actually speaks: a turn with
 * no speech is cancelled locally rather than sending silence, which voice
 * models tend to answer with nonsense.
 */
export class SessionController implements vscode.Disposable {
  private state: SessionState = 'idle';
  private readonly live: AgentClient;
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
  /** The document and selection this turn's question was about. */
  private turnTarget: QuestionTarget | undefined;
  /** Line references in the answer that already have a highlight scheduled. */
  private highlightedRefs = 0;
  private highlightTimers: NodeJS.Timeout[] = [];
  private readonly highlighter = new LineHighlighter();
  private readonly cards: CodeCards;
  /** The editor context the agent already has, so it's only resent when it changes. */
  private lastContext: string | undefined;
  /** Mic audio not yet sent: captured while connecting or before speech began. */
  private pendingAudio: Int16Array[] = [];
  /** The Live session is open and ready for this turn's audio. */
  private sessionReady = false;
  /** The agent is receiving this question's audio. */
  private activityOpen = false;
  private finishRequested = false;
  private silence = new SilenceDetector(FRAME_MS, 0);
  private frameCount = 0;
  private endOfSpeechAt = 0;
  private sawAudio = false;
  private playbackEndsAt = 0;
  private idleTimer: NodeJS.Timeout | undefined;
  private questionTimer: NodeJS.Timeout | undefined;
  private replyTimer: NodeJS.Timeout | undefined;
  /** The connection attempt in progress, shared by a question and a background reconnect. */
  private connecting: Promise<void> | undefined;
  private idleCloseTimer: NodeJS.Timeout | undefined;
  private lastActivityAt = 0;
  private lastWarmReconnectAt = 0;
  /** Seconds of question and answer audio in this turn, for the usage meter. */
  private voiceSeconds = 0;
  /** When this turn's reply started playing, to time highlights against its words. */
  private replyPlaysAt = 0;
  /** Where each received word ends in modelText, and when it's spoken in the reply (ms). */
  private wordTimes: { end: number; startMs: number }[] = [];

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
    this.cards = new CodeCards(editors);
    this.live = new AgentClient(
      {
        audio: (data) => this.onAudio(data),
        inputTranscript: (text) => this.onInputTranscript(text),
        outputTranscript: (text, startMs) => this.onOutputTranscript(text, startMs),
        turnComplete: () => this.onTurnComplete(),
        interrupted: () => this.onInterrupted(),
        closed: (reason) => this.onSessionClosed(reason),
      },
      log,
    );
    this.subscription = view.onMessage((msg) => {
      switch (msg.type) {
        case 'ready':
          this.view.post({ type: 'hello', hotkey: HOTKEY_LABEL });
          this.view.post({ type: 'state', state: this.state });
          break;
        case 'stop':
          void this.stop();
          break;
        case 'insertCode':
          void this.guardedAction(() => this.cards.insert(msg.id));
          break;
        case 'copyCode':
          void this.guardedAction(() => this.cards.copy(msg.id));
          break;
      }
    });
  }

  get currentState(): SessionState {
    return this.state;
  }

  /**
   * The hotkey and the status bar item both land here. Tap to start
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
    const was = this.state;
    this.turnId++;
    this.clearTimers();
    this.view.post({ type: 'flushAudio' });
    this.setState('idle');
    this.view.post({ type: 'stopped', was });
    this.activityOpen = false;
    this.sessionReady = false;
    this.clearHighlights();
    // Close the open question so it isn't joined to the next one, then drop any answer to it.
    if (hadActivity) this.live.endActivity();
    this.live.cancelReply();
    await this.mic.stop();
  }

  dispose(): void {
    this.clearTimers();
    clearTimeout(this.idleCloseTimer);
    void this.mic.stop();
    this.live.close();
    this.highlighter.dispose();
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

  /** For panel actions (insert, copy) whose failure shouldn't end the conversation. */
  private async guardedAction(action: () => Promise<void>): Promise<void> {
    try {
      await action();
    } catch (err) {
      this.log.error(`Panel action failed: ${errorMessage(err)}`);
      void vscode.window.showErrorMessage(`EchoCode: ${errorMessage(err)}`);
    }
  }

  private async startTurn(): Promise<void> {
    const settings = readSettings();
    const editor = this.editors.editor;
    const turn = ++this.turnId;
    this.lastActivityAt = Date.now();
    this.voiceSeconds = 0;
    this.replyPlaysAt = 0;
    this.wordTimes = [];
    clearTimeout(this.idleCloseTimer);
    this.turnContext = captureEditorContext(editor, settings.maxContextLines);
    this.turnTarget = captureTarget(editor);
    this.clearHighlights();
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
      if (turn === this.turnId) {
        this.fail(
          `Couldn't open the microphone (${errorMessage(err)}). Check that one is connected and that ` +
            'desktop apps may use it, or pick another with "EchoCode: Choose Microphone".',
        );
      }
      return;
    }
    if (turn !== this.turnId) return void this.mic.stop();

    if (!this.live.isOpen) {
      try {
        await this.ensureSession();
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

  /** Opens a voice session unless one is open or opening. Concurrent callers share one attempt. */
  private ensureSession(): Promise<void> {
    if (this.live.isOpen) return Promise.resolve();
    this.connecting ??= this.openSession().finally(() => {
      this.connecting = undefined;
    });
    return this.connecting;
  }

  /** Connects, resuming a recently dropped session (and its conversation) when possible. */
  private async openSession(): Promise<void> {
    const backendUrl = readSettings().backendUrl;
    const resuming = this.live.canResume;
    const started = Date.now();
    let ticket = await fetchSessionTicket(backendUrl, this.installId);
    try {
      await this.live.connect(ticket);
    } catch (err) {
      if (!(err instanceof ResumeFailedError)) throw err;
      // The session expired; carry on with a fresh conversation rather than failing.
      this.log.warn(`Couldn't resume the previous conversation (${err.message}). Starting a new one.`);
      ticket = await fetchSessionTicket(backendUrl, this.installId);
      await this.live.connect(ticket);
    }
    if (ticket.usage) this.view.post({ type: 'usage', ...ticket.usage });
    this.lastContext = undefined;
    this.scheduleIdleClose();
    this.log.info(`Connected in ${Date.now() - started} ms${resuming ? ', continuing the earlier conversation' : ''}`);
  }

  /** Ends the session once EchoCode has sat unused for a while, so idle time isn't billed. */
  private scheduleIdleClose(): void {
    clearTimeout(this.idleCloseTimer);
    this.idleCloseTimer = setTimeout(() => {
      if (this.state !== 'idle' || !this.live.isOpen) return;
      this.log.info('Closing the idle voice session');
      this.live.close();
    }, IDLE_CLOSE_MS);
  }

  /** Moves to a fresh connection in the background, if EchoCode has been used recently. */
  private warmReconnect(): void {
    const now = Date.now();
    // At most one a minute, so a connection that keeps failing can't loop.
    if (now - this.lastActivityAt > WARM_WINDOW_MS || now - this.lastWarmReconnectAt < MIN_WARM_INTERVAL_MS) return;
    this.lastWarmReconnectAt = now;
    this.log.info('Reconnecting in the background so the next question starts instantly');
    this.ensureSession().catch((err) => this.log.warn(`Background reconnect failed: ${errorMessage(err)}`));
  }

  /** Tells the agent a question has started, once the session is ready and the user is speaking. */
  private openActivityIfSpeaking(): void {
    if (!this.sessionReady || this.activityOpen || !this.silence.speechDetected) return;
    if (this.turnContext !== this.lastContext) {
      this.live.sendContext(this.turnContext);
      this.lastContext = this.turnContext;
    }
    this.live.startActivity();
    for (const chunk of this.pendingAudio) this.live.sendAudio(chunk);
    this.voiceSeconds += (this.pendingAudio.length * FRAME_MS) / 1000;
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
      this.log.warn('No speech detected, so nothing was sent to the voice agent.');
      this.pendingAudio = [];
      this.setState('idle');
      this.view.post({ type: 'error', message: NOTHING_HEARD });
      return;
    }
    // Reset first: a reply the agent already started plays the moment we release.
    this.activityOpen = false;
    this.endOfSpeechAt = Date.now();
    this.sawAudio = false;
    this.playbackEndsAt = 0;
    this.armReplyTimeout();
    this.live.endActivity();
  }

  private armReplyTimeout(): void {
    clearTimeout(this.replyTimer);
    const turn = this.turnId;
    this.replyTimer = setTimeout(() => {
      if (turn === this.turnId && this.state === 'thinking') this.fail(NO_REPLY);
    }, REPLY_TIMEOUT_MS);
  }

  /** Talk pressed while EchoCode is answering: silence it now and take a new question. */
  private async bargeIn(): Promise<void> {
    this.clearTimers();
    this.view.post({ type: 'flushAudio' });
    // The server can't be told to stop, so the rest of this answer is dropped as it arrives.
    this.live.cancelReply();
    this.playbackEndsAt = 0;
    await this.startTurn();
  }

  private onMicFrame(pcm: Int16Array): void {
    const level = rmsLevel(pcm);
    // About 15 updates a second is plenty for a visualizer.
    if (++this.frameCount % 2 === 0) this.view.post({ type: 'micLevel', level });

    if (this.activityOpen) {
      this.live.sendAudio(pcm);
      this.voiceSeconds += FRAME_MS / 1000;
    } else {
      this.pendingAudio.push(pcm);
    }

    const ended = this.silence.push(level);
    // Before anyone speaks, only a short pre-roll is worth keeping.
    const keep = this.silence.soundHeard ? MAX_UNCONFIRMED_FRAMES : PRE_ROLL_FRAMES;
    if (!this.silence.speechDetected && this.pendingAudio.length > keep) this.pendingAudio.shift();
    this.openActivityIfSpeaking();
    if (ended && (this.state === 'listening' || this.state === 'connecting')) {
      void this.guarded(() => (this.sessionReady ? this.finishSpeaking() : this.requestFinish()));
    }
  }

  private onAudio(data: string): void {
    if (this.state !== 'thinking' && this.state !== 'speaking') return;
    if (!this.sawAudio) {
      this.sawAudio = true;
      this.replyPlaysAt ||= Date.now() + PLAYBACK_START_DELAY_MS;
      const ms = Date.now() - this.endOfSpeechAt;
      this.log.info(`Turn ${this.turnId}: first audio after ${ms} ms`);
      this.view.post({ type: 'latency', turnId: this.turnId, ms });
      clearTimeout(this.replyTimer);
      this.setState('speaking');
    }
    this.view.post({ type: 'audio', data });
    const seconds = base64PcmSeconds(data, OUTPUT_SAMPLE_RATE);
    this.voiceSeconds += seconds;
    this.playbackEndsAt = Math.max(Date.now(), this.playbackEndsAt) + seconds * 1000;
  }

  private onInputTranscript(text: string): void {
    if (this.state === 'idle') return;
    // A long question arrives as several transcripts ("…I spread" + "Give me…").
    this.userText = this.userText ? `${this.userText} ${text}` : text;
    this.view.post({ type: 'userTranscript', turnId: this.turnId, text: this.userText });
  }

  private onOutputTranscript(text: string, startMs: number | null): void {
    if (this.state !== 'thinking' && this.state !== 'speaking') return;
    this.modelText += text;
    if (startMs !== null) this.wordTimes.push({ end: this.modelText.length, startMs });
    this.view.post({ type: 'modelTranscript', turnId: this.turnId, text: this.modelText });
    this.scheduleHighlights(false);
  }

  /**
   * The agent cut its reply short because it heard more of the question: it
   * started answering at a pause, before the rest of the audio arrived. That
   * reply is dropped and the answer to the whole question follows.
   */
  private onInterrupted(): void {
    this.view.post({ type: 'flushAudio' });
    this.playbackEndsAt = 0;
    if (this.state !== 'thinking' && this.state !== 'speaking') return;
    this.log.info(`Turn ${this.turnId}: reply cut short; waiting for the answer to the whole question`);
    clearTimeout(this.idleTimer);
    if (this.modelText) this.view.post({ type: 'modelTranscript', turnId: this.turnId, text: '' });
    this.modelText = '';
    this.wordTimes = [];
    this.replyPlaysAt = 0;
    // Latency is reported again for the reply that's actually heard.
    this.sawAudio = false;
    this.clearHighlights();
    this.setState('thinking');
    this.armReplyTimeout();
  }

  /**
   * Highlights lines as the answer mentions them ("on line twenty-one"), timed
   * to when that word plays: AssemblyAI gives each word's offset in the reply
   * audio. Without timing, each highlight waits until the audio received so far
   * has nearly played. Until the answer is complete, a number at the very end
   * of the text may still be growing ("twenty" → "twenty-one").
   */
  private scheduleHighlights(final: boolean): void {
    const document = this.turnTarget?.document;
    if (!document) return;
    const text = this.modelText;
    const settledLength = text.trimEnd().length;
    const refs = findLineReferences(text).filter((ref) => final || ref.endOffset < settledLength);
    const turn = this.turnId;
    for (const ref of refs.slice(this.highlightedRefs)) {
      const word = this.wordTimes.find((w) => w.end >= ref.endOffset);
      const playsAt = word && this.replyPlaysAt ? this.replyPlaysAt + word.startMs : this.playbackEndsAt;
      const delay = Math.max(0, playsAt - Date.now() - HIGHLIGHT_LEAD_MS);
      this.highlightTimers.push(
        setTimeout(() => {
          if (turn === this.turnId) this.highlighter.show(document, ref.start, ref.end);
        }, delay),
      );
    }
    this.highlightedRefs = Math.max(this.highlightedRefs, refs.length);
  }

  private clearHighlights(): void {
    for (const timer of this.highlightTimers) clearTimeout(timer);
    this.highlightTimers = [];
    this.highlightedRefs = 0;
    this.highlighter.clear();
  }

  /** Asks the backend for the code behind the answer, and shows it as a card. */
  private async requestCodeCard(turn: number): Promise<void> {
    const answer = this.modelText.trim();
    const target = this.turnTarget;
    if (answer.length < MIN_ANSWER_FOR_CODE || !target) return;
    this.view.post({ type: 'codePending', turnId: turn });
    const started = Date.now();
    try {
      const suggestion = await fetchSuggestion(readSettings().backendUrl, {
        installId: this.installId,
        context: this.turnContext,
        question: this.userText.trim(),
        answer,
        languageId: target.document.languageId,
        selectedCode: target.selection?.text,
      });
      this.log.info(`Turn ${turn}: code card ${suggestion ? `"${suggestion.title}"` : 'not needed'} (${Date.now() - started} ms)`);
      if (suggestion) this.view.post({ type: 'codeSuggestion', card: this.cards.add(turn, suggestion, target) });
      else this.view.post({ type: 'codeNone', turnId: turn });
    } catch (err) {
      this.log.warn(`Turn ${turn}: couldn't get a code card: ${errorMessage(err)}`);
      this.view.post({ type: 'codeNone', turnId: turn });
    }
  }

  /** Tells the backend how much voice this answer used, and shows what's left this month. */
  private async reportTurnUsage(seconds: number): Promise<void> {
    if (seconds <= 0) return;
    try {
      const usage = await reportUsage(readSettings().backendUrl, this.installId, seconds);
      if (usage) this.view.post({ type: 'usage', ...usage });
    } catch (err) {
      this.log.warn(`Couldn't report usage: ${errorMessage(err)}`);
    }
  }

  private onTurnComplete(): void {
    if (this.state !== 'thinking' && this.state !== 'speaking') return;
    const turn = this.turnId;
    this.lastActivityAt = Date.now();
    if (!this.sawAudio && !this.modelText.trim()) {
      // Still nothing after asking again: say so rather than go quietly back to Ready.
      this.log.warn(`Turn ${turn}: the voice agent's answer was empty`);
      clearTimeout(this.replyTimer);
      this.setState('idle');
      this.view.post({ type: 'error', message: NO_REPLY });
      return;
    }
    this.view.post({ type: 'turnComplete', turnId: turn });
    this.log.info(`Turn ${turn} complete. You: "${this.userText.trim()}" / EchoCode: "${this.modelText.trim()}"`);
    this.scheduleHighlights(true);
    void this.requestCodeCard(turn);
    void this.reportTurnUsage(this.voiceSeconds);
    // Reply audio arrives faster than real time, so wait for playback to finish.
    const wait = Math.max(0, this.playbackEndsAt - Date.now()) + PLAYBACK_TAIL_MS;
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      if (turn !== this.turnId) return;
      this.highlightTimers.push(setTimeout(() => turn === this.turnId && this.highlighter.clear(), HIGHLIGHT_LINGER_MS));
      if (this.state === 'speaking' || this.state === 'thinking') this.setState('idle');
    }, wait);
  }

  private onSessionClosed(reason: string): void {
    this.lastContext = undefined;
    this.sessionReady = false;
    this.activityOpen = false;
    if (this.state === 'listening' || this.state === 'thinking') {
      // 1006 is an abrupt drop (network or a server hiccup), not something the user did.
      const what = reason === 'code 1006' ? 'The connection to the voice agent dropped' : `The voice agent ended the session (${reason})`;
      this.fail(`${what}. Reconnecting now, so just ask again.`);
      this.warmReconnect();
    } else if (this.state === 'idle') {
      this.warmReconnect();
    }
  }

  private fail(message: string): void {
    this.log.error(message);
    this.turnId++;
    this.clearTimers();
    this.sessionReady = false;
    this.activityOpen = false;
    this.live.cancelReply();
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
    if (state === 'idle' && this.live.isOpen) this.scheduleIdleClose();
    else clearTimeout(this.idleCloseTimer);
  }

  private clearTimers(): void {
    clearTimeout(this.idleTimer);
    clearTimeout(this.questionTimer);
    clearTimeout(this.replyTimer);
  }
}
