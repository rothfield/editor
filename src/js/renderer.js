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
  constructor(editorElement, editor, options = {}) {
    this.element = editorElement;
    this.editor = editor; // Store reference to editor instance
    this.charCellElements = new Map();
    this.beatLoopElements = new Map();
    this.theDocument = null;
    this.renderCache = new Map();

    // Measurement caching
    this.cachedCellWidths = [];
    this.cachedCharWidths = [];
    this.lastDocumentCellCount = 0;

    // Configuration options
    this.options = {
      skipBeatLoops: options.skipBeatLoops || false,
      ...options
    };

    // Performance metrics
    this.renderStats = {
      cellsRendered: 0,
      beatsRendered: 0,
      slursRendered: 0,
      lastRenderTime: 0
    };

    this.setupBeatLoopStyles(); // Sets up octave dots CSS

    // Initialize arc renderer (for slurs and beat loops)
    this.arcRenderer = new ArcRenderer(this.element, { skipBeatLoops: this.options.skipBeatLoops });
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
        font-size: ${BASE_FONT_SIZE}px;
      }

      /* Octave dots now use real DOM elements (span.cell-modifier.octave-dot) instead of ::before pseudo-elements */
      /* The octave-dot spans are positioned absolutely within the cell-content */

      /* Symbol elements styled in green */
      .char-cell.kind-symbol {
        color: #22c55e; /* green-500 */
        font-weight: 500;
      }

      /* Hide pitch continuation cells (raw '#', 'b' characters that are part of accidentals) */
      .char-cell.pitch-continuation {
        color: transparent;
      }

      /* ===== ACCIDENTAL RENDERING (WASM-FIRST ARCHITECTURE) ===== */

      /* Pitched elements with accidentals: base character + accidental symbol rendered with CSS ::after */
      .char-cell.kind-pitched {
        font-family: 'NotationMonoDotted', monospace;
        position: relative;
      }

      /* Accidentals are now rendered as single pre-composed glyphs from NotationMonoDotted font */
      /* The character itself includes the accidental marker - no CSS ::after needed */

      /* All barline overlays using SMuFL music font */
      /* Hide underlying ASCII text and show fancy glyph overlay */
      .char-cell.repeat-left-start,
      .char-cell.repeat-right-start,
      .char-cell.double-bar-start,
      .char-cell.single-bar {
        color: transparent;
      }

      /* Hide continuation cells that are part of multi-char barlines */
      .char-cell.kind-barline[data-continuation="true"] {
        color: transparent;
      }

      /* Base styles for all SMuFL barline glyphs */
      .char-cell.repeat-left-start::after,
      .char-cell.repeat-right-start::after,
      .char-cell.double-bar-start::after,
      .char-cell.single-bar::after {
        font-family: 'Bravura', serif;
        position: absolute;
        left: 0;
        top: ${BASE_FONT_SIZE * 0.75}px;
        transform: translateY(-50%);
        color: #000;
        font-size: ${BRAVURA_FONT_SIZE * 1.2}px;
        line-height: 1;
        pointer-events: none;
        z-index: 4;
      }

      /* Left repeat (|:) - SMuFL U+E040 spanning 2 cells */
      .char-cell.repeat-left-start::after {
        content: '\uE040';
        width: 200%;
        text-align: left;
      }

      /* Right repeat (:|) - SMuFL U+E041 spanning 2 cells */
      .char-cell.repeat-right-start::after {
        content: '\uE041';
        width: 200%;
        text-align: left;
      }

      /* Double barline (||) - SMuFL U+E031 spanning 2 cells */
      .char-cell.double-bar-start::after {
        content: '\uE031';
        width: 200%;
        text-align: left;
      }

      /* Single barline (|) - SMuFL U+E030 */
      .char-cell.single-bar::after {
        content: '\uE030';
        width: 100%;
        text-align: center;
      }

      /* Current line border */
      .notation-line.current-line {
        outline: 2px solid #3b82f6; /* blue-500 */
        outline-offset: -2px;
        border-radius: 4px;
        background-color: rgba(59, 130, 246, 0.05); /* very subtle blue tint */
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Render entire document using Rust layout engine + thin JS DOM layer
   * @param {Object} doc - The document to render
   * @param {number[]} dirtyLineIndices - Optional array of line indices to render (incremental update)
   */
  renderDocument(doc, dirtyLineIndices = null) {
    const startTime = performance.now();

    console.warn(`🚀 renderDocument called with ${doc.lines?.length || 0} lines, dirty: ${dirtyLineIndices}`);

    this.theDocument = doc;

    // IMPORTANT: Save scroll position BEFORE clearing element
    // Clearing the element children can cause the browser to reset parent scroll to 0,0
    const scrollContainer = document.getElementById('editor-container');
    const savedScrollLeft = scrollContainer?.scrollLeft ?? 0;
    const savedScrollTop = scrollContainer?.scrollTop ?? 0;

    // Only clear if doing full render (no dirty lines specified)
    if (dirtyLineIndices === null) {
      // Clear previous content
      this.clearElement();

      if (!doc.lines || doc.lines.length === 0) {
        this.showEmptyState();
        return;
      }
    }

    // STEP 1: Measure all widths (JS-only, native DOM)
    const measureStart = performance.now();
    const measurements = this.measureAllWidths(doc);

    // Also measure character widths for cursor positioning
    this.characterWidthData = this.measureCharacterWidths(doc);

    const measureTime = performance.now() - measureStart;
    console.log(`⏱️ Measurement time: ${measureTime.toFixed(2)}ms`);

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
      ornament_edit_mode: this.editor.wasmModule.getOrnamentEditMode(doc),
    };

    console.log(`🎨 Layout config ornament_edit_mode: ${config.ornament_edit_mode}`);

    const displayList = this.editor.wasmModule.computeLayout(doc, config);
    const layoutTime = performance.now() - layoutStart;
    console.log(`⏱️ Layout time: ${layoutTime.toFixed(2)}ms`);

    // Cache DisplayList for cursor positioning
    this.displayList = displayList;
    this.editor.displayList = displayList; // Store in editor for tab display

    // STEP 3: Render from DisplayList (fast native JS DOM)
    const renderStart = performance.now();
    this.renderFromDisplayList(displayList, savedScrollLeft, savedScrollTop, dirtyLineIndices);
    const renderTime = performance.now() - renderStart;
    console.log(`⏱️ DOM render time: ${renderTime.toFixed(2)}ms`);

    // Ornaments are now rendered from DisplayList in renderFromDisplayList()

    // Update render statistics
    const endTime = performance.now();
    this.renderStats.lastRenderTime = endTime - startTime;
  }

  /**
   * Measure all cell widths and syllable widths for the document
   * This is done in JavaScript using temporary DOM elements
   * Uses caching to avoid re-measuring unchanged cells
   *
   * @param {Object} doc - The document to measure
   * @returns {Object} {cellWidths: number[], syllableWidths: number[]}
   */
  measureAllWidths(doc) {
    const cellWidths = [];
    const syllableWidths = [];

    // Calculate total cell count
    let totalCells = 0;
    for (const line of doc.lines) {
      totalCells += line.cells.length;
    }

    // Check if we can reuse cached measurements
    const canUseCache = (
      this.cachedCellWidths.length === totalCells &&
      this.lastDocumentCellCount === totalCells
    );

    if (canUseCache) {
      console.log(`✨ Using cached cell widths (${totalCells} cells)`);
      return {
        cellWidths: [...this.cachedCellWidths], // Return copy
        syllableWidths: [] // Syllables are rarely used, skip for now
      };
    }

    console.log(`📏 Measuring ${totalCells} cells (cache miss)`);

    // Create temporary invisible container for measurements
    const temp = document.createElement('div');
    temp.style.cssText = 'position:absolute; left:-9999px; visibility:hidden; pointer-events:none;';
    document.body.appendChild(temp);

    // OPTIMIZATION: Batch DOM operations to avoid forced layouts
    // First pass: Create all spans and add to DOM
    const spans = [];

    for (const line of doc.lines) {
      for (const cell of line.cells) {
        if (cell.continuation && cell.kind.name !== 'text') {
          // Continuation cells: use computed width, no need to measure
          cellWidths.push(BASE_FONT_SIZE * 0.1);
          spans.push(null); // Placeholder
        } else {
          const span = document.createElement('span');
          span.className = 'char-cell';
          span.textContent = cell.char === ' ' ? '\u00A0' : cell.char;

          // Apply fonts based on cell kind
          if (cell.kind && cell.kind.name === 'text') {
            // Text cells use Inter at reduced size
            span.style.fontSize = `${BASE_FONT_SIZE * 0.6}px`; // 19.2px
            span.style.fontFamily = "'Inter', 'Segoe UI', 'Helvetica Neue', system-ui, sans-serif";
          } else if (cell.kind && (cell.kind.name === 'pitched_element' || cell.kind.name === 'unpitched_element')) {
            // Pitch and dash cells always use NotationMonoDotted
            span.style.fontFamily = "'NotationMonoDotted', 'Inter'";
          }

          temp.appendChild(span);
          spans.push(span);
          cellWidths.push(0); // Placeholder, will measure next
        }
      }
    }

    // Second pass: Measure all at once (single layout pass)
    let widthIndex = 0;
    for (let i = 0; i < spans.length; i++) {
      if (spans[i] !== null) {
        cellWidths[i] = spans[i].getBoundingClientRect().width;
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

    // Cache the measurements
    this.cachedCellWidths = [...cellWidths];
    this.lastDocumentCellCount = totalCells;

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

    // OPTIMIZATION: Batch all spans first, then measure
    const allSpans = [];
    const cellMetadata = [];

    let cellIndex = 0;
    for (const line of doc.lines) {
      for (const cell of line.cells) {
        const charWidths = [];
        const spans = [];

        // Measure each character in the cell's glyph
        if (cell.continuation && cell.kind.name !== 'text') {
          // Continuation cells with minimal width (for accidentals like #, b)
          for (const char of cell.char) {
            charWidths.push(BASE_FONT_SIZE * 0.1);
            spans.push(null);
          }
        } else {
          // Normal cells: create spans for measurement
          // Cache the kind check once per cell (not per character!)
          const isTextCell = cell.kind && cell.kind.name === 'text';
          const fontSize = isTextCell ? `${BASE_FONT_SIZE * 0.6}px` : null;
          const fontFamily = isTextCell ? "'Inter', 'Segoe UI', 'Helvetica Neue', system-ui, sans-serif" : null;

          for (const char of cell.char) {
            const span = document.createElement('span');
            span.className = 'char-cell';
            span.textContent = char === ' ' ? '\u00A0' : char;

            // Apply proportional font and reduced size if this is a text cell
            if (fontSize) {
              span.style.fontSize = fontSize;
            }
            if (fontFamily) {
              span.style.fontFamily = fontFamily;
            }

            temp.appendChild(span);
            spans.push(span);
            charWidths.push(0); // Placeholder
          }
        }

        cellMetadata.push({
          cellIndex,
          cellCol: cell.col,
          glyph: cell.char,
          charWidths,
          spans
        });

        cellIndex++;
      }
    }

    // Measure all spans at once (single layout pass)
    for (const meta of cellMetadata) {
      for (let i = 0; i < meta.spans.length; i++) {
        if (meta.spans[i] !== null) {
          meta.charWidths[i] = meta.spans[i].getBoundingClientRect().width;
        }
      }

      // Add to final result (without spans)
      characterData.push({
        cellIndex: meta.cellIndex,
        cellCol: meta.cellCol,
        glyph: meta.glyph,
        charWidths: meta.charWidths
      });
    }

    document.body.removeChild(temp);

    return characterData;
  }

  /**
   * Render document from DisplayList returned by Rust
   * Pure DOM rendering with no layout calculations
   *
   * @param {Object} displayList - DisplayList from Rust computeLayout
   * @param {number} savedScrollLeft - Saved scroll left position
   * @param {number} savedScrollTop - Saved scroll top position
   * @param {number[]} dirtyLineIndices - Optional array of line indices to render (incremental)
   */
  renderFromDisplayList(displayList, savedScrollLeft = 0, savedScrollTop = 0, dirtyLineIndices = null) {
    // Find the actual scroll container - explicitly get #editor-container
    const scrollContainer = document.getElementById('editor-container');

    if (!scrollContainer) {
      console.error('Scroll container #editor-container not found!');
    }

    console.log(`[Renderer] Using saved scroll position: left=${savedScrollLeft}, top=${savedScrollTop}`);
    console.log(`[Renderer] Incremental render:`, dirtyLineIndices);

    // INCREMENTAL RENDERING: Only update dirty lines
    if (dirtyLineIndices !== null && dirtyLineIndices.length > 0) {
      // Incremental update - replace only dirty lines
      dirtyLineIndices.forEach(lineIndex => {
        if (lineIndex >= displayList.lines.length) {
          console.warn(`[Renderer] Line index ${lineIndex} out of bounds`);
          return;
        }

        const renderLine = displayList.lines[lineIndex];
        const newLineElement = this.renderLineFromDisplayList(renderLine, displayList);

        // Find and replace existing line element
        const existingLineElement = this.element.querySelector(`.notation-line[data-line="${lineIndex}"]`);
        if (existingLineElement) {
          existingLineElement.replaceWith(newLineElement);
        } else {
          // Line doesn't exist yet (new line created), append it
          this.element.appendChild(newLineElement);
        }
      });

      // Update arcs (slurs and beat loops) - full re-render for now
      this.arcRenderer.render(displayList);
      this.renderStats.slursRendered = this.arcRenderer.slurPaths.size;

      return; // Skip full render
    }

    // FULL RENDERING: Destroy and rebuild everything
    // Clear previous render to avoid duplicate event handlers
    // IMPORTANT: Preserve the arc overlay SVG when clearing
    const arcOverlaySvg = this.arcRenderer?.svgOverlay;
    this.element.innerHTML = '';

    // Re-append the arc overlay SVG after clearing
    if (arcOverlaySvg && arcOverlaySvg.parentNode !== this.element) {
      this.element.appendChild(arcOverlaySvg);
    }

    // Render header if present
    if (displayList.header) {
      this.renderHeaderFromDisplayList(displayList.header);
    }

    // Render each line from DisplayList
    displayList.lines.forEach((renderLine, lineIdx) => {
      const lineElement = this.renderLineFromDisplayList(renderLine, displayList);
      this.element.appendChild(lineElement);
    });

    // Render arcs (slurs and beat loops) using SVG overlay (after all cells are positioned)
    this.arcRenderer.render(displayList);

    // Update arc counts in stats
    this.renderStats.slursRendered = this.arcRenderer.slurPaths.size;

    // Restore scroll position immediately after rendering
    if (scrollContainer && (savedScrollLeft !== 0 || savedScrollTop !== 0)) {
      // Set scroll position synchronously
      scrollContainer.scrollLeft = savedScrollLeft;
      scrollContainer.scrollTop = savedScrollTop;

      console.log(`[Renderer] Restored scroll to: left=${scrollContainer.scrollLeft}, top=${scrollContainer.scrollTop}`);

      // Also restore after next frame as backup for browser quirks
      requestAnimationFrame(() => {
        if (scrollContainer) {
          scrollContainer.scrollLeft = savedScrollLeft;
          scrollContainer.scrollTop = savedScrollTop;
        }
      });
    }
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
      titleElement.setAttribute('data-testid', 'document-title');
      titleElement.textContent = title;
      titleElement.style.cssText = `
        text-align: center;
        font-size: ${BASE_FONT_SIZE * 0.8}px;
        font-weight: bold;
        color: #1f2937;
        width: 100%;
        margin-bottom: 8px;
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
        font-size: ${BASE_FONT_SIZE * 0.6}px;
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
  renderLineFromDisplayList(renderLine, displayList) {
    const line = document.createElement('div');

    // Check if this is the current line (where the cursor is)
    const currentLineIndex = this.editor?.theDocument?.state?.cursor?.line ?? -1;
    const isCurrentLine = renderLine.line_index === currentLineIndex;

    line.className = isCurrentLine ? 'notation-line current-line' : 'notation-line';
    line.dataset.line = renderLine.line_index;
    line.style.cssText = `position:relative; height:${renderLine.height}px; width:100%;`;

    // Calculate cumulative Y offset for this line (sum of all previous line heights)
    let lineStartY = 0;
    if (displayList && displayList.lines) {
      for (let i = 0; i < renderLine.line_index; i++) {
        lineStartY += displayList.lines[i].height;
      }
    }
    line.dataset.lineStartY = lineStartY;

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

    // T028: Collect ornamental cells for floating rendering (render filtering)
    const ornamentalCells = [];

    // Render cells with new DOM structure
    // Structure: cell-container > (cell-content > (cell-char + octave-dot) + cell-text)
    renderLine.cells.forEach((cellData, idx) => {
      // Get cellIndex from dataset
      let cellIndex = idx;
      if (cellData.dataset) {
        if (cellData.dataset instanceof Map) {
          cellIndex = parseInt(cellData.dataset.get('cellIndex'));
        } else {
          cellIndex = parseInt(cellData.dataset.cellIndex);
        }
      }
      const cell = this.theDocument.lines[lineIndex].cells[cellIndex];

      // T028: Filter rhythm-transparent cells from main rendering flow
      if (cell && cell.ornament_indicator && cell.ornament_indicator.name !== 'none') {
        // Collect ornamental cell for floating rendering
        ornamentalCells.push({ cellData, cellIndex, cell });
        return; // Skip normal rendering for this cell
      }
      // Create pitch span (the actual note character)
      const cellChar = document.createElement('span');
      // Filter out slur and beat-loop classes - these go on cell-container only
      const cellCharClasses = cellData.classes.filter(cls =>
        !cls.includes('slur-') && !cls.includes('beat-loop-')
      );
      cellChar.className = cellCharClasses.join(' ');
      cellChar.textContent = cellData.char === ' ' ? '\u00A0' : cellData.char;

      // Apply barline glyph class from Rust
      if (cellData.barline_type) {
        cellChar.classList.add(cellData.barline_type);
      }

      cellChar.style.cssText = `
        display: inline-block;
        position: relative;
      `;

      // Apply fonts based on cell kind
      if (cell && cell.kind && cell.kind.name === 'text') {
        // Text cells use Inter at reduced size
        cellChar.style.fontSize = `${BASE_FONT_SIZE * 0.6}px`;
        cellChar.style.fontFamily = "'Inter', 'Segoe UI', 'Helvetica Neue', system-ui, sans-serif";
        cellChar.style.transform = 'translateY(40%)';
        cellChar.classList.add('text-cell');
      } else if (cell && cell.kind && (cell.kind.name === 'pitched_element' || cell.kind.name === 'unpitched_element')) {
        // Pitch and dash cells always use NotationMonoDotted
        cellChar.style.fontFamily = "'NotationMonoDotted', 'Inter'";
      }

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

      // Mouse events are now handled by MouseHandler in editor.js
      // No cell-level handlers needed anymore

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

      // Convert absolute Y to relative Y within this line
      const relativeY = cellData.y - lineStartY;

      cellContainer.style.cssText = `
        position: absolute;
        left: ${cellData.x}px;
        top: ${relativeY}px;
        width: ${cellData.w}px;
        height: ${cellData.h}px;
      `;
      cellContainer.appendChild(cellContent);

      // Lyrics are rendered at line level with absolute positioning using WASM coordinates
      // (see renderLyrics loop below)

      line.appendChild(cellContainer);
    });

    // Render all lyrics using positions from WASM DisplayList
    // Convert absolute Y to relative Y within this line
    renderLine.lyrics.forEach(lyric => {
      const lyricSpan = document.createElement('span');
      lyricSpan.className = 'cell-text lyric';
      lyricSpan.textContent = lyric.text;
      const lyricFontSize = BASE_FONT_SIZE * 0.5; // 1/2 of base font size
      const lyricRelativeY = lyric.y - lineStartY;
      lyricSpan.style.cssText = `
        position: absolute;
        left: ${lyric.x}px;
        top: ${lyricRelativeY}px;
        font-size: ${lyricFontSize}px;
        font-family: 'Segoe UI', 'Helvetica Neue', system-ui, sans-serif;
        font-style: italic;
        color: #6b7280;
        pointer-events: none;
        white-space: nowrap;
      `;
      line.appendChild(lyricSpan);
    });

    // T029/T066-T069: Render ornamental cells (inline when edit mode ON, floating when OFF)
    // These are cells with ornament indicators (rhythm-transparent)

    // T066: Get edit mode state from WASM (WASM-first architecture)
    const ornamentEditMode = this.editor.wasmModule.getOrnamentEditMode(this.theDocument);

    ornamentalCells.forEach(({ cellData, cellIndex, cell }) => {
      const ornamentChar = document.createElement('span');

      // Apply CSS classes including ornament-cell
      const ornamentClasses = cellData.classes.filter(cls =>
        !cls.includes('slur-') && !cls.includes('beat-loop-')
      );
      ornamentChar.className = ornamentClasses.join(' ');
      ornamentChar.textContent = cellData.char === ' ' ? '\u00A0' : cellData.char;

      // Set data attributes for testing
      if (cellData.dataset) {
        if (cellData.dataset instanceof Map) {
          for (const [key, value] of cellData.dataset.entries()) {
            ornamentChar.dataset[key] = value;
          }
        } else {
          for (const [key, value] of Object.entries(cellData.dataset)) {
            ornamentChar.dataset[key] = value;
          }
        }
      }

      // T067: Add data-edit-mode attribute for CSS styling
      ornamentChar.dataset.editMode = ornamentEditMode ? 'true' : 'false';

      // Convert absolute Y to relative Y within this line
      const ornamentRelativeY = cellData.y - lineStartY;

      // T069: Conditional rendering based on edit mode
      if (ornamentEditMode) {
        // Edit mode ON: Render inline with normal width and interactivity
        ornamentChar.style.cssText = `
          position: absolute;
          left: ${cellData.x}px;
          top: ${ornamentRelativeY}px;
          width: ${cellData.w}px;
          height: ${cellData.h}px;
          pointer-events: auto;
          z-index: 1;
        `;

        // Mouse events are now handled by MouseHandler in editor.js
        // No cell-level handlers needed anymore
      } else {
        // Edit mode OFF: Zero-width floating layout with absolute positioning
        ornamentChar.style.cssText = `
          position: absolute;
          left: ${cellData.x}px;
          top: ${ornamentRelativeY}px;
          width: 0;
          height: ${cellData.h}px;
          pointer-events: none;
          z-index: 5;
        `;
      }

      line.appendChild(ornamentChar);
    });

    // Render ornaments when ornament_edit_mode is OFF
    // Ornaments are positioned to the RIGHT and UP (70%) from anchor notes, scaled smaller
    if (renderLine.ornaments && renderLine.ornaments.length > 0) {
      renderLine.ornaments.forEach(ornament => {
        const ornamentSpan = document.createElement('span');
        ornamentSpan.className = 'char-cell ' + (ornament.classes || []).join(' ');
        ornamentSpan.textContent = ornament.text;
        ornamentSpan.dataset.testid = 'ornament-cell'; // For E2E tests
        const ornamentRelativeY = ornament.y - lineStartY;
        ornamentSpan.style.cssText = `
          position: absolute;
          left: ${ornament.x}px;
          top: ${ornamentRelativeY}px;
          font-size: ${BASE_FONT_SIZE * 0.6}px;
          font-family: 'NotationMonoDotted', 'Inter', monospace;
          color: #1e40af;
          pointer-events: none;
          white-space: nowrap;
        `;
        line.appendChild(ornamentSpan);
      });
    }

    // Render tala (positioned characters from DisplayList)
    // Convert absolute Y to relative Y within this line
    renderLine.tala.forEach(talaChar => {
      const span = document.createElement('span');
      span.className = 'tala-char text-xs';
      span.textContent = talaChar.text;
      const talaRelativeY = talaChar.y - lineStartY;
      span.style.cssText = `
        position: absolute;
        left: ${talaChar.x}px;
        top: ${talaRelativeY}px;
        transform: translateX(-50%);
        color: #4b5563;
        font-weight: 600;
        pointer-events: none;
      `;
      line.appendChild(span);
    });

    // Octave dots are no longer rendered as separate overlay elements
    // They are now embedded in font glyphs via glyph substitution in RenderCell

    return line;
  }

  /**
   * Show empty state when no content
   */
  showEmptyState() {
    this.element.innerHTML = '';
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
