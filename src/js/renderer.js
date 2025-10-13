/**
 * DOM Renderer for Music Notation Editor
 *
 * This class provides DOM-based rendering for Cell elements,
 * beat loops, slurs, and other musical notation components.
 */

class DOMRenderer {
  constructor(canvasElement, editor) {
    this.canvas = canvasElement;
    this.editor = editor; // Store reference to editor instance
    this.charCellElements = new Map();
    this.beatLoopElements = new Map();
    this.currentDocument = null;
    this.renderCache = new Map();

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
      /* Beat loop arc - first cell has left edge */
      .char-cell.beat-first::after {
        content: '';
        position: absolute;
        left: 0;
        bottom: -10px; /* 10px below cell */
        width: 100%;
        height: 8px;
        border-left: 2px solid #666;
        border-bottom: 2px solid #666;
        border-radius: 0 0 0 8px;
        pointer-events: none;
        z-index: 1;
      }

      /* Middle cells only have bottom border */
      .char-cell.beat-middle::after {
        content: '';
        position: absolute;
        left: 0;
        bottom: -10px;
        width: 100%;
        height: 8px;
        border-bottom: 2px solid #666;
        pointer-events: none;
        z-index: 1;
      }

      /* Last cell has right edge */
      .char-cell.beat-last::after {
        content: '';
        position: absolute;
        left: 0;
        bottom: -10px;
        width: 100%;
        height: 8px;
        border-right: 2px solid #666;
        border-bottom: 2px solid #666;
        border-radius: 0 0 8px 0;
        pointer-events: none;
        z-index: 1;
      }

      /* Slur rendering - first note of slur (SlurStart = 1) */
      .char-cell[data-slur-indicator="1"]::after {
        content: '';
        position: absolute;
        left: 0;
        top: -10px; /* 10px above cell */
        width: 100%;
        height: 8px;
        border-left: 1.5px solid #4a5568;
        border-top: 1.5px solid #4a5568;
        border-radius: 8px 0 0 0;
        pointer-events: none;
        z-index: 3;
      }

      /* Slur rendering - last note of slur (SlurEnd = 2) */
      .char-cell[data-slur-indicator="2"]::after {
        content: '';
        position: absolute;
        left: 0;
        top: -10px; /* 10px above cell */
        width: 100%;
        height: 8px;
        border-right: 1.5px solid #4a5568;
        border-top: 1.5px solid #4a5568;
        border-radius: 0 8px 0 0;
        pointer-events: none;
        z-index: 3;
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
     * Setup canvas overlay for slur rendering with enhanced styling
     */
  setupSlurCanvas() {
    this.slurCanvas = document.createElement('canvas');
    this.slurCanvas.className = 'slur-canvas-overlay';
    this.slurCanvas.style.position = 'absolute';
    this.slurCanvas.style.top = '0';
    this.slurCanvas.style.left = '0';
    this.slurCanvas.style.pointerEvents = 'none';
    this.slurCanvas.style.width = '100%';
    this.slurCanvas.style.height = '100%';
    this.slurCanvas.style.zIndex = '3'; // Above content
    this.slurCanvas.style.opacity = '0.8'; // Slight transparency

    // Add CSS for smooth transitions
    const style = document.createElement('style');
    style.textContent = `
        .slur-canvas-overlay {
        transition: opacity 0.2s ease-in-out;
        }
        .slur-canvas-overlay.animating {
        opacity: 1;
        }
    `;
    document.head.appendChild(style);

    this.canvas.appendChild(this.slurCanvas);
    this.slurCtx = this.slurCanvas.getContext('2d');

    // Set initial canvas size
    this.resizeSlurCanvas();

    // Add resize listener to keep canvas sized correctly
    window.addEventListener('resize', () => {
      this.resizeSlurCanvas();
    });
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
     * Resize slur canvas to match container
     */
  resizeSlurCanvas() {
    if (this.slurCanvas && this.canvas) {
      const rect = this.canvas.getBoundingClientRect();
      this.slurCanvas.width = rect.width;
      this.slurCanvas.height = rect.height;

      // Re-render slurs after resize
      if (this.currentDocument) {
        this.renderSlurs(this.currentDocument);
      }
    }
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
      if (this.currentDocument) {
        this.renderOctaveMarkings(this.currentDocument);
      }
    }
  }

  /**
     * Render entire document
     */
  renderDocument(document) {
    const startTime = performance.now();

    this.currentDocument = document;

    // Clear previous content
    this.clearCanvas();

    if (!document.staves || document.staves.length === 0) {
      this.showEmptyState();
      return;
    }

    // Render each stave
    document.staves.forEach((stave, staveIndex) => {
      this.renderStave(stave, staveIndex);
    });

    // Beat loops are now rendered via CSS on cells (no separate elements needed)

    // Render slurs
    this.renderSlurs(document);

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
     * Render a single stave - simplified to only render main line
     */
  renderStave(stave, staveIndex) {
    const staveElement = this.getOrCreateLineElement(staveIndex);

    // Only render the main line (no lanes)
    const mainLine = stave.line;
    const beats = stave.beats || [];
    this.renderLine(mainLine, staveIndex, staveElement, beats);

    // Render stave label
    if (stave.label) {
      this.renderLineLabel(stave.label, staveElement);
    }

    // Render stave metadata
    if (stave.metadata) {
      this.renderLineMetadata(stave.metadata, staveElement);
    }
  }

  /**
     * Render the main line with Cell elements - simplified (no lanes)
     */
  renderLine(cells, lineIndex, lineElement, beats) {
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

    // Calculate cumulative x positions based on actual grapheme lengths
    let cumulativeX = 0;
    const cellPositions = [];
    cells.forEach((charCell) => {
      cellPositions.push(cumulativeX);
      const graphemeLength = (charCell.grapheme || '').length;
      cumulativeX += graphemeLength * 12; // 12px per character
    });

    // Render each Cell and update ephemeral rendering fields
    cells.forEach((charCell, cellIndex) => {
      // Set ephemeral rendering fields (hitboxes) on the cell
      const graphemeLength = (charCell.grapheme || '').length;
      const cellWidth = graphemeLength * 12;
      charCell.x = cellPositions[cellIndex];
      charCell.y = 32; // Position 32px from top (2 font heights above)
      charCell.w = cellWidth;
      charCell.h = 16;

      // Update bounding box and hit testing area
      charCell.bbox = [charCell.x, charCell.y, charCell.x + charCell.w, charCell.y + charCell.h];
      charCell.hit = [charCell.x - 2.0, charCell.y - 2.0, charCell.x + charCell.w + 2.0, charCell.y + charCell.h + 2.0];

      console.log(`📐 Set hitbox for cell ${cellIndex} (${charCell.grapheme}):`, {
        x: charCell.x,
        y: charCell.y,
        w: charCell.w,
        h: charCell.h,
        bbox: charCell.bbox,
        hit: charCell.hit
      });

      // Get beat position for this cell
      const beatPosition = cellBeatInfo.get(cellIndex);

      this.renderCell(charCell, lineIndex, cellIndex, container, cellPositions[cellIndex], beatPosition);
    });

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
    element.className = this.getCellClasses(charCell);
    element.textContent = charCell.grapheme;

    // Add beat position class if applicable
    if (beatPosition) {
      element.classList.add(beatPosition);
    }

    // Calculate width based on actual grapheme length (e.g., "1#" = 2 chars = 24px)
    const graphemeLength = (charCell.grapheme || '').length;
    const cellWidth = graphemeLength * 12; // 12px per character

    // Set positioning using inline styles
    element.style.position = 'absolute';
    element.style.left = `${charCell.x || xPosition || 0}px`;
    element.style.top = `${charCell.y || 32}px`;
    element.style.width = `${charCell.w || cellWidth}px`;
    element.style.height = `${charCell.h || 16}px`;

    // Add data attributes for debugging
    element.dataset.lineIndex = lineIndex;
    element.dataset.cellIndex = cellIndex;
    element.dataset.column = charCell.col;
    element.dataset.graphemeLength = graphemeLength;
    element.dataset.octave = charCell.octave || 0;

    // Add event listeners
    this.addCellEventListeners(element, charCell);

    return element;
  }

  /**
     * Get CSS classes for Cell
     */
  getCellClasses(charCell) {
    const classes = ['char-cell'];

    // Add lane class
    classes.push(`lane-${this.getLaneName(charCell.lane)}`);

    // Add element kind class
    classes.push(`kind-${this.getElementKindName(charCell.kind)}`);

    // Add state classes
    if (charCell.flags & 0x02) classes.push('selected');
    if (charCell.flags & 0x04) classes.push('focused');

    // Add pitch system class if applicable
    if (charCell.pitch_system) {
      classes.push(`pitch-system-${this.getPitchSystemName(charCell.pitch_system)}`);
    }

    // Add head marker class
    if (charCell.flags & 0x01) classes.push('head-marker');

    return classes.join(' ');
  }

  /**
     * Get lane name from enum
     */
  getLaneName(laneKind) {
    const laneNames = ['upper', 'letter', 'lower', 'lyrics'];
    return laneNames[laneKind] || 'unknown';
  }

  /**
     * Get element kind name
     */
  getElementKindName(elementKind) {
    const kindNames = [
      'unknown', 'pitched', 'unpitched', 'upper-annotation',
      'lower-annotation', 'text', 'barline', 'breath', 'whitespace'
    ];
    return kindNames[elementKind] || 'unknown';
  }

  /**
     * Get pitch system name
     */
  getPitchSystemName(pitchSystem) {
    const systemNames = ['unknown', 'number', 'western', 'sargam', 'bhatkhande', 'tabla'];
    return systemNames[pitchSystem] || 'unknown';
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
    const labelElement = document.createElement('div');
    labelElement.className = 'line-label text-xs text-ui-disabled-text';
    labelElement.textContent = label;
    labelElement.style.position = 'absolute';
    labelElement.style.left = '0';
    labelElement.style.top = '-20px';

    lineElement.appendChild(labelElement);
  }

  /**
     * Render lyrics
     */
  renderLyrics(lyrics, lineElement) {
    const lyricsElement = document.createElement('div');
    lyricsElement.className = 'line-lyrics text-sm text-notation-text-token';
    lyricsElement.textContent = lyrics;
    lyricsElement.style.position = 'absolute';
    lyricsElement.style.left = '0';
    lyricsElement.style.bottom = '-20px';

    lineElement.appendChild(lyricsElement);
  }

  /**
     * Render tala notation
     */
  renderTala(tala, lineElement) {
    const talaElement = document.createElement('div');
    talaElement.className = 'line-tala text-xs';
    talaElement.textContent = tala;
    talaElement.style.position = 'absolute';
    talaElement.style.top = '-30px';

    lineElement.appendChild(talaElement);
  }

  /**
     * Render beat loops with enhanced visualization
     */
  renderBeatLoops(document) {
    // Clear existing beat loop elements
    this.beatLoopElements.forEach((element) => {
      if (element.parentElement) {
        element.parentElement.removeChild(element);
      }
    });
    this.beatLoopElements.clear();

    document.staves.forEach((stave, staveIndex) => {
      // Always use beats from stave.beats array (populated by BeatDeriver)
      if (stave.beats && stave.beats.length > 0) {
        console.log(`Rendering ${stave.beats.length} beats for stave ${staveIndex}`);
        stave.beats.forEach((beat, beatIndex) => {
          this.renderBeatLoop(beat, staveIndex, beatIndex);
        });
      } else {
        console.log(`No beats found in stave ${staveIndex}, stave.beats:`, stave.beats);
      }
    });
  }

  /**
     * Extract beats from Cell data and render them
     */
  extractAndRenderBeatsFromCells(stave, staveIndex) {
    const letterLane = stave.line; // Main line contains temporal elements
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
      this.renderBeatLoop(beat, staveIndex, beatIndex);
    });

    // Store beats back in stave for caching
    stave.beats = beats;
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
    if (!isTemporal && cell.grapheme) {
      console.log(`Cell "${cell.grapheme}" is not temporal (kind: ${cell.kind})`);
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
    beatElement.style.height = `${beat.visual.loop_height_px || 8}px`;
    // Arc outline only - no bottom border (empty bowl)
    beatElement.style.border = '2px solid #666';
    beatElement.style.borderTop = 'none';
    beatElement.style.borderRadius = '0 0 8px 8px';
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
     * Render slurs using canvas - scan cells for slurStart/slurEnd indicators (simplified)
     */
  renderSlurs(document) {
    if (!this.slurCtx) return;

    // Clear canvas
    this.slurCtx.clearRect(0, 0, this.slurCanvas.width, this.slurCanvas.height);

    document.staves.forEach((stave, staveIndex) => {
      // Scan main line for cells with slurStart/slurEnd
      const mainLine = stave.line;
      if (mainLine) {
        let slurStartCell = null;

        mainLine.forEach((cell, cellIndex) => {
          if (cell.slurIndicator === 1 && !slurStartCell) {
            // Start of a new slur (SlurStart = 1)
            slurStartCell = cell;
          } else if (cell.slurIndicator === 2 && slurStartCell) {
            // End of current slur (SlurEnd = 2) - render it
            this.renderCellSlur(slurStartCell, cell);
            slurStartCell = null;
          }
        });
      }

      // Also render legacy stave.slurs if they exist
      if (stave.slurs) {
        stave.slurs.forEach((slur, slurIndex) => {
          this.renderSlur(slur, staveIndex, slurIndex);
        });
      }
    });
  }

  /**
     * Render slur between two cells using their current positions - simplified (no lanes)
     */
  renderCellSlur(startCell, endCell) {
    const ctx = this.slurCtx;

    // Set slur styling
    ctx.beginPath();
    ctx.strokeStyle = '#4a5568'; // Dark gray for normal slurs
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Calculate positions using cell coordinates (no lane offsets)
    const startX = startCell.x || 0;
    const startY = (startCell.y || 0) - 8; // 8px ABOVE the text line
    const endX = (endCell.x || 0) + (endCell.w || 12); // Use end of cell
    const endY = (endCell.y || 0) - 8;   // 8px ABOVE the text line

    const width = endX - startX;
    if (width <= 0) return; // Skip invalid slur

    // Calculate Bézier curve parameters - same curvature as beat loops
    const curvature = 0.15; // Same curvature as beat loops
    const controlHeight = width * curvature * 2; // Same gentle curve as beats
    const controlX = startX + width / 2;

    // Slur always curves UPWARD above the notes
    const controlY = startY - controlHeight;

    // Draw smooth Bézier curve
    ctx.moveTo(startX, startY);
    ctx.quadraticCurveTo(controlX, controlY, endX, endY);
    ctx.stroke();

    // Add small circles at endpoints for better visibility
    this.renderSlurEndpoints(ctx, startX, startY, endX, endY);
  }

  /**
     * Render single slur with enhanced Bézier curve rendering - simplified (no lanes)
     */
  renderSlur(slur, lineIndex, slurIndex) {
    const ctx = this.slurCtx;

    // Set slur styling
    ctx.beginPath();

    // Use different colors based on slur state
    if (slur.visual.highlighted) {
      ctx.strokeStyle = '#ff6b35'; // Orange for highlighted
      ctx.lineWidth = (slur.visual.thickness || 1.5) + 0.5; // Thicker when highlighted
    } else {
      ctx.strokeStyle = '#4a5568'; // Dark gray for normal slurs
      ctx.lineWidth = slur.visual.thickness || 1.5;
    }

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Calculate positions (no lane offsets)
    const startX = slur.start.x || (slur.start.column * 12);
    const startY = (slur.start.y || 0) - 8; // Position 8px ABOVE the text line
    const endX = slur.end.x || (slur.end.column * 12);
    const endY = (slur.end.y || 0) - 8; // Position 8px ABOVE the text line

    const width = endX - startX;
    if (width <= 0) return; // Skip invalid slur

    // Calculate Bézier curve parameters - slur should match beat arc curvature
    const curvature = slur.visual.curvature || 0.15; // Same curvature as beat loops
    const controlHeight = width * curvature * 2; // Same gentle curve as beats
    const controlX = startX + width / 2;

    // Slur curves UPWARD with same gentle arc as beat loops
    const controlY = startY - controlHeight; // Upward curve above the text

    // Draw smooth Bézier curve
    ctx.moveTo(startX, startY);
    ctx.quadraticCurveTo(controlX, controlY, endX, endY);
    ctx.stroke();

    // Add small circles at endpoints for better visibility
    this.renderSlurEndpoints(ctx, startX, startY, endX, endY);
  }

  /**
     * Render small circles at slur endpoints for better visibility
     */
  renderSlurEndpoints(ctx, startX, startY, endX, endY) {
    ctx.save();

    // Start endpoint
    ctx.beginPath();
    ctx.fillStyle = ctx.strokeStyle; // Same color as slur
    ctx.arc(startX, startY, 2, 0, Math.PI * 2);
    ctx.fill();

    // End endpoint
    ctx.beginPath();
    ctx.arc(endX, endY, 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  /**
     * Render octave markings using canvas overlay - simplified (no lanes)
     */
  renderOctaveMarkings(document) {
    if (!this.octaveCtx) return;

    const startTime = performance.now();

    // Clear canvas
    this.octaveCtx.clearRect(0, 0, this.octaveCanvas.width, this.octaveCanvas.height);

    let octavesRendered = 0;

    document.staves.forEach((stave, staveIndex) => {
      // Only render octave markings from main line
      const mainLine = stave.line;
      console.log(`🎵 Checking ${mainLine.length} cells for octave markings`);
      mainLine.forEach((charCell, cellIndex) => {
        console.log(`  Cell ${cellIndex} (${charCell.grapheme}): octave=${charCell.octave}`);
        if (this.hasOctaveMarking(charCell)) {
          console.log(`  ✅ Rendering octave dot for cell ${cellIndex}`);
          this.renderOctaveDot(charCell, staveIndex, cellIndex);
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

    console.log(`🎨 renderOctaveDot: cell=${charCell.grapheme}, centerX=${centerX}, baseY=${baseY}, octave=${charCell.octave}`);

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

    console.log(`✅ Finished rendering ${dotCount} dot(s) for cell ${charCell.grapheme}`);
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

    // Collect all children that are not canvas overlays
    const childrenToRemove = [];
    for (const child of this.canvas.children) {
      if (child !== this.slurCanvas) {
        childrenToRemove.push(child);
      }
    }

    // Remove all non-canvas children (line elements and their children)
    childrenToRemove.forEach(child => this.canvas.removeChild(child));

    // Clear slur canvas
    if (this.slurCtx) {
      this.slurCtx.clearRect(0, 0, this.slurCanvas.width, this.slurCanvas.height);
    }

    // Re-setup canvas if it was removed
    if (!this.slurCanvas.parentElement) {
      this.setupSlurCanvas();
    }
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
    // Update slur canvas size
    if (this.slurCanvas) {
      this.slurCanvas.width = this.canvas.offsetWidth;
      this.slurCanvas.height = this.canvas.offsetHeight;
    }
  }
}

export default DOMRenderer;
