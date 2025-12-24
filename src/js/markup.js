/**
 * Markup - Notation markup rendering and import
 */

import logger, { LOG_CATEGORIES } from './logger.js';

export class Markup {
  constructor() {
    this.inputTextarea = /** @type {HTMLTextAreaElement} */ (document.getElementById('markup-input'));
    this.systemSelect = /** @type {HTMLSelectElement} */ (document.getElementById('markup-system'));
    this.importBtn = document.getElementById('markup-import-btn');
    this.outputFormatSelect = /** @type {HTMLSelectElement} */ (document.getElementById('markup-output-format'));

    this.setupEventListeners();
  }

  setupEventListeners() {
    this.importBtn?.addEventListener('click', () => {
      this.importToEditor();
    });

    // Import on Ctrl+Enter in textarea
    this.inputTextarea?.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        this.importToEditor();
      }
    });

    // Update markup output when format changes
    this.outputFormatSelect?.addEventListener('change', () => {
      this.refreshMarkupOutput();
    });
  }

  /**
   * Refresh the markup output display with the current document
   */
  refreshMarkupOutput() {
    if (!window.editor?.exportManager) {
      return;
    }

    window.editor.exportManager.updateMarkupDisplay().catch(err => {
      logger.error(LOG_CATEGORIES.UI, 'Failed to update Markup display', { error: err });
    });
  }

  async importToEditor() {
    if (!window.editor?.wasmModule) {
      alert('WASM module not loaded');
      return;
    }

    const markup = this.inputTextarea?.value || '';
    const pitchSystem = parseInt(this.systemSelect?.value || '1');

    try {
      logger.info(LOG_CATEGORIES.UI, 'Markup: Importing to editor', { pitchSystem, markupLength: markup.length });

      // Import markup and get Document (use 'doc' to avoid shadowing global 'document')
      const doc = window.editor.wasmModule.importNotationMarkup(pitchSystem, markup);

      logger.info(LOG_CATEGORIES.UI, 'Markup: Markup imported, loading into editor', { doc });

      // Load into editor (this triggers renderAndUpdate)
      await window.editor.loadDocument(doc);

      // Switch to Text tab to show the result
      const textTab = document.querySelector('[data-tab="text"]');
      if (textTab) {
        // @ts-ignore
        textTab.click();
      }

      logger.info(LOG_CATEGORIES.UI, 'Markup: Successfully imported to editor');
    } catch (error) {
      logger.error(LOG_CATEGORIES.UI, 'Markup: Error importing to editor', { error });
      alert('Error importing markup: ' + (error.message || String(error)));
    }
  }

  initialize() {
    logger.info(LOG_CATEGORIES.UI, 'Markup initialized');

    // Load supported tags from WASM (wait for WASM to be ready)
    this.loadSupportedTags();
  }

  /**
   * Load and display supported markup tags from WASM registry
   */
  loadSupportedTags() {
    // Wait for WASM to be ready
    const checkWasm = () => {
      if (!window.editor?.wasmModule) {
        setTimeout(checkWasm, 100);
        return;
      }

      try {
        // Get markdown documentation from WASM
        const markdownDocs = window.editor.wasmModule.getSupportedMarkupTags();

        // Convert markdown to HTML for display
        const htmlContent = this.markdownToHTML(markdownDocs);

        // Update the content panel
        const contentDiv = document.getElementById('supported-tags-content');
        if (contentDiv) {
          contentDiv.innerHTML = htmlContent;
        }

        logger.info(LOG_CATEGORIES.UI, 'Markup: Loaded supported tags from WASM registry');
      } catch (error) {
        logger.error(LOG_CATEGORIES.UI, 'Markup: Error loading supported tags', { error });
        const contentDiv = document.getElementById('supported-tags-content');
        if (contentDiv) {
          contentDiv.innerHTML = '<span class="text-red-600">Error loading tag documentation</span>';
        }
      }
    };

    checkWasm();
  }

  /**
   * Convert simple markdown to HTML
   * Handles: ## headers, - list items, `code`, **bold**
   */
  markdownToHTML(markdown) {
    let html = '';
    const lines = markdown.split('\n');
    let inList = false;

    for (const line of lines) {
      // Skip main title (# Supported Markup Tags)
      if (line.startsWith('# ')) {
        continue;
      }

      // Category headers (## Document Tags)
      if (line.startsWith('## ')) {
        if (inList) {
          html += '</ul>';
          inList = false;
        }
        const headerText = line.substring(3);
        html += `<div class="font-semibold text-blue-700 mt-3 mb-1">${this.escapeHTML(headerText)}</div>`;
        continue;
      }

      // List items (- `<tag>` description)
      if (line.trim().startsWith('- ')) {
        if (!inList) {
          html += '<ul class="ml-3 space-y-1">';
          inList = true;
        }

        let content = line.substring(2).trim();

        // Convert `code` to <code> tags, escaping the content inside
        content = content.replace(/`([^`]+)`/g, (match, codeContent) => {
          // Escape HTML entities in the code content
          const escaped = this.escapeHTML(codeContent);
          return `<code class="bg-blue-100 px-1 rounded font-mono text-blue-900">${escaped}</code>`;
        });

        html += `<li class="text-xs">${content}</li>`;
        continue;
      }

      // Empty lines
      if (line.trim() === '') {
        if (inList) {
          html += '</ul>';
          inList = false;
        }
        continue;
      }
    }

    // Close any open list
    if (inList) {
      html += '</ul>';
    }

    return html;
  }

  /**
   * Escape HTML special characters
   */
  escapeHTML(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Initialize when DOM is ready
export function initMarkup() {
  const markup = new Markup();
  markup.initialize();
  // @ts-ignore - Add to window for debugging
  window.markup = markup;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initMarkup);
} else {
  // DOM already loaded, but wait for WASM
  setTimeout(initMarkup, 100);
}
