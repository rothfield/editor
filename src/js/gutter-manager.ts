/**
 * Gutter Manager for Music Notation Editor
 *
 * Handles:
 * - System marker UI (count-based system grouping with visual indicators)
 */

import logger, { LOG_CATEGORIES } from './logger.js';

interface WASMModule {
  getSystemStart: (lineIndex: number) => number;
  setSystemStart: (lineIndex: number, count: number) => Array<{
    line: number;
    oldCount: number;
    newCount: number;
  }>;
  clearSystemStart: (lineIndex: number) => void;
  getLineSystemRole: (lineIndex: number) => {
    type: 'start' | 'middle' | 'end' | 'standalone';
    count?: number;
  };
}

interface Editor {
  wasmModule: WASMModule;
  renderAndUpdate: () => Promise<void>;
}

class GutterManager {
  private element: HTMLElement;
  private editor: Editor;

  constructor(editorElement: HTMLElement, editor: Editor) {
    this.element = editorElement;
    this.editor = editor;
  }

  /**
   * Initialize gutter system
   */
  initialize(): void {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        this.setupEventListeners();
      });
    } else {
      this.setupEventListeners();
    }
  }

  /**
   * Setup event listeners for system marker
   */
  setupEventListeners(): void {
    // Use mousedown on document capture phase - more reliable than click
    // because click can be prevented by mousedown handlers elsewhere
    document.addEventListener('mousedown', (e) => {
      const target = e.target as Element;
      const markerIndicator = target.closest('.system-marker-indicator');
      if (!markerIndicator) return;

      e.preventDefault();
      e.stopPropagation();

      const htmlMarker = markerIndicator as HTMLElement;
      const lineIndex = parseInt(htmlMarker.dataset.lineIndex || '0');
      this.cycleSystemMarker(lineIndex);
    }, true); // capture phase on document

    logger.debug(LOG_CATEGORIES.RENDERER, 'System marker event listeners initialized');
  }

  /**
   * Cycle system marker through counts: 0 → 1 → 2 → ... → 8 → 0
   * All lines are editable
   */
  async cycleSystemMarker(lineIndex: number): Promise<void> {
    try {
      // Get current count
      const currentCount = this.editor.wasmModule.getSystemStart(lineIndex);

      // Cycle: 0 → 1 → 2 → ... → 8 → 0
      // Always show all options up to 8, regardless of document size
      const MAX_SYSTEM_COUNT = 8;
      let nextCount: number;
      if (currentCount === 0) {
        nextCount = 1;
      } else if (currentCount >= MAX_SYSTEM_COUNT) {
        nextCount = 0; // Wrap around to 0
      } else {
        nextCount = currentCount + 1;
      }

      let truncations: Array<{ line: number; oldCount: number; newCount: number }> = [];

      if (nextCount === 0) {
        // Clear marker
        this.editor.wasmModule.clearSystemStart(lineIndex);
        logger.info(LOG_CATEGORIES.RENDERER, `Line ${lineIndex} system marker cleared`);
      } else {
        // Set count
        truncations = this.editor.wasmModule.setSystemStart(lineIndex, nextCount);
        logger.info(LOG_CATEGORIES.RENDERER,
          `Line ${lineIndex} system marker set to ${nextCount} lines`);
      }

      // Show truncation feedback if overlaps were detected
      if (truncations.length > 0) {
        this.showTruncationFeedback(truncations);
      }

      // Trigger re-render
      await this.editor.renderAndUpdate();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(LOG_CATEGORIES.RENDERER, 'Error cycling system marker', { error: errorMessage });
    }
  }

  /**
   * Show visual feedback for truncated systems
   */
  showTruncationFeedback(truncations: Array<{ line: number; oldCount: number; newCount: number }>): void {
    for (const trunc of truncations) {
      logger.info(LOG_CATEGORIES.RENDERER,
        `System at line ${trunc.line} truncated from ${trunc.oldCount} to ${trunc.newCount} lines due to overlap`);

      // Find the indicator element for the truncated line
      const indicator = document.querySelector(
        `.system-marker-indicator[data-line-index="${trunc.line}"]`
      ) as HTMLElement;

      if (indicator) {
        // Add pulse animation class
        indicator.classList.add('truncated-pulse');

        // Remove after animation completes
        setTimeout(() => {
          indicator.classList.remove('truncated-pulse');
        }, 1000);
      }
    }
  }

  /**
   * Cleanup
   */
  cleanup(): void {
    const existingMenu = document.getElementById('system-marker-menu');
    if (existingMenu) {
      existingMenu.remove();
    }
    logger.debug(LOG_CATEGORIES.RENDERER, 'Gutter manager cleaned up');
  }
}

export default GutterManager;
