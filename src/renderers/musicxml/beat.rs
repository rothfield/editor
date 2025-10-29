//! MusicXML beat processing
//!
//! Handles beat normalization, processing, and tuplet detection.
//! This module contains the core rhythm calculation logic for converting
//! cell-based beats to MusicXML measures.

use crate::models::{Cell, ElementKind, PitchCode, SlurIndicator, OrnamentPositionType, BeatSpan};
use super::builder::MusicXmlBuilder;
use super::grace_notes::detect_grace_note_ornament_type;
use super::helpers::gcd;

/// Process a beat with context about preceding ornament indicators
/// Looks back before the beat to find any ornament start indicators that should apply to this beat
pub fn process_beat_with_context(
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

    // Search backwards from beat start for ornament indicators
    if beat.start > 0 {
        let mut search_index = beat.start - 1;
        loop {
            let cell = &all_cells[search_index];

            // If we find an ornament start, collect grace notes between here and beat start
            if cell.is_ornament_start() {
                let current_ornament_position = cell.ornament_indicator.position_type();
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

    // Collect trailing grace notes that appear at the end of this beat
    // These are rhythm-transparent ornament cells that appear within beat_cells
    // after the last main note (beat-element)
    let mut trailing_ornament_cells = Vec::new();

    // First, find the last beat-element (pitched/unpitched/breath) in beat_cells
    let mut last_beat_element_index = None;
    for (idx, cell) in beat_cells.iter().enumerate() {
        if !cell.is_rhythm_transparent() && !cell.continuation {
            last_beat_element_index = Some(idx);
        }
    }

    // Collect rhythm-transparent cells after the last beat-element
    if let Some(last_idx) = last_beat_element_index {
        for j in (last_idx + 1)..beat_cells.len() {
            let c = &beat_cells[j];
            if c.is_rhythm_transparent() && c.kind == ElementKind::PitchedElement && !c.continuation {
                trailing_ornament_cells.push(c);
            }
        }
    }

    process_beat(builder, beat_cells, measure_divisions, next_beat_starts_with_div, trailing_ornament_cells, all_cells)
}

/// Check if a beat starts with "-" (division/extension)
pub fn beat_starts_with_division(beat_cells: &[Cell]) -> bool {
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
    let mut seen_pitched_element = false; // FSM: Track whether we've seen a pitched element

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
            seen_pitched_element = true; // FSM: Transition to AFTER_PITCHED state
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
        } else if cell.kind == ElementKind::UnpitchedElement {
            // FSM: Distinguish between "-" at START (rest) vs "-" after note (extension)
            if cell.char == "-" {
                // Dash: leading dash in START state is a rest, dash in AFTER_PITCHED is extension (already handled above)
                if !seen_pitched_element {
                    // Leading dash before any pitched note → treat as rest
                    slot_counts.push(1);
                }
                // else: orphaned dash after extensions, skip it
            } else {
                // Other unpitched elements (not dash) are rests
                slot_counts.push(1);
            }
            i += 1;
        } else {
            // Skip other elements
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
pub fn process_beat(
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
            // IMPORTANT: Don't count continuation cells or rhythm-transparent cells (ornaments) in rhythmic calculations!
            let total_cells = beat_cells.iter().filter(|c| !c.continuation && !c.is_rhythm_transparent()).count();
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
            grace_notes_before: Vec<(PitchCode, i8, OrnamentPositionType)>,
            grace_notes_after: Vec<(PitchCode, i8, OrnamentPositionType)>,
            ornament_type: Option<&'static str>,
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
    for j in 0..beat_cells.len() {
        let cell = &beat_cells[j];
        if !cell.continuation && !cell.is_rhythm_transparent() && cell.kind == ElementKind::PitchedElement {
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
                    // BUT ONLY for the last note in this beat!
                    let mut trailing_grace_notes: Vec<(PitchCode, i8, OrnamentPositionType)> = Vec::new();
                    if is_last_note {
                        for trailing_cell in &trailing_ornament_cells {
                            if let Some(pitch_code) = &trailing_cell.pitch_code {
                                let ornament_position = trailing_cell.ornament_indicator.position_type();
                                trailing_grace_notes.push((*pitch_code, trailing_cell.octave, ornament_position));
                            }
                        }
                    }
                    trailing_grace_count = if is_last_note { trailing_ornament_cells.len() } else { 0 };

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
pub fn detect_tuplet(subdivisions: usize) -> Option<(usize, usize)> {
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
        _ if subdivisions <= 128 => 64, // x:64
        _ => 128,         // Very large tuplets: x:128
    };

    Some((subdivisions, normal_notes))
}
