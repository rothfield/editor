/**
 * LilyPond Renderer with Mustache Templating
 *
 * Generates PNG/SVG from LilyPond source using stdin piping (no disk writes).
 * Supports templating for minimal (in-tab) and full (display) variants.
 */

interface RenderOptions {
  minimal?: boolean;
  format?: 'svg' | 'png' | 'pdf';
  onSuccess?: (result: RenderResult) => void;
  onError?: (error: string) => void;
}

interface RenderResult {
  pages: string[];
  pageCount: number;
  multiPage: boolean;
  format: string;
  success: boolean;
  svg_base64?: string;
  pdf_base64?: string;
}

interface RenderStatus {
  isRendering: boolean;
  hasPending: boolean;
  lastSource: string;
}

class LilyPondRenderer {
  private apiEndpoint: string = 'http://localhost:8787/engrave';
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private debounceMs: number = 2000;
  private isRendering: boolean = false;
  private lastSource: string | null = null;

  /**
   * Render LilyPond from musical notation with Mustache templating
   */
  async render(lilypondSource: string, options: RenderOptions = {}): Promise<void> {
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
  private async _performRender(
    lilypondSource: string,
    minimal: boolean,
    format: string,
    onSuccess: ((result: RenderResult) => void) | null,
    onError: ((error: string) => void) | null
  ): Promise<void> {
    if (this.isRendering) {
      console.log('[LilyPond] Render already in progress, skipping');
      return;
    }

    this.isRendering = true;

    try {
      // Prepare payload for lilypond-service (expects 'ly' and 'format')
      const payload = {
        ly: lilypondSource,
        format: format
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
              pages: data.pages,
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
          const result: RenderResult = {
            pages: [base64Data],
            pageCount: 1,
            multiPage: false,
            format: format,
            success: true
          };
          if (format === 'pdf') {
            result.pdf_base64 = base64Data;
          } else {
            result.svg_base64 = base64Data;
          }
          onSuccess(result);
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[LilyPond] Render failed:', error);
      if (onError) onError(errorMessage);
    } finally {
      this.isRendering = false;
    }
  }

  /**
   * Convert ArrayBuffer to base64 string
   */
  private _arrayBufferToBase64(buffer: ArrayBuffer): string {
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
  async renderNow(lilypondSource: string, options: RenderOptions = {}): Promise<void> {
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
  cancelPending(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
      console.log('[LilyPond] Pending render cancelled');
    }
  }

  /**
   * Get rendering status
   */
  getStatus(): RenderStatus {
    return {
      isRendering: this.isRendering,
      hasPending: this.debounceTimer !== null,
      lastSource: this.lastSource ? 'yes' : 'no'
    };
  }
}

export default LilyPondRenderer;
