/**
 * DOM Renderer for Music Notation Editor
 *
 * This class provides DOM-based rendering for Cell elements,
 * beat loops, slurs, and other musical notation components.
 */

class DOMRenderer {
    constructor(canvasElement) {
        this.canvas = canvasElement;
        this.charCellElements = new Map();
        this.beatLoopElements = new Map();
        this.slurCanvas = null;
        this.slurCtx = null;
        this.octaveCanvas = null;
        this.octaveCtx = null;
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

        this.setupSlurCanvas();
        this.setupOctaveCanvas();
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
        this.slurCanvas.style.zIndex = '3'; // Above content but below cursor
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
        this.octaveCanvas.style.opacity = '0.7'; // Slight transparency

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

        // Render beat loops
        this.renderBeatLoops(document);

        // Render slurs
        this.renderSlurs(document);

        // Render octave markings
        this.renderOctaveMarkings(document);

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
     * Render a single stave
     */
    renderStave(stave, staveIndex) {
        const staveElement = this.getOrCreateLineElement(staveIndex);

        // Render each line (upper_line, line, lower_line, lyrics)
        const lineNames = ['upper_line', 'line', 'lower_line', 'lyrics'];
        lineNames.forEach((lineName, laneIndex) => {
            const lane = stave[lineName];
            this.renderLane(lane, staveIndex, laneIndex, staveElement);
        });

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
     * Render a lane with Cell elements
     */
    renderLane(lane, lineIndex, laneIndex, lineElement) {
        const laneContainer = this.getOrCreateLaneContainer(lineElement, laneIndex);

        // Clear existing content
        laneContainer.innerHTML = '';

        // Calculate cumulative x positions based on actual grapheme lengths
        let cumulativeX = 0;
        const cellPositions = [];
        lane.forEach((charCell) => {
            cellPositions.push(cumulativeX);
            const graphemeLength = (charCell.grapheme || '').length;
            cumulativeX += graphemeLength * 12; // 12px per character
        });

        // Render each Cell in the lane and update ephemeral rendering fields
        lane.forEach((charCell, cellIndex) => {
            // Set ephemeral rendering fields (hitboxes) on the cell for ephemeral model display
            const graphemeLength = (charCell.grapheme || '').length;
            const cellWidth = graphemeLength * 12;
            charCell.x = cellPositions[cellIndex];
            charCell.y = 0; // Y position relative to lane container (lane containers are vertically offset)
            charCell.w = cellWidth;
            charCell.h = 16;

            this.renderCell(charCell, lineIndex, laneIndex, cellIndex, laneContainer, cellPositions[cellIndex]);
        });
    }

    /**
     * Render a single Cell
     */
    renderCell(charCell, lineIndex, laneIndex, cellIndex, container, xPosition) {
        const element = this.createCellElement(charCell, lineIndex, laneIndex, cellIndex, xPosition);
        container.appendChild(element);

        // Cache the element for future updates
        const key = `${lineIndex}-${laneIndex}-${cellIndex}`;
        this.charCellElements.set(key, element);
    }

    /**
     * Create DOM element for Cell
     */
    createCellElement(charCell, lineIndex, laneIndex, cellIndex, xPosition) {
        const element = document.createElement('span');
        element.className = this.getCellClasses(charCell);
        element.textContent = charCell.grapheme;

        // Calculate width based on actual grapheme length (e.g., "1#" = 2 chars = 24px)
        const graphemeLength = (charCell.grapheme || '').length;
        const cellWidth = graphemeLength * 12; // 12px per character

        // Set positioning using inline styles
        // Cells are positioned relative to their lane container (which is already vertically offset)
        element.style.position = 'absolute';
        element.style.left = `${charCell.x || xPosition || 0}px`;
        element.style.top = '0px'; // Always 0px relative to lane container
        element.style.width = `${charCell.w || cellWidth}px`;
        element.style.height = `${charCell.h || 16}px`;

        // Add data attributes for debugging
        element.dataset.lineIndex = lineIndex;
        element.dataset.laneIndex = laneIndex;
        element.dataset.cellIndex = cellIndex;
        element.dataset.column = charCell.col;
        element.dataset.graphemeLength = graphemeLength;

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
     * Get or create line element
     */
    getOrCreateLineElement(lineIndex) {
        let lineElement = this.canvas.querySelector(`[data-line="${lineIndex}"]`);

        if (!lineElement) {
            lineElement = document.createElement('div');
            lineElement.className = 'notation-line';
            lineElement.dataset.line = lineIndex;
            lineElement.style.position = 'relative';
            lineElement.style.height = '64px'; // 4 lanes * 16px each
            lineElement.style.width = '100%';

            this.canvas.appendChild(lineElement);
        }

        return lineElement;
    }

    /**
     * Get or create lane container
     */
    getOrCreateLaneContainer(lineElement, laneIndex) {
        let laneContainer = lineElement.querySelector(`[data-lane="${laneIndex}"]`);

        if (!laneContainer) {
            laneContainer = document.createElement('div');
            laneContainer.className = `notation-lane lane-${this.getLaneName(laneIndex)}`;
            laneContainer.dataset.lane = laneIndex;
            laneContainer.style.position = 'absolute';
            laneContainer.style.top = `${laneIndex * 16}px`;
            laneContainer.style.height = '16px';
            laneContainer.style.width = '100%';

            lineElement.appendChild(laneContainer);
        }

        return laneContainer;
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

        // Position below the main line (lane 1 is at 16px)
        const mainLineY = 16; // Lane 1 (main line)
        const loopOffsetBelow = 18; // Offset below the text baseline

        const leftPos = beat.visual.start_x || (beat.start * 12);
        const widthPx = beat.visual.width || (beatWidth * 12);
        const topPos = mainLineY + loopOffsetBelow;

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
     * Render slurs using canvas
     */
    renderSlurs(document) {
        if (!this.slurCtx) return;

        // Clear canvas
        this.slurCtx.clearRect(0, 0, this.slurCanvas.width, this.slurCanvas.height);

        document.staves.forEach((stave, staveIndex) => {
            if (stave.slurs) {
                stave.slurs.forEach((slur, slurIndex) => {
                    this.renderSlur(slur, staveIndex, slurIndex);
                });
            }
        });
    }

    /**
     * Render single slur with enhanced Bézier curve rendering
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

        // Calculate positions - slur should be ABOVE the notes
        const laneOffsets = [0, 16, 32, 48]; // Visual offsets for lanes
        const laneOffset = laneOffsets[slur.start?.lane || 1] || 16;

        const startX = slur.start.x || (slur.start.column * 12);
        const startY = laneOffset + (slur.start.y || 0) - 8; // Position 8px ABOVE the text line
        const endX = slur.end.x || (slur.end.column * 12);
        const endY = laneOffset + (slur.end.y || 0) - 8; // Position 8px ABOVE the text line

        const width = endX - startX;
        if (width <= 0) return; // Skip invalid slur

        // Calculate Bézier curve parameters - arc should curve UPWARD above notes
        const curvature = slur.visual.curvature || 0.2; // Increased curvature for more pronounced arc
        const controlHeight = width * curvature * 3; // Even more pronounced curve upward
        const controlX = startX + width / 2;

        // Slur always curves UPWARD above the notes
        const controlY = startY - controlHeight; // Always curve upward, above the text

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
     * Render octave markings using canvas overlay
     */
    renderOctaveMarkings(document) {
        if (!this.octaveCtx) return;

        const startTime = performance.now();

        // Clear canvas
        this.octaveCtx.clearRect(0, 0, this.octaveCanvas.width, this.octaveCanvas.height);

        let octavesRendered = 0;

        document.staves.forEach((stave, staveIndex) => {
            const lineNames = ['upper_line', 'line', 'lower_line', 'lyrics'];
            lineNames.forEach((lineName, laneIndex) => {
                const lane = stave[lineName];
                lane.forEach((charCell, cellIndex) => {
                    if (this.hasOctaveMarking(charCell)) {
                        this.renderOctaveDot(charCell, staveIndex, laneIndex, cellIndex);
                        octavesRendered++;
                    }
                });
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
        return charCell.octave !== undefined && charCell.octave !== 0;
    }

    /**
     * Render single octave dot above or below an element
     */
    renderOctaveDot(charCell, lineIndex, laneIndex, cellIndex) {
        const ctx = this.octaveCtx;

        // Calculate position with proper lane offsets
        const laneOffsets = [0, 16, 32, 48]; // Visual offsets for lanes
        const laneOffset = laneOffsets[laneIndex] || 16;

        const centerX = (charCell.x || (cellIndex * 12)) + (charCell.w || 12) / 2;
        const baseY = laneOffset + (charCell.y || 0);

        // Determine dot position based on octave value
        let dotY, dotCount, dotColor;

        switch (charCell.octave) {
            case 1: // Octave up - dots above
                dotY = baseY - 12; // 12px above element
                dotCount = 1;
                dotColor = '#10b981'; // Green for octave up
                break;
            case 2: // Two octaves up - two dots above
                dotY = baseY - 12;
                dotCount = 2;
                dotColor = '#10b981';
                break;
            case -1: // Octave down - dots below
                dotY = baseY + 20; // 20px below element
                dotCount = 1;
                dotColor = '#f59e0b'; // Orange for octave down
                break;
            case -2: // Two octaves down - two dots below
                dotY = baseY + 20;
                dotCount = 2;
                dotColor = '#f59e0b';
                break;
            default:
                return; // No octave marking for octave 0
        }

        // Set dot styling
        ctx.fillStyle = dotColor;
        ctx.strokeStyle = dotColor;
        ctx.lineWidth = 1;

        // Draw dots based on count
        for (let i = 0; i < dotCount; i++) {
            const offsetX = centerX + (i - (dotCount - 1) / 2) * 6; // Space dots 6px apart

            // Draw filled circle
            ctx.beginPath();
            ctx.arc(offsetX, dotY, 2, 0, Math.PI * 2);
            ctx.fill();

            // Add subtle border for better visibility
            ctx.beginPath();
            ctx.arc(offsetX, dotY, 2.5, 0, Math.PI * 2);
            ctx.stroke();
        }

        // Add small connecting line for multiple dots (visual enhancement)
        if (dotCount > 1) {
            ctx.beginPath();
            const firstDotX = centerX + (0 - (dotCount - 1) / 2) * 6;
            const lastDotX = centerX + ((dotCount - 1) - (dotCount - 1) / 2) * 6;
            ctx.moveTo(firstDotX, dotY);
            ctx.lineTo(lastDotX, dotY);
            ctx.stroke();
        }
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
        for (let child of this.canvas.children) {
            if (child !== this.slurCanvas && child !== this.octaveCanvas) {
                childrenToRemove.push(child);
            }
        }

        // Remove all non-canvas children (line elements and their children)
        childrenToRemove.forEach(child => this.canvas.removeChild(child));

        // Clear slur canvas
        if (this.slurCtx) {
            this.slurCtx.clearRect(0, 0, this.slurCanvas.width, this.slurCanvas.height);
        }

        // Clear octave canvas
        if (this.octaveCtx) {
            this.octaveCtx.clearRect(0, 0, this.octaveCanvas.width, this.octaveCanvas.height);
        }

        // Re-setup canvases if they were removed
        if (!this.slurCanvas.parentElement) {
            this.setupSlurCanvas();
        }
        if (!this.octaveCanvas.parentElement) {
            this.setupOctaveCanvas();
        }
    }

    /**
     * Update cursor position
     */
    updateCursor(position) {
        const cursor = this.getOrCreateCursorElement();

        if (position !== undefined) {
            const x = position * 12; // Approximate character width
            const y = 0; // Baseline position

            cursor.style.left = `${x}px`;
            cursor.style.top = `${y}px`;
        }

        cursor.style.display = 'block';
    }

    /**
     * Get or create cursor element
     */
    getOrCreateCursorElement() {
        let cursor = document.querySelector('.cursor-indicator');
        if (!cursor) {
            cursor = document.createElement('div');
            cursor.className = 'cursor-indicator';
            cursor.style.position = 'absolute';
            cursor.style.width = '2px';
            cursor.style.height = '16px';
            cursor.style.backgroundColor = '#0066cc';
            cursor.style.zIndex = '5';
            cursor.style.pointerEvents = 'none';

            this.canvas.appendChild(cursor);
        }
        return cursor;
    }

    /**
     * Hide cursor
     */
    hideCursor() {
        const cursor = document.querySelector('.cursor-indicator');
        if (cursor) {
            cursor.style.display = 'none';
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

        // Update octave canvas size
        if (this.octaveCanvas) {
            this.octaveCanvas.width = this.canvas.offsetWidth;
            this.octaveCanvas.height = this.canvas.offsetHeight;
        }
    }
}

export default DOMRenderer;