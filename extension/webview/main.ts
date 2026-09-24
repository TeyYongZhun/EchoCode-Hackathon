import type { FromWebview, SessionState, ToWebview } from '../src/protocol';
import { AudioPlayer } from './AudioPlayer';

declare function acquireVsCodeApi(): { postMessage(message: FromWebview): void };

const vscode = acquireVsCodeApi();
const player = new AudioPlayer();

const STATE_LABELS: Record<SessionState, string> = {
  idle: 'Ready',
  connecting: 'Connecting… keep talking',
  listening: 'Listening…',
  thinking: 'Thinking…',
  speaking: 'Speaking',
};

const app = document.getElementById('app')!;
app.innerHTML = `
  <header class="bar">
    <span class="state" data-state="idle"><span class="dot"></span><span class="label">Ready</span></span>
    <span class="meter"><span class="meter-fill"></span></span>
    <span class="latency" hidden></span>
    <span class="spacer"></span>
    <button class="talk" title="Talk / send (Ctrl+Alt+Space)">Talk</button>
    <button class="stop secondary" title="Stop">Stop</button>
  </header>
  <div class="notice" hidden>Audio is paused by the browser. <button class="unlock">Enable voice</button></div>
  <div class="error" hidden></div>
  <ol class="log">
    <li class="empty">Select some code, press <kbd>Ctrl+Alt+Space</kbd> and ask your question out loud.
    Press it again when you're done.</li>
  </ol>
`;

const stateEl = app.querySelector<HTMLElement>('.state')!;
const stateLabel = app.querySelector<HTMLElement>('.state .label')!;
const meterFill = app.querySelector<HTMLElement>('.meter-fill')!;
const latencyEl = app.querySelector<HTMLElement>('.latency')!;
const talkButton = app.querySelector<HTMLButtonElement>('.talk')!;
const notice = app.querySelector<HTMLElement>('.notice')!;
const errorEl = app.querySelector<HTMLElement>('.error')!;
const log = app.querySelector<HTMLOListElement>('.log')!;

let state: SessionState = 'idle';

talkButton.addEventListener('click', () => {
  void player.unlock();
  vscode.postMessage({ type: 'toggleTalk' });
});
app.querySelector('.stop')!.addEventListener('click', () => vscode.postMessage({ type: 'stop' }));
app.querySelector('.unlock')!.addEventListener('click', async () => {
  await player.unlock();
  notice.hidden = !player.blocked;
});

/** Gets (or creates) the log entry for one side of one turn. */
function entry(turnId: number, who: 'user' | 'model'): HTMLElement {
  const id = `turn-${turnId}-${who}`;
  let li = document.getElementById(id);
  if (!li) {
    log.querySelector('.empty')?.remove();
    li = document.createElement('li');
    li.id = id;
    li.className = who;
    li.innerHTML = `<span class="who">${who === 'user' ? 'You' : 'EchoCode'}</span><span class="text"></span>`;
    // Keep the user's question above the answer even if transcripts arrive out of order.
    const answer = who === 'user' ? document.getElementById(`turn-${turnId}-model`) : null;
    log.insertBefore(li, answer);
  }
  return li;
}

function setText(turnId: number, who: 'user' | 'model', text: string): void {
  entry(turnId, who).querySelector('.text')!.textContent = text.trim();
  log.scrollTop = log.scrollHeight;
}

function setMeter(level: number): void {
  // Speech RMS rarely exceeds 0.3, so scale it up for a lively meter.
  meterFill.style.width = `${Math.min(100, Math.round(level * 300))}%`;
}

function render(message: ToWebview): void {
  switch (message.type) {
    case 'state':
      state = message.state;
      stateEl.dataset.state = state;
      stateLabel.textContent = STATE_LABELS[state];
      talkButton.textContent = state === 'listening' || state === 'connecting' ? 'Send' : 'Talk';
      if (state !== 'idle') errorEl.hidden = true;
      if (state !== 'listening' && state !== 'speaking') setMeter(0);
      break;
    case 'micLevel':
      if (state === 'listening' || state === 'connecting') setMeter(message.level);
      break;
    case 'audio':
      player.enqueue(message.data);
      notice.hidden = !player.blocked;
      break;
    case 'flushAudio':
      player.flush();
      break;
    case 'userTranscript':
      setText(message.turnId, 'user', message.text);
      break;
    case 'modelTranscript':
      setText(message.turnId, 'model', message.text);
      break;
    case 'latency':
      latencyEl.hidden = false;
      latencyEl.textContent = `⚡ ${message.ms} ms`;
      break;
    case 'turnComplete':
      break;
    case 'error':
      errorEl.hidden = false;
      errorEl.textContent = message.message;
      break;
  }
}

window.addEventListener('message', (event: MessageEvent<ToWebview>) => render(event.data));

// Drive the meter from the spoken reply while EchoCode talks.
function animate(): void {
  if (state === 'speaking') setMeter(player.level());
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);

vscode.postMessage({ type: 'ready' });
