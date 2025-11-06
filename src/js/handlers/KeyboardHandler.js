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
  handleKeyboardEvent(event) {
    let key = event.key;
    console.log(`[JS] handleKeyboardEvent called with key: "${key}"`);

    const modifiers = {
      alt: event.altKey,
      ctrl: event.ctrlKey,
      shift: event.shiftKey
    };
    console.log('[JS] Modifiers:', modifiers);

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
  handleAltCommand(key) {
    // Log command for debugging
    this.editor.addToConsoleLog(`Musical command: Alt+${key.toLowerCase()}`);

    switch (key.toLowerCase()) {
      case 's':
        this.editor.applySlur();
        break;
      case 'u':
        this.editor.applyOctave(1); // Upper octave (+1)
        break;
      case 'm':
        this.editor.applyOctave(0); // Middle octave (0, remove octave marking)
        break;
      case 'l':
        this.editor.applyOctave(-1); // Lower octave (-1)
        break;
      case 't':
        this.editor.showTalaDialog();
        break;
      default:
        console.log('Unknown Alt command:', key);
        this.editor.showWarning(`Unknown musical command: Alt+${key}`, {
          important: false,
          details: `Available commands: Alt+S (slur), Alt+U (upper octave), Alt+M (middle octave), Alt+L (lower octave), Alt+T (tala)`
        });
        return;
    }
  }

  /**
   * Handle Alt+Shift+key commands (mode toggles)
   * @param {string} key - Key name
   */
  handleAltShiftCommand(key) {
    this.editor.addToConsoleLog(`Mode command: Alt+Shift+${key.toUpperCase()}`);

    switch (key.toLowerCase()) {
      default:
        console.log('Unknown Alt+Shift command:', key);
        this.editor.showWarning(`Unknown mode command: Alt+Shift+${key.toUpperCase()}`, {
          important: false,
          details: `No mode commands currently available`
        });
        return;
    }
  }

  /**
   * Handle Ctrl+key commands (copy/paste/undo/redo)
   * @param {string} key - Key name
   */
  handleCtrlCommand(key) {
    this.editor.addToConsoleLog(`Edit command: Ctrl+${key.toUpperCase()}`);

    switch (key.toLowerCase()) {
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
        console.log('Unknown Ctrl command:', key);
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
      if (!this.editor.theDocument) {
        console.warn('No document available for selection');
        return;
      }
      this.editor.wasmModule.loadDocument(this.editor.theDocument);

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
      console.error('Selection extension error:', error);
    }
  }

  /**
   * Handle normal keys (text input, navigation, editing)
   * @param {string} key - Key name
   */
  handleNormalKey(key) {
    console.log(`[JS] handleNormalKey called with key: "${key}"`);

    switch (key) {
      case 'ArrowLeft':
      case 'ArrowRight':
      case 'ArrowUp':
      case 'ArrowDown':
      case 'Home':
      case 'End':
        console.log('[JS] Arrow/navigation key detected, calling handleNavigation');
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
    console.log(`[JS] handleNavigation called with key: ${key}`);

    try {
      // Load document to ensure WASM has latest state
      if (!this.editor.theDocument) {
        console.warn('No document available for navigation');
        return;
      }

      console.log(`[JS] Current cursor before navigation:`, this.editor.theDocument.state.cursor);
      this.editor.wasmModule.loadDocument(this.editor.theDocument);

      let diff;
      switch (key) {
        case 'ArrowLeft':
          console.log('[JS] Calling moveLeft...');
          diff = this.editor.wasmModule.moveLeft(false);
          console.log('[JS] moveLeft returned:', diff);
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
          console.log('Unknown navigation key:', key);
          return;
      }

      // Update cursor display from diff
      console.log('[JS] About to update cursor from diff:', diff);
      await this.editor.updateCursorFromWASM(diff);
      console.log(`[JS] Cursor after updateCursorFromWASM:`, this.editor.theDocument.state.cursor);
    } catch (error) {
      console.error('Navigation error:', error);
    }
  }
}

export default KeyboardHandler;
