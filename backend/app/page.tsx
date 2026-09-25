const REPO_URL = 'https://github.com/TeyYongZhun/EchoCode_Hackathon';
const DOWNLOAD_URL = `${REPO_URL}/releases/latest`;

const STEPS = [
  {
    title: 'Point',
    body: 'Select the code that confuses you: a method, a loop, a generic type.',
  },
  {
    title: 'Ask out loud',
    body: 'Hold Ctrl+Alt+Space and ask your question the way you would ask a colleague. Let go to send.',
  },
  {
    title: 'Listen and look',
    body: 'A Senior Staff Engineer voice answers in about a second, while the lines it mentions light up in your editor.',
  },
  {
    title: 'Apply',
    body: 'When it suggests a fix, the exact code appears as a card. One click replaces the lines you selected.',
  },
];

const FEATURES = [
  {
    title: 'A real conversation, not a chatbot wrapper',
    body: "AssemblyAI's Voice Agent hears you, reasons over your code and answers in one streaming session, with coding terms boosted and interruptions handled like a colleague would.",
  },
  {
    title: 'Context without copy-paste',
    body: 'The open file, your cursor, your selection and nearby compiler errors travel with every question automatically.',
  },
  {
    title: 'It points at the code',
    body: 'Lines are highlighted as they are spoken, so you never have to map an answer back onto your screen.',
  },
  {
    title: 'Built for learning',
    body: 'Short spoken explanations of the why (complexity, data structures, trade-offs), ending with a question that checks your understanding.',
  },
];

function Robot() {
  return (
    <svg className="mock-robot" viewBox="0 0 64 64" aria-hidden="true">
      <line x1="32" y1="7" x2="32" y2="14" />
      <circle className="solid" cx="32" cy="5" r="2.6" />
      <rect x="6.5" y="25" width="4.5" height="12" rx="2.2" />
      <rect x="53" y="25" width="4.5" height="12" rx="2.2" />
      <rect x="12" y="14" width="40" height="33" rx="10" />
      <rect x="17.5" y="21.5" width="29" height="14" rx="7" strokeWidth="1.4" />
      <circle className="solid" cx="26" cy="28.5" r="3" />
      <circle className="solid" cx="38" cy="28.5" r="3" />
      <rect className="solid" x="26" y="39" width="12" height="4" rx="1.5" />
      <line x1="25" y1="52" x2="39" y2="52" />
    </svg>
  );
}

const CODE: [number, string, boolean][] = [
  [9, 'static List<Integer> findDuplicates(List<Integer> ids) {', false],
  [10, '    List<Integer> seen = new ArrayList<>();', false],
  [11, '    List<Integer> duplicates = new ArrayList<>();', false],
  [12, '    for (Integer id : ids) {', false],
  [13, '        if (seen.contains(id)) {', true],
  [14, '            if (!duplicates.contains(id)) {', true],
  [15, '                duplicates.add(id);', false],
];

export default function Home() {
  return (
    <main>
      <header className="hero">
        <div className="wrap hero-grid">
          <div>
            <p className="eyebrow">Voice-first AI pair programmer for VS Code</p>
            <h1>
              Stop typing prompts. <span>Just ask.</span>
            </h1>
            <p className="lede">
              Highlight confusing code, press a key and ask out loud. EchoCode reads the file you&apos;re looking at and
              talks you through the logic, the architecture and the bug, like a senior engineer sitting next to you.
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
              Hold <kbd>Ctrl</kbd> + <kbd>Alt</kbd> + <kbd>Space</kbd> and speak. Powered by AssemblyAI.
            </p>
          </div>

          <div className="mock" aria-label="EchoCode answering a question inside VS Code">
            <pre className="mock-code">
              {CODE.map(([line, text, highlighted]) => (
                <span key={line} className={highlighted ? 'hl' : undefined}>
                  <span className="ln">{String(line).padStart(2)}</span>
                  {text}
                </span>
              ))}
            </pre>
            <div className="mock-stage">
              <Robot />
              <div className="mock-bubble">
                <b>EchoCode</b> On lines thirteen and fourteen, contains scans the whole list for every student, so this
                is quadratic.
                <small>SPEAKING · ⚡ 812 ms · Code ready ↑</small>
              </div>
            </div>
          </div>
        </div>
      </header>

      <section>
        <div className="wrap">
          <h2>The problem: text-based context switching</h2>
          <p className="section-lede">
            AI assistants made developers faster, but asking them still means breaking your flow to type long prompts,
            pasting code and error logs into a chat window, and mapping the answer back onto your screen. So people
            paste solutions they don&apos;t understand. We call it vibe-coding fatigue. EchoCode makes asking for an
            explanation as easy as turning to a colleague.
          </p>
        </div>
      </section>

      <section>
        <div className="wrap">
          <h2>How it works</h2>
          <p className="section-lede">No screen sharing, no video, no copy-paste. Four steps, all without leaving the editor.</p>
          <div className="grid">
            {STEPS.map((step, i) => (
              <div className="card" key={step.title}>
                <span className="step-number">{i + 1}</span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section>
        <div className="wrap">
          <h2>Why it&apos;s different</h2>
          <p className="section-lede">Designed around the way people actually explain code to each other.</p>
          <div className="grid">
            {FEATURES.map((feature) => (
              <div className="card" key={feature.title}>
                <h3>{feature.title}</h3>
                <p>{feature.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section>
        <div className="wrap">
          <h2>Architecture</h2>
          <p className="section-lede">
            The AssemblyAI key never leaves this server. It mints single-use session tokens, and your voice streams
            straight to AssemblyAI&apos;s Voice Agent, with no proxy hop in the audio path.
          </p>
          <pre className="diagram">{`VS Code extension ── mic (24 kHz) + editor context ──wss──► AssemblyAI Voice Agent API
      │                                                        │
      │  POST /api/token   (once per session)                  └─► spoken answer + word-timed transcript
      │  POST /api/suggest (after an answer, for code cards)
      ▼
Vercel · Next.js ── ASSEMBLYAI_API_KEY ──► single-use tokens · LLM Gateway code cards · usage metering`}</pre>
          <div className="facts">
            <div className="fact">
              <strong>Live</strong>
              <span>subtitles and line highlights, timed word by word to the voice</span>
            </div>
            <div className="fact">
              <strong>0</strong>
              <span>API keys shipped in the extension</span>
            </div>
            <div className="fact">
              <strong>1 key</strong>
              <span>to ask: hold, speak, release</span>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="wrap">
          <h2>Pricing</h2>
          <p className="section-lede">
            Built first for computer science students and junior developers. That&apos;s 5–7 million of VS Code&apos;s
            30 million users.
          </p>
          <div className="pricing">
            <div className="plan">
              <h3>Free</h3>
              <p className="price">
                $0 <small>/ month</small>
              </p>
              <ul>
                <li>30 minutes of voice pair programming a month</li>
                <li>Line highlights and code cards</li>
              </ul>
            </div>
            <div className="plan featured">
              <h3>Pro</h3>
              <p className="price">
                $10 <small>/ month</small>
              </p>
              <ul>
                <li>Unlimited voice sessions</li>
                <li>Larger codebase context</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <footer>
        <div className="wrap">
          EchoCode, built for the hackathon. <a href={REPO_URL}>Source on GitHub</a>.
        </div>
      </footer>
    </main>
  );
}
