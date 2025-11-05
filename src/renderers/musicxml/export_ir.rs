//! Intermediate Representation layer for MusicXML export
//!
//! This module defines the IR types that bridge from the Document model (Cell-based)
//! to the XML emitter. The IR is produced by the FSM and consumed by the emitter.
//!
//! # Design Principles
//!
//! 1. **Stay faithful to Document model**: Only include what exists in Document/Line/Cell
//! 2. **No invented abstractions**: No "Part" type (Line IS the part); no clef/key per measure
//! 3. **Line-level metadata**: clef, key_signature, time_signature stay at line level
//! 4. **Measure-level only**: divisions (beat subdivision, varies due to LCM)
//!
//! # Three-Layer Architecture
//!
//! ```text
//! Document Model        Export IR          XML Emitter
//! (existing)            (NEW)              (NEW)
//!
//! Document              Vec<ExportLine>    MusicXML String
//! ├── Line              ├── ExportLine
//! │   ├── cells         │   ├── key_sig
//! │   ├── lyrics        │   ├── time_sig
//! │   └── key_sig       │   ├── clef
//! │                     │   └── measures
//! └── (metadata)        │       └── Vec<ExportMeasure>
//!                       │           ├── divisions
//!                       │           └── events
//!                       │               └── Vec<ExportEvent>
//! ```

use crate::models::{PitchCode, OrnamentPositionType};
use serde::{Serialize, Deserialize};

/// Intermediate representation of a line (staff/part) for MusicXML export
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportLine {
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

    /// Measures in this line
    pub measures: Vec<ExportMeasure>,

    /// Lyrics string to be parsed into syllables during emission
    /// TODO: Should be parsed into Vec<LyricSyllable> during IR construction
    pub lyrics: String,
}

impl ExportLine {
    pub fn new(
        key_signature: Option<String>,
        time_signature: Option<String>,
        clef: String,
        label: String,
        lyrics: String,
    ) -> Self {
        ExportLine {
            key_signature,
            time_signature,
            clef,
            label,
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
    pub fn validate(&self) -> bool {
        let sum: usize = self.events.iter().map(|e| e.divisions()).sum();
        sum == self.divisions
    }
}

/// An event (note, rest, chord, grace note) in a measure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ExportEvent {
    /// Rest element
    Rest {
        /// Duration in beat divisions
        divisions: usize,
    },

    /// Single note or note with grace notes/ornaments
    Note(NoteData),

    /// Chord (simultaneous notes at same position)
    Chord {
        /// Pitches in the chord (unison or multi-pitch)
        pitches: Vec<PitchInfo>,
        /// Duration in beat divisions
        divisions: usize,
        /// Lyrics attached to first note of chord
        lyrics: Option<LyricData>,
        /// Slur information
        slur: Option<SlurData>,
    },
}

impl ExportEvent {
    pub fn divisions(&self) -> usize {
        match self {
            ExportEvent::Rest { divisions } => *divisions,
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

    /// Duration in beat divisions
    pub divisions: usize,

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
}

/// Pitch information
#[derive(Debug, Clone, Copy, Eq, PartialEq, Serialize, Deserialize)]
pub struct PitchInfo {
    pub pitch_code: PitchCode,
    pub octave: i8,
}

impl PitchInfo {
    pub fn new(pitch_code: PitchCode, octave: i8) -> Self {
        PitchInfo { pitch_code, octave }
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
        let rest = ExportEvent::Rest { divisions: 2 };
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
            Some("G major".to_string()),
            Some("4/4".to_string()),
            "treble".to_string(),
            String::new(),
            String::new(),
        );
        assert_eq!(line.key_signature, Some("G major".to_string()));
        assert_eq!(line.clef, "treble");
        assert_eq!(line.measures.len(), 0);
    }
}
