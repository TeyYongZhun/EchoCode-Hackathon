import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { formatProject, selectProjectFiles, type ProjectFile } from '../src/context/project.ts';

const file = (path: string, lines: number, text = 'x'.repeat(40)): ProjectFile => ({
  path,
  lines: Array.from({ length: lines }, () => text),
});

test('a small project is sent whole', () => {
  const files = [file('style.css', 40), file('script.js', 60)];
  const { full, listed } = selectProjectFiles(files, 'index.html', '');
  assert.deepEqual(full.map((f) => f.path).sort(), ['script.js', 'style.css']);
  assert.deepEqual(listed, []);
});

test('files the open file names come first, then its neighbours', () => {
  const files = [file('z/far.js', 5), file('app/near.js', 5), file('deep/linked.css', 5)];
  const html = '<link rel="stylesheet" href="deep/linked.css">';
  const { full } = selectProjectFiles(files, 'app/index.html', html);
  assert.deepEqual(full.map((f) => f.path), ['deep/linked.css', 'app/near.js', 'z/far.js']);
});

test('over budget, the most relevant files are sent and the rest are named', () => {
  // Each file is ~100 lines x ~48 chars, so roughly 4.8 KB apiece.
  const files = [file('a.js', 100), file('b.js', 100), file('c.js', 100), file('mentioned.js', 100)];
  const { full, listed } = selectProjectFiles(files, 'index.html', 'import "./mentioned.js"', 11_000);
  assert.equal(full[0].path, 'mentioned.js', 'the file the open one references is kept');
  assert.ok(full.length >= 1 && full.length < 4, `expected a partial selection, got ${full.length}`);
  assert.equal(full.length + listed.length, 4, 'every file is either sent or named');
});

test('one huge file is named rather than crowding out the rest', () => {
  const files = [file('bundle.js', 4000), file('small.css', 10)];
  const { full, listed } = selectProjectFiles(files, 'index.html', '');
  assert.deepEqual(full.map((f) => f.path), ['small.css']);
  assert.deepEqual(listed.map((f) => f.path), ['bundle.js']);
});

test('the block numbers each file from its own line 1 and tells the agent to name files', () => {
  const text = formatProject(selectProjectFiles([{ path: 'style.css', lines: ['body {', '  color: red;', '}'] }], 'index.html', ''));
  assert.match(text, /\[PROJECT\]/);
  assert.match(text, /line 12 of style\.css/, 'the agent is told how to refer to another file');
  assert.match(text, /File: style\.css \(3 lines\)/);
  assert.match(text, /1 \| body \{/);
  assert.match(text, /3 \| \}/);
  assert.match(text, /\[END PROJECT\]/);
});

test('an empty project adds nothing to the prompt', () => {
  assert.equal(formatProject(selectProjectFiles([], 'index.html', '')), '');
});

test('listed files show their names and sizes', () => {
  const text = formatProject({ full: [], listed: [file('vendor/huge.js', 900)] });
  assert.match(text, /- vendor\/huge\.js \(900 lines\)/);
  assert.match(text, /contents not shown/);
});
