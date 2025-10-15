/**
 * Cell Renderer
 *
 * Handles rendering of individual cell elements in the notation display.
 */

import {
  LEFT_MARGIN_PX,
  CELL_Y_OFFSET,
  CELL_HEIGHT,
  ELEMENT_KIND_NAMES,
  PITCH_SYSTEM_NAMES,
  CELL_FLAGS
} from './constants.js';

/**
 * Renders individual cells
 */
class CellRenderer {
  constructor() {
    this.cellElements = new Map();
  }

  /**
   * Render a single cell
   *
   * @param {Object} cell - Cell data
   * @param {number} lineIndex - Line index
   * @param {number} cellIndex - Cell index
   * @param {HTMLElement} container - Container element
   * @param {number} xPosition - X position
   * @param {string} [beatPosition] - Beat position class
   * @returns {HTMLElement} Created cell element
   */
  renderCell(cell, lineIndex, cellIndex, container, xPosition, beatPosition = null) {
    const element = this.createCellElement(cell, lineIndex, cellIndex, xPosition, beatPosition);
    container.appendChild(element);

    // Cache element
    const key = `${lineIndex}-${cellIndex}`;
    this.cellElements.set(key, element);

    return element;
  }

  /**
   * Create DOM element for a cell
   *
   * @param {Object} cell - Cell data
   * @param {number} lineIndex - Line index
   * @param {number} cellIndex - Cell index
   * @param {number} xPosition - X position
   * @param {string} [beatPosition] - Beat position class
   * @returns {HTMLElement} Cell element
   */
  createCellElement(cell, lineIndex, cellIndex, xPosition, beatPosition = null) {
    const element = document.createElement('span');
    element.className = this.getCellClasses(cell);

    // Use non-breaking space for space characters
    element.textContent = cell.glyph === ' ' ? '\u00A0' : cell.glyph;

    // Add beat position class
    if (beatPosition) {
      element.classList.add(beatPosition);
    }

    // Set positioning
    element.style.position = 'absolute';
    element.style.left = `${cell.x || xPosition || 0}px`;
    element.style.top = `${cell.y || CELL_Y_OFFSET}px`;
    element.style.height = `${cell.h || CELL_HEIGHT}px`;

    // Add data attributes
    element.dataset.lineIndex = lineIndex;
    element.dataset.cellIndex = cellIndex;
    element.dataset.column = cell.col;
    element.dataset.glyphLength = (cell.glyph || '').length;
    element.dataset.octave = cell.octave || 0;

    // Handle slur indicator
    let slurIndicator = cell.slurIndicator || cell.slur_indicator || 0;
    if (typeof slurIndicator === 'string') {
      if (slurIndicator === 'SlurStart') slurIndicator = 1;
      else if (slurIndicator === 'SlurEnd') slurIndicator = 2;
      else slurIndicator = 0;
    }
    element.dataset.slurIndicator = slurIndicator;

    // Add event listeners
    this.addEventListeners(element, cell);

    return element;
  }

  /**
   * Get CSS classes for a cell
   *
   * @param {Object} cell - Cell data
   * @returns {string} Space-separated class names
   */
  getCellClasses(cell) {
    const classes = ['char-cell'];

    // Element kind class
    const kindName = ELEMENT_KIND_NAMES[cell.kind] || 'unknown';
    classes.push(`kind-${kindName}`);

    // State classes
    if (cell.flags & CELL_FLAGS.SELECTED) classes.push('selected');
    if (cell.flags & CELL_FLAGS.FOCUSED) classes.push('focused');
    if (cell.flags & CELL_FLAGS.HEAD_MARKER) classes.push('head-marker');

    // Pitch system class
    if (cell.pitch_system) {
      const systemName = PITCH_SYSTEM_NAMES[cell.pitch_system] || 'unknown';
      classes.push(`pitch-system-${systemName}`);
    }

    return classes.join(' ');
  }

  /**
   * Add event listeners to cell element
   *
   * @param {HTMLElement} element - Cell element
   * @param {Object} cell - Cell data
   */
  addEventListeners(element, cell) {
    element.addEventListener('click', (event) => {
      event.stopPropagation();
      this.handleCellClick(cell, event);
    });

    element.addEventListener('mouseenter', () => {
      this.handleCellHover(cell, true);
    });

    element.addEventListener('mouseleave', () => {
      this.handleCellHover(cell, false);
    });
  }

  /**
   * Handle cell click
   *
   * @param {Object} cell - Cell data
   * @param {Event} event - Click event
   */
  handleCellClick(cell, event) {
    console.log('Cell clicked:', cell);

    // Update cursor via global editor if available
    if (window.musicEditor) {
      window.musicEditor.setCursorPosition(cell.col);
    }
  }

  /**
   * Handle cell hover
   *
   * @param {Object} cell - Cell data
   * @param {boolean} isHovering - Hover state
   */
  handleCellHover(cell, isHovering) {
    if (isHovering) {
      console.log('Hovering over cell:', cell);
    }
  }

  /**
   * Render multiple cells
   *
   * @param {Array} cells - Array of cells
   * @param {number} lineIndex - Line index
   * @param {HTMLElement} container - Container element
   * @param {Array} [beats] - Beat information
   */
  renderCells(cells, lineIndex, container, beats = []) {
    // Clear container
    container.innerHTML = '';

    if (!cells || cells.length === 0) {
      return;
    }

    // Build beat info map
    const cellBeatInfo = this.buildBeatInfoMap(beats);

    // Render each cell
    let cumulativeX = LEFT_MARGIN_PX;

    cells.forEach((cell, cellIndex) => {
      cell.x = cumulativeX;
      cell.y = CELL_Y_OFFSET;
      cell.h = CELL_HEIGHT;
      cell.w = 0;

      const beatPosition = cellBeatInfo.get(cellIndex);
      const element = this.renderCell(cell, lineIndex, cellIndex, container, cumulativeX, beatPosition);

      // Measure width
      const rect = element.getBoundingClientRect();
      cell.w = rect.width;

      // Update bounding boxes
      cell.bbox = [cell.x, cell.y, cell.x + cell.w, cell.y + cell.h];
      cell.hit = [cell.x - 2, cell.y - 2, cell.x + cell.w + 2, cell.y + cell.h + 2];

      // Advance position
      cumulativeX += cell.w;
      cell.rightEdge = cell.x + cell.w;
    });
  }

  /**
   * Build map of cell indices to beat positions
   *
   * @param {Array} beats - Beat information
   * @returns {Map} Cell index to beat position map
   */
  buildBeatInfoMap(beats) {
    const map = new Map();

    if (!beats || beats.length === 0) {
      return map;
    }

    beats.forEach(beat => {
      if (beat.end - beat.start >= 1) {
        for (let i = beat.start; i <= beat.end; i++) {
          if (i === beat.start) {
            map.set(i, 'beat-first');
          } else if (i === beat.end) {
            map.set(i, 'beat-last');
          } else {
            map.set(i, 'beat-middle');
          }
        }
      }
    });

    return map;
  }

  /**
   * Get cell element by key
   *
   * @param {string} key - Cell key (lineIndex-cellIndex)
   * @returns {HTMLElement|null} Cell element
   */
  getCellElement(key) {
    return this.cellElements.get(key) || null;
  }

  /**
   * Clear all cached cell elements
   */
  clear() {
    this.cellElements.clear();
  }

  /**
   * Get cell count
   *
   * @returns {number} Number of cached cells
   */
  getCellCount() {
    return this.cellElements.size;
  }
}

export default CellRenderer;
export { CellRenderer };
