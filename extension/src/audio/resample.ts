/**
 * Converts 16 kHz 16-bit mono PCM (what PvRecorder records) to 24 kHz (what
 * AssemblyAI's Voice Agent expects) by linear interpolation. The ratio is
 * exactly 3:2, so a 512-sample frame becomes 768 samples.
 */
export function upsample16kTo24k(input: Int16Array): Int16Array {
  const outLength = Math.floor((input.length * 3) / 2);
  const out = new Int16Array(outLength);
  const last = input.length - 1;
  for (let j = 0; j < outLength; j++) {
    const position = (j * 2) / 3;
    const i = Math.floor(position);
    const frac = position - i;
    const a = input[i];
    const b = input[Math.min(i + 1, last)];
    out[j] = Math.round(a + (b - a) * frac);
  }
  return out;
}
