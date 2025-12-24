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
import type { WASMModule } from '../../types/wasm-module.js';
import type { Document, DocumentLine } from '../../types/wasm.js';

interface TalaResult {
  success: boolean;
  error?: string;
}

interface EditorInstance {
  wasmModule: WASMModule;
  getDocument(): Document | null;
  getCurrentLine(): DocumentLine | null;
  getCurrentStave(): number;
  addToConsoleLog(message: string): void;
  renderAndUpdate(): Promise<void>;
}

const PITCH_SYSTEM_NAMES: Record<number, string> = {
  0: 'Unknown',
  1: 'Number',
  2: 'Western',
  3: 'Sargam',
  4: 'Bhatkhande',
  5: 'Tabla'
};

export default class MusicalCoordinator {
  private editor: EditorInstance;

  constructor(editor: EditorInstance) {
    this.editor = editor;
  }

  /**
   * Get pitch system name from numeric code
   */
  getPitchSystemName(system: number): string {
    return PITCH_SYSTEM_NAMES[system] || 'Unknown';
  }

  /**
   * Get current pitch system (WASM is source of truth)
   * Line-level pitch_system overrides document-level
   */
  getCurrentPitchSystem(): number {
    const doc = this.editor.getDocument();
    if (doc) {
      // Check if we have lines and if the first line has pitch_system set
      if (doc.lines && doc.lines.length > 0) {
        const line = this.editor.getCurrentLine();
        // If line has pitch_system set (non-zero), use it
        const linePitchSystem = line?.pitch_system as number | undefined;
        if (linePitchSystem && linePitchSystem !== 0) {
          return linePitchSystem;
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
  showTalaDialog(): void {
    const tala = prompt('Enter tala (digits 0-9+):');
    if (tala !== null) {
      this.setTala(tala);
    }
  }

  /**
   * Set tala for current line
   */
  async setTala(talaString: string): Promise<void> {
    try {
      if (this.editor.wasmModule) {
        const currentStave = this.editor.getCurrentStave();

        // Call modern WASM API (operates on internal DOCUMENT)
        const result = this.editor.wasmModule.setLineTalaModern(currentStave, talaString) as unknown as TalaResult;

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
}
