/**
 * KeyboardHandler - Handles all keyboard input and command routing
 *
 * This class encapsulates keyboard event handling, including:
 * - Key combination detection (Ctrl, Alt, Shift modifiers)
 * - Command routing (musical commands, edit commands, navigation)
 * - Input validation and key code normalization
 */

import logger, { LOG_CATEGORIES } from '../logger.js';

export class KeyboardHandler {
  constructor(editor) {
    this.editor = editor;
  }

  /**
   * Main keyboard event handler - routes to appropriate command handler
   * @param {KeyboardEvent} event - Browser keyboard event
   */
  async handleKeyboardEvent(event) {
    let key = event.key;
    logger.debug(LOG_CATEGORIES.KEYBOARD, `handleKeyboardEvent called`, { key });

    const modifiers = {
      alt: event.altKey,
      ctrl: event.ctrlKey,
      shift: event.shiftKey
    };
    logger.debug(LOG_CATEGORIES.KEYBOARD, 'Modifiers', { modifiers });

    // Fix for browsers that return "alt" instead of the actual key when Alt is pressed
    // Use event.code as fallback (e.g., "KeyL" -> "l")
    if (modifiers.alt && (key === 'alt' || key === 'Alt')) {
      const code = event.code;
      if (code && code.startsWith('Key')) {
        key = code.replace('Key', '').toLowerCase();
      }
    }

    // Handle Ctrl key combinations (copy/paste/undo/redo)
    if (modifiers.ctrl && !modifiers.alt) {
      this.handleCtrlCommand(key);
      return;
    }

    // Route to appropriate handler
    if (modifiers.alt && modifiers.shift && !modifiers.ctrl) {
      // Alt+Shift commands
      await this.handleAltShiftCommand(key);
    } else if (modifiers.alt && !modifiers.ctrl && !modifiers.shift) {
      await this.handleAltCommand(key);
    } else if (modifiers.shift && !modifiers.alt && !modifiers.ctrl && this.isSelectionKey(key)) {
      // Only route to selection handler for actual selection keys (arrows, Home, End)
      this.handleShiftCommand(key);
    } else {
      this.handleNormalKey(key);
    }
  }

  /**
   * Check if key is a selection key (arrow keys, Home, End)
   * @param {string} key - Key name
   * @returns {boolean} - True if key is a selection key
   */
  isSelectionKey(key) {
    return ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(key);
  }

  /**
   * Handle Alt+key commands (musical commands)
   * @param {string} key - Key name
   */
  async handleAltCommand(key) {
    // Log command for debugging
    this.editor.addToConsoleLog(`Musical command: Alt+${key.toLowerCase()}`);

    switch (key.toLowerCase()) {
      case 'n':
        // New document
        if (this.editor.ui && this.editor.ui.newDocument) {
          await this.editor.ui.newDocument();
        }
        break;
      case 's':
        // Apply slur using layered API
        await this._applySlurLayered();
        break;
      case 'u':
        // Upper octave using layered API
        await this._applyOctaveLayered(1);
        break;
      case 'm':
        // Middle octave using layered API
        await this._applyOctaveLayered(0);
        break;
      case 'l':
        // Lower octave using layered API
        await this._applyOctaveLayered(-1);
        break;
      case 't':
        await this.editor.showTalaDialog();
        break;
      default:
        logger.warn(LOG_CATEGORIES.KEYBOARD, 'Unknown Alt command', { key });
        this.editor.showWarning(`Unknown musical command: Alt+${key}`, {
          important: false,
          details: `Available commands: Alt+N (new), Alt+S (slur), Alt+U (upper octave), Alt+M (middle octave), Alt+L (lower octave), Alt+T (tala)`
        });
        return;
    }
  }

  /**
   * Toggle slur using layered API (WASM-first: no business logic in JS)
   * @private
   */
  async _applySlurLayered() {
    if (!this.editor.isInitialized || !this.editor.wasmModule) {
      return;
    }

    const selection = this.editor.getSelection();
    if (!selection || selection.start.col === selection.end.col) {
      return;
    }

    try {
      const line = selection.start.line;
      const start_col = selection.start.col;
      const end_col = selection.end.col;

      logger.debug(LOG_CATEGORIES.EDITOR, 'applySlurLayered');
      this.editor.wasmModule.toggleSlur(line, start_col, end_col);
      await this.editor.renderAndUpdate();

      // Trigger staff notation update if on staff notation tab
      if (this.editor.ui && this.editor.ui.activeTab === 'staff-notation') {
        await this.editor.renderStaffNotation();
      }

      // Restore selection after operation
      this.editor.wasmModule.setSelection(selection.anchor, selection.head);
      await this.editor.render(); // Re-render to show selection
    } catch (error) {
      logger.error(LOG_CATEGORIES.EDITOR, 'Failed to toggle slur', { error });
    }
  }

  /**
   * Set octave to absolute value using layered API
   * @param {number} target_octave - Target octave (-2, -1, 0, 1, 2)
   * @private
   */
  async _applyOctaveLayered(target_octave) {
    if (!this.editor.isInitialized || !this.editor.wasmModule) {
      return;
    }

    const selection = this.editor.getSelection();
    if (!selection || selection.start.col === selection.end.col) {
      return;
    }

    try {
      const line = selection.start.line;
      const start_col = selection.start.col;
      const end_col = selection.end.col;

      // Set octave to absolute value (not shift by delta)
      this.editor.wasmModule.setOctave(line, start_col, end_col, target_octave);
      await this.editor.renderAndUpdate();

      // Restore selection after operation
      this.editor.wasmModule.setSelection(selection.anchor, selection.head);
      await this.editor.render(); // Re-render to show selection
    } catch (error) {
      logger.error(LOG_CATEGORIES.EDITOR, 'Failed to set octave', { error });
    }
  }

  /**
   * Handle Alt+Shift+key commands (mode toggles)
   * @param {string} key - Key name
   */
  async handleAltShiftCommand(key) {
    this.editor.addToConsoleLog(`Mode command: Alt+Shift+${key.toUpperCase()}`);

    switch (key.toLowerCase()) {
      case 's':
        // Remove slur using layered API
        await this._removeSlurLayered();
        break;
      case 'o':
        // Toggle ornament edit mode
        await this.editor.toggleOrnamentEditMode();
        break;
      default:
        logger.warn(LOG_CATEGORIES.KEYBOARD, 'Unknown Alt+Shift command', { key });
        this.editor.showWarning(`Unknown mode command: Alt+Shift+${key.toUpperCase()}`, {
          important: false,
          details: `Available commands: Alt+Shift+S (remove slur), Alt+Shift+O (toggle ornament edit mode)`
        });
        return;
    }
  }

  /**
   * Remove slur using layered API
   * @private
   */
  async _removeSlurLayered() {
    if (!this.editor.isInitialized || !this.editor.wasmModule) {
      return;
    }

    const selection = this.editor.getSelection();
    if (!selection || selection.start.col === selection.end.col) {
      return;
    }

    try {
      const start_col = selection.start.col;
      const end_col = selection.end.col;

      logger.debug(LOG_CATEGORIES.EDITOR, 'removeSlurLayered');
      this.editor.wasmModule.removeSlurLayered(line, start_col, end_col);
      await this.editor.renderAndUpdate();

      // Restore selection after operation
      this.editor.wasmModule.setSelection(selection.anchor, selection.head);
      await this.editor.render(); // Re-render to show selection
    } catch (error) {
      logger.error(LOG_CATEGORIES.EDITOR, 'Failed to remove slur', { error });
    }
  }

  /**
   * Handle Ctrl+key commands (copy/paste/undo/redo)
   * @param {string} key - Key name
   */
  handleCtrlCommand(key) {
    this.editor.addToConsoleLog(`Edit command: Ctrl+${key.toUpperCase()}`);

    switch (key.toLowerCase()) {
      case 'a':
        this.editor.handleSelectAll();
        break;
      case 'c':
        this.editor.handleCopy();
        break;
      case 'x':
        this.editor.handleCut();
        break;
      case 'v':
        this.editor.handlePaste();
        break;
      case 'z':
        this.editor.handleUndo();
        break;
      case 'y':
        this.editor.handleRedo();
        break;
      default:
        logger.warn(LOG_CATEGORIES.KEYBOARD, 'Unknown Ctrl command', { key });
        return;
    }
  }

  /**
   * Handle Shift+key commands (selection extension)
   * @param {string} key - Key name
   */
  async handleShiftCommand(key) {
    try {
      // Load document to ensure WASM has latest state
      if (!this.editor.getDocument()) {
        logger.warn(LOG_CATEGORIES.EDITOR, 'No document available for selection');
        return;
      }
      this.editor.wasmModule.loadDocument(this.editor.getDocument());

      let diff;

      switch (key) {
        case 'ArrowLeft':
          diff = this.editor.wasmModule.moveLeft(true);
          break;
        case 'ArrowRight':
          diff = this.editor.wasmModule.moveRight(true);
          break;
        case 'ArrowUp':
          diff = this.editor.wasmModule.moveUp(true);
          break;
        case 'ArrowDown':
          diff = this.editor.wasmModule.moveDown(true);
          break;
        case 'Home':
          diff = this.editor.wasmModule.moveHome(true);
          break;
        case 'End':
          diff = this.editor.wasmModule.moveEnd(true);
          break;
        default:
          // Ignore non-selection Shift commands
          return;
      }

      // Update cursor and selection from WASM diff
      await this.editor.updateCursorFromWASM(diff);
    } catch (error) {
      logger.error(LOG_CATEGORIES.EDITOR, 'Selection extension error', { error });
    }
  }

  /**
   * Handle normal keys (text input, navigation, editing)
   * @param {string} key - Key name
   */
  handleNormalKey(key) {
    logger.debug(LOG_CATEGORIES.KEYBOARD, `handleNormalKey called`, { key });

    switch (key) {
      case 'ArrowLeft':
      case 'ArrowRight':
      case 'ArrowUp':
      case 'ArrowDown':
      case 'Home':
      case 'End':
        logger.debug(LOG_CATEGORIES.KEYBOARD, 'Arrow/navigation key detected, calling handleNavigation');
        // WASM now handles selection collapse logic for standard text editor behavior
        this.handleNavigation(key);
        break;
      case 'Backspace':
        this.editor.handleBackspace();
        break;
      case 'Delete':
        this.editor.handleDelete();
        break;
      case 'Enter':
        this.editor.handleEnter();
        break;
      default:
        // Insert text character - do NOT replace selection
        // Constraint filtering is now handled in WASM parser
        if (key.length === 1 && !key.match(/[Ff][0-9]/)) { // Exclude F-keys
          this.editor.insertText(key);
        }
    }
  }

  /**
   * Handle navigation keys (arrows, Home, End)
   * @param {string} key - Key name
   */
  async handleNavigation(key) {
    logger.debug(LOG_CATEGORIES.KEYBOARD, `handleNavigation called`, { key });

    try {
      // Load document to ensure WASM has latest state
      if (!this.editor.getDocument()) {
        logger.warn(LOG_CATEGORIES.EDITOR, 'No document available for navigation');
        return;
      }

      logger.debug(LOG_CATEGORIES.EDITOR, 'Current cursor before navigation', { cursor: this.editor.getDocument().state.cursor });
      this.editor.wasmModule.loadDocument(this.editor.getDocument());

      let diff;
      switch (key) {
        case 'ArrowLeft':
          logger.debug(LOG_CATEGORIES.EDITOR, 'Calling moveLeft...');
          diff = this.editor.wasmModule.moveLeft(false);
          logger.debug(LOG_CATEGORIES.EDITOR, 'moveLeft returned', { diff });
          break;
        case 'ArrowRight':
          diff = this.editor.wasmModule.moveRight(false);
          break;
        case 'ArrowUp':
          diff = this.editor.wasmModule.moveUp(false);
          break;
        case 'ArrowDown':
          diff = this.editor.wasmModule.moveDown(false);
          break;
        case 'Home':
          diff = this.editor.wasmModule.moveHome(false);
          break;
        case 'End':
          diff = this.editor.wasmModule.moveEnd(false);
          break;
        default:
          logger.warn(LOG_CATEGORIES.KEYBOARD, 'Unknown navigation key', { key });
          return;
      }

      // Update cursor display from diff
      logger.debug(LOG_CATEGORIES.EDITOR, 'About to update cursor from diff', { diff });
      await this.editor.updateCursorFromWASM(diff);
      logger.debug(LOG_CATEGORIES.EDITOR, 'Cursor after updateCursorFromWASM', { cursor: this.editor.getDocument().state.cursor });
    } catch (error) {
      logger.error(LOG_CATEGORIES.EDITOR, 'Navigation error', { error });
    }
  }
}

export default KeyboardHandler;
