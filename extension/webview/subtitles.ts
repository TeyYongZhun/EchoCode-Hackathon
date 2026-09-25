/** Longest subtitle shown at once; longer sentences show their most recent part. */
export const MAX_SUBTITLE_CHARS = 140;
/** A new sentence needs this many words before it replaces the previous one. */
const MIN_NEW_SENTENCE_WORDS = 3;

/**
 * Picks the subtitle for a transcript that is still being spoken: the sentence
 * being said right now, like film subtitles. A sentence that has only just
 * begun ("The") waits until it has a few words, so the bubble doesn't flicker.
 */
export function currentSentence(transcript: string): string {
  const sentences = transcript
    .trim()
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (sentences.length === 0) return '';

  let sentence = sentences[sentences.length - 1];
  if (sentences.length > 1 && sentence.split(/\s+/).length < MIN_NEW_SENTENCE_WORDS) {
    sentence = sentences[sentences.length - 2];
  }
  if (sentence.length <= MAX_SUBTITLE_CHARS) return sentence;

  // Keep the end of a long sentence, starting at a word boundary.
  const tail = sentence.slice(sentence.length - MAX_SUBTITLE_CHARS);
  const space = tail.indexOf(' ');
  return `…${space >= 0 ? tail.slice(space + 1) : tail}`;
}
