//! Intermediate Representation (IR) Module
//!
//! This module provides a format-agnostic intermediate representation for exporting
//! musical notation from the Document model to various output formats (MusicXML, LilyPond, MIDI, etc.).
//!
//! # Architecture
//!
//! The IR serves as a bridge between the Cell-based Document model and format-specific emitters:
//!
//! ```text
//! Document (Cell-based)
//!     ↓
//! IR Builder (FSM-based conversion)
//!     ↓
//! IR Types (format-agnostic representation)
//!     ↓
//! Format Emitters (MusicXML, LilyPond, etc.)
//! ```
//!
//! # Modules
//!
//! - **types**: Core IR type definitions (ExportLine, ExportMeasure, ExportEvent, etc.)
//! - **builder**: Document-to-IR conversion logic using FSM-based rhythm analysis
//!
//! # Usage
//!
//! ```rust,ignore
//! use crate::ir::{build_export_measures_from_document, ExportLine};
//! use crate::models::Document;
//!
//! // Convert document to IR
//! let document = Document::new();
//! let export_lines: Vec<ExportLine> = build_export_measures_from_document(&document);
//!
//! // Pass IR to format-specific emitters
//! let musicxml = emit_musicxml(&export_lines, Some("My Song"), None)?;
//! let lilypond = emit_lilypond(&export_lines)?;
//! ```

pub mod types;
pub mod builder;
pub mod clef;
pub mod measurization;

// Re-export commonly used types for convenience
pub use types::{
    // Core IR structures
    ExportLine,
    ExportMeasure,
    ExportEvent,

    // Note and pitch data
    NoteData,
    PitchInfo,
    GraceNoteData,

    // Rhythm and duration
    Fraction,
    TupletInfo,

    // Musical annotations
    LyricData,
    Syllabic,
    SlurData,
    SlurPlacement,
    SlurType,
    TieData,
    TieType,
    BeamData,
    BeamState,
    ArticulationType,
};

// Re-export builder functions
pub use builder::{
    build_export_measures_from_document,
    build_export_measures_from_line,
    group_cells_into_events,
    parse_lyrics_to_syllables,
};

// Re-export measurization types
pub use measurization::{
    TickEvent,
    Bar,
    MeasurizedPart,
    PartMetadata,
    GroupPosition,
    measurize_export_lines,
};
