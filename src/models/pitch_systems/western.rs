//! Western system pitch implementation
//!
//! The western system uses note names C-B to represent
//! the seven degrees of the musical scale.

use crate::models::elements::Accidental;
use crate::models::pitch_code::PitchCode;
use super::PitchParser;

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

impl PitchParser for WesternSystem {
    fn parse_pitch(input: &str) -> Option<(PitchCode, usize)> {
        if input.is_empty() {
            return None;
        }

        // List of all possible western pitches, longest first for longest-match
        // Supports both lowercase (c-g) and uppercase (C-G) as defined in atoms.yaml
        let patterns = [
            // Lowercase double sharps (3 chars)
            ("c##", PitchCode::N1ss), ("d##", PitchCode::N2ss), ("e##", PitchCode::N3ss),
            ("f##", PitchCode::N4ss), ("g##", PitchCode::N5ss), ("a##", PitchCode::N6ss),
            ("b##", PitchCode::N7ss),
            // Uppercase double sharps (3 chars)
            ("C##", PitchCode::N1ss), ("D##", PitchCode::N2ss), ("E##", PitchCode::N3ss),
            ("F##", PitchCode::N4ss), ("G##", PitchCode::N5ss), ("A##", PitchCode::N6ss),
            // Lowercase double flats (3 chars)
            ("cbb", PitchCode::N1bb), ("dbb", PitchCode::N2bb), ("ebb", PitchCode::N3bb),
            ("fbb", PitchCode::N4bb), ("gbb", PitchCode::N5bb), ("abb", PitchCode::N6bb),
            ("bbb", PitchCode::N7bb),
            // Uppercase double flats (3 chars)
            ("Cbb", PitchCode::N1bb), ("Dbb", PitchCode::N2bb), ("Ebb", PitchCode::N3bb),
            ("Fbb", PitchCode::N4bb), ("Gbb", PitchCode::N5bb), ("Abb", PitchCode::N6bb),
            // Lowercase sharps (2 chars)
            ("c#", PitchCode::N1s), ("d#", PitchCode::N2s), ("e#", PitchCode::N3s),
            ("f#", PitchCode::N4s), ("g#", PitchCode::N5s), ("a#", PitchCode::N6s),
            ("b#", PitchCode::N7s),
            // Uppercase sharps (2 chars)
            ("C#", PitchCode::N1s), ("D#", PitchCode::N2s), ("E#", PitchCode::N3s),
            ("F#", PitchCode::N4s), ("G#", PitchCode::N5s), ("A#", PitchCode::N6s),
            // Lowercase flats (2 chars)
            ("cb", PitchCode::N1b), ("db", PitchCode::N2b), ("eb", PitchCode::N3b),
            ("fb", PitchCode::N4b), ("gb", PitchCode::N5b), ("ab", PitchCode::N6b),
            ("bb", PitchCode::N7b),
            // Uppercase flats (2 chars)
            ("Cb", PitchCode::N1b), ("Db", PitchCode::N2b), ("Eb", PitchCode::N3b),
            ("Fb", PitchCode::N4b), ("Gb", PitchCode::N5b), ("Ab", PitchCode::N6b),
            // Lowercase naturals (1 char)
            ("c", PitchCode::N1), ("d", PitchCode::N2), ("e", PitchCode::N3),
            ("f", PitchCode::N4), ("g", PitchCode::N5), ("a", PitchCode::N6),
            ("b", PitchCode::N7),
            // Uppercase naturals (1 char)
            ("C", PitchCode::N1), ("D", PitchCode::N2), ("E", PitchCode::N3),
            ("F", PitchCode::N4), ("G", PitchCode::N5), ("A", PitchCode::N6),
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