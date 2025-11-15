//! Text buffer implementation (Layer 0)
//!
//! Pure text storage with no musical knowledge.

use super::cursor::{TextPos, TextRange};
use serde::{Deserialize, Serialize};

/// Text editing operation for undo/redo
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum TextEdit {
    Insert(TextPos, char),
    Delete(TextPos, char),
    ReplaceRange(TextRange, String, String), // range, old_text, new_text
}

/// Core text buffer trait
///
/// This trait defines the minimal interface for text editing operations.
/// Different implementations can use different backing stores (String, Rope, CRDT, etc.)
pub trait TextCore {
    /// Get the text of a line
    fn get_line(&self, line: usize) -> Option<&str>;

    /// Get the number of lines
    fn line_count(&self) -> usize;

    /// Insert a character at a position
    fn insert_char(&mut self, pos: TextPos, ch: char);

    /// Delete a character at a position
    fn delete_char(&mut self, pos: TextPos) -> Option<char>;

    /// Replace a range of text with new text
    fn replace_range(&mut self, range: TextRange, text: &str);

    /// Get a character at a position
    fn get_char(&self, pos: TextPos) -> Option<char>;

    /// Undo the last edit
    fn undo(&mut self) -> bool;

    /// Redo the last undone edit
    fn redo(&mut self) -> bool;

    /// Check if undo is available
    fn can_undo(&self) -> bool;

    /// Check if redo is available
    fn can_redo(&self) -> bool;
}

/// Simple string-based text buffer
///
/// Uses Vec<String> for line storage. Suitable for small to medium documents.
/// For large documents, consider using a Rope-based implementation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SimpleBuffer {
    lines: Vec<String>,
    undo_stack: Vec<TextEdit>,
    redo_stack: Vec<TextEdit>,
}

impl SimpleBuffer {
    /// Create a new empty buffer
    pub fn new() -> Self {
        Self {
            lines: vec![String::new()],
            undo_stack: Vec::new(),
            redo_stack: Vec::new(),
        }
    }

    /// Create a buffer from a string
    pub fn from_str(s: &str) -> Self {
        let lines = if s.is_empty() {
            vec![String::new()]
        } else {
            s.lines().map(|l| l.to_string()).collect()
        };

        Self {
            lines,
            undo_stack: Vec::new(),
            redo_stack: Vec::new(),
        }
    }

    /// Create a buffer from lines
    pub fn from_lines(lines: Vec<String>) -> Self {
        let lines = if lines.is_empty() {
            vec![String::new()]
        } else {
            lines
        };

        Self {
            lines,
            undo_stack: Vec::new(),
            redo_stack: Vec::new(),
        }
    }

    /// Convert buffer to string
    pub fn to_string(&self) -> String {
        self.lines.join("\n")
    }

    /// Get all lines as a slice
    pub fn lines(&self) -> &[String] {
        &self.lines
    }

    /// Clear redo stack (called when a new edit is made)
    fn clear_redo(&mut self) {
        self.redo_stack.clear();
    }

    /// Add an edit to the undo stack
    fn push_undo(&mut self, edit: TextEdit) {
        self.undo_stack.push(edit);
        self.clear_redo();
    }
}

impl Default for SimpleBuffer {
    fn default() -> Self {
        Self::new()
    }
}

impl TextCore for SimpleBuffer {
    fn get_line(&self, line: usize) -> Option<&str> {
        self.lines.get(line).map(|s| s.as_str())
    }

    fn line_count(&self) -> usize {
        self.lines.len()
    }

    fn insert_char(&mut self, pos: TextPos, ch: char) {
        if let Some(line) = self.lines.get_mut(pos.line) {
            // Clamp column to valid range
            let col = pos.col.min(line.len());
            line.insert(col, ch);
            self.push_undo(TextEdit::Insert(pos, ch));
        }
    }

    fn delete_char(&mut self, pos: TextPos) -> Option<char> {
        if let Some(line) = self.lines.get_mut(pos.line) {
            if pos.col < line.len() {
                let ch = line.remove(pos.col);
                self.push_undo(TextEdit::Delete(pos, ch));
                return Some(ch);
            }
        }
        None
    }

    fn replace_range(&mut self, range: TextRange, new_text: &str) {
        // Only support single-line ranges for now
        if !range.is_single_line() {
            return;
        }

        if let Some(line) = self.lines.get_mut(range.start.line) {
            let start = range.start.col.min(line.len());
            let end = range.end.col.min(line.len());

            if start <= end {
                let old_text = line[start..end].to_string();
                line.replace_range(start..end, new_text);
                self.push_undo(TextEdit::ReplaceRange(range, old_text, new_text.to_string()));
            }
        }
    }

    fn get_char(&self, pos: TextPos) -> Option<char> {
        self.lines
            .get(pos.line)
            .and_then(|line| line.chars().nth(pos.col))
    }

    fn undo(&mut self) -> bool {
        if let Some(edit) = self.undo_stack.pop() {
            match edit {
                TextEdit::Insert(pos, ch) => {
                    // Undo insert: delete the character
                    if let Some(line) = self.lines.get_mut(pos.line) {
                        if pos.col < line.len() {
                            line.remove(pos.col);
                            self.redo_stack.push(TextEdit::Insert(pos, ch));
                            return true;
                        }
                    }
                }
                TextEdit::Delete(pos, ch) => {
                    // Undo delete: re-insert the character
                    if let Some(line) = self.lines.get_mut(pos.line) {
                        let col = pos.col.min(line.len());
                        line.insert(col, ch);
                        self.redo_stack.push(TextEdit::Delete(pos, ch));
                        return true;
                    }
                }
                TextEdit::ReplaceRange(range, old_text, new_text) => {
                    // Undo replace: restore old text
                    if let Some(line) = self.lines.get_mut(range.start.line) {
                        let start = range.start.col.min(line.len());
                        let new_len = new_text.chars().count();
                        let end = start + new_len;

                        if end <= line.len() {
                            line.replace_range(start..end, &old_text);
                            self.redo_stack.push(TextEdit::ReplaceRange(range, old_text, new_text));
                            return true;
                        }
                    }
                }
            }
        }
        false
    }

    fn redo(&mut self) -> bool {
        if let Some(edit) = self.redo_stack.pop() {
            match edit {
                TextEdit::Insert(pos, ch) => {
                    // Redo insert
                    if let Some(line) = self.lines.get_mut(pos.line) {
                        let col = pos.col.min(line.len());
                        line.insert(col, ch);
                        self.undo_stack.push(TextEdit::Insert(pos, ch));
                        return true;
                    }
                }
                TextEdit::Delete(pos, _ch) => {
                    // Redo delete
                    if let Some(line) = self.lines.get_mut(pos.line) {
                        if pos.col < line.len() {
                            let ch = line.remove(pos.col);
                            self.undo_stack.push(TextEdit::Delete(pos, ch));
                            return true;
                        }
                    }
                }
                TextEdit::ReplaceRange(range, old_text, new_text) => {
                    // Redo replace
                    if let Some(line) = self.lines.get_mut(range.start.line) {
                        let start = range.start.col.min(line.len());
                        let old_len = old_text.chars().count();
                        let end = start + old_len;

                        if end <= line.len() {
                            line.replace_range(start..end, &new_text);
                            self.undo_stack.push(TextEdit::ReplaceRange(range, old_text, new_text));
                            return true;
                        }
                    }
                }
            }
        }
        false
    }

    fn can_undo(&self) -> bool {
        !self.undo_stack.is_empty()
    }

    fn can_redo(&self) -> bool {
        !self.redo_stack.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_simple_buffer_creation() {
        let buffer = SimpleBuffer::from_str("hello world");
        assert_eq!(buffer.line_count(), 1);
        assert_eq!(buffer.get_line(0), Some("hello world"));
    }

    #[test]
    fn test_insert_char() {
        let mut buffer = SimpleBuffer::from_str("hello");
        buffer.insert_char(TextPos::new(0, 5), '!');
        assert_eq!(buffer.get_line(0), Some("hello!"));
    }

    #[test]
    fn test_delete_char() {
        let mut buffer = SimpleBuffer::from_str("hello!");
        let ch = buffer.delete_char(TextPos::new(0, 5));
        assert_eq!(ch, Some('!'));
        assert_eq!(buffer.get_line(0), Some("hello"));
    }

    #[test]
    fn test_undo_redo() {
        let mut buffer = SimpleBuffer::from_str("abc");

        // Insert 'd'
        buffer.insert_char(TextPos::new(0, 3), 'd');
        assert_eq!(buffer.get_line(0), Some("abcd"));

        // Undo
        assert!(buffer.undo());
        assert_eq!(buffer.get_line(0), Some("abc"));

        // Redo
        assert!(buffer.redo());
        assert_eq!(buffer.get_line(0), Some("abcd"));
    }

    #[test]
    fn test_replace_range() {
        let mut buffer = SimpleBuffer::from_str("1 2 3");
        let range = TextRange::new(TextPos::new(0, 0), TextPos::new(0, 1));
        buffer.replace_range(range, "7");
        assert_eq!(buffer.get_line(0), Some("7 2 3"));
    }

    #[test]
    fn test_musical_notation_example() {
        let mut buffer = SimpleBuffer::from_str("1 2 3 4");

        // User inserts '5' at position 4
        buffer.insert_char(TextPos::new(0, 4), '5');
        assert_eq!(buffer.get_line(0), Some("1 2 53 4"));

        // Undo
        buffer.undo();
        assert_eq!(buffer.get_line(0), Some("1 2 3 4"));
    }
}
