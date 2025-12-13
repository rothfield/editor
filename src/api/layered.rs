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
use crate::text::annotations::SlurSpan;
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
    let text: String = cells.iter().map(|c| c.char.as_str()).collect();

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
    let text: String = cells.iter().map(|c| c.char.as_str()).collect();

    // Layer 2: Shift octaves in range
    let range = TextRange::new(TextPos::new(line, start_col), TextPos::new(line, end_col));
    let pitch_system = PitchSystem::Number; // Default system

    let shift_result = shift_octaves_in_range(&text, range, delta, pitch_system);

    // Layer 0: Update document with new text
    // Convert new text back to cells
    let new_cells: Vec<crate::models::Cell> = shift_result
        .new_text
        .chars()
        .enumerate()
        .map(|(col, ch)| {
            let mut cell = crate::models::Cell::new(ch.to_string(), crate::models::ElementKind::Unknown, col);

            // Try to decode as pitch to set kind and pitch_code
            if let Some((pitch_code, octave)) = crate::renderers::font_utils::pitch_from_glyph(ch, pitch_system) {
                cell.kind = crate::models::ElementKind::PitchedElement;
                cell.pitch_code = Some(pitch_code);
                cell.octave = octave;
            }

            cell
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
/// If slur exists at this exact range, removes it. Otherwise, adds it.
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

    // Lock document to access annotation layer
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

    // Check if exact slur exists
    let has_exact_slur = document.annotation_layer.slurs.iter().any(|s|
        s.start.line == line && s.start.col == start_col &&
        s.end.line == line && s.end.col == end_col
    );

    web_sys::console::log_1(&format!("[WASM] Exact slur exists: {}", has_exact_slur).into());

    if has_exact_slur {
        // Remove the exact slur
        web_sys::console::log_1(&"[WASM] Removing slur (toggle off)".into());
        document.annotation_layer.slurs.retain(|s|
            !(s.start.line == line && s.start.col == start_col &&
              s.end.line == line && s.end.col == end_col)
        );
    } else {
        // Add the slur
        web_sys::console::log_1(&"[WASM] Adding slur (toggle on)".into());
        let slur = SlurSpan::new(
            TextPos::new(line, start_col),
            TextPos::new(line, end_col)
        );
        document.annotation_layer.add_slur(slur);
    }

    // Count final slurs on this line
    let slur_count = document.annotation_layer
        .slurs
        .iter()
        .filter(|s| s.start.line == line)
        .count();

    web_sys::console::log_1(&format!("[WASM] Toggle complete: {} slurs on line {}", slur_count, line).into());

    let result = SlurResult {
        line,
        start_col,
        end_col,
        slur_count,
        success: true,
        error: None,
    };

    serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL)
}

/// Apply a slur to a selection range
///
/// This demonstrates the layered architecture for annotations:
///
/// ## Architecture Demo
///
/// - Layer 0: Selection defines text range
/// - Annotation Layer: Add SlurSpan for the range
/// - Automatic tracking: Slur positions update as text changes
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

    // Create slur span
    let start = TextPos::new(line, start_col);
    let end = TextPos::new(line, end_col);
    let slur = SlurSpan::new(start, end);

    web_sys::console::log_1(&format!("[WASM] Created slur span: ({}, {}) to ({}, {})", start.line, start.col, end.line, end.col).into());

    // Add slur to annotation layer
    document.annotation_layer.add_slur(slur);

    web_sys::console::log_1(&format!("[WASM] Added slur to annotation layer (total slurs: {})", document.annotation_layer.slurs.len()).into());

    // Count slurs on this line
    let slur_count = document
        .annotation_layer
        .slurs
        .iter()
        .filter(|s| s.start.line == line)
        .count();

    web_sys::console::log_1(&format!("[WASM] Slurs on line {}: {}", line, slur_count).into());

    let result = SlurResult {
        line,
        start_col,
        end_col,
        slur_count,
        success: true,
        error: None,
    };

    web_sys::console::log_1(&format!("[WASM] Returning success result: slur_count={}", slur_count).into());

    serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL)
}

/// Remove slurs overlapping a selection range
///
/// This demonstrates annotation removal in the layered architecture.
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
    // Lock document to access annotation layer
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

    #[cfg(target_arch = "wasm32")]
    web_sys::console::log_1(&format!(
        "[removeSlurLayered] Before removal: {} slurs on line {}",
        document.annotation_layer.slurs.iter().filter(|s| s.start.line == line).count(),
        line
    ).into());

    // Remove slurs overlapping the selection
    let range = TextRange::new(TextPos::new(line, start_col), TextPos::new(line, end_col));
    #[cfg(target_arch = "wasm32")]
    let before_count = document.annotation_layer.slurs.len();
    document.annotation_layer.slurs.retain(|slur| {
        // Keep slurs that don't overlap with the selection
        let should_keep = !(slur.start.line == line && slur.range().start < range.end && slur.range().end > range.start);

        #[cfg(target_arch = "wasm32")]
        if slur.start.line == line {
            web_sys::console::log_1(&format!(
                "[removeSlurLayered] Slur ({},{}) to ({},{}): {} (range check: start {} < {} end && end {} > {} start)",
                slur.start.line, slur.start.col, slur.end.line, slur.end.col,
                if should_keep { "KEEP" } else { "REMOVE" },
                slur.range().start.col, range.end.col,
                slur.range().end.col, range.start.col
            ).into());
        }

        should_keep
    });
    #[cfg(target_arch = "wasm32")]
    let after_count = document.annotation_layer.slurs.len();

    #[cfg(target_arch = "wasm32")]
    web_sys::console::log_1(&format!(
        "[removeSlurLayered] Removed {} slurs (before: {}, after: {})",
        before_count - after_count, before_count, after_count
    ).into());

    // Count remaining slurs on this line
    let slur_count = document.annotation_layer
        .slurs
        .iter()
        .filter(|s| s.start.line == line)
        .count();

    let result = SlurResult {
        line,
        start_col,
        end_col,
        slur_count,
        success: true,
        error: None,
    };

    serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL)
}

/// Get slurs for a specific line (for debugging/inspection)
///
/// ## Parameters
/// - `line`: Line number (0-based)
///
/// ## Returns
/// JSON array of slurs on this line:
/// ```json
/// [
///   { "start": { "line": 0, "col": 0 }, "end": { "line": 0, "col": 5 } },
///   { "start": { "line": 0, "col": 7 }, "end": { "line": 0, "col": 10 } }
/// ]
/// ```
#[wasm_bindgen(js_name = getSlursForLine)]
pub fn get_slurs_for_line(line: usize) -> JsValue {
    web_sys::console::log_1(&format!("[WASM] getSlursForLine called: line={}", line).into());

    let doc_guard = match lock_document() {
        Ok(guard) => guard,
        Err(e) => {
            web_sys::console::log_1(&format!("[WASM] ❌ Failed to lock document: {:?}", e).into());
            return JsValue::NULL;
        }
    };

    let document = match doc_guard.as_ref() {
        Some(doc) => doc,
        None => {
            web_sys::console::log_1(&"[WASM] ❌ No document loaded".into());
            return JsValue::NULL;
        }
    };

    web_sys::console::log_1(&format!("[WASM] Locked document, total slurs: {}", document.annotation_layer.slurs.len()).into());

    let line_slurs: Vec<&SlurSpan> = document
        .annotation_layer
        .slurs
        .iter()
        .filter(|s| s.start.line == line)
        .collect();

    web_sys::console::log_1(&format!("[WASM] Found {} slurs on line {}", line_slurs.len(), line).into());

    for (i, slur) in line_slurs.iter().enumerate() {
        web_sys::console::log_1(&format!("[WASM]   Slur {}: ({}, {}) to ({}, {})", i, slur.start.line, slur.start.col, slur.end.line, slur.end.col).into());
    }

    serde_wasm_bindgen::to_value(&line_slurs).unwrap_or(JsValue::NULL)
}

/// Apply annotation layer slurs to document cells for export
///
/// This function converts SlurSpan annotations to slur markers on cells,
/// allowing the existing export pipeline to work with layered architecture slurs.
///
/// ## How it works
/// - Reads slurs from document.annotation_layer
/// - For each slur, sets slur_start on the cell at slur.start
/// - Sets slur_end on the cell at slur.end
/// - Cells between start and end don't get markers (they're implicitly slurred)
///
/// ## Returns
/// JSON object with the number of slurs applied per line
#[wasm_bindgen(js_name = applyAnnotationSlursToCells)]
pub fn apply_annotation_slurs_to_cells() -> JsValue {

    // Lock document
    let mut doc_guard = match lock_document() {
        Ok(guard) => guard,
        Err(e) => {
            log::error!("Failed to lock document: {:?}", e);
            return JsValue::NULL;
        }
    };

    let doc = match doc_guard.as_mut() {
        Some(d) => d,
        None => {
            log::error!("No document loaded");
            return JsValue::NULL;
        }
    };

    // Clear all existing slur indicators from cells (start fresh)
    for line in &mut doc.lines {
        for cell in &mut line.cells {
            cell.clear_slur();
        }
    }

    // Get total slur count before borrowing doc mutably
    let total_slurs = doc.annotation_layer.slurs.len();

    // Apply slurs from annotation layer
    let mut slurs_applied = 0;

    // Clone slurs to avoid borrowing issues
    let slurs_to_apply: Vec<_> = doc.annotation_layer.slurs.clone();

    for slur in &slurs_to_apply {
        let line_idx = slur.start.line;

        if line_idx >= doc.lines.len() {
            log::warn!("Slur references line {} which doesn't exist", line_idx);
            continue;
        }

        let line = &mut doc.lines[line_idx];

        // Set SlurStart on start column
        if slur.start.col < line.cells.len() {
            line.cells[slur.start.col].set_slur_start();
            #[cfg(target_arch = "wasm32")]
            web_sys::console::log_1(&format!(
                "[applyAnnotationSlursToCells] Set SlurStart on line {} col {} (char: '{}')",
                line_idx, slur.start.col, line.cells[slur.start.col].char
            ).into());
        } else {
            log::warn!("Slur start column {} out of bounds on line {}", slur.start.col, line_idx);
            continue;
        }

        // Set SlurEnd on end column (inclusive end)
        // Subtract 1 because TextRange.end is exclusive but slur.end is the last character
        let end_col = if slur.end.col > 0 { slur.end.col - 1 } else { 0 };
        if end_col < line.cells.len() {
            line.cells[end_col].set_slur_end();
            slurs_applied += 1;
            #[cfg(target_arch = "wasm32")]
            web_sys::console::log_1(&format!(
                "[applyAnnotationSlursToCells] Set SlurEnd on line {} col {} (char: '{}')",
                line_idx, end_col, line.cells[end_col].char
            ).into());
        } else {
            log::warn!("Slur end column {} out of bounds on line {}", end_col, line_idx);
        }
    }

    // Return summary
    #[derive(Serialize)]
    struct ApplySlursResult {
        success: bool,
        slurs_applied: usize,
        total_slurs: usize,
    }

    let result = ApplySlursResult {
        success: true,
        slurs_applied,
        total_slurs,
    };

    #[cfg(target_arch = "wasm32")]
    web_sys::console::log_1(&format!(
        "[applyAnnotationSlursToCells] Applied {} of {} slurs to cells",
        slurs_applied, total_slurs
    ).into());

    // Recompute line variants now that slur indicators are set
    // This encodes overlines into cell.char for font-based rendering
    doc.compute_line_variants();

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

        // Only convert pitched elements
        if cell.kind != crate::models::ElementKind::PitchedElement {
            continue;
        }

        // Set superscript flag and update codepoint
        if !cell.superscript {
            cell.superscript = true;

            // Convert codepoint to superscript variant
            if let Some(super_cp) = crate::renderers::font_utils::to_superscript(cell.codepoint) {
                cell.codepoint = super_cp;
                cell.char = char::from_u32(super_cp).map(|c| c.to_string()).unwrap_or(cell.char.clone());
            }

            cells_converted += 1;

            #[cfg(target_arch = "wasm32")]
            web_sys::console::log_1(&format!(
                "[WASM] Set superscript=true for col {}",
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

        // Clear superscript flag if set
        if cell.superscript {
            cell.superscript = false;
            cells_converted += 1;

            #[cfg(target_arch = "wasm32")]
            web_sys::console::log_1(&format!(
                "[WASM] Set superscript=false for col {}",
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
        // Create cells from text for testing
        let cells: Vec<Cell> = text
            .chars()
            .enumerate()
            .map(|(col, ch)| {
                let mut cell = Cell::new(ch.to_string(), ElementKind::Unknown, col);
                // Set pitch code for numbers
                if ('1'..='7').contains(&ch) {
                    cell.kind = ElementKind::PitchedElement;
                    cell.pitch_code = Some(match ch {
                        '1' => crate::models::PitchCode::N1,
                        '2' => crate::models::PitchCode::N2,
                        '3' => crate::models::PitchCode::N3,
                        '4' => crate::models::PitchCode::N4,
                        '5' => crate::models::PitchCode::N5,
                        '6' => crate::models::PitchCode::N6,
                        '7' => crate::models::PitchCode::N7,
                        _ => unreachable!(),
                    });
                }
                cell
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
