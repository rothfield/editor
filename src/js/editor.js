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

    // AutoSave manager
    this.autoSave = new AutoSave(this);

    // Storage manager for explicit save/load
    this.storage = new StorageManager(this);

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

      // Initialize WASM components
      this.wasmModule = {
        beatDeriver: new wasmModule.BeatDeriver(),
        // New recursive descent API
        insertCharacter: wasmModule.insertCharacter,
        parseText: wasmModule.parseText,
        deleteCharacter: wasmModule.deleteCharacter,
        applyOctave: wasmModule.applyOctave,
        applyCommand: wasmModule.applyCommand,
        // Slur API
        applySlur: wasmModule.applySlur,
        removeSlur: wasmModule.removeSlur,
        hasSlurInSelection: wasmModule.hasSlurInSelection,
        // Ornament API
        applyOrnament: wasmModule.applyOrnament,
        removeOrnament: wasmModule.removeOrnament,
        // Ornament Edit Mode API
        getOrnamentEditMode: wasmModule.getOrnamentEditMode,
        setOrnamentEditMode: wasmModule.setOrnamentEditMode,
        // Document API
        createNewDocument: wasmModule.createNewDocument,
        setTitle: wasmModule.setTitle,
        setComposer: wasmModule.setComposer,
        setDocumentPitchSystem: wasmModule.setDocumentPitchSystem,
        setLineLabel: wasmModule.setLineLabel,
        setLineLyrics: wasmModule.setLineLyrics,
        setLineTala: wasmModule.setLineTala,
        setLinePitchSystem: wasmModule.setLinePitchSystem,
        // Line manipulation API
        splitLineAtPosition: wasmModule.splitLineAtPosition,
        // Layout API
        computeLayout: wasmModule.computeLayout,
        // MusicXML export API
        exportMusicXML: wasmModule.exportMusicXML,
        convertMusicXMLToLilyPond: wasmModule.convertMusicXMLToLilyPond,
        // MIDI export API
        exportMIDI: wasmModule.exportMIDI
      };

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
      cursor: { stave: 0, column: 0 },
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
          const currentCursor = this.theDocument.state.cursor.column;
          const validatedCursor = this.validateCursorPosition(currentCursor);
          if (validatedCursor !== currentCursor) {
            logger.warn(LOG_CATEGORIES.CURSOR, 'Document loaded with invalid cursor position, correcting', {
              loaded: currentCursor,
              corrected: validatedCursor
            });
            this.theDocument.state.cursor.column = validatedCursor;
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
     */
  async insertText(text) {
    if (!this.isInitialized || !this.wasmModule) {
      logger.warn(LOG_CATEGORIES.EDITOR, 'insertText called before initialization');
      return;
    }

    logger.time('insertText', LOG_CATEGORIES.EDITOR);
    const cursorPos = this.getCursorPosition();
    const pitchSystem = this.getCurrentPitchSystem();

    logger.info(LOG_CATEGORIES.EDITOR, 'Inserting text', {
      text,
      cursorPos,
      pitchSystem: this.getPitchSystemName(pitchSystem)
    });

    const startTime = performance.now();

    try {
      if (this.theDocument && this.theDocument.lines && this.theDocument.lines.length > 0) {
        const line = this.getCurrentLine();
        if (!line) {
          logger.error(LOG_CATEGORIES.PARSER, 'Current line not available');
          return;
        }
        let cells = line.cells;

        logger.debug(LOG_CATEGORIES.PARSER, 'Processing characters', {
          charCount: text.length,
          initialCellCount: cells.length
        });

        // Insert each character using recursive descent parser
        // cursorPos is a CHARACTER position, but WASM insertCharacter expects a CELL index
        let currentCharPos = cursorPos;

        for (const char of text) {
          const lengthBefore = cells.length;

          // Convert character position to cell index for WASM API
          const { cellIndex, charOffsetInCell } = this.charPosToCellIndex(currentCharPos);

          // If we're past the start of a cell, insert after it
          // (WASM API inserts between cells, not within cells)
          const insertCellIndex = charOffsetInCell > 0 ? cellIndex + 1 : cellIndex;

          logger.debug(LOG_CATEGORIES.PARSER, `Inserting char '${char}'`, {
            charPos: currentCharPos,
            cellIndex,
            charOffsetInCell,
            insertCellIndex,
            cellCountBefore: lengthBefore
          });

          // Call WASM recursive descent API with CELL index
          // WASM returns { cells, newCursorPos }
          const result = this.wasmModule.insertCharacter(
            cells,
            char,
            insertCellIndex,
            pitchSystem
          );

          // Extract cells and new cursor position from WASM result
          const updatedCells = result.cells;
          currentCharPos = result.newCursorPos;

          const lengthAfter = updatedCells.length;

          // Update main line with combined cells
          line.cells = updatedCells;
          cells = updatedCells;

          const cellDelta = lengthAfter - lengthBefore;

          logger.trace(LOG_CATEGORIES.PARSER, `Cell delta: ${cellDelta}, WASM cursor pos: ${currentCharPos}`, {
            lengthBefore,
            lengthAfter
          });
        }

        // Update cursor position (character-based position from WASM)
        logger.debug(LOG_CATEGORIES.CURSOR, 'Updating cursor position', {
          from: cursorPos,
          to: currentCharPos
        });
        // Update cursor column with WASM-provided character position
        if (this.theDocument && this.theDocument.state) {
          this.theDocument.state.cursor.column = currentCharPos;
          this.updateCursorPositionDisplay();
        }

        // Derive beats using WASM BeatDeriver
        this.deriveBeats(line);
      }

      await this.renderAndUpdate();

      // Ensure hitbox values are properly set on the document cells
      // The WASM insertCharacter may return cells without hitbox fields
      this.ensureHitboxesAreSet();

      // Force hitboxes display update after render
      setTimeout(() => {
        this.updateHitboxesDisplay();
      }, 100);

      const endTime = performance.now();
      const duration = endTime - startTime;

      // Show cursor after typing
      this.showCursor();

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
     * Derive beats from cells using WASM BeatDeriver
     */
  deriveBeats(line) {
    if (!this.wasmModule || !this.wasmModule.beatDeriver) {
      logger.error(LOG_CATEGORIES.EDITOR, 'BeatDeriver not available - WASM module not loaded');
      console.error('CRITICAL: BeatDeriver not available. Cannot derive beats.');
      line.beats = [];
      return;
    }

    try {
      const cells = line.cells;
      if (!cells || cells.length === 0) {
        line.beats = [];
        return;
      }

      logger.debug(LOG_CATEGORIES.EDITOR, 'Deriving beats via WASM', {
        cellCount: cells.length
      });

      // Call WASM BeatDeriver.deriveImplicitBeats method (exposed as deriveImplicitBeats in JS)
      const beats = this.wasmModule.beatDeriver.deriveImplicitBeats(cells);

      console.log(`WASM BeatDeriver returned ${beats.length} beats:`, beats);

      line.beats = beats;
      logger.info(LOG_CATEGORIES.EDITOR, `Derived ${beats.length} beats via WASM`);
    } catch (error) {
      logger.error(LOG_CATEGORIES.EDITOR, 'WASM BeatDeriver failed', {
        error: error.message,
        cellCount: cells?.length || 0
      });
      console.error('WASM BeatDeriver failed:', error);
      line.beats = [];
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
      // Simple deletion for POC - manual array manipulation
      if (this.theDocument && this.theDocument.lines && this.theDocument.lines.length > 0) {
        const line = this.getCurrentLine();
        if (!line) return;
        const cells = line.cells;

        // Check if any cell in range has an ornament indicator - if so, prevent deletion
        for (let i = start; i < end && i < cells.length; i++) {
          if (cells[i] && cells[i].ornament_indicator && cells[i].ornament_indicator.name !== 'none') {
            console.log('[DELETE] Protected: cannot delete ornament cell at index', i);
            this.showWarning('Cannot delete cells with ornaments - ornaments are non-editable');
            return; // Don't delete anything if any cell has an ornament
          }
        }

        // Delete cells in range
        cells.splice(start, end - start);
      }

      this.setCursorPosition(start);
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
      return this.theDocument.state.cursor.stave;
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
    const { cellIndex } = this.charPosToCellIndex(charPos);

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
      return this.theDocument.state.cursor.column;
    }
    return 0;
  }

  /**
     * Set cursor position with bounds checking (character offset)
     */
  setCursorPosition(position) {
    if (this.theDocument && this.theDocument.state) {
      // Validate and clamp cursor position to valid range
      const validatedPosition = this.validateCursorPosition(position);
      this.theDocument.state.cursor.column = validatedPosition;
      this.updateCursorPositionDisplay();
      this.updateCursorVisualPosition();
      this.showCursor();
    }
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
        if (!line) return;
        // If line has pitch_system set (non-zero), use it
        if (line.pitch_system && line.pitch_system !== 0) {
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
    let key = event.key;
    const modifiers = {
      alt: event.altKey,
      ctrl: event.ctrlKey,
      shift: event.shiftKey
    };

    // Fix for browsers that return "alt" instead of the actual key when Alt is pressed
    // Use event.code as fallback (e.g., "KeyL" -> "l")
    if (modifiers.alt && (key === 'alt' || key === 'Alt')) {
      const code = event.code;
      if (code && code.startsWith('Key')) {
        key = code.replace('Key', '').toLowerCase();
      }
    }

    // Ignore Ctrl key combinations (let browser handle them)
    if (modifiers.ctrl) {
      return;
    }

    // Route to appropriate handler
    if (modifiers.alt && modifiers.shift && !modifiers.ctrl) {
      // T063: Alt+Shift commands
      this.handleAltShiftCommand(key);
    } else if (modifiers.alt && !modifiers.ctrl && !modifiers.shift) {
      this.handleAltCommand(key);
    } else if (modifiers.shift && !modifiers.alt && !modifiers.ctrl && this.isSelectionKey(key)) {
      // Only route to selection handler for actual selection keys (arrows, Home, End)
      this.handleShiftCommand(key);
    } else {
      this.handleNormalKey(key);
    }
  }

  /**
     * Check if key is a selection key (arrow keys, Home, End)
     */
  isSelectionKey(key) {
    return ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(key);
  }

  /**
     * Handle Alt+key commands (musical commands) with enhanced validation
     */
  handleAltCommand(key) {
    // Log command for debugging
    this.addToConsoleLog(`Musical command: Alt+${key.toLowerCase()}`);

    switch (key.toLowerCase()) {
      case 's':
        this.applySlur();
        break;
      case 'u':
        this.applyOctave(1); // Upper octave (+1)
        break;
      case 'm':
        this.applyOctave(0); // Middle octave (0, remove octave marking)
        break;
      case 'l':
        this.applyOctave(-1); // Lower octave (-1)
        break;
      case 't':
        this.showTalaDialog();
        break;
      case 'o':
        this.applyOrnamentIndicator(); // Legacy - redirects to applyOrnament('after')
        break;
      case '0':
        this.applyOrnament('after'); // Alt+0: Apply ornament (default "after" position)
        break;
      default:
        console.log('Unknown Alt command:', key);
        this.showWarning(`Unknown musical command: Alt+${key}`, {
          important: false,
          details: `Available commands: Alt+S (slur), Alt+O (ornament), Alt+U (upper octave), Alt+M (middle octave), Alt+L (lower octave), Alt+T (tala)`
        });
        return;
    }
  }

  /**
   * T063: Handle Alt+Shift+key commands (mode toggles)
   */
  handleAltShiftCommand(key) {
    this.addToConsoleLog(`Mode command: Alt+Shift+${key.toUpperCase()}`);

    switch (key.toLowerCase()) {
      case 'o':
        // Alt+Shift+O: Toggle ornament edit mode
        this.toggleOrnamentEditMode();
        break;
      default:
        console.log('Unknown Alt+Shift command:', key);
        this.showWarning(`Unknown mode command: Alt+Shift+${key.toUpperCase()}`, {
          important: false,
          details: `Available commands: Alt+Shift+O (toggle ornament edit mode)`
        });
        return;
    }
  }

  /**
     * Handle Shift+key commands (selection)
     */
  handleShiftCommand(key) {
    let handled = false;

    switch (key) {
      case 'ArrowLeft':
        this.extendSelectionLeft();
        handled = true;
        break;
      case 'ArrowRight':
        this.extendSelectionRight();
        handled = true;
        break;
      case 'ArrowUp':
        this.extendSelectionUp();
        handled = true;
        break;
      case 'ArrowDown':
        this.extendSelectionDown();
        handled = true;
        break;
      case 'Home':
        this.extendSelectionToStart();
        handled = true;
        break;
      case 'End':
        this.extendSelectionToEnd();
        handled = true;
        break;
      default:
        // Ignore non-selection Shift commands (like Shift+#, Shift alone, etc.)
        return;
    }

    if (handled) {
      this.updateSelectionDisplay();
    }
  }

  /**
     * Handle normal keys (text input) with selection awareness
     */
  handleNormalKey(key) {
    switch (key) {
      case 'ArrowLeft':
      case 'ArrowRight':
      case 'ArrowUp':
      case 'ArrowDown':
      case 'Home':
      case 'End':
        // Clear selection when navigating
        if (this.hasSelection()) {
          this.clearSelection();
        }
        this.handleNavigation(key);
        break;
      case 'Backspace':
        this.handleBackspace();
        break;
      case 'Delete':
        this.handleDelete();
        break;
      case 'Enter':
        this.handleEnter();
        break;
      default:
        // Insert text character - do NOT replace selection
        if (key.length === 1 && !key.match(/[Ff][0-9]/)) { // Exclude F-keys
          this.insertText(key);
        }
    }
  }

  /**
     * Handle navigation keys with enhanced functionality
     */
  handleNavigation(key) {
    switch (key) {
      case 'ArrowLeft':
        this.navigateLeft();
        break;
      case 'ArrowRight':
        this.navigateRight();
        break;
      case 'ArrowUp':
        this.navigateUp();
        break;
      case 'ArrowDown':
        this.navigateDown();
        break;
      case 'Home':
        this.navigateHome();
        break;
      case 'End':
        this.navigateEnd();
        break;
      default:
        console.log('Unknown navigation key:', key);
        return;
    }
  }

  /**
     * Navigate left one stop (cell or ornament)
     */
  navigateLeft() {
    logger.debug(LOG_CATEGORIES.CURSOR, 'Navigate left');

    // Get current position and check if we're inside a cell
    const currentPos = this.getCursorPosition();
    const { cellIndex, charOffsetInCell } = this.charPosToCellIndex(currentPos);

    // If inside a cell (not at start), move to beginning of current cell
    if (charOffsetInCell > 0) {
      // cellIndexToCharPos returns position AFTER a cell, so for start of cell use previous cell's end
      const charPos = cellIndex === 0 ? 0 : this.cellIndexToCharPos(cellIndex - 1);
      this.setCursorPosition(charPos);
      logger.debug(LOG_CATEGORIES.CURSOR, 'Moved to start of current cell', {
        cellIndex,
        newCharPos: charPos
      });
      return;
    }

    // At start of a cell, move to previous cell/line
    const stops = this.getNavigableStops();
    if (stops.length === 0) return;

    // Find current stop
    const currentStop = this.getCurrentStop();
    if (!currentStop) {
      this.setCursorPosition(0);
      return;
    }

    if (currentStop.stopIndex > 0) {
      // Move to previous stop within current line (to the START of the previous cell)
      const prevStop = stops[currentStop.stopIndex - 1];
      const charPos = prevStop.cellIndex === 0 ? 0 : this.cellIndexToCharPos(prevStop.cellIndex - 1);
      this.setCursorPosition(charPos);
      logger.debug(LOG_CATEGORIES.CURSOR, 'Moved to previous stop', {
        stopIndex: prevStop.stopIndex,
        cellIndex: prevStop.cellIndex
      });
    } else if (currentStop.stopIndex === 0 && this.theDocument && this.theDocument.state) {
      // At beginning of current line - move to end of previous line
      const currentStave = this.theDocument.state.cursor.stave;
      if (currentStave > 0) {
        const prevStave = currentStave - 1;
        this.theDocument.state.cursor.stave = prevStave;

        // Move to end of previous line
        const prevLine = this.theDocument.lines[prevStave];
        if (prevLine) {
          const prevMaxCharPos = this.calculateMaxCharPosition(prevLine);
          this.setCursorPosition(prevMaxCharPos);
          logger.debug(LOG_CATEGORIES.CURSOR, `Navigate left to end of previous line`, {
            stave: prevStave,
            charPos: prevMaxCharPos
          });
        }
      }
    }
  }

  /**
     * Navigate right one stop (cell or ornament)
     */
  navigateRight() {
    logger.debug(LOG_CATEGORIES.CURSOR, 'Navigate right');

    // Get current position and check if we're at end of cell
    const currentPos = this.getCursorPosition();
    const { cellIndex, charOffsetInCell } = this.charPosToCellIndex(currentPos);

    const currentStave = this.theDocument?.state?.cursor?.stave || 0;
    const line = this.theDocument?.lines?.[currentStave];
    const cell = line?.cells?.[cellIndex];

    // If not at end of cell, move to end of current cell
    if (cell && charOffsetInCell < cell.char.length) {
      const charPos = this.cellIndexToCharPos(cellIndex);
      this.setCursorPosition(charPos);
      logger.debug(LOG_CATEGORIES.CURSOR, 'Moved to end of current cell', {
        cellIndex,
        newCharPos: charPos
      });
      return;
    }

    // At end of a cell, move to next cell/line
    const stops = this.getNavigableStops();
    if (stops.length === 0) return;

    // Find current stop
    const currentStop = this.getCurrentStop();
    if (!currentStop) {
      this.setCursorPosition(0);
      return;
    }

    if (currentStop.stopIndex < stops.length - 1) {
      // Move to next stop within current line
      const nextStop = stops[currentStop.stopIndex + 1];
      const charPos = this.cellIndexToCharPos(nextStop.cellIndex);
      this.setCursorPosition(charPos);
      logger.debug(LOG_CATEGORIES.CURSOR, 'Moved to next stop', {
        stopIndex: nextStop.stopIndex,
        cellIndex: nextStop.cellIndex
      });
    } else if (currentStop.stopIndex === stops.length - 1 && this.theDocument && this.theDocument.state && this.theDocument.lines) {
      // At end of current line - move to beginning of next line
      const currentStaveForMove = this.theDocument.state.cursor.stave;
      if (currentStaveForMove < this.theDocument.lines.length - 1) {
        this.theDocument.state.cursor.stave = currentStaveForMove + 1;
        this.setCursorPosition(0);
        logger.debug(LOG_CATEGORIES.CURSOR, `Navigate right to beginning of next line`, {
          stave: currentStaveForMove + 1
        });
      }
    }
  }

  /**
     * Navigate up to previous line, preserving column position
     */
  navigateUp() {
    if (!this.theDocument || !this.theDocument.state) {
      return;
    }

    const currentStave = this.theDocument.state.cursor.stave;
    if (currentStave > 0) {
      const currentCharPos = this.getCursorPosition();
      this.theDocument.state.cursor.stave = currentStave - 1;

      // Preserve column position: clamp to max char pos of previous line
      const prevLine = this.theDocument.lines[currentStave - 1];
      if (prevLine) {
        const prevMaxCharPos = this.calculateMaxCharPosition(prevLine);
        const targetCharPos = Math.min(currentCharPos, prevMaxCharPos);
        this.setCursorPosition(targetCharPos);
        logger.debug(LOG_CATEGORIES.CURSOR, `Navigate up to stave ${currentStave - 1}`, {
          charPos: targetCharPos
        });
      }
    }
  }

  /**
     * Navigate down to next line, preserving column position
     */
  navigateDown() {
    if (!this.theDocument || !this.theDocument.state || !this.theDocument.lines) {
      return;
    }

    const currentStave = this.theDocument.state.cursor.stave;
    if (currentStave < this.theDocument.lines.length - 1) {
      const currentCharPos = this.getCursorPosition();
      this.theDocument.state.cursor.stave = currentStave + 1;

      // Preserve column position: clamp to max char pos of next line
      const nextLine = this.theDocument.lines[currentStave + 1];
      if (nextLine) {
        const nextMaxCharPos = this.calculateMaxCharPosition(nextLine);
        const targetCharPos = Math.min(currentCharPos, nextMaxCharPos);
        this.setCursorPosition(targetCharPos);
        logger.debug(LOG_CATEGORIES.CURSOR, `Navigate down to stave ${currentStave + 1}`, {
          charPos: targetCharPos
        });
      }
    }
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
     * Navigate to beginning of current line
     */
  navigateHome() {
    logger.debug(LOG_CATEGORIES.CURSOR, 'Navigate home');
    this.setCursorPosition(0);
  }

  /**
     * Navigate to end of current line
     */
  navigateEnd() {
    logger.debug(LOG_CATEGORIES.CURSOR, 'Navigate end');
    const maxCharPos = this.getMaxCharPosition();
    this.setCursorPosition(maxCharPos);
  }

  /**
     * Get the maximum cell index in the main lane
     */
  getMaxCellIndex() {
    if (!this.theDocument || !this.theDocument.lines || this.theDocument.lines.length === 0) {
      return 0;
    }

    const line = this.getCurrentLine();
        if (!line) return;
    const cells = line.cells || [];

    return cells.length; // Position after last cell
  }

  /**
     * Get the maximum character position in the line
     */
  getMaxCharPosition() {
    if (!this.theDocument || !this.theDocument.state || !this.theDocument.lines || this.theDocument.lines.length === 0) {
      return 0;
    }

    const currentStave = this.theDocument.state.cursor.stave;
    const line = this.theDocument.lines[currentStave];
    if (!line) {
      return 0;
    }

    const cells = line.cells || [];
    const editMode = this.wasmModule.getOrnamentEditMode(this.theDocument);

    // Sum up lengths of all navigable cell glyphs (skip ornaments in normal mode)
    let totalChars = 0;
    for (const cell of cells) {
      // In normal mode, skip ornament cells (they're out of the flow)
      if (!editMode && cell.ornament_indicator && cell.ornament_indicator.name !== 'none') {
        continue;
      }
      totalChars += cell.char.length;
    }

    return totalChars;
  }

  /**
     * Convert character position to cell index
     * @param {number} charPos - Character position (0-based)
     * @returns {Object} {cellIndex, charOffsetInCell}
     */
  charPosToCellIndex(charPos) {
    if (!this.theDocument || !this.theDocument.state || !this.theDocument.lines || this.theDocument.lines.length === 0) {
      return { cellIndex: 0, charOffsetInCell: 0 };
    }

    const currentStave = this.theDocument.state.cursor.stave;
    const line = this.theDocument.lines[currentStave];
    if (!line) {
      return { cellIndex: 0, charOffsetInCell: 0 };
    }

    const cells = line.cells || [];
    const editMode = this.wasmModule.getOrnamentEditMode(this.theDocument);

    let accumulatedChars = 0;
    for (let cellIndex = 0; cellIndex < cells.length; cellIndex++) {
      const cell = cells[cellIndex];

      // In normal mode, skip ornament cells (they're out of the flow)
      if (!editMode && cell.ornament_indicator && cell.ornament_indicator.name !== 'none') {
        continue;
      }

      const cellLength = cell.char.length;

      if (charPos <= accumulatedChars + cellLength) {
        return {
          cellIndex,
          charOffsetInCell: charPos - accumulatedChars
        };
      }

      accumulatedChars += cellLength;
    }

    // Position after last cell
    return {
      cellIndex: cells.length,
      charOffsetInCell: 0
    };
  }

  /**
     * Convert cell index to character position
     * @param {number} cellIndex - Cell index (0-based)
     * @returns {number} Character position at the start of this cell
     */
  cellIndexToCharPos(cellIndex) {
    if (!this.theDocument || !this.theDocument.state || !this.theDocument.lines || this.theDocument.lines.length === 0) {
      return 0;
    }

    const currentStave = this.theDocument.state.cursor.stave;
    const line = this.theDocument.lines[currentStave];
    if (!line) {
      return 0;
    }

    const cells = line.cells || [];
    const editMode = this.wasmModule.getOrnamentEditMode(this.theDocument);

    let charPos = 0;
    // Sum up lengths of all navigable cells UP TO AND INCLUDING the target cell
    for (let i = 0; i <= cellIndex && i < cells.length; i++) {
      const cell = cells[i];

      // In normal mode, skip ornament cells (they're out of the flow)
      if (!editMode && cell.ornament_indicator && cell.ornament_indicator.name !== 'none') {
        continue;
      }

      charPos += cell.char.length;
    }

    return charPos;
  }

  /**
     * Calculate pixel position for a character position
     * @param {number} charPos - Character position (0-based)
     * @returns {number} Pixel X position
     */
  charPosToPixel(charPos) {
    if (!this.renderer || !this.renderer.displayList) {
      return LEFT_MARGIN_PX;
    }

    const displayList = this.renderer.displayList;
    const currentStave = this.getCurrentStave();
    const currentLine = displayList.lines && displayList.lines[currentStave];

    if (!currentLine || !currentLine.cells || currentLine.cells.length === 0) {
      return LEFT_MARGIN_PX;
    }

    // Convert char position to cell + offset
    const { cellIndex, charOffsetInCell } = this.charPosToCellIndex(charPos);

    // If before first cell
    if (cellIndex === 0 && charOffsetInCell === 0) {
      return currentLine.cells[0].cursor_left;
    }

    // If after all cells
    if (cellIndex >= currentLine.cells.length) {
      const lastCell = currentLine.cells[currentLine.cells.length - 1];
      return lastCell.cursor_right;
    }

    // Get cell from DisplayList
    const cell = currentLine.cells[cellIndex];

    // If at start of cell
    if (charOffsetInCell === 0) {
      return cell.cursor_left;
    }

    // Use pre-calculated character positions from Rust DisplayList
    if (cell.char_positions && charOffsetInCell < cell.char_positions.length) {
      return cell.char_positions[charOffsetInCell];
    }

    // Fallback: proportional split (if char_positions not available)
    const cellLength = cell.char.length;
    const cellWidth = cell.cursor_right - cell.cursor_left;
    const charWidth = cellWidth / cellLength;
    return cell.x + (charWidth * charOffsetInCell);
  }


  // ==================== SELECTION MANAGEMENT ====================

  /**
     * Initialize selection range using cell indices (backward compatibility)
     * Internally converts to stop indices
     */
  initializeSelection(startCellIndex, endCellIndex) {
    if (!this.theDocument || !this.theDocument.state) {
      return;
    }

    const stops = this.getNavigableStops();

    // Find stops corresponding to cell indices
    const startStop = this.findStopFromCellIndex(stops, Math.min(startCellIndex, endCellIndex));
    const endStop = this.findStopFromCellIndex(stops, Math.max(startCellIndex, endCellIndex));

    if (!startStop || !endStop) {
      // Fallback to cell-based selection
      this.theDocument.state.selection = {
        start: Math.min(startCellIndex, endCellIndex),
        end: Math.max(startCellIndex, endCellIndex),
        active: true,
        // Stop-based fields
        startStopIndex: null,
        endStopIndex: null,
      };
      return;
    }

    this.theDocument.state.selection = {
      // Cell-based (for backward compatibility)
      start: startStop.cellIndex,
      end: endStop.cellIndex,
      active: true,
      // Stop-based (for navigation)
      startStopIndex: startStop.stopIndex,
      endStopIndex: endStop.stopIndex,
    };
  }

  /**
   * Initialize selection using stop indices directly
   */
  initializeSelectionByStops(startStopIndex, endStopIndex) {
    if (!this.theDocument || !this.theDocument.state) {
      return;
    }

    const stops = this.getNavigableStops();
    const startStop = stops[startStopIndex];
    const endStop = stops[endStopIndex];

    if (!startStop || !endStop) {
      return;
    }

    // Normalize so start <= end
    const minStopIndex = Math.min(startStopIndex, endStopIndex);
    const maxStopIndex = Math.max(startStopIndex, endStopIndex);
    const minCellIndex = Math.min(startStop.cellIndex, endStop.cellIndex);
    const maxCellIndex = Math.max(startStop.cellIndex, endStop.cellIndex);

    this.theDocument.state.selection = {
      // Cell-based (for backward compatibility)
      start: minCellIndex,
      end: maxCellIndex,
      active: true,
      // Stop-based (for navigation)
      startStopIndex: minStopIndex,
      endStopIndex: maxStopIndex,
    };
  }

  /**
     * Clear current selection
     */
  clearSelection() {
    if (this.theDocument && this.theDocument.state) {
      this.theDocument.state.selection = null;
    }
    this.clearSelectionVisual();
    this.updateDocumentDisplay();
  }

  /**
     * Check if there's an active selection
     */
  hasSelection() {
    return !!(this.theDocument && this.theDocument.state && this.theDocument.state.selection && this.theDocument.state.selection.active);
  }

  /**
     * Get current selection range
     */
  getSelection() {
    if (this.hasSelection()) {
      return this.theDocument.state.selection;
    }
    return null;
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
        if (!line) return;
    const cells = line.cells || [];

    if (cells.length === 0) {
      return '';
    }

    // Extract text from selection range (inclusive)
    const selectedCells = cells.filter((cell, index) =>
      index >= selection.start && index <= selection.end
    );

    return selectedCells.map(cell => cell.char || '').join('');
  }

  /**
     * Extend selection to the left
     */
  extendSelectionLeft() {
    const currentPos = this.getCursorPosition();
    if (currentPos <= 0) return; // Can't go further left

    const stops = this.getNavigableStops();
    if (stops.length === 0) return;

    let selection = this.getSelection();

    if (!selection || selection.startStopIndex === null) {
      // Start new selection: get the cell immediately to the left of the cursor
      const { cellIndex } = this.charPosToCellIndex(currentPos);

      // Find the stop for this cell
      let targetStopIndex = -1;
      for (const stop of stops) {
        if (stop.cellIndex === cellIndex) {
          targetStopIndex = stop.stopIndex;
          break;
        }
      }

      if (targetStopIndex === -1) return;
      this.initializeSelectionByStops(targetStopIndex, targetStopIndex);
    } else {
      // Extend existing selection leftward
      // Move start one stop to the left, keep end fixed
      const newStartStopIndex = selection.startStopIndex - 1;
      if (newStartStopIndex < 0) return; // Can't extend further left
      this.initializeSelectionByStops(newStartStopIndex, selection.endStopIndex);
    }

    this.updateSelectionDisplay();
  }

  /**
     * Extend selection to the right (stop-based)
     */
  extendSelectionRight() {
    const stops = this.getNavigableStops();
    if (stops.length === 0) return;

    const currentStop = this.getCurrentStop();
    if (!currentStop) return;

    let selection = this.getSelection();

    if (!selection || selection.startStopIndex === null) {
      // Start new selection at current stop
      this.initializeSelectionByStops(currentStop.stopIndex, currentStop.stopIndex);
      selection = this.getSelection();
    }

    // Can we move the cursor right?
    if (currentStop.stopIndex < stops.length - 1) {
      const nextStop = stops[currentStop.stopIndex + 1];

      // Determine if we're extending from anchor or head
      const anchorStopIndex = selection.startStopIndex;
      const headStopIndex = currentStop.stopIndex;

      if (headStopIndex === selection.startStopIndex) {
        // Extending right from start (growing)
        this.initializeSelectionByStops(anchorStopIndex, nextStop.stopIndex);
      } else {
        // Extending right from end (shrinking or reversing)
        this.initializeSelectionByStops(selection.startStopIndex, nextStop.stopIndex);
      }

      // Move cursor to new position
      const charPos = this.cellIndexToCharPos(nextStop.cellIndex);
      this.setCursorPosition(charPos);
    } else if (currentStop.stopIndex === selection.endStopIndex && selection.startStopIndex < selection.endStopIndex) {
      // At right edge of selection and can't move right - shrink selection from the left
      const nextStartStop = stops[selection.startStopIndex + 1];
      this.initializeSelectionByStops(nextStartStop.stopIndex, selection.endStopIndex);

      // Cursor stays at the same position (right edge of new selection)
    }
  }

  /**
     * Extend selection up (cursor stays on main line)
     */
  extendSelectionUp() {
    // Cursor is always on main line - no lane switching
    console.log('extendSelectionUp: cursor always stays on main line');
  }

  /**
     * Extend selection down (cursor stays on main line)
     */
  extendSelectionDown() {
    // Cursor is always on main line - no lane switching
    console.log('extendSelectionDown: cursor always stays on main line');
  }

  /**
     * Extend selection to start of line (stop-based)
     */
  extendSelectionToStart() {
    const stops = this.getNavigableStops();
    if (stops.length === 0) return;

    const currentStop = this.getCurrentStop();
    if (!currentStop) return;

    const firstStop = stops[0];
    const selection = this.getSelection();

    if (!selection || selection.startStopIndex === null) {
      // Start new selection from current stop to first stop
      this.initializeSelectionByStops(firstStop.stopIndex, currentStop.stopIndex);
    } else {
      // Extend existing selection to start
      this.initializeSelectionByStops(firstStop.stopIndex, selection.endStopIndex);
    }

    // Move cursor to start (to the START of the first cell)
    const charPos = firstStop.cellIndex === 0 ? 0 : this.cellIndexToCharPos(firstStop.cellIndex - 1);
    this.setCursorPosition(charPos);
  }

  /**
     * Extend selection to end of line (stop-based)
     */
  extendSelectionToEnd() {
    const stops = this.getNavigableStops();
    if (stops.length === 0) return;

    const currentStop = this.getCurrentStop();
    if (!currentStop) return;

    const lastStop = stops[stops.length - 1];
    const selection = this.getSelection();

    if (!selection || selection.startStopIndex === null) {
      // Start new selection from current stop to last stop
      this.initializeSelectionByStops(currentStop.stopIndex, lastStop.stopIndex);
    } else {
      // Extend existing selection to end
      this.initializeSelectionByStops(selection.startStopIndex, lastStop.stopIndex);
    }

    // Move cursor to end
    const charPos = this.cellIndexToCharPos(lastStop.cellIndex);
    this.setCursorPosition(charPos);
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
    if (!this.renderer || !this.renderer.element) {
      console.warn('❌ No renderer or renderer element');
      return;
    }

    // Find the line element
    const lineElement = this.renderer.element.querySelector(`[data-line="${this.getCurrentStave()}"]`);
    if (!lineElement) {
      console.warn('❌ Line element not found, cannot render selection');
      return;
    }

    // Add 'selected' class to all cells in the selection range (inclusive)
    for (let i = selection.start; i <= selection.end; i++) {
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

      // Insert new text at selection start position
      this.setCursorPosition(selection.start);
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
    const selection = this.getSelection();
    if (!selection) {
      return;
    }

    try {
      await this.deleteRange(selection.start, selection.end);
      this.setCursorPosition(selection.start);
      this.clearSelection();
    } catch (error) {
      console.error('Failed to delete selection:', error);
      this.showError('Failed to delete selection');
    }
  }

  /**
     * Handle backspace key with selection awareness and beat recalculation
     */
  async handleBackspace() {
    logger.time('handleBackspace', LOG_CATEGORIES.EDITOR);
    const charPos = this.getCursorPosition();

    logger.info(LOG_CATEGORIES.EDITOR, 'Backspace pressed', {
      charPos,
      hasSelection: this.hasSelection()
    });

    if (this.hasSelection()) {
      // Delete selected content
      logger.debug(LOG_CATEGORIES.EDITOR, 'Deleting selection via backspace');
      await this.deleteSelection();
      await this.recalculateBeats();
    } else if (charPos > 0) {
      // Convert character position to cell index
      const { cellIndex, charOffsetInCell } = this.charPosToCellIndex(charPos);

      // Use WASM API to delete character (cell-based operation)
      if (this.theDocument && this.theDocument.lines && this.theDocument.lines.length > 0) {
        const line = this.getCurrentLine();
        if (!line) return;
        const cells = line.cells;

        // Determine which cell to delete: if at cell boundary, delete previous cell
        const cellIndexToDelete = charOffsetInCell === 0 ? cellIndex - 1 : cellIndex;

        if (cellIndexToDelete >= 0 && cellIndexToDelete < cells.length) {
          const cellToDelete = cells[cellIndexToDelete];

          // Check if cell has an ornament indicator - if so, act as left arrow instead of deleting
          if (cellToDelete && cellToDelete.ornament_indicator && cellToDelete.ornament_indicator.name !== 'none') {
            console.log('[BACKSPACE] Protected: ornament cell cannot be deleted, acting as left arrow');
            logger.info(LOG_CATEGORIES.EDITOR, 'Backspace on ornament cell - acting as left arrow', {
              cellIndexToDelete,
              currentCharPos: charPos,
              ornamentIndicator: cellToDelete.ornament_indicator
            });

            // Move cursor left instead of deleting
            const newCharPos = Math.max(0, charPos - 1);
            this.setCursorPosition(newCharPos);
            this.showCursor();
            this.updateSelectionDisplay();

            logger.timeEnd('handleBackspace', LOG_CATEGORIES.EDITOR);
            return; // Early return - don't delete
          }

          logger.debug(LOG_CATEGORIES.EDITOR, 'Calling WASM deleteCharacter', {
            cellIndexToDelete,
            cellCount: cells.length
          });

          const updatedCells = this.wasmModule.deleteCharacter(cells, cellIndexToDelete);
          line.cells = updatedCells;

          // Move cursor to start of deleted cell
          const newCharPos = this.cellIndexToCharPos(cellIndexToDelete);
          this.setCursorPosition(newCharPos);

          logger.info(LOG_CATEGORIES.EDITOR, 'Cell deleted, cursor moved back', {
            newCellCount: updatedCells.length,
            newCharPos
          });
        }
      }

      // Recalculate beats after deletion
      await this.recalculateBeats();

      await this.renderAndUpdate();

      // Show cursor (showCursor will call updateCursorVisualPosition internally)
      this.showCursor();

      // Restore visual selection after backspace
      this.updateSelectionDisplay();
    } else if (charPos === 0) {
      // Backspace at beginning of line - merge with previous line
      const currentStave = this.getCurrentStave();

      if (currentStave > 0) {
        // There is a previous line to merge with
        logger.info(LOG_CATEGORIES.EDITOR, 'Merging line with previous line', {
          currentStave,
          currentLineLength: this.getCurrentLine().cells.length,
          previousLineLength: this.theDocument.lines[currentStave - 1].cells.length
        });

        try {
          const prevLine = this.theDocument.lines[currentStave - 1];
          const currLine = this.getCurrentLine();

          // Calculate cursor position: end of previous line
          const mergeCharPos = this.cellIndexToCharPos(prevLine.cells.length);

          // Merge: append current line's cells to previous line
          prevLine.cells = prevLine.cells.concat(currLine.cells);

          // Remove current line from document
          this.theDocument.lines.splice(currentStave, 1);

          // Update cursor: move to previous line at merge point
          this.theDocument.state.cursor.stave = currentStave - 1;
          this.theDocument.state.cursor.column = mergeCharPos;

          logger.debug(LOG_CATEGORIES.EDITOR, 'Lines merged successfully', {
            newLineLength: prevLine.cells.length,
            newCursorStave: currentStave - 1,
            newCursorColumn: mergeCharPos
          });

          // Recalculate beats for the merged line
          this.deriveBeats(prevLine);

          await this.renderAndUpdate();
          this.showCursor();

          logger.info(LOG_CATEGORIES.EDITOR, 'Backspace merge complete', {
            totalLines: this.theDocument.lines.length
          });
        } catch (error) {
          logger.error(LOG_CATEGORIES.EDITOR, 'Failed to merge lines', {
            error: error.message,
            stack: error.stack
          });
          console.error('Failed to merge lines:', error);
          this.showError('Failed to merge lines: ' + error.message);
        }
      } else {
        logger.debug(LOG_CATEGORIES.EDITOR, 'Backspace at start of first line, no action');
      }
    } else {
      logger.debug(LOG_CATEGORIES.EDITOR, 'Backspace at start of document, no action');
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
        const { cellIndex } = this.charPosToCellIndex(charPos);

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

            console.log('[DELETE] No ornament protection - proceeding with deletion');
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
    console.log('🔄 handleEnter called');
    logger.time('handleEnter', LOG_CATEGORIES.EDITOR);

    // If there's an actual selection (start != end), do nothing (wait for undo implementation)
    const selection = this.getSelection();
    console.log('🔄 Selection check:', selection);
    if (selection && selection.start !== selection.end) {
      console.log('🔄 Selection active, blocking');
      logger.warn(LOG_CATEGORIES.EDITOR, 'Cannot split line with active selection (undo not yet implemented)');
      this.showWarning('Cannot split line with active selection', {
        important: false,
        details: 'Undo functionality not yet implemented'
      });
      return;
    }

    try {
      console.log('🔄 Proceeding with split');
      if (!this.theDocument || !this.theDocument.lines || this.theDocument.lines.length === 0) {
        console.error('🔄 No document');
        logger.error(LOG_CATEGORIES.EDITOR, 'No document or lines available');
        return;
      }

      const currentStave = this.getCurrentStave();
      const charPos = this.getCursorPosition();

      console.log('🔄 Calling WASM splitLineAtPosition:', {stave: currentStave, charPos});
      logger.info(LOG_CATEGORIES.EDITOR, 'Splitting line', {
        stave: currentStave,
        charPos
      });

      // Call WASM function to split line
      const updatedDoc = this.wasmModule.splitLineAtPosition(
        this.theDocument,
        currentStave,
        charPos
      );
      console.log('🔄 WASM returned:', updatedDoc);

      // Preserve state from the old document before updating
      const preservedState = this.theDocument.state;

      // Update document with new line structure
      this.theDocument = updatedDoc;

      // Restore the state object (WASM doesn't know about JavaScript-only state)
      this.theDocument.state = preservedState;

      // Move cursor to beginning of new line
      this.theDocument.state.cursor.stave = currentStave + 1;
      this.theDocument.state.cursor.column = 0;

      logger.debug(LOG_CATEGORIES.CURSOR, 'Cursor moved to new line', {
        newStave: currentStave + 1,
        newColumn: 0
      });

      // Re-derive beats for both old and new lines
      if (this.theDocument.lines[currentStave]) {
        this.deriveBeats(this.theDocument.lines[currentStave]);
      }
      if (this.theDocument.lines[currentStave + 1]) {
        this.deriveBeats(this.theDocument.lines[currentStave + 1]);
      }

      await this.renderAndUpdate();
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

        // Re-derive beats using WASM BeatDeriver
        this.deriveBeats(line);

        this.addToConsoleLog(`Recalculated beats after edit`);
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
        if (!line) return;
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
    // If there's a user selection, use it
    if (this.hasSelection()) {
      return this.getSelection();
    }

    // No selection: try to get element to the left of cursor (or at cursor if at position 0 with cells)
    const line = this.getCurrentLine();
    if (!line || !line.cells || line.cells.length === 0) {
      return null;
    }

    const cursorPos = this.getCursorPosition();
    const { cellIndex, charOffsetInCell } = this.charPosToCellIndex(cursorPos);

    // Determine which cell to target
    let targetCellIndex;
    if (charOffsetInCell > 0) {
      // Cursor is in the middle or end of a cell, so target is this cell
      targetCellIndex = cellIndex;
    } else if (cellIndex > 0) {
      // Cursor is at start of cell (not first cell), so target is previous cell
      targetCellIndex = cellIndex - 1;
    } else {
      // Cursor is at start of line (no cell to left), no element available
      return null;
    }

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

    // Check if selection is empty
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
    const selectedCells = cells.filter((cell, index) =>
      index >= selection.start && index <= selection.end
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
    console.log('🎵 applySlur called');

    if (!this.isInitialized || !this.wasmModule) {
      console.log('❌ Not initialized or no WASM module');
      return;
    }

    console.log('📊 Selection state:', {
      hasSelection: this.hasSelection(),
      selection: this.getSelection(),
      selectedText: this.getSelectedText()
    });

    // Validate selection (requires explicit selection, not element to left of cursor)
    if (!this.hasSelection()) {
      console.log('Slur requires an explicit selection');
      return;
    }

    try {
      const selection = this.getSelection();
      const line = this.getCurrentLine();

      if (!line) {
        console.log('❌ No line found for applySlur');
        return;
      }

      const cells = line.cells;
      const selectedCells = cells.filter((cell, index) =>
        index >= selection.start && index <= selection.end
      );
      const selectedText = selectedCells.map(cell => cell.char || '').join('');

      // Apply slur using unified WASM command
      // Note: WASM expects 'end' to be exclusive (one past the last cell)
      if (this.theDocument && this.theDocument.lines && this.theDocument.lines.length > 0) {
        const updatedCells = this.wasmModule.applyCommand(
          cells,
          selection.start,
          selection.end + 1,  // Convert inclusive end to exclusive
          'slur'
        );

        line.cells = updatedCells;
        this.addToConsoleLog(`Toggled slur on "${selectedText}"`);
      }

      await this.renderAndUpdate();

      // Restore visual selection after applying slur (slurs now render via CSS)
      this.updateSelectionDisplay();
    } catch (error) {
      console.error('❌ Failed to apply slur:', error);
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
        if (!line) return;
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
      const selectedCells = cells.filter((cell, index) =>
        index >= selection.start && index <= selection.end
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
   * Legacy method - kept for compatibility, redirects to applyOrnament
   * @deprecated Use applyOrnament() instead
   */
  async applyOrnamentIndicator() {
    return this.applyOrnament('after');
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
      const selectedCells = cells.filter((cell, index) =>
        index >= selection.start && index <= selection.end
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
          selection.end + 1,  // Convert inclusive end to exclusive for WASM
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

  /**
     * Render the current document
     */
  async render() {
    if (!this.renderer) {
      return;
    }

    try {
      console.log('📝 render() called');
      const state = await this.saveDocument();
      const doc = JSON.parse(state);
      console.log('📝 calling renderer.renderDocument()');
      this.renderer.renderDocument(doc);
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
   */
  async renderAndUpdate() {
    await this.render();
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

    // Click events - just focus the editor
    this.element.addEventListener('click', (event) => {
      this.element.focus();
    });
  }

  /**
     * Handle mouse down - start selection or positioning
     */
  handleMouseDown(event) {
    this.element.focus();

    // Calculate cell position from click
    const rect = this.element.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    // Determine which line was clicked based on Y coordinate
    const lineIndex = this.calculateLineFromY(y);
    if (lineIndex !== null && this.theDocument && this.theDocument.state) {
      // Switch to the clicked line
      this.theDocument.state.cursor.stave = lineIndex;
    }

    const cellPosition = this.calculateCellPosition(x, y);

    if (cellPosition !== null) {
      // Start drag selection
      this.isDragging = true;
      this.dragStartPos = cellPosition;
      this.dragEndPos = cellPosition;

      // Initialize selection at click point
      this.initializeSelection(cellPosition, cellPosition);
      this.setCursorPosition(cellPosition);
      this.updateCursorVisualPosition();
    }

    event.preventDefault();
  }

  /**
     * Handle mouse move - update selection if dragging
     */
  handleMouseMove(event) {
    if (!this.isDragging) return;

    const rect = this.element.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const cellPosition = this.calculateCellPosition(x, y);

    if (cellPosition !== null) {
      this.dragEndPos = cellPosition;

      // Update selection range
      this.initializeSelection(this.dragStartPos, cellPosition);
      this.setCursorPosition(cellPosition);
      this.updateSelectionDisplay();

      // Prevent default to avoid text selection behavior
      event.preventDefault();
    }
  }

  /**
     * Handle mouse up - finish selection
     */
  handleMouseUp(event) {
    if (this.isDragging) {
      // Finalize selection before clearing isDragging flag
      if (this.dragStartPos !== this.dragEndPos) {
        this.initializeSelection(this.dragStartPos, this.dragEndPos);
        this.updateSelectionDisplay();
      }

      // Delay clearing the dragging flag to prevent click event from clearing selection
      setTimeout(() => {
        this.isDragging = false;
        this.dragStartPos = null;
        this.dragEndPos = null;
      }, 10);
    }
  }

  /**
     * Handle double click - select beat or character group
     */
  handleDoubleClick(event) {
    const rect = this.element.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const cellPosition = this.calculateCellPosition(x, y);

    if (cellPosition !== null) {
      this.selectBeatOrCharGroup(cellPosition);
    }

    event.preventDefault();
  }

  /**
     * Select beat or character group at cell index
     * If cell is part of a beat, select entire beat
     * Otherwise, select cell and its continuations
     */
  selectBeatOrCharGroup(cellIndex) {
    if (!this.theDocument || !this.theDocument.lines || this.theDocument.lines.length === 0) {
      return;
    }

    const line = this.getCurrentLine();
        if (!line) return;
    const cells = line.cells || [];

    if (cellIndex < 0 || cellIndex >= cells.length) {
      return;
    }

    // Get DOM elements for the line to check CSS classes
    const lineElements = this.element.querySelectorAll('.notation-line');
    if (lineElements.length === 0) {
      return;
    }

    const lineElement = lineElements[0]; // First line (main line)
    const cellElements = lineElement.querySelectorAll('.char-cell');

    if (cellIndex >= cellElements.length) {
      return;
    }

    const clickedElement = cellElements[cellIndex];

    // Check if cell has beat classes
    const hasBeatClass = clickedElement.classList.contains('beat-loop-first') ||
                        clickedElement.classList.contains('beat-loop-middle') ||
                        clickedElement.classList.contains('beat-loop-last');

    if (hasBeatClass) {
      // Select entire beat by scanning for beat-loop-first and beat-loop-last
      let startIndex = cellIndex;
      let endIndex = cellIndex;

      // Scan backward to beat-loop-first
      for (let i = cellIndex; i >= 0; i--) {
        const el = cellElements[i];
        if (el.classList.contains('beat-loop-first')) {
          startIndex = i;
          break;
        }
        if (!el.classList.contains('beat-loop-first') &&
            !el.classList.contains('beat-loop-middle') &&
            !el.classList.contains('beat-loop-last')) {
          break;
        }
      }

      // Scan forward to beat-loop-last
      for (let i = cellIndex; i < cellElements.length; i++) {
        const el = cellElements[i];
        if (el.classList.contains('beat-loop-last')) {
          endIndex = i;
          break;
        }
        if (!el.classList.contains('beat-loop-first') &&
            !el.classList.contains('beat-loop-middle') &&
            !el.classList.contains('beat-loop-last')) {
          break;
        }
      }

      // selection.end is exclusive, so add 1
      this.initializeSelection(startIndex, endIndex + 1);
      this.setCursorPosition(endIndex);
      this.updateSelectionDisplay();
    } else {
      // Select character group (cell + continuations)
      let startIndex = cellIndex;
      let endIndex = cellIndex;

      // Scan backward to find first cell with continuation=false
      for (let i = cellIndex; i >= 0; i--) {
        const continuation = cells[i].continuation;
        if (!continuation) {
          startIndex = i;
          break;
        }
      }

      // Scan forward while continuation=true
      for (let i = startIndex + 1; i < cells.length; i++) {
        if (cells[i].continuation) {
          endIndex = i;
        } else {
          break;
        }
      }

      // selection.end is exclusive, so add 1
      this.initializeSelection(startIndex, endIndex + 1);
      this.setCursorPosition(endIndex);
      this.updateSelectionDisplay();
    }
  }

  /**
     * Handle canvas click for caret positioning
     */
  handleCanvasClick(event) {
    const rect = this.element.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    // Determine which line was clicked based on Y coordinate
    const lineIndex = this.calculateLineFromY(y);
    if (lineIndex !== null && this.theDocument && this.theDocument.state) {
      // Switch to the clicked line
      this.theDocument.state.cursor.stave = lineIndex;
    }

    // Calculate Cell position from click coordinates
    const charCellPosition = this.calculateCellPosition(x, y);

    if (charCellPosition !== null) {
      this.setCursorPosition(charCellPosition);
      this.element.focus();
    }
  }

  /**
     * Calculate which line was clicked based on Y coordinate
     * SIMPLIFIED: Use .notation-line containers directly for Y ranges
     */
  calculateLineFromY(y) {
    // Get all line containers
    const lineContainers = this.element.querySelectorAll('.notation-line');
    const editorRect = this.element.getBoundingClientRect();

    console.log(`📍 calculateLineFromY: clicked at Y=${y} (editor-relative)`);

    // Check each line container to see which one contains the click
    for (let lineIdx = 0; lineIdx < lineContainers.length; lineIdx++) {
      const lineContainer = lineContainers[lineIdx];
      const lineRect = lineContainer.getBoundingClientRect();

      // Convert line container Y to editor-relative coordinates
      const lineTop = lineRect.top - editorRect.top;
      const lineBottom = lineRect.bottom - editorRect.top;

      console.log(`  Line ${lineIdx}: Y=${lineTop} to ${lineBottom}`);

      // Check if click Y falls within this line
      if (y >= lineTop && y <= lineBottom) {
        console.log(`  ✓ Click is in line ${lineIdx}`);
        return lineIdx;
      }
    }

    console.log(`  ✗ Click not in any line, defaulting to 0`);
    return 0; // Default to first line if no match
  }

  /**
   * Calculate Cell position from coordinates using DisplayList data
   */
  calculateCellPosition(x, y) {
    // Get the correct line based on Y coordinate
    const lineIndex = this.calculateLineFromY(y);

    // Get all line containers and find the one that was clicked
    const lineContainers = this.element.querySelectorAll('.notation-line');
    if (lineIndex >= lineContainers.length) {
      return 0;
    }

    const lineContainer = lineContainers[lineIndex];
    const allCellElements = lineContainer.querySelectorAll('.char-cell');

    if (allCellElements.length === 0) {
      return 0;
    }

    // In normal mode, filter out ornament cells to make them non-interactive
    const editMode = this.wasmModule.getOrnamentEditMode(this.theDocument);
    const line = this.getCurrentLine();
    const navigableCellElements = Array.from(allCellElements).filter(cellElement => {
      if (editMode || !line) return true; // In edit mode, all cells are navigable
      const cellIndex = parseInt(cellElement.getAttribute('data-cell-index'), 10);
      const cell = line.cells[cellIndex];
      // Skip ornament cells in normal mode
      if (cell && cell.ornament_indicator && cell.ornament_indicator.name !== 'none') {
        return false;
      }
      return true;
    });

    if (navigableCellElements.length === 0) {
      return 0;
    }

    // Measure actual rendered cell positions from DOM
    const editorRect = this.element.getBoundingClientRect();
    const cursorPositions = [];

    // Position 0: left edge of first navigable cell
    const firstCell = navigableCellElements[0];
    const firstRect = firstCell.getBoundingClientRect();
    cursorPositions.push(firstRect.left - editorRect.left);

    // Positions 1..N: right edge of each navigable cell
    for (const cell of navigableCellElements) {
      const cellRect = cell.getBoundingClientRect();
      cursorPositions.push(cellRect.right - editorRect.left);
    }

    // Find which cell the X coordinate is in by checking which pair of boundaries it falls between
    let cellIndex = 0;

    // Check each navigable cell to see if x falls within it
    for (let i = 0; i < navigableCellElements.length; i++) {
      const leftBoundary = cursorPositions[i];
      const rightBoundary = cursorPositions[i + 1];

      // Click is within this cell
      if (x >= leftBoundary && x < rightBoundary) {
        // Return the actual cellIndex from the data attribute, not the filtered index
        cellIndex = parseInt(navigableCellElements[i].getAttribute('data-cell-index'), 10);
        break;
      }
    }

    // If x is at or beyond the right edge of the last cell, select the last navigable cell
    if (x >= cursorPositions[navigableCellElements.length]) {
      cellIndex = parseInt(navigableCellElements[Math.max(0, navigableCellElements.length - 1)].getAttribute('data-cell-index'), 10);
    }

    return cellIndex;
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

            .cursor-indicator.selecting {
                background-color: #ff6b35;
                box-shadow: 0 0 3px rgba(255, 107, 53, 0.5);
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

    console.log(`📍 updateCursorVisualPosition: currentStave=${currentStave}, charPos=${charPos}`);

    // SIMPLIFIED: Cursor is now a child of the current .notation-line
    // So it's positioned absolutely relative to its line container
    // We just need the Y from the first cell of the current line

    let yOffset = 32; // Default fallback

    // Find first cell to get its Y position (relative to the line)
    const cells = this.element.querySelectorAll(`[data-line-index="${currentStave}"]`);
    console.log(`📍 Found ${cells.length} cells for line ${currentStave}`);

    if (cells.length > 0) {
      const firstCell = cells[0];
      const cellTop = parseInt(firstCell.style.top) || 32;
      console.log(`📍 First cell top: ${firstCell.style.top}, parsed as: ${cellTop}px`);
      yOffset = cellTop; // This is already relative to the line, no offset needed
    } else {
      console.log(`📍 No cells found for line ${currentStave}, using default yOffset=${yOffset}px`);
    }

    // Calculate pixel position using character-level positioning
    const pixelPos = this.charPosToPixel(charPos);

    console.log(`📍 Setting cursor: left=${pixelPos}px, top=${yOffset}px`);

    // Set cursor position (position: absolute relative to .notation-line)
    cursor.style.position = 'absolute';
    cursor.style.left = `${pixelPos}px`;
    cursor.style.top = `${yOffset}px`;
    cursor.style.height = `${lineHeight}px`;

    // Update cursor appearance based on state
    if (this.hasSelection()) {
      cursor.classList.add('selecting');
    } else {
      cursor.classList.remove('selecting');
    }

    if (this.eventManager && this.eventManager.editorFocus()) {
      cursor.classList.add('focused');
    } else {
      cursor.classList.remove('focused');
    }

    // Ensure cursor is visible when focused
    if (this.eventManager && this.eventManager.editorFocus()) {
      cursor.style.opacity = '1';
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
        ? this.theDocument.state.cursor.stave
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
        const cellCount = selection.end - selection.start + 1; // +1 for inclusive range
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
  /**
   * Update MusicXML source display
   */
  async updateMusicXMLDisplay() {
    const musicxmlSource = document.getElementById('musicxml-source');
    if (!musicxmlSource || !this.theDocument) {
      return;
    }

    try {
      // Export to MusicXML
      const musicxml = await this.exportMusicXML();

      if (!musicxml) {
        musicxmlSource.textContent = '<!-- Error: MusicXML export failed -->';
        return;
      }

      // Display the MusicXML source
      musicxmlSource.textContent = musicxml;
    } catch (error) {
      console.error('[MusicXML] Error:', error);
      musicxmlSource.textContent = `<!-- Error exporting to MusicXML:\n${error.message}\n${error.stack} -->`;
    }
  }

  /**
   * Update LilyPond source display
   */
  async updateLilyPondDisplay() {
    const lilypondSource = document.getElementById('lilypond-source');
    if (!lilypondSource || !this.theDocument) {
      return;
    }

    try {
      // Export to MusicXML first
      const musicxml = await this.exportMusicXML();

      // Convert to LilyPond
      const resultJson = this.wasmModule.convertMusicXMLToLilyPond(musicxml, null);
      const result = JSON.parse(resultJson);

      // Display the LilyPond source
      lilypondSource.textContent = result.lilypond_source;

      // If there are skipped elements, add a note
      if (result.skipped_elements && result.skipped_elements.length > 0) {
        lilypondSource.textContent += '\n\n% Skipped elements:\n';
        result.skipped_elements.forEach(elem => {
          lilypondSource.textContent += `% - ${elem.element_type}: ${elem.reason}\n`;
        });
      }
    } catch (error) {
      console.error('[LilyPond] Error:', error);
      lilypondSource.textContent = `% Error converting to LilyPond:\n% ${error.message}\n% ${error.stack}`;
    }
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
    // Update display list tab (pre-computed render commands from WASM)
    const displayListDisplay = document.getElementById('displaylist-display');
    if (displayListDisplay && this.displayList) {
      displayListDisplay.textContent = JSON.stringify(this.displayList, null, 2);
    }

    // Update persistent model (saveable content only, no state)
    const persistentJson = document.getElementById('persistent-json');
    if (persistentJson && this.theDocument) {
      // Rust handles field exclusion via #[serde(skip)] on ephemeral fields (state, x, y, w, h, etc.)
      // Just exclude the runtime state field - WASM serialization handles the rest
      const { state, ...persistentDoc } = this.theDocument;

      // DEBUG: Log what fields are actually present
      console.log('Document keys:', Object.keys(persistentDoc));
      if (persistentDoc.lines && persistentDoc.lines[0]) {
        console.log('Line[0] keys:', Object.keys(persistentDoc.lines[0]));
      }

      const displayDoc = this.createDisplayDocument(persistentDoc);
      persistentJson.textContent = this.toYAML(displayDoc);
    }

    // Update MusicXML source (async, non-blocking)
    this.updateMusicXMLDisplay().catch(err => {
      console.error('Failed to update MusicXML display:', err);
    });

    // Update LilyPond source (async, non-blocking)
    this.updateLilyPondDisplay().catch(err => {
      console.error('Failed to update LilyPond display:', err);
    });

    // Update HTML display
    this.updateHTMLDisplay();

    // Update hitboxes display
    this.updateHitboxesDisplay();
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

  /**
   * Export document to MusicXML format
   * @returns {string|null} MusicXML string or null on error
   */
  async exportMusicXML() {
    if (!this.wasmModule || !this.theDocument) {
      console.error('Cannot export MusicXML: WASM module or document not initialized');
      return null;
    }

    try {
      const startTime = performance.now();
      const musicxml = this.wasmModule.exportMusicXML(this.theDocument);
      const exportTime = performance.now() - startTime;

      return musicxml;
    } catch (error) {
      console.error('MusicXML export failed:', error);
      logger.error(LOG_CATEGORIES.EDITOR, 'MusicXML export error', { error: error.message });
      return null;
    }
  }

  /**
   * Render staff notation using OSMD
   */
  async renderStaffNotation() {
    if (!this.osmdRenderer) {
      console.warn('OSMD renderer not initialized');
      return;
    }

    const musicxml = await this.exportMusicXML();
    if (!musicxml) {
      console.warn('Cannot render staff notation: MusicXML export failed');
      return;
    }

    try {
      const startTime = performance.now();
      await this.osmdRenderer.render(musicxml);
      const renderTime = performance.now() - startTime;

      console.log(`Staff notation rendered in ${renderTime.toFixed(2)}ms`);
    } catch (error) {
      console.error('Staff notation rendering failed:', error);
      logger.error(LOG_CATEGORIES.EDITOR, 'Staff notation render error', { error: error.message });
    }
  }
}

export default MusicNotationEditor;
