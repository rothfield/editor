//! Western system pitch implementation
//!
//! The western system uses note names C-B to represent
//! the seven degrees of the musical scale.

use crate::models::elements::{PitchSystem, Accidental};

/// Western system implementation
pub struct WesternSystem;

impl WesternSystem {
    /// Get the pitch sequence for western system
    pub fn pitch_sequence() -> Vec<&'static str> {
        vec!["c", "d", "e", "f", "g", "a", "b"]
    }

    /// Validate if a string is valid western system pitch
    pub fn validate_pitch(pitch: &str) -> bool {
        let base = pitch.trim_end_matches('#').trim_end_matches('b').to_lowercase();
        Self::pitch_sequence().contains(&base.as_str())
    }

    /// Convert western to number system
    pub fn to_number(western: &str, accidental: Accidental) -> String {
        let base = western.trim_end_matches('#').trim_end_matches('b').to_lowercase();
        let number = match base.as_str() {
            "c" => "1",
            "d" => "2",
            "e" => "3",
            "f" => "4",
            "g" => "5",
            "a" => "6",
            "b" => "7",
            _ => "1",
        };

        format!("{}{}", number, accidental.symbol())
    }

    /// Get solfege syllable for western note
    pub fn get_solfege(note: &str) -> &'static str {
        let base = note.trim_end_matches('#').trim_end_matches('b').to_lowercase();
        match base.as_str() {
            "c" => "do",
            "d" => "re",
            "e" => "mi",
            "f" => "fa",
            "g" => "sol",
            "a" => "la",
            "b" => "ti",
            _ => "do",
        }
    }
}