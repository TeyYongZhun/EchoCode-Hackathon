import { base64ToInt16, int16ToFloat32 } from './audioMath';

const SAMPLE_RATE = 24000;
/** Head start for the first chunk so tiny network gaps don't cause clicks. */
const START_DELAY_S = 0.05;

/** Plays Gemini's streamed 24 kHz PCM chunks back to back, gap-free. */
export class AudioPlayer {
  private context: AudioContext | undefined;
  private output: AnalyserNode | undefined;
  private nextStart = 0;
  private readonly sources = new Set<AudioBufferSourceNode>();

  /** True when the browser is holding audio back until the user clicks. */
  get blocked(): boolean {
    return this.context?.state === 'suspended';
  }

  async unlock(): Promise<void> {
    await this.ensureContext().resume();
  }

  enqueue(base64: string): void {
    const context = this.ensureContext();
    if (context.state === 'suspended') void context.resume();
    const samples = int16ToFloat32(base64ToInt16(base64));
    if (samples.length === 0) return;

    const buffer = context.createBuffer(1, samples.length, SAMPLE_RATE);
    buffer.copyToChannel(samples, 0);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.output!);
    const startAt = Math.max(context.currentTime + START_DELAY_S, this.nextStart);
    source.start(startAt);
    this.nextStart = startAt + buffer.duration;
    this.sources.add(source);
    source.onended = () => this.sources.delete(source);
  }

  /** Stops everything that's playing or queued. */
  flush(): void {
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        // Already stopped.
      }
    }
    this.sources.clear();
    this.nextStart = 0;
  }

  /** How much received audio is still waiting to be heard, in milliseconds. */
  queuedMs(): number {
    if (!this.context) return 0;
    return Math.max(0, (this.nextStart - this.context.currentTime) * 1000);
  }

  /** Current output loudness, 0–1, for the visualizer. */
  level(): number {
    if (!this.output) return 0;
    const data = new Float32Array(this.output.fftSize);
    this.output.getFloatTimeDomainData(data);
    let sum = 0;
    for (const v of data) sum += v * v;
    return Math.sqrt(sum / data.length);
  }

  private ensureContext(): AudioContext {
    if (!this.context) {
      this.context = new AudioContext({ sampleRate: SAMPLE_RATE });
      this.output = this.context.createAnalyser();
      this.output.fftSize = 512;
      this.output.connect(this.context.destination);
    }
    return this.context;
  }
}
