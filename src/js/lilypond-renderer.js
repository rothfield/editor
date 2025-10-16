/**
 * LilyPond Renderer with Mustache Templating
 *
 * Generates PNG/SVG from LilyPond source using stdin piping (no disk writes).
 * Supports templating for minimal (in-tab) and full (display) variants.
 */

class LilyPondRenderer {
  constructor() {
    this.apiEndpoint = '/api/lilypond/render';
    this.debounceTimer = null;
    this.debounceMs = 2000; // 2 second debounce for in-tab rendering
    this.isRendering = false;
    this.lastSource = null;
  }

  /**
   * Render LilyPond from musical notation with Mustache templating
   * @param {string} lilypondSource - LilyPond source code
   * @param {Object} options - Rendering options
   * @param {boolean} options.minimal - Use minimal template (in-tab, smaller)
   * @param {string} options.format - Output format: 'svg' or 'png' (default: 'svg')
   * @param {Function} options.onSuccess - Success callback
   * @param {Function} options.onError - Error callback
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
      const payload = {
        lilypond_source: lilypondSource,
        template_variant: minimal ? 'minimal' : 'full',
        output_format: format
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

      const data = await response.json();

      if (data.success) {
        console.log(`[LilyPond] Rendered successfully (${format.toUpperCase()})`);
        if (onSuccess) {
          onSuccess({
            svg: data.svg,
            png_base64: data.png_base64,
            format: format
          });
        }
      } else {
        throw new Error(data.error || 'Unknown rendering error');
      }
    } catch (error) {
      console.error('[LilyPond] Render failed:', error);
      if (onError) onError(error.message);
    } finally {
      this.isRendering = false;
    }
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
