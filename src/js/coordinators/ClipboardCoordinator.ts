/**
 * ClipboardCoordinator - Manages all clipboard-related operations
 *
 * Responsibilities:
 * - Cut operations (Ctrl+X)
 * - Paste operations (Ctrl+V) - reads system clipboard text, calls WASM pasteText()
 * - Copy as Markup (Edit menu) - exports selection as ASCII or PUA markup
 * - Middle-click paste (X11 primary selection)
 *
 * Note: Ctrl+C uses native browser copy on textarea PUA content.
 * "Copy as Markup" menu items are for well-formed markup with octave context.
 */

import type { WASMModule } from '../../types/wasm-module.js';
import type { Document, DocumentLine, Cell } from '../../types/wasm.js';

// Simple position type (avoid WASM class complexities)
interface Pos {
  line: number;
  col: number;
}

interface CursorCoordinator {
  getCursorPos(): Pos;
  setCursorPosition(col: number): void;
}

interface SelectionCoordinator {
  hasSelection(): boolean;
  getSelection(): { start: Pos; end: Pos } | null;
  deleteSelection(): Promise<void>;
  clearSelection(): void;
}

interface MouseHandler {
  calculateLineFromY(y: number): number | null;
  calculateCellPosition(x: number, y: number): number | null;
}

interface EditorInstance {
  wasmModule: WASMModule;
  element: HTMLElement;
  cursorCoordinator: CursorCoordinator;
  selectionCoordinator: SelectionCoordinator;
  mouseHandler: MouseHandler | null;
  getDocument(): Document | null;
  getCurrentLine(): DocumentLine | null;
  addToConsoleLog(message: string): void;
  render(): Promise<void>;
  showCursor(): void;
  showError(message: string, options?: { details?: string }): void;
}

export default class ClipboardCoordinator {
  private editor: EditorInstance;

  constructor(editor: EditorInstance) {
    this.editor = editor;
  }

  /**
   * Handle Ctrl+C (Copy) - native browser copy handles this now
   * This method is kept for backwards compatibility but is mostly a no-op
   */
  handleCopy(): void {
    // Native browser copy works on textarea PUA content
    // This is called from editor.ts but we don't need to do anything special
    if (this.editor.selectionCoordinator.hasSelection()) {
      this.editor.addToConsoleLog('Copy (native)');
    }
  }

  /**
   * Handle Ctrl+X (Cut) - delete selection after native copy
   */
  handleCut(): void {
    if (!this.editor.getDocument()) {
      console.warn('Cannot cut: document not ready');
      return;
    }

    // Native copy should have already happened via browser event
    // We just need to delete the selection
    if (this.editor.selectionCoordinator.hasSelection()) {
      this.editor.selectionCoordinator.deleteSelection();
      this.editor.addToConsoleLog('Cut completed');
    }
  }

  /**
   * Handle Ctrl+V (Paste) - read system clipboard text, parse and insert
   */
  async handlePaste(): Promise<void> {
    if (!this.editor.getDocument() || !this.editor.wasmModule) {
      console.warn('Cannot paste: document or WASM not ready');
      return;
    }

    try {
      // Read text from system clipboard
      const text = await navigator.clipboard.readText();

      if (!text || text.length === 0) {
        console.warn('Nothing to paste (clipboard empty)');
        return;
      }

      const cursor = this.editor.cursorCoordinator.getCursorPos();
      const row = cursor.line;
      const col = cursor.col;

      // If there's a selection, delete it first
      if (this.editor.selectionCoordinator.hasSelection()) {
        await this.editor.selectionCoordinator.deleteSelection();
      }

      // Call WASM pasteText to parse and insert the text
      const result = this.editor.wasmModule.pasteText(row, col, text);

      // Update cursor position from WASM result
      if (result && typeof result.new_cursor_col !== 'undefined') {
        this.editor.cursorCoordinator.setCursorPosition(result.new_cursor_col);
      }

      // Clear selection
      this.editor.selectionCoordinator.clearSelection();

      this.editor.addToConsoleLog(`Pasted ${text.length} characters`);
      await this.editor.render();

      // Show cursor after paste operation
      this.editor.showCursor();
    } catch (error) {
      console.error('Paste failed:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.editor.showError('Paste failed', { details: errorMessage });
    }
  }

  /**
   * Copy selection as ASCII markup to system clipboard
   * Called from Edit menu "Copy as ASCII Markup"
   */
  async copyAsAsciiMarkup(): Promise<void> {
    if (!this.editor.getDocument() || !this.editor.wasmModule) {
      console.warn('Cannot copy: document or WASM not ready');
      return;
    }

    const selection = this.editor.selectionCoordinator.getSelection();
    if (!selection) {
      console.warn('No selection to copy');
      return;
    }

    try {
      const markup = this.editor.wasmModule.exportSelectionAsAsciiMarkup(
        selection.start.line,
        selection.start.col,
        selection.end.line,
        selection.end.col
      );

      await navigator.clipboard.writeText(markup);
      this.editor.addToConsoleLog(`Copied as ASCII markup (${markup.length} chars)`);
    } catch (error) {
      console.error('Copy as ASCII markup failed:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.editor.showError('Copy failed', { details: errorMessage });
    }
  }

  /**
   * Copy selection as PUA markup to system clipboard
   * Called from Edit menu "Copy as PUA Markup"
   */
  async copyAsPuaMarkup(): Promise<void> {
    if (!this.editor.getDocument() || !this.editor.wasmModule) {
      console.warn('Cannot copy: document or WASM not ready');
      return;
    }

    const selection = this.editor.selectionCoordinator.getSelection();
    if (!selection) {
      console.warn('No selection to copy');
      return;
    }

    try {
      const markup = this.editor.wasmModule.exportSelectionAsPuaMarkup(
        selection.start.line,
        selection.start.col,
        selection.end.line,
        selection.end.col
      );

      await navigator.clipboard.writeText(markup);
      this.editor.addToConsoleLog(`Copied as PUA markup (${markup.length} chars)`);
    } catch (error) {
      console.error('Copy as PUA markup failed:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.editor.showError('Copy failed', { details: errorMessage });
    }
  }

  /**
   * Handle middle-click paste (X11 style primary selection)
   * Pastes from the primary selection register at the clicked position
   */
  async handleMiddleClick(event: MouseEvent): Promise<void> {
    if (!this.editor.getDocument() || !this.editor.wasmModule) {
      console.warn('Cannot middle-click paste: document or WASM not ready');
      return;
    }

    event.preventDefault(); // Prevent default scroll paste behavior

    try {
      // Try to get primary selection (X11 style - from previous selection)
      const primarySelection = this.editor.wasmModule.getPrimarySelection();

      if (!primarySelection || !primarySelection.text || primarySelection.text.length === 0) {
        console.warn('Nothing to paste (no primary selection)');
        return;
      }

      // Calculate position from mouse click
      const rect = this.editor.element.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      // Determine which line was clicked
      const lineIndex = this.editor.mouseHandler?.calculateLineFromY(y);
      const col = this.editor.mouseHandler?.calculateCellPosition(x, y);

      if (lineIndex === null || lineIndex === undefined || col === null || col === undefined) {
        console.warn('Could not determine paste position from click');
        return;
      }

      const row = Math.floor(lineIndex);
      const startCol = Math.floor(col);

      // Call WASM to paste text at the clicked position
      const result = this.editor.wasmModule.pasteText(row, startCol, primarySelection.text);

      // Update cursor position from WASM result
      if (result && typeof result.new_cursor_col !== 'undefined') {
        this.editor.cursorCoordinator.setCursorPosition(result.new_cursor_col);
      }

      // Clear selection
      this.editor.selectionCoordinator.clearSelection();

      this.editor.addToConsoleLog(`Pasted from primary selection`);
      await this.editor.render();
    } catch (error) {
      console.error('Middle-click paste failed:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.editor.showError('Paste failed', { details: errorMessage });
    }
  }
}
