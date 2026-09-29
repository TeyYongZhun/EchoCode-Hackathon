import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { findRequestedFile, isFileOpenRequest } from '../src/context/fileRequests.ts';

const PROJECT = [
  'backend/app/globals.css',
  'extension/webview/main.css',
  'extension/webview/main.ts',
  'extension/src/SessionController.ts',
  'src/LinkedList.java',
  'index.html',
];
const asked = (question: string, paths = PROJECT) => findRequestedFile(question, paths);

test('only a question that asks to be taken somewhere opens anything', () => {
  assert.equal(isFileOpenRequest('Can you help me open the CSS file?'), true);
  assert.equal(isFileOpenRequest('Take me to LinkedList.java'), true);
  assert.equal(isFileOpenRequest("Where's the font set?"), true);
  assert.equal(isFileOpenRequest('Why does this loop run twice?'), false);
  // A question about globals.css is not a request to be moved into it.
  assert.equal(asked('What does globals.css do?'), undefined);
});

test('a name said exactly opens that file', () => {
  assert.equal(asked('Yeah, just open globals.css.'), 'backend/app/globals.css');
  assert.equal(asked('Open globals dot c s s.'), 'backend/app/globals.css');
  assert.equal(asked('Take me to LinkedList.java'), 'src/LinkedList.java');
});

test('a name a slip or two off still opens it, which is how it is usually said', () => {
  // "global.css" for globals.css: the miss that opened nothing before.
  assert.equal(asked('Yeah, just open the global.css file.'), 'backend/app/globals.css');
  assert.equal(asked('Open the globals css file'), 'backend/app/globals.css');
  assert.equal(asked('Show me SessionControler.ts'), 'extension/src/SessionController.ts');
  assert.equal(asked('Open the LinkedLists file'), 'src/LinkedList.java');
});

test('a slip that could mean two files opens neither', () => {
  assert.equal(asked('Open main'), undefined);
  assert.equal(asked('Open the CSS file'), undefined);
});

test('one file of a type can be asked for by type alone', () => {
  assert.equal(asked('Open the HTML file'), 'index.html');
  assert.equal(asked('Show me the java file'), 'src/LinkedList.java');
  // Two CSS files, so which one has to be said.
  assert.equal(asked('Open the css file'), undefined);
});

test('a type is only a type when it is said as one', () => {
  const go = ['main.go', 'README.md'];
  // "go to" is the request, not a request for the Go file.
  assert.equal(asked('Go to line ten', go), undefined);
  assert.equal(asked('Open the go file', go), 'main.go');
});

test('nothing recognisable opens nothing', () => {
  assert.equal(asked('Open the thing I was looking at'), undefined);
  assert.equal(asked('Open the Crock-Pot'), undefined);
  assert.equal(asked('Open globals.css', []), undefined);
});
