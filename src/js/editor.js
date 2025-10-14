/**
 * Music Notation Editor - Core Editor Functionality
 *
 * This class provides the core editor functionality with WASM integration,
 * document management, and basic event handling for the Music Notation Editor POC.
 */

import DOMRenderer from './renderer.js';
import logger, { LOG_CATEGORIES } from './logger.js';

class MusicNotationEditor {
  constructor(canvasElement) {
    this.canvas = canvasElement;
    // Ensure canvas has position: relative for absolute positioning of child elements
    this.canvas.style.position = 'relative';
    this.wasmModule = null;
    this.document = null;
    this.renderer = null;
    this.eventHandlers = new Map();
    this.isInitialized = false;

    // Performance monitoring
    this.performanceMetrics = {
      typingLatency: [],
      beatDerivation: [],
      renderTime: [],
      focusActivation: [],
      navigationLatency: [],
      selectionLatency: [],
      commandLatency: [] // Musical command performance
    };

    // Initialize performance monitoring
    this.startPerformanceMonitoring();
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
        parser: new wasmModule.CellParser(),
        beatDeriver: new wasmModule.BeatDeriver(),
        layoutRenderer: new wasmModule.LayoutRenderer(16),
        graphemeSegmenter: new wasmModule.GraphemeSegmenter(),
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
        setStaveLabel: wasmModule.setStaveLabel,
        setStaveLyrics: wasmModule.setStaveLyrics,
        setStaveTala: wasmModule.setStaveTala
      };

      const loadTime = performance.now() - startTime;
      console.log(`WASM module loaded in ${loadTime.toFixed(2)}ms`);

      // Initialize renderer
      this.renderer = new DOMRenderer(this.canvas, this);

      // Setup event handlers
      this.setupEventHandlers();

      // Mark as initialized BEFORE creating document
      this.isInitialized = true;

      // Create initial empty document
      await this.createNewDocument();

      console.log('Music Notation Editor initialized successfully');

      // Show ready state
      this.updatePerformanceIndicator('ready');
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
      cursor: { stave: 0, lane: 1, column: 0 },
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
        this.document = typeof jsonString === 'string' ? JSON.parse(jsonString) : jsonString;
        await this.render();
        this.updateDocumentDisplay();

        // Update UI title display
        if (this.ui && this.document && this.document.title) {
          this.ui.updateDocumentTitle(this.document.title);
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
      return JSON.stringify(this.document);
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
      if (this.document && this.document.lines && this.document.lines.length > 0) {
        const line = this.document.lines[0];
        let letterLane = line.cells; // Main line of notation

        logger.debug(LOG_CATEGORIES.PARSER, 'Processing characters', {
          charCount: text.length,
          initialLaneSize: letterLane.length
        });

        // Insert each character using recursive descent parser
        let currentPos = cursorPos;
        for (const char of text) {
          const lengthBefore = letterLane.length;

          logger.debug(LOG_CATEGORIES.PARSER, `Inserting char '${char}'`, {
            position: currentPos,
            laneSizeBefore: lengthBefore
          });

          // Call WASM recursive descent API
          const updatedCells = this.wasmModule.insertCharacter(
            letterLane,
            char,
            currentPos,
            pitchSystem
          );

          const lengthAfter = updatedCells.length;

          // Update main line with combined cells
          line.cells = updatedCells;
          letterLane = updatedCells;

          // Adjust cursor based on actual change in cell count
          // If cells combined, length might not increase by 1
          const cellDelta = lengthAfter - lengthBefore;
          logger.trace(LOG_CATEGORIES.PARSER, `Cell delta: ${cellDelta}`, {
            lengthBefore,
            lengthAfter
          });
          currentPos += cellDelta;
        }

        // Update cursor position (just the column number, not visual position yet)
        logger.debug(LOG_CATEGORIES.CURSOR, 'Updating cursor position', {
          from: cursorPos,
          to: currentPos
        });
        // Update cursor column without updating visual position (cells don't have x/w yet)
        if (this.document && this.document.state) {
          this.document.state.cursor.column = currentPos;
          this.document.state.cursor.lane = 1;
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
      this.recordPerformanceMetric('typingLatency', duration);

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
      const letterLane = line.cells;
      if (!letterLane || letterLane.length === 0) {
        line.beats = [];
        return;
      }

      logger.debug(LOG_CATEGORIES.EDITOR, 'Deriving beats via WASM', {
        cellCount: letterLane.length
      });

      // Call WASM BeatDeriver.deriveImplicitBeats method (exposed as deriveImplicitBeats in JS)
      const beats = this.wasmModule.beatDeriver.deriveImplicitBeats(letterLane);

      console.log(`WASM BeatDeriver returned ${beats.length} beats:`, beats);

      line.beats = beats;
      logger.info(LOG_CATEGORIES.EDITOR, `Derived ${beats.length} beats via WASM`);
    } catch (error) {
      logger.error(LOG_CATEGORIES.EDITOR, 'WASM BeatDeriver failed', {
        error: error.message,
        cellCount: letterLane?.length || 0
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
      if (this.document && this.document.lines && this.document.lines.length > 0) {
        const cells = this.wasmModule.parseText(text, pitchSystem);
        const line =this.document.lines[0];
        line.cells = cells; // Replace main line with parsed cells
      }

      // Extract beats for visualization
      await this.extractAndRenderBeats(text);

      // Render updated document
      await this.render();
      this.updateDocumentDisplay();

      const endTime = performance.now();
      this.recordPerformanceMetric('beatDerivation', endTime - startTime);

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
      if (this.document && this.document.lines && this.document.lines.length > 0) {
        const line =this.document.lines[0];
        const letterLane = line.cells; // Main line

        // Delete cells in range
        letterLane.splice(start, end - start);
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
     * Get current cursor position
     */
  getCursorPosition() {
    if (this.document && this.document.state) {
      return this.document.state.cursor.column;
    }
    return 0;
  }

  /**
     * Set cursor position (always on main line, lane 1)
     */
  setCursorPosition(position) {
    if (this.document && this.document.state) {
      this.document.state.cursor.column = position;
      this.document.state.cursor.lane = 1; // Always on main line
      this.updateCursorPositionDisplay();
      this.updateCursorVisualPosition();
    }
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
    if (this.document) {
      return this.document.pitch_system || 1; // Default to Number system
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
    const startTime = performance.now();

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

    // Record command performance
    const endTime = performance.now();
    this.recordPerformanceMetric('commandLatency', endTime - startTime);
  }

  /**
     * Handle Shift+key commands (selection)
     */
  handleShiftCommand(key) {
    console.log('🔵 handleShiftCommand called:', key);
    const startTime = performance.now();
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

    // Only record performance for actual selection commands
    if (handled) {
      const endTime = performance.now();
      this.recordPerformanceMetric('selectionLatency', endTime - startTime);

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
    const startTime = performance.now();

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

    // Record navigation performance
    const endTime = performance.now();
    this.recordPerformanceMetric('navigationLatency', endTime - startTime);
  }

  /**
     * Navigate left one cell (like Excel)
     */
  navigateLeft() {
    logger.debug(LOG_CATEGORIES.CURSOR, 'Navigate left');
    const currentCellIndex = this.getCursorPosition();

    if (currentCellIndex > 0) {
      // Move to previous cell
      this.setCursorPosition(currentCellIndex - 1);
      logger.debug(LOG_CATEGORIES.CURSOR, 'Moved to cell', { index: currentCellIndex - 1 });
    }
  }

  /**
     * Navigate right one cell (like Excel)
     */
  navigateRight() {
    logger.debug(LOG_CATEGORIES.CURSOR, 'Navigate right');
    const currentCellIndex = this.getCursorPosition();
    const maxCellIndex = this.getMaxCellIndex();

    if (currentCellIndex < maxCellIndex) {
      // Move to next cell
      this.setCursorPosition(currentCellIndex + 1);
      logger.debug(LOG_CATEGORIES.CURSOR, 'Moved to cell', { index: currentCellIndex + 1 });
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
    const maxCellIndex = this.getMaxCellIndex();
    this.setCursorPosition(maxCellIndex);
  }

  /**
     * Get the maximum cell index in the main lane
     */
  getMaxCellIndex() {
    if (!this.document || !this.document.lines || this.document.lines.length === 0) {
      return 0;
    }

    const line = this.document.lines[0];
    const cells = line.cells || [];

    return cells.length; // Position after last cell
  }


  /**
     * Get current lane index (always returns 1 for main line)
     */
  getCurrentLane() {
    // Cursor is always on the main line (lane 1)
    return 1;
  }

  // ==================== SELECTION MANAGEMENT ====================

  /**
     * Initialize selection range (always on main line, lane 1)
     */
  initializeSelection(startPos, endPos) {
    if (!this.document || !this.document.state) {
      return;
    }

    this.document.state.selection = {
      start: Math.min(startPos, endPos),
      end: Math.max(startPos, endPos),
      active: true
    };
  }

  /**
     * Clear current selection
     */
  clearSelection() {
    if (this.document && this.document.state) {
      this.document.state.selection = null;
    }
    this.clearSelectionVisual();
    this.updateDocumentDisplay();
  }

  /**
     * Check if there's an active selection
     */
  hasSelection() {
    return !!(this.document && this.document.state && this.document.state.selection && this.document.state.selection.active);
  }

  /**
     * Get current selection range
     */
  getSelection() {
    if (this.hasSelection()) {
      return this.document.state.selection;
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

    if (!this.document || !this.document.lines || this.document.lines.length === 0) {
      return '';
    }

    const line = this.document.lines[0];
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
    const startTime = performance.now();
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

    // Record performance
    const endTime = performance.now();
    this.recordPerformanceMetric('selectionLatency', endTime - startTime);
  }

  /**
     * Extend selection to the right (cell-based)
     */
  extendSelectionRight() {
    console.log('🟢 extendSelectionRight called');
    const startTime = performance.now();
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

    // Record performance
    const endTime = performance.now();
    this.recordPerformanceMetric('selectionLatency', endTime - startTime);
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
     * Render visual selection highlighting
     */
  renderSelectionVisual(selection) {
    if (!this.renderer || !this.renderer.canvas) {
      return;
    }

    // Find the line element to append the selection to
    const lineElement = this.renderer.canvas.querySelector(`[data-line="0"]`);
    if (!lineElement) {
      console.warn('❌ Line element not found, cannot position selection');
      return;
    }

    // Calculate left position and width by measuring actual DOM elements
    let leftPos = 60;
    let selectionWidth = 0;

    // Get the start cell element
    const startCellElement = lineElement.querySelector(`[data-cell-index="${selection.start}"]`);

    if (startCellElement) {
      const startRect = startCellElement.getBoundingClientRect();
      const lineRect = lineElement.getBoundingClientRect();

      // Left position is relative to the line element
      leftPos = startRect.left - lineRect.left;

      // Get the last selected cell (selection.end - 1)
      const lastSelectedIndex = selection.end - 1;
      const endCellElement = lineElement.querySelector(`[data-cell-index="${lastSelectedIndex}"]`);

      if (endCellElement) {
        const endRect = endCellElement.getBoundingClientRect();
        // Width spans from start of first cell to end of last cell
        selectionWidth = (endRect.left - lineRect.left + endRect.width) - leftPos;
      } else {
        // Just one cell selected
        selectionWidth = startRect.width;
      }
    }

    console.log('✅ Rendering selection highlight', {
      start: selection.start,
      end: selection.end,
      leftPos,
      selectionWidth,
      lineElement: lineElement.className
    });

    // Create selection highlight
    const selectionElement = document.createElement('div');
    selectionElement.className = 'selection-highlight';
    selectionElement.style.cssText = `
            position: absolute;
            left: ${leftPos}px;
            top: 32px; /* Position relative to line element, same as cells and cursor */
            width: ${selectionWidth}px;
            height: 16px;
            background-color: rgba(59, 130, 246, 0.3); /* Blue with transparency */
            pointer-events: none;
            z-index: 2;
        `;

    // Append to the line element (same container as cells and cursor)
    lineElement.appendChild(selectionElement);

    // Store reference for later clearing
    this._currentSelectionElement = selectionElement;
  }

  /**
     * Clear visual selection
     */
  clearSelectionVisual() {
    if (this._currentSelectionElement && this._currentSelectionElement.parentElement) {
      this._currentSelectionElement.parentElement.removeChild(this._currentSelectionElement);
      this._currentSelectionElement = null;
    }

    // Also clean up any orphaned selection highlights that might remain
    const orphanedSelections = this.renderer.canvas.querySelectorAll('.selection-highlight');
    orphanedSelections.forEach(element => {
      if (element.parentElement) {
        element.parentElement.removeChild(element);
      }
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
    const cursorPos = this.getCursorPosition();

    logger.info(LOG_CATEGORIES.EDITOR, 'Backspace pressed', {
      cursorPos,
      hasSelection: this.hasSelection()
    });

    if (this.hasSelection()) {
      // Delete selected content
      logger.debug(LOG_CATEGORIES.EDITOR, 'Deleting selection via backspace');
      await this.deleteSelection();
      await this.recalculateBeats();
    } else if (cursorPos > 0) {
      // Use WASM API to delete character
      if (this.document && this.document.lines && this.document.lines.length > 0) {
        const line =this.document.lines[0];
        const letterLane = line.cells;

        // Check if the cell at cursorPos - 1 has multiple characters
        const cellToDelete = letterLane[cursorPos - 1];
        const glyphLength = cellToDelete ? (cellToDelete.glyph || '').length : 0;
        const hadMultipleChars = glyphLength > 1;

        logger.debug(LOG_CATEGORIES.EDITOR, 'Calling WASM deleteCharacter', {
          position: cursorPos - 1,
          laneSize: letterLane.length,
          glyphLength,
          hadMultipleChars
        });

        const updatedCells = this.wasmModule.deleteCharacter(letterLane, cursorPos - 1);
        line.cells = updatedCells;

        // Only move cursor if the entire cell was deleted (had 1 char or cell is now gone)
        // If it had multiple chars, one char was removed but cursor stays at same position
        const cellStillExists = updatedCells[cursorPos - 1];
        if (!hadMultipleChars || !cellStillExists) {
          this.setCursorPosition(cursorPos - 1);
          logger.info(LOG_CATEGORIES.EDITOR, 'Character deleted, cursor moved back', {
            newLaneSize: updatedCells.length
          });
        } else {
          // Multi-char glyph reduced but cursor stays
          // Need to manually update cursor visual position since setCursorPosition wasn't called
          logger.info(LOG_CATEGORIES.EDITOR, 'Character deleted from multi-char glyph, cursor stays', {
            newLaneSize: updatedCells.length
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
      const cursorPos = this.getCursorPosition();
      const maxPos = this.getMaxCellIndex();

      if (cursorPos < maxPos) {
        // Use WASM API to delete character
        if (this.document && this.document.lines && this.document.lines.length > 0) {
          const line =this.document.lines[0];
          const letterLane = line.cells;

          const updatedCells = this.wasmModule.deleteCharacter(letterLane, cursorPos);
          line.cells = updatedCells;
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
      if (this.document && this.document.lines && this.document.lines.length > 0) {
        const line = this.document.lines[0];

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
    if (!this.document || !this.document.lines || this.document.lines.length === 0) {
      return '';
    }

    const line = this.document.lines[0];
    const letterLane = line.cells; // Main line

    return letterLane.map(cell => cell.glyph || '').join('');
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
        if (this.document && this.document.lines && this.document.lines.length > 0) {
          const line =this.document.lines[0];
          const letterLane = line.cells; // Main line

          console.log('🔧 Calling WASM applySlur:', {
            cellCount: letterLane.length,
            start: selection.start,
            end: selection.end
          });

          // Call WASM API to apply slur
          const wasmModule = this.wasmModule;
          const updatedCells = wasmModule.applySlur(
            letterLane,
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
    if (!this.document || !this.document.lines || this.document.lines.length === 0) {
      return false;
    }

    const line =this.document.lines[0];
    const letterLane = line.cells; // Main line

    // Call WASM API to check for slur indicators
    const wasmModule = this.wasmModule;
    return wasmModule.hasSlurInSelection(
      letterLane,
      selection.start,
      selection.end
    );
  }

  /**
     * Remove slur from the given selection using WASM API
     */
  async removeSlurFromSelection(selection) {
    if (!this.document || !this.document.lines || this.document.lines.length === 0) {
      return;
    }

    const line =this.document.lines[0];
    const letterLane = line.cells; // Main line

    // Call WASM API to remove slur
    const wasmModule = this.wasmModule;
    const updatedCells = wasmModule.removeSlur(
      letterLane,
      selection.start,
      selection.end
    );

    // Update the line with the updated cells from WASM
    line.cells = updatedCells;

    this.addToConsoleLog(`Removed slur via WASM: cells ${selection.start}..${selection.end}`);
  }


  /**
     * Apply octave to current selection with enhanced validation
     */
  async applyOctave(octave) {
    if (!this.isInitialized || !this.wasmModule) {
      logger.warn(LOG_CATEGORIES.COMMAND, 'applyOctave called before initialization');
      return;
    }

    logger.time('applyOctave', LOG_CATEGORIES.COMMAND);

    // Validate selection
    if (!this.validateSelectionForCommands()) {
      logger.warn(LOG_CATEGORIES.COMMAND, 'applyOctave called without valid selection');
      return;
    }

    try {
      const selection = this.getSelection();
      const selectedText = this.getSelectedText();

      logger.info(LOG_CATEGORIES.COMMAND, 'Applying octave', {
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

      this.addToConsoleLog(`Applying octave ${octaveNames[octave]} to selection: "${selectedText}"`);

      // Call WASM function to apply octave to selected cells
      if (this.document && this.document.lines && this.document.lines.length > 0) {
        const line =this.document.lines[0];
        const letterLane = line.cells; // Main line

        logger.debug(LOG_CATEGORIES.COMMAND, 'Calling WASM applyOctave', {
          laneSize: letterLane.length,
          range: `${selection.start}..${selection.end}`
        });

        const updatedCells = this.wasmModule.applyOctave(
          letterLane,
          selection.start,
          selection.end,
          octave
        );

        // Debug: Check what octave values were set
        logger.debug(LOG_CATEGORIES.COMMAND, 'Octave values after WASM call:', {
          requestedOctave: octave,
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

      logger.timeEnd('applyOctave', LOG_CATEGORIES.COMMAND);
      this.addToConsoleLog(`Octave ${octaveNames[octave]} applied successfully to "${selectedText}"`);
    } catch (error) {
      logger.error(LOG_CATEGORIES.COMMAND, 'Failed to apply octave', {
        error: error.message,
        stack: error.stack
      });
      console.error('Failed to apply octave:', error);
    }
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
      if (this.wasmModule && this.document && this.document.lines.length > 0) {
        // Call WASM setStaveTala function
        const updatedDocument = await this.wasmModule.setStaveTala(this.document, 0, talaString);
        this.document = updatedDocument;
        this.addToConsoleLog(`Tala set to: ${talaString}`);
        await this.render();
      }
    } catch (error) {
      console.error('Failed to set tala:', error);
      this.showError('Failed to set tala');
    }
  }

  /**
     * Render the current document
     */
  async render() {
    if (!this.renderer) {
      return;
    }

    const startTime = performance.now();

    try {
      const state = await this.saveDocument();
      const doc = JSON.parse(state);
      this.renderer.renderDocument(doc);

      const endTime = performance.now();
      this.recordPerformanceMetric('renderTime', endTime - startTime);
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
    this.canvas.addEventListener('focus', () => {
      this.canvas.classList.add('focused');
      this.showCursor();
      this.recordFocusActivation();
    });

    this.canvas.addEventListener('blur', () => {
      this.canvas.classList.remove('focused');
      this.hideCursor();
    });

    // Mouse drag selection support
    this.canvas.addEventListener('mousedown', (event) => {
      this.handleMouseDown(event);
    });

    this.canvas.addEventListener('mousemove', (event) => {
      this.handleMouseMove(event);
    });

    this.canvas.addEventListener('mouseup', (event) => {
      this.handleMouseUp(event);
    });

    // Click events for caret positioning (when not selecting)
    this.canvas.addEventListener('click', (event) => {
      if (!this.isDragging) {
        // Clear selection when clicking
        this.clearSelection();
        this.handleCanvasClick(event);
      }
    });
  }

  /**
     * Handle mouse down - start selection or positioning
     */
  handleMouseDown(event) {
    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const cellPosition = this.calculateCellPosition(x, y);

    if (cellPosition !== null) {
      this.isDragging = true;
      this.dragStartPos = cellPosition;
      this.dragEndPos = cellPosition;

      // Start selection from current position
      this.initializeSelection(cellPosition, cellPosition);
      this.setCursorPosition(cellPosition);

      // Prevent default to avoid text selection behavior
      event.preventDefault();
    }
  }

  /**
     * Handle mouse move - update selection if dragging
     */
  handleMouseMove(event) {
    if (!this.isDragging) return;

    const rect = this.canvas.getBoundingClientRect();
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
    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    // Calculate Cell position from click coordinates
    // Returns null if clicked on non-main line
    const charCellPosition = this.calculateCellPosition(x, y);

    if (charCellPosition !== null) {
      this.setCursorPosition(charCellPosition);
      this.canvas.focus();
    }
  }

  /**
     * Calculate Cell position from coordinates
     */
  calculateCellPosition(x, y) {
    // Calculate which lane was clicked
    const lineHeight = 16;
    const clickedLane = Math.floor(y / lineHeight);
    const laneNames = ['upper_line', 'line', 'lower_line', 'lyrics'];

    // Log clicks on non-main lines
    if (clickedLane !== 1) {
      console.log(`Clicked on ${laneNames[clickedLane] || 'unknown'} (lane ${clickedLane}) at y=${y}`);
      return null; // Don't move cursor for non-main line clicks
    }

    // Calculate column position for main line clicks
    const charWidth = 12; // Approximate character width
    const column = Math.floor(x / charWidth);

    return Math.max(0, column);
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
    const lineElement = this.canvas.querySelector('[data-line="0"]');

    if (!cursor) {
      // Create new cursor element
      cursor = this.createCursorElement();
    }

    // Ensure cursor is in the correct parent (line element, not canvas)
    // This fixes the positioning context mismatch between cursor and cells
    if (lineElement && cursor.parentElement !== lineElement) {
      console.log('🔧 Moving cursor to line element for proper positioning context');
      lineElement.appendChild(cursor);
    } else if (!lineElement && cursor.parentElement !== this.canvas) {
      // Fallback: append to canvas if line element not found
      console.warn('⚠️ Line element not found, appending cursor to canvas');
      this.canvas.appendChild(cursor);
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
        if (this.document && !this.document.state.has_focus) {
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

    const cellIndex = this.getCursorPosition(); // This is now a cell index (0, 1, 2, ...)
    const lane = this.getCurrentLane();

    const charWidth = 12; // Approximate character width
    const lineHeight = 16; // Line height in pixels

    // Calculate Y offset for positioning within the line element
    // Since the cursor is now a child of the line element (same as cells),
    // it should be positioned at top: 32px for the main line (lane 1)
    // This matches how cells are positioned in renderer.js (line 255: y: 32px)
    const yOffset = 32; // Always 32px since cursor is inside line element, same as cells

    console.log('🎯 updateCursorVisualPosition called:', {
      cellIndex,
      lane,
      yOffset,
      documentExists: !!this.document,
      stavesLength: this.document?.staves?.length || 0
    });

    // Calculate pixel position by measuring actual DOM elements
    // Start with left margin of 5 character widths (60px)
    // TODO: Extract this as a shared constant (LEFT_MARGIN_PX) used across renderer.js and editor.js
    let pixelPos = 60;

    if (cellIndex === 0) {
      // Cursor at start
      pixelPos = 60;
    } else {
      // Find the DOM element for the previous cell and measure it
      const lineElement = this.canvas.querySelector('[data-line="0"]');
      if (lineElement) {
        const prevCellElement = lineElement.querySelector(`[data-cell-index="${cellIndex - 1}"]`);
        if (prevCellElement) {
          // Get the actual position from DOM
          const rect = prevCellElement.getBoundingClientRect();
          const lineRect = lineElement.getBoundingClientRect();
          // Position cursor at the right edge of the previous cell
          pixelPos = (rect.left - lineRect.left) + rect.width;
        }
      }
    }

    console.log('📐 Cursor at cellIndex', cellIndex, 'position:', pixelPos);

    // Set cursor position relative to line element (same positioning context as cells)
    // The cursor is now positioned inside the line element, not the canvas
    // This matches how cells are positioned: position: absolute, top: 0px (renderer.js:178-180)
    console.log('✏️ Setting cursor styles:', {
      left: `${pixelPos}px`,
      top: `${yOffset}px`,
      height: `${lineHeight}px`,
      note: 'Cursor positioned inside line element, same context as cells'
    });

    cursor.style.position = 'absolute';
    cursor.style.left = `${pixelPos}px`;
    cursor.style.top = `${yOffset}px`;
    cursor.style.height = `${lineHeight}px`;

    // Verify the styles were set
    console.log('✅ Cursor styles after setting:', {
      left: cursor.style.left,
      top: cursor.style.top,
      height: cursor.style.height,
      computedLeft: window.getComputedStyle(cursor).left,
      computedTop: window.getComputedStyle(cursor).top,
      parentElement: cursor.parentElement?.tagName,
      parentClass: cursor.parentElement?.className,
      parentDataLine: cursor.parentElement?.dataset?.line,
      isInLineElement: cursor.parentElement?.dataset?.line === '0'
    });

    // Update cursor appearance based on state
    if (this.hasSelection()) {
      cursor.classList.add('selecting');
    } else {
      cursor.classList.remove('selecting');
    }

    if (this.document && this.document.state && this.document.state.has_focus) {
      cursor.classList.add('focused');
    } else {
      cursor.classList.remove('focused');
    }

    // Ensure cursor is visible when focused
    if (this.document && this.document.state && this.document.state.has_focus) {
      cursor.style.opacity = '1';
    }
  }

  /**
     * Get cursor position with lane information
     */
  getCursorPositionWithLane() {
    if (this.document && this.document.state && this.document.state.cursor) {
      return {
        column: this.document.state.cursor.column,
        lane: this.document.state.cursor.lane || 1
      };
    }
    return {
      column: 0,
      lane: 1
    };
  }

  /**
     * Set cursor position with lane information (lane always forced to 1)
     */
  setCursorPositionWithLane(position) {
    if (this.document && this.document.state) {
      this.document.state.cursor = {
        stave: 0,
        lane: 1, // Always on main line, ignore position.lane
        column: position.column
      };
      this.updateCursorPositionDisplay();
      this.updateCursorVisualPosition();
    }
  }

  /**
     * Animate cursor to new position (always on main line, lane 1)
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
      this.setCursorPositionWithLane(position);
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
      const line = this.document && this.document.state && this.document.state.cursor
        ? this.document.state.cursor.stave
        : 0;
      const col = this.getCursorPosition();
      const lane = this.getCurrentLane();

      // Display in "Line: X, Col: Y" format for debugging
      cursorPos.textContent = `Line: ${line}, Col: ${col} (Lane: ${lane})`;
    }

    const charCount = document.getElementById('char-count');
    if (charCount && this.document && this.document.lines && this.document.lines[0]) {
      // Count all cells (lanes removed)
      const cells = this.document.lines[0].cells || [];
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
  updateDocumentDisplay() {
    // Update ephemeral model (full document with state)
    const docJson = document.getElementById('document-json');
    if (docJson && this.document) {
      // Create a display-friendly version of the document
      const displayDoc = this.createDisplayDocument(this.document);
      docJson.textContent = this.toYAML(displayDoc);
    }

    // Update persistent model (saveable content only, no state)
    const persistentJson = document.getElementById('persistent-json');
    if (persistentJson && this.document) {
      // Rust handles field exclusion via #[serde(skip)] on ephemeral fields (state, x, y, w, h, etc.)
      // Just exclude the runtime state field - WASM serialization handles the rest
      const { state, ...persistentDoc } = this.document;
      const displayDoc = this.createDisplayDocument(persistentDoc);
      persistentJson.textContent = this.toYAML(displayDoc);
    }

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
      const keys = Object.keys(obj);
      if (keys.length === 0) return '{}';

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

    // Convert document-level pitch_system to string
    if (displayDoc.metadata && typeof displayDoc.metadata.pitch_system === 'number') {
      const systemNum = displayDoc.metadata.pitch_system;
      displayDoc.metadata.pitch_system = `${this.getPitchSystemName(systemNum)} (${systemNum})`;
    }

    // Convert stave-level pitch_systems to strings
    if (displayDoc.staves && Array.isArray(displayDoc.staves)) {
      displayDoc.staves.forEach(stave => {
        if (line && typeof line.pitch_system === 'number') {
          const systemNum = line.pitch_system;
          line.pitch_system = `${this.getPitchSystemName(systemNum)} (${systemNum})`;
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
    console.log('🔍 Document found:', !!this.document);

    if (!hitboxesContainer || !this.document) {
      console.log('❌ Early return - missing container or document');
      return;
    }

    if (!this.document.lines || this.document.lines.length === 0) {
      hitboxesContainer.innerHTML = '<div class="text-gray-500 text-sm">No hitboxes available. Add some content to see hitbox information.</div>';
      return;
    }

    let hitboxHTML = '<div class="space-y-4">';

    this.document.lines.forEach((stave, staveIndex) => {
      hitboxHTML += `<div class="mb-4">`;
      hitboxHTML += `<h4 class="font-semibold text-sm mb-2">Stave ${staveIndex} Hitboxes</h4>`;

      // Process each lane using the new unified structure
      const laneKinds = [0, 1, 2, 3]; // Upper, Letter, Lower, Lyrics
      const laneDisplayNames = ['Upper Lane', 'Letter Lane (Main)', 'Lower Lane', 'Lyrics Lane'];

      laneKinds.forEach((laneKind, laneIndex) => {
        const lane = stave.cells ? stave.cells.filter(cell => cell.lane === laneKind) : [];
        if (lane && lane.length > 0) {
          hitboxHTML += `<div class="mb-3">`;
          hitboxHTML += `<h5 class="text-xs font-medium text-gray-600 mb-1">${laneDisplayNames[laneIndex]}</h5>`;
          hitboxHTML += `<table class="w-full text-xs border-collapse">`;
          hitboxHTML += `<thead><tr class="bg-gray-100">`;
          hitboxHTML += `<th class="border border-gray-300 px-2 py-1 text-left">Idx</th>`;
          hitboxHTML += `<th class="border border-gray-300 px-2 py-1 text-left">Char</th>`;
          hitboxHTML += `<th class="border border-gray-300 px-2 py-1 text-left">Pos</th>`;
          hitboxHTML += `<th class="border border-gray-300 px-2 py-1 text-left">Hitbox</th>`;
          hitboxHTML += `<th class="border border-gray-300 px-2 py-1 text-left">Center</th>`;
          hitboxHTML += `</tr></thead><tbody>`;

          lane.forEach((cell, cellIndex) => {
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
      });

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
    if (!this.document || !this.document.lines) {
      return;
    }

    this.document.lines.forEach((stave, staveIndex) => {
      const laneKinds = [0, 1, 2, 3]; // Upper, Letter, Lower, Lyrics

      laneKinds.forEach((laneKind, laneIndex) => {
        const lane = stave.cells ? stave.cells.filter(cell => cell.lane === laneKind) : [];
        if (!lane || lane.length === 0) {
          return;
        }

        // Calculate cumulative x positions for this lane
        let cumulativeX = 0;
        const cellPositions = [];
        lane.forEach((charCell) => {
          cellPositions.push(cumulativeX);
          const glyphLength = (charCell.glyph || '').length;
          cumulativeX += glyphLength * 12; // 12px per character
        });

        // Set hitbox values on each cell if they're missing or zero
        lane.forEach((charCell, cellIndex) => {
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
            charCell.y = 0; // Y position relative to lane container
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
    });

    console.log('✅ Hitbox values ensured on all document cells');
  }

  /**
     * Record performance metrics
     */
  recordPerformanceMetric(operation, duration) {
    if (!this.performanceMetrics[operation]) {
      this.performanceMetrics[operation] = [];
    }
    this.performanceMetrics[operation].push(duration);

    // Keep only last 100 measurements
    if (this.performanceMetrics[operation].length > 100) {
      this.performanceMetrics[operation].shift();
    }
  }

  /**
     * Record focus activation time
     */
  recordFocusActivation() {
    this.recordPerformanceMetric('focusActivation', 5); // Simulated time
  }

  /**
     * Start performance monitoring
     */
  startPerformanceMonitoring() {
    // Monitor performance periodically
    setInterval(() => {
      this.checkPerformanceTargets();
    }, 5000);
  }

  /**
     * Check performance against targets
     */
  checkPerformanceTargets() {
    const targets = {
      focusActivation: 10,      // ms
      typingLatency: 50,        // ms
      beatDerivation: 10,       // ms
      renderTime: 10,          // ms
      navigationLatency: 16,    // ms (60fps target)
      selectionLatency: 16,     // ms (60fps target)
      commandLatency: 20       // ms (musical commands target)
    };

    for (const [operation, target] of Object.entries(targets)) {
      const measurements = this.performanceMetrics[operation];
      if (measurements && measurements.length > 0) {
        const avg = measurements.reduce((a, b) => a + b, 0) / measurements.length;
        if (avg > target) {
          console.warn(`Performance warning: ${operation} averaging ${avg.toFixed(2)}ms (target: ${target}ms)`);
        }
      }
    }
  }

  /**
     * Update performance indicator
     */
  updatePerformanceIndicator(status) {
    const indicator = document.getElementById('performance-indicator');
    if (indicator) {
      indicator.className = `text-${status === 'ready' ? 'success' : 'error'}`;
      indicator.textContent = status === 'ready' ? 'Ready' : 'Error';
      indicator.classList.remove('hidden');
    }
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
    this.updatePerformanceIndicator('error');

    // Show user notification if recoverable
    if (errorInfo.recoverable) {
      this.showUserNotification(errorInfo);
    }

    // Log to performance metrics
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
     * Show user notification
     */
  showUserNotification(info) {
    const notification = document.createElement('div');
    notification.className = `notification notification-${info.type || 'error'}`;
    notification.innerHTML = `
            <div class="notification-content">
                <div class="notification-title">${this.capitalizeFirst(info.type || 'error')}</div>
                <div class="notification-message">${info.message}</div>
            </div>
            <button class="notification-close" onclick="this.parentElement.remove()">×</button>
        `;

    // Style the notification
    notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${info.type === 'error' ? '#dc2626' : info.type === 'warning' ? '#f59e0b' : '#3b82f6'};
            color: white;
            padding: 12px 16px;
            border-radius: 6px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            z-index: 1000;
            max-width: 300px;
            animation: slideIn 0.3s ease-out;
        `;

    // Add animation
    const style = document.createElement('style');
    style.textContent = `
            @keyframes slideIn {
                from {
                    transform: translateX(100%);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
            .notification-content {
                margin-right: 8px;
            }
            .notification-title {
                font-weight: 600;
                margin-bottom: 4px;
            }
            .notification-message {
                font-size: 14px;
                line-height: 1.4;
            }
            .notification-close {
                background: none;
                border: none;
                color: white;
                font-size: 18px;
                cursor: pointer;
                padding: 0;
                margin-left: 8px;
            }
            .notification-close:hover {
                background: rgba(255, 255, 255, 0.2);
            }
        `;
    document.head.appendChild(style);

    document.body.appendChild(notification);

    // Auto-remove after 5 seconds
    setTimeout(() => {
      if (notification.parentElement) {
        notification.remove();
      }
    }, 5000);

    // Handle manual close
    const closeBtn = notification.querySelector('.notification-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        notification.remove();
      });
    }
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
     * Get performance statistics
     */
  getPerformanceStats() {
    const stats = {};
    for (const [operation, measurements] of Object.entries(this.performanceMetrics)) {
      if (measurements && measurements.length > 0) {
        const avg = measurements.reduce((a, b) => a + b, 0) / measurements.length;
        const min = Math.min(...measurements);
        const max = Math.max(...measurements);

        stats[operation] = {
          average: avg,
          min,
          max,
          count: measurements.length
        };
      }
    }
    return stats;
  }
}

export default MusicNotationEditor;
