//! Musical notation models for beats, slurs, and other musical structures
//!
//! This module defines the data structures for representing derived
//! musical concepts like beat spans and slurs.

use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;
use super::elements::LaneKind;

/// Represents a derived beat span between two temporal elements
#[wasm_bindgen]
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct BeatSpan {
    /// Starting column index (inclusive)
    pub start: usize,

    /// Ending column index (inclusive)
    pub end: usize,

    /// Beat duration in relative units
    pub duration: f32,

    /// Visual rendering properties
    pub visual: BeatVisual,
}

#[wasm_bindgen]
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
pub struct BeatVisual {
    /// Vertical offset for beat loop rendering
    pub loop_offset_px: f32,

    /// Height of beat loop arc
    pub loop_height_px: f32,

    /// Whether to render single-cell loops
    pub draw_single_cell: bool,
}

impl BeatSpan {
    /// Create a new beat span
    pub fn new(start: usize, end: usize, duration: f32) -> Self {
        Self {
            start,
            end,
            duration,
            visual: BeatVisual {
                loop_offset_px: 20.0,
                loop_height_px: 6.0,
                draw_single_cell: false,
            },
        }
    }

    /// Get the width of this beat in characters
    pub fn width(&self) -> usize {
        self.end - self.start + 1
    }

    /// Check if this span contains a given column
    pub fn contains(&self, column: usize) -> bool {
        column >= self.start && column <= self.end
    }

    /// Check if this is a single-element beat
    pub fn is_single_element(&self) -> bool {
        self.start == self.end
    }

    /// Configure visual properties
    pub fn configure_visual(&mut self, loop_offset: f32, loop_height: f32, draw_single_cell: bool) {
        self.visual.loop_offset_px = loop_offset;
        self.visual.loop_height_px = loop_height;
        self.visual.draw_single_cell = draw_single_cell;
    }
}

/// Represents a slur connection between two elements
#[wasm_bindgen]
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct SlurSpan {
    /// Starting element position (line, lane, column)
    pub start: Position,

    /// Ending element position (line, lane, column)
    pub end: Position,

    /// Slur direction (upward or downward)
    pub direction: SlurDirection,

    /// Visual rendering properties
    pub visual: SlurVisual,
}

#[wasm_bindgen]
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
pub struct Position {
    pub stave: usize,
    pub lane: LaneKind,
    pub column: usize,
}

#[wasm_bindgen]
#[repr(u8)]
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
pub enum SlurDirection {
    Upward = 0,
    Downward = 1,
}

#[wasm_bindgen]
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
pub struct SlurVisual {
    /// Curvature of the slur (0.0 = straight, 1.0 = highly curved)
    pub curvature: f32,

    /// Line thickness in pixels
    pub thickness: f32,

    /// Whether the slur is currently highlighted
    pub highlighted: bool,
}

impl SlurSpan {
    /// Create a new slur span
    pub fn new(start: Position, end: Position, direction: SlurDirection) -> Self {
        Self {
            start,
            end,
            direction,
            visual: SlurVisual {
                curvature: 0.15,
                thickness: 1.5,
                highlighted: false,
            },
        }
    }

    /// Get the horizontal span of this slur
    pub fn horizontal_span(&self) -> usize {
        if self.start.stave == self.end.stave && self.start.lane == self.end.lane {
            self.end.column.abs_diff(self.start.column) + 1
        } else {
            0 // Multi-stave slur (not supported in POC)
        }
    }

    /// Check if this slur contains a given position
    pub fn contains(&self, stave: usize, lane: LaneKind, column: usize) -> bool {
        // Only check if stave and lane match
        if stave != self.start.stave || lane != self.start.lane {
            return false;
        }

        // Check if column is within the span
        let min_col = self.start.column.min(self.end.column);
        let max_col = self.start.column.max(self.end.column);

        column >= min_col && column <= max_col
    }

    /// Set visual properties
    pub fn set_visual(&mut self, curvature: f32, thickness: f32, highlighted: bool) {
        self.visual.curvature = curvature;
        self.visual.thickness = thickness;
        self.visual.highlighted = highlighted;
    }
}

/// Cursor position in the document
#[wasm_bindgen]
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub struct CursorPosition {
    /// Stave index (0-based)
    pub stave: usize,

    /// Lane within the stave
    pub lane: LaneKind,

    /// Column within the lane (0-based)
    pub column: usize,
}

impl CursorPosition {
    /// Create a new cursor position
    pub fn new() -> Self {
        Self {
            stave: 0,
            lane: LaneKind::Letter,
            column: 0,
        }
    }

    /// Create a cursor position at specific coordinates
    pub fn at(stave: usize, lane: LaneKind, column: usize) -> Self {
        Self { stave, lane, column }
    }

    /// Move cursor relative to current position
    pub fn move_by(&mut self, delta_stave: isize, delta_lane: isize, delta_column: isize) {
        // Update stave
        if let Some(new_stave) = self.stave.checked_add_signed(delta_stave) {
            self.stave = new_stave;
        }

        // Update lane
        if delta_lane != 0 {
            let current_lane = self.lane as i8;
            let delta_i8 = delta_lane.clamp(-128, 127) as i8;
            if let Some(new_lane) = current_lane.checked_add(delta_i8) {
                if new_lane >= 0 && new_lane < 4 {
                    self.lane = match new_lane {
                        0 => LaneKind::Upper,
                        1 => LaneKind::Letter,
                        2 => LaneKind::Lower,
                        3 => LaneKind::Lyrics,
                        _ => LaneKind::Letter,
                    };
                }
            }
        }

        // Update column
        if let Some(new_column) = self.column.checked_add_signed(delta_column) {
            self.column = new_column;
        }
    }
}

impl Default for CursorPosition {
    fn default() -> Self {
        Self::new()
    }
}

/// Selection range in the document
#[wasm_bindgen]
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Selection {
    /// Starting position of selection
    pub start: CursorPosition,

    /// Ending position of selection
    pub end: CursorPosition,

    /// Whether selection is active
    pub active: bool,
}

impl Selection {
    /// Create a new selection
    pub fn new(start: CursorPosition, end: CursorPosition) -> Self {
        Self {
            start,
            end,
            active: true,
        }
    }

    /// Get the range as (start_pos, end_pos) with start <= end
    pub fn range(&self) -> (CursorPosition, CursorPosition) {
        if self.start.stave < self.end.stave ||
           (self.start.stave == self.end.stave && self.start.column <= self.end.column) {
            (self.start.clone(), self.end.clone())
        } else {
            (self.end.clone(), self.start.clone())
        }
    }

    /// Check if a position is within the selection
    pub fn contains(&self, stave: usize, lane: LaneKind, column: usize) -> bool {
        if !self.active {
            return false;
        }

        let (start, end) = self.range();

        // Only check if on the same stave and lane
        if stave != start.stave || lane != start.lane {
            return false;
        }

        column >= start.column && column <= end.column
    }

    /// Clear the selection
    pub fn clear(&mut self) {
        self.active = false;
    }

    /// Get the length of the selection in characters
    pub fn length(&self) -> usize {
        if !self.active {
            return 0;
        }

        let (start, end) = self.range();
        if start.stave == end.stave {
            end.column.abs_diff(start.column) + 1
        } else {
            0 // Multi-stave selections not supported in POC
        }
    }
}

impl Default for Selection {
    fn default() -> Self {
        Self {
            start: CursorPosition::new(),
            end: CursorPosition::new(),
            active: false,
        }
    }
}

/// Range representation for serialization
#[wasm_bindgen]
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Range {
    /// Starting column (inclusive)
    pub start: usize,

    /// Ending column (inclusive)
    pub end: usize,
}

impl Range {
    /// Create a new range
    pub fn new(start: usize, end: usize) -> Self {
        Self { start, end }
    }

    /// Get the length of the range
    pub fn length(&self) -> usize {
        self.end.abs_diff(self.start) + 1
    }

    /// Check if a value is within the range
    pub fn contains(&self, value: usize) -> bool {
        if self.start <= self.end {
            value >= self.start && value <= self.end
        } else {
            value >= self.end && value <= self.start
        }
    }

    /// Get an iterator over the range
    pub fn iter(&self) -> std::ops::RangeInclusive<usize> {
        if self.start <= self.end {
            self.start..=self.end
        } else {
            self.end..=self.start
        }
    }
}

impl From<Selection> for Range {
    fn from(selection: Selection) -> Self {
        if !selection.active {
            return Range { start: 0, end: 0 };
        }

        let (start, end) = selection.range();
        Range {
            start: start.column,
            end: end.column,
        }
    }
}

/// Musical ornament types
#[wasm_bindgen]
#[repr(u8)]
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub enum OrnamentType {
    /// No ornament
    None = 0,

    /// Mordent ornament
    Mordent = 1,

    /// Trill ornament
    Trill = 2,

    /// Turn ornament
    Turn = 3,

    /// Appoggiatura ornament
    Appoggiatura = 4,

    /// Acciaccatura ornament
    Acciaccatura = 5,
}

impl OrnamentType {
    /// Get the symbol for this ornament
    pub fn symbol(&self) -> &'static str {
        match self {
            OrnamentType::None => "",
            OrnamentType::Mordent => "mord.",
            OrnamentType::Trill => "tr",
            OrnamentType::Turn => "turn",
            OrnamentType::Appoggiatura => "app.",
            OrnamentType::Acciaccatura => "acc.",
        }
    }

    /// Check if this ornament should be rendered above the note
    pub fn is_above(&self) -> bool {
        !matches!(self, OrnamentType::None)
    }
}

impl Default for OrnamentType {
    fn default() -> Self {
        OrnamentType::None
    }
}

/// Tala notation for rhythmic patterns
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Tala {
    /// Tala pattern string (digits 0-9+)
    pub pattern: String,

    /// Position mapping (character index -> barline index)
    pub positions: Vec<(usize, usize)>,

    /// Visual properties
    pub visual: TalaVisual,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct TalaVisual {
    /// Vertical offset above barlines
    pub offset_px: f32,

    /// Font size for tala digits
    pub font_size: f32,

    /// Color for tala display
    pub color: String,
}

impl Tala {
    /// Create a new tala
    pub fn new(pattern: String) -> Self {
        let mut positions = Vec::new();
        let mut char_index = 0;

        // Parse pattern and map to barline positions
        for (barline_index, ch) in pattern.chars().enumerate() {
            if ch.is_digit(10) || ch == '+' {
                positions.push((char_index, barline_index));
                char_index += 1;
            }
        }

        Self {
            pattern,
            positions,
            visual: TalaVisual {
                offset_px: 30.0,
                font_size: 12.0,
                color: "#666666".to_string(),
            },
        }
    }

    /// Get the tala digit for a specific barline
    pub fn get_digit(&self, barline_index: usize) -> Option<char> {
        self.positions
            .iter()
            .find(|(_, bi)| *bi == barline_index)
            .and_then(|(ci, _)| self.pattern.chars().nth(*ci))
    }

    /// Validate tala pattern
    pub fn validate_pattern(pattern: &str) -> bool {
        pattern.chars().all(|ch| ch.is_digit(10) || ch == '+')
    }

    /// Empty tala
    pub fn empty() -> Self {
        Self {
            pattern: String::new(),
            positions: Vec::new(),
            visual: TalaVisual {
                offset_px: 30.0,
                font_size: 12.0,
                color: "#666666".to_string(),
            },
        }
    }
}

impl Default for Tala {
    fn default() -> Self {
        Self::empty()
    }
}

impl Default for BeatVisual {
    fn default() -> Self {
        Self {
            loop_offset_px: 20.0,
            loop_height_px: 6.0,
            draw_single_cell: false,
        }
    }
}

impl Default for SlurVisual {
    fn default() -> Self {
        Self {
            curvature: 0.15,
            thickness: 1.5,
            highlighted: false,
        }
    }
}

impl Default for TalaVisual {
    fn default() -> Self {
        Self {
            offset_px: 30.0,
            font_size: 12.0,
            color: "#666666".to_string(),
        }
    }
}