/**
 * Presses closer together than this are keyboard auto-repeat (the key is being
 * held) or an accidental double press. Covers Windows' slowest repeat delay (1 s).
 */
export const REPEAT_GAP_MS = 1050;
/** Repeats needed before we treat the key as held rather than double-pressed. */
const HELD_AFTER_REPEATS = 2;
const MIN_RELEASE_MS = 200;
const MAX_RELEASE_MS = 1200;

export type PressResult =
  /** A real press: start, send or interrupt. */
  | { kind: 'press' }
  /** Too soon after the last press to mean anything; ignore it. */
  | { kind: 'ignored' }
  /** The key is being held down. If no repeat arrives within `releaseAfterMs`, it was released. */
  | { kind: 'held'; releaseAfterMs: number };

/**
 * VS Code only reports key presses, never releases, and holding a key fires
 * the command again every ~30 ms. This turns that stream back into what the
 * user did: tap to start and tap to send, or hold to talk and release to send.
 */
export class HotkeyPresses {
  private lastAt = Number.NEGATIVE_INFINITY;
  private repeats = 0;

  press(now: number): PressResult {
    const gap = now - this.lastAt;
    this.lastAt = now;
    if (gap >= REPEAT_GAP_MS) {
      this.repeats = 0;
      return { kind: 'press' };
    }
    this.repeats++;
    if (this.repeats < HELD_AFTER_REPEATS) return { kind: 'ignored' };
    // Allow a few missed repeats before deciding the key was let go.
    const releaseAfterMs = Math.min(MAX_RELEASE_MS, Math.max(MIN_RELEASE_MS, gap * 2.5));
    return { kind: 'held', releaseAfterMs };
  }
}
