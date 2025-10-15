/**
 * Music Notation Editor - Core Editor Functionality
 *
 * This class provides the core editor functionality with WASM integration,
 * document management, and basic event handling for the Music Notation Editor POC.
 */

import DOMRenderer from './renderer.js';
import logger, { LOG_CATEGORIES } from './logger.js';
import { OSMDRenderer } from './osmd-renderer.js';
import { LEFT_MARGIN_PX } from './constants.js';

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
        layoutRenderer: new wasmModule.LayoutRenderer(16),
        // New recursive descent API
        insertCharacter: wasmModule.insertCharacter,
        parseText: wasmModule.parseText,
        deleteCharacter: wasmModule.deleteCharacter,
        applyOctave: wasmModule.applyOctave,
        // Slur API
        applySlur: wasmModule.applySlur,
        removeSlur: wasmModule.removeSlur,
        hasSlurInSelection: wasmModule.hasSlurInSelection,
        // Document API
        createNewDocument: wasmModule.createNewDocument,
        setTitle: wasmModule.setTitle,
        setComposer: wasmModule.setComposer,
        setLineLabel: wasmModule.setLineLabel,
        setLineLyrics: wasmModule.setLineLyrics,
        setLineTala: wasmModule.setLineTala,
        // Layout API
        computeLayout: wasmModule.computeLayout,
        // MusicXML export API
        exportMusicXML: wasmModule.exportMusicXML,
        convertMusicXMLToLilyPond: wasmModule.convertMusicXMLToLilyPond
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

      // Mark as initialized BEFORE creating document
      this.isInitialized = true;

      // Create initial empty document
      await this.createNewDocument();

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

    // Set timestamps (WASM can't access system time)
    const now = new Date().toISOString();
    document.created_at = now;
    document.modified_at = now;

    // Add runtime state (not persisted by WASM)
    document.state = {
      cursor: { stave: 0, column: 0 },
      selection: null,
      has_focus: false
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

        await this.render();
        this.updateDocumentDisplay();

        // Update UI displays
        if (this.ui && this.theDocument) {
          if (this.theDocument.title) {
            this.ui.updateDocumentTitle(this.theDocument.title);
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
        const line = this.theDocument.lines[0];
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

      await this.render();
      this.updateDocumentDisplay();

      // Ensure hitbox values are properly set on the document cells
      // The WASM insertCharacter may return cells without hitbox fields
      this.ensureHitboxesAreSet();

      // Force hitboxes display update after render
      console.log('🎯 Forcing hitboxes display update from insertText');
      setTimeout(() => {
        console.log('🎯 Delayed hitboxes display update');
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
        const line =this.theDocument.lines[0];
        line.cells = cells; // Replace main line with parsed cells
      }

      // Extract beats for visualization
      await this.extractAndRenderBeats(text);

      // Render updated document
      await this.render();
      this.updateDocumentDisplay();

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
        const line = this.theDocument.lines[0];
        const cells = line.cells;

        // Delete cells in range
        cells.splice(start, end - start);
      }

      this.setCursorPosition(start);
      await this.render();
      this.updateDocumentDisplay();

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
     * Convert pitch between systems with enhanced functionality
     */
  async convertPitchSystem(pitch, fromSystem, toSystem) {
    if (!this.isInitialized || !this.wasmModule) {
      return pitch;
    }

    try {
      // Stub implementation for POC - pitch conversion not yet implemented
      this.addToConsoleLog(`Pitch system conversion not yet implemented (${this.getPitchSystemName(fromSystem)} to ${this.getPitchSystemName(toSystem)})`);
      return pitch;
    } catch (error) {
      console.error('Failed to convert pitch system:', error);
      return pitch;
    }
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
     * Set document pitch system
     */
  async setPitchSystem(system) {
    try {
      const state = await this.saveDocument();
      const doc = JSON.parse(state);

      if (doc.metadata) {
        doc.pitch_system = system;
        await this.loadDocument(JSON.stringify(doc));
        this.addToConsoleLog(`Document pitch system set to: ${this.getPitchSystemName(system)}`);
      }
    } catch (error) {
      console.error('Failed to set pitch system:', error);
      this.showError('Failed to set pitch system');
    }
  }

  /**
     * Get current pitch system
     */
  getCurrentPitchSystem() {
    if (this.theDocument) {
      return this.theDocument.pitch_system || 1; // Default to Number system
    }
    return 1;
  }

  /**
     * Validate pitch notation for current system
     */
  validatePitchNotation(notation) {
    const system = this.getCurrentPitchSystem();

    switch (system) {
      case 1: // Number system
        return /^[1234567#b]*$/.test(notation);
      case 2: // Western system
        return /^[cdefgabCDEFGAB#b]*$/.test(notation);
      default:
        return false;
    }
  }

  /**
     * Detect pitch system from notation
     */
  detectPitchSystem(notation) {
    if (/^[1234567#b]+$/.test(notation)) {
      return 1; // Number system
    } else if (/^[cdefgabCDEFGAB#b]+$/.test(notation)) {
      return 2; // Western system
    }
    return 0; // Unknown
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
        console.log('🔧 Fixed Alt key detection:', { originalKey: event.key, code, fixedKey: key });
      }
    }

    console.log('🔑 handleKeyboardEvent:', { key, code: event.code, modifiers });

    // Ignore Ctrl key combinations (let browser handle them)
    if (modifiers.ctrl) {
      return;
    }

    // Route to appropriate handler
    if (modifiers.alt && !modifiers.ctrl && !modifiers.shift) {
      console.log('→ Routing to Alt handler');
      this.handleAltCommand(key);
    } else if (modifiers.shift && !modifiers.alt && !modifiers.ctrl && this.isSelectionKey(key)) {
      // Only route to selection handler for actual selection keys (arrows, Home, End)
      console.log('→ Routing to Shift selection handler');
      this.handleShiftCommand(key);
    } else {
      console.log('→ Routing to normal key handler');
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
      default:
        console.log('Unknown Alt command:', key);
        this.showWarning(`Unknown musical command: Alt+${key}`, {
          important: false,
          details: `Available commands: Alt+S (slur), Alt+U (upper octave), Alt+M (middle octave), Alt+L (lower octave), Alt+T (tala)`
        });
        return;
    }
  }

  /**
     * Handle Shift+key commands (selection)
     */
  handleShiftCommand(key) {
    console.log('🔵 handleShiftCommand called:', key);
    let handled = false;

    switch (key) {
      case 'ArrowLeft':
        console.log('  → Calling extendSelectionLeft');
        this.extendSelectionLeft();
        handled = true;
        break;
      case 'ArrowRight':
        console.log('  → Calling extendSelectionRight');
        this.extendSelectionRight();
        handled = true;
        break;
      case 'ArrowUp':
        console.log('  → Calling extendSelectionUp');
        this.extendSelectionUp();
        handled = true;
        break;
      case 'ArrowDown':
        console.log('  → Calling extendSelectionDown');
        this.extendSelectionDown();
        handled = true;
        break;
      case 'Home':
        console.log('  → Calling extendSelectionToStart');
        this.extendSelectionToStart();
        handled = true;
        break;
      case 'End':
        console.log('  → Calling extendSelectionToEnd');
        this.extendSelectionToEnd();
        handled = true;
        break;
      default:
        console.log('  → Unknown key, ignoring');
        // Ignore non-selection Shift commands (like Shift+#, Shift alone, etc.)
        return;
    }

    if (handled) {
      // Update display
      console.log('  → Updating selection display');
      this.updateSelectionDisplay();
      console.log('  → Selection state:', this.getSelection());
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
     * Navigate left one character
     */
  navigateLeft() {
    logger.debug(LOG_CATEGORIES.CURSOR, 'Navigate left');
    const currentCharPos = this.getCursorPosition();

    if (currentCharPos > 0) {
      // Move to previous character
      this.setCursorPosition(currentCharPos - 1);
      logger.debug(LOG_CATEGORIES.CURSOR, 'Moved to char position', { pos: currentCharPos - 1 });
    }
  }

  /**
     * Navigate right one character
     */
  navigateRight() {
    logger.debug(LOG_CATEGORIES.CURSOR, 'Navigate right');
    const currentCharPos = this.getCursorPosition();
    const maxCharPos = this.getMaxCharPosition();

    if (currentCharPos < maxCharPos) {
      // Move to next character
      this.setCursorPosition(currentCharPos + 1);
      logger.debug(LOG_CATEGORIES.CURSOR, 'Moved to char position', { pos: currentCharPos + 1 });
    }
  }

  /**
     * Navigate up (cursor stays on main line)
     */
  navigateUp() {
    // Cursor is always on main line - no lane switching
    console.log('navigateUp: cursor always stays on main line');
  }

  /**
     * Navigate down (cursor stays on main line)
     */
  navigateDown() {
    // Cursor is always on main line - no lane switching
    console.log('navigateDown: cursor always stays on main line');
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

    const line = this.theDocument.lines[0];
    const cells = line.cells || [];

    return cells.length; // Position after last cell
  }

  /**
     * Get the maximum character position in the line
     */
  getMaxCharPosition() {
    if (!this.theDocument || !this.theDocument.lines || this.theDocument.lines.length === 0) {
      return 0;
    }

    const line = this.theDocument.lines[0];
    const cells = line.cells || [];

    // Sum up lengths of all cell glyphs
    let totalChars = 0;
    for (const cell of cells) {
      totalChars += cell.glyph.length;
    }

    return totalChars;
  }

  /**
     * Convert character position to cell index
     * @param {number} charPos - Character position (0-based)
     * @returns {Object} {cellIndex, charOffsetInCell}
     */
  charPosToCellIndex(charPos) {
    if (!this.theDocument || !this.theDocument.lines || this.theDocument.lines.length === 0) {
      return { cellIndex: 0, charOffsetInCell: 0 };
    }

    const line = this.theDocument.lines[0];
    const cells = line.cells || [];

    let accumulatedChars = 0;
    for (let cellIndex = 0; cellIndex < cells.length; cellIndex++) {
      const cellLength = cells[cellIndex].glyph.length;

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
    if (!this.theDocument || !this.theDocument.lines || this.theDocument.lines.length === 0) {
      return 0;
    }

    const line = this.theDocument.lines[0];
    const cells = line.cells || [];

    let charPos = 0;
    for (let i = 0; i < cellIndex && i < cells.length; i++) {
      charPos += cells[i].glyph.length;
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
    const firstLine = displayList.lines && displayList.lines[0];

    if (!firstLine || !firstLine.cells || firstLine.cells.length === 0) {
      return LEFT_MARGIN_PX;
    }

    // Convert char position to cell + offset
    const { cellIndex, charOffsetInCell } = this.charPosToCellIndex(charPos);

    // If before first cell
    if (cellIndex === 0 && charOffsetInCell === 0) {
      return firstLine.cells[0].cursor_left;
    }

    // If after all cells
    if (cellIndex >= firstLine.cells.length) {
      const lastCell = firstLine.cells[firstLine.cells.length - 1];
      return lastCell.cursor_right;
    }

    // Get cell from DisplayList
    const cell = firstLine.cells[cellIndex];

    // If at start of cell
    if (charOffsetInCell === 0) {
      return cell.cursor_left;
    }

    // Use pre-calculated character positions from Rust DisplayList
    if (cell.char_positions && charOffsetInCell < cell.char_positions.length) {
      return cell.char_positions[charOffsetInCell];
    }

    // Fallback: proportional split (if char_positions not available)
    const cellLength = cell.glyph.length;
    const cellWidth = cell.cursor_right - cell.cursor_left;
    const charWidth = cellWidth / cellLength;
    return cell.x + (charWidth * charOffsetInCell);
  }


  // ==================== SELECTION MANAGEMENT ====================

  /**
     * Initialize selection range (always on main line, lane 1)
     */
  initializeSelection(startPos, endPos) {
    if (!this.theDocument || !this.theDocument.state) {
      return;
    }

    this.theDocument.state.selection = {
      start: Math.min(startPos, endPos),
      end: Math.max(startPos, endPos),
      active: true
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

    const line = this.theDocument.lines[0];
    const cells = line.cells || [];

    if (cells.length === 0) {
      return '';
    }

    // Extract text from selection range (no lanes - just cell indices)
    const selectedCells = cells.filter((cell, index) =>
      index >= selection.start && index < selection.end
    );

    return selectedCells.map(cell => cell.glyph || '').join('');
  }

  /**
     * Extend selection to the left (cell-based)
     */
  extendSelectionLeft() {
    const currentCellIndex = this.getCursorPosition();
    let selection = this.getSelection();

    if (!selection) {
      // Start new selection
      this.initializeSelection(currentCellIndex, currentCellIndex);
      selection = this.getSelection();
    }

    if (currentCellIndex > 0) {
      const newIndex = currentCellIndex - 1;
      // Extend selection to include previous cell
      if (currentCellIndex === selection.end) {
        // Extending left from end
        this.initializeSelection(newIndex, selection.end);
      } else {
        // Extending left from start
        this.initializeSelection(newIndex, selection.end);
      }
      this.setCursorPosition(newIndex);
    }
  }

  /**
     * Extend selection to the right (cell-based)
     */
  extendSelectionRight() {
    console.log('🟢 extendSelectionRight called');
    const currentCellIndex = this.getCursorPosition();
    const maxCellIndex = this.getMaxCellIndex();
    let selection = this.getSelection();

    console.log('  Current position:', currentCellIndex);
    console.log('  Max position:', maxCellIndex);
    console.log('  Current selection:', selection);

    if (!selection) {
      // Start new selection
      console.log('  → No selection, creating new one');
      this.initializeSelection(currentCellIndex, currentCellIndex);
      selection = this.getSelection();
      console.log('  → New selection:', selection);
    }

    if (currentCellIndex < maxCellIndex) {
      const newIndex = currentCellIndex + 1;
      console.log('  → Extending to index:', newIndex);
      // Extend selection to include next cell
      if (currentCellIndex === selection.start) {
        // Extending right from start
        console.log('  → Extending from start');
        this.initializeSelection(selection.start, newIndex);
      } else {
        // Extending right from end
        console.log('  → Extending from end');
        this.initializeSelection(selection.start, newIndex);
      }
      this.setCursorPosition(newIndex);
      console.log('  → Final selection:', this.getSelection());
    } else {
      console.log('  → At max position, cannot extend');
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
     * Extend selection to start of line
     */
  extendSelectionToStart() {
    const selection = this.getSelection();

    if (!selection) {
      // Start new selection from current position to start
      this.initializeSelection(0, this.getCursorPosition());
    } else {
      // Extend existing selection to start
      this.initializeSelection(0, selection.end);
    }

    this.setCursorPosition(0);
  }

  /**
     * Extend selection to end of line
     */
  extendSelectionToEnd() {
    const maxPos = this.getMaxCellIndex();
    const selection = this.getSelection();

    if (!selection) {
      // Start new selection from current position to end
      this.initializeSelection(this.getCursorPosition(), maxPos);
    } else {
      // Extend existing selection to end
      this.initializeSelection(selection.start, maxPos);
    }

    this.setCursorPosition(maxPos);
  }

  /**
     * Update visual selection display
     */
  updateSelectionDisplay() {
    // Clear previous selection
    this.clearSelectionVisual();

    const selection = this.getSelection();
    if (!selection) {
      return;
    }

    // Add visual selection for selected range
    this.renderSelectionVisual(selection);

    // Update ephemeral model display to show current selection state
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
    const lineElement = this.renderer.element.querySelector(`[data-line="0"]`);
    if (!lineElement) {
      console.warn('❌ Line element not found, cannot render selection');
      return;
    }

    // Add 'selected' class to all cells in the selection range
    for (let i = selection.start; i < selection.end; i++) {
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

    // Remove 'selected' class from all cells
    const selectedCells = this.renderer.element.querySelectorAll('.char-cell.selected');
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
        const line = this.theDocument.lines[0];
        const cells = line.cells;

        // Determine which cell to delete: if at cell boundary, delete previous cell
        const cellIndexToDelete = charOffsetInCell === 0 ? cellIndex - 1 : cellIndex;

        if (cellIndexToDelete >= 0 && cellIndexToDelete < cells.length) {
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

      await this.render();
      this.updateDocumentDisplay();

      // Show cursor (showCursor will call updateCursorVisualPosition internally)
      this.showCursor();

      // Restore visual selection after backspace
      this.updateSelectionDisplay();
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
          const line = this.theDocument.lines[0];
          const cells = line.cells;

          if (cellIndex >= 0 && cellIndex < cells.length) {
            const updatedCells = this.wasmModule.deleteCharacter(cells, cellIndex);
            line.cells = updatedCells;
          }
        }

        // Recalculate beats after deletion
        await this.recalculateBeats();

        await this.render();
        this.updateDocumentDisplay();

        // Restore visual selection after delete
        this.updateSelectionDisplay();
      }
    }
  }

  /**
     * Recalculate beats after content changes
     */
  async recalculateBeats() {
    try {
      if (this.theDocument && this.theDocument.lines && this.theDocument.lines.length > 0) {
        const line = this.theDocument.lines[0];

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

    const line = this.theDocument.lines[0];
    const cells = line.cells;

    return cells.map(cell => cell.glyph || '').join('');
  }

  /**
     * Validate that a selection is valid for musical commands
     */
  validateSelectionForCommands() {
    if (!this.hasSelection()) {
      console.log('No selection for command');
      return false;
    }

    const selection = this.getSelection();
    if (!selection) {
      return false;
    }

    // Check if selection is empty
    if (selection.start >= selection.end) {
      console.log('Empty selection for command');
      return false;
    }

    // Get selected text to check if it contains valid musical elements
    const selectedText = this.getSelectedText();
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

    // Validate selection
    if (!this.validateSelectionForCommands()) {
      console.log('❌ Selection validation failed');
      return;
    }

    try {
      const selection = this.getSelection();
      const selectedText = this.getSelectedText();

      console.log('✅ Proceeding with slur application:', { selection, selectedText });

      // Check if there's already a slur on this selection
      const hasExistingSlur = this.hasSlurOnSelection(selection);

      if (hasExistingSlur) {
        this.addToConsoleLog(`Removing slur from selection: "${selectedText}"`);
        await this.removeSlurFromSelection(selection);
      } else {
        this.addToConsoleLog(`Applying slur to selection: "${selectedText}"`);
        // Apply slur using WASM API
        if (this.theDocument && this.theDocument.lines && this.theDocument.lines.length > 0) {
          const line = this.theDocument.lines[0];
          const cells = line.cells;

          console.log('🔧 Calling WASM applySlur:', {
            cellCount: cells.length,
            start: selection.start,
            end: selection.end
          });

          // Call WASM API to apply slur
          const wasmModule = this.wasmModule;
          const updatedCells = wasmModule.applySlur(
            cells,
            selection.start,
            selection.end
          );

          console.log('✅ WASM returned updated cells:', updatedCells.length);

          // Update the line with the updated cells from WASM
          line.cells = updatedCells;

          this.addToConsoleLog(`Applied slur via WASM: cells ${selection.start}..${selection.end}`);
        }
      }

      await this.render();

      // Restore visual selection after applying slur (slurs now render via CSS)
      this.updateSelectionDisplay();

      const action = hasExistingSlur ? 'removed' : 'applied';
      this.addToConsoleLog(`Slur ${action} ${action === 'removed' ? 'from' : 'to'} "${selectedText}"`);
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

    const line = this.theDocument.lines[0];
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

    const line = this.theDocument.lines[0];
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
      const selection = this.getSelection();
      const selectedText = this.getSelectedText();

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

      // For octave=0 (Alt+M), always just set to 0 (clear octave markings)
      // For octave=1 or -1, toggle: if already set, clear (set to 0); otherwise set
      let targetOctave;
      let action;

      if (octave === 0) {
        // Alt+M: always clear octave markings
        console.log('🎯 Alt+M pressed: clearing octave markings');
        targetOctave = 0;
        action = 'cleared';
      } else {
        // Alt+U or Alt+L: toggle behavior
        console.log(`🎯 Alt+${octave === 1 ? 'U' : 'L'} pressed: checking toggle state`);
        const shouldToggleOff = this.shouldToggleOctaveOff(selection, octave);
        console.log(`🎯 shouldToggleOff returned: ${shouldToggleOff}`);
        targetOctave = shouldToggleOff ? 0 : octave;
        action = shouldToggleOff ? 'removed' : 'applied';
        console.log(`🎯 targetOctave=${targetOctave}, action=${action}`);
      }

      const actionVerb = action === 'applied' ? 'Applying' : (action === 'removed' ? 'Removing' : 'Clearing');
      this.addToConsoleLog(`${actionVerb} octave ${octaveNames[octave]} ${action === 'applied' ? 'to' : 'from'} selection: "${selectedText}"`);

      // Call WASM function to apply octave to selected cells
      if (this.theDocument && this.theDocument.lines && this.theDocument.lines.length > 0) {
        const line = this.theDocument.lines[0];
        const cells = line.cells;

        logger.debug(LOG_CATEGORIES.COMMAND, 'Calling WASM applyOctave', {
          cellCount: cells.length,
          range: `${selection.start}..${selection.end}`,
          targetOctave
        });

        const updatedCells = this.wasmModule.applyOctave(
          cells,
          selection.start,
          selection.end,
          targetOctave
        );

        // Debug: Check what octave values were set
        logger.debug(LOG_CATEGORIES.COMMAND, 'Octave values after WASM call:', {
          requestedOctave: octave,
          targetOctave,
          cellsInRange: updatedCells.slice(selection.start, selection.end).map((c, i) => ({
            index: selection.start + i,
            glyph: c.glyph,
            octave: c.octave
          }))
        });

        line.cells = updatedCells;
        logger.info(LOG_CATEGORIES.COMMAND, 'WASM applyOctave successful', {
          cellsModified: updatedCells.length
        });
      }

      await this.render();

      // Restore visual selection after applying octave
      this.updateSelectionDisplay();

      logger.timeEnd('toggleOctave', LOG_CATEGORIES.COMMAND);
      const actionMessage = action === 'removed'
        ? `Octave ${octaveNames[octave]} removed from "${selectedText}"`
        : `Octave ${octaveNames[octave]} applied to "${selectedText}"`;
      this.addToConsoleLog(actionMessage);
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
   * Check if octave should be toggled off
   * Returns true if ANY pitched element in selection has the requested octave
   *
   * @param {Object} selection - Selection range {start, end}
   * @param {number} octave - Target octave value (-1, 0, or 1)
   * @returns {boolean} True if octave should be toggled off
   */
  shouldToggleOctaveOff(selection, octave) {
    if (!this.theDocument || !this.theDocument.lines || this.theDocument.lines.length === 0) {
      console.log('🔍 shouldToggleOctaveOff: no document/lines');
      return false;
    }

    const line = this.theDocument.lines[0];
    const cells = line.cells;

    if (!cells || cells.length === 0) {
      console.log('🔍 shouldToggleOctaveOff: no cells');
      return false;
    }

    // Check if ANY pitched element has the requested octave
    for (let i = selection.start; i < selection.end && i < cells.length; i++) {
      const cell = cells[i];
      console.log(`🔍 Cell ${i}: glyph='${cell.glyph}' kind=${cell.kind} octave=${cell.octave} (checking for octave=${octave})`);
      // Only consider pitched elements (kind === 1)
      if (cell.kind === 1 && cell.octave === octave) {
        console.log(`🔍 Found pitched element with octave=${octave}, will toggle OFF`);
        return true;
      }
    }

    console.log(`🔍 No pitched elements with octave=${octave} found, will toggle ON`);
    return false;
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

        // Call WASM setStaveTala function
        const updatedDocument = await this.wasmModule.setLineTala(this.theDocument, 0, talaString);

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
        console.log('📝 After WASM setStaveTala, line[0].tala =', updatedDocument.lines[0]?.tala);
        this.addToConsoleLog(`Tala set to: ${talaString}`);
        await this.render();
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
      const state = await this.saveDocument();
      const doc = JSON.parse(state);
      this.renderer.renderDocument(doc);

      // Schedule staff notation update (debounced)
      this.scheduleStaffNotationUpdate();
    } catch (error) {
      console.error('Failed to render document:', error);
    }
  }

  /**
     * Setup event handlers
     */
  setupEventHandlers() {
    // NOTE: Keyboard events are handled by EventManager globally
    // to avoid duplicate event handling

    // Focus events
    this.element.addEventListener('focus', () => {
      this.element.classList.add('focused');
      if (this.theDocument && this.theDocument.state) {
        this.theDocument.state.has_focus = true;
      }
      this.showCursor();
    });

    this.element.addEventListener('blur', () => {
      this.element.classList.remove('focused');
      if (this.theDocument && this.theDocument.state) {
        this.theDocument.state.has_focus = false;
      }
      this.hideCursor();
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
    // Just focus the editor for now
    this.element.focus();
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
     * Handle canvas click for caret positioning
     */
  handleCanvasClick(event) {
    const rect = this.element.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    // Calculate Cell position from click coordinates
    // Returns null if clicked on non-main line
    const charCellPosition = this.calculateCellPosition(x, y);

    if (charCellPosition !== null) {
      this.setCursorPosition(charCellPosition);
      this.element.focus();
    }
  }

  /**
     * Calculate Cell position from coordinates using DisplayList data
     */
  calculateCellPosition(x, y) {
    // Use DisplayList for accurate cursor positioning
    if (!this.renderer || !this.renderer.displayList) {
      console.warn('DisplayList not available, using fallback');
      return 0;
    }

    const displayList = this.renderer.displayList;
    const firstLine = displayList.lines && displayList.lines[0];

    if (!firstLine || !firstLine.cells || firstLine.cells.length === 0) {
      return 0;
    }

    // Build array of cursor positions:
    // [0] = cursor_left of first cell
    // [1] = cursor_right of first cell
    // [2] = cursor_right of second cell
    // ...
    const cursorPositions = [];

    // Position 0: before first cell
    cursorPositions.push(firstLine.cells[0].cursor_left);

    // Positions 1..N: after each cell
    for (const cell of firstLine.cells) {
      cursorPositions.push(cell.cursor_right);
    }

    // Find the cursor position closest to the click
    let closestIndex = 0;
    let minDistance = Math.abs(x - cursorPositions[0]);

    for (let i = 1; i < cursorPositions.length; i++) {
      const distance = Math.abs(x - cursorPositions[i]);
      if (distance < minDistance) {
        minDistance = distance;
        closestIndex = i;
      }
    }

    return closestIndex;
  }

  /**
     * Show cursor with enhanced blinking and positioning
     */
  showCursor() {
    const cursor = this.getCursorElement();
    if (cursor) {
      cursor.style.display = 'block';
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
    const lineElement = this.element.querySelector('[data-line="0"]');

    if (!cursor) {
      // Create new cursor element
      cursor = this.createCursorElement();
    }

    // Ensure cursor is in the correct parent (line element, not canvas)
    // This fixes the positioning context mismatch between cursor and cells
    if (lineElement && cursor.parentElement !== lineElement) {
      console.log('🔧 Moving cursor to line element for proper positioning context');
      lineElement.appendChild(cursor);
    } else if (!lineElement && cursor.parentElement !== this.element) {
      // Fallback: append to canvas if line element not found
      console.warn('⚠️ Line element not found, appending cursor to canvas');
      this.element.appendChild(cursor);
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
    const cursor = this.getCursorElement();
    if (cursor) {
      cursor.classList.add('blinking');

      // Stop blinking on focus loss
      this._blinkInterval = setInterval(() => {
        if (this.theDocument && !this.theDocument.state.has_focus) {
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
      console.warn('🔴 Cursor element not found in updateCursorVisualPosition');
      return;
    }

    const charPos = this.getCursorPosition(); // Character position (0, 1, 2, ...)

    const lineHeight = 16; // Line height in pixels
    const yOffset = 32; // Y position in line element (matches cells)

    console.log('🎯 updateCursorVisualPosition called:', {
      charPos,
      yOffset,
      documentExists: !!this.theDocument
    });

    // Calculate pixel position using character-level positioning
    const pixelPos = this.charPosToPixel(charPos);

    console.log('📐 Cursor at character position', charPos, '-> pixel:', pixelPos);

    // Set cursor position
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

    if (this.theDocument && this.theDocument.state && this.theDocument.state.has_focus) {
      cursor.classList.add('focused');
    } else {
      cursor.classList.remove('focused');
    }

    // Ensure cursor is visible when focused
    if (this.theDocument && this.theDocument.state && this.theDocument.state.has_focus) {
      cursor.style.opacity = '1';
    }
  }

  /**
     * Animate cursor to new position
     */
  async animateCursorTo(position) {
    const cursor = this.getCursorElement();
    if (!cursor) return;

    const targetLeft = position.column * 12; // Approximate character width
    const lineHeight = 16;
    const targetTop = lineHeight; // Always on main line (lane 1)

    // Smooth animation to new position
    cursor.style.transition = 'left 0.15s ease-out, top 0.15s ease-out';
    cursor.style.left = `${targetLeft}px`;
    cursor.style.top = `${targetTop}px`;

    // Update internal position after animation
    setTimeout(() => {
      this.setCursorPosition(position.column);
      cursor.style.transition = '';
    }, 150);
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
    if (charCount && this.theDocument && this.theDocument.lines && this.theDocument.lines[0]) {
      // Count all cells (lanes removed)
      const cells = this.theDocument.lines[0].cells || [];
      charCount.textContent = cells.length;
    }

    const selectionInfo = document.getElementById('selection-info');
    if (selectionInfo) {
      if (this.hasSelection()) {
        const selection = this.getSelection();
        const selectionText = this.getSelectedText();
        const cellCount = selection.end - selection.start;
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
      console.log('[LilyPond] Exported MusicXML:', musicxml.substring(0, 300));

      // Convert to LilyPond
      const resultJson = this.wasmModule.convertMusicXMLToLilyPond(musicxml, null);
      const result = JSON.parse(resultJson);

      console.log('[LilyPond] Conversion result:', result);

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
    // Update ephemeral model (full document with state)
    const docJson = document.getElementById('document-json');
    if (docJson && this.theDocument) {
      // Create a display-friendly version of the document
      const displayDoc = this.createDisplayDocument(this.theDocument);
      docJson.textContent = this.toYAML(displayDoc);
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
    console.log('🎯 updateHitboxesDisplay called');
    const hitboxesContainer = document.getElementById('hitboxes-container');
    console.log('🔍 Hitboxes container found:', !!hitboxesContainer);
    console.log('🔍 Document found:', !!this.theDocument);

    if (!hitboxesContainer || !this.theDocument) {
      console.log('❌ Early return - missing container or document');
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
          console.log(`🔍 Cell ${cellIndex} (${cell.glyph}):`, {
            x: cell.x,
            y: cell.y,
            w: cell.w,
            h: cell.h,
            hasValidHitbox: cell.x !== undefined && cell.y !== undefined &&
                                        cell.w !== undefined && cell.h !== undefined
          });

          const hasValidHitbox = cell.x !== undefined && cell.y !== undefined &&
                                           cell.w !== undefined && cell.h !== undefined;

          if (hasValidHitbox) {
            const centerX = cell.x + (cell.w / 2);
            const centerY = cell.y + (cell.h / 2);

            hitboxHTML += `<tr class="hover:bg-blue-50">`;
            hitboxHTML += `<td class="border border-gray-300 px-2 py-1">${cellIndex}</td>`;
            hitboxHTML += `<td class="border border-gray-300 px-2 py-1 font-mono">${cell.glyph || ''}</td>`;
            hitboxHTML += `<td class="border border-gray-300 px-2 py-1">${cell.col || 0}</td>`;
            hitboxHTML += `<td class="border border-gray-300 px-2 py-1">`;
            hitboxHTML += `${cell.x.toFixed(1)},${cell.y.toFixed(1)} `;
            hitboxHTML += `${cell.w.toFixed(1)}×${cell.h.toFixed(1)}`;
            hitboxHTML += `</td>`;
            hitboxHTML += `<td class="border border-gray-300 px-2 py-1">`;
            hitboxHTML += `(${centerX.toFixed(1)}, ${centerY.toFixed(1)})`;
            hitboxHTML += `</td>`;
            hitboxHTML += `</tr>`;
          } else {
            console.log(`❌ Cell ${cellIndex} missing hitbox data:`, {
              x: cell.x,
              y: cell.y,
              w: cell.w,
              h: cell.h
            });
          }
        });

        hitboxHTML += `</tbody></table>`;
        hitboxHTML += `</div>`;
      }

      hitboxHTML += `</div>`;
    });

    hitboxHTML += '</div>';
    console.log('📝 Generated hitbox HTML length:', hitboxHTML.length);
    console.log('📝 Setting innerHTML...');
    hitboxesContainer.innerHTML = hitboxHTML;
    console.log('✅ Hitboxes display updated successfully');
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
        const glyphLength = (charCell.glyph || '').length;
        cumulativeX += glyphLength * 12; // 12px per character
      });

      // Set hitbox values on each cell if they're missing or zero
      cells.forEach((charCell, cellIndex) => {
        const glyphLength = (charCell.glyph || '').length;
        const cellWidth = glyphLength * 12;

        // Debug: log current cell state
        console.log(`🔧 Processing cell ${cellIndex} ('${charCell.glyph}'):`, {
          before: { x: charCell.x, y: charCell.y, w: charCell.w, h: charCell.h },
          calculated: { x: cellPositions[cellIndex], w: cellWidth, h: 16 }
        });

        // Only set if values are missing or zero
        if (charCell.x === undefined || charCell.x === 0) {
          charCell.x = cellPositions[cellIndex];
          console.log(`  ✅ Set x to ${cellPositions[cellIndex]}`);
        }
        if (charCell.y === undefined || charCell.y === 0) {
          charCell.y = 0; // Y position relative to line container
          console.log(`  ✅ Set y to 0`);
        }
        if (charCell.w === undefined || charCell.w === 0) {
          charCell.w = cellWidth;
          console.log(`  ✅ Set w to ${cellWidth}`);
        }
        if (charCell.h === undefined || charCell.h === 0) {
          charCell.h = 16;
          console.log(`  ✅ Set h to 16`);
        }

        console.log(`  📋 After updates:`, { x: charCell.x, y: charCell.y, w: charCell.w, h: charCell.h });

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

    console.log('✅ Hitbox values ensured on all document cells');
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
     * Get error statistics
     */
  getErrorStats() {
    if (!this.errorHistory) {
      return { total: 0, recent: [], patterns: {} };
    }

    const recent = this.errorHistory.slice(-10);
    const errorsBySource = {};

    this.errorHistory.forEach(error => {
      errorsBySource[error.source] = (errorsBySource[error.source] || 0) + 1;
    });

    return {
      total: this.errorHistory.length,
      recent: recent.map(e => ({
        message: e.message,
        timestamp: e.timestamp,
        source: e.source
      })),
      errorsBySource,
      errorRate: this.errorHistory.length / (performance.now() / 1000) // errors per second
    };
  }

  /**
     * Clear error history
     */
  clearErrorHistory() {
    this.errorHistory = [];
    const errorsTab = document.getElementById('console-errors-list');
    if (errorsTab) {
      errorsTab.innerHTML = '';
    }
    const warningsTab = document.getElementById('console-warnings-list');
    if (warningsTab) {
      warningsTab.innerHTML = '';
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

      console.log(`MusicXML exported: ${musicxml.length} bytes in ${exportTime.toFixed(2)}ms`);
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
