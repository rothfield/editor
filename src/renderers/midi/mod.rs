//! Direct IR-to-MIDI conversion module
//!
//! This module provides a direct conversion path from the format-agnostic IR
//! (ExportLine/ExportMeasure/ExportEvent) to MIDI Score IR, bypassing the
//! MusicXML intermediate serialization step.
//!
//! # Benefits
//! - **Performance**: Eliminates XML serialization/parsing overhead
//! - **Accuracy**: Preserves semantic information from IR
//! - **Simplicity**: Direct struct-to-struct conversion
//! - **Extensibility**: Easy to add dynamics, expression, etc.
//!
//! # Usage
//! ```rust,ignore
//! use crate::renderers::midi::ir_to_midi_score;
//! use crate::ir::build_export_measures_from_document;
//!
//! let export_lines = build_export_measures_from_document(&document)?;
//! let score = ir_to_midi_score(&export_lines, 480, Some(120.0))?;
//! ```

pub mod converter;
pub mod defaults;

// Re-export main conversion function
pub use converter::ir_to_midi_score;
pub use defaults::{DEFAULT_TEMPO_BPM, DEFAULT_VELOCITY, DEFAULT_PROGRAM, DEFAULT_TPQ};
