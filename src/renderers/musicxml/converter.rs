//! MusicXML document converter
//!
//! Main entry point for converting a Document to MusicXML 3.1 format.
//!
//! The new pipeline uses an Intermediate Representation (IR) layer:
//! 1. Document Model (cells, lines) → Export IR (ExportLine, ExportMeasure, ExportEvent)
//! 2. Export IR → MusicXML String

use crate::models::Document;
use crate::ir::build_export_measures_from_document;
use super::emitter::{emit_musicxml, emit_musicxml_polyphonic};

/// Export a document to MusicXML 3.1 format
///
/// Converts the internal Cell-based document model to MusicXML 3.1 by:
/// 1. Building an Intermediate Representation (IR) from the document
/// 2. Emitting MusicXML from the IR
///
/// The IR captures all document structure (measures, beats, events) with
/// proper rhythm analysis (LCM-based division calculation) and preserves
/// all musical information (slurs, lyrics, ornaments, chords, etc.).
///
/// # Arguments
/// * `document` - The document to export
///
/// # Returns
/// * `Result<String, String>` - MusicXML string or error message
pub fn to_musicxml(document: &Document) -> Result<String, String> {
    crate::musicxml_log!("Starting MusicXML export for document with {} lines", document.lines.len());

    // Build IR from document (FSM-based cell grouping, measure/beat boundaries, LCM calculation)
    let export_lines = build_export_measures_from_document(document);
    crate::musicxml_log!(
        "Built IR: {} lines, {} total measures",
        export_lines.len(),
        export_lines.iter().map(|l| l.measures.len()).sum::<usize>()
    );

    // Emit MusicXML from IR
    let options = super::emitter::EmitOptions {
        title: document.title.as_deref(),
        composer: document.composer.as_deref(),
        key_signature: document.key_signature.as_deref(),
    };
    let xml = emit_musicxml(&export_lines, &options)?;

    crate::musicxml_log!("MusicXML export complete: {} bytes", xml.len());
    Ok(xml)
}

/// Export a document to MusicXML 3.1 format with polyphonic alignment
///
/// This version uses the measurization layer to ensure all parts have
/// identical measure counts - required for valid MusicXML with multiple parts.
///
/// # Arguments
/// * `document` - The document to export
///
/// # Returns
/// * `Result<String, String>` - MusicXML string or error message
pub fn to_musicxml_polyphonic(document: &Document) -> Result<String, String> {
    crate::musicxml_log!("Starting polyphonic MusicXML export for document with {} lines", document.lines.len());

    // Build IR from document (FSM-based cell grouping, measure/beat boundaries, LCM calculation)
    let export_lines = build_export_measures_from_document(document);
    crate::musicxml_log!(
        "Built IR: {} lines, {} total measures",
        export_lines.len(),
        export_lines.iter().map(|l| l.measures.len()).sum::<usize>()
    );

    // Emit MusicXML with polyphonic alignment (measurization layer)
    let options = super::emitter::EmitOptions {
        title: document.title.as_deref(),
        composer: document.composer.as_deref(),
        key_signature: document.key_signature.as_deref(),
    };
    let xml = emit_musicxml_polyphonic(&export_lines, &options)?;

    crate::musicxml_log!("Polyphonic MusicXML export complete: {} bytes", xml.len());
    Ok(xml)
}
