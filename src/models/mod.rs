//! Models module for the Music Notation Editor
//!
//! This module contains all the data models and structures
//! used in the Cell-based musical notation system.

pub mod core;
pub mod elements;
pub mod notation;
pub mod pitch_code;
pub mod pitch_systems;
pub mod barlines;
pub mod serde_helpers;
pub mod constraints;
pub mod tonic;
pub mod western_pitch;
// pub mod editor_state;  // Commented out - not needed, Document.state already has cursor/selection

// Re-export commonly used types
pub use core::*;
pub use elements::*;
pub use notation::*;
pub use pitch_code::PitchCode;
pub use constraints::*;
pub use tonic::Tonic;
pub use western_pitch::WesternPitch;
// pub use editor_state::EditorState;