//! Recursive descent parser for codepoints
//!
//! This module provides parsing functions that work directly with u32 codepoints,
//! used by the patch-based API for incremental text editing.
//!
//! Parser structure:
//! - parse_codepoint(cp) → normalized codepoint (e.g., '|' → BARLINE_SINGLE)
//! - try_combine_codepoints(prev, new) → combined codepoint if they form a unit

use crate::renderers::font_utils::{
    BARLINE_SINGLE, BARLINE_DOUBLE, BARLINE_REPEAT_LEFT, BARLINE_REPEAT_RIGHT,
    pitch_from_codepoint, glyph_for_pitch_from_cp,
};
use crate::models::pitch_code::PitchCode;

// ASCII codepoints
const ASCII_PIPE: u32 = 0x7C;      // '|'
const ASCII_COLON: u32 = 0x3A;     // ':'
const ASCII_SHARP: u32 = 0x23;     // '#'
const ASCII_B: u32 = 0x62;         // 'b' (flat)
const ASCII_SLASH: u32 = 0x2F;     // '/'

// Unicode barline codepoints
const BARLINE_SINGLE_CP: u32 = BARLINE_SINGLE as u32;
const BARLINE_DOUBLE_CP: u32 = BARLINE_DOUBLE as u32;
const BARLINE_REPEAT_LEFT_CP: u32 = BARLINE_REPEAT_LEFT as u32;
const BARLINE_REPEAT_RIGHT_CP: u32 = BARLINE_REPEAT_RIGHT as u32;

/// Parse a single codepoint into its normalized form.
///
/// This is the entry point for single-character parsing.
/// Special characters are converted to their Unicode equivalents:
/// - '|' (0x7C) → BARLINE_SINGLE (U+1D100)
///
/// Most characters pass through unchanged.
pub fn parse_codepoint(cp: u32) -> u32 {
    match cp {
        ASCII_PIPE => BARLINE_SINGLE_CP,
        _ => cp,
    }
}

/// Try to combine two codepoints using recursive descent.
///
/// Tries each production rule in order:
/// 1. Barline combinations (|:, :|, ||)
/// 2. Pitch + accidental combinations (1#, 2b, etc.)
///
/// Returns Some(combined_cp) if they combine, None otherwise.
pub fn try_combine_codepoints(prev_cp: u32, new_cp: u32) -> Option<u32> {
    // Try barline productions first
    if let Some(combined) = try_barline(prev_cp, new_cp) {
        return Some(combined);
    }

    // Try pitch + accidental productions
    if let Some(combined) = try_accidental(prev_cp, new_cp) {
        return Some(combined);
    }

    None
}

/// Barline production rules:
/// - BARLINE + COLON → REPEAT_LEFT
/// - COLON + BARLINE → REPEAT_RIGHT
/// - BARLINE + BARLINE → DOUBLE
fn try_barline(prev_cp: u32, new_cp: u32) -> Option<u32> {
    match (prev_cp, new_cp) {
        // | + : → |: (repeat left barline)
        (ASCII_PIPE, ASCII_COLON) |
        (BARLINE_SINGLE_CP, ASCII_COLON) => Some(BARLINE_REPEAT_LEFT_CP),

        // : + | → :| (repeat right barline)
        (ASCII_COLON, ASCII_PIPE) |
        (ASCII_COLON, BARLINE_SINGLE_CP) => Some(BARLINE_REPEAT_RIGHT_CP),

        // | + | → || (double barline)
        (ASCII_PIPE, ASCII_PIPE) |
        (BARLINE_SINGLE_CP, ASCII_PIPE) |
        (ASCII_PIPE, BARLINE_SINGLE_CP) |
        (BARLINE_SINGLE_CP, BARLINE_SINGLE_CP) => Some(BARLINE_DOUBLE_CP),

        _ => None,
    }
}

/// Accidental production rules:
/// - PITCH + SHARP → SHARPED_PITCH
/// - PITCH + FLAT → FLATTED_PITCH
/// - FLAT_PITCH + SLASH → HALF_FLAT_PITCH
fn try_accidental(prev_cp: u32, new_cp: u32) -> Option<u32> {
    // Get pitch info from previous codepoint
    let (pitch, octave) = pitch_from_codepoint(prev_cp)?;

    let new_pitch = match new_cp {
        ASCII_SHARP => apply_sharp(pitch)?,
        ASCII_B => apply_flat(pitch)?,
        ASCII_SLASH => apply_half_flat(pitch)?,
        _ => return None,
    };

    // Get combined glyph using source codepoint to infer pitch system
    let combined_char = glyph_for_pitch_from_cp(new_pitch, octave, prev_cp)?;
    Some(combined_char as u32)
}

/// Apply sharp to a pitch code
fn apply_sharp(pitch: PitchCode) -> Option<PitchCode> {
    use PitchCode::*;
    match pitch {
        // Natural → Sharp
        N1 => Some(N1s), N2 => Some(N2s), N3 => Some(N3s), N4 => Some(N4s),
        N5 => Some(N5s), N6 => Some(N6s), N7 => Some(N7s),
        // Sharp → Double sharp
        N1s => Some(N1ss), N2s => Some(N2ss), N3s => Some(N3ss), N4s => Some(N4ss),
        N5s => Some(N5ss), N6s => Some(N6ss), N7s => Some(N7ss),
        // Flat → Natural (sharp cancels flat)
        N1b => Some(N1), N2b => Some(N2), N3b => Some(N3), N4b => Some(N4),
        N5b => Some(N5), N6b => Some(N6), N7b => Some(N7),
        _ => None,
    }
}

/// Apply flat to a pitch code
fn apply_flat(pitch: PitchCode) -> Option<PitchCode> {
    use PitchCode::*;
    match pitch {
        // Natural → Flat
        N1 => Some(N1b), N2 => Some(N2b), N3 => Some(N3b), N4 => Some(N4b),
        N5 => Some(N5b), N6 => Some(N6b), N7 => Some(N7b),
        // Flat → Double flat
        N1b => Some(N1bb), N2b => Some(N2bb), N3b => Some(N3bb), N4b => Some(N4bb),
        N5b => Some(N5bb), N6b => Some(N6bb), N7b => Some(N7bb),
        // Sharp → Natural (flat cancels sharp)
        N1s => Some(N1), N2s => Some(N2), N3s => Some(N3), N4s => Some(N4),
        N5s => Some(N5), N6s => Some(N6), N7s => Some(N7),
        _ => None,
    }
}

/// Apply half-flat to a flat pitch
fn apply_half_flat(pitch: PitchCode) -> Option<PitchCode> {
    use PitchCode::*;
    match pitch {
        N1b => Some(N1hf), N2b => Some(N2hf), N3b => Some(N3hf), N4b => Some(N4hf),
        N5b => Some(N5hf), N6b => Some(N6hf), N7b => Some(N7hf),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_pipe_to_barline() {
        assert_eq!(parse_codepoint(ASCII_PIPE), BARLINE_SINGLE_CP);
    }

    #[test]
    fn test_parse_colon_unchanged() {
        assert_eq!(parse_codepoint(ASCII_COLON), ASCII_COLON);
    }

    #[test]
    fn test_combine_barline_colon() {
        // | + : → |:
        assert_eq!(
            try_combine_codepoints(ASCII_PIPE, ASCII_COLON),
            Some(BARLINE_REPEAT_LEFT_CP)
        );
        // Also works with already-parsed barline
        assert_eq!(
            try_combine_codepoints(BARLINE_SINGLE_CP, ASCII_COLON),
            Some(BARLINE_REPEAT_LEFT_CP)
        );
    }

    #[test]
    fn test_combine_colon_barline() {
        // : + | → :|
        assert_eq!(
            try_combine_codepoints(ASCII_COLON, ASCII_PIPE),
            Some(BARLINE_REPEAT_RIGHT_CP)
        );
    }

    #[test]
    fn test_combine_double_barline() {
        // | + | → ||
        assert_eq!(
            try_combine_codepoints(ASCII_PIPE, ASCII_PIPE),
            Some(BARLINE_DOUBLE_CP)
        );
    }

    #[test]
    fn test_no_combine_unrelated() {
        // Space + colon shouldn't combine
        assert_eq!(try_combine_codepoints(0x20, ASCII_COLON), None);
    }
}
