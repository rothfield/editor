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
      .cell-char {
        padding: 0;
        margin: 0;
        box-sizing: content-box;
      }

      /* Octave dots now use real DOM elements (span.cell-modifier.octave-dot) instead of ::before pseudo-elements */
      /* The octave-dot spans are positioned absolutely within the cell-content */

      /* Symbol elements styled in green */
      .cell-char.kind-symbol {
        color: #22c55e; /* green-500 */
        font-weight: 500;
      }

      /* Accidental symbols using SMuFL music font */
      /* Sharp sign (♯) - SMuFL U+E262 */
      .cell-char.accidental-sharp {
        color: transparent;
      }

      .cell-char.accidental-sharp::after {
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
      .cell-char.accidental-flat {
        color: transparent;
      }

      .cell-char.accidental-flat::after {
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
      .cell-char.repeat-left-start,
      .cell-char.repeat-right-start,
      .cell-char.double-bar-start {
        color: transparent;
      }

      /* Hide continuation cells that are part of multi-char barlines */
      .cell-char.kind-barline[data-continuation="true"] {
        color: transparent;
      }

      /* Left repeat (|:) - SMuFL U+E040 spanning 2 cells */
      .cell-char.repeat-left-start::after {
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
      .cell-char.repeat-right-start::after {
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
      .cell-char.double-bar-start::after {
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
    this.editor.displayList = displayList; // Store in editor for tab display

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
        span.className = 'cell-char';
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
          span.className = 'cell-text lyric text-sm';
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
          span.className = 'cell-char';
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

    // Build map of lyrics by x position for quick lookup
    const lyricsByXPosition = new Map();
    renderLine.lyrics.forEach(lyric => {
      lyricsByXPosition.set(Math.round(lyric.x), lyric);
    });

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

      // Check if there's a lyric for this cell (match by x position)
      const cellCenterX = Math.round(cellData.x + cellData.w / 2);
      const matchingLyric = lyricsByXPosition.get(cellCenterX);

      // Calculate container width to accommodate lyric if present
      let containerWidth = cellData.w;
      if (matchingLyric) {
        // Estimate lyric width (approximate, for sizing the container)
        // Each character is roughly 6-8px in text-sm italic
        const estimatedLyricWidth = matchingLyric.text.length * 7;
        containerWidth = Math.max(cellData.w, estimatedLyricWidth);
      }

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
        width: ${containerWidth}px;
        height: ${cellData.h}px;
      `;
      cellContainer.appendChild(cellContent);

      if (matchingLyric) {
        const lyricSpan = document.createElement('span');
        lyricSpan.className = 'cell-text lyric text-sm';
        lyricSpan.textContent = matchingLyric.text;
        lyricSpan.style.cssText = `
          position: absolute;
          left: 50%;
          top: ${matchingLyric.y - cellData.y}px;
          font-style: italic;
          color: #6b7280;
          transform: translateX(-50%);
          pointer-events: none;
          white-space: nowrap;
        `;
        cellContainer.appendChild(lyricSpan);
        lyricsByXPosition.delete(cellCenterX); // Mark as used
      }

      line.appendChild(cellContainer);
    });

    // Render any remaining lyrics that didn't match a cell
    // (Now handled by WASM with assigned=false field)
    lyricsByXPosition.forEach(lyric => {
      const span = document.createElement('span');
      span.className = 'cell-text lyric text-sm';
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
