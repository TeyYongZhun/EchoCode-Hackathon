import * as fs from 'node:fs';
import * as vscode from 'vscode';
import { formatProject, selectProjectFiles, type ProjectFile } from './project';

/**
 * Keeps track of the source files in the open folder. Finding them is async, so
 * the list is cached and refreshed in the background; reading their contents is
 * synchronous, because a question captures its context before the microphone
 * starts and must not wait.
 */

const SOURCE_GLOB =
  '**/*.{ts,tsx,js,jsx,mjs,cjs,html,htm,css,scss,sass,less,java,py,c,h,cpp,hpp,cs,go,rb,php,rs,kt,swift,vue,svelte,sql,md,json,yml,yaml}';
const IGNORED =
  '**/{node_modules,.git,dist,out,build,target,bin,obj,.next,.nuxt,.venv,venv,env,__pycache__,coverage,vendor,.vscode-test,.turbo}/**';
/** Lock files and the like are generated, enormous, and never what a question is about. */
const IGNORED_NAMES = /^(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|composer\.lock|Cargo\.lock)$/;
const MAX_FILES = 400;
/** Beyond this a file is generated or data, not something to read out. */
const MAX_FILE_BYTES = 256 * 1024;

export class WorkspaceIndex implements vscode.Disposable {
  private paths: vscode.Uri[] = [];
  private refreshing: Promise<void> | undefined;
  private readonly subscriptions: vscode.Disposable[];
  private readonly log: vscode.LogOutputChannel;

  constructor(log: vscode.LogOutputChannel) {
    this.log = log;
    const onChange = () => void this.refresh();
    this.subscriptions = [
      vscode.workspace.onDidCreateFiles(onChange),
      vscode.workspace.onDidDeleteFiles(onChange),
      vscode.workspace.onDidRenameFiles(onChange),
      vscode.workspace.onDidChangeWorkspaceFolders(onChange),
    ];
    void this.refresh();
  }

  dispose(): void {
    for (const subscription of this.subscriptions) subscription.dispose();
  }

  /** Re-finds the workspace's source files. Concurrent calls share one search. */
  refresh(): Promise<void> {
    this.refreshing ??= this.find().finally(() => {
      this.refreshing = undefined;
    });
    return this.refreshing;
  }

  private async find(): Promise<void> {
    try {
      const found = await vscode.workspace.findFiles(SOURCE_GLOB, IGNORED, MAX_FILES);
      this.paths = found.filter((uri) => !IGNORED_NAMES.test(uri.path.slice(uri.path.lastIndexOf('/') + 1)));
      this.log.info(`Project has ${this.paths.length} source file${this.paths.length === 1 ? '' : 's'}`);
    } catch (err) {
      this.log.warn(`Couldn't list the project's files: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Every source file except `exclude` (the one already in the editor context),
   * with the contents the developer can see right now: an open file's unsaved
   * edits count, so EchoCode answers about the code as it stands.
   */
  filesExcept(exclude: vscode.Uri | undefined): ProjectFile[] {
    const open = new Map(vscode.workspace.textDocuments.map((d) => [d.uri.toString(), d]));
    const files: ProjectFile[] = [];
    for (const uri of this.paths) {
      if (exclude && uri.toString() === exclude.toString()) continue;
      const text = this.read(uri, open.get(uri.toString()));
      if (text === undefined) continue;
      files.push({ path: relativePath(uri), lines: text.split(/\r?\n/) });
    }
    return files;
  }

  /** The file at a workspace-relative path, as the agent names it in an answer. */
  uriFor(path: string): vscode.Uri | undefined {
    return this.paths.find((uri) => relativePath(uri) === path);
  }

  /** Every known file's workspace-relative path, for matching names heard in an answer. */
  knownPaths(): string[] {
    return this.paths.map(relativePath);
  }

  private read(uri: vscode.Uri, document: vscode.TextDocument | undefined): string | undefined {
    if (document) return document.getText();
    if (uri.scheme !== 'file') return undefined;
    try {
      if (fs.statSync(uri.fsPath).size > MAX_FILE_BYTES) return undefined;
      return fs.readFileSync(uri.fsPath, 'utf8');
    } catch {
      // Deleted or unreadable since the search: leave it out rather than fail the question.
      return undefined;
    }
  }
}

/** The workspace-relative path, always with forward slashes so it reads the same everywhere. */
export function relativePath(uri: vscode.Uri): string {
  return vscode.workspace.asRelativePath(uri, false).replace(/\\/g, '/');
}

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  ts: 'typescript', tsx: 'typescriptreact', js: 'javascript', jsx: 'javascriptreact', mjs: 'javascript',
  cjs: 'javascript', html: 'html', htm: 'html', css: 'css', scss: 'scss', sass: 'sass', less: 'less',
  java: 'java', py: 'python', c: 'c', h: 'c', cpp: 'cpp', hpp: 'cpp', cs: 'csharp', go: 'go', rb: 'ruby',
  php: 'php', rs: 'rust', kt: 'kotlin', swift: 'swift', vue: 'vue', svelte: 'svelte', sql: 'sql',
  md: 'markdown', json: 'json', yml: 'yaml', yaml: 'yaml',
};

/** The language of a file EchoCode names but the developer may not have open, for the code card's prompt. */
export function languageOf(uri: vscode.Uri): string {
  const open = vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri.toString());
  if (open) return open.languageId;
  const name = uri.path.slice(uri.path.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  return (dot > 0 && LANGUAGE_BY_EXTENSION[name.slice(dot + 1).toLowerCase()]) || 'plaintext';
}

/** The [PROJECT] block for a question, or '' when there's nothing else to show. */
export function captureProject(
  index: WorkspaceIndex,
  editor: vscode.TextEditor | undefined,
  budgetChars: number,
): string {
  if (budgetChars <= 0) return '';
  const files = index.filesExcept(editor?.document.uri);
  if (files.length === 0) return '';
  const openPath = editor ? relativePath(editor.document.uri) : '';
  const openText = editor?.document.getText() ?? '';
  return formatProject(selectProjectFiles(files, openPath, openText, budgetChars));
}
