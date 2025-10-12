//! Grapheme cluster handling utilities
//!
//! This module provides utilities for working with Unicode grapheme clusters,
//! which is essential for proper handling of multi-character musical notation tokens.

use wasm_bindgen::prelude::*;
// Note: web_sys doesn't have Intl module, using fallback implementation

/// Grapheme segmenter for handling Unicode grapheme clusters
#[wasm_bindgen]
pub struct GraphemeSegmenter {
    // Using fallback implementation since web_sys doesn't have Intl
}

#[wasm_bindgen]
impl GraphemeSegmenter {
    /// Create a new grapheme segmenter
    #[wasm_bindgen(constructor)]
    pub fn new() -> GraphemeSegmenter {
        GraphemeSegmenter {}
    }

    /// Split text into grapheme clusters
    #[wasm_bindgen(js_name = segmentText)]
    pub fn segment_text(&self, text: &str) -> Result<js_sys::Array, JsValue> {
        // Use fallback implementation
        Ok(self.fallback_segment(text))
    }

    /// Fallback segmentation using character boundaries
    fn fallback_segment(&self, text: &str) -> js_sys::Array {
        let array = js_sys::Array::new();

        // Simple fallback - split by characters
        // This isn't perfect for grapheme clusters but works for basic cases
        let chars: Vec<char> = text.chars().collect();
        let mut i = 0;

        while i < chars.len() {
            // Check for multi-character musical tokens
            if i + 1 < chars.len() {
                let two_char = format!("{}{}", chars[i], chars[i + 1]);

                // Check for accidentals
                if two_char.ends_with('#') || two_char.ends_with('b') {
                    if two_char == "##" || two_char == "bb" {
                        array.push(&JsValue::from_str(&two_char));
                        i += 2;
                        continue;
                    } else if chars[i + 1] == '#' || chars[i + 1] == 'b' {
                        array.push(&JsValue::from_str(&two_char));
                        i += 2;
                        continue;
                    }
                }
            }

            // Single character
            array.push(&JsValue::from_str(&chars[i].to_string()));
            i += 1;
        }

        array
    }

    /// Count grapheme clusters in text
    #[wasm_bindgen(js_name = countGraphemes)]
    pub fn count_graphemes(&self, text: &str) -> Result<usize, JsValue> {
        let segments = self.segment_text(text)?;
        Ok(segments.length() as usize)
    }

    /// Check if a string is a valid grapheme cluster
    #[wasm_bindgen(js_name = isValidGrapheme)]
    pub fn is_valid_grapheme(&self, text: &str) -> Result<bool, JsValue> {
        if text.is_empty() {
            return Ok(false);
        }

        let segments = self.segment_text(text)?;
        Ok(segments.length() == 1)
    }

    /// Get the character at a specific grapheme index
    #[wasm_bindgen(js_name = getGraphemeAt)]
    pub fn get_grapheme_at(&self, text: &str, index: usize) -> Result<String, JsValue> {
        let segments = self.segment_text(text)?;

        if index >= segments.length() as usize {
            return Err(JsValue::from_str("Index out of bounds"));
        }

        let segment = segments.get(index as u32);
        match segment.as_string() {
            Some(s) => Ok(s),
            None => Err(JsValue::from_str("Failed to get segment")),
        }
    }
}

impl GraphemeSegmenter {
    /// Rust-native version of grapheme segmentation
    /// Simple character-by-character segmentation
    /// Accidentals will be combined in post-processing
    pub fn segment_text_rust(&self, text: &str) -> Vec<String> {
        text.chars().map(|c| c.to_string()).collect()
    }
}

impl Default for GraphemeSegmenter {
    fn default() -> Self {
        Self::new()
    }
}

/// Utility functions for grapheme handling
pub struct GraphemeUtils;

impl GraphemeUtils {
    /// Check if a character/string is a musical pitched element
    pub fn is_pitched_element(text: &str) -> bool {
        // Simple character-based matching without regex
        let trimmed = text.trim_end_matches('#').trim_end_matches('b');

        // Number system: 1-7
        if trimmed.len() == 1 && "1234567".contains(trimmed) {
            return true;
        }

        // Western system: c-g, a-b, C-G, A-B
        if trimmed.len() == 1 && "cdefgabCDEFGAB".contains(trimmed) {
            return true;
        }

        // Sargam system: S, R, G, M, P, D, N
        if trimmed.len() == 1 && "SRGMDNP".contains(trimmed) {
            return true;
        }

        false
    }

    /// Check if a character/string is a barline
    pub fn is_barline(text: &str) -> bool {
        matches!(text, "|" | "||" | "|:" | ":|")
    }

    /// Check if a character/string is a breath mark
    pub fn is_breath_mark(text: &str) -> bool {
        matches!(text, "," | "'" | "\"")
    }

    /// Check if a character/string is whitespace
    pub fn is_whitespace(text: &str) -> bool {
        text.trim().is_empty()
    }

    /// Identify head markers for multi-character tokens
    pub fn identify_head_markers(text: &str) -> Vec<bool> {
        let segments = GraphemeSegmenter::new().segment_text_rust(text);
        let mut head_markers = vec![true; segments.len()];

        // Mark non-head segments of multi-character tokens
        for i in 0..segments.len() {
            if !head_markers[i] {
                continue;
            }

            let segment = &segments[i];
            if segment.len() > 1 {
                // Multi-character segments are always heads
                continue;
            }

            // Check for multi-character token patterns
            if i + 1 < segments.len() {
                let combined = format!("{}{}", segment, segments[i + 1]);
                if combined.ends_with('#') || combined.ends_with('b') {
                    if combined == "##" || combined == "bb" {
                        // Mark second character as non-head
                        head_markers[i + 1] = false;
                    } else {
                        // Mark second character as non-head
                        head_markers[i + 1] = false;
                    }
                }
            }
        }

        head_markers
    }
}