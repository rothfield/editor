/**
 * Export UI Component
 *
 * Provides a clean, accessible export dialog with four export options:
 * - JSON (internal format)
 * - MusicXML
 * - LilyPond SVG (compact)
 * - LilyPond PDF
 *
 * Uses Uno.css for styling (no dependencies required)
 */

class ExportUI {
  constructor(editor, fileOperations = null) {
    this.editor = editor;
    this.fileOperations = fileOperations;
    this.modalElement = null;
    this.isOpen = false;
  }

  /**
   * Open the export dialog
   */
  open() {
    if (this.isOpen) return;

    this.createModalElement();
    document.body.appendChild(this.modalElement);
    this.isOpen = true;

    // Focus on first button for accessibility
    const firstButton = this.modalElement.querySelector('button[data-export]');
    if (firstButton) {
      setTimeout(() => firstButton.focus(), 0);
    }
  }

  /**
   * Close the export dialog
   */
  close() {
    if (this.modalElement && this.modalElement.parentNode) {
      this.modalElement.parentNode.removeChild(this.modalElement);
    }
    this.isOpen = false;
  }

  /**
   * Create the modal DOM structure
   * @private
   */
  createModalElement() {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur';
    modal.addEventListener('click', (e) => {
      if (e.target === modal) this.close();
    });

    // Escape key handler
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        this.close();
        document.removeEventListener('keydown', handleEscape);
      }
    };
    document.addEventListener('keydown', handleEscape);

    const content = document.createElement('div');
    content.className = 'bg-gray-100 rounded shadow-xl w-auto mx-4 flex flex-col';

    const header = document.createElement('div');
    header.className = 'bg-gray-200 border-b border-gray-300 px-3 py-1';

    const title = document.createElement('h2');
    title.className = 'text-sm font-semibold text-gray-900';
    title.textContent = 'Export Score';

    header.appendChild(title);

    const body = document.createElement('div');
    body.className = 'px-3 py-2 flex-1';

    const buttonsContainer = document.createElement('div');
    buttonsContainer.className = 'flex gap-1';

    // Export options with enhanced styling
    const options = [
      {
        id: 'musicxml',
        label: 'MusicXML',
        description: 'Standard notation format',
        icon: '♪',
        color: 'from-emerald-500 to-emerald-600',
        lightColor: 'bg-emerald-50 border-emerald-200 hover:border-emerald-400 hover:shadow-md hover:shadow-emerald-200'
      },
      {
        id: 'midi',
        label: 'MIDI',
        description: 'Audio playback format',
        icon: '🎹',
        color: 'from-blue-500 to-blue-600',
        lightColor: 'bg-blue-50 border-blue-200 hover:border-blue-400 hover:shadow-md hover:shadow-blue-200'
      },
      {
        id: 'lilypond-source',
        label: 'LilyPond Source',
        description: 'Source code format',
        icon: '{ }',
        color: 'from-purple-500 to-purple-600',
        lightColor: 'bg-purple-50 border-purple-200 hover:border-purple-400 hover:shadow-md hover:shadow-purple-200'
      }
    ];

    options.forEach(option => {
      const button = this.createExportButton(option);
      buttonsContainer.appendChild(button);
    });

    body.appendChild(buttonsContainer);

    // Footer with close button
    const footer = document.createElement('div');
    footer.className = 'bg-gray-100 border-t border-gray-300 px-2 py-1 flex justify-end gap-1';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'px-2 py-0.5 text-xs font-medium text-gray-900 bg-gray-200 border border-gray-300 rounded hover:bg-gray-300 active:bg-gray-400 transition-colors duration-100 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer';
    closeBtn.textContent = 'Close';
    closeBtn.addEventListener('click', () => this.close());
    footer.appendChild(closeBtn);

    content.appendChild(header);
    content.appendChild(body);
    content.appendChild(footer);

    modal.appendChild(content);
    this.modalElement = modal;
  }

  /**
   * Create an individual export button
   * @private
   */
  createExportButton(option) {
    const button = document.createElement('button');
    button.className = `flex flex-col items-center gap-0.5 p-1.5 rounded border border-gray-300 bg-white hover:bg-gray-50 active:bg-gray-100 transition-colors duration-100 cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500`;
    button.setAttribute('data-export', option.id);
    button.setAttribute('title', option.description);

    const iconContainer = document.createElement('div');
    iconContainer.className = 'text-lg';
    iconContainer.textContent = option.icon;

    const label = document.createElement('div');
    label.className = 'text-xs font-medium text-gray-900 text-center leading-tight whitespace-nowrap';
    label.textContent = option.label;

    const desc = document.createElement('div');
    desc.className = 'text-xs text-gray-600 text-center leading-tight whitespace-nowrap';
    desc.textContent = option.description;

    button.appendChild(iconContainer);
    button.appendChild(label);
    button.appendChild(desc);

    button.addEventListener('click', () => this.handleExport(option.id));
    button.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.handleExport(option.id);
      }
    });

    return button;
  }

  /**
   * Handle export button click
   * @private
   */
  async handleExport(formatId) {
    this.close();

    try {
      const result = await this.export(formatId);
      if (result && result.success) {
        this.showNotification(`Exported as ${formatId}`, 'success');
      }
    } catch (error) {
      console.error(`Export failed: ${error.message}`);
      this.showNotification(`Export failed: ${error.message}`, 'error');
    }
  }

  /**
   * Export in the specified format
   */
  async export(formatId) {
    if (!this.editor) {
      throw new Error('Editor not initialized');
    }

    let blob;
    let filename;
    let mimeType = 'application/octet-stream';

    const metadata = this.editor.getDocumentMetadata?.() || {};
    const title = (metadata.title || 'score').replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const timestamp = this.getTimestamp();
    const baseFilename = `${title}-${timestamp}`;

    switch (formatId) {
      case 'musicxml':
        return this.exportMusicXML(baseFilename);

      case 'midi':
        return this.exportMIDI(baseFilename);

      case 'lilypond-source':
        return this.exportLilyPondSource(baseFilename);

      default:
        throw new Error(`Unknown export format: ${formatId}`);
    }
  }

  /**
   * Export as MusicXML
   * @private
   */
  async exportMusicXML(baseFilename) {
    // TODO: Implement MusicXML export
    // This will convert the internal document format to MusicXML
    const xml = this.generateMusicXML();

    const blob = new Blob([xml], { type: 'application/vnd.recordare.musicxml+xml' });
    this.downloadFile(blob, `${baseFilename}.musicxml`);

    return { success: true, format: 'musicxml' };
  }

  /**
   * Export as MIDI using WASM converter
   * @private
   */
  async exportMIDI(baseFilename) {
    if (!this.editor.theDocument) {
      throw new Error('No document to export');
    }

    if (!this.editor.wasmModule || !this.editor.wasmModule.exportMIDI) {
      throw new Error('WASM module not initialized');
    }

    try {
      // Call WASM function to export MIDI
      // exportMIDI(document, tpq=480)
      const midiData = this.editor.wasmModule.exportMIDI(this.editor.theDocument, 480);

      // Convert Uint8Array to Blob
      const blob = new Blob([midiData], { type: 'audio/midi' });
      this.downloadFile(blob, `${baseFilename}.mid`);

      return { success: true, format: 'midi' };
    } catch (error) {
      throw new Error(`MIDI export failed: ${error.message}`);
    }
  }

  /**
   * Export as LilyPond Source
   * @private
   */
  async exportLilyPondSource(baseFilename) {
    // Generate LilyPond source from document
    const lilypondSource = await this.generateLilyPondSource();

    const blob = new Blob([lilypondSource], { type: 'text/x-lilypond' });
    this.downloadFile(blob, `${baseFilename}.ly`);

    return { success: true, format: 'lilypond-source' };
  }

  /**
   * Generate LilyPond source from document using WASM converter
   * @private
   */
  async generateLilyPondSource() {
    if (!this.editor.theDocument) {
      throw new Error('No document to export');
    }

    if (!this.editor.wasmModule || !this.editor.wasmModule.convertMusicXMLToLilyPond) {
      throw new Error('WASM module not initialized');
    }

    try {
      // Step 1: Export to MusicXML
      const musicxml = this.editor.wasmModule.exportMusicXML(this.editor.theDocument);

      // Step 2: Convert MusicXML to LilyPond using existing template system
      // This uses the proper Rust templates with comprehensive paper directives
      const resultJson = this.editor.wasmModule.convertMusicXMLToLilyPond(musicxml, null);
      const result = JSON.parse(resultJson);

      if (!result || !result.lilypond_source) {
        throw new Error('LilyPond conversion failed');
      }

      return result.lilypond_source;
    } catch (error) {
      throw new Error(`LilyPond export failed: ${error.message}`);
    }
  }


  /**
   * Generate MusicXML from document
   * @private
   */
  generateMusicXML() {
    // TODO: Implement MusicXML generation from internal format
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1">
      <part-name>Music</part-name>
    </score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
        <key>
          <fifths>0</fifths>
        </key>
        <time>
          <beats>4</beats>
          <beat-type>4</beat-type>
        </time>
        <clef>
          <sign>G</sign>
          <line>2</line>
        </clef>
      </attributes>
    </measure>
  </part>
</score-partwise>`;

    return xml;
  }

  /**
   * Download a file
   * @private
   */
  downloadFile(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // Clean up
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /**
   * Convert ArrayBuffer to base64
   * @private
   */
  arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * Get current timestamp for filename
   * @private
   */
  getTimestamp() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');

    return (
      now.getFullYear().toString() +
      pad(now.getMonth() + 1) +
      pad(now.getDate()) +
      '-' +
      pad(now.getHours()) +
      pad(now.getMinutes())
    );
  }

  /**
   * Show notification message
   * @private
   */
  showNotification(message, type = 'info') {
    if (this.editor && this.editor.showUserNotification) {
      this.editor.showUserNotification(message, type);
    } else {
      console.log(`[${type.toUpperCase()}] ${message}`);
    }
  }
}

export default ExportUI;
export { ExportUI };
