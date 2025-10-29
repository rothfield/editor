//! MusicXML measure and segment processing with FSM
//!
//! Handles splitting cells at barlines, calculating measure divisions,
//! processing segments (content between barlines), and managing measure state.
//!
//! ## Measure FSM States
//!
//! ```text
//! [Ready] --start_measure--> [Open]
//!   |
//!   +--> [Open] --add_segment--> [Open]
//!         |
//!         +--> [Open] --end_measure--> [Closed]
//!               |
//!               +--> [Closed] --finalize--> [Ready]
//! ```

use crate::models::{Cell, ElementKind};
use crate::parse::beats::BeatDeriver;
use super::builder::MusicXmlBuilder;
use super::beat::process_beat_with_context;
use super::helpers::lcm;

/// Calculate measure divisions (LCM of all beat subdivision counts)
pub fn calculate_measure_divisions(cells: &[Cell], beat_deriver: &BeatDeriver) -> usize {
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

/// Split cells at barlines, returning segment indices (start, end)
pub fn split_at_barlines(cells: &[Cell]) -> Vec<(usize, usize)> {
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
pub fn process_segment(
    builder: &mut MusicXmlBuilder,
    cells: &[Cell],
    beat_deriver: &BeatDeriver,
    measure_divisions: usize
) -> Result<(), String> {
    // Extract beats using beat deriver
    let beats = beat_deriver.extract_implicit_beats(cells);

    for (i, beat) in beats.iter().enumerate() {
        let _beat_cells = &cells[beat.start..=beat.end];

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

/// Check if a beat starts with "-" (division/extension)
fn beat_starts_with_division(beat_cells: &[Cell]) -> bool {
    beat_cells.first()
        .map(|cell| cell.kind == ElementKind::UnpitchedElement && cell.char == "-")
        .unwrap_or(false)
}
