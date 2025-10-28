//! MusicXML document converter
//!
//! Main entry point for converting a Document to MusicXML 3.1 format.

use crate::models::Document;
use crate::parse::beats::BeatDeriver;
use super::builder::MusicXmlBuilder;
use super::measure::{split_at_barlines, calculate_measure_divisions, process_segment};

/// Export a document to MusicXML 3.1 format
///
/// Converts the internal Cell-based document model to MusicXML by:
/// 1. Iterating through document lines
/// 2. Extracting beats (whitespace-delimited groups)
/// 3. Calculating durations and divisions
/// 4. Generating MusicXML with measures, notes, rests, and system breaks
///
/// # Arguments
/// * `document` - The document to export
///
/// # Returns
/// * `Result<String, String>` - MusicXML string or error message
pub fn to_musicxml(document: &Document) -> Result<String, String> {
    crate::musicxml_log!("Starting MusicXML export for document with {} lines", document.lines.len());

    let mut builder = MusicXmlBuilder::new();

    // Set document title if present
    if let Some(title) = &document.title {
        if !title.is_empty() && title != "Untitled Document" {
            builder.set_title(Some(title.clone()));
        }
    }

    // Set document key signature if present
    if let Some(ref key_sig) = document.key_signature {
        if !key_sig.is_empty() {
            builder.set_key_signature(Some(key_sig.as_str()));
        }
    }

    // Handle empty document
    if document.lines.is_empty() || document.lines.iter().all(|line| line.cells.is_empty()) {
        crate::musicxml_log!("Empty document detected, generating single measure with whole rest");
        // Generate empty MusicXML with a single measure containing a whole rest
        builder.start_measure_with_divisions(Some(1), false, 4);
        builder.write_rest(4, 4.0);
        builder.end_measure();
        return Ok(builder.finalize());
    }

    // Create beat deriver for rhythm analysis
    let beat_deriver = BeatDeriver::new();

    // Process each line as a musical system
    for (line_index, line) in document.lines.iter().enumerate() {
        let new_system = line_index > 0; // First line is default, others need new-system
        builder.reset_context();

        // Split line at barlines into measures
        let segments = split_at_barlines(&line.cells);

        if segments.is_empty() && !line.cells.is_empty() {
            // No barlines - treat entire line as one measure
            let measure_divisions = calculate_measure_divisions(&line.cells, &beat_deriver);
            let beat_count = beat_deriver.extract_implicit_beats(&line.cells).len();
            builder.start_measure_with_divisions(Some(measure_divisions), new_system, beat_count);
            process_segment(&mut builder, &line.cells, &beat_deriver, measure_divisions)?;
            builder.end_measure();
        } else {
            // Process each segment (measure)
            for (i, segment_indices) in segments.iter().enumerate() {
                let segment = &line.cells[segment_indices.0..segment_indices.1];
                if !segment.is_empty() {
                    let measure_divisions = calculate_measure_divisions(segment, &beat_deriver);
                    let beat_count = beat_deriver.extract_implicit_beats(segment).len();
                    let is_first_measure = i == 0;
                    builder.start_measure_with_divisions(Some(measure_divisions), new_system && is_first_measure, beat_count);
                    process_segment(&mut builder, segment, &beat_deriver, measure_divisions)?;
                    builder.end_measure();
                }
            }
        }
    }

    let xml = builder.finalize();
    crate::musicxml_log!("MusicXML export complete: {} bytes", xml.len());
    Ok(xml)
}
