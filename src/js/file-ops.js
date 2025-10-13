/**
 * File Operations for Music Notation Editor
 *
 * Handles file menu operations including New, Open, Save, Save As,
 * and Export functionality with proper error handling and user feedback.
 */

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

    console.log('File operations initialized');
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
    try {
      // Check for unsaved changes
      if (this.hasUnsavedChanges) {
        const shouldSave = await this.promptUnsavedChanges();
        if (shouldSave === 'cancel') {
          return;
        }
        if (shouldSave === 'save') {
          await this.saveFile();
        }
      }

      // Create new document
      await this.createNewDocument();

      // Reset file state
      this.currentFile = null;
      this.hasUnsavedChanges = false;
      this.updateWindowModified();

      // Show success message
      this.showSuccessMessage('New composition created');

      // Focus editor
      this.requestFocus();
    } catch (error) {
      this.showErrorMessage('Failed to create new file', error);
    }
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
      fileInput.accept = '.json,.txt';
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
     */
  async createNewDocument() {
    if (!this.editor) {
      throw new Error('Editor not available');
    }

    // Clear current document
    this.editor.clearDocument();

    // Apply default settings
    await this.editor.updateDocumentMetadata({
      title: this.defaultSettings.title,
      tonic: this.defaultSettings.tonic,
      pitchSystem: this.defaultSettings.pitchSystem,
      tala: this.defaultSettings.tala
    });

    // Add initial empty line
    await this.editor.addLine();

    // Update display
    this.editor.requestRender();
  }

  /**
     * Load a file into the editor
     */
  async loadFile(file) {
    const text = await this.readFileText(file);

    try {
      // Try to parse as JSON first
      const data = JSON.parse(text);
      await this.loadFromJSON(data);
    } catch (error) {
      // Fallback to plain text
      await this.loadFromText(text);
    }

    this.currentFile = file.name;
    this.hasUnsavedChanges = false;
    this.updateWindowModified();

    this.showSuccessMessage(`Loaded: ${file.name}`);
    this.requestFocus();
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
      await this.editor.parseText(data.content);

      // Apply basic metadata
      if (data.title || data.tonic || data.pitchSystem) {
        await this.editor.updateDocumentMetadata({
          title: data.title || 'Untitled',
          tonic: data.tonic || 'C',
          pitchSystem: data.pitchSystem || 'number'
        });
      }
    }

    this.editor.requestRender();
  }

  /**
     * Load document from plain text
     */
  async loadFromText(text) {
    if (!this.editor) {
      throw new Error('Editor not available');
    }

    // Parse text as notation
    await this.editor.parseText(text);
    this.editor.requestRender();
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
      console.log('File operations:', message);
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
      console.error('File operations error:', fullMessage);
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
