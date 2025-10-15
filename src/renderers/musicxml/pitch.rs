// Pitch mapping for MusicXML export

use crate::models::pitch::Pitch;
use crate::models::PitchSystem;
use crate::models::PitchCode;

/// Convert PitchCode to MusicXML step and alter (PREFERRED METHOD)
///
/// This is system-agnostic and works for all pitch systems (Number, Western, Sargam, etc.)
///
/// Returns a tuple of (step, alter) where:
/// - step is one of "C", "D", "E", "F", "G", "A", "B"
/// - alter is -2, -1, 0, 1, or 2 for double-flat, flat, natural, sharp, double-sharp
pub fn pitch_code_to_step_alter(pitch_code: &PitchCode) -> (&'static str, i8) {
    // Extract degree (1-7) and accidental offset
    let degree = pitch_code.degree();

    // Map degree to step
    let step = match degree {
        1 => "C",
        2 => "D",
        3 => "E",
        4 => "F",
        5 => "G",
        6 => "A",
        7 => "B",
        _ => unreachable!("Invalid pitch degree: {}", degree),
    };

    // Calculate alter from PitchCode
    let alter = match pitch_code {
        // Naturals
        PitchCode::N1 | PitchCode::N2 | PitchCode::N3 | PitchCode::N4 |
        PitchCode::N5 | PitchCode::N6 | PitchCode::N7 => 0,

        // Sharps
        PitchCode::N1s | PitchCode::N2s | PitchCode::N3s | PitchCode::N4s |
        PitchCode::N5s | PitchCode::N6s | PitchCode::N7s => 1,

        // Flats
        PitchCode::N1b | PitchCode::N2b | PitchCode::N3b | PitchCode::N4b |
        PitchCode::N5b | PitchCode::N6b | PitchCode::N7b => -1,

        // Double sharps
        PitchCode::N1ss | PitchCode::N2ss | PitchCode::N3ss | PitchCode::N4ss |
        PitchCode::N5ss | PitchCode::N6ss | PitchCode::N7ss => 2,

        // Double flats
        PitchCode::N1bb | PitchCode::N2bb | PitchCode::N3bb | PitchCode::N4bb |
        PitchCode::N5bb | PitchCode::N6bb | PitchCode::N7bb => -2,
    };

    (step, alter)
}

/// Convert Pitch to MusicXML step and alter (DEPRECATED - use pitch_code_to_step_alter instead)
///
/// Returns a tuple of (step, alter) where:
/// - step is one of "C", "D", "E", "F", "G", "A", "B"
/// - alter is -2, -1, 0, 1, or 2 for double-flat, flat, natural, sharp, double-sharp
///
/// Supports Number system (1-7 → C-B) and Western system (C-B)
pub fn pitch_to_step_alter(pitch: &Pitch) -> Result<(&'static str, i8), String> {
    let base_step = match pitch.system {
        PitchSystem::Number => {
            // Number system: 1→C, 2→D, 3→E, 4→F, 5→G, 6→A, 7→B
            match pitch.base.as_str() {
                "1" => "C",
                "2" => "D",
                "3" => "E",
                "4" => "F",
                "5" => "G",
                "6" => "A",
                "7" => "B",
                _ => return Err(format!("Invalid number pitch base: {}", pitch.base)),
            }
        }
        PitchSystem::Western => {
            // Western system: C/c→C, D/d→D, etc. (case insensitive)
            match pitch.base.to_uppercase().as_str() {
                "C" => "C",
                "D" => "D",
                "E" => "E",
                "F" => "F",
                "G" => "G",
                "A" => "A",
                "B" => "B",
                _ => return Err(format!("Invalid western pitch base: {}", pitch.base)),
            }
        }
        _ => {
            return Err(format!("Pitch system {:?} not supported for MusicXML export", pitch.system));
        }
    };

    let alter = pitch.accidental.semitone_offset();
    Ok((base_step, alter))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::Accidental;

    #[test]
    fn test_number_1_natural() {
        let pitch = Pitch::new("1".to_string(), Accidental::Natural, 0, PitchSystem::Number);
        assert_eq!(pitch_to_step_alter(&pitch).unwrap(), ("C", 0));
    }

    #[test]
    fn test_number_1_sharp() {
        let pitch = Pitch::new("1".to_string(), Accidental::Sharp, 0, PitchSystem::Number);
        assert_eq!(pitch_to_step_alter(&pitch).unwrap(), ("C", 1));
    }

    #[test]
    fn test_number_2_natural() {
        let pitch = Pitch::new("2".to_string(), Accidental::Natural, 0, PitchSystem::Number);
        assert_eq!(pitch_to_step_alter(&pitch).unwrap(), ("D", 0));
    }

    #[test]
    fn test_number_7_flat() {
        let pitch = Pitch::new("7".to_string(), Accidental::Flat, 0, PitchSystem::Number);
        assert_eq!(pitch_to_step_alter(&pitch).unwrap(), ("B", -1));
    }

    #[test]
    fn test_western_c_natural() {
        let pitch = Pitch::new("C".to_string(), Accidental::Natural, 0, PitchSystem::Western);
        assert_eq!(pitch_to_step_alter(&pitch).unwrap(), ("C", 0));
    }

    #[test]
    fn test_western_c_sharp() {
        let pitch = Pitch::new("C".to_string(), Accidental::Sharp, 0, PitchSystem::Western);
        assert_eq!(pitch_to_step_alter(&pitch).unwrap(), ("C", 1));
    }

    #[test]
    fn test_western_d_flat() {
        let pitch = Pitch::new("D".to_string(), Accidental::Flat, 0, PitchSystem::Western);
        assert_eq!(pitch_to_step_alter(&pitch).unwrap(), ("D", -1));
    }

    #[test]
    fn test_western_lowercase() {
        let pitch = Pitch::new("c".to_string(), Accidental::Natural, 0, PitchSystem::Western);
        assert_eq!(pitch_to_step_alter(&pitch).unwrap(), ("C", 0));
    }

    #[test]
    fn test_all_number_pitches() {
        for base in ["1", "2", "3", "4", "5", "6", "7"] {
            let pitch = Pitch::new(base.to_string(), Accidental::Natural, 0, PitchSystem::Number);
            let result = pitch_to_step_alter(&pitch);
            assert!(result.is_ok());
            let (step, alter) = result.unwrap();
            assert!(["C", "D", "E", "F", "G", "A", "B"].contains(&step));
            assert_eq!(alter, 0);
        }
    }

    #[test]
    fn test_all_western_pitches() {
        for base in ["C", "D", "E", "F", "G", "A", "B"] {
            let pitch = Pitch::new(base.to_string(), Accidental::Natural, 0, PitchSystem::Western);
            let result = pitch_to_step_alter(&pitch);
            assert!(result.is_ok());
            let (step, alter) = result.unwrap();
            assert_eq!(step, base);
            assert_eq!(alter, 0);
        }
    }

    #[test]
    fn test_unsupported_pitch_system() {
        let pitch = Pitch::new("S".to_string(), Accidental::Natural, 0, PitchSystem::Sargam);
        let result = pitch_to_step_alter(&pitch);
        assert!(result.is_err());
    }
}
