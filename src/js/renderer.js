/**
 * DOM Renderer for Music Notation Editor
 *
 * Coordinator class that delegates rendering concerns to specialized modules:
 * - StyleManager: CSS injection and font setup
 * - MeasurementService: Width measurements and caching
 * - CellRenderer: DisplayList to DOM conversion
 * - GutterManager: Gutter interactions and role management
 * - GroupBracketRenderer: Staff grouping visualization
 * - ArcRenderer: Slurs and beat loops (SVG overlay)
 */

import {
  BASE_FONT_SIZE,
  BASE_LINE_HEIGHT,
  LEFT_MARGIN_PX,
  CELL_Y_OFFSET,
  CELL_HEIGHT,
  BEAT_LOOP_OFFSET_BELOW,
  BEAT_LOOP_HEIGHT,
  SLUR_OFFSET_ABOVE
} from './constants.js';
import ArcRenderer from './arc-renderer.js';
import StyleManager from './style-manager.js';
import MeasurementService from './measurement-service.js';
import CellRenderer from './cell-renderer.js';
import GutterManager from './gutter-manager.js';
import GroupBracketRenderer from './group-bracket-renderer.js';
import logger, { LOG_CATEGORIES } from './logger.js';

class DOMRenderer {
  constructor(editorElement, editor, options = {}) {
    this.element = editorElement;
    this.editor = editor; // Store reference to editor instance
    this.charCellElements = new Map();
    this.beatLoopElements = new Map();
    this.theDocument = null;
    this.renderCache = new Map();

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

    // Initialize specialized rendering modules
    this.styleManager = new StyleManager({ fontMapping: this.options.fontMapping });
    this.styleManager.initialize();

    this.measurementService = new MeasurementService();
    this.cellRenderer = new CellRenderer(this.theDocument);
    this.gutterManager = new GutterManager(this.element, this.editor);
    this.gutterManager.initialize();

    this.groupBracketRenderer = new GroupBracketRenderer(this.element);

    // Initialize arc renderer (for slurs and beat loops)
    this.arcRenderer = new ArcRenderer(this.element, { skipBeatLoops: this.options.skipBeatLoops });
  }

  /**
   * Get gutter collapsed state (always false - gutter collapse removed)
   */
  get gutterCollapsed() {
    return false;
  }

  /**
   * Render group brackets (delegate to GroupBracketRenderer)
   */
  renderGroupBrackets() {
    this.groupBracketRenderer.render();
  }


  /**
   * Render entire document using Rust layout engine + thin JS DOM layer
   * @param {Object} doc - The document to render
   * @param {number[]} dirtyLineIndices - Optional array of line indices to render (incremental update)
   */
  renderDocument(doc, dirtyLineIndices = null) {
    const startTime = performance.now();

    logger.debug(LOG_CATEGORIES.RENDERER, 'renderDocument called', {
      lines: doc.lines?.length || 0,
      dirty: dirtyLineIndices
    });

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

    // STEP 1: Measure syllable widths (JS-only, native DOM)
    // NOTE: Cell/char widths now come from global glyph cache initialized at startup
    const measureStart = performance.now();
    const measurements = this.measurementService.measureAllWidths(doc);

    const measureTime = performance.now() - measureStart;
    logger.debug(LOG_CATEGORIES.PERFORMANCE, 'Syllable measurement time', {
      duration: `${measureTime.toFixed(2)}ms`,
      syllableCount: measurements.syllableWidths.length
    });

    // STEP 2: Call Rust ONCE to compute layout (cell/char widths from cache)
    const layoutStart = performance.now();
    const config = {
      syllable_widths: measurements.syllableWidths,
      font_size: BASE_FONT_SIZE,
      line_height: BASE_LINE_HEIGHT,
      left_margin: LEFT_MARGIN_PX,
      cell_y_offset: CELL_Y_OFFSET,
      cell_height: CELL_HEIGHT,
      min_syllable_padding: 4.0,
      word_spacing: 10.0,
      slur_offset_above: SLUR_OFFSET_ABOVE,
      beat_loop_offset_below: BEAT_LOOP_OFFSET_BELOW,
      beat_loop_height: BEAT_LOOP_HEIGHT,
    };

    logger.debug(LOG_CATEGORIES.RENDERER, 'computeLayout input', {
      has_selection: !!doc.state?.selection_manager?.current_selection,
      anchor: doc.state?.selection_manager?.current_selection?.anchor,
      head: doc.state?.selection_manager?.current_selection?.head
    });

    // Call WASM to compute layout
    const displayList = this.editor.wasmModule.computeLayout(doc, config);

    const layoutTime = performance.now() - layoutStart;
    logger.debug(LOG_CATEGORIES.PERFORMANCE, 'Layout time', {
      duration: `${layoutTime.toFixed(2)}ms`
    });

    // Cache DisplayList for cursor positioning
    this.displayList = displayList;
    this.editor.displayList = displayList; // Store in editor for tab display

    // STEP 3: Render from DisplayList (fast native JS DOM)
    const renderStart = performance.now();
    this.renderFromDisplayList(displayList, savedScrollLeft, savedScrollTop, dirtyLineIndices);
    const renderTime = performance.now() - renderStart;
    logger.debug(LOG_CATEGORIES.PERFORMANCE, 'DOM render time', { duration: `${renderTime.toFixed(2)}ms` });

    // Ornaments are now rendered from DisplayList in renderFromDisplayList()

    // STEP 4: Render group brackets based on line roles (user-editable)
    const bracketsStart = performance.now();
    this.renderGroupBrackets();
    const bracketsTime = performance.now() - bracketsStart;
    logger.debug(LOG_CATEGORIES.PERFORMANCE, 'Group bracket render time', { duration: `${bracketsTime.toFixed(2)}ms` });

    // Update render statistics
    const endTime = performance.now();
    this.renderStats.lastRenderTime = endTime - startTime;
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
      logger.error(LOG_CATEGORIES.RENDERER, 'Scroll container #editor-container not found!');
    }

    logger.debug(LOG_CATEGORIES.RENDERER, 'Using saved scroll position', { left: savedScrollLeft, top: savedScrollTop });
    logger.debug(LOG_CATEGORIES.RENDERER, 'Incremental render', { dirtyLineIndices });

    // INCREMENTAL RENDERING: Only update dirty lines
    if (dirtyLineIndices !== null && dirtyLineIndices.length > 0) {
      // Incremental update - replace only dirty lines
      dirtyLineIndices.forEach(lineIndex => {
        if (lineIndex >= displayList.lines.length) {
          logger.warn(LOG_CATEGORIES.RENDERER, 'Line index out of bounds', { lineIndex });
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

    // Render system controls (outside notation div, to the left)
    this.renderSystemControls(displayList);

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

      logger.debug(LOG_CATEGORIES.RENDERER, 'Restored scroll position', { left: scrollContainer.scrollLeft, top: scrollContainer.scrollTop });

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
   * Render document header from DisplayList (delegate to CellRenderer)
   *
   * @param {Object} header - Header data from DisplayList
   */
  renderHeaderFromDisplayList(header) {
    const headerElement = this.cellRenderer.renderHeader(header);
    if (headerElement) {
      this.element.appendChild(headerElement);
    }
  }

  /**
   * Render a single line from DisplayList (delegate to CellRenderer)
   * Pure DOM rendering with pre-calculated positions
   *
   * @param {Object} renderLine - RenderLine data from DisplayList
   * @param {Object} displayList - Full DisplayList (unused, kept for API compatibility)
   * @returns {HTMLElement} The created line element
   */
  renderLineFromDisplayList(renderLine, displayList) {
    // Update cell renderer with current document
    this.cellRenderer.setDocument(this.theDocument);

    // Get current line index for highlighting
    const currentLineIndex = this.editor?.getDocument()?.state?.cursor?.line ?? -1;

    // Delegate to CellRenderer
    return this.cellRenderer.renderLine(renderLine, currentLineIndex, this.gutterCollapsed);
  }

  /**
   * Render system controls (system marker indicators) in the separate container
   * @param {Object} displayList - DisplayList from WASM
   */
  renderSystemControls(displayList) {
    const container = document.getElementById('system-controls');
    if (!container) {
      logger.warn(LOG_CATEGORIES.RENDERER, 'System controls container not found');
      return;
    }

    // Clear existing controls
    container.innerHTML = '';

    // Render a system marker indicator for each line
    displayList.lines.forEach((renderLine) => {
      const control = document.createElement('div');
      control.className = 'system-control-row';
      control.style.cssText = `height: ${renderLine.height}px; display: flex; align-items: center; justify-content: center;`;

      const markerIndicator = document.createElement('span');
      markerIndicator.className = 'system-marker-indicator';
      markerIndicator.dataset.lineIndex = renderLine.line_index;

      // Display marker text
      const marker = renderLine.system_marker;
      if (marker === 'start') {
        markerIndicator.textContent = '«';
        markerIndicator.title = 'System start - click to change';
        markerIndicator.classList.add('marker-active');
      } else if (marker === 'end') {
        markerIndicator.textContent = '»';
        markerIndicator.title = 'System end - click to change';
        markerIndicator.classList.add('marker-active');
      } else {
        markerIndicator.textContent = '·';
        markerIndicator.title = 'Click to set system grouping';
      }

      control.appendChild(markerIndicator);
      container.appendChild(control);
    });
  }


  /**
   * Show empty state when no content
   */
  showEmptyState() {
    // Preserve arc overlay
    const arcOverlaySvg = this.arcRenderer?.svgOverlay;

    this.element.innerHTML = '';

    // Re-append preserved elements
    if (arcOverlaySvg) {
      this.element.appendChild(arcOverlaySvg);
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
