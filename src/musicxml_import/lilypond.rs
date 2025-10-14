//! LilyPond notation generation
//!
//! Converts the internal Music representation to LilyPond source code.

use crate::musicxml_import::types::*;

/// Generate LilyPond document from music and settings
pub fn generate_lilypond_document(
    parts: Vec<SequentialMusic>,
    settings: &ConversionSettings,
) -> String {
    let mut output = String::new();

    // Version header
    output.push_str(&format!(
        "\\version \"{}\"\n",
        settings.target_lilypond_version
    ));

    // Language directive
    let lang = match settings.language {
        PitchLanguage::Nederlands => "nederlands",
        PitchLanguage::English => "english",
        PitchLanguage::Deutsch => "deutsch",
        PitchLanguage::Italiano => "italiano",
    };
    output.push_str(&format!("\\language \"{}\"\n\n", lang));

    // Score block
    output.push_str("\\score {\n");

    if parts.len() == 1 {
        // Single part - simple staff
        output.push_str("  \\new Staff {\n");
        output.push_str("    {\n");
        output.push_str(&generate_music(&parts[0], settings, 6));
        output.push_str("    }\n");
        output.push_str("  }\n");
    } else {
        // Multiple parts - use StaffGroup
        output.push_str("  \\new StaffGroup <<\n");
        for part in &parts {
            output.push_str("    \\new Staff {\n");
            output.push_str("      {\n");
            output.push_str(&generate_music(part, settings, 8));
            output.push_str("      }\n");
            output.push_str("    }\n");
        }
        output.push_str("  >>\n");
    }

    output.push_str("  \\layout { }\n");
    output.push_str("  \\midi { }\n");
    output.push_str("}\n");

    output
}

/// Generate LilyPond code for sequential music
fn generate_music(seq: &SequentialMusic, settings: &ConversionSettings, indent: usize) -> String {
    let indent_str = " ".repeat(indent);
    let mut output = String::new();

    for music in &seq.elements {
        let line = music_to_lilypond(music, settings);
        output.push_str(&format!("{}{}\n", indent_str, line));
    }

    output
}

/// Convert a Music element to LilyPond notation
fn music_to_lilypond(music: &Music, settings: &ConversionSettings) -> String {
    match music {
        Music::Note(note) => note_to_lilypond(note, settings),
        Music::Rest(rest) => rest_to_lilypond(rest),
        Music::Chord(chord) => chord_to_lilypond(chord, settings),
        Music::KeyChange(key) => key_to_lilypond(key),
        Music::TimeChange(time) => time_to_lilypond(time),
        Music::ClefChange(clef) => clef_to_lilypond(clef),
        Music::Tuplet(tuplet) => tuplet_to_lilypond(tuplet, settings),
        Music::Sequential(seq) => {
            let inner = seq
                .elements
                .iter()
                .map(|m| music_to_lilypond(m, settings))
                .collect::<Vec<_>>()
                .join(" ");
            format!("{{ {} }}", inner)
        }
        Music::Simultaneous(sim) => {
            let inner = sim
                .elements
                .iter()
                .map(|m| music_to_lilypond(m, settings))
                .collect::<Vec<_>>()
                .join(" \\\\ ");
            format!("<< {} >>", inner)
        }
        Music::Voice(voice) => voice_to_lilypond(voice, settings),
        Music::Dynamic(dynamic) => dynamic_to_lilypond(dynamic),
        Music::Articulation(articulation) => articulation_to_lilypond(articulation),
        Music::Tempo(tempo) => tempo_to_lilypond(tempo),
        Music::Text(text) => text_to_lilypond(text),
    }
}

/// Convert note to LilyPond
fn note_to_lilypond(note: &NoteEvent, settings: &ConversionSettings) -> String {
    let mut result = String::new();

    // Add grace note prefix if needed
    if note.is_grace {
        if note.grace_slash {
            result.push_str("\\acciaccatura ");
        } else {
            result.push_str("\\grace ");
        }
    }

    // Add pitch and duration
    let pitch = note.pitch.to_lilypond_string(settings.language);
    let duration = note.duration.to_lilypond_string();
    result.push_str(&format!("{}{}", pitch, duration));

    // Add articulations
    for articulation in &note.articulations {
        result.push_str(&articulation_to_lilypond(articulation));
    }

    // Add tie if present
    if let Some(tie) = note.tie {
        use crate::musicxml_import::types::Tie;
        match tie {
            Tie::Start => result.push_str(" ~"),
            Tie::Stop => {}, // Stop is implicit from previous start
            Tie::Continue => result.push_str(" ~"),
        }
    }

    // Add dynamics if present
    if let Some(ref dynamic) = note.dynamics {
        result.push(' ');
        result.push_str(&dynamic_to_lilypond(dynamic));
    }

    result
}

/// Convert rest to LilyPond
fn rest_to_lilypond(rest: &RestEvent) -> String {
    let duration = rest.duration.to_lilypond_string();
    format!("r{}", duration)
}

/// Convert chord to LilyPond
fn chord_to_lilypond(chord: &ChordEvent, settings: &ConversionSettings) -> String {
    let pitches = chord
        .notes
        .iter()
        .map(|p| p.to_lilypond_string(settings.language))
        .collect::<Vec<_>>()
        .join(" ");
    let duration = chord.duration.to_lilypond_string();
    format!("< {} >{}", pitches, duration)
}

/// Convert key signature to LilyPond
fn key_to_lilypond(key: &KeySignature) -> String {
    // Map fifths to key name
    let key_name = match key.fifths {
        -7 => "cf",
        -6 => "gf",
        -5 => "df",
        -4 => "af",
        -3 => "ef",
        -2 => "bf",
        -1 => "f",
        0 => "c",
        1 => "g",
        2 => "d",
        3 => "a",
        4 => "e",
        5 => "b",
        6 => "fs",
        7 => "cs",
        _ => "c",
    };

    let mode_name = match key.mode {
        Mode::Major => "\\major",
        Mode::Minor => "\\minor",
        Mode::Dorian => "\\dorian",
        Mode::Phrygian => "\\phrygian",
        Mode::Lydian => "\\lydian",
        Mode::Mixolydian => "\\mixolydian",
        Mode::Aeolian => "\\minor", // Aeolian is equivalent to minor
        Mode::Locrian => "\\locrian",
    };

    format!("\\key {} {}", key_name, mode_name)
}

/// Convert time signature to LilyPond
fn time_to_lilypond(time: &TimeSignature) -> String {
    format!("\\time {}/{}", time.beats, time.beat_type)
}

/// Convert clef to LilyPond
fn clef_to_lilypond(clef: &Clef) -> String {
    let clef_name = match clef.clef_type {
        ClefType::Treble => "treble",
        ClefType::Bass => "bass",
        ClefType::Alto => "alto",
        ClefType::Tenor => "tenor",
        ClefType::Soprano => "soprano",
        ClefType::MezzoSoprano => "mezzosoprano",
        ClefType::Baritone => "baritone",
        ClefType::Percussion => "percussion",
    };
    format!("\\clef {}", clef_name)
}

/// Convert tuplet to LilyPond
fn tuplet_to_lilypond(tuplet: &TupletMusic, settings: &ConversionSettings) -> String {
    // LilyPond syntax: \tuplet actual/normal { notes }
    let (normal, actual) = tuplet.ratio;
    let contents = tuplet
        .contents
        .iter()
        .map(|m| music_to_lilypond(m, settings))
        .collect::<Vec<_>>()
        .join(" ");

    format!("\\tuplet {}/{} {{ {} }}", actual, normal, contents)
}

/// Convert voice to LilyPond
fn voice_to_lilypond(voice: &VoiceMusic, settings: &ConversionSettings) -> String {
    let contents = voice
        .elements
        .iter()
        .map(|m| music_to_lilypond(m, settings))
        .collect::<Vec<_>>()
        .join(" ");

    if let Some(ref voice_id) = voice.voice_id {
        // Use voice context if ID is specified
        format!("\\new Voice = \"{}\" {{ {} }}", voice_id, contents)
    } else {
        format!("{{ {} }}", contents)
    }
}

/// Convert dynamic marking to LilyPond
fn dynamic_to_lilypond(dynamic: &DynamicMark) -> String {
    use crate::musicxml_import::types::DynamicType;

    let mark = match dynamic.dynamic_type {
        DynamicType::PPP => "\\ppp",
        DynamicType::PP => "\\pp",
        DynamicType::P => "\\p",
        DynamicType::MP => "\\mp",
        DynamicType::MF => "\\mf",
        DynamicType::F => "\\f",
        DynamicType::FF => "\\ff",
        DynamicType::FFF => "\\fff",
        DynamicType::FP => "\\fp",
        DynamicType::SF => "\\sf",
        DynamicType::SFZ => "\\sfz",
    };
    mark.to_string()
}

/// Convert articulation marking to LilyPond
fn articulation_to_lilypond(articulation: &ArticulationMark) -> String {
    use crate::musicxml_import::types::ArticulationType;

    let mark = match articulation.articulation_type {
        ArticulationType::Staccato => "-.",
        ArticulationType::Staccatissimo => "-!",
        ArticulationType::Accent => "->",
        ArticulationType::Marcato => "-^",
        ArticulationType::Tenuto => "--",
        ArticulationType::Portato => "-_",
    };
    mark.to_string()
}

/// Convert tempo marking to LilyPond
fn tempo_to_lilypond(tempo: &TempoMark) -> String {
    let mut result = String::new();

    if let Some(ref text) = tempo.text {
        result.push_str(&format!("\\tempo \"{}\"", text));
    }

    if let Some(bpm) = tempo.bpm {
        if let Some(ref beat_unit) = tempo.beat_unit {
            let unit = beat_unit.to_lilypond_string();
            if !result.is_empty() {
                result.push(' ');
            }
            result.push_str(&format!("{} = {}", unit, bpm));
        } else {
            // Default to quarter note
            if !result.is_empty() {
                result.push(' ');
            }
            result.push_str(&format!("4 = {}", bpm));
        }
    }

    if result.is_empty() {
        String::new()
    } else {
        format!("\\tempo {}", result)
    }
}

/// Convert text marking to LilyPond
fn text_to_lilypond(text: &TextMark) -> String {
    use crate::musicxml_import::types::Placement;

    match text.placement {
        Placement::Above => format!("^\\markup {{ {} }}", text.text),
        Placement::Below => format!("_\\markup {{ {} }}", text.text),
    }
}
