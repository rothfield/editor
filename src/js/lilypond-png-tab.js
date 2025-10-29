/**
 * LilyPond Compact SVG Display
 *
 * Displays the current document as compact LilyPond SVG.
 * Click the tab button to refresh the preview.
 */

class LilyPondPngTab {
  constructor(editor, lilypondRenderer) {
    this.editor = editor;
    this.lilypondRenderer = lilypondRenderer;
    this.container = null;
    this.renderArea = null;
    this.isRendering = false;
  }

  /**
   * Initialize the LilyPond display
   */
  initialize() {
    this.createUI();
    this.attachEventListeners();
    console.log('[LilyPondDisplay] Initialized - click tab to refresh');
  }

  /**
   * Create minimal UI - just a container for SVG
   */
  createUI() {
    const tabContainer = document.getElementById('tab-content-lilypond-png');
    if (!tabContainer) {
      console.warn('[LilyPondDisplay] Tab container not found');
      return;
    }

    this.container = tabContainer;
    this.container.style.cssText = `
      display: flex;
      flex-direction: column;
      height: 100%;
      background: white;
      overflow: hidden;
    `;

    // Create render area for SVG
    this.renderArea = document.createElement('div');
    this.renderArea.className = 'lilypond-svg-display';
    this.renderArea.style.cssText = `
      flex: 1;
      overflow: auto;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      background: #f9f9f9;
    `;

    // Initial state message
    this.renderArea.innerHTML = '<div style="color: #999; font-size: 14px;">Loading notation...</div>';

    this.container.appendChild(this.renderArea);
  }

  /**
   * Attach event listeners - only tab click for manual refresh
   */
  attachEventListeners() {
    // Find the LilyPond PNG tab button by ID
    const tabButton = document.getElementById('tab-lilypond-png');
    console.log('[LilyPondDisplay] attachEventListeners - tabButton:', !!tabButton);

    if (tabButton) {
      // Add tooltip
      tabButton.title = 'Click to refresh notation preview';
      tabButton.style.cursor = 'pointer';

      // When tab button is clicked, render immediately
      const originalOnClick = tabButton.onclick;
      console.log('[LilyPondDisplay] Original onclick:', !!originalOnClick);

      tabButton.onclick = (e) => {
        console.log('[LilyPondDisplay] ===== TAB CLICKED =====');
        console.log('[LilyPondDisplay] this:', this);
        console.log('[LilyPondDisplay] this.render:', !!this.render);
        this.render();
        if (originalOnClick) originalOnClick(e);
      };

      console.log('[LilyPondDisplay] Click handler attached');
    } else {
      console.warn('[LilyPondDisplay] Tab button not found');
    }
  }

  /**
   * Render current document as compact LilyPond SVG
   */
  async render() {
    if (this.isRendering) {
      return;
    }

    this._performRender();
  }

  /**
   * Perform the actual render
   */
  async _performRender() {
    if (this.isRendering) return;
    this.isRendering = true;

    console.log('[LilyPondDisplay] _performRender started');

    try {
      // Get LilyPond source from document
      console.log('[LilyPondDisplay] Getting LilyPond source...');
      const lilypondSource = this.getLilyPondSource();

      console.log('[LilyPondDisplay] Source retrieved:', {
        isNull: lilypondSource === null,
        isUndefined: lilypondSource === undefined,
        isEmpty: lilypondSource === '',
        length: lilypondSource?.length || 0,
        type: typeof lilypondSource
      });

      if (!lilypondSource) {
        console.log('[LilyPondDisplay] No source, displaying message');
        this.displayMessage('No musical content to render');
        this.isRendering = false;
        return;
      }

      console.log('[LilyPondDisplay] Rendering compact SVG...');

      // Render using LilyPond service
      await this.lilypondRenderer.renderNow(lilypondSource, {
        minimal: false,
        format: 'svg',
        onSuccess: (result) => {
          this.displaySVG(result.svg_base64);
        },
        onError: (error) => {
          console.error('[LilyPondDisplay] Render error:', error);
          // Show detailed error message
          const errorMsg = error?.message || error || 'Unknown error';
          this.displayMessage(`Render error: ${errorMsg}`);
          console.log('[LilyPondDisplay] Full error object:', error);
        }
      });
    } catch (error) {
      console.error('[LilyPondDisplay] Error:', error);
      this.displayMessage(`Error: ${error.message}`);
    } finally {
      this.isRendering = false;
    }
  }

  /**
   * Get LilyPond source from document using WASM conversion
   */
  getLilyPondSource() {
    console.log('[LilyPondDisplay] getLilyPondSource called');

    if (!this.editor?.theDocument || !this.editor?.wasmModule) {
      console.error('[LilyPondDisplay] Document or WASM module not available');
      return null;
    }

    try {
      console.log('[LilyPondDisplay] Exporting to MusicXML...');
      // Export to MusicXML
      const musicxml = this.editor.wasmModule.exportMusicXML(this.editor.theDocument);
      console.log('[LilyPondDisplay] MusicXML export: ', musicxml?.length || 0, 'bytes');

      if (!musicxml) {
        console.error('[LilyPondDisplay] Empty MusicXML export');
        return null;
      }

      console.log('[LilyPondDisplay] Converting MusicXML to LilyPond...');
      // Convert to LilyPond with no title (forces Compact template)
      const settings = JSON.stringify({
        target_lilypond_version: "2.24.0",
        language: "English",
        convert_directions: true,
        convert_lyrics: true,
        convert_chord_symbols: true,
        title: null,  // Explicitly clear title to use compact template
        composer: null
      });
      const result = this.editor.wasmModule.convertMusicXMLToLilyPond(musicxml, settings);
      const parsed = JSON.parse(result);

      if (!parsed.lilypond_source) {
        console.error('[LilyPondDisplay] No LilyPond source generated');
        return null;
      }

      console.log('[LilyPondDisplay] Generated LilyPond:', parsed.lilypond_source.length, 'bytes');
      return parsed.lilypond_source;
    } catch (e) {
      console.error('[LilyPondDisplay] WASM conversion failed:', e.message);
      return null;
    }
  }

  /**
   * Display SVG in render area
   */
  displaySVG(base64Data) {
    if (!this.renderArea) return;

    try {
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);

      this.renderArea.innerHTML = '';
      const img = document.createElement('img');
      img.src = url;
      img.style.cssText = `
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
      `;
      this.renderArea.appendChild(img);

      console.log('[LilyPondDisplay] SVG rendered successfully');
    } catch (error) {
      console.error('[LilyPondDisplay] SVG display error:', error);
      this.displayMessage('Failed to display SVG');
    }
  }

  /**
   * Display message in render area
   */
  displayMessage(message) {
    if (!this.renderArea) return;
    this.renderArea.innerHTML = `
      <div style="
        color: #666;
        font-size: 14px;
        text-align: center;
        padding: 20px;
      ">${message}</div>
    `;
  }

}

export default LilyPondPngTab;
