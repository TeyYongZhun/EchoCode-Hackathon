import * as vscode from 'vscode';
import { findDeclarationToReplace, reindent } from '../context/declarations';
import type { EditorTracker, QuestionTarget } from '../context/editorContext';
import type { Suggestion } from '../voice/suggestionClient';
import type { CodeCard } from '../protocol';

const documentLines = (document: vscode.TextDocument) => document.getText().split(/\r?\n/);

interface StoredCard {
  card: CodeCard;
  target: QuestionTarget | undefined;
}

/** Keeps the code cards shown in the panel and carries out Insert at Cursor and Copy. */
export class CodeCards {
  private readonly cards = new Map<string, StoredCard>();
  private nextId = 1;
  private readonly editors: EditorTracker;

  constructor(editors: EditorTracker) {
    this.editors = editors;
  }

  add(turnId: number, suggestion: Suggestion, target: QuestionTarget | undefined): CodeCard {
    const selection = target?.selection;
    const replaceSelection = suggestion.replaceSelection && selection !== undefined;
    // With nothing to replace, a card holding a whole method replaces that method, not the cursor line.
    const declaration =
      !replaceSelection && target
        ? findDeclarationToReplace(documentLines(target.document), suggestion.code, target.cursorLine)
        : undefined;
    const replaced = replaceSelection && selection ? selection : declaration;
    const card: CodeCard = {
      id: `card-${this.nextId++}`,
      turnId,
      title: suggestion.title,
      language: suggestion.language,
      code: suggestion.code,
      replaceSelection,
      replaceLines: replaced ? { start: replaced.startLine + 1, end: replaced.endLine + 1 } : undefined,
    };
    this.cards.set(card.id, { card, target });
    return card;
  }

  async copy(id: string): Promise<void> {
    const stored = this.cards.get(id);
    if (!stored) return;
    await vscode.env.clipboard.writeText(stored.card.code);
    vscode.window.setStatusBarMessage('$(check) EchoCode: code copied', 2500);
  }

  /**
   * Replaces the lines that were selected when the question was asked, or the
   * method the card's code is a new version of; otherwise (or if the selected
   * lines have changed since) inserts at the cursor.
   */
  async insert(id: string): Promise<void> {
    const stored = this.cards.get(id);
    if (!stored) return;
    const { card, target } = stored;
    const document = target && !target.document.isClosed ? target.document : this.editors.editor?.document;
    if (!document) {
      void vscode.window.showWarningMessage('EchoCode: open the file you want to insert the code into.');
      return;
    }
    const visible = vscode.window.visibleTextEditors.find((e) => e.document === document);
    const editor = await vscode.window.showTextDocument(document, { viewColumn: visible?.viewColumn });

    let range: vscode.Range | undefined;
    let text = card.code;
    const selection = target?.selection;
    if (card.replaceSelection && selection && selection.endLine < document.lineCount) {
      const lines = new vscode.Range(selection.startLine, 0, selection.endLine, document.lineAt(selection.endLine).text.length);
      if (document.getText(lines) === selection.text) range = lines;
      else void vscode.window.showInformationMessage('EchoCode: those lines have changed, so the code was inserted at the cursor instead.');
    }
    if (!range && !card.replaceSelection) {
      // Looked up again now, since the file may have changed since the card was made.
      const declaration = findDeclarationToReplace(documentLines(document), card.code, editor.selection.active.line);
      if (declaration) {
        range = new vscode.Range(declaration.startLine, 0, declaration.endLine, document.lineAt(declaration.endLine).text.length);
        text = reindent(card.code, /^\s*/.exec(document.lineAt(declaration.startLine).text)![0]);
      }
    }
    if (!range) {
      const cursor = editor.selection.active;
      const line = document.lineAt(cursor.line);
      if (line.isEmptyOrWhitespace) {
        range = line.range;
      } else {
        // Put the snippet on its own line below the cursor.
        range = new vscode.Range(line.range.end, line.range.end);
        text = `\n${text}`;
      }
    }

    const start = range.start;
    const applied = await editor.edit((edit) => edit.replace(range, text));
    if (!applied) {
      void vscode.window.showErrorMessage('EchoCode: VS Code refused the edit.');
      return;
    }
    const lines = text.split(/\r?\n/);
    const endLine = start.line + lines.length - 1;
    const endChar = lines.length === 1 ? start.character + lines[0].length : lines[lines.length - 1].length;
    const inserted = new vscode.Selection(start, new vscode.Position(endLine, endChar));
    editor.selection = inserted;
    editor.revealRange(inserted, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  }
}
