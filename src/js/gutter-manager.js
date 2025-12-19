/**
 * Gutter Manager for Music Notation Editor
 *
 * Handles:
 * - System marker UI (LilyPond-style « and » for multi-system grouping)
 */

import logger, { LOG_CATEGORIES } from './logger.js';

class GutterManager {
  constructor(editorElement, editor) {
    this.element = editorElement;
    this.editor = editor;
  }

  /**
   * Initialize gutter system
   */
  initialize() {
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
  setupEventListeners() {
    // Use mousedown on document capture phase - more reliable than click
    // because click can be prevented by mousedown handlers elsewhere
    document.addEventListener('mousedown', (e) => {
      const target = /** @type {Element} */ (e.target);
      const markerIndicator = target.closest('.system-marker-indicator');
      if (!markerIndicator) return;

      e.preventDefault();
      e.stopPropagation();

      const htmlMarker = /** @type {HTMLElement} */ (markerIndicator);
      const lineIndex = parseInt(htmlMarker.dataset.lineIndex || '0');
      this.showSystemMarkerMenu(markerIndicator, lineIndex);
    }, true); // capture phase on document

    logger.debug(LOG_CATEGORIES.RENDERER, 'System marker event listeners initialized');
  }

  /**
   * Show system marker popup menu
   */
  showSystemMarkerMenu(indicator, lineIndex) {
    // Remove existing menu if any
    const existingMenu = document.getElementById('system-marker-menu');
    if (existingMenu) {
      existingMenu.remove();
    }

    // Create popup menu
    const menu = document.createElement('div');
    menu.id = 'system-marker-menu';
    menu.className = 'system-marker-menu';

    // Get current marker
    let currentMarker = null;
    try {
      currentMarker = this.editor.wasmModule.getSystemMarker(lineIndex);
    } catch (e) {
      console.error('Failed to get system marker:', e);
    }

    // Menu options
    const options = [
      { value: 'start', label: 'Start System', icon: '«' },
      { value: 'end', label: 'End System', icon: '»' },
      { value: '', label: 'Clear', icon: '·' }
    ];

    options.forEach(opt => {
      const item = document.createElement('div');
      item.className = 'system-marker-menu-item';
      if (currentMarker === opt.value || (currentMarker === null && opt.value === '')) {
        item.classList.add('current');
      }

      const icon = document.createElement('span');
      icon.className = 'menu-icon';
      icon.textContent = opt.icon;
      item.appendChild(icon);

      const label = document.createElement('span');
      label.textContent = opt.label;
      item.appendChild(label);

      item.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.handleSystemMarkerChange(lineIndex, opt.value);
        menu.remove();
      });

      menu.appendChild(item);
    });

    // Position menu below indicator
    const rect = indicator.getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.left = `${rect.left}px`;
    menu.style.top = `${rect.bottom + 2}px`;
    menu.style.zIndex = '10000';

    document.body.appendChild(menu);

    // Close menu on click outside
    const closeHandler = (e) => {
      if (!menu.contains(e.target) && e.target !== indicator) {
        menu.remove();
        document.removeEventListener('mousedown', closeHandler);
      }
    };
    setTimeout(() => {
      document.addEventListener('mousedown', closeHandler);
    }, 0);
  }

  /**
   * Handle system marker change
   */
  async handleSystemMarkerChange(lineIndex, marker) {
    try {
      this.editor.wasmModule.setSystemMarker(lineIndex, marker);
      await this.editor.renderAndUpdate();
      logger.info(LOG_CATEGORIES.RENDERER, `Line ${lineIndex} system marker changed to: ${marker || 'none'}`);
    } catch (error) {
      logger.error(LOG_CATEGORIES.RENDERER, 'Error setting system marker', { error: error.message || error });
      alert(`Error: ${error.message || error}`);
    }
  }

  /**
   * Cleanup
   */
  cleanup() {
    const existingMenu = document.getElementById('system-marker-menu');
    if (existingMenu) {
      existingMenu.remove();
    }
    logger.debug(LOG_CATEGORIES.RENDERER, 'Gutter manager cleaned up');
  }
}

export default GutterManager;
