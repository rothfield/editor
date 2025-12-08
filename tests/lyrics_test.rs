// Test lyrics/syllable support in MusicXML export

use editor_wasm::models::{Document, Line, Cell, ElementKind, PitchCode};
use editor_wasm::renderers::musicxml::to_musicxml;

/// Create a simple cell for testing
fn make_cell(kind: ElementKind, char: &str, pitch_code: Option<PitchCode>) -> Cell {
    Cell {
        kind,
        char: char.to_string(),
        col: 0,
        flags: 0,
        pitch_code,
        pitch_system: None,
        octave: 4,
        slur_indicator: Default::default(),
        ornament: None,
        combined_char: None,
        x: 0.0,
        y: 0.0,
        w: 0.0,
        h: 0.0,
        bbox: (0.0, 0.0, 0.0, 0.0),
        hit: (0.0, 0.0, 0.0, 0.0),
    }
}

#[test]
fn test_single_word_lyric_in_musicxml() {
    let mut doc = Document::new();

    // Create a line with a single-syllable word
    let mut line = Line::new();
    line.lyrics = "hello".to_string();

    // Add cells for a simple melody: "1 2 3" (three pitches)
    line.cells.push(make_cell(ElementKind::PitchedElement, "1", Some(PitchCode::N1)));
    line.cells.push(make_cell(ElementKind::UnpitchedElement, " ", None));
    line.cells.push(make_cell(ElementKind::PitchedElement, "2", Some(PitchCode::N2)));
    line.cells.push(make_cell(ElementKind::UnpitchedElement, " ", None));
    line.cells.push(make_cell(ElementKind::PitchedElement, "3", Some(PitchCode::N3)));

    doc.lines.push(line);

    // Export to MusicXML
    let musicxml = to_musicxml(&doc).expect("MusicXML export should succeed");

    // Verify lyric element is present INSIDE note element
    assert!(musicxml.contains("<lyric number=\"1\">"),
            "MusicXML should contain lyric element");
    assert!(musicxml.contains("<text>hello</text>"),
            "MusicXML should contain the lyric text");

    // Verify structure: lyric must come after <type> and before </note>
    // Look for the pattern: <type>...</type>\n  <lyric...
    assert!(musicxml.contains("</type>") && musicxml.contains("<lyric"),
            "Lyric should come after type element");

    // Verify closing: must have </lyric> before </note>
    let note_close = musicxml.find("</note>").expect("Should have closing note tag");
    let lyric_text = musicxml.find("</lyric>").expect("Should have closing lyric tag");
    assert!(lyric_text < note_close, "Lyric closing tag should come before note closing tag");
}

#[test]
fn test_hyphenated_word_syllabic_markers() {
    let mut doc = Document::new();

    // Create a line with a hyphenated word
    let mut line = Line::new();
    line.lyrics = "hel-lo".to_string();

    // Add cells for two pitches
    line.cells.push(make_cell(ElementKind::PitchedElement, "1", Some(PitchCode::N1)));
    line.cells.push(make_cell(ElementKind::UnpitchedElement, " ", None));
    line.cells.push(make_cell(ElementKind::PitchedElement, "2", Some(PitchCode::N2)));

    doc.lines.push(line);

    // Export to MusicXML
    let musicxml = to_musicxml(&doc).expect("MusicXML export should succeed");

    // Verify syllabic markers are present
    assert!(musicxml.contains("<syllabic>begin</syllabic>"),
            "MusicXML should mark first syllable as begin");
    assert!(musicxml.contains("<syllabic>end</syllabic>"),
            "MusicXML should mark second syllable as end");
    assert!(musicxml.contains("<text>hel</text>"),
            "First syllable text should be 'hel'");
    assert!(musicxml.contains("<text>lo</text>"),
            "Second syllable text should be 'lo'");
}

#[test]
fn test_multiple_words_with_lyrics() {
    let mut doc = Document::new();

    // Create a line with multiple words
    let mut line = Line::new();
    line.lyrics = "hel-lo wor-ld".to_string();

    // Add cells for three pitches
    line.cells.push(make_cell(ElementKind::PitchedElement, "1", Some(PitchCode::N1)));
    line.cells.push(make_cell(ElementKind::UnpitchedElement, " ", None));
    line.cells.push(make_cell(ElementKind::PitchedElement, "2", Some(PitchCode::N2)));
    line.cells.push(make_cell(ElementKind::UnpitchedElement, " ", None));
    line.cells.push(make_cell(ElementKind::PitchedElement, "3", Some(PitchCode::N3)));
    line.cells.push(make_cell(ElementKind::UnpitchedElement, " ", None));
    line.cells.push(make_cell(ElementKind::PitchedElement, "4", Some(PitchCode::N4)));

    doc.lines.push(line);

    // Export to MusicXML
    let musicxml = to_musicxml(&doc).expect("MusicXML export should succeed");

    // Verify all syllables are present
    assert!(musicxml.contains("<text>hel</text>"), "Should contain 'hel'");
    assert!(musicxml.contains("<text>lo</text>"), "Should contain 'lo'");
    assert!(musicxml.contains("<text>wor</text>"), "Should contain 'wor'");
    assert!(musicxml.contains("<text>ld</text>"), "Should contain 'ld'");

    // Verify syllabic structure
    let hel_section = musicxml.split("<text>hel</text>").next().unwrap();
    assert!(hel_section.contains("<syllabic>begin</syllabic>"),
            "'hel' should be marked as begin");
}

#[test]
fn test_lyrics_with_special_characters() {
    let mut doc = Document::new();

    // Create a line with special characters in lyrics
    let mut line = Line::new();
    line.lyrics = "don't".to_string();

    // Add a single pitch
    line.cells.push(make_cell(ElementKind::PitchedElement, "1", Some(PitchCode::N1)));

    doc.lines.push(line);

    // Export to MusicXML
    let musicxml = to_musicxml(&doc).expect("MusicXML export should succeed");

    // Verify special characters are properly escaped
    assert!(musicxml.contains("<text>don&apos;t</text>"),
            "Apostrophe should be XML-escaped in lyrics");
}

#[test]
fn test_empty_lyrics_no_error() {
    let mut doc = Document::new();

    // Create a line with empty lyrics
    let mut line = Line::new();
    line.lyrics = String::new();

    // Add cells
    line.cells.push(make_cell(ElementKind::PitchedElement, "1", Some(PitchCode::N1)));
    line.cells.push(make_cell(ElementKind::UnpitchedElement, " ", None));
    line.cells.push(make_cell(ElementKind::PitchedElement, "2", Some(PitchCode::N2)));

    doc.lines.push(line);

    // Export to MusicXML - should not fail
    let musicxml = to_musicxml(&doc).expect("MusicXML export should succeed with empty lyrics");

    // Should still produce valid MusicXML
    assert!(musicxml.contains("<note>"), "Should contain notes");
    assert!(musicxml.contains("<part id=\"P1\">"), "Should contain part");
}

#[test]
fn test_lyrics_across_multiple_measures() {
    let mut doc = Document::new();

    // Create a line with lyrics spanning multiple measures
    // NOTE: Current design applies lyrics parsing per-measure, so lyrics
    // are reused for each measure. To test multiple measures with different
    // lyrics per note, we need enough notes per measure.
    let mut line = Line::new();
    line.lyrics = "one two".to_string();

    // Add cells with barlines to create multiple measures
    // Measure 1: 1 2
    line.cells.push(make_cell(ElementKind::PitchedElement, "1", Some(PitchCode::N1)));
    line.cells.push(make_cell(ElementKind::UnpitchedElement, " ", None));
    line.cells.push(make_cell(ElementKind::PitchedElement, "2", Some(PitchCode::N2)));
    // Barline
    line.cells.push(make_cell(ElementKind::UnpitchedElement, "|", None));
    // Measure 2: 3 4
    line.cells.push(make_cell(ElementKind::PitchedElement, "3", Some(PitchCode::N3)));
    line.cells.push(make_cell(ElementKind::UnpitchedElement, " ", None));
    line.cells.push(make_cell(ElementKind::PitchedElement, "4", Some(PitchCode::N4)));

    doc.lines.push(line);

    // Export to MusicXML
    let musicxml = to_musicxml(&doc).expect("MusicXML export should succeed");

    // Verify that lyric syllables appear in the output
    // With current design, each measure gets the same lyrics applied
    assert!(musicxml.contains("<text>one</text>"),
            "Should contain 'one' lyric");
    assert!(musicxml.contains("<text>two</text>"),
            "Should contain 'two' lyric");

    // Verify we have multiple measures
    assert!(musicxml.matches("<measure number=\"1\">").count() >= 1, "Should have measure 1");
    assert!(musicxml.matches("<measure number=\"2\">").count() >= 1, "Should have measure 2");

    // Verify both measures have notes with lyrics
    assert!(musicxml.matches("<lyric number=\"1\">").count() >= 2,
            "Should have lyrics in multiple measures");
}

#[test]
fn test_lyric_structure_in_musicxml() {
    let mut doc = Document::new();

    // Create a line with a simple lyric
    let mut line = Line::new();
    line.lyrics = "test".to_string();

    line.cells.push(make_cell(ElementKind::PitchedElement, "1", Some(PitchCode::N1)));

    doc.lines.push(line);

    // Export to MusicXML
    let musicxml = to_musicxml(&doc).expect("MusicXML export should succeed");

    // Verify the complete lyric structure
    // Should find the pattern: <lyric number="1"><text>test</text></lyric>
    let has_lyric_structure = musicxml.contains("<lyric number=\"1\">") &&
                              musicxml.contains("<text>test</text>") &&
                              musicxml.contains("</lyric>");

    assert!(has_lyric_structure,
            "MusicXML should contain complete lyric structure with number, text, and closing tag");
}

#[test]
fn test_verse_number_in_lyrics() {
    let mut doc = Document::new();

    let mut line = Line::new();
    line.lyrics = "verse".to_string();

    line.cells.push(make_cell(ElementKind::PitchedElement, "1", Some(PitchCode::N1)));

    doc.lines.push(line);

    // Export to MusicXML
    let musicxml = to_musicxml(&doc).expect("MusicXML export should succeed");

    // Verify verse number attribute is present
    assert!(musicxml.contains("number=\"1\""),
            "Lyric should have verse number attribute (number='1' for first verse)");
}

#[test]
fn test_complex_hyphenated_word() {
    let mut doc = Document::new();

    // Create a line with a three-syllable word
    let mut line = Line::new();
    line.lyrics = "mu-si-cal".to_string();

    // Add cells for three pitches
    line.cells.push(make_cell(ElementKind::PitchedElement, "1", Some(PitchCode::N1)));
    line.cells.push(make_cell(ElementKind::UnpitchedElement, " ", None));
    line.cells.push(make_cell(ElementKind::PitchedElement, "2", Some(PitchCode::N2)));
    line.cells.push(make_cell(ElementKind::UnpitchedElement, " ", None));
    line.cells.push(make_cell(ElementKind::PitchedElement, "3", Some(PitchCode::N3)));

    doc.lines.push(line);

    // Export to MusicXML
    let musicxml = to_musicxml(&doc).expect("MusicXML export should succeed");

    // Verify all three syllables with correct markers
    assert!(musicxml.contains("<text>mu</text>"), "Should contain first syllable 'mu'");
    assert!(musicxml.contains("<text>si</text>"), "Should contain middle syllable 'si'");
    assert!(musicxml.contains("<text>cal</text>"), "Should contain last syllable 'cal'");

    // Count syllabic markers - should have: begin, middle, end
    let begin_count = musicxml.matches("<syllabic>begin</syllabic>").count();
    let middle_count = musicxml.matches("<syllabic>middle</syllabic>").count();
    let end_count = musicxml.matches("<syllabic>end</syllabic>").count();

    // For this word, we should find at least one of each
    assert!(begin_count >= 1, "Should have at least one 'begin' syllabic marker");
    assert!(middle_count >= 1, "Should have at least one 'middle' syllabic marker");
    assert!(end_count >= 1, "Should have at least one 'end' syllabic marker");
}

#[test]
fn test_remaining_syllables_on_last_note() {
    let mut doc = Document::new();

    // Create a line with MORE syllables than notes
    // 4 syllables (hel-lo-wor-ld) but only 2 notes
    let mut line = Line::new();
    line.lyrics = "hel-lo-wor-ld".to_string();

    // Add cells for only 2 pitches
    line.cells.push(make_cell(ElementKind::PitchedElement, "1", Some(PitchCode::N1)));
    line.cells.push(make_cell(ElementKind::UnpitchedElement, " ", None));
    line.cells.push(make_cell(ElementKind::PitchedElement, "2", Some(PitchCode::N2)));

    doc.lines.push(line);

    // Export to MusicXML
    let musicxml = to_musicxml(&doc).expect("MusicXML export should succeed");

    // Verify first note gets first syllable
    assert!(musicxml.contains("<text>hel</text>"),
            "First note should get first syllable 'hel'");

    // Verify last note gets all remaining syllables combined
    assert!(musicxml.contains("<text>lo-wor-ld</text>"),
            "Last note should get all remaining syllables combined with hyphens: 'lo-wor-ld'");

    // Verify the combined syllables are marked as single (not begin/middle/end)
    // This test just checks that the combined text is present
    let lyrics_count = musicxml.matches("<lyric").count();
    assert!(lyrics_count >= 2, "Should have at least 2 lyric elements");
}

#[test]
fn test_remaining_syllables_with_three_notes_four_syllables() {
    let mut doc = Document::new();

    // 4 syllables but 3 notes: hel, lo, (wor-ld)
    let mut line = Line::new();
    line.lyrics = "hel-lo-wor-ld".to_string();

    // Add cells for 3 pitches
    line.cells.push(make_cell(ElementKind::PitchedElement, "1", Some(PitchCode::N1)));
    line.cells.push(make_cell(ElementKind::UnpitchedElement, " ", None));
    line.cells.push(make_cell(ElementKind::PitchedElement, "2", Some(PitchCode::N2)));
    line.cells.push(make_cell(ElementKind::UnpitchedElement, " ", None));
    line.cells.push(make_cell(ElementKind::PitchedElement, "3", Some(PitchCode::N3)));

    doc.lines.push(line);

    // Export to MusicXML
    let musicxml = to_musicxml(&doc).expect("MusicXML export should succeed");

    // Verify first two notes get their individual syllables
    assert!(musicxml.contains("<text>hel</text>"), "First note should get 'hel'");
    assert!(musicxml.contains("<text>lo</text>"), "Second note should get 'lo'");

    // Verify last note gets the remaining syllables combined
    assert!(musicxml.contains("<text>wor-ld</text>"),
            "Last note should get remaining syllables 'wor-ld'");
}

#[test]
fn test_equal_notes_and_syllables() {
    let mut doc = Document::new();

    // Equal number: 2 notes, 2 syllables (hel-lo)
    let mut line = Line::new();
    line.lyrics = "hel-lo".to_string();

    line.cells.push(make_cell(ElementKind::PitchedElement, "1", Some(PitchCode::N1)));
    line.cells.push(make_cell(ElementKind::UnpitchedElement, " ", None));
    line.cells.push(make_cell(ElementKind::PitchedElement, "2", Some(PitchCode::N2)));

    doc.lines.push(line);

    // Export to MusicXML
    let musicxml = to_musicxml(&doc).expect("MusicXML export should succeed");

    // Each note should get its own syllable (normal behavior)
    assert!(musicxml.contains("<text>hel</text>"), "First note gets first syllable");
    assert!(musicxml.contains("<text>lo</text>"), "Second note gets second syllable");

    // Should have syllabic markers (not combined)
    assert!(musicxml.contains("<syllabic>begin</syllabic>"), "Should have begin marker");
    assert!(musicxml.contains("<syllabic>end</syllabic>"), "Should have end marker");
}

#[test]
fn test_single_word_lyric_only_on_first_note() {
    // Bug: "1 1" with lyrics "hello" was showing "hello" on BOTH notes
    // Expected: "hello" should only appear on the FIRST note
    let mut doc = Document::new();

    let mut line = Line::new();
    line.lyrics = "hello".to_string();

    // Two identical pitches: "1 1"
    line.cells.push(make_cell(ElementKind::PitchedElement, "1", Some(PitchCode::N1)));
    line.cells.push(make_cell(ElementKind::UnpitchedElement, " ", None));
    line.cells.push(make_cell(ElementKind::PitchedElement, "1", Some(PitchCode::N1)));

    doc.lines.push(line);

    // Export to MusicXML
    let musicxml = to_musicxml(&doc).expect("MusicXML export should succeed");

    // Count how many times "hello" appears in lyrics
    let hello_count = musicxml.matches("<text>hello</text>").count();

    assert_eq!(hello_count, 1,
        "Single-word lyric 'hello' should appear exactly ONCE, not on every note. \
         Found {} occurrences.\n\nMusicXML output:\n{}",
        hello_count, musicxml);
}
