/**
 * The other files in the open folder, sent with each question so EchoCode can
 * answer about code the developer isn't looking at ("which file sets the font?").
 *
 * Measured against the live Voice Agent: a session.update over about 64 KB is
 * rejected with an unhelpful "Internal service error", while everything up to
 * that costs only ~150 ms. So the whole project goes in when it fits, and when
 * it doesn't the most relevant files go in full and the rest are listed by name.
 */

export interface ProjectFile {
  /** Path relative to the workspace root, in the form the agent says out loud. */
  path: string;
  lines: string[];
}

/** Total characters the project block may take. The budget left by the prompt and the open file. */
export const DEFAULT_PROJECT_BUDGET = 40_000;
/** A single file bigger than this is only ever listed: it would crowd out everything else. */
const MAX_FILE_CHARS = 12_000;
/** Long lines (minified code, data blobs) are cut rather than dropped. */
const MAX_LINE_CHARS = 400;

export interface ProjectSelection {
  /** Sent with their contents. */
  full: ProjectFile[];
  /** Sent as a name and a line count only. */
  listed: ProjectFile[];
}

const size = (file: ProjectFile) => file.path.length + file.lines.reduce((n, l) => n + Math.min(l.length, MAX_LINE_CHARS) + 8, 0) + 32;

/**
 * Orders files by how likely they are to matter to someone looking at `openPath`:
 * files it names (a stylesheet in a link tag, an imported module) come first,
 * then its neighbours in the same folder, then the rest by path.
 */
function byRelevance(files: ProjectFile[], openPath: string, openText: string): ProjectFile[] {
  const folder = openPath.slice(0, openPath.lastIndexOf('/') + 1);
  const mentioned = (file: ProjectFile) => {
    const name = file.path.slice(file.path.lastIndexOf('/') + 1);
    return name.length > 2 && openText.includes(name);
  };
  const rank = (file: ProjectFile) => (mentioned(file) ? 0 : file.path.startsWith(folder) ? 1 : 2);
  return [...files].sort((a, b) => rank(a) - rank(b) || a.path.localeCompare(b.path));
}

/** Fits as many whole files into the budget as it can, most relevant first; the rest are listed. */
export function selectProjectFiles(
  files: ProjectFile[],
  openPath: string,
  openText: string,
  budgetChars = DEFAULT_PROJECT_BUDGET,
): ProjectSelection {
  const full: ProjectFile[] = [];
  const listed: ProjectFile[] = [];
  let used = 0;
  for (const file of byRelevance(files, openPath, openText)) {
    const cost = size(file);
    if (cost <= MAX_FILE_CHARS && used + cost <= budgetChars) {
      full.push(file);
      used += cost;
    } else {
      listed.push(file);
    }
  }
  // Names are cheap, but a thousand of them are not.
  return { full, listed: listed.slice(0, 200) };
}

/** The [PROJECT] block for the prompt, or '' when the folder holds nothing else. */
export function formatProject({ full, listed }: ProjectSelection): string {
  if (full.length === 0 && listed.length === 0) return '';
  const out = [
    '[PROJECT] The other files in this folder. Line numbers are 1-based, and each file is numbered from its own line 1.',
    'Say the file name before the line number when you mean code in one of these, for example "line 12 of style.css". That file opens and the lines light up.',
  ];
  for (const file of full) {
    out.push(`\nFile: ${file.path} (${file.lines.length} lines)`);
    const width = String(file.lines.length).length;
    file.lines.forEach((line, i) => {
      const text = line.length > MAX_LINE_CHARS ? `${line.slice(0, MAX_LINE_CHARS)}…` : line;
      out.push(`${String(i + 1).padStart(width)} | ${text}`);
    });
  }
  if (listed.length > 0) {
    out.push(
      full.length > 0
        ? '\nAlso in this folder, contents not shown. Ask them to open one if you need to see it:'
        : '\nFiles in this folder, contents not shown. Ask them to open one if you need to see it:',
    );
    for (const file of listed) out.push(`- ${file.path} (${file.lines.length} lines)`);
  }
  out.push('[END PROJECT]');
  return out.join('\n');
}
