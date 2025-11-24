// PitchCode enum - all possible musical pitches

use serde::{Deserialize, Serialize};

/// Represents the type of accidental applied to a pitch
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum AccidentalType {
    None,
    Sharp,
    Flat,
    HalfFlat,
    DoubleSharp,
    DoubleFlat,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum PitchCode {
    // Naturals (7)
    N1,
    N2,
    N3,
    N4,
    N5,
    N6,
    N7,

    // Sharps (7)
    N1s,
    N2s,
    N3s,
    N4s,
    N5s,
    N6s,
    N7s,

    // Flats (7)
    N1b,
    N2b,
    N3b,
    N4b,
    N5b,
    N6b,
    N7b,

    // Double sharps (7)
    N1ss,
    N2ss,
    N3ss,
    N4ss,
    N5ss,
    N6ss,
    N7ss,

    // Double flats (7)
    N1bb,
    N2bb,
    N3bb,
    N4bb,
    N5bb,
    N6bb,
    N7bb,

    // Half-flats (7)
    N1hf,
    N2hf,
    N3hf,
    N4hf,
    N5hf,
    N6hf,
    N7hf,
}

impl PitchCode {
    /// Get the degree (1-7) of this pitch
    pub fn degree(&self) -> u8 {
        match self {
            PitchCode::N1 | PitchCode::N1s | PitchCode::N1b | PitchCode::N1ss | PitchCode::N1bb | PitchCode::N1hf => 1,
            PitchCode::N2 | PitchCode::N2s | PitchCode::N2b | PitchCode::N2ss | PitchCode::N2bb | PitchCode::N2hf => 2,
            PitchCode::N3 | PitchCode::N3s | PitchCode::N3b | PitchCode::N3ss | PitchCode::N3bb | PitchCode::N3hf => 3,
            PitchCode::N4 | PitchCode::N4s | PitchCode::N4b | PitchCode::N4ss | PitchCode::N4bb | PitchCode::N4hf => 4,
            PitchCode::N5 | PitchCode::N5s | PitchCode::N5b | PitchCode::N5ss | PitchCode::N5bb | PitchCode::N5hf => 5,
            PitchCode::N6 | PitchCode::N6s | PitchCode::N6b | PitchCode::N6ss | PitchCode::N6bb | PitchCode::N6hf => 6,
            PitchCode::N7 | PitchCode::N7s | PitchCode::N7b | PitchCode::N7ss | PitchCode::N7bb | PitchCode::N7hf => 7,
        }
    }

    /// Convert this pitch to its natural form (remove accidentals)
    pub fn to_natural(&self) -> PitchCode {
        match self.degree() {
            1 => PitchCode::N1,
            2 => PitchCode::N2,
            3 => PitchCode::N3,
            4 => PitchCode::N4,
            5 => PitchCode::N5,
            6 => PitchCode::N6,
            7 => PitchCode::N7,
            _ => unreachable!("Invalid pitch degree"),
        }
    }

    /// Get the type of accidental applied to this pitch (sharp, flat, etc.)
    pub fn accidental_type(&self) -> AccidentalType {
        match self {
            // Sharps
            PitchCode::N1s | PitchCode::N2s | PitchCode::N3s | PitchCode::N4s |
            PitchCode::N5s | PitchCode::N6s | PitchCode::N7s => AccidentalType::Sharp,

            // Flats
            PitchCode::N1b | PitchCode::N2b | PitchCode::N3b | PitchCode::N4b |
            PitchCode::N5b | PitchCode::N6b | PitchCode::N7b => AccidentalType::Flat,

            // Half-flats
            PitchCode::N1hf | PitchCode::N2hf | PitchCode::N3hf | PitchCode::N4hf |
            PitchCode::N5hf | PitchCode::N6hf | PitchCode::N7hf => AccidentalType::HalfFlat,

            // Double sharps
            PitchCode::N1ss | PitchCode::N2ss | PitchCode::N3ss | PitchCode::N4ss |
            PitchCode::N5ss | PitchCode::N6ss | PitchCode::N7ss => AccidentalType::DoubleSharp,

            // Double flats
            PitchCode::N1bb | PitchCode::N2bb | PitchCode::N3bb | PitchCode::N4bb |
            PitchCode::N5bb | PitchCode::N6bb | PitchCode::N7bb => AccidentalType::DoubleFlat,

            // Naturals
            _ => AccidentalType::None,
        }
    }

    /// Add a sharp to this pitch
    /// - Natural → Sharp (N1 → N1s)
    /// - Sharp → Double sharp (N1s → N1ss)
    /// - Double sharp → None (can't add more)
    /// - Flat/Double flat → None (can't mix accidentals)
    pub fn add_sharp(&self) -> Option<PitchCode> {
        match self {
            // Naturals → Sharps
            PitchCode::N1 => Some(PitchCode::N1s),
            PitchCode::N2 => Some(PitchCode::N2s),
            PitchCode::N3 => Some(PitchCode::N3s),
            PitchCode::N4 => Some(PitchCode::N4s),
            PitchCode::N5 => Some(PitchCode::N5s),
            PitchCode::N6 => Some(PitchCode::N6s),
            PitchCode::N7 => Some(PitchCode::N7s),

            // Sharps → Double sharps
            PitchCode::N1s => Some(PitchCode::N1ss),
            PitchCode::N2s => Some(PitchCode::N2ss),
            PitchCode::N3s => Some(PitchCode::N3ss),
            PitchCode::N4s => Some(PitchCode::N4ss),
            PitchCode::N5s => Some(PitchCode::N5ss),
            PitchCode::N6s => Some(PitchCode::N6ss),
            PitchCode::N7s => Some(PitchCode::N7ss),

            // Can't add sharp to flats or double sharps/flats
            _ => None,
        }
    }

    /// Add a flat to this pitch
    /// - Natural → Flat (N1 → N1b)
    /// - Flat → Double flat (N1b → N1bb)
    /// - Double flat → None (can't add more)
    /// - Sharp/Double sharp → None (can't mix accidentals)
    pub fn add_flat(&self) -> Option<PitchCode> {
        match self {
            // Naturals → Flats
            PitchCode::N1 => Some(PitchCode::N1b),
            PitchCode::N2 => Some(PitchCode::N2b),
            PitchCode::N3 => Some(PitchCode::N3b),
            PitchCode::N4 => Some(PitchCode::N4b),
            PitchCode::N5 => Some(PitchCode::N5b),
            PitchCode::N6 => Some(PitchCode::N6b),
            PitchCode::N7 => Some(PitchCode::N7b),

            // Flats → Double flats
            PitchCode::N1b => Some(PitchCode::N1bb),
            PitchCode::N2b => Some(PitchCode::N2bb),
            PitchCode::N3b => Some(PitchCode::N3bb),
            PitchCode::N4b => Some(PitchCode::N4bb),
            PitchCode::N5b => Some(PitchCode::N5bb),
            PitchCode::N6b => Some(PitchCode::N6bb),
            PitchCode::N7b => Some(PitchCode::N7bb),

            // Can't add flat to sharps or double sharps/flats
            _ => None,
        }
    }

    /// Transpose this pitch code by a number of semitones
    /// Positive values go up, negative go down
    /// e.g., N1 transposed by 2 (D interval) becomes N2 (E)
    pub fn transpose_by_semitones(&self, semitones: i32) -> PitchCode {
        // Chromatic scale in semitones (within one octave)
        // C=0, C#=1, D=2, D#=3, E=4, F=5, F#=6, G=7, G#=8, A=9, A#=10, B=11
        //
        // Number system mapping to semitones (C=0):
        // 1 (C) = 0, 2 (D) = 2, 3 (E) = 4, 4 (F) = 5, 5 (G) = 7, 6 (A) = 9, 7 (B) = 11

        let base_semitone = match self.degree() {
            1 => 0,  // C
            2 => 2,  // D
            3 => 4,  // E
            4 => 5,  // F
            5 => 7,  // G
            6 => 9,  // A
            7 => 11, // B
            _ => 0,
        };

        let accidental_offset = match self.accidental_type() {
            AccidentalType::DoubleFlat => -2,
            AccidentalType::Flat => -1,
            AccidentalType::HalfFlat => 0, // Approximate as natural
            AccidentalType::Sharp => 1,
            AccidentalType::DoubleSharp => 2,
            AccidentalType::None => 0,
        };

        let target_semitone = (base_semitone + accidental_offset + semitones) % 12;

        // Map semitone back to degree with appropriate accidental
        // This tries to preserve natural note names when possible
        let (degree, accidental) = match target_semitone {
            0 => (1, AccidentalType::None),      // C
            1 => (1, AccidentalType::Sharp),     // C#
            2 => (2, AccidentalType::None),      // D
            3 => (2, AccidentalType::Sharp),     // D#
            4 => (3, AccidentalType::None),      // E
            5 => (4, AccidentalType::None),      // F
            6 => (4, AccidentalType::Sharp),     // F#
            7 => (5, AccidentalType::None),      // G
            8 => (5, AccidentalType::Sharp),     // G#
            9 => (6, AccidentalType::None),      // A
            10 => (6, AccidentalType::Sharp),    // A#
            11 => (7, AccidentalType::None),     // B
            _ => (1, AccidentalType::None),
        };

        // Construct the new PitchCode
        match (degree, accidental) {
            (1, AccidentalType::None) => PitchCode::N1,
            (1, AccidentalType::Sharp) => PitchCode::N1s,
            (1, AccidentalType::Flat) => PitchCode::N1b,
            (1, AccidentalType::DoubleSharp) => PitchCode::N1ss,
            (1, AccidentalType::DoubleFlat) => PitchCode::N1bb,
            (1, AccidentalType::HalfFlat) => PitchCode::N1hf,
            (2, AccidentalType::None) => PitchCode::N2,
            (2, AccidentalType::Sharp) => PitchCode::N2s,
            (2, AccidentalType::Flat) => PitchCode::N2b,
            (2, AccidentalType::DoubleSharp) => PitchCode::N2ss,
            (2, AccidentalType::DoubleFlat) => PitchCode::N2bb,
            (2, AccidentalType::HalfFlat) => PitchCode::N2hf,
            (3, AccidentalType::None) => PitchCode::N3,
            (3, AccidentalType::Sharp) => PitchCode::N3s,
            (3, AccidentalType::Flat) => PitchCode::N3b,
            (3, AccidentalType::DoubleSharp) => PitchCode::N3ss,
            (3, AccidentalType::DoubleFlat) => PitchCode::N3bb,
            (3, AccidentalType::HalfFlat) => PitchCode::N3hf,
            (4, AccidentalType::None) => PitchCode::N4,
            (4, AccidentalType::Sharp) => PitchCode::N4s,
            (4, AccidentalType::Flat) => PitchCode::N4b,
            (4, AccidentalType::DoubleSharp) => PitchCode::N4ss,
            (4, AccidentalType::DoubleFlat) => PitchCode::N4bb,
            (4, AccidentalType::HalfFlat) => PitchCode::N4hf,
            (5, AccidentalType::None) => PitchCode::N5,
            (5, AccidentalType::Sharp) => PitchCode::N5s,
            (5, AccidentalType::Flat) => PitchCode::N5b,
            (5, AccidentalType::DoubleSharp) => PitchCode::N5ss,
            (5, AccidentalType::DoubleFlat) => PitchCode::N5bb,
            (5, AccidentalType::HalfFlat) => PitchCode::N5hf,
            (6, AccidentalType::None) => PitchCode::N6,
            (6, AccidentalType::Sharp) => PitchCode::N6s,
            (6, AccidentalType::Flat) => PitchCode::N6b,
            (6, AccidentalType::DoubleSharp) => PitchCode::N6ss,
            (6, AccidentalType::DoubleFlat) => PitchCode::N6bb,
            (6, AccidentalType::HalfFlat) => PitchCode::N6hf,
            (7, AccidentalType::None) => PitchCode::N7,
            (7, AccidentalType::Sharp) => PitchCode::N7s,
            (7, AccidentalType::Flat) => PitchCode::N7b,
            (7, AccidentalType::DoubleSharp) => PitchCode::N7ss,
            (7, AccidentalType::DoubleFlat) => PitchCode::N7bb,
            (7, AccidentalType::HalfFlat) => PitchCode::N7hf,
            _ => *self, // Fallback to original
        }
    }

    /// Parse a tonic string and return the semitone offset from C
    /// e.g., "C" -> 0, "D" -> 2, "E" -> 4, "F" -> 5, "G" -> 7, "A" -> 9, "B" -> 11
    /// Handles accidentals: "C#" -> 1, "Db" -> 1, etc.
    pub fn semitone_offset_from_c(tonic: &str) -> i32 {
        match tonic.to_uppercase().as_str() {
            "C" | "CN" => 0,
            "C#" | "CS" => 1,
            "DB" | "CB#" => 1,
            "D" | "DN" => 2,
            "D#" | "DS" => 3,
            "EB" | "DB#" => 3,
            "E" | "EN" => 4,
            "E#" | "FB" => 5,
            "F" | "FN" => 5,
            "F#" | "FS" => 6,
            "GB" => 6,
            "G" | "GN" => 7,
            "G#" | "GS" => 8,
            "AB" => 8,
            "A" | "AN" => 9,
            "A#" | "AS" => 10,
            "BB" => 10,
            "B" | "BN" => 11,
            "B#" | "CB" => 0,
            _ => 0, // Default to C if unknown
        }
    }

    /// Convert PitchCode to string based on pitch system
    /// For Number system: N4s -> "4#", N4b -> "4b"
    /// For Western system: N4s -> "f#", N4b -> "fb"
    /// For Sargam system: N4s -> "M", N4b -> "mb"
    pub fn to_string(&self, pitch_system: super::elements::PitchSystem) -> String {
        use super::elements::PitchSystem;

        match pitch_system {
            PitchSystem::Number => self.to_number_string(),
            PitchSystem::Western => self.to_western_string(),
            PitchSystem::Sargam => self.to_sargam_string(),
            _ => self.to_number_string(), // Default fallback
        }
    }

    /// Convert to number notation string (1-7 with #/b)
    fn to_number_string(&self) -> String {
        match self {
            // Natural numbers
            PitchCode::N1 => "1",
            PitchCode::N2 => "2",
            PitchCode::N3 => "3",
            PitchCode::N4 => "4",
            PitchCode::N5 => "5",
            PitchCode::N6 => "6",
            PitchCode::N7 => "7",
            // Sharps
            PitchCode::N1s => "1#",
            PitchCode::N2s => "2#",
            PitchCode::N3s => "3#",
            PitchCode::N4s => "4#",
            PitchCode::N5s => "5#",
            PitchCode::N6s => "6#",
            PitchCode::N7s => "7#",
            // Flats
            PitchCode::N1b => "1b",
            PitchCode::N2b => "2b",
            PitchCode::N3b => "3b",
            PitchCode::N4b => "4b",
            PitchCode::N5b => "5b",
            PitchCode::N6b => "6b",
            PitchCode::N7b => "7b",
            // Double sharps
            PitchCode::N1ss => "1##",
            PitchCode::N2ss => "2##",
            PitchCode::N3ss => "3##",
            PitchCode::N4ss => "4##",
            PitchCode::N5ss => "5##",
            PitchCode::N6ss => "6##",
            PitchCode::N7ss => "7##",
            // Double flats
            PitchCode::N1bb => "1bb",
            PitchCode::N2bb => "2bb",
            PitchCode::N3bb => "3bb",
            PitchCode::N4bb => "4bb",
            PitchCode::N5bb => "5bb",
            PitchCode::N6bb => "6bb",
            PitchCode::N7bb => "7bb",
            // Half-flats
            PitchCode::N1hf => "1b/",
            PitchCode::N2hf => "2b/",
            PitchCode::N3hf => "3b/",
            PitchCode::N4hf => "4b/",
            PitchCode::N5hf => "5b/",
            PitchCode::N6hf => "6b/",
            PitchCode::N7hf => "7b/",
        }.to_string()
    }

    /// Convert to sargam notation string (case-sensitive sargam notation)
    fn to_sargam_string(&self) -> String {
        match self {
            // Natural sargam (using uppercase/lowercase as appropriate)
            PitchCode::N1 => "S",
            PitchCode::N2 => "R",
            PitchCode::N3 => "G",
            PitchCode::N4 => "m",    // shuddha Ma
            PitchCode::N5 => "P",
            PitchCode::N6 => "D",
            PitchCode::N7 => "N",
            // Sharps (using # with uppercase)
            PitchCode::N1s => "S#",
            PitchCode::N2s => "R#",
            PitchCode::N3s => "G#",
            PitchCode::N4s => "M",   // tivra Ma (uppercase M)
            PitchCode::N5s => "P#",
            PitchCode::N6s => "D#",
            PitchCode::N7s => "N#",
            // Flats (using komal/lowercase)
            PitchCode::N1b => "s",   // Could also be "Sb" but "s" is simpler
            PitchCode::N2b => "r",   // komal Re
            PitchCode::N3b => "g",   // komal Ga
            PitchCode::N4b => "mb",  // komal Ma (rare, use explicit flat)
            PitchCode::N5b => "p",   // Could also be "Pb" but "p" is simpler
            PitchCode::N6b => "d",   // komal Dha
            PitchCode::N7b => "n",   // komal Ni
            // Half-flats
            PitchCode::N1hf => "Sb/",
            PitchCode::N2hf => "Rb/",
            PitchCode::N3hf => "Gb/",
            PitchCode::N4hf => "mb/",
            PitchCode::N5hf => "Pb/",
            PitchCode::N6hf => "Db/",
            PitchCode::N7hf => "Nb/",
            // Double sharps
            PitchCode::N1ss => "S##",
            PitchCode::N2ss => "R##",
            PitchCode::N3ss => "G##",
            PitchCode::N4ss => "M##", // Double sharp Ma
            PitchCode::N5ss => "P##",
            PitchCode::N6ss => "D##",
            PitchCode::N7ss => "N##",
            // Double flats
            PitchCode::N1bb => "sbb",
            PitchCode::N2bb => "rbb",
            PitchCode::N3bb => "gbb",
            PitchCode::N4bb => "mbb",
            PitchCode::N5bb => "pbb",
            PitchCode::N6bb => "dbb",
            PitchCode::N7bb => "nbb",
        }.to_string()
    }

    /// Convert to western notation string (a-g with #/b, lowercase)
    fn to_western_string(&self) -> String {
        match self {
            // Natural notes (lowercase to match parser input)
            PitchCode::N1 => "c",
            PitchCode::N2 => "d",
            PitchCode::N3 => "e",
            PitchCode::N4 => "f",
            PitchCode::N5 => "g",
            PitchCode::N6 => "a",
            PitchCode::N7 => "b",
            // Sharps
            PitchCode::N1s => "c#",
            PitchCode::N2s => "d#",
            PitchCode::N3s => "e#",
            PitchCode::N4s => "f#",
            PitchCode::N5s => "g#",
            PitchCode::N6s => "a#",
            PitchCode::N7s => "b#",
            // Flats
            PitchCode::N1b => "cb",
            PitchCode::N2b => "db",
            PitchCode::N3b => "eb",
            PitchCode::N4b => "fb",
            PitchCode::N5b => "gb",
            PitchCode::N6b => "ab",
            PitchCode::N7b => "bb",
            // Half-flats
            PitchCode::N1hf => "cb/",
            PitchCode::N2hf => "db/",
            PitchCode::N3hf => "eb/",
            PitchCode::N4hf => "fb/",
            PitchCode::N5hf => "gb/",
            PitchCode::N6hf => "ab/",
            PitchCode::N7hf => "bb/",
            // Double sharps
            PitchCode::N1ss => "c##",
            PitchCode::N2ss => "d##",
            PitchCode::N3ss => "e##",
            PitchCode::N4ss => "f##",
            PitchCode::N5ss => "g##",
            PitchCode::N6ss => "a##",
            PitchCode::N7ss => "b##",
            // Double flats
            PitchCode::N1bb => "cbb",
            PitchCode::N2bb => "dbb",
            PitchCode::N3bb => "ebb",
            PitchCode::N4bb => "fbb",
            PitchCode::N5bb => "gbb",
            PitchCode::N6bb => "abb",
            PitchCode::N7bb => "bbb",
        }.to_string()
    }
}

impl PitchCode {
    /// Parse a sargam string and return the corresponding PitchCode
    /// Case-sensitive parsing following the SrRgGmMPdDnN convention
    pub fn from_sargam(sargam: &str) -> Option<Self> {
        match sargam {
            // Natural sargam
            "S" | "s" => Some(PitchCode::N1),    // Sa (both uppercase and lowercase)
            "R" => Some(PitchCode::N2),    // shuddha Re
            "G" => Some(PitchCode::N3),    // shuddha Ga
            "m" => Some(PitchCode::N4),    // shuddha Ma
            "P" | "p" => Some(PitchCode::N5),    // Pa (both uppercase and lowercase)
            "D" => Some(PitchCode::N6),    // shuddha Dha
            "N" => Some(PitchCode::N7),    // shuddha Ni
            // Komal (flattened) sargam
            "r" => Some(PitchCode::N2b),   // komal Re
            "g" => Some(PitchCode::N3b),   // komal Ga
            "d" => Some(PitchCode::N6b),   // komal Dha
            "n" => Some(PitchCode::N7b),   // komal Ni
            // Tivra (sharpened) sargam
            "M" => Some(PitchCode::N4s),   // tivra Ma
            // Extended sargam with explicit accidentals
            "S#" | "s#" => Some(PitchCode::N1s),
            "S##" | "s##" => Some(PitchCode::N1ss),
            "Sb" | "sb" => Some(PitchCode::N1b),
            "Sbb" | "sbb" => Some(PitchCode::N1bb),
            "R#" => Some(PitchCode::N2s),
            "R##" => Some(PitchCode::N2ss),
            "Rbb" => Some(PitchCode::N2bb),
            "G#" => Some(PitchCode::N3s),
            "G##" => Some(PitchCode::N3ss),
            "Gbb" => Some(PitchCode::N3bb),
            "mb" => Some(PitchCode::N4b),
            "mbb" => Some(PitchCode::N4bb),
            "M#" => Some(PitchCode::N4ss), // M# is 4##
            "P#" | "p#" => Some(PitchCode::N5s),
            "P##" | "p##" => Some(PitchCode::N5ss),
            "Pb" | "pb" => Some(PitchCode::N5b),
            "Pbb" | "pbb" => Some(PitchCode::N5bb),
            "D#" => Some(PitchCode::N6s),
            "D##" => Some(PitchCode::N6ss),
            "Dbb" => Some(PitchCode::N6bb),
            "N#" => Some(PitchCode::N7s),
            "N##" => Some(PitchCode::N7ss),
            "Nbb" => Some(PitchCode::N7bb),
            _ => None,
        }
    }

    /// Parse a string based on the given pitch system
    pub fn from_string(input: &str, pitch_system: super::elements::PitchSystem) -> Option<Self> {
        use super::elements::PitchSystem;

        match pitch_system {
            PitchSystem::Number => Self::from_number(input),
            PitchSystem::Western => Self::from_western(input),
            PitchSystem::Sargam => Self::from_sargam(input),
            _ => None, // Unknown pitch system
        }
    }

    /// Parse number notation string (1-7 with #/b)
    fn from_number(input: &str) -> Option<Self> {
        match input {
            "1" => Some(PitchCode::N1),
            "2" => Some(PitchCode::N2),
            "3" => Some(PitchCode::N3),
            "4" => Some(PitchCode::N4),
            "5" => Some(PitchCode::N5),
            "6" => Some(PitchCode::N6),
            "7" => Some(PitchCode::N7),
            "1#" => Some(PitchCode::N1s), "1b" => Some(PitchCode::N1b),
            "2#" => Some(PitchCode::N2s), "2b" => Some(PitchCode::N2b),
            "3#" => Some(PitchCode::N3s), "3b" => Some(PitchCode::N3b),
            "4#" => Some(PitchCode::N4s), "4b" => Some(PitchCode::N4b),
            "5#" => Some(PitchCode::N5s), "5b" => Some(PitchCode::N5b),
            "6#" => Some(PitchCode::N6s), "6b" => Some(PitchCode::N6b),
            "7#" => Some(PitchCode::N7s), "7b" => Some(PitchCode::N7b),
            "1##" => Some(PitchCode::N1ss), "1bb" => Some(PitchCode::N1bb),
            "2##" => Some(PitchCode::N2ss), "2bb" => Some(PitchCode::N2bb),
            "3##" => Some(PitchCode::N3ss), "3bb" => Some(PitchCode::N3bb),
            "4##" => Some(PitchCode::N4ss), "4bb" => Some(PitchCode::N4bb),
            "5##" => Some(PitchCode::N5ss), "5bb" => Some(PitchCode::N5bb),
            "6##" => Some(PitchCode::N6ss), "6bb" => Some(PitchCode::N6bb),
            "7##" => Some(PitchCode::N7ss), "7bb" => Some(PitchCode::N7bb),
            "1b/" => Some(PitchCode::N1hf),
            "2b/" => Some(PitchCode::N2hf),
            "3b/" => Some(PitchCode::N3hf),
            "4b/" => Some(PitchCode::N4hf),
            "5b/" => Some(PitchCode::N5hf),
            "6b/" => Some(PitchCode::N6hf),
            "7b/" => Some(PitchCode::N7hf),
            _ => None,
        }
    }

    /// Parse western notation string (a-g with #/b)
    fn from_western(input: &str) -> Option<Self> {
        match input {
            "c" => Some(PitchCode::N1),
            "d" => Some(PitchCode::N2),
            "e" => Some(PitchCode::N3),
            "f" => Some(PitchCode::N4),
            "g" => Some(PitchCode::N5),
            "a" => Some(PitchCode::N6),
            "b" => Some(PitchCode::N7),
            "c#" => Some(PitchCode::N1s), "cb" => Some(PitchCode::N1b),
            "d#" => Some(PitchCode::N2s), "db" => Some(PitchCode::N2b),
            "e#" => Some(PitchCode::N3s), "eb" => Some(PitchCode::N3b),
            "f#" => Some(PitchCode::N4s), "fb" => Some(PitchCode::N4b),
            "g#" => Some(PitchCode::N5s), "gb" => Some(PitchCode::N5b),
            "a#" => Some(PitchCode::N6s), "ab" => Some(PitchCode::N6b),
            "b#" => Some(PitchCode::N7s), "bb" => Some(PitchCode::N7b),
            "c##" => Some(PitchCode::N1ss), "cbb" => Some(PitchCode::N1bb),
            "d##" => Some(PitchCode::N2ss), "dbb" => Some(PitchCode::N2bb),
            "e##" => Some(PitchCode::N3ss), "ebb" => Some(PitchCode::N3bb),
            "f##" => Some(PitchCode::N4ss), "fbb" => Some(PitchCode::N4bb),
            "g##" => Some(PitchCode::N5ss), "gbb" => Some(PitchCode::N5bb),
            "a##" => Some(PitchCode::N6ss), "abb" => Some(PitchCode::N6bb),
            "b##" => Some(PitchCode::N7ss), "bbb" => Some(PitchCode::N7bb),
            _ => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use super::super::elements::PitchSystem;

    #[test]
    fn test_all_35_pitch_codes_defined() {
        // Compile-time check that all 35 variants exist
        let _all = [
            PitchCode::N1,
            PitchCode::N2,
            PitchCode::N3,
            PitchCode::N4,
            PitchCode::N5,
            PitchCode::N6,
            PitchCode::N7,
            PitchCode::N1s,
            PitchCode::N2s,
            PitchCode::N3s,
            PitchCode::N4s,
            PitchCode::N5s,
            PitchCode::N6s,
            PitchCode::N7s,
            PitchCode::N1b,
            PitchCode::N2b,
            PitchCode::N3b,
            PitchCode::N4b,
            PitchCode::N5b,
            PitchCode::N6b,
            PitchCode::N7b,
            PitchCode::N1ss,
            PitchCode::N2ss,
            PitchCode::N3ss,
            PitchCode::N4ss,
            PitchCode::N5ss,
            PitchCode::N6ss,
            PitchCode::N7ss,
            PitchCode::N1bb,
            PitchCode::N2bb,
            PitchCode::N3bb,
            PitchCode::N4bb,
            PitchCode::N5bb,
            PitchCode::N6bb,
            PitchCode::N7bb,
        ];
    }

    #[test]
    fn test_pitch_code_serialization() {
        let pitch = PitchCode::N1s;
        let json = serde_json::to_string(&pitch).unwrap();
        assert!(json.contains("N1s"));
    }

    #[test]
    fn test_pitch_code_deserialization() {
        let json = r#""N1""#;
        let pitch: PitchCode = serde_json::from_str(json).unwrap();
        assert_eq!(pitch, PitchCode::N1);
    }

    #[test]
    fn test_pitch_code_copy_clone() {
        let p1 = PitchCode::N4;
        let p2 = p1;
        let p3 = p1.clone();
        assert_eq!(p1, p2);
        assert_eq!(p2, p3);
    }

    #[test]
    fn test_sargam_natural_notes() {
        assert_eq!(PitchCode::N1.to_string(PitchSystem::Sargam), "S");
        assert_eq!(PitchCode::N2.to_string(PitchSystem::Sargam), "R");
        assert_eq!(PitchCode::N3.to_string(PitchSystem::Sargam), "G");
        assert_eq!(PitchCode::N4.to_string(PitchSystem::Sargam), "m");
        assert_eq!(PitchCode::N5.to_string(PitchSystem::Sargam), "P");
        assert_eq!(PitchCode::N6.to_string(PitchSystem::Sargam), "D");
        assert_eq!(PitchCode::N7.to_string(PitchSystem::Sargam), "N");
    }

    #[test]
    fn test_sargam_komal_variants() {
        assert_eq!(PitchCode::N2b.to_string(PitchSystem::Sargam), "r"); // komal Re
        assert_eq!(PitchCode::N3b.to_string(PitchSystem::Sargam), "g"); // komal Ga
        assert_eq!(PitchCode::N6b.to_string(PitchSystem::Sargam), "d"); // komal Dha
        assert_eq!(PitchCode::N7b.to_string(PitchSystem::Sargam), "n"); // komal Ni
    }

    #[test]
    fn test_sargam_tivra_ma() {
        assert_eq!(PitchCode::N4s.to_string(PitchSystem::Sargam), "M"); // tivra Ma
    }

    #[test]
    fn test_sargam_lowercase_s_p() {
        // Test that lowercase s and p map to the same pitch codes as uppercase S and P
        assert_eq!(PitchCode::from_sargam("s"), Some(PitchCode::N1)); // Sa
        assert_eq!(PitchCode::from_sargam("S"), Some(PitchCode::N1)); // Sa
        assert_eq!(PitchCode::from_sargam("p"), Some(PitchCode::N5)); // Pa
        assert_eq!(PitchCode::from_sargam("P"), Some(PitchCode::N5)); // Pa

        // Verify they are equivalent
        assert_eq!(PitchCode::from_sargam("s"), PitchCode::from_sargam("S"));
        assert_eq!(PitchCode::from_sargam("p"), PitchCode::from_sargam("P"));
    }

    #[test]
    fn test_sargam_extended_accidentals() {
        assert_eq!(PitchCode::from_sargam("S#"), Some(PitchCode::N1s));
        assert_eq!(PitchCode::from_sargam("G##"), Some(PitchCode::N3ss));
        assert_eq!(PitchCode::from_sargam("M#"), Some(PitchCode::N4ss)); // M# is 4##
        assert_eq!(PitchCode::from_sargam("mb"), Some(PitchCode::N4b));
    }

    #[test]
    fn test_sargam_invalid() {
        assert_eq!(PitchCode::from_sargam("X"), None);
        assert_eq!(PitchCode::from_sargam(""), None);
        assert_eq!(PitchCode::from_sargam("unknown"), None);
    }

    #[test]
    fn test_case_sensitive_mapping() {
        // Verify the SrRgGmMPdDnN -> C Db D Eb E F F# G Ab A Bb B mapping
        assert_eq!(PitchCode::from_sargam("S"), Some(PitchCode::N1));   // C
        assert_eq!(PitchCode::from_sargam("r"), Some(PitchCode::N2b));  // Db
        assert_eq!(PitchCode::from_sargam("R"), Some(PitchCode::N2));   // D
        assert_eq!(PitchCode::from_sargam("g"), Some(PitchCode::N3b));  // Eb
        assert_eq!(PitchCode::from_sargam("G"), Some(PitchCode::N3));   // E
        assert_eq!(PitchCode::from_sargam("m"), Some(PitchCode::N4));   // F
        assert_eq!(PitchCode::from_sargam("M"), Some(PitchCode::N4s));  // F#
        assert_eq!(PitchCode::from_sargam("P"), Some(PitchCode::N5));   // G
        assert_eq!(PitchCode::from_sargam("d"), Some(PitchCode::N6b));  // Ab
        assert_eq!(PitchCode::from_sargam("D"), Some(PitchCode::N6));   // A
        assert_eq!(PitchCode::from_sargam("n"), Some(PitchCode::N7b));  // Bb
        assert_eq!(PitchCode::from_sargam("N"), Some(PitchCode::N7));   // B
    }

    #[test]
    fn test_from_string_sargam() {
        assert_eq!(PitchCode::from_string("S", PitchSystem::Sargam), Some(PitchCode::N1));
        assert_eq!(PitchCode::from_string("r", PitchSystem::Sargam), Some(PitchCode::N2b));
        assert_eq!(PitchCode::from_string("M", PitchSystem::Sargam), Some(PitchCode::N4s));
        assert_eq!(PitchCode::from_string("S#", PitchSystem::Sargam), Some(PitchCode::N1s));
        assert_eq!(PitchCode::from_string("mb", PitchSystem::Sargam), Some(PitchCode::N4b));
    }

    #[test]
    fn test_sargam_roundtrip_conversion() {
        // Test that converting to and from sargam preserves the pitch
        let pitches = [
            PitchCode::N1, PitchCode::N2b, PitchCode::N2, PitchCode::N3b, PitchCode::N3,
            PitchCode::N4, PitchCode::N4s, PitchCode::N5, PitchCode::N6b, PitchCode::N6,
            PitchCode::N7b, PitchCode::N7
        ];

        for pitch in pitches.iter() {
            let sargam_str = pitch.to_string(PitchSystem::Sargam);
            let parsed_pitch = PitchCode::from_string(&sargam_str, PitchSystem::Sargam);
            assert_eq!(Some(*pitch), parsed_pitch, "Roundtrip failed for pitch {:?}", pitch);
        }
    }

    #[test]
    fn test_all_three_notation_systems() {
        let pitch = PitchCode::N4s; // F#

        assert_eq!(pitch.to_string(PitchSystem::Number), "4#");
        assert_eq!(pitch.to_string(PitchSystem::Western), "f#");
        assert_eq!(pitch.to_string(PitchSystem::Sargam), "M"); // tivra Ma

        // Parse back from each system
        assert_eq!(PitchCode::from_string("4#", PitchSystem::Number), Some(pitch));
        assert_eq!(PitchCode::from_string("f#", PitchSystem::Western), Some(pitch));
        assert_eq!(PitchCode::from_string("M", PitchSystem::Sargam), Some(pitch));
    }

    #[test]
    fn test_double_accidentals_sargam() {
        assert_eq!(PitchCode::N1ss.to_string(PitchSystem::Sargam), "S##");
        assert_eq!(PitchCode::N1bb.to_string(PitchSystem::Sargam), "sbb");
        assert_eq!(PitchCode::from_sargam("S##"), Some(PitchCode::N1ss));
        assert_eq!(PitchCode::from_sargam("sbb"), Some(PitchCode::N1bb));
    }
}
