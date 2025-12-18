//! Patch-based text buffer API
//!
//! This module provides a patch-based API for text editing where:
//! - JS owns the text buffer (source of truth)
//! - WASM returns patches (start, end, replacement) for mutations
//! - Supports full Unicode via u32 codepoints
//! - Uses recursive descent parser for combining chars

use wasm_bindgen::prelude::*;
use serde::{Serialize, Deserialize};
use crate::parse::codepoint_parser::{parse_codepoint, try_combine_codepoints};

/// A patch representing a text mutation
///
/// Patches describe a range to replace and the replacement codepoints.
/// This allows JS to apply changes without WASM owning the buffer.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Patch {
    /// Start of range to replace (codepoint index, inclusive)
    pub start_cp: usize,
    /// End of range to replace (codepoint index, exclusive)
    pub end_cp: usize,
    /// Replacement codepoints
    pub replacement: Vec<u32>,
    /// New cursor position after applying patch
    pub new_cursor_cp: usize,
}

impl Patch {
    /// Create a simple insert patch (no deletion)
    pub fn insert(at: usize, codepoints: Vec<u32>) -> Self {
        let len = codepoints.len();
        Patch {
            start_cp: at,
            end_cp: at,
            replacement: codepoints,
            new_cursor_cp: at + len,
        }
    }

    /// Create a delete patch (no insertion)
    pub fn delete(start: usize, end: usize) -> Self {
        Patch {
            start_cp: start,
            end_cp: end,
            replacement: vec![],
            new_cursor_cp: start,
        }
    }

    /// Create a replace patch
    pub fn replace(start: usize, end: usize, codepoints: Vec<u32>) -> Self {
        let len = codepoints.len();
        Patch {
            start_cp: start,
            end_cp: end,
            replacement: codepoints,
            new_cursor_cp: start + len,
        }
    }

    /// Compute the inverse patch (for undo)
    /// Requires the original codepoints that were replaced
    pub fn inverse(&self, replaced_cps: Vec<u32>) -> Self {
        let new_cursor = self.start_cp + replaced_cps.len();
        Patch {
            start_cp: self.start_cp,
            end_cp: self.start_cp + self.replacement.len(),
            replacement: replaced_cps,
            new_cursor_cp: new_cursor,
        }
    }
}

/// Insert codepoints at selection, returns patch
///
/// Uses recursive descent parser for:
/// 1. Combining chars (|:, :#, 1#, 2b, etc.)
/// 2. Normalizing special chars (| → BARLINE_SINGLE)
#[wasm_bindgen(js_name = insertCps)]
pub fn insert_cps(
    codepoints: &[u32],
    sel_start_cp: usize,
    sel_end_cp: usize,
    inserted_cps: &[u32],
) -> Result<JsValue, JsValue> {
    // Validate indices
    let len = codepoints.len();
    if sel_start_cp > len || sel_end_cp > len || sel_start_cp > sel_end_cp {
        return Err(JsValue::from_str(&format!(
            "Invalid selection: start={}, end={}, len={}",
            sel_start_cp, sel_end_cp, len
        )));
    }

    // Try combining with previous character (recursive descent)
    if inserted_cps.len() == 1 && sel_start_cp == sel_end_cp && sel_start_cp > 0 {
        let inserted = inserted_cps[0];
        let prev_cp = codepoints[sel_start_cp - 1];

        // Use parser's try_combine_codepoints
        if let Some(combined_cp) = try_combine_codepoints(prev_cp, inserted) {
            let patch = Patch::replace(
                sel_start_cp - 1,
                sel_start_cp,
                vec![combined_cp],
            );
            return serde_wasm_bindgen::to_value(&patch)
                .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)));
        }
    }

    // Parse and normalize each codepoint
    let transformed_cps: Vec<u32> = inserted_cps.iter()
        .map(|&cp| parse_codepoint(cp))
        .collect();

    // Default: simple splice semantics
    let patch = Patch::replace(
        sel_start_cp,
        sel_end_cp,
        transformed_cps,
    );

    serde_wasm_bindgen::to_value(&patch)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}

/// Delete selection, returns patch
#[wasm_bindgen(js_name = deleteRange)]
pub fn delete_range(
    codepoints: &[u32],
    sel_start_cp: usize,
    sel_end_cp: usize,
) -> Result<JsValue, JsValue> {
    let len = codepoints.len();

    // Handle backspace (collapsed selection)
    let (start, end) = if sel_start_cp == sel_end_cp {
        if sel_start_cp == 0 {
            // At beginning, nothing to delete
            return serde_wasm_bindgen::to_value(&Patch {
                start_cp: 0,
                end_cp: 0,
                replacement: vec![],
                new_cursor_cp: 0,
            }).map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)));
        }
        (sel_start_cp - 1, sel_start_cp)
    } else {
        (sel_start_cp, sel_end_cp)
    };

    if start > len || end > len {
        return Err(JsValue::from_str(&format!(
            "Invalid range: start={}, end={}, len={}",
            start, end, len
        )));
    }

    let patch = Patch::delete(start, end);

    serde_wasm_bindgen::to_value(&patch)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}

/// Get simple chars that JS can handle directly (no WASM call needed)
#[wasm_bindgen(js_name = getSimpleChars)]
pub fn get_simple_chars(pitch_system: u8) -> Result<JsValue, JsValue> {
    use crate::models::PitchSystem;

    let system = match pitch_system {
        1 => PitchSystem::Number,
        2 => PitchSystem::Western,
        3 => PitchSystem::Sargam,
        _ => PitchSystem::Number,
    };

    let mut simple: Vec<u32> = vec![
        // Common simple chars
        0x20,   // space
        0x2D,   // - (dash)
        0x27,   // ' (breath mark)
    ];

    // Add pitch chars based on system
    match system {
        PitchSystem::Number => {
            simple.extend([0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37]); // 1234567
        }
        PitchSystem::Western => {
            simple.extend([0x43, 0x44, 0x45, 0x46, 0x47, 0x41, 0x42]); // CDEFGAB
        }
        PitchSystem::Sargam => {
            // S r R g G m M P d D n N
            simple.extend([
                0x53, 0x72, 0x52, 0x67, 0x47, 0x6D, 0x4D, 0x50, 0x64, 0x44, 0x6E, 0x4E
            ]);
        }
        _ => {
            // Default to number system
            simple.extend([0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37]);
        }
    }

    serde_wasm_bindgen::to_value(&simple)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_patch_insert() {
        let patch = Patch::insert(3, vec![0x41, 0x42]); // Insert "AB" at position 3
        assert_eq!(patch.start_cp, 3);
        assert_eq!(patch.end_cp, 3);
        assert_eq!(patch.replacement, vec![0x41, 0x42]);
        assert_eq!(patch.new_cursor_cp, 5);
    }

    #[test]
    fn test_patch_delete() {
        let patch = Patch::delete(2, 5); // Delete positions 2,3,4
        assert_eq!(patch.start_cp, 2);
        assert_eq!(patch.end_cp, 5);
        assert_eq!(patch.replacement, Vec::<u32>::new());
        assert_eq!(patch.new_cursor_cp, 2);
    }

    #[test]
    fn test_patch_replace() {
        let patch = Patch::replace(1, 3, vec![0x58]); // Replace positions 1,2 with "X"
        assert_eq!(patch.start_cp, 1);
        assert_eq!(patch.end_cp, 3);
        assert_eq!(patch.replacement, vec![0x58]);
        assert_eq!(patch.new_cursor_cp, 2);
    }

    #[test]
    fn test_patch_inverse() {
        let patch = Patch::replace(1, 3, vec![0x58, 0x59]); // Replace 2 chars with "XY"
        let inverse = patch.inverse(vec![0x41, 0x42]); // Original was "AB"

        assert_eq!(inverse.start_cp, 1);
        assert_eq!(inverse.end_cp, 3); // 1 + len("XY") = 3
        assert_eq!(inverse.replacement, vec![0x41, 0x42]); // Restore "AB"
        assert_eq!(inverse.new_cursor_cp, 3); // 1 + len("AB") = 3
    }

    #[test]
    fn test_apply_patch_simulation() {
        // Simulate applying a patch to a buffer
        let mut buffer: Vec<u32> = vec![0x31, 0x32, 0x33, 0x34, 0x35]; // "12345"

        let patch = Patch::replace(1, 3, vec![0x41, 0x42, 0x43]); // Replace "23" with "ABC"

        // Apply patch (this is what JS would do)
        let mut new_buffer: Vec<u32> = Vec::new();
        new_buffer.extend_from_slice(&buffer[..patch.start_cp]);
        new_buffer.extend_from_slice(&patch.replacement);
        new_buffer.extend_from_slice(&buffer[patch.end_cp..]);

        assert_eq!(new_buffer, vec![0x31, 0x41, 0x42, 0x43, 0x34, 0x35]); // "1ABC45"
    }

    #[test]
    fn test_insert_at_beginning() {
        let buffer: Vec<u32> = vec![0x31, 0x32, 0x33]; // "123"
        let patch = Patch::insert(0, vec![0x30]); // Insert "0" at start

        let mut new_buffer: Vec<u32> = Vec::new();
        new_buffer.extend_from_slice(&buffer[..patch.start_cp]);
        new_buffer.extend_from_slice(&patch.replacement);
        new_buffer.extend_from_slice(&buffer[patch.end_cp..]);

        assert_eq!(new_buffer, vec![0x30, 0x31, 0x32, 0x33]); // "0123"
    }

    #[test]
    fn test_insert_at_end() {
        let buffer: Vec<u32> = vec![0x31, 0x32, 0x33]; // "123"
        let patch = Patch::insert(3, vec![0x34]); // Insert "4" at end

        let mut new_buffer: Vec<u32> = Vec::new();
        new_buffer.extend_from_slice(&buffer[..patch.start_cp]);
        new_buffer.extend_from_slice(&patch.replacement);
        new_buffer.extend_from_slice(&buffer[patch.end_cp..]);

        assert_eq!(new_buffer, vec![0x31, 0x32, 0x33, 0x34]); // "1234"
    }

    #[test]
    fn test_delete_single_char() {
        let buffer: Vec<u32> = vec![0x31, 0x32, 0x33]; // "123"
        let patch = Patch::delete(1, 2); // Delete "2"

        let mut new_buffer: Vec<u32> = Vec::new();
        new_buffer.extend_from_slice(&buffer[..patch.start_cp]);
        new_buffer.extend_from_slice(&patch.replacement);
        new_buffer.extend_from_slice(&buffer[patch.end_cp..]);

        assert_eq!(new_buffer, vec![0x31, 0x33]); // "13"
    }

    #[test]
    fn test_backspace_collapsed_selection() {
        // Simulate backspace at position 2 (delete char before cursor)
        let buffer: Vec<u32> = vec![0x31, 0x32, 0x33]; // "123"

        // Collapsed selection at position 2
        let sel_start = 2;
        let sel_end = 2;

        // Backspace logic: delete char at sel_start - 1
        let patch = if sel_start == sel_end && sel_start > 0 {
            Patch::delete(sel_start - 1, sel_start)
        } else {
            Patch::delete(sel_start, sel_end)
        };

        let mut new_buffer: Vec<u32> = Vec::new();
        new_buffer.extend_from_slice(&buffer[..patch.start_cp]);
        new_buffer.extend_from_slice(&patch.replacement);
        new_buffer.extend_from_slice(&buffer[patch.end_cp..]);

        assert_eq!(new_buffer, vec![0x31, 0x33]); // "13" - deleted "2"
        assert_eq!(patch.new_cursor_cp, 1); // Cursor at position 1
    }

    // ===== Parser integration tests =====
    // Combining logic tests are now in codepoint_parser.rs

    #[test]
    fn test_try_combine_barline_colon() {
        // | + : → repeat left barline
        let result = try_combine_codepoints(0x7C, 0x3A);
        assert!(result.is_some());
        // Should be BARLINE_REPEAT_LEFT (0x1D106)
        assert_eq!(result, Some(0x1D106));
    }

    #[test]
    fn test_parse_pipe_to_barline() {
        // | should become BARLINE_SINGLE
        let result = parse_codepoint(0x7C);
        assert_eq!(result, 0x1D100); // BARLINE_SINGLE
    }
}
