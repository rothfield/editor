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
import type { WASMModule, DisplayList } from '../../types/wasm-module.js';
import type { Document, DocumentLine, Cell } from '../../types/wasm.js';

interface Renderer {
  element: HTMLElement | null;
  displayList?: DisplayList | null;
  renderDocument(doc: Document, dirtyLineIndices?: number[] | null): void;
}

interface InspectorCoordinator {
  updateDocumentDisplay(): void;
}

interface ExportManager {
  renderStaffNotation(): Promise<void>;
}

interface UI {
  isInitialized?: boolean;
  activeTab?: string;
  updateCurrentPitchSystemDisplay?(): void;
  updateKeySignatureCornerDisplay?(): void;
}

interface EditorInstance {
  wasmModule: WASMModule;
  renderer?: Renderer | null;
  inspectorCoordinator: InspectorCoordinator;
  exportManager: ExportManager;
  ui?: UI | null;
  getDocument(): Document | null;
  getCurrentLine(): DocumentLine | null;
}

interface CharPosToCellIndexResult {
  cellIndex: number;
  charOffsetInCell: number;
}

export default class RenderCoordinator {
  private editor: EditorInstance;
  private staffNotationTimer: ReturnType<typeof setTimeout> | null;
  private hitboxesTimer: ReturnType<typeof setTimeout> | null;

  constructor(editor: EditorInstance) {
    this.editor = editor;
    this.staffNotationTimer = null;
    this.hitboxesTimer = null;
  }

  /**
   * Render the document (updates DOM from WASM state)
   * @param dirtyLineIndices - Optional array of line indices to render (incremental)
   */
  async render(dirtyLineIndices: number[] | null = null): Promise<void> {
    if (!this.editor.renderer) {
      return;
    }

    try {
      logger.debug(LOG_CATEGORIES.RENDERER, 'render() called', { dirtyLineIndices });

      // Get the document from WASM (slur indicators are set directly on cells)
      // WASM is the only source of truth - we just read for rendering
      let doc: Document | null;
      if (this.editor.wasmModule && this.editor.wasmModule.getDocumentSnapshot) {
        doc = this.editor.wasmModule.getDocumentSnapshot();
        // DO NOT store to this.theDocument - WASM owns the state
      } else {
        // Fallback: get from WASM via getDocument() helper
        doc = this.editor.getDocument();
      }

      if (!doc) {
        logger.warn(LOG_CATEGORIES.RENDERER, 'No document to render');
        return;
      }

      logger.debug(LOG_CATEGORIES.RENDERER, 'calling renderer.renderDocument()');
      this.editor.renderer.renderDocument(doc, dirtyLineIndices);
      logger.debug(LOG_CATEGORIES.RENDERER, 'renderer.renderDocument() completed');

      // Y positions are now correctly set by Rust layout engine based on line index
      // No need to adjust in JavaScript anymore

      // Update pitch system and key signature displays in header
      if (this.editor.ui) {
        try {
          this.editor.ui.updateCurrentPitchSystemDisplay?.();
        } catch (e) {
          logger.warn(LOG_CATEGORIES.RENDERER, 'Failed to update pitch system display', { error: e });
        }
        try {
          this.editor.ui.updateKeySignatureCornerDisplay?.();
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
   * @param dirtyLineIndices - Optional array of line indices to render (incremental)
   */
  async renderAndUpdate(dirtyLineIndices: number[] | null = null): Promise<void> {
    await this.render(dirtyLineIndices);
    this.editor.inspectorCoordinator.updateDocumentDisplay();
  }

  /**
   * Convert character position to cell index and offset within cell
   * @param charPos - Character position (0-based)
   * @returns {cellIndex: number, charOffsetInCell: number}
   */
  charPosToCellIndex(charPos: number): CharPosToCellIndexResult {
    // WASM-first: Position conversion now handled by WASM
    if (!this.editor.getDocument()) {
      return { cellIndex: 0, charOffsetInCell: 0 };
    }
    try {
      const result = this.editor.wasmModule.charPosToCellIndex(this.editor.getDocument()!, charPos);
      if (result) {
        return { cellIndex: result.cellIndex, charOffsetInCell: 0 };
      }
      return { cellIndex: 0, charOffsetInCell: 0 };
    } catch (error) {
      logger.error(LOG_CATEGORIES.WASM, 'Error converting char pos to cell index from WASM', { error });
      return { cellIndex: 0, charOffsetInCell: 0 };
    }
  }

  /**
   * Convert cell index to character position
   * @param cellIndex - Cell index (0-based)
   * @returns Character position at the start of this cell
   */
  cellIndexToCharPos(cellIndex: number): number {
    // WASM-first: Position conversion now handled by WASM
    if (!this.editor.getDocument()) {
      return 0;
    }
    try {
      return this.editor.wasmModule.cellIndexToCharPos(this.editor.getDocument()!, cellIndex);
    } catch (error) {
      logger.error(LOG_CATEGORIES.WASM, 'Error converting cell index to char pos from WASM', { error });
      return 0;
    }
  }

  /**
   * Calculate pixel position for a character position
   * @param charPos - Character position (0-based)
   * @returns Pixel X position
   */
  charPosToPixel(charPos: number): number {
    // WASM-first: Position conversion now handled by WASM
    if (!this.editor.getDocument() || !this.editor.renderer || !this.editor.renderer.displayList) {
      return LEFT_MARGIN_PX;
    }
    try {
      return this.editor.wasmModule.charPosToPixel(this.editor.getDocument()!, this.editor.renderer.displayList, charPos);
    } catch (error) {
      logger.error(LOG_CATEGORIES.WASM, 'Error converting char pos to pixel from WASM', { error });
      return LEFT_MARGIN_PX;
    }
  }

  /**
   * Calculate pixel position for a cell column (NEW: one cell = one glyph model)
   * @param cellCol - Cell column index (0 = before first cell, N = after Nth cell)
   * @returns Pixel X position
   */
  cellColToPixel(cellCol: number): number {
    // Direct cell column → pixel mapping (no intermediate character position)
    if (!this.editor.getDocument() || !this.editor.renderer || !this.editor.renderer.displayList) {
      return LEFT_MARGIN_PX;
    }
    try {
      return this.editor.wasmModule.cellColToPixel(this.editor.getDocument()!, this.editor.renderer.displayList, cellCol);
    } catch (error) {
      logger.error(LOG_CATEGORIES.WASM, 'Error converting cell col to pixel from WASM', { error });
      return LEFT_MARGIN_PX;
    }
  }

  /**
   * Schedule a deferred staff notation update (debounced)
   * Prevents multiple staff notation updates from running simultaneously
   */
  scheduleStaffNotationUpdate(): void {
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
  async renderStaffNotation(): Promise<void> {
    return this.editor.exportManager.renderStaffNotation();
  }

  /**
   * Calculate maximum character position in a line
   */
  calculateMaxCharPosition(line: DocumentLine | null): number {
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
  getMaxCellIndex(): number {
    const doc = this.editor.getDocument();
    if (!doc || !doc.lines || doc.lines.length === 0) {
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
  getMaxCharPosition(): number {
    if (!this.editor.getDocument()) {
      return 0;
    }
    try {
      return this.editor.wasmModule.getMaxCharPosition(this.editor.getDocument()!);
    } catch (error) {
      logger.error(LOG_CATEGORIES.WASM, 'Error getting max char position from WASM', { error });
      return 0;
    }
  }

  /**
   * Schedule hitboxes display update (debounced)
   */
  scheduleHitboxesUpdate(): void {
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
  updateHitboxesDisplay(): void {
    const hitboxesContainer = document.getElementById('hitboxes-container');

    if (!hitboxesContainer) {
      return;
    }

    const doc = this.editor.getDocument();
    if (!doc?.lines || doc.lines.length === 0) {
      hitboxesContainer.innerHTML = '<div class="text-gray-500 text-sm">No hitboxes available. Add some content to see hitbox information.</div>';
      return;
    }

    let hitboxHTML = '<div class="space-y-4">';

    doc.lines.forEach((stave, staveIndex) => {
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
          const cellWithLayout = cell as Cell & { x?: number; y?: number; w?: number; h?: number };
          const hasValidHitbox = cellWithLayout.x !== undefined && cellWithLayout.y !== undefined &&
                                         cellWithLayout.w !== undefined && cellWithLayout.h !== undefined;

          if (hasValidHitbox) {
            const centerX = cellWithLayout.x! + (cellWithLayout.w! / 2);
            const centerY = cellWithLayout.y! + (cellWithLayout.h! / 2);

            hitboxHTML += `<tr class="hover:bg-blue-50">`;
            hitboxHTML += `<td class="border border-gray-300 px-2 py-1">${cellIndex}</td>`;
            hitboxHTML += `<td class="border border-gray-300 px-2 py-1 font-mono">${cell.char || ''}</td>`;
            hitboxHTML += `<td class="border border-gray-300 px-2 py-1">${cell.col || 0}</td>`;
            hitboxHTML += `<td class="border border-gray-300 px-2 py-1">`;
            hitboxHTML += `${cellWithLayout.x!.toFixed(1)},${cellWithLayout.y!.toFixed(1)} `;
            hitboxHTML += `${cellWithLayout.w!.toFixed(1)}×${cellWithLayout.h!.toFixed(1)}`;
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
  ensureHitboxesAreSet(): void {
    const doc = this.editor.getDocument();
    if (!doc || !doc.lines) {
      return;
    }

    doc.lines.forEach((stave) => {
      const cells = stave.cells || [];
      if (cells.length === 0) {
        return;
      }

      // Calculate cumulative x positions
      let cumulativeX = 0;
      const cellPositions: number[] = [];
      cells.forEach((charCell) => {
        cellPositions.push(cumulativeX);
        const glyphLength = (charCell.char || '').length;
        cumulativeX += glyphLength * 12; // 12px per character
      });

      // Set hitbox values on each cell if they're missing or zero
      cells.forEach((charCell, cellIndex) => {
        const cellWithLayout = charCell as Cell & { x?: number; y?: number; w?: number; h?: number; bbox?: number[]; hit?: number[] };
        const glyphLength = (charCell.char || '').length;
        const cellWidth = glyphLength * 12;

        // Only set if values are missing or zero
        if (cellWithLayout.x === undefined || cellWithLayout.x === 0) {
          cellWithLayout.x = cellPositions[cellIndex];
        }
        if (cellWithLayout.y === undefined || cellWithLayout.y === 0) {
          cellWithLayout.y = 0; // Y position relative to line container
        }
        if (cellWithLayout.w === undefined || cellWithLayout.w === 0) {
          cellWithLayout.w = cellWidth;
        }
        if (cellWithLayout.h === undefined || cellWithLayout.h === 0) {
          cellWithLayout.h = 16;
        }

        // Update bounding box and hit testing area
        if (!cellWithLayout.bbox || cellWithLayout.bbox.length === 0 ||
                    cellWithLayout.bbox.every(val => val === 0)) {
          cellWithLayout.bbox = [cellWithLayout.x!, cellWithLayout.y!, cellWithLayout.x! + cellWithLayout.w!, cellWithLayout.y! + cellWithLayout.h!];
        }
        if (!cellWithLayout.hit || cellWithLayout.hit.length === 0 ||
                    cellWithLayout.hit.every(val => val === 0)) {
          cellWithLayout.hit = [cellWithLayout.x! - 2.0, cellWithLayout.y! - 2.0, cellWithLayout.x! + cellWithLayout.w! + 2.0, cellWithLayout.y! + cellWithLayout.h! + 2.0];
        }
      });
    });
  }
}
