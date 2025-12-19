/**
 * LilyPond Renderer with Mustache Templating
 *
 * Generates PNG/SVG from LilyPond source using stdin piping (no disk writes).
 * Supports templating for minimal (in-tab) and full (display) variants.
 */

class LilyPondRenderer {
  constructor() {
    // Call lilypond-service directly at http://localhost:8787/engrave
    this.apiEndpoint = 'http://localhost:8787/engrave';
    this.debounceTimer = null;
    this.debounceMs = 2000; // 2 second debounce for in-tab rendering
    this.isRendering = false;
    this.lastSource = null;
  }

  /**
   * Render LilyPond from musical notation with Mustache templating
   * @param {string} lilypondSource - LilyPond source code
   * @param {Object} [options] - Rendering options
   * @param {boolean} [options.minimal] - Use minimal template (in-tab, smaller)
   * @param {string} [options.format] - Output format: 'svg' or 'png' (default: 'svg')
   * @param {Function} [options.onSuccess] - Success callback
   * @param {Function} [options.onError] - Error callback
   */
  async render(lilypondSource, options = {}) {
    const {
      minimal = true,
      format = 'svg',
      onSuccess = null,
      onError = null
    } = options;

    if (!lilypondSource || lilypondSource.trim().length === 0) {
      if (onError) onError('Empty LilyPond source');
      return;
    }

    // Debounce frequent renders (for real-time in-tab updates)
    if (minimal && lilypondSource === this.lastSource) {
      console.log('[LilyPond] Source unchanged, skipping render');
      return;
    }

    this.lastSource = lilypondSource;

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    if (minimal) {
      this.debounceTimer = setTimeout(() => {
        this._performRender(lilypondSource, minimal, format, onSuccess, onError);
      }, this.debounceMs);
    } else {
      this._performRender(lilypondSource, minimal, format, onSuccess, onError);
    }
  }

  /**
   * Internal render execution
   */
  async _performRender(lilypondSource, minimal, format, onSuccess, onError) {
    if (this.isRendering) {
      console.log('[LilyPond] Render already in progress, skipping');
      return;
    }

    this.isRendering = true;

    try {
      // Prepare payload for lilypond-service (expects 'ly' and 'format')
      const payload = {
        ly: lilypondSource,
        format: format  // 'svg' or 'pdf'
      };

      const response = await fetch(this.apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      // lilypond-service returns either JSON (multi-page SVG) or binary data
      const contentType = response.headers.get('content-type');

      if (contentType && contentType.includes('application/json')) {
        // Multi-page SVG response or error
        const data = await response.json();

        if (data.error) {
          throw new Error(data.error || 'Unknown rendering error');
        }

        if (data.multiPage && data.pages) {
          // Multi-page SVG response
          console.log(`[LilyPond] Rendered ${data.pageCount} page(s) successfully`);
          if (onSuccess) {
            onSuccess({
              pages: data.pages, // Array of base64-encoded SVG strings
              pageCount: data.pageCount,
              multiPage: true,
              format: format,
              success: true
            });
          }
        } else {
          throw new Error('Invalid response format');
        }
      } else {
        // Binary response (single SVG or PDF) - convert to base64
        const arrayBuffer = await response.arrayBuffer();
        const base64Data = this._arrayBufferToBase64(arrayBuffer);

        console.log(`[LilyPond] Rendered successfully (${format.toUpperCase()})`);
        if (onSuccess) {
          const fieldName = format === 'pdf' ? 'pdf_base64' : 'svg_base64';
          onSuccess({
            [fieldName]: base64Data,
            pages: [base64Data], // Backwards compatibility
            pageCount: 1,
            multiPage: false,
            format: format,
            success: true
          });
        }
      }
    } catch (error) {
      console.error('[LilyPond] Render failed:', error);
      if (onError) onError(error.message);
    } finally {
      this.isRendering = false;
    }
  }

  /**
   * Convert ArrayBuffer to base64 string
   * @private
   */
  _arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * Render with manual refresh (no debouncing)
   */
  async renderNow(lilypondSource, options = {}) {
    const {
      minimal = false,
      format = 'svg',
      onSuccess = null,
      onError = null
    } = options;

    this.lastSource = lilypondSource;
    await this._performRender(lilypondSource, minimal, format, onSuccess, onError);
  }

  /**
   * Cancel pending render
   */
  cancelPending() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
      console.log('[LilyPond] Pending render cancelled');
    }
  }

  /**
   * Get rendering status
   */
  getStatus() {
    return {
      isRendering: this.isRendering,
      hasPending: this.debounceTimer !== null,
      lastSource: this.lastSource ? 'yes' : 'no'
    };
  }
}

export default LilyPondRenderer;
