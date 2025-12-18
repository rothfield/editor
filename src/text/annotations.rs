//! Annotation layer for metadata on text
//!
//! Stores slurs and other range-based metadata separately from text,
//! linked by positions. Annotations automatically track position changes
//! when text is edited.
//!
//! Note: Grace notes are now stored directly on cells via the
//! superscript flag. See `cell.superscript` and `selectionToSuperscript()`.

use super::cursor::{TextPos, TextRange};
use serde::{Deserialize, Serialize};

/// A slur connecting two positions
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SlurSpan {
    pub start: TextPos,
    pub end: TextPos,
}

impl SlurSpan {
    pub fn new(start: TextPos, end: TextPos) -> Self {
        Self { start, end }
    }

    /// Check if this slur is valid (start < end)
    pub fn is_valid(&self) -> bool {
        self.start < self.end
    }

    /// Get the range covered by this slur
    pub fn range(&self) -> TextRange {
        TextRange::new(self.start, self.end)
    }
}

/// Annotation layer storing metadata on text
///
/// Annotations are stored separately from text and automatically track
/// position changes when text is edited.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AnnotationLayer {
    /// Range annotations: slurs connecting positions
    #[serde(default)]
    pub slurs: Vec<SlurSpan>,

    // Future: dynamics, articulations, etc.
}

impl AnnotationLayer {
    /// Create a new empty annotation layer
    pub fn new() -> Self {
        Self {
            slurs: Vec::new(),
        }
    }

    /// Add a slur
    pub fn add_slur(&mut self, slur: SlurSpan) {
        if slur.is_valid() {
            self.slurs.push(slur);
        }
    }

    /// Remove slurs overlapping a position
    pub fn remove_slurs_at(&mut self, pos: TextPos) {
        self.slurs.retain(|slur| !slur.range().contains(pos));
    }

    /// Get slurs overlapping a position
    pub fn slurs_at(&self, pos: TextPos) -> Vec<&SlurSpan> {
        self.slurs
            .iter()
            .filter(|slur| slur.range().contains(pos))
            .collect()
    }

    /// Called when a character is inserted at a position
    ///
    /// Shifts all annotations at or after the position to the right by 1
    pub fn on_insert(&mut self, pos: TextPos) {
        self.shift_after(pos, 1);
    }

    /// Called when a character is deleted at a position
    ///
    /// Shifts remaining annotations left by 1
    pub fn on_delete(&mut self, pos: TextPos) {
        self.shift_after(pos, -1);
    }

    /// Called when a range is replaced
    ///
    /// Shifts remaining annotations appropriately
    pub fn on_replace(&mut self, range: TextRange, new_len: usize) {
        let old_len = range.len();
        let delta = new_len as i32 - old_len as i32;

        if delta != 0 {
            self.shift_after(range.start, delta);
        }
    }

    /// Shift all annotations after a position by a delta
    ///
    /// Positive delta shifts right, negative shifts left
    fn shift_after(&mut self, pos: TextPos, delta: i32) {
        // Shift range annotations (slurs)
        for slur in &mut self.slurs {
            // Start shifts if insert is at or before start
            if slur.start.line == pos.line && slur.start.col >= pos.col {
                slur.start.col = (slur.start.col as i32 + delta).max(0) as usize;
            }
            // End only shifts if insert is BEFORE end (inside the slur)
            // End is exclusive, so inserting AT the end should not shift it
            if slur.end.line == pos.line && slur.end.col > pos.col {
                slur.end.col = (slur.end.col as i32 + delta).max(0) as usize;
            }
        }

        // Remove invalid slurs (where start >= end after shift)
        self.slurs.retain(|s| s.is_valid());
    }
}

impl Default for AnnotationLayer {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_slur_tracking() {
        let mut annotations = AnnotationLayer::new();

        // Add slur from 0 to 6
        annotations.add_slur(SlurSpan::new(TextPos::new(0, 0), TextPos::new(0, 6)));

        // Insert character at position 2
        annotations.on_insert(TextPos::new(0, 2));

        // Slur should now be from 0 to 7
        assert_eq!(annotations.slurs[0].start, TextPos::new(0, 0));
        assert_eq!(annotations.slurs[0].end, TextPos::new(0, 7));
    }

    #[test]
    fn test_slur_invalidation() {
        let mut annotations = AnnotationLayer::new();

        // Add slur from 0 to 2 (covers positions 0 and 1)
        annotations.add_slur(SlurSpan::new(TextPos::new(0, 0), TextPos::new(0, 2)));

        // Delete at start position repeatedly to shrink slur
        annotations.on_delete(TextPos::new(0, 0)); // end: 2 > 0 → 1. Slur: 0-1
        annotations.on_delete(TextPos::new(0, 0)); // end: 1 > 0 → 0. Slur: 0-0 (invalid!)

        // Slur should be removed (start >= end)
        assert_eq!(annotations.slurs.len(), 0);
    }

    #[test]
    fn test_slur_end_not_shifted_when_deleting_at_end() {
        let mut annotations = AnnotationLayer::new();

        // Add slur from 0 to 2 (covers positions 0 and 1)
        annotations.add_slur(SlurSpan::new(TextPos::new(0, 0), TextPos::new(0, 2)));

        // Delete at end position (outside slur) - end should NOT shift
        annotations.on_delete(TextPos::new(0, 2));

        // Slur should be unchanged (end=2 is exclusive, deleting there is outside)
        assert_eq!(annotations.slurs.len(), 1);
        assert_eq!(annotations.slurs[0].end, TextPos::new(0, 2));
    }
}
