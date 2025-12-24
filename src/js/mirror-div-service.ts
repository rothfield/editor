/**
 * MirrorDivService - Character Position Measurement for Textareas
 *
 * Uses a hidden "mirror" div to accurately measure character positions
 * within a textarea. This enables positioning overlays (lyrics, tala markers)
 * at specific character positions.
 *
 * The mirror div replicates the textarea's text styling exactly, allowing
 * us to insert marker elements and measure their positions.
 */

interface CharPosition {
  x: number;
  y: number;
}

interface MirrorCache {
  mirror: HTMLDivElement;
  textarea: HTMLTextAreaElement;
  lastValue: string;
  positionCache: Map<number, CharPosition>;
}

class MirrorDivService {
  private _mirrorCache: WeakMap<HTMLTextAreaElement, MirrorCache>;
  private _stylesToCopy: string[];

  constructor() {
    this._mirrorCache = new WeakMap();
    this._stylesToCopy = [
      'font-family',
      'font-size',
      'font-weight',
      'font-style',
      'font-variant',
      'letter-spacing',
      'word-spacing',
      'line-height',
      'text-transform',
      'padding-left',
      'padding-right',
      'padding-top',
      'padding-bottom',
      'border-left-width',
      'border-right-width',
      'border-top-width',
      'border-bottom-width',
      'box-sizing',
      'width',
      'direction',
      'text-align',
    ];
  }

  /**
   * Get or create a mirror div for a textarea
   */
  private _getOrCreateMirror(textarea: HTMLTextAreaElement): MirrorCache {
    let cache = this._mirrorCache.get(textarea);

    if (!cache) {
      // Create mirror div
      const mirror = document.createElement('div');
      mirror.className = 'textarea-mirror';
      mirror.setAttribute('aria-hidden', 'true');
      mirror.style.cssText = `
        position: absolute;
        left: -9999px;
        top: 0;
        visibility: hidden;
        pointer-events: none;
        white-space: pre;
        overflow: hidden;
      `;

      // Append to document body (not textarea parent to avoid layout issues)
      document.body.appendChild(mirror);

      cache = {
        mirror,
        textarea,
        lastValue: '',
        positionCache: new Map(),
      };

      this._mirrorCache.set(textarea, cache);

      // Sync styles initially
      this._syncMirrorStyles(textarea, mirror);
    }

    return cache;
  }

  /**
   * Sync mirror div styles with textarea
   */
  private _syncMirrorStyles(textarea: HTMLTextAreaElement, mirror: HTMLDivElement): void {
    const computed = getComputedStyle(textarea);

    for (const prop of this._stylesToCopy) {
      mirror.style.setProperty(prop, computed.getPropertyValue(prop));
    }
  }

  /**
   * Get pixel position for a character index in a textarea
   */
  getCharacterPosition(textarea: HTMLTextAreaElement, charIndex: number): CharPosition {
    const cache = this._getOrCreateMirror(textarea);
    const text = textarea.value;

    // Invalidate cache if text changed
    if (cache.lastValue !== text) {
      cache.positionCache.clear();
      cache.lastValue = text;
      // Re-sync styles in case they changed
      this._syncMirrorStyles(textarea, cache.mirror);
    }

    // Check cache
    const cached = cache.positionCache.get(charIndex);
    if (cached) {
      return cached;
    }

    // Compute position using mirror
    const mirror = cache.mirror;
    const beforeText = text.slice(0, charIndex);

    // Clear and rebuild mirror content
    mirror.textContent = '';

    // Add text before marker
    if (beforeText) {
      mirror.appendChild(document.createTextNode(beforeText));
    }

    // Add marker span
    const marker = document.createElement('span');
    marker.id = 'mirror-marker';
    marker.textContent = '\u200B'; // Zero-width space
    mirror.appendChild(marker);

    // Add remaining text (for accurate measurement with wrapping)
    const afterText = text.slice(charIndex);
    if (afterText) {
      mirror.appendChild(document.createTextNode(afterText));
    }

    // Get marker position
    const markerRect = marker.getBoundingClientRect();
    const mirrorRect = mirror.getBoundingClientRect();

    const pos: CharPosition = {
      x: markerRect.left - mirrorRect.left,
      y: markerRect.top - mirrorRect.top,
    };

    // Cache and return
    cache.positionCache.set(charIndex, pos);
    return pos;
  }

  /**
   * Batch measure multiple character positions (single layout pass)
   * More efficient when positioning many overlays
   */
  getCharacterPositions(textarea: HTMLTextAreaElement, indices: number[]): Map<number, CharPosition> {
    const cache = this._getOrCreateMirror(textarea);
    const text = textarea.value;

    // Invalidate cache if text changed
    if (cache.lastValue !== text) {
      cache.positionCache.clear();
      cache.lastValue = text;
      this._syncMirrorStyles(textarea, cache.mirror);
    }

    const results = new Map<number, CharPosition>();
    const uncachedIndices: number[] = [];

    // Check cache for existing positions
    for (const idx of indices) {
      const cached = cache.positionCache.get(idx);
      if (cached) {
        results.set(idx, cached);
      } else {
        uncachedIndices.push(idx);
      }
    }

    // If all cached, return early
    if (uncachedIndices.length === 0) {
      return results;
    }

    // Sort indices for efficient measurement
    uncachedIndices.sort((a, b) => a - b);

    const mirror = cache.mirror;

    // Measure each uncached position
    for (const idx of uncachedIndices) {
      const beforeText = text.slice(0, idx);

      mirror.textContent = '';

      if (beforeText) {
        mirror.appendChild(document.createTextNode(beforeText));
      }

      const marker = document.createElement('span');
      marker.textContent = '\u200B';
      mirror.appendChild(marker);

      const afterText = text.slice(idx);
      if (afterText) {
        mirror.appendChild(document.createTextNode(afterText));
      }

      const markerRect = marker.getBoundingClientRect();
      const mirrorRect = mirror.getBoundingClientRect();

      const pos: CharPosition = {
        x: markerRect.left - mirrorRect.left,
        y: markerRect.top - mirrorRect.top,
      };

      cache.positionCache.set(idx, pos);
      results.set(idx, pos);
    }

    return results;
  }

  /**
   * Invalidate cache for a textarea (call when content or styles change)
   */
  invalidateCache(textarea: HTMLTextAreaElement): void {
    const cache = this._mirrorCache.get(textarea);
    if (cache) {
      cache.positionCache.clear();
      cache.lastValue = '';
    }
  }

  /**
   * Clean up mirror div for a textarea
   * Call when textarea is removed from DOM
   */
  cleanup(textarea: HTMLTextAreaElement): void {
    const cache = this._mirrorCache.get(textarea);
    if (cache) {
      cache.mirror.remove();
      this._mirrorCache.delete(textarea);
    }
  }

  /**
   * Force style sync (call after font changes, zoom, etc.)
   */
  syncStyles(textarea: HTMLTextAreaElement): void {
    const cache = this._mirrorCache.get(textarea);
    if (cache) {
      this._syncMirrorStyles(textarea, cache.mirror);
      cache.positionCache.clear();
      cache.lastValue = '';
    }
  }
}

// Export singleton instance
export const mirrorDivService = new MirrorDivService();
export default MirrorDivService;
