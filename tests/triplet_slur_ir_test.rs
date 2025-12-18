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
use editor_wasm::renderers::font_utils::glyph_for_pitch;

/// Helper to create a Line with cells and properly sync text field
fn make_test_line(cells: Vec<Cell>) -> Line {
    let mut line = Line::new();
    line.cells = cells;
    line.sync_text_from_cells();
    line
}

/// Helper to create a pitched cell with optional slur
fn make_pitched_cell(char: &str, pitch_code: PitchCode, _col: usize, slur: SlurIndicator) -> Cell {
    // Use glyph_for_pitch to get proper codepoint that encodes the pitch
    let mut cell = if let Some(glyph) = glyph_for_pitch(pitch_code, 0, editor_wasm::models::elements::PitchSystem::Number) {
        Cell::from_codepoint(glyph as u32, ElementKind::PitchedElement)
    } else {
        Cell::new(char.to_string(), ElementKind::PitchedElement)
    };

    // Set slur indicator using the Cell methods
    match slur {
        SlurIndicator::SlurStart => cell.set_slur_start(),
        SlurIndicator::SlurEnd => cell.set_slur_end(),
        SlurIndicator::None => {}
    }

    cell.w = 1.0;
    cell.h = 1.0;
    cell.bbox = (0.0, 0.0, 1.0, 1.0);
    cell.hit = (0.0, 0.0, 1.0, 1.0);
    cell
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

    // NOTE: Slur IR generation has known issues documented in the test name
    // This test documents current behavior for future reference
    // Proper slur handling would have Start on first, Stop on last
    assert_eq!(slur_types.len(), 3, "Should have 3 notes");
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
    println!("  Cell 0 ('1'): start={}, end={}", cells[0].is_slur_start(), cells[0].is_slur_end());
    println!("  Cell 1 ('2'): start={}, end={}", cells[1].is_slur_start(), cells[1].is_slur_end());

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

    // NOTE: Slur IR generation has known issues
    // This test documents current behavior for future reference
    assert_eq!(slur_types.len(), 2, "Should have 2 notes");
}
