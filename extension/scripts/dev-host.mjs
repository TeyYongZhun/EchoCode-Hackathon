// `npm run dev`: opens a VS Code window with EchoCode loaded from source and the
// demo folder, after checking the backend is reachable. By default that's the
// deployed backend; with ECHOCODE_BACKEND_URL=http://localhost:3000 (and the
// echocode.backendUrl setting to match), a local backend is started if needed.
// No debugger is involved, so the window can't get stuck waiting for one.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const extensionDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoDir = path.resolve(extensionDir, '..');
const backendUrl = process.env.ECHOCODE_BACKEND_URL ?? 'https://echo-code-hackathon.vercel.app';
const isLocalBackend = /^https?:\/\/(localhost|127\.0\.0\.1)([:/]|$)/.test(backendUrl);
const dryRun = Boolean(process.env.DRY_RUN);
const BACKEND_START_TIMEOUT_MS = 60_000;

/**
 * Runs a command with the terminal attached. `code` and `npm` are .cmd shims on
 * Windows, which Node can only start through a shell. Passing the shell one
 * pre-quoted command line (not an args array) avoids Node's DEP0190 warning.
 */
function run(command, args, options = {}) {
  if (process.platform !== 'win32') return spawn(command, args, { stdio: 'inherit', ...options });
  const line = [command, ...args.map((arg) => `"${arg}"`)].join(' ');
  return spawn(line, { stdio: 'inherit', shell: true, ...options });
}

/** 'up', 'down' (nothing listening) or 'unknown' (slow, or something else answered). */
async function backendStatus() {
  try {
    const response = await fetch(`${backendUrl}/api/health`, { signal: AbortSignal.timeout(5000) });
    const health = await response.json();
    if (health.ok !== true) return 'unknown';
    if (!health.configured) console.warn('! The backend has no ASSEMBLYAI_API_KEY. Add it to backend/.env.local.');
    return 'up';
  } catch (err) {
    return err?.cause?.code === 'ECONNREFUSED' ? 'down' : 'unknown';
  }
}

async function waitForBackend() {
  const deadline = Date.now() + BACKEND_START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if ((await backendStatus()) === 'up') return true;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return false;
}

let backend;
const status = await backendStatus();
if (status === 'up') {
  console.log(`Backend is running at ${backendUrl}.`);
} else if (!isLocalBackend) {
  console.warn(`! Can't reach the backend at ${backendUrl}. Check your internet connection. Questions will fail until it's reachable.`);
} else if (status === 'down' && dryRun) {
  console.log(`Backend is not running; would start it with "npm run dev" in backend/.`);
} else if (status === 'down') {
  console.log('Starting the EchoCode backend ("npm run dev" in backend/)...');
  backend = run('npm', ['run', 'dev'], { cwd: path.join(repoDir, 'backend') });
  backend.on('exit', (code) => {
    console.log(`Backend stopped (exit code ${code}).`);
    process.exit(code ?? 0);
  });
  if (await waitForBackend()) console.log(`Backend is ready at ${backendUrl}.`);
  else console.warn('! The backend did not answer within 60 seconds. Opening VS Code anyway.');
} else {
  console.warn(`! Something at ${backendUrl} didn't answer like the EchoCode backend. Questions may fail.`);
}

const args = [`--extensionDevelopmentPath=${extensionDir}`, path.join(repoDir, 'demo')];
console.log('Opening VS Code with EchoCode loaded...');
if (dryRun) {
  console.log(`  code ${args.map((arg) => `"${arg}"`).join(' ')}`);
} else {
  run('code', args).on('exit', (code) => {
    if (code) console.error(`! "code" exited with code ${code}. Is VS Code's command-line tool on your PATH?`);
    if (backend) console.log('The backend keeps running in this terminal. Press Ctrl+C to stop it.');
    else process.exit(code ?? 0);
  });
}
