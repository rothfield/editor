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

use crate::models::{Cell, ElementKind, PitchCode, OrnamentPositionType};
use super::export_ir::{
    ExportLine, ExportMeasure, ExportEvent, NoteData, GraceNoteData, PitchInfo,
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
    /// Pitch being collected (if in CollectingPitchInBeat)
    pub pending_pitch: Option<PitchInfo>,
    /// Whether we've seen a main element (pitch or rest) in this beat
    pub has_main_element: bool,
}

impl BeatAccumulator {
    pub fn new() -> Self {
        BeatAccumulator {
            events: Vec::new(),
            current_divisions: 0,
            pending_grace_notes_before: Vec::new(),
            pending_pitch: None,
            has_main_element: false,
        }
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
    fn add_grace_note(&mut self, pitch: PitchInfo, position: OrnamentPositionType) {
        let grace = GraceNoteData {
            pitch,
            position,
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

    /// Finalize dash element (create rest)
    fn finish_dashes(&mut self) {
        if self.current_divisions > 0 {
            self.events.push(ExportEvent::Rest {
                divisions: self.current_divisions,
            });
            self.current_divisions = 0;
        }
    }

    /// Finalize pitch element
    fn finish_pitch(&mut self) {
        if let Some(pitch) = self.pending_pitch.take() {
            let note = NoteData {
                pitch,
                divisions: self.current_divisions,
                grace_notes_before: self.pending_grace_notes_before.clone(),
                grace_notes_after: Vec::new(),
                lyrics: None,
                slur: None,
                articulations: Vec::new(),
                beam: None,
                tie: None,
            };
            self.events.push(ExportEvent::Note(note));
            self.pending_grace_notes_before.clear();
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

        // GRACE NOTES / ORNAMENTS
        (CellGroupingState::InBeat, ElementKind::PitchedElement)
            if cell.is_rhythm_transparent() =>
        {
            // Grace note before any main element
            if let Some(pitch_code) = cell.pitch_code {
                let pitch = PitchInfo::new(pitch_code, cell.octave);
                accum.add_grace_note(pitch, cell.ornament_indicator.position_type());
            }
            CellGroupingState::InBeat
        }
        (CellGroupingState::CollectingPitchInBeat, ElementKind::PitchedElement)
            if cell.is_rhythm_transparent() =>
        {
            // Grace note after main element (trailing ornament)
            if let Some(pitch_code) = cell.pitch_code {
                let pitch = PitchInfo::new(pitch_code, cell.octave);
                accum.add_grace_note(pitch, cell.ornament_indicator.position_type());
            }
            CellGroupingState::CollectingTrailingGraceNotes
        }

        // Default: skip unhandled element kinds
        _ => state,
    }
}

/// Process cells in a beat using explicit FSM
/// This is the main entry point for grouping cells into events
pub fn group_cells_into_events(beat_cells: &[Cell]) -> Vec<ExportEvent> {
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

#[cfg(test)]
mod tests {
    use super::*;

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
            ornament_indicator: Default::default(),
            ornaments: Vec::new(),
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
        let events = group_cells_into_events(&cells);

        assert_eq!(events.len(), 1);
        match &events[0] {
            ExportEvent::Rest { divisions } => assert_eq!(*divisions, 1),
            _ => panic!("Expected Rest"),
        }
    }

    #[test]
    fn test_multiple_consecutive_dashes_single_rest() {
        let cells = vec![
            make_cell(ElementKind::UnpitchedElement, "-", None),
            make_cell(ElementKind::UnpitchedElement, "-", None),
        ];
        let events = group_cells_into_events(&cells);

        // Two consecutive dashes should be ONE rest with 2 divisions
        assert_eq!(events.len(), 1);
        match &events[0] {
            ExportEvent::Rest { divisions } => assert_eq!(*divisions, 2),
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
        let events = group_cells_into_events(&cells);

        // -- bug: four dashes should be ONE rest with 4 divisions, not 1
        assert_eq!(events.len(), 1);
        match &events[0] {
            ExportEvent::Rest { divisions } => {
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
        let events = group_cells_into_events(&cells);

        assert_eq!(events.len(), 1, "Two dashes should create one rest element");
        match &events[0] {
            ExportEvent::Rest { divisions } => {
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
}
