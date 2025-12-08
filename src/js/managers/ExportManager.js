/**
 * ExportManager - Handles all export operations and inspector panel updates
 *
 * This class encapsulates:
 * - Music XML export and display
 * - LilyPond export and display
 * - IR (Intermediate Representation) display
 * - Staff notation rendering with OSMD
 */

import logger, { LOG_CATEGORIES } from '../logger.js';

export class ExportManager {
  constructor(editor) {
    this.editor = editor;
  }

  /**
   * Export document to MusicXML format
   * @returns {Promise<string|null>} MusicXML string or null on error
   */
  async exportMusicXML() {
    console.log(`[ExportManager] exportMusicXML() called`);

    if (!this.editor.wasmModule) {
      console.error('Cannot export MusicXML: WASM module not initialized');
      return null;
    }

    try {
      const startTime = performance.now();
      console.log(`[JS] exportMusicXML: using WASM internal document`);

      // Apply annotation layer slurs to cells before export
      if (typeof this.editor.wasmModule.applyAnnotationSlursToCells === 'function') {
        console.log(`[ExportManager] Calling applyAnnotationSlursToCells()...`);
        const slurResult = this.editor.wasmModule.applyAnnotationSlursToCells();
        console.log(`[ExportManager] applyAnnotationSlursToCells() returned:`, slurResult);
        if (slurResult?.success) {
          console.log(`[JS] Applied ${slurResult.slurs_applied} slurs from annotation layer to cells`);
        }
      } else {
        console.warn(`[ExportManager] applyAnnotationSlursToCells function not available`);
      }

      // Apply annotation layer ornaments to cells before export
      if (typeof this.editor.wasmModule.applyAnnotationOrnamentsToCells === 'function') {
        console.log(`[ExportManager] Calling applyAnnotationOrnamentsToCells()...`);
        const ornamentResult = this.editor.wasmModule.applyAnnotationOrnamentsToCells();
        console.log(`[ExportManager] applyAnnotationOrnamentsToCells() returned:`, ornamentResult);
        if (ornamentResult?.success) {
          console.log(`[JS] Applied ${ornamentResult.ornaments_applied} ornaments from annotation layer to cells`);
        }
      } else {
        console.warn(`[ExportManager] applyAnnotationOrnamentsToCells function not available`);
      }

      const musicxml = this.editor.wasmModule.exportMusicXML();
      const exportTime = performance.now() - startTime;

      logger.info(LOG_CATEGORIES.EDITOR, 'MusicXML export completed', {
        exportTime: `${exportTime.toFixed(2)}ms`,
        size: musicxml?.length || 0
      });

      return musicxml;
    } catch (error) {
      console.error('MusicXML export failed:', error);
      logger.error(LOG_CATEGORIES.EDITOR, 'MusicXML export error', { error: error.message });
      return null;
    }
  }

  /**
   * Update IR (Intermediate Representation) display in inspector panel
   */
  async updateIRDisplay() {
    const irDisplay = document.getElementById('ir-display');
    if (!irDisplay) {
      return;
    }

    try {
      // Call WASM function to generate IR as JSON
      if (typeof this.editor.wasmModule?.generateIRJson === 'function') {
        console.log('[IR] Calling generateIRJson (using WASM internal document)...');
        const irJson = this.editor.wasmModule.generateIRJson();
        console.log('[IR] Generated successfully, length:', irJson.length);
        irDisplay.textContent = irJson;
      } else {
        // Fallback if WASM function not yet implemented
        console.warn('[IR] generateIRJson not found in wasmModule');
        irDisplay.textContent = '# IR (Intermediate Representation) not yet exposed via WASM\n\n' +
          '# To enable IR display:\n' +
          '# 1. Add public fn to Rust: pub fn generate_ir_json(document: &Document) -> String\n' +
          '# 2. Add #[wasm_bindgen] decorator\n' +
          '# 3. Rebuild WASM with: npm run build-wasm\n' +
          '# 4. IR will then display ExportLine → ExportMeasure → ExportEvent structures\n\n' +
          '# Current IR pipeline:\n' +
          '# - build_export_measures_from_document() creates Vec<ExportLine>\n' +
          '# - Each ExportLine contains measures with FSM-grouped events\n' +
          '# - Events are: Rest { divisions } | Note { pitch, divisions, grace_notes, slur, lyrics } | Chord\n\n' +
          '# See: src/renderers/musicxml/export_ir.rs for type definitions';
      }
    } catch (error) {
      console.error('[IR] Error:', error);
      irDisplay.textContent = `// Error generating IR:\n${error.message}\n${error.stack}`;
    }
  }

  /**
   * Update MusicXML source display in inspector panel
   */
  async updateMusicXMLDisplay() {
    const musicxmlSource = document.getElementById('musicxml-source');
    if (!musicxmlSource || !this.editor.getDocument()) {
      return;
    }

    try {
      const musicxml = await this.exportMusicXML();

      if (!musicxml) {
        musicxmlSource.textContent = '<!-- Error: MusicXML export failed -->';
        return;
      }

      musicxmlSource.textContent = musicxml;
    } catch (error) {
      console.error('[MusicXML] Error:', error);
      musicxmlSource.textContent = `<!-- Error exporting to MusicXML:\n${error.message}\n${error.stack} -->`;
    }
  }

  /**
   * Update LilyPond source display in inspector panel
   */
  async updateLilyPondDisplay() {
    const lilypondSource = document.getElementById('lilypond-source');
    if (!lilypondSource || !this.editor.getDocument()) {
      return;
    }

    try {
      // Export to MusicXML first
      const musicxml = await this.exportMusicXML();

      if (!musicxml) {
        lilypondSource.textContent = '% Error: MusicXML export failed';
        return;
      }

      // Convert to LilyPond
      const settings = JSON.stringify({
        target_lilypond_version: "2.24.0",
        language: "English",
        convert_directions: true,
        convert_lyrics: true,
        convert_chord_symbols: true
      });
      const resultJson = this.editor.wasmModule.convertMusicXMLToLilyPond(musicxml, settings);
      const result = JSON.parse(resultJson);

      // Display the LilyPond source
      lilypondSource.textContent = result.lilypond_source;

      // If there are skipped elements, add a note
      if (result.skipped_elements && result.skipped_elements.length > 0) {
        lilypondSource.textContent += '\n\n% Skipped elements:\n';
        result.skipped_elements.forEach(elem => {
          lilypondSource.textContent += `% - ${elem.element_type}: ${elem.reason}\n`;
        });
      }
    } catch (error) {
      console.error('[LilyPond] Error:', error);
      lilypondSource.textContent = `% Error converting to LilyPond:\n% ${error.message}\n% ${error.stack}`;
    }
  }

  /**
   * Update plain text display in inspector panel
   * Uses NotationFont PUA glyphs with pre-computed line variants
   */
  async updateTextDisplay() {
    const textDisplay = document.getElementById('text-display');
    if (!textDisplay || !this.editor.wasmModule) {
      return;
    }

    try {
      // Apply annotation layer slurs to cells before export (must be before ornaments)
      // This sets slur_indicator on cells so ornaments know if they're inside a slur
      if (typeof this.editor.wasmModule.applyAnnotationSlursToCells === 'function') {
        this.editor.wasmModule.applyAnnotationSlursToCells();
      }

      // Apply annotation layer ornaments to cells before export
      if (typeof this.editor.wasmModule.applyAnnotationOrnamentsToCells === 'function') {
        this.editor.wasmModule.applyAnnotationOrnamentsToCells();
      }

      const text = this.editor.wasmModule.exportAsText();
      textDisplay.value = text;
    } catch (error) {
      console.error('[Text] Error:', error);
      textDisplay.value = `Error: ${error.message}`;
    }
  }

  /**
   * Render staff notation using OSMD
   */
  async renderStaffNotation() {
    if (!this.editor.osmdRenderer) {
      console.warn('OSMD renderer not initialized');
      return;
    }

    const musicxml = await this.exportMusicXML();
    if (!musicxml) {
      console.warn('Cannot render staff notation: MusicXML export failed');
      return;
    }

    try {
      const startTime = performance.now();
      await this.editor.osmdRenderer.render(musicxml);
      const renderTime = performance.now() - startTime;

      console.log(`Staff notation rendered in ${renderTime.toFixed(2)}ms`);
      logger.info(LOG_CATEGORIES.EDITOR, 'Staff notation rendered', {
        renderTime: `${renderTime.toFixed(2)}ms`
      });
    } catch (error) {
      console.error('Staff notation rendering failed:', error);
      logger.error(LOG_CATEGORIES.EDITOR, 'Staff notation render error', { error: error.message });
    }
  }
}

export default ExportManager;
