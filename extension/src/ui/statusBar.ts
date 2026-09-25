import * as vscode from 'vscode';
import type { SessionState } from '../protocol';

const APPEARANCE: Record<SessionState, { text: string; tooltip: string; background?: string }> = {
  idle: { text: '$(robot) EchoCode', tooltip: 'EchoCode: click (or press Ctrl+Alt+Space) and ask about your code' },
  connecting: { text: '$(loading~spin) Connecting…', tooltip: 'Connecting to AssemblyAI. Keep talking; click when done.' },
  listening: {
    text: '$(record) Listening…',
    tooltip: 'EchoCode is listening. Click to send your question.',
    background: 'statusBarItem.warningBackground',
  },
  thinking: { text: '$(loading~spin) Thinking…', tooltip: 'EchoCode is thinking. Click to ask something else.' },
  speaking: { text: '$(unmute) Speaking…', tooltip: 'EchoCode is answering. Click to interrupt with a new question.' },
};

/** The robot in the status bar: shows EchoCode's state and works as a talk button. */
export class StatusBarRobot implements vscode.Disposable {
  private readonly item = vscode.window.createStatusBarItem('echocode.status', vscode.StatusBarAlignment.Right, 1000);

  constructor() {
    this.item.name = 'EchoCode';
    this.item.command = 'echocode.talk';
    this.update('idle');
    this.item.show();
  }

  update(state: SessionState): void {
    const look = APPEARANCE[state];
    this.item.text = look.text;
    this.item.tooltip = look.tooltip;
    this.item.backgroundColor = look.background ? new vscode.ThemeColor(look.background) : undefined;
  }

  dispose(): void {
    this.item.dispose();
  }
}
