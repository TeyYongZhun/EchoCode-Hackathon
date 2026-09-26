import * as vscode from 'vscode';
import { formatContext, NO_EDITOR_CONTEXT } from './formatContext';

function isCodeEditor(editor: vscode.TextEditor | undefined): editor is vscode.TextEditor {
  return editor !== undefined && editor.document.uri.scheme !== 'output';
}

/**
 * Remembers the last code editor the user was in. When they click inside the
 * EchoCode panel, `activeTextEditor` becomes undefined, but questions and
 * inserts should still target the code they were just looking at.
 */
export class EditorTracker implements vscode.Disposable {
  private last: vscode.TextEditor | undefined;
  private readonly subscription: vscode.Disposable;

  constructor() {
    this.last = isCodeEditor(vscode.window.activeTextEditor) ? vscode.window.activeTextEditor : undefined;
    this.subscription = vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (isCodeEditor(editor)) this.last = editor;
    });
  }

  get editor(): vscode.TextEditor | undefined {
    const active = vscode.window.activeTextEditor;
    if (isCodeEditor(active)) return active;
    const last = this.last;
    if (!last) return undefined;
    // Editor objects are recreated when a tab is hidden and shown again.
    return vscode.window.visibleTextEditors.find((e) => e === last || e.document === last.document);
  }

  dispose(): void {
    this.subscription.dispose();
  }
}

/** The whole lines covered by the editor's selection (0-based, inclusive), if anything is selected. */
function selectedLines(editor: vscode.TextEditor): { startLine: number; endLine: number } | undefined {
  const selection = editor.selection;
  if (selection.isEmpty) return undefined;
  // A selection ending at column 0 doesn't really include that last line.
  const endsAtLineStart = selection.end.character === 0 && selection.end.line > selection.start.line;
  return { startLine: selection.start.line, endLine: endsAtLineStart ? selection.end.line - 1 : selection.end.line };
}

/** What a question was about: the document, and the whole lines selected when it was asked. */
export interface QuestionTarget {
  document: vscode.TextDocument;
  /** 0-based. */
  cursorLine: number;
  selection?: { startLine: number; endLine: number; text: string };
}

export function captureTarget(editor: vscode.TextEditor | undefined): QuestionTarget | undefined {
  if (!editor) return undefined;
  const cursorLine = editor.selection.active.line;
  const lines = selectedLines(editor);
  if (!lines) return { document: editor.document, cursorLine };
  const range = new vscode.Range(lines.startLine, 0, lines.endLine, editor.document.lineAt(lines.endLine).text.length);
  return { document: editor.document, cursorLine, selection: { ...lines, text: editor.document.getText(range) } };
}

/** Builds the [EDITOR CONTEXT] block for the editor the user is looking at. */
export function captureEditorContext(editor: vscode.TextEditor | undefined, maxLines: number): string {
  if (!editor) return NO_EDITOR_CONTEXT;
  const document = editor.document;
  const selection = editor.selection;
  const selected = selectedLines(editor);

  const diagnostics = vscode.languages
    .getDiagnostics(document.uri)
    .filter((d) => d.severity <= vscode.DiagnosticSeverity.Warning)
    .map((d) => ({
      line: d.range.start.line,
      severity: d.severity === vscode.DiagnosticSeverity.Error ? ('error' as const) : ('warning' as const),
      message: d.message,
    }));

  return formatContext(
    {
      relativePath: vscode.workspace.asRelativePath(document.uri, false),
      languageId: document.languageId,
      lines: document.getText().split(/\r?\n/),
      cursorLine: selection.active.line,
      selection: selected,
      diagnostics,
    },
    maxLines,
  );
}
