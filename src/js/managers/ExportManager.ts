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

interface WASMModule {
  exportMusicXML: () => string;
  generateIRJson: () => string;
  convertMusicXMLToLilyPond: (musicxml: string, settings: string) => string;
  exportAsText: () => string;
  exportAsASCIIMarkup: () => string;
  exportAsCodepointMarkup: () => string;
}

interface OSMDRenderer {
  render: (musicxml: string) => Promise<void>;
}

interface Editor {
  wasmModule: WASMModule | null;
  osmdRenderer?: OSMDRenderer;
  getDocument: () => unknown;
}

export class ExportManager {
  private editor: Editor;

  constructor(editor: Editor) {
    this.editor = editor;
  }

  /**
   * Export document to MusicXML format
   */
  async exportMusicXML(): Promise<string | null> {
    console.log(`[ExportManager] exportMusicXML() called`);

    if (!this.editor.wasmModule) {
      console.error('Cannot export MusicXML: WASM module not initialized');
      return null;
    }

    try {
      const startTime = performance.now();
      console.log(`[JS] exportMusicXML: using WASM internal document`);

      // Slur markers are already set directly on cells - no sync needed
      const musicxml = this.editor.wasmModule.exportMusicXML();
      const exportTime = performance.now() - startTime;

      logger.info(LOG_CATEGORIES.EDITOR, 'MusicXML export completed', {
        exportTime: `${exportTime.toFixed(2)}ms`,
        size: musicxml?.length || 0
      });

      return musicxml;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('MusicXML export failed:', error);
      logger.error(LOG_CATEGORIES.EDITOR, 'MusicXML export error', { error: errorMessage });
      return null;
    }
  }

  /**
   * Update IR (Intermediate Representation) display in inspector panel
   */
  async updateIRDisplay(): Promise<void> {
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
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : '';
      console.error('[IR] Error:', error);
      irDisplay.textContent = `// Error generating IR:\n${errorMessage}\n${errorStack}`;
    }
  }

  /**
   * Update MusicXML source display in inspector panel
   */
  async updateMusicXMLDisplay(): Promise<void> {
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
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : '';
      console.error('[MusicXML] Error:', error);
      musicxmlSource.textContent = `<!-- Error exporting to MusicXML:\n${errorMessage}\n${errorStack} -->`;
    }
  }

  /**
   * Update LilyPond source display in inspector panel
   */
  async updateLilyPondDisplay(): Promise<void> {
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
      const resultJson = this.editor.wasmModule!.convertMusicXMLToLilyPond(musicxml, settings);
      const result = JSON.parse(resultJson);

      // Display the LilyPond source
      lilypondSource.textContent = result.lilypond_source;

      // If there are skipped elements, add a note
      if (result.skipped_elements && result.skipped_elements.length > 0) {
        lilypondSource.textContent += '\n\n% Skipped elements:\n';
        result.skipped_elements.forEach((elem: { element_type: string; reason: string }) => {
          lilypondSource.textContent += `% - ${elem.element_type}: ${elem.reason}\n`;
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : '';
      console.error('[LilyPond] Error:', error);
      lilypondSource.textContent = `% Error converting to LilyPond:\n% ${errorMessage}\n% ${errorStack}`;
    }
  }

  /**
   * Update plain text display in inspector panel
   * Uses NotationFont PUA glyphs with pre-computed line variants
   */
  async updateTextDisplay(): Promise<void> {
    const textDisplay = document.getElementById('text-display') as HTMLTextAreaElement | null;
    if (!textDisplay || !this.editor.wasmModule) {
      return;
    }

    try {
      // Slur markers are already set directly on cells - no sync needed
      const text = this.editor.wasmModule.exportAsText();
      textDisplay.value = text;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[Text] Error:', error);
      textDisplay.value = `Error: ${errorMessage}`;
    }
  }

  /**
   * Update markup display in inspector panel
   * Shows current document exported as markup (ASCII or codepoint format)
   */
  async updateMarkupDisplay(): Promise<void> {
    const markupOutput = document.getElementById('markup-output');
    if (!markupOutput || !this.editor.wasmModule) {
      return;
    }

    try {
      // Check format selector for ASCII vs codepoint
      const formatSelect = document.getElementById('markup-output-format') as HTMLSelectElement | null;
      const useCodepoints = formatSelect?.value === 'codepoint';

      const markup = useCodepoints
        ? this.editor.wasmModule.exportAsCodepointMarkup()
        : this.editor.wasmModule.exportAsASCIIMarkup();

      markupOutput.textContent = markup;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[Markup] Error:', error);
      markupOutput.textContent = `Error: ${errorMessage}`;
    }
  }

  /**
   * Render staff notation using OSMD
   */
  async renderStaffNotation(): Promise<void> {
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
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Staff notation rendering failed:', error);
      logger.error(LOG_CATEGORIES.EDITOR, 'Staff notation render error', { error: errorMessage });
    }
  }
}

export default ExportManager;
