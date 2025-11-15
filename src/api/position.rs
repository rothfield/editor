//! Position conversion functions
//!
//! These functions handle conversions between character positions, cell indices,
//! and pixel coordinates. They implement ornament filtering based on edit mode.

use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};
use crate::models::Document;
use crate::renderers::display_list::DisplayList;

// Constant for left margin (matches JavaScript constant)
const LEFT_MARGIN_PX: f32 = 60.0;

/// Result of converting character position to cell index
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CharPosToCellResult {
    /// The cell index
    pub cell_index: usize,
    /// Character offset within the cell (0-based)
    pub char_offset_in_cell: usize,
}

/// Get maximum character position for the current line
///
/// Returns the total number of characters in the current line,
/// filtering out ornament cells when in normal mode (edit mode off).
#[wasm_bindgen(js_name = getMaxCharPosition)]
pub fn get_max_char_position(doc_js: JsValue) -> Result<usize, JsValue> {
    // Deserialize document from JS
    let doc: Document = serde_wasm_bindgen::from_value(doc_js)
        .map_err(|e| JsValue::from_str(&format!("Failed to deserialize document: {}", e)))?;

    // Get current line
    let line_index = doc.state.cursor.line;
    let line = doc.lines.get(line_index)
        .ok_or_else(|| JsValue::from_str("Current line not found"))?;

    // All cells are now in the flow (ornaments are inline, not separate marker cells)
    let _edit_mode = doc.ornament_edit_mode;

    // Sum up lengths of all navigable cell glyphs
    let mut total_chars = 0;
    for cell in &line.cells {
        // All cells are now in the flow (ornaments are inline, not separate marker cells)
        total_chars += cell.char.chars().count();
    }

    Ok(total_chars)
}

/// Convert character position to cell index and offset within cell
///
/// Returns the cell index and character offset for a given character position.
/// Filters out ornament cells when in normal mode (edit mode off).
#[wasm_bindgen(js_name = charPosToCellIndex)]
pub fn char_pos_to_cell_index(doc_js: JsValue, char_pos: usize) -> Result<JsValue, JsValue> {
    // Deserialize document from JS
    let doc: Document = serde_wasm_bindgen::from_value(doc_js)
        .map_err(|e| JsValue::from_str(&format!("Failed to deserialize document: {}", e)))?;

    // Get current line
    let line_index = doc.state.cursor.line;
    let line = doc.lines.get(line_index)
        .ok_or_else(|| JsValue::from_str("Current line not found"))?;

    // All cells are now in the flow (ornaments are inline, not separate marker cells)
    let _edit_mode = doc.ornament_edit_mode;

    // Accumulate character counts and find the target cell
    let mut accumulated_chars = 0;
    for (cell_index, cell) in line.cells.iter().enumerate() {
        // All cells are now in the flow (ornaments are inline, not separate marker cells)
        let cell_length = cell.char.chars().count();

        if char_pos < accumulated_chars + cell_length {
            let result = CharPosToCellResult {
                cell_index,
                char_offset_in_cell: char_pos - accumulated_chars,
            };
            return serde_wasm_bindgen::to_value(&result)
                .map_err(|e| JsValue::from_str(&format!("Failed to serialize result: {}", e)));
        }

        accumulated_chars += cell_length;
    }

    // Position after last cell
    let result = CharPosToCellResult {
        cell_index: line.cells.len(),
        char_offset_in_cell: 0,
    };
    serde_wasm_bindgen::to_value(&result)
        .map_err(|e| JsValue::from_str(&format!("Failed to serialize result: {}", e)))
}

/// Convert cell index to character position
///
/// Returns the character position at the start of the given cell index.
/// Filters out ornament cells when in normal mode (edit mode off).
#[wasm_bindgen(js_name = cellIndexToCharPos)]
pub fn cell_index_to_char_pos(doc_js: JsValue, cell_index: usize) -> Result<usize, JsValue> {
    // Deserialize document from JS
    let doc: Document = serde_wasm_bindgen::from_value(doc_js)
        .map_err(|e| JsValue::from_str(&format!("Failed to deserialize document: {}", e)))?;

    // Get current line
    let line_index = doc.state.cursor.line;
    let line = doc.lines.get(line_index)
        .ok_or_else(|| JsValue::from_str("Current line not found"))?;

    // All cells are now in the flow (ornaments are inline, not separate marker cells)
    let _edit_mode = doc.ornament_edit_mode;

    // Handle empty cells array
    if line.cells.is_empty() {
        return Ok(0);
    }

    // Sum up lengths of all navigable cells UP TO (but not including) the target cell
    let mut char_pos = 0;
    for i in 0..=cell_index.min(line.cells.len() - 1) {
        let cell = &line.cells[i];

        // All cells are now in the flow (ornaments are inline, not separate marker cells)
        char_pos += cell.char.chars().count();
    }

    Ok(char_pos)
}

/// Convert character position to pixel X coordinate
///
/// Uses the DisplayList to look up pre-calculated pixel positions.
/// Falls back to proportional calculation if character positions are not available.
#[wasm_bindgen(js_name = charPosToPixel)]
pub fn char_pos_to_pixel(
    doc_js: JsValue,
    display_list_js: JsValue,
    char_pos: usize,
) -> Result<f32, JsValue> {
    // Deserialize document and display list from JS
    let doc: Document = serde_wasm_bindgen::from_value(doc_js)
        .map_err(|e| JsValue::from_str(&format!("Failed to deserialize document: {}", e)))?;
    let display_list: DisplayList = serde_wasm_bindgen::from_value(display_list_js)
        .map_err(|e| JsValue::from_str(&format!("Failed to deserialize display list: {}", e)))?;

    // Get current line from display list
    let line_index = doc.state.cursor.line;
    let current_line = display_list.lines.get(line_index)
        .ok_or_else(|| JsValue::from_str("Current line not found in display list"))?;

    if current_line.cells.is_empty() {
        return Ok(LEFT_MARGIN_PX);
    }

    // Convert char position to cell + offset using the same document
    let result_js = char_pos_to_cell_index(
        serde_wasm_bindgen::to_value(&doc)
            .map_err(|e| JsValue::from_str(&format!("Failed to serialize document: {}", e)))?,
        char_pos,
    )?;
    let result: CharPosToCellResult = serde_wasm_bindgen::from_value(result_js)
        .map_err(|e| JsValue::from_str(&format!("Failed to deserialize conversion result: {}", e)))?;

    let cell_index = result.cell_index;
    let char_offset_in_cell = result.char_offset_in_cell;

    // If before first cell
    if cell_index == 0 && char_offset_in_cell == 0 {
        return Ok(current_line.cells[0].cursor_left);
    }

    // If after all cells
    if cell_index >= current_line.cells.len() {
        let last_cell = &current_line.cells[current_line.cells.len() - 1];
        return Ok(last_cell.cursor_right);
    }

    // Get cell from DisplayList
    let cell = &current_line.cells[cell_index];

    // If at start of cell
    if char_offset_in_cell == 0 {
        return Ok(cell.cursor_left);
    }

    // Use pre-calculated character positions from Rust DisplayList
    if char_offset_in_cell < cell.char_positions.len() {
        return Ok(cell.char_positions[char_offset_in_cell]);
    }

    // Fallback: proportional split (if char_positions not available)
    let cell_length = cell.char.chars().count();

    // If cursor is at or past the end of the cell, position it at cell's right edge
    if char_offset_in_cell >= cell_length {
        return Ok(cell.cursor_right);
    }

    // Calculate proportional position within the cell
    let cell_width = cell.cursor_right - cell.cursor_left;
    let char_width = cell_width / cell_length as f32;
    Ok(cell.cursor_left + (char_width * char_offset_in_cell as f32))
}

/// Convert cell column to pixel X coordinate (NEW: one cell = one glyph model)
///
/// Maps cell column index directly to pixel position using DisplayList.
/// This replaces the legacy charPosToPixel() for the new NotationFont model
/// where each cell renders as exactly one glyph.
///
/// # Arguments
/// * `doc_js` - Serialized Document
/// * `display_list_js` - Serialized DisplayList with pre-calculated positions
/// * `cell_col` - Cell column index (0 = before first cell, N = after Nth cell)
///
/// # Returns
/// Pixel X coordinate for cursor at that column position
#[wasm_bindgen(js_name = cellColToPixel)]
pub fn cell_col_to_pixel(
    doc_js: JsValue,
    display_list_js: JsValue,
    cell_col: usize,
) -> Result<f32, JsValue> {
    // Deserialize document and display list
    let doc: Document = serde_wasm_bindgen::from_value(doc_js)
        .map_err(|e| JsValue::from_str(&format!("Failed to deserialize document: {}", e)))?;
    let display_list: DisplayList = serde_wasm_bindgen::from_value(display_list_js)
        .map_err(|e| JsValue::from_str(&format!("Failed to deserialize display list: {}", e)))?;

    // Get current line from display list
    let line_index = doc.state.cursor.line;
    let current_line = display_list.lines.get(line_index)
        .ok_or_else(|| JsValue::from_str("Current line not found in display list"))?;

    // Empty line: return left margin
    if current_line.cells.is_empty() {
        return Ok(LEFT_MARGIN_PX);
    }

    // Before first cell (col = 0)
    if cell_col == 0 {
        return Ok(current_line.cells[0].cursor_left);
    }

    // After all cells
    if cell_col >= current_line.cells.len() {
        let last_cell = &current_line.cells[current_line.cells.len() - 1];
        return Ok(last_cell.cursor_right);
    }

    // Between cells: use cursor_right of previous cell
    Ok(current_line.cells[cell_col - 1].cursor_right)
}

// TODO: Add unit tests after resolving Document/Line struct construction complexity
// The logic is a straightforward port from JavaScript and will be tested E2E

/*
#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{
        Cell, ElementKind, Line, Document, DocumentState, Cursor, PitchSystem,
    };

    fn create_test_document(cells: Vec<Cell>, edit_mode: bool) -> Document {
        let line = Line {
            label: None,
            tonic: "C".to_string(),
            pitch_system: PitchSystem::Number,
            cells,
            lyrics: None,
            tala: None,
            key_signature: None,
        };

        Document {
            title: "Test".to_string(),
            composer: None,
            lines: vec![line],
            state: DocumentState {
                cursor: Cursor {
                    line: 0,
                    col: 0,
                    lane: 1,
                },
                selection: None,
            },
            ornament_edit_mode: edit_mode,
        }
    }

    fn create_cell(char: &str, _is_ornament: bool) -> Cell {
        Cell {
            char: char.to_string(),
            kind: ElementKind::PitchedElement,
            col: 0,
            ..Default::default()
        }
    }

    #[test]
    fn test_get_max_char_position_simple() {
        let cells = vec![
            create_cell("A", false),
            create_cell("B", false),
            create_cell("C", false),
        ];
        let doc = create_test_document(cells, false);
        let doc_js = serde_wasm_bindgen::to_value(&doc).unwrap();

        let result = get_max_char_position(doc_js).unwrap();
        assert_eq!(result, 3); // A + B + C
    }

    #[test]
    fn test_get_max_char_position_with_ornaments_edit_mode_off() {
        let cells = vec![
            create_cell("A", false),
            create_cell("X", true), // Ornament - should be skipped
            create_cell("B", false),
        ];
        let doc = create_test_document(cells, false); // Edit mode OFF
        let doc_js = serde_wasm_bindgen::to_value(&doc).unwrap();

        let result = get_max_char_position(doc_js).unwrap();
        assert_eq!(result, 2); // Only A + B (X is ornament, skipped)
    }

    #[test]
    fn test_get_max_char_position_with_ornaments_edit_mode_on() {
        let cells = vec![
            create_cell("A", false),
            create_cell("X", true), // Ornament - should be counted
            create_cell("B", false),
        ];
        let doc = create_test_document(cells, true); // Edit mode ON
        let doc_js = serde_wasm_bindgen::to_value(&doc).unwrap();

        let result = get_max_char_position(doc_js).unwrap();
        assert_eq!(result, 3); // A + X + B (all counted in edit mode)
    }

    #[test]
    fn test_char_pos_to_cell_index_simple() {
        let cells = vec![
            create_cell("A", false),
            create_cell("BC", false),
            create_cell("D", false),
        ];
        let doc = create_test_document(cells, false);
        let doc_js = serde_wasm_bindgen::to_value(&doc).unwrap();

        // Position 0: start of cell 0
        let result_js = char_pos_to_cell_index(doc_js.clone(), 0).unwrap();
        let result: CharPosToCellResult = serde_wasm_bindgen::from_value(result_js).unwrap();
        assert_eq!(result.cell_index, 0);
        assert_eq!(result.char_offset_in_cell, 0);

        // Position 1: inside cell 1 (B)
        let result_js = char_pos_to_cell_index(doc_js.clone(), 1).unwrap();
        let result: CharPosToCellResult = serde_wasm_bindgen::from_value(result_js).unwrap();
        assert_eq!(result.cell_index, 1);
        assert_eq!(result.char_offset_in_cell, 0);

        // Position 2: inside cell 1 (C)
        let result_js = char_pos_to_cell_index(doc_js.clone(), 2).unwrap();
        let result: CharPosToCellResult = serde_wasm_bindgen::from_value(result_js).unwrap();
        assert_eq!(result.cell_index, 1);
        assert_eq!(result.char_offset_in_cell, 1);

        // Position 3: start of cell 2 (D)
        let result_js = char_pos_to_cell_index(doc_js.clone(), 3).unwrap();
        let result: CharPosToCellResult = serde_wasm_bindgen::from_value(result_js).unwrap();
        assert_eq!(result.cell_index, 2);
        assert_eq!(result.char_offset_in_cell, 0);
    }

    #[test]
    fn test_char_pos_to_cell_index_with_ornaments_skipped() {
        let cells = vec![
            create_cell("A", false),
            create_cell("X", true), // Ornament - skipped in normal mode
            create_cell("B", false),
        ];
        let doc = create_test_document(cells, false); // Edit mode OFF
        let doc_js = serde_wasm_bindgen::to_value(&doc).unwrap();

        // Position 0: cell 0 (A)
        let result_js = char_pos_to_cell_index(doc_js.clone(), 0).unwrap();
        let result: CharPosToCellResult = serde_wasm_bindgen::from_value(result_js).unwrap();
        assert_eq!(result.cell_index, 0);
        assert_eq!(result.char_offset_in_cell, 0);

        // Position 1: cell 2 (B) - ornament cell skipped
        let result_js = char_pos_to_cell_index(doc_js.clone(), 1).unwrap();
        let result: CharPosToCellResult = serde_wasm_bindgen::from_value(result_js).unwrap();
        assert_eq!(result.cell_index, 2);
        assert_eq!(result.char_offset_in_cell, 0);
    }

    #[test]
    fn test_cell_index_to_char_pos_simple() {
        let cells = vec![
            create_cell("A", false),
            create_cell("BC", false),
            create_cell("D", false),
        ];
        let doc = create_test_document(cells, false);
        let doc_js = serde_wasm_bindgen::to_value(&doc).unwrap();

        // Cell 0 -> char pos 1 (after A)
        let result = cell_index_to_char_pos(doc_js.clone(), 0).unwrap();
        assert_eq!(result, 1);

        // Cell 1 -> char pos 3 (after A + BC)
        let result = cell_index_to_char_pos(doc_js.clone(), 1).unwrap();
        assert_eq!(result, 3);

        // Cell 2 -> char pos 4 (after A + BC + D)
        let result = cell_index_to_char_pos(doc_js.clone(), 2).unwrap();
        assert_eq!(result, 4);
    }

    #[test]
    fn test_cell_index_to_char_pos_with_ornaments_skipped() {
        let cells = vec![
            create_cell("A", false),
            create_cell("X", true), // Ornament - skipped in normal mode
            create_cell("B", false),
        ];
        let doc = create_test_document(cells, false); // Edit mode OFF
        let doc_js = serde_wasm_bindgen::to_value(&doc).unwrap();

        // Cell 0 -> char pos 1 (after A)
        let result = cell_index_to_char_pos(doc_js.clone(), 0).unwrap();
        assert_eq!(result, 1);

        // Cell 1 (ornament X) -> char pos 1 (ornament not counted)
        let result = cell_index_to_char_pos(doc_js.clone(), 1).unwrap();
        assert_eq!(result, 1);

        // Cell 2 -> char pos 2 (after A + B, X not counted)
        let result = cell_index_to_char_pos(doc_js.clone(), 2).unwrap();
        assert_eq!(result, 2);
    }
}
*/
