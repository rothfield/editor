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

interface SavedDocumentEntry {
  name: string;
  key: string;
  savedAt: string;
  title: string;
}

interface StorageInfo {
  savedCount: number;
  autosaveCount: number;
  totalSize: number;
  totalSizeKB: string;
  storageLimit: string;
  storageQuota: number;
}

interface AutosaveInfo {
  available: boolean;
  title: string;
  timestamp: string;
  size: number;
  sizeKB: string;
}

interface Editor {
  getDocument: () => { title?: string } | null;
  loadDocument: (doc: any) => Promise<void>;
  showError: (message: string) => void;
}

class StorageManager {
  private editor: Editor;
  private SAVED_PREFIX: string = 'music-editor-saved-';
  private SAVED_INDEX_KEY: string = 'music-editor-saved-index';
  private autosaveInterval: number | null = null;

  constructor(editor: Editor) {
    this.editor = editor;
  }

  /**
   * Save current document with a custom name
   */
  async saveDocument(name: string): Promise<boolean | undefined> {
    try {
      if (!name || name.trim().length === 0) {
        throw new Error('Document name cannot be empty');
      }

      if (!this.editor.getDocument()) {
        throw new Error('No document to save');
      }

      const sanitizedName = name
        .replace(/[^a-zA-Z0-9-_ ]/g, '')
        .replace(/\s+/g, '-')
        .substring(0, 100);

      const saveKey = `${this.SAVED_PREFIX}${sanitizedName}`;
      const timestamp = new Date().toISOString();

      const documentJson = JSON.stringify(this.editor.getDocument());

      localStorage.setItem(saveKey, documentJson);

      this.updateSavedIndex(sanitizedName, saveKey, timestamp);

      logger.info(LOG_CATEGORIES.STORAGE, `Document saved: "${name}"`);
      return true;

    } catch (error) {
      logger.error(LOG_CATEGORIES.STORAGE, 'Failed to save document', { error });
      return undefined;
    }
  }

  /**
   * Load a saved document by name
   */
  async loadDocument(sanitizedName: string): Promise<boolean | undefined> {
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
      return undefined;
    }
  }

  /**
   * Delete a saved document
   */
  deleteDocument(sanitizedName: string): boolean | undefined {
    try {
      const saveKey = `${this.SAVED_PREFIX}${sanitizedName}`;
      localStorage.removeItem(saveKey);

      this.removeSavedIndex(sanitizedName);

      logger.info(LOG_CATEGORIES.STORAGE, `Document deleted: "${sanitizedName}"`);
      return true;

    } catch (error) {
      logger.error(LOG_CATEGORIES.STORAGE, 'Failed to delete document', { error });
      return undefined;
    }
  }

  /**
   * Get list of all saved documents
   */
  getSavedDocuments(): SavedDocumentEntry[] | undefined {
    try {
      const indexJson = localStorage.getItem(this.SAVED_INDEX_KEY) || '[]';
      const index: SavedDocumentEntry[] = JSON.parse(indexJson);

      index.sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());

      return index;

    } catch (error) {
      logger.error(LOG_CATEGORIES.STORAGE, 'Failed to get saved documents', { error });
      return undefined;
    }
  }

  /**
   * Update the saved index with new save entry
   */
  private updateSavedIndex(displayName: string, saveKey: string, timestamp: string): void {
    try {
      const index: SavedDocumentEntry[] = JSON.parse(localStorage.getItem(this.SAVED_INDEX_KEY) || '[]');

      const existingIndex = index.findIndex(entry => entry.key === saveKey);
      if (existingIndex !== -1) {
        index.splice(existingIndex, 1);
      }

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
   */
  private removeSavedIndex(sanitizedName: string): void {
    try {
      const index: SavedDocumentEntry[] = JSON.parse(localStorage.getItem(this.SAVED_INDEX_KEY) || '[]');
      const filtered = index.filter(entry => entry.name !== sanitizedName);
      localStorage.setItem(this.SAVED_INDEX_KEY, JSON.stringify(filtered));

    } catch (error) {
      logger.error(LOG_CATEGORIES.STORAGE, 'Failed to remove from saved index', { error });
    }
  }

  /**
   * Export document as JSON file
   */
  async exportAsJSON(filename: string | null = null): Promise<void> {
    try {
      if (!this.editor.getDocument()) {
        throw new Error('No document to export');
      }

      const name = filename || this.editor.getDocument()?.title || 'music-notation';
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
   * Import document from JSON file
   */
  async importFromJSON(): Promise<boolean | undefined> {
    try {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';

      return new Promise((resolve) => {
        input.addEventListener('change', async (e) => {
          try {
            const target = e.target as HTMLInputElement;
            const file = target.files?.[0];
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
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error(LOG_CATEGORIES.STORAGE, 'Failed to import document', { error });
            this.editor.showError(`Failed to import document: ${errorMessage}`);
            resolve(false);
          }
        });

        input.click();
      });
    } catch (error) {
      logger.error(LOG_CATEGORIES.STORAGE, 'Failed to open import dialog', { error });
      return undefined;
    }
  }

  /**
   * Clear all saved documents
   */
  clearAllSaved(): void {
    try {
      const index = this.getSavedDocuments() || [];

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
   */
  getStorageInfo(): StorageInfo | null {
    try {
      const saved = this.getSavedDocuments() || [];
      let totalSize = 0;

      for (const entry of saved) {
        const data = localStorage.getItem(entry.key);
        totalSize += data ? data.length : 0;
      }

      const autosaveIndex = localStorage.getItem('music-editor-autosave-index') || '[]';
      const autosaves: { key: string }[] = JSON.parse(autosaveIndex);
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
   */
  async autoSave(): Promise<boolean | undefined> {
    try {
      if (!this.editor.getDocument()) {
        return false;
      }

      const documentJson = JSON.stringify(this.editor.getDocument());
      const autosaveKey = 'music-editor-autosave-current';

      localStorage.setItem(autosaveKey, documentJson);

      this.updateAutosaveIndex();

      logger.info(LOG_CATEGORIES.STORAGE, 'Autosaved', { timestamp: new Date().toLocaleTimeString() });
      return true;

    } catch (error) {
      logger.error(LOG_CATEGORIES.STORAGE, 'Failed to autosave', { error });
      return undefined;
    }
  }

  /**
   * Restore document from autosave
   */
  async restoreFromAutosave(): Promise<boolean | undefined> {
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
      return undefined;
    }
  }

  /**
   * Check if autosave exists and is available
   */
  getAutosaveInfo(): AutosaveInfo | null {
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
  clearAutosave(): void {
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
   */
  private updateAutosaveIndex(): void {
    try {
      const timestamp = new Date().toISOString();
      localStorage.setItem('music-editor-autosave-timestamp', timestamp);
    } catch (error) {
      logger.error(LOG_CATEGORIES.STORAGE, 'Failed to update autosave timestamp', { error });
    }
  }

  /**
   * Start autosave interval
   */
  startAutosave(): number {
    if (this.autosaveInterval) {
      clearInterval(this.autosaveInterval);
    }

    this.autosaveInterval = window.setInterval(() => {
      this.autoSave();
    }, 10000);

    logger.info(LOG_CATEGORIES.STORAGE, 'Autosave started (every 10 seconds)');
    return this.autosaveInterval;
  }

  /**
   * Stop autosave interval
   */
  stopAutosave(): void {
    if (this.autosaveInterval) {
      clearInterval(this.autosaveInterval);
      this.autosaveInterval = null;
      logger.info(LOG_CATEGORIES.STORAGE, 'Autosave stopped');
    }
  }
}

export default StorageManager;
