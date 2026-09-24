/** Messages exchanged between the extension host and the assistant webview. */

export type SessionState = 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking';

export type ToWebview =
  | { type: 'state'; state: SessionState }
  /** Microphone loudness, 0–1, about 15 times a second while listening. */
  | { type: 'micLevel'; level: number }
  /** A chunk of the spoken reply: base64 16-bit PCM, mono, 24 kHz. */
  | { type: 'audio'; data: string }
  /** Stop playback immediately (the reply was interrupted). */
  | { type: 'flushAudio' }
  /** Full transcript so far of the user's question for this turn. */
  | { type: 'userTranscript'; turnId: number; text: string }
  /** Full transcript so far of the AI's answer for this turn. */
  | { type: 'modelTranscript'; turnId: number; text: string }
  | { type: 'latency'; turnId: number; ms: number }
  | { type: 'turnComplete'; turnId: number }
  | { type: 'error'; message: string };

export type FromWebview = { type: 'ready' } | { type: 'toggleTalk' } | { type: 'stop' };
