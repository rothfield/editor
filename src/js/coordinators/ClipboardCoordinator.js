/**
 * ClipboardCoordinator - Manages all clipboard-related operations
 *
 * Responsibilities:
 * - Copy operations (Ctrl+C)
 * - Cut operations (Ctrl+X)
 * - Paste operations (Ctrl+V)
 * - Middle-click paste (X11 primary selection)
 * - Clipboard storage management
 *
 * This coordinator delegates to the editor for:
 * - WASM module access
 * - Document querying
 * - Selection operations (via SelectionCoordinator)
 * - Cursor operations (via CursorCoordinator)
 */

export default class ClipboardCoordinator {
  constructor(editor) {
    this.editor = editor;
  }

  /**
   * Handle Ctrl+C (Copy) - copy selection to clipboard
   */
  handleCopy() {
    if (!this.editor.getDocument() || !this.editor.wasmModule) {
      console.warn('Cannot copy: document or WASM not ready');
      return;
    }

    // Check if there's a selection (now queries WASM)
    if (!this.editor.selectionCoordinator.hasSelection()) {
      console.warn('No selection to copy');
      return;
    }

    try {
      // Get selection from WASM (single source of truth)
      const selection = this.editor.selectionCoordinator.getSelection();
      if (!selection) {
        console.warn('Selection disappeared before copy');
        return;
      }

      // Selection has start/end as {line, col} objects
      const startRow = selection.start.line;
      const startCol = selection.start.col;
      const endRow = selection.end.line;
      const endCol = selection.end.col;

      // Call WASM to copy cells (preserves octaves/slurs/ornaments)
      const copyResult = this.editor.wasmModule.copyCells(startRow, startCol, endRow, endCol);

      if (copyResult && copyResult.text) {
        // Store in clipboard (both text for system clipboard, cells for rich paste)
        this.editor.clipboard.text = copyResult.text;
        this.editor.clipboard.cells = copyResult.cells || [];

        // Also copy to system clipboard
        navigator.clipboard.writeText(copyResult.text).catch(err => {
          console.warn('Failed to copy to system clipboard:', err);
        });

        // Sync primary selection register with Ctrl+C (keeps both in sync)
        try {
          this.editor.wasmModule.updatePrimarySelection(startRow, startCol, endRow, endCol, copyResult.cells);
        } catch (e) {
          console.warn('Failed to update primary selection:', e);
        }

        this.editor.addToConsoleLog(`Copied ${copyResult.cells?.length || 0} cells`);
      }
    } catch (error) {
      console.error('Copy failed:', error);
      this.editor.showError('Copy failed', { details: error.message });
    }
  }

  /**
   * Handle Ctrl+X (Cut) - copy and delete selection
   */
  handleCut() {
    if (!this.editor.getDocument()) {
      console.warn('Cannot cut: document not ready');
      return;
    }

    // First copy
    this.handleCopy();

    // Then delete the selection (if it still exists after copy)
    if (this.editor.selectionCoordinator.hasSelection()) {
      // Delete the selected range
      this.editor.selectionCoordinator.deleteSelection();
    }

    this.editor.addToConsoleLog('Cut completed');
  }

  /**
   * Handle Ctrl+V (Paste) - paste from clipboard with rich format
   */
  async handlePaste() {
    if (!this.editor.getDocument() || !this.editor.wasmModule) {
      console.warn('Cannot paste: document or WASM not ready');
      return;
    }

    try {
      const cursor = this.editor.cursorCoordinator.getCursorPos();
      const startStave = cursor.line;
      const startColumn = cursor.col;

      // For now, simple paste at cursor (single cell)
      const cellsToPaste = this.editor.clipboard.cells || [];

      if (cellsToPaste.length === 0) {
        console.warn('Nothing to paste (clipboard empty)');
        return;
      }

      // Use WASM pasteCells for proper document mutation
      const line = this.editor.getCurrentLine();
      if (!line || !line.cells) {
        console.warn('No current line to paste into');
        return;
      }

      // Call WASM pasteCells (handles document mutation, undo tracking)
      const result = this.editor.wasmModule.pasteCells(
        startStave,      // start_row
        startColumn,     // start_col
        startStave,      // end_row (same row for simple paste)
        startColumn,     // end_col (same column, no selection to replace)
        cellsToPaste     // cells to paste
      );

      // Update document from WASM result
      if (result && result.dirty_lines) {
        for (const dirtyLine of result.dirty_lines) {
          if (dirtyLine.row < this.editor.getDocument()?.lines?.length) {
            // WASM owns document - no need to apply dirty lines;
          }
        }
      }

      // Update cursor position from WASM result
      if (result && typeof result.new_cursor_col !== 'undefined') {
        this.editor.cursorCoordinator.setCursorPosition(result.new_cursor_col);
      } else {
        // Fallback: position after pasted content
        this.editor.cursorCoordinator.setCursorPosition(startColumn + cellsToPaste.length);
      }

      // Clear selection
      this.editor.selectionCoordinator.clearSelection();

      this.editor.addToConsoleLog(`Pasted ${cellsToPaste.length} cells`);
      await this.editor.render();

      // Show cursor after paste operation
      this.editor.showCursor();
    } catch (error) {
      console.error('Paste failed:', error);
      this.editor.showError('Paste failed', { details: error.message });
    }
  }

  /**
   * Handle middle-click paste (X11 style primary selection)
   * Pastes from the primary selection register at the clicked position
   */
  async handleMiddleClick(event) {
    if (!this.editor.getDocument() || !this.editor.wasmModule) {
      console.warn('Cannot middle-click paste: document or WASM not ready');
      return;
    }

    event.preventDefault(); // Prevent default scroll paste behavior

    try {
      // Try to get primary selection (X11 style - from previous selection)
      const primarySelection = this.editor.wasmModule.getPrimarySelection();

      // Fall back to system clipboard if no primary selection
      let cellsToPaste = [];
      let pasteSource = 'unknown';

      if (primarySelection && primarySelection.cells && primarySelection.cells.length > 0) {
        cellsToPaste = primarySelection.cells;
        pasteSource = 'primary selection';
      } else if (this.editor.clipboard.cells && this.editor.clipboard.cells.length > 0) {
        cellsToPaste = this.editor.clipboard.cells;
        pasteSource = 'system clipboard';
      } else {
        console.warn('Nothing to paste (no primary selection or clipboard content)');
        return;
      }

      // Calculate position from mouse click
      const rect = this.editor.element.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      // Determine which line was clicked
      const lineIndex = this.editor.mouseHandler?.calculateLineFromY(y);
      const col = this.editor.mouseHandler?.calculateCellPosition(x, y);

      if (lineIndex === null || col === null) {
        console.warn('Could not determine paste position from click');
        return;
      }

      // Get cursor position
      const startRow = Math.floor(lineIndex);
      const startCol = Math.floor(col);

      // For middle-click paste, we paste at the clicked position
      // The end position is the same as start (no selection deleted)
      const endRow = startRow;
      const endCol = startCol;

      // Call WASM to paste cells (handles document mutation, undo tracking)
      const result = this.editor.wasmModule.pasteCells(startRow, startCol, endRow, endCol, cellsToPaste);

      // Update document from WASM result
      if (result && result.dirty_lines) {
        for (const dirtyLine of result.dirty_lines) {
          if (dirtyLine.row < this.editor.getDocument()?.lines?.length) {
            // WASM owns document - no need to apply dirty lines;
          }
        }
      }

      // Update cursor position from WASM result
      if (result && typeof result.new_cursor_col !== 'undefined') {
        this.editor.cursorCoordinator.setCursorPosition(result.new_cursor_col);
      } else {
        // Fallback: position after pasted content
        this.editor.cursorCoordinator.setCursorPosition(startCol + cellsToPaste.length);
      }

      // Clear selection
      this.editor.selectionCoordinator.clearSelection();

      this.editor.addToConsoleLog(`Pasted ${cellsToPaste.length} cells from ${pasteSource}`);
      await this.editor.render();
    } catch (error) {
      console.error('Middle-click paste failed:', error);
      this.editor.showError('Paste failed', { details: error.message });
    }
  }
}
