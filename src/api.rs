//! WASM API for the recursive descent parser
//!
//! This module provides the JavaScript-facing API for character insertion
//! and token combination using the recursive descent parser.

use wasm_bindgen::prelude::*;
use crate::models::{Cell, PitchSystem, Document, Line};
use crate::parse::grammar::{parse, parse_single, try_combine_tokens};

// Logging macros for WASM
#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console)]
    fn log(s: &str);

    #[wasm_bindgen(js_namespace = console)]
    fn info(s: &str);

    #[wasm_bindgen(js_namespace = console)]
    fn warn(s: &str);

    #[wasm_bindgen(js_namespace = console)]
    fn error(s: &str);
}

/// Log a message with prefix for WASM operations
macro_rules! wasm_log {
    ($($arg:tt)*) => {
        log(&format!("[WASM] {}", format!($($arg)*)))
    };
}

macro_rules! wasm_info {
    ($($arg:tt)*) => {
        info(&format!("[WASM] {}", format!($($arg)*)))
    };
}

macro_rules! wasm_warn {
    ($($arg:tt)*) => {
        warn(&format!("[WASM] ⚠️ {}", format!($($arg)*)))
    };
}

macro_rules! wasm_error {
    ($($arg:tt)*) => {
        error(&format!("[WASM] ❌ {}", format!($($arg)*)))
    };
}

/// Insert a character into a cell array using recursive descent parsing
///
/// # Parameters
/// - `cells_js`: JavaScript array of Cell objects
/// - `c`: The character to insert
/// - `cursor_pos`: The position where to insert (0-based index)
/// - `pitch_system`: The pitch system to use (0=Unknown, 1=Number, 2=Western, 3=Sargam)
///
/// # Returns
/// Updated JavaScript array of Cell objects with the character inserted and tokens combined
#[wasm_bindgen(js_name = insertCharacter)]
pub fn insert_character(
    cells_js: JsValue,
    c: char,
    cursor_pos: usize,
    pitch_system: u8,
) -> Result<js_sys::Array, JsValue> {
    wasm_info!("insertCharacter called: char='{}', cursor_pos={}, pitch_system={}", c, cursor_pos, pitch_system);

    // Deserialize cells from JavaScript
    let mut cells: Vec<Cell> = serde_wasm_bindgen::from_value(cells_js)
        .map_err(|e| {
            wasm_error!("Deserialization error: {}", e);
            JsValue::from_str(&format!("Deserialization error: {}", e))
        })?;

    let cells_before = cells.len();
    wasm_log!("  Before insertion: {} cells", cells_before);

    // Convert pitch system number to enum
    let pitch_system = match pitch_system {
        1 => PitchSystem::Number,
        2 => PitchSystem::Western,
        3 => PitchSystem::Sargam,
        4 => PitchSystem::Bhatkhande,
        5 => PitchSystem::Tabla,
        _ => PitchSystem::Unknown,
    };

    // Parse the character into a Cell
    let column = if cursor_pos == 0 {
        0
    } else if cursor_pos <= cells.len() {
        cells.get(cursor_pos.saturating_sub(1))
            .map(|c| c.col + 1)
            .unwrap_or(cursor_pos)
    } else {
        cells.last().map(|c| c.col + 1).unwrap_or(0)
    };

    let new_cell = parse_single(c, pitch_system, column);

    // Insert the new cell at the cursor position
    let insert_pos = cursor_pos.min(cells.len());
    cells.insert(insert_pos, new_cell);

    // Update column indices for cells after insertion
    for i in (insert_pos + 1)..cells.len() {
        cells[i].col += 1;
    }

    // Try to combine tokens using recursive descent
    wasm_log!("  Attempting token combination at position {}", insert_pos);
    try_combine_tokens(&mut cells, insert_pos, pitch_system);

    let cells_after = cells.len();
    let cells_delta = cells_after as i32 - cells_before as i32;
    wasm_info!("  After combination: {} cells (delta: {:+})", cells_after, cells_delta);

    // Convert back to JavaScript array
    let result = js_sys::Array::new();
    for cell in cells {
        let cell_js = serde_wasm_bindgen::to_value(&cell)
            .map_err(|e| {
                wasm_error!("Serialization error: {}", e);
                JsValue::from_str(&format!("Serialization error: {}", e))
            })?;
        result.push(&cell_js);
    }

    wasm_info!("insertCharacter completed successfully");
    Ok(result)
}

/// Parse a string of text into cells (for initial document loading)
///
/// # Parameters
/// - `text`: The text to parse
/// - `pitch_system`: The pitch system to use
///
/// # Returns
/// JavaScript array of Cell objects
#[wasm_bindgen(js_name = parseText)]
pub fn parse_text(text: &str, pitch_system: u8) -> Result<js_sys::Array, JsValue> {
    wasm_info!("parseText called: text='{}' (len={}), pitch_system={}", text, text.len(), pitch_system);

    // Convert pitch system number to enum
    let pitch_system = match pitch_system {
        1 => PitchSystem::Number,
        2 => PitchSystem::Western,
        3 => PitchSystem::Sargam,
        4 => PitchSystem::Bhatkhande,
        5 => PitchSystem::Tabla,
        _ => PitchSystem::Unknown,
    };

    let mut cells = Vec::new();
    let mut column = 0;

    wasm_log!("  Parsing {} characters...", text.chars().count());
    for c in text.chars() {
        let cell = parse_single(c, pitch_system, column);
        cells.push(cell);
        column += 1;
    }

    let cells_before_combination = cells.len();
    wasm_log!("  Parsed into {} initial cells, starting token combination...", cells_before_combination);

    // Process all cells to combine multi-character tokens
    let mut i = 1;
    let mut combinations = 0;
    while i < cells.len() {
        let prev_len = cells.len();
        try_combine_tokens(&mut cells, i, pitch_system);

        // If a combination happened, cells.len() decreased
        // Don't increment i, so we can try combining at the same position again
        if cells.len() < prev_len {
            combinations += 1;
            // A combination happened, stay at same position
            continue;
        } else {
            // No combination, move to next position
            i += 1;
        }
    }

    let cells_after = cells.len();
    wasm_info!("  Token combination complete: {} cells (from {} initial), {} combinations",
              cells_after, cells_before_combination, combinations);

    // Convert to JavaScript array
    let result = js_sys::Array::new();
    for cell in cells {
        let cell_js = serde_wasm_bindgen::to_value(&cell)
            .map_err(|e| {
                wasm_error!("Serialization error: {}", e);
                JsValue::from_str(&format!("Serialization error: {}", e))
            })?;
        result.push(&cell_js);
    }

    wasm_info!("parseText completed successfully");
    Ok(result)
}

/// Delete a character at the cursor position
///
/// For multi-character cells (e.g., "1#", "C#", "xyz"), this removes the LAST character
/// and re-parses the truncated glyph while PRESERVING all associated musical data
/// (octave, flags, pitch_code, etc.). Only the glyph and kind are updated.
///
/// For single-character cells, the entire cell is deleted.
///
/// # Parameters
/// - `cells_js`: JavaScript array of Cell objects
/// - `cursor_pos`: The position to delete (0-based index)
///
/// # Returns
/// Updated JavaScript array of Cell objects with the character deleted
#[wasm_bindgen(js_name = deleteCharacter)]
pub fn delete_character(
    cells_js: JsValue,
    cursor_pos: usize,
) -> Result<js_sys::Array, JsValue> {
    wasm_info!("deleteCharacter called: cursor_pos={}", cursor_pos);

    // Deserialize cells from JavaScript
    let mut cells: Vec<Cell> = serde_wasm_bindgen::from_value(cells_js)
        .map_err(|e| {
            wasm_error!("Deserialization error: {}", e);
            JsValue::from_str(&format!("Deserialization error: {}", e))
        })?;

    let cells_before = cells.len();
    wasm_log!("  Before deletion: {} cells", cells_before);

    // Check bounds
    if cursor_pos >= cells.len() {
        wasm_error!("Cursor position {} out of bounds (max: {})", cursor_pos, cells.len() - 1);
        return Err(JsValue::from_str("Cursor position out of bounds"));
    }

    // Get the cell being modified
    let cell = &cells[cursor_pos];
    let glyph = &cell.glyph;
    let glyph_len = glyph.chars().count();

    wasm_log!("  Cell at position {}: glyph='{}' (len={}), kind={:?}",
             cursor_pos, glyph, glyph_len, cell.kind);

    if glyph_len > 1 {
        // Multi-character cell: remove last character, re-parse, PRESERVE ALL DATA
        let mut chars: Vec<char> = glyph.chars().collect();
        let removed_char = chars.pop().unwrap();
        let truncated_glyph: String = chars.into_iter().collect();

        wasm_info!("  Truncating multi-char cell: '{}' -> '{}' (removed '{}')",
                  glyph, truncated_glyph, removed_char);

        // Preserve data from old cell before re-parsing
        let old_cell = &cells[cursor_pos];
        let preserved_col = old_cell.col;
        let preserved_flags = old_cell.flags;
        let preserved_pitch_code = old_cell.pitch_code.clone();
        let preserved_pitch_system = old_cell.pitch_system;
        let preserved_octave = old_cell.octave;
        let preserved_slur_indicator = old_cell.slur_indicator;

        // Re-parse truncated glyph to get correct kind
        let pitch_system = preserved_pitch_system.unwrap_or(PitchSystem::Unknown);
        let reparsed = parse(&truncated_glyph, pitch_system, preserved_col);

        wasm_info!("  Re-parsed: kind={:?} (old kind was {:?})", reparsed.kind, old_cell.kind);

        // Create new cell with reparsed kind but preserved data
        cells[cursor_pos] = Cell {
            glyph: truncated_glyph,
            kind: reparsed.kind,  // Updated from re-parse
            col: preserved_col,
            flags: preserved_flags,
            pitch_code: preserved_pitch_code,
            pitch_system: preserved_pitch_system,
            octave: preserved_octave,  // CRITICAL: preserve octave
            slur_indicator: preserved_slur_indicator,  // CRITICAL: preserve slur indicator
            // Reset ephemeral fields
            x: 0.0,
            y: 0.0,
            w: 0.0,
            h: 0.0,
            bbox: (0.0, 0.0, 0.0, 0.0),
            hit: (0.0, 0.0, 0.0, 0.0),
        };

        wasm_info!("  Cell updated: kind={:?}, preserved octave={:?}, flags={}",
                  cells[cursor_pos].kind, cells[cursor_pos].octave, cells[cursor_pos].flags);

    } else {
        // Single-character cell: delete entire cell
        wasm_log!("  Single-char cell: deleting entire cell at position {}", cursor_pos);
        cells.remove(cursor_pos);

        // Update column indices for cells after deletion
        for i in cursor_pos..cells.len() {
            if cells[i].col > 0 {
                cells[i].col -= 1;
            }
        }
    }

    let cells_after = cells.len();
    let delta = cells_after as i32 - cells_before as i32;
    wasm_info!("  After deletion: {} cells (delta: {:+})", cells_after, delta);

    // Convert back to JavaScript array
    let result = js_sys::Array::new();
    for cell in cells {
        let cell_js = serde_wasm_bindgen::to_value(&cell)
            .map_err(|e| {
                wasm_error!("Serialization error: {}", e);
                JsValue::from_str(&format!("Serialization error: {}", e))
            })?;
        result.push(&cell_js);
    }

    wasm_info!("deleteCharacter completed successfully");
    Ok(result)
}

/// Apply octave to cells in a selection range
///
/// # Parameters
/// - `cells_js`: JavaScript array of Cell objects
/// - `start`: Start of selection (0-based index)
/// - `end`: End of selection (exclusive)
/// - `octave`: Octave value (-1, 0, or 1)
///
/// # Returns
/// Updated JavaScript array of Cell objects with octave applied
#[wasm_bindgen(js_name = applyOctave)]
pub fn apply_octave(
    cells_js: JsValue,
    start: usize,
    end: usize,
    octave: i8,
) -> Result<js_sys::Array, JsValue> {
    wasm_info!("applyOctave called: start={}, end={}, octave={}", start, end, octave);

    // Deserialize cells from JavaScript
    let mut cells: Vec<Cell> = serde_wasm_bindgen::from_value(cells_js)
        .map_err(|e| {
            wasm_error!("Deserialization error: {}", e);
            JsValue::from_str(&format!("Deserialization error: {}", e))
        })?;

    wasm_log!("  Total cells: {}, selection range: {}..{}", cells.len(), start, end);

    // Validate octave value
    if ![-1, 0, 1].contains(&octave) {
        wasm_error!("Invalid octave value: {} (must be -1, 0, or 1)", octave);
        return Err(JsValue::from_str("Octave must be -1, 0, or 1"));
    }

    // Apply octave to cells in selection range
    let mut modified_count = 0;
    for i in start..end.min(cells.len()) {
        // Only apply to pitched elements (kind = 1)
        if cells[i].kind == crate::models::ElementKind::PitchedElement {
            cells[i].octave = octave;
            modified_count += 1;
            wasm_log!("  Applied octave {} to cell {}: '{}'", octave, i, cells[i].glyph);
        }
    }

    wasm_info!("  Modified {} pitched elements out of {} cells in range", modified_count, end - start);

    // Convert back to JavaScript array
    let result = js_sys::Array::new();
    for cell in cells {
        let cell_js = serde_wasm_bindgen::to_value(&cell)
            .map_err(|e| {
                wasm_error!("Serialization error: {}", e);
                JsValue::from_str(&format!("Serialization error: {}", e))
            })?;
        result.push(&cell_js);
    }

    wasm_info!("applyOctave completed successfully");
    Ok(result)
}

/// Apply slur to cells in a selection range
///
/// # Parameters
/// - `cells_js`: JavaScript array of Cell objects
/// - `start`: Start of selection (0-based index)
/// - `end`: End of selection (exclusive)
///
/// # Returns
/// Updated JavaScript array of Cell objects with slur applied
#[wasm_bindgen(js_name = applySlur)]
pub fn apply_slur(
    cells_js: JsValue,
    start: usize,
    end: usize,
) -> Result<js_sys::Array, JsValue> {
    wasm_info!("applySlur called: start={}, end={}", start, end);

    // Deserialize cells from JavaScript
    let mut cells: Vec<Cell> = serde_wasm_bindgen::from_value(cells_js)
        .map_err(|e| {
            wasm_error!("Deserialization error: {}", e);
            JsValue::from_str(&format!("Deserialization error: {}", e))
        })?;

    wasm_log!("  Total cells: {}, selection range: {}..{}", cells.len(), start, end);

    // Validate selection range
    if start >= end {
        wasm_error!("Invalid selection range: start {} >= end {}", start, end);
        return Err(JsValue::from_str("Start must be less than end"));
    }

    if start >= cells.len() {
        wasm_error!("Start position {} out of bounds (max: {})", start, cells.len() - 1);
        return Err(JsValue::from_str("Start position out of bounds"));
    }

    let actual_end = end.min(cells.len());

    // Clear any existing slur indicators in the range first
    for i in start..actual_end {
        cells[i].clear_slur();
    }

    // Check if we have at least 2 cells for a slur
    if actual_end - start >= 2 {
        // Apply slur: first cell = SlurStart, last cell = SlurEnd
        cells[start].set_slur_start();
        cells[actual_end - 1].set_slur_end();

        wasm_info!("  Applied slur: cell[{}] = SlurStart, cell[{}] = SlurEnd",
                  start, actual_end - 1);
    } else {
        wasm_warn!("  Selection too short for slur ({} cells), skipping", actual_end - start);
    }

    // Convert back to JavaScript array
    let result = js_sys::Array::new();
    for cell in cells {
        let cell_js = serde_wasm_bindgen::to_value(&cell)
            .map_err(|e| {
                wasm_error!("Serialization error: {}", e);
                JsValue::from_str(&format!("Serialization error: {}", e))
            })?;
        result.push(&cell_js);
    }

    wasm_info!("applySlur completed successfully");
    Ok(result)
}

/// Remove slur from cells in a selection range
///
/// # Parameters
/// - `cells_js`: JavaScript array of Cell objects
/// - `start`: Start of selection (0-based index)
/// - `end`: End of selection (exclusive)
///
/// # Returns
/// Updated JavaScript array of Cell objects with slur removed
#[wasm_bindgen(js_name = removeSlur)]
pub fn remove_slur(
    cells_js: JsValue,
    start: usize,
    end: usize,
) -> Result<js_sys::Array, JsValue> {
    wasm_info!("removeSlur called: start={}, end={}", start, end);

    // Deserialize cells from JavaScript
    let mut cells: Vec<Cell> = serde_wasm_bindgen::from_value(cells_js)
        .map_err(|e| {
            wasm_error!("Deserialization error: {}", e);
            JsValue::from_str(&format!("Deserialization error: {}", e))
        })?;

    wasm_log!("  Total cells: {}, selection range: {}..{}", cells.len(), start, end);

    // Validate selection range
    if start >= end {
        wasm_error!("Invalid selection range: start {} >= end {}", start, end);
        return Err(JsValue::from_str("Start must be less than end"));
    }

    if start >= cells.len() {
        wasm_error!("Start position {} out of bounds (max: {})", start, cells.len() - 1);
        return Err(JsValue::from_str("Start position out of bounds"));
    }

    let actual_end = end.min(cells.len());
    let mut removed_count = 0;

    // Clear slur indicators from cells in selection range
    for i in start..actual_end {
        if cells[i].has_slur() {
            cells[i].clear_slur();
            removed_count += 1;
            wasm_log!("  Removed slur indicator from cell {}: '{}'", i, cells[i].glyph);
        }
    }

    wasm_info!("  Removed slur indicators from {} cells", removed_count);

    // Convert back to JavaScript array
    let result = js_sys::Array::new();
    for cell in cells {
        let cell_js = serde_wasm_bindgen::to_value(&cell)
            .map_err(|e| {
                wasm_error!("Serialization error: {}", e);
                JsValue::from_str(&format!("Serialization error: {}", e))
            })?;
        result.push(&cell_js);
    }

    wasm_info!("removeSlur completed successfully");
    Ok(result)
}

/// Check if there are any slur indicators in a selection range
///
/// # Parameters
/// - `cells_js`: JavaScript array of Cell objects
/// - `start`: Start of selection (0-based index)
/// - `end`: End of selection (exclusive)
///
/// # Returns
/// Boolean indicating whether there are slur indicators in the range
#[wasm_bindgen(js_name = hasSlurInSelection)]
pub fn has_slur_in_selection(
    cells_js: JsValue,
    start: usize,
    end: usize,
) -> Result<bool, JsValue> {
    wasm_info!("hasSlurInSelection called: start={}, end={}", start, end);

    // Deserialize cells from JavaScript
    let cells: Vec<Cell> = serde_wasm_bindgen::from_value(cells_js)
        .map_err(|e| {
            wasm_error!("Deserialization error: {}", e);
            JsValue::from_str(&format!("Deserialization error: {}", e))
        })?;

    wasm_log!("  Total cells: {}, selection range: {}..{}", cells.len(), start, end);

    // Validate selection range
    if start >= end || start >= cells.len() {
        wasm_warn!("  Invalid selection range, returning false");
        return Ok(false);
    }

    let actual_end = end.min(cells.len());

    // Check for any slur indicators in the selection range
    for i in start..actual_end {
        if cells[i].has_slur() {
            wasm_info!("  Found slur indicator at cell {}: {:?}", i, cells[i].slur_indicator);
            return Ok(true);
        }
    }

    wasm_info!("  No slur indicators found in selection range");
    Ok(false)
}

/// Set the document title
///
/// # Parameters
/// - `document_js`: JavaScript Document object
/// - `title`: The new title for the document
///
/// # Returns
/// Updated JavaScript Document object with the title set
#[wasm_bindgen(js_name = setTitle)]
pub fn set_title(
    document_js: JsValue,
    title: &str,
) -> Result<JsValue, JsValue> {
    wasm_info!("setTitle called: title='{}'", title);

    // Deserialize document from JavaScript
    let mut document: Document = serde_wasm_bindgen::from_value(document_js)
        .map_err(|e| {
            wasm_error!("Deserialization error: {}", e);
            JsValue::from_str(&format!("Deserialization error: {}", e))
        })?;

    // Set the title
    document.title = Some(title.to_string());
    wasm_info!("  Document title set to: '{}'", title);

    // Compute glyphs before serialization
    document.compute_glyphs();

    // Serialize back to JavaScript
    let result = serde_wasm_bindgen::to_value(&document)
        .map_err(|e| {
            wasm_error!("Serialization error: {}", e);
            JsValue::from_str(&format!("Serialization error: {}", e))
        })?;

    wasm_info!("setTitle completed successfully");
    Ok(result)
}

/// Set the document composer
///
/// # Parameters
/// - `document_js`: JavaScript Document object
/// - `composer`: The new composer name for the document
///
/// # Returns
/// Updated JavaScript Document object with the composer set
#[wasm_bindgen(js_name = setComposer)]
pub fn set_composer(
    document_js: JsValue,
    composer: &str,
) -> Result<JsValue, JsValue> {
    wasm_info!("setComposer called: composer='{}'", composer);

    // Deserialize document from JavaScript
    let mut document: Document = serde_wasm_bindgen::from_value(document_js)
        .map_err(|e| {
            wasm_error!("Deserialization error: {}", e);
            JsValue::from_str(&format!("Deserialization error: {}", e))
        })?;

    // Set the composer
    document.composer = Some(composer.to_string());
    wasm_info!("  Document composer set to: '{}'", composer);

    // Compute glyphs before serialization
    document.compute_glyphs();

    // Serialize back to JavaScript
    let result = serde_wasm_bindgen::to_value(&document)
        .map_err(|e| {
            wasm_error!("Serialization error: {}", e);
            JsValue::from_str(&format!("Serialization error: {}", e))
        })?;

    wasm_info!("setComposer completed successfully");
    Ok(result)
}

/// Set lyrics for a specific line
///
/// # Parameters
/// - `document_js`: JavaScript Document object
/// - `line_index`: Index of the line to set lyrics for (0-based)
/// - `lyrics`: The lyrics text to set
///
/// # Returns
/// Updated JavaScript Document object with the lyrics set
#[wasm_bindgen(js_name = setLineLyrics)]
pub fn set_line_lyrics(
    document_js: JsValue,
    line_index: usize,
    lyrics: &str,
) -> Result<JsValue, JsValue> {
    wasm_info!("setLineLyrics called: line_index={}, lyrics='{}'", line_index, lyrics);

    // Deserialize document from JavaScript
    let mut document: Document = serde_wasm_bindgen::from_value(document_js)
        .map_err(|e| {
            wasm_error!("Deserialization error: {}", e);
            JsValue::from_str(&format!("Deserialization error: {}", e))
        })?;

    // Validate line index
    if line_index >= document.lines.len() {
        wasm_error!("Line index {} out of bounds (max: {})", line_index, document.lines.len() - 1);
        return Err(JsValue::from_str("Line index out of bounds"));
    }

    // Set the lyrics for the line
    document.lines[line_index].lyrics = lyrics.to_string();
    wasm_info!("  Line {} lyrics set to: '{}'", line_index, lyrics);

    // Compute glyphs before serialization
    document.compute_glyphs();

    // Serialize back to JavaScript
    let result = serde_wasm_bindgen::to_value(&document)
        .map_err(|e| {
            wasm_error!("Serialization error: {}", e);
            JsValue::from_str(&format!("Serialization error: {}", e))
        })?;

    wasm_info!("setLineLyrics completed successfully");
    Ok(result)
}

/// Set tala for a specific line
///
/// # Parameters
/// - `document_js`: JavaScript Document object
/// - `line_index`: Index of the line to set tala for (0-based)
/// - `tala`: The tala string (digits 0-9+)
///
/// # Returns
/// Updated JavaScript Document object with the tala set
#[wasm_bindgen(js_name = setLineTala)]
pub fn set_line_tala(
    document_js: JsValue,
    line_index: usize,
    tala: &str,
) -> Result<JsValue, JsValue> {
    wasm_info!("setLineTala called: line_index={}, tala='{}'", line_index, tala);

    // Deserialize document from JavaScript
    let mut document: Document = serde_wasm_bindgen::from_value(document_js)
        .map_err(|e| {
            wasm_error!("Deserialization error: {}", e);
            JsValue::from_str(&format!("Deserialization error: {}", e))
        })?;

    // Validate line index
    if line_index >= document.lines.len() {
        wasm_error!("Line index {} out of bounds (max: {})", line_index, document.lines.len() - 1);
        return Err(JsValue::from_str("Line index out of bounds"));
    }

    // Validate tala format (only digits 0-9 and +)
    if !tala.chars().all(|c| c.is_ascii_digit() || c == '+') {
        wasm_error!("Invalid tala format: '{}' (only digits 0-9 and + allowed)", tala);
        return Err(JsValue::from_str("Invalid tala format"));
    }

    // Set the tala for the line
    document.lines[line_index].tala = tala.to_string();
    wasm_info!("  Line {} tala set to: '{}'", line_index, tala);

    // Compute glyphs before serialization
    document.compute_glyphs();

    // Serialize back to JavaScript
    let result = serde_wasm_bindgen::to_value(&document)
        .map_err(|e| {
            wasm_error!("Serialization error: {}", e);
            JsValue::from_str(&format!("Serialization error: {}", e))
        })?;

    wasm_info!("setLineTala completed successfully");
    Ok(result)
}

/// Set label for a specific line
///
/// # Parameters
/// - `document_js`: JavaScript Document object
/// - `line_index`: Index of the line to set label for (0-based)
/// - `label`: The label text to set
///
/// # Returns
/// Updated JavaScript Document object with the label set
#[wasm_bindgen(js_name = setLineLabel)]
pub fn set_line_label(
    document_js: JsValue,
    line_index: usize,
    label: &str,
) -> Result<JsValue, JsValue> {
    wasm_info!("setLineLabel called: line_index={}, label='{}'", line_index, label);

    // Deserialize document from JavaScript
    let mut document: Document = serde_wasm_bindgen::from_value(document_js)
        .map_err(|e| {
            wasm_error!("Deserialization error: {}", e);
            JsValue::from_str(&format!("Deserialization error: {}", e))
        })?;

    // Validate line index
    if line_index >= document.lines.len() {
        wasm_error!("Line index {} out of bounds (max: {})", line_index, document.lines.len() - 1);
        return Err(JsValue::from_str("Line index out of bounds"));
    }

    // Set the label for the line
    document.lines[line_index].label = label.to_string();
    wasm_info!("  Line {} label set to: '{}'", line_index, label);

    // Compute glyphs before serialization
    document.compute_glyphs();

    // Serialize back to JavaScript
    let result = serde_wasm_bindgen::to_value(&document)
        .map_err(|e| {
            wasm_error!("Serialization error: {}", e);
            JsValue::from_str(&format!("Serialization error: {}", e))
        })?;

    wasm_info!("setLineLabel completed successfully");
    Ok(result)
}

/// Create a new empty document
///
/// # Returns
/// JavaScript Document object with default structure
#[wasm_bindgen(js_name = createNewDocument)]
pub fn create_new_document() -> Result<JsValue, JsValue> {
    wasm_info!("createNewDocument called");

    // Create new document with default structure
    let mut document = Document::new();

    // Set default title
    document.title = Some("Untitled Document".to_string());

    // Set default pitch system
    document.pitch_system = Some(PitchSystem::Number);

    // Add one empty line
    let line = Line::new();
    document.lines.push(line);

    wasm_info!("  Created document with {} line(s)", document.lines.len());

    // Compute glyphs before serialization
    document.compute_glyphs();

    // Serialize to JavaScript
    let result = serde_wasm_bindgen::to_value(&document)
        .map_err(|e| {
            wasm_error!("Serialization error: {}", e);
            JsValue::from_str(&format!("Serialization error: {}", e))
        })?;

    wasm_info!("createNewDocument completed successfully");
    Ok(result)
}

/// Export document to MusicXML format
///
/// # Parameters
/// - `document_js`: JavaScript Document object
///
/// # Returns
/// MusicXML string (XML format)
#[wasm_bindgen(js_name = exportMusicXML)]
pub fn export_musicxml(document_js: JsValue) -> Result<String, JsValue> {
    wasm_info!("exportMusicXML called");

    // Deserialize document from JavaScript
    let document: Document = serde_wasm_bindgen::from_value(document_js)
        .map_err(|e| {
            wasm_error!("Deserialization error: {}", e);
            JsValue::from_str(&format!("Deserialization error: {}", e))
        })?;

    wasm_log!("  Document has {} lines", document.lines.len());

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

/// Convert MusicXML to LilyPond notation
///
/// Takes a MusicXML string and converts it to LilyPond format.
///
/// # Parameters
/// * `musicxml` - MusicXML 3.1 document as a string
/// * `settings_json` - Optional JSON string with conversion settings (null for defaults)
///
/// # Returns
/// JSON string containing:
/// - `lilypond_source`: The generated LilyPond code
/// - `skipped_elements`: Array of elements that couldn't be converted
///
/// # Example Settings JSON
/// ```json
/// {
///   "target_lilypond_version": "2.24.0",
///   "language": "English",
///   "convert_directions": true,
///   "convert_lyrics": true,
///   "convert_chord_symbols": true
/// }
/// ```
#[wasm_bindgen(js_name = convertMusicXMLToLilyPond)]
pub fn convert_musicxml_to_lilypond(musicxml: String, settings_json: Option<String>) -> Result<String, JsValue> {
    wasm_info!("convertMusicXMLToLilyPond called");

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

    // Convert MusicXML to LilyPond
    let result = crate::musicxml_import::convert_musicxml_to_lilypond(&musicxml, settings)
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
        wasm_log!("  Skipped {} elements", result.skipped_elements.len());
    }
    wasm_info!("convertMusicXMLToLilyPond completed successfully");

    Ok(result_json)
}

/// Compute complete layout for a document
///
/// Takes a document and measurements from JavaScript, performs all layout calculations,
/// and returns a DisplayList ready for DOM rendering.
///
/// # Parameters
/// * `document_js` - JavaScript Document object
/// * `config_js` - LayoutConfig with measurements (cell_widths, syllable_widths, etc.)
///
/// # Returns
/// DisplayList with all positioning, classes, and rendering data
#[wasm_bindgen(js_name = computeLayout)]
pub fn compute_layout(
    document_js: JsValue,
    config_js: JsValue,
) -> Result<JsValue, JsValue> {
    wasm_info!("computeLayout called");

    // Deserialize document from JavaScript
    let document: Document = serde_wasm_bindgen::from_value(document_js)
        .map_err(|e| {
            wasm_error!("Document deserialization error: {}", e);
            JsValue::from_str(&format!("Document deserialization error: {}", e))
        })?;

    // Deserialize config from JavaScript
    let config: crate::renderers::layout_engine::LayoutConfig = serde_wasm_bindgen::from_value(config_js)
        .map_err(|e| {
            wasm_error!("Config deserialization error: {}", e);
            JsValue::from_str(&format!("Config deserialization error: {}", e))
        })?;

    wasm_log!("  Document has {} lines", document.lines.len());
    wasm_log!("  Config: {} cell widths, {} syllable widths",
             config.cell_widths.len(), config.syllable_widths.len());

    // Create layout engine and compute layout
    let engine = crate::renderers::layout_engine::LayoutEngine::new();
    let display_list = engine.compute_layout(&document, &config);

    wasm_info!("  DisplayList generated: {} lines", display_list.lines.len());

    // Serialize display list back to JavaScript
    let result = serde_wasm_bindgen::to_value(&display_list)
        .map_err(|e| {
            wasm_error!("DisplayList serialization error: {}", e);
            JsValue::from_str(&format!("DisplayList serialization error: {}", e))
        })?;

    wasm_info!("computeLayout completed successfully");
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_insert_character_creates_note() {
        // This would need to be tested via wasm-bindgen-test in a browser/node environment
        // since it uses JsValue. Unit tests here would be for the underlying logic.
    }
}
