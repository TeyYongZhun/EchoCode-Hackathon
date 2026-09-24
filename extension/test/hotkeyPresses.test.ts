import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { HotkeyPresses } from '../src/hotkeyPresses.ts';

test('separate taps are each a real press', () => {
  const presses = new HotkeyPresses();
  assert.deepEqual(presses.press(0), { kind: 'press' });
  assert.deepEqual(presses.press(4000), { kind: 'press' });
  assert.deepEqual(presses.press(9000), { kind: 'press' });
});

test('an accidental double press is ignored', () => {
  const presses = new HotkeyPresses();
  presses.press(0);
  assert.deepEqual(presses.press(150), { kind: 'ignored' });
  assert.deepEqual(presses.press(3000), { kind: 'press' });
});

test('holding the key (Windows auto-repeat) is detected after the repeat delay', () => {
  const presses = new HotkeyPresses();
  assert.equal(presses.press(0).kind, 'press');
  assert.equal(presses.press(500).kind, 'ignored'); // first repeat after the delay
  const held = presses.press(530);
  assert.equal(held.kind, 'held');
  assert.equal(held.kind === 'held' && held.releaseAfterMs, 200);
  for (let t = 560; t < 5000; t += 30) assert.equal(presses.press(t).kind, 'held');
});

test('a slow repeat rate gets a longer release window', () => {
  const presses = new HotkeyPresses();
  presses.press(0);
  presses.press(1000);
  const held = presses.press(1400);
  assert.equal(held.kind === 'held' && held.releaseAfterMs, 1000);
});

test('a new press after letting go starts fresh', () => {
  const presses = new HotkeyPresses();
  presses.press(0);
  presses.press(500);
  presses.press(530);
  assert.deepEqual(presses.press(8000), { kind: 'press' });
  assert.deepEqual(presses.press(8200), { kind: 'ignored' });
});
