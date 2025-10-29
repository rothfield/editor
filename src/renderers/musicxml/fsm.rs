//! Beat-level finite state machine for rhythm processing
//!
//! Implements an explicit state machine following the doremi-script Clojure pattern.
//! This replaces the implicit FSM in normalize_beat with explicit state transitions.
//!
//! States:
//! - InBeat: Initial state, waiting for first element
//! - CollectingDashesInBeat: Collecting consecutive dashes (represents rest or extension)
//! - CollectingPitchInBeat: Collecting pitch + following dashes (represents note + extensions)

use crate::models::{Cell, ElementKind, PitchCode, OrnamentPositionType};

/// FSM state for beat processing
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum BeatProcessingState {
    /// Initial state: waiting for first element
    InBeat,
    /// Collecting consecutive dashes (may be rest or tie extension)
    CollectingDashesInBeat,
    /// Collecting pitch + following dashes (note element)
    CollectingPitchInBeat,
    /// Collecting trailing grace notes/ornaments after main element
    CollectingTrailingGraceNotes,
}

/// Accumulated result of processing a beat element
#[derive(Debug, Clone)]
pub struct BeatElement {
    /// Number of divisions (micro-beats) this element occupies
    pub element_divisions: usize,
    /// The actual element: note, rest, or grace notes
    pub kind: BeatElementKind,
}

#[derive(Debug, Clone)]
pub enum BeatElementKind {
    /// Rest (from leading dashes or standalone "-" elements)
    Rest,
    /// Note with pitch and octave
    Note {
        pitch_code: PitchCode,
        octave: i8,
        /// Grace notes attached before this note
        grace_notes_before: Vec<(PitchCode, i8, OrnamentPositionType)>,
        /// Grace notes attached after this note (trailing ornaments)
        grace_notes_after: Vec<(PitchCode, i8, OrnamentPositionType)>,
    },
    /// Grace note that doesn't contribute to beat rhythm
    GraceNote {
        pitch_code: PitchCode,
        octave: i8,
        position: OrnamentPositionType,
    },
}

/// Accumulator for building beat elements
pub struct BeatAccumulator {
    /// All elements collected so far
    pub elements: Vec<BeatElement>,
    /// Current element divisions (dash micro-beats counter)
    pub current_element_divisions: usize,
    /// Pending grace notes to attach to next main element
    pub pending_grace_notes_before: Vec<(PitchCode, i8, OrnamentPositionType)>,
    /// Grace notes collected in trailing ornament state
    pub pending_grace_notes_after: Vec<(PitchCode, i8, OrnamentPositionType)>,
    /// Whether we've seen a pitched/unpitched main element in this beat
    pub has_main_element: bool,
}

impl BeatAccumulator {
    /// Create new accumulator
    pub fn new() -> Self {
        BeatAccumulator {
            elements: Vec::new(),
            current_element_divisions: 0,
            pending_grace_notes_before: Vec::new(),
            pending_grace_notes_after: Vec::new(),
            has_main_element: false,
        }
    }

    /// Start collecting dashes (rest or tie extension)
    fn start_dash(&mut self) {
        self.current_element_divisions = 1;
    }

    /// Increment dash count
    fn increment_dash(&mut self) {
        self.current_element_divisions += 1;
    }

    /// Start collecting a pitched note
    fn start_pitch(&mut self, pitch_code: PitchCode, octave: i8) {
        self.current_element_divisions = 1;
        // Add note with attached grace notes
        self.elements.push(BeatElement {
            element_divisions: 1,  // Placeholder, will be incremented by dashes
            kind: BeatElementKind::Note {
                pitch_code,
                octave,
                grace_notes_before: self.pending_grace_notes_before.clone(),
                grace_notes_after: Vec::new(),
            },
        });
        self.pending_grace_notes_before.clear();
        self.has_main_element = true;
    }

    /// Add grace note to pending list
    fn add_grace_note(&mut self, pitch_code: PitchCode, octave: i8, position: OrnamentPositionType) {
        if self.has_main_element {
            // Grace note after main element
            if let Some(BeatElement { kind: BeatElementKind::Note { grace_notes_after, .. }, .. }) = self.elements.last_mut() {
                grace_notes_after.push((pitch_code, octave, position));
            }
        } else {
            // Grace note before main element
            self.pending_grace_notes_before.push((pitch_code, octave, position));
        }
    }

    /// Finalize a dash element (rest or tie)
    fn finish_dashes(&mut self) {
        if self.current_element_divisions > 0 {
            // If we have pending grace notes and no main element yet, this is a rest
            self.elements.push(BeatElement {
                element_divisions: self.current_element_divisions,
                kind: BeatElementKind::Rest,
            });
            self.current_element_divisions = 0;
        }
    }

    /// Finalize a pitched element by updating its element_divisions
    fn finish_pitch(&mut self) {
        if let Some(BeatElement { element_divisions, .. }) = self.elements.last_mut() {
            *element_divisions = self.current_element_divisions;
        }
        self.current_element_divisions = 0;
    }

    /// Convert accumulated elements into final result
    pub fn into_result(self) -> BeatResult {
        let beat_divisions: usize = self.elements.iter().map(|e| e.element_divisions).sum();
        BeatResult {
            elements: self.elements,
            beat_divisions,
        }
    }
}

/// Result of processing a beat
#[derive(Debug, Clone)]
pub struct BeatResult {
    /// Processed beat elements
    pub elements: Vec<BeatElement>,
    /// Total divisions in this beat (sum of element_divisions)
    /// INVARIANT: sum(element_divisions) == beat_divisions
    pub beat_divisions: usize,
}

/// FSM transition function
/// Processes a single cell and updates state
pub fn beat_transition(
    state: BeatProcessingState,
    cell: &Cell,
    accum: &mut BeatAccumulator,
) -> BeatProcessingState {
    // Skip continuation cells - they're part of previous element
    if cell.continuation {
        return state;
    }

    match (state, cell.kind) {
        // DASHES
        (BeatProcessingState::InBeat, ElementKind::UnpitchedElement) if cell.char == "-" => {
            accum.start_dash();
            BeatProcessingState::CollectingDashesInBeat
        }
        (BeatProcessingState::CollectingDashesInBeat, ElementKind::UnpitchedElement) if cell.char == "-" => {
            accum.increment_dash();
            BeatProcessingState::CollectingDashesInBeat
        }

        // PITCH → transition from CollectingDashes to pitch, or within pitch
        (BeatProcessingState::CollectingDashesInBeat, ElementKind::PitchedElement) => {
            accum.finish_dashes();
            if let Some(pitch_code) = &cell.pitch_code {
                accum.start_pitch(*pitch_code, cell.octave);
                BeatProcessingState::CollectingPitchInBeat
            } else {
                BeatProcessingState::InBeat  // No pitch, skip
            }
        }
        (BeatProcessingState::InBeat, ElementKind::PitchedElement) if !cell.is_rhythm_transparent() => {
            if let Some(pitch_code) = &cell.pitch_code {
                accum.start_pitch(*pitch_code, cell.octave);
                BeatProcessingState::CollectingPitchInBeat
            } else {
                BeatProcessingState::InBeat
            }
        }
        (BeatProcessingState::CollectingPitchInBeat, ElementKind::PitchedElement) if !cell.is_rhythm_transparent() => {
            // New pitch → finish previous and start new
            accum.finish_pitch();
            if let Some(pitch_code) = &cell.pitch_code {
                accum.start_pitch(*pitch_code, cell.octave);
                BeatProcessingState::CollectingPitchInBeat
            } else {
                BeatProcessingState::InBeat
            }
        }

        // DASHES after PITCH → extend current note
        (BeatProcessingState::CollectingPitchInBeat, ElementKind::UnpitchedElement) if cell.char == "-" => {
            accum.increment_dash();
            BeatProcessingState::CollectingPitchInBeat
        }

        // GRACE NOTES / ORNAMENTS
        (BeatProcessingState::InBeat, ElementKind::PitchedElement) if cell.is_rhythm_transparent() => {
            // Grace note before any main element
            if let Some(pitch_code) = &cell.pitch_code {
                accum.add_grace_note(*pitch_code, cell.octave, cell.ornament_indicator.position_type());
            }
            BeatProcessingState::InBeat
        }
        (BeatProcessingState::CollectingPitchInBeat, ElementKind::PitchedElement) if cell.is_rhythm_transparent() => {
            // Grace note after main element (trailing ornament)
            if let Some(pitch_code) = &cell.pitch_code {
                accum.add_grace_note(*pitch_code, cell.octave, cell.ornament_indicator.position_type());
            }
            BeatProcessingState::CollectingTrailingGraceNotes
        }

        // Default: skip unhandled element kinds
        _ => state,
    }
}

/// Process a beat using explicit FSM
/// This is the main entry point replacing the old normalize_beat function
pub fn normalize_beat_fsm(beat_cells: &[Cell]) -> BeatResult {
    if beat_cells.is_empty() {
        return BeatResult {
            elements: Vec::new(),
            beat_divisions: 0,
        };
    }

    let mut accum = BeatAccumulator::new();
    let mut state = BeatProcessingState::InBeat;

    // Process each cell through the FSM
    for cell in beat_cells {
        state = beat_transition(state, cell, &mut accum);
    }

    // Finalize any pending state
    match state {
        BeatProcessingState::CollectingDashesInBeat => {
            accum.finish_dashes();
        }
        BeatProcessingState::CollectingPitchInBeat => {
            accum.finish_pitch();
        }
        BeatProcessingState::CollectingTrailingGraceNotes => {
            // Already finalized by previous note
        }
        BeatProcessingState::InBeat => {
            // Nothing to finalize
        }
    }

    accum.into_result()
}

// NOTE: fsm.rs tests are superseded by cell_to_ir.rs which has the new authoritative FSM.
// The old normalize_beat_fsm function is kept for reference but not used.
// Tests are in cell_to_ir::tests instead.
//
// #[cfg(test)]
// mod tests {
//     use super::*;
//     // Tests removed - see cell_to_ir.rs for the new FSM tests
// }
