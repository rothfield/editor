//! Music Notation Editor WASM API
//!
//! This module provides the JavaScript-facing API for the music notation editor.
//! It includes shared utilities for serialization, validation, and error handling,
//! as well as the core API functions organized by functional domain.
//!
//! # Module Structure
//!
//! - `helpers`: Shared utilities for serialization, validation, error handling, and logging
//! - `cells`: Cell manipulation operations (insert, delete, apply octave/commands)
//! - `core`: Core API functions (includes all operations, currently being split)
//!
//! # Organization Plan
//!
//! During refactoring, functions will be moved from core to:
//! - `cells`: Cell manipulation operations ✅
//! - `documents`: Document-level operations
//! - `lines`: Line-level operations
//! - `ornaments`: Ornament operations
//! - `slurs`: Slur operations
//!
//! For now, all public functions are re-exported from core to maintain API compatibility.
//! Cell operations are also re-exported from the cells module.

pub mod helpers;
pub mod cells;
pub mod core;

// Re-export all public functions from modules to maintain the current public API
pub use core::*;
pub use cells::{insert_character, parse_text, delete_character, apply_octave, apply_command};
