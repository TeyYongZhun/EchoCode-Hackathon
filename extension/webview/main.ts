import type { CodeCard, FromWebview, SessionState, ToWebview } from '../src/protocol';
import { AudioPlayer } from './AudioPlayer';
import { ROBOT_SVG } from './robot';
import { currentSentence } from './subtitles';

interface ViewState {
  logOpen?: boolean;
}

declare function acquireVsCodeApi(): {
  postMessage(message: FromWebview): void;
  getState(): ViewState | undefined;
  setState(state: ViewState): void;
};

const vscode = acquireVsCodeApi();
const player = new AudioPlayer();

const STATUS: Record<SessionState, string> = {
  idle: 'Ready',
  connecting: 'Connecting',
  listening: 'Listening',
  thinking: 'Thinking',
  speaking: 'Speaking',
};
/** How long the last subtitle stays after an answer before the hint returns. */
const SUBTITLE_LINGER_MS = 5000;
/** Show each subtitle a moment before its words are heard. */
const SUBTITLE_LEAD_MS = 200;

const app = document.getElementById('app')!;
app.className = 'app';
app.dataset.state = 'idle';
app.innerHTML = `
  <section class="log" aria-label="Conversation history">
    <ol class="entries"></ol>
  </section>
  <div class="notice" hidden>Your browser paused audio. <button class="unlock">Enable voice</button></div>
  <section class="stage">
    <button class="robot" aria-label="Talk to EchoCode">
      <span class="ring"></span>${ROBOT_SVG}
    </button>
    <div class="bubble" aria-live="polite">
      <p class="line"><span class="speaker"></span><span class="words"></span></p>
      <p class="meta"><span class="status">Ready</span><span class="latency"></span><span class="code-note"></span></p>
    </div>
    <div class="controls">
      <button class="toggle-log" aria-expanded="false" title="Show conversation">^</button>
      <button class="stop" title="Stop">■</button>
    </div>
  </section>
`;

const $ = <T extends HTMLElement>(selector: string) => app.querySelector<T>(selector)!;
const entries = $<HTMLOListElement>('.entries');
const log = $('.log');
const robot = $<HTMLButtonElement>('.robot');
const bubble = $('.bubble');
const speakerEl = $('.speaker');
const wordsEl = $('.words');
const statusEl = $('.status');
const latencyEl = $('.latency');
const codeNoteEl = $('.code-note');
const toggleLog = $<HTMLButtonElement>('.toggle-log');
const notice = $('.notice');

let state: SessionState = 'idle';
let hotkey = 'Ctrl+Alt+Space';
let latestTurn = 0;
let micLevel = 0;
let shownLevel = 0;
let subtitleVersion = 0;
let shownSubtitle = 0;
let lingerTimer: number | undefined;
let showingError = false;

// ---- Bubble ---------------------------------------------------------------

function setBubble(words: string, speaker: 'You' | 'EchoCode' | '' = '', kind: 'hint' | 'error' | 'speech' = 'speech'): void {
  speakerEl.textContent = speaker ? `${speaker}  ` : '';
  wordsEl.textContent = words;
  bubble.dataset.kind = kind;
  showingError = kind === 'error';
}

function showHint(): void {
  setBubble(`Hold ${hotkey} (or click me) and ask about your code.`, '', 'hint');
}

/** Shows the answer's subtitle once the audio before it has played. */
function scheduleSubtitle(turnId: number, text: string): void {
  const version = ++subtitleVersion;
  const delay = Math.max(0, player.queuedMs() - SUBTITLE_LEAD_MS);
  window.setTimeout(() => {
    if (version <= shownSubtitle || turnId !== latestTurn) return;
    shownSubtitle = version;
    setBubble(currentSentence(text), 'EchoCode');
  }, delay);
}

function cancelSubtitles(): void {
  shownSubtitle = ++subtitleVersion;
}

// ---- Conversation log -----------------------------------------------------

function setLogOpen(open: boolean): void {
  app.classList.toggle('log-open', open);
  toggleLog.setAttribute('aria-expanded', String(open));
  toggleLog.title = open ? 'Hide conversation' : 'Show conversation';
  vscode.setState({ ...vscode.getState(), logOpen: open });
  if (open) log.scrollTop = log.scrollHeight;
}

function stickToBottom(action: () => void): void {
  const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
  action();
  if (atBottom) log.scrollTop = log.scrollHeight;
}

/** The log entry for one side of a turn, created on first use. */
function entry(turnId: number, who: 'user' | 'model'): HTMLLIElement {
  const id = `turn-${turnId}-${who}`;
  let li = document.getElementById(id) as HTMLLIElement | null;
  if (li) return li;
  li = document.createElement('li');
  li.id = id;
  li.className = `entry ${who}`;
  const name = document.createElement('span');
  name.className = 'who';
  name.textContent = who === 'user' ? 'You' : 'EchoCode';
  const text = document.createElement('span');
  text.className = 'text';
  li.append(name, text);
  // The question goes above its answer even if the answer's transcript arrives first.
  const before = who === 'user' ? document.getElementById(`turn-${turnId}-model`) : null;
  entries.insertBefore(li, before);
  return li;
}

function setEntryText(turnId: number, who: 'user' | 'model', text: string): void {
  stickToBottom(() => {
    entry(turnId, who).querySelector('.text')!.textContent = text.trim();
  });
}

function addPendingCard(turnId: number): void {
  if (document.getElementById(`pending-${turnId}`)) return;
  const li = document.createElement('li');
  li.id = `pending-${turnId}`;
  li.className = 'card pending';
  li.textContent = 'Writing the code…';
  stickToBottom(() => entry(turnId, 'model').after(li));
  codeNoteEl.textContent = 'Writing code…';
}

function removePendingCard(turnId: number): void {
  document.getElementById(`pending-${turnId}`)?.remove();
  if (!entries.querySelector('.card.pending')) codeNoteEl.textContent = '';
}

function addCard(card: CodeCard): void {
  const li = document.createElement('li');
  li.className = 'card';
  li.dataset.id = card.id;

  const head = document.createElement('div');
  head.className = 'card-head';
  const title = document.createElement('span');
  title.className = 'card-title';
  title.textContent = card.title;
  const meta = document.createElement('span');
  meta.className = 'card-meta';
  meta.textContent = card.replaceLines
    ? `${card.language} · replaces lines ${card.replaceLines.start}–${card.replaceLines.end}`
    : card.language;
  head.append(title, meta);

  const pre = document.createElement('pre');
  const code = document.createElement('code');
  code.textContent = card.code;
  pre.append(code);

  const actions = document.createElement('div');
  actions.className = 'card-actions';
  const insert = document.createElement('button');
  insert.className = 'insert';
  insert.textContent = card.replaceLines
    ? `Replace lines ${card.replaceLines.start}–${card.replaceLines.end}`
    : 'Insert at Cursor';
  const copy = document.createElement('button');
  copy.className = 'copy secondary';
  copy.textContent = 'Copy';
  actions.append(insert, copy);

  li.append(head, pre, actions);
  const pending = document.getElementById(`pending-${card.turnId}`);
  stickToBottom(() => {
    if (pending) pending.replaceWith(li);
    else entry(card.turnId, 'model').after(li);
  });
  removePendingCard(card.turnId);
  codeNoteEl.textContent = 'Code ready ↑';
  setLogOpen(true);
  li.scrollIntoView({ block: 'nearest' });
}

function flash(button: HTMLButtonElement, label: string): void {
  const original = button.textContent;
  button.textContent = label;
  button.disabled = true;
  window.setTimeout(() => {
    button.textContent = original;
    button.disabled = false;
  }, 1800);
}

// ---- Messages from the extension ------------------------------------------

function onState(next: SessionState): void {
  state = next;
  app.dataset.state = next;
  statusEl.textContent = STATUS[next];
  robot.setAttribute('aria-label', next === 'listening' ? 'Send your question' : 'Talk to EchoCode');
  window.clearTimeout(lingerTimer);
  switch (next) {
    case 'connecting':
      setBubble('Connecting… keep talking.', '', 'hint');
      break;
    case 'listening':
      latencyEl.textContent = '';
      codeNoteEl.textContent = '';
      cancelSubtitles();
      setBubble(`Listening… let go of ${hotkey} (or tap it) to send.`, '', 'hint');
      break;
    case 'thinking':
      setBubble('Thinking…', '', 'hint');
      break;
    case 'speaking':
      break;
    case 'idle':
      if (!showingError) lingerTimer = window.setTimeout(showHint, SUBTITLE_LINGER_MS);
      break;
  }
}

function onMessage(message: ToWebview): void {
  switch (message.type) {
    case 'hello':
      hotkey = message.hotkey;
      robot.title = `Talk (${hotkey})`;
      if (state === 'idle' && !showingError) showHint();
      break;
    case 'state':
      onState(message.state);
      break;
    case 'micLevel':
      micLevel = message.level;
      break;
    case 'audio':
      player.enqueue(message.data);
      notice.hidden = !player.blocked;
      break;
    case 'flushAudio':
      player.flush();
      cancelSubtitles();
      break;
    case 'userTranscript':
      latestTurn = Math.max(latestTurn, message.turnId);
      setEntryText(message.turnId, 'user', message.text);
      if (state === 'listening' || state === 'thinking') setBubble(currentSentence(message.text), 'You');
      break;
    case 'modelTranscript':
      latestTurn = Math.max(latestTurn, message.turnId);
      setEntryText(message.turnId, 'model', message.text);
      scheduleSubtitle(message.turnId, message.text);
      break;
    case 'latency': {
      latencyEl.textContent = `⚡ ${message.ms} ms`;
      const badge = document.createElement('span');
      badge.className = 'latency-badge';
      badge.textContent = `⚡ ${message.ms} ms`;
      entry(message.turnId, 'model').querySelector('.who')!.append(badge);
      break;
    }
    case 'turnComplete':
      break;
    case 'codePending':
      addPendingCard(message.turnId);
      break;
    case 'codeSuggestion':
      addCard(message.card);
      break;
    case 'codeNone':
      removePendingCard(message.turnId);
      break;
    case 'error':
      // Errors stay up until the next conversation instead of fading into the hint.
      window.clearTimeout(lingerTimer);
      setBubble(message.message, '', 'error');
      break;
  }
}

window.addEventListener('message', (event: MessageEvent<ToWebview>) => onMessage(event.data));

// ---- User actions ---------------------------------------------------------

robot.addEventListener('click', () => {
  void player.unlock();
  vscode.postMessage({ type: 'toggleTalk' });
});
$('.stop').addEventListener('click', () => vscode.postMessage({ type: 'stop' }));
toggleLog.addEventListener('click', () => setLogOpen(!app.classList.contains('log-open')));
$('.unlock').addEventListener('click', async () => {
  await player.unlock();
  notice.hidden = !player.blocked;
});
entries.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest('button');
  const id = button?.closest<HTMLElement>('.card')?.dataset.id;
  if (!button || !id) return;
  if (button.classList.contains('insert')) {
    vscode.postMessage({ type: 'insertCode', id });
    flash(button, 'Inserted ✓');
  } else if (button.classList.contains('copy')) {
    vscode.postMessage({ type: 'copyCode', id });
    flash(button, 'Copied ✓');
  }
});

// ---- Visualizer -----------------------------------------------------------

// The robot's glow and rings follow your voice while listening and its own while speaking.
function animate(): void {
  const target =
    state === 'listening' || state === 'connecting' ? micLevel * 4 : state === 'speaking' ? player.level() * 5 : 0;
  shownLevel = shownLevel * 0.7 + Math.min(1, target) * 0.3;
  app.style.setProperty('--level', shownLevel.toFixed(3));
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);

setLogOpen(vscode.getState()?.logOpen ?? false);
showHint();
vscode.postMessage({ type: 'ready' });
