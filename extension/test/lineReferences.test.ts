import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { findLineReferences } from '../src/context/lineReferences.ts';

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
