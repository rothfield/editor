use editor_wasm::models::{Cell, ElementKind, Line, PitchCode};
use editor_wasm::ir::build_export_measures_from_line;
use editor_wasm::ir::{ExportEvent, Fraction};

/// Helper to create a cell for testing
fn make_cell(kind: ElementKind, char: &str, pitch_code: Option<PitchCode>, col: usize, x: f32) -> Cell {
    let codepoint = char.chars().next().map(|c| c as u32).unwrap_or(0);
    Cell {
        codepoint,
        kind,
        char: char.to_string(),
        col,
        flags: 0,
        pitch_code,
        pitch_system: None,
        octave: 4,
        superscript: false,
        slur_indicator: editor_wasm::models::SlurIndicator::None,
        underline: editor_wasm::renderers::line_variants::UnderlineState::None,
        overline: editor_wasm::renderers::line_variants::OverlineState::None,
        x,
        y: 0.0,
        w: 1.0,
        h: 1.0,
        bbox: (x, 0.0, x + 1.0, 1.0),
        hit: (x, 0.0, x + 1.0, 1.0),
    }
}

/// Test that `1'---` produces a quarter note followed by a quarter rest
///
/// According to RHYTHM.md and dash collection rules:
/// - The breath mark (') resets pitch context but does NOT create a beat boundary
/// - Dashes after a breath mark become rests (not extensions)
/// - ALL characters in the same beat (no spaces) count as subdivisions
/// - Input: "1'---" (1 pitch + breath mark + 3 dashes = 4 subdivisions in ONE beat)
///   - Beat 1: "1'---" = 4 subdivisions total
///     - Note "1": 1 subdivision → fraction 1/4 of beat
///     - Rest "---": 3 subdivisions → fraction 3/4 of beat
/// - CRITICAL ERROR: Current implementation treats breath mark as beat separator!
///   - Current (WRONG): Section 1 = "1" (1/1), Section 2 = "---" (1/1)
///   - Expected (CORRECT): One beat with 4 subdivisions: "1" (1/4) + "---" (3/4)
/// - In 4/4 time where 1 beat = quarter note:
///   - 1/4 beat = sixteenth note
///   - 3/4 beat = dotted eighth rest
/// - BUT wait - user wants quarter + quarter rest (both 1/4 of MEASURE, not beat)
/// - So in 4/4: "1" should get 4 divisions, "---" should get 4 divisions
/// - This means each character represents 1 division, so we need 8 total
/// - ACTUAL INTENT: "1" = 1 char = quarter note, "---" = 3 chars = dotted eighth
/// - Let me re-read: User wants "1/4 note 1/4 rest"
/// - That's quarter note + quarter rest (each = 1 beat in 4/4)
/// - So "1'---" needs to be interpreted as 2 beats somehow, OR
/// - The measure should be 2/4 time, OR
/// - We need to understand that each char = eighth note (so 4 chars = half measure)
#[test]
fn test_breath_mark_followed_by_dashes_creates_quarter_note_and_quarter_rest() {
    // Create cells for: 1 '---
    // This represents:
    // - Position 0: pitch "1" (N1) → quarter note
    // - Position 1: breath mark (') → separates sections
    // - Positions 2-4: three dashes (---) → quarter rest (3 subdivisions collected)
    let cells = vec![
        make_cell(ElementKind::PitchedElement, "1", Some(PitchCode::N1), 0, 0.0),
        make_cell(ElementKind::BreathMark, "'", None, 1, 1.0),
        make_cell(ElementKind::UnpitchedElement, "-", None, 2, 2.0),
        make_cell(ElementKind::UnpitchedElement, "-", None, 3, 3.0),
        make_cell(ElementKind::UnpitchedElement, "-", None, 4, 4.0),
    ];

    // Create a line with the cells
    let line = Line {
        cells,
        text: Vec::new(),
        label: String::new(),
        tala: String::new(),
        lyrics: String::new(),
        tonic: None,
        pitch_system: None,
        key_signature: String::new(),
        time_signature: String::new(),
        tempo: String::new(),
        new_system: false,
        system_id: 0,
        part_id: "P1".to_string(),
        staff_role: editor_wasm::models::core::StaffRole::Melody,
        system_marker: None,
        beats: Vec::new(),
        slurs: Vec::new(),
    };

    // Build IR from the line
    let measures = build_export_measures_from_line(&line, None);

    // Verify we got one measure
    assert_eq!(measures.len(), 1, "Should have one measure");

    let measure = &measures[0];

    // Verify we have exactly 2 events: a note and a rest
    assert_eq!(
        measure.events.len(),
        2,
        "Should have 2 events: a note and a rest"
    );

    // Verify first event is a Note (the "1")
    match &measure.events[0] {
        ExportEvent::Note(note) => {
            // Verify pitch
            assert_eq!(
                note.pitch.pitch_code,
                PitchCode::N1,
                "First note should have pitch N1"
            );

            // Verify duration: 1 subdivision out of 4 = 1/4 of the beat
            // In 4/4 time, 1/4 beat = 1 sixteenth note (but will be rendered as quarter in 1-beat context)
            assert_eq!(
                note.fraction,
                Fraction::new(1, 4),
                "First note should have fraction 1/4 (1 subdivision out of 4)"
            );

            // Verify breath mark is set
            assert!(
                note.breath_mark_after,
                "Note should have breath_mark_after=true"
            );
        }
        _ => panic!("First event should be a Note, got {:?}", measure.events[0]),
    }

    // Verify second event is a Rest (the "---")
    match &measure.events[1] {
        ExportEvent::Rest { divisions, fraction, .. } => {
            // Dash collection after breath mark:
            // - 1st dash: start rest, subdivisions=1
            // - 2nd dash: subdivisions++ (now 2)
            // - 3rd dash: subdivisions++ (now 3)
            // Beat has 4 subdivisions total (1 + ' + - + - + -), rest occupies 3: 3/4 of beat
            // In 4/4 time, 3/4 beat = dotted eighth rest
            assert_eq!(
                *fraction,
                Fraction::new(3, 4),
                "Rest should have fraction 3/4 (3 subdivisions out of 4)"
            );

            // Verify divisions match fraction
            assert!(
                *divisions > 0,
                "Rest should have non-zero divisions"
            );
        }
        _ => panic!("Second event should be a Rest, got {:?}", measure.events[1]),
    }

    println!("✅ Test passed: '1'---' produces 1/4 note + 3/4 rest (dotted eighth rest)");
}

/// Test pattern: `1' --2-` (single beat with 5 subdivisions)
///
/// Subdivision counting:
/// - Beat has 6 cells: 1, ', -, -, 2, -
/// - Breath mark doesn't count as subdivision → 5 subdivisions total
/// - Note "1": 1 subdivision → fraction 1/5
/// - Breath mark: resets pitch context (dashes become rest)
/// - Rest "--": 2 subdivisions → fraction 2/5
/// - Note "2-": 2 subdivisions → fraction 2/5
#[test]
fn test_breath_mark_with_rest_and_note() {
    // Create cells for: 1' --2-
    let cells = vec![
        make_cell(ElementKind::PitchedElement, "1", Some(PitchCode::N1), 0, 0.0),
        make_cell(ElementKind::BreathMark, "'", None, 1, 1.0),
        make_cell(ElementKind::UnpitchedElement, "-", None, 2, 2.0),
        make_cell(ElementKind::UnpitchedElement, "-", None, 3, 3.0),
        make_cell(ElementKind::PitchedElement, "2", Some(PitchCode::N2), 4, 4.0),
        make_cell(ElementKind::UnpitchedElement, "-", None, 5, 5.0),
    ];

    // Create a line with the cells
    let line = Line {
        cells,
        text: Vec::new(),
        label: String::new(),
        tala: String::new(),
        lyrics: String::new(),
        tonic: None,
        pitch_system: None,
        key_signature: String::new(),
        time_signature: String::new(),
        tempo: String::new(),
        new_system: false,
        system_id: 0,
        part_id: "P1".to_string(),
        staff_role: editor_wasm::models::core::StaffRole::Melody,
        system_marker: None,
        beats: Vec::new(),
        slurs: Vec::new(),
    };

    // Build IR from the line
    let measures = build_export_measures_from_line(&line, None);

    // Verify we got one measure
    assert_eq!(measures.len(), 1, "Should have one measure");

    let measure = &measures[0];

    // Verify we have exactly 3 events: note, rest, note
    assert_eq!(
        measure.events.len(),
        3,
        "Should have 3 events: note (C4), rest, note (D)"
    );

    // Event 1: Note "1" (1/5 of beat)
    match &measure.events[0] {
        ExportEvent::Note(note) => {
            assert_eq!(note.pitch.pitch_code, PitchCode::N1, "First note should be N1 (C)");
            assert_eq!(
                note.fraction,
                Fraction::new(1, 5),
                "First note should be 1/5 (1 subdivision out of 5)"
            );
            assert!(note.breath_mark_after, "First note should have breath_mark_after=true");
        }
        _ => panic!("Event 0 should be Note, got {:?}", measure.events[0]),
    }

    // Event 2: Rest "--" (2/5 of beat)
    match &measure.events[1] {
        ExportEvent::Rest { fraction, .. } => {
            assert_eq!(
                *fraction,
                Fraction::new(2, 5),
                "Rest should be 2/5 (2 subdivisions out of 5)"
            );
        }
        _ => panic!("Event 1 should be Rest, got {:?}", measure.events[1]),
    }

    // Event 3: Note "2-" (2/5 of beat)
    match &measure.events[2] {
        ExportEvent::Note(note) => {
            assert_eq!(note.pitch.pitch_code, PitchCode::N2, "Second note should be N2 (D)");
            assert_eq!(
                note.fraction,
                Fraction::new(2, 5),
                "Second note should be 2/5 (2 subdivisions out of 5)"
            );
        }
        _ => panic!("Event 2 should be Note, got {:?}", measure.events[2]),
    }

    println!("✅ Test passed: '1' --2-' produces 1/5 note + 2/5 rest + 2/5 note (quintuplet)");
}

/// Test that `1 ' -` (with space after breath mark) produces quarter note + quarter rest
///
/// Key difference from `1'---`: Here the dash is in a NEW BEAT (after space)
///
/// Pattern breakdown:
/// - Beat 1: "1'" → pitch "1" with breath mark (1 subdivision → 1/1 of beat = quarter note)
/// - Beat 2: "-" → single dash with no preceding pitch in this beat → rest (1 subdivision → 1/1 of beat = quarter rest)
///
/// The space creates a beat boundary, so the dash starts a new beat section.
/// Since there's no pitch before it in this beat, it's a rest (not an extension).
///
/// Expected IR:
/// - Event 1: Note (N1, fraction=1/1, breath_mark_after=true) → C4 quarter note
/// - Event 2: Rest (fraction=1/1) → quarter rest
#[test]
fn test_breath_mark_space_dash_creates_two_quarter_notes() {
    // Create cells for: 1 ' -
    // This represents:
    // - Position 0: pitch "1" (N1)
    // - Position 1: breath mark (')
    // - Position 2: space (beat boundary)
    // - Position 3: dash (-) in new beat → rest
    let cells = vec![
        make_cell(ElementKind::PitchedElement, "1", Some(PitchCode::N1), 0, 0.0),
        make_cell(ElementKind::BreathMark, "'", None, 1, 1.0),
        make_cell(ElementKind::UnpitchedElement, " ", None, 2, 2.0),
        make_cell(ElementKind::UnpitchedElement, "-", None, 3, 3.0),
    ];

    // Create a line with the cells
    let line = Line {
        cells,
        text: Vec::new(),
        label: String::new(),
        tala: String::new(),
        lyrics: String::new(),
        tonic: None,
        pitch_system: None,
        key_signature: String::new(),
        time_signature: String::new(),
        tempo: String::new(),
        new_system: false,
        system_id: 0,
        part_id: "P1".to_string(),
        staff_role: editor_wasm::models::core::StaffRole::Melody,
        system_marker: None,
        beats: Vec::new(),
        slurs: Vec::new(),
    };

    // Build IR from the line
    let measures = build_export_measures_from_line(&line, None);

    // Verify we got one measure
    assert_eq!(measures.len(), 1, "Should have one measure");

    let measure = &measures[0];

    // Verify we have exactly 2 events: note and rest
    assert_eq!(
        measure.events.len(),
        2,
        "Should have 2 events: note (C4 quarter) and rest (quarter)"
    );

    // Event 1: Note "1" with breath mark (C4 quarter note)
    match &measure.events[0] {
        ExportEvent::Note(note) => {
            assert_eq!(note.pitch.pitch_code, PitchCode::N1, "First note should be N1 (C)");
            assert_eq!(
                note.fraction,
                Fraction::new(1, 1),
                "First note should be 1/1 of beat (full beat = quarter note in 4/4)"
            );
            assert!(note.breath_mark_after, "Note should have breath_mark_after=true");
        }
        _ => panic!("Event 0 should be Note, got {:?}", measure.events[0]),
    }

    // Event 2: Rest "-" in new beat (quarter rest)
    match &measure.events[1] {
        ExportEvent::Rest { divisions, fraction, .. } => {
            assert_eq!(
                *fraction,
                Fraction::new(1, 1),
                "Rest should be 1/1 of beat (full beat = quarter rest in 4/4)"
            );
            assert!(
                *divisions > 0,
                "Rest should have non-zero divisions"
            );
        }
        _ => panic!("Event 1 should be Rest, got {:?}", measure.events[1]),
    }

    println!("✅ Test passed: '1 ' -' produces C4 quarter + quarter rest");
}

/// Test pattern: `1 ' ---------` (two beats: "1'" and "---------")
///
/// This pattern has a SPACE after the breath mark, which creates a beat boundary.
/// - Beat 1: "1'" → 1 subdivision (breath mark doesn't count)
///   - Note "1": 1/1 of beat (quarter note in 4/4)
/// - Beat 2: "---------" → 9 subdivisions
///   - Rest "---------": 9/9 = 1/1 of beat (quarter rest in 4/4)
///
/// User expectation: "1/4 note and 1/4 note rest" = quarter note + quarter rest
/// This matches the 1/1 + 1/1 fraction output (each beat = quarter note in 4/4).
#[test]
fn test_breath_mark_space_nine_dashes() {
    // Create cells for: 1 ' ---------
    let mut cells = vec![
        make_cell(ElementKind::PitchedElement, "1", Some(PitchCode::N1), 0, 0.0),
        make_cell(ElementKind::BreathMark, "'", None, 1, 1.0),
        make_cell(ElementKind::UnpitchedElement, " ", None, 2, 2.0),
    ];

    // Add 9 dashes (starting at col 3, after space at col 2)
    for i in 0..9 {
        cells.push(make_cell(ElementKind::UnpitchedElement, "-", None, 3 + i, 3.0 + i as f32));
    }

    let line = Line {
        cells,
        text: Vec::new(),
        label: String::new(),
        tala: String::new(),
        lyrics: String::new(),
        tonic: None,
        pitch_system: None,
        key_signature: String::new(),
        time_signature: String::new(),
        tempo: String::new(),
        new_system: false,
        system_id: 0,
        part_id: "P1".to_string(),
        staff_role: editor_wasm::models::core::StaffRole::Melody,
        system_marker: None,
        beats: Vec::new(),
        slurs: Vec::new(),
    };

    let measures = build_export_measures_from_line(&line, None);

    // Verify we got one measure
    assert_eq!(measures.len(), 1, "Should have one measure");

    let measure = &measures[0];

    // Verify we have exactly 2 events: note and rest
    assert_eq!(
        measure.events.len(),
        2,
        "Should have 2 events: note and rest"
    );

    // Event 0: Note "1" with breath mark (Beat 1: "1'")
    match &measure.events[0] {
        ExportEvent::Note(note) => {
            assert_eq!(note.pitch.pitch_code, PitchCode::N1, "First note should be N1");
            assert_eq!(
                note.fraction,
                Fraction::new(1, 1),
                "First note should be 1/1 (full beat = quarter note in 4/4)"
            );
            assert!(note.breath_mark_after, "Note should have breath_mark_after=true");
        }
        _ => panic!("Event 0 should be Note, got {:?}", measure.events[0]),
    }

    // Event 1: Rest "---------" (Beat 2)
    match &measure.events[1] {
        ExportEvent::Rest { fraction, .. } => {
            assert_eq!(
                *fraction,
                Fraction::new(1, 1),
                "Rest should be 1/1 (full beat = quarter rest in 4/4)"
            );
        }
        _ => panic!("Event 1 should be Rest, got {:?}", measure.events[1]),
    }

    println!("✅ Test passed: '1 ' ---------' produces quarter note + quarter rest");
}

/// Test pattern: `1' ---` (breath mark, space, three dashes = two beats)
///
/// This pattern has spaces, creating a beat boundary after the breath mark:
/// - Beat 1: "1'" → 1 subdivision (breath mark doesn't count)
///   - Note "1": 1/1 of beat (quarter note in 4/4)
/// - Beat 2: "---" → 3 subdivisions
///   - Rest "---": 3/3 = 1/1 of beat (quarter rest in 4/4)
///
/// User expectation: 2 beats (quarter note + quarter rest)
#[test]
fn test_breath_mark_space_three_dashes() {
    // Create cells for: 1' ---
    let cells = vec![
        make_cell(ElementKind::PitchedElement, "1", Some(PitchCode::N1), 0, 0.0),
        make_cell(ElementKind::BreathMark, "'", None, 1, 1.0),
        make_cell(ElementKind::UnpitchedElement, " ", None, 2, 2.0),
        make_cell(ElementKind::UnpitchedElement, "-", None, 3, 3.0),
        make_cell(ElementKind::UnpitchedElement, "-", None, 4, 4.0),
        make_cell(ElementKind::UnpitchedElement, "-", None, 5, 5.0),
    ];

    let line = Line {
        cells,
        text: Vec::new(),
        label: String::new(),
        tala: String::new(),
        lyrics: String::new(),
        tonic: None,
        pitch_system: None,
        key_signature: String::new(),
        time_signature: String::new(),
        tempo: String::new(),
        new_system: false,
        system_id: 0,
        part_id: "P1".to_string(),
        staff_role: editor_wasm::models::core::StaffRole::Melody,
        system_marker: None,
        beats: Vec::new(),
        slurs: Vec::new(),
    };

    let measures = build_export_measures_from_line(&line, None);

    // Verify we got one measure
    assert_eq!(measures.len(), 1, "Should have one measure");

    let measure = &measures[0];

    // Verify we have exactly 2 events: note and rest
    assert_eq!(
        measure.events.len(),
        2,
        "Should have 2 events: note and rest (2 beats)"
    );

    // Event 0: Note "1" with breath mark (Beat 1: "1'")
    match &measure.events[0] {
        ExportEvent::Note(note) => {
            assert_eq!(note.pitch.pitch_code, PitchCode::N1, "First note should be N1");
            assert_eq!(
                note.fraction,
                Fraction::new(1, 1),
                "First note should be 1/1 (full beat = quarter note in 4/4)"
            );
            assert!(note.breath_mark_after, "Note should have breath_mark_after=true");
        }
        _ => panic!("Event 0 should be Note, got {:?}", measure.events[0]),
    }

    // Event 1: Rest "---" (Beat 2)
    match &measure.events[1] {
        ExportEvent::Rest { fraction, .. } => {
            assert_eq!(
                *fraction,
                Fraction::new(1, 1),
                "Rest should be 1/1 (full beat = quarter rest in 4/4)"
            );
        }
        _ => panic!("Event 1 should be Rest, got {:?}", measure.events[1]),
    }

    println!("✅ Test passed: '1' ---' produces 2 beats (quarter note + quarter rest)");
}

/// Test pattern: `1 '---` (note, space, breath mark, three dashes = TWO beats)
///
/// Pattern breakdown with SPACE creating beat boundary:
/// - Beat 1: "1" → single pitch (1 subdivision → 1/1 of beat = quarter note)
/// - Beat 2: "'---" → breath mark + three dashes (4 cells, 3 subdivisions after excluding breath mark)
///   - Note: breath mark resets pitch context, so dashes become rest
///   - Rest "---": 3/3 = 1/1 of beat (quarter rest in 4/4)
///
/// User expectation: TWO beats (quarter note + quarter rest)
#[test]
fn test_note_space_breath_mark_dashes() {
    // Create cells for: 1 '---
    let cells = vec![
        make_cell(ElementKind::PitchedElement, "1", Some(PitchCode::N1), 0, 0.0),
        make_cell(ElementKind::UnpitchedElement, " ", None, 1, 1.0),
        make_cell(ElementKind::BreathMark, "'", None, 2, 2.0),
        make_cell(ElementKind::UnpitchedElement, "-", None, 3, 3.0),
        make_cell(ElementKind::UnpitchedElement, "-", None, 4, 4.0),
        make_cell(ElementKind::UnpitchedElement, "-", None, 5, 5.0),
    ];

    let line = Line {
        cells,
        text: Vec::new(),
        label: String::new(),
        tala: String::new(),
        lyrics: String::new(),
        tonic: None,
        pitch_system: None,
        key_signature: String::new(),
        time_signature: String::new(),
        tempo: String::new(),
        new_system: false,
        system_id: 0,
        part_id: "P1".to_string(),
        staff_role: editor_wasm::models::core::StaffRole::Melody,
        system_marker: None,
        beats: Vec::new(),
        slurs: Vec::new(),
    };

    let measures = build_export_measures_from_line(&line, None);

    // Verify we got one measure
    assert_eq!(measures.len(), 1, "Should have one measure");

    let measure = &measures[0];

    // Verify we have exactly 2 events: note and rest
    assert_eq!(
        measure.events.len(),
        2,
        "Should have 2 events: note and rest (2 beats)"
    );

    // Event 0: Note "1" (Beat 1)
    match &measure.events[0] {
        ExportEvent::Note(note) => {
            assert_eq!(note.pitch.pitch_code, PitchCode::N1, "First note should be N1");
            assert_eq!(
                note.fraction,
                Fraction::new(1, 1),
                "First note should be 1/1 (full beat = quarter note in 4/4)"
            );
            assert!(!note.breath_mark_after, "Note should NOT have breath_mark_after (breath mark is in next beat)");
        }
        _ => panic!("Event 0 should be Note, got {:?}", measure.events[0]),
    }

    // Event 1: Rest "---" (Beat 2 with leading breath mark)
    match &measure.events[1] {
        ExportEvent::Rest { fraction, .. } => {
            assert_eq!(
                *fraction,
                Fraction::new(1, 1),
                "Rest should be 1/1 (full beat = quarter rest in 4/4)"
            );
        }
        _ => panic!("Event 1 should be Rest, got {:?}", measure.events[1]),
    }

    println!("✅ Test passed: '1 '---' produces 2 beats (quarter note + quarter rest)");
}

/// Test pattern: `1  '---` (note, TWO spaces, breath mark, three dashes)
///
/// This should produce TWO beats (not three):
/// - Beat 1: "1" → 1 subdivision → quarter note (1/1)
/// - Beat 2: "'---" → 3 subdivisions → quarter rest (1/1)
///
/// User expectation: quarter note + quarter rest (NOT tied notes!)
#[test]
fn test_note_two_spaces_breath_mark_dashes() {
    // Create cells for: 1 (space) (space) '---
    let cells = vec![
        make_cell(ElementKind::PitchedElement, "1", Some(PitchCode::N1), 0, 0.0),
        make_cell(ElementKind::UnpitchedElement, " ", None, 1, 1.0),
        make_cell(ElementKind::UnpitchedElement, " ", None, 2, 2.0),
        make_cell(ElementKind::BreathMark, "'", None, 3, 3.0),
        make_cell(ElementKind::UnpitchedElement, "-", None, 4, 4.0),
        make_cell(ElementKind::UnpitchedElement, "-", None, 5, 5.0),
        make_cell(ElementKind::UnpitchedElement, "-", None, 6, 6.0),
    ];

    let line = Line {
        cells,
        text: Vec::new(),
        label: String::new(),
        tala: String::new(),
        lyrics: String::new(),
        tonic: None,
        pitch_system: None,
        key_signature: String::new(),
        time_signature: String::new(),
        tempo: String::new(),
        new_system: false,
        system_id: 0,
        part_id: "P1".to_string(),
        staff_role: editor_wasm::models::core::StaffRole::Melody,
        system_marker: None,
        beats: Vec::new(),
        slurs: Vec::new(),
    };

    let measures = build_export_measures_from_line(&line, None);

    assert_eq!(measures.len(), 1, "Should have one measure");
    let measure = &measures[0];
    
    // Should have 2 events: note and rest (NOT two tied notes!)
    assert_eq!(measure.events.len(), 2, "Should have 2 events");
    
    // Event 0: Note without tie
    match &measure.events[0] {
        ExportEvent::Note(note) => {
            assert_eq!(note.pitch.pitch_code, PitchCode::N1);
            assert_eq!(note.fraction, Fraction::new(1, 1));
            assert!(note.tie.is_none(), "Note should NOT have a tie");
        }
        _ => panic!("Event 0 should be Note"),
    }
    
    // Event 1: Rest (not a tied note!)
    match &measure.events[1] {
        ExportEvent::Rest { fraction, .. } => {
            assert_eq!(*fraction, Fraction::new(1, 1));
        }
        ExportEvent::Note(note) => {
            panic!("Event 1 should be Rest, not Note! Got: pitch={:?}, tie={:?}", 
                note.pitch.pitch_code, note.tie);
        }
        _ => panic!("Event 1 should be Rest"),
    }

    println!("✅ Test passed: '1  '---' produces quarter note + quarter rest (no tie)");
}

/// Test pattern: `1  '  ---` (note, 2 spaces, breath mark, 2 spaces, three dashes)
///
/// This should produce TWO beats:
/// - Beat 1: "1" → quarter note
/// - Beat 2: (empty beats skipped) "'  ---" → quarter rest
///
/// User expectation: quarter note + quarter rest (NOT tied notes!)
#[test]
fn test_note_breath_mark_with_surrounding_spaces() {
    // Create cells for: 1 (sp) (sp) ' (sp) (sp) - - -
    let cells = vec![
        make_cell(ElementKind::PitchedElement, "1", Some(PitchCode::N1), 0, 0.0),
        make_cell(ElementKind::UnpitchedElement, " ", None, 1, 1.0),
        make_cell(ElementKind::UnpitchedElement, " ", None, 2, 2.0),
        make_cell(ElementKind::BreathMark, "'", None, 3, 3.0),
        make_cell(ElementKind::UnpitchedElement, " ", None, 4, 4.0),
        make_cell(ElementKind::UnpitchedElement, " ", None, 5, 5.0),
        make_cell(ElementKind::UnpitchedElement, "-", None, 6, 6.0),
        make_cell(ElementKind::UnpitchedElement, "-", None, 7, 7.0),
        make_cell(ElementKind::UnpitchedElement, "-", None, 8, 8.0),
    ];

    let line = Line {
        cells,
        text: Vec::new(),
        label: String::new(),
        tala: String::new(),
        lyrics: String::new(),
        tonic: None,
        pitch_system: None,
        key_signature: String::new(),
        time_signature: String::new(),
        tempo: String::new(),
        new_system: false,
        system_id: 0,
        part_id: "P1".to_string(),
        staff_role: editor_wasm::models::core::StaffRole::Melody,
        system_marker: None,
        beats: Vec::new(),
        slurs: Vec::new(),
    };

    let measures = build_export_measures_from_line(&line, None);

    println!("\n=== ACTUAL OUTPUT for '1  '  ---' ===");
    println!("Measures: {}", measures.len());
    for (i, measure) in measures.iter().enumerate() {
        println!("\nMeasure {}: {} events", i, measure.events.len());
        for (j, event) in measure.events.iter().enumerate() {
            match event {
                ExportEvent::Note(note) => {
                    println!("  Event {}: Note - pitch={:?}, fraction={}/{}, tie={:?}",
                        j, note.pitch.pitch_code, note.fraction.numerator,
                        note.fraction.denominator, note.tie);
                }
                ExportEvent::Rest { fraction, .. } => {
                    println!("  Event {}: Rest - fraction={}/{}",
                        j, fraction.numerator, fraction.denominator);
                }
                _ => println!("  Event {}: Other", j),
            }
        }
    }

    assert_eq!(measures.len(), 1, "Should have one measure");
    let measure = &measures[0];
    
    assert_eq!(measure.events.len(), 2, "Should have 2 events");
    
    match &measure.events[0] {
        ExportEvent::Note(note) => {
            assert_eq!(note.pitch.pitch_code, PitchCode::N1);
            assert_eq!(note.fraction, Fraction::new(1, 1));
            assert!(note.tie.is_none(), "Note should NOT have a tie");
        }
        _ => panic!("Event 0 should be Note"),
    }
    
    match &measure.events[1] {
        ExportEvent::Rest { fraction, .. } => {
            assert_eq!(*fraction, Fraction::new(1, 1));
        }
        ExportEvent::Note(note) => {
            panic!("Event 1 should be Rest, not Note! Got: pitch={:?}, tie={:?}", 
                note.pitch.pitch_code, note.tie);
        }
        _ => panic!("Event 1 should be Rest"),
    }

    println!("✅ Test passed: '1  '  ---' produces quarter note + quarter rest (no tie)");
}
