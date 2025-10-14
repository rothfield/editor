/**
 * DOM Renderer for Music Notation Editor
 *
 * This class provides DOM-based rendering for Cell elements,
 * beat loops, slurs, and other musical notation components.
 */

import CellRenderer from './cell-renderer.js';

class DOMRenderer {
  constructor(canvasElement, editor) {
    this.canvas = canvasElement;
    this.editor = editor; // Store reference to editor instance
    this.charCellElements = new Map();
    this.beatLoopElements = new Map();
    this.slurElements = new Map();
    this.theDocument = null;
    this.renderCache = new Map();
    this.cellRenderer = new CellRenderer();

    // Performance metrics
    this.renderStats = {
      cellsRendered: 0,
      beatsRendered: 0,
      slursRendered: 0,
      octavesRendered: 0,
      lastRenderTime: 0
    };

    this.setupBeatLoopStyles(); // Sets up beat loops, octave dots, and slur CSS
  }

  /**
     * Setup CSS for beat loop arcs, octave dots, and slurs
     */
  setupBeatLoopStyles() {
    const style = document.createElement('style');
    style.textContent = `
      /* Remove padding/margin from cells to ensure tight fit */
      .char-cell {
        padding: 0;
        margin: 0;
        box-sizing: content-box;
      }

      /* Beat loop arc - first cell has left edge */
      .char-cell.beat-first::after {
        content: '';
        position: absolute;
        left: 0;
        right: 0;
        bottom: -10px; /* 10px below cell */
        height: 5px;
        border-left: 2px solid #666;
        border-bottom: 2px solid #666;
        border-radius: 0 0 0 12px;
        pointer-events: none;
        z-index: 1;
      }

      /* Middle cells only have bottom border */
      .char-cell.beat-middle::after {
        content: '';
        position: absolute;
        left: 0;
        right: 0;
        bottom: -10px;
        height: 5px;
        border-bottom: 2px solid #666;
        pointer-events: none;
        z-index: 1;
      }

      /* Last cell has right edge */
      .char-cell.beat-last::after {
        content: '';
        position: absolute;
        left: 0;
        right: 0;
        bottom: -10px;
        height: 5px;
        border-right: 2px solid #666;
        border-bottom: 2px solid #666;
        border-radius: 0 0 12px 0;
        pointer-events: none;
        z-index: 1;
      }


      /* Octave dots using ::before pseudo-element */
      /* Upper octave: one dot ABOVE cell (outside bbox) */
      .char-cell[data-octave="1"]::before {
        content: '•';
        position: absolute;
        left: 50%;
        top: -10px;
        transform: translateX(-50%);
        font-size: 12px;
        line-height: 1;
        color: #000;
        pointer-events: none;
        z-index: 2;
      }

      /* Upper octave: two dots ABOVE cell (outside bbox) */
      .char-cell[data-octave="2"]::before {
        content: '••';
        position: absolute;
        left: 50%;
        top: -10px;
        transform: translateX(-50%);
        font-size: 12px;
        line-height: 1;
        color: #000;
        letter-spacing: 2px;
        pointer-events: none;
        z-index: 2;
      }

      /* Lower octave: one dot BELOW cell (outside bbox) */
      .char-cell[data-octave="-1"]::before {
        content: '•';
        position: absolute;
        left: 50%;
        bottom: -10px;
        transform: translateX(-50%);
        font-size: 12px;
        line-height: 1;
        color: #000;
        pointer-events: none;
        z-index: 2;
      }

      /* Lower octave: two dots BELOW cell (outside bbox) */
      .char-cell[data-octave="-2"]::before {
        content: '••';
        position: absolute;
        left: 50%;
        bottom: -10px;
        transform: translateX(-50%);
        font-size: 12px;
        line-height: 1;
        color: #000;
        letter-spacing: 2px;
        pointer-events: none;
        z-index: 2;
      }
    `;
    document.head.appendChild(style);
  }


  /**
     * Setup canvas overlay for octave rendering
     */
  setupOctaveCanvas() {
    this.octaveCanvas = document.createElement('canvas');
    this.octaveCanvas.className = 'octave-canvas-overlay';
    this.octaveCanvas.style.position = 'absolute';
    this.octaveCanvas.style.top = '0';
    this.octaveCanvas.style.left = '0';
    this.octaveCanvas.style.pointerEvents = 'none';
    this.octaveCanvas.style.width = '100%';
    this.octaveCanvas.style.height = '100%';
    this.octaveCanvas.style.zIndex = '2'; // Below slurs but above content
    this.octaveCanvas.style.opacity = '1.0'; // Fully opaque for visibility

    // Add CSS for octave dots
    const style = document.createElement('style');
    style.textContent = `
        .octave-canvas-overlay {
        transition: opacity 0.15s ease-in-out;
        }
        .octave-canvas-overlay.animating {
        opacity: 1;
        }
    `;
    document.head.appendChild(style);

    this.canvas.appendChild(this.octaveCanvas);
    this.octaveCtx = this.octaveCanvas.getContext('2d');

    // Set initial canvas size
    this.resizeOctaveCanvas();

    // Add resize listener to keep canvas sized correctly
    window.addEventListener('resize', () => {
      this.resizeOctaveCanvas();
    });
  }


  /**
     * Resize octave canvas to match container
     */
  resizeOctaveCanvas() {
    if (this.octaveCanvas && this.canvas) {
      const rect = this.canvas.getBoundingClientRect();
      this.octaveCanvas.width = rect.width;
      this.octaveCanvas.height = rect.height;

      // Re-render octave markings after resize
      if (this.theDocument) {
        this.renderOctaveMarkings(this.theDocument);
      }
    }
  }

  /**
     * Render entire document
     */
  renderDocument(doc) {
    const startTime = performance.now();

    this.theDocument = doc;

    // Clear previous content
    this.clearCanvas();

    if (!doc.lines || doc.lines.length === 0) {
      this.showEmptyState();
      return;
    }

    // Render doc title at the top
    this.renderDocumentTitle(doc);

    // Render each line
    doc.lines.forEach((line, lineIndex) => {
      this.renderLine(line, lineIndex);
    });

    // Beat loops are now rendered via CSS on cells (no separate elements needed)
    // Slurs need to be rendered as separate divs (can't use ::after because beat loops use it)
    this.renderSlurs(doc);
    // Octave markings are now rendered via CSS (data-octave attribute)

    // Update render statistics
    const endTime = performance.now();
    this.renderStats.lastRenderTime = endTime - startTime;

    console.log(`Document rendered in ${this.renderStats.lastRenderTime.toFixed(2)}ms`);
  }

  /**
     * Show empty state when no content
     */
  showEmptyState() {
    const lineElement = this.getOrCreateLineElement(0);
    lineElement.innerHTML = `
        <div class="text-ui-disabled-text text-sm">
        Click to start entering musical notation...
        </div>
    `;
  }

  /**
     * Render document title at the top of the canvas
     */
  renderDocumentTitle(doc) {
    const title = doc.title;

    if (!title || title === 'Untitled Document') {
      return; // No title to render or default title
    }

    const titleElement = document.createElement('div');
    titleElement.className = 'document-title';
    titleElement.textContent = title;

    // Style the title: centered, larger, bold, with blank line after
    titleElement.style.cssText = `
      text-align: center;
      font-size: 20px;
      font-weight: bold;
      margin-top: 16px;
      margin-bottom: 32px;
      width: 100%;
      display: block;
    `;

    this.canvas.appendChild(titleElement);
  }

  /**
     * Render a single line - simplified to only render main line
     */
  renderLine(line, lineIndex) {
    const lineElement = this.getOrCreateLineElement(lineIndex);

    // Only render the main line (no lanes)
    const mainLine = line.cells;
    const beats = line.beats || [];
    this.renderCells(mainLine, lineIndex, lineElement, beats);

    // Render line label
    if (line.label) {
      this.renderLineLabel(line.label, lineElement);
    }

    // Render lyrics (direct field on line)
    if (line.lyrics) {
      this.renderLyrics(line.lyrics, lineElement);
    }

    // Render tala (direct field on line)
    if (line.tala) {
      this.renderTala(line.tala, lineElement);
    }
  }

  /**
     * Render the cells of a line - simplified (no lanes)
     */
  renderCells(cells, lineIndex, lineElement, beats) {
    // Clear existing content
    lineElement.innerHTML = '';

    console.log('🔧 Rendering line:', { lineIndex, cellCount: cells.length });

    // Handle empty line - nothing to render
    if (!cells || cells.length === 0) {
      console.log('📭 Empty line, nothing to render');
      return;
    }

    // Use manual layout calculation
    console.log('📋 Using manual layout calculation');
    this.renderCellsManually(cells, lineIndex, lineElement, beats);
  }

  /**
     * Manual layout rendering - simplified (no lanes)
     */
  renderCellsManually(cells, lineIndex, container, beats) {
    console.log('🔧 Using manual layout rendering');

    // Build map of cell index to beat position
    const cellBeatInfo = new Map();
    if (beats && beats.length > 0) {
      beats.forEach((beat) => {
        if (beat.end - beat.start >= 1) { // Multi-cell beat
          for (let i = beat.start; i <= beat.end; i++) {
            if (i === beat.start) {
              cellBeatInfo.set(i, 'beat-first');
            } else if (i === beat.end) {
              cellBeatInfo.set(i, 'beat-last');
            } else {
              cellBeatInfo.set(i, 'beat-middle');
            }
          }
        }
      });
    }

    // Position cells sequentially from left margin
    // Start with a left margin of 5 character widths (60px)
    // TODO: Extract this as a shared constant (LEFT_MARGIN_PX) used across renderer.js and editor.js
    let cumulativeX = 60;

    // Render and position cells sequentially, tracking cumulative position
    cells.forEach((charCell, cellIndex) => {
      charCell.x = cumulativeX;
      charCell.y = 32;
      charCell.h = 16;
      charCell.w = 0; // Will be measured after render

      const beatPosition = cellBeatInfo.get(cellIndex);
      this.renderCell(charCell, lineIndex, cellIndex, container, cumulativeX, beatPosition);

      // Immediately measure and store the width
      const key = `${lineIndex}-${cellIndex}`;
      const element = this.charCellElements.get(key);

      if (element) {
        // Measure actual rendered width using getBoundingClientRect
        const rect = element.getBoundingClientRect();
        const actualWidth = rect.width;

        charCell.w = actualWidth;

        // Update bounding box and hit testing area
        charCell.bbox = [charCell.x, charCell.y, charCell.x + charCell.w, charCell.y + charCell.h];
        charCell.hit = [charCell.x - 2.0, charCell.y - 2.0, charCell.x + charCell.w + 2.0, charCell.y + charCell.h + 2.0];

        // Advance to next position (this is where the next cell OR cursor will be)
        cumulativeX += actualWidth;

        // Store the right edge position for cursor positioning
        charCell.rightEdge = charCell.x + charCell.w;

        console.log(`📐 Cell ${cellIndex} (${charCell.glyph}): x=${charCell.x}, w=${charCell.w}, rightEdge=${charCell.rightEdge}`);
      }
    });

    // Store the final cumulative position in the line for cursor use
    if (this.theDocument && this.theDocument.lines && this.theDocument.lines[lineIndex]) {
      this.theDocument.lines[lineIndex].nextCursorX = cumulativeX;
    }

    // Update hitboxes display after manual layout is complete
    if (this.editor && this.editor.updateHitboxesDisplay) {
      console.log('🔄 Updating hitboxes display');
      this.editor.updateHitboxesDisplay();
    }
  }

  /**
     * Render a single Cell - simplified (no lanes)
     */
  renderCell(charCell, lineIndex, cellIndex, container, xPosition, beatPosition) {
    const element = this.createCellElement(charCell, lineIndex, cellIndex, xPosition, beatPosition);
    container.appendChild(element);

    // Cache the element for future updates
    const key = `${lineIndex}-${cellIndex}`;
    this.charCellElements.set(key, element);
  }

  /**
     * Create DOM element for Cell - simplified (no lanes)
     */
  createCellElement(charCell, lineIndex, cellIndex, xPosition, beatPosition) {
    const element = document.createElement('span');
    element.className = this.cellRenderer.getCellClasses(charCell);
    // Use non-breaking space for space characters so they have actual width
    element.textContent = charCell.glyph === ' ' ? '\u00A0' : charCell.glyph;

    // Add beat position class if applicable
    if (beatPosition) {
      element.classList.add(beatPosition);
    }

    // Set positioning using inline styles
    element.style.position = 'absolute';
    element.style.left = `${charCell.x || xPosition || 0}px`;
    element.style.top = `${charCell.y || 32}px`;
    // Never set width explicitly - let cells render at natural width
    // This ensures beat loops span exactly the text content width
    element.style.height = `${charCell.h || 16}px`;

    // Add data attributes for debugging and CSS rendering
    element.dataset.lineIndex = lineIndex;
    element.dataset.cellIndex = cellIndex;
    element.dataset.column = charCell.col;
    element.dataset.graphemeLength = (charCell.glyph || '').length;
    element.dataset.octave = charCell.octave || 0;

    // Handle slur indicator - WASM returns slur_indicator (snake_case) or slurIndicator (camelCase)
    // Convert string values to numbers: "SlurStart" = 1, "SlurEnd" = 2, "None" = 0
    let slurIndicator = charCell.slurIndicator || charCell.slur_indicator || 0;
    if (typeof slurIndicator === 'string') {
      if (slurIndicator === 'SlurStart') slurIndicator = 1;
      else if (slurIndicator === 'SlurEnd') slurIndicator = 2;
      else slurIndicator = 0;
    }
    element.dataset.slurIndicator = slurIndicator;

    // Add event listeners
    this.addCellEventListeners(element, charCell);

    return element;
  }

  /**
     * Add event listeners to Cell element
     */
  addCellEventListeners(element, charCell) {
    element.addEventListener('click', (event) => {
      event.stopPropagation();
      this.handleCellClick(charCell, event);
    });

    element.addEventListener('mouseenter', () => {
      this.handleCellHover(charCell, true);
    });

    element.addEventListener('mouseleave', () => {
      this.handleCellHover(charCell, false);
    });
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
     * Get or create line element - simplified (no lanes)
     */
  getOrCreateLineElement(lineIndex) {
    let lineElement = this.canvas.querySelector(`[data-line="${lineIndex}"]`);

    if (!lineElement) {
      lineElement = document.createElement('div');
      lineElement.className = 'notation-line';
      lineElement.dataset.line = lineIndex;
      lineElement.style.position = 'relative';
      lineElement.style.height = '80px'; // 32px above + 16px cell + 32px below
      lineElement.style.width = '100%';

      this.canvas.appendChild(lineElement);
    }

    return lineElement;
  }

  /**
     * Render line metadata
     */
  renderLineMetadata(metadata, lineElement) {
    if (!metadata) return;

    // Render lyrics if present
    if (metadata.lyrics) {
      this.renderLyrics(metadata.lyrics, lineElement);
    }

    // Render tala if present
    if (metadata.tala) {
      this.renderTala(metadata.tala, lineElement);
    }
  }

  /**
     * Render line label
     */
  renderLineLabel(label, lineElement) {
    const labelElement = document.createElement('span');
    labelElement.className = 'line-label text-xs text-ui-disabled-text';
    labelElement.textContent = label;
    labelElement.style.position = 'absolute';
    labelElement.style.left = '0';
    labelElement.style.top = '32px'; // Same vertical position as line cells
    labelElement.style.height = '16px'; // Same height as cells
    labelElement.style.lineHeight = '16px'; // Match cell line height for baseline alignment

    lineElement.appendChild(labelElement);
  }

  /**
     * Render lyrics
     */
  renderLyrics(lyrics, lineElement) {
    const lyricsElement = document.createElement('div');
    lyricsElement.className = 'line-lyrics text-sm';
    lyricsElement.textContent = lyrics;
    lyricsElement.style.position = 'absolute';
    lyricsElement.style.left = '60px'; // Align with cells (LEFT_MARGIN_PX)
    lyricsElement.style.top = '52px'; // Below cells (32px cell top + 16px cell height + 4px gap)
    lyricsElement.style.fontStyle = 'italic';
    lyricsElement.style.color = '#6b7280'; // gray-500

    lineElement.appendChild(lyricsElement);
  }

  /**
     * Render tala notation - distribute characters across barlines
     */
  renderTala(tala, lineElement) {
    if (!tala || !this.theDocument) return;

    // Get the current line's cells to find barlines
    const lineIndex = parseInt(lineElement.dataset.line);
    const line = this.theDocument.lines[lineIndex];
    if (!line || !line.cells) return;

    console.log('🎵 renderTala called:', { tala, lineIndex, cellCount: line.cells.length });

    // Find all barline cells (kind === 6)
    const barlines = line.cells.filter(cell => cell.kind === 6);
    console.log('  Found barlines:', barlines.length, barlines.map(b => ({ glyph: b.glyph, x: b.x })));

    if (barlines.length === 0) {
      console.log('  No barlines found!');
      return;
    }

    // Distribute tala characters to barlines
    barlines.forEach((barlineCell, barlineIndex) => {
      // Get the tala character for this barline
      // If we've run out of tala characters, use the last one
      const talaCharIndex = Math.min(barlineIndex, tala.length - 1);
      const talaChar = tala[talaCharIndex];

      console.log(`  Rendering tala char "${talaChar}" at barline ${barlineIndex}, x=${barlineCell.x}`);

      // Create a span element for this tala character
      const talaElement = document.createElement('span');
      talaElement.className = 'tala-char text-xs';
      talaElement.textContent = talaChar;
      talaElement.style.position = 'absolute';
      talaElement.style.left = `${barlineCell.x}px`;
      talaElement.style.top = '12px'; // Above the cell line (cell top is at 32px)
      talaElement.style.transform = 'translateX(-50%)'; // Center on barline
      talaElement.style.color = '#4b5563'; // gray-600
      talaElement.style.fontWeight = '600';
      talaElement.style.pointerEvents = 'none';

      lineElement.appendChild(talaElement);
    });
  }

  /**
     * Render beat loops with enhanced visualization
     */
  renderBeatLoops(doc) {
    // Clear existing beat loop elements
    this.beatLoopElements.forEach((element) => {
      if (element.parentElement) {
        element.parentElement.removeChild(element);
      }
    });
    this.beatLoopElements.clear();

    doc.lines.forEach((line, lineIndex) => {
      // Always use beats from line.beats array (populated by BeatDeriver)
      if (line.beats && line.beats.length > 0) {
        console.log(`Rendering ${line.beats.length} beats for line ${lineIndex}`);
        line.beats.forEach((beat, beatIndex) => {
          this.renderBeatLoop(beat, lineIndex, beatIndex);
        });
      } else {
        console.log(`No beats found in line ${lineIndex}, line.beats:`, line.beats);
      }
    });
  }

  /**
     * Extract beats from Cell data and render them
     */
  extractAndRenderBeatsFromCells(line, lineIndex) {
    const letterLane = line.cells; // Main line contains temporal elements
    if (!letterLane || letterLane.length === 0) {
      console.log('No cells in main line for beat extraction');
      return;
    }

    const beats = this.extractBeatsFromCells(letterLane);
    console.log(`Extracted ${beats.length} beats from ${letterLane.length} cells:`, beats);

    beats.forEach((beat, beatIndex) => {
      console.log(`Rendering beat ${beatIndex}:`, {
        start: beat.start,
        end: beat.end,
        width: beat.end - beat.start + 1,
        startX: beat.visual.start_x,
        visualWidth: beat.visual.width
      });
      this.renderBeatLoop(beat, lineIndex, beatIndex);
    });

    // Store beats back in line for caching
    line.beats = beats;
  }

  /**
     * Extract beat spans from Cell array
     */
  extractBeatsFromCells(cells) {
    const beats = [];
    let currentBeat = null;
    let beatStart = 0;

    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];

      if (this.isTemporalCell(cell)) {
        if (!currentBeat) {
          // Start new beat
          currentBeat = {
            start: i,
            cells: [cell],
            duration: 1.0,
            visual: {
              start_x: cell.x || (i * 12),
              width: cell.w || 12,
              loop_offset_px: 20,
              loop_height_px: 6,
              draw_single_cell: false
            }
          };
          beatStart = i;
        } else {
          // Add cell to current beat
          currentBeat.cells.push(cell);
          currentBeat.duration = currentBeat.cells.length;
        }
      } else {
        // Non-temporal cell - end current beat
        if (currentBeat) {
          currentBeat.end = i - 1;
          currentBeat.visual.width = (currentBeat.end - currentBeat.start + 1) * 12;
          beats.push(currentBeat);
          currentBeat = null;
        }
      }
    }

    // Handle trailing beat
    if (currentBeat) {
      currentBeat.end = cells.length - 1;
      currentBeat.visual.width = (currentBeat.end - currentBeat.start + 1) * 12;
      beats.push(currentBeat);
    }

    return beats;
  }

  /**
     * Check if cell is temporal (part of musical timing)
     */
  isTemporalCell(cell) {
    const isTemporal = cell.kind === 1 || cell.kind === 2; // PitchedElement or UnpitchedElement
    if (!isTemporal && cell.glyph) {
      console.log(`Cell "${cell.glyph}" is not temporal (kind: ${cell.kind})`);
    }
    return isTemporal;
  }

  /**
     * Render single beat loop
     */
  renderBeatLoop(beat, lineIndex, beatIndex) {
    const key = `beat-${lineIndex}-${beatIndex}`;

    // Get the line element to append to
    const lineElement = this.getOrCreateLineElement(lineIndex);

    // Create beat loop element
    const beatElement = document.createElement('div');
    beatElement.className = 'beat-loop';
    beatElement.dataset.lineIndex = lineIndex;
    beatElement.dataset.beatIndex = beatIndex;

    // Calculate beat width from start/end positions
    const beatWidth = (beat.end - beat.start + 1);
    const shouldDisplay = beat.visual.draw_single_cell || beatWidth > 1;

    console.log(`Beat loop ${beatIndex}: width=${beatWidth}, shouldDisplay=${shouldDisplay}, draw_single_cell=${beat.visual.draw_single_cell}`);

    // Position below the cells (simplified - no lanes)
    const cellY = 32; // Cells start at 32px (2 font heights from top)
    const cellHeight = 16; // Cell height
    const loopOffsetBelow = 2; // Offset below the cell bottom (2px gap)

    const leftPos = beat.visual.start_x || (beat.start * 12);
    const widthPx = beat.visual.width || (beatWidth * 12);
    const topPos = cellY + cellHeight + loopOffsetBelow; // Position below cells

    // Update position and appearance - arc beneath beats (no bottom fill)
    beatElement.style.position = 'absolute';
    beatElement.style.left = `${leftPos}px`;
    beatElement.style.width = `${widthPx}px`;
    beatElement.style.top = `${topPos}px`;
    beatElement.style.height = `${beat.visual.loop_height_px || 5}px`;
    // Arc outline only - no bottom border (empty bowl)
    beatElement.style.border = '2px solid #666';
    beatElement.style.borderTop = 'none';
    beatElement.style.borderRadius = '0 0 12px 12px';
    beatElement.style.backgroundColor = 'transparent';
    beatElement.style.display = shouldDisplay ? 'block' : 'none';
    beatElement.style.zIndex = '1';
    beatElement.style.pointerEvents = 'none';

    console.log(`Beat loop element created:`, {
      left: leftPos,
      width: widthPx,
      top: topPos,
      display: beatElement.style.display
    });

    lineElement.appendChild(beatElement);
    this.beatLoopElements.set(key, beatElement);
  }

  /**
   * Render slurs by scanning cells for slur indicators
   */
  renderSlurs(doc) {
    console.log('🎵 renderSlurs called');

    // Clear existing slur elements
    this.slurElements.forEach((element) => {
      if (element.parentElement) {
        element.parentElement.removeChild(element);
      }
    });
    this.slurElements.clear();

    doc.lines.forEach((line, lineIndex) => {
      const mainLine = line.cells;
      if (!mainLine || mainLine.length === 0) {
        return;
      }

      console.log(`  Scanning ${mainLine.length} cells for slur indicators in line ${lineIndex}`);

      // Scan for slur pairs (SlurStart and SlurEnd)
      let slurStartCell = null;
      let slurStartIndex = null;

      mainLine.forEach((cell, cellIndex) => {
        const indicator = cell.slurIndicator || cell.slur_indicator;
        console.log(`    Cell ${cellIndex} (${cell.glyph}): slur_indicator=${cell.slur_indicator}, slurIndicator=${cell.slurIndicator}, indicator=${indicator}`);

        // Check for SlurStart (slurIndicator = 1 or "SlurStart")
        if (indicator === 1 || indicator === 'SlurStart') {
          console.log(`      ✅ Found SlurStart at cell ${cellIndex}`);
          slurStartCell = cell;
          slurStartIndex = cellIndex;
        }
        // Check for SlurEnd (slurIndicator = 2 or "SlurEnd")
        else if ((indicator === 2 || indicator === 'SlurEnd') && slurStartCell) {
          console.log(`      ✅ Found SlurEnd at cell ${cellIndex}, rendering slur from ${slurStartIndex} to ${cellIndex}`);
          // Render slur from start to end
          this.renderSlur(slurStartCell, cell, slurStartIndex, cellIndex, lineIndex);
          slurStartCell = null;
          slurStartIndex = null;
        }
      });

      if (slurStartCell) {
        console.warn(`  ⚠️ Unclosed slur starting at cell ${slurStartIndex}`);
      }
    });
  }

  /**
   * Render a single slur arc as a div element
   */
  renderSlur(startCell, endCell, startIndex, endIndex, lineIndex) {
    const key = `slur-${lineIndex}-${startIndex}-${endIndex}`;

    // Get the line element to append to
    const lineElement = this.getOrCreateLineElement(lineIndex);

    // Create slur element
    const slurElement = document.createElement('div');
    slurElement.className = 'slur-arc';
    slurElement.dataset.lineIndex = lineIndex;
    slurElement.dataset.startIndex = startIndex;
    slurElement.dataset.endIndex = endIndex;

    // Calculate slur position and width
    const startX = startCell.x || 0;
    const endX = (endCell.x || 0) + (endCell.w || 12);
    const width = endX - startX;

    // Position above the cells (10px above cell top)
    const cellY = 32; // Cells start at 32px
    const slurY = cellY - 10; // 10px above cell

    // Style the slur arc - same as beat loops but upside down
    slurElement.style.position = 'absolute';
    slurElement.style.left = `${startX}px`;
    slurElement.style.width = `${width}px`;
    slurElement.style.top = `${slurY}px`;
    slurElement.style.height = `5px`;
    // Arc above - top border only (upside down bowl)
    slurElement.style.border = '1.5px solid #4a5568';
    slurElement.style.borderBottom = 'none';
    slurElement.style.borderRadius = '12px 12px 0 0';
    slurElement.style.backgroundColor = 'transparent';
    slurElement.style.zIndex = '3';
    slurElement.style.pointerEvents = 'none';

    console.log(`Rendered slur: cells ${startIndex}..${endIndex}, left=${startX}px, width=${width}px`);

    lineElement.appendChild(slurElement);
    this.slurElements.set(key, slurElement);
  }





  /**
     * Render octave markings using canvas overlay - simplified (no lanes)
     */
  renderOctaveMarkings(doc) {
    if (!this.octaveCtx) return;

    const startTime = performance.now();

    // Clear canvas
    this.octaveCtx.clearRect(0, 0, this.octaveCanvas.width, this.octaveCanvas.height);

    let octavesRendered = 0;

    doc.lines.forEach((line, lineIndex) => {
      // Only render octave markings from main line
      const mainLine = line.cells;
      console.log(`🎵 Checking ${mainLine.length} cells for octave markings`);
      mainLine.forEach((charCell, cellIndex) => {
        console.log(`  Cell ${cellIndex} (${charCell.glyph}): octave=${charCell.octave}`);
        if (this.hasOctaveMarking(charCell)) {
          console.log(`  ✅ Rendering octave dot for cell ${cellIndex}`);
          this.renderOctaveDot(charCell, lineIndex, cellIndex);
          octavesRendered++;
        }
      });
    });

    // Update performance statistics
    this.renderStats.octavesRendered = octavesRendered;
    const endTime = performance.now();
    console.log(`Rendered ${octavesRendered} octave markings in ${(endTime - startTime).toFixed(2)}ms`);
  }

  /**
     * Check if a Cell has octave marking
     */
  hasOctaveMarking(charCell) {
    return charCell.octave !== 0;
  }

  /**
     * Render single octave dot above or below an element - simplified (no lanes)
     */
  renderOctaveDot(charCell, lineIndex, cellIndex) {
    const ctx = this.octaveCtx;

    // Calculate position relative to cell
    const centerX = (charCell.x || (cellIndex * 12)) + (charCell.w || 12) / 2;
    const baseY = (charCell.y || 0);
    const cellHeight = charCell.h || 16;

    console.log(`🎨 renderOctaveDot: cell=${charCell.glyph}, centerX=${centerX}, baseY=${baseY}, octave=${charCell.octave}`);

    // Dot size: Make dots more visible - 3px radius
    const dotRadius = 3; // Larger for visibility

    // Determine dot position based on octave value
    // Position dots closer to the cell
    let dotY; let dotCount;

    switch (charCell.octave) {
      case 1: // Octave up - dot above
        dotY = baseY - 6; // 6px above cell top
        dotCount = 1;
        break;
      case 2: // Two octaves up - two dots above
        dotY = baseY - 6;
        dotCount = 2;
        break;
      case -1: // Octave down - dot below
        dotY = baseY + cellHeight + 6; // 6px below cell bottom
        dotCount = 1;
        break;
      case -2: // Two octaves down - two dots below
        dotY = baseY + cellHeight + 6;
        dotCount = 2;
        break;
      default:
        return; // No octave marking for octave 0
    }

    // Set dot styling - solid black circles
    ctx.fillStyle = '#000000'; // Black
    ctx.lineWidth = 0; // No border

    // Draw dots based on count
    const dotSpacing = dotRadius * 3; // Space dots 3× their radius apart
    for (let i = 0; i < dotCount; i++) {
      const offsetX = centerX + (i - (dotCount - 1) / 2) * dotSpacing;

      console.log(`  🔵 Drawing dot at x=${offsetX}, y=${dotY}, radius=${dotRadius}`);

      // Draw filled circle
      ctx.beginPath();
      ctx.arc(offsetX, dotY, dotRadius, 0, Math.PI * 2);
      ctx.fill();
    }

    console.log(`✅ Finished rendering ${dotCount} dot(s) for cell ${charCell.glyph}`);
  }

  /**
     * Clear canvas content
     */
  clearCanvas() {
    // Remove all Cell elements from maps
    this.charCellElements.clear();

    // Remove beat loop elements from DOM before clearing map
    this.beatLoopElements.forEach((element) => {
      if (element.parentElement) {
        element.parentElement.removeChild(element);
      }
    });
    this.beatLoopElements.clear();

    // Remove slur elements from DOM before clearing map
    this.slurElements.forEach((element) => {
      if (element.parentElement) {
        element.parentElement.removeChild(element);
      }
    });
    this.slurElements.clear();

    // Remove all line elements
    const childrenToRemove = Array.from(this.canvas.children);
    childrenToRemove.forEach(child => this.canvas.removeChild(child));
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
