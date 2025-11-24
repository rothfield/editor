/**
 * MusicalCoordinator - Manages musical concepts (pitch systems, tala/rhythm)
 *
 * Responsibilities:
 * - Pitch system name mapping
 * - Current pitch system querying (from WASM)
 * - Tala (rhythm) setting and UI
 *
 * This coordinator delegates to the editor for:
 * - WASM module access
 * - Document querying
 * - Console and error display
 * - Rendering operations
 */

import logger, { LOG_CATEGORIES } from '../logger.js';

export default class MusicalCoordinator {
  constructor(editor) {
    this.editor = editor;
  }

  /**
   * Get pitch system name from numeric code
   */
  getPitchSystemName(system) {
    const names = {
      0: 'Unknown',
      1: 'Number',
      2: 'Western',
      3: 'Sargam',
      4: 'Bhatkhande',
      5: 'Tabla'
    };
    return names[system] || 'Unknown';
  }

  /**
   * Get current pitch system (WASM is source of truth)
   * Line-level pitch_system overrides document-level
   */
  getCurrentPitchSystem() {
    const doc = this.editor.getDocument();
    if (doc) {
      // Check if we have lines and if the first line has pitch_system set
      if (doc.lines && doc.lines.length > 0) {
        const line = this.editor.getCurrentLine();
        // If line has pitch_system set (non-zero), use it
        if (line && line.pitch_system && line.pitch_system !== 0) {
          return line.pitch_system;
        }
      }
      // Fall back to document-level pitch system
      return doc.pitch_system || 1; // Default to Number system
    }
    return 1;
  }

  /**
   * Show dialog to set tala (rhythm) for current line
   */
  showTalaDialog() {
    const tala = prompt('Enter tala (digits 0-9+):');
    if (tala !== null) {
      this.setTala(tala);
    }
  }

  /**
   * Set tala for current line
   */
  async setTala(talaString) {
    try {
      if (this.editor.wasmModule) {
        const currentStave = this.editor.getCurrentStave();

        // Call modern WASM API (operates on internal DOCUMENT)
        const result = this.editor.wasmModule.setLineTalaModern(currentStave, talaString);

        if (!result.success) {
          throw new Error(result.error || 'Unknown error');
        }

        logger.info(LOG_CATEGORIES.MUSICAL, `Tala set to: ${talaString} on line ${currentStave}`);
        this.editor.addToConsoleLog(`Tala set to: ${talaString}`);
        await this.editor.renderAndUpdate();
      }
    } catch (error) {
      logger.error(LOG_CATEGORIES.MUSICAL, 'Failed to set tala', { error });
  }
}
