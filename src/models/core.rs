//! Core data structures for the Music Notation Editor POC
//!
//! This module defines the fundamental Cell-based architecture
//! for representing musical notation with grapheme-safe indexing.

use serde::{Deserialize, Serialize};
use std::collections::VecDeque;

// Re-export from other modules
pub use super::elements::{ElementKind, LaneKind, PitchSystem};
pub use super::notation::{BeatSpan, SlurSpan, Position, Selection, Range, CursorPosition};

/// The fundamental unit representing one visible grapheme cluster in musical notation
#[repr(C)]
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Cell {
    /// The visible grapheme cluster (e.g., "S", "C#", "2b", "-")
    pub grapheme: String,

    /// Type of musical element this cell represents
    pub kind: ElementKind,

    /// Vertical lane position (Upper, Letter, Lower, Lyrics)
    pub lane: LaneKind,

    /// Physical column index (0-based) for layout calculations
    pub col: usize,

    /// Bit flags for various properties (head marker, selection, focus, etc.)
    pub flags: u8,

    /// Canonical pitch representation (for pitched elements only)
    pub pitch_code: Option<String>,

    /// Pitch system used for this element (for pitched elements only)
    pub pitch_system: Option<PitchSystem>,

    /// Octave marking for pitched elements (-1 = lower, 0 = middle/none, 1 = upper)
    pub octave: Option<i8>,

    /// Layout cache properties (calculated at render time)
    #[serde(skip)]
    pub x: f32,
    #[serde(skip)]
    pub y: f32,
    #[serde(skip)]
    pub w: f32,
    #[serde(skip)]
    pub h: f32,

    /// Bounding box for hit testing (left, top, right, bottom)
    #[serde(skip)]
    pub bbox: (f32, f32, f32, f32),

    /// Hit testing area (may be larger than bbox for interaction)
    #[serde(skip)]
    pub hit: (f32, f32, f32, f32),
}

impl Cell {
    /// Create a new Cell
    pub fn new(grapheme: String, kind: ElementKind, lane: LaneKind, col: usize) -> Self {
        Self {
            grapheme,
            kind,
            lane,
            col,
            flags: 0,
            pitch_code: None,
            pitch_system: None,
            octave: None,
            x: 0.0,
            y: 0.0,
            w: 0.0,
            h: 0.0,
            bbox: (0.0, 0.0, 0.0, 0.0),
            hit: (0.0, 0.0, 0.0, 0.0),
        }
    }

    /// Check if this cell is the head of a multi-character token
    pub fn is_head(&self) -> bool {
        self.flags & 0x01 != 0
    }

    /// Set head marker flag
    pub fn set_head(&mut self, is_head: bool) {
        if is_head {
            self.flags |= 0x01;
        } else {
            self.flags &= !0x01;
        }
    }

    /// Check if this cell is currently selected
    pub fn is_selected(&self) -> bool {
        self.flags & 0x02 != 0
    }

    /// Set selection flag
    pub fn set_selected(&mut self, is_selected: bool) {
        if is_selected {
            self.flags |= 0x02;
        } else {
            self.flags &= !0x02;
        }
    }

    /// Check if this cell has focus
    pub fn has_focus(&self) -> bool {
        self.flags & 0x04 != 0
    }

    /// Set focus flag
    pub fn set_focused(&mut self, has_focus: bool) {
        if has_focus {
            self.flags |= 0x04;
        } else {
            self.flags &= !0x04;
        }
    }

    /// Check if this cell is part of a temporal sequence
    pub fn is_temporal(&self) -> bool {
        self.kind.is_temporal()
    }

    /// Get the length of this token in characters
    pub fn token_length(&self) -> usize {
        self.grapheme.chars().count()
    }

    /// Check if this cell can be selected
    pub fn is_selectable(&self) -> bool {
        self.kind.is_selectable()
    }

    /// Update layout cache properties
    pub fn update_layout(&mut self, x: f32, y: f32, w: f32, h: f32) {
        self.x = x;
        self.y = y;
        self.w = w;
        self.h = h;

        // Update bounding box
        self.bbox = (x, y, x + w, y + h);

        // Update hit testing area (slightly larger for better interaction)
        self.hit = (x - 2.0, y - 2.0, x + w + 2.0, y + h + 2.0);
    }

    /// Check if a point is within the hit testing area
    pub fn hit_test(&self, x: f32, y: f32) -> bool {
        x >= self.hit.0 && x <= self.hit.2 && y >= self.hit.1 && y <= self.hit.3
    }
}

/// Container for musical notation with support for multiple lanes and line-level metadata
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Line {
    /// Ordered lanes containing Cell arrays
    pub lanes: [Vec<Cell>; 4],

    /// Line-level metadata
    pub metadata: LineMetadata,

    /// Derived beat spans (calculated, not stored)
    #[serde(skip)]
    pub beats: Vec<BeatSpan>,

    /// Derived slur connections (calculated, not stored)
    #[serde(skip)]
    pub slurs: Vec<SlurSpan>,
}

impl Line {
    /// Create a new empty line with default metadata
    pub fn new() -> Self {
        Self {
            lanes: [
                Vec::new(), // Upper lane
                Vec::new(), // Letter lane
                Vec::new(), // Lower lane
                Vec::new(), // Lyrics lane
            ],
            metadata: LineMetadata::new(),
            beats: Vec::new(),
            slurs: Vec::new(),
        }
    }

    /// Get Cells from a specific lane
    pub fn get_lane(&self, lane: LaneKind) -> &[Cell] {
        &self.lanes[lane as usize]
    }

    /// Get mutable Cells from a specific lane
    pub fn get_lane_mut(&mut self, lane: LaneKind) -> &mut Vec<Cell> {
        &mut self.lanes[lane as usize]
    }

    /// Get all temporal Cells from the Letter lane
    pub fn get_temporal_cells(&self) -> Vec<&Cell> {
        self.lanes[LaneKind::Letter as usize]
            .iter()
            .filter(|cell| cell.is_temporal())
            .collect()
    }

    /// Get the maximum column index across all lanes
    pub fn max_column(&self) -> usize {
        self.lanes
            .iter()
            .map(|lane| lane.last().map(|cell| cell.col).unwrap_or(0))
            .max()
            .unwrap_or(0)
    }

    /// Add a Cell to the specified lane
    pub fn add_cell(&mut self, cell: Cell, lane: LaneKind) {
        self.get_lane_mut(lane).push(cell);
    }

    /// Insert a Cell at a specific position in a lane
    pub fn insert_cell(&mut self, cell: Cell, lane: LaneKind, index: usize) {
        self.get_lane_mut(lane).insert(index, cell);
    }

    /// Remove a Cell from a lane
    pub fn remove_cell(&mut self, lane: LaneKind, index: usize) -> Option<Cell> {
        let lane_vec = self.get_lane_mut(lane);
        if index < lane_vec.len() {
            Some(lane_vec.remove(index))
        } else {
            None
        }
    }

    /// Clear all Cells from a lane
    pub fn clear_lane(&mut self, lane: LaneKind) {
        self.get_lane_mut(lane).clear();
    }

    /// Clear all lanes
    pub fn clear(&mut self) {
        for lane in &mut self.lanes {
            lane.clear();
        }
        self.beats.clear();
        self.slurs.clear();
    }
}

/// Metadata stored at the line level for musical and structural information
#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
pub struct LineMetadata {
    /// Optional label displayed at the beginning of the line
    pub label: Option<String>,

    /// Tala notation string (digits 0-9+ displayed above barlines)
    pub tala: Option<String>,

    /// Lyrics text string displayed below the first pitched element
    pub lyrics: Option<String>,

    /// Musical tonic for this line (overrides composition tonic)
    pub tonic: Option<String>,

    /// Pitch system for this line (overrides composition pitch system)
    pub pitch_system: Option<PitchSystem>,

    /// Key signature for this line (sharps/flats affecting pitch interpretation)
    pub key_signature: Option<String>,

    /// Tempo marking for this line
    pub tempo: Option<String>,

    /// Time signature for this line
    pub time_signature: Option<String>,
}

impl LineMetadata {
    /// Create new default metadata
    pub fn new() -> Self {
        Self::default()
    }

    /// Check if this line has any metadata set
    pub fn has_metadata(&self) -> bool {
        self.label.is_some() ||
        self.tala.is_some() ||
        self.lyrics.is_some() ||
        self.tonic.is_some() ||
        self.pitch_system.is_some() ||
        self.key_signature.is_some()
    }
}

/// Top-level container for musical notation with support for multiple lines and composition-level metadata
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Document {
    /// Composition-level metadata
    pub metadata: DocumentMetadata,

    /// Array of musical lines
    pub lines: Vec<Line>,

    /// Application state (cursor position, selection, etc.)
    #[serde(skip)]
    pub state: DocumentState,
}

impl Document {
    /// Create a new empty document
    pub fn new() -> Self {
        Self {
            metadata: DocumentMetadata::new(),
            lines: Vec::new(),
            state: DocumentState::new(),
        }
    }

    /// Add a new line to the document
    pub fn add_line(&mut self, line: Line) {
        self.lines.push(line);
    }

    /// Get the active line (for single-line POC, this is always the first line)
    pub fn active_line(&self) -> Option<&Line> {
        self.lines.first()
    }

    /// Get mutable reference to the active line
    pub fn active_line_mut(&mut self) -> Option<&mut Line> {
        self.lines.first_mut()
    }

    /// Ensure the document has at least one line
    pub fn ensure_line(&mut self) -> &mut Line {
        if self.lines.is_empty() {
            self.lines.push(Line::new());
        }
        self.lines.first_mut().unwrap()
    }

    /// Get the total number of characters across all lanes and lines
    pub fn total_chars(&self) -> usize {
        self.lines
            .iter()
            .map(|line| line.lanes.iter().map(|lane| lane.len()).sum::<usize>())
            .sum()
    }

    /// Validate document structure and content
    pub fn validate(&self) -> Result<(), ValidationError> {
        // Ensure all lanes have consistent column alignment
        for (line_idx, line) in self.lines.iter().enumerate() {
            let max_col = line.max_column();

            for (lane_idx, lane) in line.lanes.iter().enumerate() {
                for (cell_idx, cell) in lane.iter().enumerate() {
                    if cell.col > max_col {
                        return Err(ValidationError::ColumnAlignment {
                            line: line_idx,
                            lane: lane_idx,
                            cell: cell_idx,
                            cell_col: cell.col,
                            max_col,
                        });
                    }
                }
            }
        }

        Ok(())
    }

    /// Clear the document
    pub fn clear(&mut self) {
        self.lines.clear();
        self.state = DocumentState::new();
    }
}

/// Composition-level metadata that applies to the entire document
#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
pub struct DocumentMetadata {
    /// Title of the composition
    pub title: Option<String>,

    /// Composer/author information
    pub composer: Option<String>,

    /// Musical tonic for the entire composition
    pub tonic: Option<String>,

    /// Default pitch system for the composition
    pub pitch_system: Option<PitchSystem>,

    /// Default key signature for the composition
    pub key_signature: Option<String>,

    /// Creation and modification timestamps
    pub created_at: Option<String>,
    pub modified_at: Option<String>,

    /// Document version
    pub version: Option<String>,
}

impl DocumentMetadata {
    /// Create new document metadata
    pub fn new() -> Self {
        let now = chrono::Utc::now().to_rfc3339();
        Self {
            created_at: Some(now.clone()),
            modified_at: Some(now),
            ..Default::default()
        }
    }

    /// Get the effective pitch system for a line
    pub fn effective_pitch_system(&self, line_metadata: &LineMetadata) -> PitchSystem {
        line_metadata.pitch_system
            .or(self.pitch_system)
            .unwrap_or(PitchSystem::Number)
    }

    /// Get the effective tonic for a line
    pub fn effective_tonic<'a>(&'a self, line_metadata: &'a LineMetadata) -> Option<&'a String> {
        line_metadata.tonic.as_ref().or(self.tonic.as_ref())
    }
}

/// Application state including cursor position, selection, and focus information
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
pub struct DocumentState {
    /// Current cursor position (line index, lane, column)
    pub cursor: CursorPosition,

    /// Selection manager for handling selection operations
    pub selection_manager: SelectionManager,

    /// Currently focused element ID
    pub focused_element: Option<String>,

    /// Focus state of the editor
    pub has_focus: bool,

    /// Undo/Redo history
    pub history: VecDeque<DocumentAction>,
    pub history_index: usize,

    /// Performance and rendering state
    pub render_state: RenderState,
}

impl DocumentState {
    /// Create new document state
    pub fn new() -> Self {
        Self {
            cursor: CursorPosition::new(),
            selection_manager: SelectionManager::new(),
            focused_element: None,
            has_focus: false,
            history: VecDeque::new(),
            history_index: 0,
            render_state: RenderState::new(),
        }
    }

    /// Check if there's an active selection
    pub fn has_selection(&self) -> bool {
        self.selection_manager.is_active()
    }

    /// Get the current selection range
    pub fn selection_range(&self) -> Option<Range> {
        self.selection_manager.get_range()
    }

    /// Get the current selection
    pub fn get_selection(&self) -> Option<&Selection> {
        self.selection_manager.get_selection()
    }

    /// Start a new selection at the cursor position
    pub fn start_selection(&mut self) {
        self.selection_manager.start_selection(self.cursor.clone());
    }

    /// Extend current selection to cursor position
    pub fn extend_selection(&mut self) {
        self.selection_manager.extend_selection(&self.cursor);
    }

    /// Clear current selection
    pub fn clear_selection(&mut self) {
        self.selection_manager.clear_selection();
    }

    /// Get selected text from document
    pub fn get_selected_text(&self, document: &Document) -> String {
        self.selection_manager.get_selected_text(document)
    }

    /// Add an action to the history
    pub fn add_action(&mut self, action: DocumentAction) {
        // Remove any actions after current index
        self.history.truncate(self.history_index);

        // Add new action
        self.history.push_back(action);
        self.history_index = self.history.len();

        // Limit history size
        if self.history.len() > 100 {
            self.history.pop_front();
            self.history_index -= 1;
        }
    }

    /// Check if undo is available
    pub fn can_undo(&self) -> bool {
        self.history_index > 0
    }

    /// Check if redo is available
    pub fn can_redo(&self) -> bool {
        self.history_index < self.history.len()
    }
}

/// Represents an action that can be undone/redone
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct DocumentAction {
    /// Type of action
    pub action_type: ActionType,

    /// Description of the action
    pub description: String,

    /// Previous state (for undo)
    pub previous_state: Option<Document>,

    /// New state (for redo)
    pub new_state: Option<Document>,

    /// Timestamp when the action was performed
    pub timestamp: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub enum ActionType {
    InsertText,
    DeleteText,
    ApplySlur,
    ApplyOctave,
    SetTala,
    SetMetadata,
}

/// Rendering state information
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
pub struct RenderState {
    /// Whether the document needs to be re-rendered
    pub dirty: bool,

    /// Dirty regions for partial rendering
    pub dirty_regions: Vec<(f32, f32, f32, f32)>,

    /// Last render timestamp
    pub last_render_time: Option<f32>,

    /// Render performance metrics
    pub render_metrics: RenderMetrics,
}

impl RenderState {
    /// Create new render state
    pub fn new() -> Self {
        Self {
            dirty: true,
            dirty_regions: Vec::new(),
            last_render_time: None,
            render_metrics: RenderMetrics::new(),
        }
    }

    /// Mark document as dirty
    pub fn mark_dirty(&mut self) {
        self.dirty = true;
        self.dirty_regions.clear();
    }

    /// Mark a specific region as dirty
    pub fn mark_region_dirty(&mut self, x: f32, y: f32, w: f32, h: f32) {
        self.dirty = true;
        self.dirty_regions.push((x, y, x + w, y + h));
    }

    /// Clear dirty flags
    pub fn clear_dirty(&mut self) {
        self.dirty = false;
        self.dirty_regions.clear();
    }
}

/// Performance metrics for rendering
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
pub struct RenderMetrics {
    /// Time taken for last render in milliseconds
    pub last_render_time_ms: f32,

    /// Number of Cells rendered
    pub cells_rendered: usize,

    /// Number of beat loops rendered
    pub beats_rendered: usize,

    /// Number of slurs rendered
    pub slurs_rendered: usize,

    /// Average render time over last 10 renders
    pub average_render_time_ms: f32,
}

impl RenderMetrics {
    /// Create new render metrics
    pub fn new() -> Self {
        Self {
            last_render_time_ms: 0.0,
            cells_rendered: 0,
            beats_rendered: 0,
            slurs_rendered: 0,
            average_render_time_ms: 0.0,
        }
    }

    /// Update metrics after a render
    pub fn update(&mut self, render_time_ms: f32, cells: usize, beats: usize, slurs: usize) {
        self.last_render_time_ms = render_time_ms;
        self.cells_rendered = cells;
        self.beats_rendered = beats;
        self.slurs_rendered = slurs;

        // Update average (simple moving average)
        self.average_render_time_ms = (self.average_render_time_ms * 0.9) + (render_time_ms * 0.1);
    }
}

/// Selection manager for handling text selection operations
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
pub struct SelectionManager {
    /// Current selection state
    pub current_selection: Option<Selection>,

    /// Selection anchor point (where selection started)
    pub anchor: Option<CursorPosition>,

    /// Selection mode (normal, word, line, etc.)
    pub mode: SelectionMode,

    /// Whether selection is active
    pub active: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
pub enum SelectionMode {
    /// Normal character-by-character selection
    #[default]
    Normal,
    /// Word-based selection
    Word,
    /// Line-based selection
    Line,
    /// Select all
    All,
}

impl SelectionManager {
    /// Create a new selection manager
    pub fn new() -> Self {
        Self {
            current_selection: None,
            anchor: None,
            mode: SelectionMode::Normal,
            active: false,
        }
    }

    /// Start a new selection at the given position
    pub fn start_selection(&mut self, position: CursorPosition) {
        self.anchor = Some(position.clone());
        self.current_selection = Some(Selection {
            start: position.clone(),
            end: position.clone(),
            active: true,
        });
        self.active = true;
    }

    /// Extend selection to a new position
    pub fn extend_selection(&mut self, position: &CursorPosition) {
        if let Some(anchor) = &self.anchor {
            let start = if position < anchor {
                position.clone()
            } else {
                anchor.clone()
            };
            let end = if position < anchor {
                anchor.clone()
            } else {
                position.clone()
            };

            self.current_selection = Some(Selection {
                start,
                end,
                active: true,
            });
        }
    }

    /// Clear current selection
    pub fn clear_selection(&mut self) {
        self.current_selection = None;
        self.anchor = None;
        self.active = false;
    }

    /// Get current selection
    pub fn get_selection(&self) -> Option<&Selection> {
        self.current_selection.as_ref()
    }

    /// Check if selection is active
    pub fn is_active(&self) -> bool {
        self.active && self.current_selection.is_some()
    }

    /// Get selected range
    pub fn get_range(&self) -> Option<Range> {
        self.current_selection.as_ref().map(|s| Range::from(s.clone()))
    }

    /// Check if a position is within the current selection
    pub fn contains_position(&self, position: &CursorPosition) -> bool {
        if let Some(selection) = &self.current_selection {
            position.lane == selection.start.lane &&
            position.column >= selection.start.column &&
            position.column < selection.end.column
        } else {
            false
        }
    }

    /// Validate selection against document bounds
    pub fn validate_selection(&self, document: &Document) -> bool {
        if let Some(selection) = &self.current_selection {
            // Check if lane is valid
            let lane_index = selection.start.lane as usize;
            if lane_index >= 4 {
                return false;
            }

            // Check if selection is within document bounds
            if let Some(line) = document.active_line() {
                let lane_content = line.get_lane(selection.start.lane);
                let max_column = lane_content.iter()
                    .map(|cell| cell.col + cell.token_length())
                    .max()
                    .unwrap_or(0);

                if selection.start.column > max_column || selection.end.column > max_column {
                    return false;
                }
            }
        }
        true
    }

    /// Get selected text from document
    pub fn get_selected_text(&self, document: &Document) -> String {
        if let Some(selection) = &self.current_selection {
            if let Some(line) = document.active_line() {
                let lane_content = line.get_lane(selection.start.lane);

                return lane_content.iter()
                    .filter(|cell| {
                        cell.col >= selection.start.column &&
                        cell.col < selection.end.column
                    })
                    .map(|cell| cell.grapheme.clone())
                    .collect::<Vec<String>>()
                    .join("");
            }
        }
        String::new()
    }

    /// Select all content in the current line
    pub fn select_all(&mut self, document: &Document) {
        if let Some(line) = document.active_line() {
            let current_lane = line.get_lane(LaneKind::Letter);
            if current_lane.is_empty() {
                return;
            }

            let start_col = current_lane.first().map(|c| c.col).unwrap_or(0);
            let end_col = current_lane.last()
                .map(|c| c.col + c.token_length())
                .unwrap_or(start_col + 1);

            self.current_selection = Some(Selection {
                start: CursorPosition {
                    stave: 0,
                    lane: LaneKind::Letter,
                    column: start_col,
                },
                end: CursorPosition {
                    stave: 0,
                    lane: LaneKind::Letter,
                    column: end_col,
                },
                active: true,
            });
            self.anchor = Some(self.current_selection.as_ref().unwrap().start.clone());
            self.active = true;
            self.mode = SelectionMode::All;
        }
    }

    /// Select word at cursor position
    pub fn select_word(&mut self, position: &CursorPosition, document: &Document) {
        if let Some(line) = document.active_line() {
            let lane_content = line.get_lane(position.lane.into());

            // Find word boundaries around the cursor position
            let mut start_col = position.column;
            let mut end_col = position.column;

            // Find start of word (go left until non-temporal character)
            for cell in lane_content.iter().rev() {
                if cell.col < position.column && cell.is_temporal() {
                    start_col = cell.col;
                } else {
                    break;
                }
            }

            // Find end of word (go right until non-temporal character)
            for cell in lane_content.iter() {
                if cell.col >= position.column && cell.is_temporal() {
                    end_col = cell.col + cell.token_length();
                } else if cell.col > position.column {
                    break;
                }
            }

            self.current_selection = Some(Selection {
                start: CursorPosition {
                    stave: position.stave,
                    lane: position.lane,
                    column: start_col,
                },
                end: CursorPosition {
                    stave: position.stave,
                    lane: position.lane,
                    column: end_col,
                },
                active: true,
            });
            self.anchor = Some(self.current_selection.as_ref().unwrap().start.clone());
            self.active = true;
            self.mode = SelectionMode::Word;
        }
    }
}

/// Errors that can occur during document validation
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub enum ValidationError {
    /// Column alignment mismatch between lanes
    ColumnAlignment {
        line: usize,
        lane: usize,
        cell: usize,
        cell_col: usize,
        max_col: usize,
    },

    /// Invalid pitch notation
    InvalidPitch {
        line: usize,
        lane: usize,
        column: usize,
        pitch: String,
    },

    /// Invalid character encoding
    InvalidEncoding {
        line: usize,
        lane: usize,
        column: usize,
        grapheme: String,
    },

    /// Document structure inconsistency
    StructureError {
        description: String,
    },
}

impl ValidationError {
    /// Get a human-readable error message
    pub fn message(&self) -> String {
        match self {
            ValidationError::ColumnAlignment { line, lane, cell, cell_col, max_col } => {
                format!("Column alignment error at line {}, lane {}, cell {}: column {} exceeds maximum {}",
                       line, lane, cell, cell_col, max_col)
            },
            ValidationError::InvalidPitch { line, lane, column, pitch } => {
                format!("Invalid pitch notation '{}' at line {}, lane {}, column {}", pitch, line, lane, column)
            },
            ValidationError::InvalidEncoding { line, lane, column, grapheme } => {
                format!("Invalid character encoding '{}' at line {}, lane {}, column {}", grapheme, line, lane, column)
            },
            ValidationError::StructureError { description } => {
                format!("Document structure error: {}", description)
            },
        }
    }
}

// Include chrono for timestamps
#[cfg(feature = "chrono")]
use chrono;

#[cfg(not(feature = "chrono"))]
mod chrono {
    pub struct Utc;
    impl Utc {
        pub fn now() -> DateTime {
            DateTime(SystemTime::now())
        }
    }

    pub struct DateTime(std::time::SystemTime);
    impl DateTime {
        pub fn to_rfc3339(&self) -> String {
            // Simple timestamp implementation
            format!("{:?}", self.0)
        }
    }

    use std::time::SystemTime;
}