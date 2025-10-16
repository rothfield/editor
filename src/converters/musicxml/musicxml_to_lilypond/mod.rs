//! MusicXML to LilyPond converter module
//!
//! This module provides functionality to convert MusicXML 3.1 documents
//! to LilyPond 2.24+ source code.
//!
//! # Overview
//!
//! The converter follows a three-stage pipeline:
//! 1. **Parse**: Parse MusicXML using roxmltree (zero-copy)
//! 2. **Convert**: Transform to internal Music representation
//! 3. **Generate**: Output LilyPond notation
//!
//! # Features
//!
//! - Best-effort conversion (always produces valid LilyPond)
//! - Multi-language support (Nederlands, English, Deutsch, Italiano)
//! - Multiple parts and voices
//! - Comprehensive error reporting with skipped elements
//! - WASM-compatible (pure string-to-string conversion)
//!
//! # Basic Usage
//!
//! ```ignore
//! use editor_wasm::musicxml_import::{convert_musicxml_to_lilypond, ConversionSettings};
//!
//! let musicxml = r#"<?xml version="1.0"?>
//! <score-partwise>
//!   <part id="P1">
//!     <measure number="1">
//!       <attributes>
//!         <divisions>256</divisions>
//!       </attributes>
//!       <note>
//!         <pitch><step>C</step><octave>4</octave></pitch>
//!         <duration>256</duration>
//!         <type>quarter</type>
//!       </note>
//!     </measure>
//!   </part>
//! </score-partwise>"#;
//!
//! let result = convert_musicxml_to_lilypond(musicxml, None)?;
//! println!("{}", result.lilypond_source);
//! ```

pub mod errors;
pub mod types;
pub mod parser;
pub mod converter;
pub mod lilypond;

// Re-export main API
pub use errors::{ConversionError, ParseError};
pub use types::{ConversionResult, ConversionSettings, PitchLanguage, SkippedElement};

/// Convert MusicXML document to LilyPond source code.
///
/// # Arguments
///
/// * `musicxml` - MusicXML 3.1 document as string
/// * `settings` - Optional conversion settings (uses defaults if None)
///
/// # Returns
///
/// * `Ok(ConversionResult)` - Successful conversion with LilyPond source and skip report
/// * `Err(ConversionError)` - Fatal error preventing output generation
pub fn convert_musicxml_to_lilypond(
    musicxml: &str,
    settings: Option<ConversionSettings>,
) -> Result<ConversionResult, ConversionError> {
    use converter::{convert_part, ConversionContext};
    use lilypond::generate_lilypond_document;
    use parser::XmlDocument;

    // Use provided settings or defaults
    let mut settings = settings.unwrap_or_default();

    // Parse XML document
    let doc = XmlDocument::parse(musicxml)?;

    // Extract title from MusicXML
    if settings.title.is_none() {
        settings.title = doc.extract_title();
    }

    // Extract composer from MusicXML
    if settings.composer.is_none() {
        settings.composer = doc.extract_composer();
    }

    // Extract parts
    let parts = doc.extract_parts()?;

    // Convert each part
    let mut converted_parts = Vec::new();
    let mut all_skipped_elements = Vec::new();

    for part in parts {
        let part_id = part.get_part_id();
        let mut context = ConversionContext::new(part_id);

        let seq_music = convert_part(part, &mut context)?;
        converted_parts.push(seq_music);

        // Collect skipped elements
        all_skipped_elements.extend(context.skipped_elements);
    }

    // Generate LilyPond document
    let lilypond_source = generate_lilypond_document(converted_parts, &settings);

    Ok(ConversionResult {
        lilypond_source,
        skipped_elements: all_skipped_elements,
    })
}
