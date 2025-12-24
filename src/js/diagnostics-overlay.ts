/**
 * DiagnosticsOverlay - Renders error/warning highlights over cells
 *
 * Uses div-based rectangles positioned at cell locations.
 * Generic system - slurs are just the first customer.
 *
 * Usage:
 *   const overlay = new DiagnosticsOverlay(editorElement);
 *   overlay.render(displayList.diagnostics, lineContainers);
 */

import logger, { LOG_CATEGORIES } from './logger.js';

interface DiagnosticMark {
  line: number;
  col: number;
  len: number;
  severity: string;
  kind: string;
  message: string;
}

interface Diagnostics {
  marks?: DiagnosticMark[];
}

export default class DiagnosticsOverlay {
  private container: HTMLElement;
  private overlay: HTMLDivElement | null = null;
  private _measureCanvas: HTMLCanvasElement | null = null;

  constructor(containerElement: HTMLElement) {
    this.container = containerElement;
    this.setupOverlay();
  }

  /**
   * Set up the overlay div container
   */
  setupOverlay(): void {
    this.overlay = document.createElement('div');
    this.overlay.className = 'diagnostics-overlay';
    this.overlay.style.cssText = `
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: 5;
    `;
    this.container.appendChild(this.overlay);
  }

  /**
   * Render diagnostic highlights
   */
  render(diagnostics: Diagnostics | null, lineContainers: NodeListOf<Element> | Element[]): void {
    if (!this.overlay) return;

    // Clear previous highlights
    this.overlay.innerHTML = '';

    if (!diagnostics?.marks?.length) {
      return;
    }

    logger.debug(LOG_CATEGORIES.RENDERER, 'DiagnosticsOverlay rendering', {
      markCount: diagnostics.marks.length
    });

    for (const mark of diagnostics.marks) {
      this.renderMark(mark, lineContainers);
    }
  }

  /**
   * Render a single diagnostic mark
   */
  renderMark(mark: DiagnosticMark, lineContainers: NodeListOf<Element> | Element[]): void {
    if (!this.overlay) return;

    // Get the line container
    const lineContainer = lineContainers[mark.line];
    if (!lineContainer) {
      logger.warn(LOG_CATEGORIES.RENDERER, 'DiagnosticsOverlay: line not found', { line: mark.line });
      return;
    }

    // Find the textarea element (contains the text)
    const textarea = lineContainer.querySelector('.notation-textarea') as HTMLTextAreaElement | null;
    if (!textarea) {
      logger.warn(LOG_CATEGORIES.RENDERER, 'DiagnosticsOverlay: textarea not found', { line: mark.line });
      return;
    }

    // Get character position from cell column
    // In the current architecture, each cell maps to one character in the textarea
    const charPos = mark.col;
    const charLen = mark.len;

    // Get character positions using measureText or character width estimates
    const positions = this.getCharacterPositions(textarea, charPos, charLen);
    if (!positions) {
      return;
    }

    // Create highlight element
    const highlight = document.createElement('div');
    highlight.className = `diagnostic-mark diagnostic-${mark.severity}`;
    highlight.dataset.kind = mark.kind;
    highlight.dataset.line = String(mark.line);
    highlight.dataset.col = String(mark.col);
    highlight.title = mark.message;

    // Position the highlight
    // Account for line container's position within the editor
    const lineRect = lineContainer.getBoundingClientRect();
    const containerRect = this.container.getBoundingClientRect();
    const textareaRect = textarea.getBoundingClientRect();

    highlight.style.cssText = `
      position: absolute;
      left: ${positions.left + (textareaRect.left - containerRect.left)}px;
      top: ${lineRect.top - containerRect.top}px;
      width: ${positions.width}px;
      height: ${lineRect.height}px;
      pointer-events: none;
    `;

    this.overlay.appendChild(highlight);
  }

  /**
   * Get pixel positions for a character range in a textarea
   */
  getCharacterPositions(textarea: HTMLTextAreaElement, startPos: number, len: number): { left: number; width: number } | null {
    const text = textarea.value || '';

    if (startPos >= text.length) {
      return null;
    }

    // Use a canvas to measure text width
    const canvas = this.getMeasureCanvas();
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Get computed font from textarea
    const style = window.getComputedStyle(textarea);
    ctx.font = `${style.fontSize} ${style.fontFamily}`;

    // Measure text up to start position
    const textBefore = text.substring(0, startPos);
    const leftOffset = ctx.measureText(textBefore).width;

    // Measure the target character(s)
    const targetText = text.substring(startPos, startPos + len);
    const targetWidth = ctx.measureText(targetText).width;

    // Account for textarea padding
    const paddingLeft = parseFloat(style.paddingLeft) || 0;

    return {
      left: paddingLeft + leftOffset,
      width: Math.max(targetWidth, 8) // Minimum width for visibility
    };
  }

  /**
   * Get or create a canvas for text measurement
   */
  getMeasureCanvas(): HTMLCanvasElement {
    if (!this._measureCanvas) {
      this._measureCanvas = document.createElement('canvas');
    }
    return this._measureCanvas;
  }

  /**
   * Clear all diagnostic highlights
   */
  clear(): void {
    if (this.overlay) {
      this.overlay.innerHTML = '';
    }
  }

  /**
   * Destroy the overlay
   */
  destroy(): void {
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
    this._measureCanvas = null;
  }
}
