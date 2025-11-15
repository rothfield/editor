//! Cursor and selection management for text editing
//!
//! Pure text positions with no musical knowledge.

use serde::{Deserialize, Serialize};

/// A position in text (line, column)
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub struct TextPos {
    pub line: usize,
    pub col: usize,
}

impl TextPos {
    pub fn new(line: usize, col: usize) -> Self {
        Self { line, col }
    }

    /// Create a position at the start of a line
    pub fn line_start(line: usize) -> Self {
        Self { line, col: 0 }
    }

    /// Create a position at (0, 0)
    pub fn zero() -> Self {
        Self { line: 0, col: 0 }
    }
}

/// A range of text from start (inclusive) to end (exclusive)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct TextRange {
    pub start: TextPos,
    pub end: TextPos,
}

impl TextRange {
    pub fn new(start: TextPos, end: TextPos) -> Self {
        Self { start, end }
    }

    /// Create a range covering a single character
    pub fn single_char(pos: TextPos) -> Self {
        Self {
            start: pos,
            end: TextPos::new(pos.line, pos.col + 1),
        }
    }

    /// Create a range covering an entire line
    pub fn entire_line(line: usize, line_len: usize) -> Self {
        Self {
            start: TextPos::new(line, 0),
            end: TextPos::new(line, line_len),
        }
    }

    /// Check if this range is empty (start == end)
    pub fn is_empty(&self) -> bool {
        self.start == self.end
    }

    /// Check if this range is on a single line
    pub fn is_single_line(&self) -> bool {
        self.start.line == self.end.line
    }

    /// Get the length in characters (only works for single-line ranges)
    pub fn len(&self) -> usize {
        if self.is_single_line() {
            self.end.col.saturating_sub(self.start.col)
        } else {
            0
        }
    }

    /// Check if a position is contained within this range
    pub fn contains(&self, pos: TextPos) -> bool {
        pos >= self.start && pos < self.end
    }
}

/// Cursor state for text editing
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Cursor {
    /// Current cursor position
    pub pos: TextPos,
    /// Desired column for vertical movement (preserves column when moving through shorter lines)
    pub desired_col: usize,
}

impl Cursor {
    pub fn new(pos: TextPos) -> Self {
        Self {
            pos,
            desired_col: pos.col,
        }
    }

    pub fn at_zero() -> Self {
        Self::new(TextPos::zero())
    }

    /// Move cursor to a new position
    pub fn move_to(&mut self, pos: TextPos) {
        self.pos = pos;
        self.desired_col = pos.col;
    }

    /// Move cursor vertically (preserves desired column)
    pub fn move_vertical(&mut self, pos: TextPos) {
        self.pos = pos;
        // Keep desired_col unchanged for vertical movement
    }
}

/// Selection state (anchor + head)
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Selection {
    /// Selection anchor (where selection started)
    pub anchor: TextPos,
    /// Selection head (current cursor position)
    pub head: TextPos,
}

impl Selection {
    pub fn new(anchor: TextPos, head: TextPos) -> Self {
        Self { anchor, head }
    }

    /// Create a collapsed selection (cursor only, no selection)
    pub fn collapsed(pos: TextPos) -> Self {
        Self {
            anchor: pos,
            head: pos,
        }
    }

    /// Check if selection is collapsed (anchor == head)
    pub fn is_collapsed(&self) -> bool {
        self.anchor == self.head
    }

    /// Get the range covered by this selection (ordered start to end)
    pub fn range(&self) -> TextRange {
        if self.anchor <= self.head {
            TextRange::new(self.anchor, self.head)
        } else {
            TextRange::new(self.head, self.anchor)
        }
    }

    /// Get the start of the selection (min of anchor and head)
    pub fn start(&self) -> TextPos {
        self.anchor.min(self.head)
    }

    /// Get the end of the selection (max of anchor and head)
    pub fn end(&self) -> TextPos {
        self.anchor.max(self.head)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_text_pos_ordering() {
        let p1 = TextPos::new(0, 5);
        let p2 = TextPos::new(0, 10);
        let p3 = TextPos::new(1, 0);

        assert!(p1 < p2);
        assert!(p2 < p3);
        assert!(p1 < p3);
    }

    #[test]
    fn test_text_range_contains() {
        let range = TextRange::new(TextPos::new(0, 2), TextPos::new(0, 5));

        assert!(range.contains(TextPos::new(0, 2)));
        assert!(range.contains(TextPos::new(0, 3)));
        assert!(range.contains(TextPos::new(0, 4)));
        assert!(!range.contains(TextPos::new(0, 5))); // Exclusive end
        assert!(!range.contains(TextPos::new(0, 1)));
    }

    #[test]
    fn test_selection_range() {
        // Forward selection
        let sel = Selection::new(TextPos::new(0, 2), TextPos::new(0, 5));
        let range = sel.range();
        assert_eq!(range.start, TextPos::new(0, 2));
        assert_eq!(range.end, TextPos::new(0, 5));

        // Backward selection (head < anchor)
        let sel = Selection::new(TextPos::new(0, 5), TextPos::new(0, 2));
        let range = sel.range();
        assert_eq!(range.start, TextPos::new(0, 2));
        assert_eq!(range.end, TextPos::new(0, 5));
    }

    #[test]
    fn test_cursor_desired_col() {
        let mut cursor = Cursor::new(TextPos::new(0, 5));
        assert_eq!(cursor.desired_col, 5);

        // Vertical movement preserves desired_col
        cursor.move_vertical(TextPos::new(1, 2));
        assert_eq!(cursor.pos.col, 2);
        assert_eq!(cursor.desired_col, 5); // Still 5!

        // Horizontal movement updates desired_col
        cursor.move_to(TextPos::new(1, 3));
        assert_eq!(cursor.desired_col, 3); // Updated
    }
}
