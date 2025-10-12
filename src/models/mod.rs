//! Models module for the Music Notation Editor
//!
//! This module contains all the data models and structures
//! used in the CharCell-based musical notation system.

pub mod core;
pub mod elements;
pub mod notation;
pub mod pitch;
pub mod pitch_systems;
pub mod barlines;

// Re-export commonly used types
pub use core::*;
pub use elements::*;
pub use notation::*;