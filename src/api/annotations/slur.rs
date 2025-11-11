//! Slur annotation operations
//!
//! This module provides functions for applying and removing slur indicators on cells.
//! Includes both legacy (cell-based) and modern (WASM-first) APIs.

use wasm_bindgen::prelude::*;
use crate::api::helpers::lock_document;
use crate::api::types::{EditResult, DirtyLine};
use crate::models::Cell;
use crate::{wasm_log, wasm_info, wasm_warn, wasm_error};
use js_sys;

// ============================================================================
// Legacy Slur Operations (Phase 0 - Cell-based API)
// ============================================================================

/// Apply slur to cells in a selection range (LEGACY - Phase 0 API)
/// DEPRECATED: Use the new applySlur() which uses internal DOCUMENT
///
/// # Parameters
/// - `cells_js`: JavaScript array of Cell objects
/// - `start`: Start of selection (0-based index)
/// - `end`: End of selection (exclusive)
///
/// # Returns
/// Updated JavaScript array of Cell objects with slur applied
#[wasm_bindgen(js_name = applySlurLegacy)]
pub fn apply_slur_legacy(
    cells_js: JsValue,
    start: usize,
    end: usize,
) -> Result<js_sys::Array, JsValue> {
    wasm_warn!("⚠️  applySlurLegacy called - DEPRECATED, use applySlur() instead");
    wasm_info!("applySlurLegacy called: start={}, end={}", start, end);

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

    wasm_info!("applySlurLegacy completed successfully");
    Ok(result)
}

/// Remove slur from cells in a selection range (LEGACY - Phase 0 API)
/// DEPRECATED: Use the new removeSlur() which uses internal DOCUMENT
///
/// # Parameters
/// - `cells_js`: JavaScript array of Cell objects
/// - `start`: Start of selection (0-based index)
/// - `end`: End of selection (exclusive)
///
/// # Returns
/// Updated JavaScript array of Cell objects with slur removed
#[wasm_bindgen(js_name = removeSlurLegacy)]
pub fn remove_slur_legacy(
    cells_js: JsValue,
    start: usize,
    end: usize,
) -> Result<js_sys::Array, JsValue> {
    wasm_warn!("⚠️  removeSlurLegacy called - DEPRECATED, use removeSlur() instead");
    wasm_info!("removeSlurLegacy called: start={}, end={}", start, end);

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

    wasm_info!("removeSlurLegacy completed successfully");
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
// Modern Slur Operations (Phase 1+ - WASM-first pattern)
// ============================================================================

/// Apply slur to current selection (toggle behavior)
/// Uses internal DOCUMENT mutex - no cell-based parameters needed
#[wasm_bindgen(js_name = applySlur)]
pub fn apply_slur() -> Result<JsValue, JsValue> {
    wasm_info!("applySlur called");

    let mut doc_guard = lock_document()?;
    let doc = doc_guard.as_mut()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    // Get current selection from document state
    let selection = doc.state.selection_manager.current_selection.clone()
        .ok_or_else(|| JsValue::from_str("No selection active"))?;

    // Validate selection is not empty
    if selection.is_empty() {
        return Err(JsValue::from_str("Selection is empty"));
    }

    // Normalize selection (handle both forward and backward selections)
    let (start_pos, end_pos) = if selection.anchor <= selection.head {
        (selection.anchor, selection.head)
    } else {
        (selection.head, selection.anchor)
    };

    wasm_info!("  Selection: ({},{}) to ({},{})",
              start_pos.line, start_pos.col, end_pos.line, end_pos.col);

    // For now, only support single-line slurs
    // Multi-line slurs would require different rendering approach
    if start_pos.line != end_pos.line {
        return Err(JsValue::from_str("Multi-line slurs not yet supported"));
    }

    let line_idx = start_pos.line;
    if line_idx >= doc.lines.len() {
        return Err(JsValue::from_str("Invalid line index"));
    }

    let start_col = start_pos.col;
    let end_col = end_pos.col;

    // Validate range
    let line = &mut doc.lines[line_idx];
    if start_col >= line.cells.len() || end_col > line.cells.len() {
        return Err(JsValue::from_str("Invalid column range"));
    }

    // Need at least 2 cells for a slur
    if end_col - start_col < 2 {
        return Err(JsValue::from_str("Selection too short for slur (need at least 2 cells)"));
    }

    // Check if slur already exists (toggle behavior)
    let has_slur = line.cells.get(start_col)
        .map(|c| c.has_slur())
        .unwrap_or(false);

    let mut modified_count = 0;

    if has_slur {
        // Remove existing slur - clear all slur indicators in range
        wasm_info!("  Removing existing slur from range {}..{}", start_col, end_col);
        for i in start_col..end_col {
            if line.cells[i].has_slur() {
                line.cells[i].clear_slur();
                modified_count += 1;
            }
        }
    } else {
        // Apply new slur
        wasm_info!("  Applying new slur to range {}..{}", start_col, end_col);

        // Clear any existing slur indicators in range first
        for i in start_col..end_col {
            line.cells[i].clear_slur();
        }

        // Set SlurStart on first cell, SlurEnd on last cell
        line.cells[start_col].set_slur_start();
        line.cells[end_col - 1].set_slur_end();
        modified_count = end_col - start_col;

        wasm_info!("  Applied slur: cell[{}] = SlurStart, cell[{}] = SlurEnd",
                  start_col, end_col - 1);
    }

    wasm_info!("  Modified {} cells", modified_count);

    // Return EditResult with dirty line
    let result = EditResult {
        dirty_lines: vec![
            DirtyLine {
                row: line_idx,
                cells: doc.lines[line_idx].cells.clone(),
            }
        ],
        new_cursor_row: doc.state.cursor.line,
        new_cursor_col: doc.state.cursor.col,
    };

    serde_wasm_bindgen::to_value(&result)
        .map_err(|e| {
            wasm_error!("EditResult serialization error: {}", e);
            JsValue::from_str(&format!("EditResult serialization error: {}", e))
        })
}

/// Remove slur from current selection (explicit removal, no toggle)
/// Uses internal DOCUMENT mutex - no cell-based parameters needed
#[wasm_bindgen(js_name = removeSlur)]
pub fn remove_slur() -> Result<JsValue, JsValue> {
    wasm_info!("removeSlur called");

    let mut doc_guard = lock_document()?;
    let doc = doc_guard.as_mut()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    // Get current selection from document state
    let selection = doc.state.selection_manager.current_selection.clone()
        .ok_or_else(|| JsValue::from_str("No selection active"))?;

    // Validate selection is not empty
    if selection.is_empty() {
        return Err(JsValue::from_str("Selection is empty"));
    }

    // Normalize selection
    let (start_pos, end_pos) = if selection.anchor <= selection.head {
        (selection.anchor, selection.head)
    } else {
        (selection.head, selection.anchor)
    };

    wasm_info!("  Selection: ({},{}) to ({},{})",
              start_pos.line, start_pos.col, end_pos.line, end_pos.col);

    // For now, only support single-line slurs
    if start_pos.line != end_pos.line {
        return Err(JsValue::from_str("Multi-line slurs not yet supported"));
    }

    let line_idx = start_pos.line;
    if line_idx >= doc.lines.len() {
        return Err(JsValue::from_str("Invalid line index"));
    }

    let start_col = start_pos.col;
    let end_col = end_pos.col;

    // Validate range
    let line = &mut doc.lines[line_idx];
    if start_col >= line.cells.len() || end_col > line.cells.len() {
        return Err(JsValue::from_str("Invalid column range"));
    }

    // Remove slur indicators from all cells in range
    let mut modified_count = 0;
    for i in start_col..end_col {
        if line.cells[i].has_slur() {
            line.cells[i].clear_slur();
            modified_count += 1;
        }
    }

    wasm_info!("  Removed slur indicators from {} cells", modified_count);

    // Return EditResult with dirty line
    let result = EditResult {
        dirty_lines: vec![
            DirtyLine {
                row: line_idx,
                cells: doc.lines[line_idx].cells.clone(),
            }
        ],
        new_cursor_row: doc.state.cursor.line,
        new_cursor_col: doc.state.cursor.col,
    };

    serde_wasm_bindgen::to_value(&result)
        .map_err(|e| {
            wasm_error!("EditResult serialization error: {}", e);
            JsValue::from_str(&format!("EditResult serialization error: {}", e))
        })
}
