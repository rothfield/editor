/**
 * SVG Slur Renderer for Music Notation Editor
 *
 * Renders slurs as smooth Bézier curves using SVG overlay,
 * following the advice from ChatGPT for optimal visual quality.
 */

import { CELL_Y_OFFSET } from './constants.js';

class SlurRenderer {
  constructor(containerElement) {
    this.container = containerElement;
    this.svgOverlay = null;
    this.slurPaths = new Map(); // Map of slur ID to SVG path element
    this.slurData = []; // Current slur data for comparison

    this.setupSVGOverlay();
  }

  /**
   * Setup SVG overlay container
   * Positioned absolutely above the notation with no pointer events
   */
  setupSVGOverlay() {
    // Create SVG element
    this.svgOverlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svgOverlay.classList.add('slur-overlay');
    this.svgOverlay.style.cssText = `
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      overflow: visible;
      z-index: 10;
    `;

    // Append to container
    this.container.appendChild(this.svgOverlay);
  }

  /**
   * Render slurs from cell data
   * Extracts slur spans and creates SVG paths
   *
   * @param {Object} displayList - DisplayList from Rust layout engine
   */
  renderSlurs(displayList) {
    if (!displayList || !displayList.lines) {
      return;
    }

    const slurs = [];

    // Extract slur spans from each line
    for (const renderLine of displayList.lines) {
      const lineSlurs = this.extractSlursFromLine(renderLine);
      slurs.push(...lineSlurs);
    }

    // Update SVG paths (reuse existing paths where possible)
    this.updateSlurPaths(slurs);

    // Store for comparison on next render
    this.slurData = slurs;
  }

  /**
   * Extract slur spans from a rendered line
   * Scans cells for SlurIndicator markers
   *
   * @param {Object} renderLine - RenderLine from DisplayList
   * @returns {Array} Array of slur span objects
   */
  extractSlursFromLine(renderLine) {
    const slurs = [];
    let slurStart = null;

    for (let i = 0; i < renderLine.cells.length; i++) {
      const cellData = renderLine.cells[i];

      // Check for slur-first class (indicates SlurStart)
      const isSlurStart = cellData.classes.includes('slur-first');
      const isSlurEnd = cellData.classes.includes('slur-last');

      if (isSlurStart) {
        slurStart = {
          cellIndex: i,
          cellData: cellData,
          lineIndex: renderLine.line_index
        };
      }

      if (isSlurEnd && slurStart) {
        // Create slur span
        slurs.push({
          id: `slur-${renderLine.line_index}-${slurStart.cellIndex}-${i}`,
          startCell: slurStart.cellData,
          endCell: cellData,
          lineIndex: renderLine.line_index,
          startIndex: slurStart.cellIndex,
          endIndex: i
        });

        slurStart = null; // Reset for next slur
      }
    }

    return slurs;
  }

  /**
   * Update SVG paths for slurs
   * Reuses existing paths and updates their `d` attribute
   * Removes stale paths and creates new ones as needed
   *
   * @param {Array} slurs - Array of slur span objects
   */
  updateSlurPaths(slurs) {
    const activeSlurIds = new Set();

    // Update or create paths for each slur
    for (const slur of slurs) {
      activeSlurIds.add(slur.id);

      let path = this.slurPaths.get(slur.id);

      if (!path) {
        // Create new path element
        path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', '#4a5568'); // Tailwind gray-700
        path.setAttribute('stroke-width', '1.5');
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('vector-effect', 'non-scaling-stroke');
        path.classList.add('slur-path');

        this.svgOverlay.appendChild(path);
        this.slurPaths.set(slur.id, path);
      }

      // Calculate and set path data
      const pathData = this.calculateSlurPath(slur);
      path.setAttribute('d', pathData);
    }

    // Remove stale paths (slurs that no longer exist)
    for (const [id, path] of this.slurPaths.entries()) {
      if (!activeSlurIds.has(id)) {
        this.svgOverlay.removeChild(path);
        this.slurPaths.delete(id);
      }
    }
  }

  /**
   * Calculate Bézier curve path for a slur
   * Uses cubic Bézier with control points positioned for musical aesthetics
   *
   * Algorithm based on professional music engraving principles:
   * - Anchor points at cell centers
   * - Height grows proportionally with span (25% of width)
   * - Clamped between 6-28px for visual balance
   * - Very long slurs (>300px) are softened to avoid dramatic arching
   * - Asymmetric curve (55-60% from start) for natural appearance
   *
   * @param {Object} slur - Slur span object
   * @returns {string} SVG path data string
   */
  calculateSlurPath(slur) {
    const { startCell, endCell } = slur;

    // Get anchor points (center-top of each cell)
    const x0 = startCell.x + (startCell.w / 2);
    const y0 = startCell.y;
    const x1 = endCell.x + (endCell.w / 2);
    const y1 = endCell.y;

    // Calculate horizontal span
    const span = Math.abs(x1 - x0);

    // Calculate arch height with musical engraving principles:
    // - Base height = 25% of span
    // - Minimum 6px (short two-note slurs)
    // - Maximum 28px (avoid dramatic arching)
    let archHeight = span * 0.25;
    archHeight = Math.max(6, Math.min(archHeight, 28));

    // Soften very long slurs to maintain natural curvature
    // (prevents overly dramatic arches on wide phrases)
    if (span > 300) {
      archHeight *= 0.7;
    }

    // Control points for cubic Bézier
    // Place them at 55% and 60% of horizontal span for subtle asymmetry
    // This creates a natural rise that peaks slightly past the midpoint
    const c1x = x0 + (span * 0.55);
    const c1y = y0 - archHeight;
    const c2x = x0 + (span * 0.60);
    const c2y = y1 - archHeight;

    // Generate SVG path data
    // Format: M x0 y0 C c1x c1y, c2x c2y, x1 y1
    return `M ${x0} ${y0} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${x1} ${y1}`;
  }

  /**
   * Clear all slurs from the overlay
   */
  clearSlurs() {
    // Remove all path elements
    for (const path of this.slurPaths.values()) {
      this.svgOverlay.removeChild(path);
    }
    this.slurPaths.clear();
    this.slurData = [];
  }

  /**
   * Destroy the slur renderer and cleanup
   */
  destroy() {
    this.clearSlurs();
    if (this.svgOverlay && this.svgOverlay.parentNode) {
      this.svgOverlay.parentNode.removeChild(this.svgOverlay);
    }
    this.svgOverlay = null;
  }
}

export default SlurRenderer;
