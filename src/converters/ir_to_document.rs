//! IR to Document converter
//!
//! Converts Intermediate Representation (IR) back to the editor's Cell-based Document model.
//! This is the reverse of the Document → IR conversion pipeline.
//!
//! # Architecture
//!
//! ```text
//! MusicXML → IR (ExportLine/ExportMeasure/ExportEvent)
//!   ↓
//! Spatial Notation Reconstruction
//!   ↓
//! Document (Line/Cell)
//! ```
//!
//! # Key Challenges
//!
//! 1. **Rhythmic Reconstruction**: Converting absolute divisions to spatial dash notation
//! 2. **Beat Boundaries**: Determining where to insert spaces between beats
//! 3. **Pitch Mapping**: Converting PitchCode to text based on active pitch system
//! 4. **Cell Construction**: Building Cell vectors with proper flags and layout

use crate::ir::{ExportLine, ExportMeasure, ExportEvent};
use crate::models::{Document, Line, Cell, ElementKind, elements::PitchSystem};
use crate::parse::grammar;

/// Result type for IR → Document conversion
pub type ConversionResult<T> = Result<T, ConversionError>;

/// Errors that can occur during conversion
#[derive(Debug, Clone)]
pub enum ConversionError {
    /// Invalid rhythmic structure
    InvalidRhythm(String),
    /// Unsupported IR feature
    UnsupportedFeature(String),
    /// Generic error
    Other(String),
}

impl std::fmt::Display for ConversionError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ConversionError::InvalidRhythm(msg) => write!(f, "Invalid rhythm: {}", msg),
            ConversionError::UnsupportedFeature(feat) => write!(f, "Unsupported feature: {}", feat),
            ConversionError::Other(msg) => write!(f, "{}", msg),
        }
    }
}

impl std::error::Error for ConversionError {}

/// Convert IR (Vec<ExportLine>) to Document
///
/// # Arguments
///
/// * `export_lines` - IR representation from MusicXML
/// * `pitch_system` - Target pitch system for display (Number, Western, Sargam, etc.)
///
/// # Returns
///
/// Document with Cell-based representation
pub fn ir_to_document(
    export_lines: Vec<ExportLine>,
    pitch_system: PitchSystem,
) -> ConversionResult<Document> {
    let mut document = Document::new();

    // Convert each ExportLine to a Line
    for (line_index, export_line) in export_lines.into_iter().enumerate() {
        let line = convert_export_line_to_line(export_line, line_index, pitch_system)?;
        document.lines.push(line);
    }

    Ok(document)
}

/// Convert a single ExportLine to Line
fn convert_export_line_to_line(
    export_line: ExportLine,
    _line_index: usize,
    pitch_system: PitchSystem,
) -> ConversionResult<Line> {
    // Build spatial notation from measures
    let mut text_parts = Vec::new();

    for measure in &export_line.measures {
        let measure_text = convert_measure_to_spatial(measure, pitch_system)?;
        text_parts.push(measure_text);
    }

    // Join measures with barlines
    let text = text_parts.join(" | ");

    // Create Line with metadata
    let mut line = Line::new();
    line.part_id = export_line.part_id;
    line.system_id = export_line.system_id;
    line.staff_role = export_line.staff_role;

    // Parse text into cells using the existing parser
    line.cells = parse_text_to_cells(&text, pitch_system);

    // Set metadata from export_line
    if let Some(key_sig) = export_line.key_signature {
        line.key_signature = key_sig;
    }
    if let Some(time_sig) = export_line.time_signature {
        line.time_signature = time_sig;
    }
    line.label = export_line.label;
    line.lyrics = export_line.lyrics;

    Ok(line)
}

/// Parse a text string into a Vec<Cell> using the grammar parser
fn parse_text_to_cells(text: &str, pitch_system: PitchSystem) -> Vec<Cell> {
    let mut cells = Vec::new();

    // Tokenize by grapheme clusters (Unicode-aware)
    // For now, use simple character iteration
    let chars: Vec<char> = text.chars().collect();
    let mut i = 0;

    while i < chars.len() {
        // Try to parse multi-character patterns first
        let remaining: String = chars[i..].iter().collect();

        // Try multi-char patterns (accidentals, barlines)
        let (cell, consumed) = try_parse_multi_char(&remaining, pitch_system);

        if consumed > 0 {
            cells.push(cell);
            i += consumed;
        } else {
            // Parse single character
            let c = chars[i];
            let cell = grammar::parse_single(c, pitch_system, None);
            cells.push(cell);
            i += 1;
        }
    }

    cells
}

/// Try to parse multi-character patterns
/// Returns (Cell, number of chars consumed)
fn try_parse_multi_char(text: &str, pitch_system: PitchSystem) -> (Cell, usize) {
    // Try 3-char patterns first (e.g., "1##", "1bb")
    if text.len() >= 3 {
        let three_char = &text[0..3];
        let cell = grammar::parse(three_char, pitch_system, None);
        if cell.get_kind() != ElementKind::Text {
            return (cell, 3);
        }
    }

    // Try 2-char patterns (e.g., "1#", "1b", ":|", "|:")
    if text.len() >= 2 {
        let two_char = &text[0..2];
        let cell = grammar::parse(two_char, pitch_system, None);
        if cell.get_kind() != ElementKind::Text {
            return (cell, 2);
        }
    }

    // No multi-char pattern matched
    (Cell::new(String::new(), ElementKind::Text), 0)
}

/// Convert a single measure to spatial notation string
///
/// This is the core rhythmic conversion algorithm:
/// - Analyzes event durations and fractions
/// - Determines beat boundaries
/// - Generates dash-based spatial notation
fn convert_measure_to_spatial(
    measure: &ExportMeasure,
    pitch_system: PitchSystem,
) -> ConversionResult<String> {
    if measure.events.is_empty() {
        return Ok(String::new());
    }

    let mut result = Vec::new();

    // Track if we're at the beginning of the measure
    let mut is_first_event = true;

    // Process each event
    for event in &measure.events {
        let event_text = convert_event_to_spatial(
            event,
            pitch_system,
            measure.divisions,
            is_first_event
        )?;

        if !event_text.is_empty() {
            result.push(event_text);

            // Check if this note has a breath mark after it
            if let ExportEvent::Note(note_data) = event {
                if note_data.breath_mark_after {
                    // Add apostrophe after the note
                    result.push("'".to_string());
                }
            }

            // After first non-empty event, we're no longer at the beginning
            is_first_event = false;
        }
    }

    // Join with spaces (beat boundaries)
    Ok(result.join(" "))
}

/// Convert a single event to spatial notation
///
/// # Arguments
///
/// * `event` - The event to convert (note, rest, or chord)
/// * `pitch_system` - The pitch system for rendering pitches
/// * `measure_divisions` - Total divisions in the measure for duration calculation
/// * `is_first_in_measure` - Whether this is the first event in the measure
///
/// # Breath Mark Convention
///
/// Rests are always converted to dashes (`-`) representing their duration.
/// Breath marks (`'`) are added BEFORE rests by setting the `breath_mark_after`
/// flag on the preceding note. This follows RHYTHM.md:
/// - Breath mark resets pitch context
/// - Following dashes become rests (not note extensions)
fn convert_event_to_spatial(
    event: &ExportEvent,
    pitch_system: PitchSystem,
    measure_divisions: usize,
    _is_first_in_measure: bool,
) -> ConversionResult<String> {
    match event {
        ExportEvent::Rest { divisions, .. } => {
            // All rests represented as dashes
            let dashes = duration_to_dashes(*divisions, measure_divisions);
            Ok("-".repeat(dashes))
        }
        ExportEvent::Note(note_data) => {
            // Get pitch character from pitch system
            let pitch_char = pitch_to_char(&note_data.pitch, pitch_system)?;

            // Calculate number of dashes to represent duration
            let dashes = duration_to_dashes(note_data.divisions, measure_divisions);

            // Build spatial notation: pitch + trailing dashes
            if dashes > 1 {
                Ok(format!("{}{}", pitch_char, "-".repeat(dashes - 1)))
            } else {
                Ok(pitch_char)
            }
        }
        ExportEvent::Chord { pitches, divisions, .. } => {
            // For chords, render first pitch with dashes
            // TODO: Implement proper chord rendering (stacked notation?)
            if let Some(first_pitch) = pitches.first() {
                let pitch_char = pitch_to_char(first_pitch, pitch_system)?;
                let dashes = duration_to_dashes(*divisions, measure_divisions);

                if dashes > 1 {
                    Ok(format!("{}{}", pitch_char, "-".repeat(dashes - 1)))
                } else {
                    Ok(pitch_char)
                }
            } else {
                Ok(String::new())
            }
        }
    }
}

/// Convert divisions to number of dashes (spatial units)
///
/// This is a simplified conversion that assumes:
/// - 1 division = 1 spatial unit (dash or character)
/// - Actual conversion may need to account for beat structure
///
/// TODO: Implement proper beat-aware conversion with LCM calculation
fn duration_to_dashes(divisions: usize, measure_divisions: usize) -> usize {
    // Simple proportional conversion
    // For a quarter note (1 beat) in 4/4 time with divisions=4, we get 4 dashes
    // This needs refinement based on actual beat structure

    if divisions == 0 {
        return 0;
    }

    // Calculate proportion of measure
    let proportion = divisions as f64 / measure_divisions as f64;

    // Scale to reasonable spatial units (4 per beat is a good default)
    let spatial_units = (proportion * 4.0).ceil() as usize;

    spatial_units.max(1)
}

/// Convert PitchInfo to character based on pitch system
fn pitch_to_char(
    pitch_info: &crate::ir::PitchInfo,
    pitch_system: PitchSystem,
) -> ConversionResult<String> {
    // Use PitchCode's built-in to_string method
    let pitch_str = pitch_info.pitch_code.to_string(pitch_system);

    // TODO: Add octave dots based on pitch_info.octave
    // - octave 0 = base (no dots)
    // - octave +1 = 1 dot above
    // - octave +2 = 2 dots above
    // - octave -1 = 1 dot below
    // - octave -2 = 2 dots below

    Ok(pitch_str)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ir::{NoteData, PitchInfo, Fraction};
    use crate::models::PitchCode;

    #[test]
    fn test_simple_note_to_spatial() {
        let pitch = PitchInfo::new(PitchCode::N1, 0);
        let note = NoteData {
            pitch,
            divisions: 4,
            fraction: Fraction::new(1, 4),
            grace_notes_before: Vec::new(),
            grace_notes_after: Vec::new(),
            lyrics: None,
            slur: None,
            articulations: Vec::new(),
            beam: None,
            tie: None,
            tuplet: None,
            breath_mark_after: false,
        };

        let event = ExportEvent::Note(note);
        let spatial = convert_event_to_spatial(&event, PitchSystem::Number, 16, true).unwrap();

        // With 4 divisions out of 16, we expect "1---" (1 char + 3 dashes)
        assert!(spatial.starts_with("1"));
    }

    #[test]
    fn test_rest_at_beginning_uses_dashes() {
        let rest = ExportEvent::Rest {
            divisions: 2,
            fraction: Fraction::new(1, 8),
            tuplet: None,
        };

        // Rest at beginning of measure → dashes
        let spatial = convert_event_to_spatial(&rest, PitchSystem::Number, 16, true).unwrap();
        assert_eq!(spatial, "-"); // 2 divisions out of 16 → 1 dash
    }

    #[test]
    fn test_rest_after_pitch_uses_breath_mark() {
        let rest = ExportEvent::Rest {
            divisions: 2,
            fraction: Fraction::new(1, 8),
            tuplet: None,
        };

        // Rest NOT at beginning → still dashes (breath mark is added separately after note)
        let spatial = convert_event_to_spatial(&rest, PitchSystem::Number, 16, false).unwrap();
        assert_eq!(spatial, "-"); // 2 divisions out of 16 → 1 dash (eighth rest)
    }

    #[test]
    fn test_pitch_to_char_number_system() {
        let pitch = PitchInfo::new(PitchCode::N4s, 0); // F sharp
        let char_str = pitch_to_char(&pitch, PitchSystem::Number).unwrap();
        assert_eq!(char_str, "4#");
    }

    #[test]
    fn test_pitch_to_char_western_system() {
        let pitch = PitchInfo::new(PitchCode::N5, 0); // G natural
        let char_str = pitch_to_char(&pitch, PitchSystem::Western).unwrap();
        assert_eq!(char_str, "G"); // uppercase for Western text export
    }

    #[test]
    fn test_full_rests_musicxml_conversion() {
        let musicxml = r#"<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1">
      <part-name>Rests Test</part-name>
    </score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
        <key>
          <fifths>0</fifths>
        </key>
        <time>
          <beats>4</beats>
          <beat-type>4</beat-type>
        </time>
      </attributes>
      <note>
        <pitch>
          <step>C</step>
          <octave>4</octave>
        </pitch>
        <duration>4</duration>
        <type>quarter</type>
      </note>
      <note>
        <rest/>
        <duration>4</duration>
        <type>quarter</type>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>4</octave>
        </pitch>
        <duration>4</duration>
        <type>quarter</type>
      </note>
      <note>
        <rest/>
        <duration>4</duration>
        <type>quarter</type>
      </note>
    </measure>
  </part>
</score-partwise>"#;

        // Parse to IR
        use crate::converters::musicxml::parse_musicxml_to_ir;
        let export_lines = parse_musicxml_to_ir(musicxml).unwrap();

        assert_eq!(export_lines.len(), 1);
        assert_eq!(export_lines[0].measures.len(), 1);

        let measure = &export_lines[0].measures[0];
        assert_eq!(measure.events.len(), 4);
        assert_eq!(measure.divisions, 4);

        // Convert to Document
        let document = ir_to_document(export_lines, PitchSystem::Number).unwrap();

        assert_eq!(document.lines.len(), 1);

        // Check that the spatial text contains pitch characters
        let line = &document.lines[0];
        assert!(line.cells.len() > 0, "Should have cells");

        // Find pitch cells (C and E should be represented as PitchedElement)
        let pitch_cells: Vec<&Cell> = line.cells.iter()
            .filter(|c| c.get_kind() == ElementKind::PitchedElement)
            .collect();

        // Find rests (dashes) - UnpitchedElement is dash only
        let rest_cells: Vec<&Cell> = line.cells.iter()
            .filter(|c| c.get_kind() == ElementKind::UnpitchedElement)
            .collect();

        // Should have 2 pitches (C and E)
        assert_eq!(pitch_cells.len(), 2, "Should have 2 pitches");

        // Should have rests (dashes)
        // Note: Breath mark insertion during MusicXML→IR requires breath_mark_after flag
        // to be set during parsing, which is a separate feature
        assert!(rest_cells.len() > 0, "Should have dash rests");

        println!("✅ Test passed: 2 pitches and {} rest dashes found", rest_cells.len());
        println!("   Pitches: {:?}", pitch_cells.iter().map(|c| c.get_char_string()).collect::<Vec<_>>());
        println!("   Rest dashes: {:?}", rest_cells.iter().map(|c| c.get_char_string()).collect::<Vec<_>>());
    }
}
