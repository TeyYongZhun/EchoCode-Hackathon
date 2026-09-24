// Runs in a worker thread. PvRecorder's reads block until the next audio frame
// is ready, which would stall VS Code's shared extension host if done there.
import { parentPort, workerData } from 'node:worker_threads';
import { PvRecorder } from '@picovoice/pvrecorder-node';

export type MicWorkerRequest =
  | { mode: 'list' }
  | { mode: 'record'; deviceIndex: number; frameLength: number; stopFlag: SharedArrayBuffer };

export type MicWorkerMessage =
  | { type: 'devices'; devices: string[] }
  | { type: 'started'; device: string }
  | { type: 'frame'; pcm: Int16Array }
  | { type: 'error'; message: string }
  | { type: 'stopped' };

const port = parentPort!;
const request = workerData as MicWorkerRequest;

function post(message: MicWorkerMessage, transfer?: ArrayBuffer[]): void {
  port.postMessage(message, transfer);
}

function record(deviceIndex: number, frameLength: number, stopFlag: SharedArrayBuffer): void {
  const stop = new Int32Array(stopFlag);
  const recorder = new PvRecorder(frameLength, deviceIndex);
  try {
    recorder.start();
    post({ type: 'started', device: recorder.getSelectedDevice() });
    while (Atomics.load(stop, 0) === 0) {
      const pcm = recorder.readSync();
      post({ type: 'frame', pcm }, [pcm.buffer as ArrayBuffer]);
    }
    recorder.stop();
  } finally {
    recorder.release();
  }
  post({ type: 'stopped' });
}

try {
  if (request.mode === 'list') {
    post({ type: 'devices', devices: PvRecorder.getAvailableDevices() });
  } else {
    record(request.deviceIndex, request.frameLength, request.stopFlag);
  }
} catch (err) {
  post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
}
