/**
 * The conversation so far, kept by EchoCode so a fresh voice session can carry
 * on from it. AssemblyAI remembers a conversation only within one session, and
 * EchoCode starts a new one after a few idle minutes and when an answer still
 * playing is interrupted.
 */

export interface Exchange {
  question: string;
  answer: string;
  /** The student cut the answer off. */
  interrupted: boolean;
}

/** Enough to follow the thread without crowding the code out of the prompt. */
const MAX_EXCHANGES = 6;
const MAX_CHARS = 400;

export function remember(history: Exchange[], exchange: Exchange): Exchange[] {
  if (!exchange.question.trim() && !exchange.answer.trim()) return history;
  return [...history, exchange].slice(-MAX_EXCHANGES);
}

function clip(text: string): string {
  const flat = text.trim().replace(/\s+/g, ' ');
  return flat.length > MAX_CHARS ? `${flat.slice(0, MAX_CHARS)}…` : flat;
}

/** The [EARLIER CONVERSATION] block for a fresh session's prompt, or '' when there's none. */
export function formatConversation(history: Exchange[]): string {
  const lines = history.flatMap((exchange) => [
    ...(exchange.question.trim() ? [`Student: ${clip(exchange.question)}`] : []),
    ...(exchange.answer.trim()
      ? [`You${exchange.interrupted ? ' (cut off by the student)' : ''}: ${clip(exchange.answer)}`]
      : []),
  ]);
  if (lines.length === 0) return '';
  return `[EARLIER CONVERSATION] What was said before EchoCode reconnected. Carry on from it without repeating it.\n${lines.join('\n')}`;
}
