/**
 * SVG Arc Renderer for Music Notation Editor
 *
 * Renders both slurs and beat loops as smooth Bézier curves using SVG overlay,
 * using a unified approach with upward arcs for slurs and downward arcs for beat loops.
 */

import { CELL_Y_OFFSET } from './constants.js';

class ArcRenderer {
  constructor(containerElement, options = {}) {
    this.container = containerElement;
    this.svgOverlay = null;
    this.slurPaths = new Map(); // Map of slur ID to SVG path element
    this.beatLoopPaths = new Map(); // Map of beat loop ID to SVG path element
    this.superscriptArcPaths = new Map(); // Map of superscript arc ID to SVG path element
    this.slurData = []; // Current slur data for comparison
    this.beatLoopData = []; // Current beat loop data for comparison
    this.superscriptArcData = []; // Current superscript arc data for comparison

    // Configuration options
    this.options = {
      skipBeatLoops: options.skipBeatLoops || false,
      ...options
    };

    this.setupSVGOverlay();
  }

  /**
   * Setup SVG overlay container with separate groups for slurs and beat loops
   * Positioned absolutely above the notation with no pointer events
   */
  setupSVGOverlay() {
    // Create SVG element
    this.svgOverlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svgOverlay.classList.add('arc-overlay');
    this.svgOverlay.style.cssText = `
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      overflow: visible;
      z-index: 10;
    `;

    // Create group for slurs (above cells)
    this.slurGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    this.slurGroup.setAttribute('id', 'slurs');
    this.svgOverlay.appendChild(this.slurGroup);

    // Create group for beat loops (below cells)
    this.beatLoopGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    this.beatLoopGroup.setAttribute('id', 'beat-loops');
    this.svgOverlay.appendChild(this.beatLoopGroup);

    // Create group for superscript arcs (above cells, shallow arcs)
    this.superscriptArcGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    this.superscriptArcGroup.setAttribute('id', 'superscript-arcs');
    this.svgOverlay.appendChild(this.superscriptArcGroup);

    // Append to container
    this.container.appendChild(this.svgOverlay);
  }

  /**
   * Check if text-based line rendering is enabled (font glyphs have arcs baked in)
   * @returns {boolean} True if text-based rendering is enabled
   */
  isTextBasedLineRendering() {
    try {
      const stored = localStorage.getItem('musicEditorPreferences');
      if (stored) {
        const prefs = JSON.parse(stored);
        return prefs.lineRenderingMode === 'text';
      }
    } catch (e) {
      // Default to text-based if error reading preferences
    }
    return true; // Default: text-based (new architecture)
  }

  /**
   * Render both slurs and beat loops from cell data
   * Extracts spans and creates SVG paths
   *
   * @param {Object} displayList - DisplayList from Rust layout engine
   */
  render(displayList) {
    if (!displayList || !displayList.lines) {
      return;
    }

    // When text-based rendering is enabled, font glyphs have arcs baked in
    // Skip SVG overlay rendering for slurs and beat loops
    const useTextBased = this.isTextBasedLineRendering();

    if (!useTextBased) {
      this.renderSlurs(displayList);
    }

    // Skip beat loops if configured OR if using text-based rendering
    if (!this.options.skipBeatLoops && !useTextBased) {
      this.renderBeatLoops(displayList);
    }

    // Superscript arcs are always SVG (not part of 19-variant system)
    this.renderOrnamentArcs(displayList);
  }

  /**
   * Render slurs from DisplayList
   *
   * @param {Object} displayList - DisplayList from Rust layout engine
   */
  renderSlurs(displayList) {
    if (!displayList || !displayList.lines) {
      return;
    }

    const slurs = [];
    const lineElements = Array.from(document.querySelectorAll('.notation-line'));

    for (let lineIdx = 0; lineIdx < displayList.lines.length; lineIdx++) {
      const line = displayList.lines[lineIdx];
      const lineElement = lineElements[lineIdx];

      if (line.slurs && Array.isArray(line.slurs) && lineElement) {
        // Get gutter offset (cells are positioned relative to .line-content)
        const lineContent = lineElement.querySelector('.line-content');
        const gutterOffset = lineContent ? lineContent.offsetLeft : 0;

        for (const arc of line.slurs) {
          slurs.push({
            ...arc,
            // Add gutter offset to X-coordinates
            start_x: arc.start_x + gutterOffset,
            end_x: arc.end_x + gutterOffset,
            cp1_x: arc.cp1_x + gutterOffset,
            cp2_x: arc.cp2_x + gutterOffset,
            // Convert Y-coordinates from line-relative to SVG absolute
            start_y: (arc.start_y - line.y) + lineElement.offsetTop,
            end_y: (arc.end_y - line.y) + lineElement.offsetTop,
            cp1_y: (arc.cp1_y - line.y) + lineElement.offsetTop,
            cp2_y: (arc.cp2_y - line.y) + lineElement.offsetTop
          });
        }
      }
    }

    this.updateArcPathsFromData(slurs, this.slurPaths, this.slurGroup);
    this.slurData = slurs;
  }

  /**
   * Render beat loops from DisplayList
   * Cells in Rust have absolute Y (cumulative), but are rendered relative within lines.
   * SVG is absolute, so we convert: relative Y within line + line's DOM offsetTop
   *
   * @param {Object} displayList - DisplayList from Rust layout engine
   */
  renderBeatLoops(displayList) {
    if (!displayList || !displayList.lines) {
      return;
    }

    const beatLoops = [];
    const lineElements = Array.from(document.querySelectorAll('.notation-line'));

    for (let lineIdx = 0; lineIdx < displayList.lines.length; lineIdx++) {
      const line = displayList.lines[lineIdx];
      const lineElement = lineElements[lineIdx];

      if (line.beat_loops && Array.isArray(line.beat_loops) && lineElement) {
        // Get gutter offset (cells are positioned relative to .line-content)
        const lineContent = lineElement.querySelector('.line-content');
        const gutterOffset = lineContent ? lineContent.offsetLeft : 0;

        for (const arc of line.beat_loops) {
          // Arc Y is absolute from Rust. Convert to line-relative, then add line's DOM position
          // Line-relative = arc.y - line.y (line.y computed in WASM)
          // SVG absolute = line-relative + lineElement.offsetTop
          beatLoops.push({
            ...arc,
            // Add gutter offset to X-coordinates
            start_x: arc.start_x + gutterOffset,
            end_x: arc.end_x + gutterOffset,
            cp1_x: arc.cp1_x + gutterOffset,
            cp2_x: arc.cp2_x + gutterOffset,
            // Convert Y-coordinates from line-relative to SVG absolute
            start_y: (arc.start_y - line.y) + lineElement.offsetTop,
            end_y: (arc.end_y - line.y) + lineElement.offsetTop,
            cp1_y: (arc.cp1_y - line.y) + lineElement.offsetTop,
            cp2_y: (arc.cp2_y - line.y) + lineElement.offsetTop
          });
        }
      }
    }

    this.updateArcPathsFromData(beatLoops, this.beatLoopPaths, this.beatLoopGroup);
    this.beatLoopData = beatLoops;
  }

  /**
   * Render superscript arcs from DisplayList
   *
   * @param {Object} displayList - DisplayList from Rust layout engine
   */
  renderOrnamentArcs(displayList) {
    if (!displayList || !displayList.lines) {
      return;
    }

    const superscriptArcs = [];
    const lineElements = Array.from(document.querySelectorAll('.notation-line'));

    let cumulativeY = 0;
    for (let lineIdx = 0; lineIdx < displayList.lines.length; lineIdx++) {
      const line = displayList.lines[lineIdx];
      const lineElement = lineElements[lineIdx];

      if (line.ornament_arcs && Array.isArray(line.ornament_arcs) && lineElement) {
        // Get gutter offset (cells are positioned relative to .line-content)
        const lineContent = lineElement.querySelector('.line-content');
        const gutterOffset = lineContent ? lineContent.offsetLeft : 0;

        for (const arc of line.ornament_arcs) {
          superscriptArcs.push({
            ...arc,
            // Add gutter offset to X-coordinates
            start_x: arc.start_x + gutterOffset,
            end_x: arc.end_x + gutterOffset,
            cp1_x: arc.cp1_x + gutterOffset,
            cp2_x: arc.cp2_x + gutterOffset,
            // Convert Y-coordinates from cumulative to SVG absolute
            start_y: (arc.start_y - cumulativeY) + lineElement.offsetTop,
            end_y: (arc.end_y - cumulativeY) + lineElement.offsetTop,
            cp1_y: (arc.cp1_y - cumulativeY) + lineElement.offsetTop,
            cp2_y: (arc.cp2_y - cumulativeY) + lineElement.offsetTop
          });
        }
      }

      cumulativeY += line.height;
    }

    this.updateArcPathsFromData(superscriptArcs, this.superscriptArcPaths, this.superscriptArcGroup);
    this.superscriptArcData = superscriptArcs;
  }

  /**
   * Extract slur spans from a rendered line
   * Scans DOM for cell-container elements with slur-first/slur-last classes
   *
   * @param {number} lineIndex - Line index to find in DOM
   * @returns {Array} Array of slur span objects
   */
  extractSlursFromLine(lineIndex) {
    const slurs = [];
    let slurStart = null;

    // Find the rendered line in DOM
    const lineElement = document.querySelector(`[data-line="${lineIndex}"]`);
    if (!lineElement) {
      return slurs;
    }

    // Get all cell-containers in this line
    const containers = lineElement.querySelectorAll('.cell-container');

    containers.forEach((container, i) => {
      // Check for slur-first class (indicates SlurStart)
      const isSlurStart = container.classList.contains('slur-first');
      const isSlurEnd = container.classList.contains('slur-last');

      if (isSlurStart) {
        slurStart = {
          cellIndex: i,
          container: container,
          lineIndex: lineIndex
        };
      }

      if (isSlurEnd && slurStart) {
        // Extract position from container styles
        const startRect = slurStart.container.getBoundingClientRect();
        const endRect = container.getBoundingClientRect();

        // Create slur span
        slurs.push({
          id: `slur-${lineIndex}-${slurStart.cellIndex}-${i}`,
          startCell: {
            x: slurStart.container.offsetLeft,
            y: slurStart.container.offsetTop,
            w: slurStart.container.offsetWidth,
            h: slurStart.container.offsetHeight
          },
          endCell: {
            x: container.offsetLeft,
            y: container.offsetTop,
            w: container.offsetWidth,
            h: container.offsetHeight
          },
          lineIndex: lineIndex,
          startIndex: slurStart.cellIndex,
          endIndex: i
        });

        slurStart = null; // Reset for next slur
      }
    });

    return slurs;
  }

  /**
   * Extract beat loop spans from a rendered line
   * Scans DOM for cell-container elements with beat-loop-first/beat-loop-last classes
   *
   * @param {number} lineIndex - Line index to find in DOM
   * @returns {Array} Array of beat loop span objects
   */
  extractBeatLoopsFromLine(lineIndex) {
    const beatLoops = [];
    let loopStart = null;

    // Find the rendered line in DOM
    const lineElement = document.querySelector(`[data-line="${lineIndex}"]`);
    if (!lineElement) {
      return beatLoops;
    }

    // Get all cell-containers in this line
    const containers = lineElement.querySelectorAll('.cell-container');

    containers.forEach((container, i) => {
      // Check for beat loop role markers
      const isLoopStart = container.classList.contains('beat-loop-first');
      const isLoopEnd = container.classList.contains('beat-loop-last');
      const isLoopMiddle = container.classList.contains('beat-loop-middle');

      if (isLoopStart) {
        loopStart = {
          cellIndex: i,
          container: container,
          lineIndex: lineIndex
        };
      }

      if (isLoopEnd && loopStart) {
        // Create beat loop span
        beatLoops.push({
          id: `beat-loop-${lineIndex}-${loopStart.cellIndex}-${i}`,
          startCell: {
            x: loopStart.container.offsetLeft,
            y: loopStart.container.offsetTop,
            w: loopStart.container.offsetWidth,
            h: loopStart.container.offsetHeight
          },
          endCell: {
            x: container.offsetLeft,
            y: container.offsetTop,
            w: container.offsetWidth,
            h: container.offsetHeight
          },
          lineIndex: lineIndex,
          startIndex: loopStart.cellIndex,
          endIndex: i
        });

        loopStart = null; // Reset for next loop
      }
    });

    return beatLoops;
  }

  /**
   * Update SVG paths for arcs (slurs or beat loops)
   * Reuses existing paths and updates their `d` attribute
   * Removes stale paths and creates new ones as needed
   *
   * @param {Array} arcs - Array of arc span objects (slurs or beat loops)
   * @param {Map} pathsMap - Map of arc ID to SVG path element
   * @param {SVGGroup} group - SVG group element to append paths to
   * @param {Object} options - Rendering options (direction, color)
   */
  /**
   * Update SVG paths from pre-computed RenderArc data
   * (Rust layout engine already computed bezier control points)
   *
   * @param {Array} arcs - RenderArc objects with pre-computed control points
   * @param {Map} pathsMap - Map of arc ID to SVG path element
   * @param {SVGElement} group - SVG group to append paths to
   */
  updateArcPathsFromData(arcs, pathsMap, group) {
    const activeArcIds = new Set();

    // Update or create paths for each pre-computed arc
    for (const arc of arcs) {
      activeArcIds.add(arc.id);

      let path = pathsMap.get(arc.id);

      if (!path) {
        // Create new path element
        path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', arc.color);

        // Check if this is an superscript arc (by ID)
        const isOrnamentArc = arc.id && arc.id.includes('ornament');

        // Set stroke properties
        path.setAttribute('stroke-width', isOrnamentArc ? '1.5' : '1.5');
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('stroke-linejoin', 'round');
        path.setAttribute('stroke-dasharray', '');  // Explicitly empty for solid line
        path.setAttribute('vector-effect', 'non-scaling-stroke');

        // Add appropriate class
        if (isOrnamentArc) {
          path.classList.add('superscript-arc-path');
        } else {
          path.classList.add(`${arc.direction === 'up' ? 'slur' : 'beat-loop'}-path`);
        }

        group.appendChild(path);
        pathsMap.set(arc.id, path);
      }

      // Build cubic bezier path from pre-computed control points
      const pathData = `M ${arc.start_x} ${arc.start_y} C ${arc.cp1_x} ${arc.cp1_y}, ${arc.cp2_x} ${arc.cp2_y}, ${arc.end_x} ${arc.end_y}`;
      path.setAttribute('d', pathData);
    }

    // Remove stale paths (arcs that no longer exist)
    for (const [id, path] of pathsMap.entries()) {
      if (!activeArcIds.has(id)) {
        group.removeChild(path);
        pathsMap.delete(id);
      }
    }
  }

  updateArcPaths(arcs, pathsMap, group, options) {
    const activeArcIds = new Set();

    // Update or create paths for each arc
    for (const arc of arcs) {
      activeArcIds.add(arc.id);

      let path = pathsMap.get(arc.id);

      if (!path) {
        // Create new path element
        path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', options.color);
        path.setAttribute('stroke-width', '1.5');
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('vector-effect', 'non-scaling-stroke');
        path.classList.add(`${options.direction === 'up' ? 'slur' : 'beat-loop'}-path`);

        group.appendChild(path);
        pathsMap.set(arc.id, path);
      }

      // Calculate and set path data
      const pathData = this.calculateArcPath(arc, options);
      path.setAttribute('d', pathData);
    }

    // Remove stale paths (arcs that no longer exist)
    for (const [id, path] of pathsMap.entries()) {
      if (!activeArcIds.has(id)) {
        group.removeChild(path);
        pathsMap.delete(id);
      }
    }
  }

  /**
   * Calculate Bézier curve path for an arc (slur or beat loop)
   * Uses cubic Bézier with control points positioned for musical aesthetics
   *
   * Algorithm:
   *
   * SLURS (upward):
   * - Anchor points at cell centers
   * - Height grows proportionally with span (25% of width)
   * - Clamped between 6-28px for visual balance
   * - Very long arcs (>300px) are softened to avoid dramatic arching
   * - Asymmetric curve (55-60% from start) for natural appearance
   *
   * BEAT LOOPS (downward):
   * - Anchor points at cell centers
   * - Shallow by design: 3px for small spans (≤8 units)
   * - Grows very gradually: +0.05px per unit beyond 8
   * - Maximum 8px to keep them subtle and non-intrusive
   * - Asymmetric curve (55-60% from start) for natural appearance
   *
   * @param {Object} arc - Arc span object
   * @param {Object} options - Rendering options (direction: 'up' or 'down')
   * @returns {string} SVG path data string
   */
  calculateArcPath(arc, options) {
    const { startCell, endCell } = arc;
    const isDownward = options.direction === 'down';

    // Extension offset: start curve before first note and end after last note
    // This creates a more flowing appearance that extends slightly beyond the note bounds
    const extensionOffset = 4; // pixels to extend on each side

    // Get anchor points (center-top of each cell for upward, center-bottom for downward)
    let x0, y0, x1, y1;

    if (isDownward) {
      // Downward arcs: anchor at bottom of cell, extended beyond note boundaries
      x0 = startCell.x + (startCell.w / 2) - extensionOffset;
      y0 = startCell.y + startCell.h;
      x1 = endCell.x + (endCell.w / 2) + extensionOffset;
      y1 = endCell.y + endCell.h;
    } else {
      // Upward arcs: anchor at top of cell, extended beyond note boundaries
      x0 = startCell.x + (startCell.w / 2) - extensionOffset;
      y0 = startCell.y;
      x1 = endCell.x + (endCell.w / 2) + extensionOffset;
      y1 = endCell.y;
    }

    // Calculate horizontal span
    const span = Math.abs(x1 - x0);

    // Calculate arch height based on arc type
    let archHeight;

    if (isDownward) {
      // Beat loops: shallow arcs that only grow slightly with span
      // - Start at 3px for small spans (<=8)
      // - Grow gradually for larger spans, only slightly
      // - Maximum 8px to keep them subtle
      if (span <= 8) {
        archHeight = 3;
      } else {
        // For each pixel beyond 8, add 0.05px of height (very gradual growth)
        archHeight = 3 + ((span - 8) * 0.05);
        archHeight = Math.min(archHeight, 8);
      }
    } else {
      // Slurs: professional music engraving principles
      // - Base height = 25% of span
      // - Minimum 6px (short two-note arcs)
      // - Maximum 28px (avoid dramatic arching)
      archHeight = span * 0.25;
      archHeight = Math.max(6, Math.min(archHeight, 28));

      // Soften very long arcs to maintain natural curvature
      // (prevents overly dramatic arches on wide phrases)
      if (span > 300) {
        archHeight *= 0.7;
      }
    }

    // Direction multiplier: 1 for upward, -1 for downward
    const directionMultiplier = isDownward ? 1 : -1;

    // Control points for cubic Bézier
    // Place them at 55% and 60% of horizontal span for subtle asymmetry
    // This creates a natural rise/fall that peaks/dips slightly past the midpoint
    const c1x = x0 + (span * 0.55);
    const c1y = y0 + (archHeight * directionMultiplier);
    const c2x = x0 + (span * 0.60);
    const c2y = y1 + (archHeight * directionMultiplier);

    // Generate SVG path data
    // Format: M x0 y0 C c1x c1y, c2x c2y, x1 y1
    return `M ${x0} ${y0} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${x1} ${y1}`;
  }

  /**
   * Clear all arcs from the overlay
   */
  clearAllArcs() {
    this.clearSlurs();
    this.clearBeatLoops();
    this.clearOrnamentArcs();
  }

  /**
   * Clear all slurs from the overlay
   */
  clearSlurs() {
    // Remove all path elements
    for (const path of this.slurPaths.values()) {
      this.slurGroup.removeChild(path);
    }
    this.slurPaths.clear();
    this.slurData = [];
  }

  /**
   * Clear all beat loops from the overlay
   */
  clearBeatLoops() {
    // Remove all path elements
    for (const path of this.beatLoopPaths.values()) {
      this.beatLoopGroup.removeChild(path);
    }
    this.beatLoopPaths.clear();
    this.beatLoopData = [];
  }

  /**
   * Clear all superscript arcs from the overlay
   */
  clearOrnamentArcs() {
    // Remove all path elements
    for (const path of this.superscriptArcPaths.values()) {
      this.superscriptArcGroup.removeChild(path);
    }
    this.superscriptArcPaths.clear();
    this.superscriptArcData = [];
  }

  /**
   * Destroy the arc renderer and cleanup
   */
  destroy() {
    this.clearAllArcs();
    if (this.svgOverlay && this.svgOverlay.parentNode) {
      this.svgOverlay.parentNode.removeChild(this.svgOverlay);
    }
    this.svgOverlay = null;
    this.slurGroup = null;
    this.beatLoopGroup = null;
    this.superscriptArcGroup = null;
  }
}

export default ArcRenderer;
