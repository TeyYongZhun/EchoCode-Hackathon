/** Decodes base64 little-endian 16-bit PCM. */
export function base64ToInt16(base64: string): Int16Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Int16Array(bytes.buffer, 0, bytes.length >> 1);
}

/** Converts 16-bit samples to the -1..1 floats Web Audio plays. */
export function int16ToFloat32(samples: Int16Array): Float32Array<ArrayBuffer> {
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) out[i] = samples[i] / 32768;
  return out;
}
