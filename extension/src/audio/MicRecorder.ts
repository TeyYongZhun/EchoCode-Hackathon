import * as path from 'node:path';
import { Worker } from 'node:worker_threads';
import type { MicWorkerMessage, MicWorkerRequest } from './micWorker';

/** PvRecorder always records 16 kHz, 16-bit mono; AgentClient upsamples it to the 24 kHz AssemblyAI expects. */
export const MIC_SAMPLE_RATE = 16000;
export const FRAME_LENGTH = 512;
export const FRAME_MS = (FRAME_LENGTH / MIC_SAMPLE_RATE) * 1000;

/** esbuild bundles the worker next to extension.js in dist/. */
const WORKER_PATH = path.join(__dirname, 'micWorker.js');
const STOP_TIMEOUT_MS = 1000;

function spawn(request: MicWorkerRequest): Worker {
  return new Worker(WORKER_PATH, { workerData: request });
}

export function listMicrophones(): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const worker = spawn({ mode: 'list' });
    worker.on('message', (msg: MicWorkerMessage) => {
      if (msg.type === 'devices') resolve(msg.devices);
      if (msg.type === 'error') reject(new Error(msg.message));
    });
    worker.on('error', reject);
    worker.on('exit', () => reject(new Error('The microphone worker exited unexpectedly.')));
  });
}

/** Streams 32 ms microphone frames from a worker thread. One recording at a time. */
export class MicRecorder {
  private worker: Worker | undefined;
  private stopFlag: Int32Array | undefined;
  private finished: Promise<void> | undefined;

  get isRecording(): boolean {
    return this.worker !== undefined;
  }

  /**
   * Starts recording. Resolves with the device name once audio is flowing.
   * `onError` reports failures that happen after that point.
   */
  start(
    deviceIndex: number,
    onFrame: (pcm: Int16Array) => void,
    onError: (message: string) => void,
  ): Promise<string> {
    if (this.worker) throw new Error('The microphone is already recording.');
    const stopFlag = new SharedArrayBuffer(4);
    const worker = spawn({ mode: 'record', deviceIndex, frameLength: FRAME_LENGTH, stopFlag });
    this.worker = worker;
    this.stopFlag = new Int32Array(stopFlag);

    let started = false;
    let markFinished!: () => void;
    this.finished = new Promise((resolve) => (markFinished = resolve));

    return new Promise((resolve, reject) => {
      const fail = (message: string) => (started ? onError(message) : reject(new Error(message)));
      worker.on('message', (msg: MicWorkerMessage) => {
        switch (msg.type) {
          case 'started':
            started = true;
            resolve(msg.device);
            break;
          case 'frame':
            onFrame(msg.pcm);
            break;
          case 'error':
            fail(msg.message);
            break;
          case 'stopped':
            markFinished();
            break;
        }
      });
      worker.on('error', (err) => fail(err.message));
      worker.on('exit', () => {
        markFinished();
        if (this.worker === worker) this.worker = undefined;
        if (!started) reject(new Error('The microphone stopped before recording began.'));
      });
    });
  }

  /** Stops recording. Every frame recorded before this call is delivered first. */
  async stop(): Promise<void> {
    const worker = this.worker;
    if (!worker || !this.stopFlag) return;
    Atomics.store(this.stopFlag, 0, 1);
    const timeout = setTimeout(() => void worker.terminate(), STOP_TIMEOUT_MS);
    await this.finished;
    clearTimeout(timeout);
    if (this.worker === worker) this.worker = undefined;
  }
}
