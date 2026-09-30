import { execFile } from 'node:child_process';

const TIMEOUT_MS = 5000;

/**
 * Which of `paths` (relative to `cwd`, forward slashes) git ignores there.
 * People put in .gitignore exactly what shouldn't be shared, so those files
 * are kept out of the project context too.
 *
 * Resolves to an empty list when the folder isn't a git repository or git
 * isn't installed: then there is nothing to go on, and the name check in
 * project.ts is what keeps secrets back.
 */
export function gitIgnored(cwd: string, paths: string[]): Promise<string[]> {
  if (paths.length === 0) return Promise.resolve([]);
  return new Promise((resolve) => {
    const child = execFile(
      'git',
      ['check-ignore', '-z', '--stdin'],
      { cwd, timeout: TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024, windowsHide: true },
      (err, stdout) => {
        // Exit 0 lists the ignored paths; 1 means none are. Anything else (not a repository, no git) tells us nothing.
        const exit = err ? (err as { code?: unknown }).code : 0;
        resolve(exit === 0 || exit === 1 ? stdout.split('\0').filter(Boolean) : []);
      },
    );
    child.stdin?.on('error', () => {
      // git exited before reading its input (it isn't a repository); the callback above handles it.
    });
    child.stdin?.end(paths.join('\0'));
  });
}
