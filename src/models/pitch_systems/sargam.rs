//! Sargam system pitch implementation
//!
//! The sargam system uses syllables Sa, Re, Ga, Ma, Pa, Dha, Ni
//! to represent the seven degrees of the Indian musical scale.

use crate::models::pitch_code::PitchCode;
use super::PitchParser;

/// Sargam system implementation
pub struct SargamSystem;

impl SargamSystem {
    /// Get the pitch sequence for sargam system
    pub fn pitch_sequence() -> Vec<&'static str> {
        vec!["S", "R", "G", "M", "P", "D", "N"]
    }

    /// Validate if a string is valid sargam system pitch
    pub fn validate_pitch(pitch: &str) -> bool {
        Self::pitch_sequence().contains(&pitch)
    }

    /// Get svar names for sargam
    pub fn get_svar_name(sargam: &str) -> &'static str {
        match sargam {
            "S" => "Shadja",
            "R" => "Rishabha",
            "G" => "Gandhara",
            "M" => "Madhyama",
            "P" => "Panchama",
            "D" => "Dhaivata",
            "N" => "Nishada",
            _ => "Shadja",
        }
    }

    /// Convert sargam to number system
    pub fn to_number(sargam: &str) -> String {
        match sargam {
            "S" => "1",
            "R" => "2",
            "G" => "3",
            "M" => "4",
            "P" => "5",
            "D" => "6",
            "N" => "7",
            _ => "1",
        }.to_string()
    }
}

impl PitchParser for SargamSystem {
    fn parse_pitch(input: &str) -> Option<(PitchCode, usize)> {
        if input.is_empty() {
            return None;
        }

        // List of all possible sargam pitches, longest first for longest-match
        // Note: Sargam is case-sensitive (uppercase = shuddha, lowercase = komal)
        let patterns = [
            // Double sharps (3 chars)
            ("S##", PitchCode::N1ss), ("s##", PitchCode::N1ss),
            ("R##", PitchCode::N2ss), ("G##", PitchCode::N3ss),
            ("M##", PitchCode::N4ss), // M# = tivra Ma, M## = double sharp
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
            // Sharps with 'b' combinations (2-3 chars)
            ("mb", PitchCode::N4b),  // komal Ma (2 chars)
            ("Sb", PitchCode::N1b), ("sb", PitchCode::N1b),  // (2 chars)
            ("Pb", PitchCode::N5b), ("pb", PitchCode::N5b),  // (2 chars)
            // Sharps (2 chars)
            ("S#", PitchCode::N1s), ("s#", PitchCode::N1s),
            ("R#", PitchCode::N2s), ("G#", PitchCode::N3s),
            ("M#", PitchCode::N4ss), // M# is actually tivra Ma sharp (which is 4##)
            ("P#", PitchCode::N5s), ("p#", PitchCode::N5s),
            ("D#", PitchCode::N6s), ("N#", PitchCode::N7s),
            // Naturals and case variants (1 char)
            // Uppercase = shuddha (natural)
            ("S", PitchCode::N1), ("s", PitchCode::N1),  // Sa (both cases)
            ("R", PitchCode::N2),                          // Shuddha Re
            ("r", PitchCode::N2b),                         // Komal Re
            ("G", PitchCode::N3),                          // Shuddha Ga
            ("g", PitchCode::N3b),                         // Komal Ga
            ("m", PitchCode::N4),                          // Shuddha Ma (lowercase)
            ("M", PitchCode::N4s),                         // Tivra Ma (uppercase)
            ("P", PitchCode::N5), ("p", PitchCode::N5),  // Pa (both cases)
            ("D", PitchCode::N6),                          // Shuddha Dha
            ("d", PitchCode::N6b),                         // Komal Dha
            ("N", PitchCode::N7),                          // Shuddha Ni
            ("n", PitchCode::N7b),                         // Komal Ni
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