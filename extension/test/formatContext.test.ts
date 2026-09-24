import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { contextWindow, formatContext, MAX_LINE_CHARS, type EditorSnapshot } from '../src/context/formatContext.ts';

test('contextWindow sends the whole file when it fits', () => {
  assert.deepEqual(contextWindow(50, 10, 12, 400), { start: 0, end: 50 });
});

test('contextWindow centres on the focus range', () => {
  assert.deepEqual(contextWindow(1000, 500, 509, 100), { start: 455, end: 555 });
});

test('contextWindow clamps at the start and end of the file', () => {
  assert.deepEqual(contextWindow(1000, 3, 3, 100), { start: 0, end: 100 });
  assert.deepEqual(contextWindow(1000, 998, 999, 100), { start: 900, end: 1000 });
});

test('contextWindow keeps the start of a selection larger than the window', () => {
  assert.deepEqual(contextWindow(1000, 200, 600, 100), { start: 200, end: 300 });
});

function snapshot(overrides: Partial<EditorSnapshot> = {}): EditorSnapshot {
  return {
    relativePath: 'demo/Stack.java',
    languageId: 'java',
    lines: ['class Stack {', '  void push() {}', '  void pop() {}', '}'],
    cursorLine: 1,
    diagnostics: [],
    ...overrides,
  };
}

test('formatContext numbers lines from 1 and marks the selection', () => {
  const text = formatContext(snapshot({ selection: { startLine: 1, endLine: 2 } }), 400);
  assert.match(text, /File: demo\/Stack\.java \(java, 4 lines\)/);
  assert.match(text, /Cursor: line 2/);
  assert.match(text, /Selected: lines 2-3/);
  assert.match(text, /^1 \| class Stack \{$/m);
  assert.match(text, /^2>\|   void push\(\) \{\}$/m);
  assert.match(text, /^3>\|   void pop\(\) \{\}$/m);
  assert.match(text, /^4 \| \}$/m);
});

test('formatContext says when nothing is selected', () => {
  assert.match(formatContext(snapshot(), 400), /Selected: nothing/);
});

test('formatContext lists problems inside the window only', () => {
  const lines = Array.from({ length: 300 }, (_, i) => `line ${i}`);
  const text = formatContext(
    snapshot({
      lines,
      cursorLine: 10,
      diagnostics: [
        { line: 12, severity: 'error', message: 'missing semicolon' },
        { line: 250, severity: 'warning', message: 'unused variable' },
      ],
    }),
    50,
  );
  assert.match(text, /- line 13 \(error\): missing semicolon/);
  assert.doesNotMatch(text, /unused variable/);
  assert.match(text, /File content \(lines 1-50 of 300\):/);
});

test('formatContext truncates very long lines', () => {
  const text = formatContext(snapshot({ lines: ['x'.repeat(MAX_LINE_CHARS + 50)], cursorLine: 0 }), 400);
  assert.ok(text.includes(`${'x'.repeat(MAX_LINE_CHARS)}…`));
  assert.ok(!text.includes('x'.repeat(MAX_LINE_CHARS + 1)));
});
