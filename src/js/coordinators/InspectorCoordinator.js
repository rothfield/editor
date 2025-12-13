/**
 * InspectorCoordinator - Manages inspector panel updates
 *
 * Responsibilities:
 * - Updating inspector tabs based on active selection
 * - Displaying document model in YAML format
 * - Displaying hitboxes for debugging
 * - Formatting HTML for display
 * - Scheduling deferred updates for performance
 *
 * This coordinator delegates to the editor for:
 * - WASM module access
 * - Document querying
 * - Export operations (via ExportManager)
 */

import logger, { LOG_CATEGORIES } from '../logger.js';
import { toYAML } from '../utils/yaml.js';
import { formatHTML } from '../utils/html-formatter.js';

export default class InspectorCoordinator {
  constructor(editor) {
    this.editor = editor;
    this._hitboxUpdateScheduled = false;
  }

  /**
   * Update document display in inspector tabs
   * Performance optimization: only updates visible tabs
   */
  updateDocumentDisplay() {
    logger.debug(LOG_CATEGORIES.INSPECTOR, 'updateDocumentDisplay() called', { activeTab: this.editor.ui?.activeTab });

    // PERFORMANCE FIX: Only update inspector tabs if they're actually visible
    // All of these operations process the entire document and should not run on every keystroke

    // Update display list tab (pre-computed render commands from WASM)
    if (this.editor.ui && this.editor.ui.activeTab === 'displaylist') {
      const displayListDisplay = document.getElementById('displaylist-display');
      if (displayListDisplay && this.editor.displayList) {
        displayListDisplay.innerHTML = this.formatDisplayList(this.editor.displayList);
      }
    }

    // Update persistent model (saveable content only, no state)
    if (this.editor.ui && this.editor.ui.activeTab === 'persistent') {
      const persistentJson = document.getElementById('persistent-json');
      if (persistentJson) {
        // Rust handles field exclusion via #[serde(skip)] on ephemeral fields (state, x, y, w, h, etc.)
        // Just exclude the runtime state field - WASM serialization handles the rest
        const persistentDoc = this.editor.getDocument();
        const displayDoc = this.createDisplayDocument(persistentDoc);
        persistentJson.textContent = toYAML(displayDoc);
      }
    }

    // PERFORMANCE FIX: Only update expensive inspector tabs if they're visible
    // These are heavy WASM operations that should not run on every keystroke
    if (this.editor.ui && this.editor.ui.activeTab === 'ir') {
      this.editor.exportManager.updateIRDisplay().catch(err => {
        logger.error(LOG_CATEGORIES.INSPECTOR, 'Failed to update IR display', { error: err });
      });
    }

    if (this.editor.ui && this.editor.ui.activeTab === 'musicxml') {
      this.editor.exportManager.updateMusicXMLDisplay().catch(err => {
        logger.error(LOG_CATEGORIES.INSPECTOR, 'Failed to update MusicXML display', { error: err });
      });
    }

    if (this.editor.ui && this.editor.ui.activeTab === 'lilypond-src') {
      this.editor.exportManager.updateLilyPondDisplay().catch(err => {
        logger.error(LOG_CATEGORIES.INSPECTOR, 'Failed to update LilyPond display', { error: err });
      });
    }

    // Update HTML display only if visible
    if (this.editor.ui && this.editor.ui.activeTab === 'html') {
      this.updateHTMLDisplay();
    }

    // Update Text display only if visible
    if (this.editor.ui && this.editor.ui.activeTab === 'text') {
      this.editor.exportManager.updateTextDisplay().catch(err => {
        logger.error(LOG_CATEGORIES.INSPECTOR, 'Failed to update Text display', { error: err });
      });
    }

    // Update hitboxes display only if visible
    if (this.editor.ui && this.editor.ui.activeTab === 'hitboxes') {
      this.updateHitboxesDisplay();
    }

    // Update mode toggle button display (always update when document changes)
    if (this.editor.ui && typeof this.editor.ui.updateModeToggleDisplay === 'function') {
      this.editor.ui.updateModeToggleDisplay();
    }
  }

  /**
   * Force update all export tabs immediately (used when key signature changes)
   * This bypasses the performance optimization in updateDocumentDisplay()
   * which only updates visible tabs.
   */
  async forceUpdateAllExports() {
    // Update all export formats regardless of which tab is visible
    try {
      // CRITICAL: Clear OSMD cache to force re-render with new key signature
      if (this.editor.osmdRenderer) {
        logger.info(LOG_CATEGORIES.INSPECTOR, 'Clearing OSMD cache for key signature change');
        this.editor.osmdRenderer.lastMusicXmlHash = null; // Force cache miss
        await this.editor.osmdRenderer.clearAllCache(); // Clear IndexedDB cache
      }

      await Promise.all([
        this.editor.exportManager.updateIRDisplay().catch(err => {
          logger.error(LOG_CATEGORIES.INSPECTOR, 'Failed to update IR display', { error: err });
        }),
        this.editor.exportManager.updateMusicXMLDisplay().catch(err => {
          logger.error(LOG_CATEGORIES.INSPECTOR, 'Failed to update MusicXML display', { error: err });
        }),
        this.editor.exportManager.updateLilyPondDisplay().catch(err => {
          logger.error(LOG_CATEGORIES.INSPECTOR, 'Failed to update LilyPond display', { error: err });
        }),
        // Also update staff notation (OSMD/VexFlow rendering)
        this.editor.renderStaffNotation().catch(err => {
          logger.error(LOG_CATEGORIES.INSPECTOR, 'Failed to update staff notation', { error: err });
        })
      ]);
    } catch (error) {
      logger.error(LOG_CATEGORIES.INSPECTOR, 'Failed to force update exports', { error });
    }
  }

  /**
   * Create a display-friendly version of the document with string pitch systems
   */
  createDisplayDocument(doc) {
    // Deep clone the document
    const displayDoc = JSON.parse(JSON.stringify(doc));

    // Ensure all document-level metadata fields are present (even if empty/null)
    displayDoc.title = displayDoc.title ?? null;
    displayDoc.composer = displayDoc.composer ?? null;
    displayDoc.tonic = displayDoc.tonic ?? null;
    displayDoc.key_signature = displayDoc.key_signature ?? null;
    displayDoc.created_at = displayDoc.created_at ?? null;
    displayDoc.modified_at = displayDoc.modified_at ?? null;
    displayDoc.version = displayDoc.version ?? null;

    // Convert document-level pitch_system to string
    displayDoc.pitch_system = displayDoc.pitch_system ?? null;
    if (typeof displayDoc.pitch_system === 'number') {
      const systemNum = displayDoc.pitch_system;
      displayDoc.pitch_system = `${this.editor.getPitchSystemName(systemNum)} (${systemNum})`;
    }

    // Ensure all Line metadata fields are present (even if empty)
    if (displayDoc.lines && Array.isArray(displayDoc.lines)) {
      displayDoc.lines.forEach(line => {
        // Ensure all metadata fields exist with empty string defaults
        line.label = line.label ?? '';
        line.tala = line.tala ?? '';
        line.lyrics = line.lyrics ?? '';
        line.tonic = line.tonic ?? '';
        line.pitch_system = line.pitch_system ?? 0;
        line.key_signature = line.key_signature ?? '';
        line.tempo = line.tempo ?? '';
        line.time_signature = line.time_signature ?? '';

        // Convert line pitch_system to string for display
        if (typeof line.pitch_system === 'number') {
          const systemNum = line.pitch_system;
          line.pitch_system = systemNum === 0 ? '(not set)' : `${this.editor.getPitchSystemName(systemNum)} (${systemNum})`;
        }
      });
    }

    return displayDoc;
  }

  /**
   * Update HTML display in inspector panel
   */
  updateHTMLDisplay() {
    const htmlDisplay = document.getElementById('html-content');  // FIXED: was 'html-display', should be 'html-content'
    if (!htmlDisplay || !this.editor.renderer || !this.editor.renderer.element) {
      return;
    }

    const html = this.editor.renderer.element.innerHTML;
    const formatted = formatHTML(html);
    htmlDisplay.textContent = formatted;
  }

  /**
   * Update hitboxes display in debug panel
   */
  updateHitboxesDisplay() {
    const hitboxesContainer = document.getElementById('hitboxes-container');

    if (!hitboxesContainer) {
      return;
    }

    if (!this.editor.getDocument().lines || this.editor.getDocument()?.lines?.length === 0) {
      hitboxesContainer.innerHTML = '<div class="text-gray-500 text-sm">No hitboxes available. Add some content to see hitbox information.</div>';
      return;
    }

    let hitboxHTML = '<div class="space-y-4">';

    this.editor.getDocument()?.lines?.forEach((stave, staveIndex) => {
      hitboxHTML += `<div class="mb-4">`;
      hitboxHTML += `<h4 class="font-semibold text-sm mb-2">Stave ${staveIndex} Hitboxes</h4>`;

      const cells = stave.cells || [];
      if (cells && cells.length > 0) {
        hitboxHTML += `<div class="mb-3">`;
        hitboxHTML += `<table class="w-full text-xs border-collapse">`;
        hitboxHTML += `<thead><tr class="bg-gray-100">`;
        hitboxHTML += `<th class="border border-gray-300 px-2 py-1 text-left">Idx</th>`;
        hitboxHTML += `<th class="border border-gray-300 px-2 py-1 text-left">Char</th>`;
        hitboxHTML += `<th class="border border-gray-300 px-2 py-1 text-left">Pos</th>`;
        hitboxHTML += `<th class="border border-gray-300 px-2 py-1 text-left">Hitbox</th>`;
        hitboxHTML += `<th class="border border-gray-300 px-2 py-1 text-left">Center</th>`;
        hitboxHTML += `</tr></thead><tbody>`;

        cells.forEach((cell, cellIndex) => {
          const hasValidHitbox = cell.x !== undefined && cell.y !== undefined &&
                                           cell.w !== undefined && cell.h !== undefined;

          if (hasValidHitbox) {
            const centerX = cell.x + (cell.w / 2);
            const centerY = cell.y + (cell.h / 2);

            hitboxHTML += `<tr class="hover:bg-blue-50">`;
            hitboxHTML += `<td class="border border-gray-300 px-2 py-1">${cellIndex}</td>`;
            hitboxHTML += `<td class="border border-gray-300 px-2 py-1 font-mono">${cell.char || ''}</td>`;
            hitboxHTML += `<td class="border border-gray-300 px-2 py-1">${cell.col || 0}</td>`;
            hitboxHTML += `<td class="border border-gray-300 px-2 py-1">${cell.x.toFixed(1)}, ${cell.y.toFixed(1)}, ${cell.w.toFixed(1)}×${cell.h.toFixed(1)}</td>`;
            hitboxHTML += `<td class="border border-gray-300 px-2 py-1">${centerX.toFixed(1)}, ${centerY.toFixed(1)}</td>`;
            hitboxHTML += `</tr>`;
          }
        });

        hitboxHTML += `</tbody></table>`;
        hitboxHTML += `</div>`;
      }

      hitboxHTML += `</div>`;
    });

    hitboxHTML += '</div>';
    hitboxesContainer.innerHTML = hitboxHTML;
  }

  /**
   * Schedule a deferred hitbox update (performance optimization)
   * Prevents multiple hitbox updates from running simultaneously
   */
  scheduleHitboxesUpdate() {
    if (this._hitboxUpdateScheduled) {
      return; // Already scheduled, don't schedule again
    }

    this._hitboxUpdateScheduled = true;
    requestAnimationFrame(() => {
      this._hitboxUpdateScheduled = false;
      this.updateHitboxesDisplay();
    });
  }

  /**
   * Format display list as HTML for inspector
   */
  formatDisplayList(displayList) {
    if (!displayList || !displayList.lines) {
      return '<div class="text-gray-500">No display list available</div>';
    }

    let html = '<div class="space-y-6">';

    // Document metadata
    if (displayList.title || displayList.composer) {
      html += '<div class="mb-4 p-2 bg-gray-100 rounded">';
      if (displayList.title) html += `<div><strong>Title:</strong> ${this.escapeHtml(displayList.title)}</div>`;
      if (displayList.composer) html += `<div><strong>Composer:</strong> ${this.escapeHtml(displayList.composer)}</div>`;
      html += '</div>';
    }

    // Each line
    displayList.lines.forEach((line, idx) => {
      html += `<div class="border border-gray-300 rounded p-3 mb-4">`;
      html += `<div class="font-bold text-sm mb-2 text-blue-600">Line ${line.line_index}${line.label ? ` (${this.escapeHtml(line.label)})` : ''}</div>`;

      // Text with cursor indicator
      html += `<div class="mb-3 p-2 bg-gray-50 rounded font-mono text-sm">`;
      html += `<div class="text-gray-500 text-xs mb-1">Text (${line.text.length} chars):</div>`;
      html += `<div class="whitespace-pre">${this.escapeHtml(line.text)}</div>`;
      if (line.cursor_pos !== null && line.cursor_pos !== undefined) {
        html += `<div class="text-xs text-green-600 mt-1">Cursor: position ${line.cursor_pos}</div>`;
      }
      html += '</div>';

      // Decoded glyphs table
      if (line.decoded_glyphs && line.decoded_glyphs.length > 0) {
        html += '<div class="mb-3">';
        html += '<div class="text-gray-500 text-xs mb-1">Decoded Glyphs:</div>';
        html += '<table class="w-full text-xs border-collapse">';
        html += '<thead><tr class="bg-gray-100">';
        html += '<th class="border border-gray-300 px-1 py-1">Idx</th>';
        html += '<th class="border border-gray-300 px-1 py-1">Glyph</th>';
        html += '<th class="border border-gray-300 px-1 py-1">Codepoint</th>';
        html += '<th class="border border-gray-300 px-1 py-1">Base</th>';
        html += '<th class="border border-gray-300 px-1 py-1">Pitch</th>';
        html += '<th class="border border-gray-300 px-1 py-1">Oct</th>';
        html += '<th class="border border-gray-300 px-1 py-1">Underline</th>';
        html += '<th class="border border-gray-300 px-1 py-1">Overline</th>';
        html += '</tr></thead><tbody>';

        line.decoded_glyphs.forEach(g => {
          const isPUA = g.codepoint.startsWith('U+E') || g.codepoint.startsWith('U+F');
          const rowClass = isPUA ? 'bg-yellow-50' : '';
          html += `<tr class="${rowClass}">`;
          html += `<td class="border border-gray-300 px-1 py-1 text-center">${g.char_index}</td>`;
          html += `<td class="border border-gray-300 px-1 py-1 text-center font-notation">${this.escapeHtml(g.glyph)}</td>`;
          html += `<td class="border border-gray-300 px-1 py-1 text-center font-mono text-xs">${g.codepoint}</td>`;
          html += `<td class="border border-gray-300 px-1 py-1 text-center">${this.escapeHtml(g.base_char)}</td>`;
          html += `<td class="border border-gray-300 px-1 py-1 text-center">${g.pitch || '-'}</td>`;
          html += `<td class="border border-gray-300 px-1 py-1 text-center">${g.octave !== 0 ? g.octave : '-'}</td>`;
          html += `<td class="border border-gray-300 px-1 py-1 text-center">${g.underline !== 'None' ? g.underline : '-'}</td>`;
          html += `<td class="border border-gray-300 px-1 py-1 text-center">${g.overline !== 'None' ? g.overline : '-'}</td>`;
          html += '</tr>';
        });

        html += '</tbody></table>';
        html += '</div>';
      }

      // Lyric overlays
      if (line.lyrics && line.lyrics.length > 0) {
        html += '<div class="mb-3 p-2 bg-blue-50 rounded">';
        html += '<div class="text-gray-500 text-xs mb-1">Lyric Overlays:</div>';
        html += '<div class="flex flex-wrap gap-2">';
        line.lyrics.forEach(lyric => {
          html += `<span class="bg-blue-100 px-2 py-1 rounded text-xs">`;
          html += `@${lyric.char_index}: "${this.escapeHtml(lyric.content)}"`;
          html += '</span>';
        });
        html += '</div></div>';
      }

      // Tala overlays
      if (line.talas && line.talas.length > 0) {
        html += '<div class="mb-3 p-2 bg-purple-50 rounded">';
        html += '<div class="text-gray-500 text-xs mb-1">Tala Overlays:</div>';
        html += '<div class="flex flex-wrap gap-2">';
        line.talas.forEach(tala => {
          html += `<span class="bg-purple-100 px-2 py-1 rounded text-xs">`;
          html += `@${tala.char_index}: "${this.escapeHtml(tala.content)}"`;
          html += '</span>';
        });
        html += '</div></div>';
      }

      html += '</div>';
    });

    html += '</div>';
    return html;
  }

  /**
   * Escape HTML special characters
   */
  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
