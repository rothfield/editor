/**
 * Text Input Handler
 *
 * Handles text input, parsing, insertion, and deletion operations
 * for the Music Notation Editor.
 */

import { NOTATION_PATTERNS } from './constants.js';
import logger, { LOG_CATEGORIES } from './logger.js';

/**
 * Handles text input and notation parsing
 */
class TextInputHandler {
  constructor(wasmModule, document) {
    this.wasmModule = wasmModule;
    this.document = document;
    this.pitchSystem = 1; // Default to number system
  }

  /**
   * Set current pitch system
   *
   * @param {number} system - Pitch system (1=number, 2=western, 3=sargam)
   */
  setPitchSystem(system) {
    this.pitchSystem = system;
    logger.info(LOG_CATEGORIES.PARSER, `Pitch system set to: ${system}`);
  }

  /**
   * Get current pitch system
   *
   * @returns {number} Current pitch system
   */
  getPitchSystem() {
    return this.pitchSystem;
  }

  /**
   * Insert text at cursor position
   *
   * @param {string} text - Text to insert
   * @param {number} cursorPos - Current cursor position
   * @returns {Object} Result with updated cells and new cursor position
   */
  insertText(text, cursorPos) {
    if (!this.document || !this.document.lines || this.document.lines.length === 0) {
      throw new Error('No document available for text insertion');
    }

    logger.time('insertText', LOG_CATEGORIES.PARSER);

    const line = this.document.lines[0];
    let cells = line.cells || [];
    let currentPos = cursorPos;

    try {
      // Insert each character
      for (const char of text) {
        const lengthBefore = cells.length;

        logger.debug(LOG_CATEGORIES.PARSER, `Inserting char '${char}'`, {
          position: currentPos,
          cellCount: lengthBefore
        });

        // Call WASM to insert character
        cells = this.wasmModule.insertCharacter(
          cells,
          char,
          currentPos,
          this.pitchSystem
        );

        const lengthAfter = cells.length;
        const cellDelta = lengthAfter - lengthBefore;

        currentPos += cellDelta;

        logger.trace(LOG_CATEGORIES.PARSER, `Cell delta: ${cellDelta}`);
      }

      // Update line cells
      line.cells = cells;

      logger.timeEnd('insertText', LOG_CATEGORIES.PARSER);

      return {
        cells,
        newCursorPos: currentPos,
        cellsAdded: currentPos - cursorPos
      };
    } catch (error) {
      logger.error(LOG_CATEGORIES.PARSER, 'Text insertion failed', {
        error: error.message,
        text,
        cursorPos
      });
      throw new Error(`Text insertion failed: ${error.message}`);
    }
  }

  /**
   * Delete character at position
   *
   * @param {number} position - Position to delete from
   * @returns {Object} Result with updated cells
   */
  deleteCharacter(position) {
    if (!this.document || !this.document.lines || this.document.lines.length === 0) {
      throw new Error('No document available for deletion');
    }

    const line = this.document.lines[0];
    let cells = line.cells || [];

    try {
      if (position <= 0 || position > cells.length) {
        logger.warn(LOG_CATEGORIES.PARSER, 'Invalid delete position', { position });
        return { cells, deleted: false };
      }

      logger.debug(LOG_CATEGORIES.PARSER, `Deleting character at position ${position}`);

      // Call WASM to delete character
      cells = this.wasmModule.deleteCharacter(cells, position);

      // Update line cells
      line.cells = cells;

      return {
        cells,
        deleted: true
      };
    } catch (error) {
      logger.error(LOG_CATEGORIES.PARSER, 'Character deletion failed', {
        error: error.message,
        position
      });
      throw new Error(`Character deletion failed: ${error.message}`);
    }
  }

  /**
   * Parse complete text into cells
   *
   * @param {string} text - Text to parse
   * @returns {Array} Array of cells
   */
  parseText(text) {
    if (!text || text.trim().length === 0) {
      return [];
    }

    try {
      // Validate notation
      if (!this.validateNotation(text)) {
        throw new Error('Invalid notation syntax');
      }

      logger.info(LOG_CATEGORIES.PARSER, 'Parsing text', {
        length: text.length,
        pitchSystem: this.pitchSystem
      });

      // Call WASM parser
      const cells = this.wasmModule.parseText(text, this.pitchSystem);

      logger.info(LOG_CATEGORIES.PARSER, `Parsed ${cells.length} cells from text`);

      return cells;
    } catch (error) {
      logger.error(LOG_CATEGORIES.PARSER, 'Text parsing failed', {
        error: error.message,
        text: text.substring(0, 50)
      });
      throw new Error(`Text parsing failed: ${error.message}`);
    }
  }

  /**
   * Validate notation syntax
   *
   * @param {string} text - Text to validate
   * @returns {boolean} True if valid
   */
  validateNotation(text) {
    if (!text || text.trim().length === 0) {
      return true; // Empty is valid
    }

    const cleanText = text.replace(/\s+/g, '');

    // Check against valid patterns
    const validPatterns = [
      NOTATION_PATTERNS.NUMBER_SYSTEM,
      NOTATION_PATTERNS.WESTERN_SYSTEM,
      NOTATION_PATTERNS.STRUCTURE_ELEMENTS
    ];

    const isValid = validPatterns.some(pattern => pattern.test(cleanText)) || cleanText.length === 0;

    if (!isValid) {
      logger.warn(LOG_CATEGORIES.PARSER, 'Invalid notation detected', {
        text: text.substring(0, 50)
      });
    }

    return isValid;
  }

  /**
   * Check if character is temporal (musical note)
   *
   * @param {string} char - Character to check
   * @returns {boolean} True if temporal
   */
  isTemporalChar(char) {
    return NOTATION_PATTERNS.TEMPORAL_CHARS.test(char);
  }

  /**
   * Check if character is an accidental
   *
   * @param {string} char - Character to check
   * @returns {boolean} True if accidental
   */
  isAccidental(char) {
    return NOTATION_PATTERNS.ACCIDENTALS.test(char);
  }

  /**
   * Check if character is a beat separator
   *
   * @param {string} char - Character to check
   * @returns {boolean} True if separator
   */
  isBeatSeparator(char) {
    return NOTATION_PATTERNS.BEAT_SEPARATORS.test(char);
  }

  /**
   * Extract temporal segments from text
   *
   * @param {string} text - Text to analyze
   * @returns {Array<string>} Array of temporal segments
   */
  extractTemporalSegments(text) {
    const segments = [];
    let currentSegment = '';
    let inBeat = false;

    for (const char of text) {
      if (this.isTemporalChar(char) || this.isAccidental(char)) {
        if (!inBeat) {
          if (currentSegment.trim()) {
            segments.push(currentSegment.trim());
          }
          currentSegment = char;
          inBeat = true;
        } else {
          currentSegment += char;
        }
      } else if (this.isBeatSeparator(char)) {
        if (currentSegment.trim()) {
          segments.push(currentSegment.trim());
        }
        currentSegment = '';
        inBeat = false;
      } else {
        if (currentSegment.trim()) {
          segments.push(currentSegment.trim());
        }
        currentSegment = char;
        inBeat = false;
      }
    }

    if (currentSegment.trim()) {
      segments.push(currentSegment.trim());
    }

    return segments.filter(s => s.length > 0);
  }

  /**
   * Apply octave marking to selection
   *
   * @param {number} startPos - Selection start
   * @param {number} endPos - Selection end
   * @param {number} octave - Octave value (-2 to 2)
   * @returns {Array} Updated cells
   */
  applyOctave(startPos, endPos, octave) {
    if (!this.document || !this.document.lines || this.document.lines.length === 0) {
      throw new Error('No document available');
    }

    const line = this.document.lines[0];
    let cells = line.cells || [];

    try {
      logger.info(LOG_CATEGORIES.COMMAND, `Applying octave ${octave} to selection`, {
        start: startPos,
        end: endPos
      });

      cells = this.wasmModule.applyOctave(cells, startPos, endPos, octave);
      line.cells = cells;

      return cells;
    } catch (error) {
      logger.error(LOG_CATEGORIES.COMMAND, 'Octave application failed', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Apply slur to selection
   *
   * @param {number} startPos - Selection start
   * @param {number} endPos - Selection end
   * @returns {Array} Updated cells
   */
  applySlur(startPos, endPos) {
    if (!this.document || !this.document.lines || this.document.lines.length === 0) {
      throw new Error('No document available');
    }

    const line = this.document.lines[0];
    let cells = line.cells || [];

    try {
      logger.info(LOG_CATEGORIES.COMMAND, 'Applying slur to selection', {
        start: startPos,
        end: endPos
      });

      cells = this.wasmModule.applySlur(cells, startPos, endPos);
      line.cells = cells;

      return cells;
    } catch (error) {
      logger.error(LOG_CATEGORIES.COMMAND, 'Slur application failed', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Remove slur from selection
   *
   * @param {number} startPos - Selection start
   * @param {number} endPos - Selection end
   * @returns {Array} Updated cells
   */
  removeSlur(startPos, endPos) {
    if (!this.document || !this.document.lines || this.document.lines.length === 0) {
      throw new Error('No document available');
    }

    const line = this.document.lines[0];
    let cells = line.cells || [];

    try {
      logger.info(LOG_CATEGORIES.COMMAND, 'Removing slur from selection', {
        start: startPos,
        end: endPos
      });

      cells = this.wasmModule.removeSlur(cells, startPos, endPos);
      line.cells = cells;

      return cells;
    } catch (error) {
      logger.error(LOG_CATEGORIES.COMMAND, 'Slur removal failed', {
        error: error.message
      });
      throw error;
    }
  }
}

export default TextInputHandler;
export { TextInputHandler };
