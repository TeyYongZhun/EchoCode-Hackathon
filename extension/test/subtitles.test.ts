import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { currentSentence, MAX_SUBTITLE_CHARS } from '../webview/subtitles.ts';

test('shows the sentence being spoken', () => {
  assert.equal(currentSentence('On line twenty, push checks the size.'), 'On line twenty, push checks the size.');
  assert.equal(
    currentSentence('On line twenty, push checks the size. If it is full, line twenty-one doubles it'),
    'If it is full, line twenty-one doubles it',
  );
});

test('keeps the previous sentence until a new one has a few words', () => {
  assert.equal(currentSentence('Push checks the size. If'), 'Push checks the size.');
  assert.equal(currentSentence('Push checks the size. If it is'), 'If it is');
});

test('handles questions, exclamations and empty text', () => {
  assert.equal(currentSentence('That frees memory. Does that make sense?'), 'Does that make sense?');
  assert.equal(currentSentence('   '), '');
});

test('long sentences show their most recent words', () => {
  const long = `This sentence ${'keeps going and going '.repeat(12)}until the end.`;
  const shown = currentSentence(long);
  assert.ok(shown.startsWith('…'));
  assert.ok(shown.endsWith('until the end.'));
  assert.ok(shown.length <= MAX_SUBTITLE_CHARS + 1);
});
