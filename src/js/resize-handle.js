/**
 * Resize Handle Manager
 *
 * Handles the resizing functionality for the debug panel
 */

class ResizeHandle {
  constructor() {
    this.resizeHandle = null;
    this.tabsPanel = null;
    this.mainContainer = null;
    this.isResizing = false;
    this.startX = 0;
    this.startWidth = 0;

    // Bind event handlers
    this.handleMouseDown = this.handleMouseDown.bind(this);
    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleMouseUp = this.handleMouseUp.bind(this);
  }

  /**
   * Initialize the resize handle functionality
   */
  initialize() {
    this.resizeHandle = document.getElementById('resize-handle');
    this.tabsPanel = document.getElementById('tabs-panel');
    this.mainContainer = document.getElementById('main-container');

    if (!this.resizeHandle || !this.tabsPanel || !this.mainContainer) {
      console.error('Resize handle elements not found');
      return false;
    }

    // Attach event listeners
    this.resizeHandle.addEventListener('mousedown', this.handleMouseDown);
    document.addEventListener('mousemove', this.handleMouseMove);
    document.addEventListener('mouseup', this.handleMouseUp);

    console.log('Resize handle initialized');
    return true;
  }

  /**
   * Handle mouse down event - start resizing
   */
  handleMouseDown(e) {
    console.log('Resize started');
    this.isResizing = true;
    this.startX = e.clientX;
    this.startWidth = this.tabsPanel.offsetWidth;

    // Prevent text selection during resize
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    e.preventDefault();
  }

  /**
   * Handle mouse move event - perform resizing
   */
  handleMouseMove(e) {
    if (!this.isResizing) return;

    const maxWidth = parseInt(this.tabsPanel.style.maxWidth) || 800;
    const minWidth = parseInt(this.tabsPanel.style.minWidth) || 200;

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
  handleMouseUp() {
    if (this.isResizing) {
      console.log('Resize ended');
      this.isResizing = false;
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    }
  }

  /**
   * Clean up event listeners
   */
  destroy() {
    if (this.resizeHandle) {
      this.resizeHandle.removeEventListener('mousedown', this.handleMouseDown);
    }
    document.removeEventListener('mousemove', this.handleMouseMove);
    document.removeEventListener('mouseup', this.handleMouseUp);
  }
}

export default ResizeHandle;
