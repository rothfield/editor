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
          // Handle both multi-page and single-page responses
          if (result.multiPage && result.pages) {
            this.displayMultiPageSVG(result.pages, result.pageCount);
          } else if (result.svg_base64) {
            // Backwards compatibility: single page
            this.displaySVG(result.svg_base64);
          } else {
            this.displayMessage('Invalid render result');
          }
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

    if (!this.editor?.getDocument() || !this.editor?.wasmModule) {
      console.error('[LilyPondDisplay] Document or WASM module not available');
      return null;
    }

    try {
      console.log('[LilyPondDisplay] Exporting to MusicXML...');
      // Export to MusicXML
      const musicxml = this.editor.wasmModule.exportMusicXML(this.editor.getDocument());
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
   * Display multi-page SVG in render area (stacked vertically)
   */
  displayMultiPageSVG(pagesBase64, pageCount) {
    console.log('[LilyPondDisplay] displayMultiPageSVG called', {
      pagesBase64Type: typeof pagesBase64,
      pagesBase64IsArray: Array.isArray(pagesBase64),
      pageCount,
      pagesLength: pagesBase64?.length,
      renderAreaExists: !!this.renderArea
    });

    if (!this.renderArea) {
      console.error('[LilyPondDisplay] renderArea not found!');
      return;
    }

    try {
      console.log(`[LilyPondDisplay] Displaying ${pageCount} page(s)`);

      // Update render area styling for multi-page display
      this.renderArea.style.cssText = `
        flex: 1;
        overflow: auto;
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 20px;
        background: #f0f0f0;
        gap: 16px;
      `;

      // Clear previous content
      this.renderArea.innerHTML = '';

      // Create container for stacked pages
      const pagesContainer = document.createElement('div');
      pagesContainer.className = 'lp-preview';
      pagesContainer.style.cssText = `
        display: flex;
        flex-direction: column;
        gap: 16px;
        width: 100%;
        max-width: 800px;
      `;

      console.log('[LilyPondDisplay] Processing pages...');

      // Add each page as an img element
      pagesBase64.forEach((base64Data, index) => {
        console.log(`[LilyPondDisplay] Processing page ${index + 1}, base64 length: ${base64Data?.length}`);

        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);

        const img = document.createElement('img');
        img.src = url;
        img.alt = `Page ${index + 1}`;
        img.style.cssText = `
          width: 100%;
          height: auto;
          background: white;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
          border-radius: 4px;
        `;

        console.log(`[LilyPondDisplay] Created img element for page ${index + 1}, src: ${url.substring(0, 50)}...`);

        pagesContainer.appendChild(img);
      });

      this.renderArea.appendChild(pagesContainer);

      console.log('[LilyPondDisplay] Multi-page SVG rendered successfully, container has', pagesContainer.children.length, 'children');
    } catch (error) {
      console.error('[LilyPondDisplay] Multi-page SVG display error:', error);
      console.error('[LilyPondDisplay] Error stack:', error.stack);
      this.displayMessage('Failed to display multi-page SVG: ' + error.message);
    }
  }

  /**
   * Display single SVG in render area (backwards compatibility)
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
