# Data Model: Music Notation Editor POC

**Branch**: `001-poc` | **Date**: 2025-10-11 | **Status**: Phase 1 Design

This document defines the core data structures and entity relationships for the Music Notation Editor POC based on the Cell architecture and Phase 0 research findings.

---

## Overview

The Music Notation Editor uses a **Cell-based architecture** where all musical content is represented as discrete cells that correspond to visible grapheme clusters. This approach provides predictable positioning, efficient rendering, and intuitive musical semantics while supporting multiple pitch systems and notation styles.

**Core Principles:**
- **Grapheme-Safe**: Each Cell represents one visible grapheme cluster
- **Temporal Separation**: Clear distinction between temporal (pitched/unpitched) and non-temporal elements
- **Lane Organization**: Vertical positioning through ordered lanes [Upper, Letter, Lower, Lyrics]
- **Implicit Beats**: Beat spans derived algorithmically from temporal elements
- **Multi-System Support**: Seamless conversion between Number, Western, and other pitch systems

---

## Core Data Structures

### Cell

The fundamental unit representing one visible grapheme cluster in the musical notation.

```rust
#[repr(C)]
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct Cell {
    /// The visible grapheme cluster (e.g., "S", "C#", "2b", "-")
    pub glyph: String,

    /// Type of musical element this cell represents
    pub kind: ElementKind,

    /// Vertical lane position (Upper, Letter, Lower, Lyrics)
    pub lane: LaneKind,

    /// Physical column index (0-based) for layout calculations
    pub col: usize,

    /// Bit flags for various properties (head marker, selection, etc.)
    pub flags: u8,

    /// Canonical pitch representation (for pitched elements only)
    pub pitch_code: Option<String>,

    /// Pitch system used for this element (for pitched elements only)
    pub pitch_system: Option<PitchSystem>,

    /// Layout cache properties (calculated at render time)
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,

    /// Bounding box for hit testing
    pub bbox: (f32, f32, f32, f32),

    /// Hit testing area (may be larger than bbox for interaction)
    pub hit: (f32, f32, f32, f32),
}

impl Cell {
    /// Check if this cell is the head of a multi-character token
    pub fn is_head(&self) -> bool {
        self.flags & 0x01 != 0
    }

    /// Check if this cell is currently selected
    pub fn is_selected(&self) -> bool {
        self.flags & 0x02 != 0
    }

    /// Check if this cell has focus
    pub fn has_focus(&self) -> bool {
        self.flags & 0x04 != 0
    }

    /// Check if this cell is part of a temporal sequence
    pub fn is_temporal(&self) -> bool {
        matches!(self.kind, ElementKind::PitchedElement | ElementKind::UnpitchedElement)
    }

    /// Get the length of this token in characters
    pub fn token_length(&self) -> usize {
        self.grapheme.chars().count()
    }
}
```

### ElementKind

Enumeration of all possible musical element types that can be represented in a Cell.

```rust
#[repr(u8)]
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, PartialEq)]
pub enum ElementKind {
    /// Musical notes with definite pitch (S, r, C#, 2b, etc.)
    PitchedElement = 1,

    /// Non-pitched musical elements (dashes, breath marks, barlines, spaces)
    UnpitchedElement = 2,

    /// Annotations appearing above the main line (ornaments, dynamics, octave dots)
    UpperAnnotation = 3,

    /// Annotations appearing below the main line (fingerings, lower octave dots)
    LowerAnnotation = 4,

    /// Text elements that cannot be parsed as musical notation
    Text = 5,

    /// Barline elements for beat separation
    Barline = 6,

    /// Breath mark elements
    BreathMark = 7,

    /// Whitespace elements for layout
    Whitespace = 8,
}

impl ElementKind {
    /// Determine if this element type is temporal (affects musical timing)
    pub fn is_temporal(&self) -> bool {
        matches!(self, ElementKind::PitchedElement | ElementKind::UnpitchedElement)
    }

    /// Determine if this element type can be selected
    pub fn is_selectable(&self) -> bool {
        !matches!(self, ElementKind::Whitespace | ElementKind::Barline)
    }
}
```

### LaneKind

Enumeration defining the vertical positioning lanes for Cell elements.

```rust
#[repr(u8)]
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, PartialEq)]
pub enum LaneKind {
    /// Upper annotations and ornaments (above the main line)
    Upper = 0,

    /// Main musical notation line (primary content)
    Letter = 1,

    /// Lower annotations and marks (below the main line)
    Lower = 2,

    /// Lyrics and text below the notation
    Lyrics = 3,
}

impl LaneKind {
    /// Get the vertical offset for this lane relative to the baseline
    pub fn vertical_offset(&self, font_size: f32) -> f32 {
        match self {
            LaneKind::Upper => -font_size * 0.8,
            LaneKind::Letter => 0.0,
            LaneKind::Lower => font_size * 0.4,
            LaneKind::Lyrics => font_size * 1.2,
        }
    }

    /// Get the baseline position for this lane
    pub fn baseline(&self, base_y: f32, font_size: f32) -> f32 {
        base_y + self.vertical_offset(font_size)
    }
}
```

### PitchSystem

Enumeration of supported pitch systems for musical notation.

```rust
#[repr(u8)]
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, PartialEq)]
pub enum PitchSystem {
    /// Number system (1, 2, 3, 4, 5, 6, 7) - default system
    Number = 1,

    /// Western system (c, d, e, f, g, a, b or C, D, E, F, G, A, B)
    Western = 2,

    /// Sargam system (S, r, R, g, G, m, M, P, d, D, n, N)
    Sargam = 3,

    /// Bhatkhande system (Indian classical notation)
    Bhatkhande = 4,

    /// Tabla notation system
    Tabla = 5,
}

impl PitchSystem {
    /// Get the default pitch system
    pub fn default() -> Self {
        PitchSystem::Number
    }

    /// Check if this system uses accidentals
    pub fn supports_accidentals(&self) -> bool {
        matches!(self, PitchSystem::Number | PitchSystem::Western)
    }
}
```

---

## Line Structure

### Line

Container for musical notation with support for multiple lanes and line-level metadata.

```rust
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
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
            metadata: LineMetadata::default(),
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
        self.get_lane_mut(lane).remove(index)
    }
}
```

### LineMetadata

Metadata stored at the line level for musical and structural information.

```rust
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, Default)]
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
```

---

## Document Structure

### Document

Top-level container for musical notation with support for multiple lines and composition-level metadata.

```rust
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
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
        for (stave_idx, line) in self.lines.iter().enumerate() {
            let max_col = line.max_column();

            for (lane_idx, lane) in line.lanes.iter().enumerate() {
                for (cell_idx, cell) in lane.iter().enumerate() {
                    if cell.col > max_col {
                        return Err(ValidationError::ColumnAlignment {
                            stave: stave_idx,
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
}
```

### DocumentMetadata

Composition-level metadata that applies to the entire document.

```rust
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, Default)]
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
    pub created_at: Option<chrono::DateTime<chrono::Utc>>,
    pub modified_at: Option<chrono::DateTime<chrono::Utc>>,

    /// Document version
    pub version: Option<String>,
}

impl DocumentMetadata {
    /// Create new document metadata
    pub fn new() -> Self {
        Self::default()
    }

    /// Get the effective pitch system for a line
    pub fn effective_pitch_system(&self, line_metadata: &LineMetadata) -> PitchSystem {
        line_metadata.pitch_system
            .or(self.pitch_system)
            .unwrap_or(PitchSystem::Number)
    }

    /// Get the effective tonic for a line
    pub fn effective_tonic(&self, line_metadata: &LineMetadata) -> Option<&String> {
        line_metadata.tonic.as_ref().or(self.tonic.as_ref())
    }
}
```

### DocumentState

Application state including cursor position, selection, and focus information.

```rust
#[derive(serde::Serialize, Deserialize, Clone, Debug)]
pub struct DocumentState {
    /// Current cursor position (stave index, lane, column)
    pub cursor: CursorPosition,

    /// Current selection range (if any)
    pub selection: Option<Selection>,

    /// Currently focused element ID
    pub focused_element: Option<String>,

    /// Focus state of the editor
    pub has_focus: bool,

    /// Undo/Redo history
    pub history: Vec<DocumentAction>,
    pub history_index: usize,

    /// Performance and rendering state
    pub render_state: RenderState,
}

impl DocumentState {
    /// Create new document state
    pub fn new() -> Self {
        Self {
            cursor: CursorPosition::new(),
            selection: None,
            focused_element: None,
            has_focus: false,
            history: Vec::new(),
            history_index: 0,
            render_state: RenderState::new(),
        }
    }

    /// Check if there's an active selection
    pub fn has_selection(&self) -> bool {
        self.selection.is_some()
    }

    /// Get the current selection range
    pub fn selection_range(&self) -> Option<Range> {
        self.selection.as_ref().map(|s| s.range())
    }
}
```

---

## Musical Structures

### BeatSpan

Represents a derived beat span between two temporal elements.

```rust
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
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

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
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
}
```

### SlurSpan

Represents a slur connection between two elements.

```rust
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct SlurSpan {
    /// Starting element position (stave, lane, column)
    pub start: Position,

    /// Ending element position (stave, lane, column)
    pub end: Position,

    /// Slur direction (upward or downward)
    pub direction: SlurDirection,

    /// Visual rendering properties
    pub visual: SlurVisual,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct Position {
    pub stave: usize,
    pub lane: LaneKind,
    pub column: usize,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub enum SlurDirection {
    Upward,
    Downward,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
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
}
```

---

## Validation and Error Handling

### ValidationError

Errors that can occur during document validation.

```rust
#[derive(serde::Serialize, Deserialize, Clone, Debug)]
pub enum ValidationError {
    /// Column alignment mismatch between lanes
    ColumnAlignment {
        stave: usize,
        lane: usize,
        cell: usize,
        cell_col: usize,
        max_col: usize,
    },

    /// Invalid pitch notation
    InvalidPitch {
        stave: usize,
        lane: usize,
        column: usize,
        pitch: String,
    },

    /// Invalid character encoding
    InvalidEncoding {
        stave: usize,
        lane: usize,
        column: usize,
        glyph: String,
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
            ValidationError::ColumnAlignment { stave, lane, cell, cell_col, max_col } => {
                format!("Column alignment error at stave {}, lane {}, cell {}: column {} exceeds maximum {}",
                       stave, lane, cell, cell_col, max_col)
            },
            ValidationError::InvalidPitch { stave, lane, column, pitch } => {
                format!("Invalid pitch notation '{}' at stave {}, lane {}, column {}", pitch, stave, lane, column)
            },
            ValidationError::InvalidEncoding { stave, lane, column, glyph } => {
                format!("Invalid character encoding '{}' at stave {}, lane {}, column {}", grapheme, stave, lane, column)
            },
            ValidationError::StructureError { description } => {
                format!("Document structure error: {}", description)
            },
        }
    }
}
```

---

## Performance Considerations

### Memory Layout

The data structures are optimized for WASM compilation and efficient memory access:

1. **Fixed-size enums**: All enums use `#[repr(u8)]` for predictable memory layout
2. **Contiguous arrays**: Cell arrays use `Vec<T>` for cache-friendly access
3. **Lazy evaluation**: Derived data (beats, slurs) is calculated on-demand
4. **Minimal allocations**: String allocations are minimized where possible

### Serialization

All structures implement `serde::Serialize` and `serde::Deserialize` for:

- **File persistence**: JSON format for document storage
- **WASM interop**: Efficient data transfer between Rust and JavaScript
- **Testing**: Easy serialization of test fixtures

### Caching Strategy

Derived data is cached to avoid expensive recalculations:

- **Beat spans**: Cached until line content changes
- **Layout positions**: Cached until font or content changes
- **Rendering data**: Cached with dirty region tracking

---

## Module Organization

The data model is organized into several key modules that align with the project structure:

### Core Models (`src/rust/models/`)
- **core.rs**: Cell, Line, Document structures
- **elements.rs**: ElementKind, LaneKind, and musical element definitions
- **notation.rs**: BeatSpan, SlurSpan, and musical notation models
- **pitch.rs**: Pitch representation and conversion logic
- **barlines.rs**: Barline handling and beat separation
- **pitch_systems/**: Pitch system implementations (Number, Western, Sargam, etc.)

### Parsing Modules (`src/rust/parse/`)
- **cell.rs**: Cell parsing and grapheme handling
- **beats.rs**: Beat derivation algorithms using `extract_implicit_beats`
- **tokens.rs**: Token recognition and validation
- **grammar.rs**: Musical grammar parsing and validation

### Rendering Modules (`src/rust/renderers/`)
- **layout.rs**: Position calculation and layout algorithms
- **curves.rs**: Slur and arc rendering (Bézier curves)
- **annotations.rs**: Upper/lower annotation positioning
- **svg/**: SVG rendering output for web display
- **musicxml/**: MusicXML export functionality (POC stub)
- **lilypond/**: LilyPond export functionality (POC stub)

### Utility Modules (`src/rust/utils/`)
- **grapheme.rs**: Grapheme cluster handling with Intl.Segmenter integration
- **performance.rs**: Performance optimization utilities

## Usage Examples

### Creating a Simple Musical Line

```rust
use editor::models::*;
use editor::parse::*;

// Create a new document
let mut doc = Document::new();

// Add a line with basic notation
let mut line = Line::new();

// Parse musical notation into Cells
let parser = CellParser::new();
let char_cells = parser.parse_to_char_cells("S--r g m P");

// Add parsed cells to the letter lane
for (col, cell) in char_cells.into_iter().enumerate() {
    line.add_cell(cell, LaneKind::Letter);
}

// Set line metadata
line.metadata.label = Some("Alap".to_string());
line.metadata.tonic = Some("C".to_string());

// Add the line to the document
doc.add_line(line);
```

### Converting Between Pitch Systems

```rust
use editor::models::pitch_systems::*;

// Convert from Sargam to Western
let converter = PitchConverter::new();
let western_note = converter.convert("S", PitchSystem::Sargam, PitchSystem::Western);
assert_eq!(western_note, "C");

// Convert from Western to Number
let number_note = converter.convert("C#", PitchSystem::Western, PitchSystem::Number);
assert_eq!(number_note, "1#");
```

### Rendering to SVG

```rust
use editor::renderers::svg::*;

// Create SVG renderer
let mut renderer = SVGRenderer::new();

// Render document to SVG
let svg_output = renderer.render_document(&doc)
    .map_err(|e| format!("SVG rendering failed: {}", e))?;

// Save SVG to file
std::fs::write("output.svg", svg_output)?;
```

### Export to MusicXML (Stub Implementation)

```rust
use editor::renderers::musicxml::*;

// Create MusicXML exporter
let exporter = MusicXMLExporter::new();

// For POC, this returns a stub message
let result = exporter.export(&doc);
assert_eq!(result.unwrap(), "MusicXML export not implemented in POC");
```

---

## Conclusion

This data model provides a robust foundation for the Music Notation Editor POC with:

- **Clear separation of concerns** between musical concepts and rendering logic
- **Efficient memory layout** optimized for WASM compilation
- **Flexible extensibility** for future pitch systems and notation features
- **Comprehensive validation** to ensure document integrity
- **Performance optimization** through caching and lazy evaluation

The model supports all requirements from the specification while maintaining the simplicity needed for a POC implementation.