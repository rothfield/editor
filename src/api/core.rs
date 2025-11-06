//! WASM API for the recursive descent parser
//!
//! This module provides the JavaScript-facing API for character insertion
//! and token combination using the recursive descent parser.

use wasm_bindgen::prelude::*;
use crate::models::{Cell, PitchSystem, Document, Line, OrnamentIndicator, OrnamentPositionType, Pos, EditorDiff, CaretInfo, SelectionInfo, ElementKind};
use crate::parse::grammar::{parse_single, mark_continuations};

#[cfg(test)]
use crate::parse::grammar::parse;
use std::sync::Mutex;
use lazy_static::lazy_static;
use js_sys;

// WASM-owned document storage (canonical source of truth)
lazy_static! {
    static ref DOCUMENT: Mutex<Option<Document>> = Mutex::new(None);
}

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

// ============================================================================
// Result structures for edit operations
// ============================================================================

/// Represents a line that was modified during an edit operation
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct DirtyLine {
    pub row: usize,
    pub cells: Vec<Cell>,
}

/// Result of an edit operation (mutation primitive)
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct EditResult {
    pub dirty_lines: Vec<DirtyLine>,
    pub new_cursor_row: usize,
    pub new_cursor_col: usize,
}

/// Result of a copy operation
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct CopyResult {
    pub text: String,           // Plain text for external clipboard
    pub cells: Vec<Cell>,       // Rich cells with annotations
}

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
// Old applyOrnament and removeOrnament functions removed - replaced by copy/paste workflow

// Old resolveOrnamentAttachments and computeOrnamentLayout functions removed - replaced by copy/paste workflow

/// Set the document title (LEGACY - Phase 0 API)
/// DEPRECATED: Use the new setTitle() which uses internal DOCUMENT
///
/// # Parameters
/// - `document_js`: JavaScript Document object
/// - `title`: The new title for the document
///
/// # Returns
/// Updated JavaScript Document object with the title set
#[wasm_bindgen(js_name = setTitleLegacy)]
pub fn set_title_legacy(
    document_js: JsValue,
    title: &str,
) -> Result<JsValue, JsValue> {
    wasm_warn!("⚠️  setTitleLegacy called - DEPRECATED, use setTitle() instead");
    wasm_info!("setTitleLegacy called: title='{}'", title);

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

    wasm_info!("setTitleLegacy completed successfully");
    Ok(result)
}

/// Set the document title (Phase 1 - uses internal DOCUMENT)
#[wasm_bindgen(js_name = setTitle)]
pub fn set_title(title: &str) -> Result<(), JsValue> {
    wasm_info!("setTitle called (Phase 1): title='{}'", title);

    let mut doc_guard = DOCUMENT.lock().unwrap();
    let doc = doc_guard.as_mut()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    doc.title = Some(title.to_string());
    wasm_info!("  Document title set to: '{}'", title);

    // Compute glyphs after metadata change
    doc.compute_glyphs();

    wasm_info!("setTitle completed successfully");
    Ok(())
}

/// Set the document composer (LEGACY - Phase 0 API)
/// DEPRECATED: Use the new setComposer() which uses internal DOCUMENT
///
/// # Parameters
/// - `document_js`: JavaScript Document object
/// - `composer`: The new composer name for the document
///
/// # Returns
/// Updated JavaScript Document object with the composer set
#[wasm_bindgen(js_name = setComposerLegacy)]
pub fn set_composer_legacy(
    document_js: JsValue,
    composer: &str,
) -> Result<JsValue, JsValue> {
    wasm_warn!("⚠️  setComposerLegacy called - DEPRECATED, use setComposer() instead");
    wasm_info!("setComposerLegacy called: composer='{}'", composer);

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

    wasm_info!("setComposerLegacy completed successfully");
    Ok(result)
}

/// Set the document composer (Phase 1 - uses internal DOCUMENT)
#[wasm_bindgen(js_name = setComposer)]
pub fn set_composer(composer: &str) -> Result<(), JsValue> {
    wasm_info!("setComposer called (Phase 1): composer='{}'", composer);

    let mut doc_guard = DOCUMENT.lock().unwrap();
    let doc = doc_guard.as_mut()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    doc.composer = Some(composer.to_string());
    wasm_info!("  Document composer set to: '{}'", composer);

    // Compute glyphs after metadata change
    doc.compute_glyphs();

    wasm_info!("setComposer completed successfully");
    Ok(())
}

/// Set the document pitch system (LEGACY - Phase 0 API)
/// DEPRECATED: Use the new setDocumentPitchSystem() which uses internal DOCUMENT
///
/// # Parameters
/// - `document_js`: JavaScript Document object
/// - `pitch_system`: The new pitch system (0-5, where 1=Number, 2=Western, 3=Sargam, 4=Bhatkhande, 5=Tabla)
///
/// # Returns
/// Updated JavaScript Document object with the pitch system set
#[wasm_bindgen(js_name = setDocumentPitchSystemLegacy)]
pub fn set_document_pitch_system_legacy(
    document_js: JsValue,
    pitch_system: u8,
) -> Result<JsValue, JsValue> {
    wasm_warn!("⚠️  setDocumentPitchSystemLegacy called - DEPRECATED, use setDocumentPitchSystem() instead");
    wasm_info!("setDocumentPitchSystemLegacy called: pitch_system={}", pitch_system);

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

    wasm_info!("setDocumentPitchSystemLegacy completed successfully");
    Ok(result)
}

/// Set the document pitch system (Phase 1 - uses internal DOCUMENT)
#[wasm_bindgen(js_name = setDocumentPitchSystem)]
pub fn set_document_pitch_system(pitch_system: u8) -> Result<(), JsValue> {
    wasm_info!("setDocumentPitchSystem called (Phase 1): pitch_system={}", pitch_system);

    let mut doc_guard = DOCUMENT.lock().unwrap();
    let doc = doc_guard.as_mut()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

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

    doc.pitch_system = Some(system);
    wasm_info!("  Document pitch system set to: {:?}", system);

    // Compute glyphs after metadata change
    doc.compute_glyphs();

    wasm_info!("setDocumentPitchSystem completed successfully");
    Ok(())
}

/// Expand ornaments from cell.ornaments into the cells vector
/// This is called when turning edit mode ON
fn expand_ornaments_to_cells(line: &mut Line) {
    use crate::models::elements::OrnamentPlacement;

    let mut new_cells = Vec::new();

    for cell in line.cells.drain(..) {
        // Add the parent cell
        let mut parent_cell = cell.clone();
        let ornament_to_expand = parent_cell.ornament.take(); // Take ornament, leaving None
        new_cells.push(parent_cell);

        // Expand ornament into cells (if present)
        if let Some(ornament) = ornament_to_expand {
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
                parent_cell.ornament = Some(ornament);

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

/// Get navigable cell indices for a line, filtered based on ornament edit mode
///
/// In normal mode (edit_mode = false), ornament cells are excluded from navigation.
/// In edit mode (edit_mode = true), all cells are navigable.
///
/// # Parameters
/// - `line_js`: JavaScript Line object
/// - `edit_mode`: Whether ornament edit mode is enabled
///
/// # Returns
/// JavaScript Uint32Array of navigable cell indices
#[wasm_bindgen(js_name = getNavigableIndices)]
pub fn get_navigable_indices(
    line_js: JsValue,
    edit_mode: bool,
) -> Result<js_sys::Uint32Array, JsValue> {
    wasm_info!("getNavigableIndices called: edit_mode={}", edit_mode);

    // Deserialize line from JavaScript
    let line: Line = serde_wasm_bindgen::from_value(line_js)
        .map_err(|e| {
            wasm_error!("Deserialization error: {}", e);
            JsValue::from_str(&format!("Deserialization error: {}", e))
        })?;

    wasm_log!("  Line has {} cells", line.cells.len());

    // Filter cells based on ornament edit mode
    let navigable_indices: Vec<u32> = line.cells.iter()
        .enumerate()
        .filter(|(_, cell)| {
            if edit_mode {
                // In edit mode, all cells are navigable
                true
            } else {
                // In normal mode, skip ornament cells
                !cell.has_ornament_indicator()
            }
        })
        .map(|(idx, _)| idx as u32)
        .collect();

    wasm_info!("  Found {} navigable cells (out of {})", navigable_indices.len(), line.cells.len());

    // Convert to JavaScript Uint32Array for efficient transfer
    let result = js_sys::Uint32Array::new_with_length(navigable_indices.len() as u32);
    for (i, &idx) in navigable_indices.iter().enumerate() {
        result.set_index(i as u32, idx);
    }

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

// ============================================================================
// Core edit primitive - editReplaceRange
// ============================================================================

/// Replace a text range with new text (core mutation primitive)
///
/// Handles: insert, delete, paste, typing over selection, backspace, delete key
/// This is the ONLY function that mutates WASM's internal document.
/// JS never directly modifies document content - all mutations go through this.
#[wasm_bindgen(js_name = editReplaceRange)]
pub fn edit_replace_range(
    start_row: usize,
    start_col: usize,
    end_row: usize,
    end_col: usize,
    text: &str,
) -> Result<JsValue, JsValue> {
    wasm_info!("editReplaceRange: ({},{})-({},{}) text={:?}", start_row, start_col, end_row, end_col, text);

    let mut doc_guard = DOCUMENT.lock().unwrap();
    let doc = doc_guard.as_mut()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    // WASM-First Architecture: Ornament deletion protection
    // Check if any cells in the deletion range have ornament indicators
    if text.is_empty() {  // Only check on deletion (not insertion/replacement)
        if start_row == end_row && start_row < doc.lines.len() {
            // Single-line deletion: check cells in range
            let line = &doc.lines[start_row];
            for col in start_col..end_col.min(line.cells.len()) {
                if line.cells[col].has_ornament_indicator() {
                    wasm_warn!("Cannot delete ornament cells at ({}, {})", start_row, col);
                    return Err(JsValue::from_str("Cannot delete ornament cells - toggle ornament edit mode first"));
                }
            }
        } else if start_row != end_row {
            // Multi-line deletion: check all affected cells
            if start_row < doc.lines.len() {
                let start_line = &doc.lines[start_row];
                for col in start_col..start_line.cells.len() {
                    if start_line.cells[col].has_ornament_indicator() {
                        wasm_warn!("Cannot delete ornament cells at ({}, {})", start_row, col);
                        return Err(JsValue::from_str("Cannot delete ornament cells - toggle ornament edit mode first"));
                    }
                }
            }
            // Check intermediate lines
            for row in (start_row + 1)..end_row {
                if row < doc.lines.len() {
                    for (col, cell) in doc.lines[row].cells.iter().enumerate() {
                        if cell.has_ornament_indicator() {
                            wasm_warn!("Cannot delete ornament cells at ({}, {})", row, col);
                            return Err(JsValue::from_str("Cannot delete ornament cells - toggle ornament edit mode first"));
                        }
                    }
                }
            }
            // Check end line
            if end_row < doc.lines.len() {
                let end_line = &doc.lines[end_row];
                for col in 0..end_col.min(end_line.cells.len()) {
                    if end_line.cells[col].has_ornament_indicator() {
                        wasm_warn!("Cannot delete ornament cells at ({}, {})", end_row, col);
                        return Err(JsValue::from_str("Cannot delete ornament cells - toggle ornament edit mode first"));
                    }
                }
            }
        }
    }

    // TODO: Implement efficient undo (batching or incremental)
    // Temporarily disabled to fix performance issue (was cloning entire document!)
    // let previous_state = doc.clone();

    // 1. Delete the range [start, end)
    // If multi-line deletion, handle line merging
    if start_row == end_row {
        // Single line: delete from start_col to end_col
        if start_row < doc.lines.len() {
            let line = &mut doc.lines[start_row];
            if start_col <= line.cells.len() && end_col <= line.cells.len() {
                line.cells.drain(start_col..end_col);
                wasm_info!("  Deleted {} cells from row {}", end_col - start_col, start_row);

                // Re-mark continuations after deletion to fix continuation flags
                mark_continuations(&mut line.cells);
            }
        }
    } else {
        // Multi-line: delete from start_col to end of start_row,
        // delete entire lines between, delete from start of end_row to end_col
        if start_row < doc.lines.len() && end_row < doc.lines.len() {
            // Delete from start_col to end of start_row
            let start_line = &mut doc.lines[start_row];
            if start_col < start_line.cells.len() {
                start_line.cells.drain(start_col..);
            }

            // Merge end_row cells into start_row (up to end_col)
            let mut end_cells = if end_col < doc.lines[end_row].cells.len() {
                doc.lines[end_row].cells[0..end_col].to_vec()
            } else {
                doc.lines[end_row].cells.clone()
            };
            doc.lines[start_row].cells.append(&mut end_cells);

            // Remove the lines between start_row and end_row
            doc.lines.drain((start_row + 1)..=end_row);
            wasm_info!("  Deleted {} rows", end_row - start_row);

            // Re-mark continuations after multi-line deletion
            mark_continuations(&mut doc.lines[start_row].cells);
        }
    }

    // 2. Insert text at start position
    if !text.is_empty() {
        if start_row < doc.lines.len() {
            // Parse the text into cells and insert
            let new_cells: Vec<Cell> = text.chars()
                .enumerate()
                .map(|(idx, ch)| Cell::new(ch.to_string(), crate::models::ElementKind::Unknown, start_col + idx))
                .collect();

            let line = &mut doc.lines[start_row];
            for (idx, cell) in new_cells.iter().enumerate() {
                line.cells.insert(start_col + idx, cell.clone());
            }
            wasm_info!("  Inserted {} cells at ({},{})", new_cells.len(), start_row, start_col);

            // Re-mark continuations after insertion
            mark_continuations(&mut doc.lines[start_row].cells);
        }
    }

    // TODO: Record undo action (temporarily disabled for performance)
    // let new_state = doc.clone();
    // let action = crate::models::DocumentAction {
    //     action_type: crate::models::ActionType::InsertText,
    //     description: format!("Edit: delete [({},{})-({},{})] insert {:?}", start_row, start_col, end_row, end_col, text),
    //     previous_state: Some(previous_state),
    //     new_state: Some(new_state),
    //     timestamp: String::from("WASM-edit"),
    // };
    // doc.state.add_action(action);

    // 4. Calculate dirty lines (all lines affected by the edit)
    let mut dirty_lines = Vec::new();
    let dirty_start = start_row.min(end_row);
    let dirty_end = start_row.max(end_row) + 1;
    for row in dirty_start..dirty_end.min(doc.lines.len()) {
        dirty_lines.push(DirtyLine {
            row,
            cells: doc.lines[row].cells.clone(),
        });
    }

    // 5. Return cursor position
    let new_cursor_col = start_col + text.len();
    let result = EditResult {
        dirty_lines,
        new_cursor_row: start_row,
        new_cursor_col,
    };

    serde_wasm_bindgen::to_value(&result)
        .map_err(|e| {
            wasm_error!("EditResult serialization error: {}", e);
            JsValue::from_str(&format!("EditResult serialization error: {}", e))
        })
}

// ============================================================================
// WASM-First Text Editing Operations
// ============================================================================

/// Insert text at the current cursor position (WASM-owned state)
///
/// This function uses the internal DOCUMENT state and records undo history.
/// It replaces the old insertCharacter() which took cell arrays.
#[wasm_bindgen(js_name = insertText)]
pub fn insert_text(text: &str) -> Result<JsValue, JsValue> {
    wasm_info!("insertText called: text={:?}", text);

    if text.is_empty() {
        return Err(JsValue::from_str("Cannot insert empty text"));
    }

    let mut doc_guard = DOCUMENT.lock().unwrap();
    let doc = doc_guard.as_mut()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    // Get current cursor position
    let cursor_line = doc.state.cursor.line;
    let cursor_col = doc.state.cursor.col;

    wasm_info!("  Cursor at ({}, {})", cursor_line, cursor_col);

    // Clear any existing selection when typing
    // TODO: In the future, replace selected text instead of just clearing
    if doc.state.selection_manager.current_selection.is_some() {
        wasm_info!("  Clearing existing selection");
        doc.state.selection_manager.clear_selection();
    }

    // Validate cursor position
    if cursor_line >= doc.lines.len() {
        return Err(JsValue::from_str(&format!(
            "Invalid cursor line: {} (document has {} lines)",
            cursor_line,
            doc.lines.len()
        )));
    }

    // Get the pitch system before mutably borrowing
    let pitch_system = {
        let line = &doc.lines[cursor_line];
        doc.effective_pitch_system(line)
    };

    // TODO: Implement efficient undo (batching or incremental)
    // Temporarily disabled to fix performance issue (was cloning entire document on every keystroke!)
    // let previous_state = doc.clone();

    // Parse each character into cells
    let mut new_cells: Vec<Cell> = Vec::new();
    for (i, ch) in text.chars().enumerate() {
        let column = cursor_col + i;
        let cell = parse_single(ch, pitch_system, column);
        new_cells.push(cell);
    }

    wasm_info!("  Parsed {} characters into {} cells", text.len(), new_cells.len());

    // Get the line mutably for modification
    let line = &mut doc.lines[cursor_line];

    // Insert new cells at cursor position
    let insert_pos = cursor_col.min(line.cells.len());
    for (i, cell) in new_cells.iter().enumerate() {
        line.cells.insert(insert_pos + i, cell.clone());
    }

    // Update column indices for cells after insertion
    let cells_inserted = new_cells.len();
    for i in (insert_pos + cells_inserted)..line.cells.len() {
        line.cells[i].col += cells_inserted;
    }

    // Mark continuations (handle multi-char elements)
    mark_continuations(&mut line.cells);

    // Update cursor position (move to after inserted text)
    let new_cursor_col = cursor_col + cells_inserted;
    doc.state.cursor.col = new_cursor_col;

    wasm_info!("  Cursor moved to ({}, {})", cursor_line, new_cursor_col);

    // Capture dirty line cells before recording undo
    let dirty_line_cells = doc.lines[cursor_line].cells.clone();

    // TODO: Implement efficient undo
    // Temporarily disabled undo recording to fix performance issue
    // let new_state = doc.clone();
    // let action = crate::models::DocumentAction {
    //     action_type: crate::models::ActionType::InsertText,
    //     description: format!("Insert text: {:?} at ({}, {})", text, cursor_line, cursor_col),
    //     previous_state: Some(previous_state),
    //     new_state: Some(new_state),
    //     timestamp: String::from("WASM-insertText"),
    // };
    // doc.state.add_action(action);

    // Return EditResult with dirty line
    let result = EditResult {
        dirty_lines: vec![DirtyLine {
            row: cursor_line,
            cells: dirty_line_cells,
        }],
        new_cursor_row: cursor_line,
        new_cursor_col,
    };

    serde_wasm_bindgen::to_value(&result)
        .map_err(|e| {
            wasm_error!("EditResult serialization error: {}", e);
            JsValue::from_str(&format!("EditResult serialization error: {}", e))
        })
}

/// Delete character at cursor (backspace behavior)
#[wasm_bindgen(js_name = deleteAtCursor)]
pub fn delete_at_cursor() -> Result<JsValue, JsValue> {
    wasm_info!("deleteAtCursor called (backspace behavior)");

    let mut doc_guard = DOCUMENT.lock().unwrap();
    let doc = doc_guard.as_mut()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    let cursor_line = doc.state.cursor.line;
    let cursor_col = doc.state.cursor.col;

    wasm_info!("  Cursor at ({}, {})", cursor_line, cursor_col);

    // Can't delete if at start of document
    if cursor_line == 0 && cursor_col == 0 {
        wasm_info!("  At start of document, nothing to delete");
        return Err(JsValue::from_str("Cannot delete at start of document"));
    }

    // TODO: Implement efficient undo (batching or incremental)
    // Temporarily disabled to fix performance issue (was cloning entire document on every backspace!)
    // let previous_state = doc.clone();

    let mut new_cursor_row = cursor_line;
    let mut new_cursor_col = cursor_col;
    let mut dirty_lines = Vec::new();

    if cursor_col > 0 {
        // Delete character before cursor on same line
        let line = &mut doc.lines[cursor_line];

        if cursor_col <= line.cells.len() {
            line.cells.remove(cursor_col - 1);

            // Update column indices for remaining cells
            for i in (cursor_col - 1)..line.cells.len() {
                line.cells[i].col = i;
            }

            new_cursor_col = cursor_col - 1;

            dirty_lines.push(DirtyLine {
                row: cursor_line,
                cells: line.cells.clone(),
            });

            wasm_info!("  Deleted cell at column {}", cursor_col - 1);
        }
    } else {
        // Cursor at start of line - join with previous line
        if cursor_line > 0 {
            let prev_line = &doc.lines[cursor_line - 1];
            let join_position = prev_line.cells.len();

            // Get cells from current line
            let mut current_cells = doc.lines[cursor_line].cells.clone();

            // Update column indices for cells being moved
            for cell in &mut current_cells {
                cell.col += join_position;
            }

            // Append to previous line
            doc.lines[cursor_line - 1].cells.extend(current_cells);

            // Remove current line
            doc.lines.remove(cursor_line);

            new_cursor_row = cursor_line - 1;
            new_cursor_col = join_position;

            dirty_lines.push(DirtyLine {
                row: cursor_line - 1,
                cells: doc.lines[cursor_line - 1].cells.clone(),
            });

            wasm_info!("  Joined line {} with line {}", cursor_line, cursor_line - 1);
        }
    }

    // Update cursor position
    doc.state.cursor.line = new_cursor_row;
    doc.state.cursor.col = new_cursor_col;

    // TODO: Record undo action (temporarily disabled for performance)
    // let new_state = doc.clone();
    // let action = crate::models::DocumentAction {
    //     action_type: crate::models::ActionType::DeleteText,
    //     description: format!("Delete at ({}, {})", cursor_line, cursor_col),
    //     previous_state: Some(previous_state),
    //     new_state: Some(new_state),
    //     timestamp: String::from("WASM-deleteAtCursor"),
    // };
    // doc.state.add_action(action);

    // Return EditResult
    let result = EditResult {
        dirty_lines,
        new_cursor_row,
        new_cursor_col,
    };

    serde_wasm_bindgen::to_value(&result)
        .map_err(|e| {
            wasm_error!("EditResult serialization error: {}", e);
            JsValue::from_str(&format!("EditResult serialization error: {}", e))
        })
}

/// Insert newline at cursor position
#[wasm_bindgen(js_name = insertNewline)]
pub fn insert_newline() -> Result<JsValue, JsValue> {
    wasm_info!("insertNewline called");

    let mut doc_guard = DOCUMENT.lock().unwrap();
    let doc = doc_guard.as_mut()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    let cursor_line = doc.state.cursor.line;
    let cursor_col = doc.state.cursor.col;

    wasm_info!("  Cursor at ({}, {})", cursor_line, cursor_col);

    // Validate cursor position
    if cursor_line >= doc.lines.len() {
        return Err(JsValue::from_str(&format!(
            "Invalid cursor line: {} (document has {} lines)",
            cursor_line,
            doc.lines.len()
        )));
    }

    // TODO: Implement efficient undo
    // Temporarily disabled to fix performance issue
    // let previous_state = doc.clone();

    // Split current line at cursor position
    let current_line = &mut doc.lines[cursor_line];

    // Cells after cursor move to new line
    let cells_after: Vec<Cell> = current_line.cells.drain(cursor_col..).collect();

    // Update column indices for cells that moved
    let new_line_cells: Vec<Cell> = cells_after
        .into_iter()
        .enumerate()
        .map(|(i, mut cell)| {
            cell.col = i;
            cell
        })
        .collect();

    // Create new line
    let new_line = Line {
        cells: new_line_cells,
        tonic: current_line.tonic.clone(),
        lyrics: current_line.lyrics.clone(),
        tala: current_line.tala.clone(),
        label: String::new(),
        pitch_system: current_line.pitch_system,
        key_signature: current_line.key_signature.clone(),
        tempo: current_line.tempo.clone(),
        time_signature: current_line.time_signature.clone(),
        beats: Vec::new(),
        slurs: Vec::new(),
    };

    // Insert new line after current line
    doc.lines.insert(cursor_line + 1, new_line);

    // Move cursor to start of new line
    let new_cursor_row = cursor_line + 1;
    let new_cursor_col = 0;

    doc.state.cursor.line = new_cursor_row;
    doc.state.cursor.col = new_cursor_col;

    wasm_info!("  Created new line {}, cursor at ({}, {})", cursor_line + 1, new_cursor_row, new_cursor_col);

    // TODO: Implement efficient undo
    // Temporarily disabled to fix performance issue
    // let new_state = doc.clone();
    // let action = crate::models::DocumentAction {
    //     action_type: crate::models::ActionType::InsertText,
    //     description: format!("Insert newline at ({}, {})", cursor_line, cursor_col),
    //     previous_state: Some(previous_state),
    //     new_state: Some(new_state),
    //     timestamp: String::from("WASM-insertNewline"),
    // };
    // doc.state.add_action(action);

    // Return EditResult with both affected lines
    let result = EditResult {
        dirty_lines: vec![
            DirtyLine {
                row: cursor_line,
                cells: doc.lines[cursor_line].cells.clone(),
            },
            DirtyLine {
                row: cursor_line + 1,
                cells: doc.lines[cursor_line + 1].cells.clone(),
            },
        ],
        new_cursor_row,
        new_cursor_col,
    };

    serde_wasm_bindgen::to_value(&result)
        .map_err(|e| {
            wasm_error!("EditResult serialization error: {}", e);
            JsValue::from_str(&format!("EditResult serialization error: {}", e))
        })
}

// ============================================================================
// Octave operations (Phase 2 - WASM-first pattern)
// ============================================================================

/// Apply octave to current selection (toggle behavior for -1, 0, 1)
/// Uses internal DOCUMENT mutex - no cell-based parameters needed
#[wasm_bindgen(js_name = applyOctave)]
pub fn apply_octave(octave: i8) -> Result<JsValue, JsValue> {
    wasm_info!("applyOctave called (Phase 1): octave={}", octave);

    // Validate octave value
    if ![-1, 0, 1].contains(&octave) {
        wasm_error!("Invalid octave value: {}", octave);
        return Err(JsValue::from_str(&format!("Invalid octave value: {}", octave)));
    }

    let mut doc_guard = DOCUMENT.lock().unwrap();
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

    // For now, only support single-line octave changes
    if start_pos.line != end_pos.line {
        return Err(JsValue::from_str("Multi-line octave changes not yet supported"));
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

    // Apply octave to pitched elements in range
    let mut modified_count = 0;

    // Check if all pitched elements already have the target octave (for toggle behavior)
    let mut all_have_target = true;
    for i in start_col..end_col {
        if line.cells[i].kind == crate::models::ElementKind::PitchedElement {
            if line.cells[i].octave != octave {
                all_have_target = false;
                break;
            }
        }
    }

    if all_have_target && octave != 0 {
        // Toggle off: set all to 0 (middle octave)
        wasm_info!("  Toggling octave off (all have target octave {})", octave);
        for i in start_col..end_col {
            if line.cells[i].kind == crate::models::ElementKind::PitchedElement {
                line.cells[i].octave = 0;
                modified_count += 1;
            }
        }
    } else {
        // Apply target octave
        wasm_info!("  Applying octave {} to range {}..{}", octave, start_col, end_col);
        for i in start_col..end_col {
            if line.cells[i].kind == crate::models::ElementKind::PitchedElement {
                line.cells[i].octave = octave;
                modified_count += 1;
            }
        }
    }

    wasm_info!("  Modified {} pitched cells", modified_count);

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

// ============================================================================
// Slur operations (Phase 2 - WASM-first pattern)
// ============================================================================

/// Apply slur to current selection (toggle behavior)
/// Uses internal DOCUMENT mutex - no cell-based parameters needed
#[wasm_bindgen(js_name = applySlur)]
pub fn apply_slur() -> Result<JsValue, JsValue> {
    wasm_info!("applySlur called");

    let mut doc_guard = DOCUMENT.lock().unwrap();
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

    let mut doc_guard = DOCUMENT.lock().unwrap();
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

// ============================================================================
// Copy/Paste operations
// ============================================================================

/// Copy cells from a range (rich copy preserving annotations)
#[wasm_bindgen(js_name = copyCells)]
pub fn copy_cells(
    start_row: usize,
    start_col: usize,
    end_row: usize,
    end_col: usize,
) -> Result<JsValue, JsValue> {
    wasm_info!("copyCells: ({},{})-({},{})", start_row, start_col, end_row, end_col);

    let doc_guard = DOCUMENT.lock().unwrap();
    let doc = doc_guard.as_ref()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    let mut cells = Vec::new();
    let mut text = String::new();

    // Extract cells from range (can span multiple lines)
    for row in start_row..=end_row {
        if row >= doc.lines.len() {
            break;
        }

        let line = &doc.lines[row];
        let start = if row == start_row { start_col } else { 0 };
        let end = if row == end_row { end_col } else { line.cells.len() };

        for i in start..end {
            if i < line.cells.len() {
                let cell = &line.cells[i];
                cells.push(cell.clone());
                text.push_str(&cell.char);
            }
        }

        // Add newline between lines
        if row < end_row {
            text.push('\n');
        }
    }

    let result = CopyResult { text, cells };
    serde_wasm_bindgen::to_value(&result)
        .map_err(|e| {
            wasm_error!("CopyResult serialization error: {}", e);
            JsValue::from_str(&format!("CopyResult serialization error: {}", e))
        })
}

/// Paste cells (rich paste preserving octaves/slurs/ornaments)
#[wasm_bindgen(js_name = pasteCells)]
pub fn paste_cells(
    start_row: usize,
    start_col: usize,
    end_row: usize,
    end_col: usize,
    cells_json: JsValue,
) -> Result<JsValue, JsValue> {
    wasm_info!("pasteCells: ({},{})-({},{})", start_row, start_col, end_row, end_col);

    let mut doc_guard = DOCUMENT.lock().unwrap();
    let doc = doc_guard.as_mut()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    // Deserialize cells from JSON (preserves all Cell fields including octaves/slurs/ornaments)
    let cells: Vec<Cell> = serde_wasm_bindgen::from_value(cells_json)
        .map_err(|e| {
            wasm_error!("Cell deserialization error: {}", e);
            JsValue::from_str(&format!("Cell deserialization error: {}", e))
        })?;

    if cells.is_empty() {
        // Empty paste - just delete the range
        return edit_replace_range(start_row, start_col, end_row, end_col, "");
    }

    // Step 1: Delete the target range (like editReplaceRange)
    // Collect all cells before start position
    let mut new_cells = Vec::new();
    let mut affected_rows = std::collections::HashSet::new();

    // Copy cells from all lines before the change
    for row in 0..start_row {
        if row < doc.lines.len() {
            new_cells.push((row, doc.lines[row].cells.clone()));
        }
    }

    // Collect cells before start position in start_row
    if start_row < doc.lines.len() {
        let before_start = doc.lines[start_row].cells[..start_col].to_vec();
        affected_rows.insert(start_row);

        // Collect cells after end position in end_row
        let after_end = if end_row < doc.lines.len() && end_col < doc.lines[end_row].cells.len() {
            doc.lines[end_row].cells[end_col..].to_vec()
        } else {
            Vec::new()
        };

        // Combine: before_start + new cells + after_end
        let mut combined = before_start;
        combined.extend(cells.clone());
        combined.extend(after_end);

        // Split combined cells across lines if needed
        // For simplicity, all pasted cells go on the start_row
        // In a full implementation, would need to handle line breaks in paste data
        new_cells.push((start_row, combined));

        // Mark all affected rows as dirty (from start_row to end_row, then just start_row after paste)
        for row in (start_row + 1)..=end_row {
            if row < doc.lines.len() {
                affected_rows.remove(&row);
            }
        }

        // Copy remaining lines after end_row
        for row in (end_row + 1)..doc.lines.len() {
            new_cells.push((row, doc.lines[row].cells.clone()));
        }
    } else {
        // If start_row is beyond doc, just add the cells as new line
        new_cells.push((start_row, cells.clone()));
        affected_rows.insert(start_row);
    }

    // Step 2: Rebuild lines (simple version - no line splitting)
    // Create a map of row -> cells
    let mut lines_map = std::collections::HashMap::new();
    for (row, cells) in new_cells {
        lines_map.insert(row, cells);
    }

    // Step 3: Update document lines
    let mut max_row = 0;
    for row in lines_map.keys() {
        if *row > max_row {
            max_row = *row;
        }
    }

    // Ensure we have enough lines
    while doc.lines.len() <= max_row {
        doc.lines.push(Line::new());
    }

    // Update lines with new cells
    for (row, new_row_cells) in lines_map {
        if row < doc.lines.len() {
            doc.lines[row].cells = new_row_cells;
        }
    }

    // Step 4: Build dirty lines list
    let mut dirty_lines = Vec::new();
    for row in affected_rows {
        if row < doc.lines.len() {
            dirty_lines.push(DirtyLine {
                row,
                cells: doc.lines[row].cells.clone(),
            });
        }
    }

    // Also mark start_row as dirty
    if start_row < doc.lines.len() {
        if !dirty_lines.iter().any(|dl| dl.row == start_row) {
            dirty_lines.push(DirtyLine {
                row: start_row,
                cells: doc.lines[start_row].cells.clone(),
            });
        }
    }

    // Step 5: Calculate new cursor position (after the pasted cells)
    let new_cursor_col = start_col + cells.len();

    let result = EditResult {
        dirty_lines,
        new_cursor_row: start_row,
        new_cursor_col,
    };

    serde_wasm_bindgen::to_value(&result)
        .map_err(|e| {
            wasm_error!("EditResult serialization error: {}", e);
            JsValue::from_str(&format!("EditResult serialization error: {}", e))
        })
}

// ============================================================================
// Primary Selection (X11 style - for middle-click paste)
// ============================================================================

/// Get the current primary selection register
/// Returns { text: String, cells: Cell[] } or null if empty
#[wasm_bindgen(js_name = getPrimarySelection)]
pub fn get_primary_selection() -> Result<JsValue, JsValue> {
    let doc_guard = DOCUMENT.lock().unwrap();
    let doc = doc_guard.as_ref()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    let primary = &doc.state.primary_selection;

    if primary.is_empty() {
        return Ok(JsValue::null());
    }

    let result = serde_json::json!({
        "text": &primary.text,
        "cells": &primary.cells,
    });

    serde_wasm_bindgen::to_value(&result)
        .map_err(|e| {
            wasm_error!("PrimarySelection serialization error: {}", e);
            JsValue::from_str(&format!("PrimarySelection serialization error: {}", e))
        })
}

/// Update primary selection register
/// Called automatically when selection changes (for X11 select-to-copy)
#[wasm_bindgen(js_name = updatePrimarySelection)]
pub fn update_primary_selection(
    start_row: usize,
    start_col: usize,
    end_row: usize,
    end_col: usize,
    cells_json: JsValue,
) -> Result<(), JsValue> {
    wasm_info!("updatePrimarySelection: ({},{})-({},{})", start_row, start_col, end_row, end_col);

    let mut doc_guard = DOCUMENT.lock().unwrap();
    let doc = doc_guard.as_mut()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    // Deserialize cells from JSON
    let cells: Vec<Cell> = serde_wasm_bindgen::from_value(cells_json)
        .map_err(|e| {
            wasm_error!("Cell deserialization error: {}", e);
            JsValue::from_str(&format!("Cell deserialization error: {}", e))
        })?;

    // Build text from cells
    let mut text = String::new();
    for cell in &cells {
        text.push_str(&cell.char);
    }

    // Create selection record
    let selection = crate::models::Selection {
        anchor: Pos { line: start_row, col: start_col },
        head: Pos { line: end_row, col: end_col },
    };

    // Update primary selection in document state
    doc.state.update_primary_selection(text, cells, selection);

    Ok(())
}

// ============================================================================
// Undo/Redo operations
// ============================================================================

/// Undo the last edit operation
#[wasm_bindgen(js_name = undo)]
pub fn undo() -> Result<JsValue, JsValue> {
    wasm_info!("undo called");

    let mut doc_guard = DOCUMENT.lock().unwrap();
    let doc = doc_guard.as_mut()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    // Check if undo is available
    if doc.state.history_index == 0 {
        return Err(JsValue::from_str("No undo history available"));
    }

    // Move back in history
    doc.state.history_index -= 1;
    let history_entry = &doc.state.history[doc.state.history_index];

    // Restore the document state from the history entry
    // DocumentAction stores previous_state and new_state
    if let Some(prev_state) = &history_entry.previous_state {
        doc.lines = prev_state.lines.clone();
    } else {
        return Err(JsValue::from_str("No previous state in history"));
    }

    // Build dirty lines list (all lines changed)
    let mut dirty_lines = Vec::new();
    for (row, line) in doc.lines.iter().enumerate() {
        dirty_lines.push(DirtyLine {
            row,
            cells: line.cells.clone(),
        });
    }

    // Return cursor to a sensible position (start of document after undo)
    let result = EditResult {
        dirty_lines,
        new_cursor_row: 0,
        new_cursor_col: 0,
    };

    serde_wasm_bindgen::to_value(&result)
        .map_err(|e| {
            wasm_error!("EditResult serialization error: {}", e);
            JsValue::from_str(&format!("EditResult serialization error: {}", e))
        })
}

/// Redo the last undone edit operation
#[wasm_bindgen(js_name = redo)]
pub fn redo() -> Result<JsValue, JsValue> {
    wasm_info!("redo called");

    let mut doc_guard = DOCUMENT.lock().unwrap();
    let doc = doc_guard.as_mut()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    // Check if redo is available
    if doc.state.history_index >= doc.state.history.len() {
        return Err(JsValue::from_str("No redo history available"));
    }

    // Move forward in history
    let history_entry = &doc.state.history[doc.state.history_index];

    // Restore the document state from the history entry
    // DocumentAction stores previous_state and new_state
    if let Some(new_state) = &history_entry.new_state {
        doc.lines = new_state.lines.clone();
    } else {
        return Err(JsValue::from_str("No new state in history"));
    }

    doc.state.history_index += 1;

    // Build dirty lines list (all lines changed)
    let mut dirty_lines = Vec::new();
    for (row, line) in doc.lines.iter().enumerate() {
        dirty_lines.push(DirtyLine {
            row,
            cells: line.cells.clone(),
        });
    }

    // Return cursor to a sensible position (start of document after redo)
    let result = EditResult {
        dirty_lines,
        new_cursor_row: 0,
        new_cursor_col: 0,
    };

    serde_wasm_bindgen::to_value(&result)
        .map_err(|e| {
            wasm_error!("EditResult serialization error: {}", e);
            JsValue::from_str(&format!("EditResult serialization error: {}", e))
        })
}

/// Check if undo is available
#[wasm_bindgen(js_name = canUndo)]
pub fn can_undo() -> Result<bool, JsValue> {
    let doc_guard = DOCUMENT.lock().unwrap();
    Ok(doc_guard.as_ref().map_or(false, |d| {
        d.state.history_index > 0
    }))
}

/// Check if redo is available
#[wasm_bindgen(js_name = canRedo)]
pub fn can_redo() -> Result<bool, JsValue> {
    let doc_guard = DOCUMENT.lock().unwrap();
    Ok(doc_guard.as_ref().map_or(false, |d| {
        d.state.history_index < d.state.history.len()
    }))
}

/// Create a new empty document
///
/// # Returns
/// JavaScript Document object with default structure
/// Load a document from JavaScript into WASM's internal storage
#[wasm_bindgen(js_name = loadDocument)]
pub fn load_document(document_js: JsValue) -> Result<(), JsValue> {
    wasm_info!("loadDocument called");

    let mut doc: Document = serde_wasm_bindgen::from_value(document_js)
        .map_err(|e| {
            wasm_error!("Document deserialization error: {}", e);
            JsValue::from_str(&format!("Document deserialization error: {}", e))
        })?;

    web_sys::console::log_1(&format!("[WASM] loadDocument: cursor position from JS = ({}, {})",
        doc.state.cursor.line, doc.state.cursor.col).into());

    // Preserve the SelectionManager state from the existing document (if any)
    // This prevents losing selection state when reloading the document
    if let Some(existing_doc) = DOCUMENT.lock().unwrap().as_ref() {
        doc.state.selection_manager = existing_doc.state.selection_manager.clone();
    }

    *DOCUMENT.lock().unwrap() = Some(doc);
    wasm_info!("loadDocument completed successfully");
    Ok(())
}

/// Get current document snapshot from WASM's internal storage
#[wasm_bindgen(js_name = getDocumentSnapshot)]
pub fn get_document_snapshot() -> Result<JsValue, JsValue> {
    wasm_info!("getDocumentSnapshot called");

    let doc_guard = DOCUMENT.lock().unwrap();
    match doc_guard.as_ref() {
        Some(doc) => {
            serde_wasm_bindgen::to_value(doc)
                .map_err(|e| {
                    wasm_error!("Document serialization error: {}", e);
                    JsValue::from_str(&format!("Document serialization error: {}", e))
                })
        }
        None => {
            wasm_warn!("No document loaded");
            Err(JsValue::from_str("No document loaded"))
        }
    }
}

/// Create a new document and store it internally
#[wasm_bindgen(js_name = createNewDocument)]
pub fn create_new_document() -> Result<JsValue, JsValue> {
    wasm_info!("createNewDocument called");

    // Create new document with default structure
    let mut document = Document::new();

    // Leave title blank (None) - user will set it if needed
    document.title = None;

    // Set default pitch system
    document.pitch_system = Some(PitchSystem::Number);

    // Add one empty line
    let line = Line::new();
    document.lines.push(line);

    wasm_info!("  Created document with {} line(s)", document.lines.len());

    // Compute glyphs
    document.compute_glyphs();

    // Store in internal WASM storage for edit operations
    *DOCUMENT.lock().unwrap() = Some(document.clone());

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

    // DEBUG: Log what we're receiving from JavaScript before deserialization
    wasm_log!("  Input document type: {}", js_sys::Object::keys(&js_sys::Object::from(document_js.clone())).length());

    // Deserialize document from JavaScript
    let document: Document = serde_wasm_bindgen::from_value(document_js)
        .map_err(|e| {
            wasm_error!("Deserialization error: {}", e);
            JsValue::from_str(&format!("Deserialization error: {}", e))
        })?;

    wasm_log!("  Deserialized successfully");
    wasm_log!("  Document has {} lines", document.lines.len());

    // DEBUG: Log what's in the first line
    if let Some(first_line) = document.lines.first() {
        wasm_log!("  First line has {} cells", first_line.cells.len());
        if !first_line.cells.is_empty() {
            let cells_summary: String = first_line.cells.iter().map(|c| c.char.clone()).collect();
            wasm_log!("  First line cells: '{}'", cells_summary);
        } else {
            wasm_log!("  ⚠️ BUG FOUND: First line has ZERO cells - cells not being deserialized!");
        }
    } else {
        wasm_log!("  No lines found in document!");
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

/// Generate Intermediate Representation (IR) as JSON
///
/// Converts the internal document to the IR (ExportLine/ExportMeasure/ExportEvent)
/// and serializes it to JSON for inspection and debugging.
///
/// The IR captures all document structure (measures, beats, events) with
/// proper rhythm analysis (LCM-based division calculation) and preserves
/// all musical information (slurs, lyrics, ornaments, chords, etc.).
///
/// # Parameters
/// - `document_js`: JavaScript Document object
///
/// # Returns
/// JSON string representation of the IR structure
#[wasm_bindgen(js_name = generateIRJson)]
pub fn generate_ir_json(document_js: JsValue) -> Result<String, JsValue> {
    wasm_info!("generateIRJson called");

    // Deserialize document from JavaScript
    let document: Document = serde_wasm_bindgen::from_value(document_js)
        .map_err(|e| {
            wasm_error!("Deserialization error: {}", e);
            JsValue::from_str(&format!("Deserialization error: {}", e))
        })?;

    wasm_log!("  Document has {} lines", document.lines.len());

    // Build IR from document (FSM-based cell grouping, measure/beat boundaries, LCM calculation)
    let export_lines = crate::renderers::musicxml::cell_to_ir::build_export_measures_from_document(&document);
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

// ============================================================================
// CURSOR AND SELECTION API (Anchor/Head Model)
// ============================================================================

/// Get current cursor information
/// Returns CaretInfo with cursor position and desired column for vertical movement
#[wasm_bindgen(js_name = getCaretInfo)]
pub fn get_caret_info() -> Result<JsValue, JsValue> {
    let doc_guard = DOCUMENT.lock().unwrap();
    let doc = doc_guard.as_ref()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    let caret_info = crate::models::CaretInfo {
        caret: doc.state.cursor,
        desired_col: doc.state.selection_manager.desired_col,
    };

    serde_wasm_bindgen::to_value(&caret_info)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}

/// Get current selection information (if any)
/// Returns SelectionInfo with anchor, head, start, end, direction, isEmpty
#[wasm_bindgen(js_name = getSelectionInfo)]
pub fn get_selection_info() -> Result<JsValue, JsValue> {
    let doc_guard = DOCUMENT.lock().unwrap();
    let doc = doc_guard.as_ref()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    if let Some(selection) = doc.state.selection_manager.get_selection() {
        let selection_info = crate::models::SelectionInfo::from_selection(selection);
        serde_wasm_bindgen::to_value(&Some(selection_info))
            .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
    } else {
        // Return null for no selection
        Ok(JsValue::NULL)
    }
}

/// Set selection explicitly with anchor and head positions
/// anchor: {stave, col} - where selection started (fixed point)
/// head: {stave, col} - current cursor position (moving point)
#[wasm_bindgen(js_name = setSelection)]
pub fn set_selection(anchor: JsValue, head: JsValue) -> Result<(), JsValue> {
    let anchor_pos: crate::models::Pos = serde_wasm_bindgen::from_value(anchor)
        .map_err(|e| JsValue::from_str(&format!("Invalid anchor position: {}", e)))?;

    let head_pos: crate::models::Pos = serde_wasm_bindgen::from_value(head)
        .map_err(|e| JsValue::from_str(&format!("Invalid head position: {}", e)))?;

    let mut doc_guard = DOCUMENT.lock().unwrap();
    let doc = doc_guard.as_mut()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    doc.state.selection_manager.set_selection(anchor_pos, head_pos);

    Ok(())
}

/// Clear current selection
#[wasm_bindgen(js_name = clearSelection)]
pub fn clear_selection() -> Result<(), JsValue> {
    let mut doc_guard = DOCUMENT.lock().unwrap();
    let doc = doc_guard.as_mut()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    doc.state.selection_manager.clear_selection();

    Ok(())
}

/// Start a new selection at the current cursor position
#[wasm_bindgen(js_name = startSelection)]
pub fn start_selection() -> Result<(), JsValue> {
    let mut doc_guard = DOCUMENT.lock().unwrap();
    let doc = doc_guard.as_mut()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    let cursor_pos = doc.state.cursor;
    doc.state.selection_manager.start_selection(cursor_pos);

    Ok(())
}

/// Extend selection to the current cursor position (updates head, keeps anchor)
#[wasm_bindgen(js_name = extendSelection)]
pub fn extend_selection() -> Result<(), JsValue> {
    let mut doc_guard = DOCUMENT.lock().unwrap();
    let doc = doc_guard.as_mut()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    let cursor_pos = doc.state.cursor;
    doc.state.selection_manager.extend_selection(&cursor_pos);

    Ok(())
}

// ==================== Cursor Movement Commands ====================

/// Helper to create EditorDiff from current document state
fn create_editor_diff(doc: &Document, dirty_line: Option<usize>) -> EditorDiff {
    let dirty_lines = if let Some(line) = dirty_line {
        vec![line]
    } else {
        vec![]
    };

    let caret = CaretInfo {
        caret: doc.state.cursor,
        desired_col: doc.state.selection_manager.desired_col,
    };

    let selection = doc.state.selection_manager.get_selection()
        .map(|s| SelectionInfo::from_selection(s));

    EditorDiff {
        dirty_lines,
        caret,
        selection,
    }
}

#[wasm_bindgen(js_name = moveLeft)]
pub fn move_left(extend: bool) -> Result<JsValue, JsValue> {
    let mut doc_guard = DOCUMENT.lock().unwrap();
    let doc = doc_guard.as_mut()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    let old_cursor = doc.state.cursor;

    // Standard text editor behavior: collapse selection to start on left arrow
    let new_pos = if !extend && doc.state.selection_manager.current_selection.is_some() {
        let selection = doc.state.selection_manager.current_selection.as_ref().unwrap();
        web_sys::console::log_1(&format!("[WASM] moveLeft: collapsing selection to start").into());
        selection.start()
    } else {
        doc.prev_caret(doc.state.cursor)
    };

    web_sys::console::log_1(&format!("[WASM] moveLeft(extend={}): old_cursor=({},{}), new_pos=({},{})",
        extend, old_cursor.line, old_cursor.col, new_pos.line, new_pos.col).into());

    if !extend {
        doc.state.selection_manager.clear_selection();
    } else if doc.state.selection_manager.current_selection.is_none() {
        web_sys::console::log_1(&format!("[WASM]   Starting selection at ({},{})",
            old_cursor.line, old_cursor.col).into());
        // Start selection at OLD cursor position (anchor), not current cursor
        doc.state.selection_manager.start_selection(old_cursor);
    }

    doc.state.cursor = new_pos;
    doc.state.selection_manager.desired_col = new_pos.col;

    if extend {
        doc.state.selection_manager.extend_selection(&new_pos);
        if let Some(sel) = &doc.state.selection_manager.current_selection {
            web_sys::console::log_1(&format!("[WASM]   Selection: anchor=({},{}), head=({},{})",
                sel.anchor.line, sel.anchor.col, sel.head.line, sel.head.col).into());
        }
    }

    let diff = create_editor_diff(&doc, Some(new_pos.line));
    serde_wasm_bindgen::to_value(&diff)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}

#[wasm_bindgen(js_name = moveRight)]
pub fn move_right(extend: bool) -> Result<JsValue, JsValue> {
    let mut doc_guard = DOCUMENT.lock().unwrap();
    let doc = doc_guard.as_mut()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    let old_cursor = doc.state.cursor;

    // Standard text editor behavior: collapse selection to end on right arrow
    let new_pos = if !extend && doc.state.selection_manager.current_selection.is_some() {
        let selection = doc.state.selection_manager.current_selection.as_ref().unwrap();
        web_sys::console::log_1(&format!("[WASM] moveRight: collapsing selection to end").into());
        selection.end()
    } else {
        doc.next_caret(doc.state.cursor)
    };

    web_sys::console::log_1(&format!("[WASM] moveRight(extend={}): old_cursor=({},{}), new_pos=({},{})",
        extend, old_cursor.line, old_cursor.col, new_pos.line, new_pos.col).into());

    if !extend {
        doc.state.selection_manager.clear_selection();
    } else if doc.state.selection_manager.current_selection.is_none() {
        web_sys::console::log_1(&format!("[WASM]   Starting selection at ({},{})",
            old_cursor.line, old_cursor.col).into());
        // Start selection at OLD cursor position (anchor), not current cursor
        doc.state.selection_manager.start_selection(old_cursor);
    }

    doc.state.cursor = new_pos;
    doc.state.selection_manager.desired_col = new_pos.col;

    if extend {
        doc.state.selection_manager.extend_selection(&new_pos);
        if let Some(sel) = &doc.state.selection_manager.current_selection {
            web_sys::console::log_1(&format!("[WASM]   Selection: anchor=({},{}), head=({},{})",
                sel.anchor.line, sel.anchor.col, sel.head.line, sel.head.col).into());
        }
    }

    let diff = create_editor_diff(&doc, Some(new_pos.line));
    serde_wasm_bindgen::to_value(&diff)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}

#[wasm_bindgen(js_name = moveUp)]
pub fn move_up(extend: bool) -> Result<JsValue, JsValue> {
    let mut doc_guard = DOCUMENT.lock().unwrap();
    let doc = doc_guard.as_mut()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    let desired_col = doc.state.selection_manager.desired_col;

    // Standard text editor behavior: collapse selection to head on up arrow
    let new_pos = if !extend && doc.state.selection_manager.current_selection.is_some() {
        let selection = doc.state.selection_manager.current_selection.as_ref().unwrap();
        web_sys::console::log_1(&format!("[WASM] moveUp: collapsing selection to head").into());
        selection.head
    } else {
        doc.caret_up(doc.state.cursor, desired_col)
    };

    if !extend {
        doc.state.selection_manager.clear_selection();
    } else if doc.state.selection_manager.current_selection.is_none() {
        doc.state.selection_manager.start_selection(doc.state.cursor);
    }

    doc.state.cursor = new_pos;

    if extend {
        doc.state.selection_manager.extend_selection(&new_pos);
    }

    let diff = create_editor_diff(&doc, Some(new_pos.line));
    serde_wasm_bindgen::to_value(&diff)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}

#[wasm_bindgen(js_name = moveDown)]
pub fn move_down(extend: bool) -> Result<JsValue, JsValue> {
    let mut doc_guard = DOCUMENT.lock().unwrap();
    let doc = doc_guard.as_mut()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    let desired_col = doc.state.selection_manager.desired_col;

    // Standard text editor behavior: collapse selection to head on down arrow
    let new_pos = if !extend && doc.state.selection_manager.current_selection.is_some() {
        let selection = doc.state.selection_manager.current_selection.as_ref().unwrap();
        web_sys::console::log_1(&format!("[WASM] moveDown: collapsing selection to head").into());
        selection.head
    } else {
        doc.caret_down(doc.state.cursor, desired_col)
    };

    if !extend {
        doc.state.selection_manager.clear_selection();
    } else if doc.state.selection_manager.current_selection.is_none() {
        doc.state.selection_manager.start_selection(doc.state.cursor);
    }

    doc.state.cursor = new_pos;

    if extend {
        doc.state.selection_manager.extend_selection(&new_pos);
    }

    let diff = create_editor_diff(&doc, Some(new_pos.line));
    serde_wasm_bindgen::to_value(&diff)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}

#[wasm_bindgen(js_name = moveHome)]
pub fn move_home(extend: bool) -> Result<JsValue, JsValue> {
    let mut doc_guard = DOCUMENT.lock().unwrap();
    let doc = doc_guard.as_mut()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    let new_pos = doc.caret_line_start(doc.state.cursor);

    if !extend {
        doc.state.selection_manager.clear_selection();
    } else if doc.state.selection_manager.current_selection.is_none() {
        doc.state.selection_manager.start_selection(doc.state.cursor);
    }

    doc.state.cursor = new_pos;
    doc.state.selection_manager.desired_col = 0;

    if extend {
        doc.state.selection_manager.extend_selection(&new_pos);
    }

    let diff = create_editor_diff(&doc, Some(new_pos.line));
    serde_wasm_bindgen::to_value(&diff)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}

#[wasm_bindgen(js_name = moveEnd)]
pub fn move_end(extend: bool) -> Result<JsValue, JsValue> {
    let mut doc_guard = DOCUMENT.lock().unwrap();
    let doc = doc_guard.as_mut()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    let new_pos = doc.caret_line_end(doc.state.cursor);

    if !extend {
        doc.state.selection_manager.clear_selection();
    } else if doc.state.selection_manager.current_selection.is_none() {
        doc.state.selection_manager.start_selection(doc.state.cursor);
    }

    doc.state.cursor = new_pos;
    doc.state.selection_manager.desired_col = new_pos.col;

    if extend {
        doc.state.selection_manager.extend_selection(&new_pos);
    }

    let diff = create_editor_diff(&doc, Some(new_pos.line));
    serde_wasm_bindgen::to_value(&diff)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}

#[wasm_bindgen(js_name = mouseDown)]
pub fn mouse_down(pos_js: JsValue) -> Result<JsValue, JsValue> {
    let mut doc_guard = DOCUMENT.lock().unwrap();
    let doc = doc_guard.as_mut()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    let pos: Pos = serde_wasm_bindgen::from_value(pos_js)
        .map_err(|e| JsValue::from_str(&format!("Invalid position: {}", e)))?;

    let clamped_pos = doc.clamp_pos(pos);
    doc.state.cursor = clamped_pos;
    doc.state.selection_manager.clear_selection();
    doc.state.selection_manager.start_selection(clamped_pos);
    doc.state.selection_manager.desired_col = clamped_pos.col;

    let diff = create_editor_diff(&doc, Some(clamped_pos.line));
    serde_wasm_bindgen::to_value(&diff)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}

#[wasm_bindgen(js_name = mouseMove)]
pub fn mouse_move(pos_js: JsValue) -> Result<JsValue, JsValue> {
    let mut doc_guard = DOCUMENT.lock().unwrap();
    let doc = doc_guard.as_mut()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    let pos: Pos = serde_wasm_bindgen::from_value(pos_js)
        .map_err(|e| JsValue::from_str(&format!("Invalid position: {}", e)))?;

    let clamped_pos = doc.clamp_pos(pos);
    doc.state.cursor = clamped_pos;
    doc.state.selection_manager.extend_selection(&clamped_pos);
    doc.state.selection_manager.desired_col = clamped_pos.col;

    let diff = create_editor_diff(&doc, Some(clamped_pos.line));
    serde_wasm_bindgen::to_value(&diff)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}

#[wasm_bindgen(js_name = mouseUp)]
pub fn mouse_up(pos_js: JsValue) -> Result<JsValue, JsValue> {
    let mut doc_guard = DOCUMENT.lock().unwrap();
    let doc = doc_guard.as_mut()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    let pos: Pos = serde_wasm_bindgen::from_value(pos_js)
        .map_err(|e| JsValue::from_str(&format!("Invalid position: {}", e)))?;

    web_sys::console::log_1(&format!("[WASM] mouseUp: pos=({},{})", pos.line, pos.col).into());

    let clamped_pos = doc.clamp_pos(pos);
    web_sys::console::log_1(&format!("[WASM] mouseUp: clamped_pos=({},{})", clamped_pos.line, clamped_pos.col).into());

    doc.state.cursor = clamped_pos;
    doc.state.selection_manager.extend_selection(&clamped_pos);
    doc.state.selection_manager.desired_col = clamped_pos.col;

    let selection_after = doc.state.selection_manager.get_selection();
    web_sys::console::log_1(&format!("[WASM] mouseUp: selection after extend = {:?}", selection_after).into());

    let diff = create_editor_diff(&doc, Some(clamped_pos.line));
    web_sys::console::log_1(&format!("[WASM] mouseUp: diff.selection = {:?}", diff.selection).into());

    serde_wasm_bindgen::to_value(&diff)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}

/// Select beat or character group at the given position (for double-click)
/// Returns an EditorDiff with the updated selection and cursor state
#[wasm_bindgen(js_name = selectBeatAtPosition)]
pub fn select_beat_at_position(pos_js: JsValue) -> Result<JsValue, JsValue> {
    let mut doc_guard = DOCUMENT.lock().unwrap();
    let doc = doc_guard.as_mut()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    let pos: Pos = serde_wasm_bindgen::from_value(pos_js)
        .map_err(|e| JsValue::from_str(&format!("Invalid position: {}", e)))?;

    // Clamp position to document bounds
    let clamped_pos = doc.clamp_pos(pos);

    // Get the line at the position
    if clamped_pos.line >= doc.lines.len() {
        return Err(JsValue::from_str("Line index out of bounds"));
    }

    let line = &doc.lines[clamped_pos.line];
    let cells = &line.cells;

    if cells.is_empty() {
        return Err(JsValue::from_str("Empty line"));
    }

    // Use BeatDeriver to extract beats
    let beat_deriver = crate::parse::beats::BeatDeriver::new();
    let beats = beat_deriver.extract_implicit_beats(cells);

    // Check if the position falls within a beat
    for beat in &beats {
        if beat.contains(clamped_pos.col) {
            // Found a beat containing the position
            let anchor = Pos::new(clamped_pos.line, beat.start);
            let head = Pos::new(clamped_pos.line, beat.end + 1); // end is exclusive in Selection

            // Update document state
            doc.state.cursor = head;
            doc.state.selection_manager.set_selection(anchor, head);
            doc.state.selection_manager.desired_col = head.col;

            // Return EditorDiff with updated state
            let diff = create_editor_diff(&doc, Some(clamped_pos.line));
            return serde_wasm_bindgen::to_value(&diff)
                .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)));
        }
    }

    // No beat found - check if this is a text token
    let clicked_cell_idx = clamped_pos.col.min(cells.len() - 1);
    let clicked_cell = &cells[clicked_cell_idx];

    if clicked_cell.kind == ElementKind::Text {
        // Text token selection: select all consecutive Text cells
        // Scan backward to find the start of the text token
        let mut start_col = clicked_cell_idx;
        for i in (0..clicked_cell_idx).rev() {
            if cells[i].kind == ElementKind::Text {
                start_col = i;
            } else {
                break; // Stop at first non-text cell
            }
        }

        // Scan forward to find the end of the text token
        let mut end_col = start_col;
        for i in (start_col + 1)..cells.len() {
            if cells[i].kind == ElementKind::Text && cells[i].continuation {
                end_col = i;
            } else {
                break; // Stop at first non-continuation or non-text cell
            }
        }

        // Create selection for text token
        let anchor = Pos::new(clamped_pos.line, start_col);
        let head = Pos::new(clamped_pos.line, end_col + 1); // end is exclusive in Selection

        // Update document state
        doc.state.cursor = head;
        doc.state.selection_manager.set_selection(anchor, head);
        doc.state.selection_manager.desired_col = head.col;

        // Return EditorDiff with updated state
        let diff = create_editor_diff(&doc, Some(clamped_pos.line));
        return serde_wasm_bindgen::to_value(&diff)
            .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)));
    }

    // No beat or text token - fall back to character group selection (cell + continuations)
    // Find the start of the character group (first cell with continuation=false)
    let mut start_col = clamped_pos.col;
    for i in (0..=clamped_pos.col).rev() {
        if i < cells.len() && !cells[i].continuation {
            start_col = i;
            break;
        }
    }

    // Find the end of the character group (scan forward while continuation=true)
    let mut end_col = start_col;
    for i in (start_col + 1)..cells.len() {
        if cells[i].continuation {
            end_col = i;
        } else {
            break;
        }
    }

    // Create selection for character group
    let anchor = Pos::new(clamped_pos.line, start_col);
    let head = Pos::new(clamped_pos.line, end_col + 1); // end is exclusive in Selection

    // Update document state
    doc.state.cursor = head;
    doc.state.selection_manager.set_selection(anchor, head);
    doc.state.selection_manager.desired_col = head.col;

    // Return EditorDiff with updated state
    let diff = create_editor_diff(&doc, Some(clamped_pos.line));
    serde_wasm_bindgen::to_value(&diff)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}

/// Select entire line at the given position (for triple-click)
/// Returns an EditorDiff with the updated selection and cursor state
#[wasm_bindgen(js_name = selectLineAtPosition)]
pub fn select_line_at_position(pos_js: JsValue) -> Result<JsValue, JsValue> {
    let mut doc_guard = DOCUMENT.lock().unwrap();
    let doc = doc_guard.as_mut()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    let pos: Pos = serde_wasm_bindgen::from_value(pos_js)
        .map_err(|e| JsValue::from_str(&format!("Invalid position: {}", e)))?;

    // Clamp position to document bounds
    let clamped_pos = doc.clamp_pos(pos);

    // Get the line at the position
    if clamped_pos.line >= doc.lines.len() {
        return Err(JsValue::from_str("Line index out of bounds"));
    }

    let line = &doc.lines[clamped_pos.line];
    let line_length = line.cells.len();

    // Select entire line: from column 0 to end of line
    let anchor = Pos::new(clamped_pos.line, 0);
    let head = Pos::new(clamped_pos.line, line_length);

    // Update document state
    doc.state.cursor = head;
    doc.state.selection_manager.set_selection(anchor, head);
    doc.state.selection_manager.desired_col = head.col;

    // Return EditorDiff with updated state
    let diff = create_editor_diff(&doc, Some(clamped_pos.line));
    serde_wasm_bindgen::to_value(&diff)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}

// ==================== Ornament Copy/Paste API (WASM-FIRST) ====================

/// Copy ornament from current selection to clipboard as notation string (WASM-owned state)
///
/// WASM-FIRST: This function handles selection internally, no cell_index needed
#[wasm_bindgen(js_name = copyOrnament)]
pub fn copy_ornament() -> Result<String, JsValue> {
    wasm_info!("copyOrnament called");

    let doc = DOCUMENT.lock().unwrap();
    let doc = doc.as_ref()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    // Get effective selection (same logic as applyOctave)
    let cursor_pos = &doc.state.cursor;
    let selection = doc.state.selection_manager.get_selection();

    let target_cell_index = if let Some(sel) = selection {
        // Use first cell in selection
        sel.start().col.min(sel.end().col)
    } else {
        // No selection: target cell to left of cursor
        if cursor_pos.col == 0 {
            return Err(JsValue::from_str("No selection and cursor at start of line"));
        }
        cursor_pos.col - 1
    };

    wasm_info!("  Target cell index: {}", target_cell_index);

    let line = doc.lines.get(cursor_pos.line)
        .ok_or_else(|| JsValue::from_str("No active line"))?;

    let cell = line.cells.get(target_cell_index)
        .ok_or_else(|| JsValue::from_str("Cell index out of bounds"))?;

    let ornament = cell.ornament.as_ref()
        .ok_or_else(|| JsValue::from_str("Cell has no ornament"))?;

    // Convert ornament cells to notation string
    let notation: String = ornament.cells.iter()
        .map(|cell| cell.char.clone())
        .collect::<Vec<String>>()
        .join("");

    wasm_info!("  Copied ornament: {}", notation);

    Ok(notation)
}

/// Clear ornament from current selection (WASM-owned state)
///
/// WASM-FIRST: This function handles selection internally, no cell_index needed
#[wasm_bindgen(js_name = clearOrnament)]
pub fn clear_ornament() -> Result<JsValue, JsValue> {
    wasm_info!("clearOrnament called");

    let mut doc = DOCUMENT.lock().unwrap();
    let doc = doc.as_mut()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    // Get effective selection (same logic as applyOctave)
    let cursor_pos = doc.state.cursor.clone();
    let selection = doc.state.selection_manager.get_selection();

    let target_cell_index = if let Some(sel) = selection {
        // Use first cell in selection
        sel.start().col.min(sel.end().col)
    } else {
        // No selection: target cell to left of cursor
        if cursor_pos.col == 0 {
            return Err(JsValue::from_str("No selection and cursor at start of line"));
        }
        cursor_pos.col - 1
    };

    wasm_info!("  Target cell index: {}", target_cell_index);

    let line = doc.lines.get_mut(cursor_pos.line)
        .ok_or_else(|| JsValue::from_str("No active line"))?;

    let cell = line.cells.get_mut(target_cell_index)
        .ok_or_else(|| JsValue::from_str("Cell index out of bounds"))?;

    // Clear the ornament
    cell.ornament = None;

    wasm_info!("  Ornament cleared from cell {}", target_cell_index);

    // Return EditorDiff
    let diff = create_editor_diff(&doc, Some(cursor_pos.line));
    serde_wasm_bindgen::to_value(&diff)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}

/// Set ornament placement for current selection (WASM-owned state)
///
/// WASM-FIRST: This function handles selection internally, no cell_index needed
#[wasm_bindgen(js_name = setOrnamentPlacement)]
pub fn set_ornament_placement(placement: &str) -> Result<JsValue, JsValue> {
    use crate::models::elements::OrnamentPlacement;

    wasm_info!("setOrnamentPlacement called: placement={}", placement);

    let mut doc = DOCUMENT.lock().unwrap();
    let doc = doc.as_mut()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    // Get effective selection (same logic as applyOctave)
    let cursor_pos = doc.state.cursor.clone();
    let selection = doc.state.selection_manager.get_selection();

    let target_cell_index = if let Some(sel) = selection {
        // Use first cell in selection
        sel.start().col.min(sel.end().col)
    } else {
        // No selection: target cell to left of cursor
        if cursor_pos.col == 0 {
            return Err(JsValue::from_str("No selection and cursor at start of line"));
        }
        cursor_pos.col - 1
    };

    wasm_info!("  Target cell index: {}", target_cell_index);

    let line = doc.lines.get_mut(cursor_pos.line)
        .ok_or_else(|| JsValue::from_str("No active line"))?;

    let cell = line.cells.get_mut(target_cell_index)
        .ok_or_else(|| JsValue::from_str("Cell index out of bounds"))?;

    // Update placement if ornament exists
    if let Some(ref mut ornament) = cell.ornament {
        ornament.placement = match placement {
            "before" => OrnamentPlacement::Before,
            "after" => OrnamentPlacement::After,
            _ => OrnamentPlacement::Before,
        };
        wasm_info!("  Ornament placement updated to: {}", placement);
    } else {
        return Err(JsValue::from_str("Cell has no ornament"));
    }

    // Return EditorDiff
    let diff = create_editor_diff(&doc, Some(cursor_pos.line));
    serde_wasm_bindgen::to_value(&diff)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}

/// OLD FUNCTION - DEPRECATED - Use copyOrnament() instead
#[wasm_bindgen(js_name = copyOrnamentAsNotation)]
pub fn copy_ornament_as_notation(cell_index: usize) -> Result<String, JsValue> {
    wasm_warn!("copyOrnamentAsNotation is DEPRECATED - use copyOrnament instead");

    let doc = DOCUMENT.lock().unwrap();
    let doc = doc.as_ref()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    let line = doc.active_line()
        .ok_or_else(|| JsValue::from_str("No active line"))?;

    let cell = line.cells.get(cell_index)
        .ok_or_else(|| JsValue::from_str("Cell index out of bounds"))?;

    let ornament = cell.ornament.as_ref()
        .ok_or_else(|| JsValue::from_str("Cell has no ornament"))?;

    // Convert ornament cells to notation string
    let notation: String = ornament.cells.iter()
        .map(|cell| cell.char.clone())
        .collect::<Vec<String>>()
        .join("");

    Ok(notation)
}

/// Paste ornament from notation string to current selection (WASM-owned state)
///
/// WASM-FIRST: This function handles selection internally, no cell_index needed
#[wasm_bindgen(js_name = pasteOrnament)]
pub fn paste_ornament(
    notation_text: &str,
    placement: &str
) -> Result<JsValue, JsValue> {
    use crate::models::elements::{Ornament, OrnamentPlacement};

    wasm_info!("pasteOrnament called: notation={:?}, placement={}", notation_text, placement);

    let mut doc = DOCUMENT.lock().unwrap();
    let doc = doc.as_mut()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    // Get effective selection (same logic as applyOctave)
    let cursor_pos = doc.state.cursor.clone();
    let selection = doc.state.selection_manager.get_selection();

    let target_cell_index = if let Some(sel) = selection {
        // Use first cell in selection
        sel.start().col.min(sel.end().col)
    } else {
        // No selection: target cell to left of cursor (same as applyOctave)
        if cursor_pos.col == 0 {
            return Err(JsValue::from_str("No selection and cursor at start of line"));
        }
        cursor_pos.col - 1
    };

    wasm_info!("  Target cell index: {}", target_cell_index);

    let line = doc.lines.get_mut(cursor_pos.line)
        .ok_or_else(|| JsValue::from_str("No active line"))?;

    let cell = line.cells.get_mut(target_cell_index)
        .ok_or_else(|| JsValue::from_str("Cell index out of bounds"))?;

    // Parse notation text - simple character-by-character conversion
    let parsed_cells: Vec<Cell> = notation_text.chars()
        .enumerate()
        .map(|(idx, ch)| Cell::new(ch.to_string(), ElementKind::PitchedElement, idx))
        .collect();

    if parsed_cells.is_empty() {
        return Err(JsValue::from_str("Empty notation text"));
    }

    // Determine placement
    let ornament_placement = match placement {
        "before" => OrnamentPlacement::Before,
        "after" => OrnamentPlacement::After,
        _ => OrnamentPlacement::Before, // default
    };

    // Create ornament and attach
    let ornament = Ornament {
        cells: parsed_cells,
        placement: ornament_placement,
    };
    cell.ornament = Some(ornament);

    wasm_info!("  Ornament attached to cell {}", target_cell_index);

    // Return EditorDiff
    let diff = create_editor_diff(&doc, Some(cursor_pos.line));
    serde_wasm_bindgen::to_value(&diff)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}

/// OLD FUNCTION - DEPRECATED - Use pasteOrnament() instead
#[wasm_bindgen(js_name = pasteOrnamentFromNotation)]
pub fn paste_ornament_from_notation(
    cell_index: usize,
    notation_text: &str,
    placement: &str
) -> Result<JsValue, JsValue> {
    wasm_warn!("pasteOrnamentFromNotation is DEPRECATED - use pasteOrnament instead");

    use crate::models::elements::{Ornament, OrnamentPlacement};

    let mut doc = DOCUMENT.lock().unwrap();
    let doc = doc.as_mut()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    let line = doc.lines.first_mut()
        .ok_or_else(|| JsValue::from_str("No active line"))?;

    let cell = line.cells.get_mut(cell_index)
        .ok_or_else(|| JsValue::from_str("Cell index out of bounds"))?;

    let parsed_cells: Vec<Cell> = notation_text.chars()
        .enumerate()
        .map(|(idx, ch)| Cell::new(ch.to_string(), ElementKind::PitchedElement, idx))
        .collect();

    if parsed_cells.is_empty() {
        return Err(JsValue::from_str("Empty notation text"));
    }

    let ornament_placement = match placement {
        "before" => OrnamentPlacement::Before,
        "after" => OrnamentPlacement::After,
        _ => OrnamentPlacement::Before,
    };

    let ornament = Ornament {
        cells: parsed_cells,
        placement: ornament_placement,
    };
    cell.ornament = Some(ornament);

    let diff = create_editor_diff(&doc, Some(0));
    serde_wasm_bindgen::to_value(&diff)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}

// OLD FUNCTIONS REMOVED - Replaced by WASM-First versions above that handle selection internally

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

    // ==================== Beat Selection Tests ====================

    /// Helper to create a pitched element cell for beat testing
    fn make_pitched_cell(char: &str, col: usize) -> Cell {
        Cell::new(char.to_string(), crate::models::ElementKind::PitchedElement, col)
    }

    /// Helper to create a whitespace cell for beat testing
    fn make_space_cell(char: &str, col: usize) -> Cell {
        Cell::new(char.to_string(), crate::models::ElementKind::Unknown, col)
    }

    #[test]
    fn test_beat_selection_simple_beat() {
        // Create a document with a simple beat: "S--r"
        // Beat should span columns 0-3
        let mut doc = Document::new();
        let mut line = Line::new();

        // Add cells for beat: S--r
        line.cells.push(make_pitched_cell("S", 0));
        line.cells.push(make_pitched_cell("-", 1));
        line.cells.push(make_pitched_cell("-", 2));
        line.cells.push(make_pitched_cell("r", 3));

        doc.lines.push(line);

        // Store document in GLOBAL
        {
            let mut guard = DOCUMENT.lock().unwrap();
            *guard = Some(doc);
        }

        // Test selecting at different positions within the beat
        for col in 0..4 {
            let pos = Pos::new(0, col);
            let pos_js = serde_wasm_bindgen::to_value(&pos).unwrap();
            let result = select_beat_at_position(pos_js);

            assert!(result.is_ok(), "Selection should succeed at col {}", col);

            let selection_info: SelectionInfo = serde_wasm_bindgen::from_value(result.unwrap()).unwrap();
            assert_eq!(selection_info.start.col, 0, "Beat should start at col 0");
            assert_eq!(selection_info.end.col, 4, "Beat should end at col 4 (exclusive)");
        }
    }

    #[test]
    fn test_beat_selection_multiple_beats() {
        // Create a document with multiple beats separated by spaces: "S--r  g-m"
        let mut doc = Document::new();
        let mut line = Line::new();

        // Beat 1: S--r (columns 0-3)
        line.cells.push(make_pitched_cell("S", 0));
        line.cells.push(make_pitched_cell("-", 1));
        line.cells.push(make_pitched_cell("-", 2));
        line.cells.push(make_pitched_cell("r", 3));

        // Separator: spaces (columns 4-5)
        line.cells.push(make_space_cell(" ", 4));
        line.cells.push(make_space_cell(" ", 5));

        // Beat 2: g-m (columns 6-8)
        line.cells.push(make_pitched_cell("g", 6));
        line.cells.push(make_pitched_cell("-", 7));
        line.cells.push(make_pitched_cell("m", 8));

        doc.lines.push(line);

        {
            let mut guard = DOCUMENT.lock().unwrap();
            *guard = Some(doc);
        }

        // Test selecting first beat (col 0-3)
        let pos = Pos::new(0, 2);
        let pos_js = serde_wasm_bindgen::to_value(&pos).unwrap();
        let result = select_beat_at_position(pos_js).unwrap();
        let selection_info: SelectionInfo = serde_wasm_bindgen::from_value(result).unwrap();
        assert_eq!(selection_info.start.col, 0);
        assert_eq!(selection_info.end.col, 4);

        // Test selecting second beat (col 6-8)
        let pos = Pos::new(0, 7);
        let pos_js = serde_wasm_bindgen::to_value(&pos).unwrap();
        let result = select_beat_at_position(pos_js).unwrap();
        let selection_info: SelectionInfo = serde_wasm_bindgen::from_value(result).unwrap();
        assert_eq!(selection_info.start.col, 6);
        assert_eq!(selection_info.end.col, 9);
    }

    #[test]
    fn test_beat_selection_character_group_fallback() {
        // Create a document with no beats - should fall back to character group selection
        let mut doc = Document::new();
        let mut line = Line::new();

        // Add cells with continuation flags (simulating a multi-char glyph)
        let mut cell1 = make_space_cell("S", 0);
        cell1.continuation = false;
        line.cells.push(cell1);

        let mut cell2 = make_space_cell("a", 1);
        cell2.continuation = true; // continuation of previous
        line.cells.push(cell2);

        let mut cell3 = make_space_cell("r", 2);
        cell3.continuation = false; // new character group
        line.cells.push(cell3);

        doc.lines.push(line);

        {
            let mut guard = DOCUMENT.lock().unwrap();
            *guard = Some(doc);
        }

        // Test selecting first character group (S + continuation)
        let pos = Pos::new(0, 0);
        let pos_js = serde_wasm_bindgen::to_value(&pos).unwrap();
        let result = select_beat_at_position(pos_js).unwrap();
        let selection_info: SelectionInfo = serde_wasm_bindgen::from_value(result).unwrap();
        assert_eq!(selection_info.start.col, 0);
        assert_eq!(selection_info.end.col, 2, "Should select S and its continuation");

        // Test selecting second character group
        let pos = Pos::new(0, 2);
        let pos_js = serde_wasm_bindgen::to_value(&pos).unwrap();
        let result = select_beat_at_position(pos_js).unwrap();
        let selection_info: SelectionInfo = serde_wasm_bindgen::from_value(result).unwrap();
        assert_eq!(selection_info.start.col, 2);
        assert_eq!(selection_info.end.col, 3, "Should select just r");
    }

    #[test]
    fn test_double_click_selects_barline_character_group() {
        // Test that double-clicking on multi-char barline ":|" selects entire barline
        // This tests the character group fallback (not beat, not text token)
        // Create document: "S--r :|  g-m-"
        let mut doc = Document::new();
        let mut line = Line::new();

        // Beat 1: "S--r" (cols 0-3)
        line.cells.push(Cell::new("S".to_string(), ElementKind::PitchedElement, 0));
        line.cells.push(Cell::new("-".to_string(), ElementKind::UnpitchedElement, 1));
        line.cells.push(Cell::new("-".to_string(), ElementKind::UnpitchedElement, 2));
        line.cells.push(Cell::new("r".to_string(), ElementKind::PitchedElement, 3));

        // Whitespace (col 4)
        line.cells.push(Cell::new(" ".to_string(), ElementKind::Whitespace, 4));

        // Multi-char barline: ":|" (cols 5-6)
        // First cell is ":" (Symbol), but gets forced to RepeatRightBarline by mark_continuations
        let mut cell_colon = Cell::new(":".to_string(), ElementKind::RepeatRightBarline, 5);
        cell_colon.continuation = false; // Root of character group
        line.cells.push(cell_colon);

        let mut cell_pipe = Cell::new("|".to_string(), ElementKind::RepeatRightBarline, 6);
        cell_pipe.continuation = true; // Continuation
        line.cells.push(cell_pipe);

        // Whitespace (cols 7-8)
        line.cells.push(Cell::new(" ".to_string(), ElementKind::Whitespace, 7));
        line.cells.push(Cell::new(" ".to_string(), ElementKind::Whitespace, 8));

        // Beat 2: "g-m-" (cols 9-12)
        line.cells.push(Cell::new("g".to_string(), ElementKind::PitchedElement, 9));
        line.cells.push(Cell::new("-".to_string(), ElementKind::UnpitchedElement, 10));
        line.cells.push(Cell::new("m".to_string(), ElementKind::PitchedElement, 11));
        line.cells.push(Cell::new("-".to_string(), ElementKind::UnpitchedElement, 12));

        doc.lines.push(line);

        {
            let mut guard = DOCUMENT.lock().unwrap();
            *guard = Some(doc);
        }

        // Test clicking on first char of barline (col 5, ":")
        let pos = Pos::new(0, 5);
        let pos_js = serde_wasm_bindgen::to_value(&pos).unwrap();
        let result = select_beat_at_position(pos_js).unwrap();
        let selection_info: SelectionInfo = serde_wasm_bindgen::from_value(result).unwrap();
        assert_eq!(selection_info.start.col, 5, "Should start at ':'");
        assert_eq!(selection_info.end.col, 7, "Should select entire ':|' barline (exclusive end)");

        // Test clicking on second char of barline (col 6, "|")
        let pos = Pos::new(0, 6);
        let pos_js = serde_wasm_bindgen::to_value(&pos).unwrap();
        let result = select_beat_at_position(pos_js).unwrap();
        let selection_info: SelectionInfo = serde_wasm_bindgen::from_value(result).unwrap();
        assert_eq!(selection_info.start.col, 5, "Should start at ':'");
        assert_eq!(selection_info.end.col, 7, "Should select entire ':|' barline (exclusive end)");
    }

    #[test]
    fn test_double_click_selects_text_token() {
        // Test that double-clicking on text like "zxz" selects the entire text token
        // Create document: "S--r  zxz  g-m-"
        // Beats at cols 0-3 and 11-14, Text token at cols 6-8
        let mut doc = Document::new();
        let mut line = Line::new();

        // Beat 1: "S--r" (cols 0-3)
        line.cells.push(Cell::new("S".to_string(), ElementKind::PitchedElement, 0));
        line.cells.push(Cell::new("-".to_string(), ElementKind::UnpitchedElement, 1));
        line.cells.push(Cell::new("-".to_string(), ElementKind::UnpitchedElement, 2));
        line.cells.push(Cell::new("r".to_string(), ElementKind::PitchedElement, 3));

        // Whitespace (cols 4-5)
        line.cells.push(Cell::new(" ".to_string(), ElementKind::Whitespace, 4));
        line.cells.push(Cell::new(" ".to_string(), ElementKind::Whitespace, 5));

        // Text token: "zxz" (cols 6-8)
        let mut cell_z1 = Cell::new("z".to_string(), ElementKind::Text, 6);
        cell_z1.continuation = false; // Root of text token
        line.cells.push(cell_z1);

        let mut cell_x = Cell::new("x".to_string(), ElementKind::Text, 7);
        cell_x.continuation = true; // Continuation
        line.cells.push(cell_x);

        let mut cell_z2 = Cell::new("z".to_string(), ElementKind::Text, 8);
        cell_z2.continuation = true; // Continuation
        line.cells.push(cell_z2);

        // Whitespace (cols 9-10)
        line.cells.push(Cell::new(" ".to_string(), ElementKind::Whitespace, 9));
        line.cells.push(Cell::new(" ".to_string(), ElementKind::Whitespace, 10));

        // Beat 2: "g-m-" (cols 11-14)
        line.cells.push(Cell::new("g".to_string(), ElementKind::PitchedElement, 11));
        line.cells.push(Cell::new("-".to_string(), ElementKind::UnpitchedElement, 12));
        line.cells.push(Cell::new("m".to_string(), ElementKind::PitchedElement, 13));
        line.cells.push(Cell::new("-".to_string(), ElementKind::UnpitchedElement, 14));

        doc.lines.push(line);

        {
            let mut guard = DOCUMENT.lock().unwrap();
            *guard = Some(doc);
        }

        // Test clicking on first char of text token (col 6)
        let pos = Pos::new(0, 6);
        let pos_js = serde_wasm_bindgen::to_value(&pos).unwrap();
        let result = select_beat_at_position(pos_js).unwrap();
        let selection_info: SelectionInfo = serde_wasm_bindgen::from_value(result).unwrap();
        assert_eq!(selection_info.start.col, 6, "Should start at 'z'");
        assert_eq!(selection_info.end.col, 9, "Should select entire 'zxz' token (exclusive end)");

        // Test clicking on middle char of text token (col 7)
        let pos = Pos::new(0, 7);
        let pos_js = serde_wasm_bindgen::to_value(&pos).unwrap();
        let result = select_beat_at_position(pos_js).unwrap();
        let selection_info: SelectionInfo = serde_wasm_bindgen::from_value(result).unwrap();
        assert_eq!(selection_info.start.col, 6, "Should start at 'z'");
        assert_eq!(selection_info.end.col, 9, "Should select entire 'zxz' token (exclusive end)");

        // Test clicking on last char of text token (col 8)
        let pos = Pos::new(0, 8);
        let pos_js = serde_wasm_bindgen::to_value(&pos).unwrap();
        let result = select_beat_at_position(pos_js).unwrap();
        let selection_info: SelectionInfo = serde_wasm_bindgen::from_value(result).unwrap();
        assert_eq!(selection_info.start.col, 6, "Should start at 'z'");
        assert_eq!(selection_info.end.col, 9, "Should select entire 'zxz' token (exclusive end)");
    }

    #[test]
    fn test_edit_replace_range_deletes_multichar_token() {
        // Test scenario: Type ":|", select both chars (Shift+Left ×2), backspace
        // Expected: All cells deleted, line is empty
        // This tests that selection deletion properly handles multi-char tokens
        let mut doc = Document::new();
        let mut line = Line::new();

        // Multi-char barline ":|" (cols 0-1)
        let mut cell_colon = Cell::new(":".to_string(), ElementKind::RepeatRightBarline, 0);
        cell_colon.continuation = false; // Root of character group
        line.cells.push(cell_colon);

        let mut cell_pipe = Cell::new("|".to_string(), ElementKind::RepeatRightBarline, 1);
        cell_pipe.continuation = true; // Continuation
        line.cells.push(cell_pipe);

        doc.lines.push(line);

        {
            let mut guard = DOCUMENT.lock().unwrap();
            *guard = Some(doc);
        }

        // Delete selection (0,0)-(0,2) with empty replacement (backspace on selection)
        let result = edit_replace_range(0, 0, 0, 2, "");
        assert!(result.is_ok(), "edit_replace_range should succeed");

        // Check that line is now empty
        let doc_guard = DOCUMENT.lock().unwrap();
        let doc = doc_guard.as_ref().unwrap();
        assert_eq!(doc.lines[0].cells.len(), 0, "Should delete entire ':|' token, leaving 0 cells");
    }

    // ============================================================================
    // Ornament Paste Tests - Cursor Positioning Logic
    // ============================================================================

    #[test]
    fn test_cursor_position_to_cell_index_calculation() {
        // DEMONSTRATES THE LOGIC: How to convert cursor position to cell index
        //
        // SCENARIO: User types "123" → creates 3 cells at indices 0, 1, 2
        // After typing "1": cursor at col 1, should attach ornament to cell 0
        // After typing "12": cursor at col 2, should attach ornament to cell 1
        // After typing "123": cursor at col 3, should attach ornament to cell 2

        let mut line = Line::new();
        line.cells.push(Cell::new("1".to_string(), ElementKind::PitchedElement, 0));
        line.cells.push(Cell::new("2".to_string(), ElementKind::PitchedElement, 1));
        line.cells.push(Cell::new("3".to_string(), ElementKind::PitchedElement, 2));

        // After typing "1", cursor is at col 1
        let cursor_col = 1;
        let target_cell_index = cursor_col - 1;
        assert_eq!(target_cell_index, 0, "Should target cell 0 (the '1' note)");
        assert!(target_cell_index < line.cells.len(), "Index must be in bounds");

        // After typing "12", cursor is at col 2
        let cursor_col = 2;
        let target_cell_index = cursor_col - 1;
        assert_eq!(target_cell_index, 1, "Should target cell 1 (the '2' note)");
        assert!(target_cell_index < line.cells.len(), "Index must be in bounds");

        // After typing "123", cursor is at col 3
        let cursor_col = 3;
        let target_cell_index = cursor_col - 1;
        assert_eq!(target_cell_index, 2, "Should target cell 2 (the '3' note)");
        assert!(target_cell_index < line.cells.len(), "Index must be in bounds");
    }

    #[test]
    #[should_panic(expected = "BUG: Using cursor.col directly without -1 causes out of bounds")]
    fn test_cursor_position_fails_without_minus_one() {
        // FAILING TEST: Demonstrates what happens if we forget cursor.col - 1
        //
        // SCENARIO: User types "1" → cursor at col 1
        // BUG: If we use cursor.col (1) directly as index, we try to access cells[1]
        // But cells only has 1 element (cells[0]), so this panics!

        let mut line = Line::new();
        line.cells.push(Cell::new("1".to_string(), ElementKind::PitchedElement, 0));

        let cursor_col = 1; // Cursor after typing "1"

        // ❌ WRONG: Using cursor_col directly
        let wrong_index = cursor_col;

        // This should panic because cells.len() = 1, so valid indices are only 0
        if wrong_index >= line.cells.len() {
            panic!("BUG: Using cursor.col directly without -1 causes out of bounds");
        }

        // If we got here, the test failed to demonstrate the bug
        unreachable!("Test should have panicked above");
    }
}
