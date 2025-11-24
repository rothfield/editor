//! Direct IR-to-MIDI conversion
//!
//! Converts the format-agnostic IR (ExportLine/ExportMeasure/ExportEvent)
//! directly to MIDI Score IR, bypassing MusicXML serialization.

use crate::ir::{ExportLine, ExportMeasure, ExportEvent, NoteData, PitchInfo, Fraction};
use crate::models::PitchCode;
use crate::converters::musicxml::musicxml_to_midi::{Score, Part, Note, Tempo};
use super::defaults::{DEFAULT_TEMPO_BPM, DEFAULT_VELOCITY, DEFAULT_PROGRAM, assign_channel};

/// Convert IR to MIDI Score
///
/// # Arguments
/// * `export_lines` - IR lines (one per staff/part)
/// * `tpq` - Ticks per quarter note (e.g., 480)
/// * `tempo_bpm` - Optional tempo override (default: 120 BPM)
///
/// # Returns
/// MIDI Score ready for SMF serialization
pub fn ir_to_midi_score(
    export_lines: &[ExportLine],
    tpq: u16,
    tempo_bpm: Option<f64>,
) -> Result<Score, String> {
    let mut score = Score {
        tpq,
        divisions: 1,  // Not used for direct conversion (we calculate ticks directly)
        tempos: vec![Tempo {
            tick: 0,
            bpm: tempo_bpm.unwrap_or(DEFAULT_TEMPO_BPM),
        }],
        timesigs: vec![],  // TODO: Extract from first measure time_signature
        parts: vec![],
    };

    // Convert each line to a MIDI part
    for (index, line) in export_lines.iter().enumerate() {
        let part = convert_line_to_part(line, index, tpq)?;
        score.parts.push(part);
    }

    Ok(score)
}

/// Convert a single ExportLine to a MIDI Part
fn convert_line_to_part(
    line: &ExportLine,
    part_index: usize,
    tpq: u16,
) -> Result<Part, String> {
    let mut part = Part {
        id: line.part_id.clone(),
        name: line.label.clone(),
        channel: assign_channel(part_index),
        program: Some(DEFAULT_PROGRAM),
        notes: vec![],
    };

    let mut current_tick = 0u64;

    // Process each measure
    for measure in &line.measures {
        convert_measure_to_notes(measure, &mut part.notes, &mut current_tick, tpq)?;
    }

    // Post-process: consolidate tied notes
    consolidate_ties(&mut part.notes);

    Ok(part)
}

/// Convert a measure's events to MIDI notes
fn convert_measure_to_notes(
    measure: &ExportMeasure,
    notes: &mut Vec<Note>,
    current_tick: &mut u64,
    tpq: u16,
) -> Result<(), String> {
    for event in &measure.events {
        match event {
            ExportEvent::Rest { fraction, .. } => {
                // Rests: advance current_tick but don't emit notes
                let dur_ticks = fraction_to_ticks(fraction, tpq, measure.divisions);
                *current_tick += dur_ticks;
            }

            ExportEvent::Note(note_data) => {
                // Single note: convert and add
                let dur_ticks = fraction_to_ticks(&note_data.fraction, tpq, measure.divisions);
                let pitch = pitch_info_to_midi(&note_data.pitch)?;
                let vel = articulation_to_velocity(note_data);

                notes.push(Note {
                    start_tick: *current_tick,
                    dur_tick: dur_ticks,
                    pitch,
                    vel,
                    voice: 0,
                });

                *current_tick += dur_ticks;
            }

            ExportEvent::Chord { pitches, fraction, .. } => {
                // Chord: emit multiple simultaneous notes
                let dur_ticks = fraction_to_ticks(fraction, tpq, measure.divisions);

                for pitch_info in pitches {
                    let pitch = pitch_info_to_midi(pitch_info)?;

                    notes.push(Note {
                        start_tick: *current_tick,
                        dur_tick: dur_ticks,
                        pitch,
                        vel: DEFAULT_VELOCITY,
                        voice: 0,
                    });
                }

                *current_tick += dur_ticks;
            }
        }
    }

    Ok(())
}

/// Convert PitchInfo to MIDI note number (0-127)
///
/// # Algorithm
/// 1. Map PitchCode degree (1-7) to chromatic semitones (C-B)
/// 2. Apply accidental offset (sharp, flat, etc.)
/// 3. Apply octave offset (each octave = 12 semitones)
/// 4. Clamp to valid MIDI range (0-127)
///
/// # MIDI Note Mapping
/// - MIDI 60 = C4 (middle C)
/// - MIDI 0 = C-1
/// - MIDI 127 = G9
pub fn pitch_info_to_midi(pitch_info: &PitchInfo) -> Result<u8, String> {
    use PitchCode::*;

    // Get base chromatic pitch for degree (relative to C4 = 60)
    let degree = pitch_info.pitch_code.degree();
    let base_semitone = match degree {
        1 => 0,   // N1 = C
        2 => 2,   // N2 = D
        3 => 4,   // N3 = E
        4 => 5,   // N4 = F
        5 => 7,   // N5 = G
        6 => 9,   // N6 = A
        7 => 11,  // N7 = B
        _ => return Err(format!("Invalid pitch degree: {}", degree)),
    };

    // Get accidental offset in semitones
    let accidental_offset = match pitch_info.pitch_code {
        // Natural (no offset)
        N1 | N2 | N3 | N4 | N5 | N6 | N7 => 0,

        // Sharp (+1 semitone)
        N1s | N2s | N3s | N4s | N5s | N6s | N7s => 1,

        // Flat (-1 semitone)
        N1b | N2b | N3b | N4b | N5b | N6b | N7b => -1,

        // Double sharp (+2 semitones)
        N1ss | N2ss | N3ss | N4ss | N5ss | N6ss | N7ss => 2,

        // Double flat (-2 semitones)
        N1bb | N2bb | N3bb | N4bb | N5bb | N6bb | N7bb => -2,

        // Half-flat (-1 semitone, MIDI doesn't support microtones)
        N1hf | N2hf | N3hf | N4hf | N5hf | N6hf | N7hf => -1,
    };

    // Calculate MIDI note number
    // Base: C4 = 60, octave offset in range -2..+2
    let midi = 60 + base_semitone + accidental_offset + (pitch_info.octave as i16 * 12);

    // Clamp to valid MIDI range
    let clamped = midi.clamp(0, 127) as u8;

    Ok(clamped)
}

/// Convert Fraction to MIDI ticks
///
/// # Arguments
/// * `fraction` - Duration as fraction of beat (e.g., 3/4 = dotted half)
/// * `tpq` - Ticks per quarter note
/// * `_divisions` - Measure divisions (unused for direct conversion)
///
/// # Algorithm
/// - A quarter note = tpq ticks
/// - fraction = numerator / denominator
/// - ticks = (numerator * tpq) / denominator
///
/// # Example
/// - fraction = 3/4, tpq = 480
/// - ticks = (3 * 480) / 4 = 360
pub fn fraction_to_ticks(fraction: &Fraction, tpq: u16, _divisions: usize) -> u64 {
    let numerator = fraction.numerator as u64;
    let denominator = fraction.denominator as u64;
    let tpq_u64 = tpq as u64;

    // Calculate ticks: (numerator * tpq) / denominator
    (numerator * tpq_u64) / denominator
}

/// Determine velocity based on articulations
///
/// Future enhancement: use note_data.articulations to vary velocity
/// For now, just return default velocity
fn articulation_to_velocity(note_data: &NoteData) -> u8 {
    // TODO: Map articulations to velocity variations
    // - Staccato → lighter (e.g., 80)
    // - Accent → stronger (e.g., 100)
    // - Tenuto → sustained (e.g., 70)
    // - Marcato → very strong (e.g., 110)

    // For now: default velocity
    let _ = note_data;  // Suppress unused warning
    DEFAULT_VELOCITY
}

/// Consolidate tied notes into single long notes
///
/// MIDI doesn't have a "tie" concept - tied notes are represented
/// as a single long note. This function combines consecutive notes
/// of the same pitch that should be tied together.
fn consolidate_ties(notes: &mut Vec<Note>) {
    let mut i = 0;
    while i < notes.len() {
        // Check if next note is a continuation (same pitch, starts when current ends)
        let j = i + 1;
        while j < notes.len() {
            if notes[j].start_tick == notes[i].start_tick + notes[i].dur_tick &&
               notes[j].pitch == notes[i].pitch &&
               notes[j].voice == notes[i].voice {
                // Extend current note duration
                notes[i].dur_tick += notes[j].dur_tick;
                notes.remove(j);
                // Don't increment j, check next note
            } else {
                break;
            }
        }
        i += 1;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::PitchCode;

    #[test]
    fn test_pitch_info_to_midi_naturals() {
        // Test natural notes (C4 = 60)
        assert_eq!(pitch_info_to_midi(&PitchInfo::new(PitchCode::N1, 0)).unwrap(), 60);  // C4
        assert_eq!(pitch_info_to_midi(&PitchInfo::new(PitchCode::N2, 0)).unwrap(), 62);  // D4
        assert_eq!(pitch_info_to_midi(&PitchInfo::new(PitchCode::N3, 0)).unwrap(), 64);  // E4
        assert_eq!(pitch_info_to_midi(&PitchInfo::new(PitchCode::N4, 0)).unwrap(), 65);  // F4
        assert_eq!(pitch_info_to_midi(&PitchInfo::new(PitchCode::N5, 0)).unwrap(), 67);  // G4
        assert_eq!(pitch_info_to_midi(&PitchInfo::new(PitchCode::N6, 0)).unwrap(), 69);  // A4
        assert_eq!(pitch_info_to_midi(&PitchInfo::new(PitchCode::N7, 0)).unwrap(), 71);  // B4
    }

    #[test]
    fn test_pitch_info_to_midi_sharps() {
        assert_eq!(pitch_info_to_midi(&PitchInfo::new(PitchCode::N1s, 0)).unwrap(), 61);  // C#4
        assert_eq!(pitch_info_to_midi(&PitchInfo::new(PitchCode::N4s, 0)).unwrap(), 66);  // F#4
        assert_eq!(pitch_info_to_midi(&PitchInfo::new(PitchCode::N5s, 0)).unwrap(), 68);  // G#4
    }

    #[test]
    fn test_pitch_info_to_midi_flats() {
        assert_eq!(pitch_info_to_midi(&PitchInfo::new(PitchCode::N3b, 0)).unwrap(), 63);  // Eb4
        assert_eq!(pitch_info_to_midi(&PitchInfo::new(PitchCode::N7b, 0)).unwrap(), 70);  // Bb4
    }

    #[test]
    fn test_pitch_info_to_midi_double_accidentals() {
        assert_eq!(pitch_info_to_midi(&PitchInfo::new(PitchCode::N1ss, 0)).unwrap(), 62);  // C##4 = D4
        assert_eq!(pitch_info_to_midi(&PitchInfo::new(PitchCode::N3bb, 0)).unwrap(), 62);  // Ebb4 = D4
    }

    #[test]
    fn test_pitch_info_to_midi_octaves() {
        // Test octave offsets
        assert_eq!(pitch_info_to_midi(&PitchInfo::new(PitchCode::N1, -1)).unwrap(), 48);  // C3
        assert_eq!(pitch_info_to_midi(&PitchInfo::new(PitchCode::N1, 0)).unwrap(), 60);   // C4
        assert_eq!(pitch_info_to_midi(&PitchInfo::new(PitchCode::N1, 1)).unwrap(), 72);   // C5
        assert_eq!(pitch_info_to_midi(&PitchInfo::new(PitchCode::N1, 2)).unwrap(), 84);   // C6
    }

    #[test]
    fn test_pitch_info_to_midi_clamping() {
        // Test that notes outside MIDI range are clamped
        assert_eq!(pitch_info_to_midi(&PitchInfo::new(PitchCode::N1, -10)).unwrap(), 0);    // Below range
        assert_eq!(pitch_info_to_midi(&PitchInfo::new(PitchCode::N7, 10)).unwrap(), 127);   // Above range
    }

    #[test]
    fn test_pitch_info_to_midi_half_flat() {
        // Half-flats round to regular flats in MIDI (no microtone support)
        assert_eq!(pitch_info_to_midi(&PitchInfo::new(PitchCode::N3hf, 0)).unwrap(), 63);  // E half-flat → Eb
    }

    #[test]
    fn test_fraction_to_ticks() {
        let tpq = 480;

        // Whole note = 4/4 = 4 * 480 / 4 = 480 ticks? No, whole note = 1920 ticks
        // Actually, fraction is portion of beat, not portion of whole note
        // If beat = quarter note, then:
        // - 1/1 fraction = 1 quarter = 480 ticks
        // - 1/2 fraction = 1 eighth = 240 ticks
        // - 3/4 fraction = dotted eighth = 360 ticks

        assert_eq!(fraction_to_ticks(&Fraction::new(1, 1), tpq, 4), 480);   // Quarter note
        assert_eq!(fraction_to_ticks(&Fraction::new(1, 2), tpq, 4), 240);   // Eighth note
        assert_eq!(fraction_to_ticks(&Fraction::new(1, 4), tpq, 4), 120);   // Sixteenth note
        assert_eq!(fraction_to_ticks(&Fraction::new(3, 4), tpq, 4), 360);   // Dotted eighth
    }

    #[test]
    fn test_consolidate_ties() {
        let mut notes = vec![
            Note { start_tick: 0, dur_tick: 480, pitch: 60, vel: 64, voice: 0 },
            Note { start_tick: 480, dur_tick: 240, pitch: 60, vel: 64, voice: 0 },  // Tied
            Note { start_tick: 720, dur_tick: 480, pitch: 62, vel: 64, voice: 0 },
        ];

        consolidate_ties(&mut notes);

        assert_eq!(notes.len(), 2);
        assert_eq!(notes[0].dur_tick, 720);  // First two notes consolidated
        assert_eq!(notes[0].pitch, 60);
        assert_eq!(notes[1].pitch, 62);
    }

    #[test]
    fn test_consolidate_ties_different_pitches() {
        let mut notes = vec![
            Note { start_tick: 0, dur_tick: 480, pitch: 60, vel: 64, voice: 0 },
            Note { start_tick: 480, dur_tick: 240, pitch: 62, vel: 64, voice: 0 },  // Different pitch, no tie
        ];

        consolidate_ties(&mut notes);

        assert_eq!(notes.len(), 2);  // Should remain separate
    }
}
