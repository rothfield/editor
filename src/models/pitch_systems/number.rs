//! Number system pitch implementation
//!
//! The number system uses numbers 1-7 to represent the
//! seven degrees of the musical scale.

use crate::models::elements::Accidental;
use crate::models::pitch_code::PitchCode;
use super::PitchParser;

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

impl PitchParser for NumberSystem {
    fn parse_pitch(input: &str) -> Option<(PitchCode, usize)> {
        if input.is_empty() {
            return None;
        }

        // List of all possible number pitches, longest first for longest-match
        let patterns = [
            // Double sharps (3 chars)
            ("1##", PitchCode::N1ss), ("2##", PitchCode::N2ss), ("3##", PitchCode::N3ss),
            ("4##", PitchCode::N4ss), ("5##", PitchCode::N5ss), ("6##", PitchCode::N6ss),
            ("7##", PitchCode::N7ss),
            // Double flats (3 chars)
            ("1bb", PitchCode::N1bb), ("2bb", PitchCode::N2bb), ("3bb", PitchCode::N3bb),
            ("4bb", PitchCode::N4bb), ("5bb", PitchCode::N5bb), ("6bb", PitchCode::N6bb),
            ("7bb", PitchCode::N7bb),
            // Sharps (2 chars)
            ("1#", PitchCode::N1s), ("2#", PitchCode::N2s), ("3#", PitchCode::N3s),
            ("4#", PitchCode::N4s), ("5#", PitchCode::N5s), ("6#", PitchCode::N6s),
            ("7#", PitchCode::N7s),
            // Flats (2 chars)
            ("1b", PitchCode::N1b), ("2b", PitchCode::N2b), ("3b", PitchCode::N3b),
            ("4b", PitchCode::N4b), ("5b", PitchCode::N5b), ("6b", PitchCode::N6b),
            ("7b", PitchCode::N7b),
            // Naturals (1 char)
            ("1", PitchCode::N1), ("2", PitchCode::N2), ("3", PitchCode::N3),
            ("4", PitchCode::N4), ("5", PitchCode::N5), ("6", PitchCode::N6),
            ("7", PitchCode::N7),
        ];

        // Try longest match first
        for (pattern, pitch_code) in &patterns {
            if input.starts_with(pattern) {
                return Some((*pitch_code, pattern.len()));
            }
        }

        None
    }
}