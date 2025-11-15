/**
 * Style Manager for Music Notation Editor
 *
 * Handles CSS injection for:
 * - Web fonts (NotationFont)
 * - Cell styling (pitched elements, symbols)
 * - Accidental rendering (composite glyphs via CSS overlay)
 * - Barline styles (dynamic from font mapping)
 * - Octave dots (embedded in font glyphs)
 * - Current line highlighting
 */

import {
  BASE_FONT_SIZE,
  SMUFL_FONT_SIZE
} from './constants.js';
import logger, { LOG_CATEGORIES } from './logger.js';

class StyleManager {
  constructor(options = {}) {
    this.options = {
      fontMapping: options.fontMapping || null,
      ...options
    };

    this.baseStyleElement = null;
    this.barlineStyleElement = null;
  }

  /**
   * Initialize all styles (call once on editor startup)
   */
  initialize() {
    this.injectBaseStyles();
    this.injectBarlineStyles();
  }

  /**
   * Inject base CSS styles for notation rendering
   */
  injectBaseStyles() {
    if (this.baseStyleElement) {
      logger.warn(LOG_CATEGORIES.RENDERER, 'Base styles already injected');
      return;
    }

    const style = document.createElement('style');
    style.textContent = `
      /* ===== WEB FONTS ===== */
      /* Load NotationFont (derived from Noto Music) for all pitch + music symbols */
      @font-face {
        font-family: 'NotationFont';
        src: url('/static/fonts/NotationFont.ttf?v=${Date.now()}') format('truetype');
        font-weight: normal;
        font-style: normal;
      }

      /* Base cell styles */
      .char-cell {
        padding: 0;
        margin: 0;
        box-sizing: content-box;
        font-size: ${BASE_FONT_SIZE}px;
      }

      /* Symbol elements styled in green */
      .char-cell.kind-symbol {
        color: #22c55e; /* green-500 */
        font-weight: 500;
      }

      /* ===== ACCIDENTAL RENDERING (WASM-FIRST ARCHITECTURE) ===== */
      /* Architecture: DOM contains typed text (textual truth), CSS overlay shows composite glyph (visual rendering)
         See CLAUDE.md "Multi-Character Glyph Rendering: Textual Mental Model with Visual Overlays"
      */

      /* Pitched elements: rendered with pre-composed accidental glyphs from NotationFont */
      .char-cell.kind-pitched {
        font-family: 'NotationFont', monospace;
      }

      /* All barline overlays using SMuFL music font */
      /* Hide underlying ASCII text and show fancy glyph overlay */
      .char-cell.repeat-left-start,
      .char-cell.repeat-right-start,
      .char-cell.double-bar-start,
      .char-cell.single-bar {
        color: transparent;
      }

      /* Base styles for all SMuFL barline glyphs */
      /* Using NotationFont (derived from Noto Music) which includes barline glyphs */
      .char-cell.repeat-left-start::after,
      .char-cell.repeat-right-start::after,
      .char-cell.double-bar-start::after,
      .char-cell.single-bar::after {
        font-family: 'NotationFont';
        position: absolute;
        left: 0;
        top: ${BASE_FONT_SIZE * 0.75}px;
        transform: translateY(-50%);
        color: #000;
        font-size: ${SMUFL_FONT_SIZE * 1.2}px;
        line-height: 1;
        pointer-events: none;
        z-index: 4;
      }

      /* Barline styles generated from font mapping */

      /* Current line border */
      .notation-line.current-line {
        outline: 2px solid #3b82f6; /* blue-500 */
        outline-offset: -2px;
        border-radius: 4px;
        background-color: rgba(59, 130, 246, 0.05); /* very subtle blue tint */
      }

    `;

    document.head.appendChild(style);
    this.baseStyleElement = style;

    logger.debug(LOG_CATEGORIES.RENDERER, 'Base styles injected');
  }

  /**
   * Inject barline CSS generated from font mapping (single source of truth)
   */
  injectBarlineStyles() {
    if (this.barlineStyleElement) {
      // Remove old styles before re-injecting
      this.barlineStyleElement.remove();
      this.barlineStyleElement = null;
    }

    const mapping = this.options.fontMapping;
    if (!mapping || !mapping.symbols) {
      logger.warn(LOG_CATEGORIES.RENDERER, 'Font mapping not available, using fallback barline styles');
      return;
    }

    // Find barline symbols in mapping
    const barlineSymbols = {
      'barlineSingle': { selector: '.char-cell.single-bar', width: '100%', align: 'center' },
      'barlineDouble': { selector: '.char-cell.double-bar-start', width: '200%', align: 'left' },
      'barlineRepeatLeft': { selector: '.char-cell.repeat-left-start', width: '200%', align: 'left' },
      'barlineRepeatRight': { selector: '.char-cell.repeat-right-start', width: '200%', align: 'left' },
      'barlineRepeatBoth': { selector: '.char-cell.repeat-both', width: '200%', align: 'left' }
    };

    let barlineCss = '';
    for (const [symbolName, config] of Object.entries(barlineSymbols)) {
      const symbol = mapping.symbols.find(s => s.name === symbolName);
      if (symbol) {
        // Get codepoint and convert to CSS Unicode escape sequence
        const codepoint = parseInt(symbol.codepoint, 16);
        // CSS Unicode escapes: pad to 6 chars for > 0xFFFF, 4 for < 0xFFFF
        const minPad = codepoint > 0xFFFF ? 6 : 4;
        const codePointHex = codepoint.toString(16).toUpperCase().padStart(minPad, '0');

        barlineCss += `
      /* ${symbolName}: U+${codePointHex} from NotationFont-map.json */
      ${config.selector}::after {
        content: '\\${codePointHex}';
        width: ${config.width};
        text-align: ${config.align};
      }
      `;

        logger.debug(LOG_CATEGORIES.RENDERER, `Barline style: ${symbolName} -> U+${codePointHex}`);
      } else {
        logger.warn(LOG_CATEGORIES.RENDERER, `Symbol ${symbolName} not found in font mapping`);
      }
    }

    if (barlineCss) {
      const style = document.createElement('style');
      style.textContent = barlineCss;
      document.head.appendChild(style);
      this.barlineStyleElement = style;

      logger.debug(LOG_CATEGORIES.RENDERER, 'Barline styles injected from font mapping');
    }
  }

  /**
   * Update font mapping and re-inject barline styles
   * @param {Object} fontMapping - New font mapping from WASM
   */
  updateFontMapping(fontMapping) {
    this.options.fontMapping = fontMapping;
    this.injectBarlineStyles();
  }

  /**
   * Cleanup - remove injected styles
   */
  cleanup() {
    if (this.baseStyleElement) {
      this.baseStyleElement.remove();
      this.baseStyleElement = null;
    }
    if (this.barlineStyleElement) {
      this.barlineStyleElement.remove();
      this.barlineStyleElement = null;
    }

    logger.debug(LOG_CATEGORIES.RENDERER, 'Styles cleaned up');
  }
}

export default StyleManager;
