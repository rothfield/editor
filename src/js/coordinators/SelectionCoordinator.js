/**
 * SelectionCoordinator - Manages all selection-related operations
 *
 * Responsibilities:
 * - Selection querying (from WASM)
 * - Selection visual rendering
 * - Selection text extraction
 * - Selection manipulation (clear, replace, delete)
 * - Primary selection (X11 select-to-copy)
 *
 * This coordinator delegates to the editor for:
 * - WASM module access
 * - Document querying
 * - Text insertion and deletion operations
 */

import logger, { LOG_CATEGORIES } from '../logger.js';

export default class SelectionCoordinator {
  constructor(editor) {
    this.editor = editor;
  }

  /**
   * Clear current selection
   */
  clearSelection() {
    // Clear selection in WASM (single source of truth)
    if (this.editor.wasmModule) {
      try {
        this.editor.wasmModule.clearSelection();
      } catch (error) {
        console.warn('Failed to clear selection in WASM:', error);
      }
    }

    // Clear visual selection in UI
    this.clearSelectionVisual();
    this.editor.updateDocumentDisplay();
  }

  /**
   * Check if there's an active selection
   * NOW QUERIES WASM AS SOURCE OF TRUTH
   */
  hasSelection() {
    if (!this.editor.wasmModule) return false;

    try {
      const selectionInfo = this.editor.wasmModule.getSelectionInfo();
      // Ensure we return boolean false, not null
      return !!(selectionInfo && !selectionInfo.is_empty);
    } catch (error) {
      console.warn('Failed to get selection info from WASM:', error);
      return false;
    }
  }

  /**
   * Get current selection range
   * NOW QUERIES WASM AS SOURCE OF TRUTH
   */
  getSelection() {
    if (!this.editor.wasmModule) return null;

    try {
      const selectionInfo = this.editor.wasmModule.getSelectionInfo();
      if (!selectionInfo || selectionInfo.is_empty) {
        return null;
      }

      // Return selection info in format expected by existing code
      return {
        anchor: selectionInfo.anchor,
        head: selectionInfo.head,
        start: selectionInfo.start,
        end: selectionInfo.end,
        active: true // Compatibility with old code
      };
    } catch (error) {
      console.warn('Failed to get selection from WASM:', error);
      return null;
    }
  }

  /**
   * Get selected text content
   */
  getSelectedText() {
    const selection = this.getSelection();
    if (!selection) {
      return '';
    }

    if (!this.editor.getDocument() || !this.editor.getDocument()?.lines || this.editor.getDocument()?.lines?.length === 0) {
      return '';
    }

    const line = this.editor.getCurrentLine();
    if (!line) return '';
    const cells = line.cells || [];

    if (cells.length === 0) {
      return '';
    }

    // Extract text from selection range (half-open [start, end), exclusive of end)
    // For single-line selection, filter by column range
    const startCol = Math.min(selection.start.col, selection.end.col);
    const endCol = Math.max(selection.start.col, selection.end.col);

    const selectedCells = cells.filter((cell, index) =>
      index >= startCol && index < endCol
    );

    return selectedCells.map(cell => cell.char || '').join('');
  }

  /**
   * Update visual selection display
   */
  updateSelectionDisplay() {
    // Clear previous selection
    this.clearSelectionVisual();

    const selection = this.getSelection();
    if (!selection) {
      // No selection - update display to show "No selection"
      this.editor.cursorCoordinator.updateCursorPositionDisplay();
      return;
    }

    // Add visual selection for selected range
    this.renderSelectionVisual(selection);

    // Update cursor position display and ephemeral model display
    this.editor.cursorCoordinator.updateCursorPositionDisplay();
    this.editor.updateDocumentDisplay();
  }

  /**
   * Render visual selection highlighting by adding 'selected' class to cells
   * This is a lightweight DOM update, not a full re-render
   */
  renderSelectionVisual(selection) {
    if (!selection || selection.start === undefined || selection.end === undefined) {
      return;
    }

    // Find all notation-line elements and select the current one
    const lineElements = document.querySelectorAll('.notation-line');
    if (lineElements.length === 0) {
      return;
    }

    const currentStave = this.editor.getCurrentStave();
    if (currentStave >= lineElements.length) {
      return;
    }

    const lineElement = lineElements[currentStave];

    // Add 'selected' class to all cells in the selection range (inclusive)
    // Selection range is from start to end (Pos objects with line/col)
    // Extract column values for single-line selection
    const startCol = typeof selection.start === 'object' ? selection.start.col : selection.start;
    const endCol = typeof selection.end === 'object' ? selection.end.col : selection.end;
    const startIdx = Math.min(startCol, endCol);
    const endIdx = Math.max(startCol, endCol);

    for (let i = startIdx; i < endIdx; i++) {
      const cellElement = lineElement.querySelector(`[data-cell-index="${i}"]`);
      if (cellElement) {
        cellElement.classList.add('selected');
      }
    }
  }

  /**
   * Clear visual selection by removing 'selected' class from all cells
   * This is a lightweight DOM update, not a full re-render
   */
  clearSelectionVisual() {
    if (!this.editor.renderer || !this.editor.renderer.element) {
      return;
    }

    // Remove 'selected' class from all cells (querySelectorAll all elements with the selected class that have data-cell-index)
    const selectedCells = this.editor.renderer.element.querySelectorAll('[data-cell-index].selected');
    selectedCells.forEach(cell => {
      cell.classList.remove('selected');
    });
  }

  /**
   * Replace selected text with new text
   */
  async replaceSelectedText(newText) {
    const selection = this.getSelection();
    if (!selection) {
      return await this.editor.insertText(newText);
    }

    try {
      // Delete selected range
      await this.editor.deleteRange(selection.start, selection.end);
      // Note: deleteRange already sets cursor position, no need to set again

      // Insert new text at cursor (which is already at selection.start after deletion)
      await this.editor.insertText(newText);

      // Clear selection
      this.clearSelection();
    } catch (error) {
      console.error('Failed to replace selected text:', error);
      this.editor.showError('Failed to replace selection');
    }
  }

  /**
   * Delete selected content
   */
  async deleteSelection() {
    logger.info(LOG_CATEGORIES.EDITOR, 'deleteSelection called');
    const selection = this.getSelection();
    logger.info(LOG_CATEGORIES.EDITOR, 'deleteSelection got selection', selection);
    if (!selection) {
      logger.warn(LOG_CATEGORIES.EDITOR, 'deleteSelection: No selection, returning early');
      return;
    }

    try {
      logger.info(LOG_CATEGORIES.EDITOR, 'deleteSelection calling deleteRange', {
        start: selection.start,
        end: selection.end
      });
      await this.editor.deleteRange(selection.start, selection.end);
      // Note: deleteRange already sets cursor position from WASM result, no need to set again
      this.clearSelection();
    } catch (error) {
      logger.error(LOG_CATEGORIES.EDITOR, 'Failed to delete selection', error);
      this.editor.showError('Failed to delete selection');
    }
  }

  /**
   * Update primary selection register (X11 select-to-copy behavior)
   * Automatically copies selected text to system clipboard
   */
  updatePrimarySelection() {
    if (!this.editor.getDocument() || !this.editor.wasmModule) {
      return;
    }

    // Check if there's a selection
    if (!this.hasSelection()) {
      return; // Keep last selection if selection is cleared
    }

    try {
      // Get selection from WASM
      const selection = this.getSelection();
      if (!selection) {
        return;
      }

      // Get selected cells
      const startRow = selection.start.line;
      const startCol = selection.start.col;
      const endRow = selection.end.line;
      const endCol = selection.end.col;

      // Copy cells (same as Ctrl+C)
      const copyResult = this.editor.wasmModule.copyCells(startRow, startCol, endRow, endCol);

      if (copyResult && copyResult.text && copyResult.cells) {
        // Update JS-side clipboard (same as Ctrl+C does in handleCopy)
        this.editor.clipboard.text = copyResult.text;
        this.editor.clipboard.cells = copyResult.cells || [];

        // Update primary selection in WASM
        this.editor.wasmModule.updatePrimarySelection(startRow, startCol, endRow, endCol, copyResult.cells);

        // Also sync to system clipboard (Linux select-to-copy behavior)
        navigator.clipboard.writeText(copyResult.text).catch(err => {
          // Silently fail - clipboard permission may be restricted
        });
      }
    } catch (error) {
      console.error('Primary selection update failed:', error);
    }
  }
}
