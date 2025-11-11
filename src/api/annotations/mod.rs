//! Annotation operations for musical notation
//!
//! This module provides functions for applying and managing musical annotations:
//! - Slurs: phrase markings across multiple notes
//! - Octave markers: dots above/below notes
//! - Ornaments: trills, mordents, turns, etc.

pub mod slur;

// Re-export all annotation functions
pub use slur::{
    apply_slur,
    remove_slur,
    apply_slur_legacy,
    remove_slur_legacy,
    has_slur_in_selection,
};
