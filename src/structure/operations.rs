//! Musical operations on text using layered architecture
//!
//! This module provides operations that transform musical text:
//! - Octave shift (transpose up/down by octaves)
//! - Pitch transpose (future)
//! - Interval operations (future)
//!
//! All operations use:
//! - Layer 1: Decode text → pitch semantics
//! - Transform semantics
//! - Layer 1: Encode pitch → new text

use crate::text::cursor::TextRange;
use crate::models::elements::PitchSystem;
use crate::renderers::font_utils::{glyph_for_pitch, pitch_from_glyph};

/// Result of an octave shift operation
#[derive(Debug, Clone, PartialEq)]
pub struct OctaveShiftResult {
    /// The transformed text
    pub new_text: String,

    /// Number of characters successfully shifted
    pub shifted_count: usize,

    /// Number of characters skipped (non-pitched or out of range)
    pub skipped_count: usize,
}

/// Shift octaves for all pitched elements in text
///
/// ## Layered Architecture Demo
///
/// - Layer 1: `pitch_from_glyph()` to decode character → (pitch, octave)
/// - Transform: Add delta to octave
/// - Layer 1: `glyph_for_pitch()` to encode (pitch, new_octave) → new character
///
/// ## Parameters
/// - `text`: Input text (e.g., "1 2 3")
/// - `delta`: Octave shift (+1 = up one octave, -1 = down one octave)
/// - `system`: Pitch system (Number, Western, etc.)
///
/// ## Returns
/// Transformed text with shifted octaves (e.g., "1 2 3" with delta=+1 becomes glyphs with dots above)
///
/// ## Example
/// ```rust
/// let result = shift_octaves("1 2 3", 1, PitchSystem::Number);
/// // Returns text with octave +1 glyphs (characters with dots above)
/// ```
pub fn shift_octaves(text: &str, delta: i8, system: PitchSystem) -> OctaveShiftResult {
    let mut new_text = String::new();
    let mut shifted_count = 0;
    let mut skipped_count = 0;

    for ch in text.chars() {
        // Layer 1: Try to decode character as pitch
        if let Some((pitch_code, current_octave)) = pitch_from_glyph(ch, system) {
            // Calculate new octave
            let new_octave = current_octave + delta;

            // Layer 1: Encode back to glyph with new octave
            if let Some(new_glyph) = glyph_for_pitch(pitch_code, new_octave, system) {
                new_text.push(new_glyph);
                shifted_count += 1;
            } else {
                // Out of range (octave too high or too low)
                new_text.push(ch); // Keep original
                skipped_count += 1;
            }
        } else {
            // Not a pitched element (space, barline, dash, etc.)
            new_text.push(ch); // Keep original
            skipped_count += 1;
        }
    }

    OctaveShiftResult {
        new_text,
        shifted_count,
        skipped_count,
    }
}

/// Set octave for a single Cell (mutates in place)
///
/// Works at the semantic level: updates `cell.octave` only.
/// Display glyph is derived via `cell.display_char()` at render time.
///
/// ## Parameters
/// - `cell`: The cell to modify (must be PitchedElement)
/// - `target_octave`: Absolute octave value (-2, -1, 0, +1, +2)
///
/// ## Returns
/// `true` if octave was set successfully, `false` if cell is not pitched or octave out of range
pub fn set_cell_octave(cell: &mut crate::models::core::Cell, target_octave: i8) -> bool {
    use crate::models::elements::ElementKind;
    use crate::models::elements::PitchSystem;

    // Only apply to pitched elements
    if cell.kind != ElementKind::PitchedElement {
        return false;
    }

    let pitch_code = match cell.pitch_code {
        Some(pc) => pc,
        None => return false,
    };

    let system = cell.pitch_system.unwrap_or(PitchSystem::Number);

    // Validate that target octave is in range
    if glyph_for_pitch(pitch_code, target_octave, system).is_some() {
        // Just mutate the semantic field; glyph is derived at render time
        cell.octave = target_octave;
        true
    } else {
        false // Out of range
    }
}

/// Set octaves for all pitched cells in a slice
///
/// ## Parameters
/// - `cells`: Mutable slice of cells
/// - `target_octave`: Absolute octave value (-2, -1, 0, +1, +2)
///
/// ## Returns
/// Number of cells whose octave was successfully set
pub fn set_cells_octave(cells: &mut [crate::models::core::Cell], target_octave: i8) -> usize {
    let mut count = 0;
    for cell in cells.iter_mut() {
        if set_cell_octave(cell, target_octave) {
            count += 1;
        }
    }
    count
}

/// Shift octaves for a specific range in text
///
/// Only shifts characters within the specified range, preserving everything else.
///
/// ## Parameters
/// - `text`: Full line text
/// - `range`: Range to shift (start_col..end_col)
/// - `delta`: Octave shift
/// - `system`: Pitch system
///
/// ## Returns
/// Full line text with only the range shifted
pub fn shift_octaves_in_range(
    text: &str,
    range: TextRange,
    delta: i8,
    system: PitchSystem,
) -> OctaveShiftResult {
    // Only works for single-line ranges
    if !range.is_single_line() {
        return OctaveShiftResult {
            new_text: text.to_string(),
            shifted_count: 0,
            skipped_count: text.chars().count(),
        };
    }

    let chars: Vec<char> = text.chars().collect();
    let start = range.start.col.min(chars.len());
    let end = range.end.col.min(chars.len());

    // Extract the range to shift
    let range_text: String = chars[start..end].iter().collect();

    // Shift the range
    let shift_result = shift_octaves(&range_text, delta, system);

    // Reconstruct full text: before + shifted + after
    let before: String = chars[..start].iter().collect();
    let after: String = chars[end..].iter().collect();
    let new_text = format!("{}{}{}", before, shift_result.new_text, after);

    OctaveShiftResult {
        new_text,
        shifted_count: shift_result.shifted_count,
        skipped_count: shift_result.skipped_count,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::text::cursor::TextPos;

    #[test]
    fn test_shift_octaves_up() {
        // Shift "1 2 3" up one octave
        let result = shift_octaves("1 2 3", 1, PitchSystem::Number);

        assert_eq!(result.shifted_count, 3); // 3 notes shifted
        assert_eq!(result.skipped_count, 2); // 2 spaces skipped

        // Result should have octave +1 glyphs (with dots above)
        // Character codes should be from PUA range for octave +1
        assert!(result.new_text.len() > 0);
    }

    #[test]
    fn test_shift_octaves_down() {
        // Start with base octave "1 2 3", shift down
        let result = shift_octaves("1 2 3", -1, PitchSystem::Number);

        assert_eq!(result.shifted_count, 3);
        assert_eq!(result.skipped_count, 2);
    }

    #[test]
    fn test_shift_octaves_no_change() {
        // Delta 0 should return same glyphs
        let result = shift_octaves("1 2 3", 0, PitchSystem::Number);

        assert_eq!(result.shifted_count, 3);
        assert_eq!(result.new_text.chars().count(), 5); // "1 2 3"
    }

    #[test]
    fn test_shift_preserves_non_pitches() {
        // Spaces, barlines, dashes should be preserved
        let result = shift_octaves("| 1-- 2 |", 1, PitchSystem::Number);

        // Should preserve: "|", " ", "-", "-", " ", "|"
        assert!(result.new_text.contains('|')); // Barlines preserved
        assert!(result.new_text.contains('-')); // Dashes preserved
    }

    #[test]
    fn test_shift_octaves_in_range() {
        // Shift only middle note: "1 2 3" → shift "2" only
        let text = "1 2 3";
        let range = TextRange::new(TextPos::new(0, 2), TextPos::new(0, 3));

        let result = shift_octaves_in_range(text, range, 1, PitchSystem::Number);

        assert_eq!(result.shifted_count, 1); // Only "2" shifted

        // First and last characters should be unchanged
        let chars: Vec<char> = result.new_text.chars().collect();
        assert_eq!(chars[0], '1'); // First unchanged
        assert_eq!(chars[4], '3'); // Last unchanged
    }

    #[test]
    fn test_shift_range_multitoken_beat() {
        // Shift "1--" in "1-- 2"
        let text = "1-- 2";
        let range = TextRange::new(TextPos::new(0, 0), TextPos::new(0, 3));

        let result = shift_octaves_in_range(text, range, 1, PitchSystem::Number);

        assert_eq!(result.shifted_count, 1); // Only "1" is pitched

        // Check that "2" at position 4 is unchanged
        let chars: Vec<char> = result.new_text.chars().collect();
        assert_eq!(chars[4], '2');
    }
}
