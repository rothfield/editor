//! Sargam system pitch implementation
//!
//! The sargam system uses syllables Sa, Re, Ga, Ma, Pa, Dha, Ni
//! to represent the seven degrees of the Indian musical scale.


/// Sargam system implementation
pub struct SargamSystem;

impl SargamSystem {
    /// Get the pitch sequence for sargam system
    pub fn pitch_sequence() -> Vec<&'static str> {
        vec!["S", "R", "G", "M", "P", "D", "N"]
    }

    /// Validate if a string is valid sargam system pitch
    pub fn validate_pitch(pitch: &str) -> bool {
        Self::pitch_sequence().contains(&pitch)
    }

    /// Get svar names for sargam
    pub fn get_svar_name(sargam: &str) -> &'static str {
        match sargam {
            "S" => "Shadja",
            "R" => "Rishabha",
            "G" => "Gandhara",
            "M" => "Madhyama",
            "P" => "Panchama",
            "D" => "Dhaivata",
            "N" => "Nishada",
            _ => "Shadja",
        }
    }

    /// Convert sargam to number system
    pub fn to_number(sargam: &str) -> String {
        match sargam {
            "S" => "1",
            "R" => "2",
            "G" => "3",
            "M" => "4",
            "P" => "5",
            "D" => "6",
            "N" => "7",
            _ => "1",
        }.to_string()
    }
}