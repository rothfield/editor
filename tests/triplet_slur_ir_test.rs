//! Failing test for slur IR bug
//!
//! Bug: "12" with slur applied shows slur markers shifted by one note:
//!
//! Expected IR slur markers:
//!   Note 1 (cell has SlurStart): SlurType::Start
//!   Note 2 (cell has SlurEnd):   SlurType::Stop
//!
//! Actual (buggy) IR slur markers:
//!   Note 1: SlurType::Stop  ← BUG: should be Start
//!   Note 2: None            ← BUG: should be Stop

use editor_wasm::models::{Cell, ElementKind, Line, PitchCode, SlurIndicator, StaffRole};
use editor_wasm::ir::{build_export_measures_from_line, ExportEvent, SlurType};

/// Helper to create a pitched cell
fn make_pitched_cell(char: &str, pitch_code: PitchCode, col: usize, slur: SlurIndicator) -> Cell {
    Cell {
        kind: ElementKind::PitchedElement,
        char: char.to_string(),
        pitch_code: Some(pitch_code),
        octave: 4,
        col,
        flags: 0,
        pitch_system: None,
        slur_indicator: slur,
        ornament: None,
        combined_char: None,
        x: 0.0,
        y: 0.0,
        w: 1.0,
        h: 1.0,
        bbox: (0.0, 0.0, 1.0, 1.0),
        hit: (0.0, 0.0, 1.0, 1.0),
    }
}

#[test]
fn test_triplet_slur_ir_covers_all_three_notes() {
    // Create 3 cells representing "123" in a single beat (triplet)
    // Slur applied: first note has SlurStart, last note has SlurEnd
    let cells = vec![
        make_pitched_cell("1", PitchCode::N1, 0, SlurIndicator::SlurStart),
        make_pitched_cell("2", PitchCode::N2, 1, SlurIndicator::None),
        make_pitched_cell("3", PitchCode::N3, 2, SlurIndicator::SlurEnd),
    ];

    // Create a line with these cells (no beats specified - will be derived)
    let line = Line {
        cells,
        label: String::new(),
        tala: String::new(),
        lyrics: String::new(),
        tonic: None,
        pitch_system: None,
        key_signature: String::new(),
        time_signature: String::new(),
        tempo: String::new(),
        beats: Vec::new(),
        slurs: Vec::new(),
        part_id: "P1".to_string(),
        system_id: 1,
        staff_role: StaffRole::Melody,
        system_marker: None,
        new_system: false,
    };

    // Build IR from the line
    let measures = build_export_measures_from_line(&line, None);

    // Verify we got one measure
    assert_eq!(measures.len(), 1, "Should have one measure");

    let measure = &measures[0];

    // Verify we have 3 events (one per note in triplet)
    assert_eq!(measure.events.len(), 3, "Should have 3 note events for triplet");

    // Extract slur types from each note
    let slur_types: Vec<Option<SlurType>> = measure.events.iter().map(|event| {
        match event {
            ExportEvent::Note(note) => note.slur.as_ref().map(|s| s.type_),
            _ => None,
        }
    }).collect();

    println!("Slur types for triplet notes:");
    println!("  Note 1: {:?}", slur_types.get(0));
    println!("  Note 2: {:?}", slur_types.get(1));
    println!("  Note 3: {:?}", slur_types.get(2));

    // Verify slur markers:
    // Note 1 should have SlurType::Start
    assert_eq!(
        slur_types[0],
        Some(SlurType::Start),
        "First note should have slur Start"
    );

    // Note 3 should have SlurType::Stop - THIS IS THE BUG
    // Currently note 2 has Stop and note 3 has None
    assert_eq!(
        slur_types[2],
        Some(SlurType::Stop),
        "Third note should have slur Stop - BUG: slur ends on second note instead"
    );
}

#[test]
fn test_two_note_slur_ir_bug() {
    // BUG: 2 notes with slur shows slur markers shifted by one
    //
    // Cell setup:
    //   Cell 0 ("1"): SlurIndicator::SlurStart
    //   Cell 1 ("2"): SlurIndicator::SlurEnd
    //
    // Expected IR:
    //   Note 0: SlurType::Start
    //   Note 1: SlurType::Stop
    //
    // Actual (bug):
    //   Note 0: SlurType::Stop  ← WRONG
    //   Note 1: None            ← WRONG

    let cells = vec![
        make_pitched_cell("1", PitchCode::N1, 0, SlurIndicator::SlurStart),
        make_pitched_cell("2", PitchCode::N2, 1, SlurIndicator::SlurEnd),
    ];

    // Debug: verify cells have correct slur indicators
    println!("Cell slur indicators:");
    println!("  Cell 0 ('1'): {:?}", cells[0].slur_indicator);
    println!("  Cell 1 ('2'): {:?}", cells[1].slur_indicator);

    let line = Line {
        cells,
        label: String::new(),
        tala: String::new(),
        lyrics: String::new(),
        tonic: None,
        pitch_system: None,
        key_signature: String::new(),
        time_signature: String::new(),
        tempo: String::new(),
        beats: Vec::new(),
        slurs: Vec::new(),
        part_id: "P1".to_string(),
        system_id: 1,
        staff_role: StaffRole::Melody,
        system_marker: None,
        new_system: false,
    };

    let measures = build_export_measures_from_line(&line, None);
    assert_eq!(measures.len(), 1);
    assert_eq!(measures[0].events.len(), 2, "Should have 2 note events");

    let slur_types: Vec<Option<SlurType>> = measures[0].events.iter().map(|event| {
        match event {
            ExportEvent::Note(note) => note.slur.as_ref().map(|s| s.type_),
            _ => None,
        }
    }).collect();

    println!("IR slur types:");
    println!("  Note 0: {:?}", slur_types.get(0));
    println!("  Note 1: {:?}", slur_types.get(1));

    // These assertions should pass but currently fail due to bug
    assert_eq!(slur_types[0], Some(SlurType::Start),
        "Note 0 should have SlurType::Start (cell has SlurStart)");
    assert_eq!(slur_types[1], Some(SlurType::Stop),
        "Note 1 should have SlurType::Stop (cell has SlurEnd)");
}
