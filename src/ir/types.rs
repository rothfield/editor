//! Intermediate Representation (IR) for Music Notation Export
//!
//! This module defines format-agnostic IR types that bridge from the Document model
//! (Cell-based) to various export formats (MusicXML, LilyPond, MIDI, etc.).
//!
//! The IR is produced by the FSM-based conversion pipeline and consumed by format-specific emitters.
//!
//! # Design Principles
//!
//! 1. **Format-agnostic**: IR captures musical semantics, not format-specific details
//! 2. **Stay faithful to Document model**: Only include what exists in Document/Line/Cell
//! 3. **No invented abstractions**: No "Part" type (Line IS the part); no clef/key per measure
//! 4. **Line-level metadata**: clef, key_signature, time_signature stay at line level
//! 5. **Measure-level only**: divisions (beat subdivision, varies due to LCM)
//!
//! # Three-Layer Export Architecture
//!
//! ```text
//! Document Model        Export IR                Format Emitters
//! (Cell-based)          (Format-agnostic)        (MusicXML, LilyPond, etc.)
//!
//! Document              Vec<ExportLine>          MusicXML String
//! ├── Line              ├── ExportLine           LilyPond String
//! │   ├── cells         │   ├── key_sig          MIDI File
//! │   ├── lyrics        │   ├── time_sig         VexFlow JSON
//! │   └── key_sig       │   ├── clef             ...
//! │                     │   └── measures
//! └── (metadata)        │       └── Vec<ExportMeasure>
//!                       │           ├── divisions
//!                       │           └── events
//!                       │               └── Vec<ExportEvent>
//! ```

use crate::models::{PitchCode, OrnamentPositionType};
use serde::{Serialize, Deserialize};

/// Fraction representing a duration as a portion of a beat
///
/// Stores rhythmic durations semantically (e.g., 3/4 of a beat)
/// rather than as absolute divisions. This preserves the relationship
/// between note duration and beat structure.
///
/// Example: In "1--2", the "1" occupies 3/4 of the beat, "2" occupies 1/4
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Fraction {
    pub numerator: usize,
    pub denominator: usize,
}

impl Fraction {
    /// Create a new fraction
    pub fn new(numerator: usize, denominator: usize) -> Self {
        assert!(denominator > 0, "Fraction denominator must be positive");
        Fraction { numerator, denominator }
    }

    /// Simplify the fraction by dividing by GCD
    pub fn simplify(&self) -> Self {
        fn gcd(a: usize, b: usize) -> usize {
            if b == 0 { a } else { gcd(b, a % b) }
        }
        let g = gcd(self.numerator, self.denominator);
        Fraction {
            numerator: self.numerator / g,
            denominator: self.denominator / g,
        }
    }

    /// Convert to floating point (for debugging/display)
    pub fn to_f64(&self) -> f64 {
        self.numerator as f64 / self.denominator as f64
    }

    /// Scale fraction to absolute divisions given a measure division count
    /// Example: 3/4 fraction with measure_divisions=16 → 12 divisions
    pub fn to_divisions(&self, measure_divisions: usize) -> usize {
        (self.numerator * measure_divisions) / self.denominator
    }
}

/// Intermediate representation of a line (staff/part) for MusicXML export
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportLine {
    /// System ID for this line (which bracket group it belongs to)
    /// Copied from Line.system_id
    #[serde(default)]
    pub system_id: usize,

    /// Part ID for MusicXML export (unique identifier for this part)
    /// Format: "P1", "P2", "P3", etc.
    /// Copied from Line.part_id
    #[serde(default)]
    pub part_id: String,

    /// Staff role (Melody, GroupHeader, GroupItem)
    /// Used to determine part name assignment
    #[serde(default)]
    pub staff_role: crate::models::core::StaffRole,

    /// Key signature string (e.g., "G major" or "F#m")
    /// Set at part level in MusicXML, shared across all measures
    pub key_signature: Option<String>,

    /// Time signature string (e.g., "4/4" or "6/8")
    /// Written at start of part, repeated only if it changes
    pub time_signature: Option<String>,

    /// Clef (e.g., "treble", "bass") - typically constant per line
    pub clef: String,

    /// Label for this line/staff (e.g., "Violin I", "Bass")
    #[serde(default)]
    pub label: String,

    /// Whether to show bracket/brace for this line's system group in MusicXML
    /// If false, uses print-object="no" on <part-group>
    /// Default: true
    #[serde(default = "default_true")]
    pub show_bracket: bool,

    /// Measures in this line
    pub measures: Vec<ExportMeasure>,

    /// Lyrics string to be parsed into syllables during emission
    /// TODO: Should be parsed into Vec<LyricSyllable> during IR construction
    pub lyrics: String,
}

fn default_true() -> bool {
    true
}

impl ExportLine {
    pub fn new(
        system_id: usize,
        part_id: String,
        staff_role: crate::models::core::StaffRole,
        key_signature: Option<String>,
        time_signature: Option<String>,
        clef: String,
        label: String,
        lyrics: String,
    ) -> Self {
        ExportLine {
            system_id,
            part_id,
            staff_role,
            key_signature,
            time_signature,
            clef,
            label,
            show_bracket: true,  // Default to showing brackets
            measures: Vec::new(),
            lyrics,
        }
    }
}

/// Intermediate representation of a measure for MusicXML export
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportMeasure {
    /// Beat division count for this measure
    /// Determined by LCM of all beat divisions in the measure
    /// INVARIANT: sum(event.divisions) == divisions for all events
    pub divisions: usize,

    /// Events (notes, rests, chords) in this measure
    pub events: Vec<ExportEvent>,
}

impl ExportMeasure {
    pub fn new(divisions: usize) -> Self {
        ExportMeasure {
            divisions,
            events: Vec::new(),
        }
    }

    /// Validate invariant: sum of event divisions equals measure divisions
    /// Empty measures are also valid (intermediate state, will be filled during processing)
    pub fn validate(&self) -> bool {
        if self.events.is_empty() {
            return true; // Empty measures are valid
        }
        let sum: usize = self.events.iter().map(|e| e.divisions()).sum();
        sum == self.divisions
    }
}

/// An event (note, rest, chord, grace note) in a measure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ExportEvent {
    /// Rest element
    Rest {
        /// Duration in beat divisions (scaled for MusicXML)
        divisions: usize,
        /// Duration as fraction of beat (semantic meaning)
        /// Example: 2/4 means "occupies 2 out of 4 subdivisions of the beat"
        fraction: Fraction,
        /// Tuplet information (if this rest is part of a tuplet)
        tuplet: Option<TupletInfo>,
    },

    /// Single note or note with grace notes/ornaments
    Note(NoteData),

    /// Chord (simultaneous notes at same position)
    Chord {
        /// Pitches in the chord (unison or multi-pitch)
        pitches: Vec<PitchInfo>,
        /// Duration in beat divisions (scaled for MusicXML)
        divisions: usize,
        /// Duration as fraction of beat (semantic meaning)
        fraction: Fraction,
        /// Lyrics attached to first note of chord
        lyrics: Option<LyricData>,
        /// Slur information
        slur: Option<SlurData>,
        /// Tuplet information (if this chord is part of a tuplet)
        tuplet: Option<TupletInfo>,
    },
}

impl ExportEvent {
    pub fn divisions(&self) -> usize {
        match self {
            ExportEvent::Rest { divisions, .. } => *divisions,
            ExportEvent::Note(note) => note.divisions,
            ExportEvent::Chord { divisions, .. } => *divisions,
        }
    }
}

/// Complete data for a note
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NoteData {
    /// The pitch of the note
    pub pitch: PitchInfo,

    /// Duration in beat divisions (scaled for MusicXML)
    pub divisions: usize,

    /// Duration as fraction of beat (semantic meaning)
    /// Example: 3/4 means "occupies 3 out of 4 subdivisions of the beat"
    pub fraction: Fraction,

    /// Grace notes before this note
    pub grace_notes_before: Vec<GraceNoteData>,

    /// Grace notes after this note (trailing ornaments)
    pub grace_notes_after: Vec<GraceNoteData>,

    /// Lyrics attached to this note
    pub lyrics: Option<LyricData>,

    /// Slur information
    pub slur: Option<SlurData>,

    /// Articulations (staccato, accent, etc.)
    pub articulations: Vec<ArticulationType>,

    /// Beam grouping information
    pub beam: Option<BeamData>,

    /// Tie information (tie start, continue, stop)
    pub tie: Option<TieData>,

    /// Tuplet information (time-modification in MusicXML)
    pub tuplet: Option<TupletInfo>,

    /// Whether this note has a breath mark after it
    /// This prevents cross-beat tie creation (e.g., `1' -` should not tie)
    #[serde(default)]
    pub breath_mark_after: bool,
}

/// Pitch information
#[derive(Debug, Clone, Copy, Eq, PartialEq, Serialize, Deserialize)]
pub struct PitchInfo {
    /// Normalized pitch code (degree + accidental)
    pub pitch_code: PitchCode,
    /// Octave offset
    pub octave: i8,
    /// Western pitch spelling (transposed based on tonic)
    pub western_pitch: crate::models::WesternPitch,
    /// Tonic used for transposition (defaults to C)
    pub tonic: crate::models::Tonic,
}

impl PitchInfo {
    pub fn new(pitch_code: PitchCode, octave: i8) -> Self {
        // Default to C major (no transposition)
        PitchInfo {
            pitch_code,
            octave,
            western_pitch: Self::default_western_pitch(pitch_code),
            tonic: crate::models::Tonic::C,
        }
    }

    /// Create PitchInfo with explicit tonic (computes western_pitch via transposition)
    pub fn with_tonic(pitch_code: PitchCode, octave: i8, tonic: crate::models::Tonic) -> Self {
        use crate::transposition::to_western_pitch;
        let western_pitch = to_western_pitch(pitch_code, tonic);
        PitchInfo {
            pitch_code,
            octave,
            western_pitch,
            tonic,
        }
    }

    /// Get the default Western pitch for a PitchCode in C major
    fn default_western_pitch(pitch_code: PitchCode) -> crate::models::WesternPitch {
        use crate::models::WesternPitch;
        use crate::models::pitch_code::PitchCode::*;

        match pitch_code {
            N1 => WesternPitch::C,
            N1s => WesternPitch::Cs,
            N1b => WesternPitch::Cb,
            N1ss => WesternPitch::Css,
            N1bb => WesternPitch::Cbb,
            N1hf => WesternPitch::Chf,

            N2 => WesternPitch::D,
            N2s => WesternPitch::Ds,
            N2b => WesternPitch::Db,
            N2ss => WesternPitch::Dss,
            N2bb => WesternPitch::Dbb,
            N2hf => WesternPitch::Dhf,

            N3 => WesternPitch::E,
            N3s => WesternPitch::Es,
            N3b => WesternPitch::Eb,
            N3ss => WesternPitch::Ess,
            N3bb => WesternPitch::Ebb,
            N3hf => WesternPitch::Ehf,

            N4 => WesternPitch::F,
            N4s => WesternPitch::Fs,
            N4b => WesternPitch::Fb,
            N4ss => WesternPitch::Fss,
            N4bb => WesternPitch::Fbb,
            N4hf => WesternPitch::Fhf,

            N5 => WesternPitch::G,
            N5s => WesternPitch::Gs,
            N5b => WesternPitch::Gb,
            N5ss => WesternPitch::Gss,
            N5bb => WesternPitch::Gbb,
            N5hf => WesternPitch::Ghf,

            N6 => WesternPitch::A,
            N6s => WesternPitch::As,
            N6b => WesternPitch::Ab,
            N6ss => WesternPitch::Ass,
            N6bb => WesternPitch::Abb,
            N6hf => WesternPitch::Ahf,

            N7 => WesternPitch::B,
            N7s => WesternPitch::Bs,
            N7b => WesternPitch::Bb,
            N7ss => WesternPitch::Bss,
            N7bb => WesternPitch::Bbb,
            N7hf => WesternPitch::Bhf,
        }
    }
}

/// Grace note (ornament) data
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraceNoteData {
    pub pitch: PitchInfo,
    pub position: OrnamentPositionType,
    /// Grace notes steal time from main note (slash notation)
    pub slash: bool,
}

/// Lyric data
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LyricData {
    /// The syllable text
    pub syllable: String,

    /// Syllabic type: begin, middle, end, single
    pub syllabic: Syllabic,

    /// Lyric number (for multiple verses)
    pub number: u32,
}

/// Syllabic type for lyrics
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Syllabic {
    Single,
    Begin,
    Middle,
    End,
}

/// Slur information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SlurData {
    pub placement: SlurPlacement,
    pub type_: SlurType,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum SlurPlacement {
    Above,
    Below,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum SlurType {
    Start,
    Continue,
    Stop,
}

/// Beam grouping data
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BeamData {
    pub state: BeamState,
    pub number: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum BeamState {
    Begin,
    Continue,
    End,
    Single,
}

/// Tie information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TieData {
    pub type_: TieType,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum TieType {
    Start,
    Continue,
    Stop,
}

/// Tuplet information (time-modification in MusicXML)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct TupletInfo {
    /// Actual notes in the tuplet (numerator, e.g., 3 for triplet)
    pub actual_notes: usize,
    /// Normal notes (denominator, e.g., 2 for triplet)
    pub normal_notes: usize,
    /// Whether this is the first note in the tuplet (bracket start)
    pub bracket_start: bool,
    /// Whether this is the last note in the tuplet (bracket stop)
    pub bracket_stop: bool,
}

/// Articulation types
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ArticulationType {
    Staccato,
    Accent,
    StrongAccent,
    Tenuto,
    Marcato,
    SoftAccent,
    Scoop,
    Plop,
    Doit,
    Falloff,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_measure_creation() {
        let measure = ExportMeasure::new(4);
        assert_eq!(measure.divisions, 4);
        assert_eq!(measure.events.len(), 0);
    }

    #[test]
    fn test_measure_validation_empty() {
        let measure = ExportMeasure::new(4);
        assert!(measure.validate()); // Empty measure is valid
    }

    #[test]
    fn test_event_divisions() {
        let rest = ExportEvent::Rest {
            divisions: 2,
            fraction: Fraction { numerator: 1, denominator: 2 },
            tuplet: None
        };
        assert_eq!(rest.divisions(), 2);
    }

    #[test]
    fn test_pitch_info() {
        let pitch = PitchInfo::new(PitchCode::N1, 4);
        assert_eq!(pitch.pitch_code, PitchCode::N1);
        assert_eq!(pitch.octave, 4);
    }

    #[test]
    fn test_line_creation() {
        let line = ExportLine::new(
            1,
            "P1".to_string(),
            crate::models::core::StaffRole::Melody,
            Some("G major".to_string()),
            Some("4/4".to_string()),
            "treble".to_string(),
            String::new(),
            String::new(),
        );
        assert_eq!(line.system_id, 1);
        assert_eq!(line.part_id, "P1");
        assert_eq!(line.key_signature, Some("G major".to_string()));
        assert_eq!(line.clef, "treble");
        assert_eq!(line.measures.len(), 0);
    }
}
