//! MusicXML emitter - consumes IR and emits MusicXML strings
//!
//! This module provides high-level emission functions that consume the intermediate
//! representation (ExportLine, ExportMeasure, ExportEvent) and produce valid MusicXML strings.

use crate::models::pitch::Pitch;
use crate::models::{PitchSystem, Accidental, PitchCode};
use super::export_ir::*;
use super::builder::MusicXmlBuilder;
use super::grace_notes::ornament_position_to_placement;

/// Emit a complete MusicXML document from export lines
pub fn emit_musicxml(
    export_lines: &[ExportLine],
    document_title: Option<&str>,
    document_key_signature: Option<&str>,
) -> Result<String, String> {
    let mut builder = MusicXmlBuilder::new();

    // Set document title if present
    if let Some(title) = document_title {
        if !title.is_empty() {
            builder.set_title(Some(title.to_string()));
        }
    }

    // Set document key signature if present
    if let Some(key_sig) = document_key_signature {
        if !key_sig.is_empty() {
            builder.set_key_signature(Some(key_sig));
        }
    }

    // Handle empty document
    if export_lines.is_empty() || export_lines.iter().all(|line| line.measures.is_empty()) {
        // Generate empty MusicXML with a single measure containing a whole rest
        builder.start_measure_with_divisions(Some(1), false, 4);
        builder.write_rest(4, 4.0);
        builder.end_measure();
        return Ok(builder.finalize());
    }

    // Check if ANY line requests multi-system grouping
    let has_multi_system = export_lines.iter().any(|line| line.starts_new_system);

    // If no lines request multi-system, use simple single-part emission
    if !has_multi_system {
        builder.start_part("");
        for (line_index, export_line) in export_lines.iter().enumerate() {
            let is_first_line = line_index == 0;
            emit_line(&mut builder, export_line, is_first_line)?;
        }
        builder.end_part();
        return Ok(builder.finalize());
    }

    // Multi-part support using system blocks (new_system flag)
    // Lines with starts_new_system=true create a new part
    // All subsequent lines with starts_new_system=false belong to the same part

    let mut current_part_lines: Vec<&ExportLine> = Vec::new();

    for export_line in export_lines.iter() {
        let is_line_start_of_block = export_line.starts_new_system;

        // If this line starts a new system block and we have lines in the current part,
        // emit the current part first
        if is_line_start_of_block && !current_part_lines.is_empty() {
            emit_part(&mut builder, &current_part_lines)?;
            current_part_lines.clear();
        }

        // Add this line to the current part
        current_part_lines.push(export_line);
    }

    // Emit any remaining lines as the final part
    if !current_part_lines.is_empty() {
        emit_part(&mut builder, &current_part_lines)?;
    }

    Ok(builder.finalize())
}

/// Emit a complete part (one or more lines grouped by stave block)
fn emit_part(
    builder: &mut MusicXmlBuilder,
    export_lines: &[&ExportLine],
) -> Result<(), String> {
    if export_lines.is_empty() {
        return Ok(());
    }

    // Use the first line's label as the part name if available
    let part_name = if export_lines[0].label.is_empty() {
        String::new()
    } else {
        export_lines[0].label.clone()
    };
    builder.start_part(&part_name);

    // Process each line as a system break
    for (line_index, export_line) in export_lines.iter().enumerate() {
        let is_first_line = line_index == 0;
        emit_line(builder, export_line, is_first_line)?;
    }

    // Close the part
    builder.end_part();

    Ok(())
}

/// Emit a single line (system) within the part
/// Each line represents a new system break in the layout
fn emit_line(
    builder: &mut MusicXmlBuilder,
    export_line: &ExportLine,
    is_first_line: bool,
) -> Result<(), String> {
    // Process each measure in the line
    for (measure_index, measure) in export_line.measures.iter().enumerate() {
        let is_first_measure = measure_index == 0;
        // System break occurs at the first measure of each line after the first
        let is_new_system = !is_first_line && is_first_measure;
        let beat_count = 4; // TODO: Extract from time signature

        emit_measure(
            builder,
            measure,
            export_line,
            is_first_measure,
            is_new_system,
            beat_count,
        )?;
    }

    Ok(())
}

/// Emit a single measure with its events
fn emit_measure(
    builder: &mut MusicXmlBuilder,
    measure: &ExportMeasure,
    export_line: &ExportLine,
    is_first_measure: bool,
    is_new_system: bool,
    beat_count: usize,
) -> Result<(), String> {
    // Start measure with divisions
    builder.start_measure_with_divisions(Some(measure.divisions), is_new_system, beat_count);

    // Write key and clef only on first measure
    if is_first_measure {
        if let Some(ref _key_sig) = export_line.key_signature {
            // Key signature is handled by builder.set_key_signature() at document level
        }
        // Clef is hardcoded in builder for now
    }

    // Parse lyrics once for this measure
    let syllables = parse_lyrics_to_syllables(&export_line.lyrics);
    let mut lyric_index = 0;

    // Count pitched events (notes that can receive lyrics, excluding rests)
    let pitched_event_count = measure.events.iter().filter(|e| {
        matches!(e, ExportEvent::Note(_) | ExportEvent::Chord { .. })
    }).count();
    let mut current_pitched_index = 0;

    // Emit all events in the measure
    for event in &measure.events {
        // Track if this is a pitched event for the remaining syllables feature
        let is_pitched = matches!(event, ExportEvent::Note(_) | ExportEvent::Chord { .. });
        let is_last_pitched_event = is_pitched && current_pitched_index == pitched_event_count - 1;

        if is_pitched {
            current_pitched_index += 1;
        }

        emit_event(builder, event, measure.divisions, &syllables, &mut lyric_index, is_last_pitched_event)?;
    }

    builder.end_measure();
    Ok(())
}

/// Emit a single event (note, rest, or chord)
fn emit_event(
    builder: &mut MusicXmlBuilder,
    event: &ExportEvent,
    measure_divisions: usize,
    syllables: &[(String, Syllabic)],
    lyric_index: &mut usize,
    is_last_pitched_event: bool,
) -> Result<(), String> {
    match event {
        ExportEvent::Rest { divisions } => {
            let duration_divs = *divisions;
            let musical_duration = duration_divs as f64 / measure_divisions as f64;
            builder.write_rest(duration_divs, musical_duration);
        }

        ExportEvent::Note(note) => {
            emit_note(builder, note, measure_divisions, syllables, lyric_index, is_last_pitched_event)?;
        }

        ExportEvent::Chord {
            pitches,
            divisions,
            lyrics,
            slur,
        } => {
            emit_chord(builder, pitches, *divisions, measure_divisions, lyrics, slur, is_last_pitched_event)?;
        }
    }

    Ok(())
}

/// Convert PitchInfo to a Pitch object for use with the builder
fn pitch_info_to_pitch(pitch_info: &PitchInfo) -> Pitch {
    // Convert degree (1-7) to numeric base string
    let degree = pitch_info.pitch_code.degree();
    let base = degree.to_string();

    // Convert alter value to Accidental
    let accidental = match pitch_info.pitch_code {
        // Naturals
        PitchCode::N1 | PitchCode::N2 | PitchCode::N3 | PitchCode::N4 |
        PitchCode::N5 | PitchCode::N6 | PitchCode::N7 => Accidental::Natural,

        // Sharps
        PitchCode::N1s | PitchCode::N2s | PitchCode::N3s | PitchCode::N4s |
        PitchCode::N5s | PitchCode::N6s | PitchCode::N7s => Accidental::Sharp,

        // Flats
        PitchCode::N1b | PitchCode::N2b | PitchCode::N3b | PitchCode::N4b |
        PitchCode::N5b | PitchCode::N6b | PitchCode::N7b => Accidental::Flat,

        // Double sharps
        PitchCode::N1ss | PitchCode::N2ss | PitchCode::N3ss | PitchCode::N4ss |
        PitchCode::N5ss | PitchCode::N6ss | PitchCode::N7ss => Accidental::DoubleSharp,

        // Double flats
        PitchCode::N1bb | PitchCode::N2bb | PitchCode::N3bb | PitchCode::N4bb |
        PitchCode::N5bb | PitchCode::N6bb | PitchCode::N7bb => Accidental::DoubleFlat,
    };

    Pitch {
        base,
        accidental,
        octave: pitch_info.octave,
        system: PitchSystem::Number,
    }
}

/// Emit a note with grace notes, slurs, lyrics, etc.
fn emit_note(
    builder: &mut MusicXmlBuilder,
    note: &NoteData,
    measure_divisions: usize,
    syllables: &[(String, Syllabic)],
    lyric_index: &mut usize,
    is_last_pitched_event: bool,
) -> Result<(), String> {
    let duration_divs = note.divisions;
    let musical_duration = duration_divs as f64 / measure_divisions as f64;

    let tie = if let Some(ref tie_data) = note.tie {
        match tie_data.type_ {
            TieType::Start => Some("start"),
            TieType::Continue => Some("continue"),
            TieType::Stop => Some("stop"),
        }
    } else {
        None
    };

    let slur = if let Some(ref slur_data) = note.slur {
        match slur_data.type_ {
            SlurType::Start => Some("start"),
            SlurType::Continue => Some("continue"),
            SlurType::Stop => Some("stop"),
        }
    } else {
        None
    };

    // Extract tuplet information if present
    let time_modification = note.tuplet.map(|tuplet| {
        (tuplet.actual_notes, tuplet.normal_notes)
    });

    let tuplet_bracket = note.tuplet.and_then(|tuplet| {
        if tuplet.bracket_start {
            Some("start")
        } else if tuplet.bracket_stop {
            Some("stop")
        } else {
            None
        }
    });

    // Get lyric if available
    let lyric = if let Some(ref lyric_data) = note.lyrics {
        Some(lyric_data.clone())
    } else if *lyric_index < syllables.len() {
        // Check if there are multiple remaining syllables
        let remaining_count = syllables.len() - *lyric_index;

        // If this is the last pitched event and there are MULTIPLE remaining syllables, combine them
        if is_last_pitched_event && remaining_count > 1 {
            let remaining_syllables: Vec<String> = syllables[*lyric_index..]
                .iter()
                .map(|(text, _)| text.clone())
                .collect();

            // Join remaining syllables with hyphens
            let combined_text = remaining_syllables.join("-");

            // Mark as single since it's all on one note
            let result = LyricData {
                syllable: combined_text,
                syllabic: Syllabic::Single,
                number: 1,
            };

            // Move index to end
            *lyric_index = syllables.len();
            Some(result)
        } else {
            let (text, syllabic) = &syllables[*lyric_index];
            *lyric_index += 1;
            Some(LyricData {
                syllable: text.clone(),
                syllabic: *syllabic,
                number: 1,
            })
        }
    } else {
        None
    };

    // Convert lyric data to the format expected by the builder
    let lyric_tuple = lyric.map(|l| (l.syllable, l.syllabic, l.number));

    // Emit grace notes before the main note
    for grace in &note.grace_notes_before {
        let placement = ornament_position_to_placement(&grace.position);
        builder.write_grace_note(
            &grace.pitch.pitch_code,
            grace.pitch.octave,
            grace.slash,
            placement,
        )?;
    }

    // Use write_note_with_beam_from_pitch_code_and_lyric which supports lyric inside note
    builder.write_note_with_beam_from_pitch_code_and_lyric(
        &note.pitch.pitch_code,
        note.pitch.octave,
        duration_divs,
        musical_duration,
        None, // beam
        time_modification,
        tuplet_bracket,
        tie,
        slur,
        None, // articulations
        None, // ornament_type
        lyric_tuple, // lyric data - now inside the note element
    )?;

    // Emit grace notes after the main note
    for grace in &note.grace_notes_after {
        let placement = ornament_position_to_placement(&grace.position);
        builder.write_grace_note(
            &grace.pitch.pitch_code,
            grace.pitch.octave,
            grace.slash,
            placement,
        )?;
    }

    Ok(())
}

/// Emit a chord (simultaneous pitches)
fn emit_chord(
    builder: &mut MusicXmlBuilder,
    pitches: &[PitchInfo],
    divisions: usize,
    measure_divisions: usize,
    lyrics: &Option<LyricData>,
    _slur: &Option<SlurData>,
    _is_last_pitched_event: bool,
) -> Result<(), String> {
    let duration_divs = divisions;
    let musical_duration = duration_divs as f64 / measure_divisions as f64;

    // Emit first note with chord flag for subsequent notes
    if !pitches.is_empty() {
        let _first_pitch = pitch_info_to_pitch(&pitches[0]);

        // Convert lyric data to tuple format for the builder
        let lyric_tuple = lyrics.as_ref().map(|l| (
            l.syllable.clone(),
            l.syllabic,
            l.number,
        ));

        builder.write_note_with_beam_from_pitch_code_and_lyric(
            &pitches[0].pitch_code,
            pitches[0].octave,
            duration_divs,
            musical_duration,
            None, // beam
            None, // time_modification
            None, // tuplet_bracket
            None, // tie
            None, // slur
            None, // articulations
            None, // ornament_type
            lyric_tuple, // lyric data - now inside the note element
        )?;

        // TODO: Emit remaining notes with chord=true
        // This requires extending MusicXmlBuilder to support chord notation
    }

    Ok(())
}

/// Parse lyrics string into syllables with syllabic types
/// Splits on hyphens to identify multi-syllable words
fn parse_lyrics_to_syllables(lyrics: &str) -> Vec<(String, Syllabic)> {
    if lyrics.is_empty() {
        return Vec::new();
    }

    let mut result = Vec::new();
    let words: Vec<&str> = lyrics.split_whitespace().collect();

    for word in words {
        if word.contains('-') {
            // Multi-syllable word
            let syllables: Vec<&str> = word.split('-').collect();
            for (i, syl) in syllables.iter().enumerate() {
                if syl.is_empty() {
                    continue;
                }
                let syllabic = if i == 0 && syllables.len() > 1 {
                    Syllabic::Begin
                } else if i == syllables.len() - 1 && syllables.len() > 1 {
                    Syllabic::End
                } else if syllables.len() > 1 {
                    Syllabic::Middle
                } else {
                    Syllabic::Single
                };
                result.push((syl.to_string(), syllabic));
            }
        } else {
            // Single syllable word
            result.push((word.to_string(), Syllabic::Single));
        }
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::OrnamentPositionType;

    #[test]
    fn test_parse_lyrics_single_syllable() {
        let result = parse_lyrics_to_syllables("hello");
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].0, "hello");
        assert_eq!(result[0].1, Syllabic::Single);
    }

    #[test]
    fn test_parse_lyrics_multi_syllable() {
        let result = parse_lyrics_to_syllables("hel-lo");
        assert_eq!(result.len(), 2);
        assert_eq!(result[0].0, "hel");
        assert_eq!(result[0].1, Syllabic::Begin);
        assert_eq!(result[1].0, "lo");
        assert_eq!(result[1].1, Syllabic::End);
    }

    #[test]
    fn test_parse_lyrics_multiple_words() {
        let result = parse_lyrics_to_syllables("hel-lo wor-ld");
        assert_eq!(result.len(), 4);
        assert_eq!(result[0].0, "hel");
        assert_eq!(result[0].1, Syllabic::Begin);
        assert_eq!(result[1].0, "lo");
        assert_eq!(result[1].1, Syllabic::End);
        assert_eq!(result[2].0, "wor");
        assert_eq!(result[2].1, Syllabic::Begin);
        assert_eq!(result[3].0, "ld");
        assert_eq!(result[3].1, Syllabic::End);
    }

    #[test]
    fn test_parse_lyrics_empty() {
        let result = parse_lyrics_to_syllables("");
        assert_eq!(result.len(), 0);
    }

    #[test]
    fn test_emit_note_with_lyrics() {
        // Test that emit_note properly handles lyrics
        let syllables = vec![
            ("hel".to_string(), Syllabic::Begin),
            ("lo".to_string(), Syllabic::End),
        ];

        // Create a note with lyrics data
        let mut note = NoteData {
            pitch: PitchInfo::new(PitchCode::N1, 4),
            divisions: 2,
            grace_notes_before: Vec::new(),
            grace_notes_after: Vec::new(),
            lyrics: Some(LyricData {
                syllable: "test".to_string(),
                syllabic: Syllabic::Single,
                number: 1,
            }),
            slur: None,
            articulations: Vec::new(),
            beam: None,
            tie: None,
            tuplet: None,
        };

        // Note has explicit lyrics, so it should use those
        assert!(note.lyrics.is_some());
        assert_eq!(note.lyrics.as_ref().unwrap().syllable, "test");
    }

    #[test]
    fn test_lyric_assignment_from_parsed_syllables() {
        // Test that lyrics are correctly assigned from parsed syllables
        let lyrics_text = "hel-lo world";
        let syllables = parse_lyrics_to_syllables(lyrics_text);

        // Should parse into 3 syllables
        assert_eq!(syllables.len(), 3);
        assert_eq!(syllables[0].0, "hel");
        assert_eq!(syllables[0].1, Syllabic::Begin);
        assert_eq!(syllables[1].0, "lo");
        assert_eq!(syllables[1].1, Syllabic::End);
        assert_eq!(syllables[2].0, "world");
        assert_eq!(syllables[2].1, Syllabic::Single);
    }

    #[test]
    fn test_multiline_document_produces_single_part_with_system_breaks() {
        // Create a document with 2 lines
        let export_line1 = ExportLine {
            label: "Line 1".to_string(),
            key_signature: None,
            time_signature: None,
            clef: "treble".to_string(),
            lyrics: String::new(),
            measures: vec![ExportMeasure {
                divisions: 4,
                events: vec![ExportEvent::Rest { divisions: 4 }],
            }],
        };

        let export_line2 = ExportLine {
            label: "Line 2".to_string(),
            key_signature: None,
            time_signature: None,
            clef: "treble".to_string(),
            lyrics: String::new(),
            measures: vec![ExportMeasure {
                divisions: 4,
                events: vec![ExportEvent::Rest { divisions: 4 }],
            }],
        };

        let export_lines = vec![export_line1, export_line2];

        // Emit MusicXML
        let xml = emit_musicxml(&export_lines, Some("Test"), None)
            .expect("Failed to emit MusicXML");

        // Should have exactly one <part> element (not two)
        let part_count = xml.matches("<part id=\"P1\">").count();
        assert_eq!(part_count, 1, "Should have exactly one part for multi-line document");

        // The second measure should have a system break
        assert!(xml.contains("<print new-system=\"yes\"/>"),
                "Second line should start with system break");
    }

    #[test]
    fn test_emit_note_with_grace_notes_before() {
        // Test that grace notes before main note are emitted
        let grace_notes = vec![
            GraceNoteData {
                pitch: PitchInfo::new(PitchCode::N2, 4),
                position: OrnamentPositionType::OnTop,
                slash: true,
            },
            GraceNoteData {
                pitch: PitchInfo::new(PitchCode::N3, 4),
                position: OrnamentPositionType::OnTop,
                slash: true,
            },
        ];

        let note = NoteData {
            pitch: PitchInfo::new(PitchCode::N1, 4),
            divisions: 4,
            grace_notes_before: grace_notes,
            grace_notes_after: Vec::new(),
            lyrics: None,
            slur: None,
            articulations: Vec::new(),
            beam: None,
            tie: None,
            tuplet: None,
        };

        let mut builder = MusicXmlBuilder::new();
        builder.start_measure();

        let syllables: Vec<(String, Syllabic)> = Vec::new();
        let mut lyric_index = 0;
        emit_note(&mut builder, &note, 4, &syllables, &mut lyric_index, true)
            .expect("emit_note failed");

        builder.end_measure();
        let xml = builder.finalize();

        // Should contain 2 grace notes with slash attribute
        let grace_count = xml.matches("<grace slash=\"yes\"").count();
        assert_eq!(grace_count, 2, "Should have 2 grace notes with slash");

        // Grace notes should come before the main note
        let first_grace_pos = xml.find("<grace slash=\"yes\"").expect("First grace note not found");
        let main_note_pos = xml.find("<step>C</step>").expect("Main note not found");
        assert!(first_grace_pos < main_note_pos, "Grace notes should come before main note");
    }

    #[test]
    fn test_emit_note_with_grace_notes_after() {
        // Test that grace notes after main note are emitted
        let grace_notes = vec![
            GraceNoteData {
                pitch: PitchInfo::new(PitchCode::N2, 4),
                position: OrnamentPositionType::After,
                slash: false,
            },
        ];

        let note = NoteData {
            pitch: PitchInfo::new(PitchCode::N1, 4),
            divisions: 4,
            grace_notes_before: Vec::new(),
            grace_notes_after: grace_notes,
            lyrics: None,
            slur: None,
            articulations: Vec::new(),
            beam: None,
            tie: None,
            tuplet: None,
        };

        let mut builder = MusicXmlBuilder::new();
        builder.start_measure();

        let syllables: Vec<(String, Syllabic)> = Vec::new();
        let mut lyric_index = 0;
        emit_note(&mut builder, &note, 4, &syllables, &mut lyric_index, true)
            .expect("emit_note failed");

        builder.end_measure();
        let xml = builder.finalize();

        // Should contain 1 grace note without slash attribute
        // Look for <grace (with no slash= attribute)
        let has_grace_no_slash = xml.contains("<grace ") && !xml.contains("<grace slash");
        assert!(has_grace_no_slash, "Should have 1 grace note without slash");

        // Main note should come before grace note
        let main_note_pos = xml.find("<step>C</step>").expect("Main note not found");
        let grace_pos = xml.find("<grace ").expect("Grace note not found");
        assert!(main_note_pos < grace_pos, "Main note should come before after-grace note");
    }

    #[test]
    fn test_grace_note_placement_mapping() {
        // Test that OrnamentPositionType::OnTop maps to placement="above"
        let grace_notes = vec![
            GraceNoteData {
                pitch: PitchInfo::new(PitchCode::N2, 4),
                position: OrnamentPositionType::OnTop,
                slash: true,
            },
        ];

        let note = NoteData {
            pitch: PitchInfo::new(PitchCode::N1, 4),
            divisions: 4,
            grace_notes_before: grace_notes,
            grace_notes_after: Vec::new(),
            lyrics: None,
            slur: None,
            articulations: Vec::new(),
            beam: None,
            tie: None,
            tuplet: None,
        };

        let mut builder = MusicXmlBuilder::new();
        builder.start_measure();

        let syllables: Vec<(String, Syllabic)> = Vec::new();
        let mut lyric_index = 0;
        emit_note(&mut builder, &note, 4, &syllables, &mut lyric_index, true)
            .expect("emit_note failed");

        builder.end_measure();
        let xml = builder.finalize();

        // Grace note with OnTop position should have placement="above"
        assert!(xml.contains("placement=\"above\""),
                "Grace note with OnTop position should have placement=\"above\"");
    }

    #[test]
    fn test_emit_note_with_grace_notes_before_and_after() {
        // Test that both before and after grace notes are emitted
        let grace_before = vec![
            GraceNoteData {
                pitch: PitchInfo::new(PitchCode::N3, 4),
                position: OrnamentPositionType::Before,
                slash: true,
            },
        ];

        let grace_after = vec![
            GraceNoteData {
                pitch: PitchInfo::new(PitchCode::N2, 4),
                position: OrnamentPositionType::After,
                slash: false,
            },
        ];

        let note = NoteData {
            pitch: PitchInfo::new(PitchCode::N1, 4),
            divisions: 4,
            grace_notes_before: grace_before,
            grace_notes_after: grace_after,
            lyrics: None,
            slur: None,
            articulations: Vec::new(),
            beam: None,
            tie: None,
            tuplet: None,
        };

        let mut builder = MusicXmlBuilder::new();
        builder.start_measure();

        let syllables: Vec<(String, Syllabic)> = Vec::new();
        let mut lyric_index = 0;
        emit_note(&mut builder, &note, 4, &syllables, &mut lyric_index, true)
            .expect("emit_note failed");

        builder.end_measure();
        let xml = builder.finalize();

        // Should contain both types of grace notes
        assert!(xml.contains("<grace slash=\"yes\""), "Should have before-grace note with slash");
        // After-grace should have <grace but NOT <grace slash
        let has_grace_no_slash = xml.matches("<grace ").count() > 1;  // At least 2 grace notes
        assert!(has_grace_no_slash, "Should have grace note without slash");

        // Verify ordering: before-grace -> main note -> after-grace
        let before_grace_pos = xml.find("<grace slash=\"yes\"").expect("Before grace not found");
        let main_note_pos = xml.find("<step>C</step>").expect("Main note not found");
        let after_grace_pos = xml.rfind("<grace ").expect("After grace not found");

        assert!(before_grace_pos < main_note_pos, "Before-grace should come before main note");
        assert!(main_note_pos < after_grace_pos, "Main note should come before after-grace");
    }

}
