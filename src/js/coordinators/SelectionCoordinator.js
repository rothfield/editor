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
        logger.warn(LOG_CATEGORIES.WASM, 'Failed to clear selection in WASM', { error });
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
      logger.warn(LOG_CATEGORIES.WASM, 'Failed to get selection info from WASM', { error });
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
      logger.warn(LOG_CATEGORIES.WASM, 'Failed to get selection from WASM', { error });
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
      logger.error(LOG_CATEGORIES.EDITOR, 'Failed to replace selected text', { error });
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
      logger.error(LOG_CATEGORIES.EDITOR, 'Primary selection update failed', { error });
    }
  }

  /**
   * Get visually selected cells from DOM
   */
  getVisuallySelectedCells() {
    const selectedCells = this.editor.element.querySelectorAll('.char-cell.selected');
    if (selectedCells.length === 0) {
      return null;
    }

    // Extract cell indices from data-cell-index attributes
    const indices = Array.from(selectedCells)
      .map(cell => parseInt(cell.dataset.cellIndex))
      .filter(idx => !isNaN(idx))
      .sort((a, b) => a - b);

    if (indices.length === 0) {
      return null;
    }

    return {
      start: Math.min(...indices),
      end: Math.max(...indices) + 1 // Half-open range
    };
  }

  /**
   * Get effective selection: either user selection or single element to left of cursor
   * Returns {start, end} or null if no valid selection available
   * Priority: 1) Visual DOM selection, 2) WASM selection, 3) Cursor position
   */
  getEffectiveSelection() {
    // FIRST: Check for visually highlighted cells in DOM
    const visualSelection = this.getVisuallySelectedCells();
    if (visualSelection) {
      return visualSelection;
    }

    // SECOND: If there's a user selection in WASM, use it
    if (this.hasSelection()) {
      const sel = this.getSelection();
      // Convert to simple numeric range for single-line selection
      if (sel.start.line === sel.end.line) {
        return {
          start: Math.min(sel.start.col, sel.end.col),
          end: Math.max(sel.start.col, sel.end.col)
        };
      }
      // Multi-line not yet supported
      return null;
    }

    // THIRD: No selection, get cell at cursor position
    const line = this.editor.getCurrentLine();
    if (!line || !line.cells || line.cells.length === 0) {
      return null;
    }

    const cursorPos = this.editor.getCursorPosition();

    // Special case: cursor at position 0 with cells present -> target first cell
    if (cursorPos === 0 && line.cells.length > 0) {
      return {
        start: 0,
        end: 1
      };
    }

    const { cell_index: cellIndex, char_offset_in_cell: charOffsetInCell } = this.editor.charPosToCellIndex(cursorPos);

    // Determine which cell to target
    let targetCellIndex;
    if (charOffsetInCell > 0) {
      // Cursor is in the middle or end of a cell, so target is this cell
      targetCellIndex = cellIndex;
    } else if (cellIndex > 0) {
      // Cursor is at start of cell (not first cell), so target is previous cell
      targetCellIndex = cellIndex - 1;
    } else {
      // No valid cell to target
      return null;
    }

    // Return half-open range [start, end)
    return {
      start: targetCellIndex,
      end: targetCellIndex + 1
    };
  }

  /**
   * Validate selection for musical commands
   */
  validateSelectionForCommands() {
    const selection = this.getEffectiveSelection();
    if (!selection) {
      logger.warn(LOG_CATEGORIES.EDITOR, 'No selection or element to left of cursor');
      return false;
    }

    // Check if selection is empty (half-open range [start, end))
    if (selection.start >= selection.end) {
      logger.warn(LOG_CATEGORIES.EDITOR, 'Empty selection for command');
      return false;
    }

    // Get selected text from the line to check if it contains valid musical elements
    const line = this.editor.getCurrentLine();
    if (!line || !line.cells) {
      logger.warn(LOG_CATEGORIES.EDITOR, 'No line or cells available for validation');
      return false;
    }

    const cells = line.cells || [];
    // Use half-open range [start, end)
    const selectedCells = cells.filter((cell, index) =>
      index >= selection.start && index < selection.end
    );
    const selectedText = selectedCells.map(cell => cell.char || '').join('');

    if (!selectedText || selectedText.trim().length === 0) {
      this.editor.showError('Empty selection - please select text to apply musical commands', {
        source: 'Command Validation'
      });
      return false;
    }

    return true;
  }

  /**
   * Handle Select All (Ctrl+A)
   */
  handleSelectAll() {
    if (!this.editor.getDocument() || !this.editor.wasmModule) {
      logger.warn(LOG_CATEGORIES.EDITOR, 'Cannot select all: document or WASM not ready');
      return;
    }

    const doc = this.editor.getDocument();

    // Find first and last positions
    if (!doc.lines || doc.lines.length === 0) {
      logger.warn(LOG_CATEGORIES.EDITOR, 'No content to select');
      return;
    }

    // Start: first cell of first line
    const anchor = { line: 0, col: 0 };

    // End: position AFTER last cell (selection is [anchor, head))
    const lastLine = doc.lines[doc.lines.length - 1];
    const lastCol = lastLine.cells ? lastLine.cells.length : 0;
    const head = { line: doc.lines.length - 1, col: lastCol };

    // Set selection in WASM
    try {
      this.editor.wasmModule.setSelection(anchor, head);
      logger.info(LOG_CATEGORIES.EDITOR, 'Selected from', { anchor, head });

      // Re-render to show selection
      this.editor.render();
    } catch (error) {
      logger.error(LOG_CATEGORIES.EDITOR, 'Failed to select all', { error });
    }
  }
}
