/**
 * CursorCoordinator - Manages all cursor-related operations
 *
 * Responsibilities:
 * - Cursor position querying (from WASM)
 * - Cursor visual positioning and rendering
 * - Cursor blinking animation
 * - Cursor scrolling into view
 * - Cursor position display updates
 *
 * This coordinator delegates to the editor for:
 * - WASM module access
 * - Document querying
 * - Event manager access
 */

import { BASE_FONT_SIZE } from '../constants.js';
import logger, { LOG_CATEGORIES } from '../logger.js';

export default class CursorCoordinator {
  constructor(editor) {
    this.editor = editor;
    this._blinkInterval = null;
  }

  /**
   * Get the current cursor column position (WASM is source of truth)
   * @returns {number} Current column position
   */
  getCursorPosition() {
    if (this.editor.wasmModule && this.editor.wasmModule.getCaretInfo) {
      try {
        const caretInfo = this.editor.wasmModule.getCaretInfo();
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
    if (this.editor.wasmModule && this.editor.wasmModule.getCaretInfo) {
      try {
        const caretInfo = this.editor.wasmModule.getCaretInfo();
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
    const doc = this.editor.getDocument();
    if (!doc || !doc.lines || doc.lines.length === 0) {
      return 0;
    }

    const maxPosition = this.editor.getMaxCharPosition();

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
    await this.editor.render();

    // Update visual displays
    this.updateCursorPositionDisplay();
    this.updateCursorVisualPosition();
    this.showCursor();
    this.editor.updateSelectionDisplay();

    // Update primary selection register when selection changes (X11 select-to-copy)
    this.editor.updatePrimarySelection();
  }

  /**
   * Show cursor
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
    const currentStave = this.editor.getCurrentStave();
    const lineContainers = this.editor.element.querySelectorAll('.notation-line');
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
        if (this.editor.eventManager && !this.editor.eventManager.editorFocus()) {
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
    const currentStave = this.editor.getCurrentStave();

    // SIMPLIFIED: Cursor is now a child of the current .notation-line
    // So it's positioned absolutely relative to its line container
    // We just need the Y from the first cell of the current line

    let yOffset = 32; // Default fallback
    let cellHeight = BASE_FONT_SIZE; // Default fallback for cursor height

    // Find first cell to get its Y position and height (relative to the line)
    const cells = this.editor.element.querySelectorAll(`[data-line-index="${currentStave}"]`);

    if (cells.length > 0) {
      const firstCell = cells[0];
      const cellTop = parseInt(firstCell.style.top) || 32;
      yOffset = cellTop; // This is already relative to the line, no offset needed

      // Get actual cell height from the cell container (matches WASM display list)
      const cellContainer = firstCell.closest('.cell-container');
      if (cellContainer) {
        const declaredHeight = parseInt(cellContainer.style.height);
        if (declaredHeight) {
          cellHeight = declaredHeight;
        }
      }
    }

    // Calculate pixel position using cell column (one cell = one glyph)
    const pixelPos = this.editor.cellColToPixel(cellCol);

    // Set cursor position (position: absolute relative to .line-content)
    // Shares same coordinate system as cells - no offset needed
    cursor.style.position = 'absolute';
    cursor.style.left = `${pixelPos}px`;
    cursor.style.top = `${yOffset}px`;
    cursor.style.height = `${cellHeight}px`;

    // Update cursor appearance based on state
    if (this.editor.eventManager && this.editor.eventManager.editorFocus()) {
      cursor.classList.add('focused');
    } else {
      cursor.classList.remove('focused');
    }

    // Ensure cursor is visible when focused
    if (this.editor.eventManager && this.editor.eventManager.editorFocus()) {
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
      const line = this.editor.getCurrentStave();
      const col = this.getCursorPosition();

      // Simple display: line:col
      cursorPos.textContent = `Line ${line + 1}, Col ${col}`;
    }
  }
}
