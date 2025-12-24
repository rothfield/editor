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

interface Document {
  lines?: unknown[];
}

interface TextareaDisplayList {
  lines: unknown[];
}

interface WASMModule {
  getTextareaDisplayList: () => TextareaDisplayList;
}

interface Editor {
  wasmModule: WASMModule;
}

interface RenderOptions {
  fontMapping?: unknown;
}

interface RenderStats {
  lastRenderTime: number;
}

class DOMRenderer {
  element: HTMLElement;
  private editor: Editor;
  private theDocument: Document | null = null;
  private options: RenderOptions;
  private renderStats: RenderStats = { lastRenderTime: 0 };
  private styleManager: StyleManager;
  measurementService: MeasurementService;
  private gutterManager: GutterManager;
  private groupBracketRenderer: GroupBracketRenderer;
  textareaRenderer: TextareaRenderer;
  textareaDisplayList: TextareaDisplayList | null = null;

  constructor(editorElement: HTMLElement, editor: Editor, options: RenderOptions = {}) {
    this.element = editorElement;
    this.editor = editor;

    this.options = {
      fontMapping: options.fontMapping || null,
      ...options
    };

    // Initialize specialized rendering modules
    this.styleManager = new StyleManager({ fontMapping: this.options.fontMapping });
    this.styleManager.initialize();

    // MeasurementService for glyph width cache (used by WASM)
    this.measurementService = new MeasurementService();

    this.gutterManager = new GutterManager(this.element, this.editor as any);
    this.gutterManager.initialize();

    this.groupBracketRenderer = new GroupBracketRenderer(this.element);

    // Textarea renderer - the only rendering mode
    this.textareaRenderer = new TextareaRenderer(this.element, this.editor as any);
  }

  /**
   * Check if textarea mode is enabled (always true)
   */
  isTextareaMode(): boolean {
    return true;
  }

  /**
   * Render group brackets (delegate to GroupBracketRenderer)
   */
  renderGroupBrackets(): void {
    this.groupBracketRenderer.render();
  }

  /**
   * Render entire document using textarea-based rendering
   */
  renderDocument(doc: Document, dirtyLineIndices: number[] | null = null): void {
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

    // Get textarea display list from WASM (Phase 1: returns text + measurement hints)
    // Lyric layout is computed later in TextareaRenderer after measuring positions
    const layoutStart = performance.now();
    let textareaDisplayList: TextareaDisplayList;
    try {
      textareaDisplayList = this.editor.wasmModule.getTextareaDisplayList();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error(LOG_CATEGORIES.RENDERER, 'Failed to get textarea display list', { error: errorMessage });
      return;
    }
    const layoutTime = performance.now() - layoutStart;
    logger.debug(LOG_CATEGORIES.PERFORMANCE, 'Textarea layout time', { duration: `${layoutTime.toFixed(2)}ms` });

    // Cache for other parts of the system
    this.textareaDisplayList = textareaDisplayList;

    // Render using TextareaRenderer
    const renderStart = performance.now();
    this.textareaRenderer.renderAll(textareaDisplayList as any);
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
  showEmptyState(): void {
    this.element.innerHTML = '';
  }

  /**
   * Clear editor element content
   */
  clearElement(): void {
    if (this.textareaRenderer) {
      this.textareaRenderer.cleanup();
    }
    this.element.innerHTML = '';
  }

  /**
   * Get render statistics
   */
  getRenderStats(): RenderStats {
    return { ...this.renderStats };
  }

  /**
   * Handle window resize events
   * Currently a no-op since textarea rendering is dynamic
   */
  resize(): void {
    // No-op: Textarea rendering adjusts automatically to container size
    // Future: Could trigger re-layout or notify child renderers if needed
  }
}

export default DOMRenderer;
