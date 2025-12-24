/**
 * Resize Handle Manager
 *
 * Handles the resizing functionality for the inspector panel, with:
 * - Flexible viewport-aware size limits
 * - Persistent width storage (localStorage)
 * - Collapse/expand functionality
 * - Double-click to reset to default width
 */

import logger, { LOG_CATEGORIES } from './logger.js';

interface WidthConstraints {
  minWidth: number;
  maxWidth: number;
}

class ResizeHandle {
  private resizeHandle: HTMLElement | null = null;
  private tabsPanel: HTMLElement | null = null;
  private mainContainer: HTMLElement | null = null;
  private isResizing: boolean = false;
  private startX: number = 0;
  private startWidth: number = 0;
  private isCollapsed: boolean = false;
  private savedWidth: number = 384; // Default width when expanding
  private saveDebounceTimer: number | null = null;
  private onResizeEndCallback: (() => void) | null = null; // Callback to trigger redraw on resize end

  constructor() {
    // Bind event handlers
    this.handleMouseDown = this.handleMouseDown.bind(this);
    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleMouseUp = this.handleMouseUp.bind(this);
    this.handleDoubleClick = this.handleDoubleClick.bind(this);
  }

  /**
   * Initialize the resize handle functionality
   */
  initialize(): boolean {
    this.resizeHandle = document.getElementById('resize-handle');
    this.tabsPanel = document.getElementById('tabs-panel');
    this.mainContainer = document.getElementById('main-container');

    if (!this.resizeHandle || !this.tabsPanel || !this.mainContainer) {
      logger.error(LOG_CATEGORIES.UI, 'Resize handle elements not found');
      return false;
    }

    // Restore collapsed state from localStorage
    const savedCollapsed = localStorage.getItem('editor_panel_collapsed') === 'true';
    const savedWidth = localStorage.getItem('editor_panel_width');

    if (savedCollapsed) {
      this.collapse();
    } else if (savedWidth) {
      // Restore saved width
      const width = parseInt(savedWidth);
      const constrainedWidth = this.constrainWidth(width);
      this.tabsPanel.style.width = constrainedWidth + 'px';
      this.savedWidth = constrainedWidth;
    } else {
      // Use default or inline style width
      const currentWidth = this.tabsPanel.offsetWidth;
      this.savedWidth = currentWidth;
    }

    // Attach event listeners
    this.resizeHandle.addEventListener('mousedown', this.handleMouseDown);
    this.resizeHandle.addEventListener('dblclick', this.handleDoubleClick);
    document.addEventListener('mousemove', this.handleMouseMove);
    document.addEventListener('mouseup', this.handleMouseUp);

    logger.info(LOG_CATEGORIES.UI, 'Resize handle initialized');
    return true;
  }

  /**
   * Calculate viewport-aware width constraints
   * Min: 150px (absolute minimum for usability)
   * Max: window.innerWidth - 300px (leave room for editor)
   */
  getConstraints(): WidthConstraints {
    const minWidth = 150;
    const maxWidth = Math.max(300, window.innerWidth - 300); // Never go below 300px max
    return { minWidth, maxWidth };
  }

  /**
   * Constrain a width value to valid limits
   */
  constrainWidth(width: number): number {
    const { minWidth, maxWidth } = this.getConstraints();
    return Math.max(minWidth, Math.min(maxWidth, width));
  }

  /**
   * Handle mouse down event - start resizing
   */
  handleMouseDown(e: MouseEvent): void {
    // Don't start resize if panel is collapsed
    if (this.isCollapsed) return;

    logger.debug(LOG_CATEGORIES.UI, 'Resize started');
    this.isResizing = true;
    this.startX = e.clientX;
    this.startWidth = this.tabsPanel?.offsetWidth || 0;

    // Prevent text selection during resize
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    e.preventDefault();
  }

  /**
   * Handle mouse move event - perform resizing
   */
  handleMouseMove(e: MouseEvent): void {
    if (!this.isResizing || !this.tabsPanel) return;

    const { minWidth, maxWidth } = this.getConstraints();

    // Calculate new width (resize from right edge, so subtract delta)
    const deltaX = e.clientX - this.startX;
    let newWidth = this.startWidth - deltaX;

    // Constrain to min/max
    newWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));

    // Apply new width
    this.tabsPanel.style.width = newWidth + 'px';
  }

  /**
   * Handle mouse up event - end resizing
   */
  handleMouseUp(): void {
    if (this.isResizing && this.tabsPanel) {
      logger.debug(LOG_CATEGORIES.UI, 'ResizeHandle: Mouse up - resize ended');
      this.isResizing = false;
      document.body.style.userSelect = '';
      document.body.style.cursor = '';

      // Get final panel width for logging
      const finalWidth = this.tabsPanel.offsetWidth;
      logger.debug(LOG_CATEGORIES.UI, 'ResizeHandle: Final panel width', { width: finalWidth, unit: 'px' });

      // Save the new width (debounced)
      this.savePanelWidth();

      // Trigger redraw callback
      logger.debug(LOG_CATEGORIES.UI, 'ResizeHandle: Triggering redraw callback...');
      this.triggerRedrawCallback();
    }
  }

  /**
   * Handle double-click on resize handle - reset to default width
   */
  handleDoubleClick(e: MouseEvent): void {
    if (this.isCollapsed) {
      // If collapsed, expand instead
      this.expand();
    } else if (this.tabsPanel) {
      // Reset to default width (384px)
      const defaultWidth = 384;
      const constrainedWidth = this.constrainWidth(defaultWidth);
      this.tabsPanel.style.width = constrainedWidth + 'px';
      this.savedWidth = constrainedWidth;
      this.savePanelWidth();

      // Trigger redraw callback
      this.triggerRedrawCallback();
    }
    e.preventDefault();
  }

  /**
   * Save panel width to localStorage (debounced)
   */
  savePanelWidth(): void {
    // Clear existing debounce timer
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
    }

    // Set new debounce timer (500ms)
    this.saveDebounceTimer = window.setTimeout(() => {
      if (!this.isCollapsed && this.tabsPanel) {
        const width = this.tabsPanel.offsetWidth;
        localStorage.setItem('editor_panel_width', width.toString());
        logger.debug(LOG_CATEGORIES.UI, 'Panel width saved', { width });
      }
    }, 500);
  }

  /**
   * Collapse the inspector panel
   */
  collapse(): void {
    if (this.isCollapsed || !this.tabsPanel || !this.resizeHandle) return;

    // Save current width before collapsing
    this.savedWidth = this.tabsPanel.offsetWidth;
    localStorage.setItem('editor_panel_width', this.savedWidth.toString());

    // Hide the panel
    this.tabsPanel.classList.add('collapsed');
    this.tabsPanel.style.width = '0px';
    this.resizeHandle.style.display = 'none';
    this.isCollapsed = true;

    // Save collapsed state
    localStorage.setItem('editor_panel_collapsed', 'true');
    logger.info(LOG_CATEGORIES.UI, 'Panel collapsed');
  }

  /**
   * Expand the inspector panel
   */
  expand(): void {
    if (!this.isCollapsed || !this.tabsPanel || !this.resizeHandle) return;

    // Restore previous width
    const constrainedWidth = this.constrainWidth(this.savedWidth);
    this.tabsPanel.style.width = constrainedWidth + 'px';
    this.tabsPanel.classList.remove('collapsed');
    this.resizeHandle.style.display = '';
    this.isCollapsed = false;

    // Save expanded state
    localStorage.setItem('editor_panel_collapsed', 'false');
    logger.info(LOG_CATEGORIES.UI, 'Panel expanded');
  }

  /**
   * Toggle collapse/expand state
   */
  toggleCollapse(): void {
    if (this.isCollapsed) {
      this.expand();
    } else {
      this.collapse();
    }
  }

  /**
   * Check if panel is currently collapsed
   */
  getIsCollapsed(): boolean {
    return this.isCollapsed;
  }

  /**
   * Set callback to be called when resize operations complete
   */
  setOnResizeEnd(callback: () => void): void {
    this.onResizeEndCallback = callback;
  }

  /**
   * Trigger the redraw callback if set
   */
  triggerRedrawCallback(): void {
    logger.debug(LOG_CATEGORIES.UI, 'ResizeHandle: triggerRedrawCallback called');
    logger.debug(LOG_CATEGORIES.UI, 'ResizeHandle: Callback exists?', { exists: !!this.onResizeEndCallback });
    logger.debug(LOG_CATEGORIES.UI, 'ResizeHandle: Callback type', { type: typeof this.onResizeEndCallback });

    if (this.onResizeEndCallback && typeof this.onResizeEndCallback === 'function') {
      logger.debug(LOG_CATEGORIES.UI, 'ResizeHandle: Executing callback NOW');
      try {
        this.onResizeEndCallback();
        logger.debug(LOG_CATEGORIES.UI, 'ResizeHandle: Callback executed successfully');
      } catch (error) {
        logger.error(LOG_CATEGORIES.UI, 'ResizeHandle: Error in resize redraw callback', { error });
      }
    } else {
      logger.warn(LOG_CATEGORIES.UI, 'ResizeHandle: No callback set or callback is not a function');
    }
  }

  /**
   * Clean up event listeners
   */
  destroy(): void {
    if (this.resizeHandle) {
      this.resizeHandle.removeEventListener('mousedown', this.handleMouseDown);
      this.resizeHandle.removeEventListener('dblclick', this.handleDoubleClick);
    }
    document.removeEventListener('mousemove', this.handleMouseMove);
    document.removeEventListener('mouseup', this.handleMouseUp);

    // Clear debounce timer
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
    }
  }
}

export default ResizeHandle;
