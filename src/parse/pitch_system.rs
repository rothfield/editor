//! Pitch system trait and implementations
//!
//! This module provides the lookup tables for multi-character musical tokens
//! across different pitch systems (Number, Western, Sargam).

use crate::models::PitchSystem;

/// Trait for pitch system implementations
/// Each pitch system must provide lookup for multi-character tokens
pub trait PitchSystemHandler {
    /// Parse a symbol and return true if it's valid in this pitch system
    /// This is used for recursive descent parsing to check if combinations are valid
    fn lookup(&self, symbol: &str) -> bool;

    /// Get all valid single characters for this pitch system
    fn get_valid_chars(&self) -> Vec<char>;

    /// Get all valid pitched characters (without accidentals)
    fn get_pitch_chars(&self) -> Vec<char>;
}

/// Number notation pitch system (1-7 with #/b accidentals)
#[derive(Debug, Clone)]
pub struct NumberPitchSystem;

impl PitchSystemHandler for NumberPitchSystem {
    fn lookup(&self, symbol: &str) -> bool {
        use crate::models::pitch_systems::{PitchParser, NumberSystem};
        NumberSystem::parse_pitch(symbol).is_some()
    }

    fn get_valid_chars(&self) -> Vec<char> {
        vec!['1', '2', '3', '4', '5', '6', '7', '#', 'b', '/']
    }

    fn get_pitch_chars(&self) -> Vec<char> {
        vec!['1', '2', '3', '4', '5', '6', '7']
    }
}

/// Western notation pitch system (a-g with #/b accidentals)
#[derive(Debug, Clone)]
pub struct WesternPitchSystem;

impl PitchSystemHandler for WesternPitchSystem {
    fn lookup(&self, symbol: &str) -> bool {
        use crate::models::pitch_systems::{PitchParser, WesternSystem};
        WesternSystem::parse_pitch(symbol).is_some()
    }

    fn get_valid_chars(&self) -> Vec<char> {
        vec!['a', 'b', 'c', 'd', 'e', 'f', 'g', 'A', 'B', 'C', 'D', 'E', 'F', 'G', '#']
    }

    fn get_pitch_chars(&self) -> Vec<char> {
        vec!['a', 'b', 'c', 'd', 'e', 'f', 'g', 'A', 'B', 'C', 'D', 'E', 'F', 'G']
    }
}

/// Sargam notation pitch system (SrRgGmMPdDnN)
#[derive(Debug, Clone)]
pub struct SargamPitchSystem;

impl PitchSystemHandler for SargamPitchSystem {
    fn lookup(&self, symbol: &str) -> bool {
        use crate::models::pitch_systems::{PitchParser, SargamSystem};
        SargamSystem::parse_pitch(symbol).is_some()
    }

    fn get_valid_chars(&self) -> Vec<char> {
        vec!['S', 'R', 'G', 'M', 'P', 'D', 'N', 's', 'r', 'g', 'm', 'p', 'd', 'n', '#', 'b']
    }

    fn get_pitch_chars(&self) -> Vec<char> {
        vec!['S', 'R', 'G', 'M', 'P', 'D', 'N', 's', 'r', 'g', 'm', 'p', 'd', 'n']
    }
}

/// Dispatcher that routes pitch system requests to appropriate handler
#[derive(Debug, Clone)]
pub struct PitchSystemDispatcher {
    number: NumberPitchSystem,
    western: WesternPitchSystem,
    sargam: SargamPitchSystem,
}

impl PitchSystemDispatcher {
    pub fn new() -> Self {
        Self {
            number: NumberPitchSystem,
            western: WesternPitchSystem,
            sargam: SargamPitchSystem,
        }
    }

    /// Get the appropriate pitch system handler
    pub fn get_handler(&self, system: PitchSystem) -> &dyn PitchSystemHandler {
        match system {
            PitchSystem::Number => &self.number,
            PitchSystem::Western => &self.western,
            PitchSystem::Sargam => &self.sargam,
            PitchSystem::Bhatkhande => &self.sargam, // Similar to Sargam
            PitchSystem::Tabla => &self.number, // Use number as fallback
            PitchSystem::Unknown => &self.number, // Default fallback
        }
    }

    /// Check if a symbol is valid in the given pitch system
    pub fn lookup(&self, symbol: &str, system: PitchSystem) -> bool {
        self.get_handler(system).lookup(symbol)
    }

    /// Check if a character is a valid pitch character (not accidental) for the system
    pub fn is_pitch_char(&self, c: char, system: PitchSystem) -> bool {
        self.get_handler(system).get_pitch_chars().contains(&c)
    }

    /// Check if a character is valid for any pitch system
    pub fn is_valid_char(&self, c: char) -> bool {
        self.number.get_valid_chars().contains(&c) ||
        self.western.get_valid_chars().contains(&c) ||
        self.sargam.get_valid_chars().contains(&c)
    }
}

impl Default for PitchSystemDispatcher {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_number_pitch_system() {
        let system = NumberPitchSystem;

        assert!(system.lookup("1"));
        assert!(system.lookup("4#"));
        assert!(system.lookup("7b"));
        assert!(system.lookup("3##"));
        assert!(!system.lookup("X"));
        assert!(!system.lookup("8"));
    }

    #[test]
    fn test_western_pitch_system() {
        let system = WesternPitchSystem;

        assert!(system.lookup("c"));
        assert!(system.lookup("f#"));
        assert!(system.lookup("bb"));
        assert!(system.lookup("d##"));
        assert!(!system.lookup("X"));
        assert!(!system.lookup("h"));
    }

    #[test]
    fn test_western_pitch_system_uppercase() {
        // atoms.yaml defines both uppercase (C-G) and lowercase (c-g) for Western system
        // Both should be recognized as valid pitches
        let system = WesternPitchSystem;

        // Uppercase naturals
        assert!(system.lookup("C"), "Uppercase C should be a valid Western pitch");
        assert!(system.lookup("D"), "Uppercase D should be a valid Western pitch");
        assert!(system.lookup("E"), "Uppercase E should be a valid Western pitch");
        assert!(system.lookup("F"), "Uppercase F should be a valid Western pitch");
        assert!(system.lookup("G"), "Uppercase G should be a valid Western pitch");
        assert!(system.lookup("A"), "Uppercase A should be a valid Western pitch");
        // Note: B is lowercase only to avoid confusion with flat symbol 'b'

        // Uppercase with sharps - THIS IS THE REPORTED BUG
        assert!(system.lookup("F#"), "Uppercase F# should be a valid Western pitch");
        assert!(system.lookup("G#"), "Uppercase G# should be a valid Western pitch - THIS WAS REPORTED AS NOT WORKING");
        assert!(system.lookup("C#"), "Uppercase C# should be a valid Western pitch");

        // Uppercase with flats
        assert!(system.lookup("Db"), "Uppercase Db should be a valid Western pitch");
        assert!(system.lookup("Gb"), "Uppercase Gb should be a valid Western pitch");
    }

    #[test]
    fn test_sargam_pitch_system() {
        let system = SargamPitchSystem;

        assert!(system.lookup("S"));
        assert!(system.lookup("M")); // tivra Ma
        assert!(system.lookup("r")); // komal Re
        assert!(system.lookup("S#"));
        assert!(!system.lookup("X"));
    }

    #[test]
    fn test_dispatcher() {
        let dispatcher = PitchSystemDispatcher::new();

        // Test lookup with specific systems
        assert!(dispatcher.lookup("1", PitchSystem::Number));
        assert!(dispatcher.lookup("1#", PitchSystem::Number));
        assert!(dispatcher.lookup("c", PitchSystem::Western));
        assert!(dispatcher.lookup("c#", PitchSystem::Western));
        assert!(dispatcher.lookup("S", PitchSystem::Sargam));

        // Test invalid lookups
        assert!(!dispatcher.lookup("X", PitchSystem::Number));
        assert!(!dispatcher.lookup("1", PitchSystem::Western));

        // IMPORTANT: F is a Western pitch, NOT a Number pitch
        assert!(!dispatcher.lookup("F", PitchSystem::Number), "F should NOT be valid in Number system");
        assert!(!dispatcher.lookup("f", PitchSystem::Number), "f should NOT be valid in Number system");
        assert!(dispatcher.lookup("F", PitchSystem::Western), "F SHOULD be valid in Western system");
        assert!(dispatcher.lookup("f", PitchSystem::Western), "f SHOULD be valid in Western system");

        // Test pitch char detection
        assert!(dispatcher.is_pitch_char('1', PitchSystem::Number));
        assert!(!dispatcher.is_pitch_char('#', PitchSystem::Number));
        assert!(dispatcher.is_pitch_char('c', PitchSystem::Western));
        assert!(!dispatcher.is_pitch_char('#', PitchSystem::Western));
    }
}
