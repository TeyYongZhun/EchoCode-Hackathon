import { createHash } from 'node:crypto';
import * as vscode from 'vscode';
import { selectMicrophone, testMicrophone } from './audio/micCommands';
import { EditorTracker } from './context/editorContext';
import { WorkspaceIndex } from './context/workspaceIndex';
import { HOTKEY_LABEL, SessionController } from './SessionController';
import { AssistantViewProvider } from './ui/AssistantViewProvider';
import { PanelSettings } from './ui/PanelSettings';
import { StatusBarRobot } from './ui/statusBar';

export function activate(context: vscode.ExtensionContext): void {
  const log = vscode.window.createOutputChannel('EchoCode', { log: true });
  const view = new AssistantViewProvider(context.extensionUri);
  const editors = new EditorTracker();
  // A stable, anonymous id for usage quotas; the raw machine id never leaves VS Code.
  const installId = createHash('sha256').update(vscode.env.machineId).digest('hex').slice(0, 32);
  const index = new WorkspaceIndex(log);
  const controller = new SessionController(view, editors, log, installId, index);
  const settings = new PanelSettings(view, installId, log, context.globalState);
  const robot = new StatusBarRobot();

  context.subscriptions.push(
    log,
    view,
    editors,
    index,
    controller,
    settings,
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
  askAboutMicrophone(context.globalState);
  log.info('EchoCode activated');
}

/** Shown once per install: EchoCode can't ask for the microphone itself, so it says it needs one. */
function askAboutMicrophone(state: vscode.Memento): void {
  const KEY = 'echocode.microphoneNoticeShown';
  if (state.get<boolean>(KEY)) return;
  void state.update(KEY, true);
  void vscode.window
    .showInformationMessage(
      `EchoCode answers out loud and needs your microphone. Nothing is recorded until you press ${HOTKEY_LABEL}.`,
      'Test microphone',
      'Later',
    )
    .then((choice) => {
      if (choice === 'Test microphone') void vscode.commands.executeCommand('echocode.testMicrophone');
    });
}

export function deactivate(): void {}
