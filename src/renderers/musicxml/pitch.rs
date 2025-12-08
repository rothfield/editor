// Pitch mapping for MusicXML export

use crate::models::{PitchCode, WesternPitch};

/// Convert PitchCode to MusicXML step and alter (PREFERRED METHOD)
///
/// This is system-agnostic and works for all pitch systems (Number, Western, Sargam, etc.)
///
/// Returns a tuple of (step, alter) where:
/// - step is one of "C", "D", "E", "F", "G", "A", "B"
/// - alter is -2, -1, -0.5, 0, 0.5, 1, or 2 for double-flat, flat, half-flat, natural, half-sharp, sharp, double-sharp
pub fn pitch_code_to_step_alter(pitch_code: &PitchCode) -> (&'static str, f32) {
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
        PitchCode::N5 | PitchCode::N6 | PitchCode::N7 => 0.0,

        // Sharps
        PitchCode::N1s | PitchCode::N2s | PitchCode::N3s | PitchCode::N4s |
        PitchCode::N5s | PitchCode::N6s | PitchCode::N7s => 1.0,

        // Flats
        PitchCode::N1b | PitchCode::N2b | PitchCode::N3b | PitchCode::N4b |
        PitchCode::N5b | PitchCode::N6b | PitchCode::N7b => -1.0,

        // Half-flats (quarter-flat in MusicXML terminology)
        PitchCode::N1hf | PitchCode::N2hf | PitchCode::N3hf | PitchCode::N4hf |
        PitchCode::N5hf | PitchCode::N6hf | PitchCode::N7hf => -0.5,

        // Double sharps
        PitchCode::N1ss | PitchCode::N2ss | PitchCode::N3ss | PitchCode::N4ss |
        PitchCode::N5ss | PitchCode::N6ss | PitchCode::N7ss => 2.0,

        // Double flats
        PitchCode::N1bb | PitchCode::N2bb | PitchCode::N3bb | PitchCode::N4bb |
        PitchCode::N5bb | PitchCode::N6bb | PitchCode::N7bb => -2.0,
    };

    (step, alter)
}

/// Get the MusicXML accidental name for a PitchCode
/// Returns None for natural pitches, Some(name) for altered pitches
pub fn pitch_code_to_accidental(pitch_code: &PitchCode) -> Option<&'static str> {
    use crate::models::pitch_code::AccidentalType;

    match pitch_code.accidental_type() {
        AccidentalType::None => None,
        AccidentalType::Natural => Some("natural"), // Explicit natural sign
        AccidentalType::Sharp => Some("sharp"),
        AccidentalType::Flat => Some("flat"),
        AccidentalType::HalfFlat => Some("quarter-flat"),
        AccidentalType::DoubleSharp => Some("double-sharp"),
        AccidentalType::DoubleFlat => Some("flat-flat"),
    }
}

/// Convert WesternPitch to MusicXML step and alter (NEW PREFERRED METHOD)
///
/// This uses the transposed Western pitch spelling to generate correct MusicXML output.
/// Replaces pitch_code_to_step_alter() for tonic-aware export.
///
/// Returns a tuple of (step, alter) where:
/// - step is one of "C", "D", "E", "F", "G", "A", "B"
/// - alter is -2.0, -1.0, -0.5, 0.0, 1.0, or 2.0
pub fn western_pitch_to_step_alter(western_pitch: WesternPitch) -> (&'static str, f32) {
    use WesternPitch::*;

    match western_pitch {
        // C family
        C | Cnat => ("C", 0.0),
        Cs => ("C", 1.0),
        Cb => ("C", -1.0),
        Css => ("C", 2.0),
        Cbb => ("C", -2.0),
        Chf => ("C", -0.5),

        // D family
        D | Dnat => ("D", 0.0),
        Ds => ("D", 1.0),
        Db => ("D", -1.0),
        Dss => ("D", 2.0),
        Dbb => ("D", -2.0),
        Dhf => ("D", -0.5),

        // E family
        E | Enat => ("E", 0.0),
        Es => ("E", 1.0),
        Eb => ("E", -1.0),
        Ess => ("E", 2.0),
        Ebb => ("E", -2.0),
        Ehf => ("E", -0.5),

        // F family
        F | Fnat => ("F", 0.0),
        Fs => ("F", 1.0),
        Fb => ("F", -1.0),
        Fss => ("F", 2.0),
        Fbb => ("F", -2.0),
        Fhf => ("F", -0.5),

        // G family
        G | Gnat => ("G", 0.0),
        Gs => ("G", 1.0),
        Gb => ("G", -1.0),
        Gss => ("G", 2.0),
        Gbb => ("G", -2.0),
        Ghf => ("G", -0.5),

        // A family
        A | Anat => ("A", 0.0),
        As => ("A", 1.0),
        Ab => ("A", -1.0),
        Ass => ("A", 2.0),
        Abb => ("A", -2.0),
        Ahf => ("A", -0.5),

        // B family
        B | Bnat => ("B", 0.0),
        Bs => ("B", 1.0),
        Bb => ("B", -1.0),
        Bss => ("B", 2.0),
        Bbb => ("B", -2.0),
        Bhf => ("B", -0.5),
    }
}

/// Get the MusicXML accidental name for a WesternPitch
/// Returns None for natural pitches without explicit natural sign, Some(name) for altered pitches
pub fn western_pitch_to_accidental(western_pitch: WesternPitch) -> Option<&'static str> {
    use WesternPitch::*;

    match western_pitch {
        // Base naturals (no accidental symbol needed)
        C | D | E | F | G | A | B => None,

        // Explicit natural signs
        Cnat | Dnat | Enat | Fnat | Gnat | Anat | Bnat => Some("natural"),

        // Sharps
        Cs | Ds | Es | Fs | Gs | As | Bs => Some("sharp"),

        // Flats
        Cb | Db | Eb | Fb | Gb | Ab | Bb => Some("flat"),

        // Double sharps
        Css | Dss | Ess | Fss | Gss | Ass | Bss => Some("double-sharp"),

        // Double flats
        Cbb | Dbb | Ebb | Fbb | Gbb | Abb | Bbb => Some("flat-flat"),

        // Half-flats (quarter-flat in MusicXML)
        Chf | Dhf | Ehf | Fhf | Ghf | Ahf | Bhf => Some("quarter-flat"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_western_pitch_to_step_alter_naturals() {
        assert_eq!(western_pitch_to_step_alter(WesternPitch::C), ("C", 0.0));
        assert_eq!(western_pitch_to_step_alter(WesternPitch::D), ("D", 0.0));
        assert_eq!(western_pitch_to_step_alter(WesternPitch::E), ("E", 0.0));
    }

    #[test]
    fn test_western_pitch_to_step_alter_sharps() {
        assert_eq!(western_pitch_to_step_alter(WesternPitch::Cs), ("C", 1.0));
        assert_eq!(western_pitch_to_step_alter(WesternPitch::Fs), ("F", 1.0));
    }

    #[test]
    fn test_western_pitch_to_step_alter_flats() {
        assert_eq!(western_pitch_to_step_alter(WesternPitch::Db), ("D", -1.0));
        assert_eq!(western_pitch_to_step_alter(WesternPitch::Bb), ("B", -1.0));
    }

    #[test]
    fn test_western_pitch_to_step_alter_half_flats() {
        assert_eq!(western_pitch_to_step_alter(WesternPitch::Dhf), ("D", -0.5));
        assert_eq!(western_pitch_to_step_alter(WesternPitch::Ehf), ("E", -0.5));
    }
}
