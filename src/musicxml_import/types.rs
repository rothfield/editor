//! Type definitions for MusicXML conversion
//!
//! This module defines all the types used in the conversion pipeline:
//! - Public API types (ConversionResult, ConversionSettings, etc.)
//! - Internal music representation (Music enum, NoteEvent, etc.)
//! - Musical attribute types (Pitch, Duration, KeySignature, etc.)

use num_rational::Rational32;
use serde::{Deserialize, Serialize};

/// Re-export Rational for duration calculations
pub type Rational = Rational32;

// ============================================================================
// PUBLIC API TYPES (T010)
// ============================================================================

/// Result of MusicXML to LilyPond conversion
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConversionResult {
    /// Generated LilyPond source code (always valid, may be incomplete)
    pub lilypond_source: String,

    /// List of elements that couldn't be converted
    pub skipped_elements: Vec<SkippedElement>,
}

/// Information about a skipped/unsupported element
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SkippedElement {
    /// MusicXML element tag name (e.g., "figured-bass")
    pub element_type: String,

    /// Measure number where element appears (if in measure context)
    pub measure_number: Option<u32>,

    /// Part ID where element appears (if in part context)
    pub part_id: Option<String>,

    /// Human-readable explanation of why skipped
    pub reason: String,
}

/// Configuration options for conversion
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConversionSettings {
    /// Target LilyPond version (e.g., "2.24.0")
    pub target_lilypond_version: String,

    /// Note name language
    pub language: PitchLanguage,

    /// Whether to convert direction elements (dynamics, tempo, etc.)
    pub convert_directions: bool,

    /// Whether to convert lyrics
    pub convert_lyrics: bool,

    /// Whether to convert chord symbols
    pub convert_chord_symbols: bool,
}

impl Default for ConversionSettings {
    fn default() -> Self {
        Self {
            target_lilypond_version: "2.24.0".to_string(),
            language: PitchLanguage::Nederlands,
            convert_directions: true,
            convert_lyrics: true,
            convert_chord_symbols: true,
        }
    }
}

/// Note naming language for LilyPond output
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum PitchLanguage {
    /// Dutch: c d e f g a b (cis/ees for sharps/flats) - LilyPond default
    Nederlands,

    /// English: c d e f g a b (cs/ef for sharps/flats)
    English,

    /// German: c d e f g a h (cis/es for sharps/flats)
    Deutsch,

    /// Italian: do re mi fa sol la si (dod/mib for sharps/flats)
    Italiano,
}

// ============================================================================
// PITCH AND DURATION (T012, T013)
// ============================================================================

/// Musical pitch representation
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Pitch {
    /// Scale degree (0=C, 1=D, 2=E, 3=F, 4=G, 5=A, 6=B)
    pub step: u8,

    /// Accidental (-2=double flat, -1=flat, 0=natural, +1=sharp, +2=double sharp)
    pub alteration: i8,

    /// Octave number (4 = middle C octave)
    pub octave: i8,
}

impl Pitch {
    /// Create a new pitch with validation
    pub fn new(step: u8, alteration: i8, octave: i8) -> Result<Self, String> {
        if step > 6 {
            return Err(format!("Invalid step: {} (must be 0-6)", step));
        }
        if alteration < -2 || alteration > 2 {
            return Err(format!(
                "Invalid alteration: {} (must be -2 to +2)",
                alteration
            ));
        }
        if octave < -1 || octave > 9 {
            return Err(format!("Invalid octave: {} (must be -1 to 9)", octave));
        }
        Ok(Self {
            step,
            alteration,
            octave,
        })
    }

    /// Convert pitch to LilyPond notation in specified language
    pub fn to_lilypond_string(&self, language: PitchLanguage) -> String {
        let note_name = self.get_note_name(language);
        let octave_marks = self.get_octave_marks();
        format!("{}{}", note_name, octave_marks)
    }

    fn get_note_name(&self, language: PitchLanguage) -> String {
        match language {
            PitchLanguage::Nederlands => self.note_name_nederlands(),
            PitchLanguage::English => self.note_name_english(),
            PitchLanguage::Deutsch => self.note_name_deutsch(),
            PitchLanguage::Italiano => self.note_name_italiano(),
        }
    }

    fn note_name_nederlands(&self) -> String {
        let base = ["c", "d", "e", "f", "g", "a", "b"][self.step as usize];
        match self.alteration {
            -2 => format!("{}eses", base),
            -1 => format!("{}es", base),
            0 => base.to_string(),
            1 => format!("{}is", base),
            2 => format!("{}isis", base),
            _ => base.to_string(),
        }
    }

    fn note_name_english(&self) -> String {
        let base = ["c", "d", "e", "f", "g", "a", "b"][self.step as usize];
        match self.alteration {
            -2 => format!("{}ff", base),
            -1 => format!("{}f", base),
            0 => base.to_string(),
            1 => format!("{}s", base),
            2 => format!("{}ss", base),
            _ => base.to_string(),
        }
    }

    fn note_name_deutsch(&self) -> String {
        let base = ["c", "d", "e", "f", "g", "a", "h"][self.step as usize];
        match self.alteration {
            -2 => format!("{}eses", base),
            -1 => format!("{}es", base),
            0 => base.to_string(),
            1 => format!("{}is", base),
            2 => format!("{}isis", base),
            _ => base.to_string(),
        }
    }

    fn note_name_italiano(&self) -> String {
        let base = ["do", "re", "mi", "fa", "sol", "la", "si"][self.step as usize];
        match self.alteration {
            -2 => format!("{}bb", base),
            -1 => format!("{}b", base),
            0 => base.to_string(),
            1 => format!("{}d", base),
            2 => format!("{}dd", base),
            _ => base.to_string(),
        }
    }

    fn get_octave_marks(&self) -> String {
        // LilyPond: c''' is octave 6, c'' is octave 5, c' is octave 4 (middle C),
        // c is octave 3, c, is octave 2, c,, is octave 1
        if self.octave >= 4 {
            "'".repeat((self.octave - 3) as usize)
        } else {
            ",".repeat((3 - self.octave) as usize)
        }
    }
}

/// Musical duration representation
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Duration {
    /// Logarithmic duration (0=whole, 1=half, 2=quarter, 3=eighth, ...)
    pub log: u8,

    /// Number of augmentation dots (0-3)
    pub dots: u8,

    /// Scaling factor for tuplets (e.g., 2/3 for triplet)
    pub factor: Option<Rational>,
}

impl Duration {
    /// Create a new duration
    pub fn new(log: u8, dots: u8, factor: Option<Rational>) -> Self {
        Self { log, dots, factor }
    }

    /// Convert duration to LilyPond notation (e.g., "4", "8.", "16*2/3")
    pub fn to_lilypond_string(&self) -> String {
        let base = if self.log == 0 {
            "1".to_string()
        } else {
            format!("{}", 1 << self.log)
        };

        let dots = ".".repeat(self.dots as usize);

        let factor_str = if let Some(f) = &self.factor {
            if *f != Rational::new(1, 1) {
                format!("*{}/{}", f.numer(), f.denom())
            } else {
                String::new()
            }
        } else {
            String::new()
        };

        format!("{}{}{}", base, dots, factor_str)
    }

    /// Calculate duration from MusicXML divisions
    pub fn from_musicxml(
        divisions: u32,
        duration_value: u32,
        dots: u8,
    ) -> Result<Self, String> {
        // Calculate duration as fraction of whole note
        let fraction = Rational::new(duration_value as i32, (divisions * 4) as i32);

        // Calculate base duration (ignoring dots)
        let base_fraction = if dots > 0 {
            // Remove dot factor: dotted note = base * (2 - 1/2^dots)
            // So base = dotted / (2 - 1/2^dots)
            let dot_multiplier = Rational::new(
                (1 << (dots + 1)) - 1,
                1 << dots
            );
            fraction / dot_multiplier
        } else {
            fraction
        };

        // Find logarithmic value (whole=0, half=1, quarter=2, ...)
        // base_fraction should be 1/2^log
        let log = if base_fraction == Rational::new(1, 1) {
            0
        } else if *base_fraction.denom() > 0 && (*base_fraction.denom() as u32).is_power_of_two() && *base_fraction.numer() == 1 {
            (*base_fraction.denom() as u32).trailing_zeros() as u8
        } else {
            return Err(format!("Cannot represent duration {} as power of 2", base_fraction));
        };

        Ok(Self {
            log,
            dots,
            factor: None,
        })
    }
}

// ============================================================================
// MUSIC ENUM AND EVENT TYPES (T014, T015, T016, T017)
// ============================================================================

/// Core music representation enum
#[derive(Debug, Clone)]
pub enum Music {
    /// Single note
    Note(NoteEvent),

    /// Rest
    Rest(RestEvent),

    /// Chord (simultaneous notes)
    Chord(ChordEvent),

    /// Sequential music block { a b c }
    Sequential(SequentialMusic),

    /// Simultaneous music block << ... >>
    Simultaneous(SimultaneousMusic),

    /// Tuplet (triplet, quintuplet, etc.)
    Tuplet(TupletMusic),

    /// Voice container
    Voice(VoiceMusic),

    /// Key signature change
    KeyChange(KeySignature),

    /// Time signature change
    TimeChange(TimeSignature),

    /// Clef change
    ClefChange(Clef),

    /// Dynamic marking (p, f, mf, etc.)
    Dynamic(DynamicMark),

    /// Articulation marking
    Articulation(ArticulationMark),

    /// Tempo marking
    Tempo(TempoMark),

    /// Text annotation
    Text(TextMark),
}

/// Single note event (T015)
#[derive(Debug, Clone)]
pub struct NoteEvent {
    pub pitch: Pitch,
    pub duration: Duration,
    pub tie: Option<Tie>,
    pub articulations: Vec<ArticulationMark>,
    pub dynamics: Option<DynamicMark>,
    pub is_grace: bool,
    pub grace_slash: bool,
}

impl NoteEvent {
    pub fn new(pitch: Pitch, duration: Duration) -> Self {
        Self {
            pitch,
            duration,
            tie: None,
            articulations: Vec::new(),
            dynamics: None,
            is_grace: false,
            grace_slash: false,
        }
    }
}

/// Tie information
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Tie {
    Start,
    Stop,
    Continue,
}

/// Rest event (T015)
#[derive(Debug, Clone)]
pub struct RestEvent {
    pub duration: Duration,
    pub is_multi_measure: bool,
}

impl RestEvent {
    pub fn new(duration: Duration) -> Self {
        Self {
            duration,
            is_multi_measure: false,
        }
    }
}

/// Chord event - simultaneous notes (T016)
#[derive(Debug, Clone)]
pub struct ChordEvent {
    pub notes: Vec<Pitch>,
    pub duration: Duration,
    pub articulations: Vec<ArticulationMark>,
}

impl ChordEvent {
    pub fn new(notes: Vec<Pitch>, duration: Duration) -> Result<Self, String> {
        if notes.len() < 2 {
            return Err("Chord must have at least 2 notes".to_string());
        }
        Ok(Self {
            notes,
            duration,
            articulations: Vec::new(),
        })
    }
}

/// Tuplet music (T016)
#[derive(Debug, Clone)]
pub struct TupletMusic {
    /// (normal_notes, actual_notes) e.g., (2, 3) for triplet
    pub ratio: (u32, u32),
    pub contents: Vec<Music>,
}

impl TupletMusic {
    pub fn new(normal_notes: u32, actual_notes: u32, contents: Vec<Music>) -> Result<Self, String> {
        if normal_notes == 0 || actual_notes == 0 {
            return Err("Tuplet ratio must be non-zero".to_string());
        }
        if normal_notes == actual_notes {
            return Err("Tuplet ratio cannot be 1:1".to_string());
        }
        Ok(Self {
            ratio: (normal_notes, actual_notes),
            contents,
        })
    }
}

/// Sequential music container (T017)
#[derive(Debug, Clone)]
pub struct SequentialMusic {
    pub elements: Vec<Music>,
}

impl SequentialMusic {
    pub fn new(elements: Vec<Music>) -> Self {
        Self { elements }
    }
}

/// Simultaneous music container (T017)
#[derive(Debug, Clone)]
pub struct SimultaneousMusic {
    pub elements: Vec<Music>,
}

impl SimultaneousMusic {
    pub fn new(elements: Vec<Music>) -> Self {
        Self { elements }
    }
}

/// Voice container
#[derive(Debug, Clone)]
pub struct VoiceMusic {
    pub voice_id: Option<String>,
    pub elements: Vec<Music>,
}

impl VoiceMusic {
    pub fn new(voice_id: Option<String>, elements: Vec<Music>) -> Self {
        Self { voice_id, elements }
    }
}

// ============================================================================
// ATTRIBUTE CHANGE TYPES (T018)
// ============================================================================

/// Key signature change
#[derive(Debug, Clone, Copy)]
pub struct KeySignature {
    /// Position on circle of fifths (-7 to +7, flats to sharps)
    pub fifths: i8,
    pub mode: Mode,
}

impl KeySignature {
    pub fn new(fifths: i8, mode: Mode) -> Result<Self, String> {
        if fifths < -7 || fifths > 7 {
            return Err(format!("Invalid fifths: {} (must be -7 to +7)", fifths));
        }
        Ok(Self { fifths, mode })
    }
}

/// Musical mode
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Mode {
    Major,
    Minor,
    Dorian,
    Phrygian,
    Lydian,
    Mixolydian,
    Aeolian,
    Locrian,
}

/// Time signature change
#[derive(Debug, Clone, Copy)]
pub struct TimeSignature {
    /// Number of beats per measure
    pub beats: u8,
    /// Beat unit (2, 4, 8, 16, etc.)
    pub beat_type: u8,
}

impl TimeSignature {
    pub fn new(beats: u8, beat_type: u8) -> Result<Self, String> {
        if beats == 0 {
            return Err("Beats must be greater than 0".to_string());
        }
        if !beat_type.is_power_of_two() {
            return Err(format!("Beat type must be power of 2, got {}", beat_type));
        }
        Ok(Self { beats, beat_type })
    }
}

/// Clef change
#[derive(Debug, Clone, Copy)]
pub struct Clef {
    pub clef_type: ClefType,
}

/// Clef types
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ClefType {
    Treble,
    Bass,
    Alto,
    Tenor,
    Soprano,
    MezzoSoprano,
    Baritone,
    Percussion,
}

// ============================================================================
// MARKING TYPES (T019)
// ============================================================================

/// Dynamic marking
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct DynamicMark {
    pub dynamic_type: DynamicType,
}

/// Dynamic types
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DynamicType {
    PPP,
    PP,
    P,
    MP,
    MF,
    F,
    FF,
    FFF,
    FP,
    SF,
    SFZ,
}

/// Articulation marking
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ArticulationMark {
    pub articulation_type: ArticulationType,
}

/// Articulation types
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ArticulationType {
    Staccato,
    Staccatissimo,
    Accent,
    Marcato,
    Tenuto,
    Portato,
}

/// Tempo marking
#[derive(Debug, Clone)]
pub struct TempoMark {
    pub text: Option<String>,
    pub bpm: Option<u16>,
    pub beat_unit: Option<Duration>,
}

impl TempoMark {
    pub fn new(
        text: Option<String>,
        bpm: Option<u16>,
        beat_unit: Option<Duration>,
    ) -> Result<Self, String> {
        if text.is_none() && bpm.is_none() {
            return Err("TempoMark must have either text or bpm".to_string());
        }
        Ok(Self {
            text,
            bpm,
            beat_unit,
        })
    }
}

/// Text annotation
#[derive(Debug, Clone)]
pub struct TextMark {
    pub text: String,
    pub placement: Placement,
}

/// Text placement
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Placement {
    Above,
    Below,
}
