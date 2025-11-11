//! Export operations for the WASM API
//!
//! This module provides functions to export the document to various formats:
//! - MusicXML: Standard music notation interchange format
//! - MIDI: Standard MIDI File Format 1
//! - IR JSON: Intermediate Representation for inspection/debugging
//! - LilyPond: High-quality music engraving (via MusicXML conversion)

use wasm_bindgen::prelude::*;
use crate::api::helpers::lock_document;
use crate::{wasm_log, wasm_info, wasm_error};
use js_sys;

// ============================================================================
// MusicXML Export
// ============================================================================

/// Export document to MusicXML format
///
/// Uses WASM's internal document (from DOCUMENT mutex) to ensure
/// all metadata (part_id, system_id) is up-to-date after edit operations.
///
/// # Returns
/// MusicXML string (XML format)
#[wasm_bindgen(js_name = exportMusicXML)]
pub fn export_musicxml() -> Result<String, JsValue> {
    wasm_info!("exportMusicXML called (using internal WASM document)");

    // Use WASM's internal document instead of accepting from JavaScript
    // This ensures we have the latest metadata (part_id, system_id) after edit operations
    let doc_guard = lock_document()?;
    let document = doc_guard.as_ref()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    wasm_log!("  Document has {} lines", document.lines.len());

    // DEBUG: Log part_id values to verify they're set
    for (i, line) in document.lines.iter().enumerate() {
        wasm_log!("  Line {}: part_id='{}', system_id={}", i, line.part_id, line.system_id);
    }

    // Export to MusicXML
    let musicxml = crate::renderers::musicxml::to_musicxml(&document)
        .map_err(|e| {
            wasm_error!("MusicXML export error: {}", e);
            JsValue::from_str(&format!("MusicXML export error: {}", e))
        })?;

    wasm_info!("  MusicXML generated: {} bytes", musicxml.len());
    wasm_info!("exportMusicXML completed successfully");

    Ok(musicxml)
}

// ============================================================================
// Intermediate Representation (IR) Export
// ============================================================================

/// Generate Intermediate Representation (IR) as JSON
///
/// Converts the internal document to the IR (ExportLine/ExportMeasure/ExportEvent)
/// and serializes it to JSON for inspection and debugging.
///
/// Uses WASM's internal document to ensure all metadata is up-to-date.
///
/// The IR captures all document structure (measures, beats, events) with
/// proper rhythm analysis (LCM-based division calculation) and preserves
/// all musical information (slurs, lyrics, ornaments, chords, etc.).
///
/// # Returns
/// JSON string representation of the IR structure
#[wasm_bindgen(js_name = generateIRJson)]
pub fn generate_ir_json() -> Result<String, JsValue> {
    wasm_info!("generateIRJson called (using internal WASM document)");

    // Use WASM's internal document instead of accepting from JavaScript
    let doc_guard = lock_document()?;
    let document = doc_guard.as_ref()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    wasm_log!("  Document has {} lines", document.lines.len());

    // Build IR from document (FSM-based cell grouping, measure/beat boundaries, LCM calculation)
    let export_lines = crate::renderers::musicxml::cell_to_ir::build_export_measures_from_document(&document);
    crate::musicxml_log!(
        "Built IR: {} lines, {} total measures",
        export_lines.len(),
        export_lines.iter().map(|l| l.measures.len()).sum::<usize>()
    );

    // Serialize IR to JSON
    let json = serde_json::to_string_pretty(&export_lines)
        .map_err(|e| {
            wasm_error!("JSON serialization error: {}", e);
            JsValue::from_str(&format!("JSON serialization error: {}", e))
        })?;

    wasm_info!("  IR JSON generated: {} bytes", json.len());
    wasm_info!("generateIRJson completed successfully");

    Ok(json)
}

// ============================================================================
// MIDI Export
// ============================================================================

/// Export document to MIDI format
///
/// Converts the internal document to MusicXML, then to MIDI using the musicxml_to_midi converter.
/// Uses WASM's internal document to ensure all metadata is up-to-date.
///
/// # Parameters
/// - `tpq`: Ticks per quarter note (typically 480 or 960), use 0 for default (480)
///
/// # Returns
/// MIDI file as Uint8Array (Standard MIDI File Format 1)
#[wasm_bindgen(js_name = exportMIDI)]
pub fn export_midi(tpq: u16) -> Result<js_sys::Uint8Array, JsValue> {
    wasm_info!("exportMIDI called with tpq={} (using internal WASM document)", tpq);

    // Use WASM's internal document instead of accepting from JavaScript
    let doc_guard = lock_document()?;
    let document = doc_guard.as_ref()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    wasm_log!("  Document has {} lines", document.lines.len());

    // Step 1: Export to MusicXML
    let musicxml = crate::renderers::musicxml::to_musicxml(&document)
        .map_err(|e| {
            wasm_error!("MusicXML export error: {}", e);
            JsValue::from_str(&format!("MusicXML export error: {}", e))
        })?;

    wasm_log!("  MusicXML generated: {} bytes", musicxml.len());

    // Step 2: Convert MusicXML to MIDI
    let midi_bytes = crate::converters::musicxml::musicxml_to_midi::musicxml_to_midi(
        musicxml.as_bytes(),
        tpq,
    )
    .map_err(|e| {
        wasm_error!("MIDI conversion error: {}", e);
        JsValue::from_str(&format!("MIDI conversion error: {}", e))
    })?;

    wasm_info!("  MIDI generated: {} bytes", midi_bytes.len());

    // Convert to Uint8Array for JavaScript
    let uint8_array = js_sys::Uint8Array::new_with_length(midi_bytes.len() as u32);
    uint8_array.copy_from(&midi_bytes);

    wasm_info!("exportMIDI completed successfully");
    Ok(uint8_array)
}

// ============================================================================
// LilyPond Conversion (MusicXML → LilyPond)
// ============================================================================

/// Convert MusicXML to LilyPond notation using template-based rendering
///
/// Converts a MusicXML 3.1 document to LilyPond source code with automatic template selection.
/// The template system (Minimal, Standard, or MultiStave) is selected internally based on:
/// - Number of parts (single vs. multiple)
/// - Presence of title/composer metadata
///
/// All templating and document structure decisions are made entirely within WASM - the web app
/// receives ready-to-render LilyPond source with proper formatting, spacing, and headers.
///
/// # Parameters
/// * `musicxml` - MusicXML 3.1 document as a string
/// * `settings_json` - Optional JSON string with conversion settings (null for defaults)
///
/// # Returns
/// JSON string containing:
/// - `lilypond_source`: The complete LilyPond document (includes headers, paper settings, etc.)
/// - `skipped_elements`: Array of elements that couldn't be converted
///
/// # Template Selection Logic
/// - **MultiStave**: Selected for scores with 2+ parts
/// - **Standard**: Selected for single-part scores with title or composer
/// - **Minimal**: Selected for simple single-part scores without metadata
///
/// # Example Settings JSON
/// ```json
/// {
///   "target_lilypond_version": "2.24.0",
///   "language": "English",
///   "convert_directions": true,
///   "convert_lyrics": true,
///   "convert_chord_symbols": true,
///   "title": "My Composition",
///   "composer": "John Doe"
/// }
/// ```
///
/// # Template Characteristics
/// - **Minimal**: Bare-bones, no headers, default layout
/// - **Standard**: Single-staff with compact layout (50mm height), metadata header, optimized for web
/// - **MultiStave**: Multiple staves with spacious layout (100mm height), optimized for scores
///
/// # Internal Processing
/// 1. Parse MusicXML document using roxmltree
/// 2. Convert to internal Music representation
/// 3. Extract musical content (notes, rests, durations)
/// 4. Build TemplateContext with metadata (title, composer, version)
/// 5. Select template based on content
/// 6. Render via Mustache template engine
/// 7. Return complete LilyPond document with fallback to hardcoded generation if needed
#[wasm_bindgen(js_name = convertMusicXMLToLilyPond)]
pub fn convert_musicxml_to_lilypond(musicxml: String, settings_json: Option<String>) -> Result<String, JsValue> {
    wasm_info!("convertMusicXMLToLilyPond called (template-based rendering)");

    // Parse settings if provided
    let settings = if let Some(json) = settings_json {
        serde_json::from_str(&json)
            .map_err(|e| {
                wasm_error!("Settings JSON parse error: {}", e);
                JsValue::from_str(&format!("Settings parse error: {}", e))
            })?
    } else {
        None
    };

    // Convert MusicXML to LilyPond (template-based rendering happens internally)
    let result = crate::converters::musicxml::convert_musicxml_to_lilypond(&musicxml, settings)
        .map_err(|e| {
            wasm_error!("Conversion error: {}", e);
            JsValue::from_str(&format!("Conversion error: {}", e))
        })?;

    // Serialize result to JSON
    let result_json = serde_json::to_string(&result)
        .map_err(|e| {
            wasm_error!("Result serialization error: {}", e);
            JsValue::from_str(&format!("Result serialization error: {}", e))
        })?;

    wasm_info!("  LilyPond generated: {} bytes", result.lilypond_source.len());
    if !result.skipped_elements.is_empty() {
        wasm_log!("  Skipped {} elements during conversion", result.skipped_elements.len());
    }
    wasm_info!("convertMusicXMLToLilyPond completed successfully");

    Ok(result_json)
}
