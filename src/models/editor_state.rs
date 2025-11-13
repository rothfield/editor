//! Editor state management
//!
//! This module contains the EditorState struct which represents the complete
//! state of the editor, including the document, cursor position, and selection.
//!
//! This is the WASM-owned source of truth for all editor state.

use serde::{Deserialize, Serialize};
use crate::models::{Document, Pos, Selection, CaretInfo, SelectionInfo, EditorDiff};

/// Complete editor state (WASM-owned source of truth)
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct EditorState {
    /// The document being edited
    pub document: Document,

    /// Current cursor position
    pub cursor: Pos,

    /// Current selection (if any)
    pub selection: Option<Selection>,

    /// Desired column for vertical navigation (preserved across up/down movements)
    pub desired_col: Option<usize>,
}

impl EditorState {
    /// Create a new editor state with a document
    pub fn new(document: Document) -> Self {
        Self {
            document,
            cursor: Pos { line: 0, col: 0 },
            selection: None,
            desired_col: None,
        }
    }

    /// Create a new editor state with cursor at a specific position
    pub fn with_cursor(document: Document, cursor: Pos) -> Self {
        Self {
            document,
            cursor,
            selection: None,
            desired_col: None,
        }
    }

    /// Get the current cursor position
    pub fn cursor(&self) -> Pos {
        self.cursor
    }

    /// Set the cursor position
    pub fn set_cursor(&mut self, pos: Pos) {
        self.cursor = pos;
        // Clear selection when cursor moves explicitly
        self.selection = None;
    }

    /// Get the current selection (if any)
    pub fn selection(&self) -> Option<&Selection> {
        self.selection.as_ref()
    }

    /// Set the selection
    pub fn set_selection(&mut self, selection: Option<Selection>) {
        self.selection = selection;
    }

    /// Clear the selection
    pub fn clear_selection(&mut self) {
        self.selection = None;
    }

    /// Get desired column for vertical navigation
    pub fn desired_col(&self) -> Option<usize> {
        self.desired_col
    }

    /// Set desired column for vertical navigation
    pub fn set_desired_col(&mut self, col: Option<usize>) {
        self.desired_col = col;
    }

    /// Validate and clamp cursor position to document bounds
    pub fn validate_cursor(&mut self) {
        if self.document.lines.is_empty() {
            self.cursor = Pos { line: 0, col: 0 };
            return;
        }

        // Clamp line to valid range
        if self.cursor.line >= self.document.lines.len() {
            self.cursor.line = self.document.lines.len() - 1;
        }

        // Clamp column to valid range for current line
        let max_col = self.document.lines[self.cursor.line].cells.len();
        if self.cursor.col > max_col {
            self.cursor.col = max_col;
        }
    }

    /// Create a CaretInfo from current state
    pub fn caret_info(&self) -> CaretInfo {
        CaretInfo {
            caret: self.cursor,
            desired_col: self.desired_col.unwrap_or(self.cursor.col),
        }
    }

    /// Create a SelectionInfo from current state (if selection exists)
    pub fn selection_info(&self) -> Option<SelectionInfo> {
        self.selection.as_ref().map(|sel| SelectionInfo::from_selection(sel))
    }

    /// Create an EditorDiff from current state with specified dirty lines
    pub fn to_diff(&self, dirty_lines: Vec<usize>) -> EditorDiff {
        EditorDiff {
            dirty_lines,
            caret: self.caret_info(),
            selection: self.selection_info(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::Line;

    fn create_test_document() -> Document {
        Document {
            title: "Test".to_string(),
            lines: vec![
                Line::new_default(),
                Line::new_default(),
            ],
            ..Default::default()
        }
    }

    #[test]
    fn test_editor_state_new() {
        let doc = create_test_document();
        let state = EditorState::new(doc);

        assert_eq!(state.cursor, Pos { line: 0, col: 0 });
        assert!(state.selection.is_none());
        assert!(state.desired_col.is_none());
    }

    #[test]
    fn test_editor_state_with_cursor() {
        let doc = create_test_document();
        let cursor = Pos { line: 1, col: 5 };
        let state = EditorState::with_cursor(doc, cursor);

        assert_eq!(state.cursor, cursor);
    }

    #[test]
    fn test_set_cursor_clears_selection() {
        let doc = create_test_document();
        let mut state = EditorState::new(doc);

        // Set a selection
        state.set_selection(Some(Selection::new(
            Pos { line: 0, col: 0 },
            Pos { line: 0, col: 5 },
        )));

        assert!(state.selection.is_some());

        // Set cursor should clear selection
        state.set_cursor(Pos { line: 0, col: 3 });

        assert!(state.selection.is_none());
    }

    #[test]
    fn test_validate_cursor_clamps_to_bounds() {
        let doc = create_test_document();
        let mut state = EditorState::new(doc);

        // Set cursor beyond document bounds
        state.cursor = Pos { line: 999, col: 999 };
        state.validate_cursor();

        // Should be clamped to valid range
        assert!(state.cursor.line < 2); // Only 2 lines in test document
    }
}
