/**
 * Coordinator interfaces
 *
 * Coordinators are specialized components that manage specific concerns
 * (cursor, selection, clipboard, inspector, etc.)
 */

import type { Pos, CaretInfo, SelectionInfo } from './wasm.js';
import type { RedrawOptions } from './editor.js';

/**
 * Base coordinator interface
 */
export interface ICoordinator {
  initialize?(): void | Promise<void>;
  dispose?(): void;
}

/**
 * Cursor coordinator
 */
export interface ICursorCoordinator extends ICoordinator {
  getCursorPosition(): number;
  getCursorPos(): { line: number; col: number };
  setCursorPosition(positionOrRow: number, col?: number): void;
  validateCursorPosition(position: number): number;
  updateCursorFromWASM(diff: any): Promise<void>;
  showCursor(): void;
  hideCursor(): void;
  getCursorElement(): HTMLElement | null;
  startCursorBlinking(): void;
  stopCursorBlinking(): void;
  updateCursorVisualPosition(): void;
  scrollCursorIntoView(): void;
  updateCursorPositionDisplay(): void;
}

export type CursorDirection = 'left' | 'right' | 'up' | 'down' | 'home' | 'end';

/**
 * Selection coordinator
 */
export interface ISelectionCoordinator extends ICoordinator {
  getSelectionInfo(): SelectionInfo;
  setSelection(anchor: Pos, head: Pos): void;
  clearSelection(): void;
  selectAll(): void;
  selectWholeBeat(): void;
  hasSelection(): boolean;
}

/**
 * Clipboard coordinator
 */
export interface IClipboardCoordinator extends ICoordinator {
  copy(): Promise<void>;
  cut(): Promise<void>;
  paste(): Promise<void>;
  canPaste(): boolean;
}

/**
 * Inspector coordinator
 */
export interface IInspectorCoordinator extends ICoordinator {
  updateAllTabs(): void;
  updateTab(tabName: InspectorTab): void;
  showTab(tabName: InspectorTab): void;
}

export type InspectorTab =
  | 'lilypond'
  | 'musicxml'
  | 'displaylist'
  | 'docmodel'
  | 'font-test'
  | 'ir-json';

/**
 * Render coordinator
 */
export interface IRenderCoordinator extends ICoordinator {
  requestRedraw(options?: RedrawOptions): void;
  scheduleRedraw(): void;
  isRedrawScheduled(): boolean;
}

/**
 * Console coordinator
 */
export interface IConsoleCoordinator extends ICoordinator {
  log(message: string, category?: string): void;
  error(message: string, category?: string): void;
  warn(message: string, category?: string): void;
  clear(): void;
}

/**
 * Export manager
 */
export interface IExportManager {
  exportToFormat(format: ExportFormat): Promise<string>;
  downloadFile(content: string, filename: string, mimeType: string): void;
}

export type ExportFormat = 'musicxml' | 'lilypond' | 'midi' | 'pdf' | 'json';

/**
 * Storage manager
 */
export interface IStorageManager {
  save(filename: string, content: string): Promise<void>;
  load(filename: string): Promise<string>;
  listFiles(): Promise<string[]>;
  deleteFile(filename: string): Promise<void>;
  autoSave(): Promise<void>;
}
