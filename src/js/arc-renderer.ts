/**
 * SVG Arc Renderer for Music Notation Editor
 *
 * Renders both slurs and beat loops as smooth Bézier curves using SVG overlay,
 * using a unified approach with upward arcs for slurs and downward arcs for beat loops.
 */

import { CELL_Y_OFFSET } from './constants.js';

interface ArcOptions {
  skipBeatLoops?: boolean;
}

interface RenderArc {
  id: string;
  start_x: number;
  start_y: number;
  end_x: number;
  end_y: number;
  cp1_x: number;
  cp1_y: number;
  cp2_x: number;
  cp2_y: number;
  color: string;
  direction?: 'up' | 'down';
}

interface DisplayLine {
  y: number;
  height: number;
  slurs?: RenderArc[];
  beat_loops?: RenderArc[];
  ornament_arcs?: RenderArc[];
}

interface DisplayList {
  lines: DisplayLine[];
}

interface CellRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface ArcSpan {
  id: string;
  startCell: CellRect;
  endCell: CellRect;
  lineIndex: number;
  startIndex: number;
  endIndex: number;
}

interface ArcPathOptions {
  direction: 'up' | 'down';
  color: string;
}

class ArcRenderer {
  private container: HTMLElement;
  private svgOverlay: SVGSVGElement | null = null;
  private slurGroup: SVGGElement | null = null;
  private beatLoopGroup: SVGGElement | null = null;
  private superscriptArcGroup: SVGGElement | null = null;
  private slurPaths: Map<string, SVGPathElement> = new Map();
  private beatLoopPaths: Map<string, SVGPathElement> = new Map();
  private superscriptArcPaths: Map<string, SVGPathElement> = new Map();
  private slurData: RenderArc[] = [];
  private beatLoopData: RenderArc[] = [];
  private superscriptArcData: RenderArc[] = [];
  private options: ArcOptions;

  constructor(containerElement: HTMLElement, options: ArcOptions = {}) {
    this.container = containerElement;
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
  setupSVGOverlay(): void {
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
   */
  isTextBasedLineRendering(): boolean {
    return true;
  }

  /**
   * Render both slurs and beat loops from cell data
   * Extracts spans and creates SVG paths
   */
  render(displayList: DisplayList): void {
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
   */
  renderSlurs(displayList: DisplayList): void {
    if (!displayList || !displayList.lines) {
      return;
    }

    const slurs: RenderArc[] = [];
    const lineElements = Array.from(document.querySelectorAll<HTMLElement>('.notation-line'));

    for (let lineIdx = 0; lineIdx < displayList.lines.length; lineIdx++) {
      const line = displayList.lines[lineIdx];
      const lineElement = lineElements[lineIdx];

      if (line.slurs && Array.isArray(line.slurs) && lineElement) {
        // Get gutter offset (cells are positioned relative to .line-content)
        const lineContent = lineElement.querySelector<HTMLElement>('.line-content');
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

    this.updateArcPathsFromData(slurs, this.slurPaths, this.slurGroup!);
    this.slurData = slurs;
  }

  /**
   * Render beat loops from DisplayList
   */
  renderBeatLoops(displayList: DisplayList): void {
    if (!displayList || !displayList.lines) {
      return;
    }

    const beatLoops: RenderArc[] = [];
    const lineElements = Array.from(document.querySelectorAll<HTMLElement>('.notation-line'));

    for (let lineIdx = 0; lineIdx < displayList.lines.length; lineIdx++) {
      const line = displayList.lines[lineIdx];
      const lineElement = lineElements[lineIdx];

      if (line.beat_loops && Array.isArray(line.beat_loops) && lineElement) {
        // Get gutter offset (cells are positioned relative to .line-content)
        const lineContent = lineElement.querySelector<HTMLElement>('.line-content');
        const gutterOffset = lineContent ? lineContent.offsetLeft : 0;

        for (const arc of line.beat_loops) {
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

    this.updateArcPathsFromData(beatLoops, this.beatLoopPaths, this.beatLoopGroup!);
    this.beatLoopData = beatLoops;
  }

  /**
   * Render superscript arcs from DisplayList
   */
  renderOrnamentArcs(displayList: DisplayList): void {
    if (!displayList || !displayList.lines) {
      return;
    }

    const superscriptArcs: RenderArc[] = [];
    const lineElements = Array.from(document.querySelectorAll<HTMLElement>('.notation-line'));

    let cumulativeY = 0;
    for (let lineIdx = 0; lineIdx < displayList.lines.length; lineIdx++) {
      const line = displayList.lines[lineIdx];
      const lineElement = lineElements[lineIdx];

      if (line.ornament_arcs && Array.isArray(line.ornament_arcs) && lineElement) {
        // Get gutter offset (cells are positioned relative to .line-content)
        const lineContent = lineElement.querySelector<HTMLElement>('.line-content');
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

    this.updateArcPathsFromData(superscriptArcs, this.superscriptArcPaths, this.superscriptArcGroup!);
    this.superscriptArcData = superscriptArcs;
  }

  /**
   * Extract slur spans from a rendered line
   */
  extractSlursFromLine(lineIndex: number): ArcSpan[] {
    const slurs: ArcSpan[] = [];
    let slurStart: { cellIndex: number; container: HTMLElement; lineIndex: number } | null = null;

    // Find the rendered line in DOM
    const lineElement = document.querySelector(`[data-line="${lineIndex}"]`);
    if (!lineElement) {
      return slurs;
    }

    // Get all cell-containers in this line
    const containers = lineElement.querySelectorAll<HTMLElement>('.cell-container');

    containers.forEach((container, i) => {
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

        slurStart = null;
      }
    });

    return slurs;
  }

  /**
   * Extract beat loop spans from a rendered line
   */
  extractBeatLoopsFromLine(lineIndex: number): ArcSpan[] {
    const beatLoops: ArcSpan[] = [];
    let loopStart: { cellIndex: number; container: HTMLElement; lineIndex: number } | null = null;

    const lineElement = document.querySelector(`[data-line="${lineIndex}"]`);
    if (!lineElement) {
      return beatLoops;
    }

    const containers = lineElement.querySelectorAll<HTMLElement>('.cell-container');

    containers.forEach((container, i) => {
      const isLoopStart = container.classList.contains('beat-loop-first');
      const isLoopEnd = container.classList.contains('beat-loop-last');

      if (isLoopStart) {
        loopStart = {
          cellIndex: i,
          container: container,
          lineIndex: lineIndex
        };
      }

      if (isLoopEnd && loopStart) {
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

        loopStart = null;
      }
    });

    return beatLoops;
  }

  /**
   * Update SVG paths from pre-computed RenderArc data
   */
  updateArcPathsFromData(
    arcs: RenderArc[],
    pathsMap: Map<string, SVGPathElement>,
    group: SVGGElement
  ): void {
    const activeArcIds = new Set<string>();

    for (const arc of arcs) {
      activeArcIds.add(arc.id);

      let path = pathsMap.get(arc.id);

      if (!path) {
        path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', arc.color);

        const isOrnamentArc = arc.id && arc.id.includes('ornament');

        path.setAttribute('stroke-width', isOrnamentArc ? '1.5' : '1.5');
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('stroke-linejoin', 'round');
        path.setAttribute('stroke-dasharray', '');
        path.setAttribute('vector-effect', 'non-scaling-stroke');

        if (isOrnamentArc) {
          path.classList.add('superscript-arc-path');
        } else {
          path.classList.add(`${arc.direction === 'up' ? 'slur' : 'beat-loop'}-path`);
        }

        group.appendChild(path);
        pathsMap.set(arc.id, path);
      }

      const pathData = `M ${arc.start_x} ${arc.start_y} C ${arc.cp1_x} ${arc.cp1_y}, ${arc.cp2_x} ${arc.cp2_y}, ${arc.end_x} ${arc.end_y}`;
      path.setAttribute('d', pathData);
    }

    for (const [id, path] of pathsMap.entries()) {
      if (!activeArcIds.has(id)) {
        group.removeChild(path);
        pathsMap.delete(id);
      }
    }
  }

  updateArcPaths(
    arcs: ArcSpan[],
    pathsMap: Map<string, SVGPathElement>,
    group: SVGGElement,
    options: ArcPathOptions
  ): void {
    const activeArcIds = new Set<string>();

    for (const arc of arcs) {
      activeArcIds.add(arc.id);

      let path = pathsMap.get(arc.id);

      if (!path) {
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

      const pathData = this.calculateArcPath(arc, options);
      path.setAttribute('d', pathData);
    }

    for (const [id, path] of pathsMap.entries()) {
      if (!activeArcIds.has(id)) {
        group.removeChild(path);
        pathsMap.delete(id);
      }
    }
  }

  /**
   * Calculate Bézier curve path for an arc
   */
  calculateArcPath(arc: ArcSpan, options: ArcPathOptions): string {
    const { startCell, endCell } = arc;
    const isDownward = options.direction === 'down';

    const extensionOffset = 4;

    let x0: number, y0: number, x1: number, y1: number;

    if (isDownward) {
      x0 = startCell.x + (startCell.w / 2) - extensionOffset;
      y0 = startCell.y + startCell.h;
      x1 = endCell.x + (endCell.w / 2) + extensionOffset;
      y1 = endCell.y + endCell.h;
    } else {
      x0 = startCell.x + (startCell.w / 2) - extensionOffset;
      y0 = startCell.y;
      x1 = endCell.x + (endCell.w / 2) + extensionOffset;
      y1 = endCell.y;
    }

    const span = Math.abs(x1 - x0);

    let archHeight: number;

    if (isDownward) {
      if (span <= 8) {
        archHeight = 3;
      } else {
        archHeight = 3 + ((span - 8) * 0.05);
        archHeight = Math.min(archHeight, 8);
      }
    } else {
      archHeight = span * 0.25;
      archHeight = Math.max(6, Math.min(archHeight, 28));

      if (span > 300) {
        archHeight *= 0.7;
      }
    }

    const directionMultiplier = isDownward ? 1 : -1;

    const c1x = x0 + (span * 0.55);
    const c1y = y0 + (archHeight * directionMultiplier);
    const c2x = x0 + (span * 0.60);
    const c2y = y1 + (archHeight * directionMultiplier);

    return `M ${x0} ${y0} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${x1} ${y1}`;
  }

  /**
   * Clear all arcs from the overlay
   */
  clearAllArcs(): void {
    this.clearSlurs();
    this.clearBeatLoops();
    this.clearOrnamentArcs();
  }

  /**
   * Clear all slurs from the overlay
   */
  clearSlurs(): void {
    if (this.slurGroup) {
      for (const path of this.slurPaths.values()) {
        this.slurGroup.removeChild(path);
      }
    }
    this.slurPaths.clear();
    this.slurData = [];
  }

  /**
   * Clear all beat loops from the overlay
   */
  clearBeatLoops(): void {
    if (this.beatLoopGroup) {
      for (const path of this.beatLoopPaths.values()) {
        this.beatLoopGroup.removeChild(path);
      }
    }
    this.beatLoopPaths.clear();
    this.beatLoopData = [];
  }

  /**
   * Clear all superscript arcs from the overlay
   */
  clearOrnamentArcs(): void {
    if (this.superscriptArcGroup) {
      for (const path of this.superscriptArcPaths.values()) {
        this.superscriptArcGroup.removeChild(path);
      }
    }
    this.superscriptArcPaths.clear();
    this.superscriptArcData = [];
  }

  /**
   * Destroy the arc renderer and cleanup
   */
  destroy(): void {
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
