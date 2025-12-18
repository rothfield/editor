//! MusicXML grace note and superscript handling
//!
//! Handles detection and classification of grace notes and superscripts.

use crate::models::{PitchCode, SuperscriptPositionType};

/// Detect superscript type from grace note characteristics
/// Returns the MusicXML superscript type name as a string
///
/// Detection heuristic:
/// - 1-2 grace notes: appoggiatura/acciaccatura (slash handled separately)
/// - 3+ repeated notes: trill
/// - Different notes in sequence: turn or other
///
/// Note: This is a simplified heuristic. For more accurate detection,
/// superscript type should be stored in the Ornament struct.
pub fn detect_grace_note_superscript_type(grace_notes: &[(PitchCode, i8, SuperscriptPositionType)]) -> Option<&'static str> {
    if grace_notes.is_empty() {
        return None;
    }

    // For single grace note, it's typically an appoggiatura/acciaccatura (handled by slash param)
    if grace_notes.len() == 1 {
        return None; // Not a "typed" superscript, just a grace note
    }

    // For multiple grace notes, check if they're repeated (trill) or different (turn)
    if grace_notes.len() >= 2 {
        let first_pitch = &grace_notes[0].0;

        // Check if all notes are the same pitch (trill)
        let all_same = grace_notes.iter().all(|(p, _, _)| p == first_pitch);
        if all_same {
            return Some("trill");
        }

        // For now, default to "turn" for multiple different notes
        // This could be enhanced with more sophisticated detection
        if grace_notes.len() >= 3 {
            return Some("turn");
        }
    }

    None
}

/// Map SuperscriptPositionType to MusicXML placement attribute
pub fn superscript_position_to_placement(position: &SuperscriptPositionType) -> Option<&'static str> {
    match position {
        SuperscriptPositionType::OnTop => Some("above"),
        SuperscriptPositionType::Before | SuperscriptPositionType::After => None, // Default placement
    }
}

