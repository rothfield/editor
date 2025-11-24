/**
 * Storage Manager for Music Notation Editor
 *
 * Provides explicit save/load functionality with named documents
 * in addition to the autosave feature. Users can:
 * - Save document with a custom name
 * - Load saved documents
 * - View list of saved documents
 * - Delete saved documents
 * - Restore from autosaves
 */

import logger, { LOG_CATEGORIES } from './logger.js';

class StorageManager {
  constructor(editor) {
    this.editor = editor;

    // localStorage keys
    this.SAVED_PREFIX = 'music-editor-saved-';
    this.SAVED_INDEX_KEY = 'music-editor-saved-index';

    // Autosave interval (initialized later)
    this.autosaveInterval = null;
  }

  /**
   * Save current document with a custom name
   *
   * @param {string} name - Document name
   * @returns {Promise<boolean>} True if saved successfully
   */
  async saveDocument(name) {
    try {
      if (!name || name.trim().length === 0) {
        throw new Error('Document name cannot be empty');
      }

      if (!this.editor.getDocument()) {
        throw new Error('No document to save');
      }

      // Sanitize name for localStorage key
      const sanitizedName = name
        .replace(/[^a-zA-Z0-9-_ ]/g, '')
        .replace(/\s+/g, '-')
        .substring(0, 100);

      const saveKey = `${this.SAVED_PREFIX}${sanitizedName}`;
      const timestamp = new Date().toISOString();

      // Serialize document
      const documentJson = JSON.stringify(this.editor.getDocument());

      // Save to localStorage
      localStorage.setItem(saveKey, documentJson);

      // Update index
      this.updateSavedIndex(sanitizedName, saveKey, timestamp);

      logger.info(LOG_CATEGORIES.STORAGE, `Document saved: "${name}"`);
      return true;

    } catch (error) {
      logger.error(LOG_CATEGORIES.STORAGE, 'Failed to save document', { error });
    }
  }

  /**
   * Load a saved document by name
   *
   * @param {string} sanitizedName - Sanitized document name (key)
   * @returns {Promise<boolean>} True if loaded successfully
   */
  async loadDocument(sanitizedName) {
    try {
      const saveKey = `${this.SAVED_PREFIX}${sanitizedName}`;
      const documentJson = localStorage.getItem(saveKey);

      if (!documentJson) {
        throw new Error(`Document not found: "${sanitizedName}"`);
      }

      const document = JSON.parse(documentJson);
      await this.editor.loadDocument(document);

      logger.info(LOG_CATEGORIES.STORAGE, `Document loaded: "${sanitizedName}"`);
      return true;

    } catch (error) {
      logger.error(LOG_CATEGORIES.STORAGE, 'Failed to load document', { error });
    }
  }

  /**
   * Delete a saved document
   *
   * @param {string} sanitizedName - Sanitized document name (key)
   * @returns {boolean} True if deleted successfully
   */
  deleteDocument(sanitizedName) {
    try {
      const saveKey = `${this.SAVED_PREFIX}${sanitizedName}`;
      localStorage.removeItem(saveKey);

      // Update index
      this.removeSavedIndex(sanitizedName);

      logger.info(LOG_CATEGORIES.STORAGE, `Document deleted: "${sanitizedName}"`);
      return true;

    } catch (error) {
      logger.error(LOG_CATEGORIES.STORAGE, 'Failed to delete document', { error });
    }
  }

  /**
   * Get list of all saved documents
   *
   * @returns {Array} Array of saved document entries
   */
  getSavedDocuments() {
    try {
      const indexJson = localStorage.getItem(this.SAVED_INDEX_KEY) || '[]';
      const index = JSON.parse(indexJson);

      // Sort by save time (newest first)
      index.sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));

      return index;

    } catch (error) {
      logger.error(LOG_CATEGORIES.STORAGE, 'Failed to get saved documents', { error });
    }
  }

  /**
   * Update the saved index with new save entry
   *
   * @private
   */
  updateSavedIndex(displayName, saveKey, timestamp) {
    try {
      const index = JSON.parse(localStorage.getItem(this.SAVED_INDEX_KEY) || '[]');

      // Check if already exists and remove it
      const existingIndex = index.findIndex(entry => entry.key === saveKey);
      if (existingIndex !== -1) {
        index.splice(existingIndex, 1);
      }

      // Add entry (newest on top)
      index.unshift({
        name: displayName,
        key: saveKey,
        savedAt: new Date().toISOString(),
        title: this.editor.getDocument()?.title || 'Untitled'
      });

      localStorage.setItem(this.SAVED_INDEX_KEY, JSON.stringify(index));

    } catch (error) {
      logger.error(LOG_CATEGORIES.STORAGE, 'Failed to update saved index', { error });
    }
  }

  /**
   * Remove entry from saved index
   *
   * @private
   */
  removeSavedIndex(sanitizedName) {
    try {
      const index = JSON.parse(localStorage.getItem(this.SAVED_INDEX_KEY) || '[]');
      const filtered = index.filter(entry => entry.name !== sanitizedName);
      localStorage.setItem(this.SAVED_INDEX_KEY, JSON.stringify(filtered));

    } catch (error) {
      logger.error(LOG_CATEGORIES.STORAGE, 'Failed to remove from saved index', { error });
    }
  }

  /**
   * Export document as JSON file (downloads to computer)
   *
   * @param {string} filename - Filename for download
   * @returns {Promise<void>}
   */
  async exportAsJSON(filename = null) {
    try {
      if (!this.editor.getDocument()) {
        throw new Error('No document to export');
      }

      const name = filename || this.editor.getDocument().title || 'music-notation';
      const jsonString = JSON.stringify(this.editor.getDocument(), null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${name}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      logger.info(LOG_CATEGORIES.STORAGE, `Document exported: "${name}.json"`);

    } catch (error) {
      logger.error(LOG_CATEGORIES.STORAGE, 'Failed to export document', { error });
    }
  }

  /**
   * Import document from JSON file (user selects file)
   *
   * @returns {Promise<boolean>} True if imported successfully
   */
  async importFromJSON() {
    try {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';

      return new Promise((resolve) => {
        input.addEventListener('change', async (e) => {
          try {
            const file = e.target.files[0];
            if (!file) {
              resolve(false);
              return;
            }

            const text = await file.text();
            const document = JSON.parse(text);

            await this.editor.loadDocument(document);

            logger.info(LOG_CATEGORIES.STORAGE, `Document imported: "${file.name}"`);
            resolve(true);

          } catch (error) {
            logger.error(LOG_CATEGORIES.STORAGE, 'Failed to import document', { error });
            this.editor.showError(`Failed to import document: ${error.message}`);
            resolve(false);
          }
        });

        input.click();
      });
    } catch (error) {
      logger.error(LOG_CATEGORIES.STORAGE, 'Failed to open import dialog', { error });
    }
  }

  /**
   * Clear all saved documents
   */
  clearAllSaved() {
    try {
      const index = this.getSavedDocuments();

      for (const entry of index) {
        localStorage.removeItem(entry.key);
      }

      localStorage.removeItem(this.SAVED_INDEX_KEY);

      logger.info(LOG_CATEGORIES.STORAGE, `Cleared ${index.length} saved documents`);

    } catch (error) {
      logger.error(LOG_CATEGORIES.STORAGE, 'Failed to clear saved documents', { error });
    }
  }

  /**
   * Get storage usage information
   *
   * @returns {Object} Storage info
   */
  getStorageInfo() {
    try {
      const saved = this.getSavedDocuments();
      let totalSize = 0;

      for (const entry of saved) {
        const data = localStorage.getItem(entry.key);
        totalSize += data ? data.length : 0;
      }

      // Approximate autosaves size
      const autosaveIndex = localStorage.getItem('music-editor-autosave-index') || '[]';
      const autosaves = JSON.parse(autosaveIndex);
      for (const entry of autosaves) {
        const data = localStorage.getItem(entry.key);
        totalSize += data ? data.length : 0;
      }

      return {
        savedCount: saved.length,
        autosaveCount: autosaves.length,
        totalSize,
        totalSizeKB: (totalSize / 1024).toFixed(2),
        storageLimit: '5MB (approximately)',
        storageQuota: 5 * 1024 * 1024
      };

    } catch (error) {
      logger.error(LOG_CATEGORIES.STORAGE, 'Failed to get storage info', { error });
      return null;
    }
  }

  /**
   * Automatically save document to autosave slot
   * Called periodically (every 10 seconds)
   *
   * @returns {Promise<boolean>} True if autosaved successfully
   */
  async autoSave() {
    try {
      if (!this.editor.getDocument()) {
        return false;
      }

      const documentJson = JSON.stringify(this.editor.getDocument());
      const autosaveKey = 'music-editor-autosave-current';

      // Save to autosave slot
      localStorage.setItem(autosaveKey, documentJson);

      // Update autosave index
      this.updateAutosaveIndex();

      logger.info(LOG_CATEGORIES.STORAGE, 'Autosaved', { timestamp: new Date().toLocaleTimeString() });
      return true;

    } catch (error) {
      logger.error(LOG_CATEGORIES.STORAGE, 'Failed to autosave', { error });
    }
  }

  /**
   * Restore document from autosave
   *
   * @returns {Promise<boolean>} True if restored successfully
   */
  async restoreFromAutosave() {
    try {
      const autosaveKey = 'music-editor-autosave-current';
      const documentJson = localStorage.getItem(autosaveKey);

      if (!documentJson) {
        return false;
      }

      const document = JSON.parse(documentJson);
      await this.editor.loadDocument(document);

      logger.info(LOG_CATEGORIES.STORAGE, 'Document restored from autosave');
      return true;

    } catch (error) {
      logger.error(LOG_CATEGORIES.STORAGE, 'Failed to restore from autosave', { error });
    }
  }

  /**
   * Check if autosave exists and is available
   *
   * @returns {Object|null} Autosave metadata if available
   */
  getAutosaveInfo() {
    try {
      const autosaveKey = 'music-editor-autosave-current';
      const documentJson = localStorage.getItem(autosaveKey);

      if (!documentJson) {
        return null;
      }

      const document = JSON.parse(documentJson);
      const timestamp = localStorage.getItem('music-editor-autosave-timestamp');

      return {
        available: true,
        title: document.title || 'Untitled',
        timestamp: timestamp || 'Unknown time',
        size: documentJson.length,
        sizeKB: (documentJson.length / 1024).toFixed(2)
      };

    } catch (error) {
      logger.error(LOG_CATEGORIES.STORAGE, 'Failed to get autosave info', { error });
      return null;
    }
  }

  /**
   * Clear autosave data
   */
  clearAutosave() {
    try {
      localStorage.removeItem('music-editor-autosave-current');
      localStorage.removeItem('music-editor-autosave-timestamp');
      logger.info(LOG_CATEGORIES.STORAGE, 'Autosave cleared');
    } catch (error) {
      logger.error(LOG_CATEGORIES.STORAGE, 'Failed to clear autosave', { error });
    }
  }

  /**
   * Update autosave timestamp
   * @private
   */
  updateAutosaveIndex() {
    try {
      const timestamp = new Date().toISOString();
      localStorage.setItem('music-editor-autosave-timestamp', timestamp);
    } catch (error) {
      logger.error(LOG_CATEGORIES.STORAGE, 'Failed to update autosave timestamp', { error });
    }
  }

  /**
   * Start autosave interval (saves every 10 seconds)
   *
   * @returns {number} Interval ID (can be used to stop autosave)
   */
  startAutosave() {
    // Clear any existing autosave interval
    if (this.autosaveInterval) {
      clearInterval(this.autosaveInterval);
    }

    // Set up new autosave interval (every 10 seconds)
    this.autosaveInterval = setInterval(() => {
      this.autoSave();
    }, 10000);

    logger.info(LOG_CATEGORIES.STORAGE, 'Autosave started (every 10 seconds)');
    return this.autosaveInterval;
  }

  /**
   * Stop autosave interval
   */
  stopAutosave() {
    if (this.autosaveInterval) {
      clearInterval(this.autosaveInterval);
      this.autosaveInterval = null;
      logger.info(LOG_CATEGORIES.STORAGE, 'Autosave stopped');
    }
  }
}

export default StorageManager;
