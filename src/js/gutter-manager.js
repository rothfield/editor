/**
 * Gutter Manager for Music Notation Editor
 *
 * Handles:
 * - Gutter context menu for line role changes
 * - Gutter toggle button (collapse/expand)
 * - Line role management (melody, group-header, group-item)
 */

import { ContextMenuManager } from './context-menu.js';
import logger, { LOG_CATEGORIES } from './logger.js';

class GutterManager {
  constructor(editorElement, editor) {
    this.element = editorElement;
    this.editor = editor; // Reference to main editor instance

    // Context menu for gutter interactions
    this.contextMenu = new ContextMenuManager();

    // Gutter toggle state
    this.gutterToggleBtn = null;
    this.gutterCollapsed = false;
  }

  /**
   * Initialize gutter system
   */
  initialize() {
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        this.contextMenu.initialize('line-gutter-menu');
        this.setupGutterEventListeners();
        this.setupGutterToggle();
      });
    } else {
      this.contextMenu.initialize('line-gutter-menu');
      this.setupGutterEventListeners();
      this.setupGutterToggle();
    }
  }

  /**
   * Setup event listeners for gutter interactions
   */
  setupGutterEventListeners() {
    // Use event delegation on the editor element
    this.element.addEventListener('contextmenu', (e) => {
      const gutter = e.target.closest('.line-gutter');
      if (!gutter) return; // Not in gutter, allow default context menu

      e.preventDefault(); // Prevent browser context menu
      e.stopPropagation(); // Prevent event from bubbling to document handlers

      const lineElement = gutter.closest('.notation-line');
      if (!lineElement) return;

      const currentRole = lineElement.dataset.role || 'melody';

      // Show context menu (validation happens in WASM when user selects)
      this.contextMenu.show(
        e.pageX,
        e.pageY,
        currentRole,
        lineElement,
        (choice, targetLine) => this.handleRoleChange(choice, targetLine)
      );
    });

    // Listen for mousedown globally to close the context menu
    // Use mousedown instead of click to catch the event earlier
    document.addEventListener('mousedown', (e) => {
      // Only hide if menu is visible
      if (this.contextMenu.menu && this.contextMenu.menu.style.display !== 'none') {
        // Don't close if clicking on the menu itself
        if (!e.target.closest('#line-gutter-menu')) {
          this.contextMenu.hide();
        }
      }
    }, true); // Use capture phase
  }

  /**
   * Setup gutter toggle button
   */
  setupGutterToggle() {
    // Restore collapsed state from localStorage
    const savedCollapsed = localStorage.getItem('editor_gutter_collapsed') === 'true';

    // Create toggle button
    this.gutterToggleBtn = document.createElement('button');
    this.gutterToggleBtn.className = 'gutter-toggle-btn';
    this.gutterToggleBtn.title = 'Toggle line gutter';
    this.gutterToggleBtn.setAttribute('data-testid', 'gutter-toggle-btn');
    this.gutterToggleBtn.setAttribute('aria-label', 'Toggle line gutter visibility');

    // SVG chevron icon (left-pointing)
    this.gutterToggleBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="15 18 9 12 15 6"></polyline>
      </svg>
    `;

    // Attach to notation-editor container
    this.element.style.position = 'relative'; // Ensure positioning context
    this.element.appendChild(this.gutterToggleBtn);

    // Event handler
    this.gutterToggleBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      this.toggleGutter();
    });

    // Apply saved state
    if (savedCollapsed) {
      this.collapseGutter(false); // false = don't animate on init
    }
  }

  /**
   * Toggle gutter visibility
   */
  toggleGutter() {
    if (this.gutterCollapsed) {
      this.expandGutter();
    } else {
      this.collapseGutter();
    }
  }

  /**
   * Collapse gutter (hide)
   * @param {boolean} animate - Whether to animate the transition
   */
  collapseGutter(animate = true) {
    this.gutterCollapsed = true;
    document.body.classList.add('gutter-collapsed');

    // Find all gutter elements
    const gutters = this.element.querySelectorAll('.line-gutter');
    gutters.forEach((gutter) => {
      gutter.classList.add('gutter-collapsed');
    });

    // Save state
    localStorage.setItem('editor_gutter_collapsed', 'true');

    // Trigger full re-render to recalculate arc positions
    if (this.editor) {
      this.editor.render({ dirtyLineIndices: null });
    }
  }

  /**
   * Expand gutter (show)
   * @param {boolean} animate - Whether to animate the transition
   */
  expandGutter(animate = true) {
    this.gutterCollapsed = false;
    document.body.classList.remove('gutter-collapsed');

    // Find all gutter elements
    const gutters = this.element.querySelectorAll('.line-gutter');
    gutters.forEach(gutter => {
      gutter.classList.remove('gutter-collapsed');
    });

    // Save state
    localStorage.setItem('editor_gutter_collapsed', 'false');

    // Trigger full re-render to recalculate arc positions
    if (this.editor) {
      this.editor.render({ dirtyLineIndices: null });
    }
  }

  /**
   * Handle line role change
   * @param {string} newRole - New role (melody, group-header, group-item)
   * @param {HTMLElement} lineElement - Line element to update
   */
  async handleRoleChange(newRole, lineElement) {
    // Get line index
    const lineIdx = parseInt(lineElement.dataset.line);

    // Call WASM to update internal document (validation happens in WASM)
    try {
      this.editor.wasmModule.setLineStaffRole(lineIdx, newRole);

      // Get fresh document snapshot from WASM with updated role
      const updatedDoc = this.editor.wasmModule.getDocumentSnapshot();
      this.editor.theDocument = updatedDoc;

      // Full re-render from WASM (regenerates DisplayList with new role)
      await this.editor.renderAndUpdate();

      logger.info(LOG_CATEGORIES.RENDERER, `Line ${lineIdx} role changed to: ${newRole}`);
    } catch (error) {
      logger.error(LOG_CATEGORIES.RENDERER, 'Error setting staff role', { error: error.message || error });
      alert(`Error: ${error.message || error}`);
    }
  }

  /**
   * Cleanup - remove event listeners and DOM elements
   */
  cleanup() {
    if (this.contextMenu) {
      this.contextMenu.hide();
    }

    if (this.gutterToggleBtn && this.gutterToggleBtn.parentNode) {
      this.gutterToggleBtn.remove();
      this.gutterToggleBtn = null;
    }

    logger.debug(LOG_CATEGORIES.RENDERER, 'Gutter manager cleaned up');
  }
}

export default GutterManager;
