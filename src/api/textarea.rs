//! Textarea-based rendering API
//!
//! This module provides WASM functions for textarea-based notation rendering.
//! Instead of individual cell positions, we return line text with PUA glyphs
//! and character indices for overlay positioning (lyrics, tala markers).

use wasm_bindgen::prelude::*;
use serde::{Serialize, Deserialize};

use crate::api::helpers::lock_document;
use crate::wasm_info;
use crate::models::{PitchSystem, ElementKind};
use crate::parse::beats::BeatDeriver;
use crate::renderers::line_variants::{UnderlineState, OverlineState, get_line_variant_codepoint};
use crate::renderers::font_utils::{glyph_for_pitch, decode_char, DecodedChar};

// ============================================================================
// Types
// ============================================================================

/// Display data for a single line rendered as textarea
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct TextareaLineDisplay {
    /// Line index in document
    pub line_index: usize,

    /// Text content for the textarea (includes PUA glyphs with octave, underlines, etc.)
    pub text: String,

    /// Optional cursor position (character index in text)
    pub cursor_pos: Option<usize>,

    /// Optional selection range
    pub selection: Option<TextRange>,

    /// Lyrics overlay items with character positions
    pub lyrics: Vec<OverlayItem>,

    /// Tala marker overlay items with character positions
    pub talas: Vec<OverlayItem>,

    /// Optional line label
    pub label: Option<String>,

    /// Decoded glyph information for inspector display
    pub decoded_glyphs: Vec<DecodedGlyph>,
}

/// A text range (for selection)
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct TextRange {
    pub start: usize,
    pub end: usize,
}

/// An overlay item positioned at a character index
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct OverlayItem {
    /// Character index in the line text (0-based)
    pub char_index: usize,

    /// Content to display (syllable, tala marker, etc.)
    pub content: String,
}

/// Decoded glyph information for inspector display
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct DecodedGlyph {
    /// Character index in line text
    pub char_index: usize,

    /// The raw glyph character (may be PUA)
    pub glyph: String,

    /// Unicode codepoint (hex)
    pub codepoint: String,

    /// Decoded base character ('1', '2', 'S', '-', ' ', etc.)
    pub base_char: String,

    /// Pitch name if applicable (e.g., "N1", "Sa", "C")
    pub pitch: Option<String>,

    /// Octave offset (-2 to +2)
    pub octave: i8,

    /// Underline state for beat grouping
    pub underline: String,

    /// Overline state for slurs
    pub overline: String,
}

/// Result from textarea display list computation
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct TextareaDisplayList {
    /// All lines as textarea displays
    pub lines: Vec<TextareaLineDisplay>,

    /// Document title (optional)
    pub title: Option<String>,

    /// Document composer (optional)
    pub composer: Option<String>,
}

// ============================================================================
// WASM API Functions
// ============================================================================

/// Get textarea display data for a single line
///
/// Returns the line text with PUA glyphs plus overlay positions (lyrics, tala)
/// that JavaScript can use to position elements via mirror-div technique.
#[wasm_bindgen(js_name = getTextareaLineData)]
pub fn get_textarea_line_data(line_index: usize) -> Result<JsValue, JsValue> {
    wasm_info!("getTextareaLineData called for line {}", line_index);

    let doc_guard = lock_document()?;
    let document = doc_guard.as_ref()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    if line_index >= document.lines.len() {
        return Err(JsValue::from_str(&format!(
            "Line index {} out of bounds (document has {} lines)",
            line_index, document.lines.len()
        )));
    }

    let line = &document.lines[line_index];
    let pitch_system = line.pitch_system.unwrap_or(
        document.pitch_system.unwrap_or(PitchSystem::Number)
    );

    let display = compute_textarea_line_display(line, line_index, pitch_system, &document.state);

    serde_wasm_bindgen::to_value(&display)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}

/// Get textarea display data for all lines in the document
#[wasm_bindgen(js_name = getTextareaDisplayList)]
pub fn get_textarea_display_list() -> Result<JsValue, JsValue> {
    wasm_info!("getTextareaDisplayList called");

    let doc_guard = lock_document()?;
    let document = doc_guard.as_ref()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    let doc_pitch_system = document.pitch_system.unwrap_or(PitchSystem::Number);

    let lines: Vec<TextareaLineDisplay> = document.lines.iter()
        .enumerate()
        .map(|(idx, line)| {
            let pitch_system = line.pitch_system.unwrap_or(doc_pitch_system);
            compute_textarea_line_display(line, idx, pitch_system, &document.state)
        })
        .collect();

    let display_list = TextareaDisplayList {
        lines,
        title: document.title.clone(),
        composer: document.composer.clone(),
    };

    serde_wasm_bindgen::to_value(&display_list)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}

/// Set text content for a line (called when textarea input changes)
///
/// Parses the input text and updates the line's cells accordingly.
/// Returns the updated textarea display data for the line.
///
/// `cursor_char_pos`: Optional character position in the input text where cursor should be.
/// If None, cursor is placed at end of line.
#[wasm_bindgen(js_name = setLineText)]
pub fn set_line_text(line_index: usize, text: &str, cursor_char_pos: Option<usize>) -> Result<JsValue, JsValue> {
    wasm_info!("setLineText called for line {} with text: {:?}, cursor_char_pos: {:?}", line_index, text, cursor_char_pos);

    let mut doc_guard = lock_document()?;
    let document = doc_guard.as_mut()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    if line_index >= document.lines.len() {
        return Err(JsValue::from_str(&format!(
            "Line index {} out of bounds (document has {} lines)",
            line_index, document.lines.len()
        )));
    }

    // Get pitch system for this line
    let line_pitch_system = document.lines[line_index].pitch_system;
    let doc_pitch_system = document.pitch_system.unwrap_or(PitchSystem::Number);
    let pitch_system = line_pitch_system.unwrap_or(doc_pitch_system);

    // Parse text to cells, also getting char position mapping
    let (new_cells, char_boundaries) = parse_text_to_cells_with_positions(text, pitch_system);

    // Update the line's cells
    let new_cell_count = new_cells.len();
    document.lines[line_index].cells = new_cells;
    // Sync text field after replacing cells
    document.lines[line_index].sync_text_from_cells();

    // Update cursor position
    document.state.cursor.line = line_index;
    document.state.cursor.col = if let Some(char_pos) = cursor_char_pos {
        // Convert character position to cell index
        char_pos_to_cell_index(char_pos, &char_boundaries, new_cell_count)
    } else {
        // Default: cursor at end of line
        new_cell_count
    };

    // Compute and return updated display
    let display = compute_textarea_line_display(
        &document.lines[line_index],
        line_index,
        pitch_system,
        &document.state
    );

    wasm_info!("setLineText returning: text={:?} len={} cells={}",
               display.text, display.text.len(), document.lines[line_index].cells.len());

    serde_wasm_bindgen::to_value(&display)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}

/// Split a line at the given cell position
///
/// Creates a new line after the current one, moving cells after the split point
/// to the new line. Cursor is moved to the start of the new line.
///
/// Returns the updated TextareaDisplayList (since line count changes).
#[wasm_bindgen(js_name = splitLine)]
pub fn split_line(line_index: usize, cell_pos: usize) -> Result<JsValue, JsValue> {
    wasm_info!("splitLine called for line {} at cell_pos {}", line_index, cell_pos);

    let mut doc_guard = lock_document()?;
    let document = doc_guard.as_mut()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    if line_index >= document.lines.len() {
        return Err(JsValue::from_str(&format!(
            "Line index {} out of bounds (document has {} lines)",
            line_index, document.lines.len()
        )));
    }

    // Get pitch system for the line
    let line_pitch_system = document.lines[line_index].pitch_system;
    let doc_pitch_system = document.pitch_system.unwrap_or(PitchSystem::Number);
    let pitch_system = line_pitch_system.unwrap_or(doc_pitch_system);

    // Split cells at position
    let current_cells = &document.lines[line_index].cells;
    let split_pos = cell_pos.min(current_cells.len());

    // Cells for the new line (after split point)
    let new_line_cells: Vec<crate::models::core::Cell> = current_cells[split_pos..].to_vec();

    // Keep only cells before split point in current line
    document.lines[line_index].cells.truncate(split_pos);
    document.lines[line_index].sync_text_from_cells();

    // Create new line with remaining cells
    let mut new_line = crate::models::core::Line::new();
    new_line.pitch_system = Some(pitch_system);

    // Renumber columns in new line cells
    for (i, cell) in new_line_cells.into_iter().enumerate() {
        let mut cell = cell;
        cell.col = i;
        new_line.cells.push(cell);
    }
    new_line.sync_text_from_cells();

    // Insert new line after current line
    let new_line_index = line_index + 1;
    document.lines.insert(new_line_index, new_line);

    // Recalculate system and part IDs after adding new line
    document.recalculate_system_and_part_ids();

    // Update cursor to start of new line
    document.state.cursor.line = new_line_index;
    document.state.cursor.col = 0;

    // Return updated display list (all lines, since indices changed)
    let lines: Vec<TextareaLineDisplay> = document.lines.iter().enumerate().map(|(idx, line)| {
        let line_ps = line.pitch_system.unwrap_or(pitch_system);
        compute_textarea_line_display(line, idx, line_ps, &document.state)
    }).collect();

    let display_list = TextareaDisplayList {
        lines,
        title: document.title.clone(),
        composer: document.composer.clone(),
    };

    wasm_info!("splitLine: created new line at index {}, document now has {} lines",
               new_line_index, document.lines.len());

    serde_wasm_bindgen::to_value(&display_list)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}

/// Join a line with the previous line
///
/// Removes the line at line_index and appends its cells to the previous line.
/// Cursor is positioned at the join point (where the previous line ended).
///
/// Does nothing if line_index is 0 (first line has no previous line to join).
///
/// Returns the updated TextareaDisplayList.
#[wasm_bindgen(js_name = joinLines)]
pub fn join_lines(line_index: usize) -> Result<JsValue, JsValue> {
    wasm_info!("joinLines called for line {}", line_index);

    // Can't join first line with previous (no previous exists)
    if line_index == 0 {
        wasm_info!("joinLines: line 0 has no previous line, returning current state");
        // Return current display list unchanged
        return get_textarea_display_list();
    }

    let mut doc_guard = lock_document()?;
    let document = doc_guard.as_mut()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    if line_index >= document.lines.len() {
        return Err(JsValue::from_str(&format!(
            "Line index {} out of bounds (document has {} lines)",
            line_index, document.lines.len()
        )));
    }

    let prev_line_index = line_index - 1;

    // Get pitch system
    let line_pitch_system = document.lines[prev_line_index].pitch_system;
    let doc_pitch_system = document.pitch_system.unwrap_or(PitchSystem::Number);
    let pitch_system = line_pitch_system.unwrap_or(doc_pitch_system);

    // Record where to put cursor (end of previous line, before join)
    let cursor_col = document.lines[prev_line_index].cells.len();

    // Get cells from line to be removed
    let cells_to_append: Vec<crate::models::core::Cell> = document.lines[line_index].cells.clone();

    // Append cells to previous line, renumbering columns
    let start_col = document.lines[prev_line_index].cells.len();
    for (i, mut cell) in cells_to_append.into_iter().enumerate() {
        cell.col = start_col + i;
        document.lines[prev_line_index].cells.push(cell);
    }
    document.lines[prev_line_index].sync_text_from_cells();

    // Remove the joined line
    document.lines.remove(line_index);

    // Recalculate system and part IDs after removing line
    document.recalculate_system_and_part_ids();

    // Update cursor to join point on previous line
    document.state.cursor.line = prev_line_index;
    document.state.cursor.col = cursor_col;

    // Return updated display list
    let lines: Vec<TextareaLineDisplay> = document.lines.iter().enumerate().map(|(idx, line)| {
        let line_ps = line.pitch_system.unwrap_or(pitch_system);
        compute_textarea_line_display(line, idx, line_ps, &document.state)
    }).collect();

    let display_list = TextareaDisplayList {
        lines,
        title: document.title.clone(),
        composer: document.composer.clone(),
    };

    wasm_info!("joinLines: joined line {} with {}, document now has {} lines",
               line_index, prev_line_index, document.lines.len());

    serde_wasm_bindgen::to_value(&display_list)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}

/// Parse text string into cells, also returning char-to-cell position mapping.
///
/// Returns (cells, char_boundaries) where char_boundaries[i] is the starting
/// character position of cell i in the input text.
///
/// Uses longest-match parsing for multi-character pitch sequences (e.g., "1#", "1##", "1b").
/// Also handles:
/// - ASCII input ('1', 'S', '-', ' ', etc.)
/// - Pitch PUA glyphs (with octave variants)
/// - Line variant PUA glyphs (strips underline/overline - recomputed from beat context)
///
/// If the decoded character has a pitch_code, creates a PitchedElement cell.
/// Otherwise, uses the standard parser for the base character.
fn parse_text_to_cells_with_positions(text: &str, pitch_system: PitchSystem) -> (Vec<crate::models::core::Cell>, Vec<usize>) {
    use crate::parse::grammar::parse_single;
    use crate::models::core::Cell;
    use crate::models::pitch_systems::{PitchParser, NumberSystem, WesternSystem, SargamSystem};

    let mut cells = Vec::new();
    let mut char_boundaries = Vec::new(); // Starting char position for each cell
    let mut column = 0;
    let mut remaining = text;
    let mut char_pos = 0; // Current character position (not byte position)

    while !remaining.is_empty() {
        // Record starting character position for this cell
        char_boundaries.push(char_pos);

        // First, try longest-match parsing for multi-character pitches (e.g., "1#", "1##")
        let pitch_result = match pitch_system {
            PitchSystem::Number => NumberSystem::parse_pitch(remaining),
            PitchSystem::Western => WesternSystem::parse_pitch(remaining),
            PitchSystem::Sargam => SargamSystem::parse_pitch(remaining),
            _ => NumberSystem::parse_pitch(remaining),
        };

        if let Some((pitch_code, consumed)) = pitch_result {
            // Multi-character pitch found (or single-char pitch)
            let glyph_char = glyph_for_pitch(pitch_code, 0, pitch_system)
                .map(|g| g.to_string())
                .unwrap_or_else(|| remaining.chars().next().unwrap().to_string());

            let mut cell = Cell::new(glyph_char, ElementKind::PitchedElement, column);
            cell.pitch_system = Some(pitch_system);
            cell.pitch_code = Some(pitch_code);
            cell.octave = 0;
            cells.push(cell);

            // Count characters consumed (for char_pos tracking)
            let chars_consumed = remaining[..consumed].chars().count();
            char_pos += chars_consumed;

            // Advance past consumed bytes
            remaining = &remaining[consumed..];
            column += 1;
        } else {
            // Not a pitch - get single character and try decode_char (for PUA glyphs)
            let c = remaining.chars().next().unwrap();
            let char_len = c.len_utf8();

            // Check if this is a superscript codepoint (0xF8000 - 0xFE03F)
            let cp = c as u32;
            let is_superscript_cp = cp >= 0xF8000 && cp < 0xFE040;

            let decoded: DecodedChar = decode_char(c, pitch_system);

            if let Some(pitch_code) = decoded.pitch_code {
                // PUA glyph with pitch info
                // Check if following characters are accidentals (#, ##, b, bb)
                let after_char = &remaining[char_len..];
                let (final_pitch, accidental_consumed) = apply_trailing_accidental(pitch_code, after_char);

                // Generate glyph - if superscript, convert to superscript codepoint
                let glyph_char = if let Some(base_glyph) = glyph_for_pitch(final_pitch, decoded.octave, pitch_system) {
                    if is_superscript_cp {
                        // Convert to superscript glyph
                        crate::renderers::font_utils::to_superscript(base_glyph as u32)
                            .and_then(|cp| char::from_u32(cp))
                            .map(|c| c.to_string())
                            .unwrap_or_else(|| base_glyph.to_string())
                    } else {
                        base_glyph.to_string()
                    }
                } else {
                    decoded.base_char.to_string()
                };

                let mut cell = Cell::new(glyph_char, ElementKind::PitchedElement, column);
                cell.pitch_system = Some(pitch_system);
                cell.pitch_code = Some(final_pitch);
                cell.octave = decoded.octave;
                // Preserve superscript status from the original codepoint
                cell.superscript = is_superscript_cp;
                cells.push(cell);

                // Count characters: 1 for the PUA glyph + accidental chars
                let acc_chars = remaining[char_len..char_len + accidental_consumed].chars().count();
                char_pos += 1 + acc_chars;

                remaining = &remaining[char_len + accidental_consumed..];
            } else {
                // Non-pitched (dash, space, barline, etc.) - use standard parser
                let cell = parse_single(decoded.base_char, pitch_system, column, None);
                cells.push(cell);
                char_pos += 1;
                remaining = &remaining[char_len..];
            }

            column += 1;
        }
    }

    (cells, char_boundaries)
}

/// Wrapper for backward compatibility - just returns cells
fn parse_text_to_cells(text: &str, pitch_system: PitchSystem) -> Vec<crate::models::core::Cell> {
    parse_text_to_cells_with_positions(text, pitch_system).0
}

/// Convert character position to cell index using char_boundaries mapping.
///
/// char_boundaries[i] = starting char position of cell i.
/// Returns the cell index that contains or follows the given char position.
fn char_pos_to_cell_index(char_pos: usize, char_boundaries: &[usize], num_cells: usize) -> usize {
    // Find the cell whose boundary is <= char_pos
    // Binary search for efficiency, but simple linear for now
    for (cell_idx, &boundary) in char_boundaries.iter().enumerate() {
        if boundary >= char_pos {
            // char_pos is before or at this cell's start
            return cell_idx;
        }
    }
    // char_pos is past all boundaries - cursor at end
    num_cells
}

/// Apply trailing accidental characters (#, ##, b, bb) to a pitch code
///
/// When a PUA pitch glyph is followed by accidental characters, this function
/// combines them into the appropriate accidental variant.
///
/// Returns (modified_pitch_code, bytes_consumed)
fn apply_trailing_accidental(
    pitch_code: crate::models::pitch_code::PitchCode,
    after: &str
) -> (crate::models::pitch_code::PitchCode, usize) {
    use crate::models::pitch_code::PitchCode;

    let degree = pitch_code.degree();

    // Check for double accidentals first (longest match)
    if after.starts_with("##") {
        let double_sharp = match degree {
            1 => PitchCode::N1ss,
            2 => PitchCode::N2ss,
            3 => PitchCode::N3ss,
            4 => PitchCode::N4ss,
            5 => PitchCode::N5ss,
            6 => PitchCode::N6ss,
            7 => PitchCode::N7ss,
            _ => pitch_code,
        };
        return (double_sharp, 2);
    }

    if after.starts_with("bb") {
        let double_flat = match degree {
            1 => PitchCode::N1bb,
            2 => PitchCode::N2bb,
            3 => PitchCode::N3bb,
            4 => PitchCode::N4bb,
            5 => PitchCode::N5bb,
            6 => PitchCode::N6bb,
            7 => PitchCode::N7bb,
            _ => pitch_code,
        };
        return (double_flat, 2);
    }

    // Single accidentals
    if after.starts_with('#') {
        let sharp = match degree {
            1 => PitchCode::N1s,
            2 => PitchCode::N2s,
            3 => PitchCode::N3s,
            4 => PitchCode::N4s,
            5 => PitchCode::N5s,
            6 => PitchCode::N6s,
            7 => PitchCode::N7s,
            _ => pitch_code,
        };
        return (sharp, 1);
    }

    if after.starts_with('b') {
        let flat = match degree {
            1 => PitchCode::N1b,
            2 => PitchCode::N2b,
            3 => PitchCode::N3b,
            4 => PitchCode::N4b,
            5 => PitchCode::N5b,
            6 => PitchCode::N6b,
            7 => PitchCode::N7b,
            _ => pitch_code,
        };
        return (flat, 1);
    }

    // No accidental
    (pitch_code, 0)
}

// ============================================================================
// Internal Functions
// ============================================================================

/// Compute textarea display data for a single line
fn compute_textarea_line_display(
    line: &crate::models::core::Line,
    line_index: usize,
    pitch_system: PitchSystem,
    doc_state: &crate::models::core::DocumentState,
) -> TextareaLineDisplay {
    let beat_deriver = BeatDeriver::new();
    let cells = &line.cells;

    // 1. Extract beats for underline computation
    let beats = beat_deriver.extract_implicit_beats(cells);

    // 2. Compute underline states from beats (multi-cell beats get underlines)
    let mut underline_states: Vec<UnderlineState> = vec![UnderlineState::None; cells.len()];
    for beat in &beats {
        let start = beat.start;
        let end = beat.end;
        if start != end {
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

    // 5. Build text string and track positions for overlays
    let mut text = String::new();
    let mut cell_to_char_index: Vec<usize> = Vec::with_capacity(cells.len());
    let mut prev_beat: Option<usize> = None;

    for (cell_idx, cell) in cells.iter().enumerate() {
        let current_beat = cell_to_beat[cell_idx];
        let underline = underline_states[cell_idx];
        let overline = overline_states[cell_idx];

        // Add space at beat boundary
        if current_beat != prev_beat && prev_beat.is_some() && current_beat.is_some() {
            text.push(' ');
        }

        // Record character index for this cell
        cell_to_char_index.push(text.chars().count());

        // Render cell with lines
        let char_str = render_cell_with_lines(cell, pitch_system, underline, overline);
        text.push_str(&char_str);

        prev_beat = current_beat;
    }

    // 6. Build lyric overlays (map syllables to character positions)
    let lyrics = build_lyric_overlays(&line.lyrics, cells, &cell_to_char_index);

    // 7. Build tala overlays (position markers at barlines)
    let talas = build_tala_overlays(&line.tala, cells, &cell_to_char_index);

    // 8. Compute cursor/selection if on this line
    let (cursor_pos, selection) = compute_cursor_for_line(line_index, doc_state, &cell_to_char_index);

    // 9. Build decoded glyphs for inspector display
    let decoded_glyphs = build_decoded_glyphs(&text, pitch_system);

    TextareaLineDisplay {
        line_index,
        text,
        cursor_pos,
        selection,
        lyrics,
        talas,
        label: if line.label.is_empty() { None } else { Some(line.label.clone()) },
        decoded_glyphs,
    }
}

/// Convert pitch to display glyph with underline/overline/superscript transformations.
///
/// Uses the GlyphExt trait for composable, order-independent transformations.
fn to_glyph(
    pitch_system: PitchSystem,
    pitch_code: crate::models::pitch_code::PitchCode,
    octave: i8,
    underline: UnderlineState,
    overline: OverlineState,
    is_superscript: bool,
) -> char {
    use crate::renderers::font_utils::GlyphExt;

    glyph_for_pitch(pitch_code, octave, pitch_system)
        .unwrap_or('?')
        .underline(underline)
        .overline(overline)
        .superscript(is_superscript)
}

/// Get base ASCII character for a pitch code in a given system
fn pitch_to_base_char(pitch_code: crate::models::pitch_code::PitchCode, pitch_system: PitchSystem) -> char {
    let degree = pitch_code.degree();
    match pitch_system {
        PitchSystem::Number => char::from_digit(degree as u32, 10).unwrap_or('?'),
        PitchSystem::Western => match degree {
            1 => 'C', 2 => 'D', 3 => 'E', 4 => 'F',
            5 => 'G', 6 => 'A', 7 => 'B', _ => '?',
        },
        PitchSystem::Sargam => match degree {
            1 => 'S', 2 => 'R', 3 => 'G', 4 => 'M',
            5 => 'P', 6 => 'D', 7 => 'N', _ => '?',
        },
        _ => char::from_digit(degree as u32, 10).unwrap_or('?'),
    }
}

/// Render a cell to its display character with underline/overline variants
fn render_cell_with_lines(
    cell: &crate::models::core::Cell,
    pitch_system: PitchSystem,
    underline: UnderlineState,
    overline: OverlineState,
) -> String {
    // For non-pitched elements, use simple characters
    match cell.kind {
        ElementKind::SingleBarline => return "|".to_string(),
        ElementKind::RepeatLeftBarline => return "|:".to_string(),
        ElementKind::RepeatRightBarline => return ":|".to_string(),
        ElementKind::DoubleBarline => return "||".to_string(),
        ElementKind::Whitespace => return " ".to_string(),
        _ => {}
    }

    // For pitched elements, use the unified to_glyph lookup (with superscript support)
    if let Some(pitch_code) = cell.pitch_code {
        let glyph = to_glyph(pitch_system, pitch_code, cell.octave, underline, overline, cell.is_superscript());
        return glyph.to_string();
    }

    // For non-pitched elements (dash, breath mark, etc.)
    match cell.kind {
        ElementKind::UnpitchedElement => {
            if underline != UnderlineState::None || overline != OverlineState::None {
                get_line_variant_codepoint('-', underline, overline)
                    .map(|c| c.to_string())
                    .unwrap_or_else(|| "-".to_string())
            } else {
                "-".to_string()
            }
        }
        ElementKind::BreathMark => "'".to_string(),
        _ => cell.char.clone(),
    }
}

/// Build decoded glyph information for inspector display
fn build_decoded_glyphs(text: &str, pitch_system: PitchSystem) -> Vec<DecodedGlyph> {
    text.chars()
        .enumerate()
        .map(|(idx, ch)| {
            let decoded = decode_char(ch, pitch_system);
            let codepoint = ch as u32;

            DecodedGlyph {
                char_index: idx,
                glyph: ch.to_string(),
                codepoint: format!("U+{:04X}", codepoint),
                base_char: decoded.base_char.to_string(),
                pitch: decoded.pitch_code.map(|pc| format!("{:?}", pc)),
                octave: decoded.octave,
                underline: format!("{:?}", decoded.underline),
                overline: format!("{:?}", decoded.overline),
            }
        })
        .collect()
}

/// Build lyric overlay items from lyrics string
fn build_lyric_overlays(
    lyrics: &str,
    cells: &[crate::models::core::Cell],
    cell_to_char_index: &[usize],
) -> Vec<OverlayItem> {
    if lyrics.is_empty() {
        return Vec::new();
    }

    // Split lyrics by whitespace
    let syllables: Vec<&str> = lyrics.split_whitespace().collect();
    let mut overlays = Vec::new();

    // Find pitched cells (notes) to align lyrics to
    let pitched_cell_indices: Vec<usize> = cells.iter()
        .enumerate()
        .filter(|(_, cell)| cell.pitch_code.is_some())
        .map(|(idx, _)| idx)
        .collect();

    // Match syllables to pitched cells
    for (i, syllable) in syllables.iter().enumerate() {
        if i < pitched_cell_indices.len() {
            let cell_idx = pitched_cell_indices[i];
            if cell_idx < cell_to_char_index.len() {
                overlays.push(OverlayItem {
                    char_index: cell_to_char_index[cell_idx],
                    content: syllable.to_string(),
                });
            }
        }
    }

    overlays
}

/// Build tala overlay items from tala string
fn build_tala_overlays(
    tala: &str,
    cells: &[crate::models::core::Cell],
    cell_to_char_index: &[usize],
) -> Vec<OverlayItem> {
    if tala.is_empty() {
        return Vec::new();
    }

    let mut overlays = Vec::new();

    // Find barline positions
    let barline_indices: Vec<usize> = cells.iter()
        .enumerate()
        .filter(|(_, cell)| matches!(cell.kind,
            ElementKind::SingleBarline |
            ElementKind::DoubleBarline |
            ElementKind::RepeatLeftBarline |
            ElementKind::RepeatRightBarline
        ))
        .map(|(idx, _)| idx)
        .collect();

    // Split tala markers by whitespace
    let markers: Vec<&str> = tala.split_whitespace().collect();

    // Tala markers are placed at measure starts (after barlines)
    // First marker at position 0 (start of line)
    if !markers.is_empty() && !cell_to_char_index.is_empty() {
        overlays.push(OverlayItem {
            char_index: 0,
            content: markers[0].to_string(),
        });
    }

    // Remaining markers after each barline
    for (i, &barline_idx) in barline_indices.iter().enumerate() {
        let marker_idx = i + 1;  // Offset by 1 since first marker is at position 0
        if marker_idx < markers.len() && barline_idx + 1 < cell_to_char_index.len() {
            // Position marker at cell AFTER the barline
            overlays.push(OverlayItem {
                char_index: cell_to_char_index[barline_idx + 1],
                content: markers[marker_idx].to_string(),
            });
        }
    }

    overlays
}

/// Compute cursor position and selection for a line
fn compute_cursor_for_line(
    line_index: usize,
    doc_state: &crate::models::core::DocumentState,
    cell_to_char_index: &[usize],
) -> (Option<usize>, Option<TextRange>) {
    // Check if cursor is on this line
    if doc_state.cursor.line != line_index {
        return (None, None);
    }

    // Convert cell column to character index
    let cursor_col = doc_state.cursor.col;
    let cursor_pos = if cursor_col < cell_to_char_index.len() {
        Some(cell_to_char_index[cursor_col])
    } else if !cell_to_char_index.is_empty() {
        // Cursor at end of line
        Some(cell_to_char_index.last().copied().unwrap_or(0) + 1)
    } else {
        Some(0)
    };

    // Check for selection via selection_manager
    let selection = if let Some(ref sel) = doc_state.selection_manager.current_selection {
        let anchor = &sel.anchor;
        let head = &sel.head;

        // Check if this line is involved in the selection
        if anchor.line == line_index || head.line == line_index {
            // For single-line selection
            if anchor.line == head.line && anchor.line == line_index {
                let start_col = anchor.col.min(head.col);
                let end_col = anchor.col.max(head.col);

                let start = if start_col < cell_to_char_index.len() {
                    cell_to_char_index[start_col]
                } else {
                    0
                };
                let end = if end_col < cell_to_char_index.len() {
                    cell_to_char_index[end_col]
                } else if !cell_to_char_index.is_empty() {
                    cell_to_char_index.last().copied().unwrap_or(0) + 1
                } else {
                    0
                };

                if start != end {
                    Some(TextRange { start, end })
                } else {
                    None
                }
            } else {
                // Multi-line selection - not fully handled yet
                None
            }
        } else {
            None
        }
    } else {
        None
    };

    (cursor_pos, selection)
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_overlay_item_serialization() {
        let item = OverlayItem {
            char_index: 5,
            content: "sa".to_string(),
        };

        let json = serde_json::to_string(&item).unwrap();
        assert!(json.contains("\"char_index\":5"));
        assert!(json.contains("\"content\":\"sa\""));
    }

    #[test]
    fn test_text_range_serialization() {
        let range = TextRange { start: 0, end: 10 };
        let json = serde_json::to_string(&range).unwrap();
        assert!(json.contains("\"start\":0"));
        assert!(json.contains("\"end\":10"));
    }

    #[test]
    fn test_parse_text_to_cells_basic() {
        let cells = parse_text_to_cells("1", PitchSystem::Number);
        println!("Cells: {:?}", cells);
        assert_eq!(cells.len(), 1);
        assert_eq!(cells[0].pitch_code, Some(crate::models::pitch_code::PitchCode::N1));
    }

    #[test]
    fn test_render_cell_with_lines_basic() {
        use crate::models::core::Cell;

        let mut cell = Cell::new("".to_string(), ElementKind::PitchedElement, 0);
        cell.pitch_code = Some(crate::models::pitch_code::PitchCode::N1);
        cell.octave = 0;

        let rendered = render_cell_with_lines(&cell, PitchSystem::Number, UnderlineState::None, OverlineState::None);
        println!("Rendered: {:?} len={}", rendered, rendered.len());
        assert!(!rendered.is_empty(), "render_cell_with_lines should not return empty string");
    }

    #[test]
    fn test_compute_display_text_for_single_cell() {
        use crate::models::core::DocumentState;

        // Create a line with one cell via JSON
        let line_json = r#"{"cells": [], "label": "", "tala": "", "lyrics": ""}"#;
        let mut line: crate::models::core::Line = serde_json::from_str(line_json).unwrap();

        // Add parsed cells
        line.cells = parse_text_to_cells("1", PitchSystem::Number);
        println!("Cells: {:?}", line.cells);

        let doc_state = DocumentState::default();

        let display = compute_textarea_line_display(&line, 0, PitchSystem::Number, &doc_state);
        println!("Display text: {:?} len={}", display.text, display.text.len());
        println!("Display: {:?}", display);
        assert!(!display.text.is_empty(), "Display text should not be empty for '1' input");
    }

    #[test]
    fn test_parse_pua_then_ascii_mixed_input() {
        // Simulate what happens when user types "123" in textarea:
        // 1. Type "1" → setLineText("1") → returns PUA character \u{e000}
        // 2. Type "2" at end → browser has "\u{e000}2" → setLineText should parse correctly
        // 3. Type "3" at end → browser has "PUA PUA 3" → setLineText should parse correctly

        // Step 1: Parse "1"
        let cells1 = parse_text_to_cells("1", PitchSystem::Number);
        assert_eq!(cells1.len(), 1);
        assert_eq!(cells1[0].pitch_code, Some(crate::models::pitch_code::PitchCode::N1));

        // Get the PUA character that would be returned
        let pua_char = glyph_for_pitch(crate::models::pitch_code::PitchCode::N1, 0, PitchSystem::Number)
            .expect("Should get glyph for N1");
        println!("PUA char for N1: U+{:04X}", pua_char as u32);

        // Step 2: Parse "PUA + 2" (simulating user typed 2 after 1)
        let mixed_input = format!("{}2", pua_char);
        println!("Mixed input: {:?}", mixed_input);
        let cells2 = parse_text_to_cells(&mixed_input, PitchSystem::Number);
        println!("Cells from mixed input: {:?}", cells2);

        assert_eq!(cells2.len(), 2, "Should have 2 cells from '{}2'", pua_char);
        assert_eq!(cells2[0].pitch_code, Some(crate::models::pitch_code::PitchCode::N1), "First cell should be N1");
        assert_eq!(cells2[1].pitch_code, Some(crate::models::pitch_code::PitchCode::N2), "Second cell should be N2");

        // Step 3: Parse "PUA + PUA + 3"
        let pua_char2 = glyph_for_pitch(crate::models::pitch_code::PitchCode::N2, 0, PitchSystem::Number)
            .expect("Should get glyph for N2");
        let mixed_input3 = format!("{}{}3", pua_char, pua_char2);
        let cells3 = parse_text_to_cells(&mixed_input3, PitchSystem::Number);
        println!("Cells from 3-char mixed: {:?}", cells3);

        assert_eq!(cells3.len(), 3, "Should have 3 cells");
        assert_eq!(cells3[0].pitch_code, Some(crate::models::pitch_code::PitchCode::N1));
        assert_eq!(cells3[1].pitch_code, Some(crate::models::pitch_code::PitchCode::N2));
        assert_eq!(cells3[2].pitch_code, Some(crate::models::pitch_code::PitchCode::N3));
    }

    #[test]
    fn test_parse_sharp_ascii() {
        // Test parsing ASCII "1#2" directly
        let cells = parse_text_to_cells("1#2", PitchSystem::Number);
        println!("Cells from '1#2': {:?}", cells);
        assert_eq!(cells.len(), 2, "Should have 2 cells: 1# and 2");
        assert_eq!(cells[0].pitch_code, Some(crate::models::pitch_code::PitchCode::N1s), "First should be N1s (sharp 1)");
        assert_eq!(cells[1].pitch_code, Some(crate::models::pitch_code::PitchCode::N2), "Second should be N2");
    }

    #[test]
    fn test_parse_pua_followed_by_sharp() {
        // Simulate: user types "1", gets N1 glyph, then types "#"
        // Browser sends: "<N1 glyph>#"
        let n1_glyph = glyph_for_pitch(crate::models::pitch_code::PitchCode::N1, 0, PitchSystem::Number)
            .expect("Should get glyph for N1");
        println!("N1 glyph: U+{:04X}", n1_glyph as u32);

        let input = format!("{}#", n1_glyph);
        println!("Input string: {:?}", input);
        let cells = parse_text_to_cells(&input, PitchSystem::Number);
        println!("Cells from '<N1>#': {:?}", cells);

        assert_eq!(cells.len(), 1, "Should combine PUA + # into single sharp cell");
        assert_eq!(cells[0].pitch_code, Some(crate::models::pitch_code::PitchCode::N1s), "Should be N1s (sharp 1)");
    }

    #[test]
    fn test_parse_pua_sharp_then_2() {
        // Simulate: user types "1#2"
        // After "1": N1 glyph
        // After "1#": N1s glyph
        // After "1#2": N1s glyph + N2 glyph
        // But browser sees: "<N1s glyph>2" or "<N1 glyph>#2"?

        // Case 1: ASCII "1#2" all at once
        let cells1 = parse_text_to_cells("1#2", PitchSystem::Number);
        println!("ASCII '1#2': {:?}", cells1);
        assert_eq!(cells1.len(), 2);

        // Case 2: N1 glyph + "#2"
        let n1_glyph = glyph_for_pitch(crate::models::pitch_code::PitchCode::N1, 0, PitchSystem::Number)
            .expect("Should get glyph for N1");
        let input2 = format!("{}#2", n1_glyph);
        let cells2 = parse_text_to_cells(&input2, PitchSystem::Number);
        println!("<N1>#2: {:?}", cells2);
        assert_eq!(cells2.len(), 2, "Should combine N1+# and then parse 2");
        assert_eq!(cells2[0].pitch_code, Some(crate::models::pitch_code::PitchCode::N1s));
        assert_eq!(cells2[1].pitch_code, Some(crate::models::pitch_code::PitchCode::N2));
    }

    #[test]
    fn test_display_text_no_spaces_for_adjacent_pitches() {
        // Test that compute_textarea_line_display doesn't add spaces between adjacent pitched cells
        // when they are in the same beat

        // Create line with two adjacent pitched cells: N1s and N2
        let mut line = crate::models::core::Line::new();
        let mut cell1 = crate::models::core::Cell::new(
            "\u{E019}".to_string(), // N1s glyph
            ElementKind::PitchedElement,
            0
        );
        cell1.pitch_code = Some(crate::models::pitch_code::PitchCode::N1s);
        cell1.pitch_system = Some(PitchSystem::Number);

        let mut cell2 = crate::models::core::Cell::new(
            "\u{E01E}".to_string(), // N2 glyph
            ElementKind::PitchedElement,
            1
        );
        cell2.pitch_code = Some(crate::models::pitch_code::PitchCode::N2);
        cell2.pitch_system = Some(PitchSystem::Number);

        line.cells = vec![cell1, cell2];
        line.sync_text_from_cells();

        // Create minimal document state for cursor (not on this line)
        let doc_state = crate::models::core::DocumentState::new();

        // Compute display
        let display = compute_textarea_line_display(&line, 0, PitchSystem::Number, &doc_state);

        println!("Display text: {:?}", display.text);
        println!("Display text chars: {:?}", display.text.chars().collect::<Vec<_>>());
        println!("Display text length: {}", display.text.chars().count());

        // Should be exactly 2 characters - no spaces added
        assert_eq!(
            display.text.chars().count(),
            2,
            "Should have exactly 2 characters (no spaces for adjacent pitches in same beat)"
        );
    }
}
