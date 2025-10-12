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
        matches!(symbol,
            "1" | "2" | "3" | "4" | "5" | "6" | "7" |
            "1#" | "1b" | "2#" | "2b" | "3#" | "3b" |
            "4#" | "4b" | "5#" | "5b" | "6#" | "6b" | "7#" | "7b" |
            "1##" | "1bb" | "2##" | "2bb" | "3##" | "3bb" |
            "4##" | "4bb" | "5##" | "5bb" | "6##" | "6bb" | "7##" | "7bb"
        )
    }

    fn get_valid_chars(&self) -> Vec<char> {
        vec!['1', '2', '3', '4', '5', '6', '7', '#', 'b']
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
        matches!(symbol,
            "c" | "d" | "e" | "f" | "g" | "a" | "b" |
            "c#" | "cb" | "d#" | "db" | "e#" | "eb" |
            "f#" | "fb" | "g#" | "gb" | "a#" | "ab" | "b#" | "bb" |
            "c##" | "cbb" | "d##" | "dbb" | "e##" | "ebb" |
            "f##" | "fbb" | "g##" | "gbb" | "a##" | "abb" | "b##" | "bbb"
        )
    }

    fn get_valid_chars(&self) -> Vec<char> {
        vec!['a', 'b', 'c', 'd', 'e', 'f', 'g', '#']
    }

    fn get_pitch_chars(&self) -> Vec<char> {
        vec!['a', 'b', 'c', 'd', 'e', 'f', 'g']
    }
}

/// Sargam notation pitch system (SrRgGmMPdDnN)
#[derive(Debug, Clone)]
pub struct SargamPitchSystem;

impl PitchSystemHandler for SargamPitchSystem {
    fn lookup(&self, symbol: &str) -> bool {
        matches!(symbol,
            // Natural and komal
            "S" | "s" | "R" | "r" | "G" | "g" | "m" | "M" | "P" | "p" | "D" | "d" | "N" | "n" |
            // With accidentals
            "S#" | "s#" | "Sb" | "sb" | "R#" | "Rb" | "G#" | "Gb" |
            "mb" | "M#" | "Mb" | "P#" | "p#" | "Pb" | "pb" | "D#" | "Db" | "N#" | "Nb" |
            // Double accidentals
            "S##" | "s##" | "Sbb" | "sbb" | "R##" | "Rbb" | "G##" | "Gbb" |
            "mbb" | "M##" | "Mbb" | "P##" | "p##" | "Pbb" | "pbb" | "D##" | "Dbb" | "N##" | "Nbb"
        )
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

        // Test pitch char detection
        assert!(dispatcher.is_pitch_char('1', PitchSystem::Number));
        assert!(!dispatcher.is_pitch_char('#', PitchSystem::Number));
        assert!(dispatcher.is_pitch_char('c', PitchSystem::Western));
        assert!(!dispatcher.is_pitch_char('#', PitchSystem::Western));
    }
}
