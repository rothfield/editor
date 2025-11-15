//! Layer 2: Musical Structure
//!
//! This module derives musical structures (beats, measures, events) from
//! text + annotations. It uses Layer 1 (glyph semantics) to interpret
//! characters as musical pitches.
//!
//! ## Architecture
//!
//! Layer 2 is stateless - it analyzes text on demand and returns derived
//! structures. No musical state is stored here.
//!
//! ## Modules
//!
//! - `line_analysis`: Tokenization and beat/measure grouping
//! - `operations`: Musical operations on text (octave shift, transpose, etc.)

pub mod line_analysis;
pub mod operations;

// Re-exports for convenience
pub use line_analysis::{Token, Beat, LineStructure, find_beat_at_position};
pub use operations::{shift_octaves, shift_octaves_in_range, OctaveShiftResult};
