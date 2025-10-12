//! Pitch representation and conversion logic
//!
//! This module provides pitch representation and conversion between
//! different pitch systems used in musical notation.

use serde::{Deserialize, Serialize};
use super::elements::{PitchSystem, Accidental};

/// Pitch representation with octave information
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Pitch {
    /// Base pitch class (e.g., "C", "1", "S")
    pub base: String,

    /// Accidental (sharp, flat, etc.)
    pub accidental: Accidental,

    /// Octave number (relative to middle C)
    pub octave: i8,

    /// Pitch system this pitch belongs to
    pub system: PitchSystem,
}

impl Pitch {
    /// Create a new pitch
    pub fn new(base: String, accidental: Accidental, octave: i8, system: PitchSystem) -> Self {
        Self {
            base,
            accidental,
            octave,
            system,
        }
    }

    /// Get the full pitch notation
    pub fn notation(&self) -> String {
        format!("{}{}{}", self.base, self.accidental.symbol(), self.octave)
    }

    /// Get the base pitch without octave
    pub fn base_notation(&self) -> String {
        format!("{}{}", self.base, self.accidental.symbol())
    }

    /// Get the MIDI note number (relative to C4 = 60)
    pub fn midi_number(&self) -> i8 {
        let base_number = self.get_base_number();
        let accidental_offset = self.accidental.semitone_offset();
        let octave_offset = self.octave * 12;

        base_number + accidental_offset + octave_offset
    }

    /// Get the base number for this pitch system
    fn get_base_number(&self) -> i8 {
        match self.system {
            PitchSystem::Number => {
                match self.base.as_str() {
                    "1" => 0,  // Reference pitch
                    "2" => 2,
                    "3" => 4,
                    "4" => 5,
                    "5" => 7,
                    "6" => 9,
                    "7" => 11,
                    _ => 0,
                }
            },
            PitchSystem::Western => {
                match self.base.to_lowercase().as_str() {
                    "c" => 0,  // C = reference
                    "d" => 2,
                    "e" => 4,
                    "f" => 5,
                    "g" => 7,
                    "a" => 9,
                    "b" => 11,
                    _ => 0,
                }
            },
            PitchSystem::Sargam => {
                match self.base.as_str() {
                    "S" => 0,  // Sa = reference
                    "R" => 2,
                    "G" => 4,
                    "M" => 5,
                    "P" => 7,
                    "D" => 9,
                    "N" => 11,
                    _ => 0,
                }
            },
            _ => 0,
        }
    }

    /// Convert to another pitch system
    pub fn convert_to_system(&self, target_system: PitchSystem) -> Pitch {
        if self.system == target_system {
            return self.clone();
        }

        let midi = self.midi_number();
        Pitch::from_midi_number(midi, target_system)
    }

    /// Create pitch from MIDI number
    pub fn from_midi_number(midi: i8, system: PitchSystem) -> Pitch {
        let octave = (midi / 12) - 1; // C4 = 60 => octave 4
        let note_class = ((midi % 12) + 12) % 12; // Ensure positive

        let (base, accidental) = match system {
            PitchSystem::Number => Self::midi_to_number(note_class),
            PitchSystem::Western => Self::midi_to_western(note_class),
            PitchSystem::Sargam => Self::midi_to_sargam(note_class),
            _ => ("C".to_string(), Accidental::Natural),
        };

        Pitch::new(base, accidental, octave, system)
    }

    /// Convert MIDI note class to number system
    fn midi_to_number(note_class: i8) -> (String, Accidental) {
        match note_class {
            0 => ("1".to_string(), Accidental::Natural),
            1 => ("1".to_string(), Accidental::Sharp),
            2 => ("2".to_string(), Accidental::Natural),
            3 => ("2".to_string(), Accidental::Sharp),
            4 => ("3".to_string(), Accidental::Natural),
            5 => ("4".to_string(), Accidental::Natural),
            6 => ("4".to_string(), Accidental::Sharp),
            7 => ("5".to_string(), Accidental::Natural),
            8 => ("5".to_string(), Accidental::Sharp),
            9 => ("6".to_string(), Accidental::Natural),
            10 => ("6".to_string(), Accidental::Sharp),
            11 => ("7".to_string(), Accidental::Natural),
            _ => ("1".to_string(), Accidental::Natural),
        }
    }

    /// Convert MIDI note class to western system
    fn midi_to_western(note_class: i8) -> (String, Accidental) {
        match note_class {
            0 => ("C".to_string(), Accidental::Natural),
            1 => ("C".to_string(), Accidental::Sharp),
            2 => ("D".to_string(), Accidental::Natural),
            3 => ("D".to_string(), Accidental::Sharp),
            4 => ("E".to_string(), Accidental::Natural),
            5 => ("F".to_string(), Accidental::Natural),
            6 => ("F".to_string(), Accidental::Sharp),
            7 => ("G".to_string(), Accidental::Natural),
            8 => ("G".to_string(), Accidental::Sharp),
            9 => ("A".to_string(), Accidental::Natural),
            10 => ("A".to_string(), Accidental::Sharp),
            11 => ("B".to_string(), Accidental::Natural),
            _ => ("C".to_string(), Accidental::Natural),
        }
    }

    /// Convert MIDI note class to sargam system
    fn midi_to_sargam(note_class: i8) -> (String, Accidental) {
        match note_class {
            0 => ("S".to_string(), Accidental::Natural),
            1 => ("r".to_string(), Accidental::Natural), // Komal Re
            2 => ("R".to_string(), Accidental::Natural), // Shuddha Re
            3 => ("g".to_string(), Accidental::Natural), // Komal Ga
            4 => ("G".to_string(), Accidental::Natural), // Shuddha Ga
            5 => ("M".to_string(), Accidental::Natural), // Shuddha Ma
            6 => ("m".to_string(), Accidental::Natural), // Tivra Ma
            7 => ("P".to_string(), Accidental::Natural), // Pa
            8 => ("d".to_string(), Accidental::Natural), // Komal Dha
            9 => ("D".to_string(), Accidental::Natural), // Shuddha Dha
            10 => ("n".to_string(), Accidental::Natural), // Komal Ni
            11 => ("N".to_string(), Accidental::Natural), // Shuddha Ni
            _ => ("S".to_string(), Accidental::Natural),
        }
    }

    /// Parse pitch from notation string
    pub fn parse_notation(notation: &str, system: PitchSystem) -> Option<Pitch> {
        if notation.is_empty() {
            return None;
        }

        // Extract accidental from end
        let (base_part, accidental) = if notation.ends_with("##") {
            (&notation[..notation.len()-2], Accidental::DoubleSharp)
        } else if notation.ends_with("bb") {
            (&notation[..notation.len()-2], Accidental::DoubleFlat)
        } else if notation.ends_with('#') {
            (&notation[..notation.len()-1], Accidental::Sharp)
        } else if notation.ends_with('b') {
            (&notation[..notation.len()-1], Accidental::Flat)
        } else {
            (notation, Accidental::Natural)
        };

        // Validate base pitch
        if !Self::is_valid_base_pitch(base_part, system) {
            return None;
        }

        // For this POC, we'll use a default octave of 4
        let octave = 4;

        Some(Pitch::new(
            base_part.to_string(),
            accidental,
            octave,
            system
        ))
    }

    /// Check if base pitch is valid for the system
    fn is_valid_base_pitch(base: &str, system: PitchSystem) -> bool {
        match system {
            PitchSystem::Number => matches!(base, "1" | "2" | "3" | "4" | "5" | "6" | "7"),
            PitchSystem::Western => matches!(base.to_lowercase().as_str(), "c" | "d" | "e" | "f" | "g" | "a" | "b"),
            PitchSystem::Sargam => matches!(base, "S" | "R" | "G" | "M" | "P" | "D" | "N"),
            _ => false,
        }
    }
}

impl Default for Pitch {
    fn default() -> Self {
        Self::new("C".to_string(), Accidental::Natural, 4, PitchSystem::Western)
    }
}

/// Pitch converter for handling conversions between different systems
pub struct PitchConverter {
    cache: std::collections::HashMap<(String, PitchSystem, PitchSystem), String>,
}

impl PitchConverter {
    /// Create a new pitch converter
    pub fn new() -> Self {
        Self {
            cache: std::collections::HashMap::new(),
        }
    }

    /// Convert pitch between systems
    pub fn convert(&mut self, pitch: &str, from_system: PitchSystem, to_system: PitchSystem) -> Option<String> {
        if from_system == to_system {
            return Some(pitch.to_string());
        }

        let cache_key = (pitch.to_string(), from_system, to_system);
        if let Some(cached) = self.cache.get(&cache_key) {
            return Some(cached.clone());
        }

        let pitch_obj = Pitch::parse_notation(pitch, from_system)?;
        let converted = pitch_obj.convert_to_system(to_system);
        let result = converted.base_notation();

        self.cache.insert(cache_key, result.clone());
        Some(result)
    }

    /// Validate pitch notation
    pub fn validate_pitch(&self, pitch: &str, system: PitchSystem) -> bool {
        Pitch::parse_notation(pitch, system).is_some()
    }

    /// Get supported pitch systems
    pub fn get_supported_systems(&self) -> Vec<PitchSystem> {
        vec![
            PitchSystem::Number,
            PitchSystem::Western,
            PitchSystem::Sargam,
        ]
    }
}

impl Default for PitchConverter {
    fn default() -> Self {
        Self::new()
    }
}