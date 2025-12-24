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

interface EditorWithUI {
  ui?: {
    activeMenu?: unknown;
    closeAllMenus?(): void;
  };
}

export class MouseHandler {
  private editor: EditorWithUI;

  constructor(editor: EditorWithUI) {
    this.editor = editor;
  }

  /**
   * Handle mouse down - close menus, prevent native double-click selection
   */
  handleMouseDown(event: MouseEvent): void {
    // Close any open menus when clicking in editor
    if (this.editor?.ui?.activeMenu && this.editor.ui.closeAllMenus) {
      this.editor.ui.closeAllMenus();
    }

    // Prevent native word selection on double-click (detail === 2)
    // Native selection doesn't work with PUA codepoints - we handle it in handleDoubleClick
    const target = event.target as HTMLElement;
    if (target.tagName === 'TEXTAREA' && event.detail === 2) {
      event.preventDefault();
    }
    // Let browser/textarea handle single-click focus and selection natively
  }

  /**
   * Handle mouse move - no-op for textarea mode
   */
  handleMouseMove(_event: MouseEvent): void {
    // Textarea handles drag selection natively
  }

  /**
   * Handle mouse up - no-op for textarea mode
   */
  handleMouseUp(_event: MouseEvent): void {
    // Textarea handles selection completion natively
  }

  /**
   * Handle double click - select beat (characters between spaces)
   * Native browser word selection doesn't work with PUA codepoints,
   * so we compute beat boundaries manually.
   */
  handleDoubleClick(event: MouseEvent): void {
    const target = event.target as HTMLTextAreaElement;
    if (target.tagName !== 'TEXTAREA') return;

    // Prevent default word selection (doesn't work with PUA chars)
    event.preventDefault();

    const text = target.value;
    const cursor = target.selectionStart;

    // If cursor is on a space or newline, don't select anything
    if (cursor < text.length && (text[cursor] === ' ' || text[cursor] === '\n')) {
      return;
    }

    // Find beat boundaries (spaces or newlines)
    let start = cursor;
    let end = cursor;

    // Search backward for space, newline, or start of text
    while (start > 0 && text[start - 1] !== ' ' && text[start - 1] !== '\n') {
      start--;
    }

    // Search forward for space, newline, or end of text
    while (end < text.length && text[end] !== ' ' && text[end] !== '\n') {
      end++;
    }

    // Set selection
    target.selectionStart = start;
    target.selectionEnd = end;
  }

  /**
   * Calculate cell position from coordinates
   * @deprecated Textarea mode handles selection natively
   */
  calculateCellPosition(_x: number, _y: number): number | null {
    return null;
  }

  /**
   * Calculate line from Y coordinate
   * @deprecated Textarea mode handles selection natively
   */
  calculateLineFromY(_y: number): number | null {
    return null;
  }

  /**
   * Select entire line at cell position
   * @deprecated Textarea mode handles selection natively
   */
  selectLine(_cellPosition: number): void {
    // No-op: browser handles line selection natively
  }
}

export default MouseHandler;
