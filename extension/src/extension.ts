import { createHash } from 'node:crypto';
import * as vscode from 'vscode';
import { selectMicrophone, testMicrophone } from './audio/micCommands';
import { EditorTracker } from './context/editorContext';
import { SessionController } from './SessionController';
import { AssistantViewProvider } from './ui/AssistantViewProvider';
import { StatusBarRobot } from './ui/statusBar';

export function activate(context: vscode.ExtensionContext): void {
  const log = vscode.window.createOutputChannel('EchoCode', { log: true });
  const view = new AssistantViewProvider(context.extensionUri);
  const editors = new EditorTracker();
  // A stable, anonymous id for usage quotas; the raw machine id never leaves VS Code.
  const installId = createHash('sha256').update(vscode.env.machineId).digest('hex').slice(0, 32);
  const controller = new SessionController(view, editors, log, installId);
  const robot = new StatusBarRobot();

  context.subscriptions.push(
    log,
    view,
    editors,
    controller,
    robot,
    controller.onDidChangeState((state) => robot.update(state)),
    vscode.window.registerWebviewViewProvider(AssistantViewProvider.viewId, view, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.commands.registerCommand('echocode.talk', () => controller.toggleTalk()),
    vscode.commands.registerCommand('echocode.stop', () => controller.stop()),
    vscode.commands.registerCommand('echocode.testMicrophone', () => {
      if (controller.currentState !== 'idle') {
        void vscode.window.showWarningMessage('EchoCode is busy. Stop the current conversation first.');
        return;
      }
      return testMicrophone(log);
    }),
    vscode.commands.registerCommand('echocode.selectMicrophone', () => selectMicrophone(log)),
  );
  log.info('EchoCode activated');
}

export function deactivate(): void {}
