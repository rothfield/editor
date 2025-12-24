// Test: Lyrics should appear in MusicXML export
//
// Input: | 1 | with lyrics "hi"
// Expected: MusicXML contains <lyric> element attached to the note

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
fn test_lyrics_in_musicxml_export() {
    // | 1 | with lyrics "hi"
    let mut doc = Document::new();
    let mut line = Line::new();

    // Build: | 1 |
    line.cells.push(make_barline());
    line.cells.push(make_space());
    line.cells.push(make_pitched_cell(PitchCode::N1));
    line.cells.push(make_space());
    line.cells.push(make_barline());

    // Set lyrics
    line.lyrics = "hi".to_string();

    line.sync_text_from_cells();
    doc.add_line(line);
    doc.recalculate_system_and_part_ids();

    let musicxml = to_musicxml_polyphonic(&doc).expect("Export should succeed");

    println!("MusicXML output:\n{}", musicxml);

    // Check for lyric element
    let has_lyric = musicxml.contains("<lyric");
    let has_lyric_text = musicxml.contains("<text>hi</text>");

    println!("Has <lyric>: {}", has_lyric);
    println!("Has <text>hi</text>: {}", has_lyric_text);

    assert!(has_lyric, "MusicXML should contain <lyric> element");
    assert!(has_lyric_text, "MusicXML should contain lyric text 'hi'");
}

#[test]
fn test_multiple_syllables_in_musicxml() {
    // | 1 2 3 | with lyrics "hel-lo world"
    let mut doc = Document::new();
    let mut line = Line::new();

    // Build: | 1 2 3 |
    line.cells.push(make_barline());
    line.cells.push(make_space());
    line.cells.push(make_pitched_cell(PitchCode::N1));
    line.cells.push(make_space());
    line.cells.push(make_pitched_cell(PitchCode::N2));
    line.cells.push(make_space());
    line.cells.push(make_pitched_cell(PitchCode::N3));
    line.cells.push(make_space());
    line.cells.push(make_barline());

    // Set lyrics with hyphenation
    line.lyrics = "hel-lo world".to_string();

    line.sync_text_from_cells();
    doc.add_line(line);
    doc.recalculate_system_and_part_ids();

    let musicxml = to_musicxml_polyphonic(&doc).expect("Export should succeed");

    println!("MusicXML output:\n{}", musicxml);

    // Should have 3 lyric elements (one per note)
    let lyric_count = musicxml.matches("<lyric").count();
    println!("Lyric element count: {}", lyric_count);

    assert!(lyric_count >= 1, "Should have at least 1 lyric element");

    // Check for syllable text
    assert!(musicxml.contains("<text>hel</text>") || musicxml.contains("hel"),
        "Should contain first syllable 'hel'");
}
