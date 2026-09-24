// End-to-end check without VS Code or a microphone:
// backend token -> Gemini Live session -> spoken reply (counted, not played).
//
// Usage: npm run smoke [-- http://localhost:3000]
import { GoogleGenAI } from '@google/genai';

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
console.log(`Token OK for model ${ticket.model} (API ${ticket.apiVersion}).`);

const ai = new GoogleGenAI({ apiKey: ticket.token, httpOptions: { apiVersion: ticket.apiVersion } });
let audioBytes = 0;
let transcript = '';
let firstAudioMs;
let sentAt;

const done = new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('No complete reply within 30 seconds.')), 30_000);
  globalThis.finish = () => {
    clearTimeout(timer);
    resolve();
  };
  globalThis.fail = (err) => {
    clearTimeout(timer);
    reject(err);
  };
});

const session = await ai.live.connect({
  model: ticket.model,
  config: ticket.config,
  callbacks: {
    onmessage: (msg) => {
      const content = msg.serverContent;
      for (const part of content?.modelTurn?.parts ?? []) {
        if (part.inlineData?.data) {
          firstAudioMs ??= Date.now() - sentAt;
          audioBytes += Buffer.from(part.inlineData.data, 'base64').length;
        }
      }
      if (content?.outputTranscription?.text) transcript += content.outputTranscription.text;
      if (content?.turnComplete) globalThis.finish();
    },
    onerror: (e) => globalThis.fail(new Error(e.message ?? 'WebSocket error')),
    onclose: (e) => globalThis.fail(new Error(`Session closed: ${e.code} ${e.reason}`)),
  },
});
console.log('Live session open. Asking a question...');

sentAt = Date.now();
session.sendClientContent({
  turns: [{ role: 'user', parts: [{ text: 'In one short sentence, what is a stack data structure?' }] }],
  turnComplete: true,
});

try {
  await done;
  console.log(`First audio after ${firstAudioMs} ms, ${(audioBytes / 48000).toFixed(1)} s of speech.`);
  console.log(`Transcript: ${transcript.trim()}`);
  console.log('Smoke test passed.');
} catch (err) {
  console.error('Smoke test failed:', err.message);
  process.exitCode = 1;
} finally {
  session.close();
}
