/**
 * Music Notation Editor - Core Editor Functionality
 *
 * This class provides the core editor functionality with WASM integration,
 * document management, and basic event handling for the Music Notation Editor POC.
 */

import DOMRenderer from './renderer.js';
import logger, { LOG_CATEGORIES } from './logger.js';
import { OSMDRenderer } from './osmd-renderer.js';
import { LEFT_MARGIN_PX, ENABLE_AUTOSAVE, BASE_FONT_SIZE } from './constants.js';
import { DOM_SELECTORS } from './constants/editorConstants.js';
import AutoSave from './autosave.js';
import StorageManager from './storage-manager.js';
import { DebugHUD } from './debug-hud.js';
import WASMBridge from './core/WASMBridge.js';
import KeyboardHandler from './handlers/KeyboardHandler.js';
import MouseHandler from './handlers/MouseHandler.js';
import ExportManager from './managers/ExportManager.js';

// Coordinators
import CursorCoordinator from './coordinators/CursorCoordinator.js';
import SelectionCoordinator from './coordinators/SelectionCoordinator.js';
import ClipboardCoordinator from './coordinators/ClipboardCoordinator.js';
import InspectorCoordinator from './coordinators/InspectorCoordinator.js';
import RenderCoordinator from './coordinators/RenderCoordinator.js';
import ConsoleCoordinator from './coordinators/ConsoleCoordinator.js';

class MusicNotationEditor {
  constructor(editorElement) {
    this.element = editorElement;
    // Ensure editor element has position: relative for absolute positioning of child elements
    this.element.style.position = 'relative';
    this.wasmModule = null;
    // REMOVED: this.theDocument = null; (WASM is now the only source of truth)
    this.renderer = null;
    this.eventHandlers = new Map();
    this.isInitialized = false;

    // Staff notation real-time update
    this.staffNotationTimer = null;

    // Mouse selection state
    this.isDragging = false;
    this.dragStartPos = null;
    this.dragEndPos = null;
    this.justDragSelected = false;

    // Clipboard storage (for rich copy/paste)
    this.clipboard = {
        text: null,
        cells: null
    };

    // AutoSave manager
    this.autoSave = new AutoSave(this);

    // Storage manager for explicit save/load
    this.storage = new StorageManager(this);

    // Debug HUD (visual logger for cursor/selection state)
    this.debugHUD = new DebugHUD(this);

    // Keyboard handler (routes keyboard events to appropriate commands)
    this.keyboardHandler = new KeyboardHandler(this);

    // Mouse handler (handles mouse interactions and cell position calculations)
    this.mouseHandler = new MouseHandler(this);

    // Export manager (handles all export operations and inspector updates)
    this.exportManager = new ExportManager(this);

    // Coordinators (specialized functionality extraction)
    this.cursorCoordinator = new CursorCoordinator(this);
    this.selectionCoordinator = new SelectionCoordinator(this);
    this.clipboardCoordinator = new ClipboardCoordinator(this);
    this.inspectorCoordinator = new InspectorCoordinator(this);
    this.renderCoordinator = new RenderCoordinator(this);
    this.consoleCoordinator = new ConsoleCoordinator(this);
  }

  /**
     * Get the current document from WASM (WASM is the only source of truth)
     */
  getDocument() {
    if (!this.wasmModule) {
      return null;
    }
    try {
      return this.wasmModule.getDocumentSnapshot();
    } catch (error) {
      console.error('Failed to get document snapshot from WASM:', error);
      return null;
    }
  }

  /**
     * Get the document (alias for getDocument for backward compatibility)
     */
  get document() {
    return this.getDocument();
  }

  /**
   * Load NotationFont for a specific pitch system
   * @param {string} system - Pitch system name: "number", "western", "sargam", or "doremi"
   * @returns {Promise<void>}
   *
   * NOTE: Currently NOT USED - Full NotationFont is loaded via @font-face in index.html.
   * This code remains for potential future use if we want to dynamically load
   * system-specific font variants (NotationFont-{Number,Western,Sargam,Doremi}.woff2).
   */
  async loadNotationFont(system = 'number') {
    // Capitalize first letter for filename: number -> Number
    const systemName = system.charAt(0).toUpperCase() + system.slice(1);
    const fontName = `NotationFont-${systemName}`;
    const fontPath = `/dist/fonts/${fontName}.woff2`;

    console.log(`Loading ${fontName} for ${system} pitch system...`);

    try {
      const font = new FontFace('NotationFont', `url(${fontPath})`);
      const loadedFont = await font.load();
      document.fonts.add(loadedFont);
      console.log(`✓ ${fontName} loaded successfully (${fontPath})`);
    } catch (error) {
      console.error(`Failed to load ${fontName}:`, error);
      throw error;
    }
  }

  /**
     * Initialize the editor with WASM module
     */
  async initialize() {
    try {
      console.log('Initializing Music Notation Editor...');

      // NOTE: System-specific NotationFont loading is currently disabled.
      // Full NotationFont is loaded via @font-face in index.html instead.
      // Uncomment below if switching back to dynamic system-specific fonts:
      // const pitchSystem = localStorage.getItem('pitchSystem') || 'number';
      // await this.loadNotationFont(pitchSystem);

      // Load WASM module
      const startTime = performance.now();
      const wasmModule = await import('/dist/pkg/editor_wasm.js');

      // Initialize WASM
      await wasmModule.default();

      // Initialize WASM Bridge
      this.wasmModule = new WASMBridge(wasmModule);

      // Validate required WASM functions are available
      this.wasmModule.validateRequiredFunctions();

      // Initialize OSMD renderer for staff notation
      this.osmdRenderer = new OSMDRenderer('staff-notation-container');
      console.log('OSMD renderer initialized (with audio playback support)');

      const loadTime = performance.now() - startTime;
      console.log(`WASM module loaded in ${loadTime.toFixed(2)}ms`);

      // Initialize renderer (font symbols now come from WASM, not JSON)
      this.renderer = new DOMRenderer(this.element, this, {});

      // Wait for all fonts to be ready
      // ROOT CAUSE FIX: Measurements taken before fonts are ready are incorrect
      try {
        // CHROMIUM FIX: Explicitly load NotationFont before measuring
        await document.fonts.load('32px NotationFont');
        await document.fonts.ready;
        console.log('All fonts ready');
        // Clear any cached measurements that might have happened before fonts loaded
        if (this.renderer && this.renderer.measurementService) {
          this.renderer.measurementService.clearCache();
          console.log('Measurement cache cleared after font load');
        }
      } catch (fontError) {
        console.warn('Failed to wait for fonts, measurements may be incorrect:', fontError);
      }

      // Initialize global glyph width cache (measure once at startup)
      try {
        console.log('Initializing glyph width cache...');
        const glyphCache = await this.renderer.measurementService.measureAllNotationFontGlyphs(this.wasmModule);
        this.wasmModule.setGlyphWidthCache(glyphCache);
        console.log('Glyph width cache initialized');
      } catch (cacheError) {
        console.error('Failed to initialize glyph width cache:', cacheError);
        // Continue anyway - layout will use fallback widths
      }

      // Setup event handlers
      this.setupEventHandlers();

      // Setup ornament event listeners

      // Mark as initialized BEFORE creating document
      this.isInitialized = true;

      // Try to restore autosave, otherwise create new document
      // Note: autosave behavior is controlled by ENABLE_AUTOSAVE flag in constants.js
      const restored = await this.autoSave.restoreLastAutosave();
      if (!restored) {
        await this.createNewDocument();
      }

      // Start auto-save timer (saves every 5 seconds if ENABLE_AUTOSAVE is true)
      // If ENABLE_AUTOSAVE is false, this will be skipped
      this.autoSave.start();

      console.log('Music Notation Editor initialized successfully');
    } catch (error) {
      console.error('Failed to initialize editor:', error);
      this.showError('Failed to initialize music notation engine');
      throw error;
    }
  }

  /**
     * Create a new empty document
     * WASM owns the document - we just call WASM and render
     */
  async createNewDocument() {
    if (!this.isInitialized || !this.wasmModule) {
      console.error('Cannot create document: WASM not initialized');
      return;
    }

    // Create document in WASM (WASM stores it internally)
    this.wasmModule.createNewDocument();

    console.log('✅ New document created in WASM');

    // Render the document from WASM
    await this.renderAndUpdate();
  }

  /**
     * Load document from JSON string
     * WASM owns the document - we just send it to WASM and render
     */
  async loadDocument(jsonString) {
    try {
      if (this.wasmModule) {
        const document = typeof jsonString === 'string' ? JSON.parse(jsonString) : jsonString;

        // Ensure pitch_system is set to default if missing (backward compatibility)
        if (!document.pitch_system && document.pitch_system !== 0) {
          document.pitch_system = 1; // Default to Number system
        }

        // Load document into WASM (WASM stores it internally)
        this.wasmModule.loadDocument(document);

        await this.renderAndUpdate();

        // Update UI displays
        if (this.ui) {
          const doc = this.getDocument();
          if (doc && doc.title) {
            this.ui.updateDocumentTitle(doc.title);
          }
          this.ui.updateCurrentPitchSystemDisplay();
        }
      }
    } catch (error) {
      console.error('Failed to load document:', error);
      this.showError('Failed to load document');
      throw error;
    }
  }

  /**
     * Save document to JSON string
     * Get document from WASM and serialize it
     */
  async saveDocument() {
    try {
      const document = this.getDocument();
      if (!document) {
        throw new Error('No document loaded');
      }
      return JSON.stringify(document);
    } catch (error) {
      console.error('Failed to save document:', error);
      this.showError('Failed to save document');
      throw error;
    }
  }

  /**
     * Insert text at current cursor position using recursive descent parser
     * If there's an active selection, clears it first (standard editor behavior)
     */
  async insertText(text) {
    if (!this.isInitialized || !this.wasmModule) {
      logger.warn(LOG_CATEGORIES.EDITOR, 'insertText called before initialization');
      return;
    }

    // Clear any active selection before inserting (standard text editor behavior)
    if (this.hasSelection()) {
      logger.debug(LOG_CATEGORIES.EDITOR, 'Clearing selection before text insert');
      this.clearSelection();
    }

    logger.time('insertText', LOG_CATEGORIES.EDITOR);

    logger.info(LOG_CATEGORIES.EDITOR, 'Inserting text (WASM-first)', { text });

    const startTime = performance.now();
    let t1, t2, t3, t4, t5, t6;

    try {
      // WASM-FIRST APPROACH: Call insertText which uses internal DOCUMENT state
      const result = this.wasmModule.insertText(text);
      t1 = performance.now();
      console.log(`⏱️ WASM insertText: ${(t1 - startTime).toFixed(2)}ms`);

      logger.debug(LOG_CATEGORIES.EDITOR, 'insertText result from WASM', result);

      // NOTE: We don't update JavaScript document - WASM owns the state
      // Renderer will call getDocument() to fetch current state

      t2 = performance.now();

      // Extract dirty line indices for incremental rendering
      const dirtyLineIndices = result.dirty_lines.map(dl => dl.row);

      // Render and update UI (incremental) - renderer gets document from WASM
      await this.renderAndUpdate(dirtyLineIndices);
      t3 = performance.now();
      console.log(`⏱️ renderAndUpdate: ${(t3 - t2).toFixed(2)}ms`);

      this.ensureHitboxesAreSet();
      t4 = performance.now();
      console.log(`⏱️ ensureHitboxesAreSet: ${(t4 - t3).toFixed(2)}ms`);

      this.updateCursorPositionDisplay();
      t5 = performance.now();
      console.log(`⏱️ updateCursorPositionDisplay: ${(t5 - t4).toFixed(2)}ms`);

      // Schedule hitboxes display update (debounced to prevent leak)
      this.scheduleHitboxesUpdate();

      // Show cursor after typing
      this.showCursor();
      t6 = performance.now();
      console.log(`⏱️ showCursor + scheduleHitboxes: ${(t6 - t5).toFixed(2)}ms`);

      const endTime = performance.now();
      const duration = endTime - startTime;
      console.log(`⏱️ TOTAL insertText: ${duration.toFixed(2)}ms`);

      logger.timeEnd('insertText', LOG_CATEGORIES.EDITOR, { duration: `${duration.toFixed(2)}ms` });
    } catch (error) {
      logger.error(LOG_CATEGORIES.EDITOR, 'Failed to insert text', {
        error: error.message,
        stack: error.stack
      });
      console.error('Failed to insert text:', error);
      this.showError('Failed to insert text');
    }
  }


  /**
     * Delete text at specified range
     */
  async deleteRange(start, end) {
    if (!this.isInitialized || !this.wasmModule) {
      return;
    }

    try {
      // Get current line index from WASM
      const currentLineIndex = this.getCurrentStave();
      const line = this.getCurrentLine();
      if (!line) return;

      // Use WASM editReplaceRange for deletion (delete = replace with empty string)
      // Note: Ornament deletion protection is now handled in WASM
      // WASM already has the document internally - no need to load
      console.log('[deleteRange] Calling editReplaceRange with:', {
        start_row: start.line,
        start_col: start.col,
        end_row: end.line,
        end_col: end.col
      });
      const result = this.wasmModule.editReplaceRange(
        start.line,   // start_row - extract from Pos object
        start.col,    // start_col - extract from Pos object
        end.line,     // end_row - extract from Pos object
        end.col,      // end_col - extract from Pos object
        ""            // empty text = deletion
      );
      console.log('[deleteRange] WASM result:', result);

      // NOTE: No longer mutating this.theDocument - WASM owns the state
      // Renderer will fetch latest state from WASM via getDocumentSnapshot()

      // Set cursor position from WASM result
      if (result && typeof result.new_cursor_col !== 'undefined') {
        this.setCursorPosition(result.new_cursor_col);
      } else {
        // Fallback: set cursor to start column (start is a Pos object with {line, col})
        this.setCursorPosition(start.col);
      }

      await this.renderAndUpdate();

      // Restore visual selection after deletion
      this.updateSelectionDisplay();
    } catch (error) {
      console.error('Failed to delete range:', error);
      // Show the WASM error message (e.g., ornament protection)
      const errorMsg = error?.message || error?.toString() || 'Failed to delete selection';
      if (errorMsg.includes('ornament')) {
        this.showWarning(errorMsg);
      } else {
        this.showError(errorMsg);
      }
    }
  }

  /**
     * Get current cursor position (character offset)
     */
  /**
   * Get the current stave/line index from cursor state (WASM is source of truth)
   */
  getCurrentStave() {
    if (this.wasmModule && this.wasmModule.getCaretInfo) {
      try {
        const caretInfo = this.wasmModule.getCaretInfo();
        return caretInfo?.caret?.line ?? 0;
      } catch (e) {
        return 0;
      }
    }
    return 0;
  }

  /**
   * Get the current line from document based on cursor stave
   */
  getCurrentLine() {
    const doc = this.getDocument();
    if (!doc || !doc.lines) {
      return null;
    }
    const stave = this.getCurrentStave();
    return doc.lines[stave] || null;
  }

  getCursorPosition() {
    if (this.wasmModule && this.wasmModule.getCaretInfo) {
      try {
        const caretInfo = this.wasmModule.getCaretInfo();
        return caretInfo?.caret?.col ?? 0;
      } catch (e) {
        return 0;
      }
    }
    return 0;
  }

  /**
   * Get the full cursor position as a Pos object { line, col } (WASM is source of truth)
   * @returns {{line: number, col: number}} Full cursor position
   */
  getCursorPos() {
    if (this.wasmModule && this.wasmModule.getCaretInfo) {
      try {
        const caretInfo = this.wasmModule.getCaretInfo();
        return {
          line: caretInfo?.caret?.line ?? 0,
          col: caretInfo?.caret?.col ?? 0
        };
      } catch (e) {
        return { line: 0, col: 0 };
      }
    }
    return { line: 0, col: 0 };
  }

  /**
     * Update cursor visual display after WASM has set the cursor position
     * NOTE: This does NOT set the cursor - WASM owns cursor position
     * This only updates the visual display based on WASM's cursor state
     *
     * @deprecated Use this only for updating display after WASM operations
     * To actually move the cursor, use WASM functions: moveLeft, moveRight, mouseDown, etc.
     */
  setCursorPosition(positionOrRow, col) {
    // WASM owns cursor position - this method just updates display
    // The cursor has already been set by WASM operations
    this.updateCursorPositionDisplay();
    this.updateCursorVisualPosition();
    this.showCursor();
  }

  /**
     * Validate and clamp cursor position to valid range (character-based)
     */
  validateCursorPosition(position) {
    const doc = this.getDocument();
    if (!doc || !doc.lines || doc.lines.length === 0) {
      return 0;
    }

    const maxPosition = this.getMaxCharPosition();

    // Clamp position to valid range [0, maxPosition]
    const clampedPosition = Math.max(0, Math.min(position, maxPosition));

    if (clampedPosition !== position) {
      logger.warn(LOG_CATEGORIES.CURSOR, 'Cursor position clamped', {
        requested: position,
        clamped: clampedPosition,
        maxPosition
      });
    }

    return clampedPosition;
  }

  /**
     * Update visual display after WASM EditorDiff result
     * @param {EditorDiff} diff - The diff returned from WASM commands
     * @deprecated This function is obsolete - WASM owns cursor state, just call render()
     */
  async updateCursorFromWASM(diff) {
    // WASM owns cursor state - no need to sync to JavaScript
    // Just update visual display based on WASM's state
    // Render to update current line border and other visual states
    await this.render();

    // Update visual displays
    this.updateCursorPositionDisplay();
    this.updateCursorVisualPosition();
    this.showCursor();
    this.updateSelectionDisplay();

    // Update primary selection register when selection changes (X11 select-to-copy)
    this.updatePrimarySelection();
  }


  /**
     * Get pitch system name from enum value
     */
  getPitchSystemName(system) {
    const names = {
      0: 'Unknown',
      1: 'Number',
      2: 'Western',
      3: 'Sargam',
      4: 'Bhatkhande',
      5: 'Tabla'
    };
    return names[system] || 'Unknown';
  }


  /**
     * Get current pitch system (WASM is source of truth)
     * Line-level pitch_system overrides document-level
     */
  getCurrentPitchSystem() {
    const doc = this.getDocument();
    if (doc) {
      // Check if we have lines and if the first line has pitch_system set
      if (doc.lines && doc.lines.length > 0) {
        const line = this.getCurrentLine();
        // If line has pitch_system set (non-zero), use it
        if (line && line.pitch_system && line.pitch_system !== 0) {
          return line.pitch_system;
        }
      }
      // Fall back to document-level pitch system
      return doc.pitch_system || 1; // Default to Number system
    }
    return 1;
  }



  /**
     * Handle keyboard input
     */
  async handleKeyboardEvent(event) {
    await this.keyboardHandler.handleKeyboardEvent(event);
  }



  /**
     * Calculate max character position for a specific line
     * @param {Object} line - The line object
     * @returns {number} Maximum character position in the line
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
     * Get the maximum cell index in the main lane
     */
  getMaxCellIndex() {
    if (!this.getDocument() || !this.getDocument()?.lines || this.getDocument()?.lines?.length === 0) {
      return 0;
    }

    const line = this.getCurrentLine();
    if (!line) return 0;
    const cells = line.cells || [];

    return cells.length; // Position after last cell
  }

  /**
     * Get the maximum character position in the line
     */
  getMaxCharPosition() {
    // WASM-first: Position conversion now handled by WASM
    if (!this.getDocument()) {
      return 0;
    }
    try {
      return this.wasmModule.getMaxCharPosition(this.getDocument());
    } catch (error) {
      console.error('Error getting max char position from WASM:', error);
      return 0;
    }
  }

  /**
     * Convert character position to cell index
     * @param {number} charPos - Character position (0-based)
     * @returns {Object} {cellIndex, charOffsetInCell}
     */
  charPosToCellIndex(charPos) {
    // WASM-first: Position conversion now handled by WASM
    if (!this.getDocument()) {
      return { cellIndex: 0, charOffsetInCell: 0 };
    }
    try {
      return this.wasmModule.charPosToCellIndex(this.getDocument(), charPos);
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
    if (!this.getDocument()) {
      return 0;
    }
    try {
      return this.wasmModule.cellIndexToCharPos(this.getDocument(), cellIndex);
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
    if (!this.getDocument() || !this.renderer || !this.renderer.displayList) {
      return LEFT_MARGIN_PX;
    }
    try {
      return this.wasmModule.charPosToPixel(this.getDocument(), this.renderer.displayList, charPos);
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
    if (!this.getDocument() || !this.renderer || !this.renderer.displayList) {
      return LEFT_MARGIN_PX;
    }
    try {
      return this.wasmModule.cellColToPixel(this.getDocument(), this.renderer.displayList, cellCol);
    } catch (error) {
      console.error('Error converting cell col to pixel from WASM:', error);
      return LEFT_MARGIN_PX;
    }
  }


  // ==================== SELECTION MANAGEMENT ====================

  /**
     * Clear current selection
     */
  clearSelection() {
    // Clear selection in WASM (single source of truth)
    if (this.wasmModule) {
      try {
        this.wasmModule.clearSelection();
      } catch (error) {
        console.warn('Failed to clear selection in WASM:', error);
      }
    }

    // Clear visual selection in UI
    this.clearSelectionVisual();
    this.updateDocumentDisplay();
  }

  /**
     * Check if there's an active selection
     * NOW QUERIES WASM AS SOURCE OF TRUTH
     */
  hasSelection() {
    if (!this.wasmModule) return false;

    try {
      const selectionInfo = this.wasmModule.getSelectionInfo();
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
    if (!this.wasmModule) return null;

    try {
      const selectionInfo = this.wasmModule.getSelectionInfo();
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

    if (!this.getDocument() || !this.getDocument()?.lines || this.getDocument()?.lines?.length === 0) {
      return '';
    }

    const line = this.getCurrentLine();
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
      this.updateCursorPositionDisplay();
      return;
    }

    // Add visual selection for selected range
    this.renderSelectionVisual(selection);

    // Update cursor position display and ephemeral model display
    this.updateCursorPositionDisplay();
    this.updateDocumentDisplay();
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

    const currentStave = this.getCurrentStave();
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
    if (!this.renderer || !this.renderer.element) {
      return;
    }

    // Remove 'selected' class from all cells (querySelectorAll all elements with the selected class that have data-cell-index)
    const selectedCells = this.renderer.element.querySelectorAll('[data-cell-index].selected');
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
      return await this.insertText(newText);
    }

    try {
      // Delete selected range
      await this.deleteRange(selection.start, selection.end);
      // Note: deleteRange already sets cursor position, no need to set again

      // Insert new text at cursor (which is already at selection.start after deletion)
      await this.insertText(newText);

      // Clear selection
      this.clearSelection();
    } catch (error) {
      console.error('Failed to replace selected text:', error);
      this.showError('Failed to replace selection');
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
      await this.deleteRange(selection.start, selection.end);
      // Note: deleteRange already sets cursor position from WASM result, no need to set again
      this.clearSelection();
    } catch (error) {
      logger.error(LOG_CATEGORIES.EDITOR, 'Failed to delete selection', error);
      this.showError('Failed to delete selection');
    }
  }

  /**
     * Handle backspace key with selection awareness and beat recalculation
     * Uses WASM-first approach for consistency with insertText
     */
  async handleBackspace() {
    logger.time('handleBackspace', LOG_CATEGORIES.EDITOR);

    logger.info(LOG_CATEGORIES.EDITOR, 'Backspace pressed', {
      hasSelection: this.hasSelection()
    });

    if (this.hasSelection()) {
      // Delete selected content
      logger.debug(LOG_CATEGORIES.EDITOR, 'Deleting selection via backspace');
      await this.deleteSelection();
      await this.recalculateBeats();
      logger.timeEnd('handleBackspace', LOG_CATEGORIES.EDITOR);
      return;
    }

    // WASM-first approach: Use deleteAtCursor which operates on internal DOCUMENT
    try {
      const result = this.wasmModule.deleteAtCursor();

      logger.debug(LOG_CATEGORIES.EDITOR, 'deleteAtCursor result from WASM', result);

      // CRITICAL: Backspace can DELETE lines (not just edit them)
      // When an empty line is deleted, we need to resync the entire document
      // to get the updated line count. Applying dirty lines alone won't catch deletions.
      const wasmDoc = this.wasmModule.getDocumentSnapshot();

      // WASM owns document state - no need to sync
      // Cursor position is managed by WASM internally
      // Just update visual display

      logger.debug(LOG_CATEGORIES.EDITOR, 'Document resynced after backspace', {
        lineCount: this.getDocument()?.lines?.length,
        cursorRow: result.caret?.caret?.line,
        cursorCol: result.caret?.caret?.col
      });

      // Recalculate beats after deletion
      await this.recalculateBeats();

      await this.renderAndUpdate();

      // Show cursor
      this.showCursor();

      // Restore visual selection after backspace
      this.updateSelectionDisplay();

      logger.info(LOG_CATEGORIES.EDITOR, 'Backspace completed successfully', {
        newCursorRow: result.caret?.caret?.line,
        newCursorCol: result.caret?.caret?.col
      });
    } catch (error) {
      // Handle "at start of document" case gracefully
      if (error && error.toString().includes('Cannot delete at start of document')) {
        logger.debug(LOG_CATEGORIES.EDITOR, 'Backspace at start of document, no action');
      } else {
        logger.error(LOG_CATEGORIES.EDITOR, 'Backspace failed', {
          error: error.message || error,
          stack: error.stack
        });
        console.error('Backspace failed:', error);
        this.showError('Backspace failed: ' + (error.message || error));
      }
    }

    logger.timeEnd('handleBackspace', LOG_CATEGORIES.EDITOR);
  }

  /**
     * Handle delete key with selection awareness and beat recalculation
     * Uses WASM-first approach for consistency with handleBackspace
     */
  async handleDelete() {
    logger.time('handleDelete', LOG_CATEGORIES.EDITOR);

    logger.info(LOG_CATEGORIES.EDITOR, 'Delete key pressed', {
      hasSelection: this.hasSelection()
    });

    if (this.hasSelection()) {
      // Delete selected content
      logger.debug(LOG_CATEGORIES.EDITOR, 'Deleting selection via delete key');
      await this.deleteSelection();
      await this.recalculateBeats();
      logger.timeEnd('handleDelete', LOG_CATEGORIES.EDITOR);
      return;
    }

    // WASM-first approach: Use deleteForward which operates on internal DOCUMENT
    try {
      const result = this.wasmModule.deleteForward();

      logger.debug(LOG_CATEGORIES.EDITOR, 'deleteForward result from WASM', result);

      // Get updated document from WASM (WASM owns document state)
      const wasmDoc = this.wasmModule.getDocumentSnapshot();

      logger.debug(LOG_CATEGORIES.EDITOR, 'Document resynced after delete', {
        lineCount: this.getDocument()?.lines?.length,
        cursorRow: result.caret?.caret?.line,
        cursorCol: result.caret?.caret?.col
      });

      // Recalculate beats after deletion
      await this.recalculateBeats();

      await this.renderAndUpdate();

      // Show cursor
      this.showCursor();

      // Restore visual selection after delete
      this.updateSelectionDisplay();

      logger.info(LOG_CATEGORIES.EDITOR, 'Delete completed successfully', {
        newCursorRow: result.caret?.caret?.line,
        newCursorCol: result.caret?.caret?.col
      });
    } catch (error) {
      // Handle "at end of document" case gracefully
      if (error && error.toString().includes('Cannot delete at end')) {
        logger.debug(LOG_CATEGORIES.EDITOR, 'Delete at end of document, no action');
      } else {
        logger.error(LOG_CATEGORIES.EDITOR, 'Delete failed', {
          error: error.message || error,
          stack: error.stack
        });
        console.error('Delete failed:', error);
        this.showError('Delete failed: ' + (error.message || error));
      }
    }

    logger.timeEnd('handleDelete', LOG_CATEGORIES.EDITOR);
  }

  /**
     * Handle Return/Enter key - split line at cursor position
     */
  async handleEnter() {
    console.log('🔄 handleEnter called (WASM-first)');
    logger.time('handleEnter', LOG_CATEGORIES.EDITOR);

    // If there's an actual selection (not just cursor position), clear it first
    if (this.hasSelection()) {
      console.log('🔄 Clearing selection before newline');
      this.clearSelection();
    }

    try {
      if (!this.getDocument() || !this.getDocument()?.lines || this.getDocument()?.lines?.length === 0) {
        console.error('🔄 No document');
        logger.error(LOG_CATEGORIES.EDITOR, 'No document or lines available');
        return;
      }

      logger.info(LOG_CATEGORIES.EDITOR, 'Inserting newline (WASM-first)');

      // NEW WASM-FIRST APPROACH: Call insertNewline which uses internal DOCUMENT state
      const result = this.wasmModule.insertNewline();

      console.log('🔄 WASM insertNewline returned:', result);

      // NOTE: No longer mutating this.theDocument - WASM owns the state
      // Renderer will fetch latest state from WASM via getDocumentSnapshot()

      logger.debug(LOG_CATEGORIES.CURSOR, 'Cursor moved to new line', {
        newLine: result.caret?.caret?.line,
        newColumn: result.caret?.caret?.col
      });

      // Extract dirty line indices for incremental rendering
      const dirtyLineIndices = result.dirty_lines.map(dl => dl.row);

      await this.renderAndUpdate(dirtyLineIndices);

      // Update cursor position display from WASM state
      this.updateCursorPositionDisplay();
      this.showCursor();

      logger.info(LOG_CATEGORIES.EDITOR, 'Line split successfully', {
        totalLines: this.getDocument()?.lines?.length || 0
      });
    } catch (error) {
      logger.error(LOG_CATEGORIES.EDITOR, 'Failed to split line', {
        error: error.message,
        stack: error.stack
      });
      console.error('Failed to split line:', error);
      this.showError('Failed to split line: ' + error.message);
    }

    logger.timeEnd('handleEnter', LOG_CATEGORIES.EDITOR);
  }

  /**
     * Recalculate beats after content changes
     */
  async recalculateBeats() {
    try {
      if (this.getDocument() && this.getDocument()?.lines && this.getDocument()?.lines?.length > 0) {
        const line = this.getCurrentLine();
        if (!line) return;

        this.addToConsoleLog(`Editor updated`);
      }
    } catch (error) {
      console.error('Failed to recalculate beats:', error);
    }
  }

  /**
     * Get current text content from the document
     */
  getCurrentTextContent() {
    if (!this.getDocument() || !this.getDocument()?.lines || this.getDocument()?.lines?.length === 0) {
      return '';
    }

    const line = this.getCurrentLine();
    if (!line) return '';
    const cells = line.cells;

    return cells.map(cell => cell.char || '').join('');
  }

  /**
     * Validate that a selection is valid for musical commands
     */
  /**
   * Get visually selected cells from the DOM
   * Returns {start, end} or null if no cells have .selected class
   */
  getVisuallySelectedCells() {
    const selectedCells = this.element.querySelectorAll('.char-cell.selected');
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

    // SECOND: If there's a user selection in WASM, use it (returns {start: {line, col}, end: {line, col}})
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
    const line = this.getCurrentLine();
    if (!line || !line.cells || line.cells.length === 0) {
      return null;
    }

    const cursorPos = this.getCursorPosition();

    // Special case: cursor at position 0 with cells present -> target first cell
    if (cursorPos === 0 && line.cells.length > 0) {
      return {
        start: 0,
        end: 1
      };
    }

    const { cell_index: cellIndex, char_offset_in_cell: charOffsetInCell } = this.charPosToCellIndex(cursorPos);

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

  validateSelectionForCommands() {
    const selection = this.getEffectiveSelection();
    if (!selection) {
      console.log('No selection or element to left of cursor');
      return false;
    }

    // Check if selection is empty (half-open range [start, end))
    if (selection.start >= selection.end) {
      console.log('Empty selection for command');
      return false;
    }

    // Get selected text from the line to check if it contains valid musical elements
    const line = this.getCurrentLine();
    if (!line || !line.cells) {
      console.log('No line or cells available for validation');
      return false;
    }

    const cells = line.cells || [];
    // Use half-open range [start, end)
    const selectedCells = cells.filter((cell, index) =>
      index >= selection.start && index < selection.end
    );
    const selectedText = selectedCells.map(cell => cell.char || '').join('');

    if (!selectedText || selectedText.trim().length === 0) {
      this.showError('Empty selection - please select text to apply musical commands', {
        source: 'Command Validation'
      });
      return false;
    }

    return true;
  }

  // ============================================================================
  // NOTE: Old slur methods removed - use layered API instead
  // Use applySlurLayered(line, start_col, end_col) / removeSlurLayered() from WASM
  // ============================================================================

  // ============================================================================
  // NOTE: Old octave methods removed - use layered API instead
  // Use shiftOctave(line, start_col, end_col, delta) from WASM
  // ============================================================================

  /**
     * Show tala input dialog
     */
  showTalaDialog() {
    const tala = prompt('Enter tala (digits 0-9+):');
    if (tala !== null) {
      this.setTala(tala);
    }
  }

  /**
     * Set tala for current line
     */
  async setTala(talaString) {
    try {
      if (this.wasmModule) {
        const currentStave = this.getCurrentStave();

        // Call modern WASM API (operates on internal DOCUMENT)
        const result = this.wasmModule.setLineTalaModern(currentStave, talaString);

        if (!result.success) {
          throw new Error(result.error || 'Unknown error');
        }

        console.log(`📝 Tala set to: ${talaString} on line ${currentStave}`);
        this.addToConsoleLog(`Tala set to: ${talaString}`);
        await this.renderAndUpdate();
      }
    } catch (error) {
      console.error('Failed to set tala:', error);
      this.showError('Failed to set tala');
    }
  }

  /**
     * Schedule a debounced staff notation update (100ms delay)
     * Only updates if the staff notation tab is currently active
     */
  scheduleStaffNotationUpdate() {
    // **CRITICAL FIX**: Skip scheduling timer during UI initialization
    // This prevents double-render: one from the autosave timer, one from switchTab() immediate render
    // Check this.ui.isInitialized (set to true at end of ui.initialize())
    if (!this.ui || !this.ui.isInitialized) {
      return;
    }

    // Clear any pending update
    if (this.staffNotationTimer) {
      clearTimeout(this.staffNotationTimer);
    }

    // Schedule new update with 100ms debounce
    this.staffNotationTimer = setTimeout(async () => {
      // Only render if staff notation tab is active
      if (this.ui && this.ui.activeTab === 'staff-notation') {
        await this.renderStaffNotation();
      }
    }, 100);
  }

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
     * Render the current document
     * @param {number[]} dirtyLineIndices - Optional array of line indices to render (incremental)
     */
  async render(dirtyLineIndices = null) {
    if (!this.renderer) {
      return;
    }

    try {
      console.log('📝 render() called', { dirtyLineIndices });

      // Merge annotation layer (slurs, ornaments, etc.) into cells before rendering
      // This updates the WASM internal document with slur indicators on cells
      if (this.wasmModule && this.wasmModule.applyAnnotationSlursToCells) {
        this.wasmModule.applyAnnotationSlursToCells();
      }

      // Merge annotation layer ornaments into cells before rendering
      if (this.wasmModule && this.wasmModule.applyAnnotationOrnamentsToCells) {
        this.wasmModule.applyAnnotationOrnamentsToCells();
      }

      // Get the updated document from WASM (with slur/ornament indicators merged)
      // WASM is the only source of truth - we just read for rendering
      let doc;
      if (this.wasmModule && this.wasmModule.getDocumentSnapshot) {
        doc = this.wasmModule.getDocumentSnapshot();
        // DO NOT store to this.theDocument - WASM owns the state
      } else {
        // Fallback: get from WASM via getDocument() helper
        doc = this.getDocument();
      }

      console.log('📝 calling renderer.renderDocument()');
      this.renderer.renderDocument(doc, dirtyLineIndices);
      console.log('📝 renderer.renderDocument() completed');

      // Y positions are now correctly set by Rust layout engine based on line index
      // No need to adjust in JavaScript anymore

      // Update pitch system and key signature displays in header
      if (this.ui) {
        this.ui.updateCurrentPitchSystemDisplay();
        this.ui.updateKeySignatureCornerDisplay();
      }

      // Schedule staff notation update (debounced)
      this.scheduleStaffNotationUpdate();
    } catch (error) {
      logger.error(LOG_CATEGORIES.RENDERER, 'Failed to render document', {
        error: error.message,
        stack: error.stack
      });
      // Show user-friendly error notification
      this.showError('Rendering error: Failed to render document', {
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
    this.updateDocumentDisplay();
  }

  /**
     * Setup event handlers
     */
  setupEventHandlers() {
    // NOTE: Keyboard events are handled by EventManager globally
    // to avoid duplicate event handling

    // AutoSave cleanup on page unload
    window.addEventListener('beforeunload', () => {
      if (this.autoSave) {
        this.autoSave.stop();
      }
    });

    // Focus events - just handle visual changes
    // Note: Focus state now queried from EventManager, not stored
    this.element.addEventListener('focus', () => {
      this.element.classList.add('focused');
      this.showCursor();
    });

    this.element.addEventListener('blur', () => {
      this.element.classList.remove('focused');
      this.hideCursor();
    });

    // Mouse selection events
    this.element.addEventListener('mousedown', (event) => {
      // Check for middle-click (button === 1 for middle, not right)
      if (event.button === 1) {
        this.handleMiddleClick(event);
        return;
      }
      this.handleMouseDown(event);
    });

    this.element.addEventListener('mousemove', (event) => {
      this.handleMouseMove(event);
    });

    this.element.addEventListener('mouseup', (event) => {
      this.handleMouseUp(event);
    });

    // Handle mouseup outside editor to finish selection
    document.addEventListener('mouseup', (event) => {
      if (this.isDragging) {
        this.handleMouseUp(event);
      }
    });

    // Double click to select beat or character group
    this.element.addEventListener('dblclick', (event) => {
      this.handleDoubleClick(event);
    });

    // Click events - focus the editor and set line focus based on click position
    this.element.addEventListener('click', (event) => {
      this.element.focus({ preventScroll: true });

      // Check if this is a triple-click (detail === 3)
      if (event.detail === 3) {
        // Triple-click detected - select entire line
        const rect = this.element.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        const cellPosition = this.mouseHandler.calculateCellPosition(x, y);

        if (cellPosition !== null) {
          this.mouseHandler.selectLine(cellPosition);
        }
        event.preventDefault();
        return;
      }

      // Focus the closest line based on click position
      const rect = this.element.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const lineIndex = this.mouseHandler.calculateLineFromY(y);

      if (lineIndex !== null) {
        // Plain click (no modifiers) while selection is active: clear selection
        // This matches standard text editor behavior (Leafpad, Notepad, etc.)
        const hasSelection = this.hasSelection();
        const noModifiers = !event.shiftKey && !event.ctrlKey && !event.metaKey;

        // Don't clear selections that were just created by drag
        if (hasSelection && noModifiers && !this.justDragSelected) {
          // Calculate cursor position BEFORE clearing selection (before re-render)
          // This ensures we use coordinates from the original cell layout
          const cursorColumn = this.mouseHandler.calculateCellPosition(x, y);
          this.clearSelection();

          // Use WASM to set cursor position (WASM owns cursor state)
          if (cursorColumn !== null && this.wasmModule && this.wasmModule.mouseDown) {
            this.wasmModule.mouseDown(x, y);
            this.updateCursorVisualPosition();
          }
        }
      }
    }, true); // Use capture phase to catch clicks earlier

    // Also attach click handler to editor-container div for clicks outside notation lines
    const editorContainer = document.getElementById('editor-container');
    if (editorContainer) {
      editorContainer.addEventListener('click', (event) => {
        // Ignore clicks on notation lines themselves (let their handlers deal with it)
        if (event.target.closest('.notation-line')) {
          return;
        }

        this.element.focus({ preventScroll: true });

        // Focus the first line by default when clicking the container
        // WASM owns cursor state - use WASM API to move cursor
        if (this.wasmModule && this.wasmModule.moveHome) {
          this.wasmModule.moveHome(false); // false = don't extend selection
        }
      });
    }
  }

  /**
     * Handle mouse down - start selection or positioning
     */
  handleMouseDown(event) {
    this.mouseHandler.handleMouseDown(event);
  }

  handleMouseMove(event) {
    this.mouseHandler.handleMouseMove(event);
  }

  handleMouseUp(event) {
    this.mouseHandler.handleMouseUp(event);
  }

  handleDoubleClick(event) {
    this.mouseHandler.handleDoubleClick(event);
  }

  /**
     * Show cursor with enhanced blinking and positioning
     */
  showCursor() {
    const cursor = this.getCursorElement();
    if (cursor) {
      cursor.style.display = 'block';
      cursor.style.opacity = '1';
      // Always start blinking - the interval itself will check focus
      this.startCursorBlinking();
      this.updateCursorVisualPosition();
    }
  }

  /**
     * Hide cursor
     */
  hideCursor() {
    const cursor = this.getCursorElement();
    if (cursor) {
      cursor.style.display = 'none';
      this.stopCursorBlinking();
    }
  }

  /**
     * Get or create cursor element with enhanced styling
     */
  getCursorElement() {
    let cursor = document.querySelector('.cursor-indicator');

    if (!cursor) {
      // Create new cursor element
      cursor = this.createCursorElement();
    }

    // Append cursor to .line-content (not .notation-line)
    // This way cursor shares the same positioning context as cells
    // No gutter offset calculations needed
    const currentStave = this.getCurrentStave();
    const lineContainers = this.element.querySelectorAll('.notation-line');
    if (lineContainers.length > currentStave) {
      const lineContainer = lineContainers[currentStave];
      const lineContent = lineContainer.querySelector('.line-content');
      if (lineContent && cursor.parentElement !== lineContent) {
        lineContent.appendChild(cursor);
      }
    }

    return cursor;
  }

  /**
     * Create cursor element with proper styling
     */
  createCursorElement() {
    const cursor = document.createElement('div');
    cursor.className = 'cursor-indicator';

    // Add cursor animation styles
    const style = document.createElement('style');
    style.textContent = `
            @keyframes cursor-blink {
                0%, 50% { opacity: 1; }
                51%, 100% { opacity: 0; }
            }

            .cursor-indicator {
                width: 2px;
                height: ${BASE_FONT_SIZE}px;
                background-color: #0066cc;
                z-index: 5;
                pointer-events: none;
            }

            .cursor-indicator.blinking {
                animation: cursor-blink 1s step-end infinite;
            }

            .cursor-indicator.focused {
                background-color: #004499;
                box-shadow: 0 0 3px rgba(0, 102, 204, 0.5);
            }
        `;
    document.head.appendChild(style);

    return cursor;
  }

  /**
     * Start cursor blinking animation
     */
  startCursorBlinking() {
    // Clear any existing interval to prevent multiple intervals from running
    if (this._blinkInterval) {
      clearInterval(this._blinkInterval);
      this._blinkInterval = null;
    }

    const cursor = this.getCursorElement();
    if (cursor) {
      cursor.classList.add('blinking');

      // Stop blinking on focus loss
      this._blinkInterval = setInterval(() => {
        if (this.eventManager && !this.eventManager.editorFocus()) {
          this.stopCursorBlinking();
        }
      }, 100);
    }
  }

  /**
     * Stop cursor blinking animation
     */
  stopCursorBlinking() {
    const cursor = this.getCursorElement();
    if (cursor) {
      cursor.classList.remove('blinking');
    }

    if (this._blinkInterval) {
      clearInterval(this._blinkInterval);
      this._blinkInterval = null;
    }
  }

  /**
     * Update cursor visual positioning (cell-based)
     */
  updateCursorVisualPosition() {
    const cursor = this.getCursorElement();
    if (!cursor) {
      return;
    }

    const cellCol = this.getCursorPosition(); // Cell column (0 = before first cell, N = after Nth cell)
    const currentStave = this.getCurrentStave();

    // console.log(`📍 updateCursorVisualPosition: currentStave=${currentStave}, cellCol=${cellCol}`);

    // SIMPLIFIED: Cursor is now a child of the current .notation-line
    // So it's positioned absolutely relative to its line container
    // We just need the Y from the first cell of the current line

    let yOffset = 32; // Default fallback
    let cellHeight = BASE_FONT_SIZE; // Default fallback for cursor height

    // Find first cell to get its Y position and height (relative to the line)
    const cells = this.element.querySelectorAll(`[data-line-index="${currentStave}"]`);
    // console.log(`📍 Found ${cells.length} cells for line ${currentStave}`);

    if (cells.length > 0) {
      const firstCell = cells[0];
      const cellTop = parseInt(firstCell.style.top) || 32;
      // console.log(`📍 First cell top: ${firstCell.style.top}, parsed as: ${cellTop}px`);
      yOffset = cellTop; // This is already relative to the line, no offset needed

      // Get actual cell height from the cell container (matches WASM display list)
      const cellContainer = firstCell.closest('.cell-container');
      if (cellContainer) {
        const declaredHeight = parseInt(cellContainer.style.height);
        if (declaredHeight) {
          cellHeight = declaredHeight;
          // console.log(`📍 Using cell height from DOM: ${cellHeight}px`);
        }
      }
    } else {
      // console.log(`📍 No cells found for line ${currentStave}, using default yOffset=${yOffset}px`);
    }

    // Calculate pixel position using cell column (one cell = one glyph)
    const pixelPos = this.cellColToPixel(cellCol);
    // console.log(`📍 cellColToPixel(${cellCol}) returned: ${pixelPos}px`);

    // console.log(`📍 Setting cursor: left=${pixelPos}px, top=${yOffset}px, height=${cellHeight}px`);

    // Set cursor position (position: absolute relative to .line-content)
    // Shares same coordinate system as cells - no offset needed
    cursor.style.position = 'absolute';
    cursor.style.left = `${pixelPos}px`;
    cursor.style.top = `${yOffset}px`;
    cursor.style.height = `${cellHeight}px`;

    // Update cursor appearance based on state
    if (this.eventManager && this.eventManager.editorFocus()) {
      cursor.classList.add('focused');
    } else {
      cursor.classList.remove('focused');
    }

    // Ensure cursor is visible when focused
    if (this.eventManager && this.eventManager.editorFocus()) {
      cursor.style.opacity = '1';
    }

    // CRITICAL: Scroll cursor into view so typed characters are always visible
    // Wait for browser to paint the new cursor position before scrolling
    requestAnimationFrame(() => {
      this.scrollCursorIntoView();
    });
  }

  /**
   * Scroll the viewport to ensure the cursor is visible
   */
  scrollCursorIntoView() {
    const cursor = this.getCursorElement();
    if (!cursor) return;

    // Get the ACTUAL scroll container (not this.element which is #editor-root)
    const scrollContainer = document.getElementById('editor-container');
    if (!scrollContainer) {
      console.warn('Scroll container #editor-container not found');
      return;
    }

    // Find the notation-line that contains the cursor
    const notationLine = cursor.closest('.notation-line');
    if (!notationLine) {
      // Fallback to simple cursor scrolling if no line found
      cursor.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
      return;
    }

    // Get the line's declared height (includes beat loops, lyrics, etc.)
    const lineHeight = parseFloat(notationLine.style.height) || notationLine.getBoundingClientRect().height;

    // Get positions
    const cursorRect = cursor.getBoundingClientRect();
    const lineRect = notationLine.getBoundingClientRect();
    const containerRect = scrollContainer.getBoundingClientRect();

    // Calculate the actual bottom of the line content (line top + full height)
    const lineContentBottom = lineRect.top + lineHeight;

    // Check if line is outside viewport (vertically)
    // Line is above viewport if its bottom is above container top
    const isAboveViewport = lineContentBottom < containerRect.top;
    // Line is below viewport if its top is below container bottom
    const isBelowViewport = lineRect.top > containerRect.bottom;

    // Check if cursor is outside viewport (horizontally)
    const isLeftOfViewport = cursorRect.left < containerRect.left;
    const isRightOfViewport = cursorRect.right > containerRect.right;

    // Scroll if needed
    if (isAboveViewport || isBelowViewport) {
      // For vertical scrolling, calculate the target scroll position manually
      // to ensure the ENTIRE line (including beat loops, lyrics, etc.) is visible
      const currentScrollTop = scrollContainer.scrollTop;

      let targetScrollTop = currentScrollTop;

      if (isAboveViewport) {
        // Line is above viewport - scroll UP to show the top of the line
        // Target: line top aligned with container top
        const lineTopRelativeToContainer = lineRect.top - containerRect.top;
        targetScrollTop = currentScrollTop + lineTopRelativeToContainer;
      } else if (isBelowViewport) {
        // Line is below viewport - scroll DOWN to show the entire line
        // Target: line bottom aligned with container bottom
        const lineBottomRelativeToContainer = lineContentBottom - containerRect.bottom;
        targetScrollTop = currentScrollTop + lineBottomRelativeToContainer;
      }

      // Smooth scroll to target position
      scrollContainer.scrollTo({
        top: targetScrollTop,
        behavior: 'smooth'
      });
    }

    // Handle horizontal scrolling separately (cursor-based)
    if (isLeftOfViewport || isRightOfViewport) {
      const currentScrollLeft = scrollContainer.scrollLeft;
      let targetScrollLeft = currentScrollLeft;

      if (isLeftOfViewport) {
        const cursorLeftRelativeToContainer = cursorRect.left - containerRect.left;
        targetScrollLeft = currentScrollLeft + cursorLeftRelativeToContainer - 20; // 20px padding
      } else if (isRightOfViewport) {
        const cursorRightRelativeToContainer = cursorRect.right - containerRect.right;
        targetScrollLeft = currentScrollLeft + cursorRightRelativeToContainer + 20; // 20px padding
      }

      scrollContainer.scrollTo({
        left: targetScrollLeft,
        behavior: 'smooth'
      });
    }
  }


  // NOTE: updateCursorPositionDisplay() moved to CursorCoordinator
  // See line 2953 for delegate method

  /**
     * Update document display in debug panel
     */
  async updateIRDisplay() {
    return this.exportManager.updateIRDisplay();
  }

  async updateMusicXMLDisplay() {
    return this.exportManager.updateMusicXMLDisplay();
  }

  async updateLilyPondDisplay() {
    return this.exportManager.updateLilyPondDisplay();
  }

  /**
   * Update HTML display showing rendered notation line
   * NOTE: This method is now UNUSED - replaced by InspectorCoordinator.updateHTMLDisplay()
   * Kept for backwards compatibility. Will be removed in a future refactor.
   */
  updateHTMLDisplay() {
    const htmlContent = document.getElementById('html-content');
    if (!htmlContent || !this.renderer || !this.renderer.element) {
      return;
    }

    try {
      // Get the first notation line element
      const lineElements = this.renderer.element.querySelectorAll('[data-line]');

      if (lineElements.length > 0) {
        const firstLine = lineElements[0];
        const htmlString = this.formatHTML(firstLine.outerHTML);
        htmlContent.textContent = htmlString;
      } else {
        htmlContent.textContent = '<!-- No lines rendered yet -->';
      }
    } catch (error) {
      console.error('Error updating HTML display:', error);
      htmlContent.textContent = `<!-- Error: ${error.message} -->`;
    }
  }

  /**
   * Format HTML string for display with proper indentation
   */
  formatHTML(html) {
    let formatted = html;
    let indent = 0;
    const indentSize = 2;

    // Add newlines between tags
    formatted = formatted.replace(/></g, '>\n<');
    const lines = formatted.split('\n');

    const formattedLines = lines.map(line => {
      const trimmed = line.trim();

      // Decrease indent for closing tags
      if (trimmed.match(/^<\//)) {
        indent = Math.max(0, indent - indentSize);
      }

      const indented = ' '.repeat(indent) + trimmed;

      // Increase indent for opening tags (but not self-closing or inline)
      if (trimmed.match(/^<[^/!]/) && !trimmed.match(/\/>$/) && !trimmed.match(/<\/.*>$/)) {
        indent += indentSize;
      }

      return indented;
    });

    return formattedLines.join('\n');
  }

  updateDocumentDisplay() {
    console.log(`[Editor] updateDocumentDisplay() called, activeTab: '${this.ui?.activeTab}'`);

    // PERFORMANCE FIX: Only update inspector tabs if they're actually visible
    // All of these operations process the entire document and should not run on every keystroke

    // Update display list tab (pre-computed render commands from WASM)
    if (this.ui && this.ui.activeTab === 'displaylist') {
      const displayListDisplay = document.getElementById('displaylist-display');
      if (displayListDisplay && this.displayList) {
        displayListDisplay.textContent = JSON.stringify(this.displayList, null, 2);
      }
    }

    // Update persistent model (saveable content only, no state)
    if (this.ui && this.ui.activeTab === 'persistent') {
      const persistentJson = document.getElementById('persistent-json');
      if (persistentJson) {
        // Rust handles field exclusion via #[serde(skip)] on ephemeral fields (state, x, y, w, h, etc.)
        // Just exclude the runtime state field - WASM serialization handles the rest
        const persistentDoc = this.getDocument();

        // DEBUG: Log what fields are actually present (disabled)
        // console.log('Document keys:', Object.keys(persistentDoc));
        // if (persistentDoc.lines && persistentDoc.lines[0]) {
        //   console.log('Line[0] keys:', Object.keys(persistentDoc.lines[0]));
        // }

        const displayDoc = this.createDisplayDocument(persistentDoc);
        persistentJson.textContent = this.toYAML(displayDoc);
      }
    }

    // PERFORMANCE FIX: Only update expensive inspector tabs if they're visible
    // These are heavy WASM operations that should not run on every keystroke
    if (this.ui && this.ui.activeTab === 'ir') {
      this.updateIRDisplay().catch(err => {
        console.error('Failed to update IR display:', err);
      });
    }

    if (this.ui && this.ui.activeTab === 'musicxml') {
      this.updateMusicXMLDisplay().catch(err => {
        console.error('Failed to update MusicXML display:', err);
      });
    }

    if (this.ui && this.ui.activeTab === 'lilypond-src') {
      this.updateLilyPondDisplay().catch(err => {
        console.error('Failed to update LilyPond display:', err);
      });
    }

    // Update HTML display only if visible
    if (this.ui && this.ui.activeTab === 'html') {
      this.updateHTMLDisplay();
    }

    // Update hitboxes display only if visible
    if (this.ui && this.ui.activeTab === 'hitboxes') {
      this.updateHitboxesDisplay();
    }
  }

  /**
   * Force update all export tabs immediately (used when key signature changes)
   * This bypasses the performance optimization in updateDocumentDisplay()
   * which only updates visible tabs.
   */
  async forceUpdateAllExports() {
    // Update all export formats regardless of which tab is visible
    try {
      // CRITICAL: Clear OSMD cache to force re-render with new key signature
      if (this.osmdRenderer) {
        console.log('[forceUpdateAllExports] Clearing OSMD cache for key signature change');
        this.osmdRenderer.lastMusicXmlHash = null; // Force cache miss
        await this.osmdRenderer.clearAllCache(); // Clear IndexedDB cache
      }

      await Promise.all([
        this.updateIRDisplay().catch(err => {
          console.error('Failed to update IR display:', err);
        }),
        this.updateMusicXMLDisplay().catch(err => {
          console.error('Failed to update MusicXML display:', err);
        }),
        this.updateLilyPondDisplay().catch(err => {
          console.error('Failed to update LilyPond display:', err);
        }),
        // Also update staff notation (OSMD/VexFlow rendering)
        this.renderStaffNotation().catch(err => {
          console.error('Failed to update staff notation:', err);
        })
      ]);
    } catch (error) {
      console.error('Failed to force update exports:', error);
    }
  }

  /**
     * Convert JavaScript object to concise YAML format
     */
  toYAML(obj, indent = 0) {
    const spaces = '  '.repeat(indent);

    if (obj === null) return 'null';
    if (obj === undefined) return 'undefined';

    const type = typeof obj;

    // Handle primitives
    if (type === 'string') return `"${obj}"`;
    if (type === 'number' || type === 'boolean') return String(obj);

    // Handle arrays
    if (Array.isArray(obj)) {
      if (obj.length === 0) return '[]';

      // Inline for simple arrays
      if (obj.every(item => typeof item !== 'object' || item === null)) {
        const items = obj.map(item => this.toYAML(item, 0)).join(', ');
        return `[${items}]`;
      }

      // Multi-line for complex arrays
      return `\n${obj.map(item => {
        const value = this.toYAML(item, indent + 1);
        if (value.startsWith('\n')) {
          return `${spaces}  -${value}`;
        }
        return `${spaces}  - ${value}`;
      }).join('\n')}`;
    }

    // Handle objects
    if (type === 'object') {
      let keys = Object.keys(obj);
      if (keys.length === 0) return '{}';

      // Special ordering for root document: alphabetical with 'lines' at the end
      if (indent === 0 && keys.includes('lines')) {
        const linesKey = 'lines';
        const otherKeys = keys.filter(k => k !== 'lines').sort();
        keys = [...otherKeys, linesKey];
      }

      return `\n${keys.map(key => {
        const value = this.toYAML(obj[key], indent + 1);
        if (value.startsWith('\n')) {
          return `${spaces}  ${key}:${value}`;
        }
        return `${spaces}  ${key}: ${value}`;
      }).join('\n')}`;
    }

    return String(obj);
  }

  /**
     * Create a display-friendly version of the document with string pitch systems
     */
  createDisplayDocument(doc) {
    // Deep clone the document
    const displayDoc = JSON.parse(JSON.stringify(doc));

    // Ensure all document-level metadata fields are present (even if empty/null)
    displayDoc.title = displayDoc.title ?? null;
    displayDoc.composer = displayDoc.composer ?? null;
    displayDoc.tonic = displayDoc.tonic ?? null;
    displayDoc.key_signature = displayDoc.key_signature ?? null;
    displayDoc.created_at = displayDoc.created_at ?? null;
    displayDoc.modified_at = displayDoc.modified_at ?? null;
    displayDoc.version = displayDoc.version ?? null;

    // Convert document-level pitch_system to string
    displayDoc.pitch_system = displayDoc.pitch_system ?? null;
    if (typeof displayDoc.pitch_system === 'number') {
      const systemNum = displayDoc.pitch_system;
      displayDoc.pitch_system = `${this.getPitchSystemName(systemNum)} (${systemNum})`;
    }

    // Ensure all Line metadata fields are present (even if empty)
    if (displayDoc.lines && Array.isArray(displayDoc.lines)) {
      displayDoc.lines.forEach(line => {
        // Ensure all metadata fields exist with empty string defaults
        line.label = line.label ?? '';
        line.tala = line.tala ?? '';
        line.lyrics = line.lyrics ?? '';
        line.tonic = line.tonic ?? '';
        line.pitch_system = line.pitch_system ?? 0;
        line.key_signature = line.key_signature ?? '';
        line.tempo = line.tempo ?? '';
        line.time_signature = line.time_signature ?? '';

        // Convert line pitch_system to string for display
        if (typeof line.pitch_system === 'number') {
          const systemNum = line.pitch_system;
          line.pitch_system = systemNum === 0 ? '(not set)' : `${this.getPitchSystemName(systemNum)} (${systemNum})`;
        }
      });
    }

    return displayDoc;
  }

  /**
     * Update hitboxes display in debug panel
     */
  updateHitboxesDisplay() {
    const hitboxesContainer = document.getElementById('hitboxes-container');

    if (!hitboxesContainer) {
      return;
    }

    if (!this.getDocument().lines || this.getDocument()?.lines?.length === 0) {
      hitboxesContainer.innerHTML = '<div class="text-gray-500 text-sm">No hitboxes available. Add some content to see hitbox information.</div>';
      return;
    }

    let hitboxHTML = '<div class="space-y-4">';

    this.getDocument()?.lines?.forEach((stave, staveIndex) => {
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
    if (!this.getDocument() || !this.getDocument()?.lines) {
      return;
    }

    this.getDocument()?.lines?.forEach((stave, staveIndex) => {
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

  /**
     * Show error message with enhanced handling
     */
  showError(message, options = {}) {
    const errorInfo = {
      message,
      timestamp: new Date().toISOString(),
      source: options.source || 'Editor',
      recoverable: options.recoverable !== false,
      details: options.details || null
    };

    console.error(message, errorInfo);
    this.addToConsoleErrors(errorInfo);

    // Show user notification if recoverable
    if (errorInfo.recoverable) {
      this.showUserNotification(errorInfo);
    }

    this.recordError(errorInfo);
  }

  /**
     * Show warning message
     */
  showWarning(message, options = {}) {
    const warningInfo = {
      message,
      timestamp: new Date().toISOString(),
      source: options.source || 'Editor',
      details: options.details || null
    };

    console.warn(message, warningInfo);
    this.addToConsoleWarnings(warningInfo);

    // Show user notification for important warnings
    if (options.important) {
      this.showUserNotification({
        ...warningInfo,
        type: 'warning'
      });
    }
  }

  /**
     * Add message to console errors with enhanced information
     */
  addToConsoleErrors(errorInfo) {
    const errorsTab = document.getElementById('console-errors-list');
    if (errorsTab) {
      // Remove placeholder if this is the first real entry
      this.removePlaceholder(errorsTab);

      const errorElement = this.createConsoleEntry(errorInfo, 'error');
      errorsTab.appendChild(errorElement);
      errorsTab.scrollTop = errorsTab.scrollHeight;

      // Limit error history to prevent memory issues
      this.limitConsoleHistory(errorsTab, 100);
    }
  }

  /**
     * Add message to console warnings
     */
  addToConsoleWarnings(warningInfo) {
    const warningsTab = document.getElementById('console-warnings-list');
    if (warningsTab) {
      const warningElement = this.createConsoleEntry(warningInfo, 'warning');
      warningsTab.appendChild(warningElement);
      warningsTab.scrollTop = warningsTab.scrollHeight;

      // Limit warning history
      this.limitConsoleHistory(warningsTab, 50);
    }
  }

  /**
     * Add message to console log
     */
  addToConsoleLog(message) {
    const logTab = document.getElementById('console-log-list');
    if (logTab) {
      // Remove placeholder if this is the first real entry
      this.removePlaceholder(logTab);

      const logElement = this.createConsoleEntry({
        message: typeof message === 'string' ? message : JSON.stringify(message),
        timestamp: new Date().toISOString(),
        source: 'Editor'
      }, 'log');

      logTab.appendChild(logElement);
      logTab.scrollTop = logTab.scrollHeight;

      // Limit log history
      this.limitConsoleHistory(logTab, 200);
    }
  }

  /**
     * Create console entry element
     */
  createConsoleEntry(info, type) {
    const element = document.createElement('div');
    element.className = `console-entry console-${type}`;

    const timestamp = new Date(info.timestamp || new Date().toISOString());
    const typeClass = type === 'error' ? 'text-error' : type === 'warning' ? 'text-warning' : 'text-info';

    element.innerHTML = `
            <span class="${typeClass}">${timestamp.toLocaleTimeString()}</span>
            <span class="font-medium">${this.capitalizeFirst(type)}:</span>
            <span>${info.message}</span>
            ${info.source ? `<span class="text-ui-disabled-text text-xs ml-2">(${info.source})</span>` : ''}
        `;

    // Add details if available
    if (info.details) {
      const detailsElement = document.createElement('details');
      detailsElement.className = 'console-details text-xs mt-1';
      detailsElement.innerHTML = `<summary>Details</summary><pre class="bg-ui-background p-1 rounded">${info.details}</pre>`;
      element.appendChild(detailsElement);
    }

    return element;
  }

  /**
     * Show user notification (DISABLED)
     */
  showUserNotification(info) {
    // Notification popups disabled - log to console instead
    console.log(`[${info.type || 'info'}] ${info.message}`);
  }

  /**
     * Remove placeholder text from console tabs
     */
  removePlaceholder(container) {
    // Check if the first child is a placeholder
    const firstChild = container.firstElementChild;
    if (firstChild && firstChild.textContent.includes('No logs') ||
            firstChild && firstChild.textContent.includes('No errors')) {
      container.removeChild(firstChild);
    }
  }

  /**
     * Limit console history to prevent memory issues
     */
  limitConsoleHistory(container, maxEntries) {
    const entries = container.children;
    while (entries.length > maxEntries) {
      container.removeChild(entries[0]);
    }
  }

  /**
     * Record error for performance monitoring
     */
  recordError(errorInfo) {
    if (!this.errorHistory) {
      this.errorHistory = [];
    }

    this.errorHistory.push({
      ...errorInfo,
      count: 1
    });

    // Keep only last 100 errors
    if (this.errorHistory.length > 100) {
      this.errorHistory.shift();
    }

    // Check for error patterns
    this.analyzeErrorPatterns();
  }

  /**
     * Analyze error patterns for troubleshooting
     */
  analyzeErrorPatterns() {
    if (this.errorHistory.length < 5) return;

    // Check for repeated errors
    const errorCounts = {};
    this.errorHistory.forEach(error => {
      const key = error.message.substring(0, 50); // First 50 chars as key
      errorCounts[key] = (errorCounts[key] || 0) + 1;
    });

    const repeatedErrors = Object.entries(errorCounts).filter(([_, count]) => count > 3);
    if (repeatedErrors.length > 0) {
      console.warn('Repeated error patterns detected:', repeatedErrors);
    }
  }



  /**
     * Capitalize first letter
     */
  capitalizeFirst(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  async exportMusicXML() {
    return this.exportManager.exportMusicXML();
  }

  async renderStaffNotation() {
    return this.exportManager.renderStaffNotation();
  }

  /**
   * Handle Ctrl+A (Select All) - select all content in document
   */
  handleSelectAll() {
    if (!this.getDocument() || !this.wasmModule) {
      console.warn('Cannot select all: document or WASM not ready');
      return;
    }

    const doc = this.getDocument();

    // Find first and last positions
    if (!doc.lines || doc.lines.length === 0) {
      console.warn('No content to select');
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
      this.wasmModule.setSelection(anchor, head);
      console.log('[SelectAll] Selected from', anchor, 'to', head);

      // Re-render to show selection
      this.render();
    } catch (error) {
      console.error('Failed to select all:', error);
    }
  }

  /**
   * Handle Ctrl+C (Copy) - copy selected cells in rich format
   */
  handleCopy() {
    if (!this.getDocument() || !this.wasmModule) {
      console.warn('Cannot copy: document or WASM not ready');
      return;
    }

    // Check if there's a selection (now queries WASM)
    if (!this.hasSelection()) {
      console.warn('No selection to copy');
      return;
    }

    try {
      // CRITICAL: Ensure WASM document is in sync before copying
      try {
        // WASM already has document internally - no need to load
      } catch (e) {
        console.warn('Failed to sync document with WASM before copy:', e);
      }

      // Get selection from WASM (single source of truth)
      const selection = this.getSelection();
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
      const copyResult = this.wasmModule.copyCells(startRow, startCol, endRow, endCol);

      if (copyResult && copyResult.text) {
        // Store in clipboard (both text for system clipboard, cells for rich paste)
        this.clipboard.text = copyResult.text;
        this.clipboard.cells = copyResult.cells || [];

        // Also copy to system clipboard
        navigator.clipboard.writeText(copyResult.text).catch(err => {
          console.warn('Failed to copy to system clipboard:', err);
        });

        // Sync primary selection register with Ctrl+C (keeps both in sync)
        try {
          this.wasmModule.updatePrimarySelection(startRow, startCol, endRow, endCol, copyResult.cells);
        } catch (e) {
          console.warn('Failed to update primary selection:', e);
        }

        this.addToConsoleLog(`Copied ${copyResult.cells?.length || 0} cells`);
      }
    } catch (error) {
      console.error('Copy failed:', error);
      this.showError('Copy failed', { details: error.message });
    }
  }

  /**
   * Update primary selection register (X11 style)
   * Called automatically when selection changes to support select-to-copy
   */
  updatePrimarySelection() {
    if (!this.getDocument() || !this.wasmModule) {
      return;
    }

    // Check if there's a selection
    if (!this.hasSelection()) {
      return; // Keep last selection if selection is cleared
    }

    try {
      // Ensure WASM document is in sync
      try {
        // WASM already has document internally - no need to load
      } catch (e) {
        console.warn('Failed to sync document with WASM before primary selection update:', e);
      }

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
      const copyResult = this.wasmModule.copyCells(startRow, startCol, endRow, endCol);

      if (copyResult && copyResult.text && copyResult.cells) {
        // Update JS-side clipboard (same as Ctrl+C does in handleCopy)
        this.clipboard.text = copyResult.text;
        this.clipboard.cells = copyResult.cells || [];

        // Update primary selection in WASM
        this.wasmModule.updatePrimarySelection(startRow, startCol, endRow, endCol, copyResult.cells);

        // Also sync to system clipboard (Linux select-to-copy behavior)
        navigator.clipboard.writeText(copyResult.text).catch(err => {
          // Silently fail - clipboard permission may be restricted
        });
      }
    } catch (error) {
      console.error('Primary selection update failed:', error);
    }
  }

  /**
   * Handle middle-click paste (X11 style primary selection)
   * Pastes from the primary selection register at the clicked position
   */
  async handleMiddleClick(event) {
    if (!this.getDocument() || !this.wasmModule) {
      console.warn('Cannot middle-click paste: document or WASM not ready');
      return;
    }

    event.preventDefault(); // Prevent default scroll paste behavior

    try {
      // Ensure WASM has the latest document state
      // WASM already has document internally - no need to load

      // Try to get primary selection (X11 style - from previous selection)
      const primarySelection = this.wasmModule.getPrimarySelection();

      // Fall back to system clipboard if no primary selection
      let cellsToPaste = [];
      let pasteSource = 'unknown';

      if (primarySelection && primarySelection.cells && primarySelection.cells.length > 0) {
        cellsToPaste = primarySelection.cells;
        pasteSource = 'primary selection';
      } else if (this.clipboard.cells && this.clipboard.cells.length > 0) {
        cellsToPaste = this.clipboard.cells;
        pasteSource = 'system clipboard';
      } else {
        console.warn('Nothing to paste (no primary selection or clipboard content)');
        return;
      }

      // Calculate position from mouse click
      const rect = this.element.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      // Determine which line was clicked
      const lineIndex = this.mouseHandler?.calculateLineFromY(y);
      const col = this.mouseHandler?.calculateCellPosition(x, y);

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
      const result = this.wasmModule.pasteCells(startRow, startCol, endRow, endCol, cellsToPaste);

      // Update document from WASM result
      if (result && result.dirty_lines) {
        for (const dirtyLine of result.dirty_lines) {
          if (dirtyLine.row < this.getDocument()?.lines?.length) {
            // WASM owns document - no need to apply dirty lines;
          }
        }
      }

      // Update cursor position from WASM result
      if (result && typeof result.new_cursor_col !== 'undefined') {
        this.setCursorPosition(result.new_cursor_col);
      } else {
        // Fallback: position after pasted content
        this.setCursorPosition(startCol + cellsToPaste.length);
      }

      // Clear selection
      this.clearSelection();

      this.addToConsoleLog(`Pasted ${cellsToPaste.length} cells from ${pasteSource}`);
      this.render();
    } catch (error) {
      console.error('Middle-click paste failed:', error);
      this.showError('Paste failed', { details: error.message });
    }
  }

  /**
   * Handle Ctrl+X (Cut) - copy and delete selection
   */
  handleCut() {
    if (!this.getDocument()) {
      console.warn('Cannot cut: document not ready');
      return;
    }

    // First copy
    this.handleCopy();

    // Then delete the selection (if it still exists after copy)
    if (this.hasSelection()) {
      // Delete the selected range
      this.deleteSelection();
    }

    this.addToConsoleLog('Cut completed');
  }

  /**
   * Handle Ctrl+V (Paste) - paste from clipboard with rich format
   */
  handlePaste() {
    if (!this.getDocument() || !this.wasmModule) {
      console.warn('Cannot paste: document or WASM not ready');
      return;
    }

    try {
      // CRITICAL: Ensure WASM document is in sync before pasting
      try {
        // WASM already has document internally - no need to load
      } catch (e) {
        console.warn('Failed to sync document with WASM before paste:', e);
      }

      const cursor = this.getCursorPos();
      const startStave = cursor.line;
      const startColumn = cursor.col;

      // For now, simple paste at cursor (single cell)
      const cellsToPaste = this.clipboard.cells || [];

      if (cellsToPaste.length === 0) {
        console.warn('Nothing to paste (clipboard empty)');
        return;
      }

      // Use WASM pasteCells for proper document mutation
      const line = this.getCurrentLine();
      if (!line || !line.cells) {
        console.warn('No current line to paste into');
        return;
      }

      // Call WASM pasteCells (handles document mutation, undo tracking)
      const result = this.wasmModule.pasteCells(
        startStave,      // start_row
        startColumn,     // start_col
        startStave,      // end_row (same row for simple paste)
        startColumn,     // end_col (same column, no selection to replace)
        cellsToPaste     // cells to paste
      );

      // Update document from WASM result
      if (result && result.dirty_lines) {
        for (const dirtyLine of result.dirty_lines) {
          if (dirtyLine.row < this.getDocument()?.lines?.length) {
            // WASM owns document - no need to apply dirty lines;
          }
        }
      }

      // Update cursor position from WASM result
      if (result && typeof result.new_cursor_col !== 'undefined') {
        this.setCursorPosition(result.new_cursor_col);
      } else {
        // Fallback: position after pasted content
        this.setCursorPosition(startColumn + cellsToPaste.length);
      }

      // Clear selection (WASM handles this)
      this.clearSelection();

      this.addToConsoleLog(`Pasted ${cellsToPaste.length} cells via WASM`);
      this.render();
    } catch (error) {
      console.error('Paste failed:', error);
      this.showError('Paste failed', { details: error.message });
    }
  }

  /**
   * Handle Ctrl+Z (Undo)
   */
  handleUndo() {
    if (!this.wasmModule) {
      console.warn('Cannot undo: WASM not ready');
      return;
    }

    try {
      const canUndo = this.wasmModule.canUndo();
      if (!canUndo) {
        console.log('Nothing to undo');
        return;
      }

      const result = this.wasmModule.undo();
      if (result && result.dirty_lines) {
        this.updateDocumentFromDirtyLines(result.dirty_lines);
        this.setCursorPosition(result.new_cursor_row, result.new_cursor_col);
        this.addToConsoleLog('Undo completed');
        this.render();
      }
    } catch (error) {
      console.error('Undo failed:', error);
      this.showError('Undo failed', { details: error.message });
    }
  }

  /**
   * Handle Ctrl+Y (Redo)
   */
  handleRedo() {
    if (!this.wasmModule) {
      console.warn('Cannot redo: WASM not ready');
      return;
    }

    try {
      const canRedo = this.wasmModule.canRedo();
      if (!canRedo) {
        console.log('Nothing to redo');
        return;
      }

      const result = this.wasmModule.redo();
      if (result && result.dirty_lines) {
        this.updateDocumentFromDirtyLines(result.dirty_lines);
        this.setCursorPosition(result.new_cursor_row, result.new_cursor_col);
        this.addToConsoleLog('Redo completed');
        this.render();
      }
    } catch (error) {
      console.error('Redo failed:', error);
      this.showError('Redo failed', { details: error.message });
    }
  }

  /**
   * Update document lines from dirty lines returned by WASM
   */
  updateDocumentFromDirtyLines(dirtyLines) {
    if (!this.getDocument()) return;

    dirtyLines.forEach(dirtyLine => {
      if (dirtyLine.row < this.getDocument()?.lines?.length) {
        // WASM owns document - no need to apply dirty lines || [];
      }
    });
  }

  // NOTE: deleteSelection() method is defined earlier in this class (line ~1161)
  // The WASM-first version queries selection from WASM, not from JS document state

  // ==================== COORDINATOR DELEGATE METHODS ====================
  // These methods delegate to the coordinators for cleaner architecture
  // They maintain backward compatibility while using the new coordinator pattern

  // Cursor delegates
  getCursorPosition() { return this.cursorCoordinator.getCursorPosition(); }
  getCursorPos() { return this.cursorCoordinator.getCursorPos(); }
  setCursorPosition(positionOrRow, col) { return this.cursorCoordinator.setCursorPosition(positionOrRow, col); }
  validateCursorPosition(position) { return this.cursorCoordinator.validateCursorPosition(position); }
  updateCursorFromWASM(diff) { return this.cursorCoordinator.updateCursorFromWASM(diff); }
  showCursor() { return this.cursorCoordinator.showCursor(); }
  hideCursor() { return this.cursorCoordinator.hideCursor(); }
  updateCursorVisualPosition() { return this.cursorCoordinator.updateCursorVisualPosition(); }
  updateCursorPositionDisplay() { return this.cursorCoordinator.updateCursorPositionDisplay(); }

  // Selection delegates
  clearSelection() { return this.selectionCoordinator.clearSelection(); }
  hasSelection() { return this.selectionCoordinator.hasSelection(); }
  getSelection() { return this.selectionCoordinator.getSelection(); }
  getSelectedText() { return this.selectionCoordinator.getSelectedText(); }
  updateSelectionDisplay() { return this.selectionCoordinator.updateSelectionDisplay(); }
  updatePrimarySelection() { return this.selectionCoordinator.updatePrimarySelection(); }

  // Clipboard delegates
  handleCopy() { return this.clipboardCoordinator.handleCopy(); }
  handleCut() { return this.clipboardCoordinator.handleCut(); }
  handlePaste() { return this.clipboardCoordinator.handlePaste(); }
  handleMiddleClick(event) { return this.clipboardCoordinator.handleMiddleClick(event); }

  // Render delegates
  render(dirtyLineIndices = null) { return this.renderCoordinator.render(dirtyLineIndices); }
  renderAndUpdate(dirtyLineIndices = null) { return this.renderCoordinator.renderAndUpdate(dirtyLineIndices); }
  charPosToCellIndex(charPos) { return this.renderCoordinator.charPosToCellIndex(charPos); }
  cellIndexToCharPos(cellIndex) { return this.renderCoordinator.cellIndexToCharPos(cellIndex); }
  charPosToPixel(charPos) { return this.renderCoordinator.charPosToPixel(charPos); }
  cellColToPixel(cellCol) { return this.renderCoordinator.cellColToPixel(cellCol); }

  // Inspector delegates
  updateDocumentDisplay() { return this.inspectorCoordinator.updateDocumentDisplay(); }
  forceUpdateAllExports() { return this.inspectorCoordinator.forceUpdateAllExports(); }

  // Console delegates
  showError(message, options = {}) { return this.consoleCoordinator.showError(message, options); }
  showWarning(message, options = {}) { return this.consoleCoordinator.showWarning(message, options); }
  addToConsoleLog(message) { return this.consoleCoordinator.addToConsoleLog(message); }
}

export default MusicNotationEditor;
