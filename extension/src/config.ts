import * as vscode from 'vscode';
import { PANEL_BACKGROUNDS, type PanelBackground } from './protocol';

export interface EchoCodeSettings {
  backendUrl: string;
  micDeviceIndex: number;
  maxContextLines: number;
  autoStopSilenceMs: number;
  panelBackground: PanelBackground;
}

export function readSettings(): EchoCodeSettings {
  const config = vscode.workspace.getConfiguration('echocode');
  const background = config.get<string>('panelBackground', 'midnight');
  return {
    panelBackground: (PANEL_BACKGROUNDS as readonly string[]).includes(background)
      ? (background as PanelBackground)
      : 'midnight',
    backendUrl: config.get<string>('backendUrl', 'https://echo-code-hackathon.vercel.app'),
    micDeviceIndex: config.get<number>('micDeviceIndex', -1),
    maxContextLines: config.get<number>('maxContextLines', 400),
    autoStopSilenceMs: config.get<number>('autoStopSilenceMs', 2000),
  };
}
