/**
 * WASMBridge - Encapsulates all WASM module interactions
 *
 * This class provides a clean interface to the WASM module, handling:
 * - WASM function mapping and initialization
 * - Automatic error handling for all WASM calls
 * - Document synchronization with WASM
 * - Result validation
 */

import logger, { LOG_CATEGORIES } from '../logger.js';
import type { WASMModule } from '~types/wasm-module';
import type { Document } from '~types/wasm';

/**
 * Editor interface for window.editor (used for auto-redraw)
 */
interface EditorInstance {
  renderAndUpdate(): Promise<void>;
  updateDocumentDisplay(): void;
}

/**
 * Extended window interface with editor
 */
declare global {
  interface Window {
    editor?: EditorInstance;
  }
}

/**
 * WASMBridge class that wraps the raw WASM module with error handling
 * and automatic redraw triggering.
 *
 * Implements the WASMModule interface by dynamically mapping all functions
 * from the raw WASM module at construction time.
 */
export class WASMBridge implements WASMModule {
  /** Raw WASM module reference from wasm-pack */
  private rawModule: any;

  /**
   * Create a new WASMBridge
   * @param wasmModuleImport - Raw WASM module from wasm-pack
   * @throws {Error} If WASM module is not provided
   */
  constructor(wasmModuleImport: any) {
    if (!wasmModuleImport) {
      throw new Error('WASM module import is required');
    }

    this.rawModule = wasmModuleImport;

    // Map all WASM functions for easy access with automatic error wrapping
    this._initializeFunctionMappings();

    logger.info(LOG_CATEGORIES.INITIALIZATION, 'WASMBridge initialized with error handling');
  }

  /**
   * Wrap a WASM function with comprehensive error handling
   * @param fn - The WASM function to wrap
   * @param name - The function name for logging
   * @param shouldTriggerRedraw - Whether this function mutates the document and needs redraw
   * @returns Wrapped function with error handling
   */
  private _wrapFunction<T extends (...args: any[]) => any>(
    fn: T | undefined,
    name: string,
    shouldTriggerRedraw = false
  ): T {
    if (!fn) {
      logger.warn(LOG_CATEGORIES.WASM, `WASM function '${name}' is undefined`);
      return ((...args: any[]) => {
        throw new Error(`WASM function '${name}' is not available`);
      }) as unknown as T;
    }

    return ((...args: any[]) => {
      try {
        const result = fn(...args);

        // Trigger redraw if this is a document-mutating function
        if (shouldTriggerRedraw) {
          console.log(`[WASMBridge] Function '${name}' mutated document, triggering automatic redraw`);
          // Emit event to notify editor that document has changed
          if (typeof window !== 'undefined' && window.editor) {
            // Schedule update on next tick to avoid blocking WASM call
            setTimeout(async () => {
              try {
                await window.editor!.renderAndUpdate();
                window.editor!.updateDocumentDisplay();
              } catch (error) {
                console.error(`[WASMBridge] Error during automatic redraw for '${name}':`, error);
              }
            }, 0);
          } else {
            console.warn(`[WASMBridge] Cannot trigger redraw - window.editor not available`);
          }
        }

        return result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;

        logger.error(LOG_CATEGORIES.WASM, `WASM call failed: ${name}`, {
          error: errorMessage,
          stack: errorStack,
          argsCount: args.length
        });

        // Re-throw with additional context
        throw new Error(`WASM function '${name}' failed: ${errorMessage}`);
      }
    }) as T;
  }

  /**
   * Initialize all WASM function mappings with automatic error wrapping
   * This dynamically adds all WASM functions to this instance
   */
  private _initializeFunctionMappings(): void {
    const wasm = this.rawModule;

    // Functions that mutate the document and should trigger redraw
    const documentMutatingFunctions = [
      'setTitle', 'setComposer', 'setDocumentPitchSystem', 'setDocumentTonic', 'setDocumentKeySignature',
      'setLineLabel', 'setLineLyrics', 'setLineTala', 'setLinePitchSystem', 'setLineTonic', 'setLineKeySignature',
      'setLineNewSystem', 'setLineStaffRole', 'setActiveConstraint'
    ];

    // List of all WASM functions to map with automatic error handling
    const functionNames: Array<keyof WASMModule> = [
      // New recursive descent API
      'insertCharacter', 'parseText', 'deleteCharacter',

      // Layered Architecture API
      'selectWholeBeat', 'shiftOctave', 'setOctave',
      'toggleSlur', 'applySlurLayered', 'removeSlurLayered', 'getSlursForLine', 'applyAnnotationSlursToCells',
      'applyOrnamentLayered', 'removeOrnamentLayered', 'getOrnamentAt', 'getOrnamentsForLine', 'applyAnnotationOrnamentsToCells',
      'setLineTalaModern',

      // Ornament Copy/Paste API
      'copyOrnamentFromCell', 'pasteOrnamentToCell', 'pasteOrnamentCells',
      'setOrnamentPlacementOnCell', 'clearOrnamentFromCell',

      // Document lifecycle API
      'createNewDocument', 'loadDocument', 'getDocumentSnapshot',

      // Core edit primitive
      'editReplaceRange',

      // WASM-First Text Editing Operations
      'insertText', 'deleteAtCursor', 'deleteForward', 'insertNewline',

      // Copy/Paste API
      'copyCells', 'pasteCells',

      // Primary Selection API
      'getPrimarySelection', 'updatePrimarySelection',

      // Undo/Redo API
      'undo', 'redo', 'canUndo', 'canRedo',

      // Document API (metadata)
      'setTitle', 'setComposer', 'setDocumentPitchSystem', 'setDocumentTonic', 'setDocumentKeySignature',
      'setLineLabel', 'setLineLyrics', 'setLineTala', 'setLinePitchSystem', 'setLineTonic', 'setLineKeySignature',
      'setLineNewSystem', 'setLineStaffRole',

      // Line manipulation API
      'splitLineAtPosition',

      // Layout API
      'computeLayout',

      // Export/Import APIs
      'exportMusicXML', 'importMusicXML', 'convertMusicXMLToLilyPond', 'exportMIDI', 'exportMIDIDirect', 'generateIRJson',

      // Font Configuration API
      'getFontConfig', 'setGlyphWidthCache',

      // Pitch System API
      'getAvailablePitchSystems',

      // Constraint System API
      'getPredefinedConstraints', 'isPitchAllowed', 'setActiveConstraint',
      'getActiveConstraint', 'checkPitchAgainstActiveConstraint', 'getConstraintNotes',

      // Cursor/Selection API
      'getCaretInfo', 'getSelectionInfo', 'setSelection', 'clearSelection',
      'startSelection', 'startSelectionAt', 'extendSelection', 'extendSelectionTo',

      // Cursor Movement API
      'moveLeft', 'moveRight', 'moveUp', 'moveDown', 'moveHome', 'moveEnd',

      // Mouse API
      'mouseDown', 'mouseMove', 'mouseUp',
      'selectBeatAtPosition', 'selectLineAtPosition',

      // Position Conversion API
      'getMaxCharPosition', 'charPosToCellIndex', 'cellIndexToCharPos', 'charPosToPixel',
      'cellColToPixel'
    ];

    // Automatically wrap all functions with error handling
    functionNames.forEach(name => {
      const shouldTriggerRedraw = documentMutatingFunctions.includes(name as string);
      (this as any)[name] = this._wrapFunction(wasm[name], name as string, shouldTriggerRedraw);
    });

    logger.debug(LOG_CATEGORIES.INITIALIZATION, `Wrapped ${functionNames.length} WASM functions`);
  }

  /**
   * Synchronize JavaScript document with WASM
   * This is critical to ensure WASM has latest document state
   *
   * @param document - The JavaScript document object
   * @returns Success status
   */
  syncDocument(document: Document | null): boolean {
    if (!document) {
      logger.warn(LOG_CATEGORIES.WASM, 'Cannot sync: document is null');
      return false;
    }

    try {
      this.loadDocument(document);
      return true;
    } catch (error) {
      logger.error(LOG_CATEGORIES.WASM, 'Failed to sync document with WASM', { error });
      return false;
    }
  }

  /**
   * Call a WASM function with error handling
   * (Legacy method - all functions are now auto-wrapped)
   *
   * @param functionName - Name of the WASM function to call
   * @param args - Arguments to pass to the function
   * @returns Result from WASM function
   * @throws {Error} If function doesn't exist or call fails
   */
  callSafe(functionName: string, ...args: any[]): any {
    if (typeof (this as any)[functionName] !== 'function') {
      throw new Error(`WASM function '${functionName}' does not exist`);
    }

    // Functions are already wrapped, so just call directly
    return (this as any)[functionName](...args);
  }

  /**
   * Check if a WASM function exists and is callable
   *
   * @param functionName - Name of the function to check
   * @returns True if function exists and is callable
   */
  hasFunction(functionName: string): boolean {
    return typeof (this as any)[functionName] === 'function';
  }

  /**
   * Get list of all available WASM functions
   * Useful for debugging and validation
   *
   * @returns Array of function names
   */
  getAvailableFunctions(): string[] {
    const functions: string[] = [];
    for (const key in this) {
      if (typeof (this as any)[key] === 'function' && !key.startsWith('_')) {
        functions.push(key);
      }
    }
    return functions.sort();
  }

  /**
   * Validate that required WASM functions are available
   * Called during initialization to catch integration issues early
   *
   * @throws {Error} If required functions are missing
   */
  validateRequiredFunctions(): void {
    const required = [
      'createNewDocument',
      'loadDocument',
      'getDocumentSnapshot',
      'insertCharacter',
      'deleteCharacter',
      'moveLeft',
      'moveRight',
      'getCaretInfo',
      'exportMusicXML'
    ];

    const missing = required.filter(fn => !this.hasFunction(fn));

    if (missing.length > 0) {
      throw new Error(
        `Missing required WASM functions: ${missing.join(', ')}\n` +
        `Available functions: ${this.getAvailableFunctions().join(', ')}`
      );
    }

    logger.info(LOG_CATEGORIES.INITIALIZATION, 'All required WASM functions validated');
  }

  // Note: All WASMModule interface methods are dynamically added in _initializeFunctionMappings()
  // TypeScript will trust that they exist at runtime since we implement WASMModule
  // The actual implementations are proxied from this.rawModule

  // Stub declarations to satisfy TypeScript (actual implementations added dynamically)
  getFontConfig!: WASMModule['getFontConfig'];
  setGlyphWidthCache!: WASMModule['setGlyphWidthCache'];
  getAvailablePitchSystems!: WASMModule['getAvailablePitchSystems'];
  createNewDocument!: WASMModule['createNewDocument'];
  loadDocument!: WASMModule['loadDocument'];
  getDocumentSnapshot!: WASMModule['getDocumentSnapshot'];
  setTitle!: WASMModule['setTitle'];
  setComposer!: WASMModule['setComposer'];
  setDocumentPitchSystem!: WASMModule['setDocumentPitchSystem'];
  setDocumentTonic!: WASMModule['setDocumentTonic'];
  setDocumentKeySignature!: WASMModule['setDocumentKeySignature'];
  setLineLabel!: WASMModule['setLineLabel'];
  setLineLyrics!: WASMModule['setLineLyrics'];
  setLineTala!: WASMModule['setLineTala'];
  setLineTalaModern!: WASMModule['setLineTalaModern'];
  setLinePitchSystem!: WASMModule['setLinePitchSystem'];
  setLineTonic!: WASMModule['setLineTonic'];
  setLineKeySignature!: WASMModule['setLineKeySignature'];
  setLineNewSystem!: WASMModule['setLineNewSystem'];
  setLineStaffRole!: WASMModule['setLineStaffRole'];
  insertText!: WASMModule['insertText'];
  deleteAtCursor!: WASMModule['deleteAtCursor'];
  deleteForward!: WASMModule['deleteForward'];
  insertNewline!: WASMModule['insertNewline'];
  editReplaceRange!: WASMModule['editReplaceRange'];
  insertCharacter!: WASMModule['insertCharacter'];
  parseText!: WASMModule['parseText'];
  deleteCharacter!: WASMModule['deleteCharacter'];
  splitLineAtPosition!: WASMModule['splitLineAtPosition'];
  selectWholeBeat!: WASMModule['selectWholeBeat'];
  shiftOctave!: WASMModule['shiftOctave'];
  setOctave!: WASMModule['setOctave'];
  toggleSlur!: WASMModule['toggleSlur'];
  applySlurLayered!: WASMModule['applySlurLayered'];
  removeSlurLayered!: WASMModule['removeSlurLayered'];
  getSlursForLine!: WASMModule['getSlursForLine'];
  applyAnnotationSlursToCells!: WASMModule['applyAnnotationSlursToCells'];
  applyOrnamentLayered!: WASMModule['applyOrnamentLayered'];
  removeOrnamentLayered!: WASMModule['removeOrnamentLayered'];
  getOrnamentAt!: WASMModule['getOrnamentAt'];
  getOrnamentsForLine!: WASMModule['getOrnamentsForLine'];
  applyAnnotationOrnamentsToCells!: WASMModule['applyAnnotationOrnamentsToCells'];
  copyOrnamentFromCell!: WASMModule['copyOrnamentFromCell'];
  pasteOrnamentToCell!: WASMModule['pasteOrnamentToCell'];
  pasteOrnamentCells!: WASMModule['pasteOrnamentCells'];
  clearOrnamentFromCell!: WASMModule['clearOrnamentFromCell'];
  setOrnamentPlacementOnCell!: WASMModule['setOrnamentPlacementOnCell'];
  copyCells!: WASMModule['copyCells'];
  pasteCells!: WASMModule['pasteCells'];
  getPrimarySelection!: WASMModule['getPrimarySelection'];
  updatePrimarySelection!: WASMModule['updatePrimarySelection'];
  undo!: WASMModule['undo'];
  redo!: WASMModule['redo'];
  canUndo!: WASMModule['canUndo'];
  canRedo!: WASMModule['canRedo'];
  computeLayout!: WASMModule['computeLayout'];
  getCaretInfo!: WASMModule['getCaretInfo'];
  getSelectionInfo!: WASMModule['getSelectionInfo'];
  setSelection!: WASMModule['setSelection'];
  clearSelection!: WASMModule['clearSelection'];
  startSelection!: WASMModule['startSelection'];
  startSelectionAt!: WASMModule['startSelectionAt'];
  extendSelection!: WASMModule['extendSelection'];
  extendSelectionTo!: WASMModule['extendSelectionTo'];
  moveLeft!: WASMModule['moveLeft'];
  moveRight!: WASMModule['moveRight'];
  moveUp!: WASMModule['moveUp'];
  moveDown!: WASMModule['moveDown'];
  moveHome!: WASMModule['moveHome'];
  moveEnd!: WASMModule['moveEnd'];
  mouseDown!: WASMModule['mouseDown'];
  mouseMove!: WASMModule['mouseMove'];
  mouseUp!: WASMModule['mouseUp'];
  selectBeatAtPosition!: WASMModule['selectBeatAtPosition'];
  selectLineAtPosition!: WASMModule['selectLineAtPosition'];
  getPredefinedConstraints!: WASMModule['getPredefinedConstraints'];
  isPitchAllowed!: WASMModule['isPitchAllowed'];
  setActiveConstraint!: WASMModule['setActiveConstraint'];
  getActiveConstraint!: WASMModule['getActiveConstraint'];
  getConstraintNotes!: WASMModule['getConstraintNotes'];
  checkPitchAgainstActiveConstraint!: WASMModule['checkPitchAgainstActiveConstraint'];
  getMaxCharPosition!: WASMModule['getMaxCharPosition'];
  charPosToCellIndex!: WASMModule['charPosToCellIndex'];
  cellIndexToCharPos!: WASMModule['cellIndexToCharPos'];
  charPosToPixel!: WASMModule['charPosToPixel'];
  cellColToPixel!: WASMModule['cellColToPixel'];
  exportMusicXML!: WASMModule['exportMusicXML'];
  importMusicXML!: WASMModule['importMusicXML'];
  convertMusicXMLToLilyPond!: WASMModule['convertMusicXMLToLilyPond'];
  exportMIDI!: WASMModule['exportMIDI'];
  exportMIDIDirect!: WASMModule['exportMIDIDirect'];
  generateIRJson!: WASMModule['generateIRJson'];
  toggleOrnamentEditMode!: WASMModule['toggleOrnamentEditMode'];
}

export default WASMBridge;
