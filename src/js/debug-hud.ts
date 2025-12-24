/**
 * Debug HUD Component - Visual Logger for Cursor/Selection State
 *
 * Displays real-time cursor and selection information from WASM state:
 * - Caret position (stave, col, desiredCol)
 * - Selection anchor, head, start, end
 *
 * This is UI-only code (belongs in JS, not WASM).
 * Data comes from WASM via getCaretInfo/getSelectionInfo queries.
 */

interface CaretPosition {
  line: number;
  col: number;
}

interface CaretInfo {
  caret: CaretPosition;
  desired_col: number;
}

interface SelectionPosition {
  line: number;
  col: number;
}

interface SelectionInfo {
  is_empty: boolean;
  anchor: SelectionPosition;
  head: SelectionPosition;
  start: SelectionPosition;
  end: SelectionPosition;
  is_forward: boolean;
}

interface WASMModule {
  getCaretInfo?: () => CaretInfo | null;
  getSelectionInfo?: () => SelectionInfo | null;
}

interface Editor {
  wasmModule?: WASMModule | null;
}

export class DebugHUD {
  private editor: Editor;
  private element: HTMLDivElement | null = null;
  private enabled: boolean = false;
  private updateInterval: number | null = null;

  constructor(editor: Editor) {
    this.editor = editor;
  }

  /**
   * Toggle HUD visibility
   */
  toggle(): void {
    if (this.enabled) {
      this.hide();
    } else {
      this.show();
    }
  }

  /**
   * Show HUD and start updates
   */
  show(): void {
    if (this.enabled) return;

    this.enabled = true;
    this.createElement();
    this.startUpdates();
  }

  /**
   * Hide HUD and stop updates
   */
  hide(): void {
    if (!this.enabled) return;

    this.enabled = false;
    this.stopUpdates();

    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
    this.element = null;
  }

  /**
   * Create HUD DOM element
   */
  createElement(): void {
    this.element = document.createElement('div');
    this.element.id = 'debug-hud';
    this.element.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      background: rgba(0, 0, 0, 0.85);
      color: #0f0;
      font-family: 'Courier New', monospace;
      font-size: 11px;
      padding: 8px 12px;
      border: 1px solid #0f0;
      border-radius: 4px;
      z-index: 10000;
      line-height: 1.4;
      min-width: 200px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
      user-select: none;
    `;

    document.body.appendChild(this.element);
  }

  /**
   * Start periodic updates
   */
  startUpdates(): void {
    // Update immediately
    this.update();

    // Then update every 100ms
    this.updateInterval = window.setInterval(() => {
      this.update();
    }, 100);
  }

  /**
   * Stop periodic updates
   */
  stopUpdates(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  /**
   * Update HUD display from WASM state
   */
  update(): void {
    if (!this.element || !this.enabled) return;

    try {
      // Query WASM for cursor info
      const caretInfo = this.editor.wasmModule?.getCaretInfo?.();
      const selectionInfo = this.editor.wasmModule?.getSelectionInfo?.();

      if (!caretInfo) {
        this.element.innerHTML = '<div style="color: #f00;">WASM not ready</div>';
        return;
      }

      // Build HUD content
      let html = '<div style="font-weight: bold; margin-bottom: 4px; color: #0ff;">Cursor/Selection State</div>';

      // Caret info
      html += `<div style="color: #fff;">Caret: (${caretInfo.caret.line}, ${caretInfo.caret.col})</div>`;
      html += `<div style="color: #fff;">DesiredCol: ${caretInfo.desired_col}</div>`;

      // Selection info (if active)
      if (selectionInfo && !selectionInfo.is_empty) {
        html += '<div style="margin-top: 6px; border-top: 1px solid #0f0; padding-top: 4px;">';
        html += `<div style="color: #ff0;">Anchor: (${selectionInfo.anchor.line}, ${selectionInfo.anchor.col})</div>`;
        html += `<div style="color: #ff0;">Head: (${selectionInfo.head.line}, ${selectionInfo.head.col})</div>`;
        html += `<div style="color: #0f0;">Start: (${selectionInfo.start.line}, ${selectionInfo.start.col})</div>`;
        html += `<div style="color: #0f0;">End: (${selectionInfo.end.line}, ${selectionInfo.end.col})</div>`;
        html += `<div style="color: #888;">Forward: ${selectionInfo.is_forward ? 'yes' : 'no'}</div>`;
        html += '</div>';
      } else {
        html += '<div style="margin-top: 6px; color: #666;">No selection</div>';
      }

      this.element.innerHTML = html;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('DebugHUD update error:', error);
      this.element.innerHTML = `<div style="color: #f00;">Error: ${errorMessage}</div>`;
    }
  }

  /**
   * Cleanup on destroy
   */
  destroy(): void {
    this.hide();
  }
}
