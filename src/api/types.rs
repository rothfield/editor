//! Shared types for the WASM API
//!
//! This module contains common result types used across multiple API modules.

use crate::models::Cell;

/// Represents a line that was modified during an edit operation
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct DirtyLine {
    pub row: usize,
    pub cells: Vec<Cell>,
}

/// Result of an edit operation (mutation primitive)
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct EditResult {
    pub dirty_lines: Vec<DirtyLine>,
    pub new_cursor_row: usize,
    pub new_cursor_col: usize,
}

/// Result of a copy operation
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct CopyResult {
    pub text: String,           // Plain text for external clipboard
    pub cells: Vec<Cell>,       // Rich cells with annotations
}
