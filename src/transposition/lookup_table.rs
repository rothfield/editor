/// Simple lookup table for tonic-based pitch normalization
///
/// Format: (degree: 1-7, accidental: "n"/"#"/"b", tonic) → normalized_pitch
///
/// Example:
///   (1, "n", "C")   → "C"     (1 natural in C major = C)
///   (1, "#", "C")   → "C#"    (1# in C major = C#)
///   (1, "b", "C#")  → "C"     (1b in C# major = C natural)
///   (1, "n", "C#")  → "C#"    (1 natural in C# major = C#)

use std::collections::HashMap;

/// Normalize a pitch: (degree, accidental, tonic) → actual_pitch_name
pub fn normalize_pitch(degree: u8, accidental: &str, tonic: &str) -> String {
    let key = (degree, accidental, tonic);

    // Build lookup table lazily
    let table = build_lookup_table();

    table.get(&key)
        .cloned()
        .unwrap_or_else(|| format!("UNKNOWN({},{},{})", degree, accidental, tonic))
}

/// Build the complete lookup table for all tonics and degrees
fn build_lookup_table() -> HashMap<(u8, &'static str, &'static str), String> {
    let mut table = HashMap::new();

    // C Major: C D E F G A B
    add_key(&mut table, "C", &["C", "D", "E", "F", "G", "A", "B"]);

    // C# Major: C# D# E# F# G# A# B#
    add_key(&mut table, "C#", &["C#", "D#", "E#", "F#", "G#", "A#", "B#"]);

    // Db Major: Db Eb F Gb Ab Bb C
    add_key(&mut table, "Db", &["Db", "Eb", "F", "Gb", "Ab", "Bb", "C"]);

    // D Major: D E F# G A B C#
    add_key(&mut table, "D", &["D", "E", "F#", "G", "A", "B", "C#"]);

    // D# Major: D# E# F## G# A# B# C##
    add_key(&mut table, "D#", &["D#", "E#", "F##", "G#", "A#", "B#", "C##"]);

    // Eb Major: Eb F G Ab Bb C D
    add_key(&mut table, "Eb", &["Eb", "F", "G", "Ab", "Bb", "C", "D"]);

    // E Major: E F# G# A B C# D#
    add_key(&mut table, "E", &["E", "F#", "G#", "A", "B", "C#", "D#"]);

    // F Major: F G A Bb C D E
    add_key(&mut table, "F", &["F", "G", "A", "Bb", "C", "D", "E"]);

    // F# Major: F# G# A# B C# D# E#
    add_key(&mut table, "F#", &["F#", "G#", "A#", "B", "C#", "D#", "E#"]);

    // Gb Major: Gb Ab Bb Cb Db Eb F
    add_key(&mut table, "Gb", &["Gb", "Ab", "Bb", "Cb", "Db", "Eb", "F"]);

    // G Major: G A B C D E F#
    add_key(&mut table, "G", &["G", "A", "B", "C", "D", "E", "F#"]);

    // G# Major: G# A# B# C# D# E# F##
    add_key(&mut table, "G#", &["G#", "A#", "B#", "C#", "D#", "E#", "F##"]);

    // Ab Major: Ab Bb C Db Eb F G
    add_key(&mut table, "Ab", &["Ab", "Bb", "C", "Db", "Eb", "F", "G"]);

    // A Major: A B C# D E F# G#
    add_key(&mut table, "A", &["A", "B", "C#", "D", "E", "F#", "G#"]);

    // A# Major: A# B# C## D# E# F## G##
    add_key(&mut table, "A#", &["A#", "B#", "C##", "D#", "E#", "F##", "G##"]);

    // Bb Major: Bb C D Eb F G A
    add_key(&mut table, "Bb", &["Bb", "C", "D", "Eb", "F", "G", "A"]);

    // B Major: B C# D# E F# G# A#
    add_key(&mut table, "B", &["B", "C#", "D#", "E", "F#", "G#", "A#"]);

    // Now add the accidentals for each degree
    add_accidentals(&mut table);

    table
}

/// Add a major scale to the lookup table (naturals only)
fn add_key(table: &mut HashMap<(u8, &'static str, &'static str), String>, tonic: &'static str, degrees: &[&'static str]) {
    for (i, pitch) in degrees.iter().enumerate() {
        let degree = (i + 1) as u8;
        table.insert((degree, "n", tonic), pitch.to_string());
    }
}

/// Add sharp and flat versions for each degree in each tonic
fn add_accidentals(table: &mut HashMap<(u8, &'static str, &'static str), String>) {
    let tonics = vec![
        "C", "C#", "Db", "D", "D#", "Eb", "E", "F", "F#", "Gb", "G", "G#", "Ab", "A", "A#", "Bb", "B"
    ];

    for &tonic in &tonics {
        for degree in 1..=7 {
            // Get the natural pitch for this degree
            if let Some(natural) = table.get(&(degree, "n", tonic)) {
                let natural_pitch = natural.clone();

                // Create sharp version
                let sharp = add_accidental(&natural_pitch, "#");
                table.insert((degree, "#", tonic), sharp);

                // Create flat version
                let flat = add_accidental(&natural_pitch, "b");
                table.insert((degree, "b", tonic), flat);

                // Create double-sharp version
                let double_sharp = add_accidental(&natural_pitch, "##");
                table.insert((degree, "##", tonic), double_sharp);

                // Create double-flat version
                let double_flat = add_accidental(&natural_pitch, "bb");
                table.insert((degree, "bb", tonic), double_flat);
            }
        }
    }
}

/// Add an accidental to a pitch name
fn add_accidental(pitch: &str, accidental: &str) -> String {
    // Handle existing accidentals
    let (base, existing_acc) = split_pitch(pitch);

    match (existing_acc, accidental) {
        // Sharp cases
        ("", "#") => format!("{}#", base),
        ("b", "#") => base.to_string(),  // Cb + # = C
        ("bb", "#") => format!("{}b", base),  // Cbb + # = Cb
        ("##", "#") => format!("{}##", base),  // C## (doesn't exist but for completeness)

        // Flat cases
        ("", "b") => format!("{}b", base),
        ("#", "b") => base.to_string(),  // C# + b = C
        ("##", "b") => format!("{}#", base),  // C## + b = C#
        ("bb", "b") => format!("{}bb", base),  // Cbb (doesn't exist but for completeness)

        // Double-sharp cases
        ("", "##") => format!("{}##", base),
        ("#", "##") => format!("{}##", base),  // Already one sharp, adding one more
        ("b", "##") => format!("{}#", base),  // Cb + ## = C#

        // Double-flat cases
        ("", "bb") => format!("{}bb", base),
        ("b", "bb") => format!("{}bb", base),  // Already one flat
        ("#", "bb") => format!("{}b", base),  // C# + bb = Cb

        _ => format!("{}{}", pitch, accidental),
    }
}

/// Split a pitch into base note and accidental
fn split_pitch(pitch: &str) -> (&str, &str) {
    if pitch.ends_with("##") {
        (&pitch[..pitch.len()-2], "##")
    } else if pitch.ends_with("bb") {
        (&pitch[..pitch.len()-2], "bb")
    } else if pitch.ends_with("#") {
        (&pitch[..pitch.len()-1], "#")
    } else if pitch.ends_with("b") {
        (&pitch[..pitch.len()-1], "b")
    } else {
        (pitch, "")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_c_major_naturals() {
        assert_eq!(normalize_pitch(1, "n", "C"), "C");
        assert_eq!(normalize_pitch(2, "n", "C"), "D");
        assert_eq!(normalize_pitch(3, "n", "C"), "E");
        assert_eq!(normalize_pitch(4, "n", "C"), "F");
        assert_eq!(normalize_pitch(5, "n", "C"), "G");
        assert_eq!(normalize_pitch(6, "n", "C"), "A");
        assert_eq!(normalize_pitch(7, "n", "C"), "B");
    }

    #[test]
    fn test_c_sharp_naturals() {
        assert_eq!(normalize_pitch(1, "n", "C#"), "C#");
        assert_eq!(normalize_pitch(2, "n", "C#"), "D#");
        assert_eq!(normalize_pitch(3, "n", "C#"), "E#");
        assert_eq!(normalize_pitch(4, "n", "C#"), "F#");
        assert_eq!(normalize_pitch(5, "n", "C#"), "G#");
        assert_eq!(normalize_pitch(6, "n", "C#"), "A#");
        assert_eq!(normalize_pitch(7, "n", "C#"), "B#");
    }

    #[test]
    fn test_e_major_with_accidentals() {
        // E Major: E F# G# A B C# D#
        assert_eq!(normalize_pitch(1, "n", "E"), "E");
        assert_eq!(normalize_pitch(1, "#", "E"), "E#");
        assert_eq!(normalize_pitch(1, "b", "E"), "Eb");

        assert_eq!(normalize_pitch(2, "n", "E"), "F#");
        assert_eq!(normalize_pitch(2, "#", "E"), "F##");
        assert_eq!(normalize_pitch(2, "b", "E"), "F");
    }

    #[test]
    fn test_c_sharp_example() {
        // Your example: 1b in C# = C natural
        assert_eq!(normalize_pitch(1, "b", "C#"), "C");
        assert_eq!(normalize_pitch(1, "n", "C#"), "C#");
    }

    #[test]
    fn test_d_major_examples() {
        // D Major: D E F# G A B C#
        assert_eq!(normalize_pitch(1, "n", "D"), "D");
        assert_eq!(normalize_pitch(2, "n", "D"), "E");
        assert_eq!(normalize_pitch(3, "n", "D"), "F#");
        assert_eq!(normalize_pitch(3, "b", "D"), "F");  // F# flattened = F
    }
}
