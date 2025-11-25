/// Degree-based transposition for scale-aware pitch mapping
///
/// Instead of semitone arithmetic, we use explicit degree mapping.
/// Each key defines which pitch class (C, D, E, F, G, A, B) is at each scale degree.
/// Accidentals are then applied to that degree.
///
/// Example: In E major, degree 2 is F#. So 2b = F natural, 2# = F##.

use crate::models::pitch_code::AccidentalType;

/// Maps (input_degree: 1-7, input_accidental) for a given tonic
/// to (output_degree: 1-7, output_accidental)
///
/// This defines: for a given tonic key, what degree and accidental
/// should an input pitch be respelled as?
pub fn transpose_degree_by_tonic(
    input_degree: u8,
    input_accidental: AccidentalType,
    tonic: &str,
) -> (u8, AccidentalType) {
    // First, determine the chromatic pitch class of the input
    // Input is in C major context: degree 1-7 with optional accidental
    let input_pitch_class = degree_to_pitch_class(input_degree, input_accidental);

    // Now, map that pitch class to the appropriate degree and accidental in the target key
    let (output_degree, output_accidental) = pitch_class_to_degree_in_key(input_pitch_class, tonic);

    (output_degree, output_accidental)
}

/// Convert an input degree (1-7) + accidental in C major context to a chromatic pitch class (0-11)
/// 0=C, 1=C#, 2=D, 3=D#, 4=E, 5=F, 6=F#, 7=G, 8=G#, 9=A, 10=A#, 11=B
fn degree_to_pitch_class(degree: u8, accidental: AccidentalType) -> u8 {
    let base = match degree {
        1 => 0,  // C
        2 => 2,  // D
        3 => 4,  // E
        4 => 5,  // F
        5 => 7,  // G
        6 => 9,  // A
        7 => 11, // B
        _ => 0,
    };

    let offset = match accidental {
        AccidentalType::DoubleFlat => -2,
        AccidentalType::Flat => -1,
        AccidentalType::HalfFlat => 0, // Approximate as natural for now
        AccidentalType::None => 0,
        AccidentalType::Sharp => 1,
        AccidentalType::DoubleSharp => 2,
    };

    ((base as i8 + offset + 12) % 12) as u8
}

/// Convert a chromatic pitch class (0-11) to the appropriate degree and accidental in a given key
/// Returns (degree: 1-7, accidental)
///
/// This uses explicit spelling rules for each key to choose the correct degree and accidental
fn pitch_class_to_degree_in_key(pitch_class: u8, tonic: &str) -> (u8, AccidentalType) {
    // Map tonic to pitch class (0-11)
    let tonic_pitch = tonic_to_pitch_class(tonic);

    // Map each tonic to the pitch classes of its scale degrees
    // For example, C major: [0, 2, 4, 5, 7, 9, 11]
    // E major (tonic=4): [4, 6, 8, 9, 11, 1, 3]
    let degree_pitches = get_scale_degrees_for_tonic(tonic);

    // Find which scale degree is closest to our pitch class
    // Then determine the accidental needed
    spell_pitch_in_key(pitch_class, &degree_pitches, tonic_pitch)
}

/// Get the chromatic pitch classes for each scale degree in a given tonic
/// Returns a 7-element array: [pitch_of_degree_1, pitch_of_degree_2, ..., pitch_of_degree_7]
fn get_scale_degrees_for_tonic(tonic: &str) -> [u8; 7] {
    // Interval pattern for major scale from root: whole, whole, half, whole, whole, whole, half
    // In semitones: 0, 2, 4, 5, 7, 9, 11
    let major_intervals = [0u8, 2, 4, 5, 7, 9, 11];

    let tonic_pitch = tonic_to_pitch_class(tonic);

    let mut degrees = [0u8; 7];
    for (i, &interval) in major_intervals.iter().enumerate() {
        degrees[i] = ((tonic_pitch as u16 + interval as u16) % 12) as u8;
    }
    degrees
}

/// Convert a tonic string to its pitch class (0-11)
/// Supports all 15 distinct tonics: C, C#/Db, D, D#/Eb, E, F, F#/Gb, G, G#/Ab, A, A#/Bb, B
/// Plus theoretical: E#/F, B#/C, Cb, Fb
fn tonic_to_pitch_class(tonic: &str) -> u8 {
    match tonic.to_uppercase().as_str() {
        // Naturals
        "C" | "CN" => 0,
        "D" | "DN" => 2,
        "E" | "EN" => 4,
        "F" | "FN" => 5,
        "G" | "GN" => 7,
        "A" | "AN" => 9,
        "B" | "BN" => 11,

        // Sharps (and enharmonic flats)
        "C#" | "CS" => 1,
        "D#" | "DS" => 3,
        "E#" | "ES" => 5,  // E# = F
        "F#" | "FS" => 6,
        "G#" | "GS" => 8,
        "A#" | "AS" => 10,
        "B#" | "BS" => 0,  // B# = C

        // Flats (and enharmonic sharps)
        "DB" => 1,
        "EB" => 3,
        "FB" => 4,  // Fb = E
        "GB" => 6,
        "AB" => 8,
        "BB" => 10,
        "CB" => 11,  // Cb = B

        // Default
        _ => 0,
    }
}

/// Spell a pitch class as a degree + accidental in a given key
/// This is the heart of the algorithm: choose the right letter name (degree)
/// and accidental to represent the pitch
fn spell_pitch_in_key(pitch_class: u8, degree_pitches: &[u8; 7], _tonic_pitch: u8) -> (u8, AccidentalType) {
    // The key insight: prefer the scale degree (letter name) that's closest to the pitch
    // For example, in E major (pitch classes [4, 6, 8, 9, 11, 1, 3]):
    // - Pitch class 4 (E) → degree 1, natural
    // - Pitch class 5 (F) → degree 2 (which is 6), flat (F is 1 semitone below F#)
    // - Pitch class 6 (F#) → degree 2, natural
    // - Pitch class 7 (G) → degree 3 (which is 8), flat (G is 1 semitone below G#)
    // - Pitch class 8 (G#) → degree 3, natural

    // For each degree, calculate how many semitones the pitch is away (considering wraparound)
    let mut best_degree = 1u8;
    let mut best_distance = 6i8; // max distance is 6 (tritone)

    for degree in 1..=7 {
        let degree_pitch = degree_pitches[(degree - 1) as usize] as i8;
        let pitch = pitch_class as i8;

        // Calculate signed distance: positive = need to sharp, negative = need to flat
        let mut distance = pitch - degree_pitch;

        // Normalize to [-6, 6] range
        if distance > 6 {
            distance -= 12;
        } else if distance < -6 {
            distance += 12;
        }

        // Prefer the spelling that requires the smallest accidental
        let abs_distance = distance.abs();
        if abs_distance < best_distance.abs() ||
           (abs_distance == best_distance.abs() && distance.abs() <= 2) {
            best_distance = distance;
            best_degree = degree;
        }
    }

    // Now calculate the accidental for the best degree
    let accidental = match best_distance {
        -2 => AccidentalType::DoubleFlat,
        -1 => AccidentalType::Flat,
        0 => AccidentalType::None,
        1 => AccidentalType::Sharp,
        2 => AccidentalType::DoubleSharp,
        _ => AccidentalType::None, // shouldn't happen with proper normalization
    };

    (best_degree, accidental)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_c_major_no_transposition() {
        // In C major, 1 stays 1, 2 stays 2, etc.
        assert_eq!(
            transpose_degree_by_tonic(1, AccidentalType::None, "C"),
            (1, AccidentalType::None)
        );
        assert_eq!(
            transpose_degree_by_tonic(2, AccidentalType::None, "C"),
            (2, AccidentalType::None)
        );
        assert_eq!(
            transpose_degree_by_tonic(3, AccidentalType::None, "C"),
            (3, AccidentalType::None)
        );
    }

    #[test]
    fn test_e_major_scale_degrees() {
        // E major scale: E F# G# A B C# D#
        // Pitch classes: 4 6 8 9 11 1 3 (degree 1-7)
        // So degree 1 = E, degree 2 = F#, degree 3 = G#, etc.

        // 1 (C in C major context) → should map to what in E major?
        // C (pitch class 0) is not in E major scale
        // Closest degrees:
        //   - B (degree 5, pitch 11): distance = 0 - 11 = -11, normalized = +1 (sharp)
        //   - C# (degree 6, pitch 1): distance = 0 - 1 = -1 (flat)
        // Better: degree 6, flat (only 1 semitone) vs degree 5, sharp
        // So C = 6b (C# flattened = C)
        let (degree, accidental) = transpose_degree_by_tonic(1, AccidentalType::None, "E");
        println!("E major: 1 natural (C) → degree {}, accidental {:?}", degree, accidental);
        assert_eq!(degree, 6);
        assert_eq!(accidental, AccidentalType::Flat);
    }

    #[test]
    fn test_e_major_1_sharp() {
        // 1# in C major context = C#
        // C# (pitch class 1) in E major context:
        // E major scale: E(4) F#(6) G#(8) A(9) B(11) C#(1) D#(3)
        // C# is degree 6 in E major (the submediant)
        let (degree, accidental) = transpose_degree_by_tonic(1, AccidentalType::Sharp, "E");
        println!("E major: 1# (C#) → degree {}, accidental {:?}", degree, accidental);
        // C# = pitch class 1
        // E major degrees: [4, 6, 8, 9, 11, 1, 3]
        // Position 6 (index 5) is pitch 1
        assert_eq!(degree, 6);
        assert_eq!(accidental, AccidentalType::None);
    }

    #[test]
    fn test_e_major_2_natural() {
        // 2 in C major context = D
        // D (pitch class 2) in E major context:
        // E major scale has D# (degree 7, pitch class 3), not D
        // So D is D# flattened = 7b
        let (degree, accidental) = transpose_degree_by_tonic(2, AccidentalType::None, "E");
        println!("E major: 2 natural (D) → degree {}, accidental {:?}", degree, accidental);
        assert_eq!(degree, 7);
        assert_eq!(accidental, AccidentalType::Flat);
    }

    #[test]
    fn test_e_major_2_flat() {
        // 2b in C major context = Db
        // Db (pitch class 1) in E major context = C#
        // C# is degree 6 in E major
        let (degree, accidental) = transpose_degree_by_tonic(2, AccidentalType::Flat, "E");
        println!("E major: 2b (Db/C#) → degree {}, accidental {:?}", degree, accidental);
        assert_eq!(degree, 6);
        assert_eq!(accidental, AccidentalType::None);
    }

    #[test]
    fn test_d_major_scale() {
        // D major scale: D E F# G A B C#
        // Pitch classes: 2 3 6 7 9 11 1 (degrees 1-7)

        // 1 (C) in D major context = pitch class 0
        // Closest degrees:
        //   - D (degree 1, pitch 2): distance = 0 - 2 = -2
        //   - C# (degree 7, pitch 1): distance = 0 - 1 = -1
        // Better: degree 7, flat (only 1 semitone) vs degree 1, double-flat
        // So C = 7b (C# flattened = C)
        let (degree, accidental) = transpose_degree_by_tonic(1, AccidentalType::None, "D");
        println!("D major: 1 natural (C) → degree {}, accidental {:?}", degree, accidental);
        assert_eq!(degree, 7);
        assert_eq!(accidental, AccidentalType::Flat);
    }

    #[test]
    fn test_f_major_scale() {
        // F major scale: F G A Bb C D E
        // Degrees: 1=F, 2=G, 3=A, 4=Bb, 5=C, 6=D, 7=E

        // 1 (C) in F major context:
        // C (pitch class 0) = degree 5 in F major (the subdominant)
        let (degree, accidental) = transpose_degree_by_tonic(1, AccidentalType::None, "F");
        println!("F major: 1 natural (C) → degree {}, accidental {:?}", degree, accidental);
        assert_eq!(degree, 5);
        assert_eq!(accidental, AccidentalType::None);
    }
}
