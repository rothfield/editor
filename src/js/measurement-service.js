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
    // Measurement caching
    this.cachedCellWidths = [];
    this.cachedSyllableWidths = [];
    this.cachedCharWidths = [];
    this.lastDocumentCellCount = 0;
  }

  /**
   * Get the composite glyph character for measuring (replicates Rust logic)
   * @param {string} baseChar - Base character (e.g., '1' from "1#")
   * @param {string} pitchCode - Serialized PitchCode string (e.g., "N1s", "N2b")
   * @returns {string} - Single character to measure
   */
  getCompositeGlyphChar(baseChar, pitchCode) {
    if (!pitchCode || typeof pitchCode !== 'string') {
      return baseChar;
    }

    // Detect accidental type from serialized PitchCode string
    // "N1s" → Sharp, "N2b" → Flat, "N1ss" → DoubleSharp, "N1bb" → DoubleFl flat
    let accTypeNum = 0;
    if (pitchCode.endsWith('ss')) {
      accTypeNum = 3; // DoubleSharp
    } else if (pitchCode.endsWith('bb')) {
      accTypeNum = 4; // DoubleFlat
    } else if (pitchCode.endsWith('s')) {
      accTypeNum = 1; // Sharp
    } else if (pitchCode.endsWith('b')) {
      accTypeNum = 2; // Flat
    }

    if (accTypeNum === 0) {
      return baseChar; // Natural, no composite glyph
    }

    // Character order from atoms.yaml (ALL_CHARS constant)
    const charOrder = '1234567CDEFGABcdefgabSrRgGmMPdDnNdrmfsltDRMFSLT';
    const charIndex = charOrder.indexOf(baseChar);

    if (charIndex === -1) {
      return baseChar; // Unknown character
    }

    // Calculate codepoint (same formula as Rust)
    const baseCodepoints = {
      1: 0xE1F0,  // Sharp
      2: 0xE220,  // Flat
      3: 0xE250,  // Double sharp
      4: 0xE280   // Double flat
    };

    const codepoint = baseCodepoints[accTypeNum] + charIndex;
    return String.fromCodePoint(codepoint);
  }

  /**
   * Measure all cell widths and syllable widths for the document
   * Uses caching to avoid re-measuring unchanged cells
   *
   * @param {Object} doc - The document to measure
   * @returns {Object} {cellWidths: number[], syllableWidths: number[]}
   */
  measureAllWidths(doc) {
    const cellWidths = [];
    const syllableWidths = [];

    // Calculate total cell count
    let totalCells = 0;
    for (const line of doc.lines) {
      totalCells += line.cells.length;
    }

    // Check if we can reuse cached measurements
    const canUseCache = (
      this.cachedCellWidths.length === totalCells &&
      this.lastDocumentCellCount === totalCells
    );

    if (canUseCache) {
      logger.debug(LOG_CATEGORIES.RENDERER, 'Using cached cell widths', { cells: totalCells });
      return {
        cellWidths: [...this.cachedCellWidths], // Return copy
        syllableWidths: [...this.cachedSyllableWidths] // Return cached syllable widths
      };
    }

    logger.debug(LOG_CATEGORIES.RENDERER, 'Measuring cells (cache miss)', { cells: totalCells });

    // Create temporary invisible container for measurements
    const temp = document.createElement('div');
    temp.style.cssText = 'position:absolute; left:-9999px; visibility:hidden; pointer-events:none;';
    document.body.appendChild(temp);

    // OPTIMIZATION: Batch DOM operations to avoid forced layouts
    // First pass: Create all spans and add to DOM
    const spans = [];

    for (const line of doc.lines) {
      for (const cell of line.cells) {
        const span = document.createElement('span');
        span.className = 'char-cell';

        // For pitched elements with accidentals, measure the composite glyph
        // instead of the typed text (e.g., measure U+E1F0 instead of "1#")
        let charToMeasure = cell.char;
        if (cell.kind && cell.kind.name === 'pitched_element' && cell.pitch_code) {
          const baseChar = cell.char.charAt(0);
          const compositeGlyph = this.getCompositeGlyphChar(baseChar, cell.pitch_code);
          if (compositeGlyph !== baseChar) {
            // Cell has accidental, measure composite glyph
            charToMeasure = compositeGlyph;
          }
        }

        span.textContent = charToMeasure;

        // Apply fonts based on cell kind
        if (cell.kind && cell.kind.name === 'text') {
          // Text cells use system fonts at reduced size
          span.style.fontSize = `${BASE_FONT_SIZE * 0.6}px`; // 19.2px
          span.style.fontFamily = "'Segoe UI', 'Helvetica Neue', system-ui, sans-serif";
        } else if (cell.kind && (cell.kind.name === 'pitched_element' || cell.kind.name === 'unpitched_element')) {
          // Pitch and dash cells always use NotationFont (from Noto Music)
          span.style.fontFamily = "'NotationFont'";
        } else if (cell.kind && cell.kind.name === 'whitespace') {
          // Whitespace cells use NotationFont for consistent spacing with other glyphs
          span.style.fontFamily = "'NotationFont'";
        }

        temp.appendChild(span);
        spans.push(span);
        cellWidths.push(0); // Placeholder, will measure next
      }
    }

    // Second pass: Measure all at once (single layout pass)
    for (let i = 0; i < spans.length; i++) {
      if (spans[i] !== null) {
        cellWidths[i] = spans[i].getBoundingClientRect().width;
      }
    }

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
    this.cachedCellWidths = [...cellWidths];
    this.cachedSyllableWidths = [...syllableWidths];
    this.lastDocumentCellCount = totalCells;

    return { cellWidths, syllableWidths };
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
        // Cache the kind check once per cell (not per character!)
        const isTextCell = cell.kind && cell.kind.name === 'text';
        const fontSize = isTextCell ? `${BASE_FONT_SIZE * 0.6}px` : null;
        const fontFamily = isTextCell ? "'Segoe UI', 'Helvetica Neue', system-ui, sans-serif" : null;

        for (const char of cell.char) {
          const span = document.createElement('span');
          span.className = 'char-cell';
          span.textContent = char === ' ' ? '\u00A0' : char;

          // Apply proportional font and reduced size if this is a text cell
          if (fontSize) {
            span.style.fontSize = fontSize;
          }
          if (fontFamily) {
            span.style.fontFamily = fontFamily;
          }

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
   * Clear measurement caches
   */
  clearCache() {
    this.cachedCellWidths = [];
    this.cachedSyllableWidths = [];
    this.cachedCharWidths = [];
    this.lastDocumentCellCount = 0;

    logger.debug(LOG_CATEGORIES.RENDERER, 'Measurement cache cleared');
  }
}

export default MeasurementService;
