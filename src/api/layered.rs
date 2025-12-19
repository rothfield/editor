//! WASM API for Layered Architecture Proof-of-Concept
//!
//! This module provides the JavaScript-facing API for features built using
//! the layered text-first architecture:
//!
//! - Layer 0: Text buffer
//! - Layer 1: Glyph semantics (font_utils.rs)
//! - Layer 2: Musical structure (beat grouping)
//!
//! ## Proof-of-Concept Feature: "Select Whole Beat"
//!
//! This demonstrates how the layered architecture simplifies operations:
//!
//! ```
//! JavaScript: selectWholeBeat(line, col)
//!     ↓
//! Layer 0: get_line_text(line) → "1 2 3"
//!     ↓
//! Layer 2: find_beat_at_position(text, pos) → Beat { range: (2, 3) }
//!     ↓
//! Return: { startCol: 2, endCol: 3 }
//! ```

use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};
use crate::text::cursor::{TextPos, TextRange};
use crate::structure::line_analysis::find_beat_at_position;
use crate::structure::operations::shift_octaves_in_range;
use crate::models::PitchSystem;
use crate::api::helpers::lock_document;

/// Result of beat selection (returned to JavaScript)
#[derive(Serialize, Deserialize)]
pub struct BeatSelectionResult {
    /// Line number
    pub line: usize,

    /// Start column of the beat (inclusive)
    pub start_col: usize,

    /// End column of the beat (exclusive)
    pub end_col: usize,

    /// The beat text
    pub text: String,

    /// Success flag
    pub success: bool,

    /// Error message (if success = false)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Result of octave shift operation (returned to JavaScript)
#[derive(Serialize, Deserialize)]
pub struct OctaveShiftResult {
    /// Line number
    pub line: usize,

    /// Start column of shifted range
    pub start_col: usize,

    /// End column of shifted range
    pub end_col: usize,

    /// Number of notes shifted
    pub shifted_count: usize,

    /// Number of characters skipped (non-pitched or out of range)
    pub skipped_count: usize,

    /// The new text after shifting
    pub new_text: String,

    /// Success flag
    pub success: bool,

    /// Error message (if success = false)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Result of slur apply/remove operation (returned to JavaScript)
#[derive(Serialize, Deserialize)]
pub struct SlurResult {
    /// Line number
    pub line: usize,

    /// Start column of slur
    pub start_col: usize,

    /// End column of slur
    pub end_col: usize,

    /// Number of slurs currently on this line
    pub slur_count: usize,

    /// Success flag
    pub success: bool,

    /// Error message (if success = false)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Select the whole beat at the cursor position
///
/// This is the proof-of-concept feature demonstrating the layered architecture.
///
/// ## Architecture Demo
///
/// - Layer 0: Get text from document
/// - Layer 2: Analyze text to find beat
/// - No Cell manipulation needed!
///
/// ## Parameters
/// - `line`: Line number (0-based)
/// - `col`: Column position (0-based)
///
/// ## Returns
/// JSON object with beat range and text:
/// ```json
/// {
///   "line": 0,
///   "start_col": 2,
///   "end_col": 3,
///   "text": "2",
///   "success": true
/// }
/// ```
#[wasm_bindgen(js_name = selectWholeBeat)]
pub fn select_whole_beat(line: usize, col: usize) -> JsValue {
    // Layer 0: Get text from document
    let doc_guard = match lock_document() {
        Ok(guard) => guard,
        Err(e) => {
            let result = BeatSelectionResult {
                line,
                start_col: col,
                end_col: col,
                text: String::new(),
                success: false,
                error: Some(format!("Failed to lock document: {:?}", e)),
            };
            return serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL);
        }
    };

    // Get document from Option
    let doc = match doc_guard.as_ref() {
        Some(d) => d,
        None => {
            let result = BeatSelectionResult {
                line,
                start_col: col,
                end_col: col,
                text: String::new(),
                success: false,
                error: Some("No document loaded".to_string()),
            };
            return serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL);
        }
    };

    // Check if line exists
    if line >= doc.lines.len() {
        let result = BeatSelectionResult {
            line,
            start_col: col,
            end_col: col,
            text: String::new(),
            success: false,
            error: Some(format!("Line {} does not exist", line)),
        };
        return serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL);
    }

    // Get text from the line (extracting from Cells for now)
    // TODO: In full implementation, text buffer would be the source
    let cells = &doc.lines[line].cells;
    let text: String = cells.iter().map(|c| c.get_char_string()).collect();

    drop(doc_guard); // Release lock

    // Layer 2: Find beat at position
    let pos = TextPos::new(line, col);
    let pitch_system = PitchSystem::Number; // Default system

    match find_beat_at_position(&text, pos, pitch_system) {
        Some(beat) => {
            // Extract beat text
            let beat_text = if beat.text_range.is_single_line() {
                text.chars()
                    .skip(beat.text_range.start.col)
                    .take(beat.text_range.len())
                    .collect()
            } else {
                String::new()
            };

            let result = BeatSelectionResult {
                line,
                start_col: beat.text_range.start.col,
                end_col: beat.text_range.end.col,
                text: beat_text,
                success: true,
                error: None,
            };

            serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL)
        }
        None => {
            let result = BeatSelectionResult {
                line,
                start_col: col,
                end_col: col,
                text: String::new(),
                success: false,
                error: Some(format!("No beat found at position ({}, {})", line, col)),
            };

            serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL)
        }
    }
}

/// Shift octaves for a selection range
///
/// This is the second proof-of-concept feature demonstrating the layered architecture.
///
/// ## Architecture Demo
///
/// - Layer 0: Get text from document
/// - Layer 1: Decode glyphs → (pitch, octave)
/// - Transform: Add delta to octave
/// - Layer 1: Encode (pitch, new_octave) → new glyphs
/// - Layer 0: Replace text in document
///
/// ## Parameters
/// - `line`: Line number (0-based)
/// - `start_col`: Start of selection (inclusive)
/// - `end_col`: End of selection (exclusive)
/// - `delta`: Octave shift (+1 = up one octave, -1 = down one octave)
///
/// ## Returns
/// JSON object with shift results:
/// ```json
/// {
///   "line": 0,
///   "start_col": 0,
///   "end_col": 5,
///   "shifted_count": 3,
///   "skipped_count": 2,
///   "new_text": "...",
///   "success": true
/// }
/// ```
#[wasm_bindgen(js_name = shiftOctave)]
pub fn shift_octave(line: usize, start_col: usize, end_col: usize, delta: i8) -> JsValue {
    // Layer 0: Get text from document
    let mut doc_guard = match lock_document() {
        Ok(guard) => guard,
        Err(e) => {
            let result = OctaveShiftResult {
                line,
                start_col,
                end_col,
                shifted_count: 0,
                skipped_count: 0,
                new_text: String::new(),
                success: false,
                error: Some(format!("Failed to lock document: {:?}", e)),
            };
            return serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL);
        }
    };

    // Get document from Option
    let doc = match doc_guard.as_mut() {
        Some(d) => d,
        None => {
            let result = OctaveShiftResult {
                line,
                start_col,
                end_col,
                shifted_count: 0,
                skipped_count: 0,
                new_text: String::new(),
                success: false,
                error: Some("No document loaded".to_string()),
            };
            return serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL);
        }
    };

    // Check if line exists
    if line >= doc.lines.len() {
        let result = OctaveShiftResult {
            line,
            start_col,
            end_col,
            shifted_count: 0,
            skipped_count: 0,
            new_text: String::new(),
            success: false,
            error: Some(format!("Line {} does not exist", line)),
        };
        return serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL);
    }

    // Get text from the line
    let cells = &doc.lines[line].cells;
    let text: String = cells.iter().map(|c| c.get_char_string()).collect();

    // Layer 2: Shift octaves in range
    let range = TextRange::new(TextPos::new(line, start_col), TextPos::new(line, end_col));
    let pitch_system = PitchSystem::Number; // Default system

    let shift_result = shift_octaves_in_range(&text, range, delta, pitch_system);

    // Layer 0: Update document with new text
    // Convert new text back to cells
    // kind is derived from codepoint via get_kind(), no manual assignment needed
    let new_cells: Vec<crate::models::Cell> = shift_result
        .new_text
        .chars()
        .map(|ch| {
            crate::models::Cell::new(ch.to_string(), crate::models::ElementKind::Unknown)
        })
        .collect();

    doc.lines[line].cells = new_cells;
    doc.lines[line].sync_text_from_cells();

    let result = OctaveShiftResult {
        line,
        start_col,
        end_col,
        shifted_count: shift_result.shifted_count,
        skipped_count: shift_result.skipped_count,
        new_text: shift_result.new_text,
        success: true,
        error: None,
    };

    serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL)
}

/// Set octave for all pitched elements in a selection to an absolute value
///
/// Unlike `shiftOctave` which adds a delta, this sets to a specific octave value.
/// Works at the Cell level, mutating semantics directly.
///
/// ## Arguments
/// - `line`: Line index
/// - `start_col`: Start column (inclusive)
/// - `end_col`: End column (exclusive)
/// - `target_octave`: Absolute octave value (-2, -1, 0, +1, +2)
///
/// ## Returns
/// JSON object with:
/// ```json
/// {
///   "line": 0,
///   "start_col": 0,
///   "end_col": 5,
///   "shifted_count": 3,
///   "success": true
/// }
/// ```
#[wasm_bindgen(js_name = setOctave)]
pub fn set_octave(line: usize, start_col: usize, end_col: usize, target_octave: i8) -> JsValue {
    use crate::structure::operations::set_cells_octave;

    // Lock document
    let mut doc_guard = match lock_document() {
        Ok(guard) => guard,
        Err(e) => {
            let result = OctaveShiftResult {
                line,
                start_col,
                end_col,
                shifted_count: 0,
                skipped_count: 0,
                new_text: String::new(),
                success: false,
                error: Some(format!("Failed to lock document: {:?}", e)),
            };
            return serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL);
        }
    };

    let doc = match doc_guard.as_mut() {
        Some(d) => d,
        None => {
            let result = OctaveShiftResult {
                line,
                start_col,
                end_col,
                shifted_count: 0,
                skipped_count: 0,
                new_text: String::new(),
                success: false,
                error: Some("No document loaded".to_string()),
            };
            return serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL);
        }
    };

    // Check if line exists
    if line >= doc.lines.len() {
        let result = OctaveShiftResult {
            line,
            start_col,
            end_col,
            shifted_count: 0,
            skipped_count: 0,
            new_text: String::new(),
            success: false,
            error: Some(format!("Line {} does not exist", line)),
        };
        return serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL);
    }

    // Set octaves for cells in range
    let count = {
        let cells = &mut doc.lines[line].cells;
        let start = start_col.min(cells.len());
        let end = end_col.min(cells.len());
        set_cells_octave(&mut cells[start..end], target_octave)
    };

    let start = start_col.min(doc.lines[line].cells.len());
    let end = end_col.min(doc.lines[line].cells.len());

    // Regenerate glyphs for the modified cells (octave dots changed!)
    

    // Reconstruct text for result (derived from cells)
    let new_text: String = doc.lines[line].cells.iter().map(|c| c.display_char()).collect();

    let result = OctaveShiftResult {
        line,
        start_col,
        end_col,
        shifted_count: count,
        skipped_count: (end - start) - count,
        new_text,
        success: true,
        error: None,
    };

    serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL)
}

/// Toggle slur on a selection range (WASM-first: decision logic in WASM)
///
/// Cell-first architecture: checks if slur markers exist at the exact range.
/// If start_col has slur_start AND end_col-1 has slur_end, removes them.
/// Otherwise, sets them.
///
/// ## Parameters
/// - `line`: Line number (0-based)
/// - `start_col`: Start of selection (inclusive)
/// - `end_col`: End of selection (exclusive)
///
/// ## Returns
/// JSON object with toggle result and final state
#[wasm_bindgen(js_name = toggleSlur)]
pub fn toggle_slur(line: usize, start_col: usize, end_col: usize) -> JsValue {
    web_sys::console::log_1(&format!("[WASM] toggleSlur called: line={}, start_col={}, end_col={}", line, start_col, end_col).into());

    // Validate input
    if start_col >= end_col {
        web_sys::console::log_1(&"[WASM] ❌ Invalid selection".into());
        let result = SlurResult {
            line,
            start_col,
            end_col,
            slur_count: 0,
            success: false,
            error: Some("Invalid selection: start must be less than end".to_string()),
        };
        return serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL);
    }

    // Lock document
    let mut doc_guard = match lock_document() {
        Ok(guard) => guard,
        Err(e) => {
            web_sys::console::log_1(&format!("[WASM] ❌ Failed to lock document: {:?}", e).into());
            let result = SlurResult {
                line,
                start_col,
                end_col,
                slur_count: 0,
                success: false,
                error: Some(format!("Failed to lock document: {:?}", e)),
            };
            return serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL);
        }
    };

    let document = match doc_guard.as_mut() {
        Some(doc) => doc,
        None => {
            web_sys::console::log_1(&"[WASM] ❌ No document loaded".into());
            let result = SlurResult {
                line,
                start_col,
                end_col,
                slur_count: 0,
                success: false,
                error: Some("No document loaded".to_string()),
            };
            return serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL);
        }
    };

    // Check line exists
    if line >= document.lines.len() {
        let result = SlurResult {
            line,
            start_col,
            end_col,
            slur_count: 0,
            success: false,
            error: Some(format!("Line {} does not exist", line)),
        };
        return serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL);
    }

    let cells_len = document.lines[line].cells.len();
    let end_cell_col = end_col - 1;

    // Validate column bounds
    if start_col >= cells_len || end_cell_col >= cells_len {
        let result = SlurResult {
            line,
            start_col,
            end_col,
            slur_count: 0,
            success: false,
            error: Some(format!("Column out of bounds (line has {} cells)", cells_len)),
        };
        return serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL);
    }

    // Check if exact slur exists by examining cell markers
    let has_start = document.lines[line].cells[start_col].is_slur_start();
    let has_end = document.lines[line].cells[end_cell_col].is_slur_end();
    let has_exact_slur = has_start && has_end;

    web_sys::console::log_1(&format!("[WASM] Exact slur exists: {} (start={}, end={})", has_exact_slur, has_start, has_end).into());

    if has_exact_slur {
        // Remove the slur by clearing markers
        web_sys::console::log_1(&"[WASM] Removing slur (toggle off)".into());
        document.lines[line].cells[start_col].clear_slur();
        document.lines[line].cells[end_cell_col].clear_slur();
        // Also clear any mid markers between them
        for col in (start_col + 1)..end_cell_col {
            document.lines[line].cells[col].clear_slur();
        }
    } else {
        // Add the slur by setting markers
        web_sys::console::log_1(&"[WASM] Adding slur (toggle on)".into());
        document.lines[line].cells[start_col].set_slur_start();
        document.lines[line].cells[end_cell_col].set_slur_end();
    }

    // Re-normalize to derive slur_mid
    document.compute_line_variants();

    web_sys::console::log_1(&"[WASM] Toggle complete".into());

    let result = SlurResult {
        line,
        start_col,
        end_col,
        slur_count: if has_exact_slur { 0 } else { 1 },
        success: true,
        error: None,
    };

    serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL)
}

/// Apply a slur to a selection range
///
/// Cell-first architecture: slurs are stored as markers directly on cells.
/// - start_col cell gets slur_start (overline Left)
/// - end_col-1 cell gets slur_end (overline Right)
/// - compute_line_variants() derives slur_mid for cells in between
///
/// ## Parameters
/// - `line`: Line number (0-based)
/// - `start_col`: Start of selection (inclusive)
/// - `end_col`: End of selection (exclusive)
///
/// ## Returns
/// JSON object with slur application result:
/// ```json
/// {
///   "line": 0,
///   "start_col": 0,
///   "end_col": 5,
///   "slur_count": 1,
///   "success": true
/// }
/// ```
#[wasm_bindgen(js_name = applySlurLayered)]
pub fn apply_slur_layered(line: usize, start_col: usize, end_col: usize) -> JsValue {
    web_sys::console::log_1(&format!("[WASM] applySlurLayered called: line={}, start_col={}, end_col={}", line, start_col, end_col).into());

    // Validate input
    if start_col >= end_col {
        web_sys::console::log_1(&format!("[WASM] ❌ Invalid selection: start_col={} >= end_col={}", start_col, end_col).into());
        let result = SlurResult {
            line,
            start_col,
            end_col,
            slur_count: 0,
            success: false,
            error: Some("Invalid selection: start must be less than end".to_string()),
        };
        return serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL);
    }

    web_sys::console::log_1(&"[WASM] ✅ Validation passed".into());

    // Lock document
    let mut doc_guard = match lock_document() {
        Ok(guard) => guard,
        Err(e) => {
            web_sys::console::log_1(&format!("[WASM] ❌ Failed to lock document: {:?}", e).into());
            let result = SlurResult {
                line,
                start_col,
                end_col,
                slur_count: 0,
                success: false,
                error: Some(format!("Failed to lock document: {:?}", e)),
            };
            return serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL);
        }
    };

    let document = match doc_guard.as_mut() {
        Some(doc) => {
            web_sys::console::log_1(&"[WASM] ✅ Locked document".into());
            doc
        },
        None => {
            web_sys::console::log_1(&"[WASM] ❌ No document loaded".into());
            let result = SlurResult {
                line,
                start_col,
                end_col,
                slur_count: 0,
                success: false,
                error: Some("No document loaded".to_string()),
            };
            return serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL);
        }
    };

    // Check line exists
    if line >= document.lines.len() {
        web_sys::console::log_1(&format!("[WASM] ❌ Line {} out of bounds", line).into());
        let result = SlurResult {
            line,
            start_col,
            end_col,
            slur_count: 0,
            success: false,
            error: Some(format!("Line {} does not exist", line)),
        };
        return serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL);
    }

    let cells_len = document.lines[line].cells.len();

    // Validate column bounds
    if start_col >= cells_len || end_col > cells_len {
        web_sys::console::log_1(&format!("[WASM] ❌ Column out of bounds: start_col={}, end_col={}, cells_len={}", start_col, end_col, cells_len).into());
        let result = SlurResult {
            line,
            start_col,
            end_col,
            slur_count: 0,
            success: false,
            error: Some(format!("Column out of bounds (line has {} cells)", cells_len)),
        };
        return serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL);
    }

    // Set slur markers directly on cells
    // start_col gets slur_start (overline Left)
    document.lines[line].cells[start_col].set_slur_start();
    web_sys::console::log_1(&format!("[WASM] Set slur_start on col {}", start_col).into());

    // end_col-1 gets slur_end (overline Right) - end_col is exclusive
    let end_cell_col = end_col - 1;
    document.lines[line].cells[end_cell_col].set_slur_end();
    web_sys::console::log_1(&format!("[WASM] Set slur_end on col {}", end_cell_col).into());

    // Derive slur_mid for cells in between via normalization
    document.compute_line_variants();
    web_sys::console::log_1(&"[WASM] ✅ Computed line variants (derived slur_mid)".into());

    // Return success (slur_count=1 since we added one slur)
    let result = SlurResult {
        line,
        start_col,
        end_col,
        slur_count: 1,
        success: true,
        error: None,
    };

    web_sys::console::log_1(&"[WASM] ✅ Slur applied successfully".into());

    serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL)
}

/// Remove slurs overlapping a selection range
///
/// Cell-first architecture: clears slur markers from cells in the range.
/// After clearing, compute_line_variants() re-normalizes any remaining slurs.
///
/// ## Parameters
/// - `line`: Line number (0-based)
/// - `start_col`: Start of selection (inclusive)
/// - `end_col`: End of selection (exclusive)
///
/// ## Returns
/// JSON object with slur removal result:
/// ```json
/// {
///   "line": 0,
///   "start_col": 0,
///   "end_col": 5,
///   "slur_count": 0,
///   "success": true
/// }
/// ```
#[wasm_bindgen(js_name = removeSlurLayered)]
pub fn remove_slur_layered(line: usize, start_col: usize, end_col: usize) -> JsValue {
    #[cfg(target_arch = "wasm32")]
    web_sys::console::log_1(&format!(
        "[WASM] removeSlurLayered called: line={}, start_col={}, end_col={}",
        line, start_col, end_col
    ).into());

    // Lock document
    let mut doc_guard = match lock_document() {
        Ok(guard) => guard,
        Err(e) => {
            let result = SlurResult {
                line,
                start_col,
                end_col,
                slur_count: 0,
                success: false,
                error: Some(format!("Failed to lock document: {:?}", e)),
            };
            return serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL);
        }
    };

    let document = match doc_guard.as_mut() {
        Some(doc) => doc,
        None => {
            let result = SlurResult {
                line,
                start_col,
                end_col,
                slur_count: 0,
                success: false,
                error: Some("No document loaded".to_string()),
            };
            return serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL);
        }
    };

    // Check line exists
    if line >= document.lines.len() {
        let result = SlurResult {
            line,
            start_col,
            end_col,
            slur_count: 0,
            success: false,
            error: Some(format!("Line {} does not exist", line)),
        };
        return serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL);
    }

    let cells_len = document.lines[line].cells.len();
    let actual_end = end_col.min(cells_len);

    #[cfg(target_arch = "wasm32")]
    web_sys::console::log_1(&format!(
        "[WASM] Clearing slur markers from cols {}..{}",
        start_col, actual_end
    ).into());

    // Clear slur markers from all cells in the range
    for col in start_col..actual_end {
        document.lines[line].cells[col].clear_slur();
    }

    // Re-normalize to fix any orphaned slur anchors
    document.compute_line_variants();

    #[cfg(target_arch = "wasm32")]
    web_sys::console::log_1(&"[WASM] ✅ Slur markers cleared and line variants recomputed".into());

    let result = SlurResult {
        line,
        start_col,
        end_col,
        slur_count: 0, // We don't track count in cell-first model
        success: true,
        error: None,
    };

    serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL)
}

//=============================================================================
// SUPERSCRIPT (GRACE NOTE) LAYERED API
//=============================================================================

/// Result of converting selection to superscript (grace notes)
#[derive(Serialize, Deserialize)]
pub struct SuperscriptConversionResult {
    /// Success flag
    pub success: bool,

    /// Number of cells converted
    pub cells_converted: usize,

    /// Error message (if success = false)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Convert selected cells to superscript (grace notes)
///
/// JavaScript: selectionToSuperscript(line, start_col, end_col)
///
/// Converts normal pitch codepoints to their superscript equivalents.
/// Superscript pitches are rhythm-transparent and attach to the previous normal pitch.
///
/// # Arguments
/// * `line` - Line number
/// * `start_col` - Start column (inclusive)
/// * `end_col` - End column (exclusive)
///
/// # Returns
/// JSON result with success flag and count of converted cells
#[wasm_bindgen(js_name = selectionToSuperscript)]
pub fn selection_to_superscript(
    line: usize,
    start_col: usize,
    end_col: usize,
) -> JsValue {
    #[cfg(target_arch = "wasm32")]
    web_sys::console::log_1(&format!(
        "[WASM] selectionToSuperscript: line={}, cols {}..{}",
        line, start_col, end_col
    ).into());

    // Lock document
    let mut doc_guard = match lock_document() {
        Ok(guard) => guard,
        Err(e) => {
            let result = SuperscriptConversionResult {
                success: false,
                cells_converted: 0,
                error: Some(format!("Failed to lock document: {:?}", e)),
            };
            return serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL);
        }
    };

    let document = match doc_guard.as_mut() {
        Some(doc) => doc,
        None => {
            let result = SuperscriptConversionResult {
                success: false,
                cells_converted: 0,
                error: Some("No document loaded".to_string()),
            };
            return serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL);
        }
    };

    // Validate line
    if line >= document.lines.len() {
        let result = SuperscriptConversionResult {
            success: false,
            cells_converted: 0,
            error: Some(format!("Line {} out of range (max {})", line, document.lines.len())),
        };
        return serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL);
    }

    let mut cells_converted = 0;
    let cells_len = document.lines[line].cells.len();

    // Convert cells in range to superscript
    for col in start_col..end_col.min(cells_len) {
        let cell = &mut document.lines[line].cells[col];

        // Convert any codepoint to superscript (no restriction on element kind)
        if !cell.is_superscript() {
            cell.set_superscript(true);
            cells_converted += 1;

            #[cfg(target_arch = "wasm32")]
            web_sys::console::log_1(&format!(
                "[WASM] Set superscript for col {}",
                col
            ).into());
        }
    }


    // Sync text from cells
    document.lines[line].sync_text_from_cells();

    #[cfg(target_arch = "wasm32")]
    web_sys::console::log_1(&format!(
        "[WASM] ✅ Converted {} cells to superscript",
        cells_converted
    ).into());

    let result = SuperscriptConversionResult {
        success: true,
        cells_converted,
        error: None,
    };

    serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL)
}

/// Convert superscript cells back to normal
///
/// JavaScript: superscriptToNormal(line, start_col, end_col)
///
/// # Arguments
/// * `line` - Line number
/// * `start_col` - Start column (inclusive)
/// * `end_col` - End column (exclusive)
#[wasm_bindgen(js_name = superscriptToNormal)]
pub fn superscript_to_normal(
    line: usize,
    start_col: usize,
    end_col: usize,
) -> JsValue {
    #[cfg(target_arch = "wasm32")]
    web_sys::console::log_1(&format!(
        "[WASM] superscriptToNormal: line={}, cols {}..{}",
        line, start_col, end_col
    ).into());

    // Lock document
    let mut doc_guard = match lock_document() {
        Ok(guard) => guard,
        Err(e) => {
            let result = SuperscriptConversionResult {
                success: false,
                cells_converted: 0,
                error: Some(format!("Failed to lock document: {:?}", e)),
            };
            return serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL);
        }
    };

    let document = match doc_guard.as_mut() {
        Some(doc) => doc,
        None => {
            let result = SuperscriptConversionResult {
                success: false,
                cells_converted: 0,
                error: Some("No document loaded".to_string()),
            };
            return serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL);
        }
    };

    // Validate line
    if line >= document.lines.len() {
        let result = SuperscriptConversionResult {
            success: false,
            cells_converted: 0,
            error: Some(format!("Line {} out of range (max {})", line, document.lines.len())),
        };
        return serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL);
    }

    let mut cells_converted = 0;
    let cells_len = document.lines[line].cells.len();

    // Convert cells in range by clearing superscript flag
    for col in start_col..end_col.min(cells_len) {
        let cell = &mut document.lines[line].cells[col];

        // Clear superscript via codepoint conversion
        if cell.is_superscript() {
            cell.set_superscript(false);
            cells_converted += 1;

            #[cfg(target_arch = "wasm32")]
            web_sys::console::log_1(&format!(
                "[WASM] Cleared superscript for col {}",
                col
            ).into());
        }
    }

    // Recompute glyphs to apply normal rendering
    

    // Sync text from cells
    document.lines[line].sync_text_from_cells();

    #[cfg(target_arch = "wasm32")]
    web_sys::console::log_1(&format!(
        "[WASM] ✅ Reverted {} cells from superscript to normal",
        cells_converted
    ).into());

    let result = SuperscriptConversionResult {
        success: true,
        cells_converted,
        error: None,
    };

    serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL)
}

#[cfg(all(test, target_arch = "wasm32"))]
mod tests {
    use super::*;
    use crate::models::{Document, Line, Cell, ElementKind};

    fn setup_test_document(text: &str) {
        use crate::models::PitchCode;
        use crate::renderers::font_utils::glyph_for_pitch;
        use crate::models::elements::PitchSystem;

        // Create cells from text for testing
        // kind and pitch_code are derived from codepoint via getters
        let cells: Vec<Cell> = text
            .chars()
            .enumerate()
            .map(|(col, ch)| {
                // For number pitches (1-7), use proper pitch codepoints
                if ('1'..='7').contains(&ch) {
                    let pitch_code = match ch {
                        '1' => PitchCode::N1,
                        '2' => PitchCode::N2,
                        '3' => PitchCode::N3,
                        '4' => PitchCode::N4,
                        '5' => PitchCode::N5,
                        '6' => PitchCode::N6,
                        '7' => PitchCode::N7,
                        _ => unreachable!(),
                    };
                    if let Some(glyph) = glyph_for_pitch(pitch_code, 0, PitchSystem::Number) {
                        return Cell::from_codepoint(glyph as u32, ElementKind::PitchedElement);
                    }
                }
                Cell::new(ch.to_string(), ElementKind::Unknown)
            })
            .collect();

        let mut line = Line::new();
        line.cells = cells;
        line.sync_text_from_cells();

        let mut doc = Document::new();
        doc.title = Some("Test".to_string());
        doc.lines = vec![line];

        let mut guard = lock_document().unwrap();
        *guard = Some(doc);
    }

    #[test]
    fn test_select_whole_beat_simple() {
        setup_test_document("1 2 3");

        // Select beat at position 0 (should select "1")
        let result = select_whole_beat(0, 0);
        let result: BeatSelectionResult = serde_wasm_bindgen::from_value(result).unwrap();

        assert!(result.success);
        assert_eq!(result.start_col, 0);
        assert_eq!(result.end_col, 1);
        assert_eq!(result.text, "1");
    }

    #[test]
    fn test_select_whole_beat_middle() {
        setup_test_document("1 2 3");

        // Select beat at position 2 (should select "2")
        let result = select_whole_beat(0, 2);
        let result: BeatSelectionResult = serde_wasm_bindgen::from_value(result).unwrap();

        assert!(result.success);
        assert_eq!(result.start_col, 2);
        assert_eq!(result.end_col, 3);
        assert_eq!(result.text, "2");
    }

    #[test]
    fn test_select_whole_beat_multi_token() {
        setup_test_document("1-- 2");

        // Select beat at position 1 (should select entire "1--")
        let result = select_whole_beat(0, 1);
        let result: BeatSelectionResult = serde_wasm_bindgen::from_value(result).unwrap();

        assert!(result.success);
        assert_eq!(result.start_col, 0);
        assert_eq!(result.end_col, 3);
        assert_eq!(result.text, "1--");
    }

    #[test]
    fn test_select_beat_in_space() {
        setup_test_document("1 2 3");

        // Select at space (position 1) - should return error
        let result = select_whole_beat(0, 1);
        let result: BeatSelectionResult = serde_wasm_bindgen::from_value(result).unwrap();

        assert!(!result.success);
        assert!(result.error.is_some());
    }
}
