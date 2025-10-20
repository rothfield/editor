use crate::converters::musicxml::musicxml_to_midi::{model::*, MxError, Result};
use midly::{Format, Header, MetaMessage, MidiMessage, Smf, Timing, Track, TrackEvent, TrackEventKind};

/// Write Score IR to Standard MIDI File (SMF) Format 1
pub fn write_smf(score: &Score, out: &mut Vec<u8>) -> Result<()> {
    let mut tracks = Vec::new();

    // Track 0: Tempo and time signature map
    tracks.push(build_conductor_track(score)?);

    // Tracks 1+: One per part
    for part in &score.parts {
        tracks.push(build_part_track(score, part)?);
    }

    let header = Header {
        format: Format::Parallel,
        timing: Timing::Metrical(score.tpq.into()),
    };

    let smf = Smf {
        header,
        tracks,
    };

    smf.write(out)
        .map_err(|e| MxError::Midi(format!("Failed to write MIDI: {}", e)))?;

    Ok(())
}

fn build_conductor_track<'a>(score: &Score) -> Result<Track<'a>> {
    let mut events = Vec::new();

    // Add tempo changes
    for tempo in &score.tempos {
        let microseconds_per_quarter = (60_000_000.0 / tempo.bpm) as u32;
        events.push(TrackEvent {
            delta: (tempo.tick as u32).into(),
            kind: TrackEventKind::Meta(MetaMessage::Tempo(microseconds_per_quarter.into())),
        });
    }

    // Add time signatures
    for ts in &score.timesigs {
        // Calculate denominator as power of 2 (e.g., 4 -> 2, 8 -> 3)
        let denominator_power = (ts.den as f32).log2() as u8;
        events.push(TrackEvent {
            delta: (ts.tick as u32).into(),
            kind: TrackEventKind::Meta(MetaMessage::TimeSignature(
                ts.num,
                denominator_power,
                24, // MIDI clocks per metronome click
                8,  // 32nd notes per quarter note
            )),
        });
    }

    // Sort by tick and convert to delta times
    events.sort_by_key(|e| e.delta.as_int());
    convert_to_delta_times(&mut events);

    // End of track
    events.push(TrackEvent {
        delta: 0.into(),
        kind: TrackEventKind::Meta(MetaMessage::EndOfTrack),
    });

    Ok(events)
}

fn build_part_track<'a>(_score: &Score, part: &'a Part) -> Result<Track<'a>> {
    let mut events = Vec::new();

    // Track name
    events.push(TrackEvent {
        delta: 0.into(),
        kind: TrackEventKind::Meta(MetaMessage::TrackName(part.name.as_bytes())),
    });

    // Program change (instrument)
    if let Some(program) = part.program {
        events.push(TrackEvent {
            delta: 0.into(),
            kind: TrackEventKind::Midi {
                channel: part.channel.into(),
                message: MidiMessage::ProgramChange {
                    program: program.into(),
                },
            },
        });
    }

    // Note events
    for note in &part.notes {
        // Note On
        events.push(TrackEvent {
            delta: (note.start_tick as u32).into(),
            kind: TrackEventKind::Midi {
                channel: part.channel.into(),
                message: MidiMessage::NoteOn {
                    key: note.pitch.into(),
                    vel: note.vel.into(),
                },
            },
        });

        // Note Off
        events.push(TrackEvent {
            delta: ((note.start_tick + note.dur_tick) as u32).into(),
            kind: TrackEventKind::Midi {
                channel: part.channel.into(),
                message: MidiMessage::NoteOff {
                    key: note.pitch.into(),
                    vel: 0.into(),
                },
            },
        });
    }

    // Sort by absolute tick time
    events.sort_by_key(|e| e.delta.as_int());

    // Convert absolute times to delta times
    convert_to_delta_times(&mut events);

    // End of track
    events.push(TrackEvent {
        delta: 0.into(),
        kind: TrackEventKind::Meta(MetaMessage::EndOfTrack),
    });

    Ok(events)
}

/// Convert absolute tick times to delta times (time since previous event)
fn convert_to_delta_times(events: &mut [TrackEvent]) {
    let mut prev_tick = 0u32;
    for event in events.iter_mut() {
        let current_tick = event.delta.as_int();
        let delta = current_tick.saturating_sub(prev_tick);
        event.delta = delta.into();
        prev_tick = current_tick;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_write_minimal_smf() {
        let score = Score {
            tpq: 480,
            divisions: 1,
            tempos: vec![Tempo { tick: 0, bpm: 120.0 }],
            timesigs: vec![TimeSig { tick: 0, num: 4, den: 4 }],
            parts: vec![Part {
                id: "P1".to_string(),
                name: "Piano".to_string(),
                channel: 0,
                program: Some(0),
                notes: vec![
                    Note {
                        start_tick: 0,
                        dur_tick: 480,
                        pitch: 60,
                        vel: 64,
                        voice: 1,
                    },
                ],
            }],
        };

        let mut out = Vec::new();
        write_smf(&score, &mut out).expect("Failed to write SMF");

        // Verify header
        assert_eq!(&out[0..4], b"MThd");
        assert!(out.len() > 14);
    }

    #[test]
    fn test_delta_time_conversion() {
        let mut events = vec![
            TrackEvent {
                delta: 0.into(),
                kind: TrackEventKind::Meta(MetaMessage::TrackName(b"Test")),
            },
            TrackEvent {
                delta: 100.into(),
                kind: TrackEventKind::Midi {
                    channel: 0.into(),
                    message: MidiMessage::NoteOn {
                        key: 60.into(),
                        vel: 64.into(),
                    },
                },
            },
            TrackEvent {
                delta: 200.into(),
                kind: TrackEventKind::Midi {
                    channel: 0.into(),
                    message: MidiMessage::NoteOff {
                        key: 60.into(),
                        vel: 0.into(),
                    },
                },
            },
        ];

        convert_to_delta_times(&mut events);

        assert_eq!(events[0].delta.as_int(), 0);
        assert_eq!(events[1].delta.as_int(), 100);
        assert_eq!(events[2].delta.as_int(), 100); // 200 - 100 = 100
    }

    #[test]
    fn test_write_multi_track_smf() {
        let score = Score {
            tpq: 480,
            divisions: 1,
            tempos: vec![Tempo { tick: 0, bpm: 120.0 }],
            timesigs: vec![TimeSig { tick: 0, num: 4, den: 4 }],
            parts: vec![
                Part {
                    id: "P1".to_string(),
                    name: "Piano".to_string(),
                    channel: 0,
                    program: Some(0),
                    notes: vec![
                        Note {
                            start_tick: 0,
                            dur_tick: 480,
                            pitch: 60,
                            vel: 64,
                            voice: 1,
                        },
                    ],
                },
                Part {
                    id: "P2".to_string(),
                    name: "Violin".to_string(),
                    channel: 1,
                    program: Some(40),
                    notes: vec![
                        Note {
                            start_tick: 0,
                            dur_tick: 240,
                            pitch: 64,
                            vel: 80,
                            voice: 1,
                        },
                    ],
                },
            ],
        };

        let mut out = Vec::new();
        write_smf(&score, &mut out).expect("Failed to write multi-track SMF");

        // Verify header
        assert_eq!(&out[0..4], b"MThd");
        // Verify it's Format 1 (multi-track)
        assert_eq!(out[8], 0x00);
        assert_eq!(out[9], 0x01);
        // Should have 3 tracks (1 conductor + 2 parts)
        assert_eq!(out[10], 0x00);
        assert_eq!(out[11], 0x03);
    }

    #[test]
    fn test_write_with_multiple_tempos() {
        let score = Score {
            tpq: 480,
            divisions: 1,
            tempos: vec![
                Tempo { tick: 0, bpm: 120.0 },
                Tempo { tick: 1920, bpm: 90.0 },
            ],
            timesigs: vec![TimeSig { tick: 0, num: 4, den: 4 }],
            parts: vec![Part {
                id: "P1".to_string(),
                name: "Piano".to_string(),
                channel: 0,
                program: Some(0),
                notes: vec![],
            }],
        };

        let mut out = Vec::new();
        write_smf(&score, &mut out).expect("Failed to write SMF with multiple tempos");

        assert_eq!(&out[0..4], b"MThd");
        assert!(out.len() > 14);
    }

    #[test]
    fn test_write_with_chord() {
        let score = Score {
            tpq: 480,
            divisions: 1,
            tempos: vec![Tempo { tick: 0, bpm: 120.0 }],
            timesigs: vec![TimeSig { tick: 0, num: 4, den: 4 }],
            parts: vec![Part {
                id: "P1".to_string(),
                name: "Piano".to_string(),
                channel: 0,
                program: Some(0),
                notes: vec![
                    // Chord: C, E, G played simultaneously
                    Note {
                        start_tick: 0,
                        dur_tick: 480,
                        pitch: 60, // C
                        vel: 64,
                        voice: 1,
                    },
                    Note {
                        start_tick: 0,
                        dur_tick: 480,
                        pitch: 64, // E
                        vel: 64,
                        voice: 1,
                    },
                    Note {
                        start_tick: 0,
                        dur_tick: 480,
                        pitch: 67, // G
                        vel: 64,
                        voice: 1,
                    },
                ],
            }],
        };

        let mut out = Vec::new();
        write_smf(&score, &mut out).expect("Failed to write SMF with chord");

        assert_eq!(&out[0..4], b"MThd");
        assert!(out.len() > 14);
    }
}
