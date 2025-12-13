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

/// Helper to create a Line with cells and properly sync text field
fn make_test_line(cells: Vec<Cell>) -> Line {
    let mut line = Line::new();
    line.cells = cells;
    line.sync_text_from_cells();
    line
}

/// Helper to create a pitched cell
fn make_pitched_cell(char: &str, pitch_code: PitchCode, col: usize, slur: SlurIndicator) -> Cell {
    let codepoint = char.chars().next().map(|c| c as u32).unwrap_or(0);
    Cell {
        codepoint,
        char: char.to_string(),
        kind: ElementKind::PitchedElement,
        col,
        flags: 0,
        pitch_code: Some(pitch_code),
        pitch_system: None,
        octave: 4,
        superscript: false,
        slur_indicator: slur,
        underline: editor_wasm::renderers::line_variants::UnderlineState::None,
        overline: editor_wasm::renderers::line_variants::OverlineState::None,
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
    let line = make_test_line(cells);

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

    let line = make_test_line(cells);

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
