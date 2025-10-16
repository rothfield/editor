/**
 * Document Manager
 *
 * Handles document creation, loading, saving, and metadata management
 * for the Music Notation Editor.
 */

import {
  DEFAULT_DOCUMENT,
  DEFAULT_CURSOR,
  DOCUMENT_FORMAT_VERSION
} from './constants.js';
import logger, { LOG_CATEGORIES } from './logger.js';

/**
 * Manages document lifecycle and operations
 */
class DocumentManager {
  constructor(wasmModule) {
    this.wasmModule = wasmModule;
    this.theDocument = null;
    this.isDirty = false;
    this.changeListeners = new Set();
  }

  /**
   * Create a new empty document
   *
   * @returns {Object} New document object
   */
  createNew() {
    try {
      logger.info(LOG_CATEGORIES.EDITOR, 'Creating new document');

      // Create document using WASM
      const document = this.wasmModule.createNewDocument();

      // Set timestamps
      const now = new Date().toISOString();
      document.created_at = now;
      document.modified_at = now;
      document.version = DOCUMENT_FORMAT_VERSION;

      // Set default metadata
      document.title = DEFAULT_DOCUMENT.TITLE;
      document.tonic = DEFAULT_DOCUMENT.TONIC;
      document.pitch_system = DEFAULT_DOCUMENT.PITCH_SYSTEM;
      document.tala = DEFAULT_DOCUMENT.TALA;
      document.key_signature = DEFAULT_DOCUMENT.KEY_SIGNATURE;

      // Add runtime state
      document.state = {
        cursor: { ...DEFAULT_CURSOR },
        selection: null,
        has_focus: false
      };

      this.theDocument = document;
      this.isDirty = false;

      this.notifyChange('document-created', document);

      logger.info(LOG_CATEGORIES.EDITOR, 'New document created successfully');

      return document;
    } catch (error) {
      logger.error(LOG_CATEGORIES.EDITOR, 'Failed to create document', {
        error: error.message
      });
      throw new Error(`Document creation failed: ${error.message}`);
    }
  }

  /**
   * Load document from JSON string or object
   *
   * @param {string|Object} data - Document JSON or object
   * @returns {Object} Loaded document
   */
  load(data) {
    try {
      logger.info(LOG_CATEGORIES.EDITOR, 'Loading document');

      // Parse if string
      const document = typeof data === 'string' ? JSON.parse(data) : data;

      // Validate document structure
      this.validateDocument(document);

      // Ensure runtime state exists
      if (!document.state) {
        document.state = {
          cursor: { ...DEFAULT_CURSOR },
          selection: null,
          has_focus: false
        };
      }

      // Update modified time
      document.modified_at = new Date().toISOString();

      this.theDocument = document;
      this.isDirty = false;

      this.notifyChange('document-loaded', document);

      logger.info(LOG_CATEGORIES.EDITOR, 'Document loaded successfully', {
        title: document.title,
        lineCount: document.lines?.length || 0
      });

      return document;
    } catch (error) {
      logger.error(LOG_CATEGORIES.EDITOR, 'Failed to load document', {
        error: error.message
      });
      throw new Error(`Document loading failed: ${error.message}`);
    }
  }

  /**
   * Save current document to JSON string
   *
   * @returns {string} Document JSON
   */
  save() {
    try {
      if (!this.theDocument) {
        throw new Error('No document to save');
      }

      logger.info(LOG_CATEGORIES.EDITOR, 'Saving document');

      // Update modified time
      this.theDocument.modified_at = new Date().toISOString();

      // Remove runtime state before saving
      const { state, ...documentToSave } = this.theDocument;

      const json = JSON.stringify(documentToSave, null, 2);

      this.isDirty = false;

      this.notifyChange('document-saved', this.theDocument);

      logger.info(LOG_CATEGORIES.EDITOR, 'Document saved successfully');

      return json;
    } catch (error) {
      logger.error(LOG_CATEGORIES.EDITOR, 'Failed to save document', {
        error: error.message
      });
      throw new Error(`Document save failed: ${error.message}`);
    }
  }

  /**
   * Validate document structure
   *
   * @private
   * @param {Object} document - Document to validate
   * @throws {Error} If document is invalid
   */
  validateDocument(document) {
    if (!document || typeof document !== 'object') {
      throw new Error('Document must be an object');
    }

    if (!document.lines || !Array.isArray(document.lines)) {
      throw new Error('Document must have lines array');
    }

    // Add more validation as needed
  }

  /**
   * Get current document
   *
   * @returns {Object|null} Current document
   */
  getDocument() {
    return this.theDocument;
  }

  /**
   * Update document metadata
   *
   * @param {Object} metadata - Metadata to update
   */
  updateMetadata(metadata) {
    if (!this.theDocument) {
      logger.warn(LOG_CATEGORIES.EDITOR, 'Cannot update metadata: no document');
      return;
    }

    Object.assign(this.theDocument, metadata);
    this.markDirty();

    logger.debug(LOG_CATEGORIES.EDITOR, 'Document metadata updated', metadata);
  }

  /**
   * Set document title
   *
   * @param {string} title - New title
   */
  setTitle(title) {
    if (!this.theDocument) {
      return;
    }

    try {
      // Preserve the state field before WASM call (it's skipped during serialization)
      const preservedState = this.theDocument.state;

      const updatedDoc = this.wasmModule.setTitle(this.theDocument, title);

      // Restore the state field after WASM call
      updatedDoc.state = preservedState;

      this.theDocument = updatedDoc;
      this.markDirty();

      logger.info(LOG_CATEGORIES.EDITOR, `Document title set to: ${title}`);
    } catch (error) {
      logger.error(LOG_CATEGORIES.EDITOR, 'Failed to set title', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Set document composer
   *
   * @param {string} composer - New composer name
   */
  setComposer(composer) {
    if (!this.theDocument) {
      return;
    }

    try {
      // Preserve the state field before WASM call (it's skipped during serialization)
      const preservedState = this.theDocument.state;

      const updatedDoc = this.wasmModule.setComposer(this.theDocument, composer);

      // Restore the state field after WASM call
      updatedDoc.state = preservedState;

      this.theDocument = updatedDoc;
      this.markDirty();

      logger.info(LOG_CATEGORIES.EDITOR, `Document composer set to: ${composer}`);
    } catch (error) {
      logger.error(LOG_CATEGORIES.EDITOR, 'Failed to set composer', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Set line label
   *
   * @param {number} lineIndex - Line index
   * @param {string} label - New label
   */
  setLineLabel(lineIndex, label) {
    if (!this.theDocument) {
      return;
    }

    try {
      // Preserve the state field before WASM call (it's skipped during serialization)
      const preservedState = this.theDocument.state;

      const updatedDoc = this.wasmModule.setLineLabel(
        this.theDocument,
        lineIndex,
        label
      );

      // Restore the state field after WASM call
      updatedDoc.state = preservedState;

      this.theDocument = updatedDoc;
      this.markDirty();

      logger.info(LOG_CATEGORIES.EDITOR, `Line ${lineIndex} label set to: ${label}`);
    } catch (error) {
      logger.error(LOG_CATEGORIES.EDITOR, 'Failed to set line label', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Set line lyrics
   *
   * @param {number} lineIndex - Line index
   * @param {string} lyrics - New lyrics
   */
  setLineLyrics(lineIndex, lyrics) {
    if (!this.theDocument) {
      return;
    }

    try {
      // Preserve the state field before WASM call (it's skipped during serialization)
      const preservedState = this.theDocument.state;

      const updatedDoc = this.wasmModule.setLineLyrics(
        this.theDocument,
        lineIndex,
        lyrics
      );

      // Restore the state field after WASM call
      updatedDoc.state = preservedState;

      this.theDocument = updatedDoc;
      this.markDirty();

      logger.info(LOG_CATEGORIES.EDITOR, `Line ${lineIndex} lyrics set`);
    } catch (error) {
      logger.error(LOG_CATEGORIES.EDITOR, 'Failed to set line lyrics', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Set line tala
   *
   * @param {number} lineIndex - Line index
   * @param {string} tala - New tala notation
   */
  setLineTala(lineIndex, tala) {
    if (!this.theDocument) {
      return;
    }

    try {
      // Preserve the state field before WASM call (it's skipped during serialization)
      const preservedState = this.theDocument.state;

      const updatedDoc = this.wasmModule.setLineTala(
        this.theDocument,
        lineIndex,
        tala
      );

      // Restore the state field after WASM call
      updatedDoc.state = preservedState;

      this.theDocument = updatedDoc;
      this.markDirty();

      logger.info(LOG_CATEGORIES.EDITOR, `Line ${lineIndex} tala set to: ${tala}`);
    } catch (error) {
      logger.error(LOG_CATEGORIES.EDITOR, 'Failed to set line tala', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get document metadata
   *
   * @returns {Object} Metadata object
   */
  getMetadata() {
    if (!this.theDocument) {
      return {};
    }

    return {
      title: this.theDocument.title,
      tonic: this.theDocument.tonic,
      pitch_system: this.theDocument.pitch_system,
      tala: this.theDocument.tala,
      key_signature: this.theDocument.key_signature,
      created_at: this.theDocument.created_at,
      modified_at: this.theDocument.modified_at
    };
  }

  /**
   * Mark document as modified
   */
  markDirty() {
    this.isDirty = true;
    this.notifyChange('document-modified', this.theDocument);
  }

  /**
   * Check if document has unsaved changes
   *
   * @returns {boolean} True if document is dirty
   */
  hasUnsavedChanges() {
    return this.isDirty;
  }

  /**
   * Add change listener
   *
   * @param {Function} callback - Callback function
   */
  onChange(callback) {
    this.changeListeners.add(callback);
  }

  /**
   * Remove change listener
   *
   * @param {Function} callback - Callback function
   */
  offChange(callback) {
    this.changeListeners.delete(callback);
  }

  /**
   * Notify all change listeners
   *
   * @private
   * @param {string} type - Change type
   * @param {any} data - Change data
   */
  notifyChange(type, data) {
    this.changeListeners.forEach(callback => {
      try {
        callback(type, data);
      } catch (error) {
        logger.error(LOG_CATEGORIES.EDITOR, 'Change listener error', {
          error: error.message
        });
      }
    });
  }

  /**
   * Export document in specified format
   *
   * @param {string} format - Export format ('json', 'text', 'notation')
   * @returns {string} Exported content
   */
  export(format) {
    if (!this.theDocument) {
      throw new Error('No document to export');
    }

    switch (format) {
      case 'json':
        return this.save();

      case 'text':
      case 'notation':
        return this.exportAsText();

      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  /**
   * Export document as plain text notation
   *
   * @private
   * @returns {string} Text representation
   */
  exportAsText() {
    if (!this.theDocument || !this.theDocument.lines) {
      return '';
    }

    return this.theDocument.lines
      .map(line => {
        if (!line.cells) return '';
        return line.cells.map(cell => cell.char || '').join('');
      })
      .join('\n');
  }

  /**
   * Clear current document
   */
  clear() {
    this.theDocument = null;
    this.isDirty = false;
    this.notifyChange('document-cleared', null);

    logger.info(LOG_CATEGORIES.EDITOR, 'Document cleared');
  }
}

export default DocumentManager;
export { DocumentManager };
