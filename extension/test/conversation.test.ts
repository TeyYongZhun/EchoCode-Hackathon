import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { formatConversation, remember, type Exchange } from '../src/context/conversation.ts';

const exchange = (question: string, answer: string, interrupted = false): Exchange => ({ question, answer, interrupted });

test('an empty conversation adds nothing to the prompt', () => {
  assert.equal(formatConversation([]), '');
  assert.equal(formatConversation(remember([], exchange('  ', ''))), '');
});

test('the conversation reads as a script, marking an answer the student cut off', () => {
  const history = remember(remember([], exchange('Why does it crash?', 'On line 34, current.next is null.')), exchange('Hello?', 'Sure, so the', true));
  assert.equal(
    formatConversation(history),
    '[EARLIER CONVERSATION] What was said before EchoCode reconnected. Carry on from it without repeating it.\n' +
      'Student: Why does it crash?\n' +
      'You: On line 34, current.next is null.\n' +
      'Student: Hello?\n' +
      'You (cut off by the student): Sure, so the',
  );
});

test('only the latest exchanges are kept, and long answers are shortened', () => {
  let history: Exchange[] = [];
  for (let i = 1; i <= 8; i++) history = remember(history, exchange(`Question ${i}`, 'x'.repeat(500)));
  const text = formatConversation(history);
  assert.ok(!text.includes('Question 2\n') && text.includes('Question 3\n') && text.includes('Question 8\n'));
  assert.ok(text.includes(`${'x'.repeat(400)}…`) && !text.includes('x'.repeat(401)));
});
