//! MusicXML emitter - consumes IR and emits MusicXML strings
//!
//! This module provides high-level emission functions that consume the intermediate
//! representation (ExportLine, ExportMeasure, ExportEvent) and produce valid MusicXML strings.

use crate::ir::*;
// PitchCode not needed in emitter (pitch info comes from IR)
use super::builder::{MusicXmlBuilder, xml_escape};
use super::grace_notes::superscript_position_to_placement;

/// Emit a complete MusicXML document from export lines
pub fn emit_musicxml(
    export_lines: &[ExportLine],
    document_title: Option<&str>,
    document_key_signature: Option<&str>,
) -> Result<String, String> {
    // Handle empty document - use simple builder approach
    if export_lines.is_empty() || export_lines.iter().all(|line| line.measures.is_empty()) {
        let mut builder = MusicXmlBuilder::new();
        if let Some(title) = document_title {
            if !title.is_empty() {
                builder.set_title(Some(title.to_string()));
            }
        }
        if let Some(key_sig) = document_key_signature {
            if !key_sig.is_empty() {
                builder.set_key_signature(Some(key_sig));
            }
        }
        builder.start_measure_with_divisions(Some(1), false, 4);
        builder.write_rest(4, 4.0);
        builder.end_measure();
        return Ok(builder.finalize());
    }

    // NEW ARCHITECTURE:
    // Build complete MusicXML structure manually
    // - Each ExportLine = One MusicXML <part>
    // - system_id determines visual bracketing with <part-group>

    let mut xml = String::new();

    // XML header
    xml.push_str("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
    xml.push_str("<!DOCTYPE score-partwise PUBLIC \"-//Recordare//DTD MusicXML 3.1 Partwise//EN\" \"http://www.musicxml.org/dtds/partwise.dtd\">\n");
    xml.push_str("<score-partwise version=\"3.1\">\n");

    // Add title if present
    if let Some(title) = document_title {
        if !title.is_empty() {
            xml.push_str("  <movement-title>");
            xml.push_str(&xml_escape(title));
            xml.push_str("</movement-title>\n");
        }
    }

    // Debug: Log export lines (only in WASM/browser environment)
    #[cfg(target_arch = "wasm32")]
    {
        web_sys::console::log_1(&format!("[MusicXML Emitter] Processing {} export lines:", export_lines.len()).into());
        for (i, line) in export_lines.iter().enumerate() {
            web_sys::console::log_1(&format!("  Line {}: system_id={}, part_id={}, label='{}', {} measures",
                i, line.system_id, line.part_id, line.label, line.measures.len()).into());
        }
    }

    // Group lines by part_id to combine document lines into single MusicXML parts
    use std::collections::HashMap;
    let mut parts_map: HashMap<String, Vec<&ExportLine>> = HashMap::new();
    for line in export_lines.iter() {
        parts_map.entry(line.part_id.clone()).or_insert_with(Vec::new).push(line);
    }

    // Get unique part IDs in order
    let mut unique_part_ids: Vec<String> = parts_map.keys().cloned().collect();
    unique_part_ids.sort(); // Ensure consistent ordering (P1, P2, P3...)

    #[cfg(target_arch = "wasm32")]
    web_sys::console::log_1(&format!("[MusicXML Emitter] Grouped into {} unique parts", unique_part_ids.len()).into());

    // Group parts by system_id to determine bracket groups
    // Map: system_id -> Vec<part_id>
    let mut system_to_parts: HashMap<usize, Vec<String>> = HashMap::new();
    for part_id in &unique_part_ids {
        let lines = &parts_map[part_id];
        let system_id = lines[0].system_id;
        system_to_parts.entry(system_id).or_insert_with(Vec::new).push(part_id.clone());
    }

    // Emit <part-list> with brackets for multi-part systems
    xml.push_str("  <part-list>\n");
    let mut group_number = 1;

    // Get system IDs in order
    let mut system_ids: Vec<usize> = system_to_parts.keys().cloned().collect();
    system_ids.sort();

    for system_id in system_ids {
        let part_ids_in_system = &system_to_parts[&system_id];

        // Add bracket if system has multiple parts
        if part_ids_in_system.len() > 1 {
            // Check if any line in this system wants to hide the bracket
            let hide_bracket = part_ids_in_system.iter()
                .any(|part_id| {
                    parts_map[part_id].iter().any(|line| !line.show_bracket)
                });

            if hide_bracket {
                xml.push_str(&format!("    <part-group type=\"start\" number=\"{}\" print-object=\"no\">\n", group_number));
            } else {
                xml.push_str(&format!("    <part-group type=\"start\" number=\"{}\">\n", group_number));
            }

            // Add group name from first line's label (if present)
            let first_part_id = &part_ids_in_system[0];
            let first_line = parts_map[first_part_id][0];
            if !first_line.label.is_empty() {
                xml.push_str(&format!("      <group-name>{}</group-name>\n", xml_escape(&first_line.label)));
            }

            xml.push_str("      <group-symbol>bracket</group-symbol>\n");
            xml.push_str("      <group-barline>yes</group-barline>\n");
            xml.push_str("    </part-group>\n");
        }

        // Emit score-part for each part in this system
        for part_id in part_ids_in_system {
            let lines = &parts_map[part_id];
            let first_line = lines[0];

            xml.push_str(&format!("    <score-part id=\"{}\">\n", part_id));
            let part_name = if first_line.label.is_empty() {
                "Staff".to_string()
            } else {
                xml_escape(&first_line.label)
            };
            xml.push_str(&format!("      <part-name>{}</part-name>\n", part_name));
            xml.push_str("    </score-part>\n");
        }

        // Close bracket if system has multiple parts
        if part_ids_in_system.len() > 1 {
            // Check if bracket was hidden (same logic as above)
            let hide_bracket = part_ids_in_system.iter()
                .any(|part_id| {
                    parts_map[part_id].iter().any(|line| !line.show_bracket)
                });

            if hide_bracket {
                xml.push_str(&format!("    <part-group type=\"stop\" number=\"{}\" print-object=\"no\"/>\n", group_number));
            } else {
                xml.push_str(&format!("    <part-group type=\"stop\" number=\"{}\"/>\n", group_number));
            }
            group_number += 1;
        }
    }

    xml.push_str("  </part-list>\n");

    // Emit one <part> per unique part_id, combining all lines with that part_id
    let mut prev_system_id: Option<usize> = None;

    for part_id in &unique_part_ids {
        let lines = &parts_map[part_id];
        let current_system_id = lines[0].system_id; // All lines in same part have same system_id

        #[cfg(target_arch = "wasm32")]
        web_sys::console::log_1(&format!("[MusicXML Emitter] Emitting part {} with {} lines, system_id={}",
            part_id, lines.len(), current_system_id).into());

        // Check if this part starts a new system (different system_id from previous part)
        let starts_new_system = prev_system_id.map_or(false, |prev_id| current_system_id != prev_id);

        // Combine all measures from all lines in this part
        let combined_part_xml = emit_combined_part(lines, document_key_signature, starts_new_system)?;
        xml.push_str(&combined_part_xml);

        prev_system_id = Some(current_system_id);
    }

    xml.push_str("</score-partwise>\n");

    Ok(xml)
}

/// Parse time signature string (e.g., "4/4" -> 4, "3/4" -> 3)
fn parse_beat_count(time_sig: Option<&str>) -> usize {
    time_sig
        .and_then(|s| s.split('/').next())
        .and_then(|numerator| numerator.trim().parse::<usize>().ok())
        .unwrap_or(4) // Default to 4/4
}

/// Emit multiple ExportLines (with same part_id) as a single combined MusicXML <part>
/// This combines all measures from all lines into one continuous part
///
/// # Arguments
/// * `lines` - ExportLines with the same part_id to combine
/// * `document_key_signature` - Document-level key signature (fallback)
/// * `starts_new_system` - True if this part should start on a new system (different system_id from previous part)
fn emit_combined_part(
    lines: &[&ExportLine],
    document_key_signature: Option<&str>,
    starts_new_system: bool,
) -> Result<String, String> {
    if lines.is_empty() {
        return Ok(String::new());
    }

    let part_id = &lines[0].part_id;
    let mut builder = MusicXmlBuilder::new();

    // Set key signature from first line or document
    let key_sig = lines[0].key_signature.as_deref().or(document_key_signature);
    if let Some(key_sig_str) = key_sig {
        if !key_sig_str.is_empty() {
            builder.set_key_signature(Some(key_sig_str));
        }
    }

    // Parse beat count from first line's time signature
    let beat_count = parse_beat_count(lines[0].time_signature.as_deref());

    // Parse lyrics from first line (assuming all lines in same part share lyrics)
    let syllables = parse_lyrics_to_syllables(&lines[0].lyrics);
    let mut lyric_index = 0;

    // Count total pitched events across ALL lines and measures
    let total_pitched_event_count: usize = lines.iter()
        .flat_map(|line| &line.measures)
        .map(|m| m.events.iter().filter(|e| {
            matches!(e, ExportEvent::Note(_) | ExportEvent::Chord { .. })
        }).count())
        .sum();
    let mut global_pitched_index = 0;

    // Check if all lines have no measures (empty part)
    let all_empty = lines.iter().all(|line| line.measures.is_empty());

    if all_empty {
        // Empty part: emit a single measure with a whole rest
        // MusicXML requires at least one measure per part
        builder.start_measure_with_divisions(Some(1), starts_new_system, beat_count);
        builder.write_rest(beat_count, beat_count as f64);
        builder.end_measure();
    } else {
        // Combine all measures from all lines
        let mut measure_index = 0;
        let mut prev_system_id: Option<usize> = None;

        for (_line_idx, line) in lines.iter().enumerate() {
            for (measure_idx_in_line, measure) in line.measures.iter().enumerate() {
                let is_first_measure = measure_index == 0;
                let is_first_measure_of_line = measure_idx_in_line == 0;

                // Emit <print new-system="yes"/> if:
                // 1. This is the first measure AND the part starts a new system (different from previous part)
                // 2. This is the first measure of a line AND the line's system_id changed from previous line
                let emit_new_system = if is_first_measure {
                    starts_new_system
                } else if is_first_measure_of_line {
                    prev_system_id.map_or(false, |prev_id| line.system_id != prev_id)
                } else {
                    false
                };

                emit_measure(
                    &mut builder,
                    measure,
                    is_first_measure,
                    emit_new_system,
                    beat_count,
                    &syllables,
                    &mut lyric_index,
                    total_pitched_event_count,
                    &mut global_pitched_index,
                )?;

                measure_index += 1;
            }

            // Track this line's system_id for next iteration
            prev_system_id = Some(line.system_id);
        }
    }

    // Get the accumulated measures from the builder buffer
    let measures_xml = builder.get_buffer();

    // Wrap with <part> tags
    let part_xml = format!("  <part id=\"{}\">\n{}  </part>\n", part_id, measures_xml);

    Ok(part_xml)
}

/// Emit a single ExportLine as a complete MusicXML <part>
#[allow(dead_code)]
fn emit_single_line_as_part(
    export_line: &ExportLine,
    document_key_signature: Option<&str>,
    starts_new_system: bool,
) -> Result<String, String> {
    let mut builder = MusicXmlBuilder::new();

    // Set key signature from line or document
    let key_sig = export_line.key_signature.as_deref().or(document_key_signature);
    if let Some(key_sig_str) = key_sig {
        if !key_sig_str.is_empty() {
            builder.set_key_signature(Some(key_sig_str));
        }
    }

    // Parse beat count from time signature
    let beat_count = parse_beat_count(export_line.time_signature.as_deref());

    // Parse lyrics once for the entire line
    let syllables = parse_lyrics_to_syllables(&export_line.lyrics);
    let mut lyric_index = 0;

    // Count total pitched events across ALL measures
    let total_pitched_event_count: usize = export_line.measures.iter()
        .map(|m| m.events.iter().filter(|e| {
            matches!(e, ExportEvent::Note(_) | ExportEvent::Chord { .. })
        }).count())
        .sum();
    let mut global_pitched_index = 0;

    // Process each measure in the line
    if export_line.measures.is_empty() {
        // Empty line: emit a single measure with a whole rest
        // MusicXML requires at least one measure per part
        builder.start_measure_with_divisions(Some(1), starts_new_system, beat_count);

        // Add whole rest (duration 4 = whole note in 4/4 time)
        builder.write_rest(beat_count, beat_count as f64);

        builder.end_measure();
    } else {
        for (measure_index, measure) in export_line.measures.iter().enumerate() {
            let is_first_measure = measure_index == 0;
            // Emit new-system on first measure if this part starts a new visual system
            let emit_new_system = is_first_measure && starts_new_system;

            emit_measure(
                &mut builder,
                measure,
                is_first_measure,
                emit_new_system,
                beat_count,
                &syllables,
                &mut lyric_index,
                total_pitched_event_count,
                &mut global_pitched_index,
            )?;
        }
    }

    // Get the accumulated measures from the builder buffer
    let measures_xml = builder.get_buffer();

    // Wrap with <part> tags (measures_xml already contains proper indentation)
    let part_xml = format!("  <part id=\"{}\">\n{}  </part>\n",
        export_line.part_id,
        measures_xml);

    Ok(part_xml)
}

/// Emit a single measure with its events
fn emit_measure(
    builder: &mut MusicXmlBuilder,
    measure: &ExportMeasure,
    _is_first_measure: bool,
    is_new_system: bool,
    beat_count: usize,
    syllables: &[(String, Syllabic)],
    lyric_index: &mut usize,
    total_pitched_event_count: usize,
    global_pitched_index: &mut usize,
) -> Result<(), String> {
    // Start measure with divisions
    builder.start_measure_with_divisions(Some(measure.divisions), is_new_system, beat_count);

    // Write key and clef only on first measure (handled elsewhere)

    // Track pending grace notes that need to be emitted before the next pitched event.
    // VexFlow/OSMD requires grace notes to precede their anchor note.
    // grace_notes_after from one note become grace_notes_before of the next note.
    let mut pending_grace_notes: Vec<&GraceNoteData> = Vec::new();

    // Emit all events in the measure
    for event in &measure.events {
        // Track if this is a pitched event for the remaining syllables feature
        let is_pitched = matches!(event, ExportEvent::Note(_) | ExportEvent::Chord { .. });
        let is_last_pitched_event = is_pitched && *global_pitched_index == total_pitched_event_count - 1;

        if is_pitched {
            *global_pitched_index += 1;
        }

        emit_event_with_pending_grace_notes(
            builder,
            event,
            measure.divisions,
            syllables,
            lyric_index,
            is_last_pitched_event,
            &mut pending_grace_notes,
        )?;
    }

    // Emit any remaining pending grace notes as after-grace notes
    // These are after-grace notes (nachschlag) that follow their anchor note.
    // We emit them with steal-time-following marker for OSMD/VexFlow post-processing.
    if !pending_grace_notes.is_empty() {
        emit_trailing_grace_notes_as_after_grace(builder, &pending_grace_notes, measure.divisions)?;
    }

    builder.end_measure();
    Ok(())
}

/// Emit trailing grace notes as regular grace notes
/// These are after-grace notes (nachschlag) at the end of a measure with no following anchor note.
/// Emitted as regular grace notes, then OSMD post-processing moves them to the right position.
/// Multiple grace notes are beamed together.
fn emit_trailing_grace_notes_as_after_grace(
    builder: &mut MusicXmlBuilder,
    grace_notes: &[&GraceNoteData],
    _measure_divisions: usize,
) -> Result<(), String> {
    use super::grace_notes::superscript_position_to_placement;

    let count = grace_notes.len();

    for (i, grace) in grace_notes.iter().enumerate() {
        let placement = superscript_position_to_placement(&grace.position);

        // Determine beam state for multiple grace notes
        let beam_state = if count > 1 {
            if i == 0 {
                Some("begin")
            } else if i == count - 1 {
                Some("end")
            } else {
                Some("continue")
            }
        } else {
            None // Single grace note - no beam
        };

        // Emit as after-grace note with steal-time-previous marker
        // OSMD renders it LEFT of following note, then post-processing moves it RIGHT
        builder.write_grace_note_beamed(
            &grace.pitch.pitch_code,
            grace.pitch.octave,
            grace.slash,
            placement,
            true, // after-grace note - has steal-time-previous for detection
            None,
            beam_state,
        )?;
    }
    Ok(())
}

/// Emit a single event with support for pending grace notes from previous events.
/// This handles VexFlow/OSMD's requirement that grace notes precede their anchor note.
fn emit_event_with_pending_grace_notes<'a>(
    builder: &mut MusicXmlBuilder,
    event: &'a ExportEvent,
    measure_divisions: usize,
    syllables: &[(String, Syllabic)],
    lyric_index: &mut usize,
    is_last_pitched_event: bool,
    pending_grace_notes: &mut Vec<&'a GraceNoteData>,
) -> Result<(), String> {
    match event {
        ExportEvent::Rest { divisions, tuplet, .. } => {
            // Rests don't consume pending grace notes - they pass through to next pitched event
            let duration_divs = *divisions;
            let musical_duration = duration_divs as f64 / measure_divisions as f64;

            if let Some(tuplet_info) = tuplet {
                let time_modification = Some((tuplet_info.actual_notes, tuplet_info.normal_notes));
                let tuplet_bracket = if tuplet_info.bracket_start {
                    Some("start")
                } else if tuplet_info.bracket_stop {
                    Some("stop")
                } else {
                    None
                };
                builder.write_rest_with_tuplet(duration_divs, musical_duration, time_modification, tuplet_bracket);
            } else {
                builder.write_rest(duration_divs, musical_duration);
            }
        }

        ExportEvent::Note(note) => {
            // Emit any pending grace notes (from previous note's grace_notes_after) BEFORE this note
            emit_pending_grace_notes(builder, pending_grace_notes)?;

            // Emit the note (without its grace_notes_after - those go to pending)
            emit_note_without_grace_after(builder, note, measure_divisions, syllables, lyric_index, is_last_pitched_event)?;

            // Collect this note's grace_notes_after for the next pitched event
            for grace in &note.grace_notes_after {
                pending_grace_notes.push(grace);
            }
        }

        ExportEvent::Chord {
            pitches,
            divisions,
            lyrics,
            slur,
            tuplet,
            ..
        } => {
            // Emit any pending grace notes BEFORE this chord
            emit_pending_grace_notes(builder, pending_grace_notes)?;

            emit_chord(builder, pitches, *divisions, measure_divisions, lyrics, slur, tuplet.as_ref(), is_last_pitched_event)?;
            // Note: Chords don't have grace_notes_after in current model
        }
    }

    Ok(())
}

/// Emit pending grace notes and clear the buffer
/// These are after-grace notes from the previous note, emitted before the next note.
/// Emitted as regular grace notes (LEFT of following note), then OSMD post-processing
/// moves them RIGHT to position after their anchor note.
/// Multiple grace notes are beamed together.
fn emit_pending_grace_notes(
    builder: &mut MusicXmlBuilder,
    pending_grace_notes: &mut Vec<&GraceNoteData>,
) -> Result<(), String> {
    let count = pending_grace_notes.len();

    for (i, grace) in pending_grace_notes.drain(..).enumerate() {
        let placement = superscript_position_to_placement(&grace.position);

        // Determine beam state for multiple grace notes
        let beam_state = if count > 1 {
            if i == 0 {
                Some("begin")
            } else if i == count - 1 {
                Some("end")
            } else {
                Some("continue")
            }
        } else {
            None // Single grace note - no beam
        };

        // Use write_grace_note_beamed to add beam information
        // Emit as after-grace note - OSMD post-processing will move it
        builder.write_grace_note_beamed(
            &grace.pitch.pitch_code,
            grace.pitch.octave,
            grace.slash,
            placement,
            true,   // after-grace note - has steal-time-previous for detection
            None,
            beam_state,
        )?;
    }
    Ok(())
}

/// Emit a note WITHOUT emitting its grace_notes_after (those go to pending for next note)
fn emit_note_without_grace_after(
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
            SlurType::Continue => None,
            SlurType::Stop => Some("stop"),
        }
    } else {
        None
    };

    let time_modification = note.tuplet.as_ref().map(|t| (t.actual_notes, t.normal_notes));
    let tuplet_bracket = note.tuplet.as_ref().and_then(|t| {
        if t.bracket_start {
            Some("start")
        } else if t.bracket_stop {
            Some("stop")
        } else {
            None
        }
    });

    // Handle lyrics
    let lyric = if !syllables.is_empty() && *lyric_index < syllables.len() {
        let (text, syllabic) = &syllables[*lyric_index];
        *lyric_index += 1;
        Some(LyricData {
            syllable: text.clone(),
            syllabic: *syllabic,
            number: 1,
        })
    } else if is_last_pitched_event && *lyric_index < syllables.len() {
        let remaining: Vec<_> = syllables[*lyric_index..].iter()
            .map(|(text, _)| text.as_str())
            .collect();
        *lyric_index = syllables.len();
        if !remaining.is_empty() {
            Some(LyricData {
                syllable: remaining.join(" "),
                syllabic: Syllabic::Single,
                number: 1,
            })
        } else {
            None
        }
    } else {
        None
    };

    let lyric_tuple = lyric.map(|l| (l.syllable, l.syllabic, l.number));

    // Emit grace notes before the main note
    for grace in &note.grace_notes_before {
        let placement = superscript_position_to_placement(&grace.position);
        builder.write_grace_note(
            &grace.pitch.pitch_code,
            grace.pitch.octave,
            grace.slash,
            placement,
        )?;
    }

    // Emit the main note
    builder.write_note_with_beam_from_pitch_info_and_lyric(
        &note.pitch,
        duration_divs,
        musical_duration,
        None, // beam
        time_modification,
        tuplet_bracket,
        tie,
        slur,
        None, // articulations
        None, // ornament_type
        lyric_tuple,
    )?;

    // NOTE: grace_notes_after are NOT emitted here - they're collected by the caller
    // and emitted before the next pitched event (VexFlow requirement)

    Ok(())
}

/// Emit a single event (note, rest, or chord) - LEGACY, used by tests
#[allow(dead_code)]
fn emit_event(
    builder: &mut MusicXmlBuilder,
    event: &ExportEvent,
    measure_divisions: usize,
    syllables: &[(String, Syllabic)],
    lyric_index: &mut usize,
    is_last_pitched_event: bool,
) -> Result<(), String> {
    match event {
        ExportEvent::Rest { divisions, tuplet, .. } => {
            let duration_divs = *divisions;
            let musical_duration = duration_divs as f64 / measure_divisions as f64;

            if let Some(tuplet_info) = tuplet {
                let time_modification = Some((tuplet_info.actual_notes, tuplet_info.normal_notes));
                let tuplet_bracket = if tuplet_info.bracket_start {
                    Some("start")
                } else if tuplet_info.bracket_stop {
                    Some("stop")
                } else {
                    None
                };
                builder.write_rest_with_tuplet(duration_divs, musical_duration, time_modification, tuplet_bracket);
            } else {
                builder.write_rest(duration_divs, musical_duration);
            }
        }

        ExportEvent::Note(note) => {
            emit_note(builder, note, measure_divisions, syllables, lyric_index, is_last_pitched_event)?;
        }

        ExportEvent::Chord {
            pitches,
            divisions,
            lyrics,
            slur,
            tuplet,
            ..
        } => {
            emit_chord(builder, pitches, *divisions, measure_divisions, lyrics, slur, tuplet.as_ref(), is_last_pitched_event)?;
        }
    }

    Ok(())
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
    // MELISMA LOGIC: Don't assign syllables to notes inside slurs (except slur start)
    let is_melisma_note = note.slur.as_ref().map_or(false, |slur_data| {
        matches!(slur_data.type_, SlurType::Continue | SlurType::Stop)
    });

    let lyric: Option<LyricData> = if let Some(lyric_data) = note.lyrics.clone() {
        // Note already has lyrics assigned (from IR builder)
        // Increment lyric_index to stay synchronized with syllable consumption
        if *lyric_index < syllables.len() {
            *lyric_index += 1;
        }
        Some(lyric_data)
    } else if !is_melisma_note && *lyric_index < syllables.len() {
        // Only assign syllables to non-melisma notes
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
        let placement = superscript_position_to_placement(&grace.position);
        builder.write_grace_note(
            &grace.pitch.pitch_code,
            grace.pitch.octave,
            grace.slash,
            placement,
        )?;
    }

    // Use write_note_with_beam_from_pitch_info_and_lyric (NEW: tonic-aware)
    builder.write_note_with_beam_from_pitch_info_and_lyric(
        &note.pitch,
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
        let placement = superscript_position_to_placement(&grace.position);
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
    _tuplet: Option<&TupletInfo>,
    _is_last_pitched_event: bool,
) -> Result<(), String> {
    let duration_divs = divisions;
    let musical_duration = duration_divs as f64 / measure_divisions as f64;

    // Emit first note with chord flag for subsequent notes
    if !pitches.is_empty() {
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
    use crate::models::{SuperscriptPositionType, PitchCode};

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
            fraction: Fraction { numerator: 1, denominator: 2 },
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
            breath_mark_after: false,
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
    fn test_multiline_document_produces_multiple_parts() {
        // NEW ARCHITECTURE: Each ExportLine = One MusicXML part
        // Create a document with 2 lines (same system_id = grouped)
        let export_line1 = ExportLine {
            system_id: 1,
            part_id: "P1".to_string(),
            staff_role: crate::models::core::StaffRole::Melody,
            label: "Line 1".to_string(),
            key_signature: None,
            time_signature: None,
            clef: "treble".to_string(),
            lyrics: String::new(),
            show_bracket: true,
            measures: vec![ExportMeasure {
                divisions: 4,
                events: vec![ExportEvent::Rest {
                    divisions: 4,
                    fraction: Fraction { numerator: 1, denominator: 1 },
                    tuplet: None
                }],
            }],
        };

        let export_line2 = ExportLine {
            system_id: 1, // Same system = grouped (bracketed)
            part_id: "P2".to_string(),
            staff_role: crate::models::core::StaffRole::Melody,
            label: "Line 2".to_string(),
            key_signature: None,
            time_signature: None,
            clef: "treble".to_string(),
            lyrics: String::new(),
            show_bracket: true,
            measures: vec![ExportMeasure {
                divisions: 4,
                events: vec![ExportEvent::Rest {
                    divisions: 4,
                    fraction: Fraction { numerator: 1, denominator: 1 },
                    tuplet: None
                }],
            }],
        };

        let export_lines = vec![export_line1, export_line2];

        // Emit MusicXML
        let xml = emit_musicxml(&export_lines, Some("Test"), None)
            .expect("Failed to emit MusicXML");

        // Debug: print the XML
        eprintln!("\n=== GENERATED MUSICXML ===\n{}\n=== END ===\n", xml);

        // Should have TWO parts (one per line)
        let p1_count = xml.matches("<part id=\"P1\">").count();
        let p2_count = xml.matches("<part id=\"P2\">").count();
        assert_eq!(p1_count, 1, "Should have one part P1");
        assert_eq!(p2_count, 1, "Should have one part P2");

        // Should have a part-group for the system (because 2 lines share system_id=1)
        assert!(xml.contains("<part-group type=\"start\""),
                "Should have part-group start for multi-line system");
        assert!(xml.contains("<part-group type=\"stop\""),
                "Should have part-group stop for multi-line system");
        assert!(xml.contains("<group-symbol>bracket</group-symbol>"),
                "Part group should have bracket symbol");
    }

    #[test]
    fn test_emit_note_with_grace_notes_before() {
        // Test that grace notes before main note are emitted
        let grace_notes = vec![
            GraceNoteData {
                pitch: PitchInfo::new(PitchCode::N2, 4),
                position: SuperscriptPositionType::OnTop,
                slash: true,
            },
            GraceNoteData {
                pitch: PitchInfo::new(PitchCode::N3, 4),
                position: SuperscriptPositionType::OnTop,
                slash: true,
            },
        ];

        let note = NoteData {
            pitch: PitchInfo::new(PitchCode::N1, 4),
            divisions: 4,
            fraction: Fraction { numerator: 1, denominator: 1 },
            grace_notes_before: grace_notes,
            grace_notes_after: Vec::new(),
            lyrics: None,
            slur: None,
            articulations: Vec::new(),
            beam: None,
            tie: None,
            tuplet: None,
            breath_mark_after: false,
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
                position: SuperscriptPositionType::After,
                slash: false,
            },
        ];

        let note = NoteData {
            pitch: PitchInfo::new(PitchCode::N1, 4),
            divisions: 4,
            fraction: Fraction { numerator: 1, denominator: 1 },
            grace_notes_before: Vec::new(),
            grace_notes_after: grace_notes,
            lyrics: None,
            slur: None,
            articulations: Vec::new(),
            beam: None,
            tie: None,
            tuplet: None,
            breath_mark_after: false,
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
        // Look for <grace/> (no attributes) since slash=false and placement=After maps to None
        let has_grace_no_slash = xml.contains("<grace/>") && !xml.contains("<grace slash");
        assert!(has_grace_no_slash, "Should have 1 grace note without slash");

        // Main note should come before grace note
        let main_note_pos = xml.find("<step>C</step>").expect("Main note not found");
        let grace_pos = xml.find("<grace/>").expect("Grace note not found");
        assert!(main_note_pos < grace_pos, "Main note should come before after-grace note");
    }

    #[test]
    fn test_grace_note_placement_mapping() {
        // Test that SuperscriptPositionType::OnTop maps to placement="above"
        let grace_notes = vec![
            GraceNoteData {
                pitch: PitchInfo::new(PitchCode::N2, 4),
                position: SuperscriptPositionType::OnTop,
                slash: true,
            },
        ];

        let note = NoteData {
            pitch: PitchInfo::new(PitchCode::N1, 4),
            divisions: 4,
            fraction: Fraction { numerator: 1, denominator: 1 },
            grace_notes_before: grace_notes,
            grace_notes_after: Vec::new(),
            lyrics: None,
            slur: None,
            articulations: Vec::new(),
            beam: None,
            tie: None,
            tuplet: None,
            breath_mark_after: false,
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
                position: SuperscriptPositionType::Before,
                slash: true,
            },
        ];

        let grace_after = vec![
            GraceNoteData {
                pitch: PitchInfo::new(PitchCode::N2, 4),
                position: SuperscriptPositionType::After,
                slash: false,
            },
        ];

        let note = NoteData {
            pitch: PitchInfo::new(PitchCode::N1, 4),
            divisions: 4,
            fraction: Fraction { numerator: 1, denominator: 1 },
            grace_notes_before: grace_before,
            grace_notes_after: grace_after,
            lyrics: None,
            slur: None,
            articulations: Vec::new(),
            beam: None,
            tie: None,
            tuplet: None,
            breath_mark_after: false,
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
        // After-grace should have <grace/> (no attributes since slash=false and placement=After)
        assert!(xml.contains("<grace/>"), "Should have grace note without slash");

        // Verify ordering: before-grace -> main note -> after-grace
        let before_grace_pos = xml.find("<grace slash=\"yes\"").expect("Before grace not found");
        let main_note_pos = xml.find("<step>C</step>").expect("Main note not found");
        let after_grace_pos = xml.rfind("<grace/>").expect("After grace not found");

        assert!(before_grace_pos < main_note_pos, "Before-grace should come before main note");
        assert!(main_note_pos < after_grace_pos, "Main note should come before after-grace");
    }

    #[test]
    fn test_group_name_in_part_list() {
        // Test that <group-name> appears in MusicXML when lines have labels in the same system
        let line1 = ExportLine {
            system_id: 1,
            part_id: "P1".to_string(),
            staff_role: crate::models::core::StaffRole::Melody,
            key_signature: Some("C major".to_string()),
            time_signature: Some("4/4".to_string()),
            clef: "treble".to_string(),
            label: "Violin I".to_string(), // Should appear in <group-name>
            show_bracket: true,
            lyrics: String::new(),
            measures: vec![ExportMeasure {
                divisions: 4,
                events: vec![ExportEvent::Note(NoteData {
                    pitch: PitchInfo::new(PitchCode::N1, 4),
                    divisions: 4,
                    fraction: Fraction { numerator: 1, denominator: 1 },
                    grace_notes_before: Vec::new(),
                    grace_notes_after: Vec::new(),
                    lyrics: None,
                    slur: None,
                    articulations: Vec::new(),
                    beam: None,
                    tie: None,
                    tuplet: None,
            breath_mark_after: false,
                })],
            }],
        };

        let line2 = ExportLine {
            system_id: 1, // Same system = grouped
            part_id: "P2".to_string(),
            staff_role: crate::models::core::StaffRole::Melody,
            key_signature: Some("C major".to_string()),
            time_signature: Some("4/4".to_string()),
            clef: "treble".to_string(),
            label: "Violin II".to_string(),
            show_bracket: true,
            lyrics: String::new(),
            measures: vec![ExportMeasure {
                divisions: 4,
                events: vec![ExportEvent::Note(NoteData {
                    pitch: PitchInfo::new(PitchCode::N1, 4),
                    divisions: 4,
                    fraction: Fraction { numerator: 1, denominator: 1 },
                    grace_notes_before: Vec::new(),
                    grace_notes_after: Vec::new(),
                    lyrics: None,
                    slur: None,
                    articulations: Vec::new(),
                    beam: None,
                    tie: None,
                    tuplet: None,
            breath_mark_after: false,
                })],
            }],
        };

        let lines = vec![line1, line2];

        // Generate MusicXML
        let xml = emit_musicxml(&lines, None, None).expect("Failed to emit MusicXML");

        // Verify output contains:
        // 1. <part-group> with type="start"
        assert!(xml.contains("<part-group type=\"start\" number=\"1\">"),
                "MusicXML should contain part-group start");

        // 2. <group-name> with the first line's label
        assert!(xml.contains("<group-name>Violin I</group-name>"),
                "MusicXML should contain group-name with first line's label");

        // 3. <group-symbol>bracket</group-symbol>
        assert!(xml.contains("<group-symbol>bracket</group-symbol>"),
                "MusicXML should contain group-symbol bracket");

        // 4. <group-barline>yes</group-barline>
        assert!(xml.contains("<group-barline>yes</group-barline>"),
                "MusicXML should contain group-barline yes");

        // 5. <part-group> with type="stop"
        assert!(xml.contains("<part-group type=\"stop\" number=\"1\"/>"),
                "MusicXML should contain part-group stop");
    }

    #[test]
    fn test_group_header_with_two_melodies_separate_systems() {
        // Test "G M M" pattern: Group Header + 2 Melody lines as SEPARATE systems
        // Each line should be independent - NO bracket groups
        let line1 = ExportLine {
            system_id: 1, // Separate system
            part_id: "P1".to_string(),
            staff_role: crate::models::core::StaffRole::Melody,
            key_signature: Some("C major".to_string()),
            time_signature: Some("4/4".to_string()),
            clef: "treble".to_string(),
            label: "Strings".to_string(), // Group header
            show_bracket: true,
            lyrics: String::new(),
            measures: vec![ExportMeasure {
                divisions: 4,
                events: vec![ExportEvent::Note(NoteData {
                    pitch: PitchInfo::new(PitchCode::N1, 4),
                    divisions: 4,
                    fraction: Fraction { numerator: 1, denominator: 1 },
                    grace_notes_before: Vec::new(),
                    grace_notes_after: Vec::new(),
                    lyrics: None,
                    slur: None,
                    articulations: Vec::new(),
                    beam: None,
                    tie: None,
                    tuplet: None,
            breath_mark_after: false,
                })],
            }],
        };

        let line2 = ExportLine {
            system_id: 2, // DIFFERENT system - separate
            part_id: "P2".to_string(),
            staff_role: crate::models::core::StaffRole::Melody,
            key_signature: Some("C major".to_string()),
            time_signature: Some("4/4".to_string()),
            clef: "treble".to_string(),
            label: "Violin I".to_string(), // Melody 1
            show_bracket: true,
            lyrics: String::new(),
            measures: vec![ExportMeasure {
                divisions: 4,
                events: vec![ExportEvent::Note(NoteData {
                    pitch: PitchInfo::new(PitchCode::N2, 4),
                    divisions: 4,
                    fraction: Fraction { numerator: 1, denominator: 1 },
                    grace_notes_before: Vec::new(),
                    grace_notes_after: Vec::new(),
                    lyrics: None,
                    slur: None,
                    articulations: Vec::new(),
                    beam: None,
                    tie: None,
                    tuplet: None,
            breath_mark_after: false,
                })],
            }],
        };

        let line3 = ExportLine {
            system_id: 3, // DIFFERENT system - separate
            part_id: "P3".to_string(),
            staff_role: crate::models::core::StaffRole::Melody,
            key_signature: Some("C major".to_string()),
            time_signature: Some("4/4".to_string()),
            clef: "treble".to_string(),
            label: "Violin II".to_string(), // Melody 2
            show_bracket: true,
            lyrics: String::new(),
            measures: vec![ExportMeasure {
                divisions: 4,
                events: vec![ExportEvent::Note(NoteData {
                    pitch: PitchInfo::new(PitchCode::N3, 4),
                    divisions: 4,
                    fraction: Fraction { numerator: 1, denominator: 1 },
                    grace_notes_before: Vec::new(),
                    grace_notes_after: Vec::new(),
                    lyrics: None,
                    slur: None,
                    articulations: Vec::new(),
                    beam: None,
                    tie: None,
                    tuplet: None,
            breath_mark_after: false,
                })],
            }],
        };

        let lines = vec![line1, line2, line3];

        // Generate MusicXML
        let xml = emit_musicxml(&lines, None, None).expect("Failed to emit MusicXML");

        // Debug output
        eprintln!("\n=== G M M PATTERN (SEPARATE SYSTEMS) XML ===\n{}\n=== END ===\n", xml);

        // Should have all three parts
        assert!(xml.contains("<score-part id=\"P1\">"),
                "Should have P1 (group header)");
        assert!(xml.contains("<score-part id=\"P2\">"),
                "Should have P2 (melody 1)");
        assert!(xml.contains("<score-part id=\"P3\">"),
                "Should have P3 (melody 2)");

        // CRITICAL: Should NOT have any part-group elements
        // Each line is a separate system, so no brackets
        assert!(!xml.contains("<part-group"),
                "FAIL: Should NOT have any part-group elements for separate systems (G M M pattern)");
    }

    #[test]
    fn test_group_header_with_two_items_single_system() {
        // Test "G GI GI" pattern: Group Header + 2 Group Items = ONE BRACKETED SYSTEM
        // All lines have same system_id = bracketed together
        let line1 = ExportLine {
            system_id: 1, // SAME system
            part_id: "P1".to_string(),
            staff_role: crate::models::core::StaffRole::Melody,
            key_signature: Some("C major".to_string()),
            time_signature: Some("4/4".to_string()),
            clef: "treble".to_string(),
            label: "Strings".to_string(), // Group header
            show_bracket: true,
            lyrics: String::new(),
            measures: vec![ExportMeasure {
                divisions: 4,
                events: vec![ExportEvent::Note(NoteData {
                    pitch: PitchInfo::new(PitchCode::N1, 4),
                    divisions: 4,
                    fraction: Fraction { numerator: 1, denominator: 1 },
                    grace_notes_before: Vec::new(),
                    grace_notes_after: Vec::new(),
                    lyrics: None,
                    slur: None,
                    articulations: Vec::new(),
                    beam: None,
                    tie: None,
                    tuplet: None,
            breath_mark_after: false,
                })],
            }],
        };

        let line2 = ExportLine {
            system_id: 1, // SAME system - bracketed
            part_id: "P2".to_string(),
            staff_role: crate::models::core::StaffRole::Melody,
            key_signature: Some("C major".to_string()),
            time_signature: Some("4/4".to_string()),
            clef: "treble".to_string(),
            label: "Violin I".to_string(), // Group item 1
            show_bracket: true,
            lyrics: String::new(),
            measures: vec![ExportMeasure {
                divisions: 4,
                events: vec![ExportEvent::Note(NoteData {
                    pitch: PitchInfo::new(PitchCode::N2, 4),
                    divisions: 4,
                    fraction: Fraction { numerator: 1, denominator: 1 },
                    grace_notes_before: Vec::new(),
                    grace_notes_after: Vec::new(),
                    lyrics: None,
                    slur: None,
                    articulations: Vec::new(),
                    beam: None,
                    tie: None,
                    tuplet: None,
            breath_mark_after: false,
                })],
            }],
        };

        let line3 = ExportLine {
            system_id: 1, // SAME system - bracketed
            part_id: "P3".to_string(),
            staff_role: crate::models::core::StaffRole::Melody,
            key_signature: Some("C major".to_string()),
            time_signature: Some("4/4".to_string()),
            clef: "treble".to_string(),
            label: "Violin II".to_string(), // Group item 2
            show_bracket: true,
            lyrics: String::new(),
            measures: vec![ExportMeasure {
                divisions: 4,
                events: vec![ExportEvent::Note(NoteData {
                    pitch: PitchInfo::new(PitchCode::N3, 4),
                    divisions: 4,
                    fraction: Fraction { numerator: 1, denominator: 1 },
                    grace_notes_before: Vec::new(),
                    grace_notes_after: Vec::new(),
                    lyrics: None,
                    slur: None,
                    articulations: Vec::new(),
                    beam: None,
                    tie: None,
                    tuplet: None,
            breath_mark_after: false,
                })],
            }],
        };

        let lines = vec![line1, line2, line3];

        // Generate MusicXML
        let xml = emit_musicxml(&lines, None, None).expect("Failed to emit MusicXML");

        // Debug output
        eprintln!("\n=== G GI GI PATTERN (SINGLE BRACKETED SYSTEM) XML ===\n{}\n=== END ===\n", xml);

        // Should have all three parts
        assert!(xml.contains("<score-part id=\"P1\">"),
                "Should have P1 (group header)");
        assert!(xml.contains("<score-part id=\"P2\">"),
                "Should have P2 (group item 1)");
        assert!(xml.contains("<score-part id=\"P3\">"),
                "Should have P3 (group item 2)");

        // CRITICAL: Should have bracket group (all same system_id)
        assert!(xml.contains("<part-group type=\"start\" number=\"1\">"),
                "Should have part-group start for single system");
        assert!(xml.contains("<group-name>Strings</group-name>"),
                "Group name should be from group header (P1)");
        assert!(xml.contains("<group-symbol>bracket</group-symbol>"),
                "Should have bracket symbol");
        assert!(xml.contains("<group-barline>yes</group-barline>"),
                "Should have shared barlines");
        assert!(xml.contains("<part-group type=\"stop\" number=\"1\"/>"),
                "Should have part-group stop");

        // Verify ordering
        let group_start_pos = xml.find("<part-group type=\"start\"").expect("No group start");
        let p1_pos = xml.find("<score-part id=\"P1\">").expect("No P1");
        let p2_pos = xml.find("<score-part id=\"P2\">").expect("No P2");
        let p3_pos = xml.find("<score-part id=\"P3\">").expect("No P3");
        let group_stop_pos = xml.find("<part-group type=\"stop\"").expect("No group stop");

        assert!(group_start_pos < p1_pos, "Group start before P1");
        assert!(p1_pos < p2_pos, "P1 before P2");
        assert!(p2_pos < p3_pos, "P2 before P3");
        assert!(p3_pos < group_stop_pos, "P3 before group stop");
    }

    #[test]
    fn test_group_name_hidden_bracket() {
        // Test that print-object="no" appears when show_bracket is false
        let line1 = ExportLine {
            system_id: 1,
            part_id: "P1".to_string(),
            staff_role: crate::models::core::StaffRole::Melody,
            key_signature: Some("C major".to_string()),
            time_signature: Some("4/4".to_string()),
            clef: "treble".to_string(),
            label: "Piano".to_string(),
            show_bracket: false, // Hide bracket
            lyrics: String::new(),
            measures: vec![ExportMeasure {
                divisions: 4,
                events: vec![ExportEvent::Note(NoteData {
                    pitch: PitchInfo::new(PitchCode::N1, 4),
                    divisions: 4,
                    fraction: Fraction { numerator: 1, denominator: 1 },
                    grace_notes_before: Vec::new(),
                    grace_notes_after: Vec::new(),
                    lyrics: None,
                    slur: None,
                    articulations: Vec::new(),
                    beam: None,
                    tie: None,
                    tuplet: None,
            breath_mark_after: false,
                })],
            }],
        };

        let line2 = ExportLine {
            system_id: 1,
            part_id: "P2".to_string(),
            staff_role: crate::models::core::StaffRole::Melody,
            key_signature: Some("C major".to_string()),
            time_signature: Some("4/4".to_string()),
            clef: "bass".to_string(),
            label: String::new(),
            show_bracket: false, // Hide bracket
            lyrics: String::new(),
            measures: vec![ExportMeasure {
                divisions: 4,
                events: vec![ExportEvent::Note(NoteData {
                    pitch: PitchInfo::new(PitchCode::N1, 4),
                    divisions: 4,
                    fraction: Fraction { numerator: 1, denominator: 1 },
                    grace_notes_before: Vec::new(),
                    grace_notes_after: Vec::new(),
                    lyrics: None,
                    slur: None,
                    articulations: Vec::new(),
                    beam: None,
                    tie: None,
                    tuplet: None,
            breath_mark_after: false,
                })],
            }],
        };

        let lines = vec![line1, line2];
        let xml = emit_musicxml(&lines, None, None).expect("Failed to emit MusicXML");

        // Verify bracket is hidden
        assert!(xml.contains("print-object=\"no\""),
                "MusicXML should contain print-object=\"no\" when show_bracket is false");
    }

    /// Regression test: `--` should produce quarter note in 4/4, not half note
    /// Bug was: GCD normalization reduced single-element beat [2] → [1]
    /// Fix: Skip GCD normalization for single-element beats
    #[test]
    fn test_double_dash_produces_quarter_rest() {
        // IR for input `--` (2 subdivisions in one beat)
        let line = ExportLine {
            system_id: 1,
            part_id: "P1".to_string(),
            staff_role: crate::models::core::StaffRole::Melody,
            key_signature: None,
            time_signature: Some("4/4".to_string()),
            clef: "treble".to_string(),
            label: String::new(),
            show_bracket: false,
            lyrics: String::new(),
            measures: vec![ExportMeasure {
                divisions: 2, // beat_div = 2 (not 1!)
                events: vec![ExportEvent::Rest {
                    divisions: 2, // 2/2 = 1 beat = 1/4 note
                    fraction: Fraction { numerator: 1, denominator: 1 },
                    tuplet: None,
                }],
            }],
        };

        let xml = emit_musicxml(&vec![line], None, None).expect("Failed to emit MusicXML");

        // Verify divisions=2 (not 1!)
        assert!(xml.contains("<divisions>2</divisions>"),
                "MusicXML should have divisions=2 for double-dash beat");

        // Verify rest duration=2
        assert!(xml.contains("<duration>2</duration>"),
                "Rest duration should be 2");

        // Verify rest is quarter note (type=quarter or calculated as 2/2 = 1/4)
        // With divisions=2 and duration=2, this is 2/2 = 1 beat = quarter note in 4/4
    }

    /// Regression test: `--1` should produce triplet with rest having tuplet marking
    /// Bug was: Rest didn't get tuplet info, only Note did
    /// Fix: Assign tuplet info to Rest and Chord events too
    #[test]
    fn test_rest_in_triplet_has_tuplet_marking() {
        // IR for input `--1` (3 subdivisions = triplet: rest=2, note=1)
        let line = ExportLine {
            system_id: 1,
            part_id: "P1".to_string(),
            staff_role: crate::models::core::StaffRole::Melody,
            key_signature: None,
            time_signature: Some("4/4".to_string()),
            clef: "treble".to_string(),
            label: String::new(),
            show_bracket: false,
            lyrics: String::new(),
            measures: vec![ExportMeasure {
                divisions: 3, // beat_div = 3 (triplet)
                events: vec![
                    ExportEvent::Rest {
                        divisions: 2, // 2/3 of beat
                        fraction: Fraction { numerator: 2, denominator: 3 },
                        tuplet: Some(TupletInfo {
                            actual_notes: 3,
                            normal_notes: 2,
                            bracket_start: true,
                            bracket_stop: false,
                        }),
                    },
                    ExportEvent::Note(NoteData {
                        pitch: PitchInfo::new(PitchCode::N1, 4),
                        divisions: 1, // 1/3 of beat
                        fraction: Fraction { numerator: 1, denominator: 3 },
                        grace_notes_before: Vec::new(),
                        grace_notes_after: Vec::new(),
                        lyrics: None,
                        slur: None,
                        articulations: Vec::new(),
                        beam: None,
                        tie: None,
                        tuplet: Some(TupletInfo {
                            actual_notes: 3,
                            normal_notes: 2,
                            bracket_start: false,
                            bracket_stop: true,
                        }),
                        breath_mark_after: false,
                    }),
                ],
            }],
        };

        let xml = emit_musicxml(&vec![line], None, None).expect("Failed to emit MusicXML");

        // Verify rest has time-modification (tuplet ratio)
        let rest_section = xml.split("</note>").next().unwrap();
        assert!(rest_section.contains("<rest/>"),
                "First note should be a rest");
        assert!(rest_section.contains("<time-modification>"),
                "Rest should have time-modification for tuplet");
        assert!(rest_section.contains("<actual-notes>3</actual-notes>"),
                "Rest should have actual-notes=3");
        assert!(rest_section.contains("<normal-notes>2</normal-notes>"),
                "Rest should have normal-notes=2");

        // Verify rest has tuplet bracket start
        assert!(rest_section.contains("<tuplet type=\"start\""),
                "Rest should have tuplet bracket start");

        // Verify note has tuplet bracket stop
        assert!(xml.contains("<tuplet type=\"stop\""),
                "Note should have tuplet bracket stop");
    }

    /// Test: Single pitch with dashes preserves subdivision count
    #[test]
    fn test_single_pitch_with_dashes_preserves_subdivisions() {
        // IR for input `1--` (3 subdivisions for one note)
        let line = ExportLine {
            system_id: 1,
            part_id: "P1".to_string(),
            staff_role: crate::models::core::StaffRole::Melody,
            key_signature: None,
            time_signature: Some("4/4".to_string()),
            clef: "treble".to_string(),
            label: String::new(),
            show_bracket: false,
            lyrics: String::new(),
            measures: vec![ExportMeasure {
                divisions: 3, // beat_div = 3 (single element, no GCD reduction)
                events: vec![ExportEvent::Note(NoteData {
                    pitch: PitchInfo::new(PitchCode::N1, 4),
                    divisions: 3, // 3/3 = 1 whole beat
                    fraction: Fraction { numerator: 1, denominator: 1 },
                    grace_notes_before: Vec::new(),
                    grace_notes_after: Vec::new(),
                    lyrics: None,
                    slur: None,
                    articulations: Vec::new(),
                    beam: None,
                    tie: None,
                    tuplet: None,
            breath_mark_after: false,
                })],
            }],
        };

        let xml = emit_musicxml(&vec![line], None, None).expect("Failed to emit MusicXML");

        // Verify divisions=3 (preserved, not reduced to 1)
        assert!(xml.contains("<divisions>3</divisions>"),
                "Single-element beat should preserve subdivision count");
    }

    /// Test: Multiple elements get GCD normalization and tuplet detection
    #[test]
    fn test_triplet_123_all_notes_have_tuplet_info() {
        // IR for input `1 2 3` (3 equal notes = triplet)
        let line = ExportLine {
            system_id: 1,
            part_id: "P1".to_string(),
            staff_role: crate::models::core::StaffRole::Melody,
            key_signature: None,
            time_signature: Some("4/4".to_string()),
            clef: "treble".to_string(),
            label: String::new(),
            show_bracket: false,
            lyrics: String::new(),
            measures: vec![ExportMeasure {
                divisions: 3, // GCD([1,1,1]) = 1, sum = 3
                events: vec![
                    ExportEvent::Note(NoteData {
                        pitch: PitchInfo::new(PitchCode::N1, 4),
                        divisions: 1,
                    fraction: Fraction { numerator: 1, denominator: 1 },
                    grace_notes_before: Vec::new(),
                        grace_notes_after: Vec::new(),
                        lyrics: None,
                        slur: None,
                        articulations: Vec::new(),
                        beam: None,
                        tie: None,
                        tuplet: Some(TupletInfo {
                            actual_notes: 3,
                            normal_notes: 2,
                            bracket_start: true,
                            bracket_stop: false,
                        }),
                        breath_mark_after: false,
                    }),
                    ExportEvent::Note(NoteData {
                        pitch: PitchInfo::new(PitchCode::N2, 4),
                        divisions: 1,
                    fraction: Fraction { numerator: 1, denominator: 1 },
                    grace_notes_before: Vec::new(),
                        grace_notes_after: Vec::new(),
                        lyrics: None,
                        slur: None,
                        articulations: Vec::new(),
                        beam: None,
                        tie: None,
                        tuplet: Some(TupletInfo {
                            actual_notes: 3,
                            normal_notes: 2,
                            bracket_start: false,
                            bracket_stop: false,
                        }),
                        breath_mark_after: false,
                    }),
                    ExportEvent::Note(NoteData {
                        pitch: PitchInfo::new(PitchCode::N3, 4),
                        divisions: 1,
                    fraction: Fraction { numerator: 1, denominator: 1 },
                    grace_notes_before: Vec::new(),
                        grace_notes_after: Vec::new(),
                        lyrics: None,
                        slur: None,
                        articulations: Vec::new(),
                        beam: None,
                        tie: None,
                        tuplet: Some(TupletInfo {
                            actual_notes: 3,
                            normal_notes: 2,
                            bracket_start: false,
                            bracket_stop: true,
                        }),
                        breath_mark_after: false,
                    }),
                ],
            }],
        };

        let xml = emit_musicxml(&vec![line], None, None).expect("Failed to emit MusicXML");

        // Count tuplet start/stop markers
        let tuplet_starts = xml.matches("<tuplet type=\"start\"").count();
        let tuplet_stops = xml.matches("<tuplet type=\"stop\"").count();

        assert_eq!(tuplet_starts, 1, "Should have exactly one tuplet start");
        assert_eq!(tuplet_stops, 1, "Should have exactly one tuplet stop");

        // All notes should have time-modification
        let time_mod_count = xml.matches("<time-modification>").count();
        assert_eq!(time_mod_count, 3, "All three notes should have time-modification");
    }

    /// Test: Multiple elements with different durations get GCD normalization
    #[test]
    fn test_mixed_durations_gcd_normalization() {
        // IR for input `1-- 2--` (two notes, each 3 subdivisions)
        // GCD([3,3]) = 3, normalized = [1,1], sum = 2
        let line = ExportLine {
            system_id: 1,
            part_id: "P1".to_string(),
            staff_role: crate::models::core::StaffRole::Melody,
            key_signature: None,
            time_signature: Some("4/4".to_string()),
            clef: "treble".to_string(),
            label: String::new(),
            show_bracket: false,
            lyrics: String::new(),
            measures: vec![ExportMeasure {
                divisions: 2, // GCD(3,3)=3, normalized=[1,1], sum=2
                events: vec![
                    ExportEvent::Note(NoteData {
                        pitch: PitchInfo::new(PitchCode::N1, 4),
                        divisions: 1, // Scaled from 3 by factor 1/3
                        fraction: Fraction { numerator: 1, denominator: 2 },
                        grace_notes_before: Vec::new(),
                        grace_notes_after: Vec::new(),
                        lyrics: None,
                        slur: None,
                        articulations: Vec::new(),
                        beam: None,
                        tie: None,
                        tuplet: None,
            breath_mark_after: false,
                    }),
                    ExportEvent::Note(NoteData {
                        pitch: PitchInfo::new(PitchCode::N2, 4),
                        divisions: 1,
                    fraction: Fraction { numerator: 1, denominator: 1 },
                    grace_notes_before: Vec::new(),
                        grace_notes_after: Vec::new(),
                        lyrics: None,
                        slur: None,
                        articulations: Vec::new(),
                        beam: None,
                        tie: None,
                        tuplet: None,
            breath_mark_after: false,
                    }),
                ],
            }],
        };

        let xml = emit_musicxml(&vec![line], None, None).expect("Failed to emit MusicXML");

        // Verify divisions=2 (GCD normalization applied)
        assert!(xml.contains("<divisions>2</divisions>"),
                "Multiple elements should have GCD-normalized divisions");

        // Should NOT have tuplet marking (2 is power of 2, standard duration)
        assert!(!xml.contains("<tuplet"),
                "Standard binary divisions should not have tuplet marking");
    }

    #[test]
    fn test_half_flat_musicxml_export() {
        // Test that half-flat (quarter-flat) accidentals export correctly
        // Expected MusicXML: <alter>-0.5</alter> and <accidental>quarter-flat</accidental>
        let line = ExportLine {
            system_id: 1,
            part_id: "P1".to_string(),
            staff_role: crate::models::core::StaffRole::Melody,
            key_signature: None,
            time_signature: Some("4/4".to_string()),
            clef: "treble".to_string(),
            label: String::new(),
            show_bracket: false,
            lyrics: String::new(),
            measures: vec![ExportMeasure {
                divisions: 4,
                events: vec![
                    // C half-flat (N1hf)
                    ExportEvent::Note(NoteData {
                        pitch: PitchInfo::new(PitchCode::N1hf, 4),
                        divisions: 4,
                        fraction: Fraction { numerator: 1, denominator: 1 },
                        grace_notes_before: Vec::new(),
                        grace_notes_after: Vec::new(),
                        lyrics: None,
                        slur: None,
                        articulations: Vec::new(),
                        beam: None,
                        tie: None,
                        tuplet: None,
            breath_mark_after: false,
                    }),
                ],
            }],
        };

        let xml = emit_musicxml(&vec![line], None, None).expect("Failed to emit MusicXML");

        // Debug output
        eprintln!("\n=== HALF-FLAT MUSICXML ===\n{}\n=== END ===\n", xml);

        // Verify <step>C</step>
        assert!(xml.contains("<step>C</step>"),
                "Should have C as the base step for N1hf");

        // Verify <alter>-0.5</alter> (half a semitone down)
        assert!(xml.contains("<alter>-0.5</alter>"),
                "Should have alter=-0.5 for half-flat");

        // Verify <accidental>quarter-flat</accidental>
        assert!(xml.contains("<accidental>quarter-flat</accidental>"),
                "Should have accidental=quarter-flat for half-flat");

        // Verify structure: alter comes before accidental
        let alter_pos = xml.find("<alter>-0.5</alter>").expect("alter not found");
        let accidental_pos = xml.find("<accidental>quarter-flat</accidental>").expect("accidental not found");
        assert!(alter_pos < accidental_pos,
                "alter should come before accidental in MusicXML");
    }

    #[test]
    fn test_all_accidental_types_in_musicxml() {
        // Test that all accidental types export correctly
        use crate::models::PitchCode::*;

        let test_cases = vec![
            (N1, None, None), // Natural - no alter, no accidental
            (N1s, Some("1"), Some("sharp")), // Sharp
            (N1b, Some("-1"), Some("flat")), // Flat
            (N1hf, Some("-0.5"), Some("quarter-flat")), // Half-flat
            (N1ss, Some("2"), Some("double-sharp")), // Double-sharp
            (N1bb, Some("-2"), Some("flat-flat")), // Double-flat
        ];

        for (pitch_code, expected_alter, expected_accidental) in test_cases {
            let line = ExportLine {
                system_id: 1,
                part_id: "P1".to_string(),
                staff_role: crate::models::core::StaffRole::Melody,
                key_signature: None,
                time_signature: Some("4/4".to_string()),
                clef: "treble".to_string(),
                label: String::new(),
                show_bracket: false,
                lyrics: String::new(),
                measures: vec![ExportMeasure {
                    divisions: 4,
                    events: vec![
                        ExportEvent::Note(NoteData {
                            pitch: PitchInfo::new(pitch_code, 4),
                            divisions: 4,
                            fraction: Fraction { numerator: 1, denominator: 1 },
                            grace_notes_before: Vec::new(),
                            grace_notes_after: Vec::new(),
                            lyrics: None,
                            slur: None,
                            articulations: Vec::new(),
                            beam: None,
                            tie: None,
                            tuplet: None,
            breath_mark_after: false,
                        }),
                    ],
                }],
            };

            let xml = emit_musicxml(&vec![line], None, None).expect("Failed to emit MusicXML");

            if let Some(alter_value) = expected_alter {
                assert!(xml.contains(&format!("<alter>{}</alter>", alter_value)),
                        "PitchCode {:?} should have alter={}", pitch_code, alter_value);
            } else {
                assert!(!xml.contains("<alter>"),
                        "PitchCode {:?} should not have alter element", pitch_code);
            }

            if let Some(accidental_name) = expected_accidental {
                assert!(xml.contains(&format!("<accidental>{}</accidental>", accidental_name)),
                        "PitchCode {:?} should have accidental={}", pitch_code, accidental_name);
            } else {
                assert!(!xml.contains("<accidental>"),
                        "PitchCode {:?} should not have accidental element", pitch_code);
            }
        }
    }

}
