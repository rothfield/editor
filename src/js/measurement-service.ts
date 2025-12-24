/**
 * Measurement Service for Music Notation Editor
 *
 * Handles DOM-based width measurements for cells, characters, and lyrics.
 * Uses caching to optimize performance and avoid redundant measurements.
 */

import { BASE_FONT_SIZE } from './constants.js';
import logger, { LOG_CATEGORIES } from './logger.js';

interface DocumentLine {
  lyrics?: string;
  cells: Cell[];
}

interface Cell {
  col: number;
  char: string;
  kind?: { name: string };
}

interface Document {
  lines: DocumentLine[];
}

interface CharacterData {
  cellIndex: number;
  cellCol: number;
  glyph: string;
  charWidths: number[];
}

interface FontConfig {
  systems?: Array<{
    system_name: string;
    pua_base: number;
    char_count: number;
    variants_per_character: number;
    total_glyphs: number;
  }>;
  symbols?: Array<{
    name: string;
    codepoint: number;
    label: string;
  }>;
}

interface WASMModule {
  getFontConfig: () => FontConfig;
}

class MeasurementService {
  private cachedSyllableWidths: number[] = [];

  /**
   * Measure syllable widths for the document
   * Cell widths come from global glyph cache initialized at startup
   */
  measureAllWidths(doc: Document): { syllableWidths: number[] } {
    const syllableWidths: number[] = [];

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
        const lyricFontSize = BASE_FONT_SIZE * 0.5;

        // Combine syllables with following spaces
        let i = 0;
        while (i < syllables.length) {
          let text = syllables[i];
          i++;

          // Append any following spaces
          while (i < syllables.length && !syllables[i].trim()) {
            text += '\u00A0';
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
   */
  measureCharacterWidths(doc: Document): CharacterData[] {
    const characterData: CharacterData[] = [];

    // Create temporary invisible container for measurements
    const temp = document.createElement('div');
    temp.style.cssText = 'position:absolute; left:-9999px; visibility:hidden; pointer-events:none;';
    document.body.appendChild(temp);

    // OPTIMIZATION: Batch all spans first, then measure
    const cellMetadata: Array<{
      cellIndex: number;
      cellCol: number;
      glyph: string;
      charWidths: number[];
      spans: HTMLSpanElement[];
    }> = [];

    let cellIndex = 0;
    for (const line of doc.lines) {
      for (const cell of line.cells) {
        const charWidths: number[] = [];
        const spans: HTMLSpanElement[] = [];
        const cellClass = 'char-cell';

        for (const char of cell.char) {
          const span = document.createElement('span');
          span.className = cellClass;
          span.textContent = char === ' ' ? '\u00A0' : char;

          temp.appendChild(span);
          spans.push(span);
          charWidths.push(0);
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
   */
  extractSyllablesSimple(lyrics: string): string[] {
    if (!lyrics) return [];

    const syllables: string[] = [];
    let currentWord = '';

    for (let i = 0; i < lyrics.length; i++) {
      const char = lyrics[i];

      if (/\s/.test(char)) {
        if (currentWord) {
          this.addSyllablesFromWord(currentWord, syllables);
          currentWord = '';
        }
        syllables.push(char);
      } else if (char === '-') {
        if (currentWord) {
          syllables.push(currentWord + '-');
          currentWord = '';
        }
      } else {
        currentWord += char;
      }
    }

    if (currentWord) {
      this.addSyllablesFromWord(currentWord, syllables);
    }

    return syllables;
  }

  /**
   * Helper to add syllables from a word
   */
  private addSyllablesFromWord(word: string, syllables: string[]): void {
    const parts = word.split(/(-)/);
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (part === '') continue;

      if (part === '-') {
        continue;
      } else if (i < parts.length - 1 && parts[i + 1] === '-') {
        syllables.push(part + '-');
        i++;
      } else {
        syllables.push(part);
      }
    }
  }

  /**
   * Wait for NotationFont to be truly loaded in the rendering engine
   */
  async waitForFontLoad(): Promise<boolean> {
    const fontSpec = `${BASE_FONT_SIZE}px NotationFont`;

    let attempts = 0;
    const maxAttempts = 50;

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
   */
  async measureAllNotationFontGlyphs(wasmModule: WASMModule): Promise<Record<string, number>> {
    logger.info(LOG_CATEGORIES.RENDERER, 'Measuring all NotationFont glyphs...');

    if (!wasmModule || typeof wasmModule.getFontConfig !== 'function') {
      logger.error(LOG_CATEGORIES.RENDERER, 'WASM module or getFontConfig() not available');
      return {};
    }

    await this.waitForFontLoad();

    const fontConfig = wasmModule.getFontConfig();
    logger.debug(LOG_CATEGORIES.RENDERER, `Font config retrieved from WASM`);

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    ctx.font = `${BASE_FONT_SIZE}px NotationFont`;

    const cache: Record<string, number> = {};
    let glyphCount = 0;

    const measureCodePoint = (codepoint: number) => {
      const char = String.fromCodePoint(codepoint);
      if (cache[char] !== undefined) return;
      const width = ctx.measureText(char).width;
      cache[char] = width;
      glyphCount++;
    };

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

    if (fontConfig.symbols && Array.isArray(fontConfig.symbols)) {
      for (const symbol of fontConfig.symbols) {
        if (symbol.codepoint) {
          measureCodePoint(symbol.codepoint);
        }
      }
    }

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
  clearCache(): void {
    this.cachedSyllableWidths = [];

    logger.debug(LOG_CATEGORIES.RENDERER, 'Measurement cache cleared');
  }
}

export default MeasurementService;
