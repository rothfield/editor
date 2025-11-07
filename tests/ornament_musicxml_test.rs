use editor_wasm::models::{Cell, ElementKind, Document, Line, PitchCode, OrnamentPositionType, Ornament, OrnamentPlacement};
use editor_wasm::renderers::musicxml::export::export_to_musicxml;

#[test]
fn test_note_with_ornament_exports_main_pitch() {
    // Create a cell for note 1 (pitch C)
    let mut note_cell = Cell {
        kind: ElementKind::PitchedElement,
        char: "1".to_string(),
        pitch_code: Some(PitchCode::N1),
        octave: 4,
        ..Default::default()
    };

    // Create ornament cells (2 and 3)
    let ornament_cells = vec![
        Cell {
            kind: ElementKind::PitchedElement,
            char: "2".to_string(),
            pitch_code: Some(PitchCode::N2),
            octave: 4,
            ..Default::default()
        },
        Cell {
            kind: ElementKind::PitchedElement,
            char: "3".to_string(),
            pitch_code: Some(PitchCode::N3),
            octave: 4,
            ..Default::default()
        },
    ];

    // Attach ornament to the note
    note_cell.ornament = Some(Ornament {
        cells: ornament_cells,
        placement: OrnamentPlacement::Before,
    });

    // Create a line with the note
    let mut line = Line {
        cells: vec![note_cell],
        ..Default::default()
    };

    // Create a document with the line
    let mut document = Document::new();
    document.lines = vec![line];

    // Export to MusicXML
    let musicxml = export_to_musicxml(&document, None, None)
        .expect("MusicXML export should succeed");

    println!("Generated MusicXML:\n{}", musicxml);

    // The main note should have <step>C</step>
    assert!(
        musicxml.contains("<step>C</step>"),
        "Main note pitch should be present as <step>C</step>"
    );

    // There should be grace notes for the ornament
    assert!(
        musicxml.matches("<grace").count() >= 2,
        "Should have at least 2 grace notes from the ornament"
    );

    // Grace notes should have their own pitches
    assert!(
        musicxml.matches("<step>D</step>").count() >= 1,
        "Ornament should contain D note"
    );

    assert!(
        musicxml.matches("<step>E</step>").count() >= 1,
        "Ornament should contain E note"
    );
}

#[test]
fn test_note_with_after_ornament_exports_main_pitch() {
    // Create a cell for note 1 (pitch C)
    let mut note_cell = Cell {
        kind: ElementKind::PitchedElement,
        char: "1".to_string(),
        pitch_code: Some(PitchCode::N1),
        octave: 4,
        ..Default::default()
    };

    // Create ornament cells (2 and 3)
    let ornament_cells = vec![
        Cell {
            kind: ElementKind::PitchedElement,
            char: "2".to_string(),
            pitch_code: Some(PitchCode::N2),
            octave: 4,
            ..Default::default()
        },
        Cell {
            kind: ElementKind::PitchedElement,
            char: "3".to_string(),
            pitch_code: Some(PitchCode::N3),
            octave: 4,
            ..Default::default()
        },
    ];

    // Attach ornament to the note as After placement
    note_cell.ornament = Some(Ornament {
        cells: ornament_cells,
        placement: OrnamentPlacement::After,
    });

    // Create a line with the note
    let mut line = Line {
        cells: vec![note_cell],
        ..Default::default()
    };

    // Create a document with the line
    let mut document = Document::new();
    document.lines = vec![line];

    // Export to MusicXML
    let musicxml = export_to_musicxml(&document, None, None)
        .expect("MusicXML export should succeed");

    println!("Generated MusicXML:\n{}", musicxml);

    // The main note should have <step>C</step>
    assert!(
        musicxml.contains("<step>C</step>"),
        "Main note pitch should be present as <step>C</step>"
    );
}
