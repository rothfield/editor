//! MusicXML export
//!
//! This module provides MusicXML export functionality.

pub mod duration;
pub mod pitch;
pub mod builder;

pub use duration::*;
pub use pitch::*;
pub use builder::*;

use crate::models::{Document, ElementKind, Cell};
use crate::models::pitch::Pitch;
use crate::parse::beats::BeatDeriver;

// Logging for MusicXML export (mirrors api.rs logging macros)
#[cfg(target_arch = "wasm32")]
macro_rules! musicxml_log {
    ($($arg:tt)*) => {
        web_sys::console::log_1(&format!("[MusicXML] {}", format!($($arg)*)).into());
    };
}

#[cfg(not(target_arch = "wasm32"))]
macro_rules! musicxml_log {
    ($($arg:tt)*) => {
        println!("[MusicXML] {}", format!($($arg)*));
    };
}

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
    musicxml_log!("Starting MusicXML export for document with {} lines", document.lines.len());

    let mut builder = MusicXmlBuilder::new();

    // Handle empty document
    if document.lines.is_empty() || document.lines.iter().all(|line| line.cells.is_empty()) {
        musicxml_log!("Empty document detected, generating single measure with whole rest");
        // Generate empty MusicXML with a single measure containing a whole rest
        builder.start_measure_with_divisions(Some(1), false);
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
            builder.start_measure_with_divisions(Some(measure_divisions), new_system);
            process_segment(&mut builder, &line.cells, &beat_deriver, measure_divisions)?;
            builder.end_measure();
        } else {
            // Process each segment (measure)
            for (i, segment_indices) in segments.iter().enumerate() {
                let segment = &line.cells[segment_indices.0..segment_indices.1];
                if !segment.is_empty() {
                    let measure_divisions = calculate_measure_divisions(segment, &beat_deriver);
                    let is_first_measure = i == 0;
                    builder.start_measure_with_divisions(Some(measure_divisions), new_system && is_first_measure);
                    process_segment(&mut builder, segment, &beat_deriver, measure_divisions)?;
                    builder.end_measure();
                }
            }
        }
    }

    let xml = builder.finalize();
    musicxml_log!("MusicXML export complete: {} bytes", xml.len());
    Ok(xml)
}

/// Calculate measure divisions (LCM of all beat subdivision counts)
fn calculate_measure_divisions(cells: &[Cell], beat_deriver: &BeatDeriver) -> usize {
    let beats = beat_deriver.extract_implicit_beats(cells);

    let mut divisions = 1;
    for beat in beats.iter() {
        let beat_cells = &cells[beat.start..=beat.end];
        let subdivision_count = beat_cells.len();
        if subdivision_count > 0 {
            divisions = lcm(divisions, subdivision_count);
        }
    }

    divisions
}

/// Calculate least common multiple
fn lcm(a: usize, b: usize) -> usize {
    if a == 0 || b == 0 {
        return 0;
    }
    (a * b) / gcd(a, b)
}

/// Calculate greatest common divisor
fn gcd(a: usize, b: usize) -> usize {
    if b == 0 {
        a
    } else {
        gcd(b, a % b)
    }
}

/// Split cells at barlines, returning segment indices (start, end)
fn split_at_barlines(cells: &[Cell]) -> Vec<(usize, usize)> {
    let mut segments = Vec::new();
    let mut start = 0;

    for (i, cell) in cells.iter().enumerate() {
        if cell.kind == ElementKind::Barline {
            // Add segment before barline
            if i > start {
                segments.push((start, i));
            }
            // Skip barline, start next segment after it
            start = i + 1;
        }
    }

    // Add final segment after last barline
    if start < cells.len() {
        segments.push((start, cells.len()));
    }

    segments
}

/// Process a measure segment (content between barlines)
fn process_segment(
    builder: &mut MusicXmlBuilder,
    cells: &[Cell],
    beat_deriver: &BeatDeriver,
    measure_divisions: usize
) -> Result<(), String> {
    // Extract beats using beat deriver
    let beats = beat_deriver.extract_implicit_beats(cells);

    for (i, beat) in beats.iter().enumerate() {
        let beat_cells = &cells[beat.start..=beat.end];

        // Check if next beat starts with "-" for tie detection
        let next_beat_starts_with_div = if i + 1 < beats.len() {
            let next_beat = &beats[i + 1];
            let next_cells = &cells[next_beat.start..=next_beat.end];
            beat_starts_with_division(next_cells)
        } else {
            false
        };

        process_beat(builder, beat_cells, measure_divisions, next_beat_starts_with_div)?;
    }

    Ok(())
}

/// Check if a beat starts with "-" (division/extension)
fn beat_starts_with_division(beat_cells: &[Cell]) -> bool {
    beat_cells.first()
        .map(|cell| cell.kind == ElementKind::UnpitchedElement && cell.glyph == "-")
        .unwrap_or(false)
}

/// Process a single beat with proper rhythm calculation
fn process_beat(
    builder: &mut MusicXmlBuilder,
    beat_cells: &[Cell],
    measure_divisions: usize,
    next_beat_starts_with_div: bool
) -> Result<(), String> {
    if beat_cells.is_empty() {
        return Ok(());
    }

    let subdivisions = beat_cells.len();
    let mut i = 0;

    // Handle leading divisions (tied note from previous beat)
    if beat_starts_with_division(beat_cells) && builder.last_note.is_some() {
        // Count leading "-" symbols
        let mut leading_div_count = 0;
        while i < beat_cells.len() &&
              beat_cells[i].kind == ElementKind::UnpitchedElement &&
              beat_cells[i].glyph == "-" {
            leading_div_count += 1;
            i += 1;
        }

        if leading_div_count > 0 {
            // Write tied note using previous note's pitch
            let (prev_step, prev_alter, prev_octave) = builder.last_note.unwrap();
            let duration_divs = (measure_divisions / subdivisions) * leading_div_count;
            let musical_duration = leading_div_count as f64 / subdivisions as f64;

            // Reconstruct pitch from last_note
            let prev_pitch = Pitch {
                base: prev_step.to_string(),
                accidental: crate::models::pitch::Accidental::from_semitones(prev_alter),
                octave: prev_octave,
                system: crate::models::PitchSystem::Western, // Assume Western for now
            };

            // Write note with tie="stop"
            builder.write_note_with_beam(&prev_pitch, duration_divs, musical_duration, None, None, None, Some("stop"))?;
        }
    }

    // Process remaining elements in the beat
    while i < beat_cells.len() {
        let cell = &beat_cells[i];

        match cell.kind {
            ElementKind::PitchedElement => {
                // Count following "-" extenders
                let mut extension_count = 0;
                let mut j = i + 1;
                while j < beat_cells.len() {
                    if beat_cells[j].kind == ElementKind::UnpitchedElement && beat_cells[j].glyph == "-" {
                        extension_count += 1;
                        j += 1;
                    } else {
                        break;
                    }
                }

                // Calculate duration based on subdivision position
                let slot_count = 1 + extension_count;
                let duration_divs = (measure_divisions / subdivisions) * slot_count;
                let musical_duration = slot_count as f64 / subdivisions as f64;

                // Extract pitch
                if let (Some(pitch_code), Some(pitch_system)) = (&cell.pitch_code, cell.pitch_system) {
                    if let Some(pitch) = Pitch::parse_notation(pitch_code, pitch_system) {
                        let pitch_with_octave = Pitch {
                            base: pitch.base,
                            accidental: pitch.accidental,
                            octave: cell.octave,
                            system: pitch_system,
                        };

                        // Check if this is the last note in beat and next beat starts with "-"
                        let is_last_note = {
                            let mut j = i + 1 + extension_count;
                            while j < beat_cells.len() {
                                if beat_cells[j].kind == ElementKind::PitchedElement {
                                    break;
                                }
                                j += 1;
                            }
                            j >= beat_cells.len()
                        };

                        let tie = if is_last_note && next_beat_starts_with_div {
                            Some("start")
                        } else {
                            None
                        };

                        builder.write_note_with_beam(&pitch_with_octave, duration_divs, musical_duration, None, None, None, tie)?;
                    }
                }

                // Skip the extensions
                i += 1 + extension_count;
            }
            ElementKind::UnpitchedElement if cell.glyph != "-" => {
                // Standalone unpitched element (rest, not extension)
                let duration_divs = measure_divisions / subdivisions;
                let musical_duration = 1.0 / subdivisions as f64;
                builder.write_rest(duration_divs, musical_duration);
                i += 1;
            }
            ElementKind::UnpitchedElement => {
                // Standalone "-" - skip (orphaned extension)
                i += 1;
            }
            ElementKind::BreathMark => {
                builder.reset_context();
                i += 1;
            }
            _ => {
                i += 1;
            }
        }
    }

    Ok(())
}