//! WASM API for the recursive descent parser
//!
//! This module provides the JavaScript-facing API for character insertion
//! and token combination using the recursive descent parser.

use wasm_bindgen::prelude::*;
use crate::models::{Cell, PitchSystem, Document, Line, OrnamentIndicator, OrnamentPositionType};
use crate::parse::grammar::{parse, parse_single, mark_continuations};
use crate::renderers::layout_engine::{extract_ornament_spans, find_anchor_cell, OrnamentGroups};
use std::collections::HashMap;

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
/// - `cursor_pos`: The CELL index where to insert (0-based, NOT character position)
/// - `pitch_system`: The pitch system to use (0=Unknown, 1=Number, 2=Western, 3=Sargam)
///
/// # Returns
/// JavaScript object with `cells` (updated array) and `newCursorPos` (new character position)
#[wasm_bindgen(js_name = insertCharacter)]
pub fn insert_character(
    cells_js: JsValue,
    c: char,
    cursor_pos: usize,
    pitch_system: u8,
) -> Result<JsValue, JsValue> {
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

    // Mark continuations (replaces old token combination)
    wasm_log!("  Marking continuations");
    mark_continuations(&mut cells);

    let cells_after = cells.len();
    let cells_delta = cells_after as i32 - cells_before as i32;
    wasm_info!("  After marking continuations: {} cells (delta: {:+})", cells_after, cells_delta);

    // Calculate new cursor position (CHARACTER position, not cell index)
    // Cursor should be positioned after the cell where insertion happened
    let mut new_cursor_pos = 0;
    wasm_log!("  Calculating cursor position: insert_pos={}, cells.len()={}", insert_pos, cells.len());
    for (i, cell) in cells.iter().enumerate() {
        if i == insert_pos {
            // Add this cell's length and stop
            new_cursor_pos += cell.char.chars().count();
            wasm_log!("    Cell[{}] = '{}' (len={}), cumulative={} [INSERTED HERE, STOPPING]",
                     i, cell.char, cell.char.chars().count(), new_cursor_pos);
            break;
        } else {
            new_cursor_pos += cell.char.chars().count();
            wasm_log!("    Cell[{}] = '{}' (len={}), cumulative={}",
                     i, cell.char, cell.char.chars().count(), new_cursor_pos);
        }
    }

    wasm_info!("  New cursor position (char-based): {}", new_cursor_pos);

    // Convert cells back to JavaScript array
    let cells_array = js_sys::Array::new();
    for cell in cells {
        let cell_js = serde_wasm_bindgen::to_value(&cell)
            .map_err(|e| {
                wasm_error!("Cell serialization error: {}", e);
                JsValue::from_str(&format!("Cell serialization error: {}", e))
            })?;
        cells_array.push(&cell_js);
    }

    // Create result object manually using js_sys::Object
    let result = js_sys::Object::new();
    js_sys::Reflect::set(
        &result,
        &JsValue::from_str("cells"),
        &cells_array.into()
    ).map_err(|e| {
        wasm_error!("Failed to set cells property: {:?}", e);
        JsValue::from_str("Failed to set cells property")
    })?;

    js_sys::Reflect::set(
        &result,
        &JsValue::from_str("newCursorPos"),
        &JsValue::from_f64(new_cursor_pos as f64)
    ).map_err(|e| {
        wasm_error!("Failed to set newCursorPos property: {:?}", e);
        JsValue::from_str("Failed to set newCursorPos property")
    })?;

    wasm_info!("insertCharacter completed successfully");
    Ok(result.into())
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

    wasm_log!("  Parsed {} cells, marking continuations...", cells.len());

    // Mark continuations (replaces old token combination)
    mark_continuations(&mut cells);

    wasm_info!("  Marking continuations complete: {} cells", cells.len());

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

    // IMPORTANT: When deleting from a multi-cell glyph, we need to reparse!
    // Find the root cell (trace back to non-continuation)
    let mut root_idx = cursor_pos;
    while root_idx > 0 && cells[root_idx].continuation {
        root_idx -= 1;
    }

    // Find the end of this glyph (all continuation cells)
    let mut glyph_end = root_idx + 1;
    while glyph_end < cells.len() && cells[glyph_end].continuation {
        glyph_end += 1;
    }

    let is_multi_cell_glyph = glyph_end - root_idx > 1;

    wasm_log!("  Cell at position {}: char='{}', continuation={}",
             cursor_pos, cells[cursor_pos].char, cells[cursor_pos].continuation);
    wasm_log!("  Glyph spans cells {}..{} (multi_cell={})", root_idx, glyph_end, is_multi_cell_glyph);

    // Preserve data from root cell BEFORE deletion (for reparsing)
    let preserved_pitch_system = cells[root_idx].pitch_system;
    let _preserved_col = cells[root_idx].col;
    let preserved_flags = cells[root_idx].flags;
    let preserved_octave = cells[root_idx].octave;
    let preserved_slur_indicator = cells[root_idx].slur_indicator;

    // Delete the cell at cursor_pos
    cells.remove(cursor_pos);

    // Adjust root index after deletion
    let new_root_idx = if cursor_pos <= root_idx { root_idx.saturating_sub(1) } else { root_idx };

    // Update column indices for cells after deletion
    for i in cursor_pos..cells.len() {
        if cells[i].col > 0 {
            cells[i].col -= 1;
        }
    }

    // IMPORTANT: After deletion, reparse the affected glyph to update pitch_code
    if is_multi_cell_glyph && new_root_idx < cells.len() {
        // Build combined string from remaining cells starting at root
        let mut combined = String::new();
        let mut end_idx = new_root_idx;

        // Add root cell char
        combined.push_str(&cells[new_root_idx].char);
        end_idx += 1;

        // Add any continuation cells
        while end_idx < cells.len() && cells[end_idx].continuation {
            combined.push_str(&cells[end_idx].char);
            end_idx += 1;
        }

        wasm_log!("  Reparsing remaining glyph: combined='{}'", combined);

        // Reparse the combined string to get correct pitch_code
        let pitch_system = preserved_pitch_system.unwrap_or(PitchSystem::Unknown);
        let reparsed = parse(&combined, pitch_system, cells[new_root_idx].col);

        // Update root cell with reparsed data, preserving musical attributes
        cells[new_root_idx].kind = reparsed.kind;
        cells[new_root_idx].pitch_code = reparsed.pitch_code;
        cells[new_root_idx].pitch_system = reparsed.pitch_system;
        cells[new_root_idx].flags = preserved_flags;
        cells[new_root_idx].octave = preserved_octave;
        cells[new_root_idx].slur_indicator = preserved_slur_indicator;

        wasm_info!("  Updated root cell[{}]: pitch_code={:?}, octave={}, flags={}",
                  new_root_idx, cells[new_root_idx].pitch_code, cells[new_root_idx].octave, cells[new_root_idx].flags);
    }

    // Re-mark continuations for entire array to fix continuation flags
    wasm_log!("  Re-marking continuations for entire array");
    mark_continuations(&mut cells);

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
            wasm_log!("  Applied octave {} to cell {}: '{}'", octave, i, cells[i].char);
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

/// Apply a command (slur, octave, etc.) to cells in a selection range
///
/// Unified apply function that handles all editing commands with toggle behavior:
/// - "slur": Toggle slur on/off
/// - "lower_octave": Toggle lower octave (-1) on/off
/// - "upper_octave": Toggle upper octave (1) on/off
/// - "middle_octave": Clear octave (set to 0)
///
/// # Parameters
/// - `cells_js`: JavaScript array of Cell objects
/// - `start`: Start of selection (0-based index)
/// - `end`: End of selection (exclusive)
/// - `command`: Command name (string)
///
/// # Returns
/// Updated JavaScript array of Cell objects with command applied
#[wasm_bindgen(js_name = applyCommand)]
pub fn apply_command(
    cells_js: JsValue,
    start: usize,
    end: usize,
    command: String,
) -> Result<js_sys::Array, JsValue> {
    wasm_info!("applyCommand called: start={}, end={}, command={}", start, end, command);

    // Deserialize cells from JavaScript
    let mut cells: Vec<Cell> = serde_wasm_bindgen::from_value(cells_js)
        .map_err(|e| {
            wasm_error!("Deserialization error: {}", e);
            JsValue::from_str(&format!("Deserialization error: {}", e))
        })?;

    wasm_log!("  Total cells: {}, selection range: {}..{}", cells.len(), start, end);

    let mut modified_count = 0;

    match command.as_str() {
        "lower_octave" => {
            // Toggle lower octave (-1)
            for i in start..end.min(cells.len()) {
                if cells[i].kind == crate::models::ElementKind::PitchedElement {
                    cells[i].octave = if cells[i].octave == -1 { 0 } else { -1 };
                    modified_count += 1;
                    wasm_log!("  Toggled octave to {} on cell {}: '{}'", cells[i].octave, i, cells[i].char);
                }
            }
        }
        "upper_octave" => {
            // Toggle upper octave (1)
            for i in start..end.min(cells.len()) {
                if cells[i].kind == crate::models::ElementKind::PitchedElement {
                    cells[i].octave = if cells[i].octave == 1 { 0 } else { 1 };
                    modified_count += 1;
                    wasm_log!("  Toggled octave to {} on cell {}: '{}'", cells[i].octave, i, cells[i].char);
                }
            }
        }
        "middle_octave" => {
            // Clear octave (set to 0)
            for i in start..end.min(cells.len()) {
                if cells[i].kind == crate::models::ElementKind::PitchedElement {
                    cells[i].octave = 0;
                    modified_count += 1;
                    wasm_log!("  Cleared octave on cell {}: '{}'", i, cells[i].char);
                }
            }
        }
        "slur" => {
            // Toggle slur on/off using proper slur_indicator (not flags)
            // Note: end parameter is treated as exclusive (standard range semantics)
            let actual_end = end.min(cells.len());

            // Check if slur already exists on the first cell
            let has_existing_slur = cells.get(start).map(|c| c.has_slur()).unwrap_or(false);

            if has_existing_slur {
                // Remove existing slur - clear all slur indicators in range
                for i in start..actual_end {
                    if cells[i].has_slur() {
                        cells[i].clear_slur();
                        modified_count += 1;
                        wasm_log!("  Removed slur from cell {}: '{}'", i, cells[i].char);
                    }
                }
            } else if actual_end - start >= 2 {
                // Apply new slur - need at least 2 cells
                for i in start..actual_end {
                    cells[i].clear_slur();
                }
                cells[start].set_slur_start();
                cells[actual_end - 1].set_slur_end();
                modified_count = (actual_end - start) as usize;
                wasm_info!("  Applied slur: cell[{}] = SlurStart, cell[{}] = SlurEnd",
                          start, actual_end - 1);
            } else {
                wasm_warn!("  Selection too short for slur ({} cells), skipping", actual_end - start);
            }
        }
        "ornament_indicator" => {
            // Toggle ornament indicator on/off
            // Note: end parameter is treated as exclusive (standard range semantics)
            let actual_end = end.min(cells.len());

            // Check if ornament indicator already exists on the first cell
            let has_existing_ornament = cells.get(start).map(|c| c.has_ornament_indicator()).unwrap_or(false);

            if has_existing_ornament {
                // Remove existing ornament indicators - clear all in range
                for i in start..actual_end {
                    if cells[i].has_ornament_indicator() {
                        cells[i].clear_ornament();
                        modified_count += 1;
                        wasm_log!("  Removed ornament indicator from cell {}: '{}'", i, cells[i].char);
                    }
                }
            } else if actual_end - start >= 2 {
                // Apply new ornament indicator - need at least 2 cells
                for i in start..actual_end {
                    cells[i].clear_ornament();
                }
                cells[start].set_ornament_start();
                cells[actual_end - 1].set_ornament_end();
                modified_count = (actual_end - start) as usize;
                wasm_info!("  Applied ornament indicator: cell[{}] = OrnamentStart, cell[{}] = OrnamentEnd",
                          start, actual_end - 1);
            } else {
                wasm_warn!("  Selection too short for ornament ({} cells), skipping", actual_end - start);
            }
        }
        _ => {
            wasm_error!("Unknown command: {}", command);
            return Err(JsValue::from_str(&format!("Unknown command: {}", command)));
        }
    }

    wasm_info!("  Modified {} cells", modified_count);

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

    wasm_info!("applyCommand completed successfully");
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
            wasm_log!("  Removed slur indicator from cell {}: '{}'", i, cells[i].char);
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

// ============================================================================
// Ornament Functions (WYSIWYG "Select and Apply" Pattern)
// ============================================================================

/// Apply ornament styling to cells in a selection range
///
/// # Parameters
/// - `cells_js`: JavaScript array of Cell objects
/// - `start`: Start of selection (0-based index)
/// - `end`: End of selection (exclusive)
/// - `position_type`: Position type - "before", "after", or "top"
///
/// # Returns
/// Updated JavaScript array of Cell objects with ornament indicators set
///
/// # Toggle Behavior
/// If the selection already has matching ornament indicators, they will be removed (toggle off)
#[wasm_bindgen(js_name = applyOrnament)]
pub fn apply_ornament(
    cells_js: JsValue,
    start: usize,
    end: usize,
    position_type: &str,
) -> Result<js_sys::Array, JsValue> {
    wasm_info!("applyOrnament called: start={}, end={}, position_type='{}'", start, end, position_type);

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

    // Parse position type
    let ornament_position = match position_type {
        "before" => OrnamentPositionType::Before,
        "after" => OrnamentPositionType::After,
        "top" => OrnamentPositionType::OnTop,
        _ => {
            wasm_warn!("Unknown position type '{}', defaulting to 'after'", position_type);
            OrnamentPositionType::After
        }
    };

    // T051-T052: Enhanced toggle behavior with position change support
    // Check if ornaments already exist in the selection
    let has_existing_ornament = cells.get(start)
        .map(|c| c.has_ornament_indicator())
        .unwrap_or(false);

    if has_existing_ornament {
        // Check if the existing ornament has the SAME position type
        let existing_position = cells.get(start)
            .and_then(|c| {
                if c.has_ornament_indicator() {
                    Some(c.ornament_indicator.position_type())
                } else {
                    None
                }
            });

        if let Some(existing_pos) = existing_position {
            if existing_pos == ornament_position {
                // Same position type → Toggle off (remove ornament)
                let mut removed_count = 0;
                for i in start..actual_end {
                    if cells[i].has_ornament_indicator() {
                        cells[i].clear_ornament();
                        removed_count += 1;
                        wasm_log!("  Removed ornament indicator from cell {}: '{}'", i, cells[i].char);
                    }
                }
                wasm_info!("  Toggled off: Removed ornament indicators from {} cells", removed_count);
            } else {
                // Different position type → Change position (T052)
                wasm_info!("  Changing ornament position from {:?} to {:?}", existing_pos, ornament_position);

                // Clear existing ornaments
                for i in start..actual_end {
                    cells[i].clear_ornament();
                }

                // Apply new position type
                if actual_end - start >= 2 {
                    cells[start].set_ornament_start_with_position(ornament_position);
                    cells[actual_end - 1].set_ornament_end_with_position(ornament_position);

                    // Mark intermediate cells as rhythm-transparent by giving them an ornament indicator
                    for i in (start + 1)..( actual_end - 1) {
                        cells[i].set_ornament_end_with_position(ornament_position);
                    }

                    wasm_info!("  Changed ornament position to {}: cell[{}] = Start, cell[{}] = End, {} intermediate cells marked",
                              position_type, start, actual_end - 1, (actual_end - start).saturating_sub(2));
                }
            }
        }
    } else {
        // Apply new ornament indicators
        // Need at least 2 cells for an ornament span
        if actual_end - start >= 2 {
            // Clear any existing ornaments in range first
            for i in start..actual_end {
                cells[i].clear_ornament();
            }

            // Set start and end indicators with position type
            cells[start].set_ornament_start_with_position(ornament_position);
            cells[actual_end - 1].set_ornament_end_with_position(ornament_position);

            // Mark intermediate cells as rhythm-transparent by giving them an ornament indicator
            // (they need to have the SAME indicator so they're all treated consistently as ornament cells)
            for i in (start + 1)..( actual_end - 1) {
                cells[i].set_ornament_end_with_position(ornament_position);
            }

            wasm_info!("  Applied ornament indicators ({}): cell[{}] = Start, cell[{}] = End, {} intermediate cells marked",
                      position_type, start, actual_end - 1, (actual_end - start).saturating_sub(2));
        } else {
            wasm_warn!("  Selection too short for ornament ({} cells), need at least 2", actual_end - start);
        }
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

    wasm_info!("applyOrnament completed successfully");
    Ok(result)
}

/// Remove ornament styling from cells in a selection range
///
/// # Parameters
/// - `cells_js`: JavaScript array of Cell objects
/// - `start`: Start of selection (0-based index)
/// - `end`: End of selection (exclusive)
///
/// # Returns
/// Updated JavaScript array of Cell objects with ornament indicators removed
#[wasm_bindgen(js_name = removeOrnament)]
pub fn remove_ornament(
    cells_js: JsValue,
    start: usize,
    end: usize,
) -> Result<js_sys::Array, JsValue> {
    wasm_info!("removeOrnament called: start={}, end={}", start, end);

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

    // Clear ornament indicators from cells in selection range
    for i in start..actual_end {
        if cells[i].has_ornament_indicator() {
            cells[i].clear_ornament();
            removed_count += 1;
            wasm_log!("  Removed ornament indicator from cell {}: '{}'", i, cells[i].char);
        }
    }

    wasm_info!("  Removed ornament indicators from {} cells", removed_count);

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

    wasm_info!("removeOrnament completed successfully");
    Ok(result)
}

/// T034: Resolve ornament attachments - compute which cells ornaments attach to
///
/// This function analyzes ornament indicators to determine anchor cells for each ornament group.
/// It returns a map of anchor cell indices to their associated ornament groups (before/after/on_top).
///
/// # Parameters
/// - `cells_js`: JavaScript array of Cell objects
///
/// # Returns
/// JSON string representing AttachmentMap: { "anchor_idx": { "before": [...], "after": [...], "on_top": [...] } }
///
/// # Example
/// ```javascript
/// const attachmentMap = wasmModule.resolveOrnamentAttachments(cells);
/// // Returns: { "4": { "before": [{"start": 1, "end": 3}], "after": [], "on_top": [] } }
/// ```
#[wasm_bindgen(js_name = resolveOrnamentAttachments)]
pub fn resolve_ornament_attachments(
    cells_js: JsValue,
) -> Result<String, JsValue> {
    wasm_info!("resolveOrnamentAttachments called");

    // Parse JavaScript cells array
    let cells: Vec<Cell> = serde_wasm_bindgen::from_value(cells_js)
        .map_err(|e| {
            wasm_error!("Failed to parse cells: {}", e);
            JsValue::from_str(&format!("Failed to parse cells: {}", e))
        })?;

    wasm_info!("Parsed {} cells", cells.len());

    // Extract all ornament spans
    let spans = extract_ornament_spans(&cells);
    wasm_info!("Found {} ornament spans", spans.len());

    // Build attachment map: anchor_idx -> OrnamentGroups
    let mut attachment_map: HashMap<usize, OrnamentGroups> = HashMap::new();

    for span in spans {
        // Find anchor cell for this span
        if let Some(anchor_idx) = find_anchor_cell(&cells, &span) {
            wasm_info!(
                "Span [{}..{}] ({:?}) anchored to cell {}",
                span.start_idx,
                span.end_idx,
                span.position_type,
                anchor_idx
            );

            // Get or create OrnamentGroups for this anchor
            let groups = attachment_map.entry(anchor_idx).or_insert_with(OrnamentGroups::default);

            // Add span to appropriate position group
            match span.position_type {
                OrnamentPositionType::Before => groups.before.push(span),
                OrnamentPositionType::After => groups.after.push(span),
                OrnamentPositionType::OnTop => groups.on_top.push(span),
            }
        } else {
            wasm_warn!(
                "Orphaned ornament span [{}..{}] ({:?}) - no anchor cell found",
                span.start_idx,
                span.end_idx,
                span.position_type
            );
        }
    }

    // Serialize to JSON
    // Convert to a simpler structure for JSON: { "anchor_idx": { "before": [{"start": x, "end": y}], ... } }
    let mut json_map = serde_json::Map::new();
    for (anchor_idx, groups) in attachment_map {
        let mut groups_obj = serde_json::Map::new();

        // Serialize before spans
        let before_arr: Vec<serde_json::Value> = groups
            .before
            .iter()
            .map(|span| {
                serde_json::json!({
                    "start": span.start_idx,
                    "end": span.end_idx,
                    "position_type": "before"
                })
            })
            .collect();
        groups_obj.insert("before".to_string(), serde_json::Value::Array(before_arr));

        // Serialize after spans
        let after_arr: Vec<serde_json::Value> = groups
            .after
            .iter()
            .map(|span| {
                serde_json::json!({
                    "start": span.start_idx,
                    "end": span.end_idx,
                    "position_type": "after"
                })
            })
            .collect();
        groups_obj.insert("after".to_string(), serde_json::Value::Array(after_arr));

        // Serialize on_top spans
        let on_top_arr: Vec<serde_json::Value> = groups
            .on_top
            .iter()
            .map(|span| {
                serde_json::json!({
                    "start": span.start_idx,
                    "end": span.end_idx,
                    "position_type": "on_top"
                })
            })
            .collect();
        groups_obj.insert("on_top".to_string(), serde_json::Value::Array(on_top_arr));

        json_map.insert(anchor_idx.to_string(), serde_json::Value::Object(groups_obj));
    }

    let json_result = serde_json::to_string(&json_map)
        .map_err(|e| {
            wasm_error!("Failed to serialize attachment map: {}", e);
            JsValue::from_str(&format!("Failed to serialize: {}", e))
        })?;

    wasm_info!("resolveOrnamentAttachments completed successfully");
    Ok(json_result)
}

/// T035: Compute ornament layout - compute bounding boxes for ornamental cells
///
/// This function computes positioning and bounding box information for all cells,
/// with special handling for ornamental cells based on edit mode.
///
/// # Parameters
/// - `cells_js`: JavaScript array of Cell objects
/// - `edit_mode`: Boolean indicating if ornaments should be rendered inline (true) or as floating overlays (false)
///
/// # Returns
/// JSON array of bounding boxes: [{ "cell_idx": 0, "x": 0, "y": 0, "width": 0, "height": 12, "is_ornament": false }, ...]
///
/// # Layout modes
/// - **edit_mode=true**: Ornaments rendered inline with normal width
/// - **edit_mode=false**: Ornaments rendered as floating overlays with zero width
#[wasm_bindgen(js_name = computeOrnamentLayout)]
pub fn compute_ornament_layout(
    cells_js: JsValue,
    edit_mode: bool,
) -> Result<String, JsValue> {
    wasm_info!("computeOrnamentLayout called: edit_mode={}", edit_mode);

    // Parse JavaScript cells array
    let cells: Vec<Cell> = serde_wasm_bindgen::from_value(cells_js)
        .map_err(|e| {
            wasm_error!("Failed to parse cells: {}", e);
            JsValue::from_str(&format!("Failed to parse cells: {}", e))
        })?;

    wasm_info!("Parsed {} cells", cells.len());

    // Build layout array
    let mut layout = Vec::new();
    let mut cumulative_x = 0.0;
    let base_font_size = 16.0; // Default font size
    let base_height = 20.0; // Default height

    for (idx, cell) in cells.iter().enumerate() {
        let is_ornament = cell.ornament_indicator != OrnamentIndicator::None;

        // Compute width based on mode
        let width = if is_ornament && !edit_mode {
            0.0  // Zero width for floating ornaments in normal mode
        } else {
            // Approximate width based on character count
            let char_count = cell.char.chars().count();
            base_font_size * char_count as f32 * 0.6
        };

        // Compute height (ornaments are rendered smaller)
        let height = if is_ornament {
            base_height * 0.75 // 75% height for ornaments
        } else {
            base_height
        };

        // Build bounding box object
        let bbox = serde_json::json!({
            "cell_idx": idx,
            "x": cumulative_x,
            "y": 0.0,
            "width": width,
            "height": height,
            "is_ornament": is_ornament,
        });

        layout.push(bbox);

        // Update cumulative x (for next cell)
        cumulative_x += width;
    }

    // Serialize to JSON
    let json_result = serde_json::to_string(&layout)
        .map_err(|e| {
            wasm_error!("Failed to serialize layout: {}", e);
            JsValue::from_str(&format!("Failed to serialize: {}", e))
        })?;

    wasm_info!("computeOrnamentLayout completed: {} cells", layout.len());
    Ok(json_result)
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

/// Set the document pitch system
///
/// # Parameters
/// - `document_js`: JavaScript Document object
/// - `pitch_system`: The new pitch system (0-5, where 1=Number, 2=Western, 3=Sargam, 4=Bhatkhande, 5=Tabla)
///
/// # Returns
/// Updated JavaScript Document object with the pitch system set
#[wasm_bindgen(js_name = setDocumentPitchSystem)]
pub fn set_document_pitch_system(
    document_js: JsValue,
    pitch_system: u8,
) -> Result<JsValue, JsValue> {
    wasm_info!("setDocumentPitchSystem called: pitch_system={}", pitch_system);

    // Deserialize document from JavaScript
    let mut document: Document = serde_wasm_bindgen::from_value(document_js)
        .map_err(|e| {
            wasm_error!("Deserialization error: {}", e);
            JsValue::from_str(&format!("Deserialization error: {}", e))
        })?;

    // Validate and set the pitch system
    let system = match pitch_system {
        0 => PitchSystem::Unknown,
        1 => PitchSystem::Number,
        2 => PitchSystem::Western,
        3 => PitchSystem::Sargam,
        4 => PitchSystem::Bhatkhande,
        5 => PitchSystem::Tabla,
        _ => {
            wasm_error!("Invalid pitch system value: {}", pitch_system);
            return Err(JsValue::from_str(&format!("Invalid pitch system: {}", pitch_system)));
        }
    };

    document.pitch_system = Some(system);
    wasm_info!("  Document pitch system set to: {:?}", system);

    // Compute glyphs before serialization
    document.compute_glyphs();

    // Serialize back to JavaScript
    let result = serde_wasm_bindgen::to_value(&document)
        .map_err(|e| {
            wasm_error!("Serialization error: {}", e);
            JsValue::from_str(&format!("Serialization error: {}", e))
        })?;

    wasm_info!("setDocumentPitchSystem completed successfully");
    Ok(result)
}

/// Expand ornaments from cell.ornaments into the cells vector
/// This is called when turning edit mode ON
fn expand_ornaments_to_cells(line: &mut Line) {
    use crate::models::elements::OrnamentPlacement;

    let mut new_cells = Vec::new();

    for cell in line.cells.drain(..) {
        // Add the parent cell
        let mut parent_cell = cell.clone();
        let ornaments_to_expand = parent_cell.ornaments.clone();
        parent_cell.ornaments.clear(); // Clear ornaments from parent
        new_cells.push(parent_cell);

        // Expand each ornament into cells
        for ornament in ornaments_to_expand {
            let ornament_cells = ornament.cells;
            if !ornament_cells.is_empty() {
                // Determine position type from ornament placement (default to Before)
                let position = match ornament.placement {
                    OrnamentPlacement::Before => OrnamentPositionType::Before,
                    OrnamentPlacement::After => OrnamentPositionType::After,
                };

                // Mark first cell with appropriate OrnamentStart variant
                let mut first_cell = ornament_cells[0].clone();
                first_cell.set_ornament_start_with_position(position);
                new_cells.push(first_cell);

                // Add middle cells (no indicator)
                for middle_cell in ornament_cells.iter().skip(1).take(ornament_cells.len().saturating_sub(2)) {
                    new_cells.push(middle_cell.clone());
                }

                // Mark last cell with appropriate OrnamentEnd variant (if more than one cell)
                if ornament_cells.len() > 1 {
                    let mut last_cell = ornament_cells[ornament_cells.len() - 1].clone();
                    last_cell.set_ornament_end_with_position(position);
                    new_cells.push(last_cell);
                }
            }
        }
    }

    line.cells = new_cells;
}

/// Collapse ornament cells back into cell.ornaments
/// This is called when turning edit mode OFF
fn collapse_ornaments_from_cells(line: &mut Line) {
    use crate::models::elements::{Ornament, OrnamentPlacement};

    let mut new_cells: Vec<Cell> = Vec::new();
    let mut i = 0;

    while i < line.cells.len() {
        let cell = &line.cells[i];

        // Check if this cell starts an ornament
        if cell.ornament_indicator.is_start() {
            // Find the parent cell (previous cell)
            if let Some(parent_cell) = new_cells.last_mut() {
                // Collect ornament cells
                let mut ornament_cells = Vec::new();
                let mut j = i;

                // Get the position type from the first ornament cell
                let position_type = cell.ornament_indicator.position_type();
                let placement = match position_type {
                    OrnamentPositionType::Before => OrnamentPlacement::Before,
                    OrnamentPositionType::After => OrnamentPlacement::After,
                    OrnamentPositionType::OnTop => OrnamentPlacement::Before, // Default to Before for OnTop
                };

                loop {
                    let ornament_cell = &line.cells[j];
                    let mut clean_cell = ornament_cell.clone();
                    clean_cell.ornament_indicator = OrnamentIndicator::None;
                    ornament_cells.push(clean_cell);

                    if ornament_cell.ornament_indicator.is_end() {
                        break;
                    }

                    j += 1;
                    if j >= line.cells.len() {
                        break;
                    }
                }

                // Create ornament and attach to parent
                let ornament = Ornament {
                    cells: ornament_cells,
                    placement,
                };
                parent_cell.ornaments.push(ornament);

                i = j + 1; // Skip past the ornament cells
                continue;
            }
        }

        // Regular cell - just add it
        new_cells.push(cell.clone());
        i += 1;
    }

    line.cells = new_cells;
}

/// Set the ornament edit mode for the document
///
/// # Parameters
/// - `document_js`: JavaScript Document object
/// - `mode`: true to enable edit mode (ornaments display in normal position), false for attached mode
///
/// # Returns
/// Updated JavaScript Document object with the ornament edit mode set
#[wasm_bindgen(js_name = setOrnamentEditMode)]
pub fn set_ornament_edit_mode(
    document_js: JsValue,
    mode: bool,
) -> Result<JsValue, JsValue> {
    wasm_info!("setOrnamentEditMode called: mode={}", mode);

    // Deserialize document from JavaScript
    let mut document: Document = serde_wasm_bindgen::from_value(document_js)
        .map_err(|e| {
            wasm_error!("Deserialization error: {}", e);
            JsValue::from_str(&format!("Deserialization error: {}", e))
        })?;

    // Expand or collapse ornaments in all lines
    for line in &mut document.lines {
        if mode {
            // OFF → ON: expand ornaments into cells
            expand_ornaments_to_cells(line);
            wasm_info!("  Expanded ornaments in line");
        } else {
            // ON → OFF: collapse cells back to ornaments
            collapse_ornaments_from_cells(line);
            wasm_info!("  Collapsed ornaments in line");
        }
    }

    document.ornament_edit_mode = mode;
    wasm_info!("  Ornament edit mode set to: {}", mode);

    // Compute glyphs before serialization
    document.compute_glyphs();

    // Serialize back to JavaScript
    let result = serde_wasm_bindgen::to_value(&document)
        .map_err(|e| {
            wasm_error!("Serialization error: {}", e);
            JsValue::from_str(&format!("Serialization error: {}", e))
        })?;

    wasm_info!("setOrnamentEditMode completed successfully");
    Ok(result)
}

/// Get the ornament edit mode from the document
///
/// # Parameters
/// - `document_js`: JavaScript Document object
///
/// # Returns
/// true if edit mode is enabled, false for attached mode
#[wasm_bindgen(js_name = getOrnamentEditMode)]
pub fn get_ornament_edit_mode(document_js: JsValue) -> Result<bool, JsValue> {
    // Deserialize document from JavaScript
    let document: Document = serde_wasm_bindgen::from_value(document_js)
        .map_err(|e| {
            wasm_error!("Deserialization error: {}", e);
            JsValue::from_str(&format!("Deserialization error: {}", e))
        })?;

    Ok(document.ornament_edit_mode)
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

    // Validate tala format (allow empty to clear, or only digits 0-9 and +)
    if !tala.is_empty() && !tala.chars().all(|c| c.is_ascii_digit() || c == '+') {
        wasm_error!("Invalid tala format: '{}' (only digits 0-9, + allowed, or empty to clear)", tala);
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

/// Set pitch system for a specific line
///
/// # Parameters
/// - `document_js`: JavaScript Document object
/// - `line_index`: Index of the line to set pitch system for (0-based)
/// - `pitch_system`: The new pitch system (0-5, where 1=Number, 2=Western, 3=Sargam, 4=Bhatkhande, 5=Tabla)
///
/// # Returns
/// Updated JavaScript Document object with the line pitch system set
#[wasm_bindgen(js_name = setLinePitchSystem)]
pub fn set_line_pitch_system(
    document_js: JsValue,
    line_index: usize,
    pitch_system: u8,
) -> Result<JsValue, JsValue> {
    wasm_info!("setLinePitchSystem called: line_index={}, pitch_system={}", line_index, pitch_system);

    // Deserialize document from JavaScript
    let mut document: Document = serde_wasm_bindgen::from_value(document_js)
        .map_err(|e| {
            wasm_error!("Deserialization error: {}", e);
            JsValue::from_str(&format!("Deserialization error: {}", e))
        })?;

    // Validate line index
    if line_index >= document.lines.len() {
        wasm_error!("Line index {} out of bounds (max: {})", line_index, document.lines.len() - 1);
        return Err(JsValue::from_str(&format!("Line index {} out of bounds", line_index)));
    }

    // Validate and set the pitch system
    let system = match pitch_system {
        0 => PitchSystem::Unknown,
        1 => PitchSystem::Number,
        2 => PitchSystem::Western,
        3 => PitchSystem::Sargam,
        4 => PitchSystem::Bhatkhande,
        5 => PitchSystem::Tabla,
        _ => {
            wasm_error!("Invalid pitch system value: {}", pitch_system);
            return Err(JsValue::from_str(&format!("Invalid pitch system: {}", pitch_system)));
        }
    };

    document.lines[line_index].pitch_system = Some(system);
    wasm_info!("  Line pitch system set to: {:?}", system);

    // Compute glyphs before serialization
    document.compute_glyphs();

    // Serialize back to JavaScript
    let result = serde_wasm_bindgen::to_value(&document)
        .map_err(|e| {
            wasm_error!("Serialization error: {}", e);
            JsValue::from_str(&format!("Serialization error: {}", e))
        })?;

    wasm_info!("setLinePitchSystem completed successfully");
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

/// Export document to MIDI format
///
/// Converts the internal document to MusicXML, then to MIDI using the musicxml_to_midi converter.
///
/// # Parameters
/// - `document_js`: JavaScript Document object
/// - `tpq`: Ticks per quarter note (typically 480 or 960), use 0 for default (480)
///
/// # Returns
/// MIDI file as Uint8Array (Standard MIDI File Format 1)
#[wasm_bindgen(js_name = exportMIDI)]
pub fn export_midi(document_js: JsValue, tpq: u16) -> Result<js_sys::Uint8Array, JsValue> {
    wasm_info!("exportMIDI called with tpq={}", tpq);

    // Deserialize document from JavaScript
    let document: Document = serde_wasm_bindgen::from_value(document_js)
        .map_err(|e| {
            wasm_error!("Deserialization error: {}", e);
            JsValue::from_str(&format!("Deserialization error: {}", e))
        })?;

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
    let config: crate::html_layout::LayoutConfig = serde_wasm_bindgen::from_value(config_js)
        .map_err(|e| {
            wasm_error!("Config deserialization error: {}", e);
            JsValue::from_str(&format!("Config deserialization error: {}", e))
        })?;

    wasm_log!("  Document has {} lines", document.lines.len());
    wasm_log!("  Config: {} cell widths, {} syllable widths",
             config.cell_widths.len(), config.syllable_widths.len());

    // Create layout engine and compute layout
    let engine = crate::html_layout::LayoutEngine::new();
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

/// Split a line at the given character position
///
/// # Parameters
/// - `doc_js`: JavaScript object representing the Document
/// - `stave_index`: The index of the line/stave to split (0-based)
/// - `char_pos`: The character position where to split (0-based)
///
/// # Returns
/// JavaScript object representing the updated Document with the line split
///
/// # Behavior
/// - Cells before char_pos stay in the current line
/// - Cells after char_pos move to the new line
/// - New line inherits: pitch_system, tonic, key_signature, time_signature
/// - New line gets empty: label, lyrics, tala
#[wasm_bindgen(js_name = splitLineAtPosition)]
pub fn split_line_at_position(
    doc_js: JsValue,
    stave_index: usize,
    char_pos: usize,
) -> Result<JsValue, JsValue> {
    wasm_info!("splitLineAtPosition called: stave_index={}, char_pos={}", stave_index, char_pos);

    // Deserialize document from JavaScript
    let mut doc: Document = serde_wasm_bindgen::from_value(doc_js)
        .map_err(|e| {
            wasm_error!("Document deserialization error: {}", e);
            JsValue::from_str(&format!("Document deserialization error: {}", e))
        })?;

    // Validate stave index
    if stave_index >= doc.lines.len() {
        wasm_warn!("Stave index {} out of bounds (document has {} lines)", stave_index, doc.lines.len());
        return Err(JsValue::from_str("Stave index out of bounds"));
    }

    let current_line = &doc.lines[stave_index];
    wasm_log!("Current line has {} cells", current_line.cells.len());

    // Convert character position to cell index
    let mut char_count = 0;
    let mut split_cell_index = current_line.cells.len();

    for (i, cell) in current_line.cells.iter().enumerate() {
        let cell_char_count = cell.char.chars().count();
        if char_count + cell_char_count > char_pos {
            // Found the cell that contains the split point
            split_cell_index = i;
            break;
        }
        char_count += cell_char_count;
    }

    wasm_log!("Split point: char_pos={}, split_cell_index={}", char_pos, split_cell_index);

    // Split the cells array
    let mut line = doc.lines.remove(stave_index);
    let cells_after = line.cells.split_off(split_cell_index);

    // Create new line with cells after split, inheriting musical properties
    let new_line = Line {
        cells: cells_after,
        label: String::new(), // New line starts with no label
        tala: String::new(),  // New line starts with no tala
        lyrics: String::new(), // New line starts with no lyrics
        tonic: line.tonic.clone(), // Inherit tonic
        pitch_system: line.pitch_system.clone(), // Inherit pitch system
        key_signature: line.key_signature.clone(), // Inherit key signature
        tempo: line.tempo.clone(), // Inherit tempo
        time_signature: line.time_signature.clone(), // Inherit time signature
        beats: Vec::new(),
        slurs: Vec::new(),
    };

    wasm_log!("Old line now has {} cells, new line has {} cells",
              line.cells.len(), new_line.cells.len());

    // Insert both lines back into document
    doc.lines.insert(stave_index, line);
    doc.lines.insert(stave_index + 1, new_line);

    wasm_info!("Line split successfully, document now has {} lines", doc.lines.len());

    // Serialize and return updated document
    let result = serde_wasm_bindgen::to_value(&doc)
        .map_err(|e| {
            wasm_error!("Document serialization error: {}", e);
            JsValue::from_str(&format!("Document serialization error: {}", e))
        })?;

    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Helper to calculate cursor position after insertion (pure Rust, no JsValue)
    fn calculate_cursor_pos_after_insert(cells: &[Cell], insert_pos: usize) -> usize {
        let mut new_cursor_pos = 0;
        for (i, cell) in cells.iter().enumerate() {
            if i == insert_pos {
                new_cursor_pos += cell.char.chars().count();
                break;
            } else {
                new_cursor_pos += cell.char.chars().count();
            }
        }
        new_cursor_pos
    }

    /// Helper to create a simple Cell for testing
    fn make_cell(char: &str, col: usize) -> Cell {
        Cell::new(char.to_string(), crate::models::ElementKind::Unknown, col)
    }

    #[test]
    fn test_cursor_after_insert_at_end() {
        // Test: Type 'p', then 'q' → cursor should be at char position 2
        let cells = vec![
            make_cell("p", 0),
            make_cell("q", 1),
        ];

        let cursor = calculate_cursor_pos_after_insert(&cells, 1);
        assert_eq!(cursor, 2, "After inserting 'q' at position 1, cursor should be at char pos 2");
    }

    #[test]
    fn test_cursor_after_insert_in_middle() {
        // Test: Type 'p', 'q', then insert 'r' in the middle → cursor should be at char position 2
        // Cells: ['p', 'r', 'q']
        // Insert position: 1 (where 'r' was just inserted)
        let cells = vec![
            make_cell("p", 0),
            make_cell("r", 1),
            make_cell("q", 2),
        ];

        let cursor = calculate_cursor_pos_after_insert(&cells, 1);
        assert_eq!(cursor, 2, "After inserting 'r' at cell index 1, cursor should be at char pos 2 (after 'pr')");
    }

    #[test]
    fn test_cursor_with_multichar_glyph() {
        // Test: Type '1', then '#' which combines to '1#'
        // Cells: ['1#']
        // Insert position: 0 (combination happened at position 0)
        let cells = vec![
            make_cell("1#", 0),
        ];

        let cursor = calculate_cursor_pos_after_insert(&cells, 0);
        assert_eq!(cursor, 2, "After inserting into multi-char glyph '1#', cursor should be at char pos 2");
    }

    #[test]
    fn test_cursor_multichar_in_middle() {
        // Test: Type 'p', 'q', left arrow, then 'r'
        // But if 'qr' combines into a multi-char glyph 'qr'
        // Cells: ['p', 'qr']
        // Insert position: 1 (where the combination happened)
        let cells = vec![
            make_cell("p", 0),
            make_cell("qr", 1),
        ];

        let cursor = calculate_cursor_pos_after_insert(&cells, 1);
        assert_eq!(cursor, 3, "After inserting 'r' which forms 'qr', cursor should be at char pos 3 (after 'pqr')");
    }

    #[test]
    fn test_cursor_at_start() {
        // Test: Insert at position 0
        // Cells: ['r', 'p', 'q']
        let cells = vec![
            make_cell("r", 0),
            make_cell("p", 1),
            make_cell("q", 2),
        ];

        let cursor = calculate_cursor_pos_after_insert(&cells, 0);
        assert_eq!(cursor, 1, "After inserting 'r' at position 0, cursor should be at char pos 1");
    }

    #[test]
    fn test_delete_accidental_updates_pitch_code() {
        // Test: Type "1#" then backspace should result in "1" with correct pitch_code

        // Step 1: Parse "1"
        let mut cells = vec![parse_single('1', PitchSystem::Number, 0)];
        assert_eq!(cells.len(), 1);
        assert_eq!(cells[0].char, "1");
        assert_eq!(cells[0].pitch_code, Some(crate::models::PitchCode::N1));  // N1 = 1 natural
        assert_eq!(cells[0].continuation, false);

        // Step 2: Parse "#" and add it
        cells.push(parse_single('#', PitchSystem::Number, 1));
        assert_eq!(cells.len(), 2);

        // Step 3: Mark continuations - this should combine "1" + "#" = "1#" with pitch_code N1s
        mark_continuations(&mut cells);
        assert_eq!(cells.len(), 2);
        assert_eq!(cells[0].char, "1");
        assert_eq!(cells[1].char, "#");
        assert_eq!(cells[1].continuation, true);
        assert_eq!(cells[0].pitch_code, Some(crate::models::PitchCode::N1s));  // N1s = 1 sharp

        // Step 4: Delete the "#" at position 1
        cells.remove(1);

        // Step 5: IMPORTANT: After deleting from a multi-cell glyph, reparse the root!
        // This is what delete_character() should do
        let reparsed = parse(&cells[0].char, PitchSystem::Number, cells[0].col);
        cells[0].pitch_code = reparsed.pitch_code;
        cells[0].kind = reparsed.kind;

        // Step 6: Re-mark continuations (to handle any lookright scenarios)
        mark_continuations(&mut cells);

        // Step 7: After deletion and reparse, we should have just "1" with pitch_code N1
        assert_eq!(cells.len(), 1);
        assert_eq!(cells[0].char, "1");
        assert_eq!(cells[0].continuation, false);

        // After the fix, pitch_code should be N1 (1 natural)
        assert_eq!(cells[0].pitch_code, Some(crate::models::PitchCode::N1),
                   "After deleting '#' and reparsing, pitch_code should be N1 (1 natural)");
    }

    #[test]
    fn test_parse_triple_sharp_limits_to_double() {
        // Test: Parse "1###" should result in "1##" (double sharp) + "#" (text)
        // A note can only have up to 2 accidentals (double sharp or double flat)

        let mut cells = Vec::new();

        // Parse each character
        cells.push(parse_single('1', PitchSystem::Number, 0));
        cells.push(parse_single('#', PitchSystem::Number, 1));
        cells.push(parse_single('#', PitchSystem::Number, 2));
        cells.push(parse_single('#', PitchSystem::Number, 3));

        // Mark continuations
        mark_continuations(&mut cells);

        // Expected result: "1##" + "#"
        // Cell 0: "1" (root, PitchedElement)
        // Cell 1: "#" (continuation, PitchedElement)
        // Cell 2: "#" (continuation, PitchedElement)
        // Cell 3: "#" (Text, not a continuation)

        assert_eq!(cells.len(), 4, "Should have 4 cells");

        // Cell 0: "1" - root of the note
        assert_eq!(cells[0].char, "1");
        assert_eq!(cells[0].kind, crate::models::ElementKind::PitchedElement);
        assert_eq!(cells[0].continuation, false);
        assert_eq!(cells[0].pitch_code, Some(crate::models::PitchCode::N1ss),
                   "First cell should have N1ss (double sharp)");

        // Cell 1: "#" - first accidental (continuation)
        assert_eq!(cells[1].char, "#");
        assert_eq!(cells[1].continuation, true,
                   "Second cell should be continuation of note");

        // Cell 2: "#" - second accidental (continuation)
        assert_eq!(cells[2].char, "#");
        assert_eq!(cells[2].continuation, true,
                   "Third cell should be continuation of note");

        // Cell 3: "#" - third accidental should be Symbol, not part of the note
        assert_eq!(cells[3].char, "#");
        assert_eq!(cells[3].kind, crate::models::ElementKind::Symbol,
                   "Fourth cell should be Symbol (not part of the note)");
        assert_eq!(cells[3].continuation, false,
                   "Fourth cell should NOT be a continuation");
    }

    #[test]
    fn test_apply_slur_with_cell_11() {
        // Test: Apply slur with cell index 11 in a 12-cell array
        // This is a regression test for: "apply slur not working for 11"

        // Create 12 cells (indices 0-11) with PitchedElement kind
        let mut cells = Vec::new();
        for i in 0..12 {
            let mut cell = make_cell(&i.to_string(), i);
            cell.kind = crate::models::ElementKind::PitchedElement;
            cells.push(cell);
        }

        // Test 1: Apply slur from cell 10 to 11 (end=12, exclusive)
        let slur_result = apply_slur_cells(&cells, 10, 12);
        assert_eq!(slur_result.len(), 12, "Should have 12 cells after slur application");
        assert_eq!(slur_result[10].slur_indicator, crate::models::SlurIndicator::SlurStart,
                   "Cell 10 should have SlurStart");
        assert_eq!(slur_result[11].slur_indicator, crate::models::SlurIndicator::SlurEnd,
                   "Cell 11 should have SlurEnd");
        assert_eq!(slur_result[9].slur_indicator, crate::models::SlurIndicator::None,
                   "Cell 9 should NOT have slur indicator");

        // Test 2: Apply slur with only 1 cell (should not apply)
        let slur_single = apply_slur_cells(&cells, 10, 11);
        assert_eq!(slur_single[10].slur_indicator, crate::models::SlurIndicator::None,
                   "Single cell should not get a slur (needs at least 2 cells)");

        // Test 3: Apply slur across entire 12-cell line
        let slur_all = apply_slur_cells(&cells, 0, 12);
        assert_eq!(slur_all[0].slur_indicator, crate::models::SlurIndicator::SlurStart,
                   "Cell 0 should have SlurStart");
        assert_eq!(slur_all[11].slur_indicator, crate::models::SlurIndicator::SlurEnd,
                   "Cell 11 should have SlurEnd in full line slur");

        // Test 4: Apply slur from cell 9 to 11
        let slur_three = apply_slur_cells(&cells, 9, 12);
        assert_eq!(slur_three[9].slur_indicator, crate::models::SlurIndicator::SlurStart,
                   "Cell 9 should have SlurStart");
        assert_eq!(slur_three[10].slur_indicator, crate::models::SlurIndicator::None,
                   "Cell 10 should NOT have slur (middle cell)");
        assert_eq!(slur_three[11].slur_indicator, crate::models::SlurIndicator::SlurEnd,
                   "Cell 11 should have SlurEnd");
    }

    /// Helper function to apply slur directly to a cell vec (for testing)
    fn apply_slur_cells(cells: &[Cell], start: usize, end: usize) -> Vec<Cell> {
        let mut result = cells.to_vec();
        let actual_end = end.min(result.len());

        // Clear any existing slur indicators in the range first
        for i in start..actual_end {
            result[i].clear_slur();
        }

        // Check if we have at least 2 cells for a slur
        if actual_end - start >= 2 {
            result[start].set_slur_start();
            result[actual_end - 1].set_slur_end();
        }

        result
    }

    #[test]
    fn test_apply_command_slur_toggle() {
        // Test: applyCommand with slur should apply and toggle correctly
        // This verifies the fix for "no slur visible" issue

        // Create 12 cells with PitchedElement kind
        let mut cells = Vec::new();
        for i in 0..12 {
            let mut cell = make_cell(&i.to_string(), i);
            cell.kind = crate::models::ElementKind::PitchedElement;
            cells.push(cell);
        }

        // Test 1: Apply slur via applyCommand to cells 0-1
        let result1 = apply_command_slur(&cells, 0, 2);
        assert_eq!(result1[0].slur_indicator, crate::models::SlurIndicator::SlurStart,
                   "Cell 0 should have SlurStart after applyCommand");
        assert_eq!(result1[1].slur_indicator, crate::models::SlurIndicator::SlurEnd,
                   "Cell 1 should have SlurEnd after applyCommand");

        // Test 2: Toggle slur off
        let result2 = apply_command_slur(&result1, 0, 2);
        assert_eq!(result2[0].slur_indicator, crate::models::SlurIndicator::None,
                   "Cell 0 should have None after toggling slur off");
        assert_eq!(result2[1].slur_indicator, crate::models::SlurIndicator::None,
                   "Cell 1 should have None after toggling slur off");

        // Test 3: Apply slur with exclusive-end (10, 12) for 12-cell array
        let result3 = apply_command_slur(&cells, 10, 12);
        assert_eq!(result3[10].slur_indicator, crate::models::SlurIndicator::SlurStart,
                   "Cell 10 should have SlurStart with exclusive end (10, 12)");
        assert_eq!(result3[11].slur_indicator, crate::models::SlurIndicator::SlurEnd,
                   "Cell 11 should have SlurEnd with exclusive end (10, 12)");
    }

    /// Helper function to apply command slur (for testing)
    fn apply_command_slur(cells: &[Cell], start: usize, end: usize) -> Vec<Cell> {
        let mut result = cells.to_vec();
        let actual_end = end.min(result.len());

        // Check if slur already exists on the first cell
        let has_existing_slur = result.get(start).map(|c| c.has_slur()).unwrap_or(false);

        if has_existing_slur {
            // Remove existing slur
            for i in start..actual_end {
                if result[i].has_slur() {
                    result[i].clear_slur();
                }
            }
        } else if actual_end - start >= 2 {
            // Apply new slur
            for i in start..actual_end {
                result[i].clear_slur();
            }
            result[start].set_slur_start();
            result[actual_end - 1].set_slur_end();
        }

        result
    }
}
