/**
 * DOM Renderer for Music Notation Editor
 *
 * This class provides DOM-based rendering for Cell elements,
 * beat loops, slurs, and other musical notation components.
 */

import {
  BASE_FONT_SIZE,
  BASE_LINE_HEIGHT,
  SMALL_FONT_SIZE,
  BRAVURA_FONT_SIZE,
  BRAVURA_VERTICAL_OFFSET,
  LEFT_MARGIN_PX,
  CELL_Y_OFFSET,
  CELL_HEIGHT
} from './constants.js';
import SlurRenderer from './slur-renderer.js';

class DOMRenderer {
  constructor(editorElement, editor) {
    this.element = editorElement;
    this.editor = editor; // Store reference to editor instance
    this.charCellElements = new Map();
    this.beatLoopElements = new Map();
    this.theDocument = null;
    this.renderCache = new Map();

    // Performance metrics
    this.renderStats = {
      cellsRendered: 0,
      beatsRendered: 0,
      slursRendered: 0,
      lastRenderTime: 0
    };

    this.setupBeatLoopStyles(); // Sets up beat loops, octave dots, and slur CSS

    // Initialize slur renderer
    this.slurRenderer = new SlurRenderer(this.element);
  }

  /**
     * Setup CSS for beat loop arcs and octave dots
     * Note: Slurs are now rendered using SVG overlay (see SlurRenderer)
     */
  setupBeatLoopStyles() {
    const style = document.createElement('style');
    style.textContent = `
      /* Shared custom properties for arc configuration */
      .char-cell {
        --arc-offset: 10px;
        --arc-height: 12px;
        --arc-stroke: 1.5px;
        padding: 0;
        margin: 0;
        box-sizing: content-box;
      }

      /* LOWER beat arcs (using ::after) - styled like slurs */
      .char-cell.beat-first::after {
        content: '';
        position: absolute;
        left: -2px;
        right: 0;
        bottom: calc(-1 * var(--arc-offset));
        height: var(--arc-height);
        border-left: var(--arc-stroke) solid #666;
        border-bottom: var(--arc-stroke) solid #666;
        border-radius: 0 0 0 24px;
        pointer-events: none;
        z-index: 1;
      }

      .char-cell.beat-middle::after {
        content: '';
        position: absolute;
        left: 0;
        right: 0;
        bottom: calc(-1 * var(--arc-offset));
        height: var(--arc-height);
        border-bottom: var(--arc-stroke) solid #666;
        pointer-events: none;
        z-index: 1;
      }

      .char-cell.beat-last::after {
        content: '';
        position: absolute;
        left: 0;
        right: -2px;
        bottom: calc(-1 * var(--arc-offset));
        height: var(--arc-height);
        border-right: var(--arc-stroke) solid #666;
        border-bottom: var(--arc-stroke) solid #666;
        border-radius: 0 0 24px 0;
        pointer-events: none;
        z-index: 1;
      }

      /* Octave dots using ::before pseudo-element */
      .char-cell[data-octave="1"]::before {
        content: '•';
        position: absolute;
        left: 50%;
        top: -10px;
        transform: translateX(-50%);
        font-size: ${SMALL_FONT_SIZE}px;
        line-height: 1;
        color: #000;
        pointer-events: none;
        z-index: 2;
      }

      .char-cell[data-octave="2"]::before {
        content: '••';
        position: absolute;
        left: 50%;
        top: -10px;
        transform: translateX(-50%);
        font-size: ${SMALL_FONT_SIZE}px;
        line-height: 1;
        color: #000;
        letter-spacing: 2px;
        pointer-events: none;
        z-index: 2;
      }

      .char-cell[data-octave="-1"]::before {
        content: '•';
        position: absolute;
        left: 50%;
        bottom: -10px;
        transform: translateX(-50%);
        font-size: ${SMALL_FONT_SIZE}px;
        line-height: 1;
        color: #000;
        pointer-events: none;
        z-index: 2;
      }

      .char-cell[data-octave="-2"]::before {
        content: '••';
        position: absolute;
        left: 50%;
        bottom: -10px;
        transform: translateX(-50%);
        font-size: ${SMALL_FONT_SIZE}px;
        line-height: 1;
        color: #000;
        letter-spacing: 2px;
        pointer-events: none;
        z-index: 2;
      }

      /* Symbol elements styled in green */
      .char-cell.kind-symbol {
        color: #22c55e; /* green-500 */
        font-weight: 500;
      }

      /* Multi-character barline overlays using SMuFL music font */
      /* Hide underlying ASCII text and show fancy glyph overlay */
      .char-cell.repeat-left-start,
      .char-cell.repeat-right-start,
      .char-cell.double-bar-start {
        color: transparent;
      }

      /* Hide continuation cells that are part of multi-char barlines */
      .char-cell.kind-barline[data-continuation="true"] {
        color: transparent;
      }

      /* Left repeat (|:) - SMuFL U+E040 spanning 2 cells */
      .char-cell.repeat-left-start::after {
        content: '\uE040';
        font-family: 'Bravura', serif;
        position: absolute;
        left: 0;
        top: calc(50% + ${BRAVURA_VERTICAL_OFFSET}px);
        transform: translateY(-50%);
        width: 200%; /* Span 2 cells */
        text-align: left;
        color: #000;
        font-size: ${BRAVURA_FONT_SIZE}px;
        line-height: 1;
        pointer-events: none;
        z-index: 4;
      }

      /* Right repeat (:|) - SMuFL U+E041 spanning 2 cells */
      .char-cell.repeat-right-start::after {
        content: '\uE041';
        font-family: 'Bravura', serif;
        position: absolute;
        left: 0;
        top: calc(50% + ${BRAVURA_VERTICAL_OFFSET}px);
        transform: translateY(-50%);
        width: 200%; /* Span 2 cells */
        text-align: left;
        color: #000;
        font-size: ${BRAVURA_FONT_SIZE}px;
        line-height: 1;
        pointer-events: none;
        z-index: 4;
      }

      /* Double barline (||) - SMuFL U+E031 spanning 2 cells */
      .char-cell.double-bar-start::after {
        content: '\uE031';
        font-family: 'Bravura', serif;
        position: absolute;
        left: 0;
        top: calc(50% + ${BRAVURA_VERTICAL_OFFSET}px);
        transform: translateY(-50%);
        width: 200%; /* Span 2 cells */
        text-align: left;
        color: #000;
        font-size: ${BRAVURA_FONT_SIZE}px;
        line-height: 1;
        pointer-events: none;
        z-index: 4;
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Render entire document using Rust layout engine + thin JS DOM layer
   */
  renderDocument(doc) {
    const startTime = performance.now();

    this.theDocument = doc;

    // Clear previous content
    this.clearElement();

    if (!doc.lines || doc.lines.length === 0) {
      this.showEmptyState();
      return;
    }

    // STEP 1: Measure all widths (JS-only, native DOM)
    const measureStart = performance.now();
    const measurements = this.measureAllWidths(doc);

    // Also measure character widths for cursor positioning
    this.characterWidthData = this.measureCharacterWidths(doc);

    const measureTime = performance.now() - measureStart;
    console.log(`⏱️ Measurements completed in ${measureTime.toFixed(2)}ms`);

    // Flatten character widths for Rust
    const flattenedCharWidths = [];
    for (const charData of this.characterWidthData) {
      flattenedCharWidths.push(...charData.charWidths);
    }

    // STEP 2: Call Rust ONCE to compute layout
    const layoutStart = performance.now();
    const config = {
      cell_widths: measurements.cellWidths,
      syllable_widths: measurements.syllableWidths,
      char_widths: flattenedCharWidths,
      font_size: BASE_FONT_SIZE,
      line_height: BASE_LINE_HEIGHT,
      left_margin: LEFT_MARGIN_PX,
      cell_y_offset: CELL_Y_OFFSET,
      cell_height: CELL_HEIGHT,
      min_syllable_padding: 4.0,
    };

    const displayList = this.editor.wasmModule.computeLayout(doc, config);
    const layoutTime = performance.now() - layoutStart;
    console.log(`⏱️ Rust layout computed in ${layoutTime.toFixed(2)}ms`);

    // DEBUG: Log the full displayList from WASM
    console.log('🔍 === WASM DisplayList ===');
    console.log('📄 DisplayList:', JSON.stringify(displayList, null, 2));
    console.log('📊 Total lines:', displayList.lines.length);
    displayList.lines.forEach((line, idx) => {
      console.log(`📍 Line ${idx}: ${line.cells.length} cells, ${line.lyrics.length} lyrics, ${line.tala.length} tala`);
      if (line.cells.length > 0) {
        console.log(`   First cell: char="${line.cells[0].char}", x=${line.cells[0].x}, y=${line.cells[0].y}`);
      }
    });
    console.log('🔍 === End DisplayList ===');

    // Cache DisplayList for cursor positioning
    this.displayList = displayList;

    // STEP 3: Render from DisplayList (fast native JS DOM)
    const renderStart = performance.now();
    this.renderFromDisplayList(displayList);
    const renderTime = performance.now() - renderStart;
    console.log(`⏱️ DOM rendering completed in ${renderTime.toFixed(2)}ms`);

    // Update render statistics
    const endTime = performance.now();
    this.renderStats.lastRenderTime = endTime - startTime;

    console.log(`✅ Document rendered in ${this.renderStats.lastRenderTime.toFixed(2)}ms (measure: ${measureTime.toFixed(2)}ms, layout: ${layoutTime.toFixed(2)}ms, render: ${renderTime.toFixed(2)}ms)`);
  }

  /**
   * Measure all cell widths and syllable widths for the document
   * This is done in JavaScript using temporary DOM elements
   *
   * @param {Object} doc - The document to measure
   * @returns {Object} {cellWidths: number[], syllableWidths: number[]}
   */
  measureAllWidths(doc) {
    const cellWidths = [];
    const syllableWidths = [];

    // Create temporary invisible container for measurements
    const temp = document.createElement('div');
    temp.style.cssText = 'position:absolute; left:-9999px; visibility:hidden; pointer-events:none;';
    document.body.appendChild(temp);

    for (const line of doc.lines) {
      // Measure each cell
      for (const cell of line.cells) {
        const span = document.createElement('span');
        span.className = 'char-cell';
        span.textContent = cell.char === ' ' ? '\u00A0' : cell.char;
        temp.appendChild(span);
        cellWidths.push(span.getBoundingClientRect().width);
        temp.removeChild(span);
      }

      // Measure lyrics syllables if present
      if (line.lyrics) {
        const syllables = this.extractSyllablesSimple(line.lyrics);
        for (const syllable of syllables) {
          const span = document.createElement('span');
          span.className = 'lyric-syllable text-sm';
          span.style.fontStyle = 'italic';
          span.textContent = syllable;
          temp.appendChild(span);
          syllableWidths.push(span.getBoundingClientRect().width);
          temp.removeChild(span);
        }
      }
    }

    document.body.removeChild(temp);

    console.log(`📏 Measured ${cellWidths.length} cells, ${syllableWidths.length} syllables`);
    return { cellWidths, syllableWidths };
  }

  /**
   * Extract syllables from lyrics string (simple version for measurement)
   * Just splits on whitespace and hyphens to get syllable count
   *
   * @param {string} lyrics - Lyrics string
   * @returns {string[]} Array of syllables
   */
  extractSyllablesSimple(lyrics) {
    if (!lyrics) return [];

    // Simple extraction: split on whitespace, then on hyphens
    const words = lyrics.trim().split(/\s+/);
    const syllables = [];

    for (const word of words) {
      // Split on hyphens but keep them
      const parts = word.split(/(-)/);
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (part === '') continue;

        if (part === '-') {
          syllables.push('-');
        } else if (i < parts.length - 1 && parts[i + 1] === '-') {
          syllables.push(part + '-');
          i++; // Skip the hyphen
        } else {
          syllables.push(part);
        }
      }
    }

    return syllables;
  }

  /**
   * Measure character widths within each cell for accurate cursor positioning
   * Returns array of {cellIndex, charWidths:[]} for all cells in the document
   *
   * @param {Object} doc - The document to measure
   * @returns {Array} Array of character width data per cell
   */
  measureCharacterWidths(doc) {
    const characterData = [];

    // Create temporary invisible container for measurements
    const temp = document.createElement('div');
    temp.style.cssText = 'position:absolute; left:-9999px; visibility:hidden; pointer-events:none;';
    document.body.appendChild(temp);

    let cellIndex = 0;
    for (const line of doc.lines) {
      for (const cell of line.cells) {
        const charWidths = [];

        // Measure each character in the cell's glyph
        for (const char of cell.char) {
          const span = document.createElement('span');
          span.className = 'char-cell';
          span.textContent = char === ' ' ? '\u00A0' : char;
          temp.appendChild(span);
          charWidths.push(span.getBoundingClientRect().width);
          temp.removeChild(span);
        }

        characterData.push({
          cellIndex,
          cellCol: cell.col,
          glyph: cell.char,
          charWidths
        });

        cellIndex++;
      }
    }

    document.body.removeChild(temp);

    console.log(`📏 Measured character widths for ${characterData.length} cells`);
    return characterData;
  }

  /**
   * Render document from DisplayList returned by Rust
   * Pure DOM rendering with no layout calculations
   *
   * @param {Object} displayList - DisplayList from Rust computeLayout
   */
  renderFromDisplayList(displayList) {
    console.log('🎨 renderFromDisplayList called');
    console.log('📊 DisplayList:', displayList);
    console.log('📊 DisplayList.lines:', displayList.lines);

    // Render header if present
    if (displayList.header) {
      this.renderHeaderFromDisplayList(displayList.header);
    }

    // Render each line from DisplayList
    displayList.lines.forEach((renderLine, lineIdx) => {
      console.log(`📍 Rendering line ${lineIdx}:`, renderLine);
      console.log(`   - cells count: ${renderLine.cells ? renderLine.cells.length : 0}`);
      const lineElement = this.renderLineFromDisplayList(renderLine);
      this.element.appendChild(lineElement);
    });

    // Render slurs using SVG overlay (after all cells are positioned)
    this.slurRenderer.renderSlurs(displayList);

    // Update slur count in stats
    this.renderStats.slursRendered = this.slurRenderer.slurPaths.size;
  }

  /**
   * Render document header from DisplayList
   *
   * @param {Object} header - Header data from DisplayList
   */
  renderHeaderFromDisplayList(header) {
    const title = header.title;
    const composer = header.composer;

    // Skip if neither title nor composer
    if ((!title || title === 'Untitled Document') && !composer) {
      return;
    }

    // Create container for title and composer
    const headerContainer = document.createElement('div');
    headerContainer.className = 'document-header';
    headerContainer.style.cssText = `
      position: relative;
      width: 100%;
      margin-top: 16px;
      margin-bottom: 32px;
      min-height: 24px;
    `;

    // Render title (centered)
    if (title && title !== 'Untitled Document') {
      const titleElement = document.createElement('div');
      titleElement.className = 'document-title';
      titleElement.textContent = title;
      titleElement.style.cssText = `
        text-align: center;
        font-size: 20px;
        font-weight: bold;
        width: 100%;
        display: block;
      `;
      headerContainer.appendChild(titleElement);
    }

    // Render composer (flush right)
    if (composer) {
      const composerElement = document.createElement('div');
      composerElement.className = 'document-composer';
      composerElement.textContent = composer;
      composerElement.style.cssText = `
        text-align: right;
        font-size: 14px;
        font-style: italic;
        color: #6b7280;
        width: 100%;
        display: block;
        margin-top: 4px;
        padding-right: 20px;
      `;
      headerContainer.appendChild(composerElement);
    }

    this.element.appendChild(headerContainer);
  }

  /**
   * Render a single line from DisplayList
   * Pure DOM rendering with pre-calculated positions
   *
   * @param {Object} renderLine - RenderLine data from DisplayList
   * @returns {HTMLElement} The created line element
   */
  renderLineFromDisplayList(renderLine) {
    const line = document.createElement('div');
    line.className = 'notation-line';
    line.dataset.line = renderLine.line_index;
    line.style.cssText = `position:relative; height:${renderLine.height}px; width:100%;`;

    // Render label if present
    if (renderLine.label) {
      const labelElement = document.createElement('span');
      labelElement.className = 'line-label text-ui-disabled-text';
      labelElement.textContent = renderLine.label;
      labelElement.style.cssText = `
        position: absolute;
        left: 0;
        top: ${CELL_Y_OFFSET}px;
        height: ${CELL_HEIGHT}px;
        line-height: ${BASE_LINE_HEIGHT}px;
        font-size: ${BASE_FONT_SIZE}px;
        display: inline-flex;
        align-items: baseline;
      `;
      line.appendChild(labelElement);
    }

    // Render cells (fast native JS)
    renderLine.cells.forEach((cellData, idx) => {
      const span = document.createElement('span');
      span.className = cellData.classes.join(' ');
      span.textContent = cellData.char === ' ' ? '\u00A0' : cellData.char;

      // Detect multi-character barlines for CSS overlay
      // Check if this is a barline head (not a continuation) that's followed by a continuation
      const isBarline = cellData.classes.includes('kind-barline');
      const isContinuation = cellData.dataset && (
        cellData.dataset instanceof Map ?
          cellData.dataset.get('continuation') === 'true' :
          cellData.dataset.continuation === 'true'
      );

      if (isBarline && !isContinuation && idx < renderLine.cells.length - 1) {
        const nextCell = renderLine.cells[idx + 1];
        const nextIsBarline = nextCell.classes.includes('kind-barline');
        const nextIsContinuation = nextCell.dataset && (
          nextCell.dataset instanceof Map ?
            nextCell.dataset.get('continuation') === 'true' :
            nextCell.dataset.continuation === 'true'
        );

        // If next cell is a barline continuation, determine the pattern
        if (nextIsBarline && nextIsContinuation) {
          const pattern = cellData.char + nextCell.char;
          if (pattern === '|:') {
            span.classList.add('repeat-left-start');
          } else if (pattern === ':|') {
            span.classList.add('repeat-right-start');
          } else if (pattern === '||') {
            span.classList.add('double-bar-start');
          }
        }
      }

      span.style.cssText = `
        position: absolute;
        left: ${cellData.x}px;
        top: ${cellData.y}px;
        width: ${cellData.w}px;
        height: ${cellData.h}px;
      `;

      // Set data attributes (handle both Map and plain objects)
      if (cellData.dataset) {
        // Debug logging for first cell to verify Map handling
        if (idx === 0) {
          console.log('🔍 DEBUG: Dataset type:', cellData.dataset.constructor.name);
          console.log('🔍 DEBUG: Is Map?', cellData.dataset instanceof Map);
          console.log('🔍 DEBUG: Dataset contents:', cellData.dataset);
        }

        // Check if it's a Map (from Rust) or plain object
        if (cellData.dataset instanceof Map) {
          // It's a Map from Rust
          console.log('🔍 DEBUG: Using Map iteration');
          for (const [key, value] of cellData.dataset.entries()) {
            span.dataset[key] = value;
            if (idx === 0) {
              console.log(`🔍 DEBUG: Set data-${key}="${value}"`);
            }
          }
        } else {
          // It's a plain object
          console.log('🔍 DEBUG: Using Object iteration');
          for (const [key, value] of Object.entries(cellData.dataset)) {
            span.dataset[key] = value;
            if (idx === 0) {
              console.log(`🔍 DEBUG: Set data-${key}="${value}" (from object)`);
            }
          }
        }

        // Verify the attributes were actually set
        if (idx === 0) {
          console.log('🔍 DEBUG: Resulting span.dataset:', span.dataset);
          console.log('🔍 DEBUG: Resulting HTML:', span.outerHTML);
        }
      }

      // Add event handlers (JS-only)
      const lineIndex = renderLine.line_index;
      // Get cellIndex from dataset (handle both Map and plain object)
      let cellIndex = idx;
      if (cellData.dataset) {
        if (cellData.dataset instanceof Map) {
          cellIndex = parseInt(cellData.dataset.get('cellIndex'));
        } else {
          cellIndex = parseInt(cellData.dataset.cellIndex);
        }
      }
      const cell = this.theDocument.lines[lineIndex].cells[cellIndex];

      span.addEventListener('click', (e) => {
        e.stopPropagation();
        this.handleCellClick(cell, e);
      });

      span.addEventListener('mouseenter', () => {
        this.handleCellHover(cell, true);
      });

      span.addEventListener('mouseleave', () => {
        this.handleCellHover(cell, false);
      });

      line.appendChild(span);
    });

    // Render lyrics (positioned syllables from DisplayList)
    renderLine.lyrics.forEach(lyric => {
      const span = document.createElement('span');
      span.className = 'lyric-syllable text-sm';
      span.textContent = lyric.text;
      span.style.cssText = `
        position: absolute;
        left: ${lyric.x}px;
        top: ${lyric.y}px;
        font-style: italic;
        color: #6b7280;
        transform: translateX(-50%);
        pointer-events: none;
        white-space: nowrap;
      `;
      line.appendChild(span);
    });

    // Render tala (positioned characters from DisplayList)
    renderLine.tala.forEach(talaChar => {
      const span = document.createElement('span');
      span.className = 'tala-char text-xs';
      span.textContent = talaChar.text;
      span.style.cssText = `
        position: absolute;
        left: ${talaChar.x}px;
        top: ${talaChar.y}px;
        transform: translateX(-50%);
        color: #4b5563;
        font-weight: 600;
        pointer-events: none;
      `;
      line.appendChild(span);
    });

    return line;
  }

  /**
   * Show empty state when no content
   */
  showEmptyState() {
    this.element.innerHTML = `
      <div class="text-ui-disabled-text text-sm">
        Click to start entering musical notation...
      </div>
    `;
  }

  /**
   * Handle Cell click
   */
  handleCellClick(charCell, event) {
    console.log('Cell clicked:', charCell);

    // Update cursor position
    if (window.musicEditor) {
      window.musicEditor.setCursorPosition(charCell.col);
    }
  }

  /**
   * Handle Cell hover
   */
  handleCellHover(charCell, isHovering) {
    // Could add hover effects here
    if (isHovering) {
      console.log('Hovering over Cell:', charCell);
    }
  }



  /**
   * Clear editor element content
   */
  clearElement() {
    // Remove all Cell elements from maps
    this.charCellElements.clear();
    this.beatLoopElements.clear();

    // Clear slurs
    if (this.slurRenderer) {
      this.slurRenderer.clearSlurs();
    }

    // Remove all child elements (except SVG overlay)
    const childrenToRemove = Array.from(this.element.children).filter(
      child => !child.classList.contains('slur-overlay')
    );
    childrenToRemove.forEach(child => this.element.removeChild(child));
  }

  /**
   * Get render statistics
   */
  getRenderStats() {
    return {
      ...this.renderStats,
      charCellElements: this.charCellElements.size,
      beatLoopElements: this.beatLoopElements.size
    };
  }

  /**
   * Update element visibility based on viewport
   */
  updateVisibility() {
    // This would be used for optimization in a real implementation
    // to only render elements that are currently visible
  }

  /**
   * Resize canvas to match container
   */
  resize() {
    // No canvas elements to resize - everything is CSS-based now
  }
}

export default DOMRenderer;
