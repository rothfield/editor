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
import MusicalCoordinator from './coordinators/MusicalCoordinator.js';

// Types
import type { Document, DocumentLine } from '../types/wasm.js';

// Local type aliases for compatibility
type Line = DocumentLine;

// Position type (simple coordinates)
interface Pos {
  line: number;
  col: number;
}

interface ClipboardData {
  text: string | null;
  cells: any[] | null; // TODO: Type cells properly
}

interface ErrorOptions {
  details?: string;
}

interface UI {
  isInitialized?: boolean;
  activeTab?: string;
  updateDocumentTitle(title: string): void;
  updateCurrentPitchSystemDisplay(): void;
  updateKeySignatureCornerDisplay?(): void;
  updateModeToggleDisplay?(): void;
}

class MusicNotationEditor {
  // Core elements
  element: HTMLElement;
  wasmModule: WASMBridge | null;
  renderer: DOMRenderer | null;
  osmdRenderer: OSMDRenderer | null = null;
  eventHandlers: Map<string, EventListener>;
  isInitialized: boolean;

  // UI reference (set externally)
  ui?: UI;

  // Staff notation real-time update
  staffNotationTimer: number | null;

  // Mouse selection state
  isDragging: boolean;
  dragStartPos: Pos | null;
  dragEndPos: Pos | null;
  justDragSelected: boolean;

  // Clipboard storage (for rich copy/paste)
  clipboard: ClipboardData;

  // Managers and services
  autoSave: AutoSave;
  storage: StorageManager;
  debugHUD: DebugHUD;
  eventManager: any; // TODO: Create IEventManager interface from events.js
  keyboardHandler: KeyboardHandler;
  mouseHandler: MouseHandler;
  exportManager: ExportManager;

  // Coordinators (specialized functionality extraction)
  cursorCoordinator: CursorCoordinator;
  selectionCoordinator: SelectionCoordinator;
  clipboardCoordinator: ClipboardCoordinator;
  inspectorCoordinator: InspectorCoordinator;
  renderCoordinator: RenderCoordinator;
  consoleCoordinator: ConsoleCoordinator;
  musicalCoordinator: MusicalCoordinator;

  constructor(editorElement: HTMLElement) {
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
    this.musicalCoordinator = new MusicalCoordinator(this);
  }

  /**
   * Get the current document from WASM (WASM is the only source of truth)
   */
  getDocument(): Document | null {
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
  get document(): Document | null {
    return this.getDocument();
  }


  /**
   * Initialize the editor with WASM module
   */
  async initialize(): Promise<void> {
    try {
      console.log('Initializing Music Notation Editor...');

      // NOTE: System-specific NotationFont loading is currently disabled.
      // Full NotationFont is loaded via @font-face in index.html instead.
      // Uncomment below if switching back to dynamic system-specific fonts:
      // const pitchSystem = localStorage.getItem('pitchSystem') || 'number';
      // await this.loadNotationFont(pitchSystem);

      // Load WASM module
      const startTime = performance.now();
      // @ts-ignore - WASM module is generated at build time
      const wasmModule: any = await import('/dist/pkg/editor_wasm.js');

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
  async createNewDocument(): Promise<void> {
    if (!this.isInitialized || !this.wasmModule) {
      console.error('Cannot create document: WASM not initialized');
      return;
    }

    // Create document in WASM (WASM stores it internally)
    this.wasmModule.createNewDocument();

    console.log('✅ New document created in WASM');

    // Render the document from WASM
    await this.renderAndUpdate();

    // Focus the first textarea so user can start typing immediately
    if (this.renderer?.textareaRenderer?.focusFirstTextarea) {
      this.renderer.textareaRenderer.focusFirstTextarea();
    }
  }

  /**
   * Load document from JSON string
   * WASM owns the document - we just send it to WASM and render
   */
  async loadDocument(jsonString: string | Document): Promise<void> {
    try {
      if (this.wasmModule) {
        const document: Document = typeof jsonString === 'string' ? JSON.parse(jsonString) : jsonString;

        // Ensure pitch_system is set to default if missing (backward compatibility)
        if (!document.pitch_system && document.pitch_system !== 0) {
          document.pitch_system = 1; // Default to Number system
        }

        // Load document into WASM (WASM stores it internally)
        this.wasmModule.loadDocument(document);

        await this.renderAndUpdate();

        // Update cursor display based on WASM state (cursor position from document.state.cursor)
        this.updateCursorPositionDisplay();
        this.updateCursorVisualPosition();
        this.showCursor();

        // Focus textarea so user can type immediately
        if (this.renderer?.textareaRenderer?.focusFirstTextarea) {
          this.renderer.textareaRenderer.focusFirstTextarea();
        } else {
          this.requestFocus();
        }

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
  async saveDocument(): Promise<string> {
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
  async insertText(text: string): Promise<void> {
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
    let t1: number, t2: number, t3: number, t4: number, t5: number, t6: number;

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
      const dirtyLineIndices = result.dirty_lines.map((dl: any) => dl.row);

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
      const err = error as Error;
      logger.error(LOG_CATEGORIES.EDITOR, 'Failed to insert text', {
        error: err.message,
        stack: err.stack
      });
      console.error('Failed to insert text:', error);
      this.showError('Failed to insert text');
    }
  }


  /**
   * Delete text at specified range
   */
  async deleteRange(start: Pos, end: Pos): Promise<void> {
    if (!this.isInitialized || !this.wasmModule) {
      return;
    }

    try {
      // Get current line index from WASM
      const currentLineIndex = this.getCurrentStave();
      const line = this.getCurrentLine();
      if (!line) return;

      // Use WASM editReplaceRange for deletion (delete = replace with empty string)
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
      const err = error as Error;
      const errorMsg = err?.message || err?.toString() || 'Failed to delete selection';
      this.showError(errorMsg);
    }
  }

  /**
   * Get the current stave/line index from cursor state (WASM is source of truth)
   */
  getCurrentStave(): number {
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
  getCurrentLine(): Line | null {
    const doc = this.getDocument();
    if (!doc || !doc.lines) {
      return null;
    }
    const stave = this.getCurrentStave();
    return doc.lines[stave] || null;
  }

  /**
   * Update cursor visual display after WASM has set the cursor position
   * NOTE: This does NOT set the cursor - WASM owns cursor position
   * This only updates the visual display based on WASM's cursor state
   *
   * @deprecated Use this only for updating display after WASM operations
   * To actually move the cursor, use WASM functions: moveLeft, moveRight, mouseDown, etc.
   */
  setCursorPosition(positionOrRow: number, col?: number): void {
    // WASM owns cursor position - this method just updates display
    // The cursor has already been set by WASM operations
    this.updateCursorPositionDisplay();
    this.updateCursorVisualPosition();
    this.showCursor();
  }

  /**
   * Validate and clamp cursor position to valid range (character-based)
   */
  validateCursorPosition(position: number): number {
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
  async updateCursorFromWASM(diff: any): Promise<void> {
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
   * Handle keyboard input
   */
  async handleKeyboardEvent(event: KeyboardEvent): Promise<void> {
    await this.keyboardHandler.handleKeyboardEvent(event);
  }



  /**
   * Calculate max character position for a specific line
   * @param {Object} line - The line object
   * @returns {number} Maximum character position in the line
   */



  // ==================== SELECTION MANAGEMENT ====================


  /**
   * Handle backspace key with selection awareness and beat recalculation
   * Uses WASM-first approach for consistency with insertText
   */
  async handleBackspace(): Promise<void> {
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
      const result = this.wasmModule!.deleteAtCursor();

      logger.debug(LOG_CATEGORIES.EDITOR, 'deleteAtCursor result from WASM', result);

      // CRITICAL: Backspace can DELETE lines (not just edit them)
      // When an empty line is deleted, we need to resync the entire document
      // to get the updated line count. Applying dirty lines alone won't catch deletions.
      const wasmDoc = this.wasmModule!.getDocumentSnapshot();

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
      const err = error as Error;
      if (err && err.toString().includes('Cannot delete at start of document')) {
        logger.debug(LOG_CATEGORIES.EDITOR, 'Backspace at start of document, no action');
      } else {
        logger.error(LOG_CATEGORIES.EDITOR, 'Backspace failed', {
          error: err.message || String(err),
          stack: err.stack
        });
        console.error('Backspace failed:', error);
        this.showError('Backspace failed: ' + (err.message || String(err)));
      }
    }

    logger.timeEnd('handleBackspace', LOG_CATEGORIES.EDITOR);
  }

  /**
   * Handle delete key with selection awareness and beat recalculation
   * Uses WASM-first approach for consistency with handleBackspace
   */
  async handleDelete(): Promise<void> {
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
      const result = this.wasmModule!.deleteForward();

      logger.debug(LOG_CATEGORIES.EDITOR, 'deleteForward result from WASM', result);

      // Get updated document from WASM (WASM owns document state)
      const wasmDoc = this.wasmModule!.getDocumentSnapshot();

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
      const err = error as Error;
      if (err && err.toString().includes('Cannot delete at end')) {
        logger.debug(LOG_CATEGORIES.EDITOR, 'Delete at end of document, no action');
      } else {
        logger.error(LOG_CATEGORIES.EDITOR, 'Delete failed', {
          error: err.message || String(err),
          stack: err.stack
        });
        console.error('Delete failed:', error);
        this.showError('Delete failed: ' + (err.message || String(err)));
      }
    }

    logger.timeEnd('handleDelete', LOG_CATEGORIES.EDITOR);
  }

  /**
   * Handle Return/Enter key - split line at cursor position
   */
  async handleEnter(): Promise<void> {
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
      const result = this.wasmModule!.insertNewline();

      console.log('🔄 WASM insertNewline returned:', result);

      // NOTE: No longer mutating this.theDocument - WASM owns the state
      // Renderer will fetch latest state from WASM via getDocumentSnapshot()

      logger.debug(LOG_CATEGORIES.CURSOR, 'Cursor moved to new line', {
        newLine: result.caret?.caret?.line,
        newColumn: result.caret?.caret?.col
      });

      // Extract dirty line indices for incremental rendering
      const dirtyLineIndices = result.dirty_lines.map((dl: any) => dl.row);

      await this.renderAndUpdate(dirtyLineIndices);

      // Update cursor position display from WASM state
      this.updateCursorPositionDisplay();
      this.showCursor();

      logger.info(LOG_CATEGORIES.EDITOR, 'Line split successfully', {
        totalLines: this.getDocument()?.lines?.length || 0
      });
    } catch (error) {
      const err = error as Error;
      logger.error(LOG_CATEGORIES.EDITOR, 'Failed to split line', {
        error: err.message,
        stack: err.stack
      });
      console.error('Failed to split line:', error);
      this.showError('Failed to split line: ' + err.message);
    }

    logger.timeEnd('handleEnter', LOG_CATEGORIES.EDITOR);
  }

  /**
   * Recalculate beats after content changes
   */
  async recalculateBeats(): Promise<void> {
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
  getCurrentTextContent(): string {
    if (!this.getDocument() || !this.getDocument()?.lines || this.getDocument()?.lines?.length === 0) {
      return '';
    }

    const line = this.getCurrentLine();
    if (!line) return '';
    const cells = line.cells;

    return cells.map(cell => cell.char || '').join('');
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
   * Schedule a debounced staff notation update (100ms delay)
   * Only updates if the staff notation tab is currently active
   */
  scheduleStaffNotationUpdate(): void {
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
    this.staffNotationTimer = window.setTimeout(async () => {
      // Only render if staff notation tab is active
      if (this.ui && this.ui.activeTab === 'staff-notation') {
        await this.renderStaffNotation();
      }
    }, 100);
  }


  /**
   * Setup event handlers
   */
  setupEventHandlers(): void {
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
      // Don't steal focus from textareas - they handle their own focus
      const target = event.target as HTMLElement;
      if (target.tagName === 'TEXTAREA') {
        // Let textarea handle its own click/focus
        return;
      }

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
            const pos = { line: Math.floor(lineIndex), col: Math.floor(cursorColumn) };
            this.wasmModule.mouseDown(pos);
            this.updateCursorVisualPosition();
          }
        }
      }
    }, true); // Use capture phase to catch clicks earlier

    // Also attach click handler to editor-container div for clicks outside notation lines
    const editorContainer = document.getElementById('editor-container');
    if (editorContainer) {
      editorContainer.addEventListener('click', (event) => {
        // Ignore clicks on notation lines or textareas (let their handlers deal with it)
        const target = event.target as Element;
        if (target.closest('.notation-line') || target.closest('.notation-line-container') || target.tagName === 'TEXTAREA') {
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
  handleMouseDown(event: MouseEvent): void {
    this.mouseHandler.handleMouseDown(event);
  }

  handleMouseMove(event: MouseEvent): void {
    this.mouseHandler.handleMouseMove(event);
  }

  handleMouseUp(event: MouseEvent): void {
    this.mouseHandler.handleMouseUp(event);
  }

  handleDoubleClick(event: MouseEvent): void {
    this.mouseHandler.handleDoubleClick(event);
  }


  /**
   * Update document display in debug panel
   */
  async updateIRDisplay(): Promise<void> {
    return this.exportManager.updateIRDisplay();
  }

  async updateMusicXMLDisplay(): Promise<void> {
    return this.exportManager.updateMusicXMLDisplay();
  }

  async updateLilyPondDisplay(): Promise<void> {
    return this.exportManager.updateLilyPondDisplay();
  }


  /**
   * Format HTML string for display with proper indentation
   */
  formatHTML(html: string): string {
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


  /**
   * Convert JavaScript object to concise YAML format
   */
  toYAML(obj: any, indent: number = 0): string {
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

  async handleUndo(): Promise<void> {
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
      if (result) {
        // WASM owns document state - just render and update cursor display
        await this.renderAndUpdate();
        this.updateCursorVisualPosition();
        this.showCursor();
        this.addToConsoleLog('Undo completed');
      }
    } catch (error) {
      const err = error as Error;
      console.error('Undo failed:', error);
      this.showError('Undo failed', { details: err.message });
    }
  }

  /**
   * Handle Ctrl+Y (Redo)
   */
  async handleRedo(): Promise<void> {
    if (!this.wasmModule) {
      logger.warn(LOG_CATEGORIES.EDITOR, 'Cannot redo: WASM not ready');
      return;
    }

    try {
      const canRedo = this.wasmModule.canRedo();
      if (!canRedo) {
        logger.info(LOG_CATEGORIES.EDITOR, 'Nothing to redo');
        return;
      }

      const result = this.wasmModule.redo();
      if (result) {
        // WASM owns document state - just render and update cursor display
        await this.renderAndUpdate();
        this.updateCursorVisualPosition();
        this.showCursor();
        this.addToConsoleLog('Redo completed');
      }
    } catch (error) {
      const err = error as Error;
      logger.error(LOG_CATEGORIES.EDITOR, 'Redo failed', { error: err.message, stack: err.stack });
      this.showError('Redo failed', { details: err.message });
    }
  }

  // NOTE: deleteSelection() method is defined earlier in this class (line ~1161)
  // The WASM-first version queries selection from WASM, not from JS document state

  // ==================== COORDINATOR DELEGATE METHODS ====================
  // These methods delegate to the coordinators for cleaner architecture
  // They maintain backward compatibility while using the new coordinator pattern

  // Cursor delegates
  getCursorPosition(): number { return this.cursorCoordinator.getCursorPosition(); }
  getCursorPos(): Pos { return this.cursorCoordinator.getCursorPos(); }
  updateCursorVisualPosition(): void { return this.cursorCoordinator.updateCursorVisualPosition(); }
  updateCursorPositionDisplay(): void { return this.cursorCoordinator.updateCursorPositionDisplay(); }

  // Selection delegates
  clearSelection() { return this.selectionCoordinator.clearSelection(); }
  hasSelection() { return this.selectionCoordinator.hasSelection(); }
  getSelection() { return this.selectionCoordinator.getSelection(); }
  getSelectedText() { return this.selectionCoordinator.getSelectedText(); }
  updateSelectionDisplay() { return this.selectionCoordinator.updateSelectionDisplay(); }
  updatePrimarySelection() { return this.selectionCoordinator.updatePrimarySelection(); }
  getVisuallySelectedCells() { return this.selectionCoordinator.getVisuallySelectedCells(); }
  getEffectiveSelection() { return this.selectionCoordinator.getEffectiveSelection(); }
  validateSelectionForCommands() { return this.selectionCoordinator.validateSelectionForCommands(); }
  handleSelectAll() { return this.selectionCoordinator.handleSelectAll(); }
  replaceSelectedText(newText: string) { return this.selectionCoordinator.replaceSelectedText(newText); }
  deleteSelection() { return this.selectionCoordinator.deleteSelection(); }

  // Clipboard delegates
  handleCopy() { return this.clipboardCoordinator.handleCopy(); }
  handleCut() { return this.clipboardCoordinator.handleCut(); }
  handlePaste() { return this.clipboardCoordinator.handlePaste(); }
  handleMiddleClick(event: MouseEvent) { return this.clipboardCoordinator.handleMiddleClick(event); }

  // Render delegates
  render(dirtyLineIndices: number[] | null = null) { return this.renderCoordinator.render(dirtyLineIndices); }
  renderAndUpdate(dirtyLineIndices: number[] | null = null) { return this.renderCoordinator.renderAndUpdate(dirtyLineIndices); }
  renderStaffNotation() { return this.renderCoordinator.renderStaffNotation(); }
  charPosToCellIndex(charPos: number) { return this.renderCoordinator.charPosToCellIndex(charPos); }
  cellIndexToCharPos(cellIndex: number) { return this.renderCoordinator.cellIndexToCharPos(cellIndex); }
  charPosToPixel(charPos: number) { return this.renderCoordinator.charPosToPixel(charPos); }
  cellColToPixel(cellCol: number) { return this.renderCoordinator.cellColToPixel(cellCol); }
  calculateMaxCharPosition(line: Line) { return this.renderCoordinator.calculateMaxCharPosition(line); }
  getMaxCellIndex() { return this.renderCoordinator.getMaxCellIndex(); }
  getMaxCharPosition() { return this.renderCoordinator.getMaxCharPosition(); }
  scheduleHitboxesUpdate() { return this.renderCoordinator.scheduleHitboxesUpdate(); }
  updateHitboxesDisplay() { return this.renderCoordinator.updateHitboxesDisplay(); }
  ensureHitboxesAreSet() { return this.renderCoordinator.ensureHitboxesAreSet(); }

  // Inspector delegates
  updateDocumentDisplay() { return this.inspectorCoordinator.updateDocumentDisplay(); }
  forceUpdateAllExports() { return this.inspectorCoordinator.forceUpdateAllExports(); }

  // Console delegates
  showError(message: string, options: ErrorOptions = {}) { return this.consoleCoordinator.showError(message, options); }
  showWarning(message: string, options: ErrorOptions = {}) { return this.consoleCoordinator.showWarning(message, options); }
  addToConsoleLog(message: string) { return this.consoleCoordinator.addToConsoleLog(message); }
  addToConsoleErrors(errorInfo: any) { return this.consoleCoordinator.addToConsoleErrors(errorInfo); }

  // Musical delegates
  getPitchSystemName(system: number) { return this.musicalCoordinator.getPitchSystemName(system); }
  getCurrentPitchSystem() { return this.musicalCoordinator.getCurrentPitchSystem(); }
  showTalaDialog() { return this.musicalCoordinator.showTalaDialog(); }
  setTala(talaString: string) { return this.musicalCoordinator.setTala(talaString); }

  // Additional delegates needed for visibility
  showCursor(): void { return this.cursorCoordinator.showCursor(); }
  hideCursor(): void { return this.cursorCoordinator.hideCursor(); }

  // Focus management
  requestFocus(): void {
    const editorElement = document.getElementById('notation-editor');
    if (editorElement) {
      editorElement.focus();
    }
  }
}

export default MusicNotationEditor;
