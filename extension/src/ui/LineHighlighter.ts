import * as vscode from 'vscode';

/**
 * Lights up the lines EchoCode is talking about. When it names another file in
 * the project ("line 12 of style.css"), that file is opened so the developer
 * sees what is meant. It opens without taking keyboard focus: the answer is
 * still playing, and they may be typing.
 */
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
  /** Highlights are scheduled ahead of the words, so a slow file open must not overtake a newer one. */
  private sequence = 0;

  /** Highlights 1-based lines `start`–`end` of `uri`, opening it if it isn't on screen. */
  async show(uri: vscode.Uri, start: number, end: number): Promise<void> {
    const mine = ++this.sequence;
    const editor = await this.editorFor(uri);
    if (!editor || mine !== this.sequence) return;
    const { document } = editor;
    if (start < 1 || start > document.lineCount) return;
    const last = Math.min(end, document.lineCount);
    const range = new vscode.Range(start - 1, 0, last - 1, document.lineAt(last - 1).text.length);
    this.clear();
    editor.setDecorations(this.decoration, [range]);
    editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
    this.highlighted = editor;
  }

  private async editorFor(uri: vscode.Uri): Promise<vscode.TextEditor | undefined> {
    const onScreen = vscode.window.visibleTextEditors.find((e) => e.document.uri.toString() === uri.toString());
    if (onScreen) return onScreen;
    try {
      const document = await vscode.workspace.openTextDocument(uri);
      // preview so these don't pile up as tabs; preserveFocus so typing isn't interrupted.
      return await vscode.window.showTextDocument(document, { preview: true, preserveFocus: true });
    } catch {
      // Deleted, binary, or otherwise unopenable: say nothing rather than fail the answer.
      return undefined;
    }
  }

  clear(): void {
    this.highlighted?.setDecorations(this.decoration, []);
    this.highlighted = undefined;
  }

  dispose(): void {
    this.decoration.dispose();
  }
}
