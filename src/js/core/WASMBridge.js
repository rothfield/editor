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

export class WASMBridge {
  constructor(wasmModuleImport) {
    if (!wasmModuleImport) {
      throw new Error('WASM module import is required');
    }

    // Store raw WASM module reference
    this.rawModule = wasmModuleImport;

    // Map all WASM functions for easy access with automatic error wrapping
    this._initializeFunctionMappings();

    logger.info(LOG_CATEGORIES.INITIALIZATION, 'WASMBridge initialized with error handling');
  }

  /**
   * Wrap a WASM function with comprehensive error handling
   * @private
   */
  _wrapFunction(fn, name) {
    if (!fn) {
      logger.warn(LOG_CATEGORIES.WASM, `WASM function '${name}' is undefined`);
      return (...args) => {
        throw new Error(`WASM function '${name}' is not available`);
      };
    }

    return (...args) => {
      try {
        const result = fn(...args);
        return result;
      } catch (error) {
        logger.error(LOG_CATEGORIES.WASM, `WASM call failed: ${name}`, {
          error: error.message || error,
          stack: error.stack,
          argsCount: args.length
        });
        // Re-throw with additional context
        throw new Error(`WASM function '${name}' failed: ${error.message || error}`);
      }
    };
  }

  /**
   * Initialize all WASM function mappings with automatic error wrapping
   * @private
   */
  _initializeFunctionMappings() {
    const wasm = this.rawModule;

    // List of all WASM functions to map with automatic error handling
    const functionNames = [
      // New recursive descent API
      'insertCharacter', 'parseText', 'deleteCharacter',

      // Layered Architecture API
      'selectWholeBeat', 'shiftOctave',
      'toggleSlur', 'applySlurLayered', 'removeSlurLayered', 'getSlursForLine', 'applyAnnotationSlursToCells',

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
      'setTitle', 'setComposer', 'setDocumentPitchSystem',
      'setLineLabel', 'setLineLyrics', 'setLineTala', 'setLinePitchSystem',
      'setLineNewSystem', 'setLineStaffRole',

      // Line manipulation API
      'splitLineAtPosition',

      // Layout API
      'computeLayout',

      // Export APIs
      'exportMusicXML', 'convertMusicXMLToLilyPond', 'exportMIDI', 'generateIRJson',

      // Font Configuration API
      'getFontConfig',

      // Cursor/Selection API
      'getCaretInfo', 'getSelectionInfo', 'setSelection', 'clearSelection',
      'startSelection', 'extendSelection',

      // Cursor Movement API
      'moveLeft', 'moveRight', 'moveUp', 'moveDown', 'moveHome', 'moveEnd',

      // Mouse API
      'mouseDown', 'mouseMove', 'mouseUp',
      'selectBeatAtPosition', 'selectLineAtPosition',

      // Position Conversion API
      'getMaxCharPosition', 'charPosToCellIndex', 'cellIndexToCharPos', 'charPosToPixel',
      'cellColToPixel' // NEW: Direct cell column → pixel (one cell = one glyph model)
    ];

    // Automatically wrap all functions with error handling
    functionNames.forEach(name => {
      this[name] = this._wrapFunction(wasm[name], name);
    });

    logger.debug(LOG_CATEGORIES.INITIALIZATION, `Wrapped ${functionNames.length} WASM functions`);
  }

  /**
   * Synchronize JavaScript document with WASM
   * This is critical to ensure WASM has latest document state
   *
   * @param {Object} document - The JavaScript document object
   * @returns {boolean} - Success status
   */
  syncDocument(document) {
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
   * @param {string} functionName - Name of the WASM function to call
   * @param {...any} args - Arguments to pass to the function
   * @returns {any} - Result from WASM function
   * @throws {Error} - If function doesn't exist or call fails
   */
  callSafe(functionName, ...args) {
    if (typeof this[functionName] !== 'function') {
      throw new Error(`WASM function '${functionName}' does not exist`);
    }

    // Functions are already wrapped, so just call directly
    return this[functionName](...args);
  }

  /**
   * Check if a WASM function exists and is callable
   *
   * @param {string} functionName - Name of the function to check
   * @returns {boolean} - True if function exists and is callable
   */
  hasFunction(functionName) {
    return typeof this[functionName] === 'function';
  }

  /**
   * Get list of all available WASM functions
   * Useful for debugging and validation
   *
   * @returns {string[]} - Array of function names
   */
  getAvailableFunctions() {
    const functions = [];
    for (const key in this) {
      if (typeof this[key] === 'function' && !key.startsWith('_')) {
        functions.push(key);
      }
    }
    return functions.sort();
  }

  /**
   * Validate that required WASM functions are available
   * Called during initialization to catch integration issues early
   *
   * @throws {Error} - If required functions are missing
   */
  validateRequiredFunctions() {
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
}

export default WASMBridge;
