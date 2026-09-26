import {
  PANEL_BACKGROUNDS,
  type CodeCard,
  type FromWebview,
  type PanelBackground,
  type SessionState,
  type ToWebview,
} from '../src/protocol';
import { AudioPlayer } from './AudioPlayer';
import { ROBOT_SVG } from './robot';
import { currentSentence } from './subtitles';

type Usage = Extract<ToWebview, { type: 'usage' }>;

declare function acquireVsCodeApi(): {
  postMessage(message: FromWebview): void;
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
/** Voice minutes an average question uses, for the "about N questions left" estimate. */
const MINUTES_PER_QUESTION = 0.75;

const BACKGROUND_LABELS: Record<PanelBackground, string> = {
  midnight: 'Midnight',
  graphite: 'Graphite',
  purple: 'Purple',
  ocean: 'Ocean',
  vscode: 'VS Code theme',
};

const app = document.getElementById('app')!;
app.className = 'app';
app.dataset.state = 'idle';
app.innerHTML = `
  <section class="log" aria-label="Conversation history">
    <ol class="entries"></ol>
  </section>
  <section class="settings" aria-label="Settings" hidden>
    <header class="settings-head">
      <h2>Settings</h2>
      <button class="close-settings" title="Close settings" aria-label="Close settings">×</button>
    </header>
    <div class="settings-block">
      <h3>Plan</h3>
      <div class="plan-row">
        <span class="plan-name"></span>
        <button class="upgrade" hidden>Upgrade to Pro</button>
      </div>
    </div>
    <div class="settings-block">
      <h3>Usage this month</h3>
      <div class="usage-bar" hidden><span></span></div>
      <p class="usage-text"></p>
      <p class="usage-sub"></p>
    </div>
    <div class="settings-block">
      <h3>Hotkey</h3>
      <div class="plan-row">
        <span class="hotkey-name"></span>
        <button class="change-hotkey">Change hotkey</button>
      </div>
      <p class="usage-sub hotkey-help"></p>
    </div>
    <div class="settings-block">
      <h3>Background</h3>
      <div class="swatches" role="radiogroup" aria-label="Panel background">
        ${PANEL_BACKGROUNDS.map(
          (bg) =>
            `<button class="swatch" role="radio" aria-checked="false" data-bg="${bg}"><span class="chip"></span>${BACKGROUND_LABELS[bg]}</button>`,
        ).join('')}
      </div>
    </div>
  </section>
  <div class="notice" hidden>Your browser paused audio. <button class="unlock">Enable voice</button></div>
  <section class="stage">
    <div class="robot" role="img" aria-label="EchoCode">
      <span class="ring"></span>${ROBOT_SVG}
    </div>
    <div class="bubble" aria-live="polite">
      <p class="line"><span class="speaker"></span><span class="words"></span></p>
      <p class="meta"><span class="status">Ready</span><span class="latency"></span><span class="code-note"></span><span class="quota"></span></p>
    </div>
    <div class="controls">
      <button class="open-settings" aria-expanded="false" title="Settings" aria-label="Settings">⚙</button>
      <button class="stop" title="Stop">■</button>
    </div>
  </section>
`;

const $ = <T extends HTMLElement>(selector: string) => app.querySelector<T>(selector)!;
const entries = $<HTMLOListElement>('.entries');
const log = $('.log');
const bubble = $('.bubble');
const speakerEl = $('.speaker');
const wordsEl = $('.words');
const statusEl = $('.status');
const latencyEl = $('.latency');
const codeNoteEl = $('.code-note');
const quotaEl = $('.quota');
const openSettings = $<HTMLButtonElement>('.open-settings');
const settings = $('.settings');
const planNameEl = $('.plan-name');
const upgradeButton = $<HTMLButtonElement>('.upgrade');
const usageBar = $('.usage-bar');
const usageText = $('.usage-text');
const usageSub = $('.usage-sub');
const hotkeyNameEl = $('.hotkey-name');
const hotkeyHelpEl = $('.hotkey-help');
const swatches = [...app.querySelectorAll<HTMLButtonElement>('.swatch')];
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
/** The latest usage for the Settings view; undefined until the backend has answered. */
let usage: Usage | 'off' | 'error' | undefined;

// ---- Bubble ---------------------------------------------------------------

function setBubble(words: string, speaker: 'You' | 'EchoCode' | '' = '', kind: 'hint' | 'error' | 'speech' = 'speech'): void {
  speakerEl.textContent = speaker ? `${speaker}  ` : '';
  wordsEl.textContent = words;
  bubble.dataset.kind = kind;
  showingError = kind === 'error';
}

function showHint(): void {
  setBubble(`Hold ${hotkey} and ask about your code.`, '', 'hint');
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

// ---- Settings -------------------------------------------------------------

/** Settings takes the conversation's place while it's open. */
function setSettingsOpen(open: boolean): void {
  settings.hidden = !open;
  log.hidden = open;
  openSettings.setAttribute('aria-expanded', String(open));
  if (open) {
    if (usage === 'error') usage = undefined;
    renderUsage();
    vscode.postMessage({ type: 'getUsage' });
  } else {
    log.scrollTop = log.scrollHeight;
  }
}

/** The first day of next month, when the backend's monthly (UTC) usage starts again. */
function resetDate(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function renderUsage(): void {
  usageBar.hidden = true;
  usageSub.textContent = '';
  upgradeButton.hidden = true;
  delete planNameEl.dataset.plan;
  if (usage === undefined) {
    planNameEl.textContent = '…';
    usageText.textContent = 'Loading…';
    return;
  }
  if (usage === 'off' || usage === 'error') {
    planNameEl.textContent = usage === 'off' ? 'No limits on this server' : 'Unknown';
    usageText.textContent =
      usage === 'off' ? "Usage isn't metered on this server." : "Couldn't load usage. Check your connection and try again.";
    return;
  }
  const pro = usage.plan === 'pro';
  planNameEl.textContent = pro ? 'Pro' : 'Free';
  planNameEl.dataset.plan = usage.plan;
  upgradeButton.hidden = pro;
  // Rounded up, so used and left (rounded down, as in the bubble) add up to the limit.
  const usedMinutes = Math.ceil(usage.usedSeconds / 60);
  if (usage.limitSeconds === null) {
    usageText.textContent = `${usedMinutes} min used, no limit`;
    return;
  }
  const limitMinutes = Math.round(usage.limitSeconds / 60);
  const minutesLeft = Math.max(0, Math.floor((usage.limitSeconds - usage.usedSeconds) / 60));
  usageBar.hidden = false;
  usageBar.dataset.low = String(minutesLeft <= 5);
  usageBar.querySelector('span')!.style.width = `${Math.min(100, (usage.usedSeconds / usage.limitSeconds) * 100)}%`;
  usageText.textContent = `${usedMinutes} of ${limitMinutes} min used`;
  usageSub.textContent = `${minutesLeft} min left, about ${Math.floor(minutesLeft / MINUTES_PER_QUESTION)} questions. Resets ${resetDate()}.`;
}

/** Once the user may have rebound the hotkey, the panel stops naming the default key. */
function applyHotkey(label: string, custom: boolean): void {
  hotkey = custom ? 'your EchoCode hotkey' : label;
  hotkeyNameEl.textContent = custom ? 'Custom' : label;
  hotkeyHelpEl.textContent = `${custom ? `Default: ${label}. ` : ''}Hold it and ask, let go to send. Or tap it to start and tap again to send.`;
  if (state === 'idle' && !showingError) showHint();
}

function applyBackground(background: PanelBackground): void {
  document.body.dataset.bg = background;
  for (const swatch of swatches) swatch.setAttribute('aria-checked', String(swatch.dataset.bg === background));
}

// ---- Conversation log -----------------------------------------------------

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
  // A new code card matters more than Settings.
  setSettingsOpen(false);
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
  window.clearTimeout(lingerTimer);
  switch (next) {
    case 'connecting':
      setBubble('Connecting… keep talking.', '', 'hint');
      break;
    case 'listening':
      latencyEl.textContent = '';
      codeNoteEl.textContent = '';
      cancelSubtitles();
      setBubble(`Listening… let go of ${hotkey} to send.`, '', 'hint');
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
      // Empty when a reply was cut short and a new one is coming.
      if (message.text.trim()) scheduleSubtitle(message.turnId, message.text);
      break;
    case 'latency': {
      latencyEl.textContent = `⚡ ${message.ms} ms`;
      const who = entry(message.turnId, 'model').querySelector('.who')!;
      // A reply that was cut short and replaced reports its latency again.
      let badge = who.querySelector('.latency-badge');
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'latency-badge';
        who.append(badge);
      }
      badge.textContent = `⚡ ${message.ms} ms`;
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
    case 'usage':
      if (message.limitSeconds === null) {
        quotaEl.textContent = 'Pro · unlimited';
      } else {
        const minutesLeft = Math.max(0, Math.floor((message.limitSeconds - message.usedSeconds) / 60));
        quotaEl.textContent = `${message.plan === 'pro' ? 'Pro' : 'Free'} · ${minutesLeft} min left this month`;
        quotaEl.dataset.low = String(minutesLeft <= 5);
      }
      usage = message;
      renderUsage();
      break;
    case 'usageUnavailable':
      // Keep numbers we already have rather than replacing them with an error.
      if (message.reason === 'off' || typeof usage !== 'object') usage = message.reason;
      renderUsage();
      break;
    case 'background':
      applyBackground(message.background);
      break;
    case 'hotkey':
      applyHotkey(message.label, message.custom);
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

async function unlockAudio(): Promise<void> {
  await player.unlock();
  notice.hidden = !player.blocked;
}

// Any click in the panel lets the browser play audio, in case it's holding it back.
app.addEventListener('pointerdown', () => void unlockAudio());
$('.stop').addEventListener('click', () => vscode.postMessage({ type: 'stop' }));
openSettings.addEventListener('click', () => setSettingsOpen(settings.hidden));
$('.close-settings').addEventListener('click', () => setSettingsOpen(false));
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !settings.hidden) setSettingsOpen(false);
});
upgradeButton.addEventListener('click', () => vscode.postMessage({ type: 'openPricing' }));
$('.change-hotkey').addEventListener('click', () => vscode.postMessage({ type: 'openKeybindings' }));
for (const swatch of swatches) {
  swatch.addEventListener('click', () => {
    const background = swatch.dataset.bg as PanelBackground;
    applyBackground(background);
    vscode.postMessage({ type: 'setBackground', background });
  });
}
$('.unlock').addEventListener('click', () => void unlockAudio());
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

showHint();
vscode.postMessage({ type: 'ready' });
