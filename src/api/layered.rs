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
use crate::text::annotations::{SlurSpan, OrnamentPlacement};
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
    doc.compute_glyphs();

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
/// This function converts SlurSpan annotations to SlurIndicator flags on cells,
/// allowing the existing export pipeline to work with layered architecture slurs.
///
/// ## How it works
/// - Reads slurs from document.annotation_layer
/// - For each slur, sets SlurStart on the cell at slur.start
/// - Sets SlurEnd on the cell at slur.end
/// - Cells between start and end don't get markers (they're implicitly slurred)
///
/// ## Returns
/// JSON object with the number of slurs applied per line
#[wasm_bindgen(js_name = applyAnnotationSlursToCells)]
pub fn apply_annotation_slurs_to_cells() -> JsValue {
    use crate::models::SlurIndicator;

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
            cell.slur_indicator = SlurIndicator::None;
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
            line.cells[slur.start.col].slur_indicator = SlurIndicator::SlurStart;
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
            line.cells[end_col].slur_indicator = SlurIndicator::SlurEnd;
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

    serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL)
}

//=============================================================================
// ORNAMENT LAYERED API
//=============================================================================

/// Result of ornament apply/remove operation (returned to JavaScript)
#[derive(Serialize, Deserialize)]
pub struct OrnamentResult {
    /// Line number
    pub line: usize,

    /// Column position
    pub col: usize,

    /// Ornament notation text (if applied)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notation: Option<String>,

    /// Ornament placement (if applied)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub placement: Option<String>,

    /// Success flag
    pub success: bool,

    /// Error message (if success = false)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Apply ornament at a position using text notation
///
/// JavaScript: applyOrnamentLayered(line, col, notation, placement)
///
/// - `line`: Line number
/// - `col`: Column position
/// - `notation`: Text notation (e.g., "2 3" or "2̇")
/// - `placement`: "before", "after", or "ontop"
///
/// Stores ornament in annotation layer at TextPos(line, col)
#[wasm_bindgen(js_name = applyOrnamentLayered)]
pub fn apply_ornament_layered(
    line: usize,
    col: usize,
    notation: String,
    placement: String,
) -> JsValue {
    #[cfg(target_arch = "wasm32")]
    web_sys::console::log_1(&format!(
        "[WASM] applyOrnamentLayered: line={}, col={}, notation='{}', placement='{}'",
        line, col, notation, placement
    ).into());

    // Parse placement string
    let ornament_placement = match placement.to_lowercase().as_str() {
        "before" => OrnamentPlacement::Before,
        "after" => OrnamentPlacement::After,
        "ontop" | "on-top" | "on_top" => OrnamentPlacement::OnTop,
        _ => {
            let result = OrnamentResult {
                line,
                col,
                notation: None,
                placement: None,
                success: false,
                error: Some(format!("Invalid placement: '{}'. Must be 'before', 'after', or 'ontop'", placement)),
            };
            return serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL);
        }
    };

    // Lock document
    let mut doc_guard = match lock_document() {
        Ok(guard) => guard,
        Err(e) => {
            let result = OrnamentResult {
                line,
                col,
                notation: None,
                placement: None,
                success: false,
                error: Some(format!("Failed to lock document: {:?}", e)),
            };
            return serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL);
        }
    };

    let document = match doc_guard.as_mut() {
        Some(doc) => doc,
        None => {
            let result = OrnamentResult {
                line,
                col,
                notation: None,
                placement: None,
                success: false,
                error: Some("No document loaded".to_string()),
            };
            return serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL);
        }
    };

    // Add ornament to annotation layer
    document.annotation_layer.add_ornament(
        TextPos::new(line, col),
        notation.clone(),
        ornament_placement.clone(),
    );

    #[cfg(target_arch = "wasm32")]
    web_sys::console::log_1(&format!(
        "[WASM] ✅ Ornament applied: line={}, col={}, notation='{}', placement='{:?}'",
        line, col, notation, ornament_placement
    ).into());

    let result = OrnamentResult {
        line,
        col,
        notation: Some(notation),
        placement: Some(format!("{:?}", ornament_placement).to_lowercase()),
        success: true,
        error: None,
    };

    serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL)
}

/// Remove ornament at a position
///
/// JavaScript: removeOrnamentLayered(line, col)
///
/// Returns true if an ornament was removed, false if none existed
#[wasm_bindgen(js_name = removeOrnamentLayered)]
pub fn remove_ornament_layered(line: usize, col: usize) -> JsValue {
    #[cfg(target_arch = "wasm32")]
    web_sys::console::log_1(&format!(
        "[WASM] removeOrnamentLayered: line={}, col={}",
        line, col
    ).into());

    // Lock document
    let mut doc_guard = match lock_document() {
        Ok(guard) => guard,
        Err(e) => {
            let result = OrnamentResult {
                line,
                col,
                notation: None,
                placement: None,
                success: false,
                error: Some(format!("Failed to lock document: {:?}", e)),
            };
            return serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL);
        }
    };

    let document = match doc_guard.as_mut() {
        Some(doc) => doc,
        None => {
            let result = OrnamentResult {
                line,
                col,
                notation: None,
                placement: None,
                success: false,
                error: Some("No document loaded".to_string()),
            };
            return serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL);
        }
    };

    // Remove ornament from annotation layer
    let was_removed = document.annotation_layer.remove_ornament(TextPos::new(line, col));

    #[cfg(target_arch = "wasm32")]
    web_sys::console::log_1(&format!(
        "[WASM] {} Ornament removed: {}",
        if was_removed { "✅" } else { "⚠️" },
        was_removed
    ).into());

    let result = OrnamentResult {
        line,
        col,
        notation: None,
        placement: None,
        success: was_removed,
        error: if !was_removed {
            Some("No ornament found at position".to_string())
        } else {
            None
        },
    };

    serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL)
}

/// Get ornament at a position
///
/// JavaScript: getOrnamentAt(line, col)
///
/// Returns ornament data if exists, null otherwise
#[wasm_bindgen(js_name = getOrnamentAt)]
pub fn get_ornament_at(line: usize, col: usize) -> JsValue {
    // Lock document
    let doc_guard = match lock_document() {
        Ok(guard) => guard,
        Err(_) => return JsValue::NULL,
    };

    let document = match doc_guard.as_ref() {
        Some(doc) => doc,
        None => return JsValue::NULL,
    };

    // Get ornament from annotation layer
    match document.annotation_layer.get_ornament(TextPos::new(line, col)) {
        Some(ornament_data) => {
            #[derive(Serialize)]
            struct OrnamentDataResult {
                notation: String,
                placement: String,
            }

            let result = OrnamentDataResult {
                notation: ornament_data.notation.clone(),
                placement: format!("{:?}", ornament_data.placement).to_lowercase(),
            };

            serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL)
        }
        None => JsValue::NULL,
    }
}

/// Get all ornaments on a line
///
/// JavaScript: getOrnamentsForLine(line)
///
/// Returns array of ornaments with positions
#[wasm_bindgen(js_name = getOrnamentsForLine)]
pub fn get_ornaments_for_line(line: usize) -> JsValue {
    // Lock document
    let doc_guard = match lock_document() {
        Ok(guard) => guard,
        Err(_) => return serde_wasm_bindgen::to_value(&Vec::<()>::new()).unwrap_or(JsValue::NULL),
    };

    let document = match doc_guard.as_ref() {
        Some(doc) => doc,
        None => return serde_wasm_bindgen::to_value(&Vec::<()>::new()).unwrap_or(JsValue::NULL),
    };

    // Get ornaments for line
    let ornaments = document.annotation_layer.get_ornaments_for_line(line);

    #[derive(Serialize)]
    struct OrnamentPositionResult {
        col: usize,
        notation: String,
        placement: String,
    }

    let results: Vec<OrnamentPositionResult> = ornaments
        .iter()
        .map(|(pos, data)| OrnamentPositionResult {
            col: pos.col,
            notation: data.notation.clone(),
            placement: format!("{:?}", data.placement).to_lowercase(),
        })
        .collect();

    serde_wasm_bindgen::to_value(&results).unwrap_or(JsValue::NULL)
}

/// Sync ornaments from annotation layer to cells (for export/rendering)
///
/// JavaScript: applyAnnotationOrnamentsToCells()
///
/// Reads ornaments from annotation layer, parses notation text into cells,
/// and attaches them to target cells as Ornament objects.
/// This function is called before export and rendering.
#[wasm_bindgen(js_name = applyAnnotationOrnamentsToCells)]
pub fn apply_annotation_ornaments_to_cells() -> JsValue {
    use crate::models::elements::{Ornament, OrnamentPlacement as ModelOrnamentPlacement};
    use crate::models::{Cell, ElementKind};

    #[cfg(target_arch = "wasm32")]
    web_sys::console::log_1(&"[applyAnnotationOrnamentsToCells] Starting sync...".into());

    // Lock document
    let mut doc_guard = match lock_document() {
        Ok(guard) => guard,
        Err(e) => {
            #[cfg(target_arch = "wasm32")]
            web_sys::console::log_1(&format!("[applyAnnotationOrnamentsToCells] Failed to lock document: {:?}", e).into());

            #[derive(Serialize)]
            struct ErrorResult {
                success: bool,
                error: String,
            }
            let result = ErrorResult {
                success: false,
                error: format!("Failed to lock document: {:?}", e),
            };
            return serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL);
        }
    };

    let doc = match doc_guard.as_mut() {
        Some(d) => d,
        None => {
            #[cfg(target_arch = "wasm32")]
            web_sys::console::log_1(&"[applyAnnotationOrnamentsToCells] No document loaded".into());

            #[derive(Serialize)]
            struct ErrorResult {
                success: bool,
                error: String,
            }
            let result = ErrorResult {
                success: false,
                error: "No document loaded".to_string(),
            };
            return serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL);
        }
    };

    let total_ornaments = doc.annotation_layer.ornaments.len();
    let mut ornaments_applied = 0;

    #[cfg(target_arch = "wasm32")]
    web_sys::console::log_1(&format!(
        "[applyAnnotationOrnamentsToCells] Found {} ornaments in annotation layer",
        total_ornaments
    ).into());

    // First, clear all existing ornaments from cells
    for line in &mut doc.lines {
        for cell in &mut line.cells {
            cell.ornament = None;
        }
    }

    // Iterate through ornaments and attach to cells
    for (pos, ornament_data) in doc.annotation_layer.ornaments.iter() {
        // Check if line exists
        if pos.line >= doc.lines.len() {
            #[cfg(target_arch = "wasm32")]
            web_sys::console::log_1(&format!(
                "[applyAnnotationOrnamentsToCells] Ornament at line {} out of bounds (doc has {} lines)",
                pos.line, doc.lines.len()
            ).into());
            continue;
        }

        let line = &mut doc.lines[pos.line];

        // Check if column exists
        if pos.col >= line.cells.len() {
            #[cfg(target_arch = "wasm32")]
            web_sys::console::log_1(&format!(
                "[applyAnnotationOrnamentsToCells] Ornament at col {} out of bounds (line has {} cells)",
                pos.col, line.cells.len()
            ).into());
            continue;
        }

        // Parse notation text into cells
        // Simple character-by-character conversion (same as paste_ornament in core.rs)
        let parsed_cells: Vec<Cell> = ornament_data.notation.chars()
            .enumerate()
            .map(|(idx, ch)| Cell::new(ch.to_string(), ElementKind::PitchedElement, idx))
            .collect();

        if parsed_cells.is_empty() {
            #[cfg(target_arch = "wasm32")]
            web_sys::console::log_1(&format!(
                "[applyAnnotationOrnamentsToCells] Empty notation text for ornament at line={}, col={}",
                pos.line, pos.col
            ).into());
            continue;
        }

        // Convert placement
        let model_placement = match ornament_data.placement {
            OrnamentPlacement::Before => ModelOrnamentPlacement::Before,
            OrnamentPlacement::After => ModelOrnamentPlacement::After,
            OrnamentPlacement::OnTop => ModelOrnamentPlacement::After, // OnTop maps to After for now
        };

        // Create ornament and attach to cell
        let ornament = Ornament {
            cells: parsed_cells,
            placement: model_placement,
        };

        line.cells[pos.col].ornament = Some(ornament);
        ornaments_applied += 1;

        #[cfg(target_arch = "wasm32")]
        web_sys::console::log_1(&format!(
            "[applyAnnotationOrnamentsToCells] Applied ornament at line={}, col={}, notation='{}'",
            pos.line, pos.col, ornament_data.notation
        ).into());
    }

    #[cfg(target_arch = "wasm32")]
    web_sys::console::log_1(&format!(
        "[applyAnnotationOrnamentsToCells] Applied {} of {} ornaments to cells",
        ornaments_applied, total_ornaments
    ).into());

    // Return success
    #[derive(Serialize)]
    struct ApplyOrnamentsResult {
        success: bool,
        ornaments_applied: usize,
        total_ornaments: usize,
    }

    let result = ApplyOrnamentsResult {
        success: true,
        ornaments_applied,
        total_ornaments,
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
