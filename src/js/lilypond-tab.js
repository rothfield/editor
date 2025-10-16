/**
 * LilyPond Source Code Tab UI Component
 *
 * Displays LilyPond notation source code with syntax highlighting and copy functionality.
 * Converted from MusicXML or generated from musical notation.
 */

class LilyPondTab {
  constructor(editor) {
    this.editor = editor;
    this.container = null;
    this.sourceElement = null;
    this.isVisible = false;
  }

  /**
   * Initialize the LilyPond source tab UI
   */
  initialize() {
    this.setupUI();
    this.attachEventListeners();
    console.log('[LilyPondTab] Initialized (Source Code Display)');
  }

  /**
   * Setup UI elements
   */
  setupUI() {
    // Find the lilypond-source element already in DOM
    this.sourceElement = document.getElementById('lilypond-source');
    this.container = document.getElementById('tab-content-lilypond-src');

    if (!this.sourceElement || !this.container) {
      console.warn('[LilyPondTab] Required DOM elements not found');
      return;
    }

    // Initially hidden
    this.container.style.display = 'none';
  }

  /**
   * Attach event listeners
   */
  attachEventListeners() {
    // Listen for tab visibility changes
    const tabButton = document.querySelector('[data-tab="lilypond-src"]');
    if (tabButton) {
      tabButton.addEventListener('click', () => {
        this.isVisible = true;
        this.onTabShown();
      });
    }

    // Listen for editor updates
    if (this.editor) {
      const originalRender = this.editor.render;
      this.editor.render = async (...args) => {
        await originalRender.apply(this.editor, args);
        this.onDocumentUpdated();
      };
    }
  }

  /**
   * Called when tab is shown
   */
  onTabShown() {
    console.log('[LilyPondTab] Source tab shown');
    this.updateLilyPondSource();
  }

  /**
   * Called when editor document is updated
   */
  onDocumentUpdated() {
    // Always update the source, even if tab is not visible
    // This ensures the source is current when the tab is shown
    this.updateLilyPondSource();
  }

  /**
   * Update LilyPond source display
   */
  async updateLilyPondSource() {
    if (!this.sourceElement) return;

    try {
      if (!this.editor || !this.editor.theDocument || !this.editor.wasmModule) {
        this.sourceElement.textContent = '// Waiting for document...';
        return;
      }

      // Convert document to MusicXML, then to LilyPond
      const musicxml = this.editor.wasmModule.exportMusicXML(this.editor.theDocument);
      const result = this.editor.wasmModule.convertMusicXMLToLilyPond(musicxml, null);
      const parsed = JSON.parse(result);

      if (parsed.lilypond_source) {
        this.sourceElement.textContent = parsed.lilypond_source;
      } else {
        this.sourceElement.textContent = '// No LilyPond source generated';
      }
    } catch (error) {
      console.error('[LilyPondTab] Failed to generate source:', error);
      this.sourceElement.textContent = `// Error: ${error.message}`;
    }
  }

  /**
   * Show/hide tab
   */
  setVisible(visible) {
    this.isVisible = visible;
    if (this.container) {
      this.container.style.display = visible ? 'flex' : 'none';
    }
  }
}

export default LilyPondTab;
