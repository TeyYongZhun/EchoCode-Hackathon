import * as vscode from 'vscode';
import { formatContext, NO_EDITOR_CONTEXT, type EditorSnapshot } from './formatContext';

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

/** Builds the [EDITOR CONTEXT] block for the editor the user is looking at. */
export function captureEditorContext(editor: vscode.TextEditor | undefined, maxLines: number): string {
  if (!editor) return NO_EDITOR_CONTEXT;
  const document = editor.document;
  const selection = editor.selection;

  let selected: EditorSnapshot['selection'];
  if (!selection.isEmpty) {
    // A selection ending at column 0 doesn't really include that last line.
    const endsAtLineStart = selection.end.character === 0 && selection.end.line > selection.start.line;
    selected = {
      startLine: selection.start.line,
      endLine: endsAtLineStart ? selection.end.line - 1 : selection.end.line,
    };
  }

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
