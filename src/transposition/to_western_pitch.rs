/// Programmatic transposition from PitchCode + Tonic → WesternPitch
///
/// This module implements type-safe tonic-based transposition using:
/// 1. major_scale() - Maps each of the 17 tonics to its major scale
/// 2. apply_accidental() - Applies accidentals to the base pitch
/// 3. to_western_pitch() - Main public API combining the above

use crate::models::{Tonic, WesternPitch};
use crate::models::pitch_code::{PitchCode, AccidentalType};

/// Get the major scale for a given tonic
///
/// Returns 7 Western pitch names representing scale degrees 1-7
/// in the major scale starting from the given tonic.
///
/// # Examples
/// - C major: [C, D, E, F, G, A, B]
/// - D major: [D, E, Fs, G, A, B, Cs]
/// - Gb major: [Gb, Ab, Bb, Cb, Db, Eb, F]
fn major_scale(tonic: Tonic) -> [WesternPitch; 7] {
    use Tonic as T;
    use WesternPitch as W;

    match tonic {
        T::C => [W::C, W::D, W::E, W::F, W::G, W::A, W::B],
        T::Cs => [W::Cs, W::Ds, W::Es, W::Fs, W::Gs, W::As, W::Bs],
        T::Db => [W::Db, W::Eb, W::F, W::Gb, W::Ab, W::Bb, W::C],
        T::D => [W::D, W::E, W::Fs, W::G, W::A, W::B, W::Cs],
        T::Ds => [W::Ds, W::Es, W::Fss, W::Gs, W::As, W::Bs, W::Css],
        T::Eb => [W::Eb, W::F, W::G, W::Ab, W::Bb, W::C, W::D],
        T::E => [W::E, W::Fs, W::Gs, W::A, W::B, W::Cs, W::Ds],
        T::F => [W::F, W::G, W::A, W::Bb, W::C, W::D, W::E],
        T::Fs => [W::Fs, W::Gs, W::As, W::B, W::Cs, W::Ds, W::Es],
        T::Gb => [W::Gb, W::Ab, W::Bb, W::Cb, W::Db, W::Eb, W::F],
        T::G => [W::G, W::A, W::B, W::C, W::D, W::E, W::Fs],
        T::Gs => [W::Gs, W::As, W::Bs, W::Cs, W::Ds, W::Es, W::Fss],
        T::Ab => [W::Ab, W::Bb, W::C, W::Db, W::Eb, W::F, W::G],
        T::A => [W::A, W::B, W::Cs, W::D, W::E, W::Fs, W::Gs],
        T::As => [W::As, W::Bs, W::Css, W::Ds, W::Es, W::Fss, W::Gss],
        T::Bb => [W::Bb, W::C, W::D, W::Eb, W::F, W::G, W::A],
        T::B => [W::B, W::Cs, W::Ds, W::E, W::Fs, W::Gs, W::As],
    }
}

/// Apply an accidental to a base Western pitch
///
/// # Arguments
/// - `base_pitch`: The natural pitch for the scale degree
/// - `accidental`: The accidental type to apply
///
/// # Returns
/// The Western pitch with the accidental applied
///
/// # Examples
/// - apply_accidental(D, Sharp) → Ds (D#)
/// - apply_accidental(Fs, Flat) → Fnat (F natural, canceling the sharp)
/// - apply_accidental(C, DoubleSharp) → Css (C##)
fn apply_accidental(base_pitch: WesternPitch, accidental: AccidentalType) -> WesternPitch {
    use AccidentalType::*;
    use WesternPitch::*;

    match (base_pitch, accidental) {
        // C family
        (C, Natural) => Cnat,
        (C, Sharp) => Cs,
        (C, Flat) => Cb,
        (C, DoubleSharp) => Css,
        (C, DoubleFlat) => Cbb,
        (C, HalfFlat) => Chf,
        (Cs, Flat) => Cnat,
        (Cb, Sharp) => Cnat,

        // D family
        (D, Natural) => Dnat,
        (D, Sharp) => Ds,
        (D, Flat) => Db,
        (D, DoubleSharp) => Dss,
        (D, DoubleFlat) => Dbb,
        (D, HalfFlat) => Dhf,
        (Ds, Flat) => Dnat,
        (Db, Sharp) => Dnat,

        // E family
        (E, Natural) => Enat,
        (E, Sharp) => Es,
        (E, Flat) => Eb,
        (E, DoubleSharp) => Ess,
        (E, DoubleFlat) => Ebb,
        (E, HalfFlat) => Ehf,
        (Es, Flat) => Enat,
        (Eb, Sharp) => Enat,

        // F family
        (F, Natural) => Fnat,
        (F, Sharp) => Fs,
        (F, Flat) => Fb,
        (F, DoubleSharp) => Fss,
        (F, DoubleFlat) => Fbb,
        (F, HalfFlat) => Fhf,
        (Fs, Flat) => Fnat,
        (Fb, Sharp) => Fnat,

        // G family
        (G, Natural) => Gnat,
        (G, Sharp) => Gs,
        (G, Flat) => Gb,
        (G, DoubleSharp) => Gss,
        (G, DoubleFlat) => Gbb,
        (G, HalfFlat) => Ghf,
        (Gs, Flat) => Gnat,
        (Gb, Sharp) => Gnat,

        // A family
        (A, Natural) => Anat,
        (A, Sharp) => As,
        (A, Flat) => Ab,
        (A, DoubleSharp) => Ass,
        (A, DoubleFlat) => Abb,
        (A, HalfFlat) => Ahf,
        (As, Flat) => Anat,
        (Ab, Sharp) => Anat,

        // B family
        (B, Natural) => Bnat,
        (B, Sharp) => Bs,
        (B, Flat) => Bb,
        (B, DoubleSharp) => Bss,
        (B, DoubleFlat) => Bbb,
        (B, HalfFlat) => Bhf,
        (Bs, Flat) => Bnat,
        (Bb, Sharp) => Bnat,

        // For any other combination not explicitly handled, return the base pitch
        // (This shouldn't happen in practice with valid input)
        (pitch, _) => pitch,
    }
}

/// Convert a PitchCode + Tonic to a Western pitch spelling
///
/// This is the main public API for transposition.
///
/// # Algorithm
/// 1. Extract degree (1-7) and accidental from PitchCode
/// 2. Get major scale for the tonic
/// 3. Look up base pitch for the degree
/// 4. Apply accidental to get final Western pitch
///
/// # Examples
/// - to_western_pitch(N1, C) → C (degree 1 in C major)
/// - to_western_pitch(N1, D) → D (degree 1 in D major)
/// - to_western_pitch(N4s, D) → Gnat (degree 4 in D major is G, + sharp → G#, but G is natural in D major so we get Gnat)
/// - to_western_pitch(N3, D) → Fs (degree 3 in D major)
pub fn to_western_pitch(pitch_code: PitchCode, tonic: Tonic) -> WesternPitch {
    // Get degree and accidental from PitchCode
    let (degree, accidental) = pitch_code.to_degree_accidental();

    // Get major scale for this tonic
    let scale = major_scale(tonic);

    // Get base pitch for this degree (degrees are 1-indexed)
    let base_pitch = scale[(degree - 1) as usize];

    // Apply accidental if present
    match accidental {
        Some(acc) => apply_accidental(base_pitch, acc),
        None => base_pitch,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::pitch_code::PitchCode::*;

    #[test]
    fn test_c_major_scale() {
        use WesternPitch::*;
        assert_eq!(major_scale(Tonic::C), [C, D, E, F, G, A, B]);
    }

    #[test]
    fn test_d_major_scale() {
        use WesternPitch::*;
        assert_eq!(major_scale(Tonic::D), [D, E, Fs, G, A, B, Cs]);
    }

    #[test]
    fn test_gb_major_scale() {
        use WesternPitch::*;
        assert_eq!(major_scale(Tonic::Gb), [Gb, Ab, Bb, Cb, Db, Eb, F]);
    }

    #[test]
    fn test_apply_sharp() {
        assert_eq!(apply_accidental(WesternPitch::D, AccidentalType::Sharp), WesternPitch::Ds);
    }

    #[test]
    fn test_apply_flat_cancels_sharp() {
        assert_eq!(apply_accidental(WesternPitch::Fs, AccidentalType::Flat), WesternPitch::Fnat);
    }

    #[test]
    fn test_to_western_pitch_c_major() {
        assert_eq!(to_western_pitch(N1, Tonic::C), WesternPitch::C);
        assert_eq!(to_western_pitch(N2, Tonic::C), WesternPitch::D);
        assert_eq!(to_western_pitch(N3, Tonic::C), WesternPitch::E);
        assert_eq!(to_western_pitch(N4, Tonic::C), WesternPitch::F);
        assert_eq!(to_western_pitch(N5, Tonic::C), WesternPitch::G);
        assert_eq!(to_western_pitch(N6, Tonic::C), WesternPitch::A);
        assert_eq!(to_western_pitch(N7, Tonic::C), WesternPitch::B);
    }

    #[test]
    fn test_to_western_pitch_d_major() {
        assert_eq!(to_western_pitch(N1, Tonic::D), WesternPitch::D);
        assert_eq!(to_western_pitch(N2, Tonic::D), WesternPitch::E);
        assert_eq!(to_western_pitch(N3, Tonic::D), WesternPitch::Fs);
        assert_eq!(to_western_pitch(N4, Tonic::D), WesternPitch::G);
    }

    #[test]
    fn test_to_western_pitch_with_accidentals() {
        // N4s in D major: degree 4 = G, + sharp = Gs
        assert_eq!(to_western_pitch(N4s, Tonic::D), WesternPitch::Gs);

        // N3b in D major: degree 3 = Fs, + flat = Fnat
        assert_eq!(to_western_pitch(N3b, Tonic::D), WesternPitch::Fnat);
    }
}
