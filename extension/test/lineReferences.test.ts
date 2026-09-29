import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { findFileMentions, findLineReferences } from '../src/context/lineReferences.ts';

const ranges = (text: string) => findLineReferences(text).map(({ start, end }) => [start, end]);

test('finds digits and spelled-out numbers', () => {
  assert.deepEqual(ranges('On line 20, push checks the size.'), [[20, 20]]);
  assert.deepEqual(ranges('On line twenty, push checks the size.'), [[20, 20]]);
  assert.deepEqual(ranges('then line twenty-one calls resize'), [[21, 21]]);
  assert.deepEqual(ranges('Line nine declares the node.'), [[9, 9]]);
  assert.deepEqual(ranges('on line one hundred and five'), [[105, 105]]);
});

test('reads ranges and lists as one span', () => {
  assert.deepEqual(ranges('Look at lines 10 to 14.'), [[10, 14]]);
  assert.deepEqual(ranges('lines ten through fourteen'), [[10, 14]]);
  assert.deepEqual(ranges('lines 10-14 hold the loop'), [[10, 14]]);
  assert.deepEqual(ranges("I've highlighted lines ten, thirteen, and fourteen"), [[10, 14]]);
  assert.deepEqual(ranges('On lines thirteen and fourteen, contains scans the list.'), [[13, 14]]);
});

test('finds several references in order', () => {
  const text = 'On line twenty, push checks if the array is full. If it is, line twenty-one calls resize, and line 23 stores it.';
  assert.deepEqual(ranges(text), [[20, 20], [21, 21], [23, 23]]);
});

test('ignores "line" without a number and unrelated words', () => {
  assert.deepEqual(ranges('Each line of code runs once. The deadline is 5 pm.'), []);
  assert.deepEqual(ranges('Draw a line and then stop.'), []);
});

test('does not merge a sentence that continues after "and" or a comma', () => {
  assert.deepEqual(ranges('On line twelve, and then again later, it loops.'), [[12, 12]]);
  assert.deepEqual(ranges('On line twelve, two things happen.'), [[12, 12]]);
});

test('a list spanning a huge range keeps only its first line', () => {
  assert.deepEqual(ranges('lines 3 and 300'), [[3, 3]]);
});

test('reports where each reference ends, so a half-streamed number can wait', () => {
  const text = 'On line twenty';
  const [ref] = findLineReferences(text);
  assert.equal(ref.endOffset, text.length);
});

// ---- File names heard in an answer -----------------------------------------

const PROJECT = ['index.html', 'style.css', 'script.js', 'src/LinkedList.java', 'src/util/helpers.ts'];
const files = (text: string, paths = PROJECT) => findLineReferences(text, paths).map((r) => r.file);

test('a file named after the line number marks that file', () => {
  assert.deepEqual(files('You can change it on line 12 of style.css.'), ['style.css']);
});

test('a file named before the line number marks it too', () => {
  assert.deepEqual(files('In style.css, line 12 sets the font.'), ['style.css']);
});

test('spoken file names match however the punctuation came through', () => {
  assert.deepEqual(files('Look at line 12 of style dot c s s.'), ['style.css']);
  assert.deepEqual(files('Look at line 12 of style css.'), ['style.css']);
  assert.deepEqual(files('Look at line 12 of style dot css.'), ['style.css']);
});

test('one file name covers the lines said with it', () => {
  assert.deepEqual(files('In style.css, lines 4 and 9 both set a colour.'), ['style.css']);
  assert.deepEqual(files('In script.js, line 3 calls it, and line 40 defines it.'), ['script.js', 'script.js']);
});

test('a file in a folder is matched by name or by path', () => {
  assert.deepEqual(files('That is line 34 of LinkedList.java.'), ['src/LinkedList.java']);
  assert.deepEqual(files('That is line 34 of src slash LinkedList dot java.'), ['src/LinkedList.java']);
  assert.deepEqual(files('The helpers file, line 8, exports it.'), ['src/util/helpers.ts']);
});

test('no file named means the file they are looking at', () => {
  assert.deepEqual(files('The crash happens on line 34.'), [undefined]);
  // Unchanged when the caller has no project to match against.
  assert.deepEqual(findLineReferences('On line 12 of style.css.').map((r) => r.file), [undefined]);
});

test('a file named far from the line number is not attached to it', () => {
  const text = `We opened style.css earlier and it was fine. ${'Everything else looks right so far. '.repeat(3)}Now look at line 12.`;
  assert.deepEqual(files(text), [undefined]);
});

test('a name that could mean two files marks neither', () => {
  const ambiguous = ['app/index.js', 'lib/index.js', 'style.css'];
  assert.deepEqual(files('Check line 5 of index.js.', ambiguous), [undefined]);
  // The full path still tells them apart.
  assert.deepEqual(files('Check line 5 of app slash index dot js.', ambiguous), ['app/index.js']);
});

test('the longest matching name wins, so an extension is not dropped', () => {
  const both = ['style.css', 'style.css.map'];
  assert.deepEqual(files('See line 2 of style dot css dot map.', both), ['style.css.map']);
});

// ---- Files named with no line number ---------------------------------------

const mentioned = (text: string, paths = PROJECT) => findFileMentions(text, paths).map((m) => m.path);

test('finds a file named on its own, so "open style.css" has somewhere to go', () => {
  assert.deepEqual(mentioned('Sure, opening style.css for you.'), ['style.css']);
  assert.deepEqual(mentioned('Opening style dot c s s now.'), ['style.css']);
  assert.deepEqual(mentioned('That lives in the helpers file.'), ['src/util/helpers.ts']);
});

test('finds every file named, in the order they are said', () => {
  assert.deepEqual(mentioned('index.html pulls in script.js.'), ['index.html', 'script.js']);
});

test('a name that matches nothing in the project is not a file', () => {
  assert.deepEqual(mentioned('Opening the settings for you.'), []);
  assert.deepEqual(mentioned('Opening style.css.', []), []);
});

test('reports where each name ends, so a half-streamed name can wait', () => {
  const text = 'Opening style.css';
  const [mention] = findFileMentions(text, PROJECT);
  assert.equal(mention.endOffset, text.length);
  assert.equal(text.slice(mention.at, mention.endOffset), 'style.css');
});
