//! Cell parser for converting text to musical notation
//!
//! This module provides the core parsing logic for converting
//! text input into Cell-based musical notation.

use wasm_bindgen::prelude::*;
use crate::models::*;
use crate::utils::grapheme::{GraphemeSegmenter, GraphemeUtils};

/// Cell parser for musical notation text
#[wasm_bindgen]
pub struct CellParser {
    segmenter: GraphemeSegmenter,
}

#[wasm_bindgen]
impl CellParser {
    /// Create a new Cell parser
    #[wasm_bindgen(constructor)]
    pub fn new() -> CellParser {
        CellParser {
            segmenter: GraphemeSegmenter::new(),
        }
    }

    /// Parse text into Cell array (character-by-character, no eager combination)
    #[wasm_bindgen(js_name = parseToCells)]
    pub fn parse_to_char_cells(&self, text: &str) -> Result<js_sys::Array, JsValue> {
        let segments = self.segmenter.segment_text(text)?;

        let mut char_cells = Vec::new();
        let mut column = 0;

        for segment_result in segments.iter() {
            let segment = segment_result.as_string()
                .ok_or_else(|| JsValue::from_str("Failed to get segment"))?;

            if segment.trim().is_empty() {
                column += 1;
                continue;
            }

            let (kind, pitch_system) = self.identify_element_kind(&segment);
            let mut cell = Cell::new(segment.clone(), kind, column);

            // Set pitch system for pitched elements
            if kind == ElementKind::PitchedElement {
                cell.pitch_system = Some(pitch_system);
                cell.pitch_code = Some(self.canonicalize_pitch(&segment, pitch_system));
            }

            // All cells are heads in character-by-character mode
            cell.set_head(true);

            char_cells.push(cell);
            column += 1;
        }

        // Convert to JavaScript array
        let result = js_sys::Array::new();
        for cell in char_cells {
            let cell_js = serde_wasm_bindgen::to_value(&cell)
                .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))?;
            result.push(&cell_js);
        }

        Ok(result)
    }

    /// Validate musical notation syntax
    #[wasm_bindgen(js_name = validateNotation)]
    pub fn validate_notation(&self, text: &str) -> Result<JsValue, JsValue> {
        let validation_result = self.validate_notation_internal(text);
        serde_wasm_bindgen::to_value(&validation_result)
            .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
    }
}

impl CellParser {
    /// Parse text into Cell array (Rust version, character-by-character)
    pub fn parse_to_char_cells_rust(&self, text: &str) -> Result<Vec<Cell>, String> {
        let segments = self.segmenter.segment_text_rust(text);

        let mut char_cells = Vec::new();
        let mut column = 0;

        for segment in segments.iter() {
            if segment.trim().is_empty() {
                column += 1;
                continue;
            }

            let (kind, pitch_system) = self.identify_element_kind(segment);
            let mut cell = Cell::new(segment.clone(), kind, column);

            // Set pitch system for pitched elements
            if kind == ElementKind::PitchedElement {
                cell.pitch_system = Some(pitch_system);
                cell.pitch_code = Some(self.canonicalize_pitch(segment, pitch_system));
            }

            // All cells are heads in character-by-character mode
            cell.set_head(true);

            char_cells.push(cell);
            column += 1;
        }

        Ok(char_cells)
    }

    /// Identify the element kind and pitch system for a segment
    fn identify_element_kind(&self, segment: &str) -> (ElementKind, PitchSystem) {
        // Check for special elements first
        if GraphemeUtils::is_barline(segment) {
            return (ElementKind::Barline, PitchSystem::Unknown);
        }

        if GraphemeUtils::is_breath_mark(segment) {
            return (ElementKind::BreathMark, PitchSystem::Unknown);
        }

        if GraphemeUtils::is_whitespace(segment) {
            return (ElementKind::Whitespace, PitchSystem::Unknown);
        }

        // Check for pitched elements in different pitch systems
        if self.is_number_system_pitch(segment) {
            return (ElementKind::PitchedElement, PitchSystem::Number);
        }

        if self.is_western_system_pitch(segment) {
            return (ElementKind::PitchedElement, PitchSystem::Western);
        }

        if self.is_sargam_system_pitch(segment) {
            return (ElementKind::PitchedElement, PitchSystem::Sargam);
        }

        // Check for unpitched elements
        if segment == "-" || segment == "_" {
            return (ElementKind::UnpitchedElement, PitchSystem::Unknown);
        }

        // Default to text if it doesn't match any musical pattern
        (ElementKind::Text, PitchSystem::Unknown)
    }

    /// Check if segment is a number system pitch (single character only)
    fn is_number_system_pitch(&self, segment: &str) -> bool {
        matches!(segment, "1" | "2" | "3" | "4" | "5" | "6" | "7")
    }

    /// Check if segment is a western system pitch (single character only)
    fn is_western_system_pitch(&self, segment: &str) -> bool {
        matches!(segment.to_lowercase().as_str(), "c" | "d" | "e" | "f" | "g" | "a" | "b")
    }

    /// Check if segment is a sargam system pitch
    fn is_sargam_system_pitch(&self, segment: &str) -> bool {
        matches!(segment,
               "S" | "r" | "R" | "g" | "G" | "m" | "M" | "P" | "d" | "D" | "n" | "N")
    }

    /// Canonicalize pitch representation (single character only)
    fn canonicalize_pitch(&self, pitch: &str, pitch_system: PitchSystem) -> String {
        match pitch_system {
            PitchSystem::Number => {
                // Single character number pitch
                pitch.to_string()
            },
            PitchSystem::Western => {
                // Convert to lowercase for canonical form
                pitch.to_lowercase()
            },
            PitchSystem::Sargam => {
                // Use uppercase for canonical form
                pitch.to_uppercase()
            },
            _ => pitch.to_string(),
        }
    }

    /// Internal validation function
    fn validate_notation_internal(&self, text: &str) -> ValidationResult {
        let mut errors = Vec::new();
        let mut warnings = Vec::new();

        if text.is_empty() {
            return ValidationResult {
                valid: true,
                errors: Vec::new(),
                warnings: vec!["Empty input".to_string()],
            };
        }

        let segments = self.segmenter.segment_text_rust(text);

        for (index, segment) in segments.iter().enumerate() {
            if segment.trim().is_empty() {
                continue;
            }

            let (kind, _) = self.identify_element_kind(segment);

            match kind {
                ElementKind::Unknown => {
                    errors.push(format!("Invalid musical notation at position {}: '{}'", index, segment));
                },
                ElementKind::Text => {
                    warnings.push(format!("Text token at position {}: '{}'", index, segment));
                },
                _ => {
                    // Valid musical element
                }
            }
        }

        ValidationResult {
            valid: errors.is_empty(),
            errors,
            warnings,
        }
    }
}

/// Result of notation validation
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct ValidationResult {
    pub valid: bool,
    pub errors: Vec<String>,
    pub warnings: Vec<String>,
}

impl Default for CellParser {
    fn default() -> Self {
        Self::new()
    }
}