/// Enumeration of all possible Western pitch spellings
///
/// These represent actual sounding pitches in Western music notation,
/// with proper enharmonic spelling (e.g., F# vs Gb, not both).
///
/// Each pitch family (C, D, E, etc.) has:
/// - Natural form: C (or Cnat for explicit natural)
/// - Sharp: Cs
/// - Flat: Cb
/// - Double-sharp: Css
/// - Double-flat: Cbb
/// - Half-flat: Chf (quarter-tone flat)

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum WesternPitch {
    // C family
    C,
    Cnat,
    Cs,
    Cb,
    Css,
    Cbb,
    Chf,

    // D family
    D,
    Dnat,
    Ds,
    Db,
    Dss,
    Dbb,
    Dhf,

    // E family
    E,
    Enat,
    Es,
    Eb,
    Ess,
    Ebb,
    Ehf,

    // F family
    F,
    Fnat,
    Fs,
    Fb,
    Fss,
    Fbb,
    Fhf,

    // G family
    G,
    Gnat,
    Gs,
    Gb,
    Gss,
    Gbb,
    Ghf,

    // A family
    A,
    Anat,
    As,
    Ab,
    Ass,
    Abb,
    Ahf,

    // B family
    B,
    Bnat,
    Bs,
    Bb,
    Bss,
    Bbb,
    Bhf,
}

impl WesternPitch {
    /// Convert from a pitch name string to WesternPitch enum
    ///
    /// Examples:
    ///   "C" → C or Cnat
    ///   "C#" → Cs
    ///   "Cb" → Cb
    ///   "F#" → Fs
    ///   "Fbb" → Fbb
    ///   "Dhf" → Dhf (half-flat)
    pub fn from_string(s: &str) -> Option<WesternPitch> {
        match s {
            // C family
            "C" => Some(WesternPitch::C),
            "Cnat" => Some(WesternPitch::Cnat),
            "C#" | "Cs" => Some(WesternPitch::Cs),
            "Cb" => Some(WesternPitch::Cb),
            "C##" | "Css" => Some(WesternPitch::Css),
            "Cbb" => Some(WesternPitch::Cbb),
            "Chf" => Some(WesternPitch::Chf),

            // D family
            "D" => Some(WesternPitch::D),
            "Dnat" => Some(WesternPitch::Dnat),
            "D#" | "Ds" => Some(WesternPitch::Ds),
            "Db" => Some(WesternPitch::Db),
            "D##" | "Dss" => Some(WesternPitch::Dss),
            "Dbb" => Some(WesternPitch::Dbb),
            "Dhf" => Some(WesternPitch::Dhf),

            // E family
            "E" => Some(WesternPitch::E),
            "Enat" => Some(WesternPitch::Enat),
            "E#" | "Es" => Some(WesternPitch::Es),
            "Eb" => Some(WesternPitch::Eb),
            "E##" | "Ess" => Some(WesternPitch::Ess),
            "Ebb" => Some(WesternPitch::Ebb),
            "Ehf" => Some(WesternPitch::Ehf),

            // F family
            "F" => Some(WesternPitch::F),
            "Fnat" => Some(WesternPitch::Fnat),
            "F#" | "Fs" => Some(WesternPitch::Fs),
            "Fb" => Some(WesternPitch::Fb),
            "F##" | "Fss" => Some(WesternPitch::Fss),
            "Fbb" => Some(WesternPitch::Fbb),
            "Fhf" => Some(WesternPitch::Fhf),

            // G family
            "G" => Some(WesternPitch::G),
            "Gnat" => Some(WesternPitch::Gnat),
            "G#" | "Gs" => Some(WesternPitch::Gs),
            "Gb" => Some(WesternPitch::Gb),
            "G##" | "Gss" => Some(WesternPitch::Gss),
            "Gbb" => Some(WesternPitch::Gbb),
            "Ghf" => Some(WesternPitch::Ghf),

            // A family
            "A" => Some(WesternPitch::A),
            "Anat" => Some(WesternPitch::Anat),
            "A#" | "As" => Some(WesternPitch::As),
            "Ab" => Some(WesternPitch::Ab),
            "A##" | "Ass" => Some(WesternPitch::Ass),
            "Abb" => Some(WesternPitch::Abb),
            "Ahf" => Some(WesternPitch::Ahf),

            // B family
            "B" => Some(WesternPitch::B),
            "Bnat" => Some(WesternPitch::Bnat),
            "B#" | "Bs" => Some(WesternPitch::Bs),
            "Bb" => Some(WesternPitch::Bb),
            "B##" | "Bss" => Some(WesternPitch::Bss),
            "Bbb" => Some(WesternPitch::Bbb),
            "Bhf" => Some(WesternPitch::Bhf),

            _ => None,
        }
    }

    /// Convert WesternPitch to its string representation
    pub fn to_string(&self) -> &'static str {
        match self {
            WesternPitch::C => "C",
            WesternPitch::Cnat => "Cnat",
            WesternPitch::Cs => "C#",
            WesternPitch::Cb => "Cb",
            WesternPitch::Css => "C##",
            WesternPitch::Cbb => "Cbb",
            WesternPitch::Chf => "Chf",

            WesternPitch::D => "D",
            WesternPitch::Dnat => "Dnat",
            WesternPitch::Ds => "D#",
            WesternPitch::Db => "Db",
            WesternPitch::Dss => "D##",
            WesternPitch::Dbb => "Dbb",
            WesternPitch::Dhf => "Dhf",

            WesternPitch::E => "E",
            WesternPitch::Enat => "Enat",
            WesternPitch::Es => "E#",
            WesternPitch::Eb => "Eb",
            WesternPitch::Ess => "E##",
            WesternPitch::Ebb => "Ebb",
            WesternPitch::Ehf => "Ehf",

            WesternPitch::F => "F",
            WesternPitch::Fnat => "Fnat",
            WesternPitch::Fs => "F#",
            WesternPitch::Fb => "Fb",
            WesternPitch::Fss => "F##",
            WesternPitch::Fbb => "Fbb",
            WesternPitch::Fhf => "Fhf",

            WesternPitch::G => "G",
            WesternPitch::Gnat => "Gnat",
            WesternPitch::Gs => "G#",
            WesternPitch::Gb => "Gb",
            WesternPitch::Gss => "G##",
            WesternPitch::Gbb => "Gbb",
            WesternPitch::Ghf => "Ghf",

            WesternPitch::A => "A",
            WesternPitch::Anat => "Anat",
            WesternPitch::As => "A#",
            WesternPitch::Ab => "Ab",
            WesternPitch::Ass => "A##",
            WesternPitch::Abb => "Abb",
            WesternPitch::Ahf => "Ahf",

            WesternPitch::B => "B",
            WesternPitch::Bnat => "Bnat",
            WesternPitch::Bs => "B#",
            WesternPitch::Bb => "Bb",
            WesternPitch::Bss => "B##",
            WesternPitch::Bbb => "Bbb",
            WesternPitch::Bhf => "Bhf",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_from_string_naturals() {
        assert_eq!(WesternPitch::from_string("C"), Some(WesternPitch::C));
        assert_eq!(WesternPitch::from_string("D"), Some(WesternPitch::D));
        assert_eq!(WesternPitch::from_string("F"), Some(WesternPitch::F));
    }

    #[test]
    fn test_from_string_sharps() {
        assert_eq!(WesternPitch::from_string("C#"), Some(WesternPitch::Cs));
        assert_eq!(WesternPitch::from_string("F#"), Some(WesternPitch::Fs));
        assert_eq!(WesternPitch::from_string("Cs"), Some(WesternPitch::Cs));
    }

    #[test]
    fn test_from_string_flats() {
        assert_eq!(WesternPitch::from_string("Cb"), Some(WesternPitch::Cb));
        assert_eq!(WesternPitch::from_string("Fb"), Some(WesternPitch::Fb));
    }

    #[test]
    fn test_from_string_double_flats() {
        assert_eq!(WesternPitch::from_string("Cbb"), Some(WesternPitch::Cbb));
        assert_eq!(WesternPitch::from_string("Fbb"), Some(WesternPitch::Fbb));
    }

    #[test]
    fn test_from_string_half_flats() {
        assert_eq!(WesternPitch::from_string("Chf"), Some(WesternPitch::Chf));
        assert_eq!(WesternPitch::from_string("Dhf"), Some(WesternPitch::Dhf));
        assert_eq!(WesternPitch::from_string("Fhf"), Some(WesternPitch::Fhf));
    }

    #[test]
    fn test_to_string() {
        assert_eq!(WesternPitch::C.to_string(), "C");
        assert_eq!(WesternPitch::Fnat.to_string(), "Fnat");
        assert_eq!(WesternPitch::Fs.to_string(), "F#");
        assert_eq!(WesternPitch::Fbb.to_string(), "Fbb");
        assert_eq!(WesternPitch::Dhf.to_string(), "Dhf");
    }

    #[test]
    fn test_roundtrip() {
        let pitch = WesternPitch::Fnat;
        let s = pitch.to_string();
        assert_eq!(WesternPitch::from_string(s), Some(WesternPitch::Fnat));

        let hf_pitch = WesternPitch::Ehf;
        let s = hf_pitch.to_string();
        assert_eq!(WesternPitch::from_string(s), Some(WesternPitch::Ehf));
    }
}
