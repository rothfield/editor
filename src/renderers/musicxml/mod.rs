//! MusicXML export
//!
//! This module provides MusicXML export functionality.

pub mod duration;
pub mod pitch;
pub mod builder;

pub use duration::*;
pub use pitch::*;
pub use builder::*;

use crate::models::{Document, ElementKind, Cell, PitchCode, SlurIndicator};
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
        // IMPORTANT: Don't count continuation cells in rhythmic calculations!
        // Continuation cells are part of the same logical element (e.g., "#" in "C#")
        let subdivision_count = beat_cells.iter().filter(|c| !c.continuation).count();
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
        .map(|cell| cell.kind == ElementKind::UnpitchedElement && cell.char == "-")
        .unwrap_or(false)
}

/// Normalize beat by reducing rhythmic fractions using GCD
/// Returns (normalized_slot_counts, effective_subdivisions)
///
/// Examples:
/// - "1-2-3-" (slots: [2,2,2]) → GCD=2 → [1,1,1], subdivisions=3
/// - "1-2---" (slots: [2,4]) → GCD=2 → [1,2], subdivisions=3
/// - "1--" (slots: [3]) → GCD=3 → [1], subdivisions=1
fn normalize_beat(beat_cells: &[Cell]) -> (Vec<usize>, usize) {
    if beat_cells.is_empty() {
        return (vec![], 0);
    }

    // Extract pitched elements and their slot counts
    let mut slot_counts = Vec::new();
    let mut i = 0;

    while i < beat_cells.len() {
        let cell = &beat_cells[i];

        // IMPORTANT: Skip continuation cells - they're part of the previous cell
        if cell.continuation {
            i += 1;
            continue;
        }

        if cell.kind == ElementKind::PitchedElement {
            // Count this note + following extensions
            let mut slot_count = 1;
            let mut j = i + 1;
            while j < beat_cells.len() {
                if beat_cells[j].kind == ElementKind::UnpitchedElement && beat_cells[j].char == "-" {
                    slot_count += 1;
                    j += 1;
                } else {
                    break;
                }
            }
            slot_counts.push(slot_count);
            i = j;
        } else if cell.kind == ElementKind::UnpitchedElement && cell.char != "-" {
            // Standalone rest
            slot_counts.push(1);
            i += 1;
        } else {
            // Skip standalone "-" or other elements
            i += 1;
        }
    }

    if slot_counts.is_empty() {
        return (vec![], 0);
    }

    // Find GCD of all slot counts
    let mut gcd_value = slot_counts[0];
    for &count in &slot_counts[1..] {
        gcd_value = gcd(gcd_value, count);
    }

    // Reduce by GCD
    let normalized: Vec<usize> = slot_counts.iter().map(|&c| c / gcd_value).collect();
    let effective_subdivisions: usize = normalized.iter().sum();

    (normalized, effective_subdivisions)
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

    // Normalize beat to get reduced slot counts and effective subdivisions
    let (normalized_slots, subdivisions) = normalize_beat(beat_cells);

    if subdivisions == 0 {
        return Ok(());
    }

    let mut i = 0;
    let mut slot_index = 0;

    // Handle leading divisions (tied note from previous beat)
    if beat_starts_with_division(beat_cells) && builder.last_note.is_some() {
        // Count leading "-" symbols
        let mut leading_div_count = 0;
        while i < beat_cells.len() &&
              beat_cells[i].kind == ElementKind::UnpitchedElement &&
              beat_cells[i].char == "-" {
            leading_div_count += 1;
            i += 1;
        }

        if leading_div_count > 0 {
            // Write tied note using previous note's pitch
            let (prev_pitch_code, prev_octave) = builder.last_note.clone().unwrap();

            // Calculate normalized duration for leading divisions
            // IMPORTANT: Don't count continuation cells in rhythmic calculations!
            let total_cells = beat_cells.iter().filter(|c| !c.continuation).count();
            let duration_divs = (measure_divisions * leading_div_count) / total_cells;
            let musical_duration = leading_div_count as f64 / total_cells as f64;

            // Write note with tie="stop" using PitchCode
            builder.write_note_with_beam_from_pitch_code(&prev_pitch_code, prev_octave, duration_divs, musical_duration, None, None, None, Some("stop"), None)?;
        }
    }

    // Detect if tuplet is needed (only for multiple elements with non-power-of-2 subdivisions)
    let tuplet_info = if subdivisions > 1 {
        detect_tuplet(subdivisions)
    } else {
        None
    };

    // Collect all notes/rests first for tuplet bracket placement
    #[derive(Debug)]
    enum BeatElement {
        Note {
            pitch_code: PitchCode,
            octave: i8,
            duration_divs: usize,
            musical_duration: f64,
            is_last_note: bool,
            slur_indicator: SlurIndicator,
        },
        Rest {
            duration_divs: usize,
            musical_duration: f64,
        },
    }
    let mut elements = Vec::new();

    // Process remaining elements in the beat
    while i < beat_cells.len() {
        let cell = &beat_cells[i];

        // IMPORTANT: Skip continuation cells - they're part of the previous cell
        if cell.continuation {
            i += 1;
            continue;
        }

        match cell.kind {
            ElementKind::PitchedElement => {
                // Count following "-" extenders
                let mut extension_count = 0;
                let mut j = i + 1;
                while j < beat_cells.len() {
                    if beat_cells[j].kind == ElementKind::UnpitchedElement && beat_cells[j].char == "-" {
                        extension_count += 1;
                        j += 1;
                    } else {
                        break;
                    }
                }

                // Use normalized slot count from the normalization result
                if slot_index >= normalized_slots.len() {
                    i += 1 + extension_count;
                    continue;
                }
                let normalized_slot_count = normalized_slots[slot_index];
                slot_index += 1;

                // Calculate duration using normalized values
                let duration_divs = (measure_divisions * normalized_slot_count) / subdivisions;
                let musical_duration = normalized_slot_count as f64 / subdivisions as f64;

                // Extract pitch using PitchCode (system-agnostic)
                if let Some(pitch_code) = &cell.pitch_code {
                    // Check if this is the last note in beat and next beat starts with "-"
                    let is_last_note = {
                        let mut k = i + 1 + extension_count;
                        while k < beat_cells.len() {
                            if beat_cells[k].kind == ElementKind::PitchedElement {
                                break;
                            }
                            k += 1;
                        }
                        k >= beat_cells.len()
                    };

                    elements.push(BeatElement::Note {
                        pitch_code: *pitch_code,
                        octave: cell.octave,
                        duration_divs,
                        musical_duration,
                        is_last_note,
                        slur_indicator: cell.slur_indicator,
                    });
                }

                // Skip the extensions
                i += 1 + extension_count;
            }
            ElementKind::UnpitchedElement if cell.char != "-" => {
                // Standalone unpitched element (rest, not extension)
                if slot_index >= normalized_slots.len() {
                    i += 1;
                    continue;
                }
                let normalized_slot_count = normalized_slots[slot_index];
                slot_index += 1;

                let duration_divs = (measure_divisions * normalized_slot_count) / subdivisions;
                let musical_duration = normalized_slot_count as f64 / subdivisions as f64;
                elements.push(BeatElement::Rest {
                    duration_divs,
                    musical_duration,
                });
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

    // Write all collected elements with tuplet brackets
    let element_count = elements.len();

    if element_count == 0 {
        // No notes or rests found (e.g., beat contains only text elements)
        // Add a whole rest
        builder.write_rest(4, 4.0);
    } else {
        for (idx, element) in elements.iter().enumerate() {
            // Tuplet bracket only on first and last elements
            let tuplet_bracket = if tuplet_info.is_some() && element_count > 1 {
                if idx == 0 {
                    Some("start")
                } else if idx == element_count - 1 {
                    Some("stop")
                } else {
                    None
                }
            } else {
                None
            };

            match element {
                BeatElement::Note { pitch_code, octave, duration_divs, musical_duration, is_last_note, slur_indicator } => {
                    let tie = if *is_last_note && next_beat_starts_with_div {
                        Some("start")
                    } else {
                        None
                    };

                    // Determine slur type based on indicator
                    let slur = match slur_indicator {
                        SlurIndicator::SlurStart => Some("start"),
                        SlurIndicator::SlurEnd => Some("stop"),
                        SlurIndicator::None => None,
                    };

                    builder.write_note_with_beam_from_pitch_code(pitch_code, *octave, *duration_divs, *musical_duration, None, tuplet_info, tuplet_bracket, tie, slur)?;
                }
                BeatElement::Rest { duration_divs, musical_duration } => {
                    builder.write_rest_with_tuplet(*duration_divs, *musical_duration, tuplet_info, tuplet_bracket);
                }
            }
        }
    }

    Ok(())
}

/// Detect if beat needs tuplet notation and calculate ratio
/// Returns Option<(actual_notes, normal_notes)>
/// - None if standard division (1, 2, 4, 8, 16, 32, 64, 128)
/// - Some((actual, normal)) if tuplet needed
///
/// Follows standard tuplet ratios:
/// - 3:2 (triplet - 3 in the time of 2)
/// - 5:4 (quintuplet - 5 in the time of 4)
/// - 6:4 (sextuplet - 6 in the time of 4)
/// - 7:4 or 7:8 (septuplet)
/// - 9:8 (nonuplet)
/// - etc.
fn detect_tuplet(subdivisions: usize) -> Option<(usize, usize)> {
    // Standard divisions don't need tuplets (powers of 2)
    if subdivisions.is_power_of_two() && subdivisions <= 128 {
        return None;
    }

    // Calculate normal_notes based on standard tuplet ratios
    let normal_notes = match subdivisions {
        3 => 2,           // Triplet: 3:2
        5 => 4,           // Quintuplet: 5:4
        6 => 4,           // Sextuplet: 6:4
        7 => 4,           // Septuplet: 7:4
        9 => 8,           // Nonuplet: 9:8
        10 => 8,          // 10:8
        11 => 8,          // 11:8
        12 => 8,          // 12:8
        13 => 8,          // 13:8
        14 => 8,          // 14:8
        15 => 8,          // 15:8
        _ if subdivisions <= 32 => 16,  // Larger tuplets: x:16
        _ if subdivisions <= 64 => 32,  // x:32
        _ if subdivisions <= 128 => 64,  // x:64
        _ => 128,         // Very large tuplets: x:128
    };

    Some((subdivisions, normal_notes))
}