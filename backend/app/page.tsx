import type { CSSProperties } from 'react';

import { HeroDemo } from './HeroDemo';
import { HeroVideo } from './HeroVideo';
import { Check, Robot } from './Robot';
import { ScrollReveals } from './ScrollReveals';

const REPO_URL = 'https://github.com/TeyYongZhun/EchoCode-Hackathon';
const DOWNLOAD_URL = `${REPO_URL}/releases/latest`;

const STEPS = [
  {
    title: 'Wake it',
    body: 'Press the hotkey once. EchoCode says hello and waits. Until that press it is connected to nothing and your microphone is off.',
  },
  {
    title: 'Ask out loud',
    body: 'Hold the same key and ask the way you would ask the person next to you. Let go to send. Select some code first if your question is about one part of it.',
  },
  {
    title: 'Listen and look',
    body: 'The answer comes back in plain language. The file it is about opens, and each line lights up as it is mentioned. Ask to be taken somewhere instead — "open the LinkedList file" — and it comes up with your cursor in it.',
  },
  {
    title: 'Apply, or ask again',
    body: 'A suggested fix appears as a card you can insert with one click. Changed your mind mid-answer? Press the key again and ask something else.',
  },
];

const FEATURES = [
  {
    title: 'You talk instead of typing',
    body: 'Hold one key and ask. No prompt to write, no code to paste, no window to switch to.',
  },
  {
    title: 'It already has your code',
    body: 'The file you are in, your cursor, whatever you selected and any errors in that file go with every question automatically.',
  },
  {
    title: 'It looks past the file you are in',
    body: 'Ask "where do I change the heading?" while looking at index.html and it finds the rule in style.css, opens that file and highlights the line. In our own testing on a small web app, 9 of 9 questions landed on the right file and line.',
  },
  {
    title: 'It takes you to the file',
    body: 'Say "open the globals.css file" and it comes up with your cursor in it, while EchoCode is still answering. Speech loses a letter more often than not, so "global.css" finds it too. A name that could mean two files opens neither and EchoCode asks which you meant: moving your cursor into the wrong file is worse than not moving it.',
  },
  {
    title: 'It points while it talks',
    body: 'Lines light up in your editor at the moment they are spoken, so you never have to work out which part of your screen the answer means.',
  },
  {
    title: 'It explains, in everyday words',
    body: 'Two to four short sentences, and a technical term is explained the first time it is used — "a null pointer exception, which just means the code reached for something that isn’t there".',
  },
  {
    title: 'The fix is one click away',
    body: 'When the answer proposes a change, the exact code appears as a card. Replace the lines it is about, or insert it at your cursor.',
  },
];

interface Plan {
  name: string;
  tagline: string;
  price: string;
  note: string;
  featured?: boolean;
  featuresTitle?: string;
  features: string[];
}

/**
 * The demo video shown in the hero. Paste a YouTube link (or its id), or drop an
 * .mp4 into `public/` and use its path, such as '/demo.mp4'. While this is empty
 * the animated code mock is shown instead.
 */
const DEMO_VIDEO: string = '';
/** Still frame shown before an .mp4 plays. Ignored for YouTube. */
const DEMO_POSTER = '/demo-poster.png';

const PLANS: Plan[] = [
  {
    name: 'Free',
    tagline: 'Try EchoCode',
    price: '$0',
    note: 'Available now. No card, no API key.',
    features: [
      '10 minutes of voice a month, about 13 questions*',
      'Ask out loud and hear the answer',
      'Answers that look across your project, not just the open file',
      'Ask for any file by name and it opens',
      'Lines light up as they are mentioned',
      'One-click code cards',
    ],
  },
  {
    name: 'Pro',
    tagline: 'For everyday learning and coding',
    price: '$20',
    note: 'Per month, or $192 a year — two months free.',
    featured: true,
    featuresTitle: 'Everything in Free, plus:',
    features: [
      '60 questions a month, about 45 minutes of voice*',
      'Planned: top up when you need more',
      'Planned: a longer warm session, so follow-ups stay instant',
      'Planned: a stronger model behind code cards',
    ],
  },
  {
    name: 'Cohort',
    tagline: 'For bootcamps and training programmes',
    price: '$25',
    note: 'Per learner, once, for a 12-week cohort.',
    featuresTitle: 'Everything in Free, for every learner:',
    features: [
      'A larger voice allowance, pooled across the whole cohort',
      'No sign-up for learners — one invoice, everyone in',
      'Planned: progress view of where a cohort gets stuck',
      'Planned: overage by the minute, never a hard stop',
    ],
  },
  {
    name: 'Campus',
    tagline: 'For university departments',
    price: '$36',
    note: 'Per seat, per academic year.',
    featuresTitle: 'Everything in Free, for every student:',
    features: [
      'A larger voice allowance, pooled across the department',
      'Priced per enrolled seat, billed once a year',
      'Planned: instructor view of the concepts a class keeps missing',
      'Planned: shared allowance across courses',
    ],
  },
];

const ASSEMBLYAI = [
  {
    title: 'Voice Agent API',
    body: 'One streaming session hears the question, reasons over your code and speaks the answer. Coding words — HashSet, generics, null pointer — are sent as key terms so they are recognised, and turn detection works out when you have finished talking.',
  },
  {
    title: 'Word-level timing',
    body: 'Each word of the answer comes back with its position in the spoken audio. That is what lets the right line light up at the moment it is said, instead of everything highlighting at once when the answer ends.',
  },
  {
    title: 'LLM Gateway',
    body: 'A second, separate call writes the code behind a suggested fix as JSON. It starts while the spoken answer is still playing, so building a code card never slows the conversation down.',
  },
  {
    title: 'Single-use session tokens',
    body: 'The AssemblyAI key lives only on our Vercel backend, which mints a short-lived token for each conversation. Audio then streams straight from your editor to AssemblyAI, with no server in the middle to slow it down.',
  },
];

const PRIVACY = [
  'Your microphone is off until you hold the key',
  'No AssemblyAI key is shipped inside the extension',
  'node_modules, .git, build output and lock files are never sent',
  'Files git ignores, and files named like a secret (credentials.json, .env, key files), stay on your machine unless it is the file you have open',
  'Your question and your code go to AssemblyAI to be answered. The code-card request passes through our Vercel server on the way there',
  'All we keep is an anonymous install id, the minutes you have used, and request counts per IP address for up to a day, to count your free minutes and limit abuse',
];

const FACTS = [
  { figure: '~1.1s', label: 'from letting go of the key to the first spoken word' },
  { figure: '1 key', label: 'to ask: hold it, speak, let go' },
  { figure: '0', label: 'lines of code to copy and paste' },
];

const NAV = [
  ['#how', 'How it works'],
  ['#features', 'Features'],
  ['#assemblyai', 'AssemblyAI'],
  ['#pricing', 'Pricing'],
];

export default function Home() {
  return (
    <>
      <ScrollReveals />

      <nav className="nav">
        <div className="wrap nav-inner">
          <a className="brand" href="#top">
            <Robot className="brand-mark" />
            EchoCode
          </a>
          <div className="nav-links">
            {NAV.map(([href, label]) => (
              <a key={href} href={href}>
                {label}
              </a>
            ))}
            <a href={REPO_URL}>GitHub</a>
          </div>
          <a className="button nav-cta" href={DOWNLOAD_URL}>
            Add to VS Code
          </a>
        </div>
      </nav>

      <main id="top">
        <header className="hero">
          <div className="wrap hero-grid">
            <div>
              <p className="eyebrow">
                <span className="pip" /> Powered by AssemblyAI
              </p>
              <h1>
                Stop typing prompts. <span>Just ask.</span>
              </h1>
              <p className="lede">
                Hold one key in VS Code and ask out loud. EchoCode answers in plain language, opens the file the answer
                is about — <em>even one you don&apos;t have open</em> — and lights up each line as it says it.
              </p>
              <div className="actions">
                <a className="button" href={DOWNLOAD_URL}>
                  Download the extension
                </a>
                <a className="button secondary" href={REPO_URL}>
                  View on GitHub
                </a>
              </div>
              <p className="hotkey">
                Hold <kbd>Ctrl</kbd> + <kbd>Alt</kbd> + <kbd>Space</kbd> and speak — on macOS,{' '}
                <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Space</kbd>. Free, and no API key to set up.
              </p>
            </div>

            {DEMO_VIDEO ? <HeroVideo src={DEMO_VIDEO} poster={DEMO_POSTER} /> : <HeroDemo />}
          </div>
        </header>

        <section className="band stats-band">
          <div className="wrap facts" data-reveal>
            {FACTS.map((fact) => (
              <div className="fact" key={fact.figure}>
                <strong>{fact.figure}</strong>
                <span>{fact.label}</span>
              </div>
            ))}
          </div>
        </section>

        <section>
          <div className="wrap" data-reveal>
            <h2>The problem</h2>
            <p className="section-lede">
              AI made developers faster, but asking a question still costs you your flow: stop, type a careful prompt,
              paste in the code and the error, then work out which part of your screen the answer is talking about. It
              is enough friction that people skip the question and paste in a fix they don&apos;t understand. We call it
              vibe-coding fatigue. EchoCode makes asking as easy as turning to the person next to you.
            </p>
          </div>
        </section>

        <section id="how" className="band">
          <div className="wrap" data-reveal>
            <h2>How it works</h2>
            <p className="section-lede">Four steps, and none of them leave your editor.</p>
            <div className="grid">
              {STEPS.map((step, i) => (
                <div className="card" key={step.title} style={{ '--reveal-delay': `${i * 70}ms` } as CSSProperties}>
                  <span className="step-number">{i + 1}</span>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="features">
          <div className="wrap" data-reveal>
            <h2>What makes it different</h2>
            <p className="section-lede">
              Plenty of tools can answer a question about code. The difference here is everything you don&apos;t have to
              do first — and that the answer comes back pointing at your own screen.
            </p>
            <div className="grid three">
              {FEATURES.map((feature, i) => (
                <div className="card" key={feature.title} style={{ '--reveal-delay': `${i * 60}ms` } as CSSProperties}>
                  <h3>{feature.title}</h3>
                  <p>{feature.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="assemblyai" className="band">
          <div className="wrap" data-reveal>
            <h2>Built on AssemblyAI</h2>
            <p className="section-lede">
              One streaming session runs the whole conversation, and your audio goes straight to AssemblyAI — our server
              never sits in the audio path.
            </p>
            <div className="grid">
              {ASSEMBLYAI.map((item, i) => (
                <div className="card" key={item.title} style={{ '--reveal-delay': `${i * 60}ms` } as CSSProperties}>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </div>
              ))}
            </div>
            <div className="privacy">
              <h3>What happens to your code</h3>
              <ul>
                {PRIVACY.map((item) => (
                  <li key={item}>
                    <Check />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section id="pricing">
          <div className="wrap" data-reveal>
            <h2>Pricing</h2>
            <p className="section-lede">
              Free forever for students, with 10 minutes of voice every month. Bootcamps and universities pay for a
              larger allowance for the students they teach.
            </p>
            <div className="pricing">
              {PLANS.map((plan) => (
                <div className={plan.featured ? 'plan featured' : 'plan'} key={plan.name}>
                  <Robot className="plan-icon" waves={plan.featured} />
                  <h3>{plan.name}</h3>
                  <p className="plan-tagline">{plan.tagline}</p>
                  <p className="plan-price">{plan.price}</p>
                  <p className="plan-note">{plan.note}</p>
                  {plan.name === 'Free' ? (
                    <a className="button plan-button" href={DOWNLOAD_URL}>
                      Download the extension
                    </a>
                  ) : (
                    <span className="button secondary plan-button" aria-disabled="true">
                      Coming soon
                    </span>
                  )}
                  <hr />
                  {plan.featuresTitle && <p className="plan-features-title">{plan.featuresTitle}</p>}
                  <ul className="plan-features">
                    {plan.features.map((feature) => (
                      <li key={feature}>
                        <Check />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <p className="pricing-footnote">
              *Minutes count the audio of your questions and EchoCode&apos;s answers; question counts are estimates.
              Only Free is available today. Pro, Cohort and Campus are not on sale yet, and the items marked planned
              are not built.
            </p>
          </div>
        </section>

        <section className="cta-section">
          <div className="wrap" data-reveal>
            <div className="cta">
              <div>
                <h2>Ask your first question out loud</h2>
                <p>Install it, press the key, and ask what that method actually does. It takes about a minute.</p>
              </div>
              <a className="button cta-button" href={DOWNLOAD_URL}>
                Download the extension
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer>
        <div className="wrap footer-grid">
          <div>
            <a className="brand" href="#top">
              <Robot className="brand-mark" />
              EchoCode
            </a>
            <p>The voice-first AI pair programmer for VS Code.</p>
          </div>
          <div>
            <h4>Product</h4>
            <a href="#how">How it works</a>
            <a href="#features">Features</a>
            <a href="#pricing">Pricing</a>
          </div>
          <div>
            <h4>Project</h4>
            <a href={REPO_URL}>Source on GitHub</a>
            <a href={DOWNLOAD_URL}>Latest release</a>
            <a href={`${REPO_URL}/blob/main/extension/CHANGELOG.md`}>Changelog</a>
          </div>
          <div>
            <h4>Built with</h4>
            <a href="https://www.assemblyai.com">AssemblyAI Voice Agent</a>
            <a href="https://www.assemblyai.com">AssemblyAI LLM Gateway</a>
            <span>Next.js on Vercel</span>
          </div>
        </div>
      </footer>
    </>
  );
}
