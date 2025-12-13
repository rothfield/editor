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

/**
 * @typedef {Object} CharPosition
 * @property {number} x - X position relative to textarea content
 * @property {number} y - Y position relative to textarea content
 */

/**
 * @typedef {Object} MirrorCache
 * @property {HTMLDivElement} mirror - The mirror div element
 * @property {HTMLTextAreaElement} textarea - The associated textarea
 * @property {string} lastValue - Last measured value (for caching)
 * @property {Map<number, CharPosition>} positionCache - Cached positions
 */

class MirrorDivService {
  constructor() {
    /** @type {WeakMap<HTMLTextAreaElement, MirrorCache>} */
    this._mirrorCache = new WeakMap();

    /** @type {string[]} - CSS properties to copy from textarea to mirror */
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
   * @param {HTMLTextAreaElement} textarea
   * @returns {MirrorCache}
   */
  _getOrCreateMirror(textarea) {
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
   * @param {HTMLTextAreaElement} textarea
   * @param {HTMLDivElement} mirror
   */
  _syncMirrorStyles(textarea, mirror) {
    const computed = getComputedStyle(textarea);

    for (const prop of this._stylesToCopy) {
      mirror.style.setProperty(prop, computed.getPropertyValue(prop));
    }
  }

  /**
   * Get pixel position for a character index in a textarea
   * @param {HTMLTextAreaElement} textarea
   * @param {number} charIndex
   * @returns {CharPosition}
   */
  getCharacterPosition(textarea, charIndex) {
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
    if (cache.positionCache.has(charIndex)) {
      return cache.positionCache.get(charIndex);
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

    const pos = {
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
   * @param {HTMLTextAreaElement} textarea
   * @param {number[]} indices - Character indices to measure
   * @returns {Map<number, CharPosition>}
   */
  getCharacterPositions(textarea, indices) {
    const cache = this._getOrCreateMirror(textarea);
    const text = textarea.value;

    // Invalidate cache if text changed
    if (cache.lastValue !== text) {
      cache.positionCache.clear();
      cache.lastValue = text;
      this._syncMirrorStyles(textarea, cache.mirror);
    }

    const results = new Map();
    const uncachedIndices = [];

    // Check cache for existing positions
    for (const idx of indices) {
      if (cache.positionCache.has(idx)) {
        results.set(idx, cache.positionCache.get(idx));
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

      const pos = {
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
   * @param {HTMLTextAreaElement} textarea
   */
  invalidateCache(textarea) {
    const cache = this._mirrorCache.get(textarea);
    if (cache) {
      cache.positionCache.clear();
      cache.lastValue = '';
    }
  }

  /**
   * Clean up mirror div for a textarea
   * Call when textarea is removed from DOM
   * @param {HTMLTextAreaElement} textarea
   */
  cleanup(textarea) {
    const cache = this._mirrorCache.get(textarea);
    if (cache) {
      cache.mirror.remove();
      this._mirrorCache.delete(textarea);
    }
  }

  /**
   * Force style sync (call after font changes, zoom, etc.)
   * @param {HTMLTextAreaElement} textarea
   */
  syncStyles(textarea) {
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
