// Duration helpers for MusicXML export

/// Get note type from tuplet normal-notes count
/// For tuplets, the <type> should match what "normal" notes would be
/// E.g., triplet (3:2) → 2 notes/beat → eighth notes
pub fn note_type_from_tuplet_normal(normal_notes: usize) -> &'static str {
    match normal_notes {
        1 => "quarter",
        2 => "eighth",
        4 => "16th",
        8 => "32nd",
        16 => "64th",
        32 => "128th",
        64 => "256th",
        128 => "512th",
        256 => "1024th",
        _ => {
            eprintln!("ERROR: Unsupported tuplet normal-notes value: {}", normal_notes);
            panic!("Unsupported tuplet normal-notes value: {}. Supported values: 1, 2, 4, 8, 16, 32, 64, 128, 256", normal_notes);
        }
    }
}

/// Convert duration (as a fraction of quarter notes) to MusicXML note type and dot count
///
/// Takes numerator and denominator where duration = numerator / denominator quarter notes.
/// All arithmetic is done with integers to avoid floating point errors.
///
/// Returns a tuple of (note_type, dot_count) where:
/// - note_type is one of "whole", "half", "quarter", "eighth", "16th", "32nd"
/// - dot_count is 0, 1, or 2
///
/// Note: For tuplets, use note_type_from_tuplet_normal instead
///
/// # Examples
/// ```
/// use editor_wasm::renderers::musicxml::duration::duration_to_note_type_fraction;
///
/// assert_eq!(duration_to_note_type_fraction(1, 1), ("quarter", 0));    // 1/1 = quarter
/// assert_eq!(duration_to_note_type_fraction(3, 4), ("eighth", 1));     // 3/4 = dotted eighth
/// assert_eq!(duration_to_note_type_fraction(4, 1), ("whole", 0));      // 4/1 = whole
/// ```
pub fn duration_to_note_type_fraction(numerator: usize, denominator: usize) -> (&'static str, usize) {
    // Reduce fraction to lowest terms
    fn gcd(a: usize, b: usize) -> usize {
        if b == 0 { a } else { gcd(b, a % b) }
    }
    let g = gcd(numerator, denominator);
    let num = numerator / g;
    let den = denominator / g;

    // Check common durations first (whole through 32nd with dots)
    // All comparisons done with integer arithmetic: a/b == c/d iff a*d == c*b

    // 4/1 = whole note
    if num == 4 && den == 1 {
        return ("whole", 0);
    }
    // 3/1 = dotted half
    if num == 3 && den == 1 {
        return ("half", 1);
    }
    // 2/1 = half note
    if num == 2 && den == 1 {
        return ("half", 0);
    }
    // 3/2 = dotted quarter
    if num == 3 && den == 2 {
        return ("quarter", 1);
    }
    // 1/1 = quarter note
    if num == 1 && den == 1 {
        return ("quarter", 0);
    }
    // 3/4 = dotted eighth
    if num == 3 && den == 4 {
        return ("eighth", 1);
    }
    // 1/2 = eighth note
    if num == 1 && den == 2 {
        return ("eighth", 0);
    }
    // 3/8 = dotted 16th
    if num == 3 && den == 8 {
        return ("16th", 1);
    }
    // 1/4 = 16th note
    if num == 1 && den == 4 {
        return ("16th", 0);
    }
    // 3/16 = dotted 32nd
    if num == 3 && den == 16 {
        return ("32nd", 1);
    }
    // 1/8 = 32nd note
    if num == 1 && den == 8 {
        return ("32nd", 0);
    }

    // Fallback for arbitrary divisions (use 16th as default)
    ("16th", 0)
}

/// Deprecated: use duration_to_note_type_fraction instead
/// Converts f64 duration (in quarter notes) to note type
#[deprecated(since = "0.1.0", note = "use duration_to_note_type_fraction instead")]
pub fn duration_to_note_type(duration: f64) -> (&'static str, usize) {
    // Convert f64 to fraction (with denominator 1000 for precision)
    let numerator = (duration * 1000.0).round() as usize;
    let denominator = 1000;
    duration_to_note_type_fraction(numerator, denominator)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_whole_note() {
        assert_eq!(duration_to_note_type_fraction(4, 1), ("whole", 0));
    }

    #[test]
    fn test_dotted_half() {
        assert_eq!(duration_to_note_type_fraction(3, 1), ("half", 1));
    }

    #[test]
    fn test_half_note() {
        assert_eq!(duration_to_note_type_fraction(2, 1), ("half", 0));
    }

    #[test]
    fn test_dotted_quarter() {
        assert_eq!(duration_to_note_type_fraction(3, 2), ("quarter", 1));
    }

    #[test]
    fn test_quarter_note() {
        assert_eq!(duration_to_note_type_fraction(1, 1), ("quarter", 0));
    }

    #[test]
    fn test_dotted_eighth() {
        assert_eq!(duration_to_note_type_fraction(3, 4), ("eighth", 1));
    }

    #[test]
    fn test_eighth_note() {
        assert_eq!(duration_to_note_type_fraction(1, 2), ("eighth", 0));
    }

    #[test]
    fn test_dotted_16th() {
        assert_eq!(duration_to_note_type_fraction(3, 8), ("16th", 1));
    }

    #[test]
    fn test_16th_note() {
        assert_eq!(duration_to_note_type_fraction(1, 4), ("16th", 0));
    }

    #[test]
    fn test_dotted_32nd() {
        assert_eq!(duration_to_note_type_fraction(3, 16), ("32nd", 1));
    }

    #[test]
    fn test_32nd_note() {
        assert_eq!(duration_to_note_type_fraction(1, 8), ("32nd", 0));
    }

    #[test]
    fn test_fraction_reduction() {
        // Test that fractions are properly reduced to lowest terms
        assert_eq!(duration_to_note_type_fraction(2, 2), ("quarter", 0));     // 2/2 = 1/1
        assert_eq!(duration_to_note_type_fraction(8, 4), ("half", 0));        // 8/4 = 2/1
        assert_eq!(duration_to_note_type_fraction(6, 8), ("eighth", 1));      // 6/8 = 3/4
        assert_eq!(duration_to_note_type_fraction(4, 16), ("16th", 0));       // 4/16 = 1/4
    }

    #[test]
    fn test_arbitrary_duration_fallback() {
        // Test that arbitrary divisions fall back to 16th
        assert_eq!(duration_to_note_type_fraction(1, 3), ("16th", 0));  // 1/3 = triplet
        assert_eq!(duration_to_note_type_fraction(1, 5), ("16th", 0));  // 1/5 = quintuplet
        assert_eq!(duration_to_note_type_fraction(1, 6), ("16th", 0));  // 1/6 = sextuplet
    }
}
