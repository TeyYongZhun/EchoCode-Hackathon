import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');
const production = process.argv.includes('--production');

const common = {
  bundle: true,
  sourcemap: !production,
  minify: production,
  logLevel: 'info',
};

/** @type {import('esbuild').BuildOptions[]} */
const builds = [
  {
    // Extension host code plus the microphone worker thread.
    ...common,
    // The worker must sit next to extension.js; MicRecorder loads it from __dirname.
    entryPoints: { extension: 'src/extension.ts', micWorker: 'src/audio/micWorker.ts' },
    outdir: 'dist',
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    // PvRecorder ships native binaries, so it's loaded from node_modules at runtime.
    external: ['vscode', '@picovoice/pvrecorder-node', 'bufferutil', 'utf-8-validate'],
  },
  {
    // The assistant panel's webview UI.
    ...common,
    entryPoints: ['webview/main.ts', 'webview/main.css'],
    outdir: 'dist/webview',
    platform: 'browser',
    format: 'iife',
    target: 'es2022',
  },
];

if (watch) {
  for (const options of builds) {
    const context = await esbuild.context(options);
    await context.watch();
  }
} else {
  await Promise.all(builds.map((options) => esbuild.build(options)));
}
