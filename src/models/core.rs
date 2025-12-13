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
#[derive(Clone, Debug, PartialEq)]
pub struct Cell {
    /// The Unicode codepoint for this cell's character.
    /// Primary storage - line variants (slur markers, beat groups) are encoded directly.
    /// Use CodepointTransform trait for bit manipulation.
    pub codepoint: u32,

    /// Legacy string field - derived from codepoint for backward compatibility
    /// Will be deprecated once migration is complete.
    /// TODO: Remove after full migration to codepoint-based API
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

    /// Whether this cell is a superscript (grace note / ornament)
    /// Superscript pitches are rhythm-transparent and rendered at 50% scale
    /// This is the semantic source of truth; cell.char is derived at render time
    pub superscript: bool,

    /// Underline state for beat grouping (derived, not saved)
    /// Computed by draw_beat_groups() from beat spans
    pub underline: UnderlineState,

    /// Overline state for slurs (derived, not saved)
    /// Computed by draw_slurs() from SlurIndicator markers
    pub overline: OverlineState,

    /// Layout cache properties (calculated at render time) - ephemeral, not saved
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,

    /// Bounding box for hit testing (left, top, right, bottom) - ephemeral, not saved
    pub bbox: (f32, f32, f32, f32),

    /// Hit testing area (may be larger than bbox for interaction) - ephemeral, not saved
    pub hit: (f32, f32, f32, f32),
}

/// Custom serialization for Cell that includes computed char_info
impl Serialize for Cell {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeStruct;
        let mut state = serializer.serialize_struct("Cell", 13)?;
        state.serialize_field("codepoint", &self.codepoint)?;
        state.serialize_field("char", &self.char)?;
        state.serialize_field("kind", &self.kind)?;
        state.serialize_field("col", &self.col)?;
        state.serialize_field("flags", &self.flags)?;
        state.serialize_field("pitch_code", &self.pitch_code)?;
        state.serialize_field("pitch_system", &self.pitch_system)?;
        state.serialize_field("octave", &self.octave)?;
        state.serialize_field("superscript", &self.superscript)?;
        state.serialize_field("underline", &self.underline)?;
        state.serialize_field("overline", &self.overline)?;
        // Computed field for debug inspection
        state.serialize_field("char_info", &self.decode_char())?;
        state.end()
    }
}

/// Custom deserialization for Cell (ignores char_info)
impl<'de> Deserialize<'de> for Cell {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        #[derive(Deserialize)]
        struct CellData {
            #[serde(default)]
            codepoint: Option<u32>,
            char: String,
            kind: ElementKind,
            col: usize,
            flags: u8,
            pitch_code: Option<PitchCode>,
            pitch_system: Option<PitchSystem>,
            octave: i8,
            #[serde(default)]
            superscript: bool,
            // char_info is ignored on deserialization
        }

        let data = CellData::deserialize(deserializer)?;
        // Use codepoint if provided, otherwise derive from char
        let codepoint = data.codepoint
            .unwrap_or_else(|| data.char.chars().next().map(|c| c as u32).unwrap_or(0));
        Ok(Cell {
            codepoint,
            char: data.char,
            kind: data.kind,
            col: data.col,
            flags: data.flags,
            pitch_code: data.pitch_code,
            pitch_system: data.pitch_system,
            octave: data.octave,
            superscript: data.superscript,
            underline: UnderlineState::None,
            overline: OverlineState::None,
            x: 0.0,
            y: 0.0,
            w: 0.0,
            h: 0.0,
            bbox: (0.0, 0.0, 0.0, 0.0),
            hit: (0.0, 0.0, 0.0, 0.0),
        })
    }
}

impl Default for Cell {
    fn default() -> Self {
        Self {
            codepoint: ' ' as u32,
            char: " ".to_string(),
            kind: ElementKind::Whitespace,
            col: 0,
            flags: 0,
            pitch_code: None,
            pitch_system: None,
            octave: 0,
            superscript: false,
            underline: UnderlineState::None,
            overline: OverlineState::None,
            x: 0.0,
            y: 0.0,
            w: 0.0,
            h: 0.0,
            bbox: (0.0, 0.0, 0.0, 0.0),
            hit: (0.0, 0.0, 0.0, 0.0),
        }
    }
}

impl Cell {
    /// Create a new Cell from a codepoint
    pub fn new(char: String, kind: ElementKind, col: usize) -> Self {
        let codepoint = char.chars().next().map(|c| c as u32).unwrap_or(0);
        Self {
            codepoint,
            char,
            kind,
            col,
            flags: 0,
            pitch_code: None,
            pitch_system: None,
            octave: 0,
            superscript: false,
            underline: UnderlineState::None,
            overline: OverlineState::None,
            x: 0.0,
            y: 0.0,
            w: 0.0,
            h: 0.0,
            bbox: (0.0, 0.0, 0.0, 0.0),
            hit: (0.0, 0.0, 0.0, 0.0),
        }
    }

    /// Create a new Cell from a u32 codepoint directly
    pub fn from_codepoint(codepoint: u32, kind: ElementKind, col: usize) -> Self {
        let char = char::from_u32(codepoint)
            .map(|c| c.to_string())
            .unwrap_or_else(|| "?".to_string());
        Self {
            codepoint,
            char,
            kind,
            col,
            flags: 0,
            pitch_code: None,
            pitch_system: None,
            octave: 0,
            superscript: false,
            underline: UnderlineState::None,
            overline: OverlineState::None,
            x: 0.0,
            y: 0.0,
            w: 0.0,
            h: 0.0,
            bbox: (0.0, 0.0, 0.0, 0.0),
            hit: (0.0, 0.0, 0.0, 0.0),
        }
    }

    /// Sync char field from codepoint (call after modifying codepoint)
    pub fn sync_char(&mut self) {
        self.char = char::from_u32(self.codepoint)
            .map(|c| c.to_string())
            .unwrap_or_else(|| "?".to_string());
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

    /// Set slur start marker in codepoint (overline Left)
    pub fn set_slur_start(&mut self) {
        use crate::renderers::font_utils::CodepointTransform;
        use crate::renderers::line_variants::OverlineState;
        self.codepoint = self.codepoint.set_overline(OverlineState::Left);
        self.overline = OverlineState::Left;
        self.sync_char();
    }

    /// Set slur end marker in codepoint (overline Right)
    pub fn set_slur_end(&mut self) {
        use crate::renderers::font_utils::CodepointTransform;
        use crate::renderers::line_variants::OverlineState;
        self.codepoint = self.codepoint.set_overline(OverlineState::Right);
        self.overline = OverlineState::Right;
        self.sync_char();
    }

    /// Clear slur marker from codepoint
    pub fn clear_slur(&mut self) {
        use crate::renderers::font_utils::CodepointTransform;
        use crate::renderers::line_variants::OverlineState;
        self.codepoint = self.codepoint.set_overline(OverlineState::None);
        self.overline = OverlineState::None;
        self.sync_char();
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

    /// Check if this cell is a superscript (grace note)
    ///
    /// Superscript pitches are rhythm-transparent and attach to adjacent normal pitches.
    /// Returns the semantic `superscript` field (not derived from codepoint).
    pub fn is_superscript(&self) -> bool {
        self.superscript
    }

    /// Get the codepoint (direct field access)
    pub fn get_codepoint(&self) -> u32 {
        self.codepoint
    }

    /// Set codepoint and sync char field
    pub fn set_codepoint(&mut self, cp: u32) {
        self.codepoint = cp;
        self.sync_char();
    }

    /// Check if this cell has a slur marker (start or end)
    pub fn has_slur(&self) -> bool {
        use crate::renderers::font_utils::CodepointTransform;
        self.codepoint.slur_left() || self.codepoint.slur_right()
    }

    /// Check if this cell starts a slur (overline Left)
    pub fn is_slur_start(&self) -> bool {
        use crate::renderers::font_utils::CodepointTransform;
        self.codepoint.slur_left()
    }

    /// Check if this cell ends a slur (overline Right)
    pub fn is_slur_end(&self) -> bool {
        use crate::renderers::font_utils::CodepointTransform;
        self.codepoint.slur_right()
    }

    /// Get the display character for this cell
    /// Returns char which now includes line variants directly encoded as PUA codepoints
    pub fn display_char(&self) -> String {
        self.char.clone()
    }

    /// Decode the character into its component information
    ///
    /// Returns a `CharInfo` struct containing:
    /// - codepoint, pitch_code, pitch_system, octave
    /// - underline/overline states, superscript flag
    pub fn decode_char(&self) -> CharInfo {
        CharInfo::from_cell(self)
    }
}

// ============================================================================
// CHARACTER INFO - Decoded character information
// ============================================================================

// Re-export line variant types from renderers
pub use crate::renderers::line_variants::{UnderlineState, OverlineState};

/// Fully decoded character information from a cell's codepoint
///
/// This struct extracts all semantic information encoded in a PUA codepoint:
/// - The raw codepoint value
/// - Pitch information (pitch_code, octave)
/// - Display system (Number, Western, Sargam, Doremi)
/// - Line decorations (underline for beats, overline for slurs)
/// - Superscript status (grace notes)
///
/// # Architecture
///
/// The NotationFont uses PUA codepoints to encode multiple properties:
/// - 0xE000-0xE6FF: Pitch variants (pitch + octave + accidental)
/// - 0xE800-0xEBFF: Line variants (underline/overline combinations)
/// - 0x1A000-0x1FFFF: Combined pitch + line variants
/// - 0xF8000-0xFE03F: Superscript variants (grace notes at 50% scale)
///
/// # Example
/// ```
/// let cell = Cell::new("1".to_string(), ElementKind::PitchedElement, 0);
/// let info = cell.decode_char();
/// assert_eq!(info.pitch_code, Some(PitchCode::N1));
/// assert_eq!(info.octave, 0);
/// ```
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct CharInfo {
    /// The Unicode codepoint of the character
    pub codepoint: u32,

    /// The base ASCII character this represents ('1', '2', 'S', '-', etc.)
    pub base_char: char,

    /// Pitch code if this is a pitched element
    pub pitch_code: Option<PitchCode>,

    /// Pitch system used to interpret this character
    pub pitch_system: Option<PitchSystem>,

    /// Octave offset (-2 to +2), 0 for base octave or non-pitched
    pub octave: i8,

    /// Underline state for beat grouping
    pub underline: UnderlineState,

    /// Overline state for slurs
    pub overline: OverlineState,
}

impl Default for CharInfo {
    fn default() -> Self {
        Self {
            codepoint: 0,
            base_char: ' ',
            pitch_code: None,
            pitch_system: None,
            octave: 0,
            underline: UnderlineState::None,
            overline: OverlineState::None,
        }
    }
}

impl CharInfo {
    /// Create CharInfo from a Cell
    ///
    /// Uses compile-time generated decoding from atoms.yaml.
    pub fn from_cell(cell: &Cell) -> Self {
        use crate::renderers::font_utils::decode_codepoint;

        let codepoint = cell.codepoint;
        let pitch_system = cell.pitch_system;

        let (underline, overline, base_cp) = if let Some(decoded) = decode_codepoint(codepoint) {
            (decoded.underline, decoded.overline, decoded.base_cp)
        } else {
            (UnderlineState::None, OverlineState::None, codepoint)
        };

        // Convert base_cp back to displayable ASCII character
        let base_char = Self::extract_base_char(base_cp, pitch_system);

        Self {
            codepoint,
            base_char,
            pitch_code: cell.pitch_code,
            pitch_system,
            octave: cell.octave,
            underline,
            overline,
        }
    }

    /// Create CharInfo from a raw codepoint
    ///
    /// Uses compile-time generated lookup tables for O(1) decoding.
    /// All decoding logic is generated from atoms.yaml at build time.
    pub fn from_codepoint(cp: u32, pitch_system: Option<PitchSystem>) -> Self {
        use crate::renderers::font_utils::{pitch_from_glyph, decode_codepoint};

        // Use generated decoder for line variants
        let decoded = decode_codepoint(cp);
        let (underline, overline, base_cp) = decoded
            .map(|d| (d.underline, d.overline, d.base_cp))
            .unwrap_or((UnderlineState::None, OverlineState::None, cp));

        // Use compile-time lookup tables for pitch decoding
        let base_char = char::from_u32(base_cp).unwrap_or(' ');
        let system = pitch_system.unwrap_or(PitchSystem::Number);
        let (pitch_code, octave) = pitch_from_glyph(base_char, system)
            .map(|(pc, oct)| (Some(pc), oct))
            .unwrap_or((None, 0));

        Self {
            codepoint: cp,
            base_char: Self::extract_base_char(base_cp, pitch_system),
            pitch_code,
            pitch_system,
            octave,
            underline,
            overline,
        }
    }

    /// Check if this represents a pitched element
    pub fn is_pitched(&self) -> bool {
        self.pitch_code.is_some()
    }

    /// Check if this has any line decorations
    pub fn has_lines(&self) -> bool {
        self.underline != UnderlineState::None || self.overline != OverlineState::None
    }

    /// Extract base ASCII character from a codepoint
    fn extract_base_char(cp: u32, pitch_system: Option<PitchSystem>) -> char {
        use crate::renderers::font_utils::pitch_from_glyph;

        // ASCII range - return directly
        if cp >= 0x20 && cp <= 0x7E {
            return char::from_u32(cp).unwrap_or(' ');
        }

        // Try to decode as pitch and get base char
        let ch = char::from_u32(cp).unwrap_or(' ');
        let system = pitch_system.unwrap_or(PitchSystem::Number);

        if let Some((pitch_code, _octave)) = pitch_from_glyph(ch, system) {
            // Convert pitch code back to base char
            let degree = pitch_code.degree();
            return match system {
                PitchSystem::Number => char::from_digit(degree as u32, 10).unwrap_or('?'),
                PitchSystem::Western => match degree {
                    1 => 'C', 2 => 'D', 3 => 'E', 4 => 'F',
                    5 => 'G', 6 => 'A', 7 => 'B', _ => '?',
                },
                PitchSystem::Sargam => match degree {
                    1 => 'S', 2 => 'R', 3 => 'G', 4 => 'M',
                    5 => 'P', 6 => 'D', 7 => 'N', _ => '?',
                },
                _ => char::from_digit(degree as u32, 10).unwrap_or('?'),
            };
        }

        // Default: return the character directly
        ch
    }
}

/// Staff role for grouping and bracketing in multi-staff systems
/// DEPRECATED: Use SystemMarker instead. Kept for backward compatibility.
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

/// System marker for grouping lines into bracketed systems
/// Uses LilyPond-style `<<` and `>>` notation
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
#[serde(rename_all = "kebab-case")]
pub enum SystemMarker {
    /// `<<` - Start a new bracketed system group
    Start,
    /// `>>` - End the current bracketed system group
    End,
}

impl SystemMarker {
    /// Get the display string for this marker
    pub fn as_str(&self) -> &'static str {
        match self {
            SystemMarker::Start => "<<",
            SystemMarker::End => ">>",
        }
    }

    /// Parse from string
    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "<<" | "start" => Some(SystemMarker::Start),
            ">>" | "end" => Some(SystemMarker::End),
            _ => None,
        }
    }
}

/// Container for musical notation with simplified structure and flattened metadata
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Line {
    /// Array of cells in this line
    pub cells: Vec<Cell>,

    /// Text representation as base glyphs (codepoints)
    /// This is the new canonical storage - cursor = index into this Vec
    /// During migration: synced with cells, eventually replaces cells
    #[serde(skip)]
    pub text: Vec<char>,

    /// Label displayed at the beginning of the line (empty string if not set)
    #[serde(default)]
    pub label: String,

    /// Tala notation string (digits 0-9+ displayed above barlines, empty if not set)
    #[serde(default)]
    pub tala: String,

    /// Lyrics text string displayed below the first pitched element (empty if not set)
    #[serde(default)]
    pub lyrics: String,

    /// Musical tonic for this line (overrides composition tonic)
    #[serde(default)]
    pub tonic: Option<crate::models::Tonic>,

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
    /// DEPRECATED: Use system_marker instead. Kept for backward compatibility.
    #[serde(default)]
    pub staff_role: StaffRole,

    /// System marker for grouping lines into bracketed systems
    /// - `Some(Start)` = `<<` - this line starts a new bracketed group
    /// - `Some(End)` = `>>` - this line ends the current bracketed group
    /// - `None` = no marker (standalone line, or continues current group)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub system_marker: Option<SystemMarker>,

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
            text: Vec::new(),
            label: String::new(),
            tala: String::new(),
            lyrics: String::new(),
            tonic: None,
            pitch_system: None,
            key_signature: String::new(), // Empty means inherit from document-level key signature
            tempo: String::new(),
            time_signature: String::new(),
            new_system: false,
            system_id: 0, // Will be recalculated
            part_id: String::new(), // Will be recalculated
            staff_role: StaffRole::default(), // DEPRECATED: use system_marker
            system_marker: None, // No marker = standalone or continue group
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
        // Sync text: extract first char from cell
        if let Some(ch) = cell.char.chars().next() {
            self.text.push(ch);
        }
        self.cells.push(cell);
    }

    /// Insert a Cell at a specific position
    pub fn insert_cell(&mut self, cell: Cell, index: usize) {
        // Sync text: insert char at same position
        if let Some(ch) = cell.char.chars().next() {
            if index <= self.text.len() {
                self.text.insert(index, ch);
            }
        }
        self.cells.insert(index, cell);
    }

    /// Remove a Cell at a specific index
    pub fn remove_cell(&mut self, index: usize) -> Option<Cell> {
        if index < self.cells.len() {
            // Sync text: remove char at same position
            if index < self.text.len() {
                self.text.remove(index);
            }
            Some(self.cells.remove(index))
        } else {
            None
        }
    }

    /// Clear all Cells
    pub fn clear(&mut self) {
        self.cells.clear();
        self.text.clear();
        self.beats.clear();
        self.slurs.clear();
    }

    /// Sync text Vec<char> from cells
    /// Extracts base glyph from each cell's char field
    pub fn sync_text_from_cells(&mut self) {
        self.text = self.cells.iter()
            .filter_map(|cell| cell.char.chars().next())
            .collect();
    }

    /// Sync cells from text Vec<char>
    /// Creates basic cells from glyphs (for compatibility during migration)
    pub fn sync_cells_from_text(&mut self, pitch_system: PitchSystem) {
        use crate::renderers::font_utils::pitch_from_glyph;
        use crate::models::ElementKind;

        self.cells = self.text.iter()
            .enumerate()
            .map(|(col, &ch)| {
                let mut cell = Cell::new(ch.to_string(), ElementKind::PitchedElement, col);

                // Try to extract pitch info from glyph
                if let Some((pitch_code, octave)) = pitch_from_glyph(ch, pitch_system) {
                    cell.pitch_code = Some(pitch_code);
                    cell.octave = octave;
                    cell.pitch_system = Some(pitch_system);
                } else {
                    // Non-pitched element - determine kind from character
                    cell.kind = match ch {
                        '-' => ElementKind::UnpitchedElement,
                        ' ' => ElementKind::Whitespace,
                        '\'' | ',' => ElementKind::BreathMark,
                        '|' => ElementKind::SingleBarline,
                        _ => ElementKind::UnpitchedElement,
                    };
                }
                cell
            })
            .collect();
    }

    /// Draw slur overlines based on SlurIndicator markers
    ///
    /// Compositional: preserves existing underline state, computes fresh overlines.
    /// Commutative with `draw_beat_groups` - order doesn't matter.
    /// Idempotent - calling twice produces same result as calling once.
    pub fn draw_slurs(&mut self) -> &mut Self {
        use crate::renderers::font_utils::CodepointTransform;

        let mut in_slur = false;
        for cell in &mut self.cells {
            if cell.codepoint.slur_left() { in_slur = true; }
            cell.codepoint = cell.codepoint.overline_mid(in_slur);
            if cell.codepoint.slur_right() { in_slur = false; }
        }
        self
    }

    /// Draw beat group underlines based on beat spans
    ///
    /// Compositional: preserves existing overline state, computes fresh underlines.
    /// Commutative with `draw_slurs` - order doesn't matter.
    /// Idempotent - calling twice produces same result as calling once.
    pub fn draw_beat_groups(&mut self, beats: &[BeatSpan]) -> &mut Self {
        use crate::renderers::line_variants::UnderlineState;
        use crate::renderers::font_utils::CodepointTransform;

        if self.cells.is_empty() {
            return self;
        }

        // Reset all underlines to None first (idempotent)
        for cell in &mut self.cells {
            cell.underline = UnderlineState::None;
            // Also reset middle underline in codepoint (preserves Left/Right markers)
            cell.codepoint = cell.codepoint.underline_mid(false);
        }

        // Compute underline states from beat spans
        for beat in beats {
            let start = beat.start;
            let end = beat.end;

            if start == end {
                // Single-cell beat - no underline needed
                continue;
            }

            // Multi-cell beat - apply underlines to both field and codepoint
            if start < self.cells.len() {
                self.cells[start].underline = UnderlineState::Left;
                self.cells[start].codepoint = self.cells[start].codepoint.set_underline(UnderlineState::Left);
            }
            if end < self.cells.len() {
                self.cells[end].underline = UnderlineState::Right;
                self.cells[end].codepoint = self.cells[end].codepoint.set_underline(UnderlineState::Right);
            }
            for i in (start + 1)..end {
                if i < self.cells.len() {
                    self.cells[i].underline = UnderlineState::Middle;
                    self.cells[i].codepoint = self.cells[i].codepoint.underline_mid(true);
                }
            }
        }

        // Sync char fields from codepoints
        for cell in &mut self.cells {
            cell.sync_char();
        }

        self
    }

    /// Apply line variants to cell.char and cell.codepoint based on cell.underline and cell.overline
    ///
    /// Call this after draw_slurs() and draw_beat_groups() to update cell.char/codepoint
    /// with the combined PUA glyph.
    pub fn apply_line_variants(&mut self) -> &mut Self {
        use crate::renderers::font_utils::CharTransform;

        for cell in &mut self.cells {
            if cell.superscript {
                continue;
            }
            if let Some(ch) = cell.char.chars().next() {
                let transformed = ch
                    .underline(cell.underline)
                    .overline(cell.overline);
                cell.char = transformed.to_string();
                cell.codepoint = transformed as u32;
            }
        }

        self
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
    pub tonic: Option<crate::models::Tonic>,

    /// Default pitch system for the composition
    pub pitch_system: Option<PitchSystem>,

    /// Default key signature for the composition
    pub key_signature: Option<String>,

    /// Creation and modification timestamps
    pub created_at: Option<String>,
    pub modified_at: Option<String>,

    /// Document version
    pub version: Option<String>,

    /// Ornament edit mode flag
    #[serde(default)]
    pub ornament_edit_mode: bool,

    /// Active scale constraint (mode/maqam/raga filter)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub active_constraint: Option<crate::models::constraints::ScaleConstraint>,

    /// Array of musical lines
    pub lines: Vec<Line>,

    // === Verbose/debug fields below - displayed last in inspector ===

    /// Annotation layer for slurs, ornaments, etc.
    #[serde(default)]
    pub annotation_layer: crate::text::annotations::AnnotationLayer,

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
            ornament_edit_mode: false,
            active_constraint: None,
            lines: Vec::new(),
            // Verbose/debug fields last
            annotation_layer: crate::text::annotations::AnnotationLayer::new(),
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

    /// Sync text field for all lines from their cells
    /// Call this after deserialization since text has #[serde(skip)]
    pub fn sync_text_for_all_lines(&mut self) {
        for line in &mut self.lines {
            line.sync_text_from_cells();
        }
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
    pub fn effective_tonic<'a>(&'a self, line: &'a Line) -> Option<&'a crate::models::Tonic> {
        if line.tonic.is_some() {
            line.tonic.as_ref()
        } else {
            self.tonic.as_ref()
        }
    }

    /// Compute line variants for all cells based on beat grouping and slur indicators
    ///
    /// Uses compositional API: `line.draw_slurs().draw_beat_groups(&beats).apply_line_variants()`
    /// - Commutative: order of draw_slurs/draw_beat_groups doesn't matter
    /// - Idempotent: calling twice produces same result as calling once
    pub fn compute_line_variants(&mut self) {
        use crate::parse::beats::BeatDeriver;

        let beat_deriver = BeatDeriver::new();

        for line in &mut self.lines {
            let beats = beat_deriver.extract_implicit_beats(&line.cells);
            line.draw_slurs().draw_beat_groups(&beats).apply_line_variants();
        }
    }

    /// Recalculate system_id and part_id for all lines based on system_marker
    ///
    /// Uses LilyPond-style `<<`/`>>` markers:
    /// - `<<` (Start) - begins a bracketed system group
    /// - `>>` (End) - ends the bracketed system group
    /// - No marker after `>>` or at start - standalone system
    /// - No marker after `<<` - continues the bracketed group
    ///
    /// **System ID Assignment:**
    /// - Lines with `Start` marker → start new system_id (begin bracket group)
    /// - Lines without marker after `Start` → same system_id (continue group)
    /// - Lines with `End` marker → same system_id (end of group)
    /// - Lines without marker after `End` or at start → new system_id (standalone)
    ///
    /// **Part ID Assignment:**
    /// - Standalone lines (no marker, not in group) → part_id = "P1"
    /// - Lines in bracketed group → unique part_id (P2, P3, P4...)
    ///
    /// Examples:
    /// - `[None, None, None]` → system_id: 1, 2, 3 (three standalone systems)
    /// - `[Start, None, End]` → system_id: 1, 1, 1 (one bracketed group)
    /// - `[Start, None, End, None]` → system_id: 1, 1, 1, 2 (bracketed group + standalone)
    ///
    /// Also syncs deprecated `staff_role` field for backward compatibility.
    pub fn recalculate_system_and_part_ids(&mut self) {
        #[cfg(target_arch = "wasm32")]
        {
            web_sys::console::log_1(&format!("[recalculate_system_and_part_ids] {} lines",
                self.lines.len()).into());
        }

        let mut system_id = 0;
        let mut in_group = false; // Track if we're inside a << >> group
        let mut next_group_part_id = 2; // Group parts start from P2 (P1 reserved for standalone)

        for (i, line) in self.lines.iter_mut().enumerate() {
            // Determine if this line should start a new system
            let start_new_system = match line.system_marker {
                Some(SystemMarker::Start) => {
                    in_group = true;
                    true // << always starts new system
                }
                Some(SystemMarker::End) => {
                    // >> ends the group but stays in same system_id
                    let was_in_group = in_group;
                    in_group = false;
                    !was_in_group // Only start new if we weren't in a group (edge case)
                }
                None => {
                    if in_group {
                        false // Continue current system (inside group)
                    } else {
                        true // Start new system (standalone)
                    }
                }
            };

            if i == 0 || start_new_system {
                system_id += 1;
            }

            line.system_id = system_id;

            // Assign part_id and sync staff_role based on system_marker
            match line.system_marker {
                Some(SystemMarker::Start) => {
                    line.part_id = format!("P{}", next_group_part_id);
                    next_group_part_id += 1;
                    line.staff_role = StaffRole::GroupHeader; // Sync deprecated field
                }
                Some(SystemMarker::End) => {
                    line.part_id = format!("P{}", next_group_part_id);
                    next_group_part_id += 1;
                    line.staff_role = StaffRole::GroupItem; // Sync deprecated field
                }
                None => {
                    if in_group {
                        // Inside a group (after << but before >>)
                        line.part_id = format!("P{}", next_group_part_id);
                        next_group_part_id += 1;
                        line.staff_role = StaffRole::GroupItem; // Sync deprecated field
                    } else {
                        // Standalone line
                        line.part_id = "P1".to_string();
                        line.staff_role = StaffRole::Melody; // Sync deprecated field
                    }
                }
            }

            #[cfg(target_arch = "wasm32")]
            {
                web_sys::console::log_1(&format!("  Line {}: system_marker={:?}, system_id={}, part_id={}, staff_role={:?}",
                    i, line.system_marker, line.system_id, line.part_id, line.staff_role).into());
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

    // NOTE: Ornament-related tests removed. Grace notes are now superscript characters
    // stored directly in cell.char. See src/renderers/font_utils.rs for conversion functions.

    #[test]
    fn test_system_marker_start_then_standalone() {
        // Test "<< line" followed by standalone lines → bracketed single + standalone systems
        // Using new SystemMarker approach
        let mut doc = Document::new();

        // Line 1: << (start group) - but no end marker, so just this line is grouped
        let mut line1 = Line::new();
        line1.label = "Strings".to_string();
        line1.system_marker = Some(SystemMarker::Start);
        doc.lines.push(line1);

        // Line 2: standalone (no marker, but group was never ended so it continues)
        let mut line2 = Line::new();
        line2.label = "Violin I".to_string();
        // system_marker = None (but since no >> was seen, it continues the group)
        doc.lines.push(line2);

        // Line 3: >> (end group)
        let mut line3 = Line::new();
        line3.label = "Violin II".to_string();
        line3.system_marker = Some(SystemMarker::End);
        doc.lines.push(line3);

        // Recalculate system IDs based on system_marker
        doc.recalculate_system_and_part_ids();

        // VERIFY: All three lines should have the SAME system_id (bracketed group)
        assert_eq!(doc.lines[0].system_id, 1, "<< should be system 1");
        assert_eq!(doc.lines[1].system_id, 1, "Middle line should be system 1 (in group)");
        assert_eq!(doc.lines[2].system_id, 1, ">> should be system 1 (ends group)");

        // VERIFY: Part IDs - Group lines get unique IDs starting from P2
        assert_eq!(doc.lines[0].part_id, "P2", "<< line should be P2");
        assert_eq!(doc.lines[1].part_id, "P3", "Middle line should be P3");
        assert_eq!(doc.lines[2].part_id, "P4", ">> line should be P4");

        // VERIFY: staff_role is synced for backward compatibility
        assert_eq!(doc.lines[0].staff_role, StaffRole::GroupHeader);
        assert_eq!(doc.lines[1].staff_role, StaffRole::GroupItem);
        assert_eq!(doc.lines[2].staff_role, StaffRole::GroupItem);
    }

    #[test]
    fn test_system_marker_bracketed_group() {
        // Test "<< line1 line2 >>" pattern: ONE BRACKETED SYSTEM
        let mut doc = Document::new();

        // Line 1: << (start group)
        let mut line1 = Line::new();
        line1.label = "Strings".to_string();
        line1.system_marker = Some(SystemMarker::Start);
        doc.lines.push(line1);

        // Line 2: inside group (no marker)
        let mut line2 = Line::new();
        line2.label = "Violin I".to_string();
        doc.lines.push(line2);

        // Line 3: >> (end group)
        let mut line3 = Line::new();
        line3.label = "Violin II".to_string();
        line3.system_marker = Some(SystemMarker::End);
        doc.lines.push(line3);

        // Recalculate system IDs based on system_marker
        doc.recalculate_system_and_part_ids();

        // VERIFY: All three lines should have the SAME system_id (bracketed group)
        assert_eq!(doc.lines[0].system_id, 1, "<< should be system 1");
        assert_eq!(doc.lines[1].system_id, 1, "Middle should be system 1 (same as <<)");
        assert_eq!(doc.lines[2].system_id, 1, ">> should be system 1 (same as <<)");

        // VERIFY: Part IDs - Group lines get unique IDs starting from P2
        assert_eq!(doc.lines[0].part_id, "P2", "<< should be P2");
        assert_eq!(doc.lines[1].part_id, "P3", "Middle should be P3");
        assert_eq!(doc.lines[2].part_id, "P4", ">> should be P4");
    }

    #[test]
    fn test_system_marker_standalone_lines() {
        // Test three lines with no markers → THREE SEPARATE SYSTEMS (standalone)
        let mut doc = Document::new();

        // Add three lines with no system_marker (standalone)
        for i in 0..3 {
            let mut line = Line::new();
            line.label = format!("Staff {}", i + 1);
            // system_marker = None (default)
            doc.lines.push(line);
        }

        // Recalculate system IDs based on system_marker
        doc.recalculate_system_and_part_ids();

        // VERIFY: Each line should have a different system_id (standalone)
        assert_eq!(doc.lines[0].system_id, 1, "First should be system 1");
        assert_eq!(doc.lines[1].system_id, 2, "Second should be system 2");
        assert_eq!(doc.lines[2].system_id, 3, "Third should be system 3");

        // VERIFY: Part IDs - All standalone lines share P1
        assert_eq!(doc.lines[0].part_id, "P1", "First should be P1");
        assert_eq!(doc.lines[1].part_id, "P1", "Second should be P1");
        assert_eq!(doc.lines[2].part_id, "P1", "Third should be P1");

        // VERIFY: staff_role is synced to Melody for backward compatibility
        assert_eq!(doc.lines[0].staff_role, StaffRole::Melody);
        assert_eq!(doc.lines[1].staff_role, StaffRole::Melody);
        assert_eq!(doc.lines[2].staff_role, StaffRole::Melody);
    }

    // ========================================================================
    // Line Variant Compositional Property Tests
    // ========================================================================

    /// Helper: create a test line with cells and slur markers
    fn create_test_line_with_slurs() -> Line {
        use crate::models::pitch_code::PitchCode;

        let mut line = Line::new();

        // Create cells: "1 2 3 4 5" with slur from 2 to 4
        let pitch_codes = [PitchCode::N1, PitchCode::N2, PitchCode::N3, PitchCode::N4, PitchCode::N5];
        for (i, &pc) in pitch_codes.iter().enumerate() {
            let mut cell = Cell::new((i + 1).to_string(), ElementKind::PitchedElement, i);
            cell.pitch_code = Some(pc);
            cell.pitch_system = Some(PitchSystem::Number);

            // Slur from index 1 to index 3
            if i == 1 {
                cell.set_slur_start();
            } else if i == 3 {
                cell.set_slur_end();
            }

            line.cells.push(cell);
        }

        line
    }

    /// Helper: create test beat spans for a subdivided beat
    fn create_test_beats() -> Vec<BeatSpan> {
        // Beat spanning indices 0-2 (multi-cell beat)
        vec![BeatSpan::new(0, 2, 1.0)]
    }

    /// Helper: get line variant states as a string for comparison
    fn get_line_states(line: &Line) -> Vec<(UnderlineState, OverlineState)> {
        use crate::renderers::font_utils::CodepointTransform;
        line.cells.iter()
            .map(|c| (c.codepoint.get_underline(), c.codepoint.get_overline()))
            .collect()
    }

    #[test]
    fn test_draw_line_variants_commutative() {
        use crate::renderers::line_variants::{UnderlineState, OverlineState};

        let beats = create_test_beats();

        // Order A: slurs first, then beat groups
        let mut line_a = create_test_line_with_slurs();
        line_a.draw_slurs().draw_beat_groups(&beats);
        let states_a = get_line_states(&line_a);

        // Order B: beat groups first, then slurs
        let mut line_b = create_test_line_with_slurs();
        line_b.draw_beat_groups(&beats).draw_slurs();
        let states_b = get_line_states(&line_b);

        // Results must be identical (commutativity)
        assert_eq!(states_a, states_b, "draw_slurs and draw_beat_groups should be commutative");

        // Verify expected states (read from codepoint - source of truth)
        use crate::renderers::font_utils::CodepointTransform;

        // Cell 0: underline Left (beat start), overline None
        assert_eq!(line_a.cells[0].codepoint.get_underline(), UnderlineState::Left);
        assert_eq!(line_a.cells[0].codepoint.get_overline(), OverlineState::None);

        // Cell 1: underline Middle (beat middle), overline Left (slur start)
        assert_eq!(line_a.cells[1].codepoint.get_underline(), UnderlineState::Middle);
        assert_eq!(line_a.cells[1].codepoint.get_overline(), OverlineState::Left);

        // Cell 2: underline Right (beat end), overline Middle (inside slur)
        assert_eq!(line_a.cells[2].codepoint.get_underline(), UnderlineState::Right);
        assert_eq!(line_a.cells[2].codepoint.get_overline(), OverlineState::Middle);

        // Cell 3: underline None, overline Right (slur end)
        assert_eq!(line_a.cells[3].codepoint.get_underline(), UnderlineState::None);
        assert_eq!(line_a.cells[3].codepoint.get_overline(), OverlineState::Right);
    }

    #[test]
    fn test_draw_slurs_idempotent() {
        let mut line = create_test_line_with_slurs();

        line.draw_slurs();
        let after_once = get_line_states(&line);

        line.draw_slurs();
        let after_twice = get_line_states(&line);

        assert_eq!(after_once, after_twice, "draw_slurs should be idempotent");
    }

    #[test]
    fn test_draw_beat_groups_idempotent() {
        let beats = create_test_beats();
        let mut line = create_test_line_with_slurs();

        line.draw_beat_groups(&beats);
        let after_once = get_line_states(&line);

        line.draw_beat_groups(&beats);
        let after_twice = get_line_states(&line);

        assert_eq!(after_once, after_twice, "draw_beat_groups should be idempotent");
    }

    #[test]
    fn test_full_chain_idempotent() {
        let beats = create_test_beats();
        let mut line = create_test_line_with_slurs();

        line.draw_slurs().draw_beat_groups(&beats);
        let after_once = get_line_states(&line);

        line.draw_slurs().draw_beat_groups(&beats);
        let after_twice = get_line_states(&line);

        assert_eq!(after_once, after_twice, "full chain should be idempotent");
    }
}
