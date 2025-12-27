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
use crate::undo::Command;
use crate::parse::beats::BeatDeriver;
use crate::renderers::line_variants::{LowerLoopRole, SlurRole, get_line_variant_codepoint};
use crate::renderers::font_utils::{glyph_for_pitch, decode_char, DecodedChar};
use crate::html_layout::lyrics::parse_lyrics;

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

    /// Lyrics overlay items with final pixel positions
    pub lyrics: Vec<OverlayItem>,

    /// Tala marker overlay items with final pixel positions
    pub talas: Vec<OverlayItem>,

    /// Optional line label
    pub label: Option<String>,

    /// Decoded glyph information for inspector display
    pub decoded_glyphs: Vec<DecodedGlyph>,

    /// Character indices of pitched notes (for JS to measure positions)
    /// JS should measure x_px at each of these indices and pass back to compute_lyric_layout
    pub pitched_char_indices: Vec<usize>,

    /// Syllable texts (for JS to measure widths)
    pub syllable_texts: Vec<String>,
}

/// A text range (for selection)
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct TextRange {
    pub start: usize,
    pub end: usize,
}

/// An overlay item with final pixel position
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct OverlayItem {
    /// Final x position in pixels (relative to textarea content box, after padding)
    /// This is the authoritative position - JS should render here without further computation
    pub x_px: f32,

    /// Content to display (syllable, tala marker, etc.)
    pub content: String,

    /// Anchor char index (for reference/debugging, not for positioning)
    #[serde(default)]
    pub anchor_char_index: usize,
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
///
/// Phase 1 of lyric rendering:
/// - Returns text content, pitched_char_indices, and syllable_texts for each line
/// - JS measures note positions and syllable widths
/// - Then JS calls computeLyricLayout() with measurements for each line
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

/// Compute lyric layout with collision avoidance
///
/// This is the second phase of lyric rendering:
/// 1. First, JS calls getTextareaDisplayList() to get pitched_char_indices and syllable_texts
/// 2. JS measures note_positions (x_px for each pitched note) and syllable_widths
/// 3. JS calls this function with those measurements
/// 4. WASM computes final x_px positions with collision avoidance
/// 5. JS renders lyrics at those positions (no further computation needed)
///
/// Input structure per line:
/// - note_positions: Array of x_px values for each pitched note (from mirror div)
/// - syllable_widths: Array of pixel widths for each syllable
/// - syllable_texts: Array of syllable strings
///
/// Returns array of OverlayItem with final x_px positions
#[wasm_bindgen(js_name = computeLyricLayout)]
pub fn compute_lyric_layout(
    line_index: usize,
    note_positions_js: JsValue,
    syllable_widths_js: JsValue,
) -> Result<JsValue, JsValue> {
    // Parse inputs from JavaScript
    let note_positions: Vec<f32> = serde_wasm_bindgen::from_value(note_positions_js)
        .map_err(|e| JsValue::from_str(&format!("Failed to parse note_positions: {}", e)))?;
    let syllable_widths: Vec<f32> = serde_wasm_bindgen::from_value(syllable_widths_js)
        .map_err(|e| JsValue::from_str(&format!("Failed to parse syllable_widths: {}", e)))?;

    // Get syllable texts from document
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
    // Use parse_lyrics to properly handle hyphenated syllables like "shake-spear" -> ["shake-", "spear"]
    let syllable_texts: Vec<String> = parse_lyrics(&line.lyrics);
    let syllable_refs: Vec<&str> = syllable_texts.iter().map(|s| s.as_str()).collect();

    // Compute layout with collision avoidance
    let overlays = compute_lyric_positions(&note_positions, &syllable_widths, &syllable_refs);

    serde_wasm_bindgen::to_value(&overlays)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}

/// Pure function: compute lyric positions with collision avoidance
///
/// This is deterministic and testable in Rust without browser.
/// Input: measured note positions (center positions for lyrics) and syllable widths
/// Output: final x_px position for each syllable (center position, CSS uses translateX(-50%))
///
/// Lyrics are CENTERED on their position via CSS: transform: translateX(-50%)
/// This means:
///   - Visual left edge = x_px - width/2
///   - Visual right edge = x_px + width/2
///
/// For no collision between adjacent syllables:
///   - prev_right + MIN_GAP < next_left
///   - prev_center + prev_width/2 + MIN_GAP < next_center - next_width/2
///   - next_center > prev_center + prev_width/2 + MIN_GAP + next_width/2
fn compute_lyric_positions(
    note_positions: &[f32],
    syllable_widths: &[f32],
    syllable_texts: &[&str],
) -> Vec<OverlayItem> {
    const MIN_GAP: f32 = 4.0; // minimum pixels between lyrics

    let mut overlays = Vec::new();
    let mut prev_center: f32 = f32::NEG_INFINITY;
    let mut prev_half_width: f32 = 0.0;

    for (i, syllable) in syllable_texts.iter().enumerate() {
        // Get note position for this syllable (syllable i -> note i)
        // note_x is the center position for this lyric
        let note_x = note_positions.get(i).copied().unwrap_or(0.0);

        // Get syllable width and half-width for centered positioning
        let width = syllable_widths.get(i).copied().unwrap_or(20.0);
        let half_width = width / 2.0;

        // For centered positioning:
        // - Previous lyric's visual right edge = prev_center + prev_half_width
        // - This lyric's visual left edge = center - half_width
        // For no collision: prev_right + MIN_GAP < this_left
        // => prev_center + prev_half_width + MIN_GAP < center - half_width
        // => center > prev_center + prev_half_width + MIN_GAP + half_width
        let min_center = prev_center + prev_half_width + MIN_GAP + half_width;
        let actual_center = note_x.max(min_center);

        overlays.push(OverlayItem {
            x_px: actual_center,
            content: syllable.to_string(),
            anchor_char_index: i, // Use index as reference (note index, not char index)
        });

        // Update for next iteration
        prev_center = actual_center;
        prev_half_width = half_width;
    }

    overlays
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

    // Save old cells and cursor position for undo
    let old_cells = document.lines[line_index].cells.clone();
    let old_cursor_col = document.state.cursor.col;

    // Parse text to cells, also getting char position mapping
    let (new_cells, char_boundaries) = parse_text_to_cells_with_positions(text, pitch_system);

    // Update the line's cells
    let new_cell_count = new_cells.len();

    // Calculate new cursor position
    let new_cursor_col = if let Some(char_pos) = cursor_char_pos {
        // Convert character position to cell index
        char_pos_to_cell_index(char_pos, &char_boundaries, new_cell_count)
    } else {
        // Default: cursor at end of line
        new_cell_count
    };

    // Only push undo command if cells actually changed
    if old_cells != new_cells {
        let command = Command::ReplaceLine {
            line: line_index,
            old_cells,
            new_cells: new_cells.clone(),
            old_cursor_col,
            new_cursor_col,
        };
        let cursor_pos = (line_index, new_cursor_col);
        document.state.undo_stack.push(command, cursor_pos);
    }

    document.lines[line_index].cells = new_cells;
    // Sync text field after replacing cells
    document.lines[line_index].sync_text_from_cells();

    // Update cursor position
    document.state.cursor.line = line_index;
    document.state.cursor.col = new_cursor_col;

    // Compute and return updated display
    let display = compute_textarea_line_display(
        &document.lines[line_index],
        line_index,
        pitch_system,
        &document.state,
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

    // Add cells to new line (no need to renumber - col field removed)
    for cell in new_line_cells.into_iter() {
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

    // Append cells to previous line (no need to renumber - col field removed)
    for cell in cells_to_append.into_iter() {
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
    let _column = 0;
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

            let cell = Cell::new(glyph_char, ElementKind::PitchedElement);
            // pitch_code and pitch_system are derived from codepoint via getters
            // octave 0 is already encoded in the codepoint from glyph_for_pitch
            cells.push(cell);

            // Count characters consumed (for char_pos tracking)
            let chars_consumed = remaining[..consumed].chars().count();
            char_pos += chars_consumed;

            // Advance past consumed bytes
            remaining = &remaining[consumed..];
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

                let mut cell = Cell::new(glyph_char, ElementKind::PitchedElement);
                // pitch_code and pitch_system are derived from codepoint via getters
                // octave is already encoded in the codepoint from glyph_for_pitch
                // Preserve superscript status from the original codepoint
                cell.set_superscript(is_superscript_cp);
                cells.push(cell);

                // Count characters: 1 for the PUA glyph + accidental chars
                let acc_chars = remaining[char_len..char_len + accidental_consumed].chars().count();
                char_pos += 1 + acc_chars;

                remaining = &remaining[char_len + accidental_consumed..];
            } else {
                // Non-pitched (dash, space, barline, etc.) - use standard parser
                let cell = parse_single(decoded.base_char, pitch_system, None);
                cells.push(cell);
                char_pos += 1;
                remaining = &remaining[char_len..];
            }
        }
    }

    (cells, char_boundaries)
}

/// Wrapper for backward compatibility - just returns cells
fn parse_text_to_cells(text: &str, pitch_system: PitchSystem) -> Vec<crate::models::core::Cell> {
    parse_text_to_cells_with_positions(text, pitch_system).0
}

/// Public wrapper for parse_text_to_cells (used by pasteText in core.rs)
pub fn parse_text_to_cells_public(text: &str, pitch_system: PitchSystem) -> Vec<crate::models::core::Cell> {
    parse_text_to_cells(text, pitch_system)
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
    let mut lower_loop_roles: Vec<LowerLoopRole> = vec![LowerLoopRole::None; cells.len()];
    for beat in &beats {
        let start = beat.start;
        let end = beat.end;
        if start != end {
            lower_loop_roles[start] = LowerLoopRole::Left;
            lower_loop_roles[end] = LowerLoopRole::Right;
            for i in (start + 1)..end {
                lower_loop_roles[i] = LowerLoopRole::Middle;
            }
        }
    }

    // 3. Compute overline states from slur indicators
    let mut slur_roles: Vec<SlurRole> = vec![SlurRole::None; cells.len()];
    let mut in_slur = false;
    let mut slur_start_idx: Option<usize> = None;
    for (idx, cell) in cells.iter().enumerate() {
        if cell.is_slur_start() {
            in_slur = true;
            slur_start_idx = Some(idx);
            slur_roles[idx] = SlurRole::Left;
        } else if cell.is_slur_end() {
            slur_roles[idx] = SlurRole::Right;
            if let Some(start) = slur_start_idx {
                for i in (start + 1)..idx {
                    slur_roles[i] = SlurRole::Middle;
                }
            }
            in_slur = false;
            slur_start_idx = None;
        } else if in_slur {
            slur_roles[idx] = SlurRole::Middle;
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
        let underline = lower_loop_roles[cell_idx];
        let overline = slur_roles[cell_idx];

        // Add space at beat boundary
        if current_beat != prev_beat && prev_beat.is_some() && current_beat.is_some() {
            text.push(' ');
        }

        // Record character index for this cell
        cell_to_char_index.push(text.chars().count());

        // Render cell with lines
        let char_str = render_cell_with_lines(cell, underline, overline);
        text.push_str(&char_str);

        prev_beat = current_beat;
    }

    // 6. Extract pitched char indices (for JS to measure note positions)
    let pitched_char_indices: Vec<usize> = cells.iter()
        .enumerate()
        .filter(|(_, cell)| cell.get_pitch_code().is_some())
        .filter_map(|(cell_idx, _)| cell_to_char_index.get(cell_idx).copied())
        .collect();

    // 7. Extract syllable texts (for JS to measure widths)
    // Use parse_lyrics to properly handle hyphenated syllables like "shake-spear" -> ["shake-", "spear"]
    let syllable_texts: Vec<String> = parse_lyrics(&line.lyrics);

    // 8. Lyrics will be computed by compute_lyric_layout after JS measures positions
    // For now, return empty - JS will call compute_lyric_layout with measurements
    let lyrics = Vec::new();

    // 9. Build tala overlays (position markers at barlines)
    let talas = build_tala_overlays(&line.tala, cells, &cell_to_char_index);

    // 10. Compute cursor/selection if on this line
    let (cursor_pos, selection) = compute_cursor_for_line(line_index, doc_state, &cell_to_char_index);

    // 11. Build decoded glyphs for inspector display
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
        pitched_char_indices,
        syllable_texts,
    }
}

/// Get base ASCII character for a pitch code in a given system
#[allow(dead_code)]
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

/// Render a cell to its display character with lower_loop/slur variants
fn render_cell_with_lines(
    cell: &crate::models::core::Cell,
    lower_loop: LowerLoopRole,
    slur: SlurRole,
) -> String {
    use crate::renderers::font_utils::GlyphExt;

    // For non-pitched elements, use simple characters
    match cell.get_kind() {
        ElementKind::SingleBarline => return "|".to_string(),
        ElementKind::RepeatLeftBarline => return "|:".to_string(),
        ElementKind::RepeatRightBarline => return ":|".to_string(),
        ElementKind::DoubleBarline => return "||".to_string(),
        ElementKind::Whitespace => return " ".to_string(),
        _ => {}
    }

    // For pitched elements, use the cell's stored character (don't regenerate based on pitch_system!)
    // The cell already has the correct glyph for its pitch system - we just need to apply line variants
    if cell.get_pitch_code().is_some() {
        // Get the base glyph from the cell (already has correct pitch representation)
        let base_glyph = cell.get_char_string()
            .chars()
            .next()
            .unwrap_or('?');

        // Apply lower_loop/slur/superscript transformations to the existing glyph
        let transformed = base_glyph
            .lower_loop(lower_loop)
            .slur(slur)
            .superscript(cell.is_superscript());

        return transformed.to_string();
    }

    // For non-pitched elements (dash, breath mark, etc.)
    match cell.get_kind() {
        ElementKind::UnpitchedElement => {
            if lower_loop != LowerLoopRole::None || slur != SlurRole::None {
                get_line_variant_codepoint('-', lower_loop, slur)
                    .map(|c| c.to_string())
                    .unwrap_or_else(|| "-".to_string())
            } else {
                "-".to_string()
            }
        }
        ElementKind::BreathMark => "'".to_string(),
        _ => cell.get_char_string(),
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
                underline: format!("{:?}", decoded.lower_loop),
                overline: format!("{:?}", decoded.slur),
            }
        })
        .collect()
}

/// Build tala overlay items from tala string
///
/// For tala markers, we return anchor_char_index and x_px = 0.
/// JS will measure the actual x position from anchor_char_index using mirror div.
/// (Talas don't need collision avoidance - they're sparse and attached to barlines)
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
        .filter(|(_, cell)| matches!(cell.get_kind(),
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
            x_px: 0.0, // JS will compute from anchor_char_index
            content: markers[0].to_string(),
            anchor_char_index: 0,
        });
    }

    // Remaining markers after each barline
    for (i, &barline_idx) in barline_indices.iter().enumerate() {
        let marker_idx = i + 1;  // Offset by 1 since first marker is at position 0
        if marker_idx < markers.len() && barline_idx + 1 < cell_to_char_index.len() {
            // Position marker at cell AFTER the barline
            overlays.push(OverlayItem {
                x_px: 0.0, // JS will compute from anchor_char_index
                content: markers[marker_idx].to_string(),
                anchor_char_index: cell_to_char_index[barline_idx + 1],
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
            x_px: 120.5,
            content: "sa".to_string(),
            anchor_char_index: 5,
        };

        let json = serde_json::to_string(&item).unwrap();
        assert!(json.contains("\"x_px\":120.5"));
        assert!(json.contains("\"content\":\"sa\""));
        assert!(json.contains("\"anchor_char_index\":5"));
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
        assert_eq!(cells[0].get_pitch_code(), Some(crate::models::pitch_code::PitchCode::N1));
    }

    #[test]
    fn test_render_cell_with_lines_basic() {
        use crate::models::core::Cell;
        use crate::renderers::font_utils::glyph_for_pitch;

        // Create cell with proper PUA codepoint that encodes N1 at octave 0
        let glyph = glyph_for_pitch(crate::models::pitch_code::PitchCode::N1, 0, PitchSystem::Number)
            .expect("Should get glyph for N1");
        let cell = Cell::new(glyph.to_string(), ElementKind::PitchedElement);
        // pitch_code and pitch_system are derived from codepoint via getters

        let rendered = render_cell_with_lines(&cell, LowerLoopRole::None, SlurRole::None);
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
        assert_eq!(cells1[0].get_pitch_code(), Some(crate::models::pitch_code::PitchCode::N1));

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
        assert_eq!(cells2[0].get_pitch_code(), Some(crate::models::pitch_code::PitchCode::N1), "First cell should be N1");
        assert_eq!(cells2[1].get_pitch_code(), Some(crate::models::pitch_code::PitchCode::N2), "Second cell should be N2");

        // Step 3: Parse "PUA + PUA + 3"
        let pua_char2 = glyph_for_pitch(crate::models::pitch_code::PitchCode::N2, 0, PitchSystem::Number)
            .expect("Should get glyph for N2");
        let mixed_input3 = format!("{}{}3", pua_char, pua_char2);
        let cells3 = parse_text_to_cells(&mixed_input3, PitchSystem::Number);
        println!("Cells from 3-char mixed: {:?}", cells3);

        assert_eq!(cells3.len(), 3, "Should have 3 cells");
        assert_eq!(cells3[0].get_pitch_code(), Some(crate::models::pitch_code::PitchCode::N1));
        assert_eq!(cells3[1].get_pitch_code(), Some(crate::models::pitch_code::PitchCode::N2));
        assert_eq!(cells3[2].get_pitch_code(), Some(crate::models::pitch_code::PitchCode::N3));
    }

    #[test]
    fn test_parse_sharp_ascii() {
        // Test parsing ASCII "1#2" directly
        let cells = parse_text_to_cells("1#2", PitchSystem::Number);
        println!("Cells from '1#2': {:?}", cells);
        assert_eq!(cells.len(), 2, "Should have 2 cells: 1# and 2");
        assert_eq!(cells[0].get_pitch_code(), Some(crate::models::pitch_code::PitchCode::N1s), "First should be N1s (sharp 1)");
        assert_eq!(cells[1].get_pitch_code(), Some(crate::models::pitch_code::PitchCode::N2), "Second should be N2");
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
        assert_eq!(cells[0].get_pitch_code(), Some(crate::models::pitch_code::PitchCode::N1s), "Should be N1s (sharp 1)");
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
        assert_eq!(cells2[0].get_pitch_code(), Some(crate::models::pitch_code::PitchCode::N1s));
        assert_eq!(cells2[1].get_pitch_code(), Some(crate::models::pitch_code::PitchCode::N2));
    }

    #[test]
    fn test_render_cell_preserves_original_pitch_system() {
        // Regression test: render_cell_with_lines should use the cell's stored char,
        // NOT regenerate it based on pitch_system parameter
        use crate::models::core::Cell;

        // Create a cell with Number system glyph for N1 (displays as "1")
        let glyph_number = glyph_for_pitch(crate::models::pitch_code::PitchCode::N1, 0, PitchSystem::Number)
            .expect("Should get Number glyph for N1");
        let cell_number = Cell::new(glyph_number.to_string(), ElementKind::PitchedElement);

        // Render with Number system - should show "1"
        let rendered_number = render_cell_with_lines(&cell_number, LowerLoopRole::None, SlurRole::None);
        assert_eq!(rendered_number.chars().next(), Some(glyph_number),
            "Should preserve Number system glyph '1'");

        // Create a cell with Sargam system glyph for N1 (displays as "S")
        let glyph_sargam = glyph_for_pitch(crate::models::pitch_code::PitchCode::N1, 0, PitchSystem::Sargam)
            .expect("Should get Sargam glyph for N1");
        let cell_sargam = Cell::new(glyph_sargam.to_string(), ElementKind::PitchedElement);

        // Render - should show "S"
        let rendered_sargam = render_cell_with_lines(&cell_sargam, LowerLoopRole::None, SlurRole::None);
        assert_eq!(rendered_sargam.chars().next(), Some(glyph_sargam),
            "Should preserve Sargam system glyph 'S'");

        // Key test: cells preserve their original glyphs regardless of context
        assert_ne!(glyph_number, glyph_sargam,
            "Number '1' and Sargam 'S' should be different glyphs");
    }

    #[test]
    fn test_compute_lyric_positions_no_collision_centered() {
        // Test that syllables are positioned to avoid collision WITH CENTERED POSITIONING
        // CSS uses: transform: translateX(-50%) which centers items on their left position
        //
        // Scenario: "willam" (42.8px wide) and "shakespear" (75.4px wide)
        // Note positions: 38px and 64px
        //
        // With centered positioning:
        // - willam at center=38: visual span = [38-21.4, 38+21.4] = [16.6, 59.4]
        // - shakespear at center=64: visual span = [64-37.7, 64+37.7] = [26.3, 101.7]
        // - COLLISION: 59.4 > 26.3
        //
        // For no collision with centered positioning:
        // - willam right edge = 38 + 21.4 = 59.4
        // - shakespear left edge must be > 59.4 + MIN_GAP = 63.4
        // - shakespear center = shakespear_left + 37.7 = 63.4 + 37.7 = 101.1
        // So shakespear should be pushed to center >= 101.1

        let note_positions = vec![38.0, 64.0];
        let syllable_widths = vec![42.8, 75.4];
        let syllable_texts = vec!["willam", "shakespear"];

        let overlays = compute_lyric_positions(&note_positions, &syllable_widths, &syllable_texts);

        assert_eq!(overlays.len(), 2);

        // First syllable at note position
        assert_eq!(overlays[0].x_px, 38.0, "First lyric should be at note position");
        assert_eq!(overlays[0].content, "willam");

        // Second syllable should be pushed right to avoid collision (centered positioning)
        // For centered: min_center = prev_center + prev_half_width + MIN_GAP + this_half_width
        // min_center = 38 + 21.4 + 4 + 37.7 = 101.1
        let expected_second_center = 38.0 + 42.8/2.0 + 4.0 + 75.4/2.0; // ~101.1
        assert!(
            overlays[1].x_px >= expected_second_center - 0.1, // Small tolerance for floating point
            "Second lyric center at {} should be >= {} to avoid collision (centered)",
            overlays[1].x_px,
            expected_second_center
        );
        assert_eq!(overlays[1].content, "shakespear");

        // Verify no visual collision with centered positioning:
        // first_right_edge = center_1 + width_1/2
        // second_left_edge = center_2 - width_2/2
        let first_right_visual = overlays[0].x_px + syllable_widths[0] / 2.0;
        let second_left_visual = overlays[1].x_px - syllable_widths[1] / 2.0;
        assert!(
            first_right_visual < second_left_visual,
            "Visual collision detected (centered): first ends at {}, second starts at {}",
            first_right_visual,
            second_left_visual
        );
    }

    #[test]
    fn test_display_text_no_spaces_for_adjacent_pitches() {
        // Test that compute_textarea_line_display doesn't add spaces between adjacent pitched cells
        // when they are in the same beat

        // Create line with two adjacent pitched cells: N1s and N2
        let mut line = crate::models::core::Line::new();
        // Use codepoint directly - pitch_code/pitch_system derived via getters
        let cell1 = crate::models::core::Cell::from_codepoint(
            0xE019, // N1s glyph
            ElementKind::PitchedElement
        );

        let cell2 = crate::models::core::Cell::from_codepoint(
            0xE01E, // N2 glyph
            ElementKind::PitchedElement
        );

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
