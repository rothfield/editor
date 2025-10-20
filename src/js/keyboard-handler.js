/**
 * Keyboard Handler
 *
 * Processes keyboard events and executes corresponding editor actions.
 */

import { PREVENT_DEFAULT_KEYS, MODIFIER_KEYS } from './constants.js';
import logger, { LOG_CATEGORIES } from './logger.js';

/**
 * Handles keyboard input and shortcuts
 */
class KeyboardHandler {
  constructor(editor) {
    this.editor = editor;
    this.shortcuts = new Map();

    // Bind methods
    this.handleKeyDown = this.handleKeyDown.bind(this);
  }

  /**
   * Initialize keyboard handler
   */
  initialize() {
    this.setupShortcuts();
    document.addEventListener('keydown', this.handleKeyDown);

    logger.info(LOG_CATEGORIES.EDITOR, 'Keyboard handler initialized');
  }

  /**
   * Setup keyboard shortcuts
   */
  setupShortcuts() {
    // Navigation shortcuts
    this.registerShortcut('ArrowLeft', () => this.editor.moveCursor(-1));
    this.registerShortcut('ArrowRight', () => this.editor.moveCursor(1));
    this.registerShortcut('Home', () => this.editor.moveCursorToStart());
    this.registerShortcut('End', () => this.editor.moveCursorToEnd());

    // Editing shortcuts
    this.registerShortcut('Backspace', () => this.editor.deleteCharacter());
    this.registerShortcut('Delete', () => this.editor.deleteCharacterForward());
    this.registerShortcut('Enter', () => this.editor.handleEnter());

    // Musical commands
    this.registerShortcut('Alt+s', () => this.editor.toggleSlur());
    this.registerShortcut('Alt+S', () => this.editor.toggleSlur());
    this.registerShortcut('Alt+u', () => this.editor.toggleOctave(1));
    this.registerShortcut('Alt+U', () => this.editor.toggleOctave(1));
    this.registerShortcut('Alt+m', () => this.editor.toggleOctave(0));
    this.registerShortcut('Alt+M', () => this.editor.toggleOctave(0));
    this.registerShortcut('Alt+l', () => this.editor.toggleOctave(-1));
    this.registerShortcut('Alt+L', () => this.editor.toggleOctave(-1));
    this.registerShortcut('Alt+t', () => this.editor.enterTalaMode());
    this.registerShortcut('Alt+T', () => this.editor.enterTalaMode());

    // Debug shortcuts
    this.registerShortcut('F12', () => this.toggleDebugPanel());
    this.registerShortcut('Ctrl+Shift+I', () => this.toggleDebugPanel());

    logger.debug(LOG_CATEGORIES.EDITOR, `Registered ${this.shortcuts.size} keyboard shortcuts`);
  }

  /**
   * Register a keyboard shortcut
   *
   * @param {string} keyString - Key combination string
   * @param {Function} callback - Callback function
   */
  registerShortcut(keyString, callback) {
    this.shortcuts.set(keyString, callback);
  }

  /**
   * Unregister a keyboard shortcut
   *
   * @param {string} keyString - Key combination string
   */
  unregisterShortcut(keyString) {
    this.shortcuts.delete(keyString);
  }

  /**
   * Handle keyboard event
   *
   * @param {KeyboardEvent} event - Keyboard event
   */
  handleKeyDown(event) {
    // Ignore bare modifier keys
    if (MODIFIER_KEYS.includes(event.key)) {
      return;
    }

    // Debug logging for Alt key
    if (event.altKey) {
      logger.trace(LOG_CATEGORIES.EDITOR, 'Alt key combination', {
        key: event.key,
        code: event.code,
        altKey: event.altKey,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey
      });
    }

    const keyString = this.getKeyString(event);

    // Check for registered shortcut
    if (this.shortcuts.has(keyString)) {
      event.preventDefault();
      event.stopPropagation();

      const callback = this.shortcuts.get(keyString);

      try {
        callback();
        logger.debug(LOG_CATEGORIES.EDITOR, `Executed shortcut: ${keyString}`);
      } catch (error) {
        logger.error(LOG_CATEGORIES.EDITOR, `Shortcut execution failed: ${keyString}`, {
          error: error.message
        });
      }

      return;
    }

    // Route to editor if focused
    if (this.isEditorFocused()) {
      // Prevent default for specific keys
      if (PREVENT_DEFAULT_KEYS.includes(keyString)) {
        event.preventDefault();
      }

      // Handle character input
      if (this.isCharacterInput(event)) {
        event.preventDefault();
        this.handleCharacterInput(event);
      }
    }
  }

  /**
   * Handle character input
   *
   * @param {KeyboardEvent} event - Keyboard event
   */
  handleCharacterInput(event) {
    const char = event.key;

    if (char.length === 1 && !event.ctrlKey && !event.metaKey) {
      try {
        this.editor.insertText(char);
        logger.trace(LOG_CATEGORIES.EDITOR, `Character input: '${char}'`);
      } catch (error) {
        logger.error(LOG_CATEGORIES.EDITOR, 'Character input failed', {
          char,
          error: error.message
        });
      }
    }
  }

  /**
   * Check if event represents character input
   *
   * @param {KeyboardEvent} event - Keyboard event
   * @returns {boolean} True if character input
   */
  isCharacterInput(event) {
    // Single character, not a control key
    return (
      event.key.length === 1 &&
      !event.ctrlKey &&
      !event.metaKey &&
      !MODIFIER_KEYS.includes(event.key)
    );
  }

  /**
   * Get key string from event
   *
   * @param {KeyboardEvent} event - Keyboard event
   * @returns {string} Key string (e.g., "Ctrl+Alt+S")
   */
  getKeyString(event) {
    const parts = [];

    if (event.ctrlKey) parts.push('Ctrl');
    if (event.altKey) parts.push('Alt');
    if (event.shiftKey) parts.push('Shift');
    if (event.metaKey) parts.push('Meta');

    // Fix for browsers that return "alt" instead of actual key with Alt pressed
    let key = event.key;
    if (event.altKey && (key === 'alt' || key === 'Alt')) {
      const code = event.code;
      if (code && code.startsWith('Key')) {
        key = code.replace('Key', '').toLowerCase();
      }
    }

    parts.push(key);

    return parts.join('+');
  }

  /**
   * Check if editor is focused
   *
   * @returns {boolean} True if editor is focused
   */
  isEditorFocused() {
    const editorElement = document.getElementById('notation-editor');
    return editorElement === document.activeElement || editorElement?.contains(document.activeElement);
  }

  /**
   * Toggle debug panel
   */
  toggleDebugPanel() {
    const debugPanel = document.querySelector('.debug-panel');
    if (debugPanel) {
      debugPanel.classList.toggle('hidden');
    }
  }

  /**
   * Cleanup keyboard handler
   */
  destroy() {
    document.removeEventListener('keydown', this.handleKeyDown);
    this.shortcuts.clear();

    logger.info(LOG_CATEGORIES.EDITOR, 'Keyboard handler destroyed');
  }

  /**
   * Get all registered shortcuts
   *
   * @returns {Array} Array of shortcut strings
   */
  getShortcuts() {
    return Array.from(this.shortcuts.keys());
  }

  /**
   * Check if shortcut is registered
   *
   * @param {string} keyString - Key combination string
   * @returns {boolean} True if registered
   */
  hasShortcut(keyString) {
    return this.shortcuts.has(keyString);
  }
}

export default KeyboardHandler;
export { KeyboardHandler };
