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
import AutoSave from './autosave.js';
import StorageManager from './storage-manager.js';
import { DebugHUD } from './debug-hud.js';
import WASMBridge from './core/WASMBridge.js';
import KeyboardHandler from './handlers/KeyboardHandler.js';
import MouseHandler from './handlers/MouseHandler.js';
import ExportManager from './managers/ExportManager.js';

class MusicNotationEditor {
  constructor(editorElement) {
    this.element = editorElement;
    // Ensure editor element has position: relative for absolute positioning of child elements
    this.element.style.position = 'relative';
    this.wasmModule = null;
    this.theDocument = null;
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

  }

  /**
     * Get the document (alias for theDocument)
     */
  get document() {
    return this.theDocument;
  }

  /**
     * Initialize the editor with WASM module
     */
  async initialize() {
    try {
      console.log('Initializing Music Notation Editor...');

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

      // Initialize renderer
      this.renderer = new DOMRenderer(this.element, this);

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
     */
  async createNewDocument() {
    if (!this.isInitialized || !this.wasmModule) {
      console.error('Cannot create document: WASM not initialized');
      return;
    }

    // Create document using WASM
    const document = this.wasmModule.createNewDocument();

    // Ensure pitch_system is set from WASM (should be 1 = Number system)
    if (!document.pitch_system && document.pitch_system !== 0) {
      console.warn('WASM did not set pitch_system, defaulting to Number (1)');
      document.pitch_system = 1;
    }

    console.log('✅ New document created with pitch_system:', document.pitch_system);

    // Set timestamps (WASM can't access system time)
    const now = new Date().toISOString();
    document.created_at = now;
    document.modified_at = now;

    // Add runtime state (not persisted by WASM)
    document.state = {
      cursor: { line: 0, col: 0 },
      selection: null
      // Note: has_focus removed - now queried from EventManager (single source of truth)
    };

    await this.loadDocument(document);
  }

  /**
     * Load document from JSON string
     */
  async loadDocument(jsonString) {
    try {
      if (this.wasmModule) {
        this.theDocument = typeof jsonString === 'string' ? JSON.parse(jsonString) : jsonString;

        // Ensure pitch_system is set to default if missing (backward compatibility)
        if (!this.theDocument.pitch_system && this.theDocument.pitch_system !== 0) {
          this.theDocument.pitch_system = 1; // Default to Number system
        }

        // Validate and fix cursor position after loading document
        if (this.theDocument && this.theDocument.state && this.theDocument.state.cursor) {
          const currentCursor = this.theDocument.state.cursor.col;
          const validatedCursor = this.validateCursorPosition(currentCursor);
          if (validatedCursor !== currentCursor) {
            logger.warn(LOG_CATEGORIES.CURSOR, 'Document loaded with invalid cursor position, correcting', {
              loaded: currentCursor,
              corrected: validatedCursor
            });
            this.theDocument.state.cursor.col = validatedCursor;
          }
        }

        await this.renderAndUpdate();

        // Update UI displays
        if (this.ui && this.theDocument) {
          if (this.theDocument.title) {
            this.ui.updateDocumentTitle(this.theDocument.title);
          }
          this.ui.updateCurrentPitchSystemDisplay();
          this.ui.syncOrnamentEditModeUI();
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
     */
  async saveDocument() {
    try {
      return JSON.stringify(this.theDocument);
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
      // NEW WASM-FIRST APPROACH: Call insertText which uses internal DOCUMENT state
      const result = this.wasmModule.insertText(text);
      t1 = performance.now();
      console.log(`⏱️ WASM insertText: ${(t1 - startTime).toFixed(2)}ms`);

      logger.debug(LOG_CATEGORIES.EDITOR, 'insertText result from WASM', result);

      // Apply dirty lines to JavaScript document (for rendering only)
      for (const dirtyLine of result.dirty_lines) {
        if (dirtyLine.row < this.theDocument.lines.length) {
          this.theDocument.lines[dirtyLine.row].cells = dirtyLine.cells;
        }
      }

      // Update cursor position in JavaScript document (for display only)
      if (this.theDocument && this.theDocument.state) {
        this.theDocument.state.cursor.line = result.new_cursor_row;
        this.theDocument.state.cursor.col = result.new_cursor_col;
      }

      t2 = performance.now();
      console.log(`⏱️ Apply dirty lines: ${(t2 - t1).toFixed(2)}ms`);

      // Extract dirty line indices for incremental rendering
      const dirtyLineIndices = result.dirty_lines.map(dl => dl.row);

      // Render and update UI (incremental)
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
     * Parse musical notation text with real-time processing using recursive descent
     */
  async parseText(text) {
    if (!this.isInitialized || !this.wasmModule) {
      return;
    }

    const startTime = performance.now();

    try {
      // Validate input before parsing
      if (!this.validateNotationInput(text)) {
        console.warn('Invalid notation input:', text);
        this.showError('Invalid musical notation');
        return;
      }

      const pitchSystem = this.getCurrentPitchSystem();

      // Parse text using WASM recursive descent parser
      if (this.theDocument && this.theDocument.lines && this.theDocument.lines.length > 0) {
        const cells = this.wasmModule.parseText(text, pitchSystem);
        const line =this.getCurrentLine();
        line.cells = cells; // Replace main line with parsed cells
      }

      // Extract beats for visualization
      await this.extractAndRenderBeats(text);

      // Render updated document
      await this.renderAndUpdate();

      // Log successful parsing
      this.addToConsoleLog(`Parsed notation: "${text}"`);
    } catch (error) {
      console.error('Failed to parse text:', error);
      this.showError('Failed to parse musical notation');
    }
  }

  /**
     * Validate notation input before processing
     */
  validateNotationInput(text) {
    if (!text || text.trim().length === 0) {
      return true; // Empty input is valid
    }

    // Basic validation - allow number system, western system, and common notation elements
    const validPatterns = [
      /^[1234567#b\s|]+$/, // Number system
      /^[cdefgabCDEFGAB#b\s|]+$/, // Western system
      /^[|\-\s,']+$/ // Barlines, dashes, breath marks
    ];

    // Remove whitespace for validation
    const cleanText = text.replace(/\s+/g, '');

    return validPatterns.some(pattern => pattern.test(cleanText)) || cleanText.length === 0;
  }

  /**
     * Extract and render beats from notation
     */
  async extractAndRenderBeats(text) {
    try {
      // Simple beat extraction - identify temporal segments
      const beats = this.extractTemporalSegments(text);

      // Update beat visualization
      this.updateBeatVisualization(beats);

      this.addToConsoleLog(`Extracted ${beats.length} beat(s) from notation`);
    } catch (error) {
      console.error('Failed to extract beats:', error);
    }
  }

  /**
     * Extract temporal segments from notation text
     */
  extractTemporalSegments(text) {
    const segments = [];
    let currentSegment = '';
    let inBeat = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];

      // Check if character starts or ends a beat
      if (this.isTemporalChar(char) || this.isAccidental(char)) {
        if (!inBeat) {
          // Start new beat
          if (currentSegment.trim()) {
            segments.push(currentSegment.trim());
          }
          currentSegment = char;
          inBeat = true;
        } else {
          currentSegment += char;
        }
      } else if (this.isBeatSeparator(char)) {
        // End current beat
        if (currentSegment.trim()) {
          segments.push(currentSegment.trim());
        }
        currentSegment = '';
        inBeat = false;
      } else {
        // Non-temporal character, end beat
        if (currentSegment.trim()) {
          segments.push(currentSegment.trim());
        }
        currentSegment = char;
        inBeat = false;
      }
    }

    // Add final segment if exists
    if (currentSegment.trim()) {
      segments.push(currentSegment.trim());
    }

    return segments.filter(segment => segment.length > 0);
  }

  /**
     * Check if character is temporal (musical note)
     */
  isTemporalChar(char) {
    return /[1234567cdefgabCDEFGAB]/.test(char);
  }

  /**
     * Check if character is an accidental
     */
  isAccidental(char) {
    return /[#b]/.test(char);
  }

  /**
     * Check if character separates beats
     */
  isBeatSeparator(char) {
    return /[|\s]/.test(char);
  }

  /**
     * Update beat visualization in the DOM
     */
  updateBeatVisualization(beats) {
    const beatContainer = document.getElementById('beat-visualization');
    if (!beatContainer) return;

    beatContainer.innerHTML = '';

    beats.forEach((beat, index) => {
      const beatElement = document.createElement('div');
      beatElement.className = 'beat-indicator';
      beatElement.textContent = `Beat ${index + 1}: ${beat}`;
      beatElement.style.cssText = `
                font-size: 10px;
                color: #666;
                margin: 2px;
                padding: 2px 4px;
                background: #f0f0f0;
                border-radius: 2px;
            `;

      beatContainer.appendChild(beatElement);
    });
  }

  /**
     * Delete text at specified range
     */
  async deleteRange(start, end) {
    if (!this.isInitialized || !this.wasmModule) {
      return;
    }

    try {
      // Get current line index
      const currentLineIndex = this.theDocument?.state?.cursor?.line ?? 0;
      const line = this.getCurrentLine();
      if (!line) return;

      // Check if any cell in range has an ornament indicator - if so, prevent deletion
      // TODO: Move this business rule to WASM (per WASM-first principle)
      const cells = line.cells;
      for (let i = start.col; i < end.col && i < cells.length; i++) {
        if (cells[i] && cells[i].ornament_indicator && cells[i].ornament_indicator.name !== 'none') {
          console.log('[DELETE] Protected: cannot delete ornament cell at index', i);
          this.showWarning('Cannot delete cells with ornaments - ornaments are non-editable');
          return; // Don't delete anything if any cell has an ornament
        }
      }

      // Use WASM editReplaceRange for deletion (delete = replace with empty string)
      this.wasmModule.loadDocument(this.theDocument);
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

      // Update document from WASM result
      if (result && result.dirty_lines) {
        // Update the affected lines from WASM
        for (const dirtyLine of result.dirty_lines) {
          if (dirtyLine.row < this.theDocument.lines.length) {
            this.theDocument.lines[dirtyLine.row].cells = dirtyLine.cells;
          }
        }
      }

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
      this.showError('Failed to delete selection');
    }
  }

  /**
     * Get current cursor position (character offset)
     */
  /**
   * Get the current stave/line index from cursor state
   */
  getCurrentStave() {
    if (this.theDocument && this.theDocument.state && this.theDocument.state.cursor) {
      return this.theDocument.state.cursor.line;
    }
    return 0;
  }

  /**
   * Get the current line from document based on cursor stave
   */
  getCurrentLine() {
    if (!this.theDocument || !this.theDocument.lines) {
      return null;
    }
    const stave = this.getCurrentStave();
    return this.theDocument.lines[stave] || null;
  }

  /**
   * Get navigable stops from the current line
   * Returns an ordered array of navigation stops (cells and optionally ornaments)
   * Each stop has: { stopIndex, kind, cellIndex, x, y, w, h, ... }
   *
   * When ornament edit mode is OFF: only non-ornament cells
   * When ornament edit mode is ON: all cells (including ornaments)
   */
  getNavigableStops() {
    const line = this.getCurrentLine();
    if (!line || !line.cells) {
      console.log('[getNavigableStops] No line or cells, returning empty');
      return [];
    }

    const editMode = this.wasmModule.getOrnamentEditMode(this.theDocument);
    const displayList = this.displayList;

    if (!displayList || !displayList.lines) {
      // Fallback: return basic stops from cells
      return line.cells
        .filter((cell, idx) => {
          if (editMode) return true;
          return !cell.ornament_indicator || cell.ornament_indicator.name === 'none';
        })
        .map((cell, stopIdx) => ({
          stopIndex: stopIdx,
          kind: 'cell',
          cellIndex: line.cells.indexOf(cell),
          id: `c${line.cells.indexOf(cell)}`,
          x: 0,
          y: 0,
          w: 0,
          h: 0,
        }));
    }

    // Get rendered cells from DisplayList
    const lineIndex = this.getCurrentStave();
    const renderLine = displayList.lines[lineIndex];

    if (!renderLine || !renderLine.cells) {
      return [];
    }

    // Build stops from rendered cells
    const stops = [];
    let stopIndex = 0;

    for (let i = 0; i < renderLine.cells.length; i++) {
      const renderCell = renderLine.cells[i];
      // dataset is a Map, not a plain object, so use .get() to access values
      const cellIndex = parseInt(renderCell.dataset.get('cellIndex'), 10);
      const cell = line.cells[cellIndex];

      // Check if this cell is navigable
      const isOrnament = cell && cell.ornament_indicator && cell.ornament_indicator.name !== 'none';

      if (!editMode && isOrnament) {
        // Skip ornament cells when edit mode is OFF
        continue;
      }

      stops.push({
        stopIndex: stopIndex++,
        kind: isOrnament ? 'ornament' : 'cell',
        cellIndex,
        id: `c${cellIndex}`,
        x: renderCell.x,
        y: renderCell.y,
        w: renderCell.w,
        h: renderCell.h,
        cell: cell,
      });
    }

    // Sort by x position (left to right)
    stops.sort((a, b) => {
      if (Math.abs(a.x - b.x) < 0.1) {
        return a.y - b.y; // Tiebreak by y
      }
      return a.x - b.x;
    });

    // Re-index after sorting
    stops.forEach((stop, idx) => {
      stop.stopIndex = idx;
    });

    return stops;
  }

  /**
   * Find stop from cellIndex
   */
  findStopFromCellIndex(stops, cellIndex) {
    return stops.find(stop => stop.cellIndex === cellIndex);
  }

  /**
   * Get current stop based on cursor position
   * If cursor is on a non-navigable cell (ornament when edit OFF),
   * finds the nearest navigable stop
   */
  getCurrentStop() {
    const stops = this.getNavigableStops();
    if (stops.length === 0) return null;

    const charPos = this.getCursorPosition();
    const { cell_index: cellIndex } = this.charPosToCellIndex(charPos);

    // Try to find exact match
    const exactMatch = this.findStopFromCellIndex(stops, cellIndex);
    if (exactMatch) return exactMatch;

    // Cursor is on a non-navigable cell (e.g., ornament when edit mode OFF)
    // Find nearest navigable stop
    let nearestStop = stops[0];
    let minDistance = Math.abs(cellIndex - nearestStop.cellIndex);

    for (const stop of stops) {
      const distance = Math.abs(cellIndex - stop.cellIndex);
      if (distance < minDistance) {
        minDistance = distance;
        nearestStop = stop;
      }
    }

    return nearestStop;
  }

  getCursorPosition() {
    if (this.theDocument && this.theDocument.state) {
      return this.theDocument.state.cursor.col;
    }
    return 0;
  }

  /**
   * Get the full cursor position as a Pos object { line, col }
   * @returns {{line: number, col: number}} Full cursor position
   */
  getCursorPos() {
    if (this.theDocument && this.theDocument.state) {
      return {
        line: this.theDocument.state.cursor.line,
        col: this.theDocument.state.cursor.col
      };
    }
    return { line: 0, col: 0 };
  }

  /**
     * Set cursor position - supports both single position (column) or row/col arguments
     * @param {number} positionOrRow - Either a character position (column) or row number
     * @param {number} col - Optional column number (if first param is row)
     */
  setCursorPosition(positionOrRow, col) {
    if (!this.theDocument || !this.theDocument.state) return;

    if (col !== undefined) {
      // Two-argument form: setCursorPosition(row, col) from WASM results
      this.theDocument.state.cursor.line = positionOrRow;
      this.theDocument.state.cursor.col = col;
    } else {
      // Single-argument form: setCursorPosition(position) for navigation
      const validatedPosition = this.validateCursorPosition(positionOrRow);
      this.theDocument.state.cursor.col = validatedPosition;
    }

    this.updateCursorPositionDisplay();
    this.updateCursorVisualPosition();
    this.showCursor();
  }

  /**
     * Validate and clamp cursor position to valid range (character-based)
     */
  validateCursorPosition(position) {
    if (!this.theDocument || !this.theDocument.lines || this.theDocument.lines.length === 0) {
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
     * Update cursor and selection from WASM EditorDiff result
     * @param {EditorDiff} diff - The diff returned from WASM commands
     */
  async updateCursorFromWASM(diff) {
    if (!this.theDocument || !this.theDocument.state) {
      return;
    }

    // Update cursor position (WASM uses 'line' and 'col', JS uses 'stave' and 'column')
    if (diff.caret && diff.caret.caret) {
      this.theDocument.state.cursor.line = diff.caret.caret.line;
      this.theDocument.state.cursor.col = diff.caret.caret.col;

      // Store desired_col for debug HUD
      if (!this.theDocument.state.desired_col) {
        this.theDocument.state.desired_col = 0;
      }
      this.theDocument.state.desired_col = diff.caret.desired_col;
    }

    // Selection is now managed entirely by WASM
    // No need to sync to JS state - use getSelection() to query WASM when needed

    // Render to update current line border and other visual states
    await this.render();

    // Update visual displays
    this.updateCursorPositionDisplay();
    this.updateCursorVisualPosition();
    this.showCursor();
    this.updateSelectionDisplay();
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
     * Get current pitch system
     * Line-level pitch_system overrides document-level
     */
  getCurrentPitchSystem() {
    if (this.theDocument) {
      // Check if we have lines and if the first line has pitch_system set
      if (this.theDocument.lines && this.theDocument.lines.length > 0) {
        const line = this.getCurrentLine();
        // If line has pitch_system set (non-zero), use it
        if (line && line.pitch_system && line.pitch_system !== 0) {
          return line.pitch_system;
        }
      }
      // Fall back to document-level pitch system
      return this.theDocument.pitch_system || 1; // Default to Number system
    }
    return 1;
  }



  /**
     * Handle keyboard input
     */
  handleKeyboardEvent(event) {
    this.keyboardHandler.handleKeyboardEvent(event);
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
    if (!this.theDocument || !this.theDocument.lines || this.theDocument.lines.length === 0) {
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
    if (!this.theDocument) {
      return 0;
    }
    try {
      return this.wasmModule.getMaxCharPosition(this.theDocument);
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
    if (!this.theDocument) {
      return { cellIndex: 0, charOffsetInCell: 0 };
    }
    try {
      return this.wasmModule.charPosToCellIndex(this.theDocument, charPos);
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
    if (!this.theDocument) {
      return 0;
    }
    try {
      return this.wasmModule.cellIndexToCharPos(this.theDocument, cellIndex);
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
    if (!this.theDocument || !this.renderer || !this.renderer.displayList) {
      return LEFT_MARGIN_PX;
    }
    try {
      return this.wasmModule.charPosToPixel(this.theDocument, this.renderer.displayList, charPos);
    } catch (error) {
      console.error('Error converting char pos to pixel from WASM:', error);
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
      return selectionInfo && !selectionInfo.is_empty;
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

    if (!this.theDocument || !this.theDocument.lines || this.theDocument.lines.length === 0) {
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

      // Apply dirty lines to JavaScript document (for rendering only)
      for (const dirtyLine of result.dirty_lines) {
        if (dirtyLine.row < this.theDocument.lines.length) {
          this.theDocument.lines[dirtyLine.row].cells = dirtyLine.cells;
        }
      }

      // Update cursor position in JavaScript document (for display only)
      this.theDocument.state.cursor.line = result.new_cursor_row;
      this.theDocument.state.cursor.col = result.new_cursor_col;

      // Recalculate beats after deletion
      await this.recalculateBeats();

      await this.renderAndUpdate();

      // Show cursor
      this.showCursor();

      // Restore visual selection after backspace
      this.updateSelectionDisplay();

      logger.info(LOG_CATEGORIES.EDITOR, 'Backspace completed successfully', {
        newCursorRow: result.new_cursor_row,
        newCursorCol: result.new_cursor_col
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
     */
  async handleDelete() {
    if (this.hasSelection()) {
      // Delete selected content
      await this.deleteSelection();
      await this.recalculateBeats();
    } else {
      const charPos = this.getCursorPosition();
      const maxCharPos = this.getMaxCharPosition();

      if (charPos < maxCharPos) {
        // Convert character position to cell index
        const { cell_index: cellIndex } = this.charPosToCellIndex(charPos);

        // Use WASM API to delete character (cell-based operation)
        if (this.theDocument && this.theDocument.lines && this.theDocument.lines.length > 0) {
          const line = this.getCurrentLine();
        if (!line) return;
          const cells = line.cells;

          if (cellIndex >= 0 && cellIndex < cells.length) {
            const cellToDelete = cells[cellIndex];
            console.log('[DELETE] Attempting to delete cell at index', cellIndex, 'char:', cellToDelete?.char, 'ornament_indicator:', cellToDelete?.ornament_indicator);

            // Check if cell has an ornament indicator - if so, prevent deletion
            if (cellToDelete && cellToDelete.ornament_indicator && cellToDelete.ornament_indicator.name !== 'none') {
              console.log('[DELETE] Protected: ornament cell cannot be deleted, moving cursor right');
              logger.info(LOG_CATEGORIES.EDITOR, 'Delete on ornament cell - moving cursor right instead', {
                cellIndexToDelete: cellIndex,
                currentCharPos: charPos,
                ornamentIndicator: cellToDelete.ornament_indicator
              });
              // Move cursor right instead of deleting
              const newCharPos = Math.min(maxCharPos, charPos + 1);
              this.setCursorPosition(newCharPos);
              this.showCursor();
              this.updateSelectionDisplay();
              return; // Early return - don't delete
            }

            // Check if cell has a slur indicator - if so, prevent deletion
            if (cellToDelete && cellToDelete.slur_indicator && cellToDelete.slur_indicator.name !== 'none') {
              console.log('[DELETE] Protected: slur cell cannot be deleted, moving cursor right');
              logger.info(LOG_CATEGORIES.EDITOR, 'Delete on slur cell - moving cursor right instead', {
                cellIndexToDelete: cellIndex,
                currentCharPos: charPos,
                slurIndicator: cellToDelete.slur_indicator
              });
              // Move cursor right instead of deleting
              const newCharPos = Math.min(maxCharPos, charPos + 1);
              this.setCursorPosition(newCharPos);
              this.showCursor();
              this.updateSelectionDisplay();
              return; // Early return - don't delete
            }

            console.log('[DELETE] No ornament/slur protection - proceeding with deletion');
            const updatedCells = this.wasmModule.deleteCharacter(cells, cellIndex);
            line.cells = updatedCells;
          }
        }

        // Recalculate beats after deletion
        await this.recalculateBeats();

        await this.renderAndUpdate();

        // Restore visual selection after delete
        this.updateSelectionDisplay();
      }
    }
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
      if (!this.theDocument || !this.theDocument.lines || this.theDocument.lines.length === 0) {
        console.error('🔄 No document');
        logger.error(LOG_CATEGORIES.EDITOR, 'No document or lines available');
        return;
      }

      logger.info(LOG_CATEGORIES.EDITOR, 'Inserting newline (WASM-first)');

      // NEW WASM-FIRST APPROACH: Call insertNewline which uses internal DOCUMENT state
      const result = this.wasmModule.insertNewline();

      console.log('🔄 WASM insertNewline returned:', result);

      // Apply dirty lines to JavaScript document (for rendering only)
      for (const dirtyLine of result.dirty_lines) {
        if (dirtyLine.row < this.theDocument.lines.length) {
          this.theDocument.lines[dirtyLine.row].cells = dirtyLine.cells;
        } else {
          // New line was created, add it to JavaScript document
          const newLine = {
            cells: dirtyLine.cells,
            label: '',
            tala: '',
            lyrics: '',
            tonic: '',
            pitch_system: null,
            key_signature: '',
            tempo: '',
            time_signature: '',
            beats: [],
            slurs: []
          };
          this.theDocument.lines.push(newLine);
        }
      }

      // Update cursor position in JavaScript document (for display only)
      if (this.theDocument && this.theDocument.state) {
        this.theDocument.state.cursor.line = result.new_cursor_row;
        this.theDocument.state.cursor.col = result.new_cursor_col;
      }

      logger.debug(LOG_CATEGORIES.CURSOR, 'Cursor moved to new line', {
        newLine: result.new_cursor_row,
        newColumn: result.new_cursor_col
      });

      // Extract dirty line indices for incremental rendering
      const dirtyLineIndices = result.dirty_lines.map(dl => dl.row);

      await this.renderAndUpdate(dirtyLineIndices);
      this.showCursor();

      logger.info(LOG_CATEGORIES.EDITOR, 'Line split successfully', {
        totalLines: this.theDocument.lines.length
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
      if (this.theDocument && this.theDocument.lines && this.theDocument.lines.length > 0) {
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
    if (!this.theDocument || !this.theDocument.lines || this.theDocument.lines.length === 0) {
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
   * Get effective selection: either user selection or single element to left of cursor
   * Returns {start, end} or null if no valid selection available
   */
  getEffectiveSelection() {
    // If there's a user selection, use it (returns {start: {line, col}, end: {line, col}})
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

    // No selection: get cell at cursor position
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

  /**
     * Toggle slur on current selection
     */
  async toggleSlur() {
    return this.applySlur();
  }

  /**
     * Apply slur to current selection with toggle behavior
     */
  async applySlur() {
    console.log('🎵 applySlur called (Phase 1 WASM-first)');

    if (!this.isInitialized || !this.wasmModule) {
      console.log('❌ Not initialized or no WASM module');
      return;
    }

    console.log('📊 Selection state:', {
      hasSelection: this.hasSelection(),
      selection: this.getSelection(),
      selectedText: this.getSelectedText()
    });

    // Validate selection (requires explicit selection)
    if (!this.hasSelection()) {
      console.log('Slur requires an explicit selection');
      return;
    }

    try {
      const selection = this.getSelection();
      const selectedText = this.getSelectedText();

      // NEW WASM-FIRST APPROACH: Call applySlur() which uses internal DOCUMENT
      const result = this.wasmModule.applySlur();

      console.log('✅ WASM applySlur result:', result);

      // Apply dirty lines to JS document (rendering only)
      for (const dirtyLine of result.dirty_lines) {
        if (dirtyLine.row < this.theDocument.lines.length) {
          this.theDocument.lines[dirtyLine.row].cells = dirtyLine.cells;
        }
      }

      this.addToConsoleLog(`Toggled slur on "${selectedText}"`);

      // Render only the affected lines
      const dirtyLineIndices = result.dirty_lines.map(dl => dl.row);
      await this.renderAndUpdate(dirtyLineIndices);

      // Restore visual selection after applying slur
      this.updateSelectionDisplay();
    } catch (error) {
      console.error('❌ Failed to apply slur:', error);
      // If it's an error from WASM, it might be a string - show it to user
      if (typeof error === 'string') {
        console.error('WASM error message:', error);
      }
    }
  }

  /**
     * Check if there's already a slur on the given selection using WASM API
     */
  hasSlurOnSelection(selection) {
    if (!this.theDocument || !this.theDocument.lines || this.theDocument.lines.length === 0) {
      return false;
    }

    const line = this.getCurrentLine();
    if (!line) return false;
    const cells = line.cells;

    // Call WASM API to check for slur indicators
    const wasmModule = this.wasmModule;
    return wasmModule.hasSlurInSelection(
      cells,
      selection.start,
      selection.end
    );
  }

  /**
     * Remove slur from the given selection using WASM API
     */
  async removeSlurFromSelection(selection) {
    if (!this.theDocument || !this.theDocument.lines || this.theDocument.lines.length === 0) {
      return;
    }

    const line = this.getCurrentLine();
        if (!line) return;
    const cells = line.cells;

    // Call WASM API to remove slur
    const wasmModule = this.wasmModule;
    const updatedCells = wasmModule.removeSlur(
      cells,
      selection.start,
      selection.end
    );

    // Update the line with the updated cells from WASM
    line.cells = updatedCells;

    this.addToConsoleLog(`Removed slur via WASM: cells ${selection.start}..${selection.end}`);
  }

  /**
   * Apply ornament styling to current selection (WYSIWYG "select and apply" pattern)
   * @param {string} positionType - Position type: "before", "after", or "top"
   */
  async applyOrnament(positionType = 'after') {
    console.log('🎵 applyOrnament called with position:', positionType);

    if (!this.isInitialized || !this.wasmModule) {
      console.log('❌ Not initialized or no WASM module');
      return;
    }

    // Validate selection (requires explicit selection)
    if (!this.hasSelection()) {
      console.log('❌ No selection found');
      this.showWarning('Please select cells to apply ornament styling');
      return;
    }

    try {
      const selection = this.getSelection();
      console.log('🎵 Selection:', selection);

      const line = this.getCurrentLine();

      if (!line) {
        console.log('❌ No line found for applyOrnament');
        return;
      }

      console.log('🎵 Line found with', line.cells?.length, 'cells');

      const cells = line.cells;
      // Use half-open range [start, end) to match WASM convention
      const selectedCells = cells.filter((cell, index) =>
        index >= selection.start && index < selection.end
      );
      const selectedText = selectedCells.map(cell => cell.char || '').join('');

      console.log('🎵 Selected cells:', selectedCells.length, 'text:', selectedText);
      console.log('🎵 Calling wasmModule.applyOrnament with:', {
        cellCount: cells.length,
        startIndex: selection.start,
        endIndex: selection.end,
        positionType
      });

      // Call WASM applyOrnament function
      // Note: WASM expects 'end' to be exclusive (one past the last cell)
      // Our selection.end is inclusive, so add 1
      if (this.theDocument && this.theDocument.lines && this.theDocument.lines.length > 0) {
        const updatedCells = this.wasmModule.applyOrnament(
          cells,
          selection.start,
          selection.end + 1,  // Convert inclusive end to exclusive
          positionType
        );

        console.log('🎵 WASM returned', updatedCells?.length, 'cells');
        if (updatedCells && updatedCells.length > 0) {
          console.log('🎵 Updated cell[1]:', updatedCells[1]);
          console.log('🎵 Updated cell[2]:', updatedCells[2]);
        }

        line.cells = updatedCells;
        this.addToConsoleLog(`Applied ornament (${positionType}) to "${selectedText}"`);
      }

      await this.renderAndUpdate();

      // Restore visual selection after applying ornament
      this.updateSelectionDisplay();
    } catch (error) {
      console.error('❌ Failed to apply ornament:', error);
    }
  }

  /**
   * Remove ornament styling from current selection
   */
  async removeOrnament() {
    console.log('🎵 removeOrnament called');

    if (!this.isInitialized || !this.wasmModule) {
      console.log('❌ Not initialized or no WASM module');
      return;
    }

    // Validate selection
    if (!this.hasSelection()) {
      console.log('Remove ornament requires an explicit selection');
      this.showWarning('Please select ornamental cells to remove styling');
      return;
    }

    try {
      const selection = this.getSelection();
      const line = this.getCurrentLine();

      if (!line) {
        console.log('❌ No line found for removeOrnament');
        return;
      }

      const cells = line.cells;

      // Call WASM removeOrnament function
      if (this.theDocument && this.theDocument.lines && this.theDocument.lines.length > 0) {
        const updatedCells = this.wasmModule.removeOrnament(
          cells,
          selection.start,
          selection.end
        );

        line.cells = updatedCells;
        this.addToConsoleLog(`Removed ornament styling from selection`);
      }

      await this.renderAndUpdate();

      // Restore visual selection
      this.updateSelectionDisplay();
    } catch (error) {
      console.error('❌ Failed to remove ornament:', error);
    }
  }

  /**
   * Toggle ornament edit mode
   * When enabled, ornaments are displayed in normal position with superscript styling
   * When disabled, ornaments are attached to adjacent notes
   */
  toggleOrnamentEditMode() {
    // Get current mode from document
    const currentMode = this.wasmModule.getOrnamentEditMode(this.theDocument);
    const newMode = !currentMode;

    // Update document via WASM API
    this.theDocument = this.wasmModule.setOrnamentEditMode(this.theDocument, newMode);

    console.log(`🎨 Ornament edit mode: ${newMode ? 'ON' : 'OFF'}`);
    this.addToConsoleLog(`Ornament edit mode: ${newMode ? 'ON' : 'OFF'}`);

    // Update header display
    const headerDisplay = document.getElementById('ornament-edit-mode-display');
    if (headerDisplay) {
      headerDisplay.textContent = `Edit Ornament Mode: ${newMode ? 'ON' : 'OFF'}`;
    }

    // Update menu checkbox
    if (this.ui) {
      this.ui.updateOrnamentEditModeCheckbox(newMode);
    }

    // Re-render to apply the new mode
    this.renderAndUpdate();
  }

  /**
     * Toggle octave on current selection
     * If all pitched elements have the target octave, removes it (sets to 0)
     * Otherwise, applies the target octave
     */
  async toggleOctave(octave) {
    console.log(`🎵 toggleOctave called with octave=${octave}`);

    if (!this.isInitialized || !this.wasmModule) {
      logger.warn(LOG_CATEGORIES.COMMAND, 'toggleOctave called before initialization');
      return;
    }

    logger.time('toggleOctave', LOG_CATEGORIES.COMMAND);

    // Validate selection
    if (!this.validateSelectionForCommands()) {
      logger.warn(LOG_CATEGORIES.COMMAND, 'toggleOctave called without valid selection');
      return;
    }

    try {
      // Save cursor position to restore after command
      const savedCursorPos = this.getCursorPosition();

      const selection = this.getEffectiveSelection();
      const line = this.getCurrentLine();

      if (!line) {
        logger.error(LOG_CATEGORIES.COMMAND, 'No line found for toggleOctave');
        return;
      }

      const cells = line.cells;
      // Use half-open range [start, end) to match WASM convention
      const selectedCells = cells.filter((cell, index) =>
        index >= selection.start && index < selection.end
      );
      const selectedText = selectedCells.map(cell => cell.char || '').join('');

      logger.info(LOG_CATEGORIES.COMMAND, 'Toggling octave', {
        octave,
        selection: `${selection.start}..${selection.end}`,
        selectedText
      });

      // Validate octave value
      if (![-1, 0, 1].includes(octave)) {
        logger.error(LOG_CATEGORIES.COMMAND, 'Invalid octave value', { octave });
        console.error(`Invalid octave value: ${octave}`);
        return;
      }

      const octaveNames = {
        '-1': 'lower (-1)',
        0: 'middle (0)',
        1: 'upper (1)'
      };

      // Map octave number to command name
      let command;
      if (octave === -1) {
        command = 'lower_octave';
      } else if (octave === 1) {
        command = 'upper_octave';
      } else {
        command = 'middle_octave';
      }

      // Call unified WASM apply_command function
      if (this.theDocument && this.theDocument.lines && this.theDocument.lines.length > 0) {
        const cells = line.cells;

        logger.debug(LOG_CATEGORIES.COMMAND, 'Calling WASM applyCommand', {
          cellCount: cells.length,
          range: `${selection.start}..${selection.end}`,
          command
        });

        const updatedCells = this.wasmModule.applyCommand(
          cells,
          selection.start,
          selection.end,  // Already exclusive (half-open range)
          command
        );

        logger.debug(LOG_CATEGORIES.COMMAND, 'Cell states after WASM applyCommand:', {
          command,
          cellsInRange: updatedCells.slice(selection.start, selection.end + 1).map((c, i) => ({
            index: selection.start + i,
            glyph: c.char,
            octave: c.octave
          }))
        });

        line.cells = updatedCells;
        logger.info(LOG_CATEGORIES.COMMAND, 'WASM applyCommand successful', {
          command,
          cellsModified: updatedCells.length
        });

        this.addToConsoleLog(`Applied ${command} to "${selectedText}"`);
      }

      await this.renderAndUpdate();

      // Restore cursor position to where it was before the command
      this.setCursorPosition(savedCursorPos);

      // Restore visual selection after applying octave
      this.updateSelectionDisplay();

      logger.timeEnd('toggleOctave', LOG_CATEGORIES.COMMAND);
    } catch (error) {
      logger.error(LOG_CATEGORIES.COMMAND, 'Failed to toggle octave', {
        error: error.message,
        stack: error.stack
      });
      console.error('Failed to toggle octave:', error);
    }
  }

  /**
     * Apply octave to current selection (non-toggle version for backward compatibility)
     */
  async applyOctave(octave) {
    return this.toggleOctave(octave);
  }

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
      if (this.wasmModule && this.theDocument && this.theDocument.lines.length > 0) {
        // Preserve the state field before WASM call (it's skipped during serialization)
        const preservedState = this.theDocument.state;

        // Call WASM setLineTala function with current stave
        const currentStave = this.getCurrentStave();
        const updatedDocument = await this.wasmModule.setLineTala(this.theDocument, currentStave, talaString);

        // Restore the state field after WASM call
        updatedDocument.state = preservedState;

        // Ensure all Line metadata fields exist (WASM may not include empty strings)
        if (updatedDocument.lines && updatedDocument.lines.length > 0) {
          updatedDocument.lines.forEach(line => {
            line.label = line.label ?? '';
            line.tala = line.tala ?? '';
            line.lyrics = line.lyrics ?? '';
            line.tonic = line.tonic ?? '';
            line.pitch_system = line.pitch_system ?? 0;
            line.key_signature = line.key_signature ?? '';
            line.tempo = line.tempo ?? '';
            line.time_signature = line.time_signature ?? '';
          });
        }

        this.theDocument = updatedDocument;
        console.log(`📝 After WASM setLineTala, line[${currentStave}].tala =`, updatedDocument.lines[currentStave]?.tala);
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
    // Clear any pending update
    if (this.staffNotationTimer) {
      clearTimeout(this.staffNotationTimer);
    }

    // Schedule new update with 100ms debounce
    this.staffNotationTimer = setTimeout(async () => {
      // Only render if staff notation tab is active
      if (this.ui && this.ui.activeTab === 'staff-notation') {
        console.log('[Staff Notation] Auto-updating (debounced 100ms)');
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
      const state = await this.saveDocument();
      const doc = JSON.parse(state);
      console.log('📝 calling renderer.renderDocument()');
      this.renderer.renderDocument(doc, dirtyLineIndices);
      console.log('📝 renderer.renderDocument() completed');

      // Y positions are now correctly set by Rust layout engine based on line index
      // No need to adjust in JavaScript anymore

      // Update pitch system display in header
      if (this.ui) {
        this.ui.updateCurrentPitchSystemDisplay();
      }

      // Schedule staff notation update (debounced)
      this.scheduleStaffNotationUpdate();
    } catch (error) {
      console.error('Failed to render document:', error);
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

      if (lineIndex !== null && this.theDocument && this.theDocument.state) {
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

          // Now set the cursor position after selection is cleared
          this.theDocument.state.cursor.line = lineIndex;
          if (cursorColumn !== null) {
            this.theDocument.state.cursor.col = cursorColumn;
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
        if (this.theDocument && this.theDocument.state) {
          this.theDocument.state.cursor.line = 0;
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

    // Append cursor to the current line container (not to editor)
    // This way cursor is positioned absolutely relative to its line
    // So Y coordinates work without any offset calculations
    const currentStave = this.getCurrentStave();
    const lineContainers = this.element.querySelectorAll('.notation-line');
    if (lineContainers.length > currentStave) {
      const lineContainer = lineContainers[currentStave];
      if (cursor.parentElement !== lineContainer) {
        lineContainer.appendChild(cursor);
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

    const charPos = this.getCursorPosition(); // Character position (0, 1, 2, ...)
    const lineHeight = BASE_FONT_SIZE; // Line height in pixels - matches base font size

    const currentStave = this.getCurrentStave();

    // console.log(`📍 updateCursorVisualPosition: currentStave=${currentStave}, charPos=${charPos}`);

    // SIMPLIFIED: Cursor is now a child of the current .notation-line
    // So it's positioned absolutely relative to its line container
    // We just need the Y from the first cell of the current line

    let yOffset = 32; // Default fallback

    // Find first cell to get its Y position (relative to the line)
    const cells = this.element.querySelectorAll(`[data-line-index="${currentStave}"]`);
    // console.log(`📍 Found ${cells.length} cells for line ${currentStave}`);

    if (cells.length > 0) {
      const firstCell = cells[0];
      const cellTop = parseInt(firstCell.style.top) || 32;
      // console.log(`📍 First cell top: ${firstCell.style.top}, parsed as: ${cellTop}px`);
      yOffset = cellTop; // This is already relative to the line, no offset needed
    } else {
      // console.log(`📍 No cells found for line ${currentStave}, using default yOffset=${yOffset}px`);
    }

    // Calculate pixel position using character-level positioning
    const pixelPos = this.charPosToPixel(charPos);
    // console.log(`📍 charPosToPixel(${charPos}) returned: ${pixelPos}px`);

    // console.log(`📍 Setting cursor: left=${pixelPos}px, top=${yOffset}px`);

    // Set cursor position (position: absolute relative to .notation-line)
    cursor.style.position = 'absolute';
    cursor.style.left = `${pixelPos}px`;
    cursor.style.top = `${yOffset}px`;
    cursor.style.height = `${lineHeight}px`;

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


  /**
     * Update cursor position display in UI
     */
  updateCursorPositionDisplay() {
    const cursorPos = document.getElementById('cursor-position');
    if (cursorPos) {
      // Get line, lane (row), and column for debugging
      const line = this.theDocument && this.theDocument.state && this.theDocument.state.cursor
        ? this.theDocument.state.cursor.line
        : 0;
      const col = this.getCursorPosition();

      // Display in "Line: X, Col: Y" format for debugging
      cursorPos.textContent = `Line: ${line}, Col: ${col}`;
    }

    const charCount = document.getElementById('char-count');
    if (charCount && this.theDocument && this.theDocument.lines && this.getCurrentLine()) {
      // Count all cells (lanes removed)
      const cells = this.getCurrentLine().cells || [];
      charCount.textContent = cells.length;
    }

    const selectionInfo = document.getElementById('selection-info');
    if (selectionInfo) {
      if (this.hasSelection()) {
        const selection = this.getSelection();
        const selectionText = this.getSelectedText();

        // Calculate cell count from selection range (selection has {line, col} objects)
        // Note: Selection range is half-open [start, end), exclusive of end, matching WASM/Rust convention
        let cellCount = 0;
        if (selection.start.line === selection.end.line) {
          // Single-line selection: count cells from start.col to end.col (exclusive)
          cellCount = Math.abs(selection.end.col - selection.start.col);
        } else {
          // Multi-line selection: would need to count across lines
          // For now, show line count as a placeholder
          cellCount = Math.abs(selection.end.line - selection.start.line);
        }

        selectionInfo.textContent = `Selected: ${cellCount} cells (${selectionText})`;
        selectionInfo.className = 'text-xs text-success';
      } else {
        selectionInfo.textContent = 'No selection';
        selectionInfo.className = 'text-xs text-ui-disabled-text';
      }
    }
  }

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
      if (persistentJson && this.theDocument) {
        // Rust handles field exclusion via #[serde(skip)] on ephemeral fields (state, x, y, w, h, etc.)
        // Just exclude the runtime state field - WASM serialization handles the rest
        const { state, ...persistentDoc } = this.theDocument;

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

    if (this.ui && this.ui.activeTab === 'lilypond') {
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

    if (!hitboxesContainer || !this.theDocument) {
      return;
    }

    if (!this.theDocument.lines || this.theDocument.lines.length === 0) {
      hitboxesContainer.innerHTML = '<div class="text-gray-500 text-sm">No hitboxes available. Add some content to see hitbox information.</div>';
      return;
    }

    let hitboxHTML = '<div class="space-y-4">';

    this.theDocument.lines.forEach((stave, staveIndex) => {
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
    if (!this.theDocument || !this.theDocument.lines) {
      return;
    }

    this.theDocument.lines.forEach((stave, staveIndex) => {
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
   * Handle Ctrl+C (Copy) - copy selected cells in rich format
   */
  handleCopy() {
    if (!this.theDocument || !this.wasmModule) {
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
        this.wasmModule.loadDocument(this.theDocument);
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

        this.addToConsoleLog(`Copied ${copyResult.cells?.length || 0} cells`);
      }
    } catch (error) {
      console.error('Copy failed:', error);
      this.showError('Copy failed', { details: error.message });
    }
  }

  /**
   * Handle Ctrl+X (Cut) - copy and delete selection
   */
  handleCut() {
    if (!this.theDocument) {
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
    if (!this.theDocument || !this.wasmModule) {
      console.warn('Cannot paste: document or WASM not ready');
      return;
    }

    try {
      // CRITICAL: Ensure WASM document is in sync before pasting
      try {
        this.wasmModule.loadDocument(this.theDocument);
      } catch (e) {
        console.warn('Failed to sync document with WASM before paste:', e);
      }

      const cursor = this.theDocument.state?.cursor || { line: 0, col: 0 };
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
          if (dirtyLine.row < this.theDocument.lines.length) {
            this.theDocument.lines[dirtyLine.row].cells = dirtyLine.cells;
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
    if (!this.theDocument) return;

    dirtyLines.forEach(dirtyLine => {
      if (dirtyLine.row < this.theDocument.lines.length) {
        this.theDocument.lines[dirtyLine.row].cells = dirtyLine.cells || [];
      }
    });
  }

  // NOTE: deleteSelection() method is defined earlier in this class (line ~1161)
  // The WASM-first version queries selection from WASM, not from JS document state
}

export default MusicNotationEditor;
