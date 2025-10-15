// Test title support across MusicXML export and LilyPond conversion

use editor_wasm::models::Document;
use editor_wasm::renderers::musicxml::to_musicxml;
use editor_wasm::musicxml_import::{convert_musicxml_to_lilypond, ConversionSettings};

#[test]
fn test_title_in_musicxml_export() {
    // Create a document with a title
    let mut doc = Document::new();
    doc.title = Some("My Test Song".to_string());

    // Export to MusicXML
    let musicxml = to_musicxml(&doc).expect("MusicXML export should succeed");

    // Verify the title is present in the MusicXML
    assert!(musicxml.contains("<movement-title>My Test Song</movement-title>"),
            "MusicXML should contain movement-title element with document title");
}

#[test]
fn test_title_not_in_musicxml_when_empty() {
    // Create a document without a title
    let doc = Document::new();

    // Export to MusicXML
    let musicxml = to_musicxml(&doc).expect("MusicXML export should succeed");

    // Verify no title element is present
    assert!(!musicxml.contains("<movement-title>"),
            "MusicXML should not contain movement-title when document has no title");
}

#[test]
fn test_title_not_in_musicxml_when_untitled() {
    // Create a document with "Untitled Document"
    let mut doc = Document::new();
    doc.title = Some("Untitled Document".to_string());

    // Export to MusicXML
    let musicxml = to_musicxml(&doc).expect("MusicXML export should succeed");

    // Verify no title element is present (filters out "Untitled Document")
    assert!(!musicxml.contains("<movement-title>"),
            "MusicXML should not contain movement-title for 'Untitled Document'");
}

#[test]
fn test_title_xml_escaping() {
    // Create a document with special characters in title
    let mut doc = Document::new();
    doc.title = Some("Song & Dance <Test>".to_string());

    // Export to MusicXML
    let musicxml = to_musicxml(&doc).expect("MusicXML export should succeed");

    // Verify special characters are properly escaped
    assert!(musicxml.contains("&amp;"), "Ampersand should be escaped");
    assert!(musicxml.contains("&lt;"), "Less-than should be escaped");
    assert!(musicxml.contains("&gt;"), "Greater-than should be escaped");
    assert!(musicxml.contains("<movement-title>Song &amp; Dance &lt;Test&gt;</movement-title>"),
            "Title should be properly XML-escaped");
}

#[test]
fn test_title_extracted_from_musicxml() {
    // Create MusicXML with a title
    let musicxml = r#"<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <movement-title>Test Extraction</movement-title>
  <part-list>
    <score-part id="P1">
      <part-name></part-name>
    </score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <key><fifths>0</fifths></key>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>4</duration>
        <type>whole</type>
      </note>
    </measure>
  </part>
</score-partwise>"#;

    // Convert to LilyPond
    let result = convert_musicxml_to_lilypond(musicxml, None)
        .expect("Conversion should succeed");

    let lilypond = &result.lilypond_source;

    // Verify title appears in LilyPond header
    assert!(lilypond.contains("\\header"),
            "LilyPond should contain header block");
    assert!(lilypond.contains("title = \"Test Extraction\""),
            "LilyPond header should contain the title");
}

#[test]
fn test_title_from_work_title() {
    // Create MusicXML with work/work-title (alternative format)
    let musicxml = r#"<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <work>
    <work-title>Work Title Test</work-title>
  </work>
  <part-list>
    <score-part id="P1">
      <part-name></part-name>
    </score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <key><fifths>0</fifths></key>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <rest/>
        <duration>4</duration>
        <type>whole</type>
      </note>
    </measure>
  </part>
</score-partwise>"#;

    // Convert to LilyPond
    let result = convert_musicxml_to_lilypond(musicxml, None)
        .expect("Conversion should succeed");

    let lilypond = &result.lilypond_source;

    // Verify title appears in LilyPond header
    assert!(lilypond.contains("title = \"Work Title Test\""),
            "LilyPond should extract title from work/work-title");
}

#[test]
fn test_movement_title_takes_precedence() {
    // Create MusicXML with both movement-title and work-title
    let musicxml = r#"<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <movement-title>Movement Title</movement-title>
  <work>
    <work-title>Work Title</work-title>
  </work>
  <part-list>
    <score-part id="P1">
      <part-name></part-name>
    </score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
      </attributes>
      <note>
        <rest/>
        <duration>4</duration>
      </note>
    </measure>
  </part>
</score-partwise>"#;

    // Convert to LilyPond
    let result = convert_musicxml_to_lilypond(musicxml, None)
        .expect("Conversion should succeed");

    let lilypond = &result.lilypond_source;

    // Verify movement-title takes precedence
    assert!(lilypond.contains("title = \"Movement Title\""),
            "movement-title should take precedence over work-title");
    assert!(!lilypond.contains("Work Title"),
            "work-title should not be used when movement-title is present");
}

#[test]
fn test_no_title_in_lilypond_when_missing() {
    // Create MusicXML without any title
    let musicxml = r#"<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1">
      <part-name></part-name>
    </score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
      </attributes>
      <note>
        <rest/>
        <duration>4</duration>
      </note>
    </measure>
  </part>
</score-partwise>"#;

    // Convert to LilyPond
    let result = convert_musicxml_to_lilypond(musicxml, None)
        .expect("Conversion should succeed");

    let lilypond = &result.lilypond_source;

    // Verify no header block when no title
    assert!(!lilypond.contains("\\header"),
            "LilyPond should not contain header block when no title");
}

#[test]
fn test_lilypond_title_escaping() {
    // Create MusicXML with characters that need escaping in LilyPond
    let musicxml = r#"<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <movement-title>Title with "quotes" and \backslash</movement-title>
  <part-list>
    <score-part id="P1">
      <part-name></part-name>
    </score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
      </attributes>
      <note>
        <rest/>
        <duration>4</duration>
      </note>
    </measure>
  </part>
</score-partwise>"#;

    // Convert to LilyPond
    let result = convert_musicxml_to_lilypond(musicxml, None)
        .expect("Conversion should succeed");

    let lilypond = &result.lilypond_source;

    // Verify proper escaping in LilyPond
    assert!(lilypond.contains("\\\""), "Quotes should be escaped");
    assert!(lilypond.contains("\\\\"), "Backslashes should be escaped");
    assert!(lilypond.contains("title = \"Title with \\\"quotes\\\" and \\\\backslash\""),
            "Title should be properly escaped for LilyPond");
}

#[test]
fn test_round_trip_title() {
    // Create a document with title
    let mut doc = Document::new();
    doc.title = Some("Round Trip Test".to_string());

    // Export to MusicXML
    let musicxml = to_musicxml(&doc).expect("MusicXML export should succeed");

    // Convert MusicXML to LilyPond
    let result = convert_musicxml_to_lilypond(&musicxml, None)
        .expect("LilyPond conversion should succeed");

    // Verify title survived the round trip
    assert!(result.lilypond_source.contains("title = \"Round Trip Test\""),
            "Title should survive round trip from Document -> MusicXML -> LilyPond");
}

#[test]
fn test_custom_settings_preserve_title() {
    // Create MusicXML with title
    let musicxml = r#"<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <movement-title>Settings Test</movement-title>
  <part-list>
    <score-part id="P1">
      <part-name></part-name>
    </score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
      </attributes>
      <note>
        <rest/>
        <duration>4</duration>
      </note>
    </measure>
  </part>
</score-partwise>"#;

    // Create custom settings
    let mut settings = ConversionSettings::default();
    settings.target_lilypond_version = "2.25.0".to_string();

    // Convert to LilyPond with custom settings
    let result = convert_musicxml_to_lilypond(musicxml, Some(settings))
        .expect("Conversion should succeed");

    let lilypond = &result.lilypond_source;

    // Verify both custom settings and title are applied
    assert!(lilypond.contains("\\version \"2.25.0\""),
            "Custom version should be used");
    assert!(lilypond.contains("title = \"Settings Test\""),
            "Title should be preserved with custom settings");
}
