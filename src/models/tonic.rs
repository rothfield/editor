/// Enumeration of all possible tonic pitches (key centers)
///
/// Represents the 17 commonly used tonics in Western music:
/// - 7 natural tonics (C, D, E, F, G, A, B)
/// - 5 sharp tonics (C#, D#, F#, G#, A#)
/// - 5 flat tonics (Db, Eb, Gb, Ab, Bb)
///
/// Note: Enharmonic equivalents are listed separately (e.g., C# and Db)
/// because they result in different key signatures and pitch spellings.

use serde::{Deserialize, Serialize};
use std::fmt;
use std::str::FromStr;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum Tonic {
    C,
    #[serde(rename = "C#")]
    Cs,
    Db,
    D,
    #[serde(rename = "D#")]
    Ds,
    Eb,
    E,
    F,
    #[serde(rename = "F#")]
    Fs,
    Gb,
    G,
    #[serde(rename = "G#")]
    Gs,
    Ab,
    A,
    #[serde(rename = "A#")]
    As,
    Bb,
    B,
}

impl Tonic {
    /// Convert tonic to its string representation
    pub fn as_str(&self) -> &'static str {
        match self {
            Tonic::C => "C",
            Tonic::Cs => "C#",
            Tonic::Db => "Db",
            Tonic::D => "D",
            Tonic::Ds => "D#",
            Tonic::Eb => "Eb",
            Tonic::E => "E",
            Tonic::F => "F",
            Tonic::Fs => "F#",
            Tonic::Gb => "Gb",
            Tonic::G => "G",
            Tonic::Gs => "G#",
            Tonic::Ab => "Ab",
            Tonic::A => "A",
            Tonic::As => "A#",
            Tonic::Bb => "Bb",
            Tonic::B => "B",
        }
    }
}

impl fmt::Display for Tonic {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

impl FromStr for Tonic {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        // Case-insensitive parsing
        match s.to_uppercase().as_str() {
            "C" | "CN" => Ok(Tonic::C),
            "C#" | "CS" | "C♯" => Ok(Tonic::Cs),
            "DB" | "D♭" => Ok(Tonic::Db),
            "D" | "DN" => Ok(Tonic::D),
            "D#" | "DS" | "D♯" => Ok(Tonic::Ds),
            "EB" | "E♭" => Ok(Tonic::Eb),
            "E" | "EN" => Ok(Tonic::E),
            "F" | "FN" => Ok(Tonic::F),
            "F#" | "FS" | "F♯" => Ok(Tonic::Fs),
            "GB" | "G♭" => Ok(Tonic::Gb),
            "G" | "GN" => Ok(Tonic::G),
            "G#" | "GS" | "G♯" => Ok(Tonic::Gs),
            "AB" | "A♭" => Ok(Tonic::Ab),
            "A" | "AN" => Ok(Tonic::A),
            "A#" | "AS" | "A♯" => Ok(Tonic::As),
            "BB" | "B♭" => Ok(Tonic::Bb),
            "B" | "BN" => Ok(Tonic::B),
            _ => Err(format!("Invalid tonic: '{}'. Expected one of: C, C#, Db, D, D#, Eb, E, F, F#, Gb, G, G#, Ab, A, A#, Bb, B", s)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_from_str_naturals() {
        assert_eq!("C".parse::<Tonic>().unwrap(), Tonic::C);
        assert_eq!("D".parse::<Tonic>().unwrap(), Tonic::D);
        assert_eq!("E".parse::<Tonic>().unwrap(), Tonic::E);
        assert_eq!("F".parse::<Tonic>().unwrap(), Tonic::F);
        assert_eq!("G".parse::<Tonic>().unwrap(), Tonic::G);
        assert_eq!("A".parse::<Tonic>().unwrap(), Tonic::A);
        assert_eq!("B".parse::<Tonic>().unwrap(), Tonic::B);
    }

    #[test]
    fn test_from_str_sharps() {
        assert_eq!("C#".parse::<Tonic>().unwrap(), Tonic::Cs);
        assert_eq!("D#".parse::<Tonic>().unwrap(), Tonic::Ds);
        assert_eq!("F#".parse::<Tonic>().unwrap(), Tonic::Fs);
        assert_eq!("G#".parse::<Tonic>().unwrap(), Tonic::Gs);
        assert_eq!("A#".parse::<Tonic>().unwrap(), Tonic::As);
    }

    #[test]
    fn test_from_str_flats() {
        assert_eq!("Db".parse::<Tonic>().unwrap(), Tonic::Db);
        assert_eq!("Eb".parse::<Tonic>().unwrap(), Tonic::Eb);
        assert_eq!("Gb".parse::<Tonic>().unwrap(), Tonic::Gb);
        assert_eq!("Ab".parse::<Tonic>().unwrap(), Tonic::Ab);
        assert_eq!("Bb".parse::<Tonic>().unwrap(), Tonic::Bb);
    }

    #[test]
    fn test_from_str_case_insensitive() {
        assert_eq!("c".parse::<Tonic>().unwrap(), Tonic::C);
        assert_eq!("f#".parse::<Tonic>().unwrap(), Tonic::Fs);
        assert_eq!("bb".parse::<Tonic>().unwrap(), Tonic::Bb);
        assert_eq!("C#".parse::<Tonic>().unwrap(), Tonic::Cs);
    }

    #[test]
    fn test_from_str_invalid() {
        assert!("H".parse::<Tonic>().is_err());
        assert!("C###".parse::<Tonic>().is_err());
        assert!("X".parse::<Tonic>().is_err());
        assert!("".parse::<Tonic>().is_err());
    }

    #[test]
    fn test_as_str() {
        assert_eq!(Tonic::C.as_str(), "C");
        assert_eq!(Tonic::Fs.as_str(), "F#");
        assert_eq!(Tonic::Bb.as_str(), "Bb");
    }

    #[test]
    fn test_display() {
        assert_eq!(format!("{}", Tonic::C), "C");
        assert_eq!(format!("{}", Tonic::Fs), "F#");
        assert_eq!(format!("{}", Tonic::Db), "Db");
    }

    #[test]
    fn test_serde_roundtrip() {
        let tonic = Tonic::Fs;
        let json = serde_json::to_string(&tonic).unwrap();
        assert_eq!(json, "\"F#\"");

        let parsed: Tonic = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed, Tonic::Fs);
    }

    #[test]
    fn test_all_17_tonics() {
        let tonics = vec![
            Tonic::C, Tonic::Cs, Tonic::Db, Tonic::D, Tonic::Ds,
            Tonic::Eb, Tonic::E, Tonic::F, Tonic::Fs, Tonic::Gb,
            Tonic::G, Tonic::Gs, Tonic::Ab, Tonic::A, Tonic::As,
            Tonic::Bb, Tonic::B,
        ];
        assert_eq!(tonics.len(), 17);
    }
}
