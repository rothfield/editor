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

/// Convert duration (in quarter notes) to MusicXML note type and dot count
///
/// Returns a tuple of (note_type, dot_count) where:
/// - note_type is one of "whole", "half", "quarter", "eighth", "16th", "32nd"
/// - dot_count is 0, 1, or 2
///
/// Note: For tuplets, use note_type_from_tuplet_normal instead
///
/// # Examples
/// ```
/// use editor_wasm::renderers::musicxml::duration::duration_to_note_type;
///
/// assert_eq!(duration_to_note_type(1.0), ("quarter", 0));
/// assert_eq!(duration_to_note_type(0.75), ("eighth", 1));
/// ```
pub fn duration_to_note_type(duration: f64) -> (&'static str, usize) {
    const EPSILON: f64 = 0.001;

    // Check common durations first (whole through 32nd with dots)
    if (duration - 4.0).abs() < EPSILON {
        return ("whole", 0);
    }
    if (duration - 3.0).abs() < EPSILON {
        return ("half", 1);
    }
    if (duration - 2.0).abs() < EPSILON {
        return ("half", 0);
    }
    if (duration - 1.5).abs() < EPSILON {
        return ("quarter", 1);
    }
    if (duration - 1.0).abs() < EPSILON {
        return ("quarter", 0);
    }
    if (duration - 0.75).abs() < EPSILON {
        return ("eighth", 1);
    }
    if (duration - 0.5).abs() < EPSILON {
        return ("eighth", 0);
    }
    if (duration - 0.375).abs() < EPSILON {
        return ("16th", 1);
    }
    if (duration - 0.25).abs() < EPSILON {
        return ("16th", 0);
    }
    if (duration - 0.1875).abs() < EPSILON {
        return ("32nd", 1);
    }
    if (duration - 0.125).abs() < EPSILON {
        return ("32nd", 0);
    }

    // Fallback for arbitrary divisions (use 16th as default)
    ("16th", 0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_whole_note() {
        assert_eq!(duration_to_note_type(4.0), ("whole", 0));
    }

    #[test]
    fn test_dotted_half() {
        assert_eq!(duration_to_note_type(3.0), ("half", 1));
    }

    #[test]
    fn test_half_note() {
        assert_eq!(duration_to_note_type(2.0), ("half", 0));
    }

    #[test]
    fn test_dotted_quarter() {
        assert_eq!(duration_to_note_type(1.5), ("quarter", 1));
    }

    #[test]
    fn test_quarter_note() {
        assert_eq!(duration_to_note_type(1.0), ("quarter", 0));
    }

    #[test]
    fn test_dotted_eighth() {
        assert_eq!(duration_to_note_type(0.75), ("eighth", 1));
    }

    #[test]
    fn test_eighth_note() {
        assert_eq!(duration_to_note_type(0.5), ("eighth", 0));
    }

    #[test]
    fn test_dotted_16th() {
        assert_eq!(duration_to_note_type(0.375), ("16th", 1));
    }

    #[test]
    fn test_16th_note() {
        assert_eq!(duration_to_note_type(0.25), ("16th", 0));
    }

    #[test]
    fn test_dotted_32nd() {
        assert_eq!(duration_to_note_type(0.1875), ("32nd", 1));
    }

    #[test]
    fn test_32nd_note() {
        assert_eq!(duration_to_note_type(0.125), ("32nd", 0));
    }

    #[test]
    fn test_arbitrary_duration_fallback() {
        // Test that arbitrary divisions fall back to 16th
        assert_eq!(duration_to_note_type(0.333), ("16th", 0)); // Triplet
        assert_eq!(duration_to_note_type(0.2), ("16th", 0));   // Quintuplet
        assert_eq!(duration_to_note_type(0.167), ("16th", 0)); // Sextuplet
    }

    #[test]
    fn test_epsilon_tolerance() {
        // Test that values close to common durations are recognized
        assert_eq!(duration_to_note_type(0.9999), ("quarter", 0));
        assert_eq!(duration_to_note_type(1.0001), ("quarter", 0));
        assert_eq!(duration_to_note_type(0.7501), ("eighth", 1));
        assert_eq!(duration_to_note_type(0.7499), ("eighth", 1));
    }
}
