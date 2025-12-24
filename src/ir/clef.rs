//! Automatic clef guessing based on pitch range analysis
//!
//! This module provides functionality to automatically select appropriate clefs
//! (treble or bass) for musical lines based on their pitch content.

use crate::models::core::{Line, Document};
use crate::models::pitch_code::{PitchCode, AccidentalType};

/// Guess appropriate clef for a line based on pitch range
///
/// Analyzes all pitched cells in the line and calculates the median MIDI note.
/// Uses the median to determine whether treble or bass clef is more appropriate.
///
/// # Algorithm
/// 1. Convert all pitched cells to MIDI note numbers (C4 = 60)
/// 2. Calculate median MIDI note (robust to outliers)
/// 3. Apply threshold: below C3 (MIDI 48) → bass, at/above C3 → treble
///
/// # Arguments
/// * `line` - The musical line to analyze
/// * `document` - Parent document (currently unused, reserved for future tonic-aware analysis)
///
/// # Returns
/// String "treble" or "bass"
///
/// # Examples
/// ```
/// use editor_wasm::ir::clef::guess_clef_from_line;
/// use editor_wasm::models::core::{Line, Document};
///
/// let line = Line::new();
/// let doc = Document::new();
/// let clef = guess_clef_from_line(&line, &doc);
/// assert_eq!(clef, "treble"); // Empty lines default to treble
/// ```
pub fn guess_clef_from_line(line: &Line, _document: &Document) -> String {
    // Collect MIDI note numbers from all pitched cells
    let mut midi_notes: Vec<u8> = line.cells
        .iter()
        .filter_map(|cell| {
            let pitch_code = cell.get_pitch_code()?;
            let octave = cell.get_octave();
            Some(pitch_code_to_midi(pitch_code, octave))
        })
        .collect();

    if midi_notes.is_empty() {
        return "treble".to_string(); // Default for empty/non-pitched lines
    }

    // Calculate median pitch (more robust than mean for outliers)
    midi_notes.sort_unstable();
    let median = midi_notes[midi_notes.len() / 2];

    // Clef selection based on median MIDI note
    // MIDI 60 = C4 (middle C - boundary between bass and treble)
    match median {
        0..=59 => "bass",      // Below middle C → bass clef
        60..=127 => "treble",  // Middle C and above → treble clef
        _ => "treble",         // Fallback
    }.to_string()
}

/// Convert PitchCode + octave to MIDI note number (C4 = 60)
///
/// Maps absolute pitch representation to MIDI note numbers.
/// PitchCode represents scale degrees (1-7) with accidentals.
/// Octave offset is relative to middle octave (0 = C4).
///
/// # Arguments
/// * `pitch_code` - The pitch code (degree + accidental)
/// * `octave` - Octave offset (-2 to +2, where 0 = middle octave C4)
///
/// # Returns
/// MIDI note number (0-127, clamped to valid range)
///
/// # Examples
/// ```
/// use editor_wasm::ir::clef::pitch_code_to_midi;
/// use editor_wasm::models::pitch_code::PitchCode;
///
/// // C4 (middle C)
/// assert_eq!(pitch_code_to_midi(PitchCode::N1, 0), 60);
///
/// // C5 (one octave up)
/// assert_eq!(pitch_code_to_midi(PitchCode::N1, 1), 72);
///
/// // C#4
/// assert_eq!(pitch_code_to_midi(PitchCode::N1s, 0), 61);
/// ```
fn pitch_code_to_midi(pitch_code: PitchCode, octave: i8) -> u8 {
    // Base semitones for each degree (relative to C)
    // N1=C, N2=D, N3=E, N4=F, N5=G, N6=A, N7=B
    let base_semitone = match pitch_code.degree() {
        1 => 0,   // N1 = C
        2 => 2,   // N2 = D
        3 => 4,   // N3 = E
        4 => 5,   // N4 = F
        5 => 7,   // N5 = G
        6 => 9,   // N6 = A
        7 => 11,  // N7 = B
        _ => 0,   // Fallback (shouldn't happen)
    };

    // Accidental offset in semitones
    let accidental_offset = match pitch_code.accidental_type() {
        AccidentalType::DoubleFlat => -2,
        AccidentalType::Flat | AccidentalType::HalfFlat => -1,  // Half-flat rounded to -1
        AccidentalType::None | AccidentalType::Natural => 0,
        AccidentalType::Sharp => 1,
        AccidentalType::DoubleSharp => 2,
    };

    // Calculate MIDI: C4 = 60, each octave = 12 semitones
    let midi = 60 + base_semitone + accidental_offset + (octave as i16 * 12);

    // Clamp to valid MIDI range (0-127)
    midi.clamp(0, 127) as u8
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::pitch_code::PitchCode;

    #[test]
    fn test_pitch_code_to_midi_base_octave() {
        // N1 at octave 0 = C4 = MIDI 60
        assert_eq!(pitch_code_to_midi(PitchCode::N1, 0), 60);

        // All natural notes at octave 0
        assert_eq!(pitch_code_to_midi(PitchCode::N1, 0), 60);  // C4
        assert_eq!(pitch_code_to_midi(PitchCode::N2, 0), 62);  // D4
        assert_eq!(pitch_code_to_midi(PitchCode::N3, 0), 64);  // E4
        assert_eq!(pitch_code_to_midi(PitchCode::N4, 0), 65);  // F4
        assert_eq!(pitch_code_to_midi(PitchCode::N5, 0), 67);  // G4
        assert_eq!(pitch_code_to_midi(PitchCode::N6, 0), 69);  // A4
        assert_eq!(pitch_code_to_midi(PitchCode::N7, 0), 71);  // B4
    }

    #[test]
    fn test_pitch_code_to_midi_octaves() {
        // N1 at octave 1 = C5 = MIDI 72
        assert_eq!(pitch_code_to_midi(PitchCode::N1, 1), 72);

        // N1 at octave -1 = C3 = MIDI 48
        assert_eq!(pitch_code_to_midi(PitchCode::N1, -1), 48);

        // N1 at octave 2 = C6 = MIDI 84
        assert_eq!(pitch_code_to_midi(PitchCode::N1, 2), 84);

        // N1 at octave -2 = C2 = MIDI 36
        assert_eq!(pitch_code_to_midi(PitchCode::N1, -2), 36);
    }

    #[test]
    fn test_pitch_code_to_midi_accidentals() {
        // N1# at octave 0 = C#4 = MIDI 61
        assert_eq!(pitch_code_to_midi(PitchCode::N1s, 0), 61);

        // N1b at octave 0 = Cb4 = MIDI 59
        assert_eq!(pitch_code_to_midi(PitchCode::N1b, 0), 59);

        // N2 at octave -2 = D2 = MIDI 38
        assert_eq!(pitch_code_to_midi(PitchCode::N2, -2), 38);

        // N4s at octave 0 = F#4 = MIDI 66
        assert_eq!(pitch_code_to_midi(PitchCode::N4s, 0), 66);

        // N7b at octave 0 = Bb4 = MIDI 70
        assert_eq!(pitch_code_to_midi(PitchCode::N7b, 0), 70);
    }

    #[test]
    fn test_pitch_code_to_midi_double_accidentals() {
        // N1## at octave 0 = C##4 = MIDI 62
        assert_eq!(pitch_code_to_midi(PitchCode::N1ss, 0), 62);

        // N1bb at octave 0 = Cbb4 = MIDI 58
        assert_eq!(pitch_code_to_midi(PitchCode::N1bb, 0), 58);
    }

    #[test]
    fn test_clef_guess_low_range() {
        use crate::models::core::{Line, Document, Cell};
        use crate::models::elements::ElementKind;
        use crate::renderers::font_utils::glyph_for_pitch;
        use crate::models::elements::PitchSystem;

        // Create a line with notes at octave -2 (very low: C2, D2, E2, etc.)
        let mut line = Line::new();
        let doc = Document::new();

        // Add pitched cells at octave -2
        for degree in 1..=7 {
            let pitch_code = match degree {
                1 => PitchCode::N1,
                2 => PitchCode::N2,
                3 => PitchCode::N3,
                4 => PitchCode::N4,
                5 => PitchCode::N5,
                6 => PitchCode::N6,
                7 => PitchCode::N7,
                _ => PitchCode::N1,
            };
            if let Some(glyph) = glyph_for_pitch(pitch_code, -2, PitchSystem::Number) {
                let cell = Cell::new(glyph.to_string(), ElementKind::PitchedElement);
                line.cells.push(cell);
            }
        }

        let clef = guess_clef_from_line(&line, &doc);
        assert_eq!(clef, "bass", "Low octave notes should get bass clef");
    }

    #[test]
    fn test_clef_guess_mid_range() {
        use crate::models::core::{Line, Document, Cell};
        use crate::models::elements::ElementKind;
        use crate::renderers::font_utils::glyph_for_pitch;
        use crate::models::elements::PitchSystem;

        // Create a line with notes at octave 0 (middle range: C4, D4, E4, etc.)
        let mut line = Line::new();
        let doc = Document::new();

        for degree in 1..=7 {
            let pitch_code = match degree {
                1 => PitchCode::N1,
                2 => PitchCode::N2,
                3 => PitchCode::N3,
                4 => PitchCode::N4,
                5 => PitchCode::N5,
                6 => PitchCode::N6,
                7 => PitchCode::N7,
                _ => PitchCode::N1,
            };
            if let Some(glyph) = glyph_for_pitch(pitch_code, 0, PitchSystem::Number) {
                let cell = Cell::new(glyph.to_string(), ElementKind::PitchedElement);
                line.cells.push(cell);
            }
        }

        let clef = guess_clef_from_line(&line, &doc);
        assert_eq!(clef, "treble", "Mid-range notes should get treble clef");
    }

    #[test]
    fn test_clef_guess_high_range() {
        use crate::models::core::{Line, Document, Cell};
        use crate::models::elements::ElementKind;
        use crate::renderers::font_utils::glyph_for_pitch;
        use crate::models::elements::PitchSystem;

        // Create a line with notes at octave +1 (high: C5, D5, E5, etc.)
        let mut line = Line::new();
        let doc = Document::new();

        for degree in 1..=7 {
            let pitch_code = match degree {
                1 => PitchCode::N1,
                2 => PitchCode::N2,
                3 => PitchCode::N3,
                4 => PitchCode::N4,
                5 => PitchCode::N5,
                6 => PitchCode::N6,
                7 => PitchCode::N7,
                _ => PitchCode::N1,
            };
            if let Some(glyph) = glyph_for_pitch(pitch_code, 1, PitchSystem::Number) {
                let cell = Cell::new(glyph.to_string(), ElementKind::PitchedElement);
                line.cells.push(cell);
            }
        }

        let clef = guess_clef_from_line(&line, &doc);
        assert_eq!(clef, "treble", "High octave notes should get treble clef");
    }

    #[test]
    fn test_clef_guess_empty_line() {
        use crate::models::core::{Line, Document};

        let line = Line::new();
        let doc = Document::new();
        let clef = guess_clef_from_line(&line, &doc);

        assert_eq!(clef, "treble", "Empty lines should default to treble");
    }

    #[test]
    fn test_clef_guess_boundary_c4() {
        use crate::models::core::{Line, Document, Cell};
        use crate::models::elements::{ElementKind, PitchSystem};
        use crate::renderers::font_utils::glyph_for_pitch;

        // Line with C4 (octave 0, N1) = MIDI 60 (middle C - boundary)
        let mut line = Line::new();
        let doc = Document::new();

        if let Some(glyph) = glyph_for_pitch(PitchCode::N1, 0, PitchSystem::Number) {
            let cell = Cell::new(glyph.to_string(), ElementKind::PitchedElement);
            line.cells.push(cell);
        }

        let clef = guess_clef_from_line(&line, &doc);
        // MIDI 60 is exactly at boundary, should be treble (>= 60)
        assert_eq!(clef, "treble", "C4/middle C (MIDI 60) should get treble clef");
    }

    #[test]
    fn test_clef_guess_just_below_boundary() {
        use crate::models::core::{Line, Document, Cell};
        use crate::models::elements::{ElementKind, PitchSystem};
        use crate::renderers::font_utils::glyph_for_pitch;

        // Line with B3 (octave -1, N7) = MIDI 59 (just below middle C boundary)
        let mut line = Line::new();
        let doc = Document::new();

        if let Some(glyph) = glyph_for_pitch(PitchCode::N7, -1, PitchSystem::Number) {
            let cell = Cell::new(glyph.to_string(), ElementKind::PitchedElement);
            line.cells.push(cell);
        }

        let clef = guess_clef_from_line(&line, &doc);
        assert_eq!(clef, "bass", "B3 (MIDI 59) should get bass clef");
    }

    #[test]
    fn test_clef_guess_c3_gets_bass() {
        use crate::models::core::{Line, Document, Cell};
        use crate::models::elements::{ElementKind, PitchSystem};
        use crate::renderers::font_utils::glyph_for_pitch;

        // Line with C3 (octave -1, N1) = MIDI 48 (below middle C)
        let mut line = Line::new();
        let doc = Document::new();

        if let Some(glyph) = glyph_for_pitch(PitchCode::N1, -1, PitchSystem::Number) {
            let cell = Cell::new(glyph.to_string(), ElementKind::PitchedElement);
            line.cells.push(cell);
        }

        let clef = guess_clef_from_line(&line, &doc);
        assert_eq!(clef, "bass", "C3 (MIDI 48) should get bass clef");
    }

    #[test]
    fn test_clef_in_musicxml_export_bass() {
        use crate::models::elements::PitchSystem;
        use crate::api::render::markup_to_document;
        use crate::renderers::musicxml::emitter::{emit_musicxml, EmitOptions};
        use crate::ir::build_export_measures_from_document;

        // Create document with low notes (should get bass clef)
        let markup = "<system><lowest/>1 2 3 4 5 6 7</system>";
        let doc = markup_to_document(markup, PitchSystem::Number).unwrap();

        // Build IR
        let export_lines = build_export_measures_from_document(&doc);

        // Export to MusicXML
        let options = EmitOptions::default();
        let musicxml = emit_musicxml(&export_lines, &options).unwrap();

        // Verify bass clef is present (F clef, line 4)
        assert!(musicxml.contains("<sign>F</sign>"), "MusicXML should contain F clef for low notes");
        assert!(musicxml.contains("<line>4</line>"), "MusicXML should contain line 4 for bass clef");
    }

    #[test]
    fn test_clef_in_musicxml_export_treble() {
        use crate::models::elements::PitchSystem;
        use crate::api::render::markup_to_document;
        use crate::renderers::musicxml::emitter::{emit_musicxml, EmitOptions};
        use crate::ir::build_export_measures_from_document;

        // Create document with mid-range notes (should get treble clef)
        let markup = "<system>1 2 3 4 5 6 7</system>";
        let doc = markup_to_document(markup, PitchSystem::Number).unwrap();

        // Build IR
        let export_lines = build_export_measures_from_document(&doc);

        // Export to MusicXML
        let options = EmitOptions::default();
        let musicxml = emit_musicxml(&export_lines, &options).unwrap();

        // Verify treble clef is present (G clef, line 2)
        assert!(musicxml.contains("<sign>G</sign>"), "MusicXML should contain G clef for mid-range notes");
        assert!(musicxml.contains("<line>2</line>"), "MusicXML should contain line 2 for treble clef");
    }

    #[test]
    fn test_clef_in_musicxml_export_high() {
        use crate::models::elements::PitchSystem;
        use crate::api::render::markup_to_document;
        use crate::renderers::musicxml::emitter::{emit_musicxml, EmitOptions};
        use crate::ir::build_export_measures_from_document;

        // Create document with high notes (should still get treble clef)
        let markup = "<system><up/>1 2 3 4 5 6 7</system>";
        let doc = markup_to_document(markup, PitchSystem::Number).unwrap();

        // Build IR
        let export_lines = build_export_measures_from_document(&doc);

        // Export to MusicXML
        let options = EmitOptions::default();
        let musicxml = emit_musicxml(&export_lines, &options).unwrap();

        // Verify treble clef is present (G clef, line 2)
        assert!(musicxml.contains("<sign>G</sign>"), "MusicXML should contain G clef for high notes");
        assert!(musicxml.contains("<line>2</line>"), "MusicXML should contain line 2 for treble clef");
    }
}
