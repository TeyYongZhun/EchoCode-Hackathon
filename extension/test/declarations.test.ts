import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { findDeclarationToReplace, reindent } from '../src/context/declarations.ts';

const linkedList = readFileSync(new URL('../../demo/LinkedList.java', import.meta.url), 'utf8').split(/\r?\n/);
const lineOf = (text: string) => linkedList.findIndex((line) => line.includes(text));

const FIXED_REMOVE_LAST = `    public T removeLast() {
        if (head == null) {
            throw new java.util.NoSuchElementException();
        }
        if (head.next == null) {
            T value = head.value;
            head = null;
            size--;
            return value;
        }
        Node<T> current = head;
        while (current.next.next != null) {
            current = current.next;
        }
        T value = current.next.value;
        current.next = null;
        size--;
        return value;
    }`;

test('a whole method replaces the method of the same name, not the cursor line', () => {
  const start = lineOf('public T removeLast()');
  const cursorInsideIt = start + 2;
  assert.deepEqual(findDeclarationToReplace(linkedList, FIXED_REMOVE_LAST, cursorInsideIt), {
    startLine: start,
    endLine: lineOf('public int size()') - 2,
  });
});

test('the match does not depend on where the cursor is', () => {
  assert.equal(findDeclarationToReplace(linkedList, FIXED_REMOVE_LAST, 0)?.startLine, lineOf('public T removeLast()'));
});

test('code that is not one whole declaration is inserted as before', () => {
  const statements = 'if (head == null) {\n    throw new IllegalStateException();\n}';
  assert.equal(findDeclarationToReplace(linkedList, statements), undefined);
  // A method followed by something else isn't a single declaration.
  assert.equal(findDeclarationToReplace(linkedList, `${FIXED_REMOVE_LAST}\nint x = 1;`), undefined);
});

test('a new method that is not in the file is inserted as before', () => {
  const peek = 'public T peekLast() {\n    return null;\n}';
  assert.equal(findDeclarationToReplace(linkedList, peek), undefined);
});

test('calls to the method are not mistaken for its declaration', () => {
  const file = ['void run() {', '    removeLast();', '    x = removeLast();', '}', 'T removeLast() {', '    return null;', '}'];
  assert.deepEqual(findDeclarationToReplace(file, 'T removeLast() {\n    return head;\n}'), { startLine: 4, endLine: 6 });
});

test('braces inside strings and comments do not end the method early', () => {
  const file = ['String show() {', '    // a } in a comment', '    return "}" + \'}\';', '}', 'int other() {', '    return 1;', '}'];
  assert.deepEqual(findDeclarationToReplace(file, 'String show() {\n    return "{}";\n}'), { startLine: 0, endLine: 3 });
});

test('overloads are told apart by their parameters', () => {
  const file = ['int add(int a) {', '    return a;', '}', 'int add(int a, int b) {', '    return a + b;', '}'];
  const code = 'int add(int a, int b) {\n    return b + a;\n}';
  assert.deepEqual(findDeclarationToReplace(file, code), { startLine: 3, endLine: 5 });
});

test('annotations are replaced too when the new code has them', () => {
  const file = ['class A {', '    @Override', '    public String toString() {', '        return "a";', '    }', '}'];
  const code = '@Override\npublic String toString() {\n    return "A";\n}';
  assert.deepEqual(findDeclarationToReplace(file, code), { startLine: 1, endLine: 4 });
  assert.deepEqual(findDeclarationToReplace(file, 'public String toString() {\n    return "A";\n}'), { startLine: 2, endLine: 4 });
});

test('reindent moves code to the target indentation and keeps its shape', () => {
  assert.equal(reindent('public void a() {\n    b();\n\n}', '    '), '    public void a() {\n        b();\n\n    }');
  assert.equal(reindent('        x();\n            y();', '  '), '  x();\n      y();');
});
