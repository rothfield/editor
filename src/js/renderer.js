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
  SMUFL_FONT_SIZE,
  SMUFL_VERTICAL_OFFSET,
  LEFT_MARGIN_PX,
  CELL_Y_OFFSET,
  CELL_HEIGHT,
  BEAT_LOOP_OFFSET_BELOW,
  BEAT_LOOP_HEIGHT,
  SLUR_OFFSET_ABOVE
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
      fontMapping: options.fontMapping || null,
      ...options
    };

    // Performance metrics
    this.renderStats = {
      cellsRendered: 0,
      beatsRendered: 0,
      slursRendered: 0,
      lastRenderTime: 0
    };

    // System grouping (groups of parts bracketed together)
    this.systemBlocks = []; // Array of {startLineIdx, endLineIdx, lines: []}

    this.setupBeatLoopStyles(); // Sets up octave dots CSS and barline styles

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
      /* ===== WEB FONTS ===== */
      /* Load NotationFont (derived from Noto Music) for all pitch + music symbols */
      @font-face {
        font-family: 'NotationFont';
        src: url('/static/fonts/NotationFont.ttf') format('truetype');
        font-weight: normal;
        font-style: normal;
      }

      /* Base cell styles */
      .char-cell {
        padding: 0;
        margin: 0;
        box-sizing: content-box;
        font-size: ${BASE_FONT_SIZE}px;
      }

      /* Symbol elements styled in green */
      .char-cell.kind-symbol {
        color: #22c55e; /* green-500 */
        font-weight: 500;
      }

      /* Pitch continuation cells contain non-breaking space (invisible but takes space) */
      .char-cell.pitch-continuation {
        /* No special styling needed - contains U+00A0 (non-breaking space) */
      }

      /* ===== ACCIDENTAL RENDERING (WASM-FIRST ARCHITECTURE) ===== */
      /* Architecture: DOM contains typed text (textual truth), CSS overlay shows composite glyph (visual rendering)
         See CLAUDE.md "Multi-Character Glyph Rendering: Textual Mental Model with Visual Overlays"
      */

      /* Pitched elements: rendered with pre-composed accidental glyphs from NotationFont */
      .char-cell.kind-pitched {
        font-family: 'NotationFont', monospace;
      }

      /* Multi-character glyphs with accidentals (e.g., 1#, 2b, 1##, 1bb)
         Hide the typed text, show composite glyph via overlay
      */
      .char-cell.has-accidental {
        color: transparent;
        position: relative;
      }

      /* CSS overlay for accidental composite glyphs
         The composite glyph codepoint is set via CSS custom property (--composite-glyph)
         by JavaScript during rendering (see renderLineFromDisplayList)
      */
      .char-cell.has-accidental::after {
        content: var(--composite-glyph, '');
        position: absolute;
        left: 0;
        top: 0;
        font-family: 'NotationFont', monospace;
        color: #000;
        pointer-events: none;
        z-index: 2;
        white-space: nowrap;
      }

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
      /* Using NotationFont (derived from Noto Music) which includes barline glyphs */
      .char-cell.repeat-left-start::after,
      .char-cell.repeat-right-start::after,
      .char-cell.double-bar-start::after,
      .char-cell.single-bar::after {
        font-family: 'NotationFont';
        position: absolute;
        left: 0;
        top: ${BASE_FONT_SIZE * 0.75}px;
        transform: translateY(-50%);
        color: #000;
        font-size: ${SMUFL_FONT_SIZE * 1.2}px;
        line-height: 1;
        pointer-events: none;
        z-index: 4;
      }

      /* Barline styles generated from font mapping */

      /* Current line border */
      .notation-line.current-line {
        outline: 2px solid #3b82f6; /* blue-500 */
        outline-offset: -2px;
        border-radius: 4px;
        background-color: rgba(59, 130, 246, 0.05); /* very subtle blue tint */
      }

      /* ===== SYSTEM GROUP BRACKETS ===== */
      /* Container for system group bracket SVG overlay */
      #system-group-brackets-svg {
        position: absolute;
        left: 0;
        top: 0;
        width: 100%;
        pointer-events: none;
        z-index: 1;
      }
    `;
    document.head.appendChild(style);

    // Add dynamic barline styles from font mapping
    this.addBarlineStyles();
  }

  /**
   * Generate barline CSS from font mapping (single source of truth)
   */
  addBarlineStyles() {
    const mapping = this.options.fontMapping;
    if (!mapping || !mapping.symbols) {
      console.warn('Font mapping not available, using fallback barline styles');
      return;
    }

    // Find barline symbols in mapping
    const barlineSymbols = {
      'barlineSingle': { selector: '.char-cell.single-bar', width: '100%', align: 'center' },
      'barlineDouble': { selector: '.char-cell.double-bar-start', width: '200%', align: 'left' },
      'barlineRepeatLeft': { selector: '.char-cell.repeat-left-start', width: '200%', align: 'left' },
      'barlineRepeatRight': { selector: '.char-cell.repeat-right-start', width: '200%', align: 'left' },
      'barlineRepeatBoth': { selector: '.char-cell.repeat-both', width: '200%', align: 'left' }
    };

    let barlineCss = '';
    for (const [symbolName, config] of Object.entries(barlineSymbols)) {
      const symbol = mapping.symbols.find(s => s.name === symbolName);
      if (symbol) {
        // Get codepoint and convert to CSS Unicode escape sequence
        const codepoint = parseInt(symbol.codepoint, 16);
        // CSS Unicode escapes: pad to 6 chars for > 0xFFFF, 4 for < 0xFFFF
        const minPad = codepoint > 0xFFFF ? 6 : 4;
        const codePointHex = codepoint.toString(16).toUpperCase().padStart(minPad, '0');

        barlineCss += `
      /* ${symbolName}: U+${codePointHex} from NotationFont-map.json */
      ${config.selector}::after {
        content: '\\${codePointHex}';
        width: ${config.width};
        text-align: ${config.align};
      }
      `;

        console.log(`✅ Barline style: ${symbolName} -> U+${codePointHex}`);
      } else {
        console.warn(`⚠️ Symbol ${symbolName} not found in font mapping`);
      }
    }

    if (barlineCss) {
      const style = document.createElement('style');
      style.textContent = barlineCss;
      document.head.appendChild(style);
      console.log('✅ Barline styles injected from font mapping');
    }
  }

  /**
   * Compute system blocks from document lines
   * Groups consecutive lines based on new_system flag
   * @param {Array} lines - Document lines
   * @returns {Array} Array of system blocks: [{startLineIdx, endLineIdx, lines: []}]
   */
  computeSystemBlocks(lines) {
    // Check if ANY line requests multi-system grouping
    const hasMultiSystem = lines.some(line => line.new_system);

    // If no lines request multi-system, return empty (no brackets)
    if (!hasMultiSystem) {
      return [];
    }

    const blocks = [];
    let currentBlock = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line.new_system && currentBlock !== null) {
        // Start of a new block - save the current one
        blocks.push(currentBlock);
        currentBlock = { startLineIdx: i, endLineIdx: i, lines: [i] };
      } else if (line.new_system) {
        // First line or explicit new system
        currentBlock = { startLineIdx: i, endLineIdx: i, lines: [i] };
      } else if (currentBlock !== null) {
        // Continue current block
        currentBlock.endLineIdx = i;
        currentBlock.lines.push(i);
      } else {
        // No block started yet and this line doesn't start one
        // Create implicit block for first lines before any new_system=true
        currentBlock = { startLineIdx: i, endLineIdx: i, lines: [i] };
      }
    }

    // Don't forget the last block
    if (currentBlock !== null) {
      blocks.push(currentBlock);
    }

    return blocks;
  }

  /**
   * Render system group brackets (visual grouping in left margin)
   * Calculates Y positions from displayList line heights (pure data computation)
   * @param {Object} displayList - Display list from WASM layout (contains line heights)
   */
  renderSystemGroupBrackets(displayList) {
    // Find or create SVG overlay for brackets
    let svgContainer = document.getElementById('system-group-brackets-svg');
    if (!svgContainer) {
      svgContainer = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svgContainer.id = 'system-group-brackets-svg';
      this.element.parentElement?.insertBefore(svgContainer, this.element);
    }

    // Clear previous brackets
    svgContainer.innerHTML = '';

    if (!this.systemBlocks || this.systemBlocks.length === 0 || !displayList || !displayList.lines) {
      return;
    }

    // Get editor container dimensions
    const editorContainer = document.getElementById('editor-container');
    if (!editorContainer) return;

    const containerRect = editorContainer.getBoundingClientRect();
    const marginWidth = 40; // Width of left margin for bracket
    const bracketX = marginWidth - 15; // Position bracket near right edge of margin

    // Account for editor element offset within container
    const editorOffsetY = this.element.offsetTop;

    // Render bracket for each block with multiple lines
    this.systemBlocks.forEach((block, blockIdx) => {
      if (block.lines.length < 2) {
        // Don't draw bracket for single-line blocks
        return;
      }

      // Get Y coordinates from displayList (computed in WASM)
      // Bracket aligns with .notation-line container borders (not cell content)
      // Add editor offset since SVG is positioned relative to parent container
      const topY = editorOffsetY + displayList.lines[block.startLineIdx].y;
      const endLineHeight = displayList.lines[block.endLineIdx]?.height || 0;
      const bottomY = editorOffsetY + displayList.lines[block.endLineIdx].y + endLineHeight;

      // Validate coordinates
      if (isNaN(topY) || isNaN(bottomY) || topY === undefined || bottomY === undefined) {
        console.warn(`Invalid coordinates for stave block ${blockIdx}: topY=${topY}, bottomY=${bottomY}`);
        return;
      }

      // Create bracket path (curved bracket on the left)
      // Bracket extends from top border of first line to bottom border of last line
      const radius = 8;
      const brackets = `
        <!-- Start curve (extends to top border) -->
        <path d="M ${bracketX} ${topY}
                 Q ${bracketX - radius} ${topY}
                   ${bracketX - radius} ${topY + radius}"
              stroke="#666" stroke-width="2" fill="none" stroke-linecap="round"/>

        <!-- Vertical line -->
        <line x1="${bracketX - radius}" y1="${topY + radius}"
              x2="${bracketX - radius}" y2="${bottomY - radius}"
              stroke="#666" stroke-width="2" stroke-linecap="round"/>

        <!-- End curve (extends to bottom border) -->
        <path d="M ${bracketX - radius} ${bottomY - radius}
                 Q ${bracketX - radius} ${bottomY}
                   ${bracketX} ${bottomY}"
              stroke="#666" stroke-width="2" fill="none" stroke-linecap="round"/>
      `;

      svgContainer.innerHTML += brackets;
    });

    // Ensure SVG has proper dimensions
    svgContainer.setAttribute('width', containerRect.width);
    svgContainer.setAttribute('height', containerRect.height);
    svgContainer.setAttribute('viewBox', `0 0 ${containerRect.width} ${containerRect.height}`);
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

    // Compute system blocks for visual grouping
    this.systemBlocks = this.computeSystemBlocks(doc.lines);
    console.log(`📊 Computed ${this.systemBlocks.length} system blocks`);

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
      slur_offset_above: SLUR_OFFSET_ABOVE,
      beat_loop_offset_below: BEAT_LOOP_OFFSET_BELOW,
      beat_loop_height: BEAT_LOOP_HEIGHT,
    };

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

    // STEP 4: Render system group brackets (visual grouping)
    const bracketsStart = performance.now();
    this.renderSystemGroupBrackets(displayList);
    const bracketsTime = performance.now() - bracketsStart;
    console.log(`⏱️ System bracket render time: ${bracketsTime.toFixed(2)}ms`);

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
            // Text cells use system fonts at reduced size
            span.style.fontSize = `${BASE_FONT_SIZE * 0.6}px`; // 19.2px
            span.style.fontFamily = "'Segoe UI', 'Helvetica Neue', system-ui, sans-serif";
          } else if (cell.kind && (cell.kind.name === 'pitched_element' || cell.kind.name === 'unpitched_element')) {
            // Pitch and dash cells always use NotationFont (from Noto Music)
            span.style.fontFamily = "'NotationFont'";
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
          const fontFamily = isTextCell ? "'Segoe UI', 'Helvetica Neue', system-ui, sans-serif" : null;

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

    // Store absolute Y position (computed in WASM)
    const lineStartY = renderLine.y;
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
        // Text cells use system fonts at reduced size
        cellChar.style.fontSize = `${BASE_FONT_SIZE * 0.6}px`;
        cellChar.style.fontFamily = "'Segoe UI', 'Helvetica Neue', system-ui, sans-serif";
        cellChar.style.transform = 'translateY(40%)';
        cellChar.classList.add('text-cell');
      } else if (cell && cell.kind && (cell.kind.name === 'pitched_element' || cell.kind.name === 'unpitched_element')) {
        // Pitch and dash cells always use NotationFont (from Noto Music)
        cellChar.style.fontFamily = "'NotationFont'";
      }

      // Set data attributes on cell-char
      let compositeGlyphCodepoint = null;
      if (cellData.dataset) {
        if (cellData.dataset instanceof Map) {
          for (const [key, value] of cellData.dataset.entries()) {
            cellChar.dataset[key] = value;
            if (key === 'compositeGlyph') {
              compositeGlyphCodepoint = value;
            }
          }
        } else {
          for (const [key, value] of Object.entries(cellData.dataset)) {
            cellChar.dataset[key] = value;
            if (key === 'compositeGlyph') {
              compositeGlyphCodepoint = value;
            }
          }
        }
      }

      // Set CSS custom property for accidental composite glyph overlay
      // This allows the ::after pseudo-element to display the correct composite glyph
      if (cellChar.classList.contains('has-accidental') && compositeGlyphCodepoint) {
        // Convert codepoint (e.g., "U+E1F0") to actual Unicode character
        // Extract hex value from "U+XXXX" format
        const hexMatch = compositeGlyphCodepoint.match(/U\+([0-9A-Fa-f]+)/);
        if (hexMatch) {
          const codepoint = parseInt(hexMatch[1], 16);
          const glyphChar = String.fromCodePoint(codepoint);
          cellChar.style.setProperty('--composite-glyph', `'${glyphChar}'`);
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

    // T029: Render ornamental cells (zero-width floating layout)
    // These are cells with ornament indicators (rhythm-transparent)

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

      // Convert absolute Y to relative Y within this line
      const ornamentRelativeY = cellData.y - lineStartY;

      // Zero-width floating layout with absolute positioning
      ornamentChar.style.cssText = `
        position: absolute;
        left: ${cellData.x}px;
        top: ${ornamentRelativeY}px;
        width: 0;
        height: ${cellData.h}px;
        pointer-events: none;
        z-index: 5;
      `;

      line.appendChild(ornamentChar);
    });

    // Render ornaments (positioned to the RIGHT and UP from anchor notes)
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
          font-family: 'NotationFont', monospace;
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

    // Note: Octave dots are embedded in NotationFont glyphs (U+E000-U+E0BB range, 4 variants per character)
    // Font rendering handles all octave visualization

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
