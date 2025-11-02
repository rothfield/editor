//! Musical notation models for beats, slurs, and other musical structures
//!
//! This module defines the data structures for representing derived
//! musical concepts like beat spans and slurs.

use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

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
    /// Starting element position (line, column)
    pub start: Position,

    /// Ending element position (line, column)
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
        if self.start.stave == self.end.stave {
            self.end.column.abs_diff(self.start.column) + 1
        } else {
            0 // Multi-stave slur (not supported in POC)
        }
    }

    /// Check if this slur contains a given position
    pub fn contains(&self, stave: usize, column: usize) -> bool {
        // Only check if stave matches
        if stave != self.start.stave {
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

/// Position in the document (stave, column)
/// This is the fundamental position type used for cursor and selection
#[wasm_bindgen]
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub struct Pos {
    /// Stave index (0-based, line number)
    pub stave: usize,

    /// Column within the stave (0-based, cell index)
    pub col: usize,
}

#[wasm_bindgen]
impl Pos {
    /// Create a new position
    #[wasm_bindgen(constructor)]
    pub fn new(stave: usize, col: usize) -> Self {
        Self { stave, col }
    }

    /// Create position at origin
    pub fn origin() -> Self {
        Self { stave: 0, col: 0 }
    }
}

impl Pos {
    /// Move position relative to current location
    pub fn move_by(&self, delta_stave: isize, delta_col: isize) -> Self {
        let stave = self.stave.saturating_add_signed(delta_stave);
        let col = self.col.saturating_add_signed(delta_col);
        Self { stave, col }
    }

    /// Compare two positions
    pub fn compare(&self, other: &Self) -> std::cmp::Ordering {
        self.stave.cmp(&other.stave)
            .then(self.col.cmp(&other.col))
    }
}

impl Default for Pos {
    fn default() -> Self {
        Self::origin()
    }
}

/// Legacy alias for backward compatibility
pub type CursorPosition = Pos;

/// Selection using anchor/head model
/// Anchor is where selection started (fixed), head is the moving end (cursor)
#[wasm_bindgen]
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Selection {
    /// Fixed point where selection started
    pub anchor: Pos,

    /// Moving point (current cursor position during selection)
    pub head: Pos,
}

#[wasm_bindgen]
impl Selection {
    /// Create a new selection
    #[wasm_bindgen(constructor)]
    pub fn new(anchor: Pos, head: Pos) -> Self {
        Self { anchor, head }
    }

    /// Create an empty selection at a position
    pub fn empty_at(pos: Pos) -> Self {
        Self {
            anchor: pos,
            head: pos,
        }
    }

    /// Check if selection is empty (anchor == head)
    pub fn is_empty(&self) -> bool {
        self.anchor == self.head
    }
}

impl Selection {
    /// Get the normalized range (start <= end)
    pub fn range(&self) -> (Pos, Pos) {
        if self.anchor <= self.head {
            (self.anchor, self.head)
        } else {
            (self.head, self.anchor)
        }
    }

    /// Get start position (minimum)
    pub fn start(&self) -> Pos {
        if self.anchor <= self.head {
            self.anchor
        } else {
            self.head
        }
    }

    /// Get end position (maximum)
    pub fn end(&self) -> Pos {
        if self.anchor <= self.head {
            self.head
        } else {
            self.anchor
        }
    }

    /// Check if selection is forward (anchor <= head)
    pub fn is_forward(&self) -> bool {
        self.anchor <= self.head
    }

    /// Check if a position is within the selection
    pub fn contains(&self, pos: &Pos) -> bool {
        if self.is_empty() {
            return false;
        }

        let (start, end) = self.range();

        // Multi-stave not yet supported - only check same stave
        if pos.stave != start.stave || pos.stave != end.stave {
            return false;
        }

        pos.col >= start.col && pos.col <= end.col
    }

    /// Get the length of the selection in columns
    pub fn length(&self) -> usize {
        if self.is_empty() {
            return 0;
        }

        let (start, end) = self.range();
        if start.stave == end.stave {
            end.col.saturating_sub(start.col) + 1
        } else {
            0 // Multi-stave not yet supported
        }
    }
}

impl Default for Selection {
    fn default() -> Self {
        Self::empty_at(Pos::origin())
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
        if selection.is_empty() {
            return Range { start: 0, end: 0 };
        }

        let (start, end) = selection.range();
        Range {
            start: start.col,
            end: end.col,
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

// ==================== NEW WASM INTERFACE TYPES ====================

/// Direction for cursor movement
#[wasm_bindgen]
#[repr(u8)]
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum Direction {
    Up = 0,
    Down = 1,
    Left = 2,
    Right = 3,
    LineStart = 4,
    LineEnd = 5,
    DocumentStart = 6,
    DocumentEnd = 7,
}

/// Cursor information returned from WASM to JavaScript
#[wasm_bindgen]
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
pub struct CaretInfo {
    /// Current caret position
    pub caret: Pos,

    /// Desired column for vertical movement (preserves horizontal position across lines)
    pub desired_col: usize,
}

#[wasm_bindgen]
impl CaretInfo {
    /// Create new caret info
    #[wasm_bindgen(constructor)]
    pub fn new(caret: Pos, desired_col: usize) -> Self {
        Self { caret, desired_col }
    }
}

/// Selection information returned from WASM to JavaScript
#[wasm_bindgen]
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
pub struct SelectionInfo {
    /// Anchor position (where selection started)
    pub anchor: Pos,

    /// Head position (current cursor / moving end)
    pub head: Pos,

    /// Normalized start position (min of anchor/head)
    pub start: Pos,

    /// Normalized end position (max of anchor/head)
    pub end: Pos,

    /// Whether selection is empty (anchor == head)
    pub is_empty: bool,

    /// Direction: true if forward (anchor <= head), false if backward
    pub is_forward: bool,
}

#[wasm_bindgen]
impl SelectionInfo {
    /// Create from a Selection
    pub fn from_selection(selection: &Selection) -> Self {
        let (start, end) = selection.range();
        Self {
            anchor: selection.anchor,
            head: selection.head,
            start,
            end,
            is_empty: selection.is_empty(),
            is_forward: selection.is_forward(),
        }
    }
}

/// Document diff information for efficient rendering
/// This tells JavaScript what changed so it can update only the necessary parts
/// Note: This is serialized to JsValue manually, not using wasm_bindgen directly
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct DocDiff {
    /// Which staves changed (for multi-line future support)
    pub changed_staves: Vec<usize>,

    /// New caret information
    pub caret: CaretInfo,

    /// New selection information (if any)
    pub selection: Option<SelectionInfo>,
}