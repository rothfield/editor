//! MusicXML export module
//!
//! Provides MusicXML 3.1 export functionality for documents.
//!
//! # Module Structure
//!
//! - **converter**: Main entry point (`to_musicxml()`) for converting documents
//! - **measure**: Measure and segment processing (barline splitting, divisions calculation)
//! - **beat**: Beat processing, normalization, and tuplet detection
//! - **fsm**: Finite state machine for beat-level rhythm processing (explicit pattern)
//! - **grace_notes**: Grace note and ornament type detection
//! - **builder**: MusicXML XML structure building
//! - **emitter**: MusicXML document emitter (consumes IR from `crate::ir`)
//! - **pitch**: Pitch code to MusicXML conversion
//! - **duration**: Duration to note type conversion
//! - **helpers**: Utility functions (GCD/LCM, logging)
//!
//! # Intermediate Representation (IR)
//!
//! The IR types and builder functions have been moved to the top-level `crate::ir` module
//! to support format-agnostic export. See `crate::ir` for IR documentation.

pub mod duration;
pub mod pitch;
pub mod builder;
pub mod converter;
pub mod measure;
pub mod beat;
pub mod fsm;
pub mod grace_notes;
pub mod helpers;
pub mod emitter;

// Note: export_ir and line_to_ir have been moved to crate::ir
// Use `crate::ir::*` for IR types and `crate::ir::build_export_measures_from_document()`

pub use duration::*;
pub use pitch::*;
pub use builder::*;
pub use converter::to_musicxml;
pub use grace_notes::{detect_grace_note_ornament_type, ornament_position_to_placement};
pub use helpers::log_musicxml;
pub use emitter::emit_musicxml;
