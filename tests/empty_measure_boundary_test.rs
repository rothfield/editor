// Test: Empty barline pair | | is just a boundary, not an empty measure
//
// Input: | 1 2 3 4 | |
// Expected: 1 measure with 4 quarter notes
// Bug: Currently emits 2 measures (4 notes + whole rest)

use editor_wasm::models::{Document, Line, Cell, ElementKind, PitchCode};
use editor_wasm::models::elements::PitchSystem;
use editor_wasm::renderers::musicxml::to_musicxml_polyphonic;
use editor_wasm::renderers::font_utils::glyph_for_pitch;

fn make_pitched_cell(pitch_code: PitchCode) -> Cell {
    if let Some(glyph) = glyph_for_pitch(pitch_code, 0, PitchSystem::Number) {
        Cell::from_codepoint(glyph as u32, ElementKind::PitchedElement)
    } else {
        Cell::new("1".to_string(), ElementKind::PitchedElement)
    }
}

fn make_space() -> Cell {
    Cell::new(" ".to_string(), ElementKind::Whitespace)
}

fn make_barline() -> Cell {
    Cell::new("|".to_string(), ElementKind::UnpitchedElement)
}

#[test]
fn test_trailing_barline_not_empty_measure() {
    // | 1 2 3 4 | |
    // This is 1 measure with closing barline, not 2 measures

    let mut doc = Document::new();
    let mut line = Line::new();

    // Build: | 1 2 3 4 | |
    line.cells.push(make_barline());
    line.cells.push(make_space());
    line.cells.push(make_pitched_cell(PitchCode::N1));
    line.cells.push(make_space());
    line.cells.push(make_pitched_cell(PitchCode::N2));
    line.cells.push(make_space());
    line.cells.push(make_pitched_cell(PitchCode::N3));
    line.cells.push(make_space());
    line.cells.push(make_pitched_cell(PitchCode::N4));
    line.cells.push(make_space());
    line.cells.push(make_barline());
    line.cells.push(make_space());
    line.cells.push(make_barline());

    line.sync_text_from_cells();
    doc.add_line(line);
    doc.recalculate_system_and_part_ids();

    let musicxml = to_musicxml_polyphonic(&doc).expect("Export should succeed");

    println!("MusicXML output:\n{}", musicxml);

    // Count measures - should be 1, not 2
    let measure_count = musicxml.matches("<measure").count();
    println!("Measure count: {}", measure_count);

    // BUG: Currently produces 2 measures (second is empty with rest)
    // Expected: 1 measure only - the | | is just the closing barline
    assert_eq!(measure_count, 1,
        "Should have 1 measure. The trailing | | is just a closing barline, not an empty measure.");

    // Should have 4 quarter notes, no rests
    let quarter_count = musicxml.matches("<type>quarter</type>").count();
    let rest_count = musicxml.matches("<rest").count();
    println!("Quarter notes: {}, Rests: {}", quarter_count, rest_count);

    assert_eq!(quarter_count, 4, "Should have 4 quarter notes");
    assert_eq!(rest_count, 0, "Should have no rests - the | | is just a boundary");
}
