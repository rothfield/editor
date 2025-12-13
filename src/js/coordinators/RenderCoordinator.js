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
    this.hitboxesTimer = null;
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
      logger.debug(LOG_CATEGORIES.RENDERER, 'render() called', { dirtyLineIndices });

      // Merge annotation layer slurs into cells before rendering
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

      logger.debug(LOG_CATEGORIES.RENDERER, 'calling renderer.renderDocument()');
      this.editor.renderer.renderDocument(doc, dirtyLineIndices);
      logger.debug(LOG_CATEGORIES.RENDERER, 'renderer.renderDocument() completed');

      // Y positions are now correctly set by Rust layout engine based on line index
      // No need to adjust in JavaScript anymore

      // Update pitch system and key signature displays in header
      if (this.editor.ui) {
        try {
          this.editor.ui.updateCurrentPitchSystemDisplay();
        } catch (e) {
          logger.warn(LOG_CATEGORIES.RENDERER, 'Failed to update pitch system display', { error: e });
        }
        try {
          this.editor.ui.updateKeySignatureCornerDisplay();
        } catch (e) {
          logger.warn(LOG_CATEGORIES.RENDERER, 'Failed to update key signature display', { error: e });
        }
      }

      // Schedule staff notation update (debounced)
      this.scheduleStaffNotationUpdate();
    } catch (error) {
      const errorInfo = error instanceof Error ? { message: error.message, stack: error.stack } : { error };
      logger.error(LOG_CATEGORIES.RENDERER, 'Rendering failed', errorInfo);
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
      logger.error(LOG_CATEGORIES.WASM, 'Error converting char pos to cell index from WASM', { error });
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
      logger.error(LOG_CATEGORIES.WASM, 'Error converting cell index to char pos from WASM', { error });
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
      logger.error(LOG_CATEGORIES.WASM, 'Error converting char pos to pixel from WASM', { error });
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
      logger.error(LOG_CATEGORIES.WASM, 'Error converting cell col to pixel from WASM', { error });
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

  /**
   * Calculate maximum character position in a line
   */
  calculateMaxCharPosition(line) {
    if (!line || !line.cells) {
      return 0;
    }

    let maxPos = 0;
    for (const cell of line.cells) {
      maxPos += cell.char.length;
    }
    return maxPos;
  }

  /**
   * Get the maximum cell index in the current line
   */
  getMaxCellIndex() {
    if (!this.editor.getDocument() || !this.editor.getDocument()?.lines || this.editor.getDocument()?.lines?.length === 0) {
      return 0;
    }

    const line = this.editor.getCurrentLine();
    if (!line) return 0;
    const cells = line.cells || [];

    return cells.length; // Position after last cell
  }

  /**
   * Get the maximum character position in the current line (WASM-based)
   */
  getMaxCharPosition() {
    if (!this.editor.getDocument()) {
      return 0;
    }
    try {
      return this.editor.wasmModule.getMaxCharPosition(this.editor.getDocument());
    } catch (error) {
      logger.error(LOG_CATEGORIES.WASM, 'Error getting max char position from WASM', { error });
      return 0;
    }
  }

  /**
   * Schedule hitboxes display update (debounced)
   */
  scheduleHitboxesUpdate() {
    // Clear any pending update to prevent memory leak
    if (this.hitboxesTimer) {
      clearTimeout(this.hitboxesTimer);
    }

    // Schedule new update with 100ms debounce
    this.hitboxesTimer = setTimeout(() => {
      this.updateHitboxesDisplay();
    }, 100);
  }

  /**
   * Update hitboxes inspector display
   */
  updateHitboxesDisplay() {
    const hitboxesContainer = document.getElementById('hitboxes-container');

    if (!hitboxesContainer) {
      return;
    }

    if (!this.editor.getDocument().lines || this.editor.getDocument()?.lines?.length === 0) {
      hitboxesContainer.innerHTML = '<div class="text-gray-500 text-sm">No hitboxes available. Add some content to see hitbox information.</div>';
      return;
    }

    let hitboxHTML = '<div class="space-y-4">';

    this.editor.getDocument()?.lines?.forEach((stave, staveIndex) => {
      hitboxHTML += `<div class="mb-4">`;
      hitboxHTML += `<h4 class="font-semibold text-sm mb-2">Stave ${staveIndex} Hitboxes</h4>`;

      const cells = stave.cells || [];
      if (cells && cells.length > 0) {
        hitboxHTML += `<div class="mb-3">`;
        hitboxHTML += `<table class="w-full text-xs border-collapse">`;
        hitboxHTML += `<thead><tr class="bg-gray-100">`;
        hitboxHTML += `<th class="border border-gray-300 px-2 py-1 text-left">Idx</th>`;
        hitboxHTML += `<th class="border border-gray-300 px-2 py-1 text-left">Char</th>`;
        hitboxHTML += `<th class="border border-gray-300 px-2 py-1 text-left">Pos</th>`;
        hitboxHTML += `<th class="border border-gray-300 px-2 py-1 text-left">Hitbox</th>`;
        hitboxHTML += `<th class="border border-gray-300 px-2 py-1 text-left">Center</th>`;
        hitboxHTML += `</tr></thead><tbody>`;

        cells.forEach((cell, cellIndex) => {
          const hasValidHitbox = cell.x !== undefined && cell.y !== undefined &&
                                           cell.w !== undefined && cell.h !== undefined;

          if (hasValidHitbox) {
            const centerX = cell.x + (cell.w / 2);
            const centerY = cell.y + (cell.h / 2);

            hitboxHTML += `<tr class="hover:bg-blue-50">`;
            hitboxHTML += `<td class="border border-gray-300 px-2 py-1">${cellIndex}</td>`;
            hitboxHTML += `<td class="border border-gray-300 px-2 py-1 font-mono">${cell.char || ''}</td>`;
            hitboxHTML += `<td class="border border-gray-300 px-2 py-1">${cell.col || 0}</td>`;
            hitboxHTML += `<td class="border border-gray-300 px-2 py-1">`;
            hitboxHTML += `${cell.x.toFixed(1)},${cell.y.toFixed(1)} `;
            hitboxHTML += `${cell.w.toFixed(1)}×${cell.h.toFixed(1)}`;
            hitboxHTML += `</td>`;
            hitboxHTML += `<td class="border border-gray-300 px-2 py-1">`;
            hitboxHTML += `(${centerX.toFixed(1)}, ${centerY.toFixed(1)})`;
            hitboxHTML += `</td>`;
            hitboxHTML += `</tr>`;
          }
        });

        hitboxHTML += `</tbody></table>`;
        hitboxHTML += `</div>`;
      }

      hitboxHTML += `</div>`;
    });

    hitboxHTML += '</div>';
    hitboxesContainer.innerHTML = hitboxHTML;
  }

  /**
   * Ensure hitbox values are set on all cells in the document
   * This is needed because WASM operations may return cells without hitbox fields
   */
  ensureHitboxesAreSet() {
    if (!this.editor.getDocument() || !this.editor.getDocument()?.lines) {
      return;
    }

    this.editor.getDocument()?.lines?.forEach((stave, staveIndex) => {
      const cells = stave.cells || [];
      if (cells.length === 0) {
        return;
      }

      // Calculate cumulative x positions
      let cumulativeX = 0;
      const cellPositions = [];
      cells.forEach((charCell) => {
        cellPositions.push(cumulativeX);
        const glyphLength = (charCell.char || '').length;
        cumulativeX += glyphLength * 12; // 12px per character
      });

      // Set hitbox values on each cell if they're missing or zero
      cells.forEach((charCell, cellIndex) => {
        const glyphLength = (charCell.char || '').length;
        const cellWidth = glyphLength * 12;

        // Only set if values are missing or zero
        if (charCell.x === undefined || charCell.x === 0) {
          charCell.x = cellPositions[cellIndex];
        }
        if (charCell.y === undefined || charCell.y === 0) {
          charCell.y = 0; // Y position relative to line container
        }
        if (charCell.w === undefined || charCell.w === 0) {
          charCell.w = cellWidth;
        }
        if (charCell.h === undefined || charCell.h === 0) {
          charCell.h = 16;
        }

        // Update bounding box and hit testing area
        if (!charCell.bbox || charCell.bbox.length === 0 ||
                      charCell.bbox.every(val => val === 0)) {
          charCell.bbox = [charCell.x, charCell.y, charCell.x + charCell.w, charCell.y + charCell.h];
        }
        if (!charCell.hit || charCell.hit.length === 0 ||
                      charCell.hit.every(val => val === 0)) {
          charCell.hit = [charCell.x - 2.0, charCell.y - 2.0, charCell.x + charCell.w + 2.0, charCell.y + charCell.h + 2.0];
        }
      });
    });
  }
}
