//! Number system pitch implementation
//!
//! The number system uses numbers 1-7 to represent the
//! seven degrees of the musical scale.

use crate::models::elements::{PitchSystem, Accidental};

/// Number system implementation
pub struct NumberSystem;

impl NumberSystem {
    /// Get the pitch sequence for number system
    pub fn pitch_sequence() -> Vec<&'static str> {
        vec!["1", "2", "3", "4", "5", "6", "7"]
    }

    /// Validate if a string is valid number system pitch
    pub fn validate_pitch(pitch: &str) -> bool {
        let base = pitch.trim_end_matches('#').trim_end_matches('b');
        Self::pitch_sequence().contains(&base)
    }

    /// Get solfege syllable for number
    pub fn get_solfege(number: &str) -> &'static str {
        match number {
            "1" => "do",
            "2" => "re",
            "3" => "mi",
            "4" => "fa",
            "5" => "sol",
            "6" => "la",
            "7" => "ti",
            _ => "do",
        }
    }

    /// Convert number to western system
    pub fn to_western(number: &str, accidental: Accidental) -> String {
        let base = match number {
            "1" => "c",
            "2" => "d",
            "3" => "e",
            "4" => "f",
            "5" => "g",
            "6" => "a",
            "7" => "b",
            _ => "c",
        };

        format!("{}{}", base, accidental.symbol())
    }

    /// Convert from western system to number
    pub fn from_western(western: &str) -> String {
        let base = western.trim_end_matches('#').trim_end_matches('b').to_lowercase();
        match base.as_str() {
            "c" => "1",
            "d" => "2",
            "e" => "3",
            "f" => "4",
            "g" => "5",
            "a" => "6",
            "b" => "7",
            _ => "1",
        }.to_string()
    }
}