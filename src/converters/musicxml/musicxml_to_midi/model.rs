/// Lean Internal Representation for MusicXML → MIDI conversion
///
/// This IR is designed specifically for export - not a full-featured music object model.
/// It contains just what's needed to convert MusicXML to MIDI accurately.

#[derive(Debug, Clone)]
pub struct Score {
    pub tpq: u16,                 // Ticks per quarter note
    pub divisions: u32,           // MusicXML <divisions> (time units per quarter)
    pub tempos: Vec<Tempo>,       // (tick, bpm) sorted by tick
    pub timesigs: Vec<TimeSig>,   // (tick, num, den) sorted by tick
    pub parts: Vec<Part>,         // One per MusicXML <part>
}

#[derive(Debug, Clone)]
pub struct Tempo {
    pub tick: u64,
    pub bpm: f64,
}

#[derive(Debug, Clone)]
pub struct TimeSig {
    pub tick: u64,
    pub num: u8,   // Numerator (e.g., 3 in 3/4)
    pub den: u8,   // Denominator (e.g., 4 in 3/4)
}

#[derive(Debug, Clone)]
pub struct Part {
    pub id: String,
    pub name: String,
    pub channel: u8,          // MIDI channel 0-15 (9 = drums)
    pub program: Option<u8>,  // MIDI program 0-127 (GM instrument)
    pub notes: Vec<Note>,
}

#[derive(Debug, Clone)]
pub struct Note {
    pub start_tick: u64,
    pub dur_tick: u64,
    pub pitch: u8,      // MIDI note number 0-127
    pub vel: u8,        // Velocity 1-127
    pub voice: u8,      // MusicXML voice for multi-voice handling
}

/// Convert MusicXML divisions to MIDI ticks
///
/// # Arguments
/// * `divs` - Duration in MusicXML divisions
/// * `divisions` - MusicXML divisions per quarter note
/// * `tpq` - MIDI ticks per quarter note
///
/// # Returns
/// Duration in MIDI ticks
pub fn divs_to_ticks(divs: u64, divisions: u32, tpq: u16) -> u64 {
    let num = divs * (tpq as u64);
    // Round to nearest tick
    (num + (divisions as u64 / 2)) / (divisions as u64)
}

/// Convert MusicXML pitch representation to MIDI note number
///
/// # Arguments
/// * `step` - Note letter (C, D, E, F, G, A, B)
/// * `alter` - Semitone alteration (-2 = double flat, -1 = flat, 0 = natural, 1 = sharp, 2 = double sharp)
/// * `octave` - Octave number (C4 = middle C)
///
/// # Returns
/// MIDI note number (0-127, where 60 = C4)
pub fn pitch_to_midi(step: &str, alter: i8, octave: i8) -> u8 {
    let base = match step {
        "C" => 0,
        "D" => 2,
        "E" => 4,
        "F" => 5,
        "G" => 7,
        "A" => 9,
        "B" => 11,
        _ => 0,
    };
    // MIDI note 0 = C-1, so C4 (middle C) = 60
    let semi = base as i8 + alter + (octave + 1) * 12;
    semi.clamp(0, 127) as u8
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pitch_to_midi() {
        assert_eq!(pitch_to_midi("C", 0, 4), 60);  // Middle C
        assert_eq!(pitch_to_midi("C", 1, 4), 61);  // C#
        assert_eq!(pitch_to_midi("D", -1, 4), 61); // Db (enharmonic with C#)
        assert_eq!(pitch_to_midi("A", 0, 4), 69);  // A440
    }

    #[test]
    fn test_divs_to_ticks() {
        // If divisions = 480 and tpq = 480, then 1:1
        assert_eq!(divs_to_ticks(480, 480, 480), 480);

        // If divisions = 1 and tpq = 480, quarter note = 480 ticks
        assert_eq!(divs_to_ticks(1, 1, 480), 480);

        // Eighth note with divisions=480, tpq=480
        assert_eq!(divs_to_ticks(240, 480, 480), 240);
    }

    #[test]
    fn test_divs_to_ticks_with_rounding() {
        // Test rounding: (1 * 480 + 240) / 480 = 720 / 480 = 1.5 -> 1
        assert_eq!(divs_to_ticks(1, 480, 480), 1);

        // Test with different divisions
        // (480 * 960 + 500) / 1000 = 461,000 / 1000 = 461
        assert_eq!(divs_to_ticks(480, 1000, 960), 461);
    }

    #[test]
    fn test_pitch_to_midi_c_major_scale() {
        // C4 = 60
        assert_eq!(pitch_to_midi("C", 0, 4), 60);
        assert_eq!(pitch_to_midi("D", 0, 4), 62);
        assert_eq!(pitch_to_midi("E", 0, 4), 64);
        assert_eq!(pitch_to_midi("F", 0, 4), 65);
        assert_eq!(pitch_to_midi("G", 0, 4), 67);
        assert_eq!(pitch_to_midi("A", 0, 4), 69);
        assert_eq!(pitch_to_midi("B", 0, 4), 71);
    }

    #[test]
    fn test_pitch_to_midi_accidentals() {
        // C4 with sharps and flats
        assert_eq!(pitch_to_midi("C", 0, 4), 60);   // C natural
        assert_eq!(pitch_to_midi("C", 1, 4), 61);   // C#
        assert_eq!(pitch_to_midi("C", 2, 4), 62);   // C##
        assert_eq!(pitch_to_midi("C", -1, 4), 59);  // Cb
        assert_eq!(pitch_to_midi("C", -2, 4), 58);  // Cbb
    }

    #[test]
    fn test_pitch_to_midi_octaves() {
        // Test octave transitions
        assert_eq!(pitch_to_midi("B", 0, 3), 59);   // B3
        assert_eq!(pitch_to_midi("C", 0, 4), 60);   // C4
        assert_eq!(pitch_to_midi("B", 0, 4), 71);   // B4
        assert_eq!(pitch_to_midi("C", 0, 5), 72);   // C5
    }

    #[test]
    fn test_pitch_to_midi_clamping() {
        // Test that pitches are clamped to valid MIDI range
        assert_eq!(pitch_to_midi("C", 0, -2), 0);    // Lowest possible
        assert_eq!(pitch_to_midi("G", 0, 9), 127);   // Highest possible (G9)
    }

    #[test]
    fn test_score_structure() {
        let score = Score {
            tpq: 480,
            divisions: 480,
            tempos: vec![Tempo { tick: 0, bpm: 120.0 }],
            timesigs: vec![TimeSig { tick: 0, num: 4, den: 4 }],
            parts: vec![Part {
                id: "P1".to_string(),
                name: "Piano".to_string(),
                channel: 0,
                program: Some(0),
                notes: vec![Note {
                    start_tick: 0,
                    dur_tick: 480,
                    pitch: 60,
                    vel: 64,
                    voice: 1,
                }],
            }],
        };

        assert_eq!(score.tpq, 480);
        assert_eq!(score.divisions, 480);
        assert_eq!(score.parts.len(), 1);
        assert_eq!(score.parts[0].notes.len(), 1);
    }
}
