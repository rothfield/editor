//! Cell manipulation operations
//!
//! This module provides WASM API functions for manipulating individual cells
//! in the musical notation, including character insertion, deletion, and
//! applying musical attributes like octave changes.

use wasm_bindgen::prelude::*;
use crate::models::{Cell, PitchSystem, PitchCode};
use crate::parse::grammar::parse_single;

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

    let new_cell = parse_single(c, pitch_system, column, None);

    // Insert the new cell at the cursor position
    let insert_pos = cursor_pos.min(cells.len());
    cells.insert(insert_pos, new_cell);

    // Update column indices for cells after insertion
    for i in (insert_pos + 1)..cells.len() {
        cells[i].col += 1;
    }

    // Check for accidental mutations
    // 1. Natural + "b" -> Flat
    // 2. Natural + "#" -> Sharp
    // 3. Flat + "/" -> Half-flat

    // Handle "b" mutation: Natural -> Flat
    if c == 'b' && insert_pos > 0 {
        if let Some(pitch_code) = cells[insert_pos - 1].pitch_code {
            let is_natural = matches!(pitch_code,
                PitchCode::N1 | PitchCode::N2 | PitchCode::N3 | PitchCode::N4 |
                PitchCode::N5 | PitchCode::N6 | PitchCode::N7
            );

            if is_natural {
                wasm_log!("  Mutating natural + 'b' to flat at position {}", insert_pos - 1);

                // Mutate natural to flat
                let new_pitch_code = match pitch_code {
                    PitchCode::N1 => PitchCode::N1b,
                    PitchCode::N2 => PitchCode::N2b,
                    PitchCode::N3 => PitchCode::N3b,
                    PitchCode::N4 => PitchCode::N4b,
                    PitchCode::N5 => PitchCode::N5b,
                    PitchCode::N6 => PitchCode::N6b,
                    PitchCode::N7 => PitchCode::N7b,
                    _ => pitch_code,
                };

                cells[insert_pos - 1].pitch_code = Some(new_pitch_code);

                // Update glyph for new pitch code
                use crate::renderers::font_utils::glyph_for_pitch;
                if let Some(new_glyph) = glyph_for_pitch(new_pitch_code, cells[insert_pos - 1].octave, pitch_system) {
                    cells[insert_pos - 1].char = new_glyph.to_string();
                }

                // Remove the "b" cell
                cells.remove(insert_pos);

                // Renumber columns
                for i in insert_pos..cells.len() {
                    cells[i].col = i;
                }

                wasm_log!("  Mutation complete: {:?} -> {:?}", pitch_code, new_pitch_code);
            }
        }
    }

    // Handle "/" mutation: Flat -> Half-flat
    else if c == '/' && insert_pos > 0 {
        if let Some(pitch_code) = cells[insert_pos - 1].pitch_code {
            let is_flat = matches!(pitch_code,
                PitchCode::N1b | PitchCode::N2b | PitchCode::N3b | PitchCode::N4b |
                PitchCode::N5b | PitchCode::N6b | PitchCode::N7b
            );

            if is_flat {
                wasm_log!("  Mutating flat + '/' to half-flat at position {}", insert_pos - 1);

                // Mutate flat to half-flat
                let new_pitch_code = match pitch_code {
                    PitchCode::N1b => PitchCode::N1hf,
                    PitchCode::N2b => PitchCode::N2hf,
                    PitchCode::N3b => PitchCode::N3hf,
                    PitchCode::N4b => PitchCode::N4hf,
                    PitchCode::N5b => PitchCode::N5hf,
                    PitchCode::N6b => PitchCode::N6hf,
                    PitchCode::N7b => PitchCode::N7hf,
                    _ => pitch_code,
                };

                cells[insert_pos - 1].pitch_code = Some(new_pitch_code);

                // Update glyph for new pitch code
                use crate::renderers::font_utils::glyph_for_pitch;
                if let Some(new_glyph) = glyph_for_pitch(new_pitch_code, cells[insert_pos - 1].octave, pitch_system) {
                    cells[insert_pos - 1].char = new_glyph.to_string();
                }

                // Remove the "/" cell we just inserted
                cells.remove(insert_pos);

                // Renumber columns after removal
                for i in insert_pos..cells.len() {
                    cells[i].col = i;
                }

                wasm_log!("  Mutation complete: {:?} -> {:?}", pitch_code, new_pitch_code);
            }
        }
    }

    let cells_after = cells.len();
    let cells_delta = cells_after as i32 - cells_before as i32;
    wasm_info!("  After insertion: {} cells (delta: {:+})", cells_after, cells_delta);

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
        let cell = parse_single(c, pitch_system, column, None);
        cells.push(cell);
        column += 1;
    }

    wasm_log!("  Parsed {} cells", cells.len());

    // Post-process: Convert flat + "/" to half-flat
    // When we see a flat pitch (N1b-N7b) followed by "/", mutate to half-flat (N1hf-N7hf)
    use crate::renderers::font_utils::glyph_for_pitch;
    let mut i = 0;
    while i < cells.len().saturating_sub(1) {
        if let Some(pitch_code) = cells[i].pitch_code {
            // Check if this is a flat note
            let is_flat = matches!(pitch_code,
                PitchCode::N1b | PitchCode::N2b | PitchCode::N3b | PitchCode::N4b |
                PitchCode::N5b | PitchCode::N6b | PitchCode::N7b
            );

            // Check if next cell is "/"
            let next_is_slash = cells.get(i + 1).map(|c| c.char.as_str()) == Some("/");

            if is_flat && next_is_slash {
                wasm_log!("  Mutating flat + '/' to half-flat at position {}", i);

                // Mutate flat to half-flat
                let new_pitch_code = match pitch_code {
                    PitchCode::N1b => PitchCode::N1hf,
                    PitchCode::N2b => PitchCode::N2hf,
                    PitchCode::N3b => PitchCode::N3hf,
                    PitchCode::N4b => PitchCode::N4hf,
                    PitchCode::N5b => PitchCode::N5hf,
                    PitchCode::N6b => PitchCode::N6hf,
                    PitchCode::N7b => PitchCode::N7hf,
                    _ => pitch_code, // Should not happen
                };

                cells[i].pitch_code = Some(new_pitch_code);

                // Update glyph for new pitch code
                if let Some(new_glyph) = glyph_for_pitch(new_pitch_code, cells[i].octave, pitch_system) {
                    cells[i].char = new_glyph.to_string();
                }

                // Remove the "/" cell
                cells.remove(i + 1);

                // Renumber columns for cells after removal
                for j in (i + 1)..cells.len() {
                    cells[j].col = j;
                }

                wasm_log!("  Mutation complete: {:?} -> {:?}", pitch_code, new_pitch_code);
            }
        }
        i += 1;
    }

    wasm_log!("  After half-flat mutation: {} cells", cells.len());

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

    // WASM-First Architecture: Ornament deletion protection
    // Check if cell has ornament indicator - ornaments cannot be deleted in normal mode
    if cells[cursor_pos].has_ornament_indicator() {
        wasm_warn!("Cannot delete ornament cell at position {} - ornaments are non-editable", cursor_pos);
        return Err(JsValue::from_str("Cannot delete ornament cells - toggle ornament edit mode first"));
    }

    // NEW ARCHITECTURE: No continuation cells
    // Multi-character glyphs (like "1#", "||") are stored as single cells
    // Deletion simply removes the cell

    wasm_log!("  Cell at position {}: char='{}'", cursor_pos, cells[cursor_pos].char);

    // Delete the cell at cursor_pos
    cells.remove(cursor_pos);

    // Update column indices for cells after deletion
    for i in cursor_pos..cells.len() {
        if cells[i].col > 0 {
            cells[i].col -= 1;
        }
    }

    // No reparsing needed - each cell is self-contained

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

// ============================================================================
// NOTE: Old applyCommand function removed - use layered API instead
// - For slurs: Use applySlurLayered/removeSlurLayered in src/api/layered.rs
// - For octaves: Use shiftOctave in src/api/layered.rs
// - For ornaments: Use ornament_indicator command (kept for backward compatibility)
// ============================================================================

// ============================================================================
// Ornament Copy/Paste Operations (cells-array pattern, like applyCommand)
// ============================================================================

/// Copy ornament from a specific cell
///
/// # Parameters
/// - `cells_js`: JavaScript array of Cell objects
/// - `cell_index`: Index of the cell to copy ornament from
///
/// # Returns
/// Ornament notation string (e.g., "rg" for two grace notes)
#[wasm_bindgen(js_name = copyOrnamentFromCell)]
pub fn copy_ornament_from_cell(
    cells_js: JsValue,
    cell_index: usize,
) -> Result<String, JsValue> {
    wasm_info!("copyOrnamentFromCell called: cell_index={}", cell_index);

    // Deserialize cells from JavaScript
    let cells: Vec<Cell> = serde_wasm_bindgen::from_value(cells_js)
        .map_err(|e| {
            wasm_error!("Deserialization error: {}", e);
            JsValue::from_str(&format!("Deserialization error: {}", e))
        })?;

    if cell_index >= cells.len() {
        return Err(JsValue::from_str("Cell index out of bounds"));
    }

    let cell = &cells[cell_index];

    if let Some(ref ornament) = cell.ornament {
        // Convert ornament cells to notation string (using cell.char)
        let notation = ornament.cells.iter()
            .map(|cell| cell.char.clone())
            .collect::<String>();

        wasm_info!("  Copied ornament notation: '{}'", notation);
        Ok(notation)
    } else {
        Err(JsValue::from_str("No ornament on this cell"))
    }
}

/// Paste ornament to a specific cell
///
/// # Parameters
/// - `cells_js`: JavaScript array of Cell objects
/// - `cell_index`: Index of the cell to paste ornament to
/// - `notation_text`: Ornament notation string (e.g., "rg")
/// - `placement`: Placement string ("before" or "after")
///
/// # Returns
/// Updated JavaScript array of Cell objects with ornament pasted
#[wasm_bindgen(js_name = pasteOrnamentToCell)]
pub fn paste_ornament_to_cell(
    cells_js: JsValue,
    cell_index: usize,
    notation_text: &str,
    placement: &str,
) -> Result<js_sys::Array, JsValue> {
    wasm_info!("pasteOrnamentToCell called: cell_index={}, notation='{}', placement='{}'",
               cell_index, notation_text, placement);

    // Deserialize cells from JavaScript
    let mut cells: Vec<Cell> = serde_wasm_bindgen::from_value(cells_js)
        .map_err(|e| {
            wasm_error!("Deserialization error: {}", e);
            JsValue::from_str(&format!("Deserialization error: {}", e))
        })?;

    if cell_index >= cells.len() {
        return Err(JsValue::from_str("Cell index out of bounds"));
    }

    // Parse placement
    let ornament_placement = match placement {
        "before" => crate::models::OrnamentPlacement::Before,
        "after" => crate::models::OrnamentPlacement::After,
        "ontop" => crate::models::OrnamentPlacement::OnTop,
        _ => return Err(JsValue::from_str(&format!("Invalid placement: {}", placement))),
    };

    // Parse notation text into ornament cells
    let mut ornament_cells = Vec::new();
    for (idx, ch) in notation_text.chars().enumerate() {
        // Create a cell for each character in the notation
        let cell = crate::models::Cell::new(
            ch.to_string(),
            crate::models::ElementKind::PitchedElement,
            idx
        );
        ornament_cells.push(cell);
    }

    if ornament_cells.is_empty() {
        return Err(JsValue::from_str("No valid notes in ornament notation"));
    }

    // Create ornament and attach to cell
    let ornament = crate::models::Ornament {
        cells: ornament_cells,
        placement: ornament_placement,
    };

    cells[cell_index].ornament = Some(ornament);
    wasm_info!("  Pasted ornament to cell {}: {} cells, placement={:?}",
               cell_index, cells[cell_index].ornament.as_ref().unwrap().cells.len(),
               cells[cell_index].ornament.as_ref().unwrap().placement);

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

    wasm_info!("pasteOrnamentToCell completed successfully");
    Ok(result)
}

/// Paste ornament cells directly to a specific cell (KISS: replace ornament with cells from clipboard)
///
/// # Parameters
/// - `cells_js`: JavaScript array of Cell objects (the main line cells)
/// - `cell_index`: Index of the cell to paste ornament to
/// - `ornament_cells_js`: JavaScript array of Cell objects to use as ornament
/// - `placement`: Placement string ("before" or "after")
///
/// # Returns
/// Updated JavaScript array of Cell objects with ornament pasted
#[wasm_bindgen(js_name = pasteOrnamentCells)]
pub fn paste_ornament_cells(
    cells_js: JsValue,
    cell_index: usize,
    ornament_cells_js: JsValue,
    placement: &str,
) -> Result<js_sys::Array, JsValue> {
    wasm_info!("pasteOrnamentCells called: cell_index={}, placement='{}'", cell_index, placement);

    // Deserialize cells from JavaScript
    let mut cells: Vec<Cell> = serde_wasm_bindgen::from_value(cells_js)
        .map_err(|e| {
            wasm_error!("Deserialization error: {}", e);
            JsValue::from_str(&format!("Deserialization error: {}", e))
        })?;

    // Deserialize ornament cells from JavaScript
    let ornament_cells: Vec<Cell> = serde_wasm_bindgen::from_value(ornament_cells_js)
        .map_err(|e| {
            wasm_error!("Deserialization error for ornament cells: {}", e);
            JsValue::from_str(&format!("Deserialization error for ornament cells: {}", e))
        })?;

    if cell_index >= cells.len() {
        return Err(JsValue::from_str("Cell index out of bounds"));
    }

    if ornament_cells.is_empty() {
        return Err(JsValue::from_str("No cells in clipboard"));
    }

    // Parse placement
    let ornament_placement = match placement {
        "before" => crate::models::OrnamentPlacement::Before,
        "after" => crate::models::OrnamentPlacement::After,
        "ontop" => crate::models::OrnamentPlacement::OnTop,
        _ => return Err(JsValue::from_str(&format!("Invalid placement: {}", placement))),
    };

    // Create ornament with clipboard cells
    let ornament = crate::models::Ornament {
        cells: ornament_cells,
        placement: ornament_placement,
    };

    cells[cell_index].ornament = Some(ornament);
    wasm_info!("  Pasted ornament cells to cell {}: {} cells, placement={:?}",
               cell_index, cells[cell_index].ornament.as_ref().unwrap().cells.len(),
               cells[cell_index].ornament.as_ref().unwrap().placement);

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

    wasm_info!("pasteOrnamentCells completed successfully");
    Ok(result)
}

/// Clear ornament from a specific cell
///
/// # Parameters
/// - `cells_js`: JavaScript array of Cell objects
/// - `cell_index`: Index of the cell to clear ornament from
///
/// # Returns
/// Updated JavaScript array of Cell objects with ornament cleared
#[wasm_bindgen(js_name = clearOrnamentFromCell)]
pub fn clear_ornament_from_cell(
    cells_js: JsValue,
    cell_index: usize,
) -> Result<js_sys::Array, JsValue> {
    wasm_info!("clearOrnamentFromCell called: cell_index={}", cell_index);

    // Deserialize cells from JavaScript
    let mut cells: Vec<Cell> = serde_wasm_bindgen::from_value(cells_js)
        .map_err(|e| {
            wasm_error!("Deserialization error: {}", e);
            JsValue::from_str(&format!("Deserialization error: {}", e))
        })?;

    if cell_index >= cells.len() {
        return Err(JsValue::from_str("Cell index out of bounds"));
    }

    cells[cell_index].ornament = None;
    wasm_info!("  Cleared ornament from cell {}", cell_index);

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

    wasm_info!("clearOrnamentFromCell completed successfully");
    Ok(result)
}

/// Set ornament placement for a specific cell
///
/// # Parameters
/// - `cells_js`: JavaScript array of Cell objects
/// - `cell_index`: Index of the cell to update placement
/// - `placement`: Placement string ("before", "after", or "ontop")
///
/// # Returns
/// Updated JavaScript array of Cell objects with placement updated
#[wasm_bindgen(js_name = setOrnamentPlacementOnCell)]
pub fn set_ornament_placement_on_cell(
    cells_js: JsValue,
    cell_index: usize,
    placement: &str,
) -> Result<js_sys::Array, JsValue> {
    wasm_info!("setOrnamentPlacementOnCell called: cell_index={}, placement='{}'",
               cell_index, placement);

    // Deserialize cells from JavaScript
    let mut cells: Vec<Cell> = serde_wasm_bindgen::from_value(cells_js)
        .map_err(|e| {
            wasm_error!("Deserialization error: {}", e);
            JsValue::from_str(&format!("Deserialization error: {}", e))
        })?;

    if cell_index >= cells.len() {
        return Err(JsValue::from_str("Cell index out of bounds"));
    }

    // Parse placement
    let ornament_placement = match placement {
        "before" => crate::models::OrnamentPlacement::Before,
        "after" => crate::models::OrnamentPlacement::After,
        "ontop" => crate::models::OrnamentPlacement::OnTop,
        _ => return Err(JsValue::from_str(&format!("Invalid placement: {}", placement))),
    };

    // Update placement if ornament exists
    if let Some(ref mut ornament) = cells[cell_index].ornament {
        let placement_copy = ornament_placement.clone();
        ornament.placement = ornament_placement;
        wasm_info!("  Updated ornament placement on cell {} to {:?}", cell_index, placement_copy);
    } else {
        return Err(JsValue::from_str("No ornament on this cell"));
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

    wasm_info!("setOrnamentPlacementOnCell completed successfully");
    Ok(result)
}

// Note: Unit tests for deletion protection are verified via Playwright E2E tests
// (tests/e2e-pw/tests/ornament-*.spec.js) because WASM functions require a browser
// environment to run. The logic is tested by attempting to delete ornament cells
// and verifying that appropriate error messages are shown to the user.
