//! MusicXML format converters
//!
//! This module contains converters for MusicXML format.

pub mod musicxml_to_lilypond;
pub mod musicxml_to_midi;
pub mod musicxml_to_ir;

// Re-export for convenience
pub use musicxml_to_lilypond::{
    convert_musicxml_to_lilypond,
    ConversionError,
    ConversionResult,
    ConversionSettings,
    ParseError,
    PitchLanguage,
    SkippedElement,
};

pub use musicxml_to_ir::{
    parse_musicxml_to_ir,
    MusicXMLParseError,
    MusicXMLParseResult,
};
