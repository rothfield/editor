//! Element types and enumerations for musical notation
//!
//! This module defines the core enums and types used throughout
//! the Cell-based musical notation system.

use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

/// Enumeration of all possible musical element types that can be represented in a Cell
#[wasm_bindgen]
#[repr(u8)]
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
pub enum ElementKind {
    /// Unknown or uninitialized element type
    Unknown = 0,

    /// Musical notes with definite pitch (S, r, C#, 2b, etc.)
    PitchedElement = 1,

    /// Non-pitched musical elements (dashes, breath marks, barlines, spaces)
    UnpitchedElement = 2,

    /// Annotations appearing above the main line (ornaments, dynamics, octave dots)
    UpperAnnotation = 3,

    /// Annotations appearing below the main line (fingerings, lower octave dots)
    LowerAnnotation = 4,

    /// Text elements that cannot be parsed as musical notation
    Text = 5,

    /// Barline elements for beat separation
    Barline = 6,

    /// Breath mark elements
    BreathMark = 7,

    /// Whitespace elements for layout
    Whitespace = 8,
}

impl ElementKind {
    /// Determine if this element type is temporal (affects musical timing)
    pub fn is_temporal(&self) -> bool {
        matches!(self, ElementKind::PitchedElement | ElementKind::UnpitchedElement)
    }

    /// Determine if this element type can be selected
    pub fn is_selectable(&self) -> bool {
        !matches!(self, ElementKind::Whitespace)
    }

    /// Check if this element can have slurs applied
    pub fn can_have_slur(&self) -> bool {
        matches!(self, ElementKind::PitchedElement)
    }

    /// Check if this element can have octaves applied
    pub fn can_have_octave(&self) -> bool {
        matches!(self, ElementKind::PitchedElement)
    }

    /// Get a human-readable name for this element type
    pub fn name(&self) -> &'static str {
        match self {
            ElementKind::Unknown => "Unknown",
            ElementKind::PitchedElement => "Pitched Element",
            ElementKind::UnpitchedElement => "Unpitched Element",
            ElementKind::UpperAnnotation => "Upper Annotation",
            ElementKind::LowerAnnotation => "Lower Annotation",
            ElementKind::Text => "Text",
            ElementKind::Barline => "Barline",
            ElementKind::BreathMark => "Breath Mark",
            ElementKind::Whitespace => "Whitespace",
        }
    }
}

impl Default for ElementKind {
    fn default() -> Self {
        ElementKind::Unknown
    }
}

/// Enumeration defining the vertical positioning lanes for Cell elements
#[wasm_bindgen]
#[repr(u8)]
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum LaneKind {
    /// Upper annotations and ornaments (above the main line)
    Upper = 0,

    /// Main musical notation line (primary content)
    Letter = 1,

    /// Lower annotations and marks (below the main line)
    Lower = 2,

    /// Lyrics and text below the notation
    Lyrics = 3,
}

impl LaneKind {
    /// Get the vertical offset for this lane relative to the baseline
    pub fn vertical_offset(&self, font_size: f32) -> f32 {
        match self {
            LaneKind::Upper => -font_size * 0.8,
            LaneKind::Letter => 0.0,
            LaneKind::Lower => font_size * 0.4,
            LaneKind::Lyrics => font_size * 1.2,
        }
    }

    /// Get the baseline position for this lane
    pub fn baseline(&self, base_y: f32, font_size: f32) -> f32 {
        base_y + self.vertical_offset(font_size)
    }

    /// Get a human-readable name for this lane
    pub fn name(&self) -> &'static str {
        match self {
            LaneKind::Upper => "Upper",
            LaneKind::Letter => "Letter",
            LaneKind::Lower => "Lower",
            LaneKind::Lyrics => "Lyrics",
        }
    }

    /// Get CSS class name for this lane
    pub fn css_class(&self) -> &'static str {
        match self {
            LaneKind::Upper => "lane-upper",
            LaneKind::Letter => "lane-letter",
            LaneKind::Lower => "lane-lower",
            LaneKind::Lyrics => "lane-lyrics",
        }
    }
}

impl Default for LaneKind {
    fn default() -> Self {
        LaneKind::Letter
    }
}

impl TryFrom<u8> for LaneKind {
    type Error = &'static str;

    fn try_from(value: u8) -> Result<Self, Self::Error> {
        match value {
            0 => Ok(LaneKind::Upper),
            1 => Ok(LaneKind::Letter),
            2 => Ok(LaneKind::Lower),
            3 => Ok(LaneKind::Lyrics),
            _ => Err("Invalid lane value"),
        }
    }
}

/// Enumeration of supported pitch systems for musical notation
#[wasm_bindgen]
#[repr(u8)]
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum PitchSystem {
    /// Unknown pitch system
    Unknown = 0,

    /// Number system (1, 2, 3, 4, 5, 6, 7) - default system
    Number = 1,

    /// Western system (c, d, e, f, g, a, b or C, D, E, F, G, A, B)
    Western = 2,

    /// Sargam system (S, r, R, g, G, m, M, P, d, D, n, N)
    Sargam = 3,

    /// Bhatkhande system (Indian classical notation)
    Bhatkhande = 4,

    /// Tabla notation system
    Tabla = 5,
}

impl PitchSystem {
    /// Get the default pitch system
    pub fn default() -> Self {
        PitchSystem::Number
    }

    /// Check if this system uses accidentals
    pub fn supports_accidentals(&self) -> bool {
        matches!(self, PitchSystem::Number | PitchSystem::Western)
    }

    /// Check if this system uses case sensitivity
    pub fn is_case_sensitive(&self) -> bool {
        matches!(self, PitchSystem::Western | PitchSystem::Sargam | PitchSystem::Bhatkhande)
    }

    /// Get the pitch sequence for this system
    pub fn pitch_sequence(&self) -> Vec<&'static str> {
        match self {
            PitchSystem::Number => vec!["1", "2", "3", "4", "5", "6", "7"],
            PitchSystem::Western => vec!["c", "d", "e", "f", "g", "a", "b"],
            PitchSystem::Sargam => vec!["S", "R", "G", "M", "P", "D", "N"],
            PitchSystem::Bhatkhande => vec!["S", "R", "G", "M", "P", "D", "N"],
            PitchSystem::Tabla => vec!["dha", "dhin", "na", "tin", "ta", "ke", "te"],
            PitchSystem::Unknown => vec![],
        }
    }

    /// Get a human-readable name for this pitch system
    pub fn name(&self) -> &'static str {
        match self {
            PitchSystem::Unknown => "Unknown",
            PitchSystem::Number => "Number",
            PitchSystem::Western => "Western",
            PitchSystem::Sargam => "Sargam",
            PitchSystem::Bhatkhande => "Bhatkhande",
            PitchSystem::Tabla => "Tabla",
        }
    }

    /// Get CSS class name for this pitch system
    pub fn css_class(&self) -> &'static str {
        match self {
            PitchSystem::Unknown => "pitch-system-unknown",
            PitchSystem::Number => "pitch-system-number",
            PitchSystem::Western => "pitch-system-western",
            PitchSystem::Sargam => "pitch-system-sargam",
            PitchSystem::Bhatkhande => "pitch-system-bhatkhande",
            PitchSystem::Tabla => "pitch-system-tabla",
        }
    }

    /// Validate if a pitch string is valid for this system
    pub fn validate_pitch(&self, pitch: &str) -> bool {
        if pitch.is_empty() {
            return false;
        }

        let sequence = self.pitch_sequence();
        if sequence.is_empty() {
            return false;
        }

        // Remove accidentals for validation
        let base_pitch = pitch.trim_end_matches('#').trim_end_matches('b');

        // Check case sensitivity
        let base_pitch = if self.is_case_sensitive() {
            base_pitch
        } else {
            &base_pitch.to_lowercase()
        };

        sequence.contains(&base_pitch)
    }
}

impl Default for PitchSystem {
    fn default() -> Self {
        PitchSystem::Number
    }
}

/// Accidental types for pitch modification
#[wasm_bindgen]
#[repr(u8)]
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub enum Accidental {
    /// No accidental
    Natural = 0,

    /// Sharp (#)
    Sharp = 1,

    /// Double sharp (##)
    DoubleSharp = 2,

    /// Flat (b)
    Flat = 3,

    /// Double flat (bb)
    DoubleFlat = 4,
}

impl Accidental {
    /// Get the symbol for this accidental
    pub fn symbol(&self) -> &'static str {
        match self {
            Accidental::Natural => "",
            Accidental::Sharp => "#",
            Accidental::DoubleSharp => "##",
            Accidental::Flat => "b",
            Accidental::DoubleFlat => "bb",
        }
    }

    /// Get the semitone offset for this accidental
    pub fn semitone_offset(&self) -> i8 {
        match self {
            Accidental::Natural => 0,
            Accidental::Sharp => 1,
            Accidental::DoubleSharp => 2,
            Accidental::Flat => -1,
            Accidental::DoubleFlat => -2,
        }
    }

    /// Parse accidental from a string
    pub fn parse(text: &str) -> Option<Self> {
        match text {
            "##" => Some(Accidental::DoubleSharp),
            "#" => Some(Accidental::Sharp),
            "bb" => Some(Accidental::DoubleFlat),
            "b" => Some(Accidental::Flat),
            "" | "♮" => Some(Accidental::Natural),
            _ => None,
        }
    }

    /// Apply accidental to a pitch string
    pub fn apply_to_pitch(&self, pitch: &str) -> String {
        format!("{}{}", pitch, self.symbol())
    }
}

impl Default for Accidental {
    fn default() -> Self {
        Accidental::Natural
    }
}

/// Octave display settings
#[wasm_bindgen]
#[repr(i8)]
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub enum OctaveDisplay {
    /// No octave display
    None = 0,

    /// Octave +1 (bullet above)
    Above = 1,

    /// Octave -1 (bullet below)
    Below = -1,
}

impl OctaveDisplay {
    /// Get the vertical position for this octave display
    pub fn vertical_offset(&self, font_size: f32) -> f32 {
        match self {
            OctaveDisplay::None => 0.0,
            OctaveDisplay::Above => -font_size * 0.5,
            OctaveDisplay::Below => font_size * 0.3,
        }
    }

    /// Get CSS class for this octave display
    pub fn css_class(&self) -> &'static str {
        match self {
            OctaveDisplay::None => "octave-none",
            OctaveDisplay::Above => "octave-above",
            OctaveDisplay::Below => "octave-below",
        }
    }

    /// Toggle octave display
    pub fn toggle(&mut self) {
        *self = match self {
            OctaveDisplay::None => OctaveDisplay::Above,
            OctaveDisplay::Above => OctaveDisplay::None,
            OctaveDisplay::Below => OctaveDisplay::None,
        };
    }
}

impl Default for OctaveDisplay {
    fn default() -> Self {
        OctaveDisplay::None
    }
}

/// Slur indicator for cells that start or end a slur
#[wasm_bindgen]
#[repr(u8)]
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
pub enum SlurIndicator {
    /// No slur indicator
    None = 0,

    /// This cell starts a slur
    SlurStart = 1,

    /// This cell ends a slur
    SlurEnd = 2,
}

impl SlurIndicator {
    /// Get the human-readable name for this slur indicator
    pub fn name(&self) -> &'static str {
        match self {
            SlurIndicator::None => "None",
            SlurIndicator::SlurStart => "Slur Start",
            SlurIndicator::SlurEnd => "Slur End",
        }
    }

    /// Get CSS class name for this slur indicator
    pub fn css_class(&self) -> &'static str {
        match self {
            SlurIndicator::None => "slur-none",
            SlurIndicator::SlurStart => "slur-start",
            SlurIndicator::SlurEnd => "slur-end",
        }
    }

    /// Check if this is a slur start
    pub fn is_start(&self) -> bool {
        matches!(self, SlurIndicator::SlurStart)
    }

    /// Check if this is a slur end
    pub fn is_end(&self) -> bool {
        matches!(self, SlurIndicator::SlurEnd)
    }

    /// Check if this cell has any slur indicator
    pub fn has_slur(&self) -> bool {
        !matches!(self, SlurIndicator::None)
    }
}

impl Default for SlurIndicator {
    fn default() -> Self {
        SlurIndicator::None
    }
}

/// Text token properties for non-musical text
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct TextToken {
    /// The text content
    pub text: String,

    /// Whether this is a fallback (unknown notation) or intentional text
    pub is_fallback: bool,

    /// Text styling properties
    pub style: TextStyle,
}

#[wasm_bindgen]
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
pub struct TextStyle {
    /// Font weight
    pub weight: FontWeight,

    /// Font style
    pub style: FontStyle,

    /// Text decoration
    pub decoration: TextDecoration,
}

#[wasm_bindgen]
#[repr(u8)]
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
pub enum FontWeight {
    Normal = 0,
    Bold = 1,
    Light = 2,
}

#[wasm_bindgen]
#[repr(u8)]
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
pub enum FontStyle {
    Normal = 0,
    Italic = 1,
    Oblique = 2,
}

#[wasm_bindgen]
#[repr(u8)]
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
pub enum TextDecoration {
    None = 0,
    Underline = 1,
    Overline = 2,
    LineThrough = 3,
}

impl Default for TextToken {
    fn default() -> Self {
        Self {
            text: String::new(),
            is_fallback: false,
            style: TextStyle::default(),
        }
    }
}

impl Default for TextStyle {
    fn default() -> Self {
        Self {
            weight: FontWeight::Normal,
            style: FontStyle::Normal,
            decoration: TextDecoration::None,
        }
    }
}

impl Default for FontWeight {
    fn default() -> Self {
        FontWeight::Normal
    }
}

impl Default for FontStyle {
    fn default() -> Self {
        FontStyle::Normal
    }
}

impl Default for TextDecoration {
    fn default() -> Self {
        TextDecoration::None
    }
}