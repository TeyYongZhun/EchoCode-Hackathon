/** Loudness of 16-bit PCM samples as a root-mean-square value between 0 and 1. */
export function rmsLevel(samples: Int16Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i] / 32768;
    sum += s * s;
  }
  return Math.sqrt(sum / samples.length);
}

/** Encodes little-endian 16-bit PCM as base64, the format the Live API expects. */
export function pcm16ToBase64(samples: Int16Array): string {
  return Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength).toString('base64');
}

/** Seconds of audio in a base64 chunk of 16-bit mono PCM at the given sample rate. */
export function base64PcmSeconds(base64: string, sampleRate: number): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  const bytes = (base64.length * 3) / 4 - padding;
  return bytes / 2 / sampleRate;
}
