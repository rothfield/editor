//! Beat derivation algorithms
//!
//! This module provides beat derivation algorithms using
//! the extract_implicit_beats method.

use serde::{Serialize, Deserialize};
use wasm_bindgen::prelude::*;
use crate::models::*;

/// Beat deriver for calculating implicit beats from CharCell arrays
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
                breath_ends_beat: true,
                loop_offset_px: 20.0,
                loop_height_px: 6.0,
            },
        }
    }

    /// Derive implicit beats from CharCell array
    #[wasm_bindgen(js_name = deriveImplicitBeats)]
    pub fn derive_implicit_beats(&self, char_cells: &JsValue) -> Result<JsValue, JsValue> {
        let cells: Vec<CharCell> = serde_wasm_bindgen::from_value(char_cells.clone())
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
    /// Extract implicit beats from temporal cells
    pub fn extract_implicit_beats(&self, cells: &[CharCell]) -> Vec<BeatSpan> {
        let mut beats = Vec::new();
        let mut beat_start = None;
        let mut current_duration = 1.0;

        for (index, cell) in cells.iter().enumerate() {
            if !cell.is_temporal() {
                // End current beat if we hit a non-temporal element
                if let Some(start) = beat_start {
                    beats.push(BeatSpan::new(start, index - 1, current_duration));
                    beat_start = None;
                    current_duration = 1.0;
                }
                continue;
            }

            // Start new beat if needed
            if beat_start.is_none() {
                beat_start = Some(index);
            }

            // Check if this cell ends the beat
            if self.should_end_beat(cell, cells.get(index + 1)) {
                if let Some(start) = beat_start {
                    beats.push(BeatSpan::new(start, index, current_duration));
                    beat_start = None;
                    current_duration = 1.0;
                }
            }
        }

        // Handle trailing beat
        if let Some(start) = beat_start {
            beats.push(BeatSpan::new(start, cells.len() - 1, current_duration));
        }

        beats
    }

    /// Determine if a beat should end at this cell
    fn should_end_beat(&self, current: &CharCell, next: Option<&CharCell>) -> bool {
        // End beat before non-temporal elements
        if let Some(next_cell) = next {
            if !next_cell.is_temporal() {
                return true;
            }
        }

        // End beat at breath marks if configured
        if current.kind == ElementKind::BreathMark && self.config.breath_ends_beat {
            return true;
        }

        // End beat at barlines
        if current.kind == ElementKind::Barline {
            return true;
        }

        false
    }
}

impl Default for BeatConfig {
    fn default() -> Self {
        Self {
            draw_single_cell_loops: false,
            breath_ends_beat: true,
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