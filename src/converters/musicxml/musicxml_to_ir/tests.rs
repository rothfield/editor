//! Unit tests for MusicXML → IR parser

use super::*;
use crate::ir::{ExportEvent, PitchInfo};
use crate::models::PitchCode;

#[test]
fn test_parse_simple_melody() {
    let musicxml = r#"<?xml version="1.0"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>4</duration>
      </note>
      <note>
        <pitch><step>D</step><octave>4</octave></pitch>
        <duration>4</duration>
      </note>
    </measure>
  </part>
</score-partwise>"#;

    let result = parse_musicxml_to_ir(musicxml);
    assert!(result.is_ok());

    let lines = result.unwrap();
    assert_eq!(lines.len(), 1);

    let line = &lines[0];
    assert_eq!(line.part_id, "P1");
    assert_eq!(line.measures.len(), 1);

    let measure = &line.measures[0];
    assert_eq!(measure.divisions, 4);
    assert_eq!(measure.events.len(), 2);

    // Check first note (C4)
    if let ExportEvent::Note(note) = &measure.events[0] {
        assert_eq!(note.pitch.pitch_code, PitchCode::N1);
        assert_eq!(note.pitch.octave, 4);
        assert_eq!(note.divisions, 4);
    } else {
        panic!("Expected Note event");
    }

    // Check second note (D4)
    if let ExportEvent::Note(note) = &measure.events[1] {
        assert_eq!(note.pitch.pitch_code, PitchCode::N2);
        assert_eq!(note.pitch.octave, 4);
        assert_eq!(note.divisions, 4);
    } else {
        panic!("Expected Note event");
    }
}

#[test]
fn test_parse_accidentals() {
    let musicxml = r#"<?xml version="1.0"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Test</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
      </attributes>
      <note>
        <pitch><step>C</step><alter>1</alter><octave>4</octave></pitch>
        <duration>4</duration>
      </note>
      <note>
        <pitch><step>D</step><alter>-1</alter><octave>4</octave></pitch>
        <duration>4</duration>
      </note>
    </measure>
  </part>
</score-partwise>"#;

    let result = parse_musicxml_to_ir(musicxml);
    assert!(result.is_ok());

    let lines = result.unwrap();
    let measure = &lines[0].measures[0];

    // C# (C sharp)
    if let ExportEvent::Note(note) = &measure.events[0] {
        assert_eq!(note.pitch.pitch_code, PitchCode::N1s);
    } else {
        panic!("Expected Note event");
    }

    // Db (D flat)
    if let ExportEvent::Note(note) = &measure.events[1] {
        assert_eq!(note.pitch.pitch_code, PitchCode::N2b);
    } else {
        panic!("Expected Note event");
    }
}

#[test]
fn test_parse_rests() {
    let musicxml = r#"<?xml version="1.0"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Test</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
      </attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>4</duration>
      </note>
      <note>
        <rest/>
        <duration>4</duration>
      </note>
    </measure>
  </part>
</score-partwise>"#;

    let result = parse_musicxml_to_ir(musicxml);
    assert!(result.is_ok());

    let lines = result.unwrap();
    let measure = &lines[0].measures[0];
    assert_eq!(measure.events.len(), 2);

    // First event should be a note
    assert!(matches!(measure.events[0], ExportEvent::Note(_)));

    // Second event should be a rest
    if let ExportEvent::Rest { divisions, .. } = measure.events[1] {
        assert_eq!(divisions, 4);
    } else {
        panic!("Expected Rest event");
    }
}

#[test]
fn test_parse_all_chromatic_pitches() {
    // Test all 7 natural pitches
    let pitches = vec![
        ("C", 0, PitchCode::N1),
        ("D", 0, PitchCode::N2),
        ("E", 0, PitchCode::N3),
        ("F", 0, PitchCode::N4),
        ("G", 0, PitchCode::N5),
        ("A", 0, PitchCode::N6),
        ("B", 0, PitchCode::N7),
    ];

    for (step, alter, expected_pitch) in pitches {
        let musicxml = format!(
            r#"<?xml version="1.0"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Test</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>4</divisions></attributes>
      <note>
        <pitch><step>{}</step><octave>4</octave></pitch>
        <duration>4</duration>
      </note>
    </measure>
  </part>
</score-partwise>"#,
            step
        );

        let result = parse_musicxml_to_ir(&musicxml);
        assert!(result.is_ok());

        let lines = result.unwrap();
        if let ExportEvent::Note(note) = &lines[0].measures[0].events[0] {
            assert_eq!(note.pitch.pitch_code, expected_pitch);
        } else {
            panic!("Expected Note event for pitch {}", step);
        }
    }
}

#[test]
fn test_parse_double_accidentals() {
    let musicxml = r#"<?xml version="1.0"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Test</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>4</divisions></attributes>
      <note>
        <pitch><step>C</step><alter>2</alter><octave>4</octave></pitch>
        <duration>4</duration>
      </note>
      <note>
        <pitch><step>D</step><alter>-2</alter><octave>4</octave></pitch>
        <duration>4</duration>
      </note>
    </measure>
  </part>
</score-partwise>"#;

    let result = parse_musicxml_to_ir(musicxml);
    assert!(result.is_ok());

    let lines = result.unwrap();
    let measure = &lines[0].measures[0];

    // C## (double sharp)
    if let ExportEvent::Note(note) = &measure.events[0] {
        assert_eq!(note.pitch.pitch_code, PitchCode::N1ss);
    } else {
        panic!("Expected Note event");
    }

    // Dbb (double flat)
    if let ExportEvent::Note(note) = &measure.events[1] {
        assert_eq!(note.pitch.pitch_code, PitchCode::N2bb);
    } else {
        panic!("Expected Note event");
    }
}

#[test]
fn test_parse_key_signature() {
    let musicxml = r#"<?xml version="1.0"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Test</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
        <key><fifths>2</fifths></key>
      </attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>4</duration>
      </note>
    </measure>
  </part>
</score-partwise>"#;

    let result = parse_musicxml_to_ir(musicxml);
    assert!(result.is_ok());

    let lines = result.unwrap();
    assert_eq!(lines[0].key_signature, Some("D major".to_string()));
}

#[test]
fn test_parse_time_signature() {
    let musicxml = r#"<?xml version="1.0"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Test</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
        <time><beats>3</beats><beat-type>4</beat-type></time>
      </attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>4</duration>
      </note>
    </measure>
  </part>
</score-partwise>"#;

    let result = parse_musicxml_to_ir(musicxml);
    assert!(result.is_ok());

    let lines = result.unwrap();
    assert_eq!(lines[0].time_signature, Some("3/4".to_string()));
}

#[test]
fn test_invalid_musicxml() {
    let musicxml = "This is not valid XML";
    let result = parse_musicxml_to_ir(musicxml);
    assert!(result.is_err());
}

#[test]
fn test_missing_required_element() {
    let musicxml = r#"<?xml version="1.0"?>
<score-partwise version="3.1">
  <part id="P1">
    <measure number="1">
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
      </note>
    </measure>
  </part>
</score-partwise>"#;

    let result = parse_musicxml_to_ir(musicxml);
    assert!(result.is_err()); // Missing part-list
}
