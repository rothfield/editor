//! Pitch system implementations
//!
//! This module contains implementations for different pitch systems
//! used in musical notation around the world.

use crate::models::pitch_code::PitchCode;

pub mod number;
pub mod western;
pub mod sargam;
pub mod bhatkhande;
pub mod tabla;

// Re-export pitch system implementations
pub use number::*;
pub use western::*;
pub use sargam::*;
pub use bhatkhande::*;
pub use tabla::*;

/// Trait for parsing pitch notation strings into PitchCode
///
/// Each pitch system implements this trait to convert notation-specific
/// strings (like "1#", "c#", "R", etc.) into the universal PitchCode representation.
/// The parser uses a longest-match strategy when multiple valid matches exist.
pub trait PitchParser {
    /// Parse a pitch from the start of the input string using longest match
    ///
    /// # Arguments
    /// * `input` - The input string to parse (may contain additional characters after the pitch)
    ///
    /// # Returns
    /// * `Some((pitch_code, bytes_consumed))` - The parsed pitch and number of bytes consumed
    /// * `None` - If no valid pitch was found at the start of the input
    ///
    /// # Example
    /// ```
    /// // For number system: "1##xyz" -> Some((PitchCode::N1ss, 3))
    /// // For western system: "c#xyz" -> Some((PitchCode::N1s, 2))
    /// // For sargam system: "S##xyz" -> Some((PitchCode::N1ss, 3))
    /// ```
    fn parse_pitch(input: &str) -> Option<(PitchCode, usize)>;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_number_system_longest_match() {
        // Test double sharps (longest match)
        assert_eq!(NumberSystem::parse_pitch("1##"), Some((PitchCode::N1ss, 3)));
        assert_eq!(NumberSystem::parse_pitch("1##xyz"), Some((PitchCode::N1ss, 3)));

        // Test that it prefers double sharp over single sharp
        assert_eq!(NumberSystem::parse_pitch("1##"), Some((PitchCode::N1ss, 3)));
        assert_ne!(NumberSystem::parse_pitch("1##"), Some((PitchCode::N1s, 2)));

        // Test single sharp
        assert_eq!(NumberSystem::parse_pitch("1#"), Some((PitchCode::N1s, 2)));
        assert_eq!(NumberSystem::parse_pitch("1#xyz"), Some((PitchCode::N1s, 2)));

        // Test natural
        assert_eq!(NumberSystem::parse_pitch("1"), Some((PitchCode::N1, 1)));

        // Test flats
        assert_eq!(NumberSystem::parse_pitch("2bb"), Some((PitchCode::N2bb, 3)));
        assert_eq!(NumberSystem::parse_pitch("2b"), Some((PitchCode::N2b, 2)));

        // Test invalid
        assert_eq!(NumberSystem::parse_pitch("8"), None);
        assert_eq!(NumberSystem::parse_pitch(""), None);
    }

    #[test]
    fn test_western_system_longest_match() {
        // Test double sharps (longest match)
        assert_eq!(WesternSystem::parse_pitch("c##"), Some((PitchCode::N1ss, 3)));
        assert_eq!(WesternSystem::parse_pitch("c##xyz"), Some((PitchCode::N1ss, 3)));

        // Test single sharp
        assert_eq!(WesternSystem::parse_pitch("c#"), Some((PitchCode::N1s, 2)));

        // Test natural
        assert_eq!(WesternSystem::parse_pitch("c"), Some((PitchCode::N1, 1)));

        // Test flats
        assert_eq!(WesternSystem::parse_pitch("dbb"), Some((PitchCode::N2bb, 3)));
        assert_eq!(WesternSystem::parse_pitch("db"), Some((PitchCode::N2b, 2)));

        // Test all naturals
        assert_eq!(WesternSystem::parse_pitch("d"), Some((PitchCode::N2, 1)));
        assert_eq!(WesternSystem::parse_pitch("e"), Some((PitchCode::N3, 1)));
        assert_eq!(WesternSystem::parse_pitch("f"), Some((PitchCode::N4, 1)));
        assert_eq!(WesternSystem::parse_pitch("g"), Some((PitchCode::N5, 1)));
        assert_eq!(WesternSystem::parse_pitch("a"), Some((PitchCode::N6, 1)));
        assert_eq!(WesternSystem::parse_pitch("b"), Some((PitchCode::N7, 1)));

        // Test invalid
        assert_eq!(WesternSystem::parse_pitch("x"), None);
        assert_eq!(WesternSystem::parse_pitch(""), None);
    }

    #[test]
    fn test_sargam_system_longest_match() {
        // Test double sharps (longest match)
        assert_eq!(SargamSystem::parse_pitch("S##"), Some((PitchCode::N1ss, 3)));
        assert_eq!(SargamSystem::parse_pitch("S##xyz"), Some((PitchCode::N1ss, 3)));

        // Test single sharp
        assert_eq!(SargamSystem::parse_pitch("S#"), Some((PitchCode::N1s, 2)));

        // Test naturals
        assert_eq!(SargamSystem::parse_pitch("S"), Some((PitchCode::N1, 1)));
        assert_eq!(SargamSystem::parse_pitch("s"), Some((PitchCode::N1, 1))); // lowercase S

        // Test komal (lowercase)
        assert_eq!(SargamSystem::parse_pitch("r"), Some((PitchCode::N2b, 1))); // komal Re
        assert_eq!(SargamSystem::parse_pitch("g"), Some((PitchCode::N3b, 1))); // komal Ga
        assert_eq!(SargamSystem::parse_pitch("d"), Some((PitchCode::N6b, 1))); // komal Dha
        assert_eq!(SargamSystem::parse_pitch("n"), Some((PitchCode::N7b, 1))); // komal Ni

        // Test shuddha (uppercase)
        assert_eq!(SargamSystem::parse_pitch("R"), Some((PitchCode::N2, 1)));  // shuddha Re
        assert_eq!(SargamSystem::parse_pitch("G"), Some((PitchCode::N3, 1)));  // shuddha Ga

        // Test Ma variants
        assert_eq!(SargamSystem::parse_pitch("m"), Some((PitchCode::N4, 1)));  // shuddha Ma
        assert_eq!(SargamSystem::parse_pitch("M"), Some((PitchCode::N4s, 1))); // tivra Ma

        // Test flats with 'b'
        assert_eq!(SargamSystem::parse_pitch("mb"), Some((PitchCode::N4b, 2))); // komal Ma

        // Test invalid
        assert_eq!(SargamSystem::parse_pitch("X"), None);
        assert_eq!(SargamSystem::parse_pitch(""), None);
    }

    #[test]
    fn test_tabla_system_longest_match() {
        // Test 4-character bols (longest match)
        assert_eq!(TablaSystem::parse_pitch("dhin"), Some((PitchCode::N1, 4)));
        assert_eq!(TablaSystem::parse_pitch("dhinxyz"), Some((PitchCode::N1, 4)));

        // Test that it prefers "dhin" (4 chars) over "dha" (3 chars) when both match
        assert_eq!(TablaSystem::parse_pitch("dhin"), Some((PitchCode::N1, 4)));

        // Test 3-character bols
        assert_eq!(TablaSystem::parse_pitch("dha"), Some((PitchCode::N1, 3)));
        assert_eq!(TablaSystem::parse_pitch("tin"), Some((PitchCode::N5, 3)));

        // Test 2-character bols
        assert_eq!(TablaSystem::parse_pitch("na"), Some((PitchCode::N1, 2)));
        assert_eq!(TablaSystem::parse_pitch("ta"), Some((PitchCode::N2, 2)));

        // Test that "tita" (4 chars) is matched instead of "ti" (2 chars)
        assert_eq!(TablaSystem::parse_pitch("tita"), Some((PitchCode::N3, 4)));

        // Test invalid
        assert_eq!(TablaSystem::parse_pitch("xyz"), None);
        assert_eq!(TablaSystem::parse_pitch(""), None);
    }

    #[test]
    fn test_bhatkhande_system_longest_match() {
        // Bhatkhande uses same notation as Sargam
        assert_eq!(BhatkhandeSystem::parse_pitch("S##"), Some((PitchCode::N1ss, 3)));
        assert_eq!(BhatkhandeSystem::parse_pitch("S#"), Some((PitchCode::N1s, 2)));
        assert_eq!(BhatkhandeSystem::parse_pitch("S"), Some((PitchCode::N1, 1)));
        assert_eq!(BhatkhandeSystem::parse_pitch("r"), Some((PitchCode::N2b, 1)));
        assert_eq!(BhatkhandeSystem::parse_pitch("M"), Some((PitchCode::N4s, 1)));
    }

    #[test]
    fn test_longest_match_with_trailing_text() {
        // Ensure parsers consume only the pitch, not trailing characters
        let (pitch, consumed) = NumberSystem::parse_pitch("1##abc").unwrap();
        assert_eq!(pitch, PitchCode::N1ss);
        assert_eq!(consumed, 3); // Only "1##", not "abc"

        let (pitch, consumed) = WesternSystem::parse_pitch("c#def").unwrap();
        assert_eq!(pitch, PitchCode::N1s);
        assert_eq!(consumed, 2); // Only "c#", not "def"

        let (pitch, consumed) = SargamSystem::parse_pitch("S#ghi").unwrap();
        assert_eq!(pitch, PitchCode::N1s);
        assert_eq!(consumed, 2); // Only "S#", not "ghi"

        let (pitch, consumed) = TablaSystem::parse_pitch("dhinxyz").unwrap();
        assert_eq!(pitch, PitchCode::N1);
        assert_eq!(consumed, 4); // Only "dhin", not "xyz"
    }
}