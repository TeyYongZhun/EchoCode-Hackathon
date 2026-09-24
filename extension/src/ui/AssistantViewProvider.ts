import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import type { FromWebview, ToWebview } from '../protocol';

const MAX_QUEUED_MESSAGES = 500;
const READY_TIMEOUT_MS = 3000;

/** The EchoCode panel: hosts the webview UI and relays messages to and from it. */
export class AssistantViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  static readonly viewId = 'echocode.assistant';

  private view: vscode.WebviewView | undefined;
  private ready = false;
  /** Messages posted before the webview finished loading. */
  private queue: ToWebview[] = [];
  private readonly extensionUri: vscode.Uri;
  private readonly messages = new vscode.EventEmitter<FromWebview>();
  private readonly readyEvent = new vscode.EventEmitter<void>();

  readonly onMessage = this.messages.event;

  constructor(extensionUri: vscode.Uri) {
    this.extensionUri = extensionUri;
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    this.ready = false;
    const dist = vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview');
    view.webview.options = { enableScripts: true, localResourceRoots: [dist] };
    view.webview.html = this.html(view.webview, dist);

    view.webview.onDidReceiveMessage((msg: FromWebview) => {
      if (msg.type === 'ready') {
        this.ready = true;
        for (const queued of this.queue.splice(0)) void view.webview.postMessage(queued);
        this.readyEvent.fire();
      }
      this.messages.fire(msg);
    });
    view.onDidDispose(() => {
      if (this.view === view) {
        this.view = undefined;
        this.ready = false;
      }
    });
  }

  post(message: ToWebview): void {
    if (this.view && this.ready) {
      void this.view.webview.postMessage(message);
    } else if (message.type !== 'micLevel' && this.queue.length < MAX_QUEUED_MESSAGES) {
      this.queue.push(message);
    }
  }

  /**
   * Makes sure the panel is loaded so replies can be heard. The first time
   * this opens the panel, which takes focus, so focus goes back to the editor.
   */
  async ensureVisible(editor: vscode.TextEditor | undefined): Promise<void> {
    if (this.view) {
      if (!this.view.visible) this.view.show(true);
      return;
    }
    const ready = new Promise<void>((resolve) => {
      const sub = this.readyEvent.event(() => {
        sub.dispose();
        resolve();
      });
      setTimeout(() => {
        sub.dispose();
        resolve();
      }, READY_TIMEOUT_MS);
    });
    await vscode.commands.executeCommand(`${AssistantViewProvider.viewId}.focus`);
    if (editor) {
      await vscode.window.showTextDocument(editor.document, { viewColumn: editor.viewColumn, preserveFocus: false });
    }
    await ready;
  }

  dispose(): void {
    this.messages.dispose();
    this.readyEvent.dispose();
  }

  private html(webview: vscode.Webview, dist: vscode.Uri): string {
    const nonce = randomBytes(16).toString('base64');
    const script = webview.asWebviewUri(vscode.Uri.joinPath(dist, 'main.js'));
    const style = webview.asWebviewUri(vscode.Uri.joinPath(dist, 'main.css'));
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} data:;">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${style}">
  <title>EchoCode</title>
</head>
<body>
  <div id="app"></div>
  <script nonce="${nonce}" src="${script}"></script>
</body>
</html>`;
  }
}
