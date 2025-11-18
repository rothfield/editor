//! Shared pitch utility functions
//!
//! This module provides shared utilities for pitch validation, accidental parsing,
//! and octave manipulation that are used by both note line operations and ornament
//! operations.

use crate::models::elements::{Accidental, PitchSystem};

/// Validate if a pitch name is valid for a given notation system
pub fn is_valid_pitch(pitch_name: &str, system: PitchSystem) -> bool {
    match system {
        PitchSystem::Sargam => matches!(pitch_name, "S" | "R" | "G" | "M" | "P" | "D" | "N" |
                                                     "s" | "r" | "g" | "m" | "p" | "d" | "n"),
        PitchSystem::Number => matches!(pitch_name, "1" | "2" | "3" | "4" | "5" | "6" | "7"),
        PitchSystem::Western => matches!(pitch_name, "C" | "D" | "E" | "F" | "G" | "A" | "B" |
                                                      "c" | "d" | "e" | "f" | "g" | "a" | "b"),
        _ => false, // Add other systems as needed
    }
}

/// Parse accidental symbol from string
pub fn parse_accidental(symbol: &str) -> Option<Accidental> {
    match symbol {
        "" => Some(Accidental::Natural),
        "#" => Some(Accidental::Sharp),
        "##" => Some(Accidental::DoubleSharp),
        "b" => Some(Accidental::Flat),
        "bb" => Some(Accidental::DoubleFlat),
        _ => None,
    }
}

/// Get accidental symbol as string
pub fn accidental_symbol(accidental: &Accidental) -> &'static str {
    match accidental {
        Accidental::Natural => "",
        Accidental::Sharp => "#",
        Accidental::DoubleSharp => "##",
        Accidental::Flat => "b",
        Accidental::HalfFlat => "b/",
        Accidental::DoubleFlat => "bb",
    }
}

/// Validate octave value (range: -2 to +2 for ornaments)
pub fn is_valid_octave(octave: i8) -> bool {
    octave >= -2 && octave <= 2
}

/// Parse octave modifier symbols
/// Returns: octave offset (0, +1, +2, -1, -2)
pub fn parse_octave_modifiers(modifiers: &str) -> i8 {
    let upper_dots = modifiers.chars().filter(|&c| c == '.').count() as i8;
    let upper_colons = modifiers.chars().filter(|&c| c == ':').count() as i8;
    let lower_underscores = modifiers.chars().filter(|&c| c == '_').count() as i8;

    // Upper octave markers
    let upper_octave = upper_dots + (upper_colons * 2);

    // Lower octave markers
    let lower_octave = -lower_underscores;

    upper_octave + lower_octave
}

/// Get octave modifier symbols for a given octave offset
pub fn octave_to_modifiers(octave: i8) -> String {
    if octave > 0 {
        ".".repeat(octave as usize)
    } else if octave < 0 {
        "_".repeat((-octave) as usize)
    } else {
        String::new()
    }
}

/// Get pitch interval in semitones for a given pitch within a system
pub fn pitch_to_semitones(pitch_name: &str, system: PitchSystem, accidental: &Accidental) -> i8 {
    let base_semitones = match system {
        PitchSystem::Sargam => match pitch_name.to_uppercase().as_str() {
            "S" => 0,  // Sa
            "R" => 2,  // Re
            "G" => 4,  // Ga
            "M" => 5,  // Ma
            "P" => 7,  // Pa
            "D" => 9,  // Dha
            "N" => 11, // Ni
            _ => 0,
        },
        PitchSystem::Number => match pitch_name {
            "1" => 0,
            "2" => 2,
            "3" => 4,
            "4" => 5,
            "5" => 7,
            "6" => 9,
            "7" => 11,
            _ => 0,
        },
        PitchSystem::Western => match pitch_name.to_uppercase().as_str() {
            "C" => 0,
            "D" => 2,
            "E" => 4,
            "F" => 5,
            "G" => 7,
            "A" => 9,
            "B" => 11,
            _ => 0,
        },
        _ => 0,
    };

    let accidental_offset = match accidental {
        Accidental::Natural => 0,
        Accidental::Sharp => 1,
        Accidental::DoubleSharp => 2,
        Accidental::Flat => -1,
        Accidental::HalfFlat => -1, // TODO: Theoretically -0.5, but using -1 for now
        Accidental::DoubleFlat => -2,
    };

    base_semitones + accidental_offset
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_valid_pitch_sargam() {
        assert!(is_valid_pitch("S", PitchSystem::Sargam));
        assert!(is_valid_pitch("R", PitchSystem::Sargam));
        assert!(is_valid_pitch("G", PitchSystem::Sargam));
        assert!(!is_valid_pitch("X", PitchSystem::Sargam));
    }

    #[test]
    fn test_valid_pitch_number() {
        assert!(is_valid_pitch("1", PitchSystem::Number));
        assert!(is_valid_pitch("7", PitchSystem::Number));
        assert!(!is_valid_pitch("8", PitchSystem::Number));
    }

    #[test]
    fn test_parse_accidental() {
        assert_eq!(parse_accidental(""), Some(Accidental::Natural));
        assert_eq!(parse_accidental("#"), Some(Accidental::Sharp));
        assert_eq!(parse_accidental("b"), Some(Accidental::Flat));
        assert_eq!(parse_accidental("##"), Some(Accidental::DoubleSharp));
        assert_eq!(parse_accidental("invalid"), None);
    }

    #[test]
    fn test_octave_validation() {
        assert!(is_valid_octave(0));
        assert!(is_valid_octave(1));
        assert!(is_valid_octave(2));
        assert!(is_valid_octave(-1));
        assert!(is_valid_octave(-2));
        assert!(!is_valid_octave(3));
        assert!(!is_valid_octave(-3));
    }

    #[test]
    fn test_parse_octave_modifiers() {
        assert_eq!(parse_octave_modifiers(""), 0);
        assert_eq!(parse_octave_modifiers("."), 1);
        assert_eq!(parse_octave_modifiers(".."), 2);
        assert_eq!(parse_octave_modifiers(":"), 2);
        assert_eq!(parse_octave_modifiers("_"), -1);
        assert_eq!(parse_octave_modifiers("__"), -2);
    }

    #[test]
    fn test_octave_to_modifiers() {
        assert_eq!(octave_to_modifiers(0), "");
        assert_eq!(octave_to_modifiers(1), ".");
        assert_eq!(octave_to_modifiers(2), "..");
        assert_eq!(octave_to_modifiers(-1), "_");
        assert_eq!(octave_to_modifiers(-2), "__");
    }

    #[test]
    fn test_pitch_to_semitones_sargam() {
        assert_eq!(pitch_to_semitones("S", PitchSystem::Sargam, &Accidental::Natural), 0);
        assert_eq!(pitch_to_semitones("R", PitchSystem::Sargam, &Accidental::Sharp), 3);
        assert_eq!(pitch_to_semitones("G", PitchSystem::Sargam, &Accidental::Flat), 3);
    }
}
