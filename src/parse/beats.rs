//! Beat derivation algorithms
//!
//! This module provides beat derivation algorithms using
//! the extract_implicit_beats method.

use serde::{Serialize, Deserialize};
use wasm_bindgen::prelude::*;
use crate::models::*;

/// Beat deriver for calculating implicit beats from Cell arrays
#[wasm_bindgen]
pub struct BeatDeriver {
    config: BeatConfig,
}

#[wasm_bindgen]
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct BeatConfig {
    pub draw_single_cell_loops: bool,
    pub breath_ends_beat: bool,
    pub loop_offset_px: f32,
    pub loop_height_px: f32,
}

#[wasm_bindgen]
impl BeatDeriver {
    /// Create a new beat deriver with default configuration
    #[wasm_bindgen(constructor)]
    pub fn new() -> BeatDeriver {
        BeatDeriver {
            config: BeatConfig {
                draw_single_cell_loops: false,
                breath_ends_beat: false,
                loop_offset_px: 20.0,
                loop_height_px: 6.0,
            },
        }
    }

    /// Derive implicit beats from Cell array
    #[wasm_bindgen(js_name = deriveImplicitBeats)]
    pub fn derive_implicit_beats(&self, char_cells: &JsValue) -> Result<JsValue, JsValue> {
        let cells: Vec<Cell> = serde_wasm_bindgen::from_value(char_cells.clone())
            .map_err(|e| JsValue::from_str(&format!("Deserialization error: {}", e)))?;

        let beats = self.extract_implicit_beats(&cells);
        serde_wasm_bindgen::to_value(&beats)
            .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
    }

    /// Update beat configuration
    #[wasm_bindgen(js_name = updateConfig)]
    pub fn update_config(&mut self, draw_single_cell_loops: bool, breath_ends_beat: bool) {
        self.config.draw_single_cell_loops = draw_single_cell_loops;
        self.config.breath_ends_beat = breath_ends_beat;
    }

    /// Get beat configuration
    #[wasm_bindgen(js_name = getConfig)]
    pub fn get_config(&self) -> JsValue {
        serde_wasm_bindgen::to_value(&self.config).unwrap_or(JsValue::NULL)
    }
}

impl BeatDeriver {
    /// Extract implicit beats from cells based on line grammar rules
    /// Grammar: beat-element = pitched-element | unpitched-element | breath-mark
    /// Beats are separated by anything that is NOT a beat-element (whitespace, text, barline, etc.)
    /// Note: Rhythm-transparent cells (ornaments) are skipped - they don't count toward beats
    pub fn extract_implicit_beats(&self, cells: &[Cell]) -> Vec<BeatSpan> {
        let mut beats = Vec::new();
        let mut beat_start = None;
        let mut beat_end = None; // Track actual last beat-element cell
        let mut current_duration = 1.0;

        for (index, cell) in cells.iter().enumerate() {
            // Check if this cell is a beat element
            let is_beat = self.is_beat_element(cell);

            if is_beat {
                // This cell is part of a beat
                if beat_start.is_none() {
                    beat_start = Some(index);
                }
                beat_end = Some(index); // Track the actual end position
            } else {
                // This cell is NOT a beat-element (separator: whitespace, text, barline, etc.)
                // End current beat if one is active
                if let Some(start) = beat_start {
                    if let Some(end) = beat_end {
                        beats.push(BeatSpan::new(start, end, current_duration));
                    }
                    beat_start = None;
                    beat_end = None;
                    current_duration = 1.0;
                }
            }
        }

        // Handle trailing beat
        if let Some(start) = beat_start {
            if let Some(end) = beat_end {
                beats.push(BeatSpan::new(start, end, current_duration));
            }
        }

        beats
    }

    /// Check if element is a beat-element per grammar
    /// beat-element = pitched-element | unpitched-element | breath-mark
    /// Note: Whitespace acts as a beat DELIMITER, not a beat element
    fn is_beat_element(&self, cell: &Cell) -> bool {
        matches!(
            cell.kind,
            ElementKind::PitchedElement
            | ElementKind::UnpitchedElement
            | ElementKind::BreathMark
        )
    }
}

impl Default for BeatConfig {
    fn default() -> Self {
        Self {
            draw_single_cell_loops: false,
            breath_ends_beat: false,
            loop_offset_px: 20.0,
            loop_height_px: 6.0,
        }
    }
}

impl Default for BeatDeriver {
    fn default() -> Self {
        Self::new()
    }
}