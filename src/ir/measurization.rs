//! Measurization Layer for Polyphonic Alignment
//!
//! This module converts beat-based ExportLines into measure-aligned output
//! where all parts have identical measure counts (required for valid MusicXML).
//!
//! # Architecture
//!
//! ```text
//! ExportLines (beat-based) → MEASURIZATION → MeasurizedParts (bar-aligned)
//! ```
//!
//! # Key Features
//!
//! - Computes global tick grid (LCM of all measure divisions)
//! - Pads parts to bar boundaries (not just maxTicks)
//! - Splits events across bar boundaries with proper ties
//! - Preserves all metadata (lyrics, slurs, grace notes, etc.)
//! - Tracks system breaks for `<print new-system="yes"/>`

use crate::ir::{ExportLine, ExportEvent, Fraction, TieData, TieType};
use std::collections::HashSet;

/// Single event in the uniform tick timeline.
/// CRITICAL: Preserves original ExportEvent to keep all metadata.
#[derive(Clone, Debug)]
pub struct TickEvent {
    /// Duration in uniform ticks (global grid) - SOURCE OF TRUTH for emission
    pub dur: usize,
    /// Original event with ALL metadata (divisions/fraction used only for reference)
    pub event: ExportEvent,
    /// Structural tie from bar split (continues from previous chunk)
    pub tie_from: bool,
    /// Structural tie from bar split (continues to next chunk)
    pub tie_to: bool,
}

/// A single bar (measure) of events
#[derive(Clone, Debug)]
pub struct Bar {
    /// Whether this is a pickup (anacrusis) measure
    pub is_pickup: bool,
    /// Events in this bar
    pub events: Vec<TickEvent>,
}

/// Part metadata for MusicXML part-list emission
#[derive(Clone, Debug, Default)]
pub struct PartMetadata {
    /// Part name for `<part-name>`
    pub name: Option<String>,
    /// Group number if part of a bracket group
    pub group_number: Option<usize>,
    /// Position in group (for bracket start/stop)
    pub group_position: GroupPosition,
    /// Key signature (fifths: -7 to +7)
    pub key_fifths: i32,
    /// Time signature numerator
    pub time_beats: usize,
    /// Time signature denominator
    pub time_beat_type: usize,
    /// Clef sign ("G", "F", "C")
    pub clef_sign: String,
    /// Clef line (2 for treble, 4 for bass)
    pub clef_line: usize,
}

/// Position within a bracket group
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub enum GroupPosition {
    /// First part in group (emit `<part-group type="start">`)
    Start,
    /// Middle part (no group markers)
    #[default]
    Middle,
    /// Last part in group (emit `<part-group type="stop">`)
    End,
    /// Not in a group
    None,
}

/// A measurized part ready for MusicXML emission
#[derive(Clone, Debug)]
pub struct MeasurizedPart {
    /// Part ID (e.g., "P1", "P2")
    pub part_id: String,
    /// Part metadata for part-list
    pub metadata: PartMetadata,
    /// Bars in this part (all parts will have same count)
    pub bars: Vec<Bar>,
    /// Bar indices where new system starts (for `<print new-system="yes"/>`)
    pub system_breaks: Vec<usize>,
    /// Global divisions (ticks per quarter note)
    pub global_divisions: usize,
}

/// Internal structure for tracking tick streams before slicing
struct TickStream {
    part_id: String,
    events: Vec<TickEvent>,
    system_markers: Vec<(usize, usize)>, // (tick_position, system_id)
    metadata: PartMetadata,
}

/// Compute LCM of two numbers
fn lcm(a: usize, b: usize) -> usize {
    if a == 0 || b == 0 {
        0
    } else {
        a / gcd(a, b) * b
    }
}

/// Compute GCD of two numbers
fn gcd(a: usize, b: usize) -> usize {
    if b == 0 { a } else { gcd(b, a % b) }
}

/// Compute global divisions (LCM of all measure.divisions across all lines)
fn compute_global_divisions(export_lines: &[ExportLine]) -> usize {
    let mut result = 1usize;
    for line in export_lines {
        for measure in &line.measures {
            if measure.divisions > 0 {
                result = lcm(result, measure.divisions);
            }
        }
    }
    // Minimum of 4 divisions (quarter note subdivisions)
    result.max(4)
}

/// Group lines by part_id, preserving document order
/// Returns Vec to maintain insertion order (unlike HashMap)
fn group_by_part_id_ordered(export_lines: Vec<ExportLine>) -> Vec<(String, Vec<ExportLine>)> {
    let mut result: Vec<(String, Vec<ExportLine>)> = Vec::new();

    for line in export_lines {
        // Find existing group or create new one
        if let Some(group) = result.iter_mut().find(|(id, _)| *id == line.part_id) {
            group.1.push(line);
        } else {
            result.push((line.part_id.clone(), vec![line]));
        }
    }

    result
}

/// Convert an ExportLine to tick events at global_divisions scale
fn convert_line_to_ticks(
    line: &ExportLine,
    global_divisions: usize,
) -> Vec<TickEvent> {
    let mut tick_events = Vec::new();

    for measure in &line.measures {
        let measure_divisions = measure.divisions.max(1);
        let scale = global_divisions / measure_divisions;

        for event in &measure.events {
            let dur_ticks = match event {
                ExportEvent::Rest { divisions, .. } => divisions * scale,
                ExportEvent::Note(note) => note.divisions * scale,
                ExportEvent::Chord { divisions, .. } => divisions * scale,
            };

            tick_events.push(TickEvent {
                dur: dur_ticks,
                event: event.clone(),
                tie_from: false,
                tie_to: false,
            });
        }
    }

    tick_events
}

/// Extract part metadata from the first line
fn extract_part_metadata(lines: &[ExportLine]) -> PartMetadata {
    if lines.is_empty() {
        return PartMetadata::default();
    }

    let first = &lines[0];

    // Parse time signature (e.g., "4/4" -> (4, 4))
    let (time_beats, time_beat_type) = first.time_signature
        .as_ref()
        .and_then(|ts| {
            let parts: Vec<&str> = ts.split('/').collect();
            if parts.len() == 2 {
                Some((
                    parts[0].trim().parse().unwrap_or(4),
                    parts[1].trim().parse().unwrap_or(4),
                ))
            } else {
                None
            }
        })
        .unwrap_or((4, 4));

    // Parse key signature to fifths (-7 to +7)
    let key_fifths = first.key_signature
        .as_ref()
        .map(|ks| parse_key_to_fifths(ks))
        .unwrap_or(0);

    // Parse clef
    let (clef_sign, clef_line) = match first.clef.to_lowercase().as_str() {
        "bass" => ("F".to_string(), 4),
        "alto" => ("C".to_string(), 3),
        "tenor" => ("C".to_string(), 4),
        _ => ("G".to_string(), 2), // Default to treble
    };

    PartMetadata {
        name: if first.label.is_empty() { None } else { Some(first.label.clone()) },
        group_number: None,
        group_position: GroupPosition::None,
        key_fifths,
        time_beats,
        time_beat_type,
        clef_sign,
        clef_line,
    }
}

/// Parse key signature string to fifths (circle of fifths position)
fn parse_key_to_fifths(key: &str) -> i32 {
    let key_lower = key.to_lowercase();

    // Major keys - check flat/sharp keys BEFORE natural keys to avoid partial matches
    // e.g., "bb major" must match before "b major"
    if key_lower.contains("bb major") || key_lower.contains("b♭ major") { return -2; }
    if key_lower.contains("eb major") || key_lower.contains("e♭ major") { return -3; }
    if key_lower.contains("ab major") || key_lower.contains("a♭ major") { return -4; }
    if key_lower.contains("db major") || key_lower.contains("d♭ major") { return -5; }
    if key_lower.contains("gb major") || key_lower.contains("g♭ major") { return -6; }
    if key_lower.contains("cb major") || key_lower.contains("c♭ major") { return -7; }
    if key_lower.contains("f# major") || key_lower.contains("f♯ major") { return 6; }
    if key_lower.contains("c# major") || key_lower.contains("c♯ major") { return 7; }
    if key_lower.contains("c major") || key_lower == "c" { return 0; }
    if key_lower.contains("g major") || key_lower == "g" { return 1; }
    if key_lower.contains("d major") || key_lower == "d" { return 2; }
    if key_lower.contains("a major") || key_lower == "a" { return 3; }
    if key_lower.contains("e major") || key_lower == "e" { return 4; }
    if key_lower.contains("b major") || key_lower == "b" { return 5; }
    if key_lower.contains("f major") || key_lower == "f" { return -1; }

    // Minor keys (relative minor = major - 3)
    if key_lower.contains("a minor") || key_lower.contains("am") { return 0; }
    if key_lower.contains("e minor") || key_lower.contains("em") { return 1; }
    if key_lower.contains("b minor") || key_lower.contains("bm") { return 2; }
    if key_lower.contains("f# minor") || key_lower.contains("f#m") { return 3; }
    if key_lower.contains("c# minor") || key_lower.contains("c#m") { return 4; }
    if key_lower.contains("g# minor") || key_lower.contains("g#m") { return 5; }
    if key_lower.contains("d minor") || key_lower.contains("dm") { return -1; }
    if key_lower.contains("g minor") || key_lower.contains("gm") { return -2; }
    if key_lower.contains("c minor") || key_lower.contains("cm") { return -3; }
    if key_lower.contains("f minor") || key_lower.contains("fm") { return -4; }

    0 // Default to C major
}

/// Track system markers as tick positions
fn track_system_markers(
    lines: &[ExportLine],
    global_divisions: usize,
) -> Vec<(usize, usize)> {
    let mut markers = Vec::new();
    let mut tick_pos: usize = 0;

    for line in lines {
        markers.push((tick_pos, line.system_id));

        for measure in &line.measures {
            let measure_divisions = measure.divisions.max(1);
            let scale = global_divisions / measure_divisions;

            for event in &measure.events {
                let dur_ticks = match event {
                    ExportEvent::Rest { divisions, .. } => divisions * scale,
                    ExportEvent::Note(note) => note.divisions * scale,
                    ExportEvent::Chord { divisions, .. } => divisions * scale,
                };
                tick_pos += dur_ticks;
            }
        }
    }

    markers
}

/// Pad tick streams to bar boundary and equalize lengths
fn pad_to_bar_boundary(tick_streams: &mut [TickStream], bar_len_ticks: usize) {
    if bar_len_ticks == 0 {
        return;
    }

    // Find max ticks across all parts
    let max_ticks: usize = tick_streams
        .iter()
        .map(|s| s.events.iter().map(|e| e.dur).sum::<usize>())
        .max()
        .unwrap_or(0);

    // Round up to next bar boundary (ceiling division)
    let total_ticks = if max_ticks == 0 {
        bar_len_ticks // At least one bar
    } else {
        ((max_ticks + bar_len_ticks - 1) / bar_len_ticks) * bar_len_ticks
    };

    // Pad each part to total_ticks
    for stream in tick_streams.iter_mut() {
        let part_ticks: usize = stream.events.iter().map(|e| e.dur).sum();
        if part_ticks < total_ticks {
            let padding = total_ticks - part_ticks;
            // Create padding rest - dur is source of truth, fraction is placeholder
            stream.events.push(TickEvent {
                dur: padding,
                event: ExportEvent::Rest {
                    divisions: 0, // Unused - dur is source of truth
                    fraction: Fraction::new(1, 1), // Placeholder
                    tuplet: None,
                },
                tie_from: false,
                tie_to: false,
            });
        }
    }
}

/// Slice tick events into bars, handling multi-bar event splits
fn slice_into_bars(
    events: &[TickEvent],
    bar_len_ticks: usize,
    _pickup_ticks: Option<usize>,
) -> Vec<Bar> {
    if bar_len_ticks == 0 {
        return vec![];
    }

    let mut bars: Vec<Bar> = Vec::new();
    let mut current_bar_events: Vec<TickEvent> = Vec::new();
    let mut current_bar_ticks: usize = 0;

    for event in events {
        let mut remaining_dur = event.dur;
        let mut is_first_chunk = true;

        while remaining_dur > 0 {
            let space_in_bar = bar_len_ticks - current_bar_ticks;

            if remaining_dur <= space_in_bar {
                // Event fits in current bar
                let mut chunk = event.clone();
                chunk.dur = remaining_dur;

                // Set tie_from for continuation chunks
                if !is_first_chunk {
                    chunk.tie_from = true;
                    merge_tie_into_event(&mut chunk, TieType::Stop);
                }

                current_bar_events.push(chunk);
                current_bar_ticks += remaining_dur;

                // Complete bar if full
                if current_bar_ticks == bar_len_ticks {
                    bars.push(Bar {
                        is_pickup: false,
                        events: std::mem::take(&mut current_bar_events),
                    });
                    current_bar_ticks = 0;
                }

                remaining_dur = 0;
            } else {
                // Event crosses bar boundary
                let mut chunk = event.clone();
                chunk.dur = space_in_bar;
                chunk.tie_to = true;

                if !is_first_chunk {
                    chunk.tie_from = true;
                }

                // Merge tie into event
                if is_first_chunk {
                    merge_tie_into_event(&mut chunk, TieType::Start);
                } else {
                    merge_tie_into_event(&mut chunk, TieType::Continue);
                }

                current_bar_events.push(chunk);
                bars.push(Bar {
                    is_pickup: false,
                    events: std::mem::take(&mut current_bar_events),
                });

                current_bar_ticks = 0;
                remaining_dur -= space_in_bar;
                is_first_chunk = false;
            }
        }
    }

    // Push any remaining events as final bar
    if !current_bar_events.is_empty() {
        bars.push(Bar {
            is_pickup: false,
            events: current_bar_events,
        });
    }

    bars
}

/// Merge structural tie into event without overwriting semantic ties
fn merge_tie_into_event(tick_event: &mut TickEvent, structural_tie: TieType) {
    match &mut tick_event.event {
        ExportEvent::Note(ref mut note) => {
            // Only set if no existing tie (preserve semantic ties)
            if note.tie.is_none() {
                note.tie = Some(TieData { type_: structural_tie });
            }
        }
        ExportEvent::Chord { .. } => {
            // Chord ties handled at emission time via tick_event.tie_from/tie_to
        }
        ExportEvent::Rest { .. } => {
            // Rests don't tie
        }
    }
}

/// Map system markers to bar indices
fn map_system_markers_to_bars(
    markers: &[(usize, usize)],
    bar_len_ticks: usize,
) -> Vec<usize> {
    if bar_len_ticks == 0 {
        return vec![];
    }

    let mut system_breaks = Vec::new();
    let mut seen_bars: HashSet<usize> = HashSet::new();
    let mut prev_system_id: Option<usize> = None;

    for (marker_tick, system_id) in markers {
        // Only create break if system_id changed
        if prev_system_id.map_or(false, |prev| prev != *system_id) {
            let bar_idx = if *marker_tick % bar_len_ticks == 0 {
                *marker_tick / bar_len_ticks
            } else {
                // Round up for mid-bar markers
                (*marker_tick / bar_len_ticks) + 1
            };

            // Skip bar 0 and duplicates
            if bar_idx > 0 && !seen_bars.contains(&bar_idx) {
                system_breaks.push(bar_idx);
                seen_bars.insert(bar_idx);
            }
        }

        prev_system_id = Some(*system_id);
    }

    system_breaks.sort();
    system_breaks
}

/// Main entry point: Convert ExportLines to MeasurizedParts
///
/// All returned parts will have identical bar counts, suitable for MusicXML emission.
pub fn measurize_export_lines(
    export_lines: Vec<ExportLine>,
    beats_per_bar: usize,
    _pickup_ticks: Option<usize>,
) -> Vec<MeasurizedPart> {
    if export_lines.is_empty() {
        return vec![];
    }

    // Step 1: Compute global divisions (LCM of all measure divisions)
    let global_divisions = compute_global_divisions(&export_lines);

    // Step 2: Calculate bar length in ticks
    let bar_len_ticks = beats_per_bar * global_divisions;

    // Step 3: Group lines by part_id (preserving document order)
    let parts_map = group_by_part_id_ordered(export_lines);

    // Step 4: Convert each part to tick stream
    let mut tick_streams: Vec<TickStream> = parts_map
        .into_iter()
        .map(|(part_id, lines)| {
            let mut events = Vec::new();
            for line in &lines {
                events.extend(convert_line_to_ticks(line, global_divisions));
            }
            let system_markers = track_system_markers(&lines, global_divisions);
            let metadata = extract_part_metadata(&lines);

            TickStream {
                part_id,
                events,
                system_markers,
                metadata,
            }
        })
        .collect();

    // Step 5: Pad all parts to same total duration (bar boundary)
    pad_to_bar_boundary(&mut tick_streams, bar_len_ticks);

    // Step 6: Slice each part into bars
    let measurized_parts: Vec<MeasurizedPart> = tick_streams
        .into_iter()
        .map(|stream| {
            let bars = slice_into_bars(&stream.events, bar_len_ticks, None);
            let system_breaks = map_system_markers_to_bars(&stream.system_markers, bar_len_ticks);

            MeasurizedPart {
                part_id: stream.part_id,
                metadata: stream.metadata,
                bars,
                system_breaks,
                global_divisions,
            }
        })
        .collect();

    measurized_parts
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ir::{NoteData, PitchInfo, Fraction};
    use crate::models::PitchCode;
    use crate::models::core::StaffRole;

    /// Helper to create a simple note event
    fn make_note(pitch: PitchCode, divisions: usize) -> ExportEvent {
        ExportEvent::Note(NoteData {
            pitch: PitchInfo::new(pitch, 4),
            divisions,
            fraction: Fraction::new(1, 1),
            grace_notes_before: vec![],
            grace_notes_after: vec![],
            lyrics: None,
            slur: None,
            articulations: vec![],
            beam: None,
            tie: None,
            tuplet: None,
            breath_mark_after: false,
        })
    }

    /// Helper to create a simple rest event
    fn make_rest(divisions: usize) -> ExportEvent {
        ExportEvent::Rest {
            divisions,
            fraction: Fraction::new(1, 1),
            tuplet: None,
        }
    }

    /// Helper to create an ExportLine
    fn make_line(part_id: &str, system_id: usize, events: Vec<ExportEvent>, divisions: usize) -> ExportLine {
        ExportLine {
            system_id,
            part_id: part_id.to_string(),
            staff_role: StaffRole::Melody,
            key_signature: None,
            time_signature: Some("4/4".to_string()),
            clef: "treble".to_string(),
            label: String::new(),
            show_bracket: true,
            measures: vec![ExportMeasure { divisions, events }],
            lyrics: String::new(),
        }
    }

    #[test]
    fn test_compute_global_divisions() {
        let lines = vec![
            make_line("P1", 1, vec![make_note(PitchCode::N1, 4)], 4),
            make_line("P2", 1, vec![make_note(PitchCode::N2, 3)], 3),
        ];

        let global = compute_global_divisions(&lines);
        assert_eq!(global, 12); // LCM(4, 3) = 12
    }

    #[test]
    fn test_equal_beat_counts_single_measure() {
        // Test 1: Equal beat counts produce aligned measures
        let lines = vec![
            make_line("P1", 1, vec![
                make_note(PitchCode::N1, 1),
                make_note(PitchCode::N2, 1),
                make_note(PitchCode::N3, 1),
                make_note(PitchCode::N4, 1),
            ], 4),
            make_line("P2", 1, vec![
                make_note(PitchCode::N5, 1),
                make_note(PitchCode::N6, 1),
                make_note(PitchCode::N7, 1),
                make_note(PitchCode::N1, 1),
            ], 4),
        ];

        let parts = measurize_export_lines(lines, 4, None);

        assert_eq!(parts.len(), 2);
        assert_eq!(parts[0].bars.len(), parts[1].bars.len());
        assert_eq!(parts[0].bars.len(), 1);
    }

    #[test]
    fn test_unequal_beat_counts_padding() {
        // Test 2: Unequal beat counts - shorter part gets padded
        let lines = vec![
            make_line("P1", 1, vec![
                make_note(PitchCode::N1, 1),
                make_note(PitchCode::N2, 1),
                make_note(PitchCode::N3, 1),
                make_note(PitchCode::N4, 1),
            ], 4), // 4 beats
            make_line("P2", 1, vec![
                make_note(PitchCode::N5, 1),
                make_note(PitchCode::N6, 1),
            ], 4), // 2 beats - needs padding
        ];

        let parts = measurize_export_lines(lines, 4, None);

        assert_eq!(parts.len(), 2);
        // Both parts should have same number of bars
        assert_eq!(parts[0].bars.len(), parts[1].bars.len());

        // P2 should have rest padding
        let p2_events: usize = parts[1].bars.iter().map(|b| b.events.len()).sum();
        assert!(p2_events > 2, "P2 should have padding rest");
    }

    #[test]
    fn test_total_ticks_rounds_to_bar_boundary() {
        // Test 5: Total ticks not multiple of bar length
        // Create 6 beats (1.5 bars in 4/4)
        // With measure.divisions=4, each beat = 4 ticks
        // bar_len_ticks = 4 beats × 4 ticks = 16 ticks
        // 6 beats = 24 ticks (needs 6 notes each with divisions=4)
        let lines = vec![
            make_line("P1", 1, vec![
                make_note(PitchCode::N1, 4), // 1 beat = 4 ticks
                make_note(PitchCode::N2, 4), // 1 beat = 4 ticks
                make_note(PitchCode::N3, 4), // 1 beat = 4 ticks
                make_note(PitchCode::N4, 4), // 1 beat = 4 ticks
                make_note(PitchCode::N5, 4), // 1 beat = 4 ticks
                make_note(PitchCode::N6, 4), // 1 beat = 4 ticks
            ], 4), // Total: 24 ticks = 1.5 bars
            make_line("P2", 1, vec![
                make_note(PitchCode::N1, 4),
                make_note(PitchCode::N2, 4),
                make_note(PitchCode::N3, 4),
                make_note(PitchCode::N4, 4),
            ], 4), // Total: 16 ticks = 1 bar
        ];

        let parts = measurize_export_lines(lines, 4, None);

        // Should round up to 2 complete bars
        assert_eq!(parts[0].bars.len(), 2, "P1 should have 2 bars");
        assert_eq!(parts[1].bars.len(), 2, "P2 should have 2 bars");
    }

    #[test]
    fn test_note_split_across_bar_boundary() {
        // Test 4: Long note crosses bar boundary
        // With measure.divisions=4, bar_len_ticks = 4 beats × 4 ticks = 16 ticks
        // A note of 24 ticks spans 1.5 bars (16 + 8 ticks)
        let lines = vec![
            make_line("P1", 1, vec![
                make_note(PitchCode::N1, 24), // 24 ticks = 1.5 bars
            ], 4),
        ];

        let parts = measurize_export_lines(lines, 4, None);

        assert_eq!(parts.len(), 1);
        assert_eq!(parts[0].bars.len(), 2, "Should have 2 bars");

        // First bar should have note with tie_to
        let bar1 = &parts[0].bars[0];
        assert!(!bar1.events.is_empty());
        assert!(bar1.events[0].tie_to, "First chunk should have tie_to");

        // Second bar should have note with tie_from
        let bar2 = &parts[0].bars[1];
        assert!(!bar2.events.is_empty());
        assert!(bar2.events[0].tie_from, "Second chunk should have tie_from");
    }

    #[test]
    fn test_multi_system_with_breaks() {
        // Test 3: SATB + Solo pattern
        // Lines 0-3: system 1 (SATB)
        // Line 4: system 2 (Solo)
        let lines = vec![
            make_line("P1", 1, vec![make_note(PitchCode::N1, 4)], 4), // Soprano
            make_line("P2", 1, vec![make_note(PitchCode::N3, 4)], 4), // Alto
            make_line("P3", 1, vec![make_note(PitchCode::N5, 4)], 4), // Tenor
            make_line("P4", 1, vec![make_note(PitchCode::N1, 4)], 4), // Bass
            make_line("P1", 2, vec![make_note(PitchCode::N5, 4)], 4), // Solo (same part as Soprano)
        ];

        let parts = measurize_export_lines(lines, 4, None);

        // Should have 4 unique parts
        assert_eq!(parts.len(), 4);

        // P1 should have system break at bar 1 (second bar)
        let p1 = &parts[0];
        assert!(!p1.system_breaks.is_empty(), "P1 should have system break");
        assert!(p1.system_breaks.contains(&1), "System break should be at bar 1");
    }

    #[test]
    fn test_group_by_part_id_ordered() {
        let lines = vec![
            make_line("P1", 1, vec![], 4),
            make_line("P2", 1, vec![], 4),
            make_line("P1", 2, vec![], 4), // P1 appears again
            make_line("P3", 2, vec![], 4),
        ];

        let grouped = group_by_part_id_ordered(lines);

        // Should have 3 unique parts in order: P1, P2, P3
        assert_eq!(grouped.len(), 3);
        assert_eq!(grouped[0].0, "P1");
        assert_eq!(grouped[1].0, "P2");
        assert_eq!(grouped[2].0, "P3");

        // P1 should have 2 lines
        assert_eq!(grouped[0].1.len(), 2);
    }

    #[test]
    fn test_multi_bar_split() {
        // Event spanning 3 bars (2.5 bars rounded up)
        // With measure.divisions=4, bar_len_ticks = 4 beats × 4 ticks = 16 ticks
        // 40 ticks = 2.5 bars (16 + 16 + 8 = 40)
        let lines = vec![
            make_line("P1", 1, vec![
                make_note(PitchCode::N1, 40), // 40 ticks = 2.5 bars
            ], 4),
        ];

        let parts = measurize_export_lines(lines, 4, None);

        // Should have 3 bars (ceiling of 2.5)
        assert_eq!(parts[0].bars.len(), 3);

        // Check tie chain
        let bars = &parts[0].bars;

        // Bar 1: tie_to only (start of chain)
        assert!(bars[0].events[0].tie_to);
        assert!(!bars[0].events[0].tie_from);

        // Bar 2: both tie_from and tie_to (middle of chain)
        assert!(bars[1].events[0].tie_from);
        assert!(bars[1].events[0].tie_to);

        // Bar 3: tie_from only (end of chain)
        assert!(bars[2].events[0].tie_from);
        assert!(!bars[2].events[0].tie_to);
    }

    #[test]
    fn test_key_signature_parsing() {
        assert_eq!(parse_key_to_fifths("C major"), 0);
        assert_eq!(parse_key_to_fifths("G major"), 1);
        assert_eq!(parse_key_to_fifths("D major"), 2);
        assert_eq!(parse_key_to_fifths("F major"), -1);
        assert_eq!(parse_key_to_fifths("Bb major"), -2);
        assert_eq!(parse_key_to_fifths("A minor"), 0);
        assert_eq!(parse_key_to_fifths("E minor"), 1);
    }
}
