/**
 * MouseHandler - Minimal mouse interaction handler for textarea mode
 *
 * With textarea-based rendering, the browser handles most mouse interactions natively:
 * - Click/focus: handled by textarea
 * - Drag selection: handled by textarea
 * - Double-click (word/beat selection): handled by browser's default word selection
 * - Triple-click (line selection): handled by browser
 *
 * This handler only manages:
 * - Closing menus when clicking in editor
 */

export class MouseHandler {
  constructor(editor) {
    this.editor = editor;
  }

  /**
   * Handle mouse down - close menus, let textarea handle the rest
   * @param {MouseEvent} event - Browser mouse event
   */
  handleMouseDown(event) {
    // Close any open menus when clicking in editor
    if (this.editor?.ui?.activeMenu) {
      this.editor.ui.closeAllMenus();
    }
    // Let browser/textarea handle focus and selection natively
  }

  /**
   * Handle mouse move - no-op for textarea mode
   * @param {MouseEvent} event - Browser mouse event
   */
  handleMouseMove(event) {
    // Textarea handles drag selection natively
  }

  /**
   * Handle mouse up - no-op for textarea mode
   * @param {MouseEvent} event - Browser mouse event
   */
  handleMouseUp(event) {
    // Textarea handles selection completion natively
  }

  /**
   * Handle double click - no-op for textarea mode
   * Browser's default word selection works for beat selection
   * (beats are separated by spaces)
   * @param {MouseEvent} event - Browser mouse event
   */
  handleDoubleClick(event) {
    // Browser's default word selection handles beat selection
  }
}

export default MouseHandler;
