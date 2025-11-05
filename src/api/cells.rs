//! Cell manipulation operations
//!
//! This module provides WASM API functions for manipulating individual cells
//! in the musical notation, including character insertion, deletion, and
//! applying musical attributes like octave changes.

use wasm_bindgen::prelude::*;
use crate::models::{Cell, PitchSystem};
use crate::parse::grammar::{parse, parse_single, mark_continuations};

// Re-export logging macros from helpers module
#[allow(unused_imports)]
use crate::api::helpers::*;

// Logging macros for WASM - re-declare locally to use with macro_export
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

/// Apply octave to cells in a selection range (LEGACY - Phase 0 API)
/// DEPRECATED: Use the new applyOctave() which uses internal DOCUMENT
///
/// # Parameters
/// - `cells_js`: JavaScript array of Cell objects
/// - `start`: Start of selection (0-based index)
/// - `end`: End of selection (exclusive)
/// - `octave`: Octave value (-1, 0, or 1)
///
/// # Returns
/// Updated JavaScript array of Cell objects with octave applied
#[wasm_bindgen(js_name = applyOctaveLegacy)]
pub fn apply_octave_legacy(
    cells_js: JsValue,
    start: usize,
    end: usize,
    octave: i8,
) -> Result<js_sys::Array, JsValue> {
    wasm_warn!("⚠️  applyOctaveLegacy called - DEPRECATED, use applyOctave() instead");
    wasm_info!("applyOctaveLegacy called: start={}, end={}, octave={}", start, end, octave);

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

    wasm_info!("applyOctaveLegacy completed successfully");
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
