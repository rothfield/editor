//! MusicXML export
//!
//! This module provides MusicXML export functionality.

pub mod duration;
pub mod pitch;
pub mod builder;

pub use duration::*;
pub use pitch::*;
pub use builder::*;

use crate::models::{Document, ElementKind, Cell, PitchCode, SlurIndicator, OrnamentPositionType, BeatSpan};
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
        // Also exclude rhythm-transparent cells (ornaments/grace notes) which don't contribute to beat divisions
        let subdivision_count = beat_cells.iter().filter(|c| !c.continuation && !c.is_rhythm_transparent()).count();
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
        if cell.kind.is_barline() {
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

        // Process this beat (beats never contain only ornaments now)
        process_beat_with_context(builder, cells, beat, measure_divisions, next_beat_starts_with_div)?;
    }

    Ok(())
}

/// Process a beat with context about preceding ornament indicators
/// Looks back before the beat to find any ornament start indicators that should apply to this beat
fn process_beat_with_context(
    builder: &mut MusicXmlBuilder,
    all_cells: &[Cell],
    beat: &BeatSpan,
    measure_divisions: usize,
    next_beat_starts_with_div: bool
) -> Result<(), String> {
    let beat_cells = &all_cells[beat.start..=beat.end];

    // Look backwards to find any preceding ornament start indicators
    // These would indicate grace notes that should be attached to the first note in this beat
    let mut preceding_grace_notes: Vec<(PitchCode, i8, OrnamentPositionType)> = Vec::new();
    let mut current_ornament_position = OrnamentPositionType::Before;

    // Search backwards from beat start for ornament indicators
    if beat.start > 0 {
        let mut search_index = beat.start - 1;
        loop {
            let cell = &all_cells[search_index];

            // If we find an ornament start, collect grace notes between here and beat start
            if cell.is_ornament_start() {
                current_ornament_position = cell.ornament_indicator.position_type();
                // Collect pitched elements between this start and the beat start
                for j in (search_index + 1)..beat.start {
                    let c = &all_cells[j];
                    if c.kind == ElementKind::PitchedElement && !c.continuation {
                        if let Some(pitch_code) = &c.pitch_code {
                            preceding_grace_notes.push((*pitch_code, c.octave, current_ornament_position));
                        }
                    }
                }
                break;
            }

            if search_index == 0 {
                break;
            }
            search_index -= 1;
        }
    }

    // If we found preceding grace notes, write them and then process the beat normally
    if !preceding_grace_notes.is_empty() {
        for (grace_pitch_code, grace_octave, ornament_position) in preceding_grace_notes {
            let placement = match ornament_position {
                OrnamentPositionType::OnTop => Some("above"),
                OrnamentPositionType::Before | OrnamentPositionType::After => None,
            };
            builder.write_grace_note(&grace_pitch_code, grace_octave, true, placement)?;
        }
    }

    // Collect trailing grace notes that appear immediately after this beat
    // These are ornament cells that appear between this beat and the next non-ornament element
    let mut trailing_ornament_cells = Vec::new();
    if beat.end + 1 < all_cells.len() {
        let mut j = beat.end + 1;
        while j < all_cells.len() {
            let c = &all_cells[j];
            if c.is_rhythm_transparent() && c.kind == ElementKind::PitchedElement && !c.continuation {
                trailing_ornament_cells.push(c);
                j += 1;
            } else {
                // Stop at first non-ornament cell
                break;
            }
        }
    }

    process_beat(builder, beat_cells, measure_divisions, next_beat_starts_with_div, trailing_ornament_cells, all_cells)
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

        // IMPORTANT: Skip rhythm-transparent cells (ornaments/grace notes) - they don't contribute to beat rhythm
        if cell.is_rhythm_transparent() {
            i += 1;
            continue;
        }

        if cell.kind == ElementKind::PitchedElement {
            // Count this note + following extensions
            let mut slot_count = 1;
            let mut j = i + 1;

            // Skip continuation cells (they're part of the pitched element)
            while j < beat_cells.len() && beat_cells[j].continuation {
                j += 1;
            }

            // Now look for extension "-" characters
            while j < beat_cells.len() {
                if beat_cells[j].kind == ElementKind::UnpitchedElement && beat_cells[j].char == "-" {
                    slot_count += 1;
                    j += 1;
                } else if beat_cells[j].is_rhythm_transparent() {
                    // Skip ornaments/grace notes
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
    next_beat_starts_with_div: bool,
    trailing_ornament_cells: Vec<&Cell>,
    _all_cells: &[Cell]
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
            builder.write_note_with_beam_from_pitch_code(&prev_pitch_code, prev_octave, duration_divs, musical_duration, None, None, None, Some("stop"), None, None, None)?;
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
            grace_notes_before: Vec<(PitchCode, i8, OrnamentPositionType)>, // Grace notes that come BEFORE the main note
            grace_notes_after: Vec<(PitchCode, i8, OrnamentPositionType)>, // Grace notes that come AFTER the main note (unmeasured fioritura)
            ornament_type: Option<&'static str>, // Detected ornament type (trill, turn, mordent, etc.)
        },
        Rest {
            duration_divs: usize,
            musical_duration: f64,
        },
    }
    let mut elements = Vec::new();

    // Track ornaments (grace notes) to be attached to next main note
    let mut pending_grace_notes: Vec<(PitchCode, i8, OrnamentPositionType)> = Vec::new();

    // First pass: collect all grace notes that come BEFORE any main note
    // These will be attached to the first main note
    let mut grace_notes_before_main: Vec<(PitchCode, i8, OrnamentPositionType)> = Vec::new();
    let mut found_main_note = false;
    for j in 0..beat_cells.len() {
        let cell = &beat_cells[j];
        if !cell.continuation && !cell.is_rhythm_transparent() && cell.kind == ElementKind::PitchedElement {
            found_main_note = true;
            break;
        }
        if cell.is_rhythm_transparent() && cell.kind == ElementKind::PitchedElement && !cell.continuation {
            if let Some(pitch_code) = &cell.pitch_code {
                grace_notes_before_main.push((*pitch_code, cell.octave, cell.ornament_indicator.position_type()));
            }
        }
    }

    // Start with grace notes that come before the main note
    pending_grace_notes.extend(grace_notes_before_main);

    // Process remaining elements in the beat
    while i < beat_cells.len() {
        let cell = &beat_cells[i];

        // IMPORTANT: Skip continuation cells - they're part of the previous cell
        if cell.continuation {
            i += 1;
            continue;
        }

        // If this cell is a rhythm-transparent ornament cell, treat it as a grace note
        if cell.is_rhythm_transparent() {
            if cell.kind == ElementKind::PitchedElement {
                if let Some(pitch_code) = &cell.pitch_code {
                    let ornament_position = cell.ornament_indicator.position_type();
                    pending_grace_notes.push((*pitch_code, cell.octave, ornament_position));
                }
            }
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

                // Initialize trailing grace note count (will be updated if we have a pitch code)
                let mut trailing_grace_count = 0;

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
                            if !beat_cells[k].continuation && beat_cells[k].kind == ElementKind::PitchedElement {
                                break;
                            }
                            k += 1;
                        }
                        k >= beat_cells.len()
                    };

                    // Collect grace notes that come AFTER this main note (unmeasured fioritura)
                    // Use the pre-collected trailing_ornament_cells from following beats with only ornaments
                    let mut trailing_grace_notes: Vec<(PitchCode, i8, OrnamentPositionType)> = Vec::new();
                    for trailing_cell in &trailing_ornament_cells {
                        if let Some(pitch_code) = &trailing_cell.pitch_code {
                            let ornament_position = trailing_cell.ornament_indicator.position_type();
                            trailing_grace_notes.push((*pitch_code, trailing_cell.octave, ornament_position));
                        }
                    }
                    trailing_grace_count = trailing_ornament_cells.len();

                    // Keep before and after grace notes separate for proper MusicXML output
                    // (before notes go before main note, after notes go after main note with steal-time-following)
                    let grace_notes_before = pending_grace_notes.clone();
                    let grace_notes_after = trailing_grace_notes.clone();

                    // Detect ornament type from all grace notes (both before and after)
                    let all_grace_notes: Vec<_> = grace_notes_before.iter()
                        .chain(grace_notes_after.iter())
                        .cloned()
                        .collect();
                    let ornament_type = if !all_grace_notes.is_empty() {
                        detect_grace_note_ornament_type(&all_grace_notes)
                    } else {
                        None
                    };

                    elements.push(BeatElement::Note {
                        pitch_code: *pitch_code,
                        octave: cell.octave,
                        duration_divs,
                        musical_duration,
                        is_last_note,
                        slur_indicator: cell.slur_indicator,
                        grace_notes_before,
                        grace_notes_after,
                        ornament_type,
                    });

                    // Clear pending grace notes after attaching to main note
                    pending_grace_notes.clear();
                }

                // Skip the main note, extensions, and trailing grace notes
                i += 1 + extension_count + trailing_grace_count;
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
                BeatElement::Note { pitch_code, octave, duration_divs, musical_duration, is_last_note, slur_indicator, grace_notes_before, grace_notes_after, ornament_type } => {
                    // Write grace notes that come BEFORE the main note (traditional grace notes)
                    let before_grace_count = grace_notes_before.len();
                    for (idx, (grace_pitch_code, grace_octave, ornament_position)) in grace_notes_before.iter().enumerate() {
                        let placement = match ornament_position {
                            OrnamentPositionType::OnTop => Some("above"),
                            OrnamentPositionType::Before | OrnamentPositionType::After => None,
                        };

                        // Determine beam state for grouped grace notes
                        let beam_state = if before_grace_count > 1 {
                            if idx == 0 {
                                Some("begin")
                            } else if idx == before_grace_count - 1 {
                                Some("end")
                            } else {
                                Some("continue")
                            }
                        } else {
                            None
                        };

                        // Determine slur state: start on first, stop on last, none in between
                        let slur_type = if before_grace_count > 1 {
                            if idx == 0 {
                                Some("start")
                            } else if idx == before_grace_count - 1 {
                                Some("stop")
                            } else {
                                None
                            }
                        } else if before_grace_count == 1 {
                            // Single grace note: start and stop on the same note
                            Some("start")
                        } else {
                            None
                        };

                        // Before grace notes: use write_grace_note_full with steal-time-previous (10%) and slurring
                        builder.write_grace_note_full(grace_pitch_code, *grace_octave, true, placement, false, Some(10.0), beam_state, slur_type)?;
                    }

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

                    builder.write_note_with_beam_from_pitch_code(pitch_code, *octave, *duration_divs, *musical_duration, None, tuplet_info, tuplet_bracket, tie, slur, None, *ornament_type)?;

                    // Write grace notes that come AFTER the main note (unmeasured fioritura)
                    let after_grace_count = grace_notes_after.len();
                    for (idx, (grace_pitch_code, grace_octave, ornament_position)) in grace_notes_after.iter().enumerate() {
                        let placement = match ornament_position {
                            OrnamentPositionType::OnTop => Some("above"),
                            OrnamentPositionType::Before | OrnamentPositionType::After => None,
                        };

                        // Determine beam state for grouped grace notes
                        let beam_state = if after_grace_count > 1 {
                            if idx == 0 {
                                Some("begin")
                            } else if idx == after_grace_count - 1 {
                                Some("end")
                            } else {
                                Some("continue")
                            }
                        } else {
                            None
                        };

                        // Determine slur state: start on first, stop on last
                        let slur_type = if after_grace_count > 1 {
                            if idx == 0 {
                                Some("start")
                            } else if idx == after_grace_count - 1 {
                                Some("stop")
                            } else {
                                None
                            }
                        } else if after_grace_count == 1 {
                            Some("start")
                        } else {
                            None
                        };

                        // After grace notes: use write_grace_note_full with steal-time-previous (10%) for ornamental flourish
                        builder.write_grace_note_full(grace_pitch_code, *grace_octave, true, placement, true, Some(10.0), beam_state, slur_type)?;
                    }
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

/// Detect ornament type from grace note characteristics
/// Returns the MusicXML ornament type name as a string
///
/// Detection heuristic:
/// - 1-2 grace notes: appoggiatura/acciaccatura (slash handled separately)
/// - 3+ repeated notes: trill
/// - Different notes in sequence: turn or other
///
/// Note: This is a simplified heuristic. For more accurate detection,
/// ornament type should be stored in the Ornament struct.
pub fn detect_grace_note_ornament_type(grace_notes: &[(PitchCode, i8, OrnamentPositionType)]) -> Option<&'static str> {
    if grace_notes.is_empty() {
        return None;
    }

    // For single grace note, it's typically an appoggiatura/acciaccatura (handled by slash param)
    if grace_notes.len() == 1 {
        return None; // Not a "typed" ornament, just a grace note
    }

    // For multiple grace notes, check if they're repeated (trill) or different (turn)
    if grace_notes.len() >= 2 {
        let first_pitch = &grace_notes[0].0;

        // Check if all notes are the same pitch (trill)
        let all_same = grace_notes.iter().all(|(p, _, _)| p == first_pitch);
        if all_same {
            return Some("trill");
        }

        // For now, default to "turn" for multiple different notes
        // This could be enhanced with more sophisticated detection
        if grace_notes.len() >= 3 {
            return Some("turn");
        }
    }

    None
}

/// Map OrnamentPositionType to MusicXML placement attribute
pub fn ornament_position_to_placement(position: &OrnamentPositionType) -> Option<&'static str> {
    match position {
        OrnamentPositionType::OnTop => Some("above"),
        OrnamentPositionType::Before | OrnamentPositionType::After => None, // Default placement
    }
}