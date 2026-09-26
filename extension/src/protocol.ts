/** Messages exchanged between the extension host and the assistant webview. */

export type SessionState = 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking';

/** Panel background themes, chosen in the panel's Settings or the echocode.panelBackground setting. */
export const PANEL_BACKGROUNDS = ['midnight', 'graphite', 'purple', 'ocean', 'vscode'] as const;
export type PanelBackground = (typeof PANEL_BACKGROUNDS)[number];

export interface CodeCard {
  id: string;
  turnId: number;
  title: string;
  language: string;
  code: string;
  /** True when inserting replaces the lines that were selected when the question was asked. */
  replaceSelection: boolean;
  /** The 1-based lines a replacement covers, for the button label: the selection, or the method the code rewrites. */
  replaceLines?: { start: number; end: number };
}

export type ToWebview =
  /** Sent once the panel loads: how to describe the hotkey on this platform. */
  | { type: 'hello'; hotkey: string }
  | { type: 'state'; state: SessionState }
  /** The user pressed Stop; `was` is what EchoCode was doing at the time. */
  | { type: 'stopped'; was: SessionState }
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
  /** Usage can't be shown: the backend doesn't meter it ('off'), or asking failed ('error'). */
  | { type: 'usageUnavailable'; reason: 'off' | 'error' }
  | { type: 'background'; background: PanelBackground }
  /** The talk hotkey. `custom` once the user has opened Keyboard Shortcuts to change it, since its new key can't be read. */
  | { type: 'hotkey'; label: string; custom: boolean }
  | { type: 'error'; message: string };

export type FromWebview =
  | { type: 'ready' }
  | { type: 'stop' }
  | { type: 'insertCode'; id: string }
  | { type: 'copyCode'; id: string }
  /** The Settings view opened and wants this month's usage. */
  | { type: 'getUsage' }
  | { type: 'setBackground'; background: PanelBackground }
  | { type: 'openPricing' }
  /** Opens Keyboard Shortcuts filtered to EchoCode's talk command. */
  | { type: 'openKeybindings' };
