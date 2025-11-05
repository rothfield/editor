//! MusicXML grace note and ornament handling
//!
//! Handles detection and classification of grace notes and ornaments.

use crate::models::{PitchCode, OrnamentPositionType};

/// Detect ornament type from grace note characteristics
/// Returns the MusicXML ornament type name as a string
///
/// Detection heuristic:
/// - 1-2 grace notes: appoggiatura/acciaccatura (slash handled separately)
/// - 3+ repeated notes: trill
/// - Different notes in sequence: turn or other
///
/// Note: This is a simplified heuristic. For more accurate detection,
/// ornament type should be stored in the Ornament struct.
pub fn detect_grace_note_ornament_type(grace_notes: &[(PitchCode, i8, OrnamentPositionType)]) -> Option<&'static str> {
    if grace_notes.is_empty() {
        return None;
    }

    // For single grace note, it's typically an appoggiatura/acciaccatura (handled by slash param)
    if grace_notes.len() == 1 {
        return None; // Not a "typed" ornament, just a grace note
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

/// Map OrnamentPositionType to MusicXML placement attribute
pub fn ornament_position_to_placement(position: &OrnamentPositionType) -> Option<&'static str> {
    match position {
        OrnamentPositionType::OnTop => Some("above"),
        OrnamentPositionType::Before | OrnamentPositionType::After => None, // Default placement
    }
}

