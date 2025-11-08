//! MusicXML export module
//!
//! Provides MusicXML 3.1 export functionality for documents.
//!
//! # Module Structure
//!
//! - **converter**: Main entry point (`to_musicxml()`) for converting documents
//! - **export_ir**: Intermediate representation (IR) types for Cell→XML pipeline
//! - **measure**: Measure and segment processing (barline splitting, divisions calculation)
//! - **beat**: Beat processing, normalization, and tuplet detection
//! - **cell_to_ir**: Finite state machine for beat-level rhythm processing (explicit pattern)
//! - **grace_notes**: Grace note and ornament type detection
//! - **builder**: MusicXML XML structure building
//! - **pitch**: Pitch code to MusicXML conversion
//! - **duration**: Duration to note type conversion
//! - **helpers**: Utility functions (GCD/LCM, logging)

pub mod duration;
pub mod pitch;
pub mod builder;
pub mod converter;
pub mod measure;
pub mod beat;
pub mod fsm;
pub mod grace_notes;
pub mod helpers;
pub mod export_ir;
pub mod cell_to_ir;
pub mod emitter;

pub use duration::*;
pub use pitch::*;
pub use builder::*;
pub use converter::to_musicxml;
pub use grace_notes::{detect_grace_note_ornament_type, ornament_position_to_placement};
pub use helpers::log_musicxml;
pub use emitter::emit_musicxml;
