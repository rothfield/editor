//! Core data structures for the Music Notation Editor POC
//!
//! This module defines the fundamental Cell-based architecture
//! for representing musical notation with glyph-safe indexing.

use serde::{Deserialize, Serialize};
use crate::undo::UndoStack;

// Re-export from other modules
pub use super::elements::{ElementKind, OrnamentPositionType, PitchSystem, SlurIndicator};
pub use super::notation::{BeatSpan, SlurSpan, Position, Selection, PrimarySelection, Range, CursorPosition, Pos, CaretInfo, SelectionInfo, EditorDiff, DocDiff};
pub use super::pitch_code::PitchCode;

/// The fundamental unit representing one character in musical notation
///
/// **ARCHITECTURE NOTE:**
/// This struct is intended to be a **view** generated from text + annotations.
/// Future: Text buffer will be source of truth, Cells will be derived on demand.
/// Do not add business logic that assumes Cells are stored permanently.
#[repr(C)]
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Cell {
    /// The visible character from NotationFont (e.g., U+E100 for "1")
    /// This is the actual glyph that gets rendered
    /// Stored alongside semantics for fast rendering
    pub char: String,

    /// Type of musical element this cell represents
    pub kind: ElementKind,

    /// Physical column index (0-based) for layout calculations
    pub col: usize,

    /// Bit flags for various properties (head marker, selection, focus, etc.)
    pub flags: u8,

    /// Canonical pitch representation (for pitched elements only)
    /// This encodes the accidental (Sharp, Flat, Natural, etc.)
    pub pitch_code: Option<PitchCode>,

    /// Pitch system used for this element (for pitched elements only)
    pub pitch_system: Option<PitchSystem>,

    /// Octave marking for pitched elements (-1 = lower, 0 = middle/none, 1 = upper)
    /// Note: Uses i8 instead of Option to ensure field always appears in persistent storage
    pub octave: i8,

    /// Slur indicator (None, SlurStart, SlurEnd)
    pub slur_indicator: SlurIndicator,

    /// Ornament attached to this cell (single ornament per cell)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ornament: Option<crate::models::elements::Ornament>,

    /// Layout cache properties (calculated at render time) - ephemeral, not saved
    #[serde(skip)]
    pub x: f32,
    #[serde(skip)]
    pub y: f32,
    #[serde(skip)]
    pub w: f32,
    #[serde(skip)]
    pub h: f32,

    /// Bounding box for hit testing (left, top, right, bottom) - ephemeral, not saved
    #[serde(skip)]
    pub bbox: (f32, f32, f32, f32),

    /// Hit testing area (may be larger than bbox for interaction) - ephemeral, not saved
    #[serde(skip)]
    pub hit: (f32, f32, f32, f32),
}

impl Cell {
    /// Create a new Cell
    pub fn new(char: String, kind: ElementKind, col: usize) -> Self {
        Self {
            char,
            kind,
            col,
            flags: 0,
            pitch_code: None,
            pitch_system: None,
            octave: 0,
            slur_indicator: SlurIndicator::None,
            ornament: None,
            x: 0.0,
            y: 0.0,
            w: 0.0,
            h: 0.0,
            bbox: (0.0, 0.0, 0.0, 0.0),
            hit: (0.0, 0.0, 0.0, 0.0),
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

    /// Get the length of this token in characters (always 1)
    pub fn token_length(&self) -> usize {
        1
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

    /// Set slur indicator to start a slur
    pub fn set_slur_start(&mut self) {
        self.slur_indicator = SlurIndicator::SlurStart;
    }

    /// Set slur indicator to end a slur
    pub fn set_slur_end(&mut self) {
        self.slur_indicator = SlurIndicator::SlurEnd;
    }

    /// Clear slur indicator
    pub fn clear_slur(&mut self) {
        self.slur_indicator = SlurIndicator::None;
    }

    /// Check if this cell has an ornament indicator (stub - ornament system refactored)
    /// DEPRECATED: Ornament indicators have been replaced with cell.ornament field
    /// Returns false always for compatibility during refactoring
    #[allow(dead_code)]
    pub fn has_ornament_indicator(&self) -> bool {
        false
    }

    /// Set ornament start (stub - ornament system refactored)
    #[allow(dead_code)]
    pub fn set_ornament_start(&mut self) {
        // No-op: ornament_indicator field no longer exists
    }

    /// Set ornament end (stub - ornament system refactored)
    #[allow(dead_code)]
    pub fn set_ornament_end(&mut self) {
        // No-op: ornament_indicator field no longer exists
    }

    /// Clear ornament (stub - ornament system refactored)
    #[allow(dead_code)]
    pub fn clear_ornament(&mut self) {
        // No-op: ornament_indicator field no longer exists
    }

    /// Check if this cell has a slur indicator
    pub fn has_slur(&self) -> bool {
        self.slur_indicator.has_slur()
    }

    /// Check if this cell starts a slur
    pub fn is_slur_start(&self) -> bool {
        self.slur_indicator.is_start()
    }

    /// Check if this cell ends a slur
    pub fn is_slur_end(&self) -> bool {
        self.slur_indicator.is_end()
    }

    /// Get the display character for this cell
    /// Simply returns the stored character (already computed during cell creation)
    pub fn display_char(&self) -> String {
        self.char.clone()
    }

}

/// Staff role for grouping and bracketing in multi-staff systems
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
#[serde(rename_all = "kebab-case")]
pub enum StaffRole {
    /// Standalone staff (not part of a group)
    Melody,
    /// Group header (e.g., "Piano", "Choir")
    GroupHeader,
    /// Member of the group above
    GroupItem,
}

impl Default for StaffRole {
    fn default() -> Self {
        StaffRole::Melody
    }
}

/// Container for musical notation with simplified structure and flattened metadata
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Line {
    /// Array of cells in this line
    pub cells: Vec<Cell>,

    /// Label displayed at the beginning of the line (empty string if not set)
    #[serde(default)]
    pub label: String,

    /// Tala notation string (digits 0-9+ displayed above barlines, empty if not set)
    #[serde(default)]
    pub tala: String,

    /// Lyrics text string displayed below the first pitched element (empty if not set)
    #[serde(default)]
    pub lyrics: String,

    /// Musical tonic for this line (overrides composition tonic, empty if not set)
    #[serde(default)]
    pub tonic: String,

    /// Pitch system for this line (overrides composition pitch system)
    #[serde(default)]
    pub pitch_system: Option<PitchSystem>,

    /// Key signature for this line (sharps/flats affecting pitch interpretation, empty if not set)
    #[serde(default)]
    pub key_signature: String,

    /// Tempo marking for this line (empty if not set)
    #[serde(default)]
    pub tempo: String,

    /// Time signature for this line (empty if not set)
    #[serde(default)]
    pub time_signature: String,

    /// Whether this line starts a new system for grouping
    /// When true, this line begins a new grouped system (e.g., piano grand staff)
    /// All subsequent lines with new_system=false belong to this system
    /// Used for visual grouping with bracket in left margin
    #[serde(default)]
    pub new_system: bool,

    /// System ID for this line (which bracket group it belongs to)
    /// Recalculated whenever new_system flags change
    /// In ungrouped mode: each line gets unique system_id (1, 2, 3...)
    /// In grouped mode: lines with same system_id are bracketed together
    #[serde(default)]
    pub system_id: usize,

    /// Part ID for MusicXML export (unique identifier for this part)
    /// Format: "P1", "P2", "P3", etc.
    /// Recalculated whenever lines are added/removed or new_system changes
    #[serde(default)]
    pub part_id: String,

    /// Staff role for visual grouping and bracketing
    /// Determines if this line is a standalone staff, group header, or group member
    #[serde(default)]
    pub staff_role: StaffRole,

    /// Derived beat spans (calculated, not stored)
    #[serde(skip)]
    pub beats: Vec<BeatSpan>,

    /// Derived slur connections (calculated, not stored)
    #[serde(skip)]
    pub slurs: Vec<SlurSpan>,
}

impl Line {
    /// Create a new empty line with default values
    pub fn new() -> Self {
        Self {
            cells: Vec::new(),
            label: String::new(),
            tala: String::new(),
            lyrics: String::new(),
            tonic: String::new(),
            pitch_system: None,
            key_signature: String::new(), // Empty means inherit from document-level key signature
            tempo: String::new(),
            time_signature: String::new(),
            new_system: false,
            system_id: 0, // Will be recalculated
            part_id: String::new(), // Will be recalculated
            staff_role: StaffRole::default(), // Default to Melody
            beats: Vec::new(),
            slurs: Vec::new(),
        }
    }

    /// Get all cells (for compatibility)
    pub fn get_all_cells(&self) -> &[Cell] {
        &self.cells
    }

    /// Get mutable reference to all cells
    pub fn get_all_cells_mut(&mut self) -> &mut Vec<Cell> {
        &mut self.cells
    }

    /// Get the maximum column index
    pub fn max_column(&self) -> usize {
        self.cells
            .iter()
            .map(|cell| cell.col)
            .max()
            .unwrap_or(0)
    }

    /// Add a Cell to the line
    pub fn add_cell(&mut self, cell: Cell) {
        self.cells.push(cell);
    }

    /// Insert a Cell at a specific position
    pub fn insert_cell(&mut self, cell: Cell, index: usize) {
        self.cells.insert(index, cell);
    }

    /// Remove a Cell at a specific index
    pub fn remove_cell(&mut self, index: usize) -> Option<Cell> {
        if index < self.cells.len() {
            Some(self.cells.remove(index))
        } else {
            None
        }
    }

    /// Clear all Cells
    pub fn clear(&mut self) {
        self.cells.clear();
        self.beats.clear();
        self.slurs.clear();
    }
}

/// Top-level container for musical notation with support for multiple lines and composition-level metadata
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Document {
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

    /// Array of musical lines
    pub lines: Vec<Line>,

    /// Ornament edit mode flag
    #[serde(default)]
    pub ornament_edit_mode: bool,

    /// Annotation layer for slurs, ornaments, etc.
    #[serde(default)]
    pub annotation_layer: crate::text::annotations::AnnotationLayer,

    /// Active scale constraint (mode/maqam/raga filter)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub active_constraint: Option<crate::models::constraints::ScaleConstraint>,

    /// Application state (cursor position, selection, etc.)
    pub state: DocumentState,
}

impl Document {
    /// Create a new empty document
    pub fn new() -> Self {
        Self {
            title: None,
            composer: None,
            tonic: None,
            pitch_system: None,
            key_signature: None,
            created_at: None,  // Timestamps set by JavaScript layer
            modified_at: None,  // Timestamps set by JavaScript layer
            version: None,
            lines: Vec::new(),
            ornament_edit_mode: false,
            annotation_layer: crate::text::annotations::AnnotationLayer::new(),
            active_constraint: None,
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

    /// Get the total number of characters across all lines
    pub fn total_chars(&self) -> usize {
        self.lines
            .iter()
            .map(|line| line.cells.len())
            .sum()
    }

    /// Validate document structure and content
    pub fn validate(&self) -> Result<(), ValidationError> {
        // Ensure all cells have consistent column alignment
        for (line_idx, line) in self.lines.iter().enumerate() {
            let max_col = line.max_column();

            for (cell_idx, cell) in line.cells.iter().enumerate() {
                if cell.col > max_col {
                    return Err(ValidationError::ColumnAlignment {
                        line: line_idx,
                        cell: cell_idx,
                        cell_col: cell.col,
                        max_col,
                    });
                }
            }
        }

        Ok(())
    }

    /// Clear the document
    pub fn clear(&mut self) {
        self.lines.clear();
        self.ornament_edit_mode = false;
        self.state = DocumentState::new();
    }

    /// Toggle ornament edit mode
    pub fn toggle_ornament_edit_mode(&mut self) {
        self.ornament_edit_mode = !self.ornament_edit_mode;
    }

    /// Get the effective pitch system for a line
    pub fn effective_pitch_system(&self, line: &Line) -> PitchSystem {
        // Line-level pitch system takes precedence over document-level
        line.pitch_system
            .or(self.pitch_system)
            .unwrap_or(PitchSystem::Number)
    }

    /// Get the effective tonic for a line
    pub fn effective_tonic<'a>(&'a self, line: &'a Line) -> Option<&'a String> {
        if !line.tonic.is_empty() {
            Some(&line.tonic)
        } else {
            self.tonic.as_ref()
        }
    }

    /// Compute glyphs for all pitched cells based on their pitch codes and effective pitch system
    /// This should be called before serialization to ensure JavaScript receives pre-computed glyphs
    pub fn compute_glyphs(&mut self) {
        // Precompute effective pitch systems for all lines to avoid borrow checker issues
        let effective_systems: Vec<PitchSystem> = self.lines.iter()
            .map(|line| self.effective_pitch_system(line))
            .collect();

        for (line_idx, line) in self.lines.iter_mut().enumerate() {
            let effective_system = effective_systems[line_idx];

            for cell in &mut line.cells {
                if let Some(pitch_code) = cell.pitch_code {
                    // Compute char from pitch code using effective pitch system
                    // Use glyph_for_pitch to get single PUA codepoint instead of ASCII string
                    if let Some(glyph) = crate::renderers::font_utils::glyph_for_pitch(
                        pitch_code,
                        cell.octave,
                        effective_system
                    ) {
                        let char_str = glyph.to_string();
                        #[cfg(target_arch = "wasm32")]
                        {
                            web_sys::console::log_1(&format!("[compute_glyphs] Setting char to U+{:04X} (len={})",
                                glyph as u32, char_str.len()).into());
                        }
                        cell.char = char_str;
                        // CRITICAL: Update cell.pitch_system to match the effective system
                        // This ensures CSS classes and metadata stay in sync with the glyph
                        cell.pitch_system = Some(effective_system);
                    } else {
                        // Fallback to old behavior if glyph not found (shouldn't happen)
                        #[cfg(target_arch = "wasm32")]
                        {
                            web_sys::console::log_1(&format!("[compute_glyphs] WARNING: glyph_for_pitch returned None for {:?}", pitch_code).into());
                        }
                        cell.char = pitch_code.to_string(effective_system);
                        cell.pitch_system = Some(effective_system);
                    }
                }
            }
        }
    }

    /// Recalculate system_id and part_id for all lines based on staff_role
    ///
    /// Algorithm (Solo-Style Single Part for Melody):
    ///
    /// **Part ID Assignment:**
    /// - All `Melody` lines → part_id = "P1" (ONE part with multiple measures)
    /// - `GroupHeader` lines → unique part_id starting from P2
    /// - `GroupItem` lines → unique part_id continuing sequence
    ///
    /// **System ID Assignment:**
    /// - `Melody` lines → each gets unique system_id (1, 2, 3...) for `<print new-system/>`
    /// - `GroupHeader` lines → start new system_id (begins bracket group)
    /// - `GroupItem` lines → continue current system_id (joins bracket group)
    ///
    /// Examples:
    /// - "M M M" → part_id: P1, P1, P1; system_id: 1, 2, 3 → ONE part, measures with new-system
    /// - "G GI GI" → part_id: P2, P3, P4; system_id: 1, 1, 1 → THREE parts bracketed
    /// - "G M M" → part_id: P2, P1, P1; system_id: 1, 2, 3 → Group part P2, then Melody part P1 with 2 measures
    ///
    /// Call this whenever:
    /// - staff_role changes on any line
    /// - Lines are added or removed
    /// - Document is loaded
    pub fn recalculate_system_and_part_ids(&mut self) {
        #[cfg(target_arch = "wasm32")]
        {
            web_sys::console::log_1(&format!("[recalculate_system_and_part_ids] {} lines",
                self.lines.len()).into());
        }

        // First pass: collect staff_roles to detect patterns
        let _staff_roles: Vec<StaffRole> = self.lines.iter().map(|line| line.staff_role).collect();

        let mut system_id = 0;
        let mut next_group_part_id = 2; // Group parts start from P2 (P1 reserved for Melody)

        for (i, line) in self.lines.iter_mut().enumerate() {
            // Determine if this line should start a new system
            let start_new_system = match line.staff_role {
                StaffRole::Melody => true,         // Melody ALWAYS starts new system
                StaffRole::GroupHeader => true,    // GroupHeader starts new system (begins bracket group)
                StaffRole::GroupItem => false,     // GroupItem continues current system (joins bracket group)
            };

            if i == 0 || start_new_system {
                system_id += 1;
            }

            line.system_id = system_id;

            // Assign part_id based on staff_role and context
            match line.staff_role {
                StaffRole::Melody => {
                    line.part_id = "P1".to_string(); // All Melody lines share P1
                }
                StaffRole::GroupHeader => {
                    // GroupHeader always gets unique part_id starting from P2
                    line.part_id = format!("P{}", next_group_part_id);
                    next_group_part_id += 1;
                }
                StaffRole::GroupItem => {
                    line.part_id = format!("P{}", next_group_part_id);
                    next_group_part_id += 1;
                }
            }

            #[cfg(target_arch = "wasm32")]
            {
                web_sys::console::log_1(&format!("  Line {}: staff_role={:?}, system_id={}, part_id={}",
                    i, line.staff_role, line.system_id, line.part_id).into());
            }
        }
    }

    // ==================== Cursor Movement Helpers ====================

    /// Clamp position to valid bounds within document
    pub fn clamp_pos(&self, pos: Pos) -> Pos {
        if self.lines.is_empty() {
            return Pos::origin();
        }

        let line = pos.line.min(self.lines.len() - 1);
        let line_len = self.lines.get(line)
            .map(|l| l.cells.len())
            .unwrap_or(0);
        let col = pos.col.min(line_len);

        Pos::new(line, col)
    }

    /// Move cursor left one position (handles line wrapping)
    pub fn prev_caret(&self, pos: Pos) -> Pos {
        let clamped = self.clamp_pos(pos);

        if clamped.col > 0 {
            // Move left within line
            Pos::new(clamped.line, clamped.col - 1)
        } else if clamped.line > 0 {
            // Wrap to end of previous line
            let prev_line = clamped.line - 1;
            let prev_line_len = self.lines.get(prev_line)
                .map(|l| l.cells.len())
                .unwrap_or(0);
            Pos::new(prev_line, prev_line_len)
        } else {
            // Already at start of document
            clamped
        }
    }

    /// Move cursor right one position (handles line wrapping)
    pub fn next_caret(&self, pos: Pos) -> Pos {
        let clamped = self.clamp_pos(pos);

        if let Some(line) = self.lines.get(clamped.line) {
            if clamped.col < line.cells.len() {
                // Move right within line
                Pos::new(clamped.line, clamped.col + 1)
            } else if clamped.line + 1 < self.lines.len() {
                // Wrap to start of next line
                Pos::new(clamped.line + 1, 0)
            } else {
                // Already at end of document
                clamped
            }
        } else {
            clamped
        }
    }

    /// Move cursor up one line (preserving desired column)
    pub fn caret_up(&self, pos: Pos, desired_col: usize) -> Pos {
        let clamped = self.clamp_pos(pos);

        if clamped.line > 0 {
            let target_line = clamped.line - 1;
            let target_line_len = self.lines.get(target_line)
                .map(|l| l.cells.len())
                .unwrap_or(0);
            let target_col = desired_col.min(target_line_len);
            Pos::new(target_line, target_col)
        } else {
            // Already at top
            clamped
        }
    }

    /// Move cursor down one line (preserving desired column)
    pub fn caret_down(&self, pos: Pos, desired_col: usize) -> Pos {
        let clamped = self.clamp_pos(pos);

        if clamped.line + 1 < self.lines.len() {
            let target_line = clamped.line + 1;
            let target_line_len = self.lines.get(target_line)
                .map(|l| l.cells.len())
                .unwrap_or(0);
            let target_col = desired_col.min(target_line_len);
            Pos::new(target_line, target_col)
        } else {
            // Already at bottom
            clamped
        }
    }

    /// Move cursor to start of current line
    pub fn caret_line_start(&self, pos: Pos) -> Pos {
        let clamped = self.clamp_pos(pos);
        Pos::new(clamped.line, 0)
    }

    /// Move cursor to end of current line
    pub fn caret_line_end(&self, pos: Pos) -> Pos {
        let clamped = self.clamp_pos(pos);
        if let Some(line) = self.lines.get(clamped.line) {
            Pos::new(clamped.line, line.cells.len())
        } else {
            clamped
        }
    }
}

/// Application state including cursor position, selection, and focus information
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
pub struct DocumentState {
    /// Current cursor position (line index, column)
    #[serde(default)]
    pub cursor: CursorPosition,

    /// Selection manager for handling selection operations
    #[serde(default)]
    pub selection_manager: SelectionManager,

    /// Primary selection register (X11 style - for middle-click paste)
    #[serde(default)]
    pub primary_selection: PrimarySelection,

    /// Currently focused element ID
    #[serde(default)]
    pub focused_element: Option<String>,

    /// Focus state of the editor
    #[serde(default)]
    pub has_focus: bool,

    /// Undo/redo command stack
    #[serde(default)]
    pub undo_stack: UndoStack,

    /// Performance and rendering state
    #[serde(default)]
    pub render_state: RenderState,
}

impl DocumentState {
    /// Create new document state
    pub fn new() -> Self {
        Self {
            cursor: Pos::origin(),
            selection_manager: SelectionManager::new(),
            primary_selection: PrimarySelection::default(),
            focused_element: None,
            has_focus: false,
            undo_stack: UndoStack::default(),
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

    /// Create an EditorDiff from current state (needs document ref for cell data)
    pub fn to_editor_diff(&self, document: &Document, dirty_line_indices: Vec<usize>) -> crate::models::EditorDiff {
        use crate::models::{EditorDiff, CaretInfo, SelectionInfo};
        use crate::api::types::DirtyLine;

        // Convert line indices to DirtyLine with cell data
        let dirty_lines: Vec<DirtyLine> = dirty_line_indices
            .into_iter()
            .filter_map(|row| {
                document.lines.get(row).map(|line| DirtyLine {
                    row,
                    cells: line.cells.clone(),
                })
            })
            .collect();

        EditorDiff {
            dirty_lines,
            caret: CaretInfo {
                caret: self.cursor,
                desired_col: self.selection_manager.desired_col,
            },
            selection: self.selection_manager.current_selection.as_ref()
                .map(|sel| SelectionInfo::from_selection(sel)),
        }
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

    /// Update primary selection register with new content
    pub fn update_primary_selection(&mut self, text: String, cells: Vec<Cell>, selection: Selection) {
        self.primary_selection = PrimarySelection {
            text,
            cells,
            selection,
        };
    }

    /// Get current primary selection
    pub fn get_primary_selection(&self) -> &PrimarySelection {
        &self.primary_selection
    }
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
    /// Current selection state (using anchor/head model)
    pub current_selection: Option<Selection>,

    /// Selection mode (normal, word, line, etc.)
    pub mode: SelectionMode,

    /// Desired column for vertical movement
    pub desired_col: usize,
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
            mode: SelectionMode::Normal,
            desired_col: 0,
        }
    }

    /// Start a new selection at the given position
    pub fn start_selection(&mut self, position: Pos) {
        self.current_selection = Some(Selection::empty_at(position));
    }

    /// Extend selection to a new position (updates head)
    pub fn extend_selection(&mut self, position: &Pos) {
        if let Some(selection) = &mut self.current_selection {
            selection.head = *position;
        } else {
            // If no selection exists, create one
            self.current_selection = Some(Selection::empty_at(*position));
        }
    }

    /// Set selection with explicit anchor and head
    pub fn set_selection(&mut self, anchor: Pos, head: Pos) {
        self.current_selection = Some(Selection::new(anchor, head));
    }

    /// Clear current selection
    pub fn clear_selection(&mut self) {
        self.current_selection = None;
    }

    /// Get current selection
    pub fn get_selection(&self) -> Option<&Selection> {
        self.current_selection.as_ref()
    }

    /// Check if selection is active (non-empty)
    pub fn is_active(&self) -> bool {
        self.current_selection
            .as_ref()
            .map(|s| !s.is_empty())
            .unwrap_or(false)
    }

    /// Get selected range (normalized)
    pub fn get_range(&self) -> Option<Range> {
        self.current_selection.as_ref().map(|s| {
            let (start, end) = s.range();
            Range::new(start.col, end.col)
        })
    }

    /// Check if a position is within the current selection
    pub fn contains_position(&self, position: &Pos) -> bool {
        self.current_selection
            .as_ref()
            .map(|s| s.contains(position))
            .unwrap_or(false)
    }

    /// Validate selection against document bounds
    pub fn validate_selection(&self, document: &Document) -> bool {
        if let Some(selection) = &self.current_selection {
            let (start, end) = selection.range();

            // Check bounds for each line
            if start.line >= document.lines.len() || end.line >= document.lines.len() {
                return false;
            }

            // For single-line selection
            if start.line == end.line {
                if let Some(line) = document.lines.get(start.line) {
                    let max_col = line.cells.len();
                    if start.col > max_col || end.col > max_col {
                        return false;
                    }
                }
            }
        }
        true
    }

    /// Get selected text from document
    pub fn get_selected_text(&self, document: &Document) -> String {
        if let Some(selection) = &self.current_selection {
            if selection.is_empty() {
                return String::new();
            }

            let (start, end) = selection.range();

            // Single-line selection
            if start.line == end.line {
                if let Some(line) = document.lines.get(start.line) {
                    return line.cells.iter()
                        .filter(|cell| cell.col >= start.col && cell.col < end.col)
                        .map(|cell| cell.char.clone())
                        .collect::<Vec<String>>()
                        .join("");
                }
            }
        }
        String::new()
    }

    /// Select all content in the current line
    pub fn select_all(&mut self, document: &Document, current_line: usize) {
        if let Some(line) = document.lines.get(current_line) {
            if line.cells.is_empty() {
                return;
            }

            let start_col = 0;
            let end_col = line.cells.len();

            let anchor = Pos::new(current_line, start_col);
            let head = Pos::new(current_line, end_col);
            self.current_selection = Some(Selection::new(anchor, head));
            self.mode = SelectionMode::All;
        }
    }

    /// Select word at cursor position
    pub fn select_word(&mut self, position: &Pos, document: &Document) {
        if let Some(line) = document.active_line() {
            // Find word boundaries around the cursor position
            let mut start_col = position.col;
            let mut end_col = position.col;

            // Find start of word (go left until non-temporal character)
            for cell in line.cells.iter().rev() {
                if cell.col < position.col && cell.is_temporal() {
                    start_col = cell.col;
                } else {
                    break;
                }
            }

            // Find end of word (go right until non-temporal character)
            for cell in line.cells.iter() {
                if cell.col >= position.col && cell.is_temporal() {
                    end_col = cell.col + cell.token_length();
                } else if cell.col > position.col {
                    break;
                }
            }

            let anchor = Pos::new(position.line, start_col);
            let head = Pos::new(position.line, end_col);
            self.current_selection = Some(Selection::new(anchor, head));
            self.mode = SelectionMode::Word;
        }
    }
}

/// Errors that can occur during document validation
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub enum ValidationError {
    /// Column alignment mismatch
    ColumnAlignment {
        line: usize,
        cell: usize,
        cell_col: usize,
        max_col: usize,
    },

    /// Invalid pitch notation
    InvalidPitch {
        line: usize,
        column: usize,
        pitch: String,
    },

    /// Invalid character encoding
    InvalidEncoding {
        line: usize,
        column: usize,
        char: String,
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
            ValidationError::ColumnAlignment { line, cell, cell_col, max_col } => {
                format!("Column alignment error at line {}, cell {}: column {} exceeds maximum {}",
                       line, cell, cell_col, max_col)
            },
            ValidationError::InvalidPitch { line, column, pitch } => {
                format!("Invalid pitch notation '{}' at line {}, column {}", pitch, line, column)
            },
            ValidationError::InvalidEncoding { line, column, char } => {
                format!("Invalid character encoding '{}' at line {}, column {}", char, line, column)
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
mod chrono {}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_line_serialization_includes_null_fields() {
        let line = Line::new();
        let json = serde_json::to_string_pretty(&line).unwrap();
        println!("Serialized Line:\n{}", json);

        // Check that null fields are present in JSON
        assert!(json.contains("\"label\""), "label field should be present");
        assert!(json.contains("\"tonic\""), "tonic field should be present");
        assert!(json.contains("\"lyrics\""), "lyrics field should be present");
        assert!(json.contains("\"tala\""), "tala field should be present");
        assert!(json.contains("\"pitch_system\""), "pitch_system field should be present");
        assert!(json.contains("\"key_signature\""), "key_signature field should be present");
    }

    // TDD Tests for Cell.ornament refactoring (Vec<Ornament> -> Option<Ornament>)

    #[test]
    fn test_cell_has_ornament_option() {
        use crate::models::elements::{Ornament, OrnamentPlacement};

        // Create base cell (anchor note)
        let mut cell = Cell::new("G".to_string(), ElementKind::PitchedElement, 0);

        // Initially no ornament
        assert!(cell.ornament.is_none(), "Cell should start with no ornament");

        // Create ornament cells
        let orn_cells = vec![
            Cell::new("r".to_string(), ElementKind::PitchedElement, 0),
            Cell::new("g".to_string(), ElementKind::PitchedElement, 1),
        ];

        // Attach ornament
        cell.ornament = Some(Ornament {
            cells: orn_cells,
            placement: OrnamentPlacement::Before,
        });

        // Verify structure
        assert!(cell.ornament.is_some(), "Cell should have ornament after assignment");
        let orn = cell.ornament.as_ref().unwrap();
        assert_eq!(orn.cells.len(), 2, "Ornament should have 2 cells");
        assert_eq!(orn.placement, OrnamentPlacement::Before, "Ornament placement should be Before");
    }

    #[test]
    fn test_ornament_placement_change() {
        use crate::models::elements::{Ornament, OrnamentPlacement};

        let mut cell = Cell::new("G".to_string(), ElementKind::PitchedElement, 0);

        // Add ornament with "Before" placement
        cell.ornament = Some(Ornament {
            cells: vec![Cell::new("r".to_string(), ElementKind::PitchedElement, 0)],
            placement: OrnamentPlacement::Before,
        });

        // Change placement
        if let Some(ref mut orn) = cell.ornament {
            orn.placement = OrnamentPlacement::After;
        }

        // Verify change
        assert_eq!(
            cell.ornament.as_ref().unwrap().placement,
            OrnamentPlacement::After,
            "Ornament placement should be After"
        );
    }

    #[test]
    fn test_clear_ornament() {
        use crate::models::elements::{Ornament, OrnamentPlacement};

        let mut cell = Cell::new("G".to_string(), ElementKind::PitchedElement, 0);

        // Add ornament
        cell.ornament = Some(Ornament {
            cells: vec![Cell::new("r".to_string(), ElementKind::PitchedElement, 0)],
            placement: OrnamentPlacement::Before,
        });

        assert!(cell.ornament.is_some(), "Cell should have ornament");

        // Clear ornament
        cell.ornament = None;

        assert!(cell.ornament.is_none(), "Cell ornament should be cleared");
    }

    #[test]
    fn test_paste_ornament_with_cursor_after_note() {
        use crate::models::elements::{Ornament, OrnamentPlacement};

        // SCENARIO: User types "S" (cursor now at position 1, after the note)
        // User pastes ornament "rg"
        // EXPECTED: Ornament attaches to the S note (cell at index 0)
        // MISTAKE: Current implementation uses cursor position (1) as cell_index,
        //          which would try to attach to a non-existent cell

        let mut line = Line::new();

        // User typed "S" - cursor is now at position 1 (after S)
        line.cells.push(Cell::new("S".to_string(), ElementKind::PitchedElement, 0));
        let cursor_position = 1; // Cursor is AFTER the note

        // Calculate target cell index: cursor position 1 means we just typed cell 0
        // So we should attach to cell_index = cursor_position - 1 = 0
        let target_cell_index = if cursor_position > 0 {
            cursor_position - 1
        } else {
            0
        };

        assert_eq!(target_cell_index, 0, "Should target the note we just typed");

        // Create ornament from pasted notation "rg"
        let ornament_cells = vec![
            Cell::new("r".to_string(), ElementKind::PitchedElement, 0),
            Cell::new("g".to_string(), ElementKind::PitchedElement, 1),
        ];

        // Attach ornament to the correct cell (the S note)
        line.cells[target_cell_index].ornament = Some(Ornament {
            cells: ornament_cells,
            placement: OrnamentPlacement::Before,
        });

        // VERIFY: S note (cell 0) should have the ornament
        assert!(
            line.cells[0].ornament.is_some(),
            "Note 'S' should have ornament attached"
        );

        let ornament = line.cells[0].ornament.as_ref().unwrap();
        assert_eq!(ornament.cells.len(), 2, "Ornament should have 2 cells (r, g)");
        assert_eq!(ornament.cells[0].char, "r", "First ornament cell should be 'r'");
        assert_eq!(ornament.cells[1].char, "g", "Second ornament cell should be 'g'");
        assert_eq!(ornament.placement, OrnamentPlacement::Before, "Default placement should be Before");
    }

    #[test]
    fn test_staff_role_system_id_assignment_g_m_m() {
        // Test "G M M" pattern: GroupHeader + Melody + Melody → THREE SEPARATE SYSTEMS (no brackets)
        let mut doc = Document::new();

        // Add three lines with different roles
        let mut line1 = Line::new();
        line1.label = "Strings".to_string();
        line1.staff_role = StaffRole::GroupHeader;
        doc.lines.push(line1);

        let mut line2 = Line::new();
        line2.label = "Violin I".to_string();
        line2.staff_role = StaffRole::Melody;
        doc.lines.push(line2);

        let mut line3 = Line::new();
        line3.label = "Violin II".to_string();
        line3.staff_role = StaffRole::Melody;
        doc.lines.push(line3);

        // Recalculate system IDs based on staff roles
        doc.recalculate_system_and_part_ids();

        // VERIFY: Each line should have a different system_id (separate systems, NO brackets)
        assert_eq!(doc.lines[0].system_id, 1, "GroupHeader should be system 1");
        assert_eq!(doc.lines[1].system_id, 2, "First Melody should be system 2 (separate)");
        assert_eq!(doc.lines[2].system_id, 3, "Second Melody should be system 3 (separate)");

        // VERIFY: Part IDs - GroupHeader gets P2, Melody lines share P1
        assert_eq!(doc.lines[0].part_id, "P2", "GroupHeader should be P2");
        assert_eq!(doc.lines[1].part_id, "P1", "First Melody should be P1");
        assert_eq!(doc.lines[2].part_id, "P1", "Second Melody should be P1");
    }

    #[test]
    fn test_staff_role_system_id_assignment_g_gi_gi() {
        // Test "G GI GI" pattern: GroupHeader + GroupItem + GroupItem → ONE BRACKETED SYSTEM
        let mut doc = Document::new();

        // Add three lines: GroupHeader followed by two GroupItems
        let mut line1 = Line::new();
        line1.label = "Strings".to_string();
        line1.staff_role = StaffRole::GroupHeader;
        doc.lines.push(line1);

        let mut line2 = Line::new();
        line2.label = "Violin I".to_string();
        line2.staff_role = StaffRole::GroupItem;
        doc.lines.push(line2);

        let mut line3 = Line::new();
        line3.label = "Violin II".to_string();
        line3.staff_role = StaffRole::GroupItem;
        doc.lines.push(line3);

        // Recalculate system IDs based on staff roles
        doc.recalculate_system_and_part_ids();

        // VERIFY: All three lines should have the SAME system_id (bracketed group)
        assert_eq!(doc.lines[0].system_id, 1, "GroupHeader should be system 1");
        assert_eq!(doc.lines[1].system_id, 1, "First GroupItem should be system 1 (same as header)");
        assert_eq!(doc.lines[2].system_id, 1, "Second GroupItem should be system 1 (same as header)");

        // VERIFY: Part IDs - Group lines get unique IDs starting from P2
        assert_eq!(doc.lines[0].part_id, "P2", "GroupHeader should be P2");
        assert_eq!(doc.lines[1].part_id, "P3", "First GroupItem should be P3");
        assert_eq!(doc.lines[2].part_id, "P4", "Second GroupItem should be P4");
    }

    #[test]
    fn test_staff_role_system_id_assignment_m_m_m() {
        // Test "M M M" pattern: Three Melody lines → THREE SEPARATE SYSTEMS
        let mut doc = Document::new();

        // Add three Melody lines
        for i in 0..3 {
            let mut line = Line::new();
            line.label = format!("Staff {}", i + 1);
            line.staff_role = StaffRole::Melody;
            doc.lines.push(line);
        }

        // Recalculate system IDs based on staff roles
        doc.recalculate_system_and_part_ids();

        // VERIFY: Each Melody line should have a different system_id
        assert_eq!(doc.lines[0].system_id, 1, "First Melody should be system 1");
        assert_eq!(doc.lines[1].system_id, 2, "Second Melody should be system 2");
        assert_eq!(doc.lines[2].system_id, 3, "Third Melody should be system 3");

        // VERIFY: Part IDs - All Melody lines share P1 (solo-style)
        assert_eq!(doc.lines[0].part_id, "P1", "First Melody should be P1");
        assert_eq!(doc.lines[1].part_id, "P1", "Second Melody should be P1");
        assert_eq!(doc.lines[2].part_id, "P1", "Third Melody should be P1");
    }
}
