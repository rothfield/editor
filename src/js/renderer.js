/**
 * DOM Renderer for Music Notation Editor
 *
 * Uses textarea-based rendering with PUA glyphs for notation display.
 * Each line is a textarea element; NotationFont handles visual rendering.
 */

import StyleManager from './style-manager.js';
import MeasurementService from './measurement-service.js';
import GutterManager from './gutter-manager.js';
import GroupBracketRenderer from './group-bracket-renderer.js';
import TextareaRenderer from './textarea-renderer.js';
import logger, { LOG_CATEGORIES } from './logger.js';

class DOMRenderer {
  constructor(editorElement, editor, options = {}) {
    this.element = editorElement;
    this.editor = editor;
    this.theDocument = null;

    // Configuration options
    this.options = {
      fontMapping: options.fontMapping || null,
      ...options
    };

    // Performance metrics
    this.renderStats = {
      lastRenderTime: 0
    };

    // Initialize specialized rendering modules
    this.styleManager = new StyleManager({ fontMapping: this.options.fontMapping });
    this.styleManager.initialize();

    // MeasurementService for glyph width cache (used by WASM)
    this.measurementService = new MeasurementService();

    this.gutterManager = new GutterManager(this.element, this.editor);
    this.gutterManager.initialize();

    this.groupBracketRenderer = new GroupBracketRenderer(this.element);

    // Textarea renderer - the only rendering mode
    this.textareaRenderer = new TextareaRenderer(this.element, this.editor);
  }

  /**
   * Check if textarea mode is enabled (always true)
   * @returns {boolean}
   */
  isTextareaMode() {
    return true;
  }

  /**
   * Render group brackets (delegate to GroupBracketRenderer)
   */
  renderGroupBrackets() {
    this.groupBracketRenderer.render();
  }

  /**
   * Render entire document using textarea-based rendering
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

    // Save scroll position
    const scrollContainer = document.getElementById('editor-container');
    const savedScrollLeft = scrollContainer?.scrollLeft ?? 0;
    const savedScrollTop = scrollContainer?.scrollTop ?? 0;

    // Handle empty document
    if (dirtyLineIndices === null) {
      if (!doc.lines || doc.lines.length === 0) {
        this.showEmptyState();
        return;
      }
    }

    // Get textarea display list from WASM
    const layoutStart = performance.now();
    let textareaDisplayList;
    try {
      textareaDisplayList = this.editor.wasmModule.getTextareaDisplayList();
    } catch (err) {
      logger.error(LOG_CATEGORIES.RENDERER, 'Failed to get textarea display list', { error: err.message });
      return;
    }
    const layoutTime = performance.now() - layoutStart;
    logger.debug(LOG_CATEGORIES.PERFORMANCE, 'Textarea layout time', { duration: `${layoutTime.toFixed(2)}ms` });

    // Cache for other parts of the system
    this.textareaDisplayList = textareaDisplayList;

    // Render using TextareaRenderer
    const renderStart = performance.now();
    this.textareaRenderer.renderAll(textareaDisplayList);
    const renderTime = performance.now() - renderStart;
    logger.debug(LOG_CATEGORIES.PERFORMANCE, 'Textarea render time', { duration: `${renderTime.toFixed(2)}ms` });

    // Render group brackets
    this.renderGroupBrackets();

    // Restore scroll position
    if (scrollContainer && (savedScrollLeft !== 0 || savedScrollTop !== 0)) {
      scrollContainer.scrollLeft = savedScrollLeft;
      scrollContainer.scrollTop = savedScrollTop;
      requestAnimationFrame(() => {
        if (scrollContainer) {
          scrollContainer.scrollLeft = savedScrollLeft;
          scrollContainer.scrollTop = savedScrollTop;
        }
      });
    }

    // Update render statistics
    const endTime = performance.now();
    this.renderStats.lastRenderTime = endTime - startTime;
    logger.debug(LOG_CATEGORIES.PERFORMANCE, 'Total render time', {
      duration: `${this.renderStats.lastRenderTime.toFixed(2)}ms`
    });
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
    if (this.textareaRenderer) {
      this.textareaRenderer.cleanup();
    }
    this.element.innerHTML = '';
  }

  /**
   * Get render statistics
   */
  getRenderStats() {
    return { ...this.renderStats };
  }
}

export default DOMRenderer;
