//! Test for triplet slur bug: slur should cover all 3 notes, not just first 2
//!
//! Bug: "123" with slur applied to all 3 notes produces:
//!   Actual:   \tuplet 3/2 { c'8( d'8) e'8 }  - slur ends after note 2
//!   Expected: \tuplet 3/2 { c'8( d'8 e'8) }  - slur ends after note 3

use editor_wasm::models::{Cell, ElementKind, PitchCode, SlurIndicator};
use editor_wasm::renderers::musicxml::beat::process_beat;
use editor_wasm::renderers::musicxml::builder::MusicXmlBuilder;

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
fn test_triplet_slur_covers_all_three_notes() {
    // Create 3 cells representing "123" in a single beat (triplet)
    // Slur applied: first note has SlurStart, last note has SlurEnd
    let cells = vec![
        make_pitched_cell("1", PitchCode::N1, 0, SlurIndicator::SlurStart),
        make_pitched_cell("2", PitchCode::N2, 1, SlurIndicator::None),
        make_pitched_cell("3", PitchCode::N3, 2, SlurIndicator::SlurEnd),
    ];

    // Create MusicXML builder
    let mut builder = MusicXmlBuilder::new();
    builder.set_key_signature(Some("C")); // C major

    // Process the beat (all 3 cells are one beat = triplet)
    let measure_divisions = 4; // quarter note divisions
    let next_beat_starts_with_div = false;

    let result = process_beat(&mut builder, &cells, measure_divisions, next_beat_starts_with_div);
    assert!(result.is_ok(), "process_beat should succeed");

    // Get the MusicXML output
    let xml = builder.get_buffer();
    println!("Generated MusicXML:\n{}", xml);

    // Count slur markers
    let slur_start_count = xml.matches("slur type=\"start\"").count();
    let slur_stop_count = xml.matches("slur type=\"stop\"").count();
    let slur_continue_count = xml.matches("slur type=\"continue\"").count();

    println!("Slur markers found:");
    println!("  start: {}", slur_start_count);
    println!("  continue: {}", slur_continue_count);
    println!("  stop: {}", slur_stop_count);

    // Extract note elements to verify slur placement
    let note_pattern = "<note>";
    let notes: Vec<&str> = xml.split(note_pattern).skip(1).collect();

    println!("\nNumber of notes: {}", notes.len());
    assert_eq!(notes.len(), 3, "Should have 3 notes in triplet");

    // Check each note for slur markers
    for (i, note) in notes.iter().enumerate() {
        let has_slur_start = note.contains("slur type=\"start\"");
        let has_slur_continue = note.contains("slur type=\"continue\"");
        let has_slur_stop = note.contains("slur type=\"stop\"");
        println!("Note {}: start={}, continue={}, stop={}",
                 i + 1, has_slur_start, has_slur_continue, has_slur_stop);
    }

    // Verify correct slur placement:
    // Note 1: should have slur start
    assert!(notes[0].contains("slur type=\"start\""),
            "First note should have slur start");

    // Note 2: should have slur continue (or no slur marker - depends on MusicXML convention)
    // In MusicXML, intermediate notes in a slur don't need markers, but "continue" is valid

    // Note 3: should have slur stop - THIS IS THE BUG
    // Currently the slur stop is on note 2 instead of note 3
    assert!(notes[2].contains("slur type=\"stop\""),
            "Third note should have slur stop - BUG: slur ends on second note instead");
}

#[test]
fn test_two_note_slur_in_duplet() {
    // Simpler case: 2 notes with slur - should work correctly
    let cells = vec![
        make_pitched_cell("1", PitchCode::N1, 0, SlurIndicator::SlurStart),
        make_pitched_cell("2", PitchCode::N2, 1, SlurIndicator::SlurEnd),
    ];

    let mut builder = MusicXmlBuilder::new();
    builder.set_key_signature(Some("C"));

    let result = process_beat(&mut builder, &cells, 4, false);
    assert!(result.is_ok());

    let xml = builder.get_buffer();
    println!("2-note slur MusicXML:\n{}", xml);

    let notes: Vec<&str> = xml.split("<note>").skip(1).collect();
    assert_eq!(notes.len(), 2, "Should have 2 notes");

    assert!(notes[0].contains("slur type=\"start\""),
            "First note should have slur start");
    assert!(notes[1].contains("slur type=\"stop\""),
            "Second note should have slur stop");
}

#[test]
fn test_four_note_slur_shows_off_by_one_pattern() {
    // 4 notes with slur - if there's an off-by-one bug, slur will end on note 3 instead of 4
    let cells = vec![
        make_pitched_cell("1", PitchCode::N1, 0, SlurIndicator::SlurStart),
        make_pitched_cell("2", PitchCode::N2, 1, SlurIndicator::None),
        make_pitched_cell("3", PitchCode::N3, 2, SlurIndicator::None),
        make_pitched_cell("4", PitchCode::N4, 3, SlurIndicator::SlurEnd),
    ];

    let mut builder = MusicXmlBuilder::new();
    builder.set_key_signature(Some("C"));

    let result = process_beat(&mut builder, &cells, 4, false);
    assert!(result.is_ok());

    let xml = builder.get_buffer();
    println!("4-note slur MusicXML:\n{}", xml);

    let notes: Vec<&str> = xml.split("<note>").skip(1).collect();
    assert_eq!(notes.len(), 4, "Should have 4 notes");

    // Note 1: slur start
    assert!(notes[0].contains("slur type=\"start\""),
            "First note should have slur start");

    // Notes 2 and 3: slur continue
    assert!(notes[1].contains("slur type=\"continue\""),
            "Second note should have slur continue");
    assert!(notes[2].contains("slur type=\"continue\""),
            "Third note should have slur continue");

    // Note 4: slur stop - BUG: likely ends on note 3
    assert!(notes[3].contains("slur type=\"stop\""),
            "Fourth note should have slur stop - BUG if this fails");
}
