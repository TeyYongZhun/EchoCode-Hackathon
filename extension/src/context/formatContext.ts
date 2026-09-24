/** Everything EchoCode knows about the editor when a question starts. Lines are 0-based. */
export interface EditorSnapshot {
  relativePath: string;
  languageId: string;
  lines: string[];
  cursorLine: number;
  /** Inclusive line range, present only when something is selected. */
  selection?: { startLine: number; endLine: number };
  diagnostics: { line: number; severity: 'error' | 'warning'; message: string }[];
}

/** Very long lines (minified code, data) are cut so they can't flood the context. */
export const MAX_LINE_CHARS = 400;
const MAX_PROBLEMS = 10;

export const NO_EDITOR_CONTEXT =
  '[EDITOR CONTEXT] No file is open, so answer from the conversation alone. [END EDITOR CONTEXT]';

/**
 * Chooses which lines to send: up to `maxLines`, centred on the focus range.
 * Returns a half-open range [start, end).
 */
export function contextWindow(
  totalLines: number,
  focusStart: number,
  focusEnd: number,
  maxLines: number,
): { start: number; end: number } {
  if (totalLines <= maxLines) return { start: 0, end: totalLines };
  const focusLength = focusEnd - focusStart + 1;
  if (focusLength >= maxLines) return { start: focusStart, end: focusStart + maxLines };
  const spare = maxLines - focusLength;
  const start = Math.max(0, Math.min(focusStart - Math.floor(spare / 2), totalLines - maxLines));
  return { start, end: start + maxLines };
}

/** Renders the snapshot as the text block sent to Gemini before each question. */
export function formatContext(snapshot: EditorSnapshot, maxLines: number): string {
  const { lines, selection } = snapshot;
  const focusStart = selection?.startLine ?? snapshot.cursorLine;
  const focusEnd = selection?.endLine ?? snapshot.cursorLine;
  const { start, end } = contextWindow(lines.length, focusStart, focusEnd, maxLines);

  const out = [
    '[EDITOR CONTEXT] What the developer is looking at right now. Line numbers are 1-based.',
    `File: ${snapshot.relativePath} (${snapshot.languageId}, ${lines.length} lines)`,
    `Cursor: line ${snapshot.cursorLine + 1}`,
    selection
      ? `Selected: lines ${selection.startLine + 1}-${selection.endLine + 1} (marked with > below)`
      : 'Selected: nothing',
  ];

  const problems = snapshot.diagnostics.filter((d) => d.line >= start && d.line < end).slice(0, MAX_PROBLEMS);
  if (problems.length > 0) {
    out.push('Problems:');
    for (const p of problems) out.push(`- line ${p.line + 1} (${p.severity}): ${p.message}`);
  }

  out.push(
    start === 0 && end === lines.length
      ? 'File content:'
      : `File content (lines ${start + 1}-${end} of ${lines.length}):`,
  );
  const width = String(end).length;
  for (let i = start; i < end; i++) {
    const selected = selection !== undefined && i >= selection.startLine && i <= selection.endLine;
    const text = lines[i].length > MAX_LINE_CHARS ? `${lines[i].slice(0, MAX_LINE_CHARS)}…` : lines[i];
    out.push(`${String(i + 1).padStart(width)}${selected ? '>' : ' '}| ${text}`);
  }
  out.push('[END EDITOR CONTEXT]');
  return out.join('\n');
}
