'use client';

import { useEffect, useRef, useState } from 'react';
import { Robot } from './Robot';

const QUESTION = 'Why is this so slow with a big list?';
const ANSWER =
  'On lines thirteen and fourteen, contains scans the whole list for every id, so the work grows with the square of the input. A HashSet makes those checks instant.';

const CODE: [number, string, boolean][] = [
  [9, 'static List<Integer> findDuplicates(List<Integer> ids) {', false],
  [10, '    List<Integer> seen = new ArrayList<>();', false],
  [11, '    List<Integer> duplicates = new ArrayList<>();', false],
  [12, '    for (Integer id : ids) {', false],
  [13, '        if (seen.contains(id)) {', true],
  [14, '            if (!duplicates.contains(id)) {', true],
  [15, '                duplicates.add(id);', false],
];

const HIGHLIGHTED = CODE.filter(([, , lit]) => lit).map(([line]) => line);

/** One turn of the demo, in milliseconds from the start of the loop. */
const BEATS = {
  questionFrom: 150,
  questionTo: 1500,
  thinkingFrom: 1900,
  speakingFrom: 2500,
  answerFrom: 2600,
  answerTo: 5200,
  /** The moment each highlighted line lights up, in the order it is spoken. */
  lineLitAt: [2700, 3200],
  doneFrom: 5400,
  loopAt: 7800,
};

type Phase = 'listening' | 'thinking' | 'speaking' | 'done';

/** What the panel shows at one instant: how much has been typed, and how many lines are lit. */
type Frame = { phase: Phase; question: number; answer: number; lit: number };

const STATUS: Record<Phase, string> = {
  listening: 'Listening… let go to send',
  thinking: 'Thinking…',
  speaking: 'Speaking… press the key to interrupt',
  done: 'Ready',
};

/** The end of the loop. Also what renders on the server, so the hero is never blank. */
const FINISHED: Frame = {
  phase: 'done',
  question: QUESTION.length,
  answer: ANSWER.length,
  lit: HIGHLIGHTED.length,
};

function frameAt(t: number): Frame {
  const grown = (from: number, to: number, length: number) =>
    Math.round(Math.max(0, Math.min(1, (t - from) / (to - from))) * length);
  return {
    phase:
      t < BEATS.thinkingFrom
        ? 'listening'
        : t < BEATS.speakingFrom
          ? 'thinking'
          : t < BEATS.doneFrom
            ? 'speaking'
            : 'done',
    question: grown(BEATS.questionFrom, BEATS.questionTo, QUESTION.length),
    answer: grown(BEATS.answerFrom, BEATS.answerTo, ANSWER.length),
    lit: BEATS.lineLitAt.filter((at) => t >= at).length,
  };
}

/**
 * The hero's VS Code mock, playing one question on a loop: the words are typed into the
 * conversation, the lines light up as they are spoken, and the bubble shows only what
 * EchoCode is doing — the same split as the real panel.
 */
export function HeroDemo() {
  const [frame, setFrame] = useState<Frame>(FINISHED);
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Someone who has asked for less motion gets the finished frame and nothing moving.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let raf = 0;
    let start = 0;

    const draw = (now: number) => {
      if (!start) start = now;
      setFrame(frameAt((now - start) % BEATS.loopAt));
      raf = requestAnimationFrame(draw);
    };

    // Off-screen frames are wasted work, and a loop that restarts when you scroll back
    // means the demo is always at the beginning when someone actually looks at it.
    const watcher = new IntersectionObserver(
      ([entry]) => {
        cancelAnimationFrame(raf);
        raf = 0;
        start = 0;
        if (entry.isIntersecting) raf = requestAnimationFrame(draw);
        else setFrame(FINISHED);
      },
      { threshold: 0.25 },
    );
    if (host.current) watcher.observe(host.current);

    return () => {
      watcher.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  const typing = frame.phase === 'listening';
  const speaking = frame.phase === 'speaking';

  return (
    <div
      className="mock"
      ref={host}
      role="img"
      aria-label="The EchoCode panel inside VS Code: a spoken question about a slow method, answered out loud while the lines it mentions light up."
    >
      <div className="mock-bar">
        <span className="dot" />
        <span className="dot" />
        <span className="dot" />
        <em>DuplicateFinder.java</em>
      </div>

      <pre className="mock-code">
        {CODE.map(([line, text, highlighted]) => (
          <span
            key={line}
            className={highlighted && HIGHLIGHTED.indexOf(line) < frame.lit ? 'hl' : undefined}
          >
            <span className="ln">{String(line).padStart(2)}</span>
            {text}
          </span>
        ))}
      </pre>

      <div className="mock-panel">
        <p className="mock-tab">EchoCode</p>

        <div className="mock-turn">
          <b>You</b>
          <span>
            {QUESTION.slice(0, frame.question)}
            {typing && <i className="caret" />}
          </span>
        </div>

        {/* Always rendered, so the panel doesn't change height when the answer arrives. */}
        <div className="mock-turn model" data-empty={frame.phase === 'listening' ? '' : undefined}>
          <b>
            EchoCode
            {frame.phase === 'done' && <em>⚡ 1100 ms</em>}
          </b>
          <span>
            {ANSWER.slice(0, frame.answer)}
            {speaking && <i className="caret" />}
          </span>
        </div>

        <div className="mock-stage" data-phase={frame.phase}>
          <Robot className="mock-robot" />
          <div className="mock-bubble">
            {STATUS[frame.phase]}
            {frame.phase === 'done' && <small>Code ready ↑</small>}
          </div>
        </div>
      </div>
    </div>
  );
}
