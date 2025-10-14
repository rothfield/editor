/**
 * WASM Integration Module
 *
 * Handles loading and initialization of the WebAssembly module,
 * providing a clean interface to WASM functionality.
 */

import logger, { LOG_CATEGORIES } from './logger.js';

/**
 * WASM module wrapper providing access to all WASM functionality
 */
class WasmIntegration {
  constructor() {
    this.module = null;
    this.isLoaded = false;
    this.loadStartTime = 0;
  }

  /**
   * Load and initialize the WASM module
   *
   * @returns {Promise<Object>} Initialized WASM module with all APIs
   * @throws {Error} If WASM module fails to load
   */
  async initialize() {
    try {
      logger.info(LOG_CATEGORIES.EDITOR, 'Initializing WASM module...');
      this.loadStartTime = performance.now();

      // Load WASM module
      const wasmModule = await import('/dist/pkg/editor_wasm.js');

      // Initialize WASM
      await wasmModule.default();

      // Create module wrapper with all WASM APIs
      this.module = this.createModuleWrapper(wasmModule);

      const loadTime = performance.now() - this.loadStartTime;
      this.isLoaded = true;

      logger.info(LOG_CATEGORIES.EDITOR, `WASM module loaded successfully in ${loadTime.toFixed(2)}ms`);

      return this.module;
    } catch (error) {
      logger.error(LOG_CATEGORIES.EDITOR, 'Failed to load WASM module', {
        error: error.message,
        stack: error.stack
      });
      throw new Error(`WASM initialization failed: ${error.message}`);
    }
  }

  /**
   * Create a wrapper object with all WASM API methods
   *
   * @private
   * @param {Object} wasmModule - The loaded WASM module
   * @returns {Object} Module wrapper with organized API methods
   */
  createModuleWrapper(wasmModule) {
    return {
      // Core components
      beatDeriver: new wasmModule.BeatDeriver(),
      layoutRenderer: new wasmModule.LayoutRenderer(16),

      // Text editing API
      insertCharacter: wasmModule.insertCharacter,
      deleteCharacter: wasmModule.deleteCharacter,
      parseText: wasmModule.parseText,

      // Musical annotation API
      applyOctave: wasmModule.applyOctave,
      applySlur: wasmModule.applySlur,
      removeSlur: wasmModule.removeSlur,
      hasSlurInSelection: wasmModule.hasSlurInSelection,

      // Document management API
      createNewDocument: wasmModule.createNewDocument,
      setTitle: wasmModule.setTitle,
      setStaveLabel: wasmModule.setStaveLabel,
      setStaveLyrics: wasmModule.setStaveLyrics,
      setStaveTala: wasmModule.setStaveTala,

      // Export/Import API
      exportMusicXML: wasmModule.exportMusicXML,
      convertMusicXMLToLilyPond: wasmModule.convertMusicXMLToLilyPond
    };
  }

  /**
   * Get the WASM module (must be initialized first)
   *
   * @returns {Object|null} The WASM module or null if not loaded
   */
  getModule() {
    return this.module;
  }

  /**
   * Check if WASM module is loaded and ready
   *
   * @returns {boolean} True if module is loaded
   */
  isReady() {
    return this.isLoaded && this.module !== null;
  }

  /**
   * Get load time in milliseconds
   *
   * @returns {number} Time taken to load WASM module
   */
  getLoadTime() {
    if (!this.isLoaded) {
      return 0;
    }
    return performance.now() - this.loadStartTime;
  }

  /**
   * Safely call a WASM function with error handling
   *
   * @param {string} methodName - Name of the WASM method to call
   * @param {...any} args - Arguments to pass to the method
   * @returns {any} Result from WASM method
   * @throws {Error} If WASM is not loaded or method fails
   */
  safeCall(methodName, ...args) {
    if (!this.isReady()) {
      throw new Error('WASM module not initialized');
    }

    if (!this.module[methodName]) {
      throw new Error(`WASM method '${methodName}' not found`);
    }

    try {
      logger.debug(LOG_CATEGORIES.EDITOR, `Calling WASM method: ${methodName}`, {
        argCount: args.length
      });

      const result = this.module[methodName](...args);

      logger.trace(LOG_CATEGORIES.EDITOR, `WASM method ${methodName} completed successfully`);

      return result;
    } catch (error) {
      logger.error(LOG_CATEGORIES.EDITOR, `WASM method ${methodName} failed`, {
        error: error.message,
        args: args.length
      });
      throw new Error(`WASM call failed: ${methodName} - ${error.message}`);
    }
  }

  /**
   * Insert a character at the specified position
   *
   * @param {Array} cells - Current cell array
   * @param {string} char - Character to insert
   * @param {number} position - Position to insert at
   * @param {number} pitchSystem - Current pitch system
   * @returns {Array} Updated cell array
   */
  insertCharacter(cells, char, position, pitchSystem) {
    return this.safeCall('insertCharacter', cells, char, position, pitchSystem);
  }

  /**
   * Delete a character at the specified position
   *
   * @param {Array} cells - Current cell array
   * @param {number} position - Position to delete from
   * @returns {Array} Updated cell array
   */
  deleteCharacter(cells, position) {
    return this.safeCall('deleteCharacter', cells, position);
  }

  /**
   * Parse text into cells
   *
   * @param {string} text - Text to parse
   * @param {number} pitchSystem - Pitch system to use
   * @returns {Array} Array of cells
   */
  parseText(text, pitchSystem) {
    return this.safeCall('parseText', text, pitchSystem);
  }

  /**
   * Apply octave marking to selection
   *
   * @param {Array} cells - Current cell array
   * @param {number} startPos - Selection start
   * @param {number} endPos - Selection end
   * @param {number} octave - Octave value (-2 to 2)
   * @returns {Array} Updated cell array
   */
  applyOctave(cells, startPos, endPos, octave) {
    return this.safeCall('applyOctave', cells, startPos, endPos, octave);
  }

  /**
   * Apply slur to selection
   *
   * @param {Array} cells - Current cell array
   * @param {number} startPos - Selection start
   * @param {number} endPos - Selection end
   * @returns {Array} Updated cell array
   */
  applySlur(cells, startPos, endPos) {
    return this.safeCall('applySlur', cells, startPos, endPos);
  }

  /**
   * Remove slur from selection
   *
   * @param {Array} cells - Current cell array
   * @param {number} startPos - Selection start
   * @param {number} endPos - Selection end
   * @returns {Array} Updated cell array
   */
  removeSlur(cells, startPos, endPos) {
    return this.safeCall('removeSlur', cells, startPos, endPos);
  }

  /**
   * Check if selection has a slur
   *
   * @param {Array} cells - Current cell array
   * @param {number} startPos - Selection start
   * @param {number} endPos - Selection end
   * @returns {boolean} True if selection has slur
   */
  hasSlurInSelection(cells, startPos, endPos) {
    return this.safeCall('hasSlurInSelection', cells, startPos, endPos);
  }

  /**
   * Derive beats from cells
   *
   * @param {Array} cells - Cell array to analyze
   * @returns {Array} Array of beat objects
   */
  deriveBeats(cells) {
    if (!this.module || !this.module.beatDeriver) {
      logger.error(LOG_CATEGORIES.EDITOR, 'BeatDeriver not available');
      return [];
    }

    try {
      return this.module.beatDeriver.deriveImplicitBeats(cells);
    } catch (error) {
      logger.error(LOG_CATEGORIES.EDITOR, 'Beat derivation failed', {
        error: error.message,
        cellCount: cells?.length || 0
      });
      return [];
    }
  }

  /**
   * Create a new empty document
   *
   * @returns {Object} New document object
   */
  createNewDocument() {
    return this.safeCall('createNewDocument');
  }

  /**
   * Set document title
   *
   * @param {Object} document - Document object
   * @param {string} title - New title
   * @returns {Object} Updated document
   */
  setTitle(document, title) {
    return this.safeCall('setTitle', document, title);
  }

  /**
   * Set stave label
   *
   * @param {Object} document - Document object
   * @param {number} staveIndex - Stave index
   * @param {string} label - New label
   * @returns {Object} Updated document
   */
  setStaveLabel(document, staveIndex, label) {
    return this.safeCall('setStaveLabel', document, staveIndex, label);
  }

  /**
   * Set stave lyrics
   *
   * @param {Object} document - Document object
   * @param {number} staveIndex - Stave index
   * @param {string} lyrics - New lyrics
   * @returns {Object} Updated document
   */
  setStaveLyrics(document, staveIndex, lyrics) {
    return this.safeCall('setStaveLyrics', document, staveIndex, lyrics);
  }

  /**
   * Set stave tala
   *
   * @param {Object} document - Document object
   * @param {number} staveIndex - Stave index
   * @param {string} tala - New tala notation
   * @returns {Object} Updated document
   */
  setStaveTala(document, staveIndex, tala) {
    return this.safeCall('setStaveTala', document, staveIndex, tala);
  }
}

// Export singleton instance
const wasmIntegration = new WasmIntegration();

export default wasmIntegration;
export { WasmIntegration };
