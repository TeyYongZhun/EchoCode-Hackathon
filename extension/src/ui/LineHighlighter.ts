import * as vscode from 'vscode';

/** Lights up the lines EchoCode is talking about, in the file the question was about. */
export class LineHighlighter implements vscode.Disposable {
  private readonly decoration = vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    backgroundColor: 'rgba(0, 216, 232, 0.13)',
    borderColor: 'rgba(0, 216, 232, 0.9)',
    borderStyle: 'solid',
    borderWidth: '0 0 0 3px',
    overviewRulerColor: 'rgba(0, 216, 232, 0.9)',
    overviewRulerLane: vscode.OverviewRulerLane.Full,
  });
  private highlighted: vscode.TextEditor | undefined;

  /** Highlights 1-based lines `start`–`end` of `document`, if it's open in a visible editor. */
  show(document: vscode.TextDocument, start: number, end: number): void {
    const editor = vscode.window.visibleTextEditors.find((e) => e.document === document);
    if (!editor || start < 1 || start > document.lineCount) return;
    const last = Math.min(end, document.lineCount);
    const range = new vscode.Range(start - 1, 0, last - 1, document.lineAt(last - 1).text.length);
    this.clear();
    editor.setDecorations(this.decoration, [range]);
    editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
    this.highlighted = editor;
  }

  clear(): void {
    this.highlighted?.setDecorations(this.decoration, []);
    this.highlighted = undefined;
  }

  dispose(): void {
    this.decoration.dispose();
  }
}
