import * as vscode from 'vscode';
import { readSettings } from '../config';
import { MicRecorder, listMicrophones } from './MicRecorder';
import { rmsLevel } from './pcm';

const TEST_SECONDS = 3;
/** Peak level below which we assume the microphone captured only silence. */
const SILENT_PEAK = 0.01;

const PRIVACY_HINT =
  'On Windows, check Settings > Privacy & security > Microphone > "Let desktop apps access your microphone".';

/** Records a few seconds and reports whether real audio came through. */
export async function testMicrophone(log: vscode.LogOutputChannel): Promise<void> {
  const mic = new MicRecorder();
  let peak = 0;
  let frames = 0;
  let device: string;
  try {
    device = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `EchoCode: recording for ${TEST_SECONDS} seconds. Say something...`,
      },
      async () => {
        const name = await mic.start(
          readSettings().micDeviceIndex,
          (pcm) => {
            peak = Math.max(peak, rmsLevel(pcm));
            frames++;
          },
          (message) => log.error(`Microphone error during test: ${message}`),
        );
        await new Promise((resolve) => setTimeout(resolve, TEST_SECONDS * 1000));
        await mic.stop();
        return name;
      },
    );
  } catch (err) {
    await mic.stop();
    const message = err instanceof Error ? err.message : String(err);
    log.error(`Microphone test failed: ${message}`);
    void vscode.window.showErrorMessage(`EchoCode couldn't open the microphone: ${message} ${PRIVACY_HINT}`);
    return;
  }

  const percent = Math.round(peak * 100);
  log.info(`Microphone test: device "${device}", ${frames} frames, peak level ${percent}%`);
  if (frames === 0) {
    void vscode.window.showErrorMessage(`EchoCode opened "${device}" but received no audio. ${PRIVACY_HINT}`);
  } else if (peak < SILENT_PEAK) {
    void vscode.window.showWarningMessage(
      `EchoCode recorded from "${device}" but it was silent. Pick another microphone with "EchoCode: Choose Microphone". ${PRIVACY_HINT}`,
    );
  } else {
    void vscode.window.showInformationMessage(`Microphone works: "${device}" (peak level ${percent}%).`);
  }
}

/** Lets the user choose which input device EchoCode records from. */
export async function selectMicrophone(log: vscode.LogOutputChannel): Promise<void> {
  let devices: string[];
  try {
    devices = await listMicrophones();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error(`Listing microphones failed: ${message}`);
    void vscode.window.showErrorMessage(`EchoCode couldn't list microphones: ${message}`);
    return;
  }

  const current = readSettings().micDeviceIndex;
  const items = [
    { label: 'System default', index: -1 },
    ...devices.map((name, index) => ({ label: name, index })),
  ].map((item) => ({ ...item, description: item.index === current ? 'current' : undefined }));

  const pick = await vscode.window.showQuickPick(items, { title: 'EchoCode: choose a microphone' });
  if (!pick) return;
  await vscode.workspace
    .getConfiguration('echocode')
    .update('micDeviceIndex', pick.index, vscode.ConfigurationTarget.Global);
  log.info(`Microphone set to "${pick.label}" (index ${pick.index})`);
}
