/** Level a frame must reach to count as speech, however quiet the room. */
const SPEECH_MIN_LEVEL = 0.02;
/**
 * Loud frames (about 250 ms in total) before we believe someone is talking.
 * A key click or a bump on the desk is only a frame or three.
 */
const SPEECH_MIN_FRAMES = 8;
/** Levels below this fraction of the loudest speech so far count as silence. */
const SILENCE_FRACTION_OF_PEAK = 0.12;
/** Silence can never be louder than this, so a noisy room still ends a turn. */
const SILENCE_MAX_LEVEL = 0.06;
const SILENCE_MIN_LEVEL = 0.01;

/**
 * Decides when a push-to-talk question has ended on its own: the speaker said
 * something and then stayed quiet for `silenceMs`. The silence threshold is
 * relative to how loud they spoke, so it adapts to the microphone's gain.
 */
export class SilenceDetector {
  private readonly frameMs: number;
  private readonly silenceMs: number;
  private peak = 0;
  private loudFrames = 0;
  private heardSpeech = false;
  private quietMs = 0;

  /** `silenceMs` of 0 disables auto-stop. */
  constructor(frameMs: number, silenceMs: number) {
    this.frameMs = frameMs;
    this.silenceMs = silenceMs;
  }

  get speechDetected(): boolean {
    return this.heardSpeech;
  }

  /** Feeds one frame's level; returns true once the question has ended. */
  push(level: number): boolean {
    // Counted in total rather than in a row, since speech dips between syllables.
    if (level >= SPEECH_MIN_LEVEL && ++this.loudFrames >= SPEECH_MIN_FRAMES) this.heardSpeech = true;
    if (this.heardSpeech) this.peak = Math.max(this.peak, level);
    if (!this.heardSpeech || this.silenceMs <= 0) return false;

    const threshold = Math.min(
      SILENCE_MAX_LEVEL,
      Math.max(SILENCE_MIN_LEVEL, this.peak * SILENCE_FRACTION_OF_PEAK),
    );
    this.quietMs = level < threshold ? this.quietMs + this.frameMs : 0;
    return this.quietMs >= this.silenceMs;
  }
}
