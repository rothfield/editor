/**
 * Cursor Manager
 *
 * Handles cursor positioning, navigation, and visual rendering
 * for the Music Notation Editor.
 */

import { DEFAULT_CURSOR, LEFT_MARGIN_PX, BASE_FONT_SIZE } from './constants.js';
import logger, { LOG_CATEGORIES } from './logger.js';

/**
 * Manages cursor state and operations
 */
class CursorManager {
  constructor(document) {
    this.document = document;
    this.cursorElement = null;
    this.isVisible = true;
    this.blinkInterval = null;
  }

  /**
   * Initialize cursor visual element
   *
   * @param {HTMLElement} container - Container element for cursor
   */
  initialize(container) {
    // Create cursor element
    this.cursorElement = document.createElement('div');
    this.cursorElement.id = 'editor-cursor';
    this.cursorElement.className = 'editor-cursor';
    this.cursorElement.style.cssText = `
      position: absolute;
      width: 2px;
      height: ${BASE_FONT_SIZE}px;
      background-color: #000;
      z-index: 10;
      pointer-events: none;
      transition: left 0.1s ease, top 0.1s ease;
    `;

    container.appendChild(this.cursorElement);

    // Start cursor blinking
    this.startBlinking();

    logger.debug(LOG_CATEGORIES.CURSOR, 'Cursor manager initialized');
  }

  /**
   * Get current cursor position
   *
   * @returns {Object} Cursor position {stave, column}
   */
  getPosition() {
    if (!this.document || !this.document.state || !this.document.state.cursor) {
      return { ...DEFAULT_CURSOR };
    }

    return { ...this.document.state.cursor };
  }

  /**
   * Set cursor position
   *
   * @param {number} column - Column position
   * @param {number} [stave] - Stave position (optional)
   */
  setPosition(column, stave = null) {
    if (!this.document || !this.document.state) {
      logger.warn(LOG_CATEGORIES.CURSOR, 'Cannot set cursor position: document not available');
      return;
    }

    const oldPos = this.getPosition();

    // Update position
    this.document.state.cursor.column = column;
    if (stave !== null) this.document.state.cursor.stave = stave;

    logger.debug(LOG_CATEGORIES.CURSOR, 'Cursor position updated', {
      from: oldPos,
      to: this.getPosition()
    });

    // Update visual position
    this.updateVisualPosition();
  }

  /**
   * Move cursor by delta
   *
   * @param {number} delta - Amount to move (positive = right, negative = left)
   * @returns {boolean} True if move was successful
   */
  move(delta) {
    const pos = this.getPosition();
    const newColumn = Math.max(0, pos.column + delta);

    // Check bounds
    if (this.isValidPosition(newColumn)) {
      this.setPosition(newColumn);
      return true;
    }

    return false;
  }

  /**
   * Move cursor to start of line
   */
  moveToStart() {
    this.setPosition(0);
  }

  /**
   * Move cursor to end of line
   */
  moveToEnd() {
    const line = this.getCurrentLine();
    if (line && line.cells) {
      this.setPosition(line.cells.length);
    }
  }

  /**
   * Check if position is valid
   *
   * @param {number} column - Column to check
   * @returns {boolean} True if valid
   */
  isValidPosition(column) {
    const line = this.getCurrentLine();
    if (!line || !line.cells) {
      return column === 0;
    }

    return column >= 0 && column <= line.cells.length;
  }

  /**
   * Get current line
   *
   * @returns {Object|null} Current line object
   */
  getCurrentLine() {
    if (!this.document || !this.document.lines) {
      return null;
    }

    const staveIndex = this.document.state?.cursor?.stave || 0;
    return this.document.lines[staveIndex] || null;
  }

  /**
   * Update visual cursor position based on cell layout
   */
  updateVisualPosition() {
    if (!this.cursorElement) {
      return;
    }

    const pos = this.getPosition();
    const line = this.getCurrentLine();

    if (!line || !line.cells) {
      // Empty line - position at left margin
      this.cursorElement.style.left = `${LEFT_MARGIN_PX}px`;
      this.cursorElement.style.top = '32px';
      return;
    }

    // Calculate cursor position based on cells
    let cursorX = LEFT_MARGIN_PX;
    let cursorY = 32; // Default cell Y position

    if (pos.column === 0) {
      // Start of line
      cursorX = LEFT_MARGIN_PX;
    } else if (pos.column >= line.cells.length) {
      // End of line - position after last cell
      const lastCell = line.cells[line.cells.length - 1];
      if (lastCell && lastCell.x !== undefined && lastCell.w !== undefined) {
        cursorX = lastCell.x + lastCell.w;
      } else {
        cursorX = LEFT_MARGIN_PX + (line.cells.length * 12);
      }
    } else {
      // Middle of line - position before specified cell
      const cell = line.cells[pos.column];
      if (cell && cell.x !== undefined) {
        cursorX = cell.x;
        if (cell.y !== undefined) {
          cursorY = cell.y;
        }
      } else {
        cursorX = LEFT_MARGIN_PX + (pos.column * 12);
      }
    }

    this.cursorElement.style.left = `${cursorX}px`;
    this.cursorElement.style.top = `${cursorY}px`;

    logger.trace(LOG_CATEGORIES.CURSOR, 'Visual cursor position updated', {
      column: pos.column,
      x: cursorX,
      y: cursorY
    });
  }

  /**
   * Show cursor
   */
  show() {
    if (this.cursorElement) {
      this.cursorElement.style.display = 'block';
      this.isVisible = true;
      this.startBlinking();
    }
  }

  /**
   * Hide cursor
   */
  hide() {
    if (this.cursorElement) {
      this.cursorElement.style.display = 'none';
      this.isVisible = false;
      this.stopBlinking();
    }
  }

  /**
   * Start cursor blinking animation
   */
  startBlinking() {
    // Stop any existing blink interval
    this.stopBlinking();

    // Start new blink interval
    this.blinkInterval = setInterval(() => {
      if (this.cursorElement && this.isVisible) {
        const currentOpacity = this.cursorElement.style.opacity || '1';
        this.cursorElement.style.opacity = currentOpacity === '1' ? '0' : '1';
      }
    }, 500);
  }

  /**
   * Stop cursor blinking
   */
  stopBlinking() {
    if (this.blinkInterval) {
      clearInterval(this.blinkInterval);
      this.blinkInterval = null;
    }

    if (this.cursorElement) {
      this.cursorElement.style.opacity = '1';
    }
  }

  /**
   * Get cursor X position in pixels
   *
   * @returns {number} X position
   */
  getVisualX() {
    if (!this.cursorElement) {
      return LEFT_MARGIN_PX;
    }

    return parseInt(this.cursorElement.style.left) || LEFT_MARGIN_PX;
  }

  /**
   * Get cursor Y position in pixels
   *
   * @returns {number} Y position
   */
  getVisualY() {
    if (!this.cursorElement) {
      return 32;
    }

    return parseInt(this.cursorElement.style.top) || 32;
  }

  /**
   * Reset cursor to default position
   */
  reset() {
    this.setPosition(DEFAULT_CURSOR.COLUMN, DEFAULT_CURSOR.STAVE);
  }

  /**
   * Cleanup cursor resources
   */
  destroy() {
    this.stopBlinking();

    if (this.cursorElement && this.cursorElement.parentElement) {
      this.cursorElement.parentElement.removeChild(this.cursorElement);
    }

    this.cursorElement = null;
    this.document = null;
  }
}

export default CursorManager;
export { CursorManager };
