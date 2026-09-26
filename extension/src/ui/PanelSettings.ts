import * as vscode from 'vscode';
import { readSettings } from '../config';
import { PANEL_BACKGROUNDS } from '../protocol';
import { HOTKEY_LABEL } from '../SessionController';
import { reportUsage } from '../voice/usageClient';
import type { AssistantViewProvider } from './AssistantViewProvider';

/**
 * Remembers that the user opened Keyboard Shortcuts to change the talk hotkey.
 * VS Code doesn't let extensions read keybindings, so from then on the panel
 * stops naming the default key.
 */
const HOTKEY_CUSTOM_KEY = 'echocode.hotkeyCustomized';

/** Answers the panel's Settings view: plan and usage, hotkey, background theme, and the pricing link. */
export class PanelSettings implements vscode.Disposable {
  private readonly view: AssistantViewProvider;
  private readonly installId: string;
  private readonly log: vscode.LogOutputChannel;
  private readonly state: vscode.Memento;
  private readonly subscriptions: vscode.Disposable[];

  constructor(view: AssistantViewProvider, installId: string, log: vscode.LogOutputChannel, state: vscode.Memento) {
    this.view = view;
    this.installId = installId;
    this.log = log;
    this.state = state;
    this.subscriptions = [
      view.onMessage((msg) => {
        switch (msg.type) {
          case 'ready':
            this.postBackground();
            this.postHotkey();
            break;
          case 'getUsage':
            void this.postUsage();
            break;
          case 'setBackground':
            if (PANEL_BACKGROUNDS.includes(msg.background)) {
              void vscode.workspace
                .getConfiguration('echocode')
                .update('panelBackground', msg.background, vscode.ConfigurationTarget.Global);
            }
            break;
          case 'openPricing':
            void vscode.env.openExternal(vscode.Uri.parse(`${readSettings().backendUrl.replace(/\/+$/, '')}/#pricing`));
            break;
          case 'openKeybindings':
            void this.openKeybindings();
            break;
        }
      }),
      // Also picks up changes made in VS Code's own Settings editor.
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('echocode.panelBackground')) this.postBackground();
      }),
    ];
  }

  dispose(): void {
    for (const subscription of this.subscriptions) subscription.dispose();
  }

  private postBackground(): void {
    this.view.post({ type: 'background', background: readSettings().panelBackground });
  }

  private postHotkey(): void {
    this.view.post({ type: 'hotkey', label: HOTKEY_LABEL, custom: this.state.get<boolean>(HOTKEY_CUSTOM_KEY, false) });
  }

  private async openKeybindings(): Promise<void> {
    await this.state.update(HOTKEY_CUSTOM_KEY, true);
    this.postHotkey();
    await vscode.commands.executeCommand('workbench.action.openGlobalKeybindings', 'echocode.talk');
  }

  /** Reporting zero seconds reads this month's usage without adding to it. */
  private async postUsage(): Promise<void> {
    try {
      const usage = await reportUsage(readSettings().backendUrl, this.installId, 0);
      this.view.post(usage ? { type: 'usage', ...usage } : { type: 'usageUnavailable', reason: 'off' });
    } catch (err) {
      this.log.warn(`Couldn't load usage: ${err instanceof Error ? err.message : String(err)}`);
      this.view.post({ type: 'usageUnavailable', reason: 'error' });
    }
  }
}
