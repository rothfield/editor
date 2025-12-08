/// Reference lookup table for all 714 (PitchCode, Tonic) → WesternPitch combinations
///
/// This table is generated programmatically from the to_western_pitch() function
/// and serves as documentation and verification of the transposition logic.
///
/// Total combinations: 42 PitchCode variants × 17 Tonic variants = 714 entries

use crate::models::{Tonic, WesternPitch};
use crate::models::pitch_code::PitchCode;
use crate::transposition::to_western_pitch::to_western_pitch;

/// Generate the complete reference table at compile time
///
/// This ensures the lookup table stays in sync with the transposition logic.
pub fn generate_reference_table() -> Vec<(PitchCode, Tonic, WesternPitch)> {
    use PitchCode::*;
    use Tonic as T;

    let pitch_codes = [
        // Naturals (7)
        N1, N2, N3, N4, N5, N6, N7,
        // Sharps (7)
        N1s, N2s, N3s, N4s, N5s, N6s, N7s,
        // Flats (7)
        N1b, N2b, N3b, N4b, N5b, N6b, N7b,
        // Double sharps (7)
        N1ss, N2ss, N3ss, N4ss, N5ss, N6ss, N7ss,
        // Double flats (7)
        N1bb, N2bb, N3bb, N4bb, N5bb, N6bb, N7bb,
        // Half-flats (7)
        N1hf, N2hf, N3hf, N4hf, N5hf, N6hf, N7hf,
    ];

    let tonics = [
        T::C, T::Cs, T::Db, T::D, T::Ds, T::Eb, T::E, T::F, T::Fs,
        T::Gb, T::G, T::Gs, T::Ab, T::A, T::As, T::Bb, T::B,
    ];

    let mut table = Vec::with_capacity(714);

    for &pitch_code in &pitch_codes {
        for &tonic in &tonics {
            let western_pitch = to_western_pitch(pitch_code, tonic);
            table.push((pitch_code, tonic, western_pitch));
        }
    }

    table
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_reference_table_size() {
        let table = generate_reference_table();
        assert_eq!(table.len(), 714, "Should have 42 PitchCodes × 17 Tonics = 714 entries");
    }

    #[test]
    fn test_reference_table_c_major() {
        let table = generate_reference_table();

        // Find all C major entries
        let c_major_entries: Vec<_> = table.iter()
            .filter(|(_, tonic, _)| *tonic == Tonic::C)
            .collect();

        assert_eq!(c_major_entries.len(), 42, "Should have 42 entries for C major");

        // Verify naturals in C major
        use PitchCode::*;
        use WesternPitch as W;

        let naturals = vec![
            (N1, W::C),
            (N2, W::D),
            (N3, W::E),
            (N4, W::F),
            (N5, W::G),
            (N6, W::A),
            (N7, W::B),
        ];

        for (pitch_code, expected_western) in naturals {
            let entry = c_major_entries.iter()
                .find(|(pc, _, _)| *pc == pitch_code)
                .expect(&format!("Should find entry for {:?} in C major", pitch_code));

            assert_eq!(entry.2, expected_western,
                "C major: {:?} should map to {:?}", pitch_code, expected_western);
        }
    }

    #[test]
    fn test_reference_table_d_major() {
        let table = generate_reference_table();

        // Verify key entries in D major
        use PitchCode::*;
        use WesternPitch as W;

        let d_major_entries: Vec<_> = table.iter()
            .filter(|(_, tonic, _)| *tonic == Tonic::D)
            .collect();

        assert_eq!(d_major_entries.len(), 42);

        // Check scale degrees in D major
        let expected = vec![
            (N1, W::D),   // 1 in D major = D
            (N2, W::E),   // 2 in D major = E
            (N3, W::Fs),  // 3 in D major = F#
            (N4, W::G),   // 4 in D major = G
            (N5, W::A),   // 5 in D major = A
            (N6, W::B),   // 6 in D major = B
            (N7, W::Cs),  // 7 in D major = C#
        ];

        for (pitch_code, expected_western) in expected {
            let entry = d_major_entries.iter()
                .find(|(pc, _, _)| *pc == pitch_code)
                .unwrap();

            assert_eq!(entry.2, expected_western,
                "D major: {:?} should map to {:?}", pitch_code, expected_western);
        }
    }

    #[test]
    fn test_reference_table_all_tonics() {
        let table = generate_reference_table();

        // Verify each tonic has exactly 42 entries
        let tonics = [
            Tonic::C, Tonic::Cs, Tonic::Db, Tonic::D, Tonic::Ds, Tonic::Eb,
            Tonic::E, Tonic::F, Tonic::Fs, Tonic::Gb, Tonic::G, Tonic::Gs,
            Tonic::Ab, Tonic::A, Tonic::As, Tonic::Bb, Tonic::B,
        ];

        for tonic in &tonics {
            let count = table.iter().filter(|(_, t, _)| t == tonic).count();
            assert_eq!(count, 42, "Tonic {:?} should have 42 entries", tonic);
        }
    }
}
