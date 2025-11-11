//! Cell-to-IR conversion using Finite State Machine
//!
//! This module implements the core FSM that converts a flat Vec<Cell> into ExportMeasures.
//! The FSM groups cells into beat-level events based on explicit state transitions,
//! handling rhythm-transparent elements (grace notes), dashes (rests/ties), and pitches.
//!
//! # FSM States
//!
//! - **InBeat**: Initial state, waiting for first element in beat
//! - **CollectingDashesInBeat**: Consecutive dashes (rest or note extension)
//! - **CollectingPitchInBeat**: Pitch element with following dashes
//! - **CollectingTrailingGraceNotes**: Grace notes after main element
//!
//! # Key Invariants
//!
//! 1. Consecutive dashes form ONE Rest element (not multiple)
//! 2. Dashes after a pitch extend that pitch's duration
//! 3. Grace notes don't contribute to beat rhythm
//! 4. Continuation cells never appear as standalone elements
//! 5. sum(event_divisions) == measure_divisions for each measure

use crate::models::{Cell, ElementKind, SlurIndicator, Line, Document};
use super::export_ir::{
    ExportLine, ExportMeasure, ExportEvent, NoteData, GraceNoteData, PitchInfo,
    LyricData, Syllabic, SlurData, SlurPlacement, SlurType, TupletInfo,
};

/// FSM state for cell-to-event grouping
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum CellGroupingState {
    /// Initial state: waiting for first element
    InBeat,
    /// Collecting consecutive dashes (may be rest or note extension)
    CollectingDashesInBeat,
    /// Collecting pitch + following dashes (note element)
    CollectingPitchInBeat,
    /// Collecting trailing grace notes/ornaments after main element
    CollectingTrailingGraceNotes,
}

/// Accumulator for building beat events
pub struct BeatAccumulator {
    /// Events collected so far in this beat
    pub events: Vec<ExportEvent>,
    /// Current dash count (micro-beats) or pitch duration
    pub current_divisions: usize,
    /// Pending grace notes to attach before next main element
    pub pending_grace_notes_before: Vec<GraceNoteData>,
    /// Pending grace notes to attach after the main element (ornaments with After placement)
    pub pending_grace_notes_after: Vec<GraceNoteData>,
    /// Pitch being collected (if in CollectingPitchInBeat)
    pub pending_pitch: Option<PitchInfo>,
    /// Whether we've seen a main element (pitch or rest) in this beat
    pub has_main_element: bool,
    /// Pending slur indicator from current cell (Start/End/None)
    pub pending_slur_indicator: SlurIndicator,
    /// Whether we are currently inside an active slur (started but not ended)
    pub inside_slur: bool,
}

impl BeatAccumulator {
    pub fn new() -> Self {
        BeatAccumulator {
            events: Vec::new(),
            current_divisions: 0,
            pending_grace_notes_before: Vec::new(),
            pending_grace_notes_after: Vec::new(),
            pending_pitch: None,
            has_main_element: false,
            pending_slur_indicator: SlurIndicator::None,
            inside_slur: false,
        }
    }

    /// Set the pending slur indicator from a cell
    fn set_slur_indicator(&mut self, indicator: SlurIndicator) {
        self.pending_slur_indicator = indicator;
    }

    /// Get and clear the pending slur indicator
    fn take_slur_indicator(&mut self) -> SlurIndicator {
        let indicator = self.pending_slur_indicator;
        self.pending_slur_indicator = SlurIndicator::None;
        indicator
    }

    /// Start collecting dashes (rest or note extension)
    fn start_dash(&mut self) {
        self.current_divisions = 1;
    }

    /// Increment dash count
    fn increment_dash(&mut self) {
        self.current_divisions += 1;
    }

    /// Start collecting a pitched note
    fn start_pitch(&mut self, pitch: PitchInfo) {
        self.current_divisions = 1;
        self.pending_pitch = Some(pitch);
    }

    /// Add grace note to pending list
    #[allow(dead_code)]
    fn add_grace_note(&mut self, pitch: PitchInfo) {
        // Default to After placement for ornaments
        let grace = GraceNoteData {
            pitch,
            position: crate::models::OrnamentPositionType::After,
            slash: false, // TODO: wire up slash notation
        };

        if self.has_main_element {
            // Grace notes after main element - will be attached when finalizing pitch
            // For now, accumulate them
            if let Some(ExportEvent::Note(ref mut note_data)) = self.events.last_mut() {
                note_data.grace_notes_after.push(grace);
            }
        } else {
            // Grace notes before main element
            self.pending_grace_notes_before.push(grace);
        }
    }

    /// Process ornament cells and convert them to grace notes
    fn process_ornament(&mut self, ornament: &crate::models::Ornament) {
        use crate::models::OrnamentPlacement;

        // Determine the position based on ornament placement
        let position = match ornament.placement {
            OrnamentPlacement::Before => crate::models::OrnamentPositionType::Before,
            OrnamentPlacement::After => crate::models::OrnamentPositionType::After,
        };

        // Extract pitches from ornament cells
        for cell in &ornament.cells {
            if let Some(pitch_code) = cell.pitch_code {
                let pitch = PitchInfo::new(pitch_code, cell.octave);
                let grace = GraceNoteData {
                    pitch,
                    position,
                    slash: false, // TODO: wire up slash notation from cell
                };

                // Add to appropriate grace notes list based on placement
                match position {
                    crate::models::OrnamentPositionType::Before => {
                        // Grace notes before main element - add to pending
                        self.pending_grace_notes_before.push(grace);
                    }
                    crate::models::OrnamentPositionType::After | crate::models::OrnamentPositionType::OnTop => {
                        // Grace notes after main element - add to pending after list
                        // These will be attached to the note when finish_pitch() is called
                        self.pending_grace_notes_after.push(grace);
                    }
                }
            }
        }
    }

    /// Finalize dash element (create rest)
    fn finish_dashes(&mut self) {
        if self.current_divisions > 0 {
            self.events.push(ExportEvent::Rest {
                divisions: self.current_divisions,
                tuplet: None,
            });
            self.current_divisions = 0;
        }
    }

    /// Finalize pitch element
    fn finish_pitch(&mut self) {
        if let Some(pitch) = self.pending_pitch.take() {
            let mut note = NoteData {
                pitch,
                divisions: self.current_divisions,
                grace_notes_before: self.pending_grace_notes_before.clone(),
                grace_notes_after: self.pending_grace_notes_after.clone(),
                lyrics: None,
                slur: None,
                articulations: Vec::new(),
                beam: None,
                tie: None,
                tuplet: None,
            };

            // Attach slur indicator if present or if we're inside a slur
            let slur_indicator = self.take_slur_indicator();

            // Create a temporary cell for the attach_slur_to_note function
            let temp_cell = Cell {
                kind: ElementKind::PitchedElement,
                char: "".to_string(),
                continuation: false,
                col: 0,
                flags: 0,
                pitch_code: Some(pitch.pitch_code),
                pitch_system: None,
                octave: pitch.octave,
                slur_indicator,
                ornament: None,
                x: 0.0,
                y: 0.0,
                w: 0.0,
                h: 0.0,
                bbox: (0.0, 0.0, 0.0, 0.0),
                hit: (0.0, 0.0, 0.0, 0.0),
            };

            attach_slur_to_note(&mut note, &temp_cell, self.inside_slur);

            // Update inside_slur state based on indicator
            match slur_indicator {
                SlurIndicator::SlurStart => {
                    self.inside_slur = true;
                }
                SlurIndicator::SlurEnd => {
                    self.inside_slur = false;
                }
                SlurIndicator::None => {
                    // State doesn't change
                }
            }

            self.events.push(ExportEvent::Note(note));
            self.pending_grace_notes_before.clear();
            self.pending_grace_notes_after.clear();
            self.current_divisions = 0;
        }
    }
}

/// FSM transition function
/// Processes a single cell and updates state
pub fn beat_transition(
    state: CellGroupingState,
    cell: &Cell,
    accum: &mut BeatAccumulator,
) -> CellGroupingState {
    // Skip continuation cells - they're part of previous element
    if cell.continuation {
        return state;
    }

    // Extract slur indicator from ANY cell, even unpitched elements
    // This allows slur markers on spaces or other elements to be transferred to the next pitched element
    if cell.slur_indicator != SlurIndicator::None {
        accum.set_slur_indicator(cell.slur_indicator);
    }

    match (state, cell.kind) {
        // DASHES
        (CellGroupingState::InBeat, ElementKind::UnpitchedElement) if cell.char == "-" => {
            accum.start_dash();
            CellGroupingState::CollectingDashesInBeat
        }
        (CellGroupingState::CollectingDashesInBeat, ElementKind::UnpitchedElement)
            if cell.char == "-" =>
        {
            accum.increment_dash();
            CellGroupingState::CollectingDashesInBeat
        }

        // PITCH → transition from InBeat or CollectingDashes
        (CellGroupingState::InBeat, ElementKind::PitchedElement) => {
            if let Some(pitch_code) = cell.pitch_code {
                let pitch = PitchInfo::new(pitch_code, cell.octave);
                accum.start_pitch(pitch);
                // Slur indicator already extracted at top of beat_transition
                accum.has_main_element = true;

                // Process ornament if present
                if let Some(ornament) = &cell.ornament {
                    accum.process_ornament(ornament);
                }

                CellGroupingState::CollectingPitchInBeat
            } else {
                CellGroupingState::InBeat
            }
        }
        (CellGroupingState::CollectingDashesInBeat, ElementKind::PitchedElement) => {
            // Finish the dash rest, then start the pitch
            accum.finish_dashes();
            if let Some(pitch_code) = cell.pitch_code {
                let pitch = PitchInfo::new(pitch_code, cell.octave);
                accum.start_pitch(pitch);
                // Slur indicator already extracted at top of beat_transition
                accum.has_main_element = true;
                CellGroupingState::CollectingPitchInBeat
            } else {
                CellGroupingState::InBeat
            }
        }
        (CellGroupingState::CollectingPitchInBeat, ElementKind::PitchedElement) => {
            // New pitch → finish previous and start new
            accum.finish_pitch();
            if let Some(pitch_code) = cell.pitch_code {
                let pitch = PitchInfo::new(pitch_code, cell.octave);
                accum.start_pitch(pitch);
                // Slur indicator already extracted at top of beat_transition

                // Process ornament if present
                if let Some(ornament) = &cell.ornament {
                    accum.process_ornament(ornament);
                }

                CellGroupingState::CollectingPitchInBeat
            } else {
                CellGroupingState::InBeat
            }
        }

        // DASHES after PITCH → extend current note
        (CellGroupingState::CollectingPitchInBeat, ElementKind::UnpitchedElement)
            if cell.char == "-" =>
        {
            accum.increment_dash();
            CellGroupingState::CollectingPitchInBeat
        }

        // Note: Grace notes / ornaments are now handled within the pitched element rules above
        // A cell with an ornament is treated as a main note with grace notes attached

        // Default: skip unhandled element kinds
        _ => state,
    }
}

/// Process cells in a beat using explicit FSM
/// This is the main entry point for grouping cells into events
pub fn group_cells_into_events(beat_cells: &[&Cell]) -> Vec<ExportEvent> {
    if beat_cells.is_empty() {
        return Vec::new();
    }

    let mut accum = BeatAccumulator::new();
    let mut state = CellGroupingState::InBeat;

    // Process each cell through the FSM
    for cell in beat_cells {
        state = beat_transition(state, cell, &mut accum);
    }

    // Finalize any pending state
    match state {
        CellGroupingState::CollectingDashesInBeat => {
            accum.finish_dashes();
        }
        CellGroupingState::CollectingPitchInBeat => {
            accum.finish_pitch();
        }
        CellGroupingState::CollectingTrailingGraceNotes => {
            // Grace notes already attached to note
        }
        CellGroupingState::InBeat => {
            // Nothing to finalize
        }
    }

    accum.events
}

/// Parse lyrics string into syllables with syllabic types
///
/// # Examples
///
/// - "hel-lo world" → [("hel", Begin), ("lo", End), ("world", Single)]
/// - "a-" → [("a", Begin)]
/// - "no-tes" → [("no", Begin), ("tes", End)]
pub fn parse_lyrics_to_syllables(lyrics: &str) -> Vec<(String, Syllabic)> {
    if lyrics.trim().is_empty() {
        return Vec::new();
    }

    let mut result = Vec::new();
    let mut current_word = String::new();
    let mut is_continuing = false;

    for ch in lyrics.chars() {
        if ch == '-' {
            // Hyphen indicates continuation
            if !current_word.is_empty() {
                let syllabic = if is_continuing {
                    Syllabic::Middle
                } else {
                    Syllabic::Begin
                };
                result.push((current_word.clone(), syllabic));
                current_word.clear();
                is_continuing = true;
            }
        } else if ch.is_whitespace() {
            // Space separates words (syllables)
            if !current_word.is_empty() {
                let syllabic = if is_continuing {
                    Syllabic::End
                } else {
                    Syllabic::Single
                };
                result.push((current_word.clone(), syllabic));
                current_word.clear();
                is_continuing = false;
            }
        } else {
            current_word.push(ch);
        }
    }

    // Handle final syllable
    if !current_word.is_empty() {
        let syllabic = if is_continuing {
            Syllabic::End
        } else {
            Syllabic::Single
        };
        result.push((current_word, syllabic));
    }

    result
}

/// Collect cells at the same column (column-based chords)
pub fn collect_chord_notes(cells: &[Cell]) -> Vec<Vec<&Cell>> {
    use std::collections::BTreeMap;

    let mut by_column: BTreeMap<usize, Vec<&Cell>> = BTreeMap::new();

    for cell in cells {
        by_column.entry(cell.col).or_insert_with(Vec::new).push(cell);
    }

    by_column.into_values().collect()
}

/// Fill in "continue" slur markers for notes between slur start and stop
///
/// After processing beats separately, we need to add SlurType::Continue to notes that
/// fall between a SlurType::Start and SlurType::Stop. The inside_slur state is tracked
/// at the LINE level to handle slurs that span across measure boundaries.
fn fill_slur_continue_markers(events: &mut [ExportEvent], line_inside_slur: &mut bool) {
    for event in events.iter_mut() {
        if let ExportEvent::Note(ref mut note) = event {
            if let Some(ref slur_data) = note.slur {
                match slur_data.type_ {
                    SlurType::Start => {
                        *line_inside_slur = true;
                    }
                    SlurType::Stop => {
                        *line_inside_slur = false;
                    }
                    SlurType::Continue => {
                        // Already marked as continue, skip
                    }
                }
            } else if *line_inside_slur {
                // This note is between a start and stop but has no slur marker
                // Add a continue marker
                note.slur = Some(SlurData {
                    placement: SlurPlacement::Above,
                    type_: SlurType::Continue,
                });
            }
        }
    }
}

/// Wire up slur indicators from cell to note data
///
/// Handles three cases:
/// 1. SlurStart indicator → SlurType::Start
/// 2. SlurEnd indicator → SlurType::Stop
/// 3. No indicator but inside_slur=true → SlurType::Continue
pub fn attach_slur_to_note(note: &mut NoteData, cell: &Cell, inside_slur: bool) {
    match cell.slur_indicator {
        SlurIndicator::SlurStart => {
            note.slur = Some(SlurData {
                placement: SlurPlacement::Above, // TODO: derive from context
                type_: SlurType::Start,
            });
        }
        SlurIndicator::SlurEnd => {
            note.slur = Some(SlurData {
                placement: SlurPlacement::Above,
                type_: SlurType::Stop,
            });
        }
        SlurIndicator::None => {
            // Check if we're inside an active slur
            if inside_slur {
                note.slur = Some(SlurData {
                    placement: SlurPlacement::Above,
                    type_: SlurType::Continue,
                });
            }
        }
    }
}

/// Attach the first lyric syllable from the list to a note
pub fn attach_first_lyric(note: &mut NoteData, syllables: &[(String, Syllabic)], index: usize) {
    if index < syllables.len() {
        let (text, syllabic) = &syllables[index];
        note.lyrics = Some(LyricData {
            syllable: text.clone(),
            syllabic: *syllabic,
            number: 1, // TODO: support multiple verse numbers
        });
    }
}

/// Calculate the greatest common divisor (GCD) of two numbers
pub fn gcd(a: usize, b: usize) -> usize {
    if b == 0 {
        a
    } else {
        gcd(b, a % b)
    }
}

/// Calculate the least common multiple (LCM) of two numbers
pub fn lcm(a: usize, b: usize) -> usize {
    (a * b) / gcd(a, b)
}

/// Calculate GCD of multiple numbers
pub fn gcd_multiple(numbers: &[usize]) -> usize {
    if numbers.is_empty() {
        return 1;
    }
    numbers.iter().copied().reduce(gcd).unwrap_or(1)
}

/// Calculate LCM of multiple numbers
pub fn lcm_multiple(numbers: &[usize]) -> usize {
    if numbers.is_empty() {
        return 1;
    }
    numbers.iter().copied().reduce(lcm).unwrap_or(1)
}

/// Detect if a subdivision count represents a tuplet
/// Returns Option<(actual_notes, normal_notes)> for tuplet ratio
pub fn detect_tuplet_ratio(subdivisions: usize) -> Option<(usize, usize)> {
    // Standard divisions (powers of 2) don't need tuplets
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

/// Assign tuplet information to events within a beat
fn assign_tuplet_info_to_beat(events: &mut [ExportEvent], actual_notes: usize, normal_notes: usize) {
    let event_count = events.len();
    if event_count == 0 {
        return;
    }

    for (idx, event) in events.iter_mut().enumerate() {
        let is_first = idx == 0;
        let is_last = idx == event_count - 1;

        let tuplet_info = TupletInfo {
            actual_notes,
            normal_notes,
            bracket_start: is_first && event_count > 1,
            bracket_stop: is_last && event_count > 1,
        };

        match event {
            ExportEvent::Note(note) => {
                note.tuplet = Some(tuplet_info);
            }
            ExportEvent::Rest { tuplet, .. } => {
                *tuplet = Some(tuplet_info);
            }
            ExportEvent::Chord { tuplet, .. } => {
                *tuplet = Some(tuplet_info);
            }
        }
    }
}

/// Calculate the actual rhythmic subdivisions in a beat
///
/// This counts pitched elements + their dash extensions + standalone dashes,
/// then normalizes using GCD to get the effective subdivision count.
///
/// For "1-3": pitches=[1,3] with extensions=[1,0] → slot_counts=[2,1] → GCD=1 → subdivisions=3
/// For "1 2 3": pitches=[1,2,3] → slot_counts=[1,1,1] → GCD=1 → subdivisions=3
pub fn calculate_beat_subdivisions(beat_cells_refs: &[&Cell]) -> usize {
    if beat_cells_refs.is_empty() {
        return 0;
    }

    let mut slot_counts = Vec::new();
    let mut i = 0;
    let mut seen_pitched_element = false;

    while i < beat_cells_refs.len() {
        let cell = beat_cells_refs[i];

        // Skip continuation cells only (ornament cells are rhythm-transparent but the main cell with ornament should be counted)
        if cell.continuation {
            i += 1;
            continue;
        }

        if cell.kind == ElementKind::PitchedElement {
            seen_pitched_element = true;
            // Count this note + following dash extensions
            // NOTE: cells with ornaments are treated as regular pitched elements for rhythm calculation
            // The ornament metadata doesn't affect the beat subdivision
            let mut slot_count = 1;
            let mut j = i + 1;

            // Skip continuation cells
            while j < beat_cells_refs.len() && beat_cells_refs[j].continuation {
                j += 1;
            }

            // Count dash extensions
            while j < beat_cells_refs.len() {
                if beat_cells_refs[j].kind == ElementKind::UnpitchedElement && beat_cells_refs[j].char == "-" {
                    slot_count += 1;
                    j += 1;
                } else {
                    break;
                }
            }
            slot_counts.push(slot_count);
            i = j;
        } else if cell.kind == ElementKind::UnpitchedElement {
            // Standalone dash = rest
            if cell.char == "-" {
                if !seen_pitched_element {
                    // Leading dash(es) before any pitch = ONE rest
                    // Count consecutive leading dashes together (like we do for trailing dashes after notes)
                    let mut rest_count = 1;
                    let mut j = i + 1;
                    while j < beat_cells_refs.len() &&
                          beat_cells_refs[j].kind == ElementKind::UnpitchedElement &&
                          beat_cells_refs[j].char == "-" {
                        rest_count += 1;
                        j += 1;
                    }
                    slot_counts.push(rest_count);
                    i = j;  // Skip all consumed dashes
                } else {
                    // Orphaned dash after extensions, skip it
                    i += 1;
                }
            } else {
                // Other unpitched = rest
                slot_counts.push(1);
                i += 1;
            }
        } else {
            i += 1;
        }
    }

    if slot_counts.is_empty() {
        return 0;
    }

    // Special case: single element in beat (e.g., `--` or `1--`)
    // For single elements, return the slot count directly - no GCD reduction
    // This preserves subdivision information for proper rhythm calculation
    if slot_counts.len() == 1 {
        return slot_counts[0];
    }

    // Multiple elements: apply GCD normalization to detect tuplets
    // Example: `1 2 3` → [1,1,1] → GCD=1 → sum=3 (triplet)
    // Example: `1-- 2--` → [3,3] → GCD=3 → [1,1] → sum=2 (two notes)
    let mut gcd_value = slot_counts[0];
    for &count in &slot_counts[1..] {
        gcd_value = gcd(gcd_value, count);
    }

    let normalized: Vec<usize> = slot_counts.iter().map(|&c| c / gcd_value).collect();
    normalized.iter().sum()
}

/// Find all barline positions in a line of cells
/// Returns indices where barlines occur (starting from 1, since 0 is implicit start)
pub fn find_barlines(cells: &[Cell]) -> Vec<usize> {
    let mut barlines = vec![0]; // Implicit start

    for (i, cell) in cells.iter().enumerate() {
        if cell.char == "|" && cell.kind == ElementKind::UnpitchedElement {
            barlines.push(i + 1);
        }
    }

    if barlines.len() == 1 || barlines.last() != Some(&cells.len()) {
        barlines.push(cells.len()); // Implicit end
    }

    barlines
}

/// Find beat boundaries by whitespace (space or empty cells)
/// Returns indices where beats start
pub fn find_beat_boundaries(cells: &[Cell]) -> Vec<usize> {
    let mut boundaries = vec![0];

    for (i, cell) in cells.iter().enumerate() {
        if cell.char.trim().is_empty() && !cell.continuation {
            // Found a beat separator (space)
            if i + 1 < cells.len() {
                boundaries.push(i + 1);
            }
        }
    }

    // Always include end if not already there
    if boundaries.last() != Some(&cells.len()) {
        boundaries.push(cells.len());
    }

    boundaries
}

/// Find beat boundaries in a slice of cell references
pub fn find_beat_boundaries_refs(cells: &[&Cell]) -> Vec<usize> {
    let mut boundaries = vec![0];

    for (i, cell) in cells.iter().enumerate() {
        if cell.char.trim().is_empty() && !cell.continuation {
            // Found a beat separator (space)
            if i + 1 < cells.len() {
                boundaries.push(i + 1);
            }
        }
    }

    // Always include end if not already there
    if boundaries.last() != Some(&cells.len()) {
        boundaries.push(cells.len());
    }

    boundaries
}

/// Transfer slur indicators from space/separator cells to pitched cells
///
/// The UI sometimes places slur_start/slur_end indicators on space cells rather than
/// on the pitched cells themselves. This causes an off-by-one bug. This function detects
/// separator cells with slur indicators and transfers them to the appropriate pitched cell:
/// - SlurStart on a separator → transfer to the NEXT pitched cell (start of new slur)
/// - SlurEnd on a separator → transfer to the PREVIOUS pitched cell (end of current slur)
fn transfer_slur_indicators_from_separators(cells: &mut [&Cell]) {
    // We need to track which cells need slur transfer
    let mut slur_transfers: Vec<(usize, SlurIndicator)> = Vec::new();

    // First pass: find separators with slur indicators
    for i in 0..cells.len() {
        if cells[i].char.trim().is_empty() && cells[i].slur_indicator != SlurIndicator::None {
            let slur = cells[i].slur_indicator;

            match slur {
                SlurIndicator::SlurStart => {
                    // SlurStart on separator: transfer to PREVIOUS pitched cell (the note that starts the slur)
                    let mut found_prev = false;
                    for j in (0..i).rev() {
                        if !cells[j].char.trim().is_empty() && cells[j].kind == ElementKind::PitchedElement {
                            slur_transfers.push((j, slur));
                            found_prev = true;
                            break;
                        }
                    }
                    if !found_prev {
                        eprintln!("Warning: SlurStart on separator but no previous pitched cell");
                    }
                }
                SlurIndicator::SlurEnd => {
                    // SlurEnd on separator: transfer to PREVIOUS pitched cell (the note that ends the slur)
                    let mut found_prev = false;
                    for j in (0..i).rev() {
                        if !cells[j].char.trim().is_empty() && cells[j].kind == ElementKind::PitchedElement {
                            slur_transfers.push((j, slur));
                            found_prev = true;
                            break;
                        }
                    }
                    if !found_prev {
                        eprintln!("Warning: SlurEnd on separator but no previous pitched cell");
                    }
                }
                SlurIndicator::None => {
                    // Should not happen since we check for None above
                }
            }
        }
    }

    // Second pass: apply transfers (mutate the pitched cells)
    for (target_idx, slur) in slur_transfers {
        // Use unsafe to mutate through a shared reference
        // This is safe because we're not creating overlapping mutable references
        unsafe {
            let target_cell = cells[target_idx] as *const Cell as *mut Cell;
            (*target_cell).slur_indicator = slur;
        }
    }
}

/// Build export measures from a single line (staff)
///
/// This is the core orchestrator that:
/// 1. Splits the line into measures (by barlines)
/// 2. For each measure, splits into beats (by whitespace)
/// 3. For each beat, processes cells through FSM to get events
/// 4. Calculates measure divisions using LCM of beat divisions
/// 5. Returns Vec<ExportMeasure>
pub fn build_export_measures_from_line(line: &Line) -> Vec<ExportMeasure> {
    use super::fsm::*;

    let cells = &line.cells;

    if cells.is_empty() {
        return Vec::new();
    }

    let mut measures = Vec::new();
    let mut state = MusicXMLState::MeasureReady;
    let mut beat_accum = BeatAccumulator::new();
    let mut measure_tracker = MeasureTracker::new();

    // Track measure content by splitting cells based on FSM measure boundaries
    let mut measure_cell_groups: Vec<(u32, Vec<&Cell>)> = Vec::new(); // (measure_number, cells)
    let mut current_measure_num = 1u32;
    let mut current_group: Vec<&Cell> = Vec::new();

    // Process cells through FSM to identify measure boundaries
    for cell in cells {
        if cell.continuation {
            continue;
        }

        let prev_measure = measure_tracker.measure_number;
        state = transition(state, cell, &mut beat_accum, &mut measure_tracker);

        // If measure number changed, we crossed a barline
        if measure_tracker.measure_number != prev_measure {
            // Save completed measure
            if !current_group.is_empty() {
                measure_cell_groups.push((prev_measure, current_group));
                current_group = Vec::new();
            }
            current_measure_num = measure_tracker.measure_number;
        } else if !cell.kind.is_barline() {
            // Add non-barline cells to current measure
            current_group.push(cell);
        }
    }

    // End of stave - finalize last measure
    let _ = handle_end_of_stave(state, &mut beat_accum, &mut measure_tracker);
    if !current_group.is_empty() {
        measure_cell_groups.push((current_measure_num, current_group));
    }

    // Track slur state across all measures in this line
    let mut line_inside_slur = false;

    // Process each measure group using beat boundaries
    for (_measure_num, mut measure_cells) in measure_cell_groups {
        if measure_cells.is_empty() {
            measures.push(ExportMeasure {
                divisions: 4,
                events: vec![ExportEvent::Rest { divisions: 4, tuplet: None }],
            });
            continue;
        }

        // Transfer slur indicators from space/separator cells to the next pitched cell
        // This handles cases where the UI places slur indicators on spaces
        transfer_slur_indicators_from_separators(&mut measure_cells);

        // Find beat boundaries within this measure
        let beat_boundaries = find_beat_boundaries_refs(&measure_cells);

        let mut all_events = Vec::new();
        let mut beat_divisions_list = Vec::new();
        let mut beat_event_ranges: Vec<(usize, usize, usize)> = Vec::new();

        // Process each beat
        for j in 0..beat_boundaries.len() - 1 {
            let beat_start = beat_boundaries[j];
            let beat_end = beat_boundaries[j + 1];

            if beat_start >= beat_end {
                continue;
            }

            let beat_cells_refs: Vec<&Cell> = measure_cells[beat_start..beat_end]
                .iter()
                .filter(|c| !c.char.trim().is_empty())
                .copied()
                .collect();

            if beat_cells_refs.is_empty() {
                continue;
            }

            let beat_div: usize = calculate_beat_subdivisions(&beat_cells_refs);

            if beat_div > 0 {
                let beat_start_idx = all_events.len();
                beat_divisions_list.push(beat_div);

                let beat_events = group_cells_into_events(&beat_cells_refs);
                all_events.extend(beat_events);

                let beat_end_idx = all_events.len();
                beat_event_ranges.push((beat_start_idx, beat_end_idx, beat_div));
            }
        }

        // If we have no events, add a single rest
        if all_events.is_empty() {
            measures.push(ExportMeasure {
                divisions: 4,
                events: vec![ExportEvent::Rest { divisions: 4, tuplet: None }],
            });
            continue;
        }

        // Fill in "continue" slurs for notes between slur start and stop, using line-level state
        fill_slur_continue_markers(&mut all_events, &mut line_inside_slur);

        // Calculate measure divisions using LCM
        let measure_divisions = if beat_divisions_list.is_empty() {
            4
        } else {
            lcm_multiple(&beat_divisions_list)
        };

        // Scale all event divisions from beat-relative to measure-relative
        // Events are created with divisions relative to their beat, but must be scaled
        // to match the measure's LCM divisions
        for (beat_start_idx, beat_end_idx, beat_div) in &beat_event_ranges {
            let scale_factor = measure_divisions / beat_div;
            for event in &mut all_events[*beat_start_idx..*beat_end_idx] {
                match event {
                    ExportEvent::Rest { divisions, .. } => {
                        *divisions *= scale_factor;
                    }
                    ExportEvent::Note(note) => {
                        note.divisions *= scale_factor;
                    }
                    ExportEvent::Chord { divisions, .. } => {
                        *divisions *= scale_factor;
                    }
                }
            }
        }

        // Assign tuplet information
        for (beat_start_idx, beat_end_idx, beat_div) in beat_event_ranges {
            if let Some((actual_notes, normal_notes)) = detect_tuplet_ratio(beat_div) {
                let beat_events = &mut all_events[beat_start_idx..beat_end_idx];
                assign_tuplet_info_to_beat(beat_events, actual_notes, normal_notes);
            }
        }

        measures.push(ExportMeasure {
            divisions: measure_divisions,
            events: all_events,
        });
    }

    // Ensure at least one measure
    if measures.is_empty() {
        measures.push(ExportMeasure {
            divisions: 4,
            events: vec![ExportEvent::Rest { divisions: 4, tuplet: None }],
        });
    }

    measures
}

/// Build export measures from entire document
///
/// Returns Vec<ExportLine> where each line corresponds to a staff/part
pub fn build_export_measures_from_document(document: &Document) -> Vec<ExportLine> {
    let mut export_lines = Vec::new();

    for line in &document.lines {
        let measures = build_export_measures_from_line(line);

        let export_line = ExportLine {
            system_id: line.system_id,
            part_id: line.part_id.clone(),
            staff_role: line.staff_role,
            key_signature: if line.key_signature.is_empty() {
                document.key_signature.clone()
            } else {
                Some(line.key_signature.clone())
            },
            time_signature: if line.time_signature.is_empty() {
                None
            } else {
                Some(line.time_signature.clone())
            },
            clef: "treble".to_string(), // TODO: derive from line metadata
            label: line.label.clone(),
            show_bracket: true,  // Default to showing brackets; can be controlled per-line later
            lyrics: line.lyrics.clone(),
            measures,
        };

        export_lines.push(export_line);
    }

    export_lines
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::pitch_code::PitchCode;

    /// Helper to create a Cell
    fn make_cell(kind: ElementKind, char: &str, pitch_code: Option<PitchCode>) -> Cell {
        Cell {
            kind,
            char: char.to_string(),
            continuation: false,
            col: 0,
            flags: 0,
            pitch_code,
            pitch_system: None,
            octave: 4,
            slur_indicator: Default::default(),
            ornament: None,
            x: 0.0,
            y: 0.0,
            w: 0.0,
            h: 0.0,
            bbox: (0.0, 0.0, 0.0, 0.0),
            hit: (0.0, 0.0, 0.0, 0.0),
        }
    }

    #[test]
    fn test_single_dash_is_rest() {
        let cells = vec![make_cell(ElementKind::UnpitchedElement, "-", None)];
        let cell_refs: Vec<&Cell> = cells.iter().collect();
        let events = group_cells_into_events(&cell_refs);

        assert_eq!(events.len(), 1);
        match &events[0] {
            ExportEvent::Rest { divisions, .. } => assert_eq!(*divisions, 1),
            _ => panic!("Expected Rest"),
        }
    }

    #[test]
    fn test_multiple_consecutive_dashes_single_rest() {
        let cells = vec![
            make_cell(ElementKind::UnpitchedElement, "-", None),
            make_cell(ElementKind::UnpitchedElement, "-", None),
        ];
        let cell_refs: Vec<&Cell> = cells.iter().collect();
        let events = group_cells_into_events(&cell_refs);

        // Two consecutive dashes should be ONE rest with 2 divisions
        assert_eq!(events.len(), 1);
        match &events[0] {
            ExportEvent::Rest { divisions, .. } => assert_eq!(*divisions, 2),
            _ => panic!("Expected Rest with divisions=2"),
        }
    }

    #[test]
    fn test_four_dashes_rest() {
        let cells = vec![
            make_cell(ElementKind::UnpitchedElement, "-", None),
            make_cell(ElementKind::UnpitchedElement, "-", None),
            make_cell(ElementKind::UnpitchedElement, "-", None),
            make_cell(ElementKind::UnpitchedElement, "-", None),
        ];
        let cell_refs: Vec<&Cell> = cells.iter().collect();
        let events = group_cells_into_events(&cell_refs);

        // -- bug: four dashes should be ONE rest with 4 divisions, not 1
        assert_eq!(events.len(), 1);
        match &events[0] {
            ExportEvent::Rest { divisions, .. } => {
                assert_eq!(*divisions, 4, "Four dashes should create rest with 4 divisions")
            }
            _ => panic!("Expected Rest"),
        }
    }

    #[test]
    fn test_dash_rest_bug_case() {
        // This is the specific bug case: "--" at beat start
        // Should produce Rest { divisions: 2 }, which in a 4-division beat
        // = 2/4 of a beat = quarter note duration = r4 in LilyPond
        let cells = vec![
            make_cell(ElementKind::UnpitchedElement, "-", None),
            make_cell(ElementKind::UnpitchedElement, "-", None),
        ];
        let cell_refs: Vec<&Cell> = cells.iter().collect();
        let events = group_cells_into_events(&cell_refs);

        assert_eq!(events.len(), 1, "Two dashes should create one rest element");
        match &events[0] {
            ExportEvent::Rest { divisions, .. } => {
                assert_eq!(*divisions, 2, "Two dashes = 2 divisions");
            }
            _ => panic!("Expected Rest"),
        }
    }

    #[test]
    fn test_empty_beat() {
        let events = group_cells_into_events(&[]);
        assert_eq!(events.len(), 0);
    }

    #[test]
    fn test_rest_division_scaling_single_beat() {
        // Test that rest divisions are correctly scaled to measure divisions
        // This tests the fix for the bug where rests had incorrect durations

        // Create a beat with: rest (1 dash) + two notes (1 cell each)
        // In this beat: 3 total subdivisions
        let cells = vec![
            make_cell(ElementKind::UnpitchedElement, "-", None), // Rest: 1 subdivision
            make_cell(ElementKind::PitchedElement, "1", Some(PitchCode::N1)), // Note: 1 subdivision
            make_cell(ElementKind::PitchedElement, "2", Some(PitchCode::N2)), // Note: 1 subdivision
        ];

        let cell_refs: Vec<&Cell> = cells.iter().collect();
        let beat_events = group_cells_into_events(&cell_refs);

        // At beat level (before scaling):
        // - Rest should have divisions=1 (1 subdivision out of 3)
        // - Each note should have divisions=1
        assert_eq!(beat_events.len(), 3);

        // Now simulate measure-level scaling
        // If measure divisions = 6 (LCM), and beat has 3 subdivisions:
        // scale_factor = 6 / 3 = 2
        // - Rest: 1 * 2 = 2 divisions
        // - Note1: 1 * 2 = 2 divisions
        // - Note2: 1 * 2 = 2 divisions
        // Total: 2 + 2 + 2 = 6 ✓

        let mut scaled_events = beat_events.clone();
        let measure_divisions = 6;
        let beat_subdivisions = 3;
        let scale_factor = measure_divisions / beat_subdivisions;

        for event in &mut scaled_events {
            match event {
                ExportEvent::Rest { divisions, .. } => {
                    *divisions *= scale_factor;
                }
                ExportEvent::Note(note) => {
                    note.divisions *= scale_factor;
                }
                _ => {}
            }
        }

        // Verify scaled divisions
        match &scaled_events[0] {
            ExportEvent::Rest { divisions, .. } => {
                assert_eq!(*divisions, 2, "Rest should be scaled: 1 * 2 = 2");
            }
            _ => panic!("Expected Rest as first event"),
        }

        match &scaled_events[1] {
            ExportEvent::Note(note) => {
                assert_eq!(note.divisions, 2, "Note1 should be scaled: 1 * 2 = 2");
            }
            _ => panic!("Expected Note as second event"),
        }

        match &scaled_events[2] {
            ExportEvent::Note(note) => {
                assert_eq!(note.divisions, 2, "Note2 should be scaled: 1 * 2 = 2");
            }
            _ => panic!("Expected Note as third event"),
        }

        // Verify invariant: sum equals measure divisions
        let sum: usize = scaled_events.iter().map(|e| e.divisions()).sum();
        assert_eq!(sum, measure_divisions, "Sum of event divisions must equal measure divisions");
    }

    // ===== PHASE 3: LYRICS, SLURS, CHORDS =====

    #[test]
    fn test_parse_lyrics_single_word() {
        let lyrics = parse_lyrics_to_syllables("hello");
        assert_eq!(lyrics.len(), 1);
        assert_eq!(lyrics[0].0, "hello");
        assert_eq!(lyrics[0].1, Syllabic::Single);
    }

    #[test]
    fn test_parse_lyrics_hyphenated_word() {
        let lyrics = parse_lyrics_to_syllables("hel-lo");
        assert_eq!(lyrics.len(), 2);
        assert_eq!(lyrics[0].0, "hel");
        assert_eq!(lyrics[0].1, Syllabic::Begin);
        assert_eq!(lyrics[1].0, "lo");
        assert_eq!(lyrics[1].1, Syllabic::End);
    }

    #[test]
    fn test_parse_lyrics_multiple_words() {
        let lyrics = parse_lyrics_to_syllables("hel-lo world");
        assert_eq!(lyrics.len(), 3);
        assert_eq!(lyrics[0], ("hel".to_string(), Syllabic::Begin));
        assert_eq!(lyrics[1], ("lo".to_string(), Syllabic::End));
        assert_eq!(lyrics[2], ("world".to_string(), Syllabic::Single));
    }

    #[test]
    fn test_parse_lyrics_three_syllables() {
        let lyrics = parse_lyrics_to_syllables("no-tes-long");
        assert_eq!(lyrics.len(), 3);
        assert_eq!(lyrics[0], ("no".to_string(), Syllabic::Begin));
        assert_eq!(lyrics[1], ("tes".to_string(), Syllabic::Middle));
        assert_eq!(lyrics[2], ("long".to_string(), Syllabic::End));
    }

    #[test]
    fn test_parse_lyrics_empty() {
        let lyrics = parse_lyrics_to_syllables("");
        assert_eq!(lyrics.len(), 0);
    }

    #[test]
    fn test_parse_lyrics_whitespace_only() {
        let lyrics = parse_lyrics_to_syllables("   ");
        assert_eq!(lyrics.len(), 0);
    }

    #[test]
    fn test_collect_chord_notes_single_column() {
        let cells = vec![
            make_cell(ElementKind::PitchedElement, "1", Some(PitchCode::N1)),
        ];
        let groups = collect_chord_notes(&cells);
        assert_eq!(groups.len(), 1);
        assert_eq!(groups[0].len(), 1);
    }

    #[test]
    fn test_collect_chord_notes_multiple_at_same_col() {
        let mut cells = vec![
            make_cell(ElementKind::PitchedElement, "1", Some(PitchCode::N1)),
            make_cell(ElementKind::PitchedElement, "2", Some(PitchCode::N2)),
        ];
        // Set both to same column
        cells[0].col = 0;
        cells[1].col = 0;

        let groups = collect_chord_notes(&cells);
        assert_eq!(groups.len(), 1);
        assert_eq!(groups[0].len(), 2);
    }

    #[test]
    fn test_collect_chord_notes_different_columns() {
        let mut cells = vec![
            make_cell(ElementKind::PitchedElement, "1", Some(PitchCode::N1)),
            make_cell(ElementKind::PitchedElement, "2", Some(PitchCode::N2)),
        ];
        // Set to different columns
        cells[0].col = 0;
        cells[1].col = 1;

        let groups = collect_chord_notes(&cells);
        assert_eq!(groups.len(), 2);
        assert_eq!(groups[0].len(), 1);
        assert_eq!(groups[1].len(), 1);
    }

    #[test]
    fn test_attach_slur_start() {
        let mut note = NoteData {
            pitch: PitchInfo::new(PitchCode::N1, 4),
            divisions: 1,
            grace_notes_before: Vec::new(),
            grace_notes_after: Vec::new(),
            lyrics: None,
            slur: None,
            articulations: Vec::new(),
            beam: None,
            tie: None,
                tuplet: None,
        };

        let mut cell = make_cell(ElementKind::PitchedElement, "1", Some(PitchCode::N1));
        cell.slur_indicator = SlurIndicator::SlurStart;

        attach_slur_to_note(&mut note, &cell, false);
        assert!(note.slur.is_some());
        let slur = note.slur.unwrap();
        assert_eq!(slur.type_, SlurType::Start);
    }

    #[test]
    fn test_attach_slur_end() {
        let mut note = NoteData {
            pitch: PitchInfo::new(PitchCode::N1, 4),
            divisions: 1,
            grace_notes_before: Vec::new(),
            grace_notes_after: Vec::new(),
            lyrics: None,
            slur: None,
            articulations: Vec::new(),
            beam: None,
            tie: None,
                tuplet: None,
        };

        let mut cell = make_cell(ElementKind::PitchedElement, "1", Some(PitchCode::N1));
        cell.slur_indicator = SlurIndicator::SlurEnd;

        attach_slur_to_note(&mut note, &cell, false);
        assert!(note.slur.is_some());
        let slur = note.slur.unwrap();
        assert_eq!(slur.type_, SlurType::Stop);
    }

    #[test]
    fn test_attach_slur_continue() {
        let mut note = NoteData {
            pitch: PitchInfo::new(PitchCode::N1, 4),
            divisions: 1,
            grace_notes_before: Vec::new(),
            grace_notes_after: Vec::new(),
            lyrics: None,
            slur: None,
            articulations: Vec::new(),
            beam: None,
            tie: None,
                tuplet: None,
        };

        let cell = make_cell(ElementKind::PitchedElement, "1", Some(PitchCode::N1));
        // Note: cell has no slur indicator, but we're inside a slur

        attach_slur_to_note(&mut note, &cell, true);
        assert!(note.slur.is_some());
        let slur = note.slur.unwrap();
        assert_eq!(slur.type_, SlurType::Continue);
    }

    #[test]
    fn test_attach_first_lyric() {
        let mut note = NoteData {
            pitch: PitchInfo::new(PitchCode::N1, 4),
            divisions: 1,
            grace_notes_before: Vec::new(),
            grace_notes_after: Vec::new(),
            lyrics: None,
            slur: None,
            articulations: Vec::new(),
            beam: None,
            tie: None,
                tuplet: None,
        };

        let syllables = vec![
            ("hel".to_string(), Syllabic::Begin),
            ("lo".to_string(), Syllabic::End),
        ];

        attach_first_lyric(&mut note, &syllables, 0);
        assert!(note.lyrics.is_some());
        let lyric = note.lyrics.unwrap();
        assert_eq!(lyric.syllable, "hel");
        assert_eq!(lyric.syllabic, Syllabic::Begin);
    }

    #[test]
    fn test_attach_lyric_out_of_bounds() {
        let mut note = NoteData {
            pitch: PitchInfo::new(PitchCode::N1, 4),
            divisions: 1,
            grace_notes_before: Vec::new(),
            grace_notes_after: Vec::new(),
            lyrics: None,
            slur: None,
            articulations: Vec::new(),
            beam: None,
            tie: None,
                tuplet: None,
        };

        let syllables = vec![("hello".to_string(), Syllabic::Single)];

        attach_first_lyric(&mut note, &syllables, 10); // Out of bounds
        assert!(note.lyrics.is_none());
    }

    // ===== PHASE 4: MEASURE BUILDER (LCM, BARLINES, TUPLETS) =====

    #[test]
    fn test_gcd() {
        assert_eq!(gcd(12, 8), 4);
        assert_eq!(gcd(10, 5), 5);
        assert_eq!(gcd(7, 3), 1);
        assert_eq!(gcd(0, 5), 5);
    }

    #[test]
    fn test_lcm() {
        assert_eq!(lcm(12, 8), 24);
        assert_eq!(lcm(10, 5), 10);
        assert_eq!(lcm(3, 5), 15);
    }

    #[test]
    fn test_lcm_multiple() {
        assert_eq!(lcm_multiple(&[]), 1);
        assert_eq!(lcm_multiple(&[4]), 4);
        assert_eq!(lcm_multiple(&[4, 6]), 12);
        assert_eq!(lcm_multiple(&[4, 6, 8]), 24);
        assert_eq!(lcm_multiple(&[3, 4, 5]), 60);
    }

    #[test]
    fn test_find_barlines_no_barlines() {
        let cells = vec![
            make_cell(ElementKind::PitchedElement, "1", Some(PitchCode::N1)),
            make_cell(ElementKind::PitchedElement, "2", Some(PitchCode::N2)),
        ];
        let barlines = find_barlines(&cells);
        // Should have implicit start and end
        assert_eq!(barlines.len(), 2);
        assert_eq!(barlines[0], 0); // Start
        assert_eq!(barlines[1], 2); // End
    }

    #[test]
    fn test_find_barlines_with_barline() {
        let cells = vec![
            make_cell(ElementKind::PitchedElement, "1", Some(PitchCode::N1)),
            make_cell(ElementKind::UnpitchedElement, "|", None),
            make_cell(ElementKind::PitchedElement, "2", Some(PitchCode::N2)),
        ];
        let barlines = find_barlines(&cells);
        // Should have: start, after barline at index 2, and end
        assert_eq!(barlines.len(), 3);
        assert_eq!(barlines[0], 0); // Start
        assert_eq!(barlines[1], 2); // After barline
        assert_eq!(barlines[2], 3); // End
    }

    #[test]
    fn test_find_barlines_multiple_barlines() {
        let cells = vec![
            make_cell(ElementKind::PitchedElement, "1", Some(PitchCode::N1)),
            make_cell(ElementKind::UnpitchedElement, "|", None),
            make_cell(ElementKind::PitchedElement, "2", Some(PitchCode::N2)),
            make_cell(ElementKind::UnpitchedElement, "|", None),
            make_cell(ElementKind::PitchedElement, "3", Some(PitchCode::N3)),
        ];
        let barlines = find_barlines(&cells);
        assert_eq!(barlines.len(), 4);
        assert_eq!(barlines[0], 0); // Start
        assert_eq!(barlines[1], 2); // After first barline
        assert_eq!(barlines[2], 4); // After second barline
        assert_eq!(barlines[3], 5); // End
    }

    #[test]
    fn test_find_beat_boundaries_no_spaces() {
        let cells = vec![
            make_cell(ElementKind::PitchedElement, "1", Some(PitchCode::N1)),
            make_cell(ElementKind::PitchedElement, "2", Some(PitchCode::N2)),
        ];
        let boundaries = find_beat_boundaries(&cells);
        // Should have start and end only
        assert_eq!(boundaries.len(), 2);
        assert_eq!(boundaries[0], 0);
        assert_eq!(boundaries[1], 2);
    }

    #[test]
    fn test_find_beat_boundaries_with_space() {
        let mut cells = vec![
            make_cell(ElementKind::PitchedElement, "1", Some(PitchCode::N1)),
            make_cell(ElementKind::UnpitchedElement, " ", None),
            make_cell(ElementKind::PitchedElement, "2", Some(PitchCode::N2)),
        ];
        // Mark the space cell
        cells[1].char = " ".to_string();

        let boundaries = find_beat_boundaries(&cells);
        assert_eq!(boundaries.len(), 3);
        assert_eq!(boundaries[0], 0); // Start
        assert_eq!(boundaries[1], 2); // After space
        assert_eq!(boundaries[2], 3); // End
    }

    #[test]
    fn test_barline_cell_splitting() {
        // Test that the manual cell grouping logic correctly splits on barlines
        let mut cells = Vec::new();

        // Add cells for "1 2 3 4 | 5 6 7 8"
        for ch in &["1", "2", "3", "4"] {
            cells.push(make_cell(ElementKind::PitchedElement, ch, Some(PitchCode::N1)));
        }
        cells.push(make_cell(ElementKind::SingleBarline, "|", None));
        for ch in &["5", "6", "7", "8"] {
            cells.push(make_cell(ElementKind::PitchedElement, ch, Some(PitchCode::N1)));
        }

        // Split by barlines (copied from refactored build_export_measures_from_line)
        let mut measure_cell_groups: Vec<Vec<&Cell>> = Vec::new();
        let mut current_group: Vec<&Cell> = Vec::new();

        for cell in &cells {
            if cell.continuation {
                continue;
            }

            if cell.kind.is_barline() {
                if !current_group.is_empty() {
                    measure_cell_groups.push(current_group);
                    current_group = Vec::new();
                }
            } else {
                current_group.push(cell);
            }
        }

        if !current_group.is_empty() {
            measure_cell_groups.push(current_group);
        }

        assert_eq!(measure_cell_groups.len(), 2, "Expected 2 measure groups, got {}", measure_cell_groups.len());
        assert_eq!(measure_cell_groups[0].len(), 4, "Measure 1 should have 4 cells, got {}", measure_cell_groups[0].len());
        assert_eq!(measure_cell_groups[1].len(), 4, "Measure 2 should have 4 cells, got {}", measure_cell_groups[1].len());
    }

    #[test]
    fn test_musicxml_two_measures_from_input() {
        // Test that "1 2 3 4 | 5 6 7 8" produces 2 measures
        use crate::renderers::musicxml::converter::to_musicxml;
        use crate::models::{Document, Line};

        let mut cells = Vec::new();

        // Measure 1: 1 2 3 4
        for pitch_char in &["1", "2", "3", "4"] {
            let mut cell = make_cell(ElementKind::PitchedElement, pitch_char, Some(PitchCode::N1));
            cell.col = cells.len();
            cells.push(cell);
        }

        // Barline
        let mut barline = make_cell(ElementKind::SingleBarline, "|", None);
        barline.col = cells.len();
        cells.push(barline);

        // Measure 2: 5 6 7 8
        for pitch_char in &["5", "6", "7", "8"] {
            let mut cell = make_cell(ElementKind::PitchedElement, pitch_char, Some(PitchCode::N1));
            cell.col = cells.len();
            cells.push(cell);
        }

        let mut line = Line::new();
        line.cells = cells;

        let mut document = Document::new();
        document.lines = vec![line];

        // Generate MusicXML
        let xml = to_musicxml(&document).expect("MusicXML generation failed");

        // Count <measure> tags
        let measure_count = xml.matches("<measure number=").count();

        println!("Measure count: {}", measure_count);
        println!("XML snippet:\n{}", &xml.lines().take(50).collect::<Vec<_>>().join("\n"));

        assert_eq!(measure_count, 2, "Expected 2 measures but got {}", measure_count);
        assert!(xml.contains("<measure number=\"1\""), "Missing measure 1");
        assert!(xml.contains("<measure number=\"2\""), "Missing measure 2");
    }
}
