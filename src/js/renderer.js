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
import ArcRenderer from './arc-renderer.js';

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

    this.setupBeatLoopStyles(); // Sets up octave dots CSS

    // Initialize arc renderer (for slurs and beat loops)
    this.arcRenderer = new ArcRenderer(this.element);
  }

  /**
     * Setup CSS for octave dots and cell styling
     * Note: Slurs and beat loops are now rendered using SVG overlay (see ArcRenderer)
     */
  setupBeatLoopStyles() {
    const style = document.createElement('style');
    style.textContent = `
      /* Base cell styles */
      .char-cell {
        padding: 0;
        margin: 0;
        box-sizing: content-box;
      }

      /* Octave dots now use real DOM elements (span.cell-modifier.octave-dot) instead of ::before pseudo-elements */
      /* The octave-dot spans are positioned absolutely within the cell-content */

      /* Symbol elements styled in green */
      .char-cell.kind-symbol {
        color: #22c55e; /* green-500 */
        font-weight: 500;
      }

      /* Accidental symbols using SMuFL music font */
      /* Sharp sign (♯) - SMuFL U+E262 */
      .char-cell.accidental-sharp {
        color: transparent;
      }

      .char-cell.accidental-sharp::after {
        content: '\uE262'; /* SMuFL sharp glyph */
        font-family: 'Bravura', serif;
        position: absolute;
        left: 50%;
        top: calc(50% + ${BRAVURA_VERTICAL_OFFSET}px - ${BRAVURA_FONT_SIZE * 0.75}px);
        transform: translate(-50%, -50%);
        color: #000;
        font-size: ${BRAVURA_FONT_SIZE * 1.5}px;
        line-height: 1;
        pointer-events: none;
        z-index: 3;
      }

      /* Flat sign (♭) - SMuFL U+E260 */
      .char-cell.accidental-flat {
        color: transparent;
      }

      .char-cell.accidental-flat::after {
        content: '\uE260'; /* SMuFL flat glyph */
        font-family: 'Bravura', serif;
        position: absolute;
        left: 50%;
        top: calc(50% + ${BRAVURA_VERTICAL_OFFSET}px - ${BRAVURA_FONT_SIZE * 0.75}px);
        transform: translate(-50%, -50%);
        color: #000;
        font-size: ${BRAVURA_FONT_SIZE * 1.5}px;
        line-height: 1;
        pointer-events: none;
        z-index: 3;
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
        top: calc(50% + ${BRAVURA_VERTICAL_OFFSET}px - ${BRAVURA_FONT_SIZE * 0.5}px);
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
        top: calc(50% + ${BRAVURA_VERTICAL_OFFSET}px - ${BRAVURA_FONT_SIZE * 0.5}px);
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
        top: calc(50% + ${BRAVURA_VERTICAL_OFFSET}px - ${BRAVURA_FONT_SIZE * 0.5}px);
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

    // Cache DisplayList for cursor positioning
    this.displayList = displayList;
    this.editor.displayList = displayList; // Store in editor for tab display

    // STEP 3: Render from DisplayList (fast native JS DOM)
    const renderStart = performance.now();
    this.renderFromDisplayList(displayList);
    const renderTime = performance.now() - renderStart;

    // Update render statistics
    const endTime = performance.now();
    this.renderStats.lastRenderTime = endTime - startTime;
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
    }

    // Measure lyrics syllables ACROSS ALL LINES (done separately to ensure they're captured)
    // Measure syllables with their trailing spaces combined (as they'll be rendered)
    for (const line of doc.lines) {
      if (line.lyrics && line.lyrics.trim()) {
        const syllables = this.extractSyllablesSimple(line.lyrics);
        const lyricFontSize = BASE_FONT_SIZE * 0.5; // Match actual rendering (8px)

        // Combine syllables with following spaces
        let i = 0;
        while (i < syllables.length) {
          let text = syllables[i];
          i++;

          // Append any following spaces
          while (i < syllables.length && !syllables[i].trim()) {
            text += '\u00A0'; // Append nbsp
            i++;
          }

          // Measure the combined text
          const span = document.createElement('span');
          span.style.cssText = `
            font-size: ${lyricFontSize}px;
            font-family: 'Segoe UI', 'Helvetica Neue', system-ui, sans-serif;
            font-style: italic;
          `;
          span.textContent = text;
          temp.appendChild(span);
          syllableWidths.push(span.getBoundingClientRect().width);
          temp.removeChild(span);
        }
      }
    }

    document.body.removeChild(temp);

    return { cellWidths, syllableWidths };
  }

  /**
   * Extract syllables from lyrics string (simple version for measurement)
   * Splits on whitespace and hyphens, PRESERVING spaces
   *
   * @param {string} lyrics - Lyrics string
   * @returns {string[]} Array of syllables
   */
  extractSyllablesSimple(lyrics) {
    if (!lyrics) return [];

    const syllables = [];
    let currentWord = '';

    for (let i = 0; i < lyrics.length; i++) {
      const char = lyrics[i];

      if (/\s/.test(char)) {
        // Whitespace - finish current word and add space
        if (currentWord) {
          this.addSyllablesFromWord(currentWord, syllables);
          currentWord = '';
        }
        syllables.push(char); // Add the space character
      } else if (char === '-') {
        // Hyphen - add current part with hyphen
        if (currentWord) {
          syllables.push(currentWord + '-');
          currentWord = '';
        }
      } else {
        // Regular character
        currentWord += char;
      }
    }

    // Add remaining word
    if (currentWord) {
      this.addSyllablesFromWord(currentWord, syllables);
    }

    return syllables;
  }

  /**
   * Helper to add syllables from a word (handles hyphens within word)
   */
  addSyllablesFromWord(word, syllables) {
    const parts = word.split(/(-)/);
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (part === '') continue;

      if (part === '-') {
        // Skip standalone hyphens, they're handled in main loop
        continue;
      } else if (i < parts.length - 1 && parts[i + 1] === '-') {
        syllables.push(part + '-');
        i++; // Skip the hyphen
      } else {
        syllables.push(part);
      }
    }
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

    return characterData;
  }

  /**
   * Render document from DisplayList returned by Rust
   * Pure DOM rendering with no layout calculations
   *
   * @param {Object} displayList - DisplayList from Rust computeLayout
   */
  renderFromDisplayList(displayList) {
    // Render header if present
    if (displayList.header) {
      this.renderHeaderFromDisplayList(displayList.header);
    }

    // Render each line from DisplayList
    displayList.lines.forEach((renderLine, lineIdx) => {
      const lineElement = this.renderLineFromDisplayList(renderLine);
      this.element.appendChild(lineElement);
    });

    // Render arcs (slurs and beat loops) using SVG overlay (after all cells are positioned)
    this.arcRenderer.render(displayList);

    // Update arc counts in stats
    this.renderStats.slursRendered = this.arcRenderer.slurPaths.size;
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

    // Title display disabled - only show composer if present

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

    // Get line index from renderLine
    const lineIndex = renderLine.line_index;

    // Render cells with new DOM structure
    // Structure: cell-container > (cell-content > (cell-char + octave-dot) + cell-text)
    renderLine.cells.forEach((cellData, idx) => {
      // Create pitch span (the actual note character)
      const cellChar = document.createElement('span');
      // Filter out slur and beat-loop classes - these go on cell-container only
      const cellCharClasses = cellData.classes.filter(cls =>
        !cls.includes('slur-') && !cls.includes('beat-loop-')
      );
      cellChar.className = cellCharClasses.join(' ');
      cellChar.textContent = cellData.char === ' ' ? '\u00A0' : cellData.char;

      // Detect multi-character barlines for CSS overlay
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

        if (nextIsBarline && nextIsContinuation) {
          const pattern = cellData.char + nextCell.char;
          if (pattern === '|:') {
            cellChar.classList.add('repeat-left-start');
          } else if (pattern === ':|') {
            cellChar.classList.add('repeat-right-start');
          } else if (pattern === '||') {
            cellChar.classList.add('double-bar-start');
          }
        }
      }

      cellChar.style.cssText = `
        display: inline-block;
        position: relative;
      `;

      // Set data attributes on cell-char
      if (cellData.dataset) {
        if (cellData.dataset instanceof Map) {
          for (const [key, value] of cellData.dataset.entries()) {
            cellChar.dataset[key] = value;
          }
        } else {
          for (const [key, value] of Object.entries(cellData.dataset)) {
            cellChar.dataset[key] = value;
          }
        }
      }

      // Add event handlers
      let cellIndex = idx;
      if (cellData.dataset) {
        if (cellData.dataset instanceof Map) {
          cellIndex = parseInt(cellData.dataset.get('cellIndex'));
        } else {
          cellIndex = parseInt(cellData.dataset.cellIndex);
        }
      }
      const cell = this.theDocument.lines[lineIndex].cells[cellIndex];

      cellChar.addEventListener('click', (e) => {
        e.stopPropagation();
        this.handleCellClick(cell, e);
      });

      cellChar.addEventListener('mouseenter', () => {
        this.handleCellHover(cell, true);
      });

      cellChar.addEventListener('mouseleave', () => {
        this.handleCellHover(cell, false);
      });

      // Create octave-dot span if needed (real DOM element, not pseudo-element)
      const octaveDot = document.createElement('span');
      octaveDot.className = 'cell-modifier octave-dot';
      const octaveValue = cellChar.dataset.octave;

      if (octaveValue && octaveValue !== '0') {
        if (octaveValue === '1') {
          octaveDot.textContent = '•';
        } else if (octaveValue === '2') {
          octaveDot.textContent = '••';
        } else if (octaveValue === '-1') {
          octaveDot.textContent = '•';
        } else if (octaveValue === '-2') {
          octaveDot.textContent = '••';
        }

        // Add letter-spacing for double dots
        const letterSpacing = (octaveValue === '2' || octaveValue === '-2') ? 'letter-spacing: 2px;' : '';

        octaveDot.style.cssText = `
          position: absolute;
          font-size: ${SMALL_FONT_SIZE}px;
          color: #000;
          pointer-events: none;
          z-index: 2;
          line-height: 1;
          white-space: nowrap;
          ${letterSpacing}
        `;

        // Position octave dot based on octave value (using em units for scaling)
        if (octaveValue === '1' || octaveValue === '2') {
          // Upper octave: above the cell, relative to font-size
          octaveDot.style.top = '-0.5em';
          octaveDot.style.left = '50%';
          octaveDot.style.transform = 'translateX(-50%)';
        } else {
          // Lower octave: below the cell, relative to font-size
          octaveDot.style.bottom = '-0.35em';
          octaveDot.style.left = '50%';
          octaveDot.style.transform = 'translateX(-50%)';
        }
      }

      // Add octave-dot as child of cell-char (positions relative to the pitch character)
      if (octaveDot.textContent) {
        cellChar.appendChild(octaveDot);
      }

      // Create cell-content wrapper (groups character + modifiers)
      const cellContent = document.createElement('span');
      cellContent.className = 'cell-content';
      cellContent.style.cssText = `
        position: relative;
        display: inline-block;
      `;
      cellContent.appendChild(cellChar);

      // Container width is just the cell width (lyrics are rendered separately at line level)

      // Create cell-container wrapper - positioned at cell location (anchor for slurs/beats)
      const cellContainer = document.createElement('span');
      // Add only cell-container base class plus slur/beat-loop marker classes
      const containerClasses = ['cell-container', ...cellData.classes.filter(cls =>
        cls.includes('slur-') || cls.includes('beat-loop-')
      )];
      cellContainer.className = containerClasses.join(' ');

      cellContainer.style.cssText = `
        position: absolute;
        left: ${cellData.x}px;
        top: ${cellData.y}px;
        width: ${cellData.w}px;
        height: ${cellData.h}px;
      `;
      cellContainer.appendChild(cellContent);

      // Lyrics are rendered at line level with absolute positioning using WASM coordinates
      // (see renderLyrics loop below)

      line.appendChild(cellContainer);
    });

    // Render all lyrics using absolute positions from WASM DisplayList
    // WASM computed X, Y - JavaScript just renders at those exact coordinates
    renderLine.lyrics.forEach(lyric => {
      const lyricSpan = document.createElement('span');
      lyricSpan.className = 'cell-text lyric';
      lyricSpan.textContent = lyric.text;
      const lyricFontSize = BASE_FONT_SIZE * 0.5; // 1/2 of base font size
      lyricSpan.style.cssText = `
        position: absolute;
        left: ${lyric.x}px;
        top: ${lyric.y}px;
        font-size: ${lyricFontSize}px;
        font-family: 'Segoe UI', 'Helvetica Neue', system-ui, sans-serif;
        font-style: italic;
        color: #6b7280;
        pointer-events: none;
        white-space: nowrap;
      `;
      line.appendChild(lyricSpan);
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
    this.element.innerHTML = '';
  }

  /**
   * Handle Cell click
   */
  handleCellClick(charCell, event) {
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
  }



  /**
   * Clear editor element content
   */
  clearElement() {
    // Remove all Cell elements from maps
    this.charCellElements.clear();
    this.beatLoopElements.clear();

    // Clear arcs (slurs and beat loops)
    if (this.arcRenderer) {
      this.arcRenderer.clearAllArcs();
    }

    // Remove all child elements (except SVG overlay)
    const childrenToRemove = Array.from(this.element.children).filter(
      child => !child.classList.contains('arc-overlay')
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
