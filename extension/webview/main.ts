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

type Usage = Extract<ToWebview, { type: 'usage' }>;

declare function acquireVsCodeApi(): {
  postMessage(message: FromWebview): void;
};

const vscode = acquireVsCodeApi();
const player = new AudioPlayer();

const STATUS: Record<SessionState, string> = {
  asleep: 'Asleep',
  idle: 'Ready',
  connecting: 'Waking up',
  listening: 'Listening',
  thinking: 'Thinking',
  speaking: 'Speaking',
};
/** What the bubble says after Stop, by what EchoCode was doing when it was pressed. */
const STOPPED: Record<SessionState, string> = {
  // Stop does nothing while asleep, so this is never shown.
  asleep: 'Stopped.',
  idle: 'Stopped.',
  connecting: 'Stopped listening. Your question was cancelled.',
  listening: 'Stopped listening. Your question was cancelled.',
  thinking: 'Stopped. The answer was cancelled.',
  speaking: 'Stopped the answer.',
};
/** How long a one-off message (what Stop did) stays before the hint returns. */
const MESSAGE_LINGER_MS = 5000;
/** Voice minutes an average question uses, for the "about N questions left" estimate. */
const MINUTES_PER_QUESTION = 0.75;

const BACKGROUND_LABELS: Record<PanelBackground, string> = {
  midnight: 'Midnight',
  graphite: 'Graphite',
  purple: 'Purple',
  ocean: 'Ocean',
  vscode: 'VS Code theme',
};

/** Line art for the two steps that have no button to point at. */
const MIC_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="2.5" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3.5"/></svg>`;
const ASK_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 3.5H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3v4l4.5-4H20a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2Z"/><path d="M10 7.5 8 10l2 2.5"/><path d="m14 7.5 2 2.5-2 2.5"/></svg>`;

/**
 * The first thing in the panel, before there's any conversation to show. It
 * scrolls away under the first question rather than being dismissed, so it's
 * still there the next time someone forgets which button does what.
 * `{key}` becomes the hotkey, styled as a key when we know which one it is.
 */
const GUIDE_STEPS: { icon: string; title: string; body: string }[] = [
  {
    icon: MIC_ICON,
    title: 'Click here once, then check your mic',
    body: 'VS Code keeps a panel silent until you click inside it, so click anywhere here after each reload. If EchoCode can\'t hear you, run "EchoCode: Test Microphone" from the Command Palette.',
  },
  {
    icon: ASK_ICON,
    title: 'Ask anything about your project',
    body: 'Hold {key} and speak, then let go. Try "what does this file do?" or "where do I change the heading?" — EchoCode reads the project, opens the file it means and highlights the lines.',
  },
  {
    icon: '⚙',
    title: 'Settings',
    body: 'Your plan, the minutes left this month, the hotkey and the panel colour.',
  },
  {
    icon: '■',
    title: 'Stop',
    body: 'Cuts an answer off the moment you have heard enough. Pressing the hotkey while it talks does the same, and starts your next question.',
  },
];

const app = document.getElementById('app')!;
app.className = 'app';
app.dataset.state = 'asleep';
app.innerHTML = `
  <section class="log" aria-label="Conversation history">
    <section class="guide" aria-label="Getting started">
      <h2>Get started</h2>
      <ol class="steps"></ol>
      <p class="guide-foot"></p>
    </section>
    <ol class="entries"></ol>
    <button class="to-latest" hidden>↓ Latest</button>
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
  <div class="notice" hidden>EchoCode can't be heard yet. <button class="unlock">Enable voice</button></div>
  <section class="stage">
    <div class="robot" role="img" aria-label="EchoCode">
      <span class="ring"></span>${ROBOT_SVG}
    </div>
    <div class="bubble" aria-live="polite">
      <p class="line"><span class="words"></span></p>
      <p class="meta"><span class="status">Asleep</span><span class="latency"></span><span class="code-note"></span><span class="quota"></span></p>
    </div>
    <div class="controls">
      <button class="open-settings" aria-expanded="false" title="Settings" aria-label="Settings">⚙</button>
      <button class="stop" title="Stop">■</button>
    </div>
  </section>
`;

const $ = <T extends HTMLElement>(selector: string) => app.querySelector<T>(selector)!;
const entries = $<HTMLOListElement>('.entries');
const steps = $<HTMLOListElement>('.steps');
const guideFoot = $('.guide-foot');
const log = $('.log');
const toLatest = $<HTMLButtonElement>('.to-latest');
const bubble = $('.bubble');
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

let state: SessionState = 'asleep';
let hotkey = 'Ctrl+Alt+Space';
/** A rebound hotkey has no name we can print, so the guide stops drawing a key cap. */
let hotkeyCustom = false;
/** The key EchoCode ships with. Still worth naming once someone has rebound it. */
let hotkeyDefault = 'Ctrl+Alt+Space';
let latestTurn = 0;
let micLevel = 0;
let shownLevel = 0;
let lingerTimer: number | undefined;
let showingError = false;
/** The latest usage for the Settings view; undefined until the backend has answered. */
let usage: Usage | 'off' | 'error' | undefined;

// ---- Getting started ------------------------------------------------------

function keyCap(label: string, className = 'key'): HTMLSpanElement {
  const key = document.createElement('span');
  key.className = className;
  key.textContent = label;
  return key;
}

function renderGuide(): void {
  // Named even when it has been rebound, since that's exactly when nothing else says it.
  // A dash, not a full stop: the key cap's own padding makes a stop look like a stray dot.
  guideFoot.replaceChildren('Default hotkey: ', keyCap(hotkeyDefault), ' — change it in ⚙ Settings.');
  steps.replaceChildren(
    ...GUIDE_STEPS.map(({ icon, title, body }) => {
      const li = document.createElement('li');
      li.className = 'step';

      const iconEl = document.createElement('span');
      iconEl.className = 'step-icon';
      iconEl.setAttribute('aria-hidden', 'true');
      // A step about a button wears that button's own glyph, so there's nothing to match up.
      if (icon.startsWith('<svg')) iconEl.innerHTML = icon;
      else iconEl.textContent = icon;

      const text = document.createElement('div');
      const titleEl = document.createElement('b');
      titleEl.className = 'step-title';
      titleEl.textContent = title;
      const bodyEl = document.createElement('span');
      bodyEl.className = 'step-body';
      const [before, after] = body.split('{key}');
      bodyEl.append(before);
      if (after !== undefined) bodyEl.append(keyCap(hotkey, hotkeyCustom ? 'plain-key' : 'key'), after);
      text.append(titleEl, bodyEl);

      li.append(iconEl, text);
      return li;
    }),
  );
}

// ---- Bubble ---------------------------------------------------------------

/** 'alert' sits between the two: something to act on, not something that has gone wrong. */
function setBubble(words: string, kind: 'hint' | 'alert' | 'error' = 'hint'): void {
  wordsEl.textContent = words;
  bubble.dataset.kind = kind;
  showingError = kind === 'error';
}

function showHint(): void {
  // Eyes go to the robot, so the one thing standing between them and hearing it belongs here.
  if (player.blocked) setBubble('Click anywhere here once so you can hear EchoCode.', 'alert');
  else if (state === 'asleep') setBubble(`Press ${hotkey} to wake EchoCode.`, 'hint');
  else setBubble(`Hold ${hotkey} and ask about your code.`, 'hint');
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
  } else if (followLog) {
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
  hotkeyCustom = custom;
  hotkeyDefault = label;
  renderGuide();
  hotkeyNameEl.textContent = custom ? 'Custom' : label;
  hotkeyHelpEl.textContent = `${custom ? `Default: ${label}. ` : ''}Hold it and ask, let go to send. Or tap it to start and tap again to send.`;
  if ((state === 'idle' || state === 'asleep') && !showingError) showHint();
}

function applyBackground(background: PanelBackground): void {
  document.body.dataset.bg = background;
  for (const swatch of swatches) swatch.setAttribute('aria-checked', String(swatch.dataset.bg === background));
}

// ---- Conversation log -----------------------------------------------------

/**
 * The conversation follows new messages unless the user has scrolled up to
 * read, and a new question always jumps back to the latest. Every change to
 * the log is watched: checking the position before each update missed ones
 * made elsewhere (such as the latency badge on a new answer), which pushed the
 * view up just enough that it stopped following.
 */
let followLog = true;

function showLatest(): void {
  followLog = true;
  toLatest.hidden = true;
  log.scrollTop = log.scrollHeight;
}

new MutationObserver(() => {
  if (followLog) log.scrollTop = log.scrollHeight;
  else toLatest.hidden = false;
}).observe(entries, { childList: true, subtree: true, characterData: true });

log.addEventListener('scroll', () => {
  // Our own scrolling lands at the bottom; only the user's leaves it higher.
  followLog = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
  if (followLog) toLatest.hidden = true;
});

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
  entry(turnId, who).querySelector('.text')!.textContent = text.trim();
}

function addPendingCard(turnId: number): void {
  if (document.getElementById(`pending-${turnId}`)) return;
  const li = document.createElement('li');
  li.id = `pending-${turnId}`;
  li.className = 'card pending';
  li.textContent = 'Writing the code…';
  entry(turnId, 'model').after(li);
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
  if (pending) pending.replaceWith(li);
  else entry(card.turnId, 'model').after(li);
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
  const wasAsleep = state === 'asleep';
  state = next;
  app.dataset.state = next;
  statusEl.textContent = STATUS[next];
  window.clearTimeout(lingerTimer);
  switch (next) {
    case 'asleep':
      showHint();
      break;
    case 'connecting':
      showLatest();
      // Waking up has nothing to say yet; a question asked while connecting does.
      setBubble(wasAsleep ? 'Waking up…' : 'Connecting… keep talking.', 'hint');
      break;
    case 'listening':
      // A new question: back to the latest message, even if the user had scrolled up.
      showLatest();
      latencyEl.textContent = '';
      codeNoteEl.textContent = '';
      setBubble(`Listening… let go of ${hotkey} to send.`, 'hint');
      break;
    case 'thinking':
      setBubble('Thinking…', 'hint');
      break;
    case 'speaking':
      // The answer itself is in the conversation above; here, say how to cut it short.
      showSpeaking();
      break;
    case 'idle':
      // Nothing lingers now that the bubble holds no words, so the hint comes straight back.
      if (!showingError) showHint();
      break;
  }
}

function onMessage(message: ToWebview): void {
  switch (message.type) {
    case 'hello':
      hotkey = message.hotkey;
      hotkeyDefault = message.hotkey;
      renderGuide();
      if ((state === 'idle' || state === 'asleep') && !showingError) showHint();
      // Find out now whether the voice can be heard. Waking EchoCode is a keypress in the
      // editor, not a click in here, so without this the first thing they'd miss is the greeting.
      void unlockAudio();
      break;
    case 'state':
      onState(message.state);
      break;
    case 'stopped':
      // Say what Stop did, then go back to the usual hint.
      window.clearTimeout(lingerTimer);
      setBubble(STOPPED[message.was], 'hint');
      lingerTimer = window.setTimeout(showHint, MESSAGE_LINGER_MS);
      break;
    case 'micLevel':
      micLevel = message.level;
      break;
    case 'audio':
      player.enqueue(message.data);
      notice.hidden = !player.blocked;
      // The state arrived before the first chunk, so only now is it clear it can't be heard.
      if (player.blocked && state === 'speaking') showSpeaking();
      break;
    case 'flushAudio':
      player.flush();
      break;
    case 'userTranscript':
      latestTurn = Math.max(latestTurn, message.turnId);
      setEntryText(message.turnId, 'user', message.text);
      break;
    case 'modelTranscript':
      latestTurn = Math.max(latestTurn, message.turnId);
      setEntryText(message.turnId, 'model', message.text);
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
      setBubble(message.message, 'error');
      break;
  }
}

window.addEventListener('message', (event: MessageEvent<ToWebview>) => onMessage(event.data));

// ---- User actions ---------------------------------------------------------

/** "Speaking…" is a lie while the voice is blocked, so say what to do about it instead. */
function showSpeaking(): void {
  if (player.blocked) setBubble('Click anywhere here to hear this answer.', 'alert');
  else setBubble(`Speaking… press ${hotkey} to interrupt.`, 'hint');
}

/** What the bubble last assumed about being heard; undefined until the audio context exists. */
let shownBlocked: boolean | undefined;

async function unlockAudio(): Promise<void> {
  await player.unlock();
  notice.hidden = !player.blocked;
  if (player.blocked === shownBlocked) return;
  shownBlocked = player.blocked;
  // Being heard or not changes what the bubble should say, so redraw it — but only where
  // the message is about that. "Listening…" and "Thinking…" are true either way.
  if (state === 'speaking') showSpeaking();
  else if ((state === 'idle' || state === 'asleep') && !showingError) showHint();
}

// Any click in the panel lets the browser play audio, in case it's holding it back.
app.addEventListener('pointerdown', () => void unlockAudio());
// Typing in the panel is a gesture too, so the mouse isn't the only way out of a blocked voice.
document.addEventListener('keydown', () => void unlockAudio());
$('.stop').addEventListener('click', () => vscode.postMessage({ type: 'stop' }));
openSettings.addEventListener('click', () => setSettingsOpen(settings.hidden));
toLatest.addEventListener('click', showLatest);
$('.close-settings').addEventListener('click', () => setSettingsOpen(false));
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !settings.hidden) setSettingsOpen(false);
});

// The talk hotkey (Ctrl+Alt+Space) contains Space, which also "presses" a focused
// button: after clicking Stop, every hotkey press stopped EchoCode again. So a
// mouse click doesn't leave a button focused...
app.addEventListener('mousedown', (event) => {
  if ((event.target as HTMLElement).closest('button')) event.preventDefault();
});
// ...and Space pressed with a modifier never presses a button, even one reached with Tab.
// Space activates a button on keyup, when the modifiers may already be released.
let spaceWithModifier = false;
document.addEventListener('keydown', (event) => {
  if (event.key === ' ') spaceWithModifier = event.ctrlKey || event.altKey || event.metaKey;
});
document.addEventListener('keyup', (event) => {
  if (event.key !== ' ' || !spaceWithModifier) return;
  spaceWithModifier = false;
  event.preventDefault();
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

renderGuide();
showHint();
vscode.postMessage({ type: 'ready' });
