/** Messages exchanged between the extension host and the assistant webview. */

export type SessionState = 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking';

export interface CodeCard {
  id: string;
  turnId: number;
  title: string;
  language: string;
  code: string;
  /** True when inserting replaces the lines that were selected when the question was asked. */
  replaceSelection: boolean;
  /** The 1-based lines a replacement covers, for the button label. */
  replaceLines?: { start: number; end: number };
}

export type ToWebview =
  /** Sent once the panel loads: how to describe the hotkey on this platform. */
  | { type: 'hello'; hotkey: string }
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
  /** The code behind an answer is being prepared. */
  | { type: 'codePending'; turnId: number }
  | { type: 'codeSuggestion'; card: CodeCard }
  /** No code card is coming for this turn. */
  | { type: 'codeNone'; turnId: number }
  /** This month's voice usage, when the backend meters it. */
  | { type: 'usage'; plan: 'free' | 'pro'; usedSeconds: number; limitSeconds: number | null }
  | { type: 'error'; message: string };

export type FromWebview =
  | { type: 'ready' }
  | { type: 'stop' }
  | { type: 'insertCode'; id: string }
  | { type: 'copyCode'; id: string };
