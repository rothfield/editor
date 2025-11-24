/**
 * AutoSave Manager for Music Notation Editor
 *
 * Automatically saves documents to localStorage every 5 seconds
 * and restores on page reload. Uses title + timestamp for versioning.
 */

import { ENABLE_AUTOSAVE } from './constants.js';

class AutoSave {
  constructor(editor) {
    this.editor = editor;
    this.saveInterval = null;
    this.saveIntervalMs = 10000; // 10 seconds
    this.isEnabled = ENABLE_AUTOSAVE; // Respect global flag
    this.lastSaveTime = null;
    this.lastSaveKey = null;

    // localStorage keys
    this.AUTOSAVE_LAST_KEY = 'music-editor-autosave-last';
    this.AUTOSAVE_PREFIX = 'music-editor-autosave-';
    this.AUTOSAVE_INDEX_KEY = 'music-editor-autosave-index';

    // Bind methods
    this.performAutoSave = this.performAutoSave.bind(this);
  }

  /**
   * Start the auto-save timer
   */
  start() {
    if (!this.isEnabled) {
      logger.info(LOG_CATEGORIES.AUTOSAVE, 'AutoSave is disabled (ENABLE_AUTOSAVE flag is false)');
      return;
    }

    if (this.saveInterval) {
      logger.warn(LOG_CATEGORIES.AUTOSAVE, 'AutoSave already running');
      return;
    }

    logger.info(LOG_CATEGORIES.AUTOSAVE, `AutoSave started (interval: ${this.saveIntervalMs}ms)`);
    this.saveInterval = setInterval(this.performAutoSave, this.saveIntervalMs);
  }

  /**
   * Stop the auto-save timer
   */
  stop() {
    if (this.saveInterval) {
      clearInterval(this.saveInterval);
      this.saveInterval = null;
      logger.info(LOG_CATEGORIES.AUTOSAVE, 'AutoSave stopped');
    }
  }

  /**
   * Enable auto-save
   */
  enable() {
    this.isEnabled = true;
    logger.info(LOG_CATEGORIES.AUTOSAVE, 'AutoSave enabled');

  /**
   * Disable auto-save
   */
  disable() {
    this.isEnabled = false;
    logger.info(LOG_CATEGORIES.AUTOSAVE, 'AutoSave disabled');

  /**
   * Perform an auto-save operation
   * Saves the current document to localStorage with title + timestamp
   */
  async performAutoSave() {
    if (!this.isEnabled) {
      return;
    }

    try {
      const document = this.editor.getDocument();
      if (!document) {
        logger.warn(LOG_CATEGORIES.AUTOSAVE, 'AutoSave: No document to save');
        return;
      }

      // Get document title (or default to "Untitled")
      const title = document.title || 'Untitled';

      // Create timestamp
      const timestamp = new Date().toISOString();

      // Generate save key: prefix + title + timestamp
      const saveKey = this.generateSaveKey(title, timestamp);

      // Serialize document
      const documentJson = JSON.stringify(document);

      // Save to localStorage
      localStorage.setItem(saveKey, documentJson);

      // Update "last" pointer
      localStorage.setItem(this.AUTOSAVE_LAST_KEY, saveKey);

      // Update autosave index (for cleanup)
      this.updateAutosaveIndex(saveKey, title, timestamp);

      // Track save time
      this.lastSaveTime = new Date();
      this.lastSaveKey = saveKey;

      // Cleanup old autosaves (keep last 10)
      this.cleanupOldAutosaves();

    } catch (error) {
      logger.error(LOG_CATEGORIES.AUTOSAVE, 'AutoSave failed', { error });
  }

  /**
   * Restore the last auto-saved document
   * Called on page load
   *
   * @returns {boolean} True if restored, false otherwise
   */
  async restoreLastAutosave() {
    if (!this.isEnabled) {
      logger.info(LOG_CATEGORIES.AUTOSAVE, 'AutoSave restore is disabled (ENABLE_AUTOSAVE flag is false)');
      return false;
    }

    try {
      // Check for last autosave key
      const lastSaveKey = localStorage.getItem(this.AUTOSAVE_LAST_KEY);

      if (!lastSaveKey) {
        logger.info(LOG_CATEGORIES.AUTOSAVE, 'AutoSave: No autosave found to restore');
        return false;
      }

      // Load the document
      const documentJson = localStorage.getItem(lastSaveKey);

      if (!documentJson) {
        logger.warn(LOG_CATEGORIES.AUTOSAVE, `AutoSave: Last save key "${lastSaveKey}" points to missing data`);
        return false;
      }

      // Parse and load into editor
      const document = JSON.parse(documentJson);

      logger.info(LOG_CATEGORIES.AUTOSAVE, `AutoSave: Restoring from "${lastSaveKey}"`, {
        title: document.title,
        modified_at: document.modified_at,
        lines: document.lines?.length || 0
      });

      await this.editor.loadDocument(document);

      logger.info(LOG_CATEGORIES.AUTOSAVE, 'AutoSave: Document restored successfully');
      return true;

    } catch (error) {
      logger.error(LOG_CATEGORIES.AUTOSAVE, 'AutoSave restore failed', { error });
  }

  /**
   * Generate a save key from title and timestamp
   *
   * @param {string} title - Document title
   * @param {string} timestamp - ISO timestamp
   * @returns {string} Save key
   */
  generateSaveKey(title, timestamp) {
    // Sanitize title for use in localStorage key
    const sanitizedTitle = title
      .replace(/[^a-zA-Z0-9-_ ]/g, '') // Remove special chars
      .replace(/\s+/g, '-')            // Replace spaces with hyphens
      .substring(0, 50);               // Limit length

    return `${this.AUTOSAVE_PREFIX}${sanitizedTitle}-${timestamp}`;
  }

  /**
   * Update the autosave index with new save entry
   * Index tracks all autosaves for cleanup
   *
   * @param {string} saveKey - The save key
   * @param {string} title - Document title
   * @param {string} timestamp - ISO timestamp
   */
  updateAutosaveIndex(saveKey, title, timestamp) {
    try {
      // Load existing index
      const indexJson = localStorage.getItem(this.AUTOSAVE_INDEX_KEY) || '[]';
      const index = JSON.parse(indexJson);

      // Add new entry
      index.push({
        key: saveKey,
        title: title,
        timestamp: timestamp,
        savedAt: new Date().toISOString()
      });

      // Save updated index
      localStorage.setItem(this.AUTOSAVE_INDEX_KEY, JSON.stringify(index));

    } catch (error) {
      logger.error(LOG_CATEGORIES.AUTOSAVE, 'Failed to update autosave index', { error });
  }

  /**
   * Cleanup old autosaves, keeping only the most recent N saves
   *
   * @param {number} keepCount - Number of autosaves to keep (default: 10)
   */
  cleanupOldAutosaves(keepCount = 10) {
    try {
      // Load index
      const indexJson = localStorage.getItem(this.AUTOSAVE_INDEX_KEY) || '[]';
      const index = JSON.parse(indexJson);

      if (index.length <= keepCount) {
        return; // Nothing to cleanup
      }

      // Sort by timestamp (newest first)
      index.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      // Remove old entries
      const toRemove = index.slice(keepCount);
      const toKeep = index.slice(0, keepCount);

      // Delete from localStorage
      for (const entry of toRemove) {
        localStorage.removeItem(entry.key);
      }

      // Update index
      localStorage.setItem(this.AUTOSAVE_INDEX_KEY, JSON.stringify(toKeep));

    } catch (error) {
      logger.error(LOG_CATEGORIES.AUTOSAVE, 'AutoSave cleanup failed', { error });
  }

  /**
   * Get all autosave entries from index
   *
   * @returns {Array} Array of autosave entries
   */
  getAutosaveHistory() {
    try {
      const indexJson = localStorage.getItem(this.AUTOSAVE_INDEX_KEY) || '[]';
      const index = JSON.parse(indexJson);

      // Sort by timestamp (newest first)
      index.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      return index;
    } catch (error) {
      logger.error(LOG_CATEGORIES.AUTOSAVE, 'Failed to get autosave history', { error });
      return [];
    }
  }

  /**
   * Clear all autosaves
   */
  clearAllAutosaves() {
    try {
      // Get all autosave keys
      const index = this.getAutosaveHistory();

      // Remove each autosave
      for (const entry of index) {
        localStorage.removeItem(entry.key);
      }

      // Clear index and last pointer
      localStorage.removeItem(this.AUTOSAVE_INDEX_KEY);
      localStorage.removeItem(this.AUTOSAVE_LAST_KEY);

      logger.info(LOG_CATEGORIES.AUTOSAVE, `AutoSave: Cleared ${index.length} autosaves`);

    } catch (error) {
      logger.error(LOG_CATEGORIES.AUTOSAVE, 'Failed to clear autosaves', { error });
  }

  /**
   * Get status information about autosave
   *
   * @returns {Object} Status object
   */
  getStatus() {
    return {
      enabled: this.isEnabled,
      running: this.saveInterval !== null,
      lastSaveTime: this.lastSaveTime,
      lastSaveKey: this.lastSaveKey,
      intervalMs: this.saveIntervalMs,
      historyCount: this.getAutosaveHistory().length
    };
  }
}

export default AutoSave;
