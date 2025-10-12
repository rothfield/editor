//! Layout calculation engine for Cell rendering
//!
//! This module provides position calculation and layout algorithms
//! for rendering Cell elements in the correct positions.

use wasm_bindgen::prelude::*;
use crate::models::*;

/// Layout renderer for calculating Cell positions
#[wasm_bindgen]
pub struct LayoutRenderer {
    font_size: f32,
    char_width: f32,
    line_height: f32,
}

#[wasm_bindgen]
impl LayoutRenderer {
    /// Create a new layout renderer
    #[wasm_bindgen(constructor)]
    pub fn new(font_size: f32) -> LayoutRenderer {
        LayoutRenderer {
            font_size,
            char_width: font_size * 0.6,  // Approximate character width
            line_height: font_size * 1.2, // Line height with spacing
        }
    }

    /// Calculate positions for Cell array
    #[wasm_bindgen(js_name = calculatePositions)]
    pub fn calculate_positions(&self, char_cells: &JsValue, lane: u8) -> Result<JsValue, JsValue> {
        let cells: Vec<Cell> = serde_wasm_bindgen::from_value(char_cells.clone())
            .map_err(|e| JsValue::from_str(&format!("Deserialization error: {}", e)))?;

        let lane_kind = LaneKind::try_from(lane)
            .map_err(|_| JsValue::from_str("Invalid lane"))?;

        let mut positioned_cells = Vec::new();

        for (index, mut cell) in cells.into_iter().enumerate() {
            let x = index as f32 * self.char_width;
            let y = lane_kind.baseline(0.0, self.font_size);

            cell.update_layout(x, y, self.char_width, self.font_size);
            positioned_cells.push(cell);
        }

        serde_wasm_bindgen::to_value(&positioned_cells)
            .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
    }

    /// Calculate beat loop positions
    #[wasm_bindgen(js_name = calculateBeatLoopPositions)]
    pub fn calculate_beat_loop_positions(&self, beats: &JsValue, char_cells: &JsValue) -> Result<JsValue, JsValue> {
        let beat_spans: Vec<BeatSpan> = serde_wasm_bindgen::from_value(beats.clone())
            .map_err(|e| JsValue::from_str(&format!("Deserialization error: {}", e)))?;

        let cells: Vec<Cell> = serde_wasm_bindgen::from_value(char_cells.clone())
            .map_err(|e| JsValue::from_str(&format!("Deserialization error: {}", e)))?;

        let mut loop_positions = Vec::new();

        for beat in beat_spans {
            // Find the corresponding cells
            let start_cell = cells.get(beat.start);
            let end_cell = cells.get(beat.end);

            if let (Some(start), Some(end)) = (start_cell, end_cell) {
                let start_x = start.x;
                let end_x = end.x + end.w;
                let width = end_x - start_x;

                let loop_position = BeatLoopPosition {
                    start_x,
                    width,
                    bottom: self.line_height + beat.visual.loop_offset_px,
                    height: beat.visual.loop_height_px,
                };

                loop_positions.push(loop_position);
            }
        }

        serde_wasm_bindgen::to_value(&loop_positions)
            .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
    }

    /// Calculate slur curve positions
    #[wasm_bindgen(js_name = calculateSlurPositions)]
    pub fn calculate_slur_positions(&self, slurs: &JsValue, char_cells: &JsValue) -> Result<JsValue, JsValue> {
        let slur_spans: Vec<SlurSpan> = serde_wasm_bindgen::from_value(slurs.clone())
            .map_err(|e| JsValue::from_str(&format!("Deserialization error: {}", e)))?;

        let cells: Vec<Cell> = serde_wasm_bindgen::from_value(char_cells.clone())
            .map_err(|e| JsValue::from_str(&format!("Deserialization error: {}", e)))?;

        let mut slur_positions = Vec::new();

        for slur in slur_spans {
            // Find the corresponding cells
            let start_cell = cells.iter().find(|c| c.col == slur.start.column);
            let end_cell = cells.iter().find(|c| c.col == slur.end.column);

            if let (Some(start), Some(end)) = (start_cell, end_cell) {
                let slur_position = SlurPosition {
                    start_x: start.x + start.w / 2.0,
                    start_y: start.y + start.h / 2.0,
                    end_x: end.x + end.w / 2.0,
                    end_y: end.y + end.h / 2.0,
                    curvature: slur.visual.curvature,
                    thickness: slur.visual.thickness,
                    direction: match slur.direction {
                        SlurDirection::Upward => -1.0,
                        SlurDirection::Downward => 1.0,
                    },
                };

                slur_positions.push(slur_position);
            }
        }

        serde_wasm_bindgen::to_value(&slur_positions)
            .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
    }

    /// Set font size
    #[wasm_bindgen(js_name = setFontSize)]
    pub fn set_font_size(&mut self, font_size: f32) {
        self.font_size = font_size;
        self.char_width = font_size * 0.6;
        self.line_height = font_size * 1.2;
    }

    /// Get current font size
    #[wasm_bindgen(js_name = getFontSize)]
    pub fn get_font_size(&self) -> f32 {
        self.font_size
    }

    /// Get character width
    #[wasm_bindgen(js_name = getCharWidth)]
    pub fn get_char_width(&self) -> f32 {
        self.char_width
    }

    /// Get line height
    #[wasm_bindgen(js_name = getLineHeight)]
    pub fn get_line_height(&self) -> f32 {
        self.line_height
    }
}

/// Position for beat loop rendering
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct BeatLoopPosition {
    pub start_x: f32,
    pub width: f32,
    pub bottom: f32,
    pub height: f32,
}

/// Position for slur curve rendering
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct SlurPosition {
    pub start_x: f32,
    pub start_y: f32,
    pub end_x: f32,
    pub end_y: f32,
    pub curvature: f32,
    pub thickness: f32,
    pub direction: f32, // -1.0 for upward, 1.0 for downward
}

impl LayoutRenderer {
    /// Calculate position for a single Cell
    pub fn calculate_cell_position(&self, cell: &Cell) -> (f32, f32, f32, f32) {
        let x = cell.col as f32 * self.char_width;
        let y = cell.lane.baseline(0.0, self.font_size);

        (x, y, self.char_width, self.font_size)
    }

    /// Calculate cursor position for rendering
    pub fn calculate_cursor_position(&self, column: usize, lane: LaneKind) -> (f32, f32, f32, f32) {
        let x = column as f32 * self.char_width;
        let y = lane.baseline(0.0, self.font_size);

        (x, y, 2.0, self.font_size) // 2px wide cursor
    }

    /// Calculate the visual bounds of a line
    pub fn calculate_line_bounds(&self, cells: &[Cell]) -> (f32, f32, f32, f32) {
        if cells.is_empty() {
            return (0.0, 0.0, 0.0, 0.0);
        }

        let min_x = cells.iter().map(|c| c.x).fold(f32::INFINITY, f32::min);
        let max_x = cells.iter().map(|c| c.x + c.w).fold(f32::NEG_INFINITY, f32::max);
        let min_y = cells.iter().map(|c| c.y).fold(f32::INFINITY, f32::min);
        let max_y = cells.iter().map(|c| c.y + c.h).fold(f32::NEG_INFINITY, f32::max);

        (min_x, min_y, max_x - min_x, max_y - min_y)
    }
}

impl Default for LayoutRenderer {
    fn default() -> Self {
        Self::new(16.0)
    }
}