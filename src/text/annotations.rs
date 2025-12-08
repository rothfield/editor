//! Annotation layer for metadata on text
//!
//! Stores ornaments, slurs, and other metadata separately from text,
//! linked by positions. Annotations automatically track position changes
//! when text is edited.

use super::cursor::{TextPos, TextRange};
use serde::{Deserialize, Serialize};

/// Ornament placement relative to parent note
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum OrnamentPlacement {
    Before,
    After,
    OnTop,
}

impl Default for OrnamentPlacement {
    fn default() -> Self {
        OrnamentPlacement::After
    }
}

/// Text-based ornament data stored in annotation layer
///
/// Follows the "text-first" architecture: ornament notation is stored as text,
/// not as Cell objects. Cells are generated from this text during export/render.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct OrnamentData {
    /// Position in text (line, col)
    pub pos: TextPos,

    /// Text notation for ornament (e.g., "2 3" or "2̇ 3̇" with octave dots)
    pub notation: String,

    /// Placement relative to parent note
    #[serde(default)]
    pub placement: OrnamentPlacement,
}

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
    /// Point annotations: ornaments at specific positions (text-based)
    #[serde(default)]
    pub ornaments: Vec<OrnamentData>,

    /// Range annotations: slurs connecting positions
    #[serde(default)]
    pub slurs: Vec<SlurSpan>,

    // Future: dynamics, articulations, etc.
}

impl AnnotationLayer {
    /// Create a new empty annotation layer
    pub fn new() -> Self {
        Self {
            ornaments: Vec::new(),
            slurs: Vec::new(),
        }
    }

    /// Add an ornament at a position with text notation and placement
    pub fn add_ornament(&mut self, pos: TextPos, notation: String, placement: OrnamentPlacement) {
        // Remove existing ornament at this position first
        self.ornaments.retain(|o| o.pos != pos);
        self.ornaments.push(OrnamentData { pos, notation, placement });
    }

    /// Remove an ornament at a position, returns true if an ornament was removed
    pub fn remove_ornament(&mut self, pos: TextPos) -> bool {
        let len_before = self.ornaments.len();
        self.ornaments.retain(|o| o.pos != pos);
        self.ornaments.len() < len_before
    }

    /// Get an ornament at a position
    pub fn get_ornament(&self, pos: TextPos) -> Option<&OrnamentData> {
        self.ornaments.iter().find(|o| o.pos == pos)
    }

    /// Get all ornaments on a specific line
    pub fn get_ornaments_for_line(&self, line: usize) -> Vec<&OrnamentData> {
        self.ornaments
            .iter()
            .filter(|o| o.pos.line == line)
            .collect()
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
    /// Removes annotation at the position and shifts remaining left by 1
    pub fn on_delete(&mut self, pos: TextPos) {
        // Remove annotation at deleted position
        self.ornaments.retain(|o| o.pos != pos);

        // Shift remaining annotations
        self.shift_after(pos, -1);
    }

    /// Called when a range is replaced
    ///
    /// Removes annotations in the range and shifts remaining appropriately
    pub fn on_replace(&mut self, range: TextRange, new_len: usize) {
        let old_len = range.len();
        let delta = new_len as i32 - old_len as i32;

        // Remove annotations in the replaced range
        self.ornaments
            .retain(|o| !range.contains(o.pos) && o.pos < range.start);

        // Shift annotations after the range
        if delta != 0 {
            self.shift_after(range.start, delta);
        }
    }

    /// Shift all annotations after a position by a delta
    ///
    /// Positive delta shifts right, negative shifts left
    fn shift_after(&mut self, pos: TextPos, delta: i32) {
        // Shift point annotations (ornaments)
        for ornament in &mut self.ornaments {
            if ornament.pos.line == pos.line && ornament.pos.col >= pos.col {
                ornament.pos.col = (ornament.pos.col as i32 + delta).max(0) as usize;
            }
        }

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
    fn test_annotation_insert_tracking() {
        let mut annotations = AnnotationLayer::new();

        // Add ornaments at positions 0 and 4
        annotations.add_ornament(
            TextPos::new(0, 0),
            "2".to_string(),
            OrnamentPlacement::Before,
        );
        annotations.add_ornament(
            TextPos::new(0, 4),
            "3".to_string(),
            OrnamentPlacement::After,
        );

        // Insert character at position 2
        annotations.on_insert(TextPos::new(0, 2));

        // Ornament at 0 should stay, ornament at 4 should shift to 5
        assert!(annotations.get_ornament(TextPos::new(0, 0)).is_some());
        assert!(annotations.get_ornament(TextPos::new(0, 4)).is_none());
        assert!(annotations.get_ornament(TextPos::new(0, 5)).is_some());
    }

    #[test]
    fn test_annotation_delete_tracking() {
        let mut annotations = AnnotationLayer::new();

        annotations.add_ornament(
            TextPos::new(0, 0),
            "2".to_string(),
            OrnamentPlacement::Before,
        );
        annotations.add_ornament(
            TextPos::new(0, 4),
            "3".to_string(),
            OrnamentPlacement::After,
        );

        // Delete character at position 4 (removes ornament there)
        annotations.on_delete(TextPos::new(0, 4));

        // Ornament at 0 should stay, ornament at 4 should be removed
        assert!(annotations.get_ornament(TextPos::new(0, 0)).is_some());
        assert!(annotations.get_ornament(TextPos::new(0, 4)).is_none());
    }

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
        // After each delete at pos 0: start stays 0, end shrinks
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
