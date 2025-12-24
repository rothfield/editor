// Test measurization layer for polyphonic MusicXML alignment

use editor_wasm::models::{Cell, Document, ElementKind, Line, PitchCode};
use editor_wasm::models::elements::PitchSystem;
use editor_wasm::renderers::musicxml::to_musicxml_polyphonic;
use editor_wasm::ir::{build_export_measures_from_document, measurize_export_lines};
use editor_wasm::renderers::font_utils::glyph_for_pitch;

/// Helper to create a pitched cell (space-separated beats are quarters)
fn make_pitched_cell(pitch_code: PitchCode) -> Cell {
    if let Some(glyph) = glyph_for_pitch(pitch_code, 0, PitchSystem::Number) {
        Cell::from_codepoint(glyph as u32, ElementKind::PitchedElement)
    } else {
        Cell::new("1".to_string(), ElementKind::PitchedElement)
    }
}

/// Helper to create a space cell
fn make_space_cell() -> Cell {
    Cell::new(" ".to_string(), ElementKind::UnpitchedElement)
}

/// Helper to create a test line with notes
fn make_test_line(pitches: &[PitchCode]) -> Line {
    let mut line = Line::new();
    for (i, &pitch) in pitches.iter().enumerate() {
        if i > 0 {
            line.cells.push(make_space_cell());
        }
        line.cells.push(make_pitched_cell(pitch));
    }
    line.sync_text_from_cells();
    line
}

/// Helper to create a document with multiple lines
fn create_test_document(lines_pitches: Vec<Vec<PitchCode>>) -> Document {
    let mut doc = Document::new();

    for pitches in lines_pitches.iter() {
        let line = make_test_line(pitches);
        doc.add_line(line);
    }

    doc
}

/// Helper to set up a multi-staff system
fn setup_system(doc: &mut Document, start_line: usize, count: usize) {
    if count > 0 && start_line < doc.lines.len() {
        doc.lines[start_line].system_start_count = Some(count);
    }
    // Recalculate system IDs
    doc.recalculate_system_and_part_ids();
}

#[test]
fn test_measurization_equal_beats() {
    // Two parts with equal beats should have same measure count
    let mut doc = create_test_document(vec![
        vec![PitchCode::N1, PitchCode::N2, PitchCode::N3, PitchCode::N4],
        vec![PitchCode::N5, PitchCode::N6, PitchCode::N7, PitchCode::N1],
    ]);

    // Set up as 2-staff system
    setup_system(&mut doc, 0, 2);

    // Export with polyphonic alignment
    let musicxml = to_musicxml_polyphonic(&doc).expect("Export should succeed");

    // Both parts should exist
    assert!(musicxml.contains("<part id=\"P1\">"), "P1 should exist");
    assert!(musicxml.contains("<part id=\"P2\">"), "P2 should exist");

    // Count measures in each part
    let _p1_measures = musicxml.matches("<measure").count();
    // Since both parts should have the same content length, they should be aligned

    println!("MusicXML:\n{}", musicxml);
}

#[test]
fn test_measurization_unequal_beats_padding() {
    // Shorter part should be padded with rests
    let mut doc = create_test_document(vec![
        vec![PitchCode::N1, PitchCode::N2, PitchCode::N3, PitchCode::N4],
        vec![PitchCode::N5, PitchCode::N6], // Only 2 beats
    ]);

    // Set up as 2-staff system
    setup_system(&mut doc, 0, 2);

    // Build IR and measurize
    let export_lines = build_export_measures_from_document(&doc);
    let measurized = measurize_export_lines(export_lines, 4, None);

    // Both parts should have same number of bars
    assert_eq!(measurized.len(), 2, "Should have 2 parts");
    assert_eq!(
        measurized[0].bars.len(),
        measurized[1].bars.len(),
        "Both parts should have same bar count"
    );

    // P2 (shorter) should have padding events
    let p2_total_events: usize = measurized[1].bars.iter()
        .map(|b| b.events.len())
        .sum();
    assert!(p2_total_events > 2, "P2 should have more than 2 events (including padding)");
}

#[test]
fn test_measurization_bar_boundary_rounding() {
    // 6 beats (1.5 bars) should round up to 2 bars
    let mut doc = create_test_document(vec![
        vec![PitchCode::N1, PitchCode::N2, PitchCode::N3, PitchCode::N4, PitchCode::N5, PitchCode::N6],
        vec![PitchCode::N1, PitchCode::N2, PitchCode::N3, PitchCode::N4],
    ]);

    // Set up as 2-staff system
    setup_system(&mut doc, 0, 2);

    // Build IR and measurize
    let export_lines = build_export_measures_from_document(&doc);
    let measurized = measurize_export_lines(export_lines, 4, None);

    // P1 has 6 beats = 1.5 bars, should round to 2 bars
    // P2 has 4 beats = 1 bar, should be padded to 2 bars
    assert_eq!(measurized.len(), 2, "Should have 2 parts");
    assert_eq!(
        measurized[0].bars.len(),
        measurized[1].bars.len(),
        "Both parts should have same bar count"
    );
    assert!(measurized[0].bars.len() >= 2, "Should have at least 2 bars");
}

#[test]
fn test_measurization_preserves_part_order() {
    // Parts should maintain document order
    let mut doc = create_test_document(vec![
        vec![PitchCode::N1, PitchCode::N2, PitchCode::N3, PitchCode::N4],
        vec![PitchCode::N5, PitchCode::N6, PitchCode::N7, PitchCode::N1],
        vec![PitchCode::N1, PitchCode::N3, PitchCode::N5, PitchCode::N7],
        vec![PitchCode::N2, PitchCode::N4, PitchCode::N6, PitchCode::N1],
    ]);

    // Set up as 4-staff system
    setup_system(&mut doc, 0, 4);

    // Build IR and measurize
    let export_lines = build_export_measures_from_document(&doc);
    let measurized = measurize_export_lines(export_lines, 4, None);

    assert_eq!(measurized.len(), 4, "Should have 4 parts");
    assert_eq!(measurized[0].part_id, "P1");
    assert_eq!(measurized[1].part_id, "P2");
    assert_eq!(measurized[2].part_id, "P3");
    assert_eq!(measurized[3].part_id, "P4");
}

#[test]
fn test_polyphonic_musicxml_has_equal_measures() {
    // Full pipeline test: polyphonic MusicXML should have equal measures per part
    let mut doc = create_test_document(vec![
        vec![PitchCode::N1, PitchCode::N2, PitchCode::N3, PitchCode::N4],  // 4 beats
        vec![PitchCode::N5, PitchCode::N6, PitchCode::N7, PitchCode::N1],  // 4 beats
        vec![PitchCode::N3, PitchCode::N4, PitchCode::N5, PitchCode::N6],  // 4 beats
        vec![PitchCode::N1, PitchCode::N2, PitchCode::N3],                  // 3 beats - shorter!
    ]);

    // Set up as 4-staff system
    setup_system(&mut doc, 0, 4);

    // Export with polyphonic alignment
    let musicxml = to_musicxml_polyphonic(&doc).expect("Export should succeed");

    // Extract each part
    let parts: Vec<_> = ["P1", "P2", "P3", "P4"]
        .iter()
        .filter_map(|id| {
            let pattern = format!("<part id=\"{}\">", id);
            let start = musicxml.find(&pattern)?;
            let end = musicxml[start..].find("</part>")? + start + 7;
            Some(&musicxml[start..end])
        })
        .collect();

    assert_eq!(parts.len(), 4, "Should find all 4 parts");

    // Count measures in each part
    let measure_counts: Vec<_> = parts.iter()
        .map(|p| p.matches("<measure").count())
        .collect();

    println!("Measure counts: {:?}", measure_counts);

    // All parts should have the same number of measures
    let first_count = measure_counts[0];
    for (i, count) in measure_counts.iter().enumerate() {
        assert_eq!(
            *count, first_count,
            "Part P{} has {} measures, expected {} (same as P1)",
            i + 1, count, first_count
        );
    }
}

#[test]
fn test_measurization_global_divisions_lcm() {
    // Test that global divisions is LCM of all measure divisions
    use editor_wasm::ir::{ExportLine, ExportMeasure, ExportEvent, NoteData, PitchInfo, Fraction};
    use editor_wasm::models::core::StaffRole;

    // Create lines with different divisions
    let lines = vec![
        ExportLine {
            system_id: 1,
            part_id: "P1".to_string(),
            staff_role: StaffRole::Melody,
            key_signature: None,
            time_signature: Some("4/4".to_string()),
            clef: "treble".to_string(),
            label: String::new(),
            show_bracket: true,
            measures: vec![ExportMeasure {
                divisions: 4,
                events: vec![ExportEvent::Note(NoteData {
                    pitch: PitchInfo::new(PitchCode::N1, 4),
                    divisions: 4,
                    fraction: Fraction::new(1, 1),
                    grace_notes_before: vec![],
                    grace_notes_after: vec![],
                    lyrics: None,
                    slur: None,
                    articulations: vec![],
                    beam: None,
                    tie: None,
                    tuplet: None,
                    breath_mark_after: false,
                })],
            }],
            lyrics: String::new(),
        },
        ExportLine {
            system_id: 1,
            part_id: "P2".to_string(),
            staff_role: StaffRole::Melody,
            key_signature: None,
            time_signature: Some("4/4".to_string()),
            clef: "treble".to_string(),
            label: String::new(),
            show_bracket: true,
            measures: vec![ExportMeasure {
                divisions: 3, // Different divisions
                events: vec![ExportEvent::Note(NoteData {
                    pitch: PitchInfo::new(PitchCode::N5, 4),
                    divisions: 3,
                    fraction: Fraction::new(1, 1),
                    grace_notes_before: vec![],
                    grace_notes_after: vec![],
                    lyrics: None,
                    slur: None,
                    articulations: vec![],
                    beam: None,
                    tie: None,
                    tuplet: None,
                    breath_mark_after: false,
                })],
            }],
            lyrics: String::new(),
        },
    ];

    let measurized = measurize_export_lines(lines, 4, None);

    // Global divisions should be LCM(4, 3) = 12
    assert_eq!(measurized[0].global_divisions, 12);
    assert_eq!(measurized[1].global_divisions, 12);
}

#[test]
fn test_four_voice_plus_one_continuation() {
    // ============================================================================
    // SYSTEM CONTINUATION MODEL TEST
    // ============================================================================
    // A second system CONTINUES the first system.
    // Line 4 (standalone, position 1 in system 2) gets P1, continuing P1 from system 1.
    //
    // Expected result:
    //   P1: measures from Line 0 + measures from Line 4 (concatenated)
    //   P2: measures from Line 1 only (padded)
    //   P3: measures from Line 2 only (padded)
    //   P4: measures from Line 3 only (padded)
    // ============================================================================
    let mut doc = create_test_document(vec![
        vec![PitchCode::N1, PitchCode::N2, PitchCode::N3, PitchCode::N4],  // System 1, P1
        vec![PitchCode::N2, PitchCode::N3, PitchCode::N4, PitchCode::N5],  // System 1, P2
        vec![PitchCode::N3, PitchCode::N4, PitchCode::N5, PitchCode::N6],  // System 1, P3
        vec![PitchCode::N4, PitchCode::N5, PitchCode::N6, PitchCode::N7],  // System 1, P4
        vec![PitchCode::N5, PitchCode::N6, PitchCode::N7, PitchCode::N1],  // System 2, P1 (continuation!)
    ]);

    // Set up 4-voice system on lines 0-3 (line 4 is standalone = new system)
    setup_system(&mut doc, 0, 4);

    // Part IDs are POSITION-BASED within each system
    assert_eq!(doc.lines[0].part_id, "P1", "Line 0 should be P1 (position 1 in system 1)");
    assert_eq!(doc.lines[1].part_id, "P2", "Line 1 should be P2 (position 2 in system 1)");
    assert_eq!(doc.lines[2].part_id, "P3", "Line 2 should be P3 (position 3 in system 1)");
    assert_eq!(doc.lines[3].part_id, "P4", "Line 3 should be P4 (position 4 in system 1)");
    assert_eq!(doc.lines[4].part_id, "P1", "Line 4 should be P1 (position 1 in system 2) - CONTINUES P1!");

    // System IDs: first 4 lines same system, 5th is separate system
    assert_eq!(doc.lines[0].system_id, 1);
    assert_eq!(doc.lines[1].system_id, 1);
    assert_eq!(doc.lines[2].system_id, 1);
    assert_eq!(doc.lines[3].system_id, 1);
    assert_eq!(doc.lines[4].system_id, 2);

    // Export with polyphonic alignment
    let musicxml = to_musicxml_polyphonic(&doc).expect("Export should succeed");

    // Should have exactly 4 parts (P1-P4), with P1 containing concatenated measures
    assert!(musicxml.contains("<part id=\"P1\">"), "Should have P1");
    assert!(musicxml.contains("<part id=\"P2\">"), "Should have P2");
    assert!(musicxml.contains("<part id=\"P3\">"), "Should have P3");
    assert!(musicxml.contains("<part id=\"P4\">"), "Should have P4");

    // Count total parts - should be exactly 4 (not 5!)
    let part_count = musicxml.matches("<part id=").count();
    assert_eq!(part_count, 4, "Should have exactly 4 parts (P1 has concatenated measures)");

    // P1 should have 2 measures (from line 0 + line 4)
    let p1_part = musicxml.split("<part id=\"P1\">").nth(1)
        .and_then(|s| s.split("</part>").next())
        .unwrap_or("");
    let p1_measures = p1_part.matches("<measure").count();
    assert_eq!(p1_measures, 2, "P1 should have 2 measures (concatenated from 2 systems)");

    // P2, P3, P4 should also have 2 measures (1 real + 1 padded rest)
    for (part_id, expected_measures) in [("P2", 2), ("P3", 2), ("P4", 2)] {
        let part = musicxml.split(&format!("<part id=\"{}\">", part_id)).nth(1)
            .and_then(|s| s.split("</part>").next())
            .unwrap_or("");
        let measure_count = part.matches("<measure").count();
        assert_eq!(measure_count, expected_measures,
            "{} should have {} measures (padded to match P1)", part_id, expected_measures);
    }

    println!("MusicXML has {} parts, P1 has {} measures", part_count, p1_measures);
}
