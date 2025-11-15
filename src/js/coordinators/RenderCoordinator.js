/**
 * RenderCoordinator - Manages all rendering operations
 *
 * Responsibilities:
 * - Document rendering (DOM updates)
 * - Position conversions (char/cell/pixel)
 * - Staff notation scheduling
 * - Render and update workflows
 *
 * This coordinator delegates to the editor for:
 * - WASM module access
 * - Document querying
 * - Renderer access
 * - Inspector updates (via InspectorCoordinator)
 * - Export operations (via ExportManager)
 */

import logger, { LOG_CATEGORIES } from '../logger.js';
import { LEFT_MARGIN_PX } from '../constants.js';

export default class RenderCoordinator {
  constructor(editor) {
    this.editor = editor;
    this.staffNotationTimer = null;
  }

  /**
   * Render the document (updates DOM from WASM state)
   * @param {number[]} dirtyLineIndices - Optional array of line indices to render (incremental)
   */
  async render(dirtyLineIndices = null) {
    if (!this.editor.renderer) {
      return;
    }

    try {
      console.log('📝 render() called', { dirtyLineIndices });

      // Merge annotation layer (slurs, etc.) into cells before rendering
      // This updates the WASM internal document with slur indicators on cells
      if (this.editor.wasmModule && this.editor.wasmModule.applyAnnotationSlursToCells) {
        this.editor.wasmModule.applyAnnotationSlursToCells();
      }

      // Get the updated document from WASM (with slur indicators merged)
      // WASM is the only source of truth - we just read for rendering
      let doc;
      if (this.editor.wasmModule && this.editor.wasmModule.getDocumentSnapshot) {
        doc = this.editor.wasmModule.getDocumentSnapshot();
        // DO NOT store to this.theDocument - WASM owns the state
      } else {
        // Fallback: get from WASM via getDocument() helper
        doc = this.editor.getDocument();
      }

      console.log('📝 calling renderer.renderDocument()');
      this.editor.renderer.renderDocument(doc, dirtyLineIndices);
      console.log('📝 renderer.renderDocument() completed');

      // Y positions are now correctly set by Rust layout engine based on line index
      // No need to adjust in JavaScript anymore

      // Update pitch system display in header
      if (this.editor.ui) {
        this.editor.ui.updateCurrentPitchSystemDisplay();
      }

      // Schedule staff notation update (debounced)
      this.scheduleStaffNotationUpdate();
    } catch (error) {
      logger.error(LOG_CATEGORIES.RENDERER, 'Failed to render document', {
        error: error.message,
        stack: error.stack
      });
      // Show user-friendly error notification
      this.editor.showError('Rendering error: Failed to render document', {
        details: error.message
      });
    }
  }

  /**
   * Render and update inspector tabs (DRY helper)
   * Combines render() + updateDocumentDisplay() which are almost always called together
   * @param {number[]} dirtyLineIndices - Optional array of line indices to render (incremental)
   */
  async renderAndUpdate(dirtyLineIndices = null) {
    await this.render(dirtyLineIndices);
    this.editor.inspectorCoordinator.updateDocumentDisplay();
  }

  /**
   * Convert character position to cell index and offset within cell
   * @param {number} charPos - Character position (0-based)
   * @returns {{cellIndex: number, charOffsetInCell: number}}
   */
  charPosToCellIndex(charPos) {
    // WASM-first: Position conversion now handled by WASM
    if (!this.editor.getDocument()) {
      return { cellIndex: 0, charOffsetInCell: 0 };
    }
    try {
      return this.editor.wasmModule.charPosToCellIndex(this.editor.getDocument(), charPos);
    } catch (error) {
      console.error('Error converting char pos to cell index from WASM:', error);
      return { cellIndex: 0, charOffsetInCell: 0 };
    }
  }

  /**
   * Convert cell index to character position
   * @param {number} cellIndex - Cell index (0-based)
   * @returns {number} Character position at the start of this cell
   */
  cellIndexToCharPos(cellIndex) {
    // WASM-first: Position conversion now handled by WASM
    if (!this.editor.getDocument()) {
      return 0;
    }
    try {
      return this.editor.wasmModule.cellIndexToCharPos(this.editor.getDocument(), cellIndex);
    } catch (error) {
      console.error('Error converting cell index to char pos from WASM:', error);
      return 0;
    }
  }

  /**
   * Calculate pixel position for a character position
   * @param {number} charPos - Character position (0-based)
   * @returns {number} Pixel X position
   */
  charPosToPixel(charPos) {
    // WASM-first: Position conversion now handled by WASM
    if (!this.editor.getDocument() || !this.editor.renderer || !this.editor.renderer.displayList) {
      return LEFT_MARGIN_PX;
    }
    try {
      return this.editor.wasmModule.charPosToPixel(this.editor.getDocument(), this.editor.renderer.displayList, charPos);
    } catch (error) {
      console.error('Error converting char pos to pixel from WASM:', error);
      return LEFT_MARGIN_PX;
    }
  }

  /**
   * Calculate pixel position for a cell column (NEW: one cell = one glyph model)
   * @param {number} cellCol - Cell column index (0 = before first cell, N = after Nth cell)
   * @returns {number} Pixel X position
   */
  cellColToPixel(cellCol) {
    // Direct cell column → pixel mapping (no intermediate character position)
    if (!this.editor.getDocument() || !this.editor.renderer || !this.editor.renderer.displayList) {
      return LEFT_MARGIN_PX;
    }
    try {
      return this.editor.wasmModule.cellColToPixel(this.editor.getDocument(), this.editor.renderer.displayList, cellCol);
    } catch (error) {
      console.error('Error converting cell col to pixel from WASM:', error);
      return LEFT_MARGIN_PX;
    }
  }

  /**
   * Schedule a deferred staff notation update (debounced)
   * Prevents multiple staff notation updates from running simultaneously
   */
  scheduleStaffNotationUpdate() {
    // **CRITICAL FIX**: Skip scheduling timer during UI initialization
    // This prevents double-render: one from the autosave timer, one from switchTab() immediate render
    // Check this.ui.isInitialized (set to true at end of ui.initialize())
    if (!this.editor.ui || !this.editor.ui.isInitialized) {
      return;
    }

    // Clear any pending update
    if (this.staffNotationTimer) {
      clearTimeout(this.staffNotationTimer);
    }

    // Schedule new update with 100ms debounce
    this.staffNotationTimer = setTimeout(async () => {
      // Only render if staff notation tab is active
      if (this.editor.ui && this.editor.ui.activeTab === 'staff-notation') {
        await this.renderStaffNotation();
      }
    }, 100);
  }

  /**
   * Render staff notation (delegates to ExportManager)
   */
  async renderStaffNotation() {
    return this.editor.exportManager.renderStaffNotation();
  }
}
