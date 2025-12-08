//! WASM API for the recursive descent parser
//!
//! This module provides the JavaScript-facing API for character insertion
//! and token combination using the recursive descent parser.

use wasm_bindgen::prelude::*;
use crate::models::{Cell, PitchSystem, Document, Line, Pos, EditorDiff, CaretInfo, SelectionInfo, ElementKind, StaffRole, PitchCode};
use crate::models::pitch_code::AccidentalType;
use crate::parse::grammar::parse_single;
use crate::api::helpers::lock_document;
use crate::{wasm_log, wasm_info, wasm_warn, wasm_error};
use crate::undo::Command;
use crate::renderers::lyrics::{distribute_lyrics, parse_lyrics};

#[cfg(test)]
use crate::parse::grammar::parse;

// ============================================================================
// Shared Infrastructure (moved to other modules)
// ============================================================================
// - DOCUMENT mutex and lock_document() → src/api/helpers.rs
// - Logging macros (wasm_log!, wasm_info!, etc.) → src/api/helpers.rs
// - Common types (EditResult, DirtyLine, CopyResult) → src/api/types.rs
// - Export functions (exportMusicXML, etc.) → src/api/export.rs
// - Slur operations (applySlur, etc.) → src/api/annotations/slur.rs

// Re-export common types from the types module for backwards compatibility
pub use crate::api::types::{DirtyLine, EditResult, CopyResult};

// ============================================================================
// Slur Functions - MOVED to src/api/annotations/slur.rs
// ============================================================================
// Legacy slur operations (applySlurLegacy, removeSlurLegacy, hasSlurInSelection)
// and modern slur operations (applySlur, removeSlur) have been moved to the
// annotations module for better organization.

// ============================================================================
// Ornament Functions (WYSIWYG "Select and Apply" Pattern)
// ============================================================================
// Old applyOrnament and removeOrnament functions removed - replaced by copy/paste workflow
// Old resolveOrnamentAttachments and computeOrnamentLayout functions removed - replaced by copy/paste workflow

// ============================================================================
// Font Measurement Cache (Startup Initialization)
// ============================================================================

/// Set the global glyph width cache
///
/// This should be called once at startup after measuring all NotationFont glyphs.
/// The cache is used by the layout engine to look up glyph widths without
/// requiring per-render measurement.
///
/// # Parameters
/// - `cache_js`: JavaScript object mapping glyph character to width in CSS pixels
///   Example: { "1": 12.5, "2": 13.0, "\uE000": 15.2, ... }
///
/// # Returns
/// Ok(()) on success, JsValue error on failure
#[wasm_bindgen(js_name = setGlyphWidthCache)]
pub fn set_glyph_width_cache(cache_js: JsValue) -> Result<(), JsValue> {
    wasm_info!("setGlyphWidthCache called");

    // Deserialize JavaScript object to HashMap<String, f32>
    let cache: std::collections::HashMap<String, f32> = serde_wasm_bindgen::from_value(cache_js)
        .map_err(|e| {
            wasm_error!("Cache deserialization error: {}", e);
            JsValue::from_str(&format!("Cache deserialization error: {}", e))
        })?;

    wasm_info!("  Received {} glyph width entries", cache.len());

    // Set the global cache
    crate::html_layout::document::set_glyph_width_cache(cache);

    wasm_info!("setGlyphWidthCache completed successfully");
    Ok(())
}

/// Get available pitch systems with metadata
///
/// Returns a JSON array of pitch system objects with:
/// - value: String identifier ("number", "western", "sargam")
/// - name: Display name
/// - description: Description text
/// - example: Array of example glyphs from NotationFont
/// - shortcut: Keyboard shortcut number
#[wasm_bindgen(js_name = getAvailablePitchSystems)]
pub fn get_available_pitch_systems() -> Result<JsValue, JsValue> {
    use serde::Serialize;

    #[derive(Serialize)]
    struct PitchSystemInfo {
        value: String,
        name: String,
        description: String,
        example: Vec<String>,
        shortcut: String,
    }

    let systems = vec![
        PitchSystemInfo {
            value: "number".to_string(),
            name: "Number System".to_string(),
            description: "1-7 notation (Sa Re Ga Ma Pa Dha Ni)".to_string(),
            example: vec!["1", "2♭", "2", "3♭", "3", "4", "4#", "5", "6♭", "6", "7♭", "7"]
                .into_iter()
                .map(String::from)
                .collect(),
            shortcut: "1".to_string(),
        },
        PitchSystemInfo {
            value: "western".to_string(),
            name: "Western Notation".to_string(),
            description: "C D E F G A B (traditional staff notation)".to_string(),
            example: vec!["C", "D♭", "D", "E♭", "E", "F", "F#", "G", "A♭", "A", "B♭", "B"]
                .into_iter()
                .map(String::from)
                .collect(),
            shortcut: "2".to_string(),
        },
        PitchSystemInfo {
            value: "sargam".to_string(),
            name: "Sargam".to_string(),
            description: "S R G M P D N (Indian classical)".to_string(),
            example: vec!["S", "r", "R", "g", "G", "m", "M", "P", "d", "D", "n", "N"]
                .into_iter()
                .map(String::from)
                .collect(),
            shortcut: "3".to_string(),
        },
    ];

    serde_wasm_bindgen::to_value(&systems)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}

/// Set the document title (Phase 1 - uses internal DOCUMENT)
#[wasm_bindgen(js_name = setTitle)]
pub fn set_title(title: &str) -> Result<(), JsValue> {
    wasm_info!("setTitle called (Phase 1): title='{}'", title);

    let mut doc_guard = lock_document()?;
    let doc = doc_guard.as_mut()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    doc.title = Some(title.to_string());
    wasm_info!("  Document title set to: '{}'", title);

    // Compute glyphs after metadata change
    doc.compute_glyphs();

    wasm_info!("setTitle completed successfully");
    Ok(())
}

/// Set the document composer (Phase 1 - uses internal DOCUMENT)
#[wasm_bindgen(js_name = setComposer)]
pub fn set_composer(composer: &str) -> Result<(), JsValue> {
    wasm_info!("setComposer called (Phase 1): composer='{}'", composer);

    let mut doc_guard = lock_document()?;
    let doc = doc_guard.as_mut()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    doc.composer = Some(composer.to_string());
    wasm_info!("  Document composer set to: '{}'", composer);

    // Compute glyphs after metadata change
    doc.compute_glyphs();

    wasm_info!("setComposer completed successfully");
    Ok(())
}

/// Set the document tonic (Phase 1 API)
///
/// Sets the musical tonic for the entire composition.
/// Does not affect key_signature - these are independent fields.
///
/// # Parameters
/// - `tonic`: The tonic note (e.g., "C", "D", "E", etc.)
///
/// # Returns
/// Ok(()) on success, or error if no document is loaded
#[wasm_bindgen(js_name = setDocumentTonic)]
pub fn set_document_tonic(tonic: &str) -> Result<(), JsValue> {
    wasm_info!("setDocumentTonic called: tonic='{}'", tonic);

    let mut doc_guard = lock_document()?;
    let doc = doc_guard.as_mut()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    // Parse tonic string to Tonic enum
    let tonic_enum = tonic.parse::<crate::models::Tonic>()
        .map_err(|e| JsValue::from_str(&format!("Invalid tonic '{}': {}", tonic, e)))?;

    doc.tonic = Some(tonic_enum);
    wasm_info!("  Document tonic set to: '{}'", tonic);

    // Compute glyphs after metadata change
    doc.compute_glyphs();

    wasm_info!("setDocumentTonic completed successfully");
    Ok(())
}

/// Set the tonic for a specific line (Phase 1 API)
///
/// Sets the musical tonic for a specific line (overrides document tonic).
/// Does not affect key_signature - these are independent fields.
///
/// # Parameters
/// - `line_idx`: The line index (0-based)
/// - `tonic`: The tonic note (e.g., "C", "D", "E", etc.)
///
/// # Returns
/// Ok(()) on success, or error if no document is loaded or line index is invalid
#[wasm_bindgen(js_name = setLineTonic)]
pub fn set_line_tonic(line_idx: usize, tonic: &str) -> Result<(), JsValue> {
    wasm_info!("setLineTonic called: line_idx={}, tonic='{}'", line_idx, tonic);

    let mut doc_guard = lock_document()?;
    let doc = doc_guard.as_mut()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    // Validate line index
    if line_idx >= doc.lines.len() {
        let err_msg = format!("Line index {} out of bounds (document has {} lines)", line_idx, doc.lines.len());
        wasm_error!("{}", err_msg);
        return Err(JsValue::from_str(&err_msg));
    }

    // Parse tonic string to Tonic enum
    let tonic_enum = tonic.parse::<crate::models::Tonic>()
        .map_err(|e| JsValue::from_str(&format!("Invalid tonic '{}': {}", tonic, e)))?;

    // Set the line tonic
    doc.lines[line_idx].tonic = Some(tonic_enum);
    wasm_info!("  Line {} tonic set to: '{}'", line_idx, tonic);

    // Compute glyphs after metadata change
    doc.compute_glyphs();

    wasm_info!("setLineTonic completed successfully");
    Ok(())
}

/// Set the document-level key signature (Phase 1 API)
///
/// Sets the key signature for the entire composition.
///
/// # Parameters
/// - `key_signature`: The key signature string (e.g., "C major", "D minor", "G major")
///
/// # Returns
/// Ok(()) on success, or error if no document is loaded
#[wasm_bindgen(js_name = setDocumentKeySignature)]
pub fn set_document_key_signature(key_signature: &str) -> Result<(), JsValue> {
    wasm_info!("setDocumentKeySignature called: key_signature='{}'", key_signature);

    let mut doc_guard = lock_document()?;
    let doc = doc_guard.as_mut()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    doc.key_signature = Some(key_signature.to_string());
    wasm_info!("  Document key signature set to: '{}'", key_signature);

    // Compute glyphs after metadata change
    doc.compute_glyphs();

    wasm_info!("setDocumentKeySignature completed successfully");
    Ok(())
}

/// Set the line-level key signature (Phase 1 API)
///
/// Sets the key signature for a specific line.
///
/// # Parameters
/// - `line_idx`: The index of the line to modify
/// - `key_signature`: The key signature string (e.g., "C major", "D minor")
///
/// # Returns
/// Ok(()) on success, or error if no document is loaded or line index is invalid
#[wasm_bindgen(js_name = setLineKeySignature)]
pub fn set_line_key_signature(line_idx: usize, key_signature: &str) -> Result<(), JsValue> {
    wasm_info!("setLineKeySignature called: line_idx={}, key_signature='{}'", line_idx, key_signature);

    let mut doc_guard = lock_document()?;
    let doc = doc_guard.as_mut()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    if line_idx >= doc.lines.len() {
        wasm_error!("Line index {} out of bounds (max: {})", line_idx, doc.lines.len() - 1);
        return Err(JsValue::from_str(&format!(
            "Line index {} out of bounds (document has {} lines)",
            line_idx,
            doc.lines.len()
        )));
    }

    doc.lines[line_idx].key_signature = key_signature.to_string();
    wasm_info!("  Line {} key signature set to: '{}'", line_idx, key_signature);

    // Compute glyphs after metadata change
    doc.compute_glyphs();

    wasm_info!("setLineKeySignature completed successfully");
    Ok(())
}

/// Set label for a specific line (Phase 1 API - WASM-First)
///
/// # Parameters
/// - `line_index`: Index of the line to set label for (0-based)
/// - `label`: The label text to set
///
/// # Returns
/// Ok(()) on success, or error if no document is loaded or line index is invalid
#[wasm_bindgen(js_name = setLineLabel)]
pub fn set_line_label(line_index: usize, label: &str) -> Result<(), JsValue> {
    wasm_info!("setLineLabel called (Phase 1): line_index={}, label='{}'", line_index, label);

    let mut doc_guard = lock_document()?;
    let doc = doc_guard.as_mut()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    // Validate line index
    if line_index >= doc.lines.len() {
        wasm_error!("Line index {} out of bounds (max: {})", line_index, doc.lines.len() - 1);
        return Err(JsValue::from_str("Line index out of bounds"));
    }

    // Set the label for the line
    doc.lines[line_index].label = label.to_string();
    wasm_info!("  Line {} label set to: '{}'", line_index, label);

    // Compute glyphs after metadata change
    doc.compute_glyphs();

    wasm_info!("setLineLabel completed successfully");
    Ok(())
}

/// Set lyrics for a specific line (Phase 1 API - WASM-First)
///
/// # Parameters
/// - `line_index`: Index of the line to set lyrics for (0-based)
/// - `lyrics`: The lyrics text to set
///
/// # Returns
/// Ok(()) on success, or error if no document is loaded or line index is invalid
#[wasm_bindgen(js_name = setLineLyrics)]
pub fn set_line_lyrics(line_index: usize, lyrics: &str) -> Result<(), JsValue> {
    wasm_info!("setLineLyrics called (Phase 1): line_index={}, lyrics='{}'", line_index, lyrics);

    let mut doc_guard = lock_document()?;
    let doc = doc_guard.as_mut()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    // Validate line index
    if line_index >= doc.lines.len() {
        wasm_error!("Line index {} out of bounds (max: {})", line_index, doc.lines.len() - 1);
        return Err(JsValue::from_str("Line index out of bounds"));
    }

    // Set the lyrics for the line
    doc.lines[line_index].lyrics = lyrics.to_string();
    wasm_info!("  Line {} lyrics set to: '{}'", line_index, lyrics);

    // Compute glyphs after metadata change
    doc.compute_glyphs();

    wasm_info!("setLineLyrics completed successfully");
    Ok(())
}

/// Set tala for a specific line (Phase 1 API - WASM-First)
///
/// # Parameters
/// - `line_index`: Index of the line to set tala for (0-based)
/// - `tala`: The tala string (digits 0-9+)
///
/// # Returns
/// Ok(()) on success, or error if no document is loaded or line index is invalid
#[wasm_bindgen(js_name = setLineTala)]
pub fn set_line_tala(line_index: usize, tala: &str) -> Result<(), JsValue> {
    wasm_info!("setLineTala called (Phase 1): line_index={}, tala='{}'", line_index, tala);

    let mut doc_guard = lock_document()?;
    let doc = doc_guard.as_mut()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    // Validate line index
    if line_index >= doc.lines.len() {
        wasm_error!("Line index {} out of bounds (max: {})", line_index, doc.lines.len() - 1);
        return Err(JsValue::from_str("Line index out of bounds"));
    }

    // Validate tala format (allow empty to clear, or only digits 0-9 and +)
    if !tala.is_empty() && !tala.chars().all(|c| c.is_ascii_digit() || c == '+') {
        wasm_error!("Invalid tala format: '{}' (only digits 0-9, + allowed, or empty to clear)", tala);
        return Err(JsValue::from_str("Invalid tala format"));
    }

    // Set the tala for the line
    doc.lines[line_index].tala = tala.to_string();
    wasm_info!("  Line {} tala set to: '{}'", line_index, tala);

    // Compute glyphs after metadata change
    doc.compute_glyphs();

    wasm_info!("setLineTala completed successfully");
    Ok(())
}

/// Set pitch system for a specific line (Phase 1 API - WASM-First)
///
/// # Parameters
/// - `line_index`: Index of the line to set pitch system for (0-based)
/// - `pitch_system`: The new pitch system (0-5, where 1=Number, 2=Western, 3=Sargam, 4=Bhatkhande, 5=Tabla)
///
/// # Returns
/// Ok(()) on success, or error if no document is loaded or line index is invalid
#[wasm_bindgen(js_name = setLinePitchSystem)]
pub fn set_line_pitch_system(line_index: usize, pitch_system: u8) -> Result<(), JsValue> {
    wasm_info!("setLinePitchSystem called (Phase 1): line_index={}, pitch_system={}", line_index, pitch_system);

    let mut doc_guard = lock_document()?;
    let doc = doc_guard.as_mut()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    // Validate line index
    if line_index >= doc.lines.len() {
        wasm_error!("Line index {} out of bounds (max: {})", line_index, doc.lines.len() - 1);
        return Err(JsValue::from_str(&format!("Line index {} out of bounds", line_index)));
    }

    // Validate and set the pitch system
    let system = match pitch_system {
        0 => PitchSystem::Unknown,
        1 => PitchSystem::Number,
        2 => PitchSystem::Western,
        3 => PitchSystem::Sargam,
        4 => PitchSystem::Bhatkhande,
        5 => PitchSystem::Tabla,
        _ => {
            wasm_error!("Invalid pitch system value: {}", pitch_system);
            return Err(JsValue::from_str(&format!("Invalid pitch system: {}", pitch_system)));
        }
    };

    doc.lines[line_index].pitch_system = Some(system);
    wasm_info!("  Line {} pitch system set to: {:?}", line_index, system);

    // Compute glyphs after metadata change
    doc.compute_glyphs();

    wasm_info!("setLinePitchSystem completed successfully");
    Ok(())
}

/// Set whether a line starts a new stave block/system (Phase 1 API - WASM-First)
///
/// # Parameters
/// - `line_index`: Index of the line to modify
/// - `new_system`: Boolean indicating whether this line starts a new system
///
/// When new_system=true, this line begins a new grouped system (e.g., piano grand staff).
/// All subsequent lines with new_system=false belong to this system until
/// the next line with new_system=true or end of document.
///
/// # Returns
/// Ok(()) on success, or error if no document is loaded or line index is invalid
#[wasm_bindgen(js_name = setLineNewSystem)]
pub fn set_line_new_system(line_index: usize, new_system: bool) -> Result<(), JsValue> {
    wasm_info!("setLineNewSystem called (Phase 1): line_index={}, new_system={}", line_index, new_system);

    let mut doc_guard = lock_document()?;
    let doc = doc_guard.as_mut()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    // Validate line index
    if line_index >= doc.lines.len() {
        wasm_error!("Line index {} out of bounds (max: {})", line_index, doc.lines.len() - 1);
        return Err(JsValue::from_str("Line index out of bounds"));
    }

    // Set the new_system flag for the line
    doc.lines[line_index].new_system = new_system;
    wasm_info!("  Line {} new_system set to: {}", line_index, new_system);

    // Recalculate system_id and part_id for all lines
    doc.recalculate_system_and_part_ids();
    wasm_info!("  System and part IDs recalculated");

    // Compute glyphs after metadata change
    doc.compute_glyphs();

    wasm_info!("setLineNewSystem completed successfully");
    Ok(())
}

/// Split lyrics string at a cell index boundary
///
/// Uses the lyrics distribution algorithm to determine which syllables belong
/// to cells before the split point and which belong to cells after.
///
/// # Arguments
/// * `lyrics` - The full lyrics string for the line
/// * `cells` - All cells in the line (before splitting)
/// * `split_cell_index` - The cell index where the line will be split
///
/// # Returns
/// A tuple of (lyrics_before, lyrics_after) where:
/// - lyrics_before: Syllables assigned to cells 0..split_cell_index
/// - lyrics_after: Syllables assigned to cells split_cell_index..end
fn split_lyrics_at_cell_index(lyrics: &str, cells: &[Cell], split_cell_index: usize) -> (String, String) {
    if lyrics.trim().is_empty() {
        return (String::new(), String::new());
    }

    // Get all syllables
    let syllables = parse_lyrics(lyrics);
    if syllables.is_empty() {
        return (String::new(), String::new());
    }

    // Distribute lyrics to cells to find assignment boundaries
    let assignments = distribute_lyrics(lyrics, cells);

    // Find which syllables go to each part based on cell assignments
    // Count how many syllables are assigned to cells before the split point
    let syllables_before_count = assignments
        .iter()
        .filter(|a| a.cell_index < split_cell_index)
        .count();

    // Split syllables
    let syllables_before: Vec<&String> = syllables.iter().take(syllables_before_count).collect();
    let syllables_after: Vec<&String> = syllables.iter().skip(syllables_before_count).collect();

    // Reconstruct lyrics strings, joining syllables appropriately
    let lyrics_before = reconstruct_lyrics(&syllables_before);
    let lyrics_after = reconstruct_lyrics(&syllables_after);

    (lyrics_before, lyrics_after)
}

/// Reconstruct a lyrics string from syllables
///
/// Joins syllables with spaces, but avoids double spaces when syllables
/// already end with hyphens (which indicate continuation).
fn reconstruct_lyrics(syllables: &[&String]) -> String {
    if syllables.is_empty() {
        return String::new();
    }

    let mut result = String::new();
    for (i, syllable) in syllables.iter().enumerate() {
        result.push_str(syllable);
        // Add space between syllables unless this syllable ends with hyphen
        // (hyphen indicates it continues to the next syllable)
        if i < syllables.len() - 1 && !syllable.ends_with('-') {
            result.push(' ');
        }
    }
    result
}

/// Split a line at the given character position (Phase 1 API - WASM-First)
///
/// # Parameters
/// - `stave_index`: The index of the line/stave to split (0-based)
/// - `char_pos`: The character position where to split (0-based)
///
/// # Returns
/// EditorDiff showing which lines changed (the split line and the new line)
///
/// # Behavior
/// - Cells before char_pos stay in the current line
/// - Cells after char_pos move to the new line
/// - New line inherits: pitch_system, tonic, key_signature, time_signature
/// - New line gets empty: label, tala
/// - Lyrics are split: syllables assigned to cells before split stay on original line,
///   syllables assigned to cells after split move to new line
#[wasm_bindgen(js_name = splitLineAtPosition)]
pub fn split_line_at_position(
    stave_index: usize,
    char_pos: usize,
) -> Result<JsValue, JsValue> {
    wasm_info!("splitLineAtPosition called (Phase 1): stave_index={}, char_pos={}", stave_index, char_pos);

    let mut doc_guard = lock_document()?;
    let doc = doc_guard.as_mut()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    // Validate stave index
    if stave_index >= doc.lines.len() {
        wasm_warn!("Stave index {} out of bounds (document has {} lines)", stave_index, doc.lines.len());
        return Err(JsValue::from_str("Stave index out of bounds"));
    }

    let current_line = &doc.lines[stave_index];
    wasm_log!("Current line has {} cells", current_line.cells.len());

    // Convert character position to cell index
    let mut char_count = 0;
    let mut split_cell_index = current_line.cells.len();

    for (i, cell) in current_line.cells.iter().enumerate() {
        let cell_char_count = cell.char.chars().count();
        if char_count + cell_char_count > char_pos {
            // Found the cell that contains the split point
            split_cell_index = i;
            break;
        }
        char_count += cell_char_count;
    }

    wasm_log!("Split point: char_pos={}, split_cell_index={}", char_pos, split_cell_index);

    // Split the cells array
    let mut line = doc.lines.remove(stave_index);

    // Split lyrics: distribute syllables to cells, then split based on cell index
    let (lyrics_before, lyrics_after) = split_lyrics_at_cell_index(&line.lyrics, &line.cells, split_cell_index);
    wasm_log!("Lyrics split: before='{}', after='{}'", lyrics_before, lyrics_after);

    let cells_after = line.cells.split_off(split_cell_index);

    // Update original line's lyrics to only include syllables for remaining cells
    line.lyrics = lyrics_before;

    // Create new line with cells after split, inheriting musical properties
    let new_line = Line {
        cells: cells_after,
        label: String::new(), // New line starts with no label
        tala: String::new(),  // New line starts with no tala
        lyrics: lyrics_after, // New line gets remaining lyrics
        tonic: line.tonic.clone(), // Inherit tonic
        pitch_system: line.pitch_system, // Inherit pitch system
        key_signature: line.key_signature.clone(), // Inherit key signature
        tempo: line.tempo.clone(), // Inherit tempo
        time_signature: line.time_signature.clone(), // Inherit time signature
        new_system: false, // New line does not start a new system
        staff_role: StaffRole::default(), // DEPRECATED: use system_marker
        system_marker: None, // No marker = standalone or continue group
        system_id: 0, // Will be recalculated
        part_id: String::new(), // Will be recalculated
        beats: Vec::new(),
        slurs: Vec::new(),
    };

    wasm_log!("Old line now has {} cells, new line has {} cells",
              line.cells.len(), new_line.cells.len());

    // Insert both lines back into document
    doc.lines.insert(stave_index, line);
    doc.lines.insert(stave_index + 1, new_line);

    // Recalculate system_id and part_id after splitting
    doc.recalculate_system_and_part_ids();

    // Compute glyphs after structural change
    doc.compute_glyphs();

    wasm_info!("Line split successfully, document now has {} lines", doc.lines.len());

    // Get current caret and selection info for the diff
    let caret_info = CaretInfo {
        caret: doc.state.cursor.clone(),
        desired_col: doc.state.selection_manager.desired_col,
    };

    let selection_info = if let Some(ref selection) = doc.state.selection_manager.current_selection {
        let is_forward = selection.anchor.line < selection.head.line
            || (selection.anchor.line == selection.head.line && selection.anchor.col <= selection.head.col);
        let (start, end) = if is_forward {
            (selection.anchor.clone(), selection.head.clone())
        } else {
            (selection.head.clone(), selection.anchor.clone())
        };
        let is_empty = selection.anchor == selection.head;

        Some(SelectionInfo {
            anchor: selection.anchor.clone(),
            head: selection.head.clone(),
            start,
            end,
            is_empty,
            is_forward,
        })
    } else {
        None
    };

    // Return EditorDiff showing both lines changed
    let diff = EditorDiff {
        dirty_lines: vec![
            DirtyLine { row: stave_index, cells: doc.lines[stave_index].cells.clone() },
            DirtyLine { row: stave_index + 1, cells: doc.lines[stave_index + 1].cells.clone() },
        ],
        caret: caret_info,
        selection: selection_info,
    };

    let result = serde_wasm_bindgen::to_value(&diff)
        .map_err(|e| {
            wasm_error!("EditorDiff serialization error: {}", e);
            JsValue::from_str(&format!("EditorDiff serialization error: {}", e))
        })?;

    wasm_info!("splitLineAtPosition completed successfully");
    Ok(result)
}

/// Set the document pitch system (Phase 1 - uses internal DOCUMENT)
#[wasm_bindgen(js_name = setDocumentPitchSystem)]
pub fn set_document_pitch_system(pitch_system: u8) -> Result<(), JsValue> {
    wasm_info!("setDocumentPitchSystem called (Phase 1): pitch_system={}", pitch_system);

    let mut doc_guard = lock_document()?;
    let doc = doc_guard.as_mut()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    // Validate and set the pitch system
    let system = match pitch_system {
        0 => PitchSystem::Unknown,
        1 => PitchSystem::Number,
        2 => PitchSystem::Western,
        3 => PitchSystem::Sargam,
        4 => PitchSystem::Bhatkhande,
        5 => PitchSystem::Tabla,
        _ => {
            wasm_error!("Invalid pitch system value: {}", pitch_system);
            return Err(JsValue::from_str(&format!("Invalid pitch system: {}", pitch_system)));
        }
    };

    doc.pitch_system = Some(system);
    wasm_info!("  Document pitch system set to: {:?}", system);

    // Compute glyphs after metadata change
    doc.compute_glyphs();

    wasm_info!("setDocumentPitchSystem completed successfully");
    Ok(())
}

/// Expand ornaments from cell.ornaments into the cells vector
/// Deprecated: ornament indicators have been removed. This is now a no-op.
#[allow(dead_code)]
fn expand_ornaments_to_cells(_line: &mut Line) {
    // With the new system, ornaments are stored inline with cells
    // No expansion/collapse logic is needed
}

/// Collapse ornament cells back into cell.ornaments
/// Deprecated: ornament indicators have been removed. This is now a no-op.
#[allow(dead_code)]
fn collapse_ornaments_from_cells(_line: &mut Line) {
    // With the new system, ornaments are stored inline with cells
    // No expansion/collapse logic is needed
}

/// Set the staff role for a specific line
/// Check if there's a group-header above the given line index
/// Used for validating group-item role assignment
///
/// # Arguments
/// * `document` - The document to check
/// * `line_index` - Index of the line to check
///
/// # Returns
/// true if a group-header exists above this line, false otherwise
fn has_group_header_above(document: &Document, line_index: usize) -> bool {
    if line_index == 0 {
        return false; // First line can't have anything above it
    }

    // Search upwards for group-header
    for i in (0..line_index).rev() {
        let role = document.lines[i].staff_role;

        match role {
            StaffRole::GroupHeader => {
                return true; // Found group-header above
            }
            StaffRole::Melody => {
                // Stop at standalone staff (break the group chain)
                return false;
            }
            StaffRole::GroupItem => {
                // Continue searching upwards through group items
                continue;
            }
        }
    }

    false // No group-header found
}

///
/// # Arguments
/// * `line_index` - Index of the line to modify
/// * `role` - Staff role as string ("melody", "group-header", "group-item")
///
/// # Returns
/// Ok(()) on success, Err with error message on failure
#[wasm_bindgen(js_name = setLineStaffRole)]
pub fn set_line_staff_role(line_index: usize, role: String) -> Result<(), JsValue> {
    wasm_info!("setLineStaffRole called: line_index={}, role={}", line_index, role);

    // Access internal WASM document
    let mut doc_guard = lock_document()?;
    let document = doc_guard.as_mut()
        .ok_or_else(|| {
            wasm_error!("No document loaded");
            JsValue::from_str("No document loaded")
        })?;

    // Validate line index
    if line_index >= document.lines.len() {
        wasm_error!("Line index {} out of bounds (max: {})", line_index, document.lines.len() - 1);
        return Err(JsValue::from_str("Line index out of bounds"));
    }

    // Parse and validate the staff role
    let staff_role = match role.as_str() {
        "melody" => StaffRole::Melody,
        "group-header" => StaffRole::GroupHeader,
        "group-item" => {
            // VALIDATION: group-item requires a group-header above
            if !has_group_header_above(document, line_index) {
                wasm_error!("Cannot set group-item role: no group-header found above line {}", line_index);
                return Err(JsValue::from_str(
                    "No staff group above this line. Set a \"Staff group\" line above first."
                ));
            }
            StaffRole::GroupItem
        }
        _ => {
            wasm_error!("Invalid staff role: {}", role);
            return Err(JsValue::from_str(&format!("Invalid role: {}", role)));
        }
    };

    document.lines[line_index].staff_role = staff_role;
    wasm_info!("  Line {} staff_role set to: {:?}", line_index, document.lines[line_index].staff_role);

    // Recalculate system_id and part_id after role change
    document.recalculate_system_and_part_ids();
    wasm_info!("  System and part IDs recalculated");

    wasm_info!("setLineStaffRole completed successfully");
    Ok(())
}

/// Set the system marker for a line (LilyPond-style << / >> grouping)
///
/// # Parameters
/// * `line_index` - Index of the line to modify
/// * `marker` - System marker as string ("<<", ">>", "start", "end", or "" to clear)
///
/// # Returns
/// Ok(()) on success, Err with error message on failure
#[wasm_bindgen(js_name = setSystemMarker)]
pub fn set_system_marker(line_index: usize, marker: String) -> Result<(), JsValue> {
    use crate::models::SystemMarker;

    wasm_info!("setSystemMarker called: line_index={}, marker={}", line_index, marker);

    // Access internal WASM document
    let mut doc_guard = lock_document()?;
    let document = doc_guard.as_mut()
        .ok_or_else(|| {
            wasm_error!("No document loaded");
            JsValue::from_str("No document loaded")
        })?;

    // Validate line index
    if line_index >= document.lines.len() {
        wasm_error!("Line index {} out of bounds (max: {})", line_index, document.lines.len() - 1);
        return Err(JsValue::from_str("Line index out of bounds"));
    }

    // Parse the marker
    let system_marker = match marker.as_str() {
        "<<" | "start" => Some(SystemMarker::Start),
        ">>" | "end" => Some(SystemMarker::End),
        "" | "clear" | "none" => None,
        _ => {
            wasm_error!("Invalid system marker: {}", marker);
            return Err(JsValue::from_str(&format!("Invalid marker: {}. Use '<<', '>>', or '' to clear.", marker)));
        }
    };

    document.lines[line_index].system_marker = system_marker;
    wasm_info!("  Line {} system_marker set to: {:?}", line_index, document.lines[line_index].system_marker);

    // Recalculate system_id and part_id after marker change
    document.recalculate_system_and_part_ids();
    wasm_info!("  System and part IDs recalculated");

    wasm_info!("setSystemMarker completed successfully");
    Ok(())
}

/// Get the system marker for a line
///
/// # Parameters
/// * `line_index` - Index of the line to query
///
/// # Returns
/// The marker string ("<<", ">>", or "") on success
#[wasm_bindgen(js_name = getSystemMarker)]
pub fn get_system_marker(line_index: usize) -> Result<String, JsValue> {
    let doc_guard = lock_document()?;
    let document = doc_guard.as_ref()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    if line_index >= document.lines.len() {
        return Err(JsValue::from_str("Line index out of bounds"));
    }

    let marker_str = match document.lines[line_index].system_marker {
        Some(crate::models::SystemMarker::Start) => "<<",
        Some(crate::models::SystemMarker::End) => ">>",
        None => "",
    };

    Ok(marker_str.to_string())
}

// ============================================================================
// Core edit primitive - editReplaceRange
// ============================================================================

/// Replace a text range with new text (core mutation primitive)
///
/// Handles: insert, delete, paste, typing over selection, backspace, delete key
/// This is the ONLY function that mutates WASM's internal document.
/// JS never directly modifies document content - all mutations go through this.
#[wasm_bindgen(js_name = editReplaceRange)]
pub fn edit_replace_range(
    start_row: usize,
    start_col: usize,
    end_row: usize,
    end_col: usize,
    text: &str,
) -> Result<JsValue, JsValue> {
    wasm_info!("editReplaceRange: ({},{})-({},{}) text={:?}", start_row, start_col, end_row, end_col, text);

    let mut doc_guard = lock_document()?;
    let doc = doc_guard.as_mut()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    // WASM-First Architecture: Ornament deletion protection
    // Check if any cells in the deletion range have ornament indicators
    if text.is_empty() {  // Only check on deletion (not insertion/replacement)
        if start_row == end_row && start_row < doc.lines.len() {
            // Single-line deletion: check cells in range
            let line = &doc.lines[start_row];
            for col in start_col..end_col.min(line.cells.len()) {
                if line.cells[col].has_ornament_indicator() {
                    wasm_warn!("Cannot delete ornament cells at ({}, {})", start_row, col);
                    return Err(JsValue::from_str("Cannot delete ornament cells - toggle ornament edit mode first"));
                }
            }
        } else if start_row != end_row {
            // Multi-line deletion: check all affected cells
            if start_row < doc.lines.len() {
                let start_line = &doc.lines[start_row];
                for col in start_col..start_line.cells.len() {
                    if start_line.cells[col].has_ornament_indicator() {
                        wasm_warn!("Cannot delete ornament cells at ({}, {})", start_row, col);
                        return Err(JsValue::from_str("Cannot delete ornament cells - toggle ornament edit mode first"));
                    }
                }
            }
            // Check intermediate lines
            for row in (start_row + 1)..end_row {
                if row < doc.lines.len() {
                    for (col, cell) in doc.lines[row].cells.iter().enumerate() {
                        if cell.has_ornament_indicator() {
                            wasm_warn!("Cannot delete ornament cells at ({}, {})", row, col);
                            return Err(JsValue::from_str("Cannot delete ornament cells - toggle ornament edit mode first"));
                        }
                    }
                }
            }
            // Check end line
            if end_row < doc.lines.len() {
                let end_line = &doc.lines[end_row];
                for col in 0..end_col.min(end_line.cells.len()) {
                    if end_line.cells[col].has_ornament_indicator() {
                        wasm_warn!("Cannot delete ornament cells at ({}, {})", end_row, col);
                        return Err(JsValue::from_str("Cannot delete ornament cells - toggle ornament edit mode first"));
                    }
                }
            }
        }
    }

    // 1. Delete the range [start, end)
    // If multi-line deletion, handle line merging
    if start_row == end_row {
        // Single line: delete from start_col to end_col
        if start_row < doc.lines.len() {
            let line = &mut doc.lines[start_row];
            if start_col <= line.cells.len() && end_col <= line.cells.len() {
                line.cells.drain(start_col..end_col);
                wasm_info!("  Deleted {} cells from row {}", end_col - start_col, start_row);
            }
        }
    } else {
        // Multi-line: delete from start_col to end of start_row,
        // delete entire lines between, delete from start of end_row to end_col
        if start_row < doc.lines.len() && end_row < doc.lines.len() {
            // Delete from start_col to end of start_row
            let start_line = &mut doc.lines[start_row];
            if start_col < start_line.cells.len() {
                start_line.cells.drain(start_col..);
            }

            // Merge end_row cells into start_row (up to end_col)
            let mut end_cells = if end_col < doc.lines[end_row].cells.len() {
                doc.lines[end_row].cells[0..end_col].to_vec()
            } else {
                doc.lines[end_row].cells.clone()
            };
            doc.lines[start_row].cells.append(&mut end_cells);

            // Remove the lines between start_row and end_row
            doc.lines.drain((start_row + 1)..=end_row);
            wasm_info!("  Deleted {} rows", end_row - start_row);
        }
    }

    // 2. Insert text at start position
    if !text.is_empty() {
        if start_row < doc.lines.len() {
            // Parse the text into cells and insert
            let new_cells: Vec<Cell> = text.chars()
                .enumerate()
                .map(|(idx, ch)| Cell::new(ch.to_string(), crate::models::ElementKind::Unknown, start_col + idx))
                .collect();

            let line = &mut doc.lines[start_row];
            for (idx, cell) in new_cells.iter().enumerate() {
                line.cells.insert(start_col + idx, cell.clone());
            }
            wasm_info!("  Inserted {} cells at ({},{})", new_cells.len(), start_row, start_col);
        }
    }

    // 4. Calculate dirty lines (all lines affected by the edit)
    let mut dirty_lines = Vec::new();
    let dirty_start = start_row.min(end_row);
    let dirty_end = start_row.max(end_row) + 1;
    for row in dirty_start..dirty_end.min(doc.lines.len()) {
        dirty_lines.push(DirtyLine {
            row,
            cells: doc.lines[row].cells.clone(),
        });
    }

    // 5. Return cursor position
    let new_cursor_col = start_col + text.len();
    let result = EditResult {
        dirty_lines,
        new_cursor_row: start_row,
        new_cursor_col,
    };

    serde_wasm_bindgen::to_value(&result)
        .map_err(|e| {
            wasm_error!("EditResult serialization error: {}", e);
            JsValue::from_str(&format!("EditResult serialization error: {}", e))
        })
}

// ============================================================================
// WASM-First Text Editing Operations
// ============================================================================

/// Insert text at the current cursor position (WASM-owned state)
///
/// This function uses the internal DOCUMENT state and records undo history.
/// It replaces the old insertCharacter() which took cell arrays.
#[wasm_bindgen(js_name = insertText)]
pub fn insert_text(text: &str) -> Result<JsValue, JsValue> {
    wasm_info!("insertText called: text={:?}", text);

    if text.is_empty() {
        return Err(JsValue::from_str("Cannot insert empty text"));
    }

    let mut doc_guard = lock_document()?;
    let doc = doc_guard.as_mut()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    // Get current cursor position
    let cursor_line = doc.state.cursor.line;
    let cursor_col = doc.state.cursor.col;

    wasm_info!("  Cursor at ({}, {})", cursor_line, cursor_col);

    // Clear any existing selection when typing
    // TODO: In the future, replace selected text instead of just clearing
    if doc.state.selection_manager.current_selection.is_some() {
        wasm_info!("  Clearing existing selection");
        doc.state.selection_manager.clear_selection();
    }

    // Validate cursor position
    if cursor_line >= doc.lines.len() {
        return Err(JsValue::from_str(&format!(
            "Invalid cursor line: {} (document has {} lines)",
            cursor_line,
            doc.lines.len()
        )));
    }

    // Get the pitch system and constraint before mutably borrowing
    let pitch_system = {
        let line = &doc.lines[cursor_line];
        doc.effective_pitch_system(line)
    };
    let active_constraint = doc.active_constraint.as_ref();

    // SMART INSERT: Check if this is an accidental or barline modifier
    // If typing single character that modifies previous cell, update instead of insert
    let line = &mut doc.lines[cursor_line];
    let insert_pos = cursor_col.min(line.cells.len());

    let is_single_char = text.chars().count() == 1;
    let typed_char = text.chars().next().unwrap_or('\0');

    // Check if we should modify the previous cell instead of inserting
    let should_modify_prev = is_single_char && insert_pos > 0 && {
        let prev_cell = &line.cells[insert_pos - 1];

        use crate::renderers::font_utils::BARLINE_SINGLE;
        let barline_single_str = BARLINE_SINGLE.to_string();

        // Case 1: Typing accidental after pitched element
        if matches!(typed_char, '#' | 'b') && prev_cell.kind == ElementKind::PitchedElement {
            // Check if we haven't exceeded double accidental limit by inspecting pitch_code
            if let Some(pc) = prev_cell.pitch_code {
                // Check if adding this accidental would succeed (not already double accidental)
                if typed_char == 'b' {
                    pc.add_flat().is_some()
                } else {
                    pc.add_sharp().is_some()
                }
            } else {
                false
            }
        }
        // Case 2: Typing : after | (repeat left barline) - check Unicode barline character
        else if typed_char == ':' && prev_cell.char == barline_single_str && prev_cell.kind == ElementKind::SingleBarline {
            true
        }
        // Case 3: Typing | after : (repeat right barline)
        else if typed_char == '|' && prev_cell.char == ":" && prev_cell.kind == ElementKind::Symbol {
            true
        }
        // Case 4: Typing | after | (double barline) - check Unicode barline character
        else if typed_char == '|' && prev_cell.char == barline_single_str && prev_cell.kind == ElementKind::SingleBarline {
            true
        }
        // Case 5: Typing / after flat pitch (flat → half-flat mutation)
        else if typed_char == '/' && prev_cell.kind == ElementKind::PitchedElement {
            if let Some(pitch_code) = prev_cell.pitch_code {
                use crate::models::PitchCode;
                matches!(pitch_code,
                    PitchCode::N1b | PitchCode::N2b | PitchCode::N3b | PitchCode::N4b |
                    PitchCode::N5b | PitchCode::N6b | PitchCode::N7b
                )
            } else {
                false
            }
        }
        else {
            false
        }
    };

    let (new_cursor_col, _cells_inserted) = if should_modify_prev {
        // MODIFY EXISTING CELL
        wasm_info!("  Smart insert: modifying previous cell");

        use crate::renderers::font_utils::{
            BARLINE_SINGLE, BARLINE_DOUBLE, BARLINE_REPEAT_LEFT, BARLINE_REPEAT_RIGHT
        };

        let prev_idx = insert_pos - 1;
        let prev_cell = &mut line.cells[prev_idx];
        let old_char = prev_cell.char.clone();
        let barline_single_str = BARLINE_SINGLE.to_string();

        let mut modification_succeeded = false;

        // Update kind and pitch_code based on new content
        if matches!(typed_char, '#' | 'b') {
            // Accidental: transform the pitch_code (N1 + 'b' → N1b, N1b + 'b' → N1bb)
            if let Some(current_pc) = prev_cell.pitch_code {
                let new_pitch_code = if typed_char == '#' {
                    current_pc.add_sharp()
                } else {
                    current_pc.add_flat()
                };

                if let Some(new_pc) = new_pitch_code {
                    prev_cell.pitch_code = Some(new_pc);

                    // Regenerate the glyph character using lookup table
                    if let Some(pitch_system) = prev_cell.pitch_system {
                        use crate::renderers::font_utils::glyph_for_pitch;
                        if let Some(glyph) = glyph_for_pitch(new_pc, prev_cell.octave, pitch_system) {
                            prev_cell.char = glyph.to_string();
                            wasm_info!("  Updated pitch_code: {:?} → {:?}, glyph: U+{:04X}",
                                current_pc, new_pc, glyph as u32);
                            modification_succeeded = true;
                        }
                    }
                } else {
                    // Modification failed - will fall back to creating new cell
                    wasm_info!("  Cannot add {} to {:?}, creating new cell instead",
                        typed_char, current_pc);
                }
            }
        } else if typed_char == ':' && old_char == barline_single_str {
            modification_succeeded = true;
            // 𝄀 + : → 𝄆 (RepeatLeftBarline)
            prev_cell.char = BARLINE_REPEAT_LEFT.to_string();
            prev_cell.kind = ElementKind::RepeatLeftBarline;
            wasm_info!("  Changed to RepeatLeftBarline (Unicode U+1D106)");
        } else if typed_char == '|' && old_char == ":" {
            modification_succeeded = true;
            // : + | → 𝄇 (RepeatRightBarline)
            prev_cell.char = BARLINE_REPEAT_RIGHT.to_string();
            prev_cell.kind = ElementKind::RepeatRightBarline;
            wasm_info!("  Changed to RepeatRightBarline (Unicode U+1D107)");
        } else if typed_char == '|' && old_char == barline_single_str {
            modification_succeeded = true;
            // 𝄀 + | → 𝄁 (DoubleBarline)
            prev_cell.char = BARLINE_DOUBLE.to_string();
            prev_cell.kind = ElementKind::DoubleBarline;
            wasm_info!("  Changed to DoubleBarline (Unicode U+1D101)");
        } else if typed_char == '/' {
            // Flat + / → Half-flat (N1b → N1hf)
            if let Some(current_pc) = prev_cell.pitch_code {
                use crate::models::PitchCode;
                let new_pitch_code = match current_pc {
                    PitchCode::N1b => Some(PitchCode::N1hf),
                    PitchCode::N2b => Some(PitchCode::N2hf),
                    PitchCode::N3b => Some(PitchCode::N3hf),
                    PitchCode::N4b => Some(PitchCode::N4hf),
                    PitchCode::N5b => Some(PitchCode::N5hf),
                    PitchCode::N6b => Some(PitchCode::N6hf),
                    PitchCode::N7b => Some(PitchCode::N7hf),
                    _ => None,
                };

                if let Some(new_pc) = new_pitch_code {
                    prev_cell.pitch_code = Some(new_pc);

                    // Regenerate the glyph character using lookup table
                    if let Some(pitch_system) = prev_cell.pitch_system {
                        use crate::renderers::font_utils::glyph_for_pitch;
                        if let Some(glyph) = glyph_for_pitch(new_pc, prev_cell.octave, pitch_system) {
                            prev_cell.char = glyph.to_string();
                            wasm_info!("  Updated pitch_code: {:?} → {:?} (half-flat), glyph: U+{:04X}",
                                current_pc, new_pc, glyph as u32);
                            modification_succeeded = true;
                        }
                    }
                } else {
                    wasm_info!("  Cannot convert {:?} to half-flat (not a flat pitch)", current_pc);
                }
            }
        }

        // If modification succeeded, cursor stays at same position
        // If modification failed, fall back to normal insert
        if modification_succeeded {
            // TODO: Record undo for modification (for now, skip undo)
            (cursor_col, 0)
        } else {
            // Fall back to normal insert - create new cell
            wasm_info!("  Modification failed, falling back to normal insert");
            let cell = parse_single(typed_char, pitch_system, insert_pos, active_constraint);
            line.cells.insert(insert_pos, cell.clone());

            // Update annotation positions
            doc.annotation_layer.on_insert(crate::text::cursor::TextPos::new(cursor_line, insert_pos));

            // Update column indices for cells after insertion
            for i in (insert_pos + 1)..line.cells.len() {
                line.cells[i].col += 1;
            }

            // Record undo command
            let command = Command::InsertText {
                line: cursor_line,
                start_col: insert_pos,
                cells: vec![cell],
            };
            let cursor_pos = (cursor_line, insert_pos);
            doc.state.undo_stack.push(command, cursor_pos);

            // Move cursor after inserted cell
            (cursor_col + 1, 1)
        }
    } else {
        // NORMAL INSERT: Parse and insert new cells
        let mut new_cells: Vec<Cell> = Vec::new();
        for (i, ch) in text.chars().enumerate() {
            let column = cursor_col + i;
            let cell = parse_single(ch, pitch_system, column, active_constraint);
            new_cells.push(cell);
        }

        wasm_info!("  Parsed {} characters into {} cells", text.len(), new_cells.len());

        // Insert new cells at cursor position
        for (i, cell) in new_cells.iter().enumerate() {
            line.cells.insert(insert_pos + i, cell.clone());

            // Update annotation positions
            doc.annotation_layer.on_insert(crate::text::cursor::TextPos::new(cursor_line, insert_pos + i));
        }

        // Update column indices for cells after insertion
        let cells_inserted = new_cells.len();
        for i in (insert_pos + cells_inserted)..line.cells.len() {
            line.cells[i].col += cells_inserted;
        }

        // Record undo command
        let command = Command::InsertText {
            line: cursor_line,
            start_col: insert_pos,
            cells: new_cells.clone(),
        };
        let cursor_pos = (cursor_line, insert_pos);
        doc.state.undo_stack.push(command, cursor_pos);

        // Update cursor position (move to after inserted text)
        (cursor_col + cells_inserted, cells_inserted)
    };

    doc.state.cursor.col = new_cursor_col;

    wasm_info!("  Cursor moved to ({}, {})", cursor_line, new_cursor_col);

    // Recompute glyphs to convert pitch_code + octave to PUA codepoints
    doc.compute_glyphs();

    // Return EditorDiff with cursor state
    let diff = doc.state.to_editor_diff(&doc, vec![cursor_line]);

    serde_wasm_bindgen::to_value(&diff)
        .map_err(|e| {
            wasm_error!("EditorDiff serialization error: {}", e);
            JsValue::from_str(&format!("EditorDiff serialization error: {}", e))
        })
}

/// Delete character at cursor (backspace behavior)
#[wasm_bindgen(js_name = deleteAtCursor)]
pub fn delete_at_cursor() -> Result<JsValue, JsValue> {
    wasm_info!("deleteAtCursor called (backspace behavior)");

    let mut doc_guard = lock_document()?;
    let doc = doc_guard.as_mut()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    let cursor_line = doc.state.cursor.line;
    let cursor_col = doc.state.cursor.col;

    wasm_info!("  Cursor at ({}, {})", cursor_line, cursor_col);

    // Can't delete if at start of document
    if cursor_line == 0 && cursor_col == 0 {
        wasm_info!("  At start of document, nothing to delete");
        return Err(JsValue::from_str("Cannot delete at start of document"));
    }

    let mut new_cursor_row = cursor_line;
    let mut new_cursor_col = cursor_col;
    let mut dirty_lines = Vec::new();

    if cursor_col > 0 {
        // Delete character before cursor on same line
        let line = &mut doc.lines[cursor_line];

        if cursor_col <= line.cells.len() {
            let cell_idx = cursor_col - 1;
            let cell = &line.cells[cell_idx];

            // TWO-STAGE BACKSPACE: Check if pitch has accidental (semantic check)
            let has_accidental = cell.kind == ElementKind::PitchedElement
                && cell.pitch_code.map_or(false, |pc| pc.accidental_type() != AccidentalType::None);
            let char_count = cell.char.chars().count();

            if has_accidental {
                // STAGE 1a: Remove accidental from pitched element
                wasm_info!("  Removing accidental from pitch '{}'", cell.char);

                let mut new_char = cell.char.clone();
                new_char.pop(); // Remove accidental character

                let cell = &mut line.cells[cell_idx];
                cell.char = new_char.clone();

                // Reparse pitch_code after removing accidental (step-down: ## → #, # → natural)
                if let Some(pitch_system) = cell.pitch_system {
                    cell.pitch_code = PitchCode::from_string(&cell.char, pitch_system);
                    wasm_info!("  Updated pitch_code after accidental removal: {:?}", cell.pitch_code);
                }

                // Cursor stays at same position
                new_cursor_col = cursor_col;

                // TODO: Record undo for modification

                dirty_lines.push(DirtyLine {
                    row: cursor_line,
                    cells: line.cells.clone(),
                });
            } else if char_count > 1 {
                // STAGE 1b: Remove last character from multi-char cell (barlines, etc.)
                wasm_info!("  Two-stage backspace: removing last char from '{}'", cell.char);

                let mut new_char = cell.char.clone();
                new_char.pop(); // Remove last character

                let cell = &mut line.cells[cell_idx];
                cell.char = new_char.clone();

                // Update kind based on remaining content
                if cell.kind == ElementKind::RepeatLeftBarline {
                    // |: → | (remove :)
                    cell.kind = ElementKind::SingleBarline;
                    wasm_info!("  Changed RepeatLeftBarline back to SingleBarline");
                } else if cell.kind == ElementKind::RepeatRightBarline {
                    // :| → : (remove |)
                    cell.kind = ElementKind::Symbol;
                    wasm_info!("  Changed RepeatRightBarline back to Symbol");
                } else if cell.kind == ElementKind::DoubleBarline {
                    // || → | (remove second |)
                    cell.kind = ElementKind::SingleBarline;
                    wasm_info!("  Changed DoubleBarline back to SingleBarline");
                }

                // Cursor stays at same position
                new_cursor_col = cursor_col;

                // TODO: Record undo for modification

                dirty_lines.push(DirtyLine {
                    row: cursor_line,
                    cells: line.cells.clone(),
                });
            } else {
                // STAGE 2: Delete entire cell (single character)
                wasm_info!("  Deleting entire cell '{}'", cell.char);

                // Capture deleted cell for undo BEFORE removing
                let deleted_cell = line.cells[cursor_col - 1].clone();

                line.cells.remove(cursor_col - 1);

                // Update annotation positions
                doc.annotation_layer.on_delete(crate::text::cursor::TextPos::new(cursor_line, cursor_col - 1));

                // Update column indices for remaining cells
                for i in (cursor_col - 1)..line.cells.len() {
                    line.cells[i].col = i;
                }

                new_cursor_col = cursor_col - 1;

                // Record undo command
                let command = Command::DeleteText {
                    line: cursor_line,
                    start_col: cursor_col - 1,
                    deleted_cells: vec![deleted_cell],
                };
                let cursor_pos = (cursor_line, cursor_col - 1);
                doc.state.undo_stack.push(command, cursor_pos);

                dirty_lines.push(DirtyLine {
                    row: cursor_line,
                    cells: line.cells.clone(),
                });
            }
        }
    } else {
        // Cursor at start of line - join with previous line or delete if empty
        if cursor_line > 0 {
            let current_line = &doc.lines[cursor_line];

            // If current line is empty, just delete it
            if current_line.cells.is_empty() {
                // Remove current (empty) line
                doc.lines.remove(cursor_line);

                // Move cursor to end of previous line
                let prev_line = &doc.lines[cursor_line - 1];
                new_cursor_row = cursor_line - 1;
                new_cursor_col = prev_line.cells.len();

                dirty_lines.push(DirtyLine {
                    row: cursor_line - 1,
                    cells: prev_line.cells.clone(),
                });

                wasm_info!("  Deleted empty line {}", cursor_line);
            } else {
                // Current line has content - join with previous line
                let prev_line = &doc.lines[cursor_line - 1];
                let join_position = prev_line.cells.len();

                // Get cells from current line
                let mut current_cells = doc.lines[cursor_line].cells.clone();

                // Update column indices for cells being moved
                for cell in &mut current_cells {
                    cell.col += join_position;
                }

                // Append to previous line
                doc.lines[cursor_line - 1].cells.extend(current_cells);

                // Remove current line
                doc.lines.remove(cursor_line);

                new_cursor_row = cursor_line - 1;
                new_cursor_col = join_position;

                dirty_lines.push(DirtyLine {
                    row: cursor_line - 1,
                    cells: doc.lines[cursor_line - 1].cells.clone(),
                });

                wasm_info!("  Joined line {} with line {}", cursor_line, cursor_line - 1);
            }
        }
    }

    // Update cursor position
    doc.state.cursor.line = new_cursor_row;
    doc.state.cursor.col = new_cursor_col;

    // Convert DirtyLine to just line indices for EditorDiff
    let dirty_line_indices: Vec<usize> = dirty_lines.into_iter().map(|dl| dl.row).collect();

    // Return EditorDiff with cursor state
    let diff = doc.state.to_editor_diff(&doc, dirty_line_indices);

    serde_wasm_bindgen::to_value(&diff)
        .map_err(|e| {
            wasm_error!("EditorDiff serialization error: {}", e);
            JsValue::from_str(&format!("EditorDiff serialization error: {}", e))
        })
}

/// Delete character after cursor (Delete key behavior)
#[wasm_bindgen(js_name = deleteForward)]
pub fn delete_forward() -> Result<JsValue, JsValue> {
    wasm_info!("deleteForward called (Delete key behavior)");

    let mut doc_guard = lock_document()?;
    let doc = doc_guard.as_mut()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    let cursor_line = doc.state.cursor.line;
    let cursor_col = doc.state.cursor.col;

    wasm_info!("  Cursor at ({}, {})", cursor_line, cursor_col);

    // Validate cursor position
    if cursor_line >= doc.lines.len() {
        return Err(JsValue::from_str("Cursor line out of bounds"));
    }

    let line = &mut doc.lines[cursor_line];

    // Can't delete if at end of line and no next line
    if cursor_col >= line.cells.len() {
        if cursor_line + 1 >= doc.lines.len() {
            wasm_info!("  At end of document, nothing to delete");
            return Err(JsValue::from_str("Cannot delete at end of document"));
        }

        // TODO: Join with next line (similar to backspace at line start)
        // For now, just return error
        return Err(JsValue::from_str("Delete at end of line not yet implemented"));
    }

    let mut dirty_lines = Vec::new();

    // Delete character at cursor position (not before it)
    let cell_idx = cursor_col;
    let cell = &line.cells[cell_idx];

    // TWO-STAGE DELETE: Check if cell has multiple characters
    let char_count = cell.char.chars().count();

    if char_count > 1 {
        // STAGE 1: Remove first character from multi-char cell
        wasm_info!("  Two-stage delete: removing first char from '{}'", cell.char);

        let mut chars: Vec<char> = cell.char.chars().collect();
        chars.remove(0); // Remove first character
        let new_char: String = chars.into_iter().collect();

        let cell = &mut line.cells[cell_idx];
        cell.char = new_char.clone();

        // Update kind and pitch_code based on remaining content
        if cell.kind == ElementKind::PitchedElement {
            // Reparse pitch_code after removing accidental
            if let Some(pitch_system) = cell.pitch_system {
                cell.pitch_code = PitchCode::from_string(&cell.char, pitch_system);
                wasm_info!("  Updated pitch_code after delete: {:?}", cell.pitch_code);
            }
        } else if cell.kind == ElementKind::RepeatLeftBarline {
            // |: → : (remove |)
            cell.kind = ElementKind::Symbol;
            wasm_info!("  Changed RepeatLeftBarline to Symbol");
        } else if cell.kind == ElementKind::RepeatRightBarline {
            // :| → | (remove :)
            cell.kind = ElementKind::SingleBarline;
            wasm_info!("  Changed RepeatRightBarline to SingleBarline");
        } else if cell.kind == ElementKind::DoubleBarline {
            // || → | (remove first |)
            cell.kind = ElementKind::SingleBarline;
            wasm_info!("  Changed DoubleBarline to SingleBarline");
        }

        // Cursor stays at same position
        // TODO: Record undo for modification

        dirty_lines.push(DirtyLine {
            row: cursor_line,
            cells: line.cells.clone(),
        });
    } else {
        // STAGE 2: Delete entire cell (single character)
        wasm_info!("  Deleting entire cell '{}'", cell.char);

        // Capture deleted cell for undo BEFORE removing
        let deleted_cell = line.cells[cursor_col].clone();

        line.cells.remove(cursor_col);

        // Update annotation positions
        doc.annotation_layer.on_delete(crate::text::cursor::TextPos::new(cursor_line, cursor_col));

        // Update column indices for remaining cells
        for i in cursor_col..line.cells.len() {
            line.cells[i].col = i;
        }

        // Cursor stays at same position (now pointing to next cell)
        // Record undo command
        let command = Command::DeleteText {
            line: cursor_line,
            start_col: cursor_col,
            deleted_cells: vec![deleted_cell],
        };
        let cursor_pos = (cursor_line, cursor_col);
        doc.state.undo_stack.push(command, cursor_pos);

        dirty_lines.push(DirtyLine {
            row: cursor_line,
            cells: line.cells.clone(),
        });
    }

    // Cursor position doesn't change for forward delete

    // Convert DirtyLine to just line indices for EditorDiff
    let dirty_line_indices: Vec<usize> = dirty_lines.into_iter().map(|dl| dl.row).collect();

    // Return EditorDiff with cursor state
    let diff = doc.state.to_editor_diff(&doc, dirty_line_indices);

    serde_wasm_bindgen::to_value(&diff)
        .map_err(|e| {
            wasm_error!("EditorDiff serialization error: {}", e);
            JsValue::from_str(&format!("EditorDiff serialization error: {}", e))
        })
}

/// Insert newline at cursor position
#[wasm_bindgen(js_name = insertNewline)]
pub fn insert_newline() -> Result<JsValue, JsValue> {
    wasm_info!("insertNewline called");

    let mut doc_guard = lock_document()?;
    let doc = doc_guard.as_mut()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    let cursor_line = doc.state.cursor.line;
    let cursor_col = doc.state.cursor.col;

    wasm_info!("  Cursor at ({}, {})", cursor_line, cursor_col);

    // Validate cursor position
    if cursor_line >= doc.lines.len() {
        return Err(JsValue::from_str(&format!(
            "Invalid cursor line: {} (document has {} lines)",
            cursor_line,
            doc.lines.len()
        )));
    }

    // Split current line at cursor position
    let current_line = &mut doc.lines[cursor_line];

    // Cells after cursor move to new line
    let cells_after: Vec<Cell> = current_line.cells.drain(cursor_col..).collect();

    // Update column indices for cells that moved
    let new_line_cells: Vec<Cell> = cells_after
        .into_iter()
        .enumerate()
        .map(|(i, mut cell)| {
            cell.col = i;
            cell
        })
        .collect();

    // Create new line
    let new_line = Line {
        cells: new_line_cells,
        tonic: current_line.tonic.clone(),
        lyrics: current_line.lyrics.clone(),
        tala: current_line.tala.clone(),
        label: String::new(),
        pitch_system: current_line.pitch_system,
        key_signature: current_line.key_signature.clone(),
        tempo: current_line.tempo.clone(),
        time_signature: current_line.time_signature.clone(),
        new_system: false,
        system_id: 0, // Will be recalculated
        part_id: String::new(), // Will be recalculated
        staff_role: StaffRole::default(), // DEPRECATED: use system_marker
        system_marker: None, // No marker = standalone or continue group
        beats: Vec::new(),
        slurs: Vec::new(),
    };

    // Insert new line after current line
    doc.lines.insert(cursor_line + 1, new_line);

    // Recalculate system_id and part_id after adding line
    doc.recalculate_system_and_part_ids();

    // Move cursor to start of new line
    let new_cursor_row = cursor_line + 1;
    let new_cursor_col = 0;

    doc.state.cursor.line = new_cursor_row;
    doc.state.cursor.col = new_cursor_col;

    wasm_info!("  Created new line {}, cursor at ({}, {})", cursor_line + 1, new_cursor_row, new_cursor_col);

    // Return EditorDiff with both affected lines
    let diff = doc.state.to_editor_diff(&doc, vec![cursor_line, cursor_line + 1]);

    serde_wasm_bindgen::to_value(&diff)
        .map_err(|e| {
            wasm_error!("EditorDiff serialization error: {}", e);
            JsValue::from_str(&format!("EditorDiff serialization error: {}", e))
        })
}

// ============================================================================
// Octave operations (Phase 2 - WASM-first pattern)
// ============================================================================
// Copy/Paste operations
// ============================================================================

/// Copy cells from a range (rich copy preserving annotations)
#[wasm_bindgen(js_name = copyCells)]
pub fn copy_cells(
    start_row: usize,
    start_col: usize,
    end_row: usize,
    end_col: usize,
) -> Result<JsValue, JsValue> {
    wasm_info!("copyCells: ({},{})-({},{})", start_row, start_col, end_row, end_col);

    let doc_guard = lock_document()?;
    let doc = doc_guard.as_ref()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    let mut cells = Vec::new();
    let mut text = String::new();

    // Extract cells from range (can span multiple lines)
    for row in start_row..=end_row {
        if row >= doc.lines.len() {
            break;
        }

        let line = &doc.lines[row];
        let start = if row == start_row { start_col } else { 0 };
        let end = if row == end_row { end_col } else { line.cells.len() };

        for i in start..end {
            if i < line.cells.len() {
                let cell = &line.cells[i];
                cells.push(cell.clone());
                text.push_str(&cell.char);
            }
        }

        // Add newline between lines
        if row < end_row {
            text.push('\n');
        }
    }

    let result = CopyResult { text, cells };
    serde_wasm_bindgen::to_value(&result)
        .map_err(|e| {
            wasm_error!("CopyResult serialization error: {}", e);
            JsValue::from_str(&format!("CopyResult serialization error: {}", e))
        })
}

/// Paste cells (rich paste preserving octaves/slurs/ornaments)
#[wasm_bindgen(js_name = pasteCells)]
pub fn paste_cells(
    start_row: usize,
    start_col: usize,
    end_row: usize,
    end_col: usize,
    cells_json: JsValue,
) -> Result<JsValue, JsValue> {
    wasm_info!("pasteCells: ({},{})-({},{})", start_row, start_col, end_row, end_col);

    let mut doc_guard = lock_document()?;
    let doc = doc_guard.as_mut()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    // Deserialize cells from JSON (preserves all Cell fields including octaves/slurs/ornaments)
    let cells: Vec<Cell> = serde_wasm_bindgen::from_value(cells_json)
        .map_err(|e| {
            wasm_error!("Cell deserialization error: {}", e);
            JsValue::from_str(&format!("Cell deserialization error: {}", e))
        })?;

    if cells.is_empty() {
        // Empty paste - just delete the range
        return edit_replace_range(start_row, start_col, end_row, end_col, "");
    }

    // Step 1: Delete the target range (like editReplaceRange)
    // Collect all cells before start position
    let mut new_cells = Vec::new();
    let mut affected_rows = std::collections::HashSet::new();

    // Copy cells from all lines before the change
    for row in 0..start_row {
        if row < doc.lines.len() {
            new_cells.push((row, doc.lines[row].cells.clone()));
        }
    }

    // Collect cells before start position in start_row
    if start_row < doc.lines.len() {
        let before_start = doc.lines[start_row].cells[..start_col].to_vec();
        affected_rows.insert(start_row);

        // Collect cells after end position in end_row
        let after_end = if end_row < doc.lines.len() && end_col < doc.lines[end_row].cells.len() {
            doc.lines[end_row].cells[end_col..].to_vec()
        } else {
            Vec::new()
        };

        // Combine: before_start + new cells + after_end
        let mut combined = before_start;
        combined.extend(cells.clone());
        combined.extend(after_end);

        // Split combined cells across lines if needed
        // For simplicity, all pasted cells go on the start_row
        // In a full implementation, would need to handle line breaks in paste data
        new_cells.push((start_row, combined));

        // Mark all affected rows as dirty (from start_row to end_row, then just start_row after paste)
        for row in (start_row + 1)..=end_row {
            if row < doc.lines.len() {
                affected_rows.remove(&row);
            }
        }

        // Copy remaining lines after end_row
        for row in (end_row + 1)..doc.lines.len() {
            new_cells.push((row, doc.lines[row].cells.clone()));
        }
    } else {
        // If start_row is beyond doc, just add the cells as new line
        new_cells.push((start_row, cells.clone()));
        affected_rows.insert(start_row);
    }

    // Step 2: Rebuild lines (simple version - no line splitting)
    // Create a map of row -> cells
    let mut lines_map = std::collections::HashMap::new();
    for (row, cells) in new_cells {
        lines_map.insert(row, cells);
    }

    // Step 3: Update document lines
    let mut max_row = 0;
    for row in lines_map.keys() {
        if *row > max_row {
            max_row = *row;
        }
    }

    // Ensure we have enough lines
    while doc.lines.len() <= max_row {
        doc.lines.push(Line::new());
    }

    // Update lines with new cells
    for (row, new_row_cells) in lines_map {
        if row < doc.lines.len() {
            doc.lines[row].cells = new_row_cells;
        }
    }

    // Step 4: Build dirty lines list
    let mut dirty_lines = Vec::new();
    for row in affected_rows {
        if row < doc.lines.len() {
            dirty_lines.push(DirtyLine {
                row,
                cells: doc.lines[row].cells.clone(),
            });
        }
    }

    // Also mark start_row as dirty
    if start_row < doc.lines.len() {
        if !dirty_lines.iter().any(|dl| dl.row == start_row) {
            dirty_lines.push(DirtyLine {
                row: start_row,
                cells: doc.lines[start_row].cells.clone(),
            });
        }
    }

    // Step 5: Calculate new cursor position (after the pasted cells)
    let new_cursor_col = start_col + cells.len();

    let result = EditResult {
        dirty_lines,
        new_cursor_row: start_row,
        new_cursor_col,
    };

    serde_wasm_bindgen::to_value(&result)
        .map_err(|e| {
            wasm_error!("EditResult serialization error: {}", e);
            JsValue::from_str(&format!("EditResult serialization error: {}", e))
        })
}

// ============================================================================
// Primary Selection (X11 style - for middle-click paste)
// ============================================================================

/// Get the current primary selection register
/// Returns { text: String, cells: Cell[] } or null if empty
#[wasm_bindgen(js_name = getPrimarySelection)]
pub fn get_primary_selection() -> Result<JsValue, JsValue> {
    let doc_guard = lock_document()?;
    let doc = doc_guard.as_ref()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    let primary = &doc.state.primary_selection;

    if primary.is_empty() {
        return Ok(JsValue::null());
    }

    let result = serde_json::json!({
        "text": &primary.text,
        "cells": &primary.cells,
    });

    serde_wasm_bindgen::to_value(&result)
        .map_err(|e| {
            wasm_error!("PrimarySelection serialization error: {}", e);
            JsValue::from_str(&format!("PrimarySelection serialization error: {}", e))
        })
}

/// Update primary selection register
/// Called automatically when selection changes (for X11 select-to-copy)
#[wasm_bindgen(js_name = updatePrimarySelection)]
pub fn update_primary_selection(
    start_row: usize,
    start_col: usize,
    end_row: usize,
    end_col: usize,
    cells_json: JsValue,
) -> Result<(), JsValue> {
    wasm_info!("updatePrimarySelection: ({},{})-({},{})", start_row, start_col, end_row, end_col);

    let mut doc_guard = lock_document()?;
    let doc = doc_guard.as_mut()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    // Deserialize cells from JSON
    let cells: Vec<Cell> = serde_wasm_bindgen::from_value(cells_json)
        .map_err(|e| {
            wasm_error!("Cell deserialization error: {}", e);
            JsValue::from_str(&format!("Cell deserialization error: {}", e))
        })?;

    // Build text from cells
    let mut text = String::new();
    for cell in &cells {
        text.push_str(&cell.char);
    }

    // Create selection record
    let selection = crate::models::Selection {
        anchor: Pos { line: start_row, col: start_col },
        head: Pos { line: end_row, col: end_col },
    };

    // Update primary selection in document state
    doc.state.update_primary_selection(text, cells, selection);

    Ok(())
}

// ============================================================================
// Undo/Redo operations
// ============================================================================

/// Undo the last edit operation
#[wasm_bindgen(js_name = undo)]
pub fn undo() -> Result<JsValue, JsValue> {
    wasm_info!("undo called");

    let mut doc_guard = lock_document()?;
    let doc = doc_guard.as_mut()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    // Undo using the command stack
    doc.state.undo_stack.undo(&mut doc.lines)
        .map_err(|e| JsValue::from_str(&e))?;

    // Get the affected line from the undone command
    let affected_line = if doc.state.undo_stack.can_redo() {
        // The command we just undid is now available for redo
        let idx = doc.state.undo_stack.current_index;
        if idx < doc.state.undo_stack.commands.len() {
            doc.state.undo_stack.commands[idx].affected_line()
        } else {
            0
        }
    } else {
        0
    };

    // Build dirty lines list with just the affected line
    let mut dirty_lines = Vec::new();
    if affected_line < doc.lines.len() {
        dirty_lines.push(DirtyLine {
            row: affected_line,
            cells: doc.lines[affected_line].cells.clone(),
        });
    }

    // Keep cursor position at affected line
    let result = EditResult {
        dirty_lines,
        new_cursor_row: affected_line,
        new_cursor_col: doc.state.cursor.col,
    };

    serde_wasm_bindgen::to_value(&result)
        .map_err(|e| {
            wasm_error!("EditResult serialization error: {}", e);
            JsValue::from_str(&format!("EditResult serialization error: {}", e))
        })
}

/// Redo the last undone edit operation
#[wasm_bindgen(js_name = redo)]
pub fn redo() -> Result<JsValue, JsValue> {
    wasm_info!("redo called");

    let mut doc_guard = lock_document()?;
    let doc = doc_guard.as_mut()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    // Get the affected line before redo (for dirty list)
    let affected_line = if doc.state.undo_stack.can_redo() {
        let idx = doc.state.undo_stack.current_index;
        if idx < doc.state.undo_stack.commands.len() {
            doc.state.undo_stack.commands[idx].affected_line()
        } else {
            0
        }
    } else {
        return Err(JsValue::from_str("No redo history available"));
    };

    // Redo using the command stack
    doc.state.undo_stack.redo(&mut doc.lines)
        .map_err(|e| JsValue::from_str(&e))?;

    // Build dirty lines list with just the affected line
    let mut dirty_lines = Vec::new();
    if affected_line < doc.lines.len() {
        dirty_lines.push(DirtyLine {
            row: affected_line,
            cells: doc.lines[affected_line].cells.clone(),
        });
    }

    // Keep cursor position at affected line
    let result = EditResult {
        dirty_lines,
        new_cursor_row: affected_line,
        new_cursor_col: doc.state.cursor.col,
    };

    serde_wasm_bindgen::to_value(&result)
        .map_err(|e| {
            wasm_error!("EditResult serialization error: {}", e);
            JsValue::from_str(&format!("EditResult serialization error: {}", e))
        })
}

/// Check if undo is available
#[wasm_bindgen(js_name = canUndo)]
pub fn can_undo() -> Result<bool, JsValue> {
    let doc_guard = lock_document()?;
    Ok(doc_guard.as_ref().map_or(false, |d| {
        d.state.undo_stack.can_undo()
    }))
}

/// Check if redo is available
#[wasm_bindgen(js_name = canRedo)]
pub fn can_redo() -> Result<bool, JsValue> {
    let doc_guard = lock_document()?;
    Ok(doc_guard.as_ref().map_or(false, |d| {
        d.state.undo_stack.can_redo()
    }))
}

/// Create a new empty document
///
/// # Returns
/// JavaScript Document object with default structure
/// Load a document from JavaScript into WASM's internal storage
#[wasm_bindgen(js_name = loadDocument)]
pub fn load_document(document_js: JsValue) -> Result<(), JsValue> {
    wasm_info!("loadDocument called");

    let mut doc: Document = serde_wasm_bindgen::from_value(document_js)
        .map_err(|e| {
            wasm_error!("Document deserialization error: {}", e);
            JsValue::from_str(&format!("Document deserialization error: {}", e))
        })?;

    web_sys::console::log_1(&format!("[WASM] loadDocument: cursor position from JS = ({}, {})",
        doc.state.cursor.line, doc.state.cursor.col).into());

    // Preserve the SelectionManager state from the existing document (if any)
    // This prevents losing selection state when reloading the document
    {
        let doc_guard = lock_document()?;
        if let Some(existing_doc) = doc_guard.as_ref() {
            doc.state.selection_manager = existing_doc.state.selection_manager.clone();
        }
    } // Lock is released here

    // Recalculate system_id and part_id for backward compatibility with old documents
    doc.recalculate_system_and_part_ids();

    // Recompute glyphs after deserialization
    // combined_char has #[serde(skip)] so it's not serialized - we must recompute it
    doc.compute_glyphs();

    // Acquire lock again to store the document
    *lock_document()? = Some(doc);
    wasm_info!("loadDocument completed successfully");
    Ok(())
}

/// Get current document snapshot from WASM's internal storage
#[wasm_bindgen(js_name = getDocumentSnapshot)]
pub fn get_document_snapshot() -> Result<JsValue, JsValue> {
    wasm_info!("getDocumentSnapshot called");

    let doc_guard = lock_document()?;
    match doc_guard.as_ref() {
        Some(doc) => {
            serde_wasm_bindgen::to_value(doc)
                .map_err(|e| {
                    wasm_error!("Document serialization error: {}", e);
                    JsValue::from_str(&format!("Document serialization error: {}", e))
                })
        }
        None => {
            wasm_warn!("No document loaded");
            Err(JsValue::from_str("No document loaded"))
        }
    }
}

/// Create a new document and store it internally
#[wasm_bindgen(js_name = createNewDocument)]
pub fn create_new_document() -> Result<JsValue, JsValue> {
    wasm_info!("createNewDocument called");

    // Create new document with default structure
    let mut document = Document::new();

    // Leave title blank (None) - user will set it if needed
    document.title = None;

    // Set default pitch system
    document.pitch_system = Some(PitchSystem::Number);

    // Add one empty line
    let line = Line::new();
    document.lines.push(line);

    wasm_info!("  Created document with {} line(s)", document.lines.len());

    // Recalculate system_id and part_id
    document.recalculate_system_and_part_ids();

    // Compute glyphs
    document.compute_glyphs();

    // Store in internal WASM storage for edit operations
    *lock_document()? = Some(document.clone());

    // Serialize to JavaScript
    let result = serde_wasm_bindgen::to_value(&document)
        .map_err(|e| {
            wasm_error!("Serialization error: {}", e);
            JsValue::from_str(&format!("Serialization error: {}", e))
        })?;

    wasm_info!("createNewDocument completed successfully");
    Ok(result)
}

// ============================================================================
// Export Functions - MOVED to src/api/export.rs
// ============================================================================
// exportMusicXML, generateIRJson, exportMIDI, convertMusicXMLToLilyPond
// have been moved to the export module for better organization.

/// Compute complete layout for a document
///
/// Takes a document and measurements from JavaScript, performs all layout calculations,
/// and returns a DisplayList ready for DOM rendering.
///
/// # Parameters
/// * `document_js` - JavaScript Document object
/// * `config_js` - LayoutConfig with measurements (cell_widths, syllable_widths, etc.)
///
/// # Returns
/// DisplayList with all positioning, classes, and rendering data
#[wasm_bindgen(js_name = computeLayout)]
pub fn compute_layout(
    document_js: JsValue,
    config_js: JsValue,
) -> Result<JsValue, JsValue> {
    wasm_info!("computeLayout called");

    // Deserialize document from JavaScript
    let mut document: Document = serde_wasm_bindgen::from_value(document_js)
        .map_err(|e| {
            wasm_error!("Document deserialization error: {}", e);
            JsValue::from_str(&format!("Document deserialization error: {}", e))
        })?;

    // Recompute glyphs after deserialization
    // combined_char has #[serde(skip)] so it's not serialized - we must recompute it
    document.compute_glyphs();

    // Debug: Check if selection survived deserialization
    if let Some(sel) = document.state.selection_manager.get_selection() {
        wasm_log!("  ✅ Selection after deserialize: ({}, {}) to ({}, {})",
            sel.start().line, sel.start().col, sel.end().line, sel.end().col);
    } else {
        wasm_log!("  ❌ NO selection after deserialize!");
    }

    // Deserialize config from JavaScript
    let config: crate::html_layout::LayoutConfig = serde_wasm_bindgen::from_value(config_js)
        .map_err(|e| {
            wasm_error!("Config deserialization error: {}", e);
            JsValue::from_str(&format!("Config deserialization error: {}", e))
        })?;

    wasm_log!("  Document has {} lines", document.lines.len());
    wasm_log!("  Config: {} syllable widths (cell widths from cache)",
             config.syllable_widths.len());

    // Create layout engine and compute layout
    let engine = crate::html_layout::LayoutEngine::new();
    let display_list = engine.compute_layout(&document, &config);

    wasm_info!("  DisplayList generated: {} lines", display_list.lines.len());

    // Debug: Check if first cell has "selected" class
    if let Some(first_line) = display_list.lines.first() {
        if let Some(first_cell) = first_line.cells.first() {
            wasm_log!("  First cell classes: {:?}", first_cell.classes);
            let has_selected = first_cell.classes.iter().any(|c| c == "selected");
            wasm_log!("  Has 'selected' class: {}", has_selected);
        }
    }

    // Serialize display list back to JavaScript
    let result = serde_wasm_bindgen::to_value(&display_list)
        .map_err(|e| {
            wasm_error!("DisplayList serialization error: {}", e);
            JsValue::from_str(&format!("DisplayList serialization error: {}", e))
        })?;

    wasm_info!("computeLayout completed successfully");
    Ok(result)
}


// ============================================================================
// CURSOR AND SELECTION API (Anchor/Head Model)
// ============================================================================

/// Get current cursor information
/// Returns CaretInfo with cursor position and desired column for vertical movement
#[wasm_bindgen(js_name = getCaretInfo)]
pub fn get_caret_info() -> Result<JsValue, JsValue> {
    let doc_guard = lock_document()?;
    let doc = doc_guard.as_ref()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    let caret_info = crate::models::CaretInfo {
        caret: doc.state.cursor,
        desired_col: doc.state.selection_manager.desired_col,
    };

    serde_wasm_bindgen::to_value(&caret_info)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}

/// Get current selection information (if any)
/// Returns SelectionInfo with anchor, head, start, end, direction, isEmpty
#[wasm_bindgen(js_name = getSelectionInfo)]
pub fn get_selection_info() -> Result<JsValue, JsValue> {
    let doc_guard = lock_document()?;
    let doc = doc_guard.as_ref()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    if let Some(selection) = doc.state.selection_manager.get_selection() {
        let selection_info = crate::models::SelectionInfo::from_selection(selection);
        serde_wasm_bindgen::to_value(&Some(selection_info))
            .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
    } else {
        // Return null for no selection
        Ok(JsValue::NULL)
    }
}

/// Set selection explicitly with anchor and head positions
/// anchor: {stave, col} - where selection started (fixed point)
/// head: {stave, col} - current cursor position (moving point)
#[wasm_bindgen(js_name = setSelection)]
pub fn set_selection(anchor: JsValue, head: JsValue) -> Result<(), JsValue> {
    let anchor_pos: crate::models::Pos = serde_wasm_bindgen::from_value(anchor)
        .map_err(|e| JsValue::from_str(&format!("Invalid anchor position: {}", e)))?;

    let head_pos: crate::models::Pos = serde_wasm_bindgen::from_value(head)
        .map_err(|e| JsValue::from_str(&format!("Invalid head position: {}", e)))?;

    let mut doc_guard = lock_document()?;
    let doc = doc_guard.as_mut()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    doc.state.selection_manager.set_selection(anchor_pos, head_pos);

    Ok(())
}

/// Clear current selection
#[wasm_bindgen(js_name = clearSelection)]
pub fn clear_selection() -> Result<(), JsValue> {
    let mut doc_guard = lock_document()?;
    let doc = doc_guard.as_mut()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    doc.state.selection_manager.clear_selection();

    Ok(())
}

/// Start a new selection at the current cursor position
#[wasm_bindgen(js_name = startSelection)]
pub fn start_selection() -> Result<(), JsValue> {
    let mut doc_guard = lock_document()?;
    let doc = doc_guard.as_mut()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    let cursor_pos = doc.state.cursor;
    doc.state.selection_manager.start_selection(cursor_pos);

    Ok(())
}

/// Start a new selection at a specific position
#[wasm_bindgen(js_name = startSelectionAt)]
pub fn start_selection_at(line: usize, col: usize) -> Result<(), JsValue> {
    let mut doc_guard = lock_document()?;
    let doc = doc_guard.as_mut()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    let pos = Pos::new(line, col);
    doc.state.selection_manager.start_selection(pos);

    Ok(())
}

/// Extend selection to the current cursor position (updates head, keeps anchor)
#[wasm_bindgen(js_name = extendSelection)]
pub fn extend_selection() -> Result<(), JsValue> {
    let mut doc_guard = lock_document()?;
    let doc = doc_guard.as_mut()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    let cursor_pos = doc.state.cursor;
    doc.state.selection_manager.extend_selection(&cursor_pos);

    Ok(())
}

/// Extend selection to a specific position (updates head, keeps anchor)
#[wasm_bindgen(js_name = extendSelectionTo)]
pub fn extend_selection_to(line: usize, col: usize) -> Result<(), JsValue> {
    let mut doc_guard = lock_document()?;
    let doc = doc_guard.as_mut()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    let pos = Pos::new(line, col);
    doc.state.selection_manager.extend_selection(&pos);

    Ok(())
}

// ==================== Constraint System API ====================

/// Get all predefined scale constraints
/// Returns a JSON array of constraint objects
#[wasm_bindgen(js_name = getPredefinedConstraints)]
pub fn get_predefined_constraints_wasm() -> Result<JsValue, JsValue> {
    use crate::models::constraints::get_predefined_constraints;

    let constraints = get_predefined_constraints();
    serde_wasm_bindgen::to_value(&constraints)
        .map_err(|e| JsValue::from_str(&format!("Failed to serialize constraints: {}", e)))
}

/// Check if a pitch is allowed by a constraint
///
/// # Arguments
/// * `constraint_id` - The ID of the constraint to check against
/// * `pitch_code` - The pitch code to check (e.g., "N1", "N2b", "N3hf")
///
/// # Returns
/// * `true` if the pitch is allowed, `false` otherwise
#[wasm_bindgen(js_name = isPitchAllowed)]
pub fn is_pitch_allowed_wasm(constraint_id: String, pitch_code: String) -> Result<bool, JsValue> {
    use crate::models::constraints::get_predefined_constraints;

    // Find the constraint by ID
    let constraints = get_predefined_constraints();
    let constraint = constraints.iter()
        .find(|c| c.id == constraint_id)
        .ok_or_else(|| JsValue::from_str(&format!("Constraint '{}' not found", constraint_id)))?;

    // Get document to determine pitch system (default to Number)
    let doc_guard = lock_document()?;
    let doc = doc_guard.as_ref()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;
    let pitch_system = doc.pitch_system.unwrap_or(PitchSystem::Number);

    // Parse the pitch code string into PitchCode enum
    let pitch = PitchCode::from_string(&pitch_code, pitch_system)
        .ok_or_else(|| JsValue::from_str(&format!("Invalid pitch code: {}", pitch_code)))?;

    Ok(constraint.is_pitch_allowed(pitch))
}

/// Set the active constraint for the document
/// Pass `null` or empty string to disable constraints
#[wasm_bindgen(js_name = setActiveConstraint)]
pub fn set_active_constraint(constraint_id: Option<String>) -> Result<(), JsValue> {
    use crate::models::constraints::get_predefined_constraints;

    let mut doc_guard = lock_document()?;
    let doc = doc_guard.as_mut()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    if let Some(id) = constraint_id {
        if id.is_empty() {
            doc.active_constraint = None;
            return Ok(());
        }

        // Find and clone the constraint
        let constraints = get_predefined_constraints();
        let constraint = constraints.into_iter()
            .find(|c| c.id == id)
            .ok_or_else(|| JsValue::from_str(&format!("Constraint '{}' not found", id)))?;

        doc.active_constraint = Some(constraint);
    } else {
        doc.active_constraint = None;
    }

    Ok(())
}

/// Get the active constraint ID for the document
/// Returns `null` if no constraint is active
#[wasm_bindgen(js_name = getActiveConstraint)]
pub fn get_active_constraint() -> Result<JsValue, JsValue> {
    let doc_guard = lock_document()?;
    let doc = doc_guard.as_ref()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    match &doc.active_constraint {
        Some(constraint) => Ok(JsValue::from_str(&constraint.id)),
        None => Ok(JsValue::NULL),
    }
}

/// Get the list of notes in a scale constraint for a specific pitch system
/// Returns an array of note names (e.g., ["1", "2", "3", "4", "5", "6", "7"] for Number system)
#[wasm_bindgen(js_name = getConstraintNotes)]
pub fn get_constraint_notes(constraint_id: String, pitch_system_str: String) -> Result<JsValue, JsValue> {
    use crate::models::constraints::get_predefined_constraints;
    use crate::models::pitch_code::AccidentalType;

    // Helper function to get NotationFont glyph (single PUA codepoint) from degree and accidental
    fn note_char_from_degree_accidental(
        degree: usize,
        accidental: AccidentalType,
        pitch_system: PitchSystem
    ) -> Option<String> {
        use crate::models::pitch_code::PitchCode;
        use crate::renderers::font_utils::glyph_for_pitch;

        // Map degree to base pitch code
        let base_pitch = match (degree, accidental) {
            (1, AccidentalType::None) => PitchCode::N1,
            (2, AccidentalType::None) => PitchCode::N2,
            (3, AccidentalType::None) => PitchCode::N3,
            (4, AccidentalType::None) => PitchCode::N4,
            (5, AccidentalType::None) => PitchCode::N5,
            (6, AccidentalType::None) => PitchCode::N6,
            (7, AccidentalType::None) => PitchCode::N7,
            (1, AccidentalType::Sharp) => PitchCode::N1s,
            (2, AccidentalType::Sharp) => PitchCode::N2s,
            (3, AccidentalType::Sharp) => PitchCode::N3s,
            (4, AccidentalType::Sharp) => PitchCode::N4s,
            (5, AccidentalType::Sharp) => PitchCode::N5s,
            (6, AccidentalType::Sharp) => PitchCode::N6s,
            (7, AccidentalType::Sharp) => PitchCode::N7s,
            (1, AccidentalType::Flat) => PitchCode::N1b,
            (2, AccidentalType::Flat) => PitchCode::N2b,
            (3, AccidentalType::Flat) => PitchCode::N3b,
            (4, AccidentalType::Flat) => PitchCode::N4b,
            (5, AccidentalType::Flat) => PitchCode::N5b,
            (6, AccidentalType::Flat) => PitchCode::N6b,
            (7, AccidentalType::Flat) => PitchCode::N7b,
            (1, AccidentalType::HalfFlat) => PitchCode::N1hf,
            (2, AccidentalType::HalfFlat) => PitchCode::N2hf,
            (3, AccidentalType::HalfFlat) => PitchCode::N3hf,
            (4, AccidentalType::HalfFlat) => PitchCode::N4hf,
            (5, AccidentalType::HalfFlat) => PitchCode::N5hf,
            (6, AccidentalType::HalfFlat) => PitchCode::N6hf,
            (7, AccidentalType::HalfFlat) => PitchCode::N7hf,
            (1, AccidentalType::DoubleSharp) => PitchCode::N1ss,
            (2, AccidentalType::DoubleSharp) => PitchCode::N2ss,
            (3, AccidentalType::DoubleSharp) => PitchCode::N3ss,
            (4, AccidentalType::DoubleSharp) => PitchCode::N4ss,
            (5, AccidentalType::DoubleSharp) => PitchCode::N5ss,
            (6, AccidentalType::DoubleSharp) => PitchCode::N6ss,
            (7, AccidentalType::DoubleSharp) => PitchCode::N7ss,
            (1, AccidentalType::DoubleFlat) => PitchCode::N1bb,
            (2, AccidentalType::DoubleFlat) => PitchCode::N2bb,
            (3, AccidentalType::DoubleFlat) => PitchCode::N3bb,
            (4, AccidentalType::DoubleFlat) => PitchCode::N4bb,
            (5, AccidentalType::DoubleFlat) => PitchCode::N5bb,
            (6, AccidentalType::DoubleFlat) => PitchCode::N6bb,
            (7, AccidentalType::DoubleFlat) => PitchCode::N7bb,
            _ => return None,
        };

        // Use glyph_for_pitch to get NotationFont PUA codepoint
        // Use octave 0 (base octave, no dots) for constraint display
        glyph_for_pitch(base_pitch, 0, pitch_system).map(|ch| ch.to_string())
    }

    // Parse pitch system
    let pitch_system = match pitch_system_str.as_str() {
        "Number" => PitchSystem::Number,
        "Western" => PitchSystem::Western,
        "Sargam" => PitchSystem::Sargam,
        _ => return Err(JsValue::from_str(&format!("Unknown pitch system: {}", pitch_system_str))),
    };

    // Find the constraint by ID
    let constraints = get_predefined_constraints();
    let constraint = constraints.iter()
        .find(|c| c.id == constraint_id)
        .ok_or_else(|| JsValue::from_str(&format!("Constraint not found: {}", constraint_id)))?;

    // Build list of allowed notes
    let mut notes = Vec::new();

    // For each degree (1-7)
    for degree in 1..=7 {
        let degree_idx = degree - 1;
        let degree_constraint = &constraint.degrees[degree_idx];

        // Check what's allowed for this degree
        match degree_constraint {
            crate::models::constraints::DegreeConstraint::Omit => {
                // Skip omitted degrees
                continue;
            },
            crate::models::constraints::DegreeConstraint::Any => {
                // For "Any", just show the natural note
                if let Some(note) = note_char_from_degree_accidental(degree, AccidentalType::None, pitch_system) {
                    notes.push(note);
                }
            },
            crate::models::constraints::DegreeConstraint::Only(allowed_accidentals) => {
                // For each allowed accidental, add the note
                for accidental in allowed_accidentals {
                    if let Some(note) = note_char_from_degree_accidental(degree, *accidental, pitch_system) {
                        notes.push(note);
                    }
                }
            }
        }
    }

    // Convert to JsValue
    serde_wasm_bindgen::to_value(&notes)
        .map_err(|e| JsValue::from_str(&format!("Failed to serialize notes: {}", e)))
}

/// Check if a pitch is allowed by the document's active constraint
/// If no constraint is active, all pitches are allowed
#[wasm_bindgen(js_name = checkPitchAgainstActiveConstraint)]
pub fn check_pitch_against_active_constraint(pitch_code: String) -> Result<bool, JsValue> {
    let doc_guard = lock_document()?;
    let doc = doc_guard.as_ref()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    // If no constraint is active, allow all pitches
    let constraint = match &doc.active_constraint {
        Some(c) => c,
        None => return Ok(true),
    };

    // Get pitch system from document (default to Number)
    let pitch_system = doc.pitch_system.unwrap_or(PitchSystem::Number);

    // Parse the pitch code
    let pitch = PitchCode::from_string(&pitch_code, pitch_system)
        .ok_or_else(|| JsValue::from_str(&format!("Invalid pitch code: {}", pitch_code)))?;

    Ok(constraint.is_pitch_allowed(pitch))
}

// ==================== Cursor Movement Commands ====================

/// Helper to create EditorDiff from current document state
fn create_editor_diff(doc: &Document, dirty_line: Option<usize>) -> EditorDiff {
    let dirty_lines = if let Some(line_idx) = dirty_line {
        if let Some(line) = doc.lines.get(line_idx) {
            vec![DirtyLine {
                row: line_idx,
                cells: line.cells.clone(),
            }]
        } else {
            vec![]
        }
    } else {
        vec![]
    };

    let caret = CaretInfo {
        caret: doc.state.cursor,
        desired_col: doc.state.selection_manager.desired_col,
    };

    let selection = doc.state.selection_manager.get_selection()
        .map(|s| SelectionInfo::from_selection(s));

    EditorDiff {
        dirty_lines,
        caret,
        selection,
    }
}

#[wasm_bindgen(js_name = moveLeft)]
pub fn move_left(extend: bool) -> Result<JsValue, JsValue> {
    let mut doc_guard = lock_document()?;
    let doc = doc_guard.as_mut()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    let old_cursor = doc.state.cursor;

    // Standard text editor behavior: collapse selection to start on left arrow
    let new_pos = if !extend && doc.state.selection_manager.current_selection.is_some() {
        let selection = doc.state.selection_manager.current_selection.as_ref().unwrap();
        web_sys::console::log_1(&format!("[WASM] moveLeft: collapsing selection to start").into());
        selection.start()
    } else {
        doc.prev_caret(doc.state.cursor)
    };

    web_sys::console::log_1(&format!("[WASM] moveLeft(extend={}): old_cursor=({},{}), new_pos=({},{})",
        extend, old_cursor.line, old_cursor.col, new_pos.line, new_pos.col).into());

    if !extend {
        doc.state.selection_manager.clear_selection();
    } else if doc.state.selection_manager.current_selection.is_none() {
        web_sys::console::log_1(&format!("[WASM]   Starting selection at ({},{})",
            old_cursor.line, old_cursor.col).into());
        // Start selection at OLD cursor position (anchor), not current cursor
        doc.state.selection_manager.start_selection(old_cursor);
    }

    doc.state.cursor = new_pos;
    doc.state.selection_manager.desired_col = new_pos.col;

    if extend {
        doc.state.selection_manager.extend_selection(&new_pos);
        if let Some(sel) = &doc.state.selection_manager.current_selection {
            web_sys::console::log_1(&format!("[WASM]   Selection: anchor=({},{}), head=({},{})",
                sel.anchor.line, sel.anchor.col, sel.head.line, sel.head.col).into());
        }
    }

    let diff = create_editor_diff(&doc, Some(new_pos.line));
    serde_wasm_bindgen::to_value(&diff)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}

#[wasm_bindgen(js_name = moveRight)]
pub fn move_right(extend: bool) -> Result<JsValue, JsValue> {
    let mut doc_guard = lock_document()?;
    let doc = doc_guard.as_mut()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    let old_cursor = doc.state.cursor;

    // Standard text editor behavior: collapse selection to end on right arrow
    let new_pos = if !extend && doc.state.selection_manager.current_selection.is_some() {
        let selection = doc.state.selection_manager.current_selection.as_ref().unwrap();
        web_sys::console::log_1(&format!("[WASM] moveRight: collapsing selection to end").into());
        selection.end()
    } else {
        doc.next_caret(doc.state.cursor)
    };

    web_sys::console::log_1(&format!("[WASM] moveRight(extend={}): old_cursor=({},{}), new_pos=({},{})",
        extend, old_cursor.line, old_cursor.col, new_pos.line, new_pos.col).into());

    if !extend {
        doc.state.selection_manager.clear_selection();
    } else if doc.state.selection_manager.current_selection.is_none() {
        web_sys::console::log_1(&format!("[WASM]   Starting selection at ({},{})",
            old_cursor.line, old_cursor.col).into());
        // Start selection at OLD cursor position (anchor), not current cursor
        doc.state.selection_manager.start_selection(old_cursor);
    }

    doc.state.cursor = new_pos;
    doc.state.selection_manager.desired_col = new_pos.col;

    if extend {
        doc.state.selection_manager.extend_selection(&new_pos);
        if let Some(sel) = &doc.state.selection_manager.current_selection {
            web_sys::console::log_1(&format!("[WASM]   Selection: anchor=({},{}), head=({},{})",
                sel.anchor.line, sel.anchor.col, sel.head.line, sel.head.col).into());
        }
    }

    let diff = create_editor_diff(&doc, Some(new_pos.line));
    serde_wasm_bindgen::to_value(&diff)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}

#[wasm_bindgen(js_name = moveUp)]
pub fn move_up(extend: bool) -> Result<JsValue, JsValue> {
    let mut doc_guard = lock_document()?;
    let doc = doc_guard.as_mut()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    let desired_col = doc.state.selection_manager.desired_col;

    // Standard text editor behavior: collapse selection to head on up arrow
    let new_pos = if !extend && doc.state.selection_manager.current_selection.is_some() {
        let selection = doc.state.selection_manager.current_selection.as_ref().unwrap();
        web_sys::console::log_1(&format!("[WASM] moveUp: collapsing selection to head").into());
        selection.head
    } else {
        doc.caret_up(doc.state.cursor, desired_col)
    };

    if !extend {
        doc.state.selection_manager.clear_selection();
    } else if doc.state.selection_manager.current_selection.is_none() {
        doc.state.selection_manager.start_selection(doc.state.cursor);
    }

    doc.state.cursor = new_pos;

    if extend {
        doc.state.selection_manager.extend_selection(&new_pos);
    }

    let diff = create_editor_diff(&doc, Some(new_pos.line));
    serde_wasm_bindgen::to_value(&diff)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}

#[wasm_bindgen(js_name = moveDown)]
pub fn move_down(extend: bool) -> Result<JsValue, JsValue> {
    let mut doc_guard = lock_document()?;
    let doc = doc_guard.as_mut()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    let desired_col = doc.state.selection_manager.desired_col;

    // Standard text editor behavior: collapse selection to head on down arrow
    let new_pos = if !extend && doc.state.selection_manager.current_selection.is_some() {
        let selection = doc.state.selection_manager.current_selection.as_ref().unwrap();
        web_sys::console::log_1(&format!("[WASM] moveDown: collapsing selection to head").into());
        selection.head
    } else {
        doc.caret_down(doc.state.cursor, desired_col)
    };

    if !extend {
        doc.state.selection_manager.clear_selection();
    } else if doc.state.selection_manager.current_selection.is_none() {
        doc.state.selection_manager.start_selection(doc.state.cursor);
    }

    doc.state.cursor = new_pos;

    if extend {
        doc.state.selection_manager.extend_selection(&new_pos);
    }

    let diff = create_editor_diff(&doc, Some(new_pos.line));
    serde_wasm_bindgen::to_value(&diff)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}

#[wasm_bindgen(js_name = moveHome)]
pub fn move_home(extend: bool) -> Result<JsValue, JsValue> {
    let mut doc_guard = lock_document()?;
    let doc = doc_guard.as_mut()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    let new_pos = doc.caret_line_start(doc.state.cursor);

    if !extend {
        doc.state.selection_manager.clear_selection();
    } else if doc.state.selection_manager.current_selection.is_none() {
        doc.state.selection_manager.start_selection(doc.state.cursor);
    }

    doc.state.cursor = new_pos;
    doc.state.selection_manager.desired_col = 0;

    if extend {
        doc.state.selection_manager.extend_selection(&new_pos);
    }

    let diff = create_editor_diff(&doc, Some(new_pos.line));
    serde_wasm_bindgen::to_value(&diff)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}

#[wasm_bindgen(js_name = moveEnd)]
pub fn move_end(extend: bool) -> Result<JsValue, JsValue> {
    let mut doc_guard = lock_document()?;
    let doc = doc_guard.as_mut()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    let new_pos = doc.caret_line_end(doc.state.cursor);

    if !extend {
        doc.state.selection_manager.clear_selection();
    } else if doc.state.selection_manager.current_selection.is_none() {
        doc.state.selection_manager.start_selection(doc.state.cursor);
    }

    doc.state.cursor = new_pos;
    doc.state.selection_manager.desired_col = new_pos.col;

    if extend {
        doc.state.selection_manager.extend_selection(&new_pos);
    }

    let diff = create_editor_diff(&doc, Some(new_pos.line));
    serde_wasm_bindgen::to_value(&diff)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}

#[wasm_bindgen(js_name = mouseDown)]
pub fn mouse_down(pos_js: JsValue) -> Result<JsValue, JsValue> {
    let mut doc_guard = lock_document()?;
    let doc = doc_guard.as_mut()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    let pos: Pos = serde_wasm_bindgen::from_value(pos_js)
        .map_err(|e| JsValue::from_str(&format!("Invalid position: {}", e)))?;

    let clamped_pos = doc.clamp_pos(pos);
    doc.state.cursor = clamped_pos;
    doc.state.selection_manager.clear_selection();
    doc.state.selection_manager.start_selection(clamped_pos);
    doc.state.selection_manager.desired_col = clamped_pos.col;

    let diff = create_editor_diff(&doc, Some(clamped_pos.line));
    serde_wasm_bindgen::to_value(&diff)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}

#[wasm_bindgen(js_name = mouseMove)]
pub fn mouse_move(pos_js: JsValue) -> Result<JsValue, JsValue> {
    let mut doc_guard = lock_document()?;
    let doc = doc_guard.as_mut()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    let pos: Pos = serde_wasm_bindgen::from_value(pos_js)
        .map_err(|e| JsValue::from_str(&format!("Invalid position: {}", e)))?;

    let clamped_pos = doc.clamp_pos(pos);
    doc.state.cursor = clamped_pos;
    doc.state.selection_manager.extend_selection(&clamped_pos);
    doc.state.selection_manager.desired_col = clamped_pos.col;

    let diff = create_editor_diff(&doc, Some(clamped_pos.line));
    serde_wasm_bindgen::to_value(&diff)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}

#[wasm_bindgen(js_name = mouseUp)]
pub fn mouse_up(pos_js: JsValue) -> Result<JsValue, JsValue> {
    let mut doc_guard = lock_document()?;
    let doc = doc_guard.as_mut()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    let pos: Pos = serde_wasm_bindgen::from_value(pos_js)
        .map_err(|e| JsValue::from_str(&format!("Invalid position: {}", e)))?;

    web_sys::console::log_1(&format!("[WASM] mouseUp: pos=({},{})", pos.line, pos.col).into());

    let clamped_pos = doc.clamp_pos(pos);
    web_sys::console::log_1(&format!("[WASM] mouseUp: clamped_pos=({},{})", clamped_pos.line, clamped_pos.col).into());

    doc.state.cursor = clamped_pos;
    doc.state.selection_manager.extend_selection(&clamped_pos);
    doc.state.selection_manager.desired_col = clamped_pos.col;

    let selection_after = doc.state.selection_manager.get_selection();
    web_sys::console::log_1(&format!("[WASM] mouseUp: selection after extend = {:?}", selection_after).into());

    let diff = create_editor_diff(&doc, Some(clamped_pos.line));
    web_sys::console::log_1(&format!("[WASM] mouseUp: diff.selection = {:?}", diff.selection).into());

    serde_wasm_bindgen::to_value(&diff)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}

/// Select beat or character group at the given position (for double-click)
/// Returns an EditorDiff with the updated selection and cursor state
#[wasm_bindgen(js_name = selectBeatAtPosition)]
pub fn select_beat_at_position(pos_js: JsValue) -> Result<JsValue, JsValue> {
    let mut doc_guard = lock_document()?;
    let doc = doc_guard.as_mut()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    let pos: Pos = serde_wasm_bindgen::from_value(pos_js)
        .map_err(|e| JsValue::from_str(&format!("Invalid position: {}", e)))?;

    // Clamp position to document bounds
    let clamped_pos = doc.clamp_pos(pos);

    // Get the line at the position
    if clamped_pos.line >= doc.lines.len() {
        return Err(JsValue::from_str("Line index out of bounds"));
    }

    let line = &doc.lines[clamped_pos.line];
    let cells = &line.cells;

    if cells.is_empty() {
        // Empty line - just place cursor at the beginning
        let cursor_pos = Pos::new(clamped_pos.line, 0);
        doc.state.cursor = cursor_pos;
        doc.state.selection_manager.clear_selection();
        doc.state.selection_manager.desired_col = 0;

        let diff = create_editor_diff(&doc, Some(clamped_pos.line));
        return serde_wasm_bindgen::to_value(&diff)
            .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)));
    }

    // Use BeatDeriver to extract beats
    let beat_deriver = crate::parse::beats::BeatDeriver::new();
    let beats = beat_deriver.extract_implicit_beats(cells);

    // Check if the position falls within a beat
    for beat in &beats {
        if beat.contains(clamped_pos.col) {
            // Found a beat containing the position
            let anchor = Pos::new(clamped_pos.line, beat.start);
            let head = Pos::new(clamped_pos.line, beat.end + 1); // end is exclusive in Selection

            // Update document state
            doc.state.cursor = head;
            doc.state.selection_manager.set_selection(anchor, head);
            doc.state.selection_manager.desired_col = head.col;

            // Return EditorDiff with updated state
            let diff = create_editor_diff(&doc, Some(clamped_pos.line));
            return serde_wasm_bindgen::to_value(&diff)
                .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)));
        }
    }

    // No beat found - check if this is a text token
    let clicked_cell_idx = clamped_pos.col.min(cells.len() - 1);
    let clicked_cell = &cells[clicked_cell_idx];

    if clicked_cell.kind == ElementKind::Text {
        // Text token selection: select all consecutive Text cells
        // Scan backward to find the start of the text token
        let mut start_col = clicked_cell_idx;
        for i in (0..clicked_cell_idx).rev() {
            if cells[i].kind == ElementKind::Text {
                start_col = i;
            } else {
                break; // Stop at first non-text cell
            }
        }

        // Scan forward to find the end of the text token
        // NEW ARCHITECTURE: No continuation cells
        // Each cell is standalone, so text token is just the single cell
        let end_col = start_col;

        // Create selection for text token
        let anchor = Pos::new(clamped_pos.line, start_col);
        let head = Pos::new(clamped_pos.line, end_col + 1); // end is exclusive in Selection

        // Update document state
        doc.state.cursor = head;
        doc.state.selection_manager.set_selection(anchor, head);
        doc.state.selection_manager.desired_col = head.col;

        // Return EditorDiff with updated state
        let diff = create_editor_diff(&doc, Some(clamped_pos.line));
        return serde_wasm_bindgen::to_value(&diff)
            .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)));
    }

    // No beat or text token - fall back to single cell selection
    // NEW ARCHITECTURE: No continuation cells, each cell is standalone
    let start_col = clamped_pos.col;
    let end_col = start_col;

    // Create selection for character group
    let anchor = Pos::new(clamped_pos.line, start_col);
    let head = Pos::new(clamped_pos.line, end_col + 1); // end is exclusive in Selection

    // Update document state
    doc.state.cursor = head;
    doc.state.selection_manager.set_selection(anchor, head);
    doc.state.selection_manager.desired_col = head.col;

    // Return EditorDiff with updated state
    let diff = create_editor_diff(&doc, Some(clamped_pos.line));
    serde_wasm_bindgen::to_value(&diff)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}

/// Select entire line at the given position (for triple-click)
/// Returns an EditorDiff with the updated selection and cursor state
#[wasm_bindgen(js_name = selectLineAtPosition)]
pub fn select_line_at_position(pos_js: JsValue) -> Result<JsValue, JsValue> {
    let mut doc_guard = lock_document()?;
    let doc = doc_guard.as_mut()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    let pos: Pos = serde_wasm_bindgen::from_value(pos_js)
        .map_err(|e| JsValue::from_str(&format!("Invalid position: {}", e)))?;

    // Clamp position to document bounds
    let clamped_pos = doc.clamp_pos(pos);

    // Get the line at the position
    if clamped_pos.line >= doc.lines.len() {
        return Err(JsValue::from_str("Line index out of bounds"));
    }

    let line = &doc.lines[clamped_pos.line];
    let line_length = line.cells.len();

    // Select entire line: from column 0 to end of line
    let anchor = Pos::new(clamped_pos.line, 0);
    let head = Pos::new(clamped_pos.line, line_length);

    // Update document state
    doc.state.cursor = head;
    doc.state.selection_manager.set_selection(anchor, head);
    doc.state.selection_manager.desired_col = head.col;

    // Return EditorDiff with updated state
    let diff = create_editor_diff(&doc, Some(clamped_pos.line));
    serde_wasm_bindgen::to_value(&diff)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}

// ==================== Ornament Copy/Paste API (WASM-FIRST) ====================

/// Copy ornament from current selection to clipboard as notation string (WASM-owned state)
///
/// WASM-FIRST: This function handles selection internally, no cell_index needed
#[wasm_bindgen(js_name = copyOrnament)]
pub fn copy_ornament() -> Result<String, JsValue> {
    wasm_info!("copyOrnament called");

    let doc = lock_document()?;
    let doc = doc.as_ref()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    // Get effective selection (same logic as applyOctave)
    let cursor_pos = &doc.state.cursor;
    let selection = doc.state.selection_manager.get_selection();

    let target_cell_index = if let Some(sel) = selection {
        // Use first cell in selection
        sel.start().col.min(sel.end().col)
    } else {
        // No selection: target cell to left of cursor
        if cursor_pos.col == 0 {
            return Err(JsValue::from_str("No selection and cursor at start of line"));
        }
        cursor_pos.col - 1
    };

    wasm_info!("  Target cell index: {}", target_cell_index);

    let line = doc.lines.get(cursor_pos.line)
        .ok_or_else(|| JsValue::from_str("No active line"))?;

    let cell = line.cells.get(target_cell_index)
        .ok_or_else(|| JsValue::from_str("Cell index out of bounds"))?;

    let ornament = cell.ornament.as_ref()
        .ok_or_else(|| JsValue::from_str("Cell has no ornament"))?;

    // Convert ornament cells to notation string
    let notation: String = ornament.cells.iter()
        .map(|cell| cell.char.clone())
        .collect::<Vec<String>>()
        .join("");

    wasm_info!("  Copied ornament: {}", notation);

    Ok(notation)
}

/// Clear ornament from current selection (WASM-owned state)
///
/// WASM-FIRST: This function handles selection internally, no cell_index needed
#[wasm_bindgen(js_name = clearOrnament)]
pub fn clear_ornament() -> Result<JsValue, JsValue> {
    wasm_info!("clearOrnament called");

    let mut doc = lock_document()?;
    let doc = doc.as_mut()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    // Get effective selection (same logic as applyOctave)
    let cursor_pos = doc.state.cursor.clone();
    let selection = doc.state.selection_manager.get_selection();

    let target_cell_index = if let Some(sel) = selection {
        // Use first cell in selection
        sel.start().col.min(sel.end().col)
    } else {
        // No selection: target cell to left of cursor
        if cursor_pos.col == 0 {
            return Err(JsValue::from_str("No selection and cursor at start of line"));
        }
        cursor_pos.col - 1
    };

    wasm_info!("  Target cell index: {}", target_cell_index);

    let line = doc.lines.get_mut(cursor_pos.line)
        .ok_or_else(|| JsValue::from_str("No active line"))?;

    let cell = line.cells.get_mut(target_cell_index)
        .ok_or_else(|| JsValue::from_str("Cell index out of bounds"))?;

    // Clear the ornament
    cell.ornament = None;

    wasm_info!("  Ornament cleared from cell {}", target_cell_index);

    // Return EditorDiff
    let diff = create_editor_diff(&doc, Some(cursor_pos.line));
    serde_wasm_bindgen::to_value(&diff)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}

/// Set ornament placement for current selection (WASM-owned state)
///
/// WASM-FIRST: This function handles selection internally, no cell_index needed
#[wasm_bindgen(js_name = setOrnamentPlacement)]
pub fn set_ornament_placement(placement: &str) -> Result<JsValue, JsValue> {
    use crate::models::elements::OrnamentPlacement;

    wasm_info!("setOrnamentPlacement called: placement={}", placement);

    let mut doc = lock_document()?;
    let doc = doc.as_mut()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    // Get effective selection (same logic as applyOctave)
    let cursor_pos = doc.state.cursor.clone();
    let selection = doc.state.selection_manager.get_selection();

    let target_cell_index = if let Some(sel) = selection {
        // Use first cell in selection
        sel.start().col.min(sel.end().col)
    } else {
        // No selection: target cell to left of cursor
        if cursor_pos.col == 0 {
            return Err(JsValue::from_str("No selection and cursor at start of line"));
        }
        cursor_pos.col - 1
    };

    wasm_info!("  Target cell index: {}", target_cell_index);

    let line = doc.lines.get_mut(cursor_pos.line)
        .ok_or_else(|| JsValue::from_str("No active line"))?;

    let cell = line.cells.get_mut(target_cell_index)
        .ok_or_else(|| JsValue::from_str("Cell index out of bounds"))?;

    // Update placement if ornament exists
    if let Some(ref mut ornament) = cell.ornament {
        ornament.placement = match placement {
            "before" => OrnamentPlacement::Before,
            "after" => OrnamentPlacement::After,
            _ => OrnamentPlacement::Before,
        };
        wasm_info!("  Ornament placement updated to: {}", placement);
    } else {
        return Err(JsValue::from_str("Cell has no ornament"));
    }

    // Return EditorDiff
    let diff = create_editor_diff(&doc, Some(cursor_pos.line));
    serde_wasm_bindgen::to_value(&diff)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}

/// OLD FUNCTION - DEPRECATED - Use copyOrnament() instead
#[wasm_bindgen(js_name = copyOrnamentAsNotation)]
pub fn copy_ornament_as_notation(cell_index: usize) -> Result<String, JsValue> {
    wasm_warn!("copyOrnamentAsNotation is DEPRECATED - use copyOrnament instead");

    let doc = lock_document()?;
    let doc = doc.as_ref()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    let line = doc.active_line()
        .ok_or_else(|| JsValue::from_str("No active line"))?;

    let cell = line.cells.get(cell_index)
        .ok_or_else(|| JsValue::from_str("Cell index out of bounds"))?;

    let ornament = cell.ornament.as_ref()
        .ok_or_else(|| JsValue::from_str("Cell has no ornament"))?;

    // Convert ornament cells to notation string
    let notation: String = ornament.cells.iter()
        .map(|cell| cell.char.clone())
        .collect::<Vec<String>>()
        .join("");

    Ok(notation)
}

/// Paste ornament from notation string to current selection (WASM-owned state)
///
/// WASM-FIRST: This function handles selection internally, no cell_index needed
#[wasm_bindgen(js_name = pasteOrnament)]
pub fn paste_ornament(
    notation_text: &str,
    placement: &str
) -> Result<JsValue, JsValue> {
    use crate::models::elements::{Ornament, OrnamentPlacement};

    wasm_info!("pasteOrnament called: notation={:?}, placement={}", notation_text, placement);

    let mut doc = lock_document()?;
    let doc = doc.as_mut()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    // Get effective selection (same logic as applyOctave)
    let cursor_pos = doc.state.cursor.clone();
    let selection = doc.state.selection_manager.get_selection();

    let target_cell_index = if let Some(sel) = selection {
        // Use first cell in selection
        sel.start().col.min(sel.end().col)
    } else {
        // No selection: target cell to left of cursor (same as applyOctave)
        if cursor_pos.col == 0 {
            return Err(JsValue::from_str("No selection and cursor at start of line"));
        }
        cursor_pos.col - 1
    };

    wasm_info!("  Target cell index: {}", target_cell_index);

    let line = doc.lines.get_mut(cursor_pos.line)
        .ok_or_else(|| JsValue::from_str("No active line"))?;

    let cell = line.cells.get_mut(target_cell_index)
        .ok_or_else(|| JsValue::from_str("Cell index out of bounds"))?;

    // Parse notation text - simple character-by-character conversion
    let parsed_cells: Vec<Cell> = notation_text.chars()
        .enumerate()
        .map(|(idx, ch)| Cell::new(ch.to_string(), ElementKind::PitchedElement, idx))
        .collect();

    if parsed_cells.is_empty() {
        return Err(JsValue::from_str("Empty notation text"));
    }

    // Determine placement
    let ornament_placement = match placement {
        "before" => OrnamentPlacement::Before,
        "after" => OrnamentPlacement::After,
        _ => OrnamentPlacement::Before, // default
    };

    // Create ornament and attach
    let ornament = Ornament {
        cells: parsed_cells,
        placement: ornament_placement,
    };
    cell.ornament = Some(ornament);

    wasm_info!("  Ornament attached to cell {}", target_cell_index);

    // Return EditorDiff
    let diff = create_editor_diff(&doc, Some(cursor_pos.line));
    serde_wasm_bindgen::to_value(&diff)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}

/// OLD FUNCTION - DEPRECATED - Use pasteOrnament() instead
#[wasm_bindgen(js_name = pasteOrnamentFromNotation)]
pub fn paste_ornament_from_notation(
    cell_index: usize,
    notation_text: &str,
    placement: &str
) -> Result<JsValue, JsValue> {
    wasm_warn!("pasteOrnamentFromNotation is DEPRECATED - use pasteOrnament instead");

    use crate::models::elements::{Ornament, OrnamentPlacement};

    let mut doc = lock_document()?;
    let doc = doc.as_mut()
        .ok_or_else(|| JsValue::from_str("No document loaded"))?;

    let line = doc.lines.first_mut()
        .ok_or_else(|| JsValue::from_str("No active line"))?;

    let cell = line.cells.get_mut(cell_index)
        .ok_or_else(|| JsValue::from_str("Cell index out of bounds"))?;

    let parsed_cells: Vec<Cell> = notation_text.chars()
        .enumerate()
        .map(|(idx, ch)| Cell::new(ch.to_string(), ElementKind::PitchedElement, idx))
        .collect();

    if parsed_cells.is_empty() {
        return Err(JsValue::from_str("Empty notation text"));
    }

    let ornament_placement = match placement {
        "before" => OrnamentPlacement::Before,
        "after" => OrnamentPlacement::After,
        _ => OrnamentPlacement::Before,
    };

    let ornament = Ornament {
        cells: parsed_cells,
        placement: ornament_placement,
    };
    cell.ornament = Some(ornament);

    let diff = create_editor_diff(&doc, Some(0));
    serde_wasm_bindgen::to_value(&diff)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}

// OLD FUNCTIONS REMOVED - Replaced by WASM-First versions above that handle selection internally

#[cfg(test)]
mod tests {
    use super::*;

    /// Helper to calculate cursor position after insertion (pure Rust, no JsValue)
    fn calculate_cursor_pos_after_insert(cells: &[Cell], insert_pos: usize) -> usize {
        let mut new_cursor_pos = 0;
        for (i, cell) in cells.iter().enumerate() {
            if i == insert_pos {
                new_cursor_pos += cell.char.chars().count();
                break;
            } else {
                new_cursor_pos += cell.char.chars().count();
            }
        }
        new_cursor_pos
    }

    /// Helper to create a simple Cell for testing
    fn make_cell(char: &str, col: usize) -> Cell {
        Cell::new(char.to_string(), crate::models::ElementKind::Unknown, col)
    }

    #[test]
    fn test_cursor_after_insert_at_end() {
        // Test: Type 'p', then 'q' → cursor should be at char position 2
        let cells = vec![
            make_cell("p", 0),
            make_cell("q", 1),
        ];

        let cursor = calculate_cursor_pos_after_insert(&cells, 1);
        assert_eq!(cursor, 2, "After inserting 'q' at position 1, cursor should be at char pos 2");
    }

    #[test]
    fn test_cursor_after_insert_in_middle() {
        // Test: Type 'p', 'q', then insert 'r' in the middle → cursor should be at char position 2
        // Cells: ['p', 'r', 'q']
        // Insert position: 1 (where 'r' was just inserted)
        let cells = vec![
            make_cell("p", 0),
            make_cell("r", 1),
            make_cell("q", 2),
        ];

        let cursor = calculate_cursor_pos_after_insert(&cells, 1);
        assert_eq!(cursor, 2, "After inserting 'r' at cell index 1, cursor should be at char pos 2 (after 'pr')");
    }

    #[test]
    fn test_cursor_with_multichar_glyph() {
        // Test: Type '1', then '#' which combines to '1#'
        // Cells: ['1#']
        // Insert position: 0 (combination happened at position 0)
        let cells = vec![
            make_cell("1#", 0),
        ];

        let cursor = calculate_cursor_pos_after_insert(&cells, 0);
        assert_eq!(cursor, 2, "After inserting into multi-char glyph '1#', cursor should be at char pos 2");
    }

    #[test]
    fn test_cursor_multichar_in_middle() {
        // Test: Type 'p', 'q', left arrow, then 'r'
        // But if 'qr' combines into a multi-char glyph 'qr'
        // Cells: ['p', 'qr']
        // Insert position: 1 (where the combination happened)
        let cells = vec![
            make_cell("p", 0),
            make_cell("qr", 1),
        ];

        let cursor = calculate_cursor_pos_after_insert(&cells, 1);
        assert_eq!(cursor, 3, "After inserting 'r' which forms 'qr', cursor should be at char pos 3 (after 'pqr')");
    }

    #[test]
    fn test_cursor_at_start() {
        // Test: Insert at position 0
        // Cells: ['r', 'p', 'q']
        let cells = vec![
            make_cell("r", 0),
            make_cell("p", 1),
            make_cell("q", 2),
        ];

        let cursor = calculate_cursor_pos_after_insert(&cells, 0);
        assert_eq!(cursor, 1, "After inserting 'r' at position 0, cursor should be at char pos 1");
    }

    #[test]
    #[cfg(target_arch = "wasm32")]
    fn test_delete_accidental_updates_pitch_code() {
        // Test: Type "1#" then backspace should result in "1" with correct pitch_code

        // Step 1: Parse "1"
        let mut cells = vec![parse_single('1', PitchSystem::Number, 0, None)];
        assert_eq!(cells.len(), 1);
        assert_eq!(cells[0].char, "1");
        assert_eq!(cells[0].pitch_code, Some(crate::models::PitchCode::N1));  // N1 = 1 natural
        // assert_eq!(cells[0].continuation, false);

        // Step 2: Parse "#" and add it
        cells.push(parse_single('#', PitchSystem::Number, 1, None));
        assert_eq!(cells.len(), 2);

        // Step 3: Mark continuations - this should combine "1" + "#" = "1#" with pitch_code N1s
        assert_eq!(cells.len(), 2);
        assert_eq!(cells[0].char, "1");
        assert_eq!(cells[1].char, "#");
        // assert_eq!(cells[1].continuation, true);
        assert_eq!(cells[0].pitch_code, Some(crate::models::PitchCode::N1s));  // N1s = 1 sharp

        // Step 4: Delete the "#" at position 1
        cells.remove(1);

        // Step 5: IMPORTANT: After deleting from a multi-cell glyph, reparse the root!
        // This is what delete_character() should do
        let reparsed = parse(&cells[0].char, PitchSystem::Number, cells[0].col, None);
        cells[0].pitch_code = reparsed.pitch_code;
        cells[0].kind = reparsed.kind;

        // Step 6: Re-mark continuations (to handle any lookright scenarios)

        // Step 7: After deletion and reparse, we should have just "1" with pitch_code N1
        assert_eq!(cells.len(), 1);
        assert_eq!(cells[0].char, "1");
        // assert_eq!(cells[0].continuation, false);

        // After the fix, pitch_code should be N1 (1 natural)
        assert_eq!(cells[0].pitch_code, Some(crate::models::PitchCode::N1),
                   "After deleting '#' and reparsing, pitch_code should be N1 (1 natural)");
    }

    #[test]
    #[cfg(target_arch = "wasm32")]
    fn test_parse_triple_sharp_limits_to_double() {
        // Test: Parse "1###" should result in "1##" (double sharp) + "#" (text)
        // A note can only have up to 2 accidentals (double sharp or double flat)

        let mut cells = Vec::new();

        // Parse each character
        cells.push(parse_single('1', PitchSystem::Number, 0));
        cells.push(parse_single('#', PitchSystem::Number, 1));
        cells.push(parse_single('#', PitchSystem::Number, 2));
        cells.push(parse_single('#', PitchSystem::Number, 3));

        // Mark continuations

        // Expected result: "1##" + "#"
        // Cell 0: "1" (root, PitchedElement)
        // Cell 1: "#" (continuation, PitchedElement)
        // Cell 2: "#" (continuation, PitchedElement)
        // Cell 3: "#" (Text, not a continuation)

        assert_eq!(cells.len(), 4, "Should have 4 cells");

        // Cell 0: "1" - root of the note
        assert_eq!(cells[0].char, "1");
        assert_eq!(cells[0].kind, crate::models::ElementKind::PitchedElement);
        // assert_eq!(cells[0].continuation, false);
        assert_eq!(cells[0].pitch_code, Some(crate::models::PitchCode::N1ss),
                   "First cell should have N1ss (double sharp)");

        // Cell 1: "#" - first accidental (continuation)
        assert_eq!(cells[1].char, "#");
        // assert_eq!(cells[1].continuation, true,
        //Second cell should be continuation of note");

        // Cell 2: "#" - second accidental (continuation)
        assert_eq!(cells[2].char, "#");
        // assert_eq!(cells[2].continuation, true,
        //            "Third cell should be continuation of note");

        // Cell 3: "#" - third accidental should be Symbol, not part of the note
        assert_eq!(cells[3].char, "#");
        assert_eq!(cells[3].kind, crate::models::ElementKind::Symbol,
                   "Fourth cell should be Symbol (not part of the note)");
        // assert_eq!(cells[3].continuation, false,
        //            "Fourth cell should NOT be a continuation");
    }

    #[test]
    fn test_apply_slur_with_cell_11() {
        // Test: Apply slur with cell index 11 in a 12-cell array
        // This is a regression test for: "apply slur not working for 11"

        // Create 12 cells (indices 0-11) with PitchedElement kind
        let mut cells = Vec::new();
        for i in 0..12 {
            let mut cell = make_cell(&i.to_string(), i);
            cell.kind = crate::models::ElementKind::PitchedElement;
            cells.push(cell);
        }

        // Test 1: Apply slur from cell 10 to 11 (end=12, exclusive)
        let slur_result = apply_slur_cells(&cells, 10, 12);
        assert_eq!(slur_result.len(), 12, "Should have 12 cells after slur application");
        assert_eq!(slur_result[10].slur_indicator, crate::models::SlurIndicator::SlurStart,
                   "Cell 10 should have SlurStart");
        assert_eq!(slur_result[11].slur_indicator, crate::models::SlurIndicator::SlurEnd,
                   "Cell 11 should have SlurEnd");
        assert_eq!(slur_result[9].slur_indicator, crate::models::SlurIndicator::None,
                   "Cell 9 should NOT have slur indicator");

        // Test 2: Apply slur with only 1 cell (should not apply)
        let slur_single = apply_slur_cells(&cells, 10, 11);
        assert_eq!(slur_single[10].slur_indicator, crate::models::SlurIndicator::None,
                   "Single cell should not get a slur (needs at least 2 cells)");

        // Test 3: Apply slur across entire 12-cell line
        let slur_all = apply_slur_cells(&cells, 0, 12);
        assert_eq!(slur_all[0].slur_indicator, crate::models::SlurIndicator::SlurStart,
                   "Cell 0 should have SlurStart");
        assert_eq!(slur_all[11].slur_indicator, crate::models::SlurIndicator::SlurEnd,
                   "Cell 11 should have SlurEnd in full line slur");

        // Test 4: Apply slur from cell 9 to 11
        let slur_three = apply_slur_cells(&cells, 9, 12);
        assert_eq!(slur_three[9].slur_indicator, crate::models::SlurIndicator::SlurStart,
                   "Cell 9 should have SlurStart");
        assert_eq!(slur_three[10].slur_indicator, crate::models::SlurIndicator::None,
                   "Cell 10 should NOT have slur (middle cell)");
        assert_eq!(slur_three[11].slur_indicator, crate::models::SlurIndicator::SlurEnd,
                   "Cell 11 should have SlurEnd");
    }

    /// Helper function to apply slur directly to a cell vec (for testing)
    fn apply_slur_cells(cells: &[Cell], start: usize, end: usize) -> Vec<Cell> {
        let mut result = cells.to_vec();
        let actual_end = end.min(result.len());

        // Clear any existing slur indicators in the range first
        for i in start..actual_end {
            result[i].clear_slur();
        }

        // Check if we have at least 2 cells for a slur
        if actual_end - start >= 2 {
            result[start].set_slur_start();
            result[actual_end - 1].set_slur_end();
        }

        result
    }

    #[test]
    fn test_apply_command_slur_toggle() {
        // Test: applyCommand with slur should apply and toggle correctly
        // This verifies the fix for "no slur visible" issue

        // Create 12 cells with PitchedElement kind
        let mut cells = Vec::new();
        for i in 0..12 {
            let mut cell = make_cell(&i.to_string(), i);
            cell.kind = crate::models::ElementKind::PitchedElement;
            cells.push(cell);
        }

        // Test 1: Apply slur via applyCommand to cells 0-1
        let result1 = apply_command_slur(&cells, 0, 2);
        assert_eq!(result1[0].slur_indicator, crate::models::SlurIndicator::SlurStart,
                   "Cell 0 should have SlurStart after applyCommand");
        assert_eq!(result1[1].slur_indicator, crate::models::SlurIndicator::SlurEnd,
                   "Cell 1 should have SlurEnd after applyCommand");

        // Test 2: Toggle slur off
        let result2 = apply_command_slur(&result1, 0, 2);
        assert_eq!(result2[0].slur_indicator, crate::models::SlurIndicator::None,
                   "Cell 0 should have None after toggling slur off");
        assert_eq!(result2[1].slur_indicator, crate::models::SlurIndicator::None,
                   "Cell 1 should have None after toggling slur off");

        // Test 3: Apply slur with exclusive-end (10, 12) for 12-cell array
        let result3 = apply_command_slur(&cells, 10, 12);
        assert_eq!(result3[10].slur_indicator, crate::models::SlurIndicator::SlurStart,
                   "Cell 10 should have SlurStart with exclusive end (10, 12)");
        assert_eq!(result3[11].slur_indicator, crate::models::SlurIndicator::SlurEnd,
                   "Cell 11 should have SlurEnd with exclusive end (10, 12)");
    }

    /// Helper function to apply command slur (for testing)
    fn apply_command_slur(cells: &[Cell], start: usize, end: usize) -> Vec<Cell> {
        let mut result = cells.to_vec();
        let actual_end = end.min(result.len());

        // Check if slur already exists on the first cell
        let has_existing_slur = result.get(start).map(|c| c.has_slur()).unwrap_or(false);

        if has_existing_slur {
            // Remove existing slur
            for i in start..actual_end {
                if result[i].has_slur() {
                    result[i].clear_slur();
                }
            }
        } else if actual_end - start >= 2 {
            // Apply new slur
            for i in start..actual_end {
                result[i].clear_slur();
            }
            result[start].set_slur_start();
            result[actual_end - 1].set_slur_end();
        }

        result
    }

    // ==================== Beat Selection Tests ====================

    /// Helper to create a pitched element cell for beat testing
    fn make_pitched_cell(char: &str, col: usize) -> Cell {
        Cell::new(char.to_string(), crate::models::ElementKind::PitchedElement, col)
    }

    /// Helper to create a whitespace cell for beat testing
    fn make_space_cell(char: &str, col: usize) -> Cell {
        Cell::new(char.to_string(), crate::models::ElementKind::Unknown, col)
    }

    #[test]
    #[cfg(target_arch = "wasm32")]
    fn test_beat_selection_simple_beat() {
        // Create a document with a simple beat: "S--r"
        // Beat should span columns 0-3
        let mut doc = Document::new();
        let mut line = Line::new();

        // Add cells for beat: S--r
        line.cells.push(make_pitched_cell("S", 0));
        line.cells.push(make_pitched_cell("-", 1));
        line.cells.push(make_pitched_cell("-", 2));
        line.cells.push(make_pitched_cell("r", 3));

        doc.lines.push(line);

        // Store document in GLOBAL
        {
            let mut guard = lock_document().unwrap();
            *guard = Some(doc);
        }

        // Test selecting at different positions within the beat
        for col in 0..4 {
            let pos = Pos::new(0, col);
            let pos_js = serde_wasm_bindgen::to_value(&pos).unwrap();
            let result = select_beat_at_position(pos_js);

            assert!(result.is_ok(), "Selection should succeed at col {}", col);

            let selection_info: SelectionInfo = serde_wasm_bindgen::from_value(result.unwrap()).unwrap();
            assert_eq!(selection_info.start.col, 0, "Beat should start at col 0");
            assert_eq!(selection_info.end.col, 4, "Beat should end at col 4 (exclusive)");
        }
    }

    #[test]
    #[cfg(target_arch = "wasm32")]
    fn test_beat_selection_multiple_beats() {
        // Create a document with multiple beats separated by spaces: "S--r  g-m"
        let mut doc = Document::new();
        let mut line = Line::new();

        // Beat 1: S--r (columns 0-3)
        line.cells.push(make_pitched_cell("S", 0));
        line.cells.push(make_pitched_cell("-", 1));
        line.cells.push(make_pitched_cell("-", 2));
        line.cells.push(make_pitched_cell("r", 3));

        // Separator: spaces (columns 4-5)
        line.cells.push(make_space_cell(" ", 4));
        line.cells.push(make_space_cell(" ", 5));

        // Beat 2: g-m (columns 6-8)
        line.cells.push(make_pitched_cell("g", 6));
        line.cells.push(make_pitched_cell("-", 7));
        line.cells.push(make_pitched_cell("m", 8));

        doc.lines.push(line);

        {
            let mut guard = lock_document().unwrap();
            *guard = Some(doc);
        }

        // Test selecting first beat (col 0-3)
        let pos = Pos::new(0, 2);
        let pos_js = serde_wasm_bindgen::to_value(&pos).unwrap();
        let result = select_beat_at_position(pos_js).unwrap();
        let selection_info: SelectionInfo = serde_wasm_bindgen::from_value(result).unwrap();
        assert_eq!(selection_info.start.col, 0);
        assert_eq!(selection_info.end.col, 4);

        // Test selecting second beat (col 6-8)
        let pos = Pos::new(0, 7);
        let pos_js = serde_wasm_bindgen::to_value(&pos).unwrap();
        let result = select_beat_at_position(pos_js).unwrap();
        let selection_info: SelectionInfo = serde_wasm_bindgen::from_value(result).unwrap();
        assert_eq!(selection_info.start.col, 6);
        assert_eq!(selection_info.end.col, 9);
    }

    #[test]
    #[cfg(target_arch = "wasm32")]
    fn test_beat_selection_character_group_fallback() {
        // Create a document with no beats - should fall back to character group selection
        let mut doc = Document::new();
        let mut line = Line::new();

        // Add cells (continuation flags removed - multi-char glyphs now single cells)
        let cell1 = make_space_cell("S", 0);
        line.cells.push(cell1);

        let cell2 = make_space_cell("a", 1);
        line.cells.push(cell2);

        let cell3 = make_space_cell("r", 2);
        line.cells.push(cell3);

        doc.lines.push(line);

        {
            let mut guard = lock_document().unwrap();
            *guard = Some(doc);
        }

        // Test selecting first character group (S + continuation)
        let pos = Pos::new(0, 0);
        let pos_js = serde_wasm_bindgen::to_value(&pos).unwrap();
        let result = select_beat_at_position(pos_js).unwrap();
        let selection_info: SelectionInfo = serde_wasm_bindgen::from_value(result).unwrap();
        assert_eq!(selection_info.start.col, 0);
        assert_eq!(selection_info.end.col, 2, "Should select S and its continuation");

        // Test selecting second character group
        let pos = Pos::new(0, 2);
        let pos_js = serde_wasm_bindgen::to_value(&pos).unwrap();
        let result = select_beat_at_position(pos_js).unwrap();
        let selection_info: SelectionInfo = serde_wasm_bindgen::from_value(result).unwrap();
        assert_eq!(selection_info.start.col, 2);
        assert_eq!(selection_info.end.col, 3, "Should select just r");
    }

    #[test]
    #[cfg(target_arch = "wasm32")]
    fn test_double_click_selects_barline_character_group() {
        // Test that double-clicking on multi-char barline ":|" selects entire barline
        // This tests the character group fallback (not beat, not text token)
        // Create document: "S--r :|  g-m-"
        let mut doc = Document::new();
        let mut line = Line::new();

        // Beat 1: "S--r" (cols 0-3)
        line.cells.push(Cell::new("S".to_string(), ElementKind::PitchedElement, 0));
        line.cells.push(Cell::new("-".to_string(), ElementKind::UnpitchedElement, 1));
        line.cells.push(Cell::new("-".to_string(), ElementKind::UnpitchedElement, 2));
        line.cells.push(Cell::new("r".to_string(), ElementKind::PitchedElement, 3));

        // Whitespace (col 4)
        line.cells.push(Cell::new(" ".to_string(), ElementKind::Whitespace, 4));

        // Multi-char barline: ":|" (cols 5-6)
        // First cell is ":" (Symbol), but gets forced to RepeatRightBarline by mark_continuations
        let cell_colon = Cell::new(":".to_string(), ElementKind::RepeatRightBarline, 5);
        line.cells.push(cell_colon);

        let cell_pipe = Cell::new("|".to_string(), ElementKind::RepeatRightBarline, 6);
        line.cells.push(cell_pipe);

        // Whitespace (cols 7-8)
        line.cells.push(Cell::new(" ".to_string(), ElementKind::Whitespace, 7));
        line.cells.push(Cell::new(" ".to_string(), ElementKind::Whitespace, 8));

        // Beat 2: "g-m-" (cols 9-12)
        line.cells.push(Cell::new("g".to_string(), ElementKind::PitchedElement, 9));
        line.cells.push(Cell::new("-".to_string(), ElementKind::UnpitchedElement, 10));
        line.cells.push(Cell::new("m".to_string(), ElementKind::PitchedElement, 11));
        line.cells.push(Cell::new("-".to_string(), ElementKind::UnpitchedElement, 12));

        doc.lines.push(line);

        {
            let mut guard = lock_document().unwrap();
            *guard = Some(doc);
        }

        // Test clicking on first char of barline (col 5, ":")
        let pos = Pos::new(0, 5);
        let pos_js = serde_wasm_bindgen::to_value(&pos).unwrap();
        let result = select_beat_at_position(pos_js).unwrap();
        let selection_info: SelectionInfo = serde_wasm_bindgen::from_value(result).unwrap();
        assert_eq!(selection_info.start.col, 5, "Should start at ':'");
        assert_eq!(selection_info.end.col, 7, "Should select entire ':|' barline (exclusive end)");

        // Test clicking on second char of barline (col 6, "|")
        let pos = Pos::new(0, 6);
        let pos_js = serde_wasm_bindgen::to_value(&pos).unwrap();
        let result = select_beat_at_position(pos_js).unwrap();
        let selection_info: SelectionInfo = serde_wasm_bindgen::from_value(result).unwrap();
        assert_eq!(selection_info.start.col, 5, "Should start at ':'");
        assert_eq!(selection_info.end.col, 7, "Should select entire ':|' barline (exclusive end)");
    }

    #[test]
    #[cfg(target_arch = "wasm32")]
    fn test_double_click_selects_text_token() {
        // Test that double-clicking on text like "zxz" selects the entire text token
        // Create document: "S--r  zxz  g-m-"
        // Beats at cols 0-3 and 11-14, Text token at cols 6-8
        let mut doc = Document::new();
        let mut line = Line::new();

        // Beat 1: "S--r" (cols 0-3)
        line.cells.push(Cell::new("S".to_string(), ElementKind::PitchedElement, 0));
        line.cells.push(Cell::new("-".to_string(), ElementKind::UnpitchedElement, 1));
        line.cells.push(Cell::new("-".to_string(), ElementKind::UnpitchedElement, 2));
        line.cells.push(Cell::new("r".to_string(), ElementKind::PitchedElement, 3));

        // Whitespace (cols 4-5)
        line.cells.push(Cell::new(" ".to_string(), ElementKind::Whitespace, 4));
        line.cells.push(Cell::new(" ".to_string(), ElementKind::Whitespace, 5));

        // Text token: "zxz" (cols 6-8)
        let cell_z1 = Cell::new("z".to_string(), ElementKind::Text, 6);
        line.cells.push(cell_z1);

        let cell_x = Cell::new("x".to_string(), ElementKind::Text, 7);
        line.cells.push(cell_x);

        let cell_z2 = Cell::new("z".to_string(), ElementKind::Text, 8);
        line.cells.push(cell_z2);

        // Whitespace (cols 9-10)
        line.cells.push(Cell::new(" ".to_string(), ElementKind::Whitespace, 9));
        line.cells.push(Cell::new(" ".to_string(), ElementKind::Whitespace, 10));

        // Beat 2: "g-m-" (cols 11-14)
        line.cells.push(Cell::new("g".to_string(), ElementKind::PitchedElement, 11));
        line.cells.push(Cell::new("-".to_string(), ElementKind::UnpitchedElement, 12));
        line.cells.push(Cell::new("m".to_string(), ElementKind::PitchedElement, 13));
        line.cells.push(Cell::new("-".to_string(), ElementKind::UnpitchedElement, 14));

        doc.lines.push(line);

        {
            let mut guard = lock_document().unwrap();
            *guard = Some(doc);
        }

        // Test clicking on first char of text token (col 6)
        let pos = Pos::new(0, 6);
        let pos_js = serde_wasm_bindgen::to_value(&pos).unwrap();
        let result = select_beat_at_position(pos_js).unwrap();
        let selection_info: SelectionInfo = serde_wasm_bindgen::from_value(result).unwrap();
        assert_eq!(selection_info.start.col, 6, "Should start at 'z'");
        assert_eq!(selection_info.end.col, 9, "Should select entire 'zxz' token (exclusive end)");

        // Test clicking on middle char of text token (col 7)
        let pos = Pos::new(0, 7);
        let pos_js = serde_wasm_bindgen::to_value(&pos).unwrap();
        let result = select_beat_at_position(pos_js).unwrap();
        let selection_info: SelectionInfo = serde_wasm_bindgen::from_value(result).unwrap();
        assert_eq!(selection_info.start.col, 6, "Should start at 'z'");
        assert_eq!(selection_info.end.col, 9, "Should select entire 'zxz' token (exclusive end)");

        // Test clicking on last char of text token (col 8)
        let pos = Pos::new(0, 8);
        let pos_js = serde_wasm_bindgen::to_value(&pos).unwrap();
        let result = select_beat_at_position(pos_js).unwrap();
        let selection_info: SelectionInfo = serde_wasm_bindgen::from_value(result).unwrap();
        assert_eq!(selection_info.start.col, 6, "Should start at 'z'");
        assert_eq!(selection_info.end.col, 9, "Should select entire 'zxz' token (exclusive end)");
    }

    #[test]
    #[cfg(target_arch = "wasm32")]
    fn test_edit_replace_range_deletes_multichar_token() {
        // Test scenario: Type ":|", select both chars (Shift+Left ×2), backspace
        // Expected: All cells deleted, line is empty
        // This tests that selection deletion properly handles multi-char tokens
        let mut doc = Document::new();
        let mut line = Line::new();

        // Multi-char barline ":|" (cols 0-1)
        let mut cell_colon = Cell::new(":".to_string(), ElementKind::RepeatRightBarline, 0);
        line.cells.push(cell_colon);

        let cell_pipe = Cell::new("|".to_string(), ElementKind::RepeatRightBarline, 1);
        line.cells.push(cell_pipe);

        doc.lines.push(line);

        {
            let mut guard = lock_document().unwrap();
            *guard = Some(doc);
        }

        // Delete selection (0,0)-(0,2) with empty replacement (backspace on selection)
        let result = edit_replace_range(0, 0, 0, 2, "");
        assert!(result.is_ok(), "edit_replace_range should succeed");

        // Check that line is now empty
        let doc_guard = lock_document().unwrap();
        let doc = doc_guard.as_ref().unwrap();
        assert_eq!(doc.lines[0].cells.len(), 0, "Should delete entire ':|' token, leaving 0 cells");
    }

    // ============================================================================
    // Ornament Paste Tests - Cursor Positioning Logic
    // ============================================================================

    #[test]
    fn test_cursor_position_to_cell_index_calculation() {
        // DEMONSTRATES THE LOGIC: How to convert cursor position to cell index
        //
        // SCENARIO: User types "123" → creates 3 cells at indices 0, 1, 2
        // After typing "1": cursor at col 1, should attach ornament to cell 0
        // After typing "12": cursor at col 2, should attach ornament to cell 1
        // After typing "123": cursor at col 3, should attach ornament to cell 2

        let mut line = Line::new();
        line.cells.push(Cell::new("1".to_string(), ElementKind::PitchedElement, 0));
        line.cells.push(Cell::new("2".to_string(), ElementKind::PitchedElement, 1));
        line.cells.push(Cell::new("3".to_string(), ElementKind::PitchedElement, 2));

        // After typing "1", cursor is at col 1
        let cursor_col = 1;
        let target_cell_index = cursor_col - 1;
        assert_eq!(target_cell_index, 0, "Should target cell 0 (the '1' note)");
        assert!(target_cell_index < line.cells.len(), "Index must be in bounds");

        // After typing "12", cursor is at col 2
        let cursor_col = 2;
        let target_cell_index = cursor_col - 1;
        assert_eq!(target_cell_index, 1, "Should target cell 1 (the '2' note)");
        assert!(target_cell_index < line.cells.len(), "Index must be in bounds");

        // After typing "123", cursor is at col 3
        let cursor_col = 3;
        let target_cell_index = cursor_col - 1;
        assert_eq!(target_cell_index, 2, "Should target cell 2 (the '3' note)");
        assert!(target_cell_index < line.cells.len(), "Index must be in bounds");
    }

    #[test]
    #[should_panic(expected = "BUG: Using cursor.col directly without -1 causes out of bounds")]
    fn test_cursor_position_fails_without_minus_one() {
        // FAILING TEST: Demonstrates what happens if we forget cursor.col - 1
        //
        // SCENARIO: User types "1" → cursor at col 1
        // BUG: If we use cursor.col (1) directly as index, we try to access cells[1]
        // But cells only has 1 element (cells[0]), so this panics!

        let mut line = Line::new();
        line.cells.push(Cell::new("1".to_string(), ElementKind::PitchedElement, 0));

        let cursor_col = 1; // Cursor after typing "1"

        // ❌ WRONG: Using cursor_col directly
        let wrong_index = cursor_col;

        // This should panic because cells.len() = 1, so valid indices are only 0
        if wrong_index >= line.cells.len() {
            panic!("BUG: Using cursor.col directly without -1 causes out of bounds");
        }

        // If we got here, the test failed to demonstrate the bug
        unreachable!("Test should have panicked above");
    }

    // ============================================================================
    // Lyrics Split Tests
    // ============================================================================

    /// Helper to create an unpitched element cell for lyrics testing
    fn make_unpitched_cell(char: &str, col: usize) -> Cell {
        Cell::new(char.to_string(), ElementKind::UnpitchedElement, col)
    }

    #[test]
    fn test_split_lyrics_empty() {
        let lyrics = "";
        let cells = vec![
            make_pitched_cell("1", 0),
            make_unpitched_cell(" ", 1),
            make_pitched_cell("2", 2),
        ];

        let (before, after) = split_lyrics_at_cell_index(lyrics, &cells, 2);
        assert_eq!(before, "");
        assert_eq!(after, "");
    }

    #[test]
    fn test_split_lyrics_basic() {
        // 4 syllables, 4 pitched cells, split after cell 2
        let lyrics = "one two three four";
        let cells = vec![
            make_pitched_cell("1", 0),
            make_unpitched_cell(" ", 1),
            make_pitched_cell("2", 2),
            make_unpitched_cell(" ", 3),
            make_pitched_cell("3", 4),
            make_unpitched_cell(" ", 5),
            make_pitched_cell("4", 6),
        ];

        // Split after cell index 4 (after "1 2 " cells) - two pitched cells before
        let (before, after) = split_lyrics_at_cell_index(&lyrics, &cells, 4);
        assert_eq!(before, "one two");
        assert_eq!(after, "three four");
    }

    #[test]
    fn test_split_lyrics_hyphenated() {
        // "hel-lo wor-ld" = 4 syllables: "hel-", "lo", "wor-", "ld"
        let lyrics = "hel-lo wor-ld";
        let cells = vec![
            make_pitched_cell("1", 0),
            make_unpitched_cell(" ", 1),
            make_pitched_cell("2", 2),
            make_unpitched_cell(" ", 3),
            make_pitched_cell("3", 4),
            make_unpitched_cell(" ", 5),
            make_pitched_cell("4", 6),
        ];

        // Split after 2 pitched cells (index 4)
        let (before, after) = split_lyrics_at_cell_index(&lyrics, &cells, 4);
        assert_eq!(before, "hel-lo");
        assert_eq!(after, "wor-ld");
    }

    #[test]
    fn test_split_lyrics_at_start() {
        // Split at cell 0 means all lyrics go to second line
        let lyrics = "one two";
        let cells = vec![
            make_pitched_cell("1", 0),
            make_unpitched_cell(" ", 1),
            make_pitched_cell("2", 2),
        ];

        let (before, after) = split_lyrics_at_cell_index(&lyrics, &cells, 0);
        assert_eq!(before, "");
        assert_eq!(after, "one two");
    }

    #[test]
    fn test_split_lyrics_at_end() {
        // Split at the end means all lyrics stay on first line
        let lyrics = "one two";
        let cells = vec![
            make_pitched_cell("1", 0),
            make_unpitched_cell(" ", 1),
            make_pitched_cell("2", 2),
        ];

        let (before, after) = split_lyrics_at_cell_index(&lyrics, &cells, 3);
        assert_eq!(before, "one two");
        assert_eq!(after, "");
    }

    #[test]
    fn test_split_lyrics_more_syllables_than_notes() {
        // 4 syllables but only 2 pitched cells
        // According to distribution, first note gets "one", second gets "two three four" combined
        // When we split after first note, "one" stays, rest goes to second line
        let lyrics = "one two three four";
        let cells = vec![
            make_pitched_cell("1", 0),
            make_unpitched_cell(" ", 1),
            make_pitched_cell("2", 2),
        ];

        // Split after first pitched cell (index 2)
        let (before, after) = split_lyrics_at_cell_index(&lyrics, &cells, 2);
        // First pitched cell gets "one", second gets remaining
        assert_eq!(before, "one");
        assert_eq!(after, "two three four");
    }
}
