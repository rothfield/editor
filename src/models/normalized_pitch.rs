/// Enumeration of all possible normalized pitches with explicit spelling
///
/// These represent actual sounding pitches in a specific key context,
/// with proper enharmonic spelling (e.g., F# vs Gb, not both).
///
/// Each pitch family (C, D, E, etc.) has:
/// - Natural form: C (or Cnat for explicit)
/// - Sharp: Cs
/// - Flat: Cb
/// - Double-sharp: Css
/// - Double-flat: Cbb

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum NormalizedPitch {
    // C family
    C,
    Cnat,
    Cs,
    Cb,
    Css,
    Cbb,

    // D family
    D,
    Dnat,
    Ds,
    Db,
    Dss,
    Dbb,

    // E family
    E,
    Enat,
    Es,
    Eb,
    Ess,
    Ebb,

    // F family
    F,
    Fnat,
    Fs,
    Fb,
    Fss,
    Fbb,

    // G family
    G,
    Gnat,
    Gs,
    Gb,
    Gss,
    Gbb,

    // A family
    A,
    Anat,
    As,
    Ab,
    Ass,
    Abb,

    // B family
    B,
    Bnat,
    Bs,
    Bb,
    Bss,
    Bbb,
}

impl NormalizedPitch {
    /// Convert from a pitch name string to NormalizedPitch enum
    ///
    /// Examples:
    ///   "C" → C or Cnat
    ///   "C#" → Cs
    ///   "Cb" → Cb
    ///   "F#" → Fs
    ///   "Fbb" → Fbb
    pub fn from_string(s: &str) -> Option<NormalizedPitch> {
        match s {
            // C family
            "C" => Some(NormalizedPitch::C),
            "Cnat" => Some(NormalizedPitch::Cnat),
            "C#" | "Cs" => Some(NormalizedPitch::Cs),
            "Cb" => Some(NormalizedPitch::Cb),
            "C##" | "Css" => Some(NormalizedPitch::Css),
            "Cbb" => Some(NormalizedPitch::Cbb),

            // D family
            "D" => Some(NormalizedPitch::D),
            "Dnat" => Some(NormalizedPitch::Dnat),
            "D#" | "Ds" => Some(NormalizedPitch::Ds),
            "Db" => Some(NormalizedPitch::Db),
            "D##" | "Dss" => Some(NormalizedPitch::Dss),
            "Dbb" => Some(NormalizedPitch::Dbb),

            // E family
            "E" => Some(NormalizedPitch::E),
            "Enat" => Some(NormalizedPitch::Enat),
            "E#" | "Es" => Some(NormalizedPitch::Es),
            "Eb" => Some(NormalizedPitch::Eb),
            "E##" | "Ess" => Some(NormalizedPitch::Ess),
            "Ebb" => Some(NormalizedPitch::Ebb),

            // F family
            "F" => Some(NormalizedPitch::F),
            "Fnat" => Some(NormalizedPitch::Fnat),
            "F#" | "Fs" => Some(NormalizedPitch::Fs),
            "Fb" => Some(NormalizedPitch::Fb),
            "F##" | "Fss" => Some(NormalizedPitch::Fss),
            "Fbb" => Some(NormalizedPitch::Fbb),

            // G family
            "G" => Some(NormalizedPitch::G),
            "Gnat" => Some(NormalizedPitch::Gnat),
            "G#" | "Gs" => Some(NormalizedPitch::Gs),
            "Gb" => Some(NormalizedPitch::Gb),
            "G##" | "Gss" => Some(NormalizedPitch::Gss),
            "Gbb" => Some(NormalizedPitch::Gbb),

            // A family
            "A" => Some(NormalizedPitch::A),
            "Anat" => Some(NormalizedPitch::Anat),
            "A#" | "As" => Some(NormalizedPitch::As),
            "Ab" => Some(NormalizedPitch::Ab),
            "A##" | "Ass" => Some(NormalizedPitch::Ass),
            "Abb" => Some(NormalizedPitch::Abb),

            // B family
            "B" => Some(NormalizedPitch::B),
            "Bnat" => Some(NormalizedPitch::Bnat),
            "B#" | "Bs" => Some(NormalizedPitch::Bs),
            "Bb" => Some(NormalizedPitch::Bb),
            "B##" | "Bss" => Some(NormalizedPitch::Bss),
            "Bbb" => Some(NormalizedPitch::Bbb),

            _ => None,
        }
    }

    /// Convert NormalizedPitch to its string representation
    pub fn to_string(&self) -> &'static str {
        match self {
            NormalizedPitch::C => "C",
            NormalizedPitch::Cnat => "Cnat",
            NormalizedPitch::Cs => "C#",
            NormalizedPitch::Cb => "Cb",
            NormalizedPitch::Css => "C##",
            NormalizedPitch::Cbb => "Cbb",

            NormalizedPitch::D => "D",
            NormalizedPitch::Dnat => "Dnat",
            NormalizedPitch::Ds => "D#",
            NormalizedPitch::Db => "Db",
            NormalizedPitch::Dss => "D##",
            NormalizedPitch::Dbb => "Dbb",

            NormalizedPitch::E => "E",
            NormalizedPitch::Enat => "Enat",
            NormalizedPitch::Es => "E#",
            NormalizedPitch::Eb => "Eb",
            NormalizedPitch::Ess => "E##",
            NormalizedPitch::Ebb => "Ebb",

            NormalizedPitch::F => "F",
            NormalizedPitch::Fnat => "Fnat",
            NormalizedPitch::Fs => "F#",
            NormalizedPitch::Fb => "Fb",
            NormalizedPitch::Fss => "F##",
            NormalizedPitch::Fbb => "Fbb",

            NormalizedPitch::G => "G",
            NormalizedPitch::Gnat => "Gnat",
            NormalizedPitch::Gs => "G#",
            NormalizedPitch::Gb => "Gb",
            NormalizedPitch::Gss => "G##",
            NormalizedPitch::Gbb => "Gbb",

            NormalizedPitch::A => "A",
            NormalizedPitch::Anat => "Anat",
            NormalizedPitch::As => "A#",
            NormalizedPitch::Ab => "Ab",
            NormalizedPitch::Ass => "A##",
            NormalizedPitch::Abb => "Abb",

            NormalizedPitch::B => "B",
            NormalizedPitch::Bnat => "Bnat",
            NormalizedPitch::Bs => "B#",
            NormalizedPitch::Bb => "Bb",
            NormalizedPitch::Bss => "B##",
            NormalizedPitch::Bbb => "Bbb",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_from_string_naturals() {
        assert_eq!(NormalizedPitch::from_string("C"), Some(NormalizedPitch::C));
        assert_eq!(NormalizedPitch::from_string("D"), Some(NormalizedPitch::D));
        assert_eq!(NormalizedPitch::from_string("F"), Some(NormalizedPitch::F));
    }

    #[test]
    fn test_from_string_sharps() {
        assert_eq!(NormalizedPitch::from_string("C#"), Some(NormalizedPitch::Cs));
        assert_eq!(NormalizedPitch::from_string("F#"), Some(NormalizedPitch::Fs));
        assert_eq!(NormalizedPitch::from_string("Cs"), Some(NormalizedPitch::Cs));
    }

    #[test]
    fn test_from_string_flats() {
        assert_eq!(NormalizedPitch::from_string("Cb"), Some(NormalizedPitch::Cb));
        assert_eq!(NormalizedPitch::from_string("Fb"), Some(NormalizedPitch::Fb));
    }

    #[test]
    fn test_from_string_double_flats() {
        assert_eq!(NormalizedPitch::from_string("Cbb"), Some(NormalizedPitch::Cbb));
        assert_eq!(NormalizedPitch::from_string("Fbb"), Some(NormalizedPitch::Fbb));
    }

    #[test]
    fn test_to_string() {
        assert_eq!(NormalizedPitch::C.to_string(), "C");
        assert_eq!(NormalizedPitch::Fnat.to_string(), "Fnat");
        assert_eq!(NormalizedPitch::Fs.to_string(), "F#");
        assert_eq!(NormalizedPitch::Fbb.to_string(), "Fbb");
    }

    #[test]
    fn test_roundtrip() {
        let pitch = NormalizedPitch::Fnat;
        let s = pitch.to_string();
        assert_eq!(NormalizedPitch::from_string(s), Some(NormalizedPitch::Fnat));
    }
}
