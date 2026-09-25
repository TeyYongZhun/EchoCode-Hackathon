// End-to-end check without VS Code or a microphone:
// backend token -> AssemblyAI Voice Agent session -> spoken reply (counted, not played).
//
// Usage: npm run smoke [-- http://localhost:3000]
const backendUrl = (process.argv[2] ?? 'http://localhost:3000').replace(/\/+$/, '');

const response = await fetch(`${backendUrl}/api/token`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ installId: 'smoke-test-install' }),
});
const ticket = await response.json();
if (!response.ok) {
  console.error(`Token request failed (HTTP ${response.status}):`, ticket.error ?? ticket);
  process.exit(1);
}
console.log(`Token OK (voice: ${ticket.session.output.voice}).`);

const { promise: done, resolve: finish, reject: fail } = Promise.withResolvers();
const timer = setTimeout(() => fail(new Error('No complete reply within 30 seconds.')), 30_000);
let audioBytes = 0;
let transcript = '';
let firstAudioMs;
let askedAt;

const ws = new WebSocket(`${ticket.url}?token=${encodeURIComponent(ticket.token)}`);
ws.onopen = () => ws.send(JSON.stringify({ type: 'session.update', session: ticket.session }));
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  switch (msg.type) {
    case 'session.ready':
      console.log('Voice Agent session ready. Asking a question...');
      askedAt = Date.now();
      ws.send(JSON.stringify({ type: 'conversation.message', role: 'user', content: 'In one short sentence, what is a stack data structure?' }));
      ws.send(JSON.stringify({ type: 'reply.create' }));
      break;
    case 'reply.audio':
      firstAudioMs ??= Date.now() - askedAt;
      audioBytes += Buffer.from(msg.data, 'base64').length;
      break;
    case 'transcript.agent':
      transcript = msg.text;
      break;
    case 'reply.done':
      finish();
      break;
    case 'session.error':
      fail(new Error(`${msg.code}: ${msg.message}`));
      break;
  }
};
ws.onclose = (event) => fail(new Error(`Session closed: ${event.code} ${event.reason}`));

try {
  await done;
  // 24 kHz, 16-bit mono = 48,000 bytes per second.
  console.log(`First audio after ${firstAudioMs} ms, ${(audioBytes / 48000).toFixed(1)} s of speech.`);
  console.log(`Transcript: ${transcript.trim()}`);
  console.log('Smoke test passed.');
} catch (err) {
  console.error('Smoke test failed:', err.message);
  process.exitCode = 1;
} finally {
  clearTimeout(timer);
  ws.onclose = null;
  ws.close();
}
