/**
 * Editor class and related types
 */

import type { WASMModule } from './wasm-module.js';
import type { Document } from './wasm.js';

/**
 * Editor initialization options
 */
export interface EditorOptions {
  containerSelector: string;
  wasmPath?: string;
  autoSave?: boolean;
  autoSaveInterval?: number;
  theme?: 'light' | 'dark';
}

/**
 * Editor state
 */
export interface EditorState {
  document: Document;
  isDirty: boolean;
  isInitialized: boolean;
  lastSaveTime?: Date;
  filename?: string;
}

/**
 * Editor dependencies (for dependency injection)
 */
export interface EditorDependencies {
  wasmModule: WASMModule;
  renderer: any; // TODO: Type this properly
  eventManager: any; // TODO: Type this properly
  cursorCoordinator: any; // TODO: Type this properly
  selectionCoordinator: any; // TODO: Type this properly
  clipboardCoordinator: any; // TODO: Type this properly
  inspectorCoordinator: any; // TODO: Type this properly
  renderCoordinator: any; // TODO: Type this properly
  consoleCoordinator: any; // TODO: Type this properly
  exportManager: any; // TODO: Type this properly
  storageManager: any; // TODO: Type this properly
}

/**
 * Redraw options
 */
export interface RedrawOptions {
  full?: boolean;
  skipInspector?: boolean;
  cause?: string;
}

/**
 * Editor public API
 */
export interface IEditor {
  // Initialization
  initialize(): Promise<void>;
  dispose(): void;

  // Document operations
  getDocument(): Document;
  setDocument(doc: Document): void;
  createNewDocument(): void;

  // WASM access
  getWASMModule(): WASMModule;

  // Redraw
  requestRedraw(options?: RedrawOptions): void;

  // State
  isDirty(): boolean;
  markClean(): void;
  markDirty(): void;
}
