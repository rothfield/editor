//! Element types and enumerations for musical notation
//!
//! This module defines the core enums and types used throughout
//! the Cell-based musical notation system.

use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

/// Enumeration of all possible musical element types that can be represented in a Cell
#[wasm_bindgen]
#[repr(u8)]
#[derive(Clone, Copy, Debug, PartialEq)]
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

    /// Single barline (|)
    SingleBarline = 6,

    /// Left repeat barline (|:)
    RepeatLeftBarline = 7,

    /// Right repeat barline (:|)
    RepeatRightBarline = 8,

    /// Double barline (||)
    DoubleBarline = 9,

    /// Breath mark elements
    BreathMark = 10,

    /// Whitespace elements for layout (beat delimiter)
    Whitespace = 11,

    /// Symbol elements (single non-alphanumeric characters: @, #, !, ?, etc.)
    Symbol = 12,

    /// Non-breaking space (beat content, used for spacing within beats)
    Nbsp = 13,
}

// Custom serialization to show both name and value
impl Serialize for ElementKind {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeStruct;
        let mut state = serializer.serialize_struct("ElementKind", 2)?;
        state.serialize_field("name", &self.snake_case_name())?;
        state.serialize_field("value", &(*self as u8))?;
        state.end()
    }
}

// Custom deserialization - accepts either number or object format
impl<'de> Deserialize<'de> for ElementKind {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        struct ElementKindVisitor;

        impl<'de> serde::de::Visitor<'de> for ElementKindVisitor {
            type Value = ElementKind;

            fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
                formatter.write_str("an ElementKind number or object")
            }

            fn visit_u64<E>(self, value: u64) -> Result<ElementKind, E>
            where
                E: serde::de::Error,
            {
                match value {
                    0 => Ok(ElementKind::Unknown),
                    1 => Ok(ElementKind::PitchedElement),
                    2 => Ok(ElementKind::UnpitchedElement),
                    3 => Ok(ElementKind::UpperAnnotation),
                    4 => Ok(ElementKind::LowerAnnotation),
                    5 => Ok(ElementKind::Text),
                    6 => Ok(ElementKind::SingleBarline),
                    7 => Ok(ElementKind::RepeatLeftBarline),
                    8 => Ok(ElementKind::RepeatRightBarline),
                    9 => Ok(ElementKind::DoubleBarline),
                    10 => Ok(ElementKind::BreathMark),
                    11 => Ok(ElementKind::Whitespace),
                    12 => Ok(ElementKind::Symbol),
                    _ => Err(E::custom(format!("invalid ElementKind value: {}", value))),
                }
            }

            fn visit_map<A>(self, mut map: A) -> Result<ElementKind, A::Error>
            where
                A: serde::de::MapAccess<'de>,
            {
                let mut value: Option<u8> = None;
                while let Some(key) = map.next_key::<String>()? {
                    if key == "value" {
                        value = Some(map.next_value()?);
                    } else {
                        map.next_value::<serde::de::IgnoredAny>()?;
                    }
                }
                match value {
                    Some(0) => Ok(ElementKind::Unknown),
                    Some(1) => Ok(ElementKind::PitchedElement),
                    Some(2) => Ok(ElementKind::UnpitchedElement),
                    Some(3) => Ok(ElementKind::UpperAnnotation),
                    Some(4) => Ok(ElementKind::LowerAnnotation),
                    Some(5) => Ok(ElementKind::Text),
                    Some(6) => Ok(ElementKind::SingleBarline),
                    Some(7) => Ok(ElementKind::RepeatLeftBarline),
                    Some(8) => Ok(ElementKind::RepeatRightBarline),
                    Some(9) => Ok(ElementKind::DoubleBarline),
                    Some(10) => Ok(ElementKind::BreathMark),
                    Some(11) => Ok(ElementKind::Whitespace),
                    Some(12) => Ok(ElementKind::Symbol),
                    Some(v) => Err(serde::de::Error::custom(format!("invalid ElementKind value: {}", v))),
                    None => Err(serde::de::Error::missing_field("value")),
                }
            }
        }

        deserializer.deserialize_any(ElementKindVisitor)
    }
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

    /// Check if this element is any kind of barline
    pub fn is_barline(&self) -> bool {
        matches!(
            self,
            ElementKind::SingleBarline
                | ElementKind::RepeatLeftBarline
                | ElementKind::RepeatRightBarline
                | ElementKind::DoubleBarline
        )
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
            ElementKind::SingleBarline => "Single Barline",
            ElementKind::RepeatLeftBarline => "Left Repeat Barline",
            ElementKind::RepeatRightBarline => "Right Repeat Barline",
            ElementKind::DoubleBarline => "Double Barline",
            ElementKind::BreathMark => "Breath Mark",
            ElementKind::Whitespace => "Whitespace",
            ElementKind::Nbsp => "Non-breaking Space",
            ElementKind::Symbol => "Symbol",
        }
    }

    /// Get snake_case name for JSON serialization
    pub fn snake_case_name(&self) -> &'static str {
        match self {
            ElementKind::Unknown => "unknown",
            ElementKind::PitchedElement => "pitched_element",
            ElementKind::UnpitchedElement => "unpitched_element",
            ElementKind::UpperAnnotation => "upper_annotation",
            ElementKind::LowerAnnotation => "lower_annotation",
            ElementKind::Text => "text",
            ElementKind::SingleBarline => "single_barline",
            ElementKind::RepeatLeftBarline => "repeat_left_barline",
            ElementKind::RepeatRightBarline => "repeat_right_barline",
            ElementKind::DoubleBarline => "double_barline",
            ElementKind::BreathMark => "breath_mark",
            ElementKind::Whitespace => "whitespace",
            ElementKind::Nbsp => "nbsp",
            ElementKind::Symbol => "symbol",
        }
    }
}

impl Default for ElementKind {
    fn default() -> Self {
        ElementKind::Unknown
    }
}


/// Enumeration of supported pitch systems for musical notation
#[wasm_bindgen]
#[repr(u8)]
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, serde_repr::Serialize_repr, serde_repr::Deserialize_repr)]
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

    /// Get snake_case name for JSON serialization
    pub fn snake_case_name(&self) -> &'static str {
        match self {
            PitchSystem::Unknown => "unknown",
            PitchSystem::Number => "number",
            PitchSystem::Western => "western",
            PitchSystem::Sargam => "sargam",
            PitchSystem::Bhatkhande => "bhatkhande",
            PitchSystem::Tabla => "tabla",
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
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum SlurIndicator {
    /// No slur indicator
    None = 0,

    /// This cell starts a slur
    SlurStart = 1,

    /// This cell ends a slur
    SlurEnd = 2,
}

// Custom serialization to show both name and value
impl Serialize for SlurIndicator {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeStruct;
        let mut state = serializer.serialize_struct("SlurIndicator", 2)?;
        state.serialize_field("name", &self.snake_case_name())?;
        state.serialize_field("value", &(*self as u8))?;
        state.end()
    }
}

// Custom deserialization - accepts either number or object format
impl<'de> Deserialize<'de> for SlurIndicator {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        struct SlurIndicatorVisitor;

        impl<'de> serde::de::Visitor<'de> for SlurIndicatorVisitor {
            type Value = SlurIndicator;

            fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
                formatter.write_str("a SlurIndicator number or object")
            }

            fn visit_u64<E>(self, value: u64) -> Result<SlurIndicator, E>
            where
                E: serde::de::Error,
            {
                match value {
                    0 => Ok(SlurIndicator::None),
                    1 => Ok(SlurIndicator::SlurStart),
                    2 => Ok(SlurIndicator::SlurEnd),
                    _ => Err(E::custom(format!("invalid SlurIndicator value: {}", value))),
                }
            }

            fn visit_i64<E>(self, value: i64) -> Result<SlurIndicator, E>
            where
                E: serde::de::Error,
            {
                self.visit_u64(value as u64)
            }

            fn visit_map<A>(self, mut map: A) -> Result<SlurIndicator, A::Error>
            where
                A: serde::de::MapAccess<'de>,
            {
                let mut value: Option<u8> = None;
                while let Some(key) = map.next_key::<String>()? {
                    if key == "value" {
                        value = Some(map.next_value()?);
                    } else {
                        map.next_value::<serde::de::IgnoredAny>()?;
                    }
                }
                match value {
                    Some(0) => Ok(SlurIndicator::None),
                    Some(1) => Ok(SlurIndicator::SlurStart),
                    Some(2) => Ok(SlurIndicator::SlurEnd),
                    Some(v) => Err(serde::de::Error::custom(format!("invalid SlurIndicator value: {}", v))),
                    None => Err(serde::de::Error::missing_field("value")),
                }
            }
        }

        deserializer.deserialize_any(SlurIndicatorVisitor)
    }
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

    /// Get snake_case name for JSON serialization
    pub fn snake_case_name(&self) -> &'static str {
        match self {
            SlurIndicator::None => "none",
            SlurIndicator::SlurStart => "slur_start",
            SlurIndicator::SlurEnd => "slur_end",
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

/// Ornament placement relative to parent note
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum OrnamentPlacement {
    Before,
    After,
}

impl Default for OrnamentPlacement {
    fn default() -> Self {
        OrnamentPlacement::After
    }
}

/// Ornament structure attached to a parent note
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Ornament {
    /// The cells that make up the ornament
    pub cells: Vec<super::core::Cell>,

    /// Placement relative to parent note
    #[serde(default)]
    pub placement: OrnamentPlacement,
}

/// Position type for ornaments relative to their parent note
#[wasm_bindgen]
#[repr(u8)]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum OrnamentPositionType {
    /// Ornament positioned before the parent note (grace note before)
    Before = 0,

    /// Ornament positioned after the parent note (grace note after)
    After = 1,

    /// Ornament positioned on top of the parent note (e.g., trill, mordent)
    OnTop = 2,
}

// Custom serialization to show both name and value
impl Serialize for OrnamentPositionType {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeStruct;
        let mut state = serializer.serialize_struct("OrnamentPositionType", 2)?;
        state.serialize_field("name", &self.snake_case_name())?;
        state.serialize_field("value", &(*self as u8))?;
        state.end()
    }
}

// Custom deserialization - accepts either number or object format
impl<'de> Deserialize<'de> for OrnamentPositionType {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        struct OrnamentPositionTypeVisitor;

        impl<'de> serde::de::Visitor<'de> for OrnamentPositionTypeVisitor {
            type Value = OrnamentPositionType;

            fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
                formatter.write_str("an OrnamentPositionType number or object")
            }

            fn visit_u64<E>(self, value: u64) -> Result<OrnamentPositionType, E>
            where
                E: serde::de::Error,
            {
                match value {
                    0 => Ok(OrnamentPositionType::Before),
                    1 => Ok(OrnamentPositionType::After),
                    2 => Ok(OrnamentPositionType::OnTop),
                    _ => Err(E::custom(format!("invalid OrnamentPositionType value: {}", value))),
                }
            }

            fn visit_i64<E>(self, value: i64) -> Result<OrnamentPositionType, E>
            where
                E: serde::de::Error,
            {
                self.visit_u64(value as u64)
            }

            fn visit_map<A>(self, mut map: A) -> Result<OrnamentPositionType, A::Error>
            where
                A: serde::de::MapAccess<'de>,
            {
                let mut value: Option<u8> = None;
                while let Some(key) = map.next_key::<String>()? {
                    if key == "value" {
                        value = Some(map.next_value()?);
                    } else {
                        map.next_value::<serde::de::IgnoredAny>()?;
                    }
                }
                match value {
                    Some(0) => Ok(OrnamentPositionType::Before),
                    Some(1) => Ok(OrnamentPositionType::After),
                    Some(2) => Ok(OrnamentPositionType::OnTop),
                    Some(v) => Err(serde::de::Error::custom(format!("invalid OrnamentPositionType value: {}", v))),
                    None => Err(serde::de::Error::missing_field("value")),
                }
            }
        }

        deserializer.deserialize_any(OrnamentPositionTypeVisitor)
    }
}

impl OrnamentPositionType {
    /// Get the human-readable name for this position type
    pub fn name(&self) -> &'static str {
        match self {
            OrnamentPositionType::Before => "Before",
            OrnamentPositionType::After => "After",
            OrnamentPositionType::OnTop => "On Top",
        }
    }

    /// Get snake_case name for JSON serialization
    pub fn snake_case_name(&self) -> &'static str {
        match self {
            OrnamentPositionType::Before => "before",
            OrnamentPositionType::After => "after",
            OrnamentPositionType::OnTop => "on_top",
        }
    }

    /// Get CSS class name for this position type
    pub fn css_class(&self) -> &'static str {
        match self {
            OrnamentPositionType::Before => "ornament-position-before",
            OrnamentPositionType::After => "ornament-position-after",
            OrnamentPositionType::OnTop => "ornament-position-on-top",
        }
    }

    /// Get MusicXML placement attribute value
    pub fn musicxml_placement(&self) -> &'static str {
        match self {
            OrnamentPositionType::Before => "before",
            OrnamentPositionType::After => "after",
            OrnamentPositionType::OnTop => "above",
        }
    }
}

impl Default for OrnamentPositionType {
    fn default() -> Self {
        OrnamentPositionType::Before
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

#[cfg(test)]
mod tests {
    // Tests will be added here

}