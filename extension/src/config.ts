import * as vscode from 'vscode';

export interface EchoCodeSettings {
  backendUrl: string;
  micDeviceIndex: number;
  maxContextLines: number;
  autoStopSilenceMs: number;
}

export function readSettings(): EchoCodeSettings {
  const config = vscode.workspace.getConfiguration('echocode');
  return {
    backendUrl: config.get<string>('backendUrl', 'https://echo-code-hackathon.vercel.app'),
    micDeviceIndex: config.get<number>('micDeviceIndex', -1),
    maxContextLines: config.get<number>('maxContextLines', 400),
    autoStopSilenceMs: config.get<number>('autoStopSilenceMs', 2000),
  };
}
