/**
 * WASMBridge - Encapsulates all WASM module interactions
 *
 * This class provides a clean interface to the WASM module, handling:
 * - WASM function mapping and initialization
 * - Error handling for WASM calls
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

    // Map all WASM functions for easy access
    this._initializeFunctionMappings();

    logger.info(LOG_CATEGORIES.INITIALIZATION, 'WASMBridge initialized');
  }

  /**
   * Initialize all WASM function mappings
   * @private
   */
  _initializeFunctionMappings() {
    const wasm = this.rawModule;

    // New recursive descent API
    this.insertCharacter = wasm.insertCharacter;
    this.parseText = wasm.parseText;
    this.deleteCharacter = wasm.deleteCharacter;
    this.applyOctave = wasm.applyOctave;
    this.applyCommand = wasm.applyCommand;

    // Slur API
    this.applySlur = wasm.applySlur;
    this.removeSlur = wasm.removeSlur;
    this.hasSlurInSelection = wasm.hasSlurInSelection;

    // Ornament Copy/Paste API (cells-array pattern, like applyCommand)
    this.copyOrnamentFromCell = wasm.copyOrnamentFromCell;
    this.pasteOrnamentToCell = wasm.pasteOrnamentToCell;
    this.setOrnamentPlacementOnCell = wasm.setOrnamentPlacementOnCell;
    this.clearOrnamentFromCell = wasm.clearOrnamentFromCell;

    // Ornament Edit Mode API
    this.getOrnamentEditMode = wasm.getOrnamentEditMode;
    this.setOrnamentEditMode = wasm.setOrnamentEditMode;
    this.getNavigableIndices = wasm.getNavigableIndices;

    // Document lifecycle API (WASM-owned)
    this.createNewDocument = wasm.createNewDocument;
    this.loadDocument = wasm.loadDocument;
    this.getDocumentSnapshot = wasm.getDocumentSnapshot;

    // Core edit primitive
    this.editReplaceRange = wasm.editReplaceRange;

    // NEW WASM-First Text Editing Operations (Phase 1 migration)
    this.insertText = wasm.insertText;
    this.deleteAtCursor = wasm.deleteAtCursor;
    this.insertNewline = wasm.insertNewline;

    // Copy/Paste API
    this.copyCells = wasm.copyCells;
    this.pasteCells = wasm.pasteCells;

    // Primary Selection API (X11 style - middle-click paste)
    this.getPrimarySelection = wasm.getPrimarySelection;
    this.updatePrimarySelection = wasm.updatePrimarySelection;

    // Undo/Redo API
    this.undo = wasm.undo;
    this.redo = wasm.redo;
    this.canUndo = wasm.canUndo;
    this.canRedo = wasm.canRedo;

    // Document API (metadata)
    this.setTitle = wasm.setTitle;
    this.setComposer = wasm.setComposer;
    this.setDocumentPitchSystem = wasm.setDocumentPitchSystem;
    this.setLineLabel = wasm.setLineLabel;
    this.setLineLyrics = wasm.setLineLyrics;
    this.setLineTala = wasm.setLineTala;
    this.setLinePitchSystem = wasm.setLinePitchSystem;

    // Line manipulation API
    this.splitLineAtPosition = wasm.splitLineAtPosition;

    // Layout API
    this.computeLayout = wasm.computeLayout;

    // Export APIs
    this.exportMusicXML = wasm.exportMusicXML;
    this.convertMusicXMLToLilyPond = wasm.convertMusicXMLToLilyPond;
    this.exportMIDI = wasm.exportMIDI;
    this.generateIRJson = wasm.generateIRJson;

    // Cursor/Selection API (anchor/head model)
    this.getCaretInfo = wasm.getCaretInfo;
    this.getSelectionInfo = wasm.getSelectionInfo;
    this.setSelection = wasm.setSelection;
    this.clearSelection = wasm.clearSelection;
    this.startSelection = wasm.startSelection;
    this.extendSelection = wasm.extendSelection;

    // Cursor Movement API
    this.moveLeft = wasm.moveLeft;
    this.moveRight = wasm.moveRight;
    this.moveUp = wasm.moveUp;
    this.moveDown = wasm.moveDown;
    this.moveHome = wasm.moveHome;
    this.moveEnd = wasm.moveEnd;

    // Mouse API
    this.mouseDown = wasm.mouseDown;
    this.mouseMove = wasm.mouseMove;
    this.mouseUp = wasm.mouseUp;
    this.selectBeatAtPosition = wasm.selectBeatAtPosition;
    this.selectLineAtPosition = wasm.selectLineAtPosition;

    // Position Conversion API (WASM-first refactoring)
    this.getMaxCharPosition = wasm.getMaxCharPosition;
    this.charPosToCellIndex = wasm.charPosToCellIndex;
    this.cellIndexToCharPos = wasm.cellIndexToCharPos;
    this.charPosToPixel = wasm.charPosToPixel;
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

    try {
      return this[functionName](...args);
    } catch (error) {
      logger.error(LOG_CATEGORIES.WASM, `WASM call failed: ${functionName}`, {
        error,
        args: args.length
      });
      throw error;
    }
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
