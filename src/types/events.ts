/**
 * Event handling types
 */

/**
 * Editor event types
 */
export type EditorEventType =
  | 'keydown'
  | 'keyup'
  | 'click'
  | 'mousedown'
  | 'mouseup'
  | 'mousemove'
  | 'input'
  | 'compositionstart'
  | 'compositionupdate'
  | 'compositionend'
  | 'paste'
  | 'copy'
  | 'cut'
  | 'focus'
  | 'blur';

/**
 * Event handler function signature
 */
export type EventHandler<E extends Event = Event> = (
  event: E
) => void | Promise<void>;

/**
 * Keyboard event handler
 */
export interface KeyboardEventHandler {
  handleKeyDown(event: KeyboardEvent): void | Promise<void>;
  handleKeyUp(event: KeyboardEvent): void | Promise<void>;
}

/**
 * Mouse event handler
 */
export interface MouseEventHandler {
  handleClick(event: MouseEvent): void | Promise<void>;
  handleMouseDown(event: MouseEvent): void | Promise<void>;
  handleMouseUp(event: MouseEvent): void | Promise<void>;
  handleMouseMove(event: MouseEvent): void | Promise<void>;
}

/**
 * Clipboard event handler
 */
export interface ClipboardEventHandler {
  handleCopy(event: ClipboardEvent): void | Promise<void>;
  handleCut(event: ClipboardEvent): void | Promise<void>;
  handlePaste(event: ClipboardEvent): void | Promise<void>;
}

/**
 * Composition event handler (IME input)
 */
export interface CompositionEventHandler {
  handleCompositionStart(event: CompositionEvent): void | Promise<void>;
  handleCompositionUpdate(event: CompositionEvent): void | Promise<void>;
  handleCompositionEnd(event: CompositionEvent): void | Promise<void>;
}

/**
 * Event manager interface
 */
export interface IEventManager {
  addEventListener<K extends keyof HTMLElementEventMap>(
    element: HTMLElement,
    type: K,
    handler: EventHandler<HTMLElementEventMap[K]>,
    options?: AddEventListenerOptions
  ): void;

  removeEventListener<K extends keyof HTMLElementEventMap>(
    element: HTMLElement,
    type: K,
    handler: EventHandler<HTMLElementEventMap[K]>
  ): void;

  removeAllListeners(): void;
}

/**
 * Custom editor events
 */
export interface EditorCustomEvents {
  documentChanged: CustomEvent<{ document: any }>;
  cursorMoved: CustomEvent<{ line: number; col: number }>;
  selectionChanged: CustomEvent<{
    anchor: { line: number; col: number };
    head: { line: number; col: number };
  }>;
  redrawRequested: CustomEvent<{ full: boolean }>;
}
