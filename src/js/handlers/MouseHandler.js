/**
 * MouseHandler - Handles all mouse interactions and cell position calculations
 *
 * This class encapsulates mouse event handling, including:
 * - Mouse down/move/up for drag selection
 * - Double-click for beat/character group selection
 * - Click positioning and line detection
 * - Cell position calculations from coordinates
 */

import logger, { LOG_CATEGORIES } from '../logger.js';

export class MouseHandler {
  constructor(editor) {
    this.editor = editor;

    // Click tracking for detecting triple-click
    this.clickCount = 0;
    this.lastClickTime = 0;
    this.clickTimeout = null;
    this.CLICK_DELAY = 500; // ms between clicks to count as multi-click
  }

  /**
   * Handle mouse down - start drag selection
   * @param {MouseEvent} event - Browser mouse event
   */
  handleMouseDown(event) {
    this.editor.element.focus();

    try {
      // Ensure WASM has the latest document state
      if (!this.editor.theDocument) {
        console.warn('No document available for mouse interaction');
        return;
      }
      this.editor.wasmModule.loadDocument(this.editor.theDocument);

      // Calculate cell position from click
      const rect = this.editor.element.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      // Determine which line was clicked based on Y coordinate
      const lineIndex = this.calculateLineFromY(y);
      const col = this.calculateCellPosition(x, y);

      if (lineIndex !== null && col !== null) {
        // Start drag selection
        this.editor.isDragging = true;
        this.editor.dragStartLine = lineIndex;
        this.editor.dragStartCol = col;

        // Call WASM to handle mouse down (sets cursor, starts selection)
        const pos = { line: Math.floor(lineIndex), col: Math.floor(col) };
        const diff = this.editor.wasmModule.mouseDown(pos);
        this.editor.updateCursorFromWASM(diff);
      }

      event.preventDefault();
    } catch (error) {
      console.error('Mouse down error:', error);
    }
  }

  /**
   * Handle mouse move - update selection if dragging
   * @param {MouseEvent} event - Browser mouse event
   */
  handleMouseMove(event) {
    if (!this.editor.isDragging) return;

    try {
      // Ensure WASM has the latest document state
      if (!this.editor.theDocument) {
        console.warn('No document available for mouse interaction');
        return;
      }
      this.editor.wasmModule.loadDocument(this.editor.theDocument);

      const rect = this.editor.element.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      const lineIndex = this.calculateLineFromY(y);
      const col = this.calculateCellPosition(x, y);

      if (lineIndex !== null && col !== null) {
        // Call WASM to handle mouse move (extends selection)
        const pos = { line: Math.floor(lineIndex), col: Math.floor(col) };
        const diff = this.editor.wasmModule.mouseMove(pos);
        this.editor.updateCursorFromWASM(diff);

        // Prevent default to avoid text selection behavior
        event.preventDefault();
      }
    } catch (error) {
      console.error('Mouse move error:', error);
    }
  }

  /**
   * Handle mouse up - finish selection
   * @param {MouseEvent} event - Browser mouse event
   */
  handleMouseUp(event) {
    console.log('[JS] handleMouseUp called, isDragging:', this.editor.isDragging);
    if (this.editor.isDragging) {
      try {
        // Ensure WASM has the latest document state
        if (!this.editor.theDocument) {
          console.warn('No document available for mouse interaction');
          return;
        }
        console.log('[JS] Loading document into WASM before mouseUp');
        this.editor.wasmModule.loadDocument(this.editor.theDocument);

        // Calculate final mouse position
        const rect = this.editor.element.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        const lineIndex = this.calculateLineFromY(y);
        const col = this.calculateCellPosition(x, y);

        console.log(`[JS] Calling WASM mouseUp with pos=(${lineIndex}, ${col})`);
        // Call WASM to finalize mouse interaction with final position
        const pos = { line: Math.floor(lineIndex), col: Math.floor(col) };
        const diff = this.editor.wasmModule.mouseUp(pos);
        console.log('[JS] mouseUp returned diff:', diff);
        this.editor.updateCursorFromWASM(diff);
        console.log('[JS] After updateCursorFromWASM, selection:', this.editor.theDocument.state.selection);
      } catch (error) {
        console.error('Mouse up error:', error);
      }

      // Set justDragSelected flag to prevent click handler from clearing the selection
      this.editor.justDragSelected = true;

      // Delay clearing the dragging flag to prevent click event from clearing selection
      setTimeout(() => {
        this.editor.isDragging = false;
        this.editor.dragStartLine = null;
        this.editor.dragStartCol = null;
        this.editor.justDragSelected = false;
      }, 100); // Increased to 100ms to ensure click handler sees the flag
    }
  }

  /**
   * Handle double click - select beat or character group
   * @param {MouseEvent} event - Browser mouse event
   */
  handleDoubleClick(event) {
    const now = Date.now();

    // Track click count for triple-click detection
    if (now - this.lastClickTime < this.CLICK_DELAY) {
      this.clickCount++;
    } else {
      this.clickCount = 2; // This is the second click (first was single click)
    }
    this.lastClickTime = now;

    // Clear any pending reset
    if (this.clickTimeout) {
      clearTimeout(this.clickTimeout);
    }

    // Reset click count after delay
    this.clickTimeout = setTimeout(() => {
      this.clickCount = 0;
    }, this.CLICK_DELAY);

    const rect = this.editor.element.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const cellPosition = this.calculateCellPosition(x, y);

    if (cellPosition !== null) {
      if (this.clickCount >= 3) {
        // Triple-click: select entire line
        this.selectLine(cellPosition);
      } else {
        // Double-click: select beat or character group
        this.selectBeatOrCharGroup(cellPosition);
      }
    }

    event.preventDefault();
  }

  /**
   * Select beat or character group at cell index using WASM
   * JavaScript is only responsible for gesture detection, WASM handles all logic
   * @param {number} cellIndex - Cell index to select
   */
  selectBeatOrCharGroup(cellIndex) {
    if (!this.editor.theDocument) {
      return;
    }

    try {
      // Ensure WASM has the latest document state
      this.editor.wasmModule.loadDocument(this.editor.theDocument);

      // Get current line index
      const lineIndex = this.editor.theDocument.state.cursor.line || 0;

      // Call WASM - it handles all selection logic and returns EditorDiff
      const pos = { line: lineIndex, col: cellIndex };
      const diff = this.editor.wasmModule.selectBeatAtPosition(pos);

      // Update UI from WASM state (same pattern as mouseDown/mouseMove/mouseUp)
      this.editor.updateCursorFromWASM(diff);
    } catch (error) {
      console.error('Beat selection error:', error);
    }
  }

  /**
   * Select entire line at cell index using WASM (for triple-click)
   * JavaScript is only responsible for gesture detection, WASM handles all logic
   * @param {number} cellIndex - Cell index to select (used to determine line)
   */
  selectLine(cellIndex) {
    if (!this.editor.theDocument) {
      return;
    }

    try {
      // Ensure WASM has the latest document state
      this.editor.wasmModule.loadDocument(this.editor.theDocument);

      // Get current line index
      const lineIndex = this.editor.theDocument.state.cursor.line || 0;

      // Call WASM - it handles all selection logic and returns EditorDiff
      const pos = { line: lineIndex, col: cellIndex };
      const diff = this.editor.wasmModule.selectLineAtPosition(pos);

      // Update UI from WASM state (same pattern as mouseDown/mouseMove/mouseUp)
      this.editor.updateCursorFromWASM(diff);
    } catch (error) {
      console.error('Line selection error:', error);
    }
  }

  /**
   * Handle canvas click for caret positioning
   * @param {MouseEvent} event - Browser mouse event
   */
  handleCanvasClick(event) {
    const rect = this.editor.element.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    // Determine which line was clicked based on Y coordinate
    const lineIndex = this.calculateLineFromY(y);
    if (lineIndex !== null && this.editor.theDocument && this.editor.theDocument.state) {
      // Switch to the clicked line
      this.editor.theDocument.state.cursor.line = lineIndex;
    }

    // Calculate Cell position from click coordinates
    const charCellPosition = this.calculateCellPosition(x, y);

    if (charCellPosition !== null) {
      this.editor.setCursorPosition(charCellPosition);
      this.editor.element.focus();
    }
  }

  /**
   * Calculate which line was clicked based on Y coordinate
   * @param {number} y - Y coordinate relative to editor
   * @returns {number} - Line index
   */
  calculateLineFromY(y) {
    // Get all line containers
    const lineContainers = this.editor.element.querySelectorAll('.notation-line');
    const editorRect = this.editor.element.getBoundingClientRect();

    if (lineContainers.length === 0) {
      return 0;
    }

    // First, check if click is directly within any line
    for (let lineIdx = 0; lineIdx < lineContainers.length; lineIdx++) {
      const lineContainer = lineContainers[lineIdx];
      const lineRect = lineContainer.getBoundingClientRect();

      // Convert line container Y to editor-relative coordinates
      const lineTop = lineRect.top - editorRect.top;
      const lineBottom = lineRect.bottom - editorRect.top;

      // Check if click Y falls within this line
      if (y >= lineTop && y <= lineBottom) {
        return lineIdx;
      }
    }

    // If not directly in any line, find the closest line
    let closestLineIdx = 0;
    let minDistance = Infinity;

    for (let lineIdx = 0; lineIdx < lineContainers.length; lineIdx++) {
      const lineContainer = lineContainers[lineIdx];
      const lineRect = lineContainer.getBoundingClientRect();

      const lineTop = lineRect.top - editorRect.top;
      const lineBottom = lineRect.bottom - editorRect.top;
      const lineCenterY = (lineTop + lineBottom) / 2;

      // Calculate distance to line center
      const distance = Math.abs(y - lineCenterY);

      if (distance < minDistance) {
        minDistance = distance;
        closestLineIdx = lineIdx;
      }
    }

    return closestLineIdx;
  }

  /**
   * Calculate cell position from coordinates using DisplayList data
   * @param {number} x - X coordinate relative to editor
   * @param {number} y - Y coordinate relative to editor
   * @returns {number} - Cell position index
   */
  calculateCellPosition(x, y) {
    // Get the correct line based on Y coordinate
    const lineIndex = this.calculateLineFromY(y);

    // Get all line containers and find the one that was clicked
    const lineContainers = this.editor.element.querySelectorAll('.notation-line');
    if (lineIndex >= lineContainers.length) {
      return 0;
    }

    const lineContainer = lineContainers[lineIndex];
    const allCellElements = lineContainer.querySelectorAll('.char-cell');

    if (allCellElements.length === 0) {
      return 0;
    }

    // In normal mode, filter out ornament cells to make them non-interactive
    const editMode = this.editor.wasmModule.getOrnamentEditMode(this.editor.theDocument);
    // BUG FIX: Use the CLICKED line, not the current cursor line!
    const line = this.editor.theDocument?.lines?.[lineIndex];
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
    const editorRect = this.editor.element.getBoundingClientRect();
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
    let cursorCol = 0; // Which column position in the document (0 to cells.length)

    // Check each navigable cell to see if x falls within it
    for (let i = 0; i < navigableCellElements.length; i++) {
      const leftBoundary = cursorPositions[i];
      const rightBoundary = cursorPositions[i + 1];

      // Click is within this cell
      if (x >= leftBoundary && x < rightBoundary) {
        // Get the actual cellIndex from the data attribute (not the filtered index)
        cellIndex = parseInt(navigableCellElements[i].getAttribute('data-cell-index'), 10);

        // Determine if click is in left or right half of the cell
        const cellMidpoint = (leftBoundary + rightBoundary) / 2;

        console.log(`[MouseHandler] Cell ${i}: x=${x.toFixed(2)}, left=${leftBoundary.toFixed(2)}, right=${rightBoundary.toFixed(2)}, mid=${cellMidpoint.toFixed(2)}, cellIndex=${cellIndex}`);

        if (x >= cellMidpoint) {
          // Right half: cursor should be AFTER this cell (cellIndex + 1)
          cursorCol = cellIndex + 1;
          console.log(`[MouseHandler] Right half: cursorCol = ${cursorCol}`);
        } else {
          // Left half: cursor should be BEFORE this cell (at cellIndex position)
          cursorCol = cellIndex;
          console.log(`[MouseHandler] Left half: cursorCol = ${cursorCol}`);
        }
        break;
      }
    }

    console.log(`[MouseHandler] Final cursorCol = ${cursorCol}`);

    // If x is at or beyond the right edge of the last cell, snap to after the last cell
    if (x >= cursorPositions[navigableCellElements.length]) {
      const lastCellIndex = parseInt(
        navigableCellElements[navigableCellElements.length - 1].getAttribute('data-cell-index'),
        10
      );
      cursorCol = lastCellIndex + 1;
    }

    return cursorCol;
  }
}

export default MouseHandler;
