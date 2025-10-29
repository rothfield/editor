//! MusicXML element conversion logic
//!
//! Converts parsed MusicXML elements into the internal Music representation.

use crate::converters::musicxml::musicxml_to_lilypond::errors::{ConversionError, ParseError};
use crate::converters::musicxml::musicxml_to_lilypond::parser::{get_child, get_child_text, parse_divisions, parse_duration, parse_pitch, MeasureNode};
use crate::converters::musicxml::musicxml_to_lilypond::types::{
    ChordEvent, Clef, ClefType, Duration, KeySignature, Mode, Music, NoteEvent, Pitch, Rational,
    RestEvent, SequentialMusic, SkippedElement, TimeSignature, TupletMusic, NoteLyric, LyricSyllabic,
};
use roxmltree::Node;

/// Conversion context that tracks state across measures
pub struct ConversionContext {
    pub divisions: u32,
    pub current_measure: u32,
    pub current_part_id: String,
    pub skipped_elements: Vec<SkippedElement>,
}

impl ConversionContext {
    pub fn new(part_id: String) -> Self {
        Self {
            divisions: 1,
            current_measure: 0,
            current_part_id: part_id,
            skipped_elements: Vec::new(),
        }
    }

    pub fn add_skipped(&mut self, element_type: &str, reason: &str) {
        self.skipped_elements.push(SkippedElement {
            element_type: element_type.to_string(),
            measure_number: if self.current_measure > 0 {
                Some(self.current_measure)
            } else {
                None
            },
            part_id: Some(self.current_part_id.clone()),
            reason: reason.to_string(),
        });
    }
}

/// Convert a measure to a list of Music elements
pub fn convert_measure(
    measure: MeasureNode,
    context: &mut ConversionContext,
) -> Result<Vec<Music>, ConversionError> {
    context.current_measure = measure.get_number();
    let mut raw_music_elements = Vec::new();
    let mut pending_chord_notes: Vec<NoteEvent> = Vec::new();

    // Process all children in order
    for child in measure.get_children() {
        let tag = child.tag_name().name();

        match tag {
            "attributes" => {
                // Update divisions if present
                if let Some(div) = parse_divisions(child) {
                    context.divisions = div;
                }

                // Convert attributes to music
                if let Ok(attrs) = convert_attributes(child, context) {
                    raw_music_elements.extend(attrs);
                }
            }
            "note" => {
                // Check if this is a chord note (has <chord/> element)
                let is_chord = get_child(child, "chord").is_some();

                // Convert the note fully (with all properties)
                if let Ok(Music::Note(note_event)) = convert_note(child, context.divisions, context) {
                    if is_chord {
                        // This note is part of the current chord (2nd, 3rd, etc. note)
                        pending_chord_notes.push(note_event);
                    } else {
                        // No <chord/> element

                        // First, flush any pending chord from PREVIOUS note(s)
                        if !pending_chord_notes.is_empty() {
                            if pending_chord_notes.len() >= 2 {
                                // It was a chord!
                                let pitches: Vec<Pitch> = pending_chord_notes.iter().map(|n| n.pitch).collect();
                                let duration = pending_chord_notes[0].duration.clone();
                                if let Ok(chord) = ChordEvent::new(pitches, duration) {
                                    raw_music_elements.push(Music::Chord(chord));
                                }
                            } else if pending_chord_notes.len() == 1 {
                                // It was just a standalone note
                                let note = pending_chord_notes.pop().unwrap();
                                raw_music_elements.push(Music::Note(note));
                            }
                            pending_chord_notes.clear();
                        }

                        // Now accumulate THIS note (might be first of a chord, or standalone)
                        pending_chord_notes.push(note_event);
                    }
                } else if let Ok(rest_music) = convert_note(child, context.divisions, context) {
                    // It's a rest - flush pending notes and add rest
                    if !pending_chord_notes.is_empty() {
                        if pending_chord_notes.len() >= 2 {
                            let pitches: Vec<Pitch> = pending_chord_notes.iter().map(|n| n.pitch).collect();
                            let duration = pending_chord_notes[0].duration.clone();
                            if let Ok(chord) = ChordEvent::new(pitches, duration) {
                                raw_music_elements.push(Music::Chord(chord));
                            }
                        } else if pending_chord_notes.len() == 1 {
                            let note = pending_chord_notes.pop().unwrap();
                            raw_music_elements.push(Music::Note(note));
                        }
                        pending_chord_notes.clear();
                    }
                    raw_music_elements.push(rest_music);
                }
            }
            "direction" => {
                if let Some(music) = convert_direction(child, context) {
                    raw_music_elements.push(music);
                }
            }
            "figured-bass" => {
                context.add_skipped("figured-bass", "Figured bass notation is not yet supported");
            }
            _ => {
                // Silently skip other elements (backup, forward, etc.)
            }
        }
    }

    // Flush any remaining chord notes
    if pending_chord_notes.len() >= 2 {
        let pitches: Vec<Pitch> = pending_chord_notes.iter().map(|n| n.pitch).collect();
        let duration = pending_chord_notes[0].duration.clone();
        if let Ok(chord) = ChordEvent::new(pitches, duration) {
            raw_music_elements.push(Music::Chord(chord));
        }
    } else if pending_chord_notes.len() == 1 {
        let note = pending_chord_notes.pop().unwrap();
        raw_music_elements.push(Music::Note(note));
    }

    // Group tuplets after processing all elements
    let music_elements = group_tuplets(raw_music_elements)?;

    Ok(music_elements)
}

/// Extract pitch from a note element (helper for chord processing)
fn extract_pitch_from_note(note_node: Node) -> Result<Pitch, ParseError> {
    let pitch_node = get_child(note_node, "pitch").ok_or_else(|| {
        ParseError::MissingRequiredElement("note missing pitch element".to_string())
    })?;
    parse_pitch(pitch_node)
}

/// Convert a note element
pub fn convert_note(
    note_node: Node,
    divisions: u32,
    _context: &mut ConversionContext,
) -> Result<Music, ConversionError> {
    // Check if it's a rest
    if get_child(note_node, "rest").is_some() {
        let duration = parse_duration(note_node, divisions)?;
        return Ok(Music::Rest(RestEvent::new(duration)));
    }

    // Extract pitch
    let pitch = extract_pitch_from_note(note_node)?;

    // Check for grace notes BEFORE parsing duration (grace notes don't have duration)
    let is_grace = get_child(note_node, "grace").is_some();
    let (grace_slash, is_after_grace, steal_time_following) = if let Some(grace_node) = get_child(note_node, "grace") {
        let slash = grace_node.attribute("slash").map_or(false, |s| s == "yes");
        // Check for steal-time-following attribute (indicates unmeasured fioritura / after grace notes)
        let has_steal_time = grace_node.attribute("steal-time-following").is_some();
        let steal_pct = grace_node.attribute("steal-time-following")
            .and_then(|s| s.parse::<f32>().ok());
        (slash, has_steal_time, steal_pct)
    } else {
        (false, false, None)
    };

    // Extract duration (or use dummy duration for grace notes)
    let duration = if is_grace {
        // Grace notes don't have duration in MusicXML, use a dummy 16th note for before grace, 32nd for after grace
        if is_after_grace {
            Duration::new(5, 0, None) // 32nd note for smaller after grace notes
        } else {
            Duration::new(4, 0, None) // 16th note for before grace notes
        }
    } else {
        parse_duration(note_node, divisions)?
    };

    // Create note event
    let mut note_event = NoteEvent::new(pitch, duration);
    note_event.is_grace = is_grace;
    note_event.grace_slash = grace_slash;
    note_event.is_after_grace = is_after_grace;
    note_event.steal_time_following = steal_time_following;

    // Check for ties
    for child in note_node.children() {
        if child.tag_name().name() == "tie" {
            if let Some(tie_type) = child.attribute("type") {
                note_event.tie = match tie_type {
                    "start" => Some(crate::converters::musicxml::musicxml_to_lilypond::types::Tie::Start),
                    "stop" => Some(crate::converters::musicxml::musicxml_to_lilypond::types::Tie::Stop),
                    "continue" => Some(crate::converters::musicxml::musicxml_to_lilypond::types::Tie::Continue),
                    _ => None,
                };
            }
        }
    }

    // Parse lyrics from note
    note_event.lyric = parse_lyric_from_note(note_node);

    // Check for articulations and slurs
    if let Some(notations) = get_child(note_node, "notations") {
        // Parse articulations
        if let Some(articulations) = get_child(notations, "articulations") {
            for artic_node in articulations.children() {
                if artic_node.is_element() {
                    use crate::converters::musicxml::musicxml_to_lilypond::types::{ArticulationMark, ArticulationType};

                    let artic_type = match artic_node.tag_name().name() {
                        "staccato" => Some(ArticulationType::Staccato),
                        "staccatissimo" => Some(ArticulationType::Staccatissimo),
                        "accent" => Some(ArticulationType::Accent),
                        "strong-accent" | "marcato" => Some(ArticulationType::Marcato),
                        "tenuto" => Some(ArticulationType::Tenuto),
                        "detached-legato" => Some(ArticulationType::Portato),
                        _ => None,
                    };

                    if let Some(atype) = artic_type {
                        note_event.articulations.push(ArticulationMark {
                            articulation_type: atype,
                        });
                    }
                }
            }
        }

        // Parse slurs
        for child in notations.children() {
            if child.tag_name().name() == "slur" {
                if let Some(slur_type) = child.attribute("type") {
                    use crate::converters::musicxml::musicxml_to_lilypond::types::{Slur, SlurDirection};

                    let direction = match slur_type {
                        "start" => Some(SlurDirection::Start),
                        "stop" => Some(SlurDirection::Stop),
                        _ => None,
                    };

                    if let Some(dir) = direction {
                        // Get slur number (for overlapping slurs), default to 1
                        let number = child
                            .attribute("number")
                            .and_then(|n| n.parse::<u8>().ok())
                            .unwrap_or(1);

                        note_event.slur = Some(Slur::with_number(dir, number));
                    }
                }
            }
        }
    }

    Ok(Music::Note(note_event))
}

/// Convert attributes element to Music changes
pub fn convert_attributes(
    attributes_node: Node,
    _context: &mut ConversionContext,
) -> Result<Vec<Music>, ConversionError> {
    let mut music = Vec::new();

    // Key signature
    if let Some(key_node) = get_child(attributes_node, "key") {
        if let Some((fifths, mode_str)) = crate::converters::musicxml::musicxml_to_lilypond::parser::parse_key(key_node) {
            let mode = match mode_str.to_lowercase().as_str() {
                "major" => Mode::Major,
                "minor" => Mode::Minor,
                _ => Mode::Major,
            };
            if let Ok(key_sig) = KeySignature::new(fifths, mode) {
                music.push(Music::KeyChange(key_sig));
            }
        }
    }

    // Time signature
    if let Some(time_node) = get_child(attributes_node, "time") {
        if let Some((beats, beat_type)) = crate::converters::musicxml::musicxml_to_lilypond::parser::parse_time(time_node) {
            if let Ok(time_sig) = TimeSignature::new(beats, beat_type) {
                music.push(Music::TimeChange(time_sig));
            }
        }
    }

    // Clef
    if let Some(clef_node) = get_child(attributes_node, "clef") {
        if let Some((sign, _line)) = crate::converters::musicxml::musicxml_to_lilypond::parser::parse_clef(clef_node) {
            let clef_type = match sign.as_str() {
                "G" => ClefType::Treble,
                "F" => ClefType::Bass,
                "C" => ClefType::Alto,
                _ => ClefType::Treble,
            };
            music.push(Music::ClefChange(Clef { clef_type }));
        }
    }

    Ok(music)
}

/// Convert direction element to Music (dynamics, tempo, text, etc.)
fn convert_direction(
    direction_node: Node,
    context: &mut ConversionContext,
) -> Option<Music> {
    use crate::converters::musicxml::musicxml_to_lilypond::types::{DynamicMark, DynamicType, Placement, TempoMark, TextMark};

    // Get direction-type child
    let direction_type = get_child(direction_node, "direction-type")?;

    // Try to extract dynamics
    if let Some(dynamics_node) = get_child(direction_type, "dynamics") {
        // Get the first child element (p, f, mf, etc.)
        for child in dynamics_node.children() {
            if child.is_element() {
                let dynamic_type = match child.tag_name().name() {
                    "ppp" => Some(DynamicType::PPP),
                    "pp" => Some(DynamicType::PP),
                    "p" => Some(DynamicType::P),
                    "mp" => Some(DynamicType::MP),
                    "mf" => Some(DynamicType::MF),
                    "f" => Some(DynamicType::F),
                    "ff" => Some(DynamicType::FF),
                    "fff" => Some(DynamicType::FFF),
                    "fp" => Some(DynamicType::FP),
                    "sf" => Some(DynamicType::SF),
                    "sfz" => Some(DynamicType::SFZ),
                    _ => None,
                };

                if let Some(dtype) = dynamic_type {
                    return Some(Music::Dynamic(DynamicMark {
                        dynamic_type: dtype,
                    }));
                }
            }
        }
    }

    // Try to extract tempo
    if let Some(metronome_node) = get_child(direction_type, "metronome") {
        let bpm = get_child_text(metronome_node, "per-minute")
            .and_then(|s| s.parse::<u16>().ok());

        if let Some(bpm_val) = bpm {
            return Some(Music::Tempo(TempoMark {
                text: None,
                bpm: Some(bpm_val),
                beat_unit: None,
            }));
        }
    }

    // Try to extract words (text directions)
    if get_child(direction_type, "words").is_some() {
        if let Some(text) = get_child_text(direction_type, "words") {
            let placement = direction_node
                .attribute("placement")
                .map(|p| match p {
                    "above" => Placement::Above,
                    "below" => Placement::Below,
                    _ => Placement::Above,
                })
                .unwrap_or(Placement::Above);

            return Some(Music::Text(TextMark { text, placement }));
        }
    }

    // If we couldn't convert it, skip it
    if context.skipped_elements.iter().all(|s| {
        !(s.element_type == "direction"
            && s.measure_number == Some(context.current_measure))
    }) {
        context.add_skipped(
            "direction",
            "Unsupported direction type (not dynamics, tempo, or text)",
        );
    }

    None
}

/// Convert a part to sequential music
pub fn convert_part(
    part_node: crate::converters::musicxml::musicxml_to_lilypond::parser::PartNode,
    context: &mut ConversionContext,
) -> Result<SequentialMusic, ConversionError> {
    let mut all_music = Vec::new();

    for measure in part_node.get_measures() {
        let measure_music = convert_measure(measure, context)?;
        all_music.extend(measure_music);
    }

    Ok(SequentialMusic::new(all_music))
}

/// Group consecutive notes/rests with the same tuplet factor into TupletMusic
fn group_tuplets(music_elements: Vec<Music>) -> Result<Vec<Music>, ConversionError> {
    let mut result = Vec::new();
    let mut i = 0;

    while i < music_elements.len() {
        // Check if this element has a tuplet factor
        let tuplet_factor = get_tuplet_factor(&music_elements[i]);

        if let Some(factor) = tuplet_factor {
            // Find all consecutive elements with the same tuplet factor
            let mut tuplet_contents = vec![music_elements[i].clone()];
            let mut j = i + 1;

            while j < music_elements.len() {
                let next_factor = get_tuplet_factor(&music_elements[j]);
                if next_factor == Some(factor) {
                    tuplet_contents.push(music_elements[j].clone());
                    j += 1;
                } else {
                    break;
                }
            }

            // Create tuplet if we have multiple elements OR a single element with non-1:1 ratio
            if tuplet_contents.len() > 1 || factor != Rational::new(1, 1) {
                // Extract the tuplet ratio from the factor
                // factor is normal_notes/actual_notes
                let actual_notes = *factor.denom() as u32;
                let normal_notes = *factor.numer() as u32;

                // Clear the tuplet factor from individual notes/rests
                let cleaned_contents = tuplet_contents.into_iter().map(|mut music| {
                    clear_tuplet_factor(&mut music);
                    music
                }).collect();

                let tuplet = TupletMusic::new(normal_notes, actual_notes, cleaned_contents)
                    .map_err(|e| ConversionError::ParseError(ParseError::InvalidXml(e)))?;
                result.push(Music::Tuplet(tuplet));
                i = j;
            } else {
                // Single element with tuplet factor - just add it as-is
                result.push(music_elements[i].clone());
                i += 1;
            }
        } else {
            // No tuplet factor - add as-is
            result.push(music_elements[i].clone());
            i += 1;
        }
    }

    Ok(result)
}

/// Get the tuplet factor from a Music element if it has one
fn get_tuplet_factor(music: &Music) -> Option<Rational> {
    match music {
        Music::Note(note) => note.duration.factor.clone(),
        Music::Rest(rest) => rest.duration.factor.clone(),
        _ => None,
    }
}

/// Clear the tuplet factor from a Music element
fn clear_tuplet_factor(music: &mut Music) {
    match music {
        Music::Note(note) => note.duration.factor = None,
        Music::Rest(rest) => rest.duration.factor = None,
        _ => {}
    }
}

/// Parse lyrics from a note element
/// Expects structure like:
/// <lyric number="1">
///   <syllabic>begin</syllabic>
///   <text>hel</text>
/// </lyric>
fn parse_lyric_from_note(note_node: Node) -> Option<NoteLyric> {
    // Look for the first <lyric> element in the note (number="1" for first verse)
    for child in note_node.children() {
        if child.is_element() && child.tag_name().name() == "lyric" {
            // Check if this is the first verse (number="1")
            let number = child.attribute("number").unwrap_or("1");
            if number != "1" {
                continue; // Only process first verse for now
            }

            // Extract syllabic type
            let syllabic = if let Some(_syl_node) = get_child(child, "syllabic") {
                if let Some(text) = get_child_text(child, "syllabic") {
                    match text.trim() {
                        "begin" => LyricSyllabic::Begin,
                        "middle" => LyricSyllabic::Middle,
                        "end" => LyricSyllabic::End,
                        "single" => LyricSyllabic::Single,
                        _ => LyricSyllabic::Single,
                    }
                } else {
                    LyricSyllabic::Single
                }
            } else {
                // No explicit syllabic element means single syllable
                LyricSyllabic::Single
            };

            // Extract text
            if let Some(text) = get_child_text(child, "text") {
                let trimmed = text.trim();
                if !trimmed.is_empty() {
                    return Some(NoteLyric {
                        text: trimmed.to_string(),
                        syllabic,
                    });
                }
            }
        }
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::converters::musicxml::musicxml_to_lilypond::lilypond::generate_lilypond_document;
    use crate::converters::musicxml::musicxml_to_lilypond::parser::XmlDocument;
    use crate::converters::musicxml::musicxml_to_lilypond::types::ConversionSettings;

    #[test]
    fn test_parse_lyric_from_note_single_syllable() {
        let xml = r#"<?xml version="1.0"?>
<note>
  <pitch><step>C</step><octave>4</octave></pitch>
  <duration>4</duration>
  <type>quarter</type>
  <lyric number="1">
    <text>hello</text>
  </lyric>
</note>"#;

        // We can't directly test parse_lyric_from_note without parsing,
        // but we test it indirectly through the integration test below
    }

    #[test]
    fn test_convert_musicxml_with_lyrics_to_lilypond() {
        let musicxml = r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1">
  <movement-title>Test Lyrics</movement-title>
  <part-list>
    <score-part id="P1">
      <part-name>Part 1</part-name>
    </score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
        <time>
          <beats>4</beats>
          <beat-type>4</beat-type>
        </time>
        <clef>
          <sign>G</sign>
          <line>2</line>
        </clef>
      </attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>4</duration>
        <type>quarter</type>
        <lyric number="1">
          <text>hel</text>
          <syllabic>begin</syllabic>
        </lyric>
      </note>
      <note>
        <pitch><step>D</step><octave>4</octave></pitch>
        <duration>4</duration>
        <type>quarter</type>
        <lyric number="1">
          <text>lo</text>
          <syllabic>end</syllabic>
        </lyric>
      </note>
      <note>
        <pitch><step>E</step><octave>4</octave></pitch>
        <duration>4</duration>
        <type>quarter</type>
        <lyric number="1">
          <text>world</text>
        </lyric>
      </note>
      <note>
        <pitch><step>F</step><octave>4</octave></pitch>
        <duration>4</duration>
        <type>quarter</type>
      </note>
    </measure>
  </part>
</score-partwise>"#;

        let result = super::super::convert_musicxml_to_lilypond(musicxml, None);
        assert!(result.is_ok(), "MusicXML to LilyPond conversion should succeed");

        let conversion_result = result.unwrap();
        let lilypond = &conversion_result.lilypond_source;

        // Check that lyrics are present in the output
        assert!(lilypond.contains("hel"), "LilyPond output should contain 'hel'");
        assert!(lilypond.contains("lo"), "LilyPond output should contain 'lo'");
        assert!(lilypond.contains("world"), "LilyPond output should contain 'world'");

        // Check for proper LilyPond \lyricsto syntax with voice binding
        assert!(lilypond.contains("\\lyricsto"), "LilyPond should have \\lyricsto for voice binding");
        assert!(lilypond.contains("hel -- lo"), "LilyPond should have syllabic markers for multi-syllable words");
    }

    #[test]
    fn test_convert_musicxml_with_lyrics_and_convert_flag() {
        let musicxml = r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1">
      <part-name>Part 1</part-name>
    </score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>4</duration>
        <type>quarter</type>
        <lyric number="1"><text>test</text></lyric>
      </note>
    </measure>
  </part>
</score-partwise>"#;

        // Test with convert_lyrics enabled (default)
        let mut settings = ConversionSettings::default();
        settings.convert_lyrics = true;
        let result = super::super::convert_musicxml_to_lilypond(musicxml, Some(settings)).unwrap();
        assert!(result.lilypond_source.contains("test"), "Should include lyric when convert_lyrics=true");
        assert!(result.lilypond_source.contains("\\lyricsto"), "Should have \\lyricsto binding when convert_lyrics=true");

        // Test with convert_lyrics disabled
        let mut settings = ConversionSettings::default();
        settings.convert_lyrics = false;
        let result = super::super::convert_musicxml_to_lilypond(musicxml, Some(settings)).unwrap();
        assert!(!result.lilypond_source.contains("test"), "Should exclude lyric when convert_lyrics=false");
    }
}
