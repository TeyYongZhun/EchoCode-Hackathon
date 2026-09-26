/**
 * Finds the declaration a code card rewrites. With nothing selected, a card
 * holding a whole method (say, a fixed removeLast) used to be inserted at the
 * cursor, inside the old method, leaving two copies nested in each other. When
 * the card's code is one complete method or type that already exists in the
 * file, it replaces that one instead.
 *
 * This is a light scan for brace languages (Java, C#, TypeScript, C++…), not a
 * parser: when anything is unclear it finds nothing, and the card falls back
 * to inserting at the cursor.
 */

/** 0-based, inclusive. */
export interface LineRange {
  startLine: number;
  endLine: number;
}

interface Header {
  kind: 'type' | 'method';
  name: string;
  /** The parameter list with whitespace removed, when it fits on the header line. */
  params?: string;
}

/** Words that look like `name(` but start a statement, not a declaration. */
const NOT_DECLARATIONS = new Set([
  'if', 'for', 'foreach', 'while', 'switch', 'catch', 'return', 'new', 'else', 'do', 'try',
  'synchronized', 'throw', 'using', 'lock', 'when', 'await', 'typeof', 'sizeof', 'super', 'this',
]);

/** Blanks out strings, character literals and comments, so braces and names inside them don't count. */
function stripLines(lines: string[]): string[] {
  let inBlockComment = false;
  return lines.map((line) => {
    let out = '';
    let i = 0;
    while (i < line.length) {
      if (inBlockComment) {
        const end = line.indexOf('*/', i);
        if (end < 0) return out;
        inBlockComment = false;
        i = end + 2;
        continue;
      }
      const ch = line[i];
      if (ch === '/' && line[i + 1] === '/') break;
      if (ch === '/' && line[i + 1] === '*') {
        inBlockComment = true;
        i += 2;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') {
        let j = i + 1;
        while (j < line.length && line[j] !== ch) j += line[j] === '\\' ? 2 : 1;
        out += `${ch}${ch}`;
        i = j + 1;
        continue;
      }
      out += ch;
      i++;
    }
    return out;
  });
}

function parseHeader(line: string): Header | undefined {
  const code = line.trim();
  if (!code || code.endsWith(';') || code.startsWith('@')) return undefined;
  const type = /\b(?:class|interface|enum|record|struct|trait|object)\s+(\w+)/.exec(code);
  if (type) return { kind: 'type', name: type[1] };
  const call = /(^|[^\w.])(\w+)\s*(?:<[^>]*>\s*)?\(/.exec(code);
  if (!call || NOT_DECLARATIONS.has(call[2])) return undefined;
  // `x = foo(`, `return foo(` or `new Foo(` is a call, not a declaration.
  if (/[=:]\s*$|\b(?:return|new)\s*$/.test(code.slice(0, call.index + call[1].length))) return undefined;
  const params = /\(([^()]*)\)/.exec(code.slice(call.index));
  return { kind: 'method', name: call[2], params: params?.[1].replace(/\s+/g, '') };
}

/** The line where the block opened on or after `start` closes, or undefined if a `;` comes first (no body). */
function blockEnd(stripped: string[], start: number): number | undefined {
  let depth = 0;
  let opened = false;
  for (let i = start; i < stripped.length; i++) {
    for (const ch of stripped[i]) {
      if (ch === '{') {
        depth++;
        opened = true;
      } else if (ch === '}') {
        depth--;
        if (opened && depth === 0) return i;
        if (depth < 0) return undefined;
      } else if (ch === ';' && !opened) {
        return undefined;
      }
    }
  }
  return undefined;
}

const isAnnotation = (line: string) => line.trim().startsWith('@');

/** The declaration a card's code consists of, if it's exactly one complete method or type. */
function cardDeclaration(code: string): (Header & { annotated: boolean }) | undefined {
  const lines = code.split(/\r?\n/);
  const stripped = stripLines(lines);
  const first = stripped.findIndex((line) => line.trim() !== '' && !isAnnotation(line));
  if (first < 0) return undefined;
  const header = parseHeader(stripped[first]);
  if (!header) return undefined;
  const end = blockEnd(stripped, first);
  let last = stripped.length - 1;
  while (last > 0 && stripped[last].trim() === '') last--;
  if (end !== last) return undefined;
  const annotated = stripped.slice(0, first).some(isAnnotation);
  return { ...header, annotated };
}

/**
 * The lines of the existing declaration that `code` is a new version of, or
 * undefined when the code isn't one whole declaration or no single match is
 * found. Overloads are told apart by their parameters, then by the cursor.
 */
export function findDeclarationToReplace(
  documentLines: string[],
  code: string,
  cursorLine?: number,
): LineRange | undefined {
  const wanted = cardDeclaration(code);
  if (!wanted) return undefined;
  const stripped = stripLines(documentLines);

  const matches: (LineRange & { params?: string })[] = [];
  for (let i = 0; i < stripped.length; i++) {
    const header = parseHeader(stripped[i]);
    if (!header || header.kind !== wanted.kind || header.name !== wanted.name) continue;
    const end = blockEnd(stripped, i);
    if (end !== undefined) matches.push({ startLine: i, endLine: end, params: header.params });
  }

  const sameParams = matches.filter((m) => m.params !== undefined && m.params === wanted.params);
  const pool = sameParams.length > 0 ? sameParams : matches;
  const atCursor =
    cursorLine === undefined ? undefined : pool.find((m) => m.startLine <= cursorLine && cursorLine <= m.endLine);
  const match = atCursor ?? (pool.length === 1 ? pool[0] : undefined);
  if (!match) return undefined;

  // Replace the annotations above it too when the new code brings its own.
  let startLine = match.startLine;
  if (wanted.annotated) while (startLine > 0 && isAnnotation(documentLines[startLine - 1])) startLine--;
  return { startLine, endLine: match.endLine };
}

/** Shifts `code` so its first line starts at `indent`, keeping the relative indentation of the rest. */
export function reindent(code: string, indent: string): string {
  const lines = code.split(/\r?\n/);
  const base = /^\s*/.exec(lines.find((line) => line.trim() !== '') ?? '')![0];
  return lines
    .map((line) => {
      if (line.trim() === '') return '';
      return indent + (line.startsWith(base) ? line.slice(base.length) : line.trimStart());
    })
    .join('\n');
}
