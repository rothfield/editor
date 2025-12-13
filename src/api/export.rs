//! Export operations for the WASM API
//!
//! This module provides functions to export the document to various formats:
//! - MusicXML: Standard music notation interchange format
//! - MIDI: Standard MIDI File Format 1
//! - IR JSON: Intermediate Representation for inspection/debugging
//! - LilyPond: High-quality music engraving (via MusicXML conversion)

use wasm_bindgen::prelude::*;
use crate::api::helpers::lock_document;
use crate::{wasm_log, wasm_info, wasm_error};
use js_sys;

// ============================================================================
// MusicXML Export
// ============================================================================

/// Export document to MusicXML format
///
/// Uses WASM's internal document (from DOCUMENT mutex) to ensure
/// all metadata (part_id, system_id) is up-to-date after edit operations.
///
/// # Returns
/// MusicXML string (XML format)
#[wasm_bindgen(js_name = exportMusicXML)]
pub fn export_musicxml() -> Result<String, JsValue> {
    wasm_info!("exportMusicXML called (using internal WASM document)");

    // Use WASM's internal document instead of accepting from JavaScript
    // This ensures we have the latest metadata (part_id, system_id) after edit operations
    let doc_guard = lock_document()?;
    let document = doc_guard.as_ref()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    wasm_log!("  Document has {} lines", document.lines.len());

    // DEBUG: Log part_id values to verify they're set
    for (i, line) in document.lines.iter().enumerate() {
        wasm_log!("  Line {}: part_id='{}', system_id={}", i, line.part_id, line.system_id);
    }

    // Export to MusicXML
    let musicxml = crate::renderers::musicxml::to_musicxml(&document)
        .map_err(|e| {
            wasm_error!("MusicXML export error: {}", e);
            JsValue::from_str(&format!("MusicXML export error: {}", e))
        })?;

    wasm_info!("  MusicXML generated: {} bytes", musicxml.len());
    wasm_info!("exportMusicXML completed successfully");

    Ok(musicxml)
}

// ============================================================================
// Intermediate Representation (IR) Export
// ============================================================================

/// Generate Intermediate Representation (IR) as JSON
///
/// Converts the internal document to the IR (ExportLine/ExportMeasure/ExportEvent)
/// and serializes it to JSON for inspection and debugging.
///
/// Uses WASM's internal document to ensure all metadata is up-to-date.
///
/// The IR captures all document structure (measures, beats, events) with
/// proper rhythm analysis (LCM-based division calculation) and preserves
/// all musical information (slurs, lyrics, ornaments, chords, etc.).
///
/// # Returns
/// JSON string representation of the IR structure
#[wasm_bindgen(js_name = generateIRJson)]
pub fn generate_ir_json() -> Result<String, JsValue> {
    wasm_info!("generateIRJson called (using internal WASM document)");

    // Use WASM's internal document instead of accepting from JavaScript
    let doc_guard = lock_document()?;
    let document = doc_guard.as_ref()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    wasm_log!("  Document has {} lines", document.lines.len());

    // Build IR from document (FSM-based cell grouping, measure/beat boundaries, LCM calculation)
    let export_lines = crate::ir::build_export_measures_from_document(&document);
    crate::musicxml_log!(
        "Built IR: {} lines, {} total measures",
        export_lines.len(),
        export_lines.iter().map(|l| l.measures.len()).sum::<usize>()
    );

    // Serialize IR to JSON
    let json = serde_json::to_string_pretty(&export_lines)
        .map_err(|e| {
            wasm_error!("JSON serialization error: {}", e);
            JsValue::from_str(&format!("JSON serialization error: {}", e))
        })?;

    wasm_info!("  IR JSON generated: {} bytes", json.len());
    wasm_info!("generateIRJson completed successfully");

    Ok(json)
}

// ============================================================================
// MIDI Export
// ============================================================================

/// Export document to MIDI format
///
/// Converts the internal document to MusicXML, then to MIDI using the musicxml_to_midi converter.
/// Uses WASM's internal document to ensure all metadata is up-to-date.
///
/// # Parameters
/// - `tpq`: Ticks per quarter note (typically 480 or 960), use 0 for default (480)
///
/// # Returns
/// MIDI file as Uint8Array (Standard MIDI File Format 1)
#[wasm_bindgen(js_name = exportMIDI)]
pub fn export_midi(tpq: u16) -> Result<js_sys::Uint8Array, JsValue> {
    wasm_info!("exportMIDI called with tpq={} (using internal WASM document)", tpq);

    // Use WASM's internal document instead of accepting from JavaScript
    let doc_guard = lock_document()?;
    let document = doc_guard.as_ref()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    wasm_log!("  Document has {} lines", document.lines.len());

    // Step 1: Export to MusicXML
    let musicxml = crate::renderers::musicxml::to_musicxml(&document)
        .map_err(|e| {
            wasm_error!("MusicXML export error: {}", e);
            JsValue::from_str(&format!("MusicXML export error: {}", e))
        })?;

    wasm_log!("  MusicXML generated: {} bytes", musicxml.len());

    // Step 2: Convert MusicXML to MIDI
    let midi_bytes = crate::converters::musicxml::musicxml_to_midi::musicxml_to_midi(
        musicxml.as_bytes(),
        tpq,
    )
    .map_err(|e| {
        wasm_error!("MIDI conversion error: {}", e);
        JsValue::from_str(&format!("MIDI conversion error: {}", e))
    })?;

    wasm_info!("  MIDI generated: {} bytes", midi_bytes.len());

    // Convert to Uint8Array for JavaScript
    let uint8_array = js_sys::Uint8Array::new_with_length(midi_bytes.len() as u32);
    uint8_array.copy_from(&midi_bytes);

    wasm_info!("exportMIDI completed successfully");
    Ok(uint8_array)
}

/// Export document to MIDI format using direct IR-to-MIDI conversion
///
/// This is a more efficient alternative to `exportMIDI()` that bypasses the MusicXML
/// intermediate step and converts directly from IR to MIDI.
///
/// # Benefits
/// - **2-5x faster**: Eliminates XML serialization/parsing overhead
/// - **More accurate**: Preserves semantic information from IR
/// - **Simpler**: Direct struct-to-struct conversion
///
/// # Parameters
/// - `tpq`: Ticks per quarter note (typically 480 or 960), use 0 for default (480)
/// - `tempo_bpm`: Optional tempo override in beats per minute (default: 120)
///
/// # Returns
/// MIDI file as Uint8Array (Standard MIDI File Format 1)
#[wasm_bindgen(js_name = exportMIDIDirect)]
pub fn export_midi_direct(tpq: u16, tempo_bpm: Option<f64>) -> Result<js_sys::Uint8Array, JsValue> {
    wasm_info!("exportMIDIDirect called with tpq={}, tempo_bpm={:?} (using internal WASM document)", tpq, tempo_bpm);

    // Use WASM's internal document
    let doc_guard = lock_document()?;
    let document = doc_guard.as_ref()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    wasm_log!("  Document has {} lines", document.lines.len());

    // Step 1: Build IR from document
    let export_lines = crate::ir::build_export_measures_from_document(&document);
    wasm_log!("  Built IR: {} lines, {} total measures",
        export_lines.len(),
        export_lines.iter().map(|l| l.measures.len()).sum::<usize>()
    );

    // Step 2: Convert IR directly to MIDI Score (bypass MusicXML)
    let tpq_value = if tpq == 0 { crate::renderers::midi::DEFAULT_TPQ } else { tpq };
    let score = crate::renderers::midi::ir_to_midi_score(&export_lines, tpq_value, tempo_bpm)
        .map_err(|e| {
            wasm_error!("IR-to-MIDI conversion error: {}", e);
            JsValue::from_str(&format!("IR-to-MIDI conversion error: {}", e))
        })?;

    wasm_log!("  MIDI Score: {} parts, {} total notes",
        score.parts.len(),
        score.parts.iter().map(|p| p.notes.len()).sum::<usize>()
    );

    // Step 3: Write SMF bytes
    let mut midi_bytes = Vec::new();
    crate::converters::musicxml::musicxml_to_midi::write_smf(&score, &mut midi_bytes)
        .map_err(|e| {
            wasm_error!("MIDI write error: {}", e);
            JsValue::from_str(&format!("MIDI write error: {}", e))
        })?;

    wasm_info!("  MIDI generated: {} bytes", midi_bytes.len());

    // Convert to Uint8Array for JavaScript
    let uint8_array = js_sys::Uint8Array::new_with_length(midi_bytes.len() as u32);
    uint8_array.copy_from(&midi_bytes);

    wasm_info!("exportMIDIDirect completed successfully");
    Ok(uint8_array)
}

// ============================================================================
// MusicXML Import
// ============================================================================

/// Import MusicXML file and convert to Document
///
/// Takes a MusicXML string, parses it to IR, then converts to the editor's Document format.
/// Uses the default pitch system (Number) for display.
///
/// # Parameters
/// * `musicxml_string` - MusicXML 3.1 document as a string
///
/// # Returns
/// JSON string containing the Document structure
#[wasm_bindgen(js_name = importMusicXML)]
pub fn import_musicxml(musicxml_string: String) -> Result<JsValue, JsValue> {
    wasm_info!("importMusicXML called");
    wasm_log!("  Input MusicXML: {} bytes", musicxml_string.len());

    // Step 1: Parse MusicXML to IR
    let export_lines = crate::converters::musicxml::parse_musicxml_to_ir(&musicxml_string)
        .map_err(|e| {
            wasm_error!("MusicXML parse error: {}", e);
            JsValue::from_str(&format!("MusicXML parse error: {}", e))
        })?;

    wasm_log!("  Parsed {} lines from MusicXML", export_lines.len());

    // Step 2: Convert IR to Document
    use crate::models::elements::PitchSystem;
    let document = crate::converters::ir_to_document(export_lines, PitchSystem::Number)
        .map_err(|e| {
            wasm_error!("IR to Document conversion error: {}", e);
            JsValue::from_str(&format!("IR to Document conversion error: {}", e))
        })?;

    wasm_log!("  Created document with {} lines", document.lines.len());

    // Step 3: Serialize to JSON for JavaScript
    let _document_json = serde_json::to_string(&document)
        .map_err(|e| {
            wasm_error!("Document serialization error: {}", e);
            JsValue::from_str(&format!("Document serialization error: {}", e))
        })?;

    wasm_info!("importMusicXML completed successfully");

    // Return as JsValue (JavaScript will receive this as an object)
    Ok(serde_wasm_bindgen::to_value(&document)
        .map_err(|e| JsValue::from_str(&format!("WASM serialization error: {}", e)))?)
}

// ============================================================================
// LilyPond Conversion (MusicXML → LilyPond)
// ============================================================================

// ============================================================================
// Plain Text Export
// ============================================================================

/// Export document to plain text using NotationFont PUA glyphs
///
/// cell.char contains everything pre-computed:
/// - Pitch (as PUA glyph)
/// - Octave (combining dots)
/// - Underline/overline (line variants)
///
/// # Returns
/// Plain text string with PUA glyphs (render with NotationFont)
#[wasm_bindgen(js_name = exportAsText)]
pub fn export_as_text() -> Result<String, JsValue> {
    wasm_info!("exportAsText called");

    let doc_guard = lock_document()?;
    let document = doc_guard.as_ref()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    let result = export_text(document);

    wasm_info!("exportAsText completed: {} bytes", result.len());
    Ok(result)
}

/// Text render line - represents a single line of notation in text form
struct TextRenderLine {
    /// Tala characters (above notes)
    tala_line: String,
    /// Main note line with combining chars (includes inline superscript ornaments)
    note_line: String,
    /// Lyrics (below notes)
    lyric_line: String,
    /// Line label (optional prefix)
    label: Option<String>,
}

/// Helper to count display width (combining chars don't add width)
fn display_width(s: &str) -> usize {
    s.chars().filter(|c| {
        // Combining characters (U+0300-U+036F) don't take up space
        !matches!(*c, '\u{0300}'..='\u{036F}')
    }).count()
}

/// Export document to text format
/// Uses BeatDeriver directly from cells (same as HTML layout engine)
fn export_text(document: &crate::models::core::Document) -> String {
    use std::collections::BTreeMap;

    let doc_pitch_system = document.pitch_system.unwrap_or(crate::models::PitchSystem::Number);

    let mut output = String::new();

    // Build header (will be appended after notation)
    let header = build_header(document);

    // Group lines by system_id (same as compute_system_blocks in HTML layout)
    let mut systems: BTreeMap<usize, Vec<&crate::models::core::Line>> = BTreeMap::new();
    for line in &document.lines {
        systems.entry(line.system_id).or_default().push(line);
    }

    // Output each system
    for (_system_id, lines) in systems.iter() {
        let is_multi_line_system = lines.len() > 1;

        // Open bracket for multi-line systems
        if is_multi_line_system {
            output.push_str("<<\n");
        }

        // Output each line in this system
        for line in lines {
            let pitch_system = line.pitch_system.unwrap_or(doc_pitch_system);
            let text_line = compute_text_line_layout(line, pitch_system);

            // Label prefix (if present)
            if let Some(ref label) = text_line.label {
                output.push_str(label);
                output.push_str(": ");
            }

            // Tala line (above)
            if !text_line.tala_line.is_empty() {
                output.push_str(&text_line.tala_line);
                output.push('\n');
            }

            // Note line (main) - includes inline superscript ornaments
            output.push_str(&text_line.note_line);
            output.push('\n');

            // Lyric line (below)
            if !text_line.lyric_line.is_empty() {
                output.push_str(&text_line.lyric_line);
                output.push('\n');
            }
        }

        // Close bracket for multi-line systems
        if is_multi_line_system {
            output.push_str(">>\n");
        }

        // Add blank line between systems (notation lines)
        output.push('\n');
    }

    // Append directives after notation
    if !header.is_empty() {
        output.push_str(&header);
    }

    output.trim_end().to_string()
}

/// Build ABC-style header from document metadata
fn build_header(document: &crate::models::core::Document) -> String {
    let mut header = String::new();

    if let Some(ref title) = document.title {
        if !title.is_empty() {
            header.push_str("T: ");
            header.push_str(title);
            header.push('\n');
        }
    }

    if let Some(ref composer) = document.composer {
        if !composer.is_empty() {
            header.push_str("A: ");
            header.push_str(composer);
            header.push('\n');
        }
    }

    if let Some(ref key_sig) = document.key_signature {
        if !key_sig.is_empty() {
            header.push_str("K: ");
            header.push_str(key_sig);
            header.push('\n');
        }
    }

    // Check first line for time_signature and tempo (document-level defaults)
    if let Some(first_line) = document.lines.first() {
        if !first_line.time_signature.is_empty() {
            header.push_str("M: ");
            header.push_str(&first_line.time_signature);
            header.push('\n');
        }

        if !first_line.tempo.is_empty() {
            header.push_str("Q: ");
            header.push_str(&first_line.tempo);
            header.push('\n');
        }
    }

    if let Some(ref tonic) = document.tonic {
        header.push_str("X: ");
        header.push_str(&tonic.to_string());
        header.push('\n');
    }

    if let Some(ps) = document.pitch_system {
        header.push_str("Pitch System: ");
        header.push_str(&format!("{:?}", ps));
        header.push('\n');
    }

    header
}

// ============================================================================
// NEW ARCHITECTURE: Denormalized cell.char
// ============================================================================
// Line variants (underline/overline) are now computed in Document::compute_line_variants()
// and stored directly in cell.char. Text export just uses cell.char - no need to
// recalculate line states or apply combining characters.
//
// cell.char contains: pitch + octave + accidental + underline + overline

/// Compute text line layout from cells
/// Computes underline/overline states ONCE here, not relying on pre-computed values
fn compute_text_line_layout(
    line: &crate::models::core::Line,
    pitch_system: crate::models::PitchSystem,
) -> TextRenderLine {
    use crate::parse::beats::BeatDeriver;
    use crate::renderers::line_variants::{UnderlineState, OverlineState};

    let beat_deriver = BeatDeriver::new();
    let cells = &line.cells;

    // 1. Extract beats
    let beats = beat_deriver.extract_implicit_beats(cells);

    // 2. Compute underline states from beats (multi-cell beats get underlines)
    let mut underline_states: Vec<UnderlineState> = vec![UnderlineState::None; cells.len()];
    for beat in &beats {
        let start = beat.start;
        let end = beat.end;
        if start != end {
            // Multi-cell beat - apply underlines
            underline_states[start] = UnderlineState::Left;
            underline_states[end] = UnderlineState::Right;
            for i in (start + 1)..end {
                underline_states[i] = UnderlineState::Middle;
            }
        }
    }

    // 3. Compute overline states from slur indicators
    let mut overline_states: Vec<OverlineState> = vec![OverlineState::None; cells.len()];
    let mut in_slur = false;
    let mut slur_start_idx: Option<usize> = None;
    for (idx, cell) in cells.iter().enumerate() {
        if cell.is_slur_start() {
            in_slur = true;
            slur_start_idx = Some(idx);
            overline_states[idx] = OverlineState::Left;
        } else if cell.is_slur_end() {
            overline_states[idx] = OverlineState::Right;
            if let Some(start) = slur_start_idx {
                for i in (start + 1)..idx {
                    overline_states[i] = OverlineState::Middle;
                }
            }
            in_slur = false;
            slur_start_idx = None;
        } else if in_slur {
            overline_states[idx] = OverlineState::Middle;
        }
    }

    // 4. Build cell-to-beat mapping for spacing
    let mut cell_to_beat: Vec<Option<usize>> = vec![None; cells.len()];
    for (beat_idx, beat) in beats.iter().enumerate() {
        for cell_idx in beat.start..=beat.end {
            if cell_idx < cell_to_beat.len() {
                cell_to_beat[cell_idx] = Some(beat_idx);
            }
        }
    }

    // 5. Build note line - compute glyphs directly with underline/overline
    let mut note_line = String::new();
    let mut note_positions: Vec<usize> = Vec::new();
    let mut prev_beat: Option<usize> = None;

    for (cell_idx, cell) in cells.iter().enumerate() {
        let current_beat = cell_to_beat[cell_idx];
        let underline = underline_states[cell_idx];
        let overline = overline_states[cell_idx];
        let _cell_in_slur = overline != OverlineState::None;

        // Add space at beat boundary
        if current_beat != prev_beat && prev_beat.is_some() && current_beat.is_some() {
            note_line.push(' ');
        }

        note_positions.push(display_width(&note_line));

        // Ornament underline depends on position in rendered line:
        // - Before first pitch or after last pitch in beat → no underline
        // - Between pitches → underlined

        // NOTE: Ornament field removed. Grace notes are now superscript characters
        // stored directly in cell.char. The font renders them at 50% scale automatically.
        // Superscript cells are rendered inline like any other cell.

        // Render main cell with computed underline/overline
        let char_str = render_cell_with_lines(cell, pitch_system, underline, overline);
        note_line.push_str(&char_str);

        prev_beat = current_beat;
    }

    // 6. Build tala and lyric lines
    let tala_line = build_tala_line(&line.tala, cells, &note_positions, pitch_system);
    let lyric_line = build_lyric_line(line, cells, &note_positions);

    TextRenderLine {
        tala_line,
        note_line,
        lyric_line,
        label: if line.label.is_empty() { None } else { Some(line.label.clone()) },
    }
}

/// Render a cell with computed underline/overline states
fn render_cell_with_lines(
    cell: &crate::models::core::Cell,
    pitch_system: crate::models::PitchSystem,
    underline: crate::renderers::line_variants::UnderlineState,
    overline: crate::renderers::line_variants::OverlineState,
) -> String {
    use crate::models::ElementKind;
    use crate::renderers::line_variants::{get_line_variant_codepoint, UnderlineState, OverlineState};
    use crate::renderers::font_utils::glyph_for_pitch;

    // For non-pitched elements, use simple characters
    match cell.kind {
        ElementKind::SingleBarline => return "|".to_string(),
        ElementKind::RepeatLeftBarline => return "|:".to_string(),
        ElementKind::RepeatRightBarline => return ":|".to_string(),
        ElementKind::DoubleBarline => return "||".to_string(),
        ElementKind::Whitespace => return " ".to_string(),
        _ => {}
    }

    // Get base character for line variants
    let base_char = if let Some(pitch_code) = cell.pitch_code {
        // For pitched elements, get the display character from pitch
        let degree = pitch_code.degree();
        match pitch_system {
            crate::models::PitchSystem::Number => {
                char::from_digit(degree as u32, 10).unwrap_or('?')
            }
            crate::models::PitchSystem::Western => {
                match degree {
                    1 => 'C', 2 => 'D', 3 => 'E', 4 => 'F',
                    5 => 'G', 6 => 'A', 7 => 'B', _ => '?',
                }
            }
            crate::models::PitchSystem::Sargam => {
                match degree {
                    1 => 'S', 2 => 'R', 3 => 'G', 4 => 'M',
                    5 => 'P', 6 => 'D', 7 => 'N', _ => '?',
                }
            }
            _ => char::from_digit(degree as u32, 10).unwrap_or('?'),
        }
    } else {
        // Non-pitched: dash, breath mark, etc.
        match cell.kind {
            ElementKind::UnpitchedElement => '-',
            ElementKind::BreathMark => '\'',
            _ => return cell.char.clone(),
        }
    };

    // If no lines needed, return the base glyph (with octave if pitched)
    if underline == UnderlineState::None && overline == OverlineState::None {
        // For pitched elements, use the full glyph with octave
        if let Some(pitch_code) = cell.pitch_code {
            if let Some(glyph) = glyph_for_pitch(pitch_code, cell.octave, pitch_system) {
                return glyph.to_string();
            }
        }
        return base_char.to_string();
    }

    // Apply line variant
    if let Some(variant_char) = get_line_variant_codepoint(base_char, underline, overline) {
        variant_char.to_string()
    } else {
        // Fallback: return base glyph with octave
        if let Some(pitch_code) = cell.pitch_code {
            if let Some(glyph) = glyph_for_pitch(pitch_code, cell.octave, pitch_system) {
                return glyph.to_string();
            }
        }
        base_char.to_string()
    }
}

/// Render ornament cells inline as superscript glyphs
/// Returns a string of superscript characters with appropriate underlines/overlines
///
/// # Arguments
/// * `ornament_cells` - The cells containing the ornament notes
/// * `pitch_system` - The pitch system to use for glyph lookup
/// * `parent_in_slur` - Whether the parent cell is inside a slur (needs overline)
/// * `needs_underline` - Whether ornament is between pitches in a multi-cell beat (needs underline)
fn render_ornament_inline(
    ornament_cells: &[crate::models::core::Cell],
    pitch_system: crate::models::PitchSystem,
    parent_in_slur: bool,
    needs_underline: bool,
) -> String {
    use crate::renderers::font_utils::{glyph_for_pitch, superscript_glyph, SuperscriptOverline};

    let mut result = String::new();
    let _ornament_count = ornament_cells.len();

    for (_orn_idx, orn_cell) in ornament_cells.iter().enumerate() {
        if let Some(ref pitch_code) = orn_cell.pitch_code {
            // Get base glyph with octave encoded
            if let Some(base_glyph) = glyph_for_pitch(
                *pitch_code,
                orn_cell.octave,
                pitch_system,
            ) {
                // Determine line variant based on:
                // 1. needs_underline - whether ornament is between pitches in a multi-cell beat
                // 2. parent_in_slur - whether parent cell is inside a slur (needs overline)
                // 3. Combined variants when both underline AND overline are needed
                let line_variant = if needs_underline {
                    // Ornament is between pitches in beat - needs underline
                    // All ornament notes get middle underline (continuous line)
                    if parent_in_slur {
                        // Combined: underline for beat grouping + overline for slur
                        SuperscriptOverline::CombinedMiddleMiddle
                    } else {
                        // Underline only for beat grouping
                        SuperscriptOverline::UnderlineMiddle
                    }
                } else {
                    // Ornament is outside pitch span - no underline
                    if parent_in_slur {
                        SuperscriptOverline::OverlineMiddle
                    } else {
                        SuperscriptOverline::None
                    }
                };

                // Convert to superscript glyph (scaled with optional underline/overline)
                if let Some(superscript) = superscript_glyph(base_glyph as u32, line_variant) {
                    result.push(superscript);
                } else {
                    // Fallback to regular glyph if superscript not available
                    result.push(base_glyph);
                }
            } else {
                // Fallback to ASCII if glyph not found
                let ornament_char = pitch_code.to_string(pitch_system);
                result.push_str(&ornament_char);
            }
        }
    }

    result
}

/// Build tala line - positions tala characters above barlines
fn build_tala_line(
    tala: &str,
    cells: &[crate::models::core::Cell],
    note_positions: &[usize],
    _pitch_system: crate::models::PitchSystem,
) -> String {
    use crate::models::ElementKind;

    if tala.is_empty() {
        return String::new();
    }

    let mut tala_line = String::new();
    let mut tala_chars = tala.chars();
    let mut current_col = 0;

    for (cell_idx, cell) in cells.iter().enumerate() {
        if matches!(cell.kind, ElementKind::SingleBarline | ElementKind::DoubleBarline) {
            if let Some(tala_char) = tala_chars.next() {
                if cell_idx < note_positions.len() {
                    let target_col = note_positions[cell_idx];
                    while current_col < target_col {
                        tala_line.push(' ');
                        current_col += 1;
                    }
                    tala_line.push(tala_char);
                    current_col += 1;
                }
            }
        }
    }

    tala_line
}

/// Build lyric line - positions syllables below their notes
fn build_lyric_line(
    line: &crate::models::core::Line,
    cells: &[crate::models::core::Cell],
    note_positions: &[usize],
) -> String {
    use crate::html_layout::lyrics::distribute_lyrics;

    if line.lyrics.is_empty() {
        return String::new();
    }

    let assignments = distribute_lyrics(&line.lyrics, cells);

    let mut lyric_line = String::new();
    let mut current_col = 0;
    let mut prev_syllable_ends_with_dash = true; // Start true so first syllable doesn't get extra space

    for assignment in &assignments {
        if assignment.cell_index < note_positions.len() {
            let target_col = note_positions[assignment.cell_index];

            // If previous syllable didn't end with dash (was end of word),
            // ensure at least one space before this syllable.
            // This must be checked BEFORE padding, because the previous syllable
            // may have overflowed past target_col.
            if !prev_syllable_ends_with_dash && !lyric_line.is_empty() {
                lyric_line.push(' ');
                current_col += 1;
            }

            // Pad to position (only if we haven't already passed it)
            while current_col < target_col {
                lyric_line.push(' ');
                current_col += 1;
            }

            lyric_line.push_str(&assignment.syllable);
            current_col += display_width(&assignment.syllable);

            // Track if this syllable ends with dash (continues to next syllable)
            prev_syllable_ends_with_dash = assignment.syllable.ends_with('-');
        }
    }

    lyric_line
}

/// Convert a cell to its text representation
/// Uses display_char() for pitched elements (returns char with line variants encoded as PUA codepoints)
/// This matches HTML layout behavior - display_char() has the font glyph (e.g., G# composite with underline)
fn cell_to_text_char(cell: &crate::models::core::Cell, _pitch_system: crate::models::PitchSystem) -> String {
    use crate::models::ElementKind;

    match cell.kind {
        ElementKind::PitchedElement => {
            // Use display_char() - returns char with line variants encoded directly
            cell.display_char()
        }
        ElementKind::UnpitchedElement => "-".to_string(),
        ElementKind::Whitespace => " ".to_string(),
        ElementKind::SingleBarline => "|".to_string(),
        ElementKind::RepeatLeftBarline => "|:".to_string(),
        ElementKind::RepeatRightBarline => ":|".to_string(),
        ElementKind::DoubleBarline => "||".to_string(),
        ElementKind::BreathMark => "'".to_string(),
        _ => cell.display_char(),
    }
}

// ============================================================================
// LilyPond Conversion (MusicXML → LilyPond)
// ============================================================================

/// Convert MusicXML to LilyPond notation using template-based rendering
///
/// Converts a MusicXML 3.1 document to LilyPond source code with automatic template selection.
/// The template system (Minimal, Standard, or MultiStave) is selected internally based on:
/// - Number of parts (single vs. multiple)
/// - Presence of title/composer metadata
///
/// All templating and document structure decisions are made entirely within WASM - the web app
/// receives ready-to-render LilyPond source with proper formatting, spacing, and headers.
///
/// # Parameters
/// * `musicxml` - MusicXML 3.1 document as a string
/// * `settings_json` - Optional JSON string with conversion settings (null for defaults)
///
/// # Returns
/// JSON string containing:
/// - `lilypond_source`: The complete LilyPond document (includes headers, paper settings, etc.)
/// - `skipped_elements`: Array of elements that couldn't be converted
///
/// # Template Selection Logic
/// - **MultiStave**: Selected for scores with 2+ parts
/// - **Standard**: Selected for single-part scores with title or composer
/// - **Minimal**: Selected for simple single-part scores without metadata
///
/// # Example Settings JSON
/// ```json
/// {
///   "target_lilypond_version": "2.24.0",
///   "language": "English",
///   "convert_directions": true,
///   "convert_lyrics": true,
///   "convert_chord_symbols": true,
///   "title": "My Composition",
///   "composer": "John Doe"
/// }
/// ```
///
/// # Template Characteristics
/// - **Minimal**: Bare-bones, no headers, default layout
/// - **Standard**: Single-staff with compact layout (50mm height), metadata header, optimized for web
/// - **MultiStave**: Multiple staves with spacious layout (100mm height), optimized for scores
///
/// # Internal Processing
/// 1. Parse MusicXML document using roxmltree
/// 2. Convert to internal Music representation
/// 3. Extract musical content (notes, rests, durations)
/// 4. Build TemplateContext with metadata (title, composer, version)
/// 5. Select template based on content
/// 6. Render via Mustache template engine
/// 7. Return complete LilyPond document with fallback to hardcoded generation if needed
#[wasm_bindgen(js_name = convertMusicXMLToLilyPond)]
pub fn convert_musicxml_to_lilypond(musicxml: String, settings_json: Option<String>) -> Result<String, JsValue> {
    wasm_info!("convertMusicXMLToLilyPond called (template-based rendering)");

    // Parse settings if provided
    let settings = if let Some(json) = settings_json {
        serde_json::from_str(&json)
            .map_err(|e| {
                wasm_error!("Settings JSON parse error: {}", e);
                JsValue::from_str(&format!("Settings parse error: {}", e))
            })?
    } else {
        None
    };

    // Convert MusicXML to LilyPond (template-based rendering happens internally)
    let result = crate::converters::musicxml::convert_musicxml_to_lilypond(&musicxml, settings)
        .map_err(|e| {
            wasm_error!("Conversion error: {}", e);
            JsValue::from_str(&format!("Conversion error: {}", e))
        })?;

    // Serialize result to JSON
    let result_json = serde_json::to_string(&result)
        .map_err(|e| {
            wasm_error!("Result serialization error: {}", e);
            JsValue::from_str(&format!("Result serialization error: {}", e))
        })?;

    wasm_info!("  LilyPond generated: {} bytes", result.lilypond_source.len());
    if !result.skipped_elements.is_empty() {
        wasm_log!("  Skipped {} elements during conversion", result.skipped_elements.len());
    }
    wasm_info!("convertMusicXMLToLilyPond completed successfully");

    Ok(result_json)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{
        Cell, ElementKind, Line, Document, PitchCode,
        StaffRole, PitchSystem,
    };

    fn make_cell(char: &str, pitch_code: Option<PitchCode>, col: usize, octave: i8, kind: ElementKind) -> Cell {
        use crate::renderers::line_variants::{UnderlineState, OverlineState};
        let codepoint = char.chars().next().map(|c| c as u32).unwrap_or(0);
        Cell {
            codepoint,
            char: char.to_string(),
            kind,
            col,
            flags: 0,
            pitch_code,
            pitch_system: None,
            octave,
            superscript: false,
            underline: UnderlineState::None,
            overline: OverlineState::None,
            x: 0.0,
            y: 0.0,
            w: 1.0,
            h: 1.0,
            bbox: (0.0, 0.0, 1.0, 1.0),
            hit: (0.0, 0.0, 1.0, 1.0),
        }
    }

    fn make_line(cells: Vec<Cell>) -> Line {
        let mut line = Line {
            cells,
            text: Vec::new(),
            label: String::new(),
            tala: String::new(),
            lyrics: String::new(),
            tonic: None,
            pitch_system: None,
            key_signature: String::new(),
            time_signature: String::new(),
            tempo: String::new(),
            beats: Vec::new(),
            slurs: Vec::new(),
            part_id: "P1".to_string(),
            system_id: 1,
            staff_role: StaffRole::Melody,
            system_marker: None,
            new_system: false,
        };
        line.sync_text_from_cells();
        line
    }

    fn make_document(lines: Vec<Line>) -> Document {
        let mut doc = Document::new();
        doc.lines = lines;
        doc.pitch_system = Some(PitchSystem::Number);
        // Compute glyphs to populate cell.char with PUA codepoints
        // This mirrors what happens in the actual editor flow
        
        // Compute line variants (underlines for beat grouping, overlines for slurs)
        // This sets cell.char to variant codepoints directly
        doc.compute_line_variants();
        doc
    }

    // NOTE: Ornament field tests removed. Grace notes are now superscript characters
    // stored directly in cell.char. The IR builder detects superscripts and converts
    // them to grace notes. See src/renderers/font_utils.rs for conversion functions.

    #[test]
    fn test_text_export_multi_cell_beat_has_bracket_caps() {
        // Create three adjacent pitched cells (should form a multi-cell beat)
        // First cell: left arc, Middle cell: fullwidth underline, Last cell: right arc
        let cell1 = make_cell("1", Some(PitchCode::N1), 0, 0, ElementKind::PitchedElement);
        let cell2 = make_cell("2", Some(PitchCode::N2), 1, 0, ElementKind::PitchedElement);
        let cell3 = make_cell("3", Some(PitchCode::N3), 2, 0, ElementKind::PitchedElement);

        let line = make_line(vec![cell1, cell2, cell3]);
        let doc = make_document(vec![line]);

        let output = export_text(&doc);

        println!("Text export output for '123':");
        println!("{}", output);
        println!("Output chars:");
        for c in output.chars() {
            println!("  U+{:04X} '{}'", c as u32, c);
        }

        // Check for underline-only variants in 0xE800+ range
        // The font uses a combined underline+overline variant scheme.
        // Actual codepoints from the font:
        // '1' with left underline = 0xE834
        // '2' with middle underline = 0xE836
        // '3' with right underline = 0xE83B
        //
        // These are in the combined variant range for Number system pitches.

        let has_left_arc = output.chars().any(|c| c == '\u{E834}');
        let has_middle = output.chars().any(|c| c == '\u{E836}');
        let has_right_arc = output.chars().any(|c| c == '\u{E83B}');

        assert!(has_left_arc, "Output should contain left arc underline for '1' (U+E834)");
        assert!(has_middle, "Output should contain middle underline for '2' (U+E836)");
        assert!(has_right_arc, "Output should contain right arc underline for '3' (U+E83B)");
    }
}
