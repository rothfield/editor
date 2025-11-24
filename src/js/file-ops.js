/**
 * File Operations for Music Notation Editor
 *
 * Handles file menu operations including New, Open, Save, Save As,
 * and Export functionality with proper error handling and user feedback.
 */

import logger, { LOG_CATEGORIES } from './logger.js';

class FileOperations {
  constructor(editor) {
    this.editor = editor;
    this.isInitialized = false;

    // File handling state
    this.currentFile = null;
    this.hasUnsavedChanges = false;

    // Default file settings
    this.defaultSettings = {
      title: 'Untitled Composition',
      tonic: 'C',
      pitchSystem: 'number',
      tala: 'teental'
    };

    // File filters for dialogs
    this.fileFilters = {
      json: {
        name: 'Music Notation Files',
        extensions: ['json']
      },
      txt: {
        name: 'Text Files',
        extensions: ['txt']
      },
      all: {
        name: 'All Files',
        extensions: ['*']
      }
    };

    // Bind methods to maintain context
    this.handleBeforeUnload = this.handleBeforeUnload.bind(this);
    this.handleFileChange = this.handleFileChange.bind(this);
  }

  /**
     * Initialize file operations system
     */
  initialize() {
    this.setupEventListeners();
    this.setupFileWatchers();
    this.isInitialized = true;

    logger.info(LOG_CATEGORIES.APP, 'File operations initialized');
  }

  /**
     * Setup event listeners for file operations
     */
  setupEventListeners() {
    // Setup beforeunload handler for unsaved changes
    window.addEventListener('beforeunload', this.handleBeforeUnload);

    // Setup file input listeners if needed
    const fileInput = document.getElementById('file-input');
    if (fileInput) {
      fileInput.addEventListener('change', this.handleFileChange);
    }
  }

  /**
     * Setup file watchers for external changes
     */
  setupFileWatchers() {
    // In a real implementation, this would watch for external file changes
    // For POC, we'll just track internal state changes
    this.addEventListener('document-changed', () => {
      this.hasUnsavedChanges = true;
      this.updateWindowModified();
    });
  }

  /**
     * Handle File -> New operation
     */
  async newFile() {
    logger.info(LOG_CATEGORIES.FILE, 'File -> New called');
    try {
      // Check for unsaved changes
      if (this.hasUnsavedChanges) {
        logger.warn(LOG_CATEGORIES.FILE, 'Unsaved changes detected, prompting user');
        const shouldSave = await this.promptUnsavedChanges();
        if (shouldSave === 'cancel') {
          logger.info(LOG_CATEGORIES.FILE, 'User cancelled due to unsaved changes');
          return;
        }
        if (shouldSave === 'save') {
          await this.saveFile();
        }
      }

      // Prompt for pitch system
      logger.info(LOG_CATEGORIES.FILE, 'Prompting for pitch system');
      const pitchSystem = await this.promptPitchSystem();
      logger.info(LOG_CATEGORIES.FILE, 'User selected pitch system', { pitchSystem });

      if (!pitchSystem) {
        logger.info(LOG_CATEGORIES.FILE, 'User cancelled pitch system selection');
        return; // User cancelled
      }

      // Create new document with selected pitch system
      logger.info(LOG_CATEGORIES.FILE, 'Creating new document with pitch system', { pitchSystem });
      await this.createNewDocument(pitchSystem);

      // Reset file state
      this.currentFile = null;
      this.hasUnsavedChanges = false;
      this.updateWindowModified();

      // Set cursor to start of first line (position 0, stave 0)
      if (this.editor && this.editor.setCursorPosition) {
        logger.debug(LOG_CATEGORIES.FILE, 'Setting cursor to start of first line');
        this.editor.setCursorPosition(0, 0); // column 0, stave 0
      }

      // Show success message
      this.showSuccessMessage('New composition created');

      // Focus editor - wait for dialog close animation to complete
      setTimeout(() => {
        this.requestFocus();
        // Also directly focus the notation editor if available
        const notationEditor = document.getElementById('notation-editor');
        if (notationEditor) {
          notationEditor.focus();
        }
        logger.debug(LOG_CATEGORIES.FILE, 'Editor focused');
      }, 200); // Wait for dialog close animation (150ms) + buffer

      logger.info(LOG_CATEGORIES.FILE, 'New file created successfully');
    } catch (error) {
      logger.error(LOG_CATEGORIES.FILE, 'Error creating new file', { error });
  }

  /**
     * Handle File -> Open operation
     */
  async openFile() {
    try {
      // Check for unsaved changes first
      if (this.hasUnsavedChanges) {
        const shouldSave = await this.promptUnsavedChanges();
        if (shouldSave === 'cancel') {
          return;
        }
        if (shouldSave === 'save') {
          await this.saveFile();
        }
      }

      // Create file input
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = '.json,.txt,.musicxml,.xml';
      fileInput.style.display = 'none';

      fileInput.addEventListener('change', async (event) => {
        const file = event.target.files[0];
        if (file) {
          await this.loadFile(file);
        }
        document.body.removeChild(fileInput);
      });

      document.body.appendChild(fileInput);
      fileInput.click();
    } catch (error) {
      this.showErrorMessage('Failed to open file', error);
    }
  }

  /**
     * Handle File -> Save operation
     */
  async saveFile() {
    try {
      if (this.currentFile) {
        await this.saveToFile(this.currentFile);
      } else {
        await this.saveFileAs();
      }
    } catch (error) {
      this.showErrorMessage('Failed to save file', error);
    }
  }

  /**
     * Handle File -> Save As operation
     */
  async saveFileAs() {
    try {
      // Get filename from user
      const filename = await this.promptSaveAs();
      if (!filename) {
        return; // User cancelled
      }

      // Save the file
      await this.saveToFile(filename);
    } catch (error) {
      this.showErrorMessage('Failed to save file as', error);
    }
  }

  /**
     * Handle File -> Export operation
     */
  async exportFile() {
    try {
      // Show export format dialog
      const format = await this.promptExportFormat();
      if (!format) {
        return; // User cancelled
      }

      // Export in selected format
      await this.exportInFormat(format);
    } catch (error) {
      this.showErrorMessage('Failed to export file', error);
    }
  }

  /**
     * Create a new document with default settings
     * @param {string} pitchSystem - The pitch system to use (optional, defaults to 'number')
     */
  async createNewDocument(pitchSystem = null) {
    if (!this.editor) {
      throw new Error('Editor not available');
    }

    logger.info(LOG_CATEGORIES.FILE, 'Creating new document with pitch system', { pitchSystem });

    // Convert pitch system name to number FIRST
    const pitchSystemMap = {
      'number': 1,
      'western': 2,
      'sargam': 3,
      'bhatkhande': 4,
      'tabla': 5
    };
    const pitchSystemValue = pitchSystemMap[pitchSystem] || 1;

    logger.debug(LOG_CATEGORIES.FILE, 'Pitch system value', { pitchSystemValue, pitchSystem });

    // Create document using WASM (same as editor.createNewDocument but without rendering)
    if (!this.editor.isInitialized || !this.editor.wasmModule) {
      logger.error(LOG_CATEGORIES.WASM, 'Cannot create document: WASM not initialized');
      return;
    }

    // Create document using WASM
    const document = this.editor.wasmModule.createNewDocument();

    // Set timestamps (WASM can't access system time)
    const now = new Date().toISOString();
    document.created_at = now;
    document.modified_at = now;

    // SET PITCH SYSTEM BEFORE adding to editor (this is the key fix!)
    document.pitch_system = pitchSystemValue;

    logger.info(LOG_CATEGORIES.FILE, 'Set pitch_system on new document', { pitchSystemValue });

    // NOTE: Document lines are managed by WASM only - JavaScript must NEVER create or mutate lines!
    // The Rust WASM creates the initial document with lines already set up

    // Add runtime state (not persisted by WASM)
    document.state = {
      cursor: { line: 0, col: 0 },
      selection: null,
      has_focus: false
    };

    // Load document (this will render with correct pitch system)
    await this.editor.loadDocument(document);

    logger.debug(LOG_CATEGORIES.FILE, 'After loadDocument, pitch_system is', { pitchSystem: this.editor.getDocument()?.pitch_system });

  /**
     * Load a file into the editor
     */
  async loadFile(file) {
    const text = await this.readFileText(file);

    // Detect file type by extension
    const fileExtension = file.name.split('.').pop().toLowerCase();

    try {
      if (fileExtension === 'musicxml' || fileExtension === 'xml') {
        // MusicXML file - check if it looks like MusicXML
        if (text.includes('<score-partwise') || text.includes('<score-timewise')) {
          logger.info(LOG_CATEGORIES.FILE, 'Detected MusicXML file, importing');
          await this.loadFromMusicXML(text, file.name);
        } else {
          throw new Error('File does not appear to be valid MusicXML');
        }
      } else {
        // Try to parse as JSON first
        const data = JSON.parse(text);
        await this.loadFromJSON(data);
      }
    } catch (error) {
      if (fileExtension === 'musicxml' || fileExtension === 'xml') {
        // Re-throw MusicXML errors
        throw error;
      }
      // Fallback to plain text for other file types
      logger.warn(LOG_CATEGORIES.FILE, 'JSON parse failed, loading as plain text', { error });
      await this.loadFromText(text);
    }

    this.currentFile = file.name;
    this.hasUnsavedChanges = false;
    this.updateWindowModified();

    this.showSuccessMessage(`Loaded: ${file.name}`);
    this.requestFocus();
  }

  /**
     * Load document from MusicXML data
     */
  async loadFromMusicXML(musicxmlString, filename) {
    if (!this.editor || !this.editor.wasmModule) {
      throw new Error('Editor or WASM module not available');
    }

    logger.info(LOG_CATEGORIES.FILE, 'Loading MusicXML file', { filename });
    logger.debug(LOG_CATEGORIES.FILE, 'MusicXML size', { size: musicxmlString.length, unit: 'bytes' });

    try {
      // Call WASM importMusicXML function
      const document = this.editor.wasmModule.importMusicXML(musicxmlString);

      logger.info(LOG_CATEGORIES.FILE, 'MusicXML imported successfully');
      logger.debug(LOG_CATEGORIES.FILE, 'Imported document', { document });

      // Set metadata from filename
      if (document && !document.title) {
        const baseName = filename.replace(/\.(musicxml|xml)$/i, '');
        document.title = baseName;
      }

      // Load the imported document
      await this.editor.loadDocument(document);

      logger.info(LOG_CATEGORIES.FILE, 'MusicXML document loaded into editor');
    } catch (error) {
      logger.error(LOG_CATEGORIES.FILE, 'MusicXML import error', { error });
  }

  /**
     * Load document from JSON data
     */
  async loadFromJSON(data) {
    if (!this.editor) {
      throw new Error('Editor not available');
    }

    // Validate JSON structure
    if (!data.document && !data.content) {
      throw new Error('Invalid file format');
    }

    // Load document data
    if (data.document) {
      // Full document format
      await this.editor.loadDocument(data.document);

      // Apply metadata
      if (data.metadata) {
        await this.editor.updateDocumentMetadata(data.metadata);
      }
    } else if (data.content) {
      // Simple content format
      await this.editor.insertText(data.content);

      // Apply basic metadata
      if (data.title || data.tonic || data.pitchSystem) {
        await this.editor.updateDocumentMetadata({
          title: data.title || 'Untitled',
          tonic: data.tonic || 'C',
          pitchSystem: data.pitchSystem || 'number'
        });
      }
    }

    await this.editor.render();
  }

  /**
     * Load document from plain text
     */
  async loadFromText(text) {
    if (!this.editor) {
      throw new Error('Editor not available');
    }

    // Insert text as notation
    await this.editor.insertText(text);
    await this.editor.render();
  }

  /**
     * Save current document to file
     */
  async saveToFile(filename) {
    if (!this.editor) {
      throw new Error('Editor not available');
    }

    // Get document data
    const documentData = await this.editor.saveDocument();
    const metadata = this.editor.getDocumentMetadata();

    // Create save data
    const saveData = {
      version: '1.0',
      created: new Date().toISOString(),
      document: documentData,
      metadata
    };

    // Write file
    const json = JSON.stringify(saveData, null, 2);
    await this.writeFile(filename, json);

    this.currentFile = filename;
    this.hasUnsavedChanges = false;
    this.updateWindowModified();

    this.showSuccessMessage(`Saved: ${filename}`);
  }

  /**
     * Export document in specified format
     */
  async exportInFormat(format) {
    if (!this.editor) {
      throw new Error('Editor not available');
    }

    let content = '';
    let extension = '';
    let mimeType = '';

    switch (format) {
      case 'json':
        const documentData = await this.editor.saveDocument();
        const metadata = this.editor.getDocumentMetadata();
        const exportData = {
          version: '1.0',
          exported: new Date().toISOString(),
          document: documentData,
          metadata
        };
        content = JSON.stringify(exportData, null, 2);
        extension = 'json';
        mimeType = 'application/json';
        break;

      case 'txt':
        content = await this.editor.exportAsText();
        extension = 'txt';
        mimeType = 'text/plain';
        break;

      case 'notation':
        content = await this.editor.exportAsNotation();
        extension = 'notation';
        mimeType = 'text/plain';
        break;

      default:
        throw new Error(`Unsupported export format: ${format}`);
    }

    // Generate filename
    const metadata = this.editor.getDocumentMetadata();
    const baseName = metadata.title || 'music-composition';
    const filename = `${baseName}.${extension}`;

    // Download file
    await this.downloadFile(content, filename, mimeType);

    this.showSuccessMessage(`Exported: ${filename}`);
  }

  /**
     * Read file text content
     */
  async readFileText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (event) => {
        resolve(event.target.result);
      };

      reader.onerror = () => {
        reject(new Error('Failed to read file'));
      };

      reader.readAsText(file);
    });
  }

  /**
     * Write content to file (download)
     */
  async writeFile(filename, content) {
    await this.downloadFile(content, filename, 'application/json');
  }

  /**
     * Download content as file
     */
  async downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';

    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // Clean up
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 100);
  }

  /**
     * Prompt user about unsaved changes
     */
  async promptUnsavedChanges() {
    return new Promise((resolve) => {
      const result = confirm(
        'You have unsaved changes. Do you want to save them before continuing?'
      );

      if (result) {
        resolve('save');
      } else {
        resolve('discard');
      }
    });
  }

  /**
     * Prompt user for Save As filename
     */
  async promptSaveAs() {
    const metadata = this.editor.getDocumentMetadata();
    const defaultName = `${metadata.title || 'music-composition'}.json`;

    return new Promise((resolve) => {
      const filename = prompt(
        'Enter filename:',
        defaultName
      );

      resolve(filename);
    });
  }

  /**
     * Prompt user for export format
     */
  async promptExportFormat() {
    return new Promise((resolve) => {
      const format = prompt(
        'Export format (json/txt/notation):',
        'json'
      );

      if (format && ['json', 'txt', 'notation'].includes(format.toLowerCase())) {
        resolve(format.toLowerCase());
      } else {
        resolve(null);
      }
    });
  }

  /**
     * Prompt user for pitch system selection
     * Uses modern dialog with keyboard shortcuts
     */
  async promptPitchSystem() {
    logger.info(LOG_CATEGORIES.UI, 'promptPitchSystem() called');

    // Get user's preferred pitch system from current document or default
    let defaultPitchSystem = 'number';
    if (this.editor && this.editor.getCurrentPitchSystem) {
      const currentSystem = this.editor.getCurrentPitchSystem();
      // Map numeric pitch system to string
      const systemMap = { 1: 'number', 2: 'western', 3: 'sargam' };
      defaultPitchSystem = systemMap[currentSystem] || 'number';
    }

    logger.debug(LOG_CATEGORIES.UI, 'Default pitch system', { defaultPitchSystem });

    // Dynamically import the new document dialog
    try {
      const { showNewDocumentDialog } = await import('./NewDocumentDialog.js');
      const wasmModule = this.editor?.wasmModule || null;
      const pitchSystem = await showNewDocumentDialog(defaultPitchSystem, wasmModule);

      logger.info(LOG_CATEGORIES.UI, 'User selected pitch system', { pitchSystem });

      if (!pitchSystem) {
        logger.info(LOG_CATEGORIES.UI, 'User cancelled pitch system selection');
        return null;
      }

      logger.info(LOG_CATEGORIES.UI, 'Valid pitch system selected', { pitchSystem });
      return pitchSystem;
    } catch (error) {
      logger.error(LOG_CATEGORIES.UI, 'Error showing new document dialog', { error });
  }

  /**
   * Fallback to simple prompt if dialog fails
   */
  async promptPitchSystemFallback() {
    return new Promise((resolve) => {
      const pitchSystem = prompt(
        'Select pitch system (number/western/sargam/bhatkhande/tabla):',
        'number'
      );

      if (!pitchSystem) {
        resolve(null);
        return;
      }

      const validSystems = ['number', 'western', 'sargam', 'bhatkhande', 'tabla'];
      const normalized = pitchSystem.toLowerCase().trim();

      if (validSystems.includes(normalized)) {
        resolve(normalized);
      } else {
        alert(`Invalid pitch system: "${pitchSystem}". Using default: number`);
        resolve('number');
      }
    });
  }

  /**
     * Update window title for unsaved changes indicator
     */
  updateWindowModified() {
    const prefix = this.hasUnsavedChanges ? '* ' : '';
    const filename = this.currentFile || 'Untitled';
    document.title = `${prefix}${filename} - Music Notation Editor`;
  }

  /**
     * Show success message
     */
  showSuccessMessage(message) {
    if (this.editor && this.editor.showUserNotification) {
      this.editor.showUserNotification(message, 'success');
    } else {
      logger.log(LOG_CATEGORIES.FILE, message);
    }
  }

  /**
     * Show error message
     */
  showErrorMessage(message, error) {
    const fullMessage = `${message}: ${error.message}`;

    if (this.editor && this.editor.showUserNotification) {
      this.editor.showUserNotification(fullMessage, 'error');
    } else {
      logger.error(LOG_CATEGORIES.FILE, 'File operations error', { message: fullMessage });
    }
  }

  /**
     * Request focus back to editor
     */
  requestFocus() {
    if (this.editor && this.editor.requestFocus) {
      this.editor.requestFocus();
    }
  }

  /**
     * Handle before unload event
     */
  handleBeforeUnload(event) {
    if (this.hasUnsavedChanges) {
      event.preventDefault();
      event.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
      return event.returnValue;
    }
  }

  /**
     * Handle file input change
     */
  handleFileChange(event) {
    const file = event.target.files[0];
    if (file) {
      this.loadFile(file);
    }
  }

  /**
     * Add event listener
     */
  addEventListener(event, handler) {
    if (this.editor && this.editor.addEventListener) {
      this.editor.addEventListener(event, handler);
    }
  }

  /**
     * Get file operations status
     */
  getStatus() {
    return {
      initialized: this.isInitialized,
      currentFile: this.currentFile,
      hasUnsavedChanges: this.hasUnsavedChanges,
      canSave: this.editor !== null,
      canExport: this.editor !== null
    };
  }

  /**
     * Clean up file operations
     */
  destroy() {
    window.removeEventListener('beforeunload', this.handleBeforeUnload);

    const fileInput = document.getElementById('file-input');
    if (fileInput) {
      fileInput.removeEventListener('change', this.handleFileChange);
    }

    this.isInitialized = false;
  }
}

export { FileOperations };
export default FileOperations;
