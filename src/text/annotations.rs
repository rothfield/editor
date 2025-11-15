//! Annotation layer for metadata on text
//!
//! Stores ornaments, slurs, and other metadata separately from text,
//! linked by positions. Annotations automatically track position changes
//! when text is edited.

use super::cursor::{TextPos, TextRange};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// Simple ornament marker for proof-of-concept
///
/// In the full implementation, this would reference the actual Ornament struct.
/// For now, we just track the ornament type as a string.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct OrnamentMarker {
    pub ornament_type: String,
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
    /// Point annotations: ornaments at specific positions
    pub ornaments: BTreeMap<TextPos, OrnamentMarker>,

    /// Range annotations: slurs connecting positions
    pub slurs: Vec<SlurSpan>,

    // Future: dynamics, articulations, etc.
}

impl AnnotationLayer {
    /// Create a new empty annotation layer
    pub fn new() -> Self {
        Self {
            ornaments: BTreeMap::new(),
            slurs: Vec::new(),
        }
    }

    /// Add an ornament at a position
    pub fn add_ornament(&mut self, pos: TextPos, ornament: OrnamentMarker) {
        self.ornaments.insert(pos, ornament);
    }

    /// Remove an ornament at a position
    pub fn remove_ornament(&mut self, pos: TextPos) -> Option<OrnamentMarker> {
        self.ornaments.remove(&pos)
    }

    /// Get an ornament at a position
    pub fn get_ornament(&self, pos: TextPos) -> Option<&OrnamentMarker> {
        self.ornaments.get(&pos)
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
        self.ornaments.remove(&pos);

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
            .retain(|pos, _| !range.contains(*pos) && *pos < range.start);

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
        let to_shift: Vec<_> = self
            .ornaments
            .iter()
            .filter(|(p, _)| p.line == pos.line && p.col >= pos.col)
            .map(|(p, o)| (*p, o.clone()))
            .collect();

        for (old_pos, ornament) in to_shift {
            self.ornaments.remove(&old_pos);
            let new_col = (old_pos.col as i32 + delta).max(0) as usize;
            let new_pos = TextPos::new(old_pos.line, new_col);
            self.ornaments.insert(new_pos, ornament);
        }

        // Shift range annotations (slurs)
        for slur in &mut self.slurs {
            if slur.start.line == pos.line && slur.start.col >= pos.col {
                slur.start.col = (slur.start.col as i32 + delta).max(0) as usize;
            }
            if slur.end.line == pos.line && slur.end.col >= pos.col {
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
            OrnamentMarker {
                ornament_type: "trill".to_string(),
            },
        );
        annotations.add_ornament(
            TextPos::new(0, 4),
            OrnamentMarker {
                ornament_type: "mordent".to_string(),
            },
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
            OrnamentMarker {
                ornament_type: "trill".to_string(),
            },
        );
        annotations.add_ornament(
            TextPos::new(0, 4),
            OrnamentMarker {
                ornament_type: "mordent".to_string(),
            },
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

        // Add slur from 2 to 5
        annotations.add_slur(SlurSpan::new(TextPos::new(0, 2), TextPos::new(0, 5)));

        // Delete characters, making slur invalid (start >= end)
        annotations.on_delete(TextPos::new(0, 3));
        annotations.on_delete(TextPos::new(0, 3));
        annotations.on_delete(TextPos::new(0, 3));

        // Slur should be removed (invalid)
        assert_eq!(annotations.slurs.len(), 0);
    }
}
