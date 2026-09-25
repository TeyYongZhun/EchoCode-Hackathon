import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { base64PcmSeconds, pcm16ToBase64, rmsLevel } from '../src/audio/pcm.ts';
import { upsample16kTo24k } from '../src/audio/resample.ts';
import { SilenceDetector } from '../src/audio/silenceDetector.ts';
import { base64ToInt16, int16ToFloat32 } from '../webview/audioMath.ts';

test('rmsLevel is 0 for silence and about 1 for full-scale square waves', () => {
  assert.equal(rmsLevel(new Int16Array(512)), 0);
  const square = Int16Array.from({ length: 512 }, (_, i) => (i % 2 ? 32767 : -32768));
  assert.ok(rmsLevel(square) > 0.99);
});

test('PCM survives the base64 round trip from extension to webview', () => {
  const samples = Int16Array.from([0, 1, -1, 32767, -32768, 1234, -4321]);
  assert.deepEqual(base64ToInt16(pcm16ToBase64(samples)), samples);
});

test('int16ToFloat32 maps samples into -1..1', () => {
  assert.deepEqual(Array.from(int16ToFloat32(Int16Array.from([-32768, 0, 16384]))), [-1, 0, 0.5]);
});

test('base64PcmSeconds measures a chunk of audio', () => {
  const oneSecondAt24k = pcm16ToBase64(new Int16Array(24000));
  assert.equal(base64PcmSeconds(oneSecondAt24k, 24000), 1);
  assert.equal(base64PcmSeconds(pcm16ToBase64(new Int16Array(3)), 24000), 3 / 24000);
});

const FRAME_MS = 32;

function feed(detector: SilenceDetector, level: number, ms: number): boolean {
  let ended = false;
  for (let t = 0; t < ms; t += FRAME_MS) ended = detector.push(level) || ended;
  return ended;
}

test('SilenceDetector never ends a turn before any speech', () => {
  const detector = new SilenceDetector(FRAME_MS, 1500);
  assert.equal(feed(detector, 0.003, 10_000), false);
  assert.equal(detector.speechDetected, false);
});

test('SilenceDetector ignores a key click', () => {
  const detector = new SilenceDetector(FRAME_MS, 1500);
  feed(detector, 0.003, 300);
  feed(detector, 0.3, 96); // three loud frames
  feed(detector, 0.003, 3000);
  assert.equal(detector.speechDetected, false);
});

test('SilenceDetector counts choppy speech with gaps between syllables', () => {
  const detector = new SilenceDetector(FRAME_MS, 1500);
  for (let i = 0; i < 4; i++) {
    feed(detector, 0.15, 64);
    feed(detector, 0.005, 64);
  }
  assert.equal(detector.speechDetected, true);
});

test('SilenceDetector ends the turn after speech then silence', () => {
  const detector = new SilenceDetector(FRAME_MS, 1500);
  assert.equal(feed(detector, 0.2, 1000), false);
  assert.equal(detector.speechDetected, true);
  assert.equal(feed(detector, 0.004, 1400), false);
  assert.equal(feed(detector, 0.004, 200), true);
});

test('SilenceDetector tolerates short pauses mid-sentence', () => {
  const detector = new SilenceDetector(FRAME_MS, 1500);
  feed(detector, 0.2, 1000);
  assert.equal(feed(detector, 0.004, 1000), false);
  feed(detector, 0.2, 500);
  assert.equal(feed(detector, 0.004, 1000), false);
});

test('SilenceDetector treats steady room noise as silence once someone has spoken', () => {
  const detector = new SilenceDetector(FRAME_MS, 1500);
  feed(detector, 0.4, 1000);
  assert.equal(feed(detector, 0.03, 1600), true);
});

test('SilenceDetector with silenceMs 0 never auto-stops', () => {
  const detector = new SilenceDetector(FRAME_MS, 0);
  feed(detector, 0.2, 1000);
  assert.equal(feed(detector, 0, 10_000), false);
});

test('upsample16kTo24k turns a 512-sample frame into 768 samples', () => {
  assert.equal(upsample16kTo24k(new Int16Array(512)).length, 768);
});

test('upsample16kTo24k keeps a constant signal constant', () => {
  const out = upsample16kTo24k(new Int16Array(512).fill(1234));
  assert.ok(out.every((s) => s === 1234));
});

test('upsample16kTo24k interpolates between samples', () => {
  // A straight ramp stays a straight ramp at the new rate.
  const ramp = Int16Array.from({ length: 4 }, (_, i) => i * 300);
  assert.deepEqual(Array.from(upsample16kTo24k(ramp)), [0, 200, 400, 600, 800, 900]);
});

test('upsample16kTo24k keeps a 16 kHz tone at the same pitch', () => {
  // 1 kHz sine at 16 kHz: 16 samples per cycle; at 24 kHz it should be 24 samples per cycle.
  const tone = Int16Array.from({ length: 480 }, (_, i) => Math.round(10000 * Math.sin((2 * Math.PI * i) / 16)));
  const out = upsample16kTo24k(tone);
  let crossings = 0;
  for (let i = 1; i < out.length; i++) if (out[i - 1] < 0 && out[i] >= 0) crossings++;
  // 480 input samples = 30 cycles.
  assert.ok(crossings >= 29 && crossings <= 30, `expected ~30 cycles, got ${crossings}`);
});
