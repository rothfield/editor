//! MusicXML parser implementation
//!
//! Converts MusicXML XML into IR structures using roxmltree.

use crate::ir::{
    ExportLine, ExportMeasure, ExportEvent, NoteData, PitchInfo, Fraction,
    LyricData, SlurData, TieData, TupletInfo, BeamData,
    ArticulationType, Syllabic, SlurType, SlurPlacement, TieType, BeamState,
};
use crate::models::{PitchCode, core::StaffRole};
use roxmltree::Document as XmlDocument;

/// Result type for MusicXML parsing operations
pub type MusicXMLParseResult<T> = Result<T, MusicXMLParseError>;

/// Errors that can occur during MusicXML parsing
#[derive(Debug, Clone)]
pub enum MusicXMLParseError {
    /// XML parsing failed
    XmlParseError(String),
    /// Required element missing
    MissingElement(String),
    /// Invalid value in XML
    InvalidValue { element: String, value: String, reason: String },
    /// Unsupported MusicXML feature
    UnsupportedFeature(String),
    /// Generic error with message
    Other(String),
}

impl std::fmt::Display for MusicXMLParseError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            MusicXMLParseError::XmlParseError(msg) => write!(f, "XML parse error: {}", msg),
            MusicXMLParseError::MissingElement(elem) => write!(f, "Missing required element: {}", elem),
            MusicXMLParseError::InvalidValue { element, value, reason } => {
                write!(f, "Invalid value '{}' for element '{}': {}", value, element, reason)
            }
            MusicXMLParseError::UnsupportedFeature(feat) => write!(f, "Unsupported feature: {}", feat),
            MusicXMLParseError::Other(msg) => write!(f, "{}", msg),
        }
    }
}

impl std::error::Error for MusicXMLParseError {}

/// Parse MusicXML string into IR
///
/// # Arguments
///
/// * `xml_string` - MusicXML document as string
///
/// # Returns
///
/// Vector of ExportLine representing the parsed musical content
///
/// # Example
///
/// ```ignore
/// let musicxml = r#"<?xml version="1.0"?>
/// <score-partwise version="3.1">
///   <part-list>
///     <score-part id="P1"><part-name>Piano</part-name></score-part>
///   </part-list>
///   <part id="P1">
///     <measure number="1">
///       <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration></note>
///     </measure>
///   </part>
/// </score-partwise>"#;
///
/// let ir = parse_musicxml_to_ir(musicxml)?;
/// ```
pub fn parse_musicxml_to_ir(xml_string: &str) -> MusicXMLParseResult<Vec<ExportLine>> {
    // Parse XML
    let doc = XmlDocument::parse(xml_string)
        .map_err(|e| MusicXMLParseError::XmlParseError(e.to_string()))?;

    // Find root element (should be <score-partwise> or <score-timewise>)
    let root = doc.root_element();

    match root.tag_name().name() {
        "score-partwise" => parse_score_partwise(&doc),
        "score-timewise" => {
            // Convert timewise to partwise representation
            Err(MusicXMLParseError::UnsupportedFeature(
                "score-timewise format (use score-partwise instead)".to_string()
            ))
        }
        other => Err(MusicXMLParseError::InvalidValue {
            element: "root".to_string(),
            value: other.to_string(),
            reason: "Expected <score-partwise> or <score-timewise>".to_string(),
        }),
    }
}

/// Parse <score-partwise> structure
fn parse_score_partwise(doc: &XmlDocument) -> MusicXMLParseResult<Vec<ExportLine>> {
    let root = doc.root_element();

    // Parse <part-list> to get part metadata
    let part_list = root.children()
        .find(|n| n.tag_name().name() == "part-list")
        .ok_or_else(|| MusicXMLParseError::MissingElement("part-list".to_string()))?;

    let part_metadata = parse_part_list(&part_list)?;

    // Parse each <part>
    let mut lines = Vec::new();
    let mut part_index = 0;

    for part_node in root.children().filter(|n| n.tag_name().name() == "part") {
        let part_id = part_node.attribute("id")
            .ok_or_else(|| MusicXMLParseError::MissingElement("part id attribute".to_string()))?;

        // Get part name from metadata
        let part_name = part_metadata.get(part_id)
            .cloned()
            .unwrap_or_else(|| format!("Part {}", part_index + 1));

        // Parse the part into an ExportLine
        let line = parse_part(&part_node, part_id, &part_name, part_index)?;
        lines.push(line);
        part_index += 1;
    }

    Ok(lines)
}

/// Parse <part-list> to extract part names
fn parse_part_list(part_list: &roxmltree::Node) -> MusicXMLParseResult<std::collections::HashMap<String, String>> {
    let mut metadata = std::collections::HashMap::new();

    for score_part in part_list.children().filter(|n| n.tag_name().name() == "score-part") {
        if let Some(id) = score_part.attribute("id") {
            let part_name = score_part.children()
                .find(|n| n.tag_name().name() == "part-name")
                .and_then(|n| n.text())
                .unwrap_or("Unnamed Part");

            metadata.insert(id.to_string(), part_name.to_string());
        }
    }

    Ok(metadata)
}

/// Parse a single <part> element
fn parse_part(
    part_node: &roxmltree::Node,
    _part_id: &str,
    part_name: &str,
    part_index: usize,
) -> MusicXMLParseResult<ExportLine> {
    // Initialize line with default values
    let mut line = ExportLine::new(
        0, // system_id - will be set based on bracketing
        format!("P{}", part_index + 1),
        StaffRole::Melody,
        None, // key_signature - will be extracted from first measure
        None, // time_signature - will be extracted from first measure
        "treble".to_string(), // clef - default, will be overridden if found
        part_name.to_string(),
        String::new(), // lyrics - will be accumulated
    );

    // Parse measures
    for measure_node in part_node.children().filter(|n| n.tag_name().name() == "measure") {
        let measure = parse_measure(&measure_node, &mut line)?;
        line.measures.push(measure);
    }

    Ok(line)
}

/// State tracking for measure parsing
struct MeasureState {
    divisions: usize,
    key_fifths: Option<i8>,
    time_signature: Option<(u8, u8)>,
    clef: Option<String>,
}

impl Default for MeasureState {
    fn default() -> Self {
        MeasureState {
            divisions: 4, // Default to quarter note = 4 divisions
            key_fifths: None,
            time_signature: None,
            clef: None,
        }
    }
}

/// Parse a single <measure> element
fn parse_measure(
    measure_node: &roxmltree::Node,
    line: &mut ExportLine,
) -> MusicXMLParseResult<ExportMeasure> {
    let mut state = MeasureState::default();
    let mut events = Vec::new();

    // Process children in order
    for child in measure_node.children().filter(|n| n.is_element()) {
        match child.tag_name().name() {
            "attributes" => {
                parse_attributes(&child, &mut state, line)?;
            }
            "note" => {
                let event = parse_note(&child, &state)?;
                events.push(event);
            }
            "backup" | "forward" => {
                // Handle position changes (for multi-voice music)
                // For now, we'll skip these and focus on single-voice parsing
            }
            _ => {
                // Ignore other elements (print, sound, barline, etc.)
            }
        }
    }

    // Post-process: Set breath_mark_after on notes followed by rests
    let mut i = 0;
    while i < events.len().saturating_sub(1) {
        // Check if current event is Note and next is Rest
        let next_is_rest = matches!(events[i + 1], ExportEvent::Rest { .. });
        if next_is_rest {
            if let ExportEvent::Note(ref mut note) = events[i] {
                note.breath_mark_after = true;
            }
        }
        i += 1;
    }

    Ok(ExportMeasure {
        divisions: state.divisions,
        events,
    })
}

/// Parse <attributes> element
fn parse_attributes(
    attr_node: &roxmltree::Node,
    state: &mut MeasureState,
    line: &mut ExportLine,
) -> MusicXMLParseResult<()> {
    for child in attr_node.children().filter(|n| n.is_element()) {
        match child.tag_name().name() {
            "divisions" => {
                if let Some(text) = child.text() {
                    state.divisions = text.parse()
                        .map_err(|_| MusicXMLParseError::InvalidValue {
                            element: "divisions".to_string(),
                            value: text.to_string(),
                            reason: "Expected positive integer".to_string(),
                        })?;
                }
            }
            "key" => {
                // Parse <fifths> to determine key signature
                if let Some(fifths_node) = child.children().find(|n| n.tag_name().name() == "fifths") {
                    if let Some(text) = fifths_node.text() {
                        let fifths: i8 = text.parse()
                            .map_err(|_| MusicXMLParseError::InvalidValue {
                                element: "fifths".to_string(),
                                value: text.to_string(),
                                reason: "Expected integer".to_string(),
                            })?;
                        state.key_fifths = Some(fifths);

                        // Convert fifths to key signature string
                        line.key_signature = Some(fifths_to_key_name(fifths));
                    }
                }
            }
            "time" => {
                // Parse <beats> and <beat-type>
                let beats = child.children()
                    .find(|n| n.tag_name().name() == "beats")
                    .and_then(|n| n.text())
                    .and_then(|t| t.parse::<u8>().ok());

                let beat_type = child.children()
                    .find(|n| n.tag_name().name() == "beat-type")
                    .and_then(|n| n.text())
                    .and_then(|t| t.parse::<u8>().ok());

                if let (Some(b), Some(bt)) = (beats, beat_type) {
                    state.time_signature = Some((b, bt));
                    line.time_signature = Some(format!("{}/{}", b, bt));
                }
            }
            "clef" => {
                // Parse <sign> (G, F, C, percussion)
                if let Some(sign_node) = child.children().find(|n| n.tag_name().name() == "sign") {
                    if let Some(sign) = sign_node.text() {
                        state.clef = Some(match sign {
                            "G" => "treble",
                            "F" => "bass",
                            "C" => "alto",
                            _ => "treble",
                        }.to_string());

                        line.clef = state.clef.clone().unwrap();
                    }
                }
            }
            _ => {}
        }
    }

    Ok(())
}

/// Parse a <note> element
fn parse_note(
    note_node: &roxmltree::Node,
    state: &MeasureState,
) -> MusicXMLParseResult<ExportEvent> {
    // Check if this is a grace note
    let is_grace = note_node.children().any(|n| n.tag_name().name() == "grace");

    // Check if this is a rest
    let is_rest = note_node.children().any(|n| n.tag_name().name() == "rest");

    // Parse duration (grace notes may not have duration)
    let duration_divs = if is_grace {
        0 // Grace notes have no duration
    } else {
        note_node.children()
            .find(|n| n.tag_name().name() == "duration")
            .and_then(|n| n.text())
            .and_then(|t| t.parse::<usize>().ok())
            .ok_or_else(|| MusicXMLParseError::MissingElement("duration".to_string()))?
    };

    // Calculate fraction (duration / measure_divisions)
    let fraction = if is_grace {
        Fraction::new(0, 1)
    } else {
        Fraction::new(duration_divs, state.divisions)
    };

    // Parse tuplet information
    let tuplet = parse_tuplet(note_node)?;

    if is_rest {
        return Ok(ExportEvent::Rest {
            divisions: duration_divs,
            fraction,
            tuplet,
        });
    }

    // Parse pitch
    let pitch_node = note_node.children()
        .find(|n| n.tag_name().name() == "pitch")
        .ok_or_else(|| MusicXMLParseError::MissingElement("pitch".to_string()))?;

    let pitch = parse_pitch(&pitch_node)?;

    // If this is a grace note, we need to handle it differently
    // For now, we'll skip grace notes and handle them in a second pass
    if is_grace {
        // Grace notes should be attached to the following note
        // This requires lookahead, which we'll implement later
        // For now, return a note with zero duration
        return Ok(ExportEvent::Note(NoteData {
            pitch,
            divisions: 0,
            fraction: Fraction::new(0, 1),
            grace_notes_before: Vec::new(),
            grace_notes_after: Vec::new(),
            lyrics: None,
            slur: None,
            articulations: Vec::new(),
            beam: None,
            tie: None,
            tuplet: None,
            breath_mark_after: false,
        }));
    }

    // Parse lyrics
    let lyrics = parse_lyrics(note_node)?;

    // Parse slur
    let slur = parse_slur(note_node)?;

    // Parse tie
    let tie = parse_tie(note_node)?;

    // Parse articulations
    let articulations = parse_articulations(note_node)?;

    // Parse beam
    let beam = parse_beam(note_node)?;

    Ok(ExportEvent::Note(NoteData {
        pitch,
        divisions: duration_divs,
        fraction,
        grace_notes_before: Vec::new(), // Will be filled in post-processing
        grace_notes_after: Vec::new(),
        lyrics,
        slur,
        articulations,
        beam,
        tie,
        tuplet,
        breath_mark_after: false,
    }))
}

/// Parse <pitch> element
fn parse_pitch(pitch_node: &roxmltree::Node) -> MusicXMLParseResult<PitchInfo> {
    // Parse <step> (C, D, E, F, G, A, B)
    let step = pitch_node.children()
        .find(|n| n.tag_name().name() == "step")
        .and_then(|n| n.text())
        .ok_or_else(|| MusicXMLParseError::MissingElement("step".to_string()))?;

    // Parse optional <alter> (-2, -1, 0, 1, 2)
    let alter = pitch_node.children()
        .find(|n| n.tag_name().name() == "alter")
        .and_then(|n| n.text())
        .and_then(|t| t.parse::<i8>().ok())
        .unwrap_or(0);

    // Parse <octave>
    let octave = pitch_node.children()
        .find(|n| n.tag_name().name() == "octave")
        .and_then(|n| n.text())
        .and_then(|t| t.parse::<i8>().ok())
        .ok_or_else(|| MusicXMLParseError::MissingElement("octave".to_string()))?;

    // Convert MusicXML pitch to PitchCode
    let pitch_code = musicxml_pitch_to_pitch_code(step, alter)?;

    Ok(PitchInfo::new(pitch_code, octave))
}

/// Convert MusicXML pitch (step + alter) to PitchCode
fn musicxml_pitch_to_pitch_code(step: &str, alter: i8) -> MusicXMLParseResult<PitchCode> {
    match (step, alter) {
        // C pitches (degree 1)
        ("C", 0) => Ok(PitchCode::N1),      // C natural
        ("C", 1) => Ok(PitchCode::N1s),     // C sharp
        ("C", -1) => Ok(PitchCode::N1b),    // C flat
        ("C", 2) => Ok(PitchCode::N1ss),    // C double sharp
        ("C", -2) => Ok(PitchCode::N1bb),   // C double flat

        // D pitches (degree 2)
        ("D", 0) => Ok(PitchCode::N2),      // D natural
        ("D", 1) => Ok(PitchCode::N2s),     // D sharp
        ("D", -1) => Ok(PitchCode::N2b),    // D flat
        ("D", 2) => Ok(PitchCode::N2ss),    // D double sharp
        ("D", -2) => Ok(PitchCode::N2bb),   // D double flat

        // E pitches (degree 3)
        ("E", 0) => Ok(PitchCode::N3),      // E natural
        ("E", 1) => Ok(PitchCode::N3s),     // E sharp
        ("E", -1) => Ok(PitchCode::N3b),    // E flat
        ("E", 2) => Ok(PitchCode::N3ss),    // E double sharp
        ("E", -2) => Ok(PitchCode::N3bb),   // E double flat

        // F pitches (degree 4)
        ("F", 0) => Ok(PitchCode::N4),      // F natural
        ("F", 1) => Ok(PitchCode::N4s),     // F sharp
        ("F", -1) => Ok(PitchCode::N4b),    // F flat
        ("F", 2) => Ok(PitchCode::N4ss),    // F double sharp
        ("F", -2) => Ok(PitchCode::N4bb),   // F double flat

        // G pitches (degree 5)
        ("G", 0) => Ok(PitchCode::N5),      // G natural
        ("G", 1) => Ok(PitchCode::N5s),     // G sharp
        ("G", -1) => Ok(PitchCode::N5b),    // G flat
        ("G", 2) => Ok(PitchCode::N5ss),    // G double sharp
        ("G", -2) => Ok(PitchCode::N5bb),   // G double flat

        // A pitches (degree 6)
        ("A", 0) => Ok(PitchCode::N6),      // A natural
        ("A", 1) => Ok(PitchCode::N6s),     // A sharp
        ("A", -1) => Ok(PitchCode::N6b),    // A flat
        ("A", 2) => Ok(PitchCode::N6ss),    // A double sharp
        ("A", -2) => Ok(PitchCode::N6bb),   // A double flat

        // B pitches (degree 7)
        ("B", 0) => Ok(PitchCode::N7),      // B natural
        ("B", 1) => Ok(PitchCode::N7s),     // B sharp
        ("B", -1) => Ok(PitchCode::N7b),    // B flat
        ("B", 2) => Ok(PitchCode::N7ss),    // B double sharp
        ("B", -2) => Ok(PitchCode::N7bb),   // B double flat

        _ => Err(MusicXMLParseError::InvalidValue {
            element: "pitch".to_string(),
            value: format!("{}{:+}", step, alter),
            reason: "Unsupported pitch alteration".to_string(),
        }),
    }
}

/// Convert fifths (circle of fifths) to key name
fn fifths_to_key_name(fifths: i8) -> String {
    match fifths {
        -7 => "C♭ major".to_string(),
        -6 => "G♭ major".to_string(),
        -5 => "D♭ major".to_string(),
        -4 => "A♭ major".to_string(),
        -3 => "E♭ major".to_string(),
        -2 => "B♭ major".to_string(),
        -1 => "F major".to_string(),
        0 => "C major".to_string(),
        1 => "G major".to_string(),
        2 => "D major".to_string(),
        3 => "A major".to_string(),
        4 => "E major".to_string(),
        5 => "B major".to_string(),
        6 => "F# major".to_string(),
        7 => "C# major".to_string(),
        _ => format!("{} sharps/flats", fifths),
    }
}

/// Parse lyrics from a <note> element
fn parse_lyrics(note_node: &roxmltree::Node) -> MusicXMLParseResult<Option<LyricData>> {
    // Find first <lyric> element
    let lyric_node = match note_node.children().find(|n| n.tag_name().name() == "lyric") {
        Some(node) => node,
        None => return Ok(None),
    };

    // Parse lyric number (default to 1)
    let number = lyric_node.attribute("number")
        .and_then(|s| s.parse::<u32>().ok())
        .unwrap_or(1);

    // Parse syllabic type
    let syllabic = lyric_node.children()
        .find(|n| n.tag_name().name() == "syllabic")
        .and_then(|n| n.text())
        .map(|s| match s {
            "single" => Syllabic::Single,
            "begin" => Syllabic::Begin,
            "middle" => Syllabic::Middle,
            "end" => Syllabic::End,
            _ => Syllabic::Single,
        })
        .unwrap_or(Syllabic::Single);

    // Parse text
    let syllable = lyric_node.children()
        .find(|n| n.tag_name().name() == "text")
        .and_then(|n| n.text())
        .unwrap_or("")
        .to_string();

    Ok(Some(LyricData {
        syllable,
        syllabic,
        number,
    }))
}

/// Parse slur from a <note> element
fn parse_slur(note_node: &roxmltree::Node) -> MusicXMLParseResult<Option<SlurData>> {
    // Find <notations> element
    let notations = match note_node.children().find(|n| n.tag_name().name() == "notations") {
        Some(node) => node,
        None => return Ok(None),
    };

    // Find <slur> element
    let slur_node = match notations.children().find(|n| n.tag_name().name() == "slur") {
        Some(node) => node,
        None => return Ok(None),
    };

    // Parse type (start, stop, continue)
    let type_str = slur_node.attribute("type").unwrap_or("start");
    let type_ = match type_str {
        "start" => SlurType::Start,
        "stop" => SlurType::Stop,
        "continue" => SlurType::Continue,
        _ => SlurType::Start,
    };

    // Parse placement (above, below)
    let placement_str = slur_node.attribute("placement").unwrap_or("below");
    let placement = match placement_str {
        "above" => SlurPlacement::Above,
        "below" => SlurPlacement::Below,
        _ => SlurPlacement::Below,
    };

    Ok(Some(SlurData { placement, type_ }))
}

/// Parse tie from a <note> element
fn parse_tie(note_node: &roxmltree::Node) -> MusicXMLParseResult<Option<TieData>> {
    // Find <tie> element (in note, not notations)
    let tie_node = match note_node.children().find(|n| n.tag_name().name() == "tie") {
        Some(node) => node,
        None => return Ok(None),
    };

    // Parse type (start, stop)
    let type_str = tie_node.attribute("type").unwrap_or("start");
    let type_ = match type_str {
        "start" => TieType::Start,
        "stop" => TieType::Stop,
        "continue" => TieType::Continue,
        _ => TieType::Start,
    };

    Ok(Some(TieData { type_ }))
}

/// Parse articulations from a <note> element
fn parse_articulations(note_node: &roxmltree::Node) -> MusicXMLParseResult<Vec<ArticulationType>> {
    // Find <notations> element
    let notations = match note_node.children().find(|n| n.tag_name().name() == "notations") {
        Some(node) => node,
        None => return Ok(Vec::new()),
    };

    // Find <articulations> element
    let articulations_node = match notations.children().find(|n| n.tag_name().name() == "articulations") {
        Some(node) => node,
        None => return Ok(Vec::new()),
    };

    let mut articulations = Vec::new();

    for child in articulations_node.children().filter(|n| n.is_element()) {
        let articulation = match child.tag_name().name() {
            "staccato" => Some(ArticulationType::Staccato),
            "accent" => Some(ArticulationType::Accent),
            "strong-accent" => Some(ArticulationType::StrongAccent),
            "tenuto" => Some(ArticulationType::Tenuto),
            "marcato" => Some(ArticulationType::Marcato),
            "soft-accent" => Some(ArticulationType::SoftAccent),
            "scoop" => Some(ArticulationType::Scoop),
            "plop" => Some(ArticulationType::Plop),
            "doit" => Some(ArticulationType::Doit),
            "falloff" => Some(ArticulationType::Falloff),
            _ => None,
        };

        if let Some(art) = articulation {
            articulations.push(art);
        }
    }

    Ok(articulations)
}

/// Parse beam from a <note> element
fn parse_beam(note_node: &roxmltree::Node) -> MusicXMLParseResult<Option<BeamData>> {
    // Find <beam> element
    let beam_node = match note_node.children().find(|n| n.tag_name().name() == "beam") {
        Some(node) => node,
        None => return Ok(None),
    };

    // Parse beam number (default to 1)
    let number = beam_node.attribute("number")
        .and_then(|s| s.parse::<u32>().ok())
        .unwrap_or(1);

    // Parse beam state
    let state_str = beam_node.text().unwrap_or("begin");
    let state = match state_str {
        "begin" => BeamState::Begin,
        "continue" => BeamState::Continue,
        "end" => BeamState::End,
        "forward hook" | "backward hook" => BeamState::Single,
        _ => BeamState::Begin,
    };

    Ok(Some(BeamData { state, number }))
}

/// Parse tuplet information from a <note> element
fn parse_tuplet(note_node: &roxmltree::Node) -> MusicXMLParseResult<Option<TupletInfo>> {
    // Find <notations> element
    let notations = match note_node.children().find(|n| n.tag_name().name() == "notations") {
        Some(node) => node,
        None => return Ok(None),
    };

    // Find <tuplet> element
    let tuplet_node = match notations.children().find(|n| n.tag_name().name() == "tuplet") {
        Some(node) => node,
        None => return Ok(None),
    };

    // Also check for <time-modification> element for actual/normal notes
    let time_mod = note_node.children()
        .find(|n| n.tag_name().name() == "time-modification");

    if let Some(time_mod_node) = time_mod {
        let actual_notes = time_mod_node.children()
            .find(|n| n.tag_name().name() == "actual-notes")
            .and_then(|n| n.text())
            .and_then(|t| t.parse::<usize>().ok())
            .unwrap_or(3);

        let normal_notes = time_mod_node.children()
            .find(|n| n.tag_name().name() == "normal-notes")
            .and_then(|n| n.text())
            .and_then(|t| t.parse::<usize>().ok())
            .unwrap_or(2);

        // Check tuplet type for bracket
        let tuplet_type = tuplet_node.attribute("type").unwrap_or("");
        let bracket_start = tuplet_type == "start";
        let bracket_stop = tuplet_type == "stop";

        return Ok(Some(TupletInfo {
            actual_notes,
            normal_notes,
            bracket_start,
            bracket_stop,
        }));
    }

    Ok(None)
}
