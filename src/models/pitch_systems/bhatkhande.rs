//! Bhatkhande system pitch implementation
//!
//! Bhatkhande notation is a standardized system for Indian classical music.

use crate::models::pitch_code::PitchCode;
use super::PitchParser;

pub struct BhatkhandeSystem;

impl BhatkhandeSystem {
    pub fn pitch_sequence() -> Vec<&'static str> {
        vec!["S", "R", "G", "M", "P", "D", "N"]
    }
}

impl PitchParser for BhatkhandeSystem {
    fn parse_pitch(input: &str) -> Option<(PitchCode, usize)> {
        if input.is_empty() {
            return None;
        }

        // Bhatkhande uses the same notation as Sargam
        // Case-sensitive: uppercase = shuddha, lowercase = komal
        let patterns = [
            // Double sharps (3 chars)
            ("S##", PitchCode::N1ss), ("s##", PitchCode::N1ss),
            ("R##", PitchCode::N2ss), ("G##", PitchCode::N3ss),
            ("M##", PitchCode::N4ss),
            ("P##", PitchCode::N5ss), ("p##", PitchCode::N5ss),
            ("D##", PitchCode::N6ss), ("N##", PitchCode::N7ss),
            // Double flats (3 chars)
            ("Sbb", PitchCode::N1bb), ("sbb", PitchCode::N1bb),
            ("Rbb", PitchCode::N2bb), ("rbb", PitchCode::N2bb),
            ("Gbb", PitchCode::N3bb), ("gbb", PitchCode::N3bb),
            ("mbb", PitchCode::N4bb), ("Mbb", PitchCode::N4bb),
            ("Pbb", PitchCode::N5bb), ("pbb", PitchCode::N5bb),
            ("Dbb", PitchCode::N6bb), ("dbb", PitchCode::N6bb),
            ("Nbb", PitchCode::N7bb), ("nbb", PitchCode::N7bb),
            // Special 2-char combinations
            ("mb", PitchCode::N4b),
            ("Sb", PitchCode::N1b), ("sb", PitchCode::N1b),
            ("Pb", PitchCode::N5b), ("pb", PitchCode::N5b),
            // Sharps (2 chars)
            ("S#", PitchCode::N1s), ("s#", PitchCode::N1s),
            ("R#", PitchCode::N2s), ("G#", PitchCode::N3s),
            ("M#", PitchCode::N4ss),
            ("P#", PitchCode::N5s), ("p#", PitchCode::N5s),
            ("D#", PitchCode::N6s), ("N#", PitchCode::N7s),
            // Naturals and case variants (1 char)
            ("S", PitchCode::N1), ("s", PitchCode::N1),
            ("R", PitchCode::N2), ("r", PitchCode::N2b),
            ("G", PitchCode::N3), ("g", PitchCode::N3b),
            ("m", PitchCode::N4), ("M", PitchCode::N4s),
            ("P", PitchCode::N5), ("p", PitchCode::N5),
            ("D", PitchCode::N6), ("d", PitchCode::N6b),
            ("N", PitchCode::N7), ("n", PitchCode::N7b),
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