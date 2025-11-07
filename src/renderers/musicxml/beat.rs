//! MusicXML beat processing
//!
//! Handles beat normalization, processing, and tuplet detection.
//! This module contains the core rhythm calculation logic for converting
//! cell-based beats to MusicXML measures.

use crate::models::{Cell, ElementKind, PitchCode, SlurIndicator, BeatSpan};
use super::builder::MusicXmlBuilder;
use super::helpers::gcd;

/// Process a beat with context about preceding ornament indicators
/// Simplified version - ornament system has been removed
pub fn process_beat_with_context(
    builder: &mut MusicXmlBuilder,
    all_cells: &[Cell],
    beat: &BeatSpan,
    measure_divisions: usize,
    next_beat_starts_with_div: bool
) -> Result<(), String> {
    let beat_cells = &all_cells[beat.start..=beat.end];
    process_beat(builder, beat_cells, measure_divisions, next_beat_starts_with_div)
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
        },
        Rest {
            duration_divs: usize,
            musical_duration: f64,
        },
    }

    /// Helper: Compute correct slur types for elements in a beat, fixing off-by-one issues with tuplets
    ///
    /// This analyzes which notes have slur indicators and assigns the correct
    /// slur types (start/continue/stop) based on their position in the final element sequence.
    /// This is necessary because in tuplets, the cell indices don't directly correspond to
    /// the final note positions.
    ///
    /// IMPORTANT: When a slur span is detected, ALL notes from first to last slurred note
    /// are included in the slur (not just those explicitly marked). This handles cases where
    /// the first note of a slurred span might not have an explicit SlurStart marker.
    fn compute_slur_types_for_tuplet(elements: &[BeatElement]) -> Vec<Option<&'static str>> {
        let mut slur_types: Vec<Option<&'static str>> = vec![None; elements.len()];

        // Find all notes that have ANY slur indicator (start or end)
        let mut slur_marked_indices = Vec::new();

        for (idx, element) in elements.iter().enumerate() {
            if let BeatElement::Note { slur_indicator, .. } = element {
                match slur_indicator {
                    SlurIndicator::SlurStart | SlurIndicator::SlurEnd => {
                        slur_marked_indices.push((idx, slur_indicator));
                    }
                    SlurIndicator::None => {}
                }
            }
        }

        // If we have slur markers, determine the span they cover
        if !slur_marked_indices.is_empty() {
            let min_idx = *slur_marked_indices.iter().map(|(idx, _)| idx).min().unwrap_or(&0);
            let max_idx = *slur_marked_indices.iter().map(|(idx, _)| idx).max().unwrap_or(&0);

            // Mark the first note in the slur span with "start"
            slur_types[min_idx] = Some("start");

            // Mark all notes between first and last with "continue"
            for idx in (min_idx + 1)..max_idx {
                slur_types[idx] = Some("continue");
            }

            // Mark the last note in the slur span with "stop"
            slur_types[max_idx] = Some("stop");
        }

        slur_types
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
                            if !beat_cells[k].continuation && beat_cells[k].kind == ElementKind::PitchedElement {
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

                // Skip the main note and extensions
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
        // Analyze slur patterns and compute correct slur types for tuplets
        // This fixes the issue where slurs in tuplets were off-by-one
        let slur_types_per_element = compute_slur_types_for_tuplet(&elements);

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
                BeatElement::Note { pitch_code, octave, duration_divs, musical_duration, is_last_note, slur_indicator: _original_slur_indicator } => {
                    // Use computed slur type instead of original indicator (fixes tuplet slur off-by-one)
                    let slur = slur_types_per_element.get(idx).and_then(|&opt| opt);

                    let tie = if *is_last_note && next_beat_starts_with_div {
                        Some("start")
                    } else {
                        None
                    };

                    builder.write_note_with_beam_from_pitch_code(pitch_code, *octave, *duration_divs, *musical_duration, None, tuplet_info, tuplet_bracket, tie, slur, None, None)?;
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
