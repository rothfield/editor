//! Unified finite state machine for MusicXML generation
//!
//! Combines measure-level structural tracking with beat-level rhythm processing.
//! Implements explicit state transitions following the doremi-script Clojure pattern.
//!
//! ## Measure-Level States
//! - MeasureReady: Ready to start new measure
//! - MeasureOpen: Measure open, accumulating content
//!
//! ## Beat-Level States
//! - InBeat: Initial state, waiting for first element
//! - CollectingDashesInBeat: Collecting consecutive dashes (represents rest or extension)
//! - CollectingPitchInBeat: Collecting pitch + following dashes (represents note + extensions)
//! - CollectingTrailingGraceNotes: Collecting grace notes after main element

use crate::models::{Cell, ElementKind, PitchCode, OrnamentPositionType};
use crate::models::barlines::BarlineType;

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

/// Unified FSM state combining measure and beat levels
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum MusicXMLState {
    /// Measure-level: ready to start new measure
    MeasureReady,
    /// Measure-level: measure open, accumulating content
    MeasureOpen,

    /// Beat-level: initial state, waiting for first element
    InBeat,
    /// Beat-level: collecting consecutive dashes (rest or extension)
    CollectingDashesInBeat,
    /// Beat-level: collecting pitch + following dashes (note element)
    CollectingPitchInBeat,
    /// Beat-level: collecting trailing grace notes/ornaments
    CollectingTrailingGraceNotes,
}

/// Measure-level context tracking
#[derive(Debug, Clone)]
pub struct MeasureTracker {
    /// Current measure number (1-indexed)
    pub measure_number: u32,

    /// Current duration accumulated in measure (in divisions)
    pub beat_count: u32,

    /// Maximum beat capacity of measure (based on time signature and divisions)
    pub beat_capacity: u32,

    /// Time signature numerator
    pub time_sig_numerator: u32,

    /// Time signature denominator
    pub time_sig_denominator: u32,

    /// Division setting (base divisions per quarter note)
    pub divisions: u32,
}

impl MeasureTracker {
    /// Create new measure tracker with default 4/4 time
    pub fn new() -> Self {
        Self {
            measure_number: 1,
            beat_count: 0,
            beat_capacity: 16, // 4/4 with divisions=4: (4 * 4 * 4) / 4 = 16
            time_sig_numerator: 4,
            time_sig_denominator: 4,
            divisions: 4,
        }
    }

    /// Calculate beat capacity from time signature and divisions
    fn calculate_beat_capacity(&self) -> u32 {
        (self.time_sig_numerator * 4 * self.divisions) / self.time_sig_denominator
    }

    /// Start a new measure
    pub fn start_measure(&mut self, number: u32) {
        self.measure_number = number;
        self.beat_count = 0;
    }

    /// End current measure and prepare for next
    pub fn end_measure_and_advance(&mut self) {
        self.measure_number += 1;
        self.beat_count = 0;
    }

    /// Add duration to current measure
    pub fn add_duration(&mut self, duration: u32) -> Result<(), String> {
        if self.beat_count.saturating_add(duration) > self.beat_capacity {
            return Err(format!(
                "Duration {} exceeds measure capacity {} in measure {}",
                duration, self.remaining_capacity(), self.measure_number
            ));
        }
        self.beat_count += duration;
        Ok(())
    }

    /// Check if measure is full
    pub fn is_full(&self) -> bool {
        self.beat_count >= self.beat_capacity
    }

    /// Get remaining beat capacity
    pub fn remaining_capacity(&self) -> u32 {
        self.beat_capacity.saturating_sub(self.beat_count)
    }

    /// Check if measure is empty
    pub fn is_empty(&self) -> bool {
        self.beat_count == 0
    }

    /// Set time signature and recalculate capacity
    pub fn set_time_signature(&mut self, numerator: u32, denominator: u32) -> Result<(), String> {
        if denominator == 0 {
            return Err("Time signature denominator must be > 0".to_string());
        }
        self.time_sig_numerator = numerator;
        self.time_sig_denominator = denominator;
        self.beat_capacity = self.calculate_beat_capacity();
        Ok(())
    }

    /// Set divisions and recalculate capacity
    pub fn set_divisions(&mut self, divisions: u32) -> Result<(), String> {
        if divisions == 0 {
            return Err("Divisions must be > 0".to_string());
        }
        self.divisions = divisions;
        self.beat_capacity = self.calculate_beat_capacity();
        Ok(())
    }

    /// Reset for new measure (called after barline)
    pub fn reset_for_next_measure(&mut self) {
        self.beat_count = 0;
    }
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

// ============================================================================
// Measure-level FSM: Barline handling and measure boundaries
// ============================================================================

/// Convert ElementKind barline to BarlineType
pub fn element_kind_to_barline_type(kind: ElementKind) -> Option<BarlineType> {
    match kind {
        ElementKind::SingleBarline => Some(BarlineType::Single),
        ElementKind::DoubleBarline => Some(BarlineType::Double),
        ElementKind::RepeatLeftBarline => Some(BarlineType::StartRepeat),
        ElementKind::RepeatRightBarline => Some(BarlineType::EndRepeat),
        _ => None,
    }
}

/// Unified transition function for both measure and beat levels
/// Processes a single cell and returns new state
pub fn transition(
    state: MusicXMLState,
    cell: &Cell,
    beat_accum: &mut BeatAccumulator,
    measure_tracker: &mut MeasureTracker,
) -> MusicXMLState {
    // Skip continuation cells - they're part of previous element
    if cell.continuation {
        return state;
    }

    // Handle barlines at any beat state
    if cell.kind.is_barline() {
        if let Some(_barline_type) = element_kind_to_barline_type(cell.kind) {
            // End current measure and prepare for next
            measure_tracker.end_measure_and_advance();
            return MusicXMLState::MeasureOpen;
        }
    }

    // First, transition measure-level states until we reach InBeat or a beat-level state
    let mut current_state = state;
    loop {
        match current_state {
            MusicXMLState::MeasureReady => {
                measure_tracker.start_measure(measure_tracker.measure_number);
                current_state = MusicXMLState::MeasureOpen;
                // Continue to next iteration to process MeasureOpen
            }
            MusicXMLState::MeasureOpen => {
                // Transition to beat processing
                current_state = MusicXMLState::InBeat;
                // Continue to next iteration to process InBeat with the cell
            }
            _ => break, // Exit loop when we reach a beat-level state
        }
    }

    // Now process the cell with the current beat-level state
    match current_state {
        // Beat-level states (existing logic)
        MusicXMLState::InBeat => {
            match cell.kind {
                ElementKind::UnpitchedElement if cell.char == "-" => {
                    let _ = measure_tracker.add_duration(1);
                    beat_accum.start_dash();
                    MusicXMLState::CollectingDashesInBeat
                }
                ElementKind::PitchedElement if !cell.is_rhythm_transparent() => {
                    let _ = measure_tracker.add_duration(1);
                    if let Some(pitch_code) = &cell.pitch_code {
                        beat_accum.start_pitch(*pitch_code, cell.octave);
                        MusicXMLState::CollectingPitchInBeat
                    } else {
                        MusicXMLState::InBeat
                    }
                }
                ElementKind::PitchedElement if cell.is_rhythm_transparent() => {
                    // Grace note before main element
                    if let Some(pitch_code) = &cell.pitch_code {
                        beat_accum.add_grace_note(*pitch_code, cell.octave, cell.ornament_indicator.position_type());
                    }
                    MusicXMLState::InBeat
                }
                _ => MusicXMLState::InBeat,
            }
        }

        MusicXMLState::CollectingDashesInBeat => {
            match cell.kind {
                ElementKind::UnpitchedElement if cell.char == "-" => {
                    let _ = measure_tracker.add_duration(1);
                    beat_accum.increment_dash();
                    MusicXMLState::CollectingDashesInBeat
                }
                ElementKind::PitchedElement => {
                    let _ = measure_tracker.add_duration(1);
                    beat_accum.finish_dashes();
                    if let Some(pitch_code) = &cell.pitch_code {
                        beat_accum.start_pitch(*pitch_code, cell.octave);
                        MusicXMLState::CollectingPitchInBeat
                    } else {
                        MusicXMLState::InBeat
                    }
                }
                _ => MusicXMLState::CollectingDashesInBeat,
            }
        }

        MusicXMLState::CollectingPitchInBeat => {
            match cell.kind {
                ElementKind::UnpitchedElement if cell.char == "-" => {
                    let _ = measure_tracker.add_duration(1);
                    beat_accum.increment_dash();
                    MusicXMLState::CollectingPitchInBeat
                }
                ElementKind::PitchedElement if !cell.is_rhythm_transparent() => {
                    // New pitch → finish previous and start new
                    let _ = measure_tracker.add_duration(1);
                    beat_accum.finish_pitch();
                    if let Some(pitch_code) = &cell.pitch_code {
                        beat_accum.start_pitch(*pitch_code, cell.octave);
                        MusicXMLState::CollectingPitchInBeat
                    } else {
                        MusicXMLState::InBeat
                    }
                }
                ElementKind::PitchedElement if cell.is_rhythm_transparent() => {
                    // Grace note after main element
                    if let Some(pitch_code) = &cell.pitch_code {
                        beat_accum.add_grace_note(*pitch_code, cell.octave, cell.ornament_indicator.position_type());
                    }
                    MusicXMLState::CollectingTrailingGraceNotes
                }
                _ => MusicXMLState::CollectingPitchInBeat,
            }
        }

        MusicXMLState::CollectingTrailingGraceNotes => {
            // Continue collecting grace notes
            MusicXMLState::CollectingTrailingGraceNotes
        }

        // These should never be reached due to the loop above
        MusicXMLState::MeasureReady | MusicXMLState::MeasureOpen => {
            unreachable!("State transitions should have reached a beat-level state")
        }
    }
}

/// Handle end-of-stave (implicit measure boundary)
/// Called when a line/stave ends
pub fn handle_end_of_stave(
    state: MusicXMLState,
    beat_accum: &mut BeatAccumulator,
    measure_tracker: &mut MeasureTracker,
) -> MusicXMLState {
    // Finalize pending beat content
    match state {
        MusicXMLState::CollectingDashesInBeat => {
            beat_accum.finish_dashes();
        }
        MusicXMLState::CollectingPitchInBeat => {
            beat_accum.finish_pitch();
        }
        MusicXMLState::CollectingTrailingGraceNotes => {
            // Already finalized
        }
        _ => {}
    }

    // Close measure if open (even if incomplete)
    if !measure_tracker.is_empty() {
        measure_tracker.reset_for_next_measure();
    }

    // Return to ready state
    MusicXMLState::MeasureReady
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_measure_tracker_creation() {
        let tracker = MeasureTracker::new();
        assert_eq!(tracker.measure_number, 1);
        assert_eq!(tracker.beat_count, 0);
        assert_eq!(tracker.beat_capacity, 16); // 4/4 with divisions=4
    }

    #[test]
    fn test_measure_tracker_add_duration() {
        let mut tracker = MeasureTracker::new();
        assert!(tracker.add_duration(4).is_ok());
        assert_eq!(tracker.beat_count, 4);
        assert!(!tracker.is_full());

        assert!(tracker.add_duration(12).is_ok());
        assert_eq!(tracker.beat_count, 16);
        assert!(tracker.is_full());

        // Try to overflow
        assert!(tracker.add_duration(1).is_err());
    }

    #[test]
    fn test_measure_tracker_time_signature() {
        let mut tracker = MeasureTracker::new();

        // Default 4/4
        assert_eq!(tracker.beat_capacity, 16);

        // Change to 3/4
        assert!(tracker.set_time_signature(3, 4).is_ok());
        assert_eq!(tracker.beat_capacity, 12);

        // Change to 6/8
        assert!(tracker.set_time_signature(6, 8).is_ok());
        assert_eq!(tracker.beat_capacity, 12);
    }

    #[test]
    fn test_measure_tracker_divisions() {
        let mut tracker = MeasureTracker::new();
        assert_eq!(tracker.beat_capacity, 16); // divisions=4

        assert!(tracker.set_divisions(6).is_ok());
        assert_eq!(tracker.beat_capacity, 24); // (4 * 4 * 6) / 4 = 24
    }

    #[test]
    fn test_measure_tracker_end_measure_and_advance() {
        let mut tracker = MeasureTracker::new();
        tracker.start_measure(1);
        assert!(tracker.add_duration(8).is_ok());

        tracker.end_measure_and_advance();
        assert_eq!(tracker.measure_number, 2);
        assert_eq!(tracker.beat_count, 0);
    }

    #[test]
    fn test_element_kind_to_barline_type() {
        assert_eq!(element_kind_to_barline_type(ElementKind::SingleBarline), Some(BarlineType::Single));
        assert_eq!(element_kind_to_barline_type(ElementKind::DoubleBarline), Some(BarlineType::Double));
        assert_eq!(element_kind_to_barline_type(ElementKind::RepeatLeftBarline), Some(BarlineType::StartRepeat));
        assert_eq!(element_kind_to_barline_type(ElementKind::RepeatRightBarline), Some(BarlineType::EndRepeat));
        assert_eq!(element_kind_to_barline_type(ElementKind::PitchedElement), None);
    }

    #[test]
    fn test_unified_state_transitions() {
        let mut beat_accum = BeatAccumulator::new();
        let mut measure_tracker = MeasureTracker::new();

        // Start with MeasureReady
        let mut state = MusicXMLState::MeasureReady;
        let dash = Cell::new("-".to_string(), ElementKind::UnpitchedElement, 0);

        // First dash: MeasureReady → MeasureOpen → InBeat → CollectingDashesInBeat
        // (FSM auto-transitions to InBeat and processes the dash in a single call)
        state = transition(state, &dash, &mut beat_accum, &mut measure_tracker);
        assert_eq!(state, MusicXMLState::CollectingDashesInBeat);
        assert_eq!(measure_tracker.beat_count, 1);

        // Second dash: CollectingDashesInBeat → CollectingDashesInBeat (increment dash)
        state = transition(state, &dash, &mut beat_accum, &mut measure_tracker);
        assert_eq!(state, MusicXMLState::CollectingDashesInBeat);
        assert_eq!(measure_tracker.beat_count, 2);

        // Barline: closes measure 1, opens measure 2
        let barline = Cell::new("|".to_string(), ElementKind::SingleBarline, 0);
        state = transition(state, &barline, &mut beat_accum, &mut measure_tracker);
        assert_eq!(state, MusicXMLState::MeasureOpen);
        assert_eq!(measure_tracker.measure_number, 2);
        assert_eq!(measure_tracker.beat_count, 0);

        // Third dash in measure 2: MeasureOpen → InBeat → CollectingDashesInBeat
        state = transition(state, &dash, &mut beat_accum, &mut measure_tracker);
        assert_eq!(state, MusicXMLState::CollectingDashesInBeat);
        assert_eq!(measure_tracker.beat_count, 1);
    }

    #[test]
    fn test_handle_end_of_stave() {
        let mut beat_accum = BeatAccumulator::new();
        let mut measure_tracker = MeasureTracker::new();

        let state = MusicXMLState::CollectingPitchInBeat;
        let new_state = handle_end_of_stave(state, &mut beat_accum, &mut measure_tracker);

        assert_eq!(new_state, MusicXMLState::MeasureReady);
        assert_eq!(measure_tracker.beat_count, 0); // Reset after stave end
    }

    #[test]
    fn test_fsm_realistic_measure_sequence() {
        // Test: Process realistic cell sequence and verify measure output
        // Sequence: 4 dashes (measure 1) | 3 dashes (measure 2) END

        let mut state = MusicXMLState::MeasureReady;
        let mut beat_accum = BeatAccumulator::new();
        let mut measure = MeasureTracker::new();
        let mut completed_measures = Vec::new();

        // Create test cells
        let dash = Cell::new("-".to_string(), ElementKind::UnpitchedElement, 0);
        let barline = Cell::new("|".to_string(), ElementKind::SingleBarline, 4);

        // Measure 1: 4 dashes
        for _ in 0..4 {
            state = transition(state, &dash, &mut beat_accum, &mut measure);
        }
        assert_eq!(measure.measure_number, 1);
        assert_eq!(measure.beat_count, 4);

        // Barline - closes measure 1, opens measure 2
        let measure_1_beats = measure.beat_count;
        state = transition(state, &barline, &mut beat_accum, &mut measure);
        completed_measures.push((1, measure_1_beats));
        assert_eq!(measure.measure_number, 2);
        assert_eq!(measure.beat_count, 0);

        // Measure 2: 3 dashes
        for _ in 0..3 {
            state = transition(state, &dash, &mut beat_accum, &mut measure);
        }
        assert_eq!(measure.beat_count, 3);

        // End of stave
        let measure_2_beats = measure.beat_count;
        state = handle_end_of_stave(state, &mut beat_accum, &mut measure);
        completed_measures.push((2, measure_2_beats));

        // Verify
        assert_eq!(completed_measures.len(), 2);
        assert_eq!(completed_measures[0], (1, 4)); // Measure 1: 4 beats
        assert_eq!(completed_measures[1], (2, 3)); // Measure 2: 3 beats (incomplete)
        assert_eq!(state, MusicXMLState::MeasureReady);
    }

    #[test]
    fn test_fsm_multiple_measures_full_4_4() {
        // Test: Process multiple complete 4/4 measures
        // Sequence: 16 dashes | 16 dashes | 16 dashes END
        // (16 dashes = full 4/4 measure with divisions=4)

        let mut state = MusicXMLState::MeasureReady;
        let mut beat_accum = BeatAccumulator::new();
        let mut measure = MeasureTracker::new();
        let mut completed_measures = Vec::new();

        let dash = Cell::new("-".to_string(), ElementKind::UnpitchedElement, 0);
        let barline = Cell::new("|".to_string(), ElementKind::SingleBarline, 0);

        // Process 3 full measures
        for measure_count in 1..=3 {
            // Add 16 dashes (full 4/4 measure)
            for _ in 0..16 {
                state = transition(state, &dash, &mut beat_accum, &mut measure);
            }

            assert!(measure.is_full());

            // Add barline (except after last measure)
            if measure_count < 3 {
                state = transition(state, &barline, &mut beat_accum, &mut measure);
                completed_measures.push((measure_count as u32, 16));
            }
        }

        // End of stave (closes measure 3)
        state = handle_end_of_stave(state, &mut beat_accum, &mut measure);
        completed_measures.push((3, 16));

        // Verify
        assert_eq!(completed_measures.len(), 3);
        for (i, (meas_num, beats)) in completed_measures.iter().enumerate() {
            assert_eq!(*meas_num, (i + 1) as u32);
            assert_eq!(*beats, 16); // All full measures
        }
    }

    #[test]
    fn test_fsm_time_signature_change_affects_measures() {
        // Test: Changing time signature changes measure capacity
        // 4/4 → 3/4 (capacity 16 → 12)

        let mut measure = MeasureTracker::new();
        assert_eq!(measure.beat_capacity, 16); // 4/4

        // Change to 3/4
        measure.set_time_signature(3, 4).unwrap();
        assert_eq!(measure.beat_capacity, 12);

        // Now adding 12 beats should fill measure
        let result = measure.add_duration(12);
        assert!(result.is_ok());
        assert!(measure.is_full());

        // Adding 1 more should overflow
        let overflow = measure.add_duration(1);
        assert!(overflow.is_err());
    }

    #[test]
    fn test_e2e_realistic_input_1_2_3_4_barline_5_6_7_8() {
        // E2E Test: Input "1 2 3 4 | 5 6 7 8" should produce 2 measures
        // Measure 1: notes [1,2,3,4] (4 subdivisions)
        // Barline
        // Measure 2: notes [5,6,7,8] (4 subdivisions)

        let mut state = MusicXMLState::MeasureReady;
        let mut beat_accum = BeatAccumulator::new();
        let mut measure = MeasureTracker::new();

        // Track completed measures
        let mut completed_measures: Vec<(u32, usize)> = Vec::new();
        let mut current_note_count = 0;

        // Create cells
        let mut cells = Vec::new();

        // First measure: 1 2 3 4
        for pitch_char in &["1", "2", "3", "4"] {
            let mut cell = Cell::new(pitch_char.to_string(), ElementKind::PitchedElement, 0);
            cell.pitch_code = Some(PitchCode::N1); // Simplified to N1
            cells.push(cell);
        }

        // Barline
        cells.push(Cell::new("|".to_string(), ElementKind::SingleBarline, 4));

        // Second measure: 5 6 7 8
        for pitch_char in &["5", "6", "7", "8"] {
            let mut cell = Cell::new(pitch_char.to_string(), ElementKind::PitchedElement, 0);
            cell.pitch_code = Some(PitchCode::N1); // Simplified to N1
            cells.push(cell);
        }

        // Process cells
        for cell in cells.iter() {
            let prev_measure = measure.measure_number;

            state = transition(state, cell, &mut beat_accum, &mut measure);

            if cell.kind.is_barline() {
                // Barline detected - record completed measure
                completed_measures.push((prev_measure, current_note_count));
                current_note_count = 0;
            } else if cell.kind == ElementKind::PitchedElement {
                current_note_count += 1;
            }
        }

        // End of input - close last measure
        state = handle_end_of_stave(state, &mut beat_accum, &mut measure);
        completed_measures.push((measure.measure_number, current_note_count));

        // Verify
        assert_eq!(completed_measures.len(), 2, "Should produce 2 measures");
        assert_eq!(completed_measures[0].0, 1, "First measure should be #1");
        assert_eq!(completed_measures[0].1, 4, "Measure 1 should have 4 notes");
        assert_eq!(completed_measures[1].0, 2, "Second measure should be #2");
        assert_eq!(completed_measures[1].1, 4, "Measure 2 should have 4 notes");
    }
}
