/**
 * Measurement Service for Music Notation Editor
 *
 * Handles DOM-based width measurements for cells, characters, and lyrics.
 * Uses caching to optimize performance and avoid redundant measurements.
 */

import { BASE_FONT_SIZE } from './constants.js';
import logger, { LOG_CATEGORIES } from './logger.js';

class MeasurementService {
  constructor() {
    // Measurement caching (only syllables are cached, cells come from global glyph cache)
    this.cachedSyllableWidths = [];
  }

  /**
   * Measure syllable widths for the document
   * Cell widths come from global glyph cache initialized at startup
   *
   * @param {Object} doc - The document to measure
   * @returns {Object} {syllableWidths: number[]}
   */
  measureAllWidths(doc) {
    const syllableWidths = [];

    // CACHE DISABLED: Always re-measure syllables (they are dynamic/user-editable)
    const canUseCache = false;

    if (canUseCache) {
      logger.debug(LOG_CATEGORIES.RENDERER, 'Using cached syllable widths');
      return {
        syllableWidths: [...this.cachedSyllableWidths]
      };
    }

    logger.debug(LOG_CATEGORIES.RENDERER, 'Measuring syllables');

    // Create temporary invisible container for measurements
    const temp = document.createElement('div');
    temp.style.cssText = 'position:absolute; left:-9999px; visibility:hidden; pointer-events:none;';
    document.body.appendChild(temp);

    // Measure lyrics syllables ACROSS ALL LINES
    for (const line of doc.lines) {
      if (line.lyrics && line.lyrics.trim()) {
        const syllables = this.extractSyllablesSimple(line.lyrics);
        const lyricFontSize = BASE_FONT_SIZE * 0.5; // Match actual rendering (8px)

        // Combine syllables with following spaces
        let i = 0;
        while (i < syllables.length) {
          let text = syllables[i];
          i++;

          // Append any following spaces
          while (i < syllables.length && !syllables[i].trim()) {
            text += '\u00A0'; // Append nbsp
            i++;
          }

          // Measure the combined text
          const span = document.createElement('span');
          span.style.cssText = `
            font-size: ${lyricFontSize}px;
            font-family: 'Segoe UI', 'Helvetica Neue', system-ui, sans-serif;
            font-style: italic;
          `;
          span.textContent = text;
          temp.appendChild(span);
          syllableWidths.push(span.getBoundingClientRect().width);
          temp.removeChild(span);
        }
      }
    }

    document.body.removeChild(temp);

    // Cache the measurements
    this.cachedSyllableWidths = [...syllableWidths];

    return { syllableWidths };
  }

  /**
   * Measure character widths within each cell for accurate cursor positioning
   * Returns array of {cellIndex, charWidths:[]} for all cells in the document
   *
   * @param {Object} doc - The document to measure
   * @returns {Array} Array of character width data per cell
   */
  measureCharacterWidths(doc) {
    const characterData = [];

    // Create temporary invisible container for measurements
    const temp = document.createElement('div');
    temp.style.cssText = 'position:absolute; left:-9999px; visibility:hidden; pointer-events:none;';
    document.body.appendChild(temp);

    // OPTIMIZATION: Batch all spans first, then measure
    const allSpans = [];
    const cellMetadata = [];

    let cellIndex = 0;
    for (const line of doc.lines) {
      for (const cell of line.cells) {
        const charWidths = [];
        const spans = [];

        // Measure each character in the cell's glyph
        // DISABLED: All cells now use same font/class (NotationFont at 32px)
        /* const isTextCell = cell.kind && cell.kind.name === 'text';
        const cellClass = isTextCell ? 'char-cell kind-text' : 'char-cell'; */
        const cellClass = 'char-cell'; // All cells use same class

        for (const char of cell.char) {
          const span = document.createElement('span');
          span.className = cellClass;  // CSS will apply correct font-family
          span.textContent = char === ' ' ? '\u00A0' : char;

          // No inline styles needed - CSS handles font-family via classes
          temp.appendChild(span);
          spans.push(span);
          charWidths.push(0); // Placeholder
        }

        cellMetadata.push({
          cellIndex,
          cellCol: cell.col,
          glyph: cell.char,
          charWidths,
          spans
        });

        cellIndex++;
      }
    }

    // Measure all spans at once (single layout pass)
    for (const meta of cellMetadata) {
      for (let i = 0; i < meta.spans.length; i++) {
        if (meta.spans[i] !== null) {
          meta.charWidths[i] = meta.spans[i].getBoundingClientRect().width;
        }
      }

      // Add to final result (without spans)
      characterData.push({
        cellIndex: meta.cellIndex,
        cellCol: meta.cellCol,
        glyph: meta.glyph,
        charWidths: meta.charWidths
      });
    }

    document.body.removeChild(temp);

    return characterData;
  }

  /**
   * Extract syllables from lyrics string (simple version for measurement)
   * Splits on whitespace and hyphens, PRESERVING spaces
   *
   * @param {string} lyrics - Lyrics string
   * @returns {string[]} Array of syllables
   */
  extractSyllablesSimple(lyrics) {
    if (!lyrics) return [];

    const syllables = [];
    let currentWord = '';

    for (let i = 0; i < lyrics.length; i++) {
      const char = lyrics[i];

      if (/\s/.test(char)) {
        // Whitespace - finish current word and add space
        if (currentWord) {
          this.addSyllablesFromWord(currentWord, syllables);
          currentWord = '';
        }
        syllables.push(char); // Add the space character
      } else if (char === '-') {
        // Hyphen - add current part with hyphen
        if (currentWord) {
          syllables.push(currentWord + '-');
          currentWord = '';
        }
      } else {
        // Regular character
        currentWord += char;
      }
    }

    // Add remaining word
    if (currentWord) {
      this.addSyllablesFromWord(currentWord, syllables);
    }

    return syllables;
  }

  /**
   * Helper to add syllables from a word (handles hyphens within word)
   * @private
   */
  addSyllablesFromWord(word, syllables) {
    const parts = word.split(/(-)/);
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (part === '') continue;

      if (part === '-') {
        // Skip standalone hyphens, they're handled in main loop
        continue;
      } else if (i < parts.length - 1 && parts[i + 1] === '-') {
        syllables.push(part + '-');
        i++; // Skip the hyphen
      } else {
        syllables.push(part);
      }
    }
  }

  /**
   * Wait for NotationFont to be truly loaded in the rendering engine
   * Polls until a test PUA glyph returns the correct width
   *
   * @returns {Promise<boolean>} True if font loaded, false if timeout
   */
  async waitForFontLoad() {
    // Font is loaded via FontFace API in editor.js before this is called
    // Just verify it's available using browser's native check
    const fontSpec = `${BASE_FONT_SIZE}px NotationFont`;

    let attempts = 0;
    const maxAttempts = 50; // 5 seconds max

    while (attempts < maxAttempts) {
      if (document.fonts.check(fontSpec)) {
        logger.info(LOG_CATEGORIES.RENDERER, `NotationFont ready after ${attempts * 100}ms`);
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }

    logger.warn(LOG_CATEGORIES.RENDERER, 'NotationFont load timeout - proceeding anyway');
    return false;
  }

  /**
   * Measure all NotationFont glyphs and return width cache
   *
   * This function should be called once at startup to populate the global
   * glyph width cache in WASM. It measures all 300+ glyphs in the NotationFont
   * including base characters, octave variants, accidentals, and symbols.
   *
   * @param {Object} wasmModule - WASM module with getFontConfig() function
   * @returns {Promise<Object>} Map of glyph character → width in CSS pixels
   */
  async measureAllNotationFontGlyphs(wasmModule) {
    logger.info(LOG_CATEGORIES.RENDERER, 'Measuring all NotationFont glyphs...');

    if (!wasmModule || typeof wasmModule.getFontConfig !== 'function') {
      logger.error(LOG_CATEGORIES.RENDERER, 'WASM module or getFontConfig() not available');
      return {};
    }

    // CHROMIUM FIX: Wait for font to actually load before measuring
    await this.waitForFontLoad();

    // Get font configuration from WASM
    const fontConfig = wasmModule.getFontConfig();
    logger.debug(LOG_CATEGORIES.RENDERER, `Font config retrieved from WASM`);

    // Create canvas for text measurement
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.font = `${BASE_FONT_SIZE}px NotationFont`;

    const cache = {};
    let glyphCount = 0;

    // Helper to measure and cache a glyph by code point
    const measureCodePoint = (codepoint) => {
      const char = String.fromCodePoint(codepoint);
      if (cache[char] !== undefined) return; // Skip if already cached
      const width = ctx.measureText(char).width;
      cache[char] = width;
      glyphCount++;
    };

    // Measure all glyphs from pitch systems
    // Each system has: pua_base, char_count, variants_per_character
    // Formula: codepoint = pua_base + (char_index * variants_per_character) + variant_index
    if (fontConfig.systems && Array.isArray(fontConfig.systems)) {
      for (const system of fontConfig.systems) {
        const { pua_base, char_count, variants_per_character } = system;

        for (let charIdx = 0; charIdx < char_count; charIdx++) {
          for (let variantIdx = 0; variantIdx < variants_per_character; variantIdx++) {
            const codepoint = pua_base + (charIdx * variants_per_character) + variantIdx;
            measureCodePoint(codepoint);
          }
        }
      }
    }

    // Measure symbols (barlines, ornaments, etc.)
    if (fontConfig.symbols && Array.isArray(fontConfig.symbols)) {
      for (const symbol of fontConfig.symbols) {
        if (symbol.codepoint) {
          measureCodePoint(symbol.codepoint);
        }
      }
    }

    // Measure ALL ASCII characters (0-127) for text cells
    // This includes A-Z, a-z, 0-9, punctuation, and special characters
    logger.debug(LOG_CATEGORIES.RENDERER, 'Measuring ASCII characters (0-127)...');
    for (let codepoint = 0; codepoint <= 127; codepoint++) {
      measureCodePoint(codepoint);
    }

    logger.info(LOG_CATEGORIES.RENDERER, `Measured ${glyphCount} glyphs from NotationFont (including ASCII 0-127)`);

    return cache;
  }

  /**
   * Clear measurement caches
   */
  clearCache() {
    this.cachedSyllableWidths = [];

    logger.debug(LOG_CATEGORIES.RENDERER, 'Measurement cache cleared');
  }
}

export default MeasurementService;
