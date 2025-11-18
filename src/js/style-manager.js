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
  }

  /**
   * Initialize all styles (call once on editor startup)
   */
  initialize() {
    this.injectBaseStyles();
    // Note: Barline CSS injection removed - barlines now render as Unicode characters directly
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
      /* NOTE: System-specific font loading is currently NOT USED.
         Full NotationFont is loaded via @font-face in index.html instead.
         The following @font-face declaration is commented out: */
      /*
      @font-face {
        font-family: 'NotationFont';
        src: url('/dist/fonts/NotationFont-Number.woff2') format('woff2');
        font-weight: normal;
        font-style: normal;
        font-display: swap;
      }
      */

      /* ===== GLOBAL FONT SETTINGS ===== */
      /* Apply NotationFont to entire editor - all cells inherit this */
      #notation-editor {
        font-family: 'NotationFont', monospace;
        font-size: ${BASE_FONT_SIZE}px;
      }

      /* Base cell styles */
      .char-cell {
        padding: 0;
        margin: 0;
        box-sizing: content-box;
        /* Font inherited from #editor-root - no need to specify here */
      }

      /* Pitched elements use normal weight */
      .char-cell.kind-pitched {
        font-weight: normal;
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

      /* DISABLED: Text cells now use same font as pitches (NotationFont at 32px) */
      /* Text cells override with proportional font */
      /* .char-cell.kind-text,
      .lyric {
        font-family: 'Segoe UI', 'Helvetica Neue', system-ui, sans-serif;
        font-size: ${BASE_FONT_SIZE * 0.6}px;
      } */

      /* REMOVED: All barline CSS overlays - barlines now render as Unicode characters directly */

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
   * Cleanup - remove injected styles
   */
  cleanup() {
    if (this.baseStyleElement) {
      this.baseStyleElement.remove();
      this.baseStyleElement = null;
    }

    logger.debug(LOG_CATEGORIES.RENDERER, 'Styles cleaned up');
  }
}

export default StyleManager;
