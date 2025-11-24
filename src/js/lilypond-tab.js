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
    logger.info(LOG_CATEGORIES.UI, 'LilyPondTab: Initialized (Source Code Display)');
  }

  /**
   * Setup UI elements
   */
  setupUI() {
    // Find the lilypond-source element already in DOM
    this.sourceElement = document.getElementById('lilypond-source');
    this.container = document.getElementById('tab-content-lilypond-src');

    if (!this.sourceElement || !this.container) {
      logger.warn(LOG_CATEGORIES.UI, 'LilyPondTab: Required DOM elements not found');
      return;
    }

    // Container visibility is managed by UI class using 'hidden' class
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
    logger.debug(LOG_CATEGORIES.UI, 'LilyPondTab: Source tab shown');
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
      if (!this.editor || !this.editor.getDocument() || !this.editor.wasmModule) {
        this.sourceElement.textContent = '// Waiting for document...';
        return;
      }

      // Convert document to MusicXML, then to LilyPond
      const musicxml = this.editor.wasmModule.exportMusicXML(this.editor.getDocument());
      const settings = JSON.stringify({
        target_lilypond_version: "2.24.0",
        language: "English",
        convert_directions: true,
        convert_lyrics: true,
        convert_chord_symbols: true
      });
      const result = this.editor.wasmModule.convertMusicXMLToLilyPond(musicxml, settings);
      const parsed = JSON.parse(result);

      if (parsed.lilypond_source) {
        this.sourceElement.textContent = parsed.lilypond_source;
      } else {
        this.sourceElement.textContent = '// No LilyPond source generated';
      }
    } catch (error) {
      logger.error(LOG_CATEGORIES.UI, 'LilyPondTab: Failed to generate source', { error });
  }

  /**
   * Show/hide tab
   * Note: visibility is managed by UI class using 'hidden' class
   */
  setVisible(visible) {
    this.isVisible = visible;
    // Don't manipulate display style - let UI class handle it via 'hidden' class
  }
}

export default LilyPondTab;
