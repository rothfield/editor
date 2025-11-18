// Pitch mapping for MusicXML export

use crate::models::PitchCode;

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
        AccidentalType::Sharp => Some("sharp"),
        AccidentalType::Flat => Some("flat"),
        AccidentalType::HalfFlat => Some("quarter-flat"),
        AccidentalType::DoubleSharp => Some("double-sharp"),
        AccidentalType::DoubleFlat => Some("flat-flat"),
    }
}
