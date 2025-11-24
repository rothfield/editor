use editor_wasm::models::{Cell, ElementKind, Line, PitchCode, Ornament, OrnamentPlacement, SlurIndicator};
use editor_wasm::ir::build_export_measures_from_line;

#[test]
fn test_note_with_ornament_creates_note_with_grace_notes() {
    // Create a main note cell (pitch 1/C)
    let mut main_cell = Cell {
        kind: ElementKind::PitchedElement,
        char: "1".to_string(),
        pitch_code: Some(PitchCode::N1),
        octave: 4,
        col: 0,
        flags: 0,
        pitch_system: None,
        slur_indicator: SlurIndicator::None,
        ornament: None,
        x: 0.0,
        y: 0.0,
        w: 1.0,
        h: 1.0,
        bbox: (0.0, 0.0, 1.0, 1.0),
        hit: (0.0, 0.0, 1.0, 1.0),
    };

    // Create ornament cells (pitch 2/D and 3/E)
    let ornament_cells = vec![
        Cell {
            kind: ElementKind::PitchedElement,
            char: "2".to_string(),
            pitch_code: Some(PitchCode::N2),
            octave: 4,
            col: 1,
            flags: 0,
            pitch_system: None,
            slur_indicator: SlurIndicator::None,
            ornament: None,
            x: 0.0,
            y: 0.0,
            w: 1.0,
            h: 1.0,
            bbox: (0.0, 0.0, 1.0, 1.0),
            hit: (0.0, 0.0, 1.0, 1.0),
        },
        Cell {
            kind: ElementKind::PitchedElement,
            char: "3".to_string(),
            pitch_code: Some(PitchCode::N3),
            octave: 4,
            col: 2,
            flags: 0,
            pitch_system: None,
            slur_indicator: SlurIndicator::None,
            ornament: None,
            x: 0.0,
            y: 0.0,
            w: 1.0,
            h: 1.0,
            bbox: (0.0, 0.0, 1.0, 1.0),
            hit: (0.0, 0.0, 1.0, 1.0),
        },
    ];

    // Attach ornament to main cell
    main_cell.ornament = Some(Ornament {
        cells: ornament_cells,
        placement: OrnamentPlacement::Before,
    });

    // Create a line with just the main cell (ornament cells are inside it)
    let line = Line {
        cells: vec![main_cell],
        label: String::new(),
        tala: String::new(),
        lyrics: String::new(),
        tonic: String::new(),
        pitch_system: None,
        key_signature: String::new(),
        time_signature: String::new(),
        tempo: String::new(),
        beats: Vec::new(),
        slurs: Vec::new(),
    };

    // Build IR from the line
    let measures = build_export_measures_from_line(&line);

    // Verify we got one measure
    assert_eq!(measures.len(), 1, "Should have one measure");

    let measure = &measures[0];

    // Verify we have one event (the note)
    assert_eq!(measure.events.len(), 1, "Should have one note event");

    // Verify the event is a Note, not a Rest
    use editor_wasm::renderers::musicxml::export_ir::ExportEvent;
    match &measure.events[0] {
        ExportEvent::Note(note) => {
            // Verify the main note has pitch N1
            assert_eq!(note.pitch.pitch_code, PitchCode::N1, "Main note should have pitch N1");

            // Verify grace notes are present
            assert_eq!(
                note.grace_notes_before.len(),
                2,
                "Should have 2 grace notes before main note"
            );

            // Verify the grace notes have correct pitches
            assert_eq!(
                note.grace_notes_before[0].pitch.pitch_code,
                PitchCode::N2,
                "First grace note should have pitch N2"
            );
            assert_eq!(
                note.grace_notes_before[1].pitch.pitch_code,
                PitchCode::N3,
                "Second grace note should have pitch N3"
            );

            println!("✅ Note with ornament correctly creates Note event with grace notes");
        }
        ExportEvent::Rest { .. } => {
            panic!("❌ BUG: Note with ornament was converted to Rest instead of Note");
        }
        ExportEvent::Chord { .. } => {
            panic!("❌ BUG: Note with ornament was converted to Chord");
        }
    }
}

#[test]
fn test_note_with_after_ornament_creates_grace_notes_after() {
    // Create a main note cell
    let mut main_cell = Cell {
        kind: ElementKind::PitchedElement,
        char: "4".to_string(),
        pitch_code: Some(PitchCode::N4),
        octave: 4,
        col: 0,
        flags: 0,
        pitch_system: None,
        slur_indicator: SlurIndicator::None,
        ornament: None,
        x: 0.0,
        y: 0.0,
        w: 1.0,
        h: 1.0,
        bbox: (0.0, 0.0, 1.0, 1.0),
        hit: (0.0, 0.0, 1.0, 1.0),
    };

    // Create ornament cells
    let ornament_cells = vec![Cell {
        kind: ElementKind::PitchedElement,
        char: "5".to_string(),
        pitch_code: Some(PitchCode::N5),
        octave: 4,
        col: 1,
        flags: 0,
        pitch_system: None,
        slur_indicator: SlurIndicator::None,
        ornament: None,
        x: 0.0,
        y: 0.0,
        w: 1.0,
        h: 1.0,
        bbox: (0.0, 0.0, 1.0, 1.0),
        hit: (0.0, 0.0, 1.0, 1.0),
    }];

    // Attach ornament with After placement
    main_cell.ornament = Some(Ornament {
        cells: ornament_cells,
        placement: OrnamentPlacement::After,
    });

    let line = Line {
        cells: vec![main_cell],
        label: String::new(),
        tala: String::new(),
        lyrics: String::new(),
        tonic: String::new(),
        pitch_system: None,
        key_signature: String::new(),
        time_signature: String::new(),
        tempo: String::new(),
        beats: Vec::new(),
        slurs: Vec::new(),
    };

    let measures = build_export_measures_from_line(&line);
    assert_eq!(measures.len(), 1);

    let measure = &measures[0];
    assert_eq!(measure.events.len(), 1, "Should have one note event");

    use editor_wasm::renderers::musicxml::export_ir::ExportEvent;
    match &measure.events[0] {
        ExportEvent::Note(note) => {
            // Main note should be N4
            assert_eq!(note.pitch.pitch_code, PitchCode::N4);

            // Grace notes should be after
            assert_eq!(note.grace_notes_after.len(), 1, "Should have 1 grace note after");
            assert_eq!(
                note.grace_notes_after[0].pitch.pitch_code,
                PitchCode::N5,
                "Grace note after should have pitch N5"
            );

            println!("✅ Note with After ornament correctly creates grace notes after");
        }
        _ => panic!("❌ BUG: Note was not created"),
    }
}
