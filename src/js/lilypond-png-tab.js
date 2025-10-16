/**
 * LilyPond PNG/SVG Rendering Tab UI Component
 *
 * Displays LilyPond notation rendered as PNG or SVG with real-time updates.
 * Features:
 * - Refresh button for manual render trigger
 * - Real-time debounced updates
 * - Error display
 * - SVG/PNG format toggle
 * - Copy-to-clipboard functionality
 */

class LilyPondPngTab {
  constructor(editor, lilypondRenderer) {
    this.editor = editor;
    this.lilypondRenderer = lilypondRenderer;
    this.container = null;
    this.renderArea = null;
    this.statusElement = null;
    this.refreshButton = null;
    this.formatToggle = null;
    this.currentFormat = 'svg';
    this.isVisible = false;
  }

  /**
   * Initialize the LilyPond PNG tab UI
   */
  initialize() {
    this.createTabUI();
    this.attachEventListeners();
    console.log('[LilyPondPngTab] Initialized');
  }

  /**
   * Create tab HTML structure
   */
  createTabUI() {
    // Find or create tab container
    const tabContainer = document.getElementById('tab-content-lilypond-png');
    if (!tabContainer) {
      console.warn('[LilyPondPngTab] Tab container not found in DOM');
      return;
    }

    this.container = tabContainer;

    // Create toolbar
    const toolbar = document.createElement('div');
    toolbar.className = 'lilypond-png-toolbar';
    toolbar.style.cssText = `
      display: flex;
      gap: 8px;
      padding: 10px;
      border-bottom: 1px solid #ddd;
      background: #f5f5f5;
      align-items: center;
      flex-shrink: 0;
    `;

    // Refresh button
    this.refreshButton = document.createElement('button');
    this.refreshButton.textContent = '🔄 Refresh';
    this.refreshButton.className = 'lilypond-png-refresh-btn';
    this.refreshButton.style.cssText = `
      padding: 6px 12px;
      background: #007bff;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 13px;
    `;
    this.refreshButton.onclick = () => this.refreshRender();

    // Format toggle
    this.formatToggle = document.createElement('select');
    this.formatToggle.className = 'lilypond-png-format-toggle';
    this.formatToggle.innerHTML = `
      <option value="svg">SVG</option>
      <option value="png">PNG</option>
    `;
    this.formatToggle.style.cssText = `
      padding: 6px;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-size: 13px;
    `;
    this.formatToggle.onchange = (e) => {
      this.currentFormat = e.target.value;
      this.refreshRender();
    };

    // Status display
    this.statusElement = document.createElement('div');
    this.statusElement.className = 'lilypond-png-status';
    this.statusElement.style.cssText = `
      flex: 1;
      padding: 0 8px;
      font-size: 12px;
      color: #666;
    `;
    this.statusElement.textContent = 'Ready';

    // Copy button
    const copyButton = document.createElement('button');
    copyButton.textContent = '📋 Copy';
    copyButton.className = 'lilypond-png-copy-btn';
    copyButton.style.cssText = `
      padding: 6px 12px;
      background: #6c757d;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 13px;
    `;
    copyButton.onclick = () => this.copyToClipboard();

    toolbar.appendChild(this.refreshButton);
    toolbar.appendChild(this.formatToggle);
    toolbar.appendChild(this.statusElement);
    toolbar.appendChild(copyButton);

    // Find existing render container and clear it
    this.renderArea = this.container.querySelector('#lilypond-render-container');
    if (!this.renderArea) {
      this.renderArea = document.createElement('div');
      this.renderArea.id = 'lilypond-render-container';
      this.renderArea.className = 'flex-1 bg-white p-3 border-2 border-gray-300 rounded overflow-auto flex items-center justify-center';
      this.renderArea.style.cssText = `
        flex: 1;
        overflow: auto;
        padding: 20px;
        background: white;
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 400px;
      `;
      this.container.appendChild(this.renderArea);
    }

    // Insert toolbar at top
    this.container.insertBefore(toolbar, this.container.firstChild);
  }

  /**
   * Attach event listeners
   */
  attachEventListeners() {
    // Listen for tab visibility changes
    const tabButton = document.querySelector('[data-tab="lilypond-png"]');
    if (tabButton) {
      tabButton.addEventListener('click', () => {
        this.isVisible = true;
        this.onTabShown();
      });
    }

    // Listen for editor updates
    if (this.editor) {
      // Hook into document update events
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
    console.log('[LilyPondPngTab] Tab shown');
    this.refreshRender();
  }

  /**
   * Called when editor document is updated
   */
  onDocumentUpdated() {
    if (!this.isVisible) return;

    // Get current LilyPond source from editor
    const lilypondSource = this.getLilyPondSource();
    if (lilypondSource) {
      // Real-time debounced render
      this.lilypondRenderer.render(lilypondSource, {
        minimal: true,
        format: this.currentFormat,
        onSuccess: (result) => this.displayResult(result),
        onError: (error) => this.displayError(error)
      });
    }
  }

  /**
   * Get LilyPond source from editor
   */
  getLilyPondSource() {
    if (!this.editor || !this.editor.theDocument) {
      return null;
    }

    // Try to get from lilypond-source element
    const lilyPondDisplay = document.getElementById('lilypond-source');
    if (lilyPondDisplay && lilyPondDisplay.textContent) {
      return lilyPondDisplay.textContent;
    }

    // Fallback: convert from MusicXML
    if (this.editor.wasmModule && this.editor.wasmModule.convertMusicXMLToLilyPond) {
      try {
        const musicxml = this.editor.wasmModule.exportMusicXML(this.editor.theDocument);
        const result = this.editor.wasmModule.convertMusicXMLToLilyPond(musicxml, null);
        const parsed = JSON.parse(result);
        return parsed.lilypond_source;
      } catch (e) {
        console.error('[LilyPondPngTab] Failed to generate LilyPond source:', e);
        return null;
      }
    }

    return null;
  }

  /**
   * Manually trigger refresh
   */
  async refreshRender() {
    this.updateStatus('Rendering...');

    const lilypondSource = this.getLilyPondSource();
    if (!lilypondSource) {
      this.displayError('No LilyPond source available');
      return;
    }

    this.lilypondRenderer.renderNow(lilypondSource, {
      minimal: true,
      format: this.currentFormat,
      onSuccess: (result) => {
        this.displayResult(result);
        this.updateStatus('Ready');
      },
      onError: (error) => {
        this.displayError(error);
      }
    });
  }

  /**
   * Display rendered result
   */
  displayResult(result) {
    if (result.svg) {
      this.renderArea.innerHTML = result.svg;
      this.renderArea.style.background = 'white';
      this.renderArea.style.display = 'flex';
      this.renderArea.style.alignItems = 'center';
      this.renderArea.style.justifyContent = 'center';
    } else if (result.png_base64) {
      const img = document.createElement('img');
      img.src = `data:image/png;base64,${result.png_base64}`;
      img.style.cssText = `
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
      `;
      this.renderArea.innerHTML = '';
      this.renderArea.appendChild(img);
    }
  }

  /**
   * Display error message
   */
  displayError(error) {
    const errorMsg = error.substring(0, 500);

    this.renderArea.innerHTML = `
      <div style="color: #d32f2f; padding: 20px; text-align: center; max-width: 100%;">
        <strong>Render Error</strong>
        <pre style="margin-top: 10px; background: #f5f5f5; padding: 10px; border-radius: 4px; text-align: left; overflow-x: auto; font-size: 11px;">
${this.escapeHtml(errorMsg)}
        </pre>
        <div style="margin-top: 15px; padding: 12px; background: #e3f2fd; border: 1px solid #2196f3; border-radius: 4px; font-size: 12px; text-align: left;">
          <strong>ℹ️ Development Server Required</strong>
          <p>Start the dev server to enable LilyPond rendering:</p>
          <code style="display: block; background: #f5f5f5; padding: 8px; margin: 8px 0; border-radius: 3px; overflow-x: auto;">npm run dev</code>
          <p>The dev server provides the /api/lilypond/render endpoint.</p>
          <p style="font-size: 11px; color: #666; margin: 8px 0 0 0;">Note: LilyPond and ImageMagick must be installed for full rendering support.</p>
        </div>
      </div>
    `;
    this.updateStatus(`Error: ${error.substring(0, 50)}`);
  }

  /**
   * Update status text
   */
  updateStatus(text) {
    if (this.statusElement) {
      this.statusElement.textContent = text;
    }
  }

  /**
   * Copy to clipboard (SVG or PNG)
   */
  async copyToClipboard() {
    const svgElement = this.renderArea.querySelector('svg');
    if (svgElement) {
      const svgString = new XMLSerializer().serializeToString(svgElement);
      try {
        await navigator.clipboard.writeText(svgString);
        alert('SVG copied to clipboard!');
      } catch (err) {
        console.error('Failed to copy SVG:', err);
        alert('Failed to copy SVG');
      }
      return;
    }

    const imgElement = this.renderArea.querySelector('img');
    if (imgElement) {
      try {
        const response = await fetch(imgElement.src);
        const blob = await response.blob();
        await navigator.clipboard.write([
          new ClipboardItem({ [blob.type]: blob })
        ]);
        alert('Image copied to clipboard!');
      } catch (err) {
        console.error('Failed to copy image:', err);
        alert('Failed to copy image');
      }
      return;
    }

    alert('No rendered image to copy');
  }

  /**
   * Escape HTML for display
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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

export default LilyPondPngTab;
