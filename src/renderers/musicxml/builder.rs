// MusicXML builder state machine

use crate::models::pitch::Pitch;
use crate::models::PitchCode;
use super::duration::duration_to_note_type;
use super::pitch::{pitch_to_step_alter, pitch_code_to_step_alter};

/// Articulation types supported in MusicXML export
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ArticulationType {
    /// Accent mark (>')
    Accent,
    /// Staccato dot
    Staccato,
    /// Tenuto line (—)
    Tenuto,
    /// Pizzicato (plucked)
    Pizzicato,
    /// Marcato (accent + staccato)
    Marcato,
    /// Strongaccent
    StrongAccent,
}

impl ArticulationType {
    /// Get the MusicXML element name for this articulation
    pub fn xml_name(&self) -> &'static str {
        match self {
            ArticulationType::Accent => "accent",
            ArticulationType::Staccato => "staccato",
            ArticulationType::Tenuto => "tenuto",
            ArticulationType::Pizzicato => "pizzicato",
            ArticulationType::Marcato => "strong-accent",
            ArticulationType::StrongAccent => "strong-accent",
        }
    }
}

/// State machine for building MusicXML documents
pub struct MusicXmlBuilder {
    buffer: String,
    measure_number: usize,
    pub last_note: Option<(PitchCode, i8)>, // (pitch_code, octave) - for ties
    pub last_note_legacy: Option<(String, i8, i8)>, // (step, alter, xml_octave) - for backward compatibility
    measure_started: bool,
    attributes_written: bool,
    title: Option<String>,
    key_signature: Option<i8>, // Circle of fifths position (-7 to +7)
}

impl MusicXmlBuilder {
    /// Create a new MusicXML builder
    pub fn new() -> Self {
        Self {
            buffer: String::new(),
            measure_number: 1,
            last_note: None,
            last_note_legacy: None,
            measure_started: false,
            attributes_written: false,
            title: None,
            key_signature: None,
        }
    }

    /// Set the document title
    pub fn set_title(&mut self, title: Option<String>) {
        self.title = title;
    }

    /// Set the key signature from a key string (e.g., "C", "G", "D major", "F minor")
    pub fn set_key_signature(&mut self, key_str: Option<&str>) {
        self.key_signature = key_str.and_then(parse_key_to_fifths);
    }

    /// Start a new measure with optional divisions value
    pub fn start_measure(&mut self) {
        self.start_measure_with_divisions(None, false);
    }

    /// Start a new measure with specific divisions value and optional new-system flag
    pub fn start_measure_with_divisions(&mut self, divisions: Option<usize>, new_system: bool) {
        self.buffer.push_str(&format!("<measure number=\"{}\">\n", self.measure_number));
        self.measure_started = true;

        // Write <print new-system> BEFORE attributes (per MusicXML spec)
        if new_system {
            self.buffer.push_str("  <print new-system=\"yes\"/>\n");
        }

        // Write attributes (key/clef in first measure, divisions in all measures)
        if !self.attributes_written {
            self.write_attributes(divisions);
            self.attributes_written = true;
        } else if let Some(div) = divisions {
            // Write divisions-only attributes for subsequent measures
            self.buffer.push_str("  <attributes>\n");
            self.buffer.push_str(&format!("    <divisions>{}</divisions>\n", div));
            self.buffer.push_str("  </attributes>\n");
        }
    }

    /// Close current measure and increment number
    pub fn end_measure(&mut self) {
        self.buffer.push_str("</measure>\n");
        self.measure_number += 1;
        self.measure_started = false;
    }

    /// Write note with pitch and duration
    pub fn write_note(&mut self, pitch: &Pitch, duration_divs: usize, musical_duration: f64) -> Result<(), String> {
        self.write_note_with_beam(pitch, duration_divs, musical_duration, None, None, None, None, None, None)
    }

    /// Write note with pitch, duration, and optional beam, time_modification, tuplet_bracket, tie, slur, and articulations
    /// time_modification: Option<(usize, usize)> = (actual_notes, normal_notes) - written on ALL tuplet notes
    /// tuplet_bracket: Option<&str> = "start" or "stop" - only on first/last tuplet notes
    /// tie: Option<&str> = "start" or "stop"
    /// slur: Option<&str> = "start" or "stop"
    /// articulations: Optional vector of articulation types to write in notations block
    pub fn write_note_with_beam(&mut self, pitch: &Pitch, duration_divs: usize, musical_duration: f64, beam: Option<&str>, time_modification: Option<(usize, usize)>, tuplet_bracket: Option<&str>, tie: Option<&str>, slur: Option<&str>, articulations: Option<Vec<ArticulationType>>) -> Result<(), String> {
        let (step, alter) = pitch_to_step_alter(pitch)?;
        let xml_octave = pitch.octave + 4; // music-text octave 0 = MIDI octave 4 (middle C)

        self.buffer.push_str("<note>\n");
        self.buffer.push_str("  <pitch>\n");
        self.buffer.push_str(&format!("    <step>{}</step>\n", step));
        if alter != 0 {
            self.buffer.push_str(&format!("    <alter>{}</alter>\n", alter));
        }
        self.buffer.push_str(&format!("    <octave>{}</octave>\n", xml_octave));
        self.buffer.push_str("  </pitch>\n");
        self.buffer.push_str(&format!("  <duration>{}</duration>\n", duration_divs));

        // Add tie element if specified (must come before type)
        if let Some(tie_type) = tie {
            self.buffer.push_str(&format!("  <tie type=\"{}\"/>\n", tie_type));
        }

        // Add time-modification if specified (for ALL tuplet notes)
        if let Some((actual_notes, normal_notes)) = time_modification {
            self.buffer.push_str("  <time-modification>\n");
            self.buffer.push_str(&format!("    <actual-notes>{}</actual-notes>\n", actual_notes));
            self.buffer.push_str(&format!("    <normal-notes>{}</normal-notes>\n", normal_notes));
            self.buffer.push_str("  </time-modification>\n");
        }

        // For tuplets, calculate note type based on actual duration within tuplet
        // musical_duration is in beats (quarter notes), but represents fraction of subdivisions
        // We need to scale by (actual_notes/normal_notes) to get the display duration
        let (note_type, dots) = if let Some((actual_notes, normal_notes)) = time_modification {
            let display_duration = musical_duration * (actual_notes as f64 / normal_notes as f64);
            duration_to_note_type(display_duration)
        } else {
            duration_to_note_type(musical_duration)
        };
        self.buffer.push_str(&format!("  <type>{}</type>\n", note_type));
        for _ in 0..dots {
            self.buffer.push_str("  <dot/>\n");
        }

        // Add beam if specified
        if let Some(beam_type) = beam {
            self.buffer.push_str(&format!("  <beam number=\"1\">{}</beam>\n", beam_type));
        }

        // Add notations if tuplet bracket, tie, slur, or articulations
        let has_tuplet_bracket = tuplet_bracket.is_some();
        let has_tie = tie.is_some();
        let has_slur = slur.is_some();
        let has_articulations = articulations.as_ref().map_or(false, |a| !a.is_empty());

        if has_tuplet_bracket || has_tie || has_slur || has_articulations {
            self.buffer.push_str("  <notations>\n");

            // Add tuplet bracket notation if specified (only start/stop)
            if let Some(bracket_type) = tuplet_bracket {
                self.buffer.push_str(&format!("    <tuplet type=\"{}\" bracket=\"yes\" show-number=\"actual\" number=\"1\"/>\n", bracket_type));
            }

            // Add tied element if specified (visual representation)
            if let Some(tie_type) = tie {
                self.buffer.push_str(&format!("    <tied type=\"{}\"/>\n", tie_type));
            }

            // Add slur element if specified
            if let Some(slur_type) = slur {
                self.buffer.push_str(&format!("    <slur type=\"{}\" number=\"1\"/>\n", slur_type));
            }

            // Add articulations if specified
            if let Some(arts) = articulations {
                for art in arts {
                    self.buffer.push_str(&format!("    <{}/>\n", art.xml_name()));
                }
            }

            self.buffer.push_str("  </notations>\n");
        }

        self.buffer.push_str("</note>\n");

        // Update last_note_legacy for backward compatibility
        self.last_note_legacy = Some((step.to_string(), alter, xml_octave));
        Ok(())
    }

    /// Write note using PitchCode (system-agnostic, works for all pitch systems)
    /// This is the PREFERRED method for MusicXML export
    /// slur: Option<&str> = "start" or "stop"
    /// articulations: Optional vector of articulation types to write in notations block
    /// ornament_type: Optional ornament type ("trill", "turn", "mordent", etc.)
    pub fn write_note_with_beam_from_pitch_code(&mut self, pitch_code: &PitchCode, octave: i8, duration_divs: usize, musical_duration: f64, beam: Option<&str>, time_modification: Option<(usize, usize)>, tuplet_bracket: Option<&str>, tie: Option<&str>, slur: Option<&str>, articulations: Option<Vec<ArticulationType>>, ornament_type: Option<&str>) -> Result<(), String> {
        let (step, alter) = pitch_code_to_step_alter(pitch_code);
        let xml_octave = octave + 4; // music-text octave 0 = MIDI octave 4 (middle C)

        self.buffer.push_str("<note>\n");
        self.buffer.push_str("  <pitch>\n");
        self.buffer.push_str(&format!("    <step>{}</step>\n", step));
        if alter != 0 {
            self.buffer.push_str(&format!("    <alter>{}</alter>\n", alter));
        }
        self.buffer.push_str(&format!("    <octave>{}</octave>\n", xml_octave));
        self.buffer.push_str("  </pitch>\n");
        self.buffer.push_str(&format!("  <duration>{}</duration>\n", duration_divs));

        // Add tie element if specified (must come before type)
        if let Some(tie_type) = tie {
            self.buffer.push_str(&format!("  <tie type=\"{}\"/>\n", tie_type));
        }

        // Add time-modification if specified (for ALL tuplet notes)
        if let Some((actual_notes, normal_notes)) = time_modification {
            self.buffer.push_str("  <time-modification>\n");
            self.buffer.push_str(&format!("    <actual-notes>{}</actual-notes>\n", actual_notes));
            self.buffer.push_str(&format!("    <normal-notes>{}</normal-notes>\n", normal_notes));
            self.buffer.push_str("  </time-modification>\n");
        }

        // For tuplets, calculate note type based on actual duration within tuplet
        let (note_type, dots) = if let Some((actual_notes, normal_notes)) = time_modification {
            let display_duration = musical_duration * (actual_notes as f64 / normal_notes as f64);
            duration_to_note_type(display_duration)
        } else {
            duration_to_note_type(musical_duration)
        };
        self.buffer.push_str(&format!("  <type>{}</type>\n", note_type));
        for _ in 0..dots {
            self.buffer.push_str("  <dot/>\n");
        }

        // Add beam if specified
        if let Some(beam_type) = beam {
            self.buffer.push_str(&format!("  <beam number=\"1\">{}</beam>\n", beam_type));
        }

        // Add notations if tuplet bracket, tie, slur, articulations, or ornaments
        let has_tuplet_bracket = tuplet_bracket.is_some();
        let has_tie = tie.is_some();
        let has_slur = slur.is_some();
        let has_articulations = articulations.as_ref().map_or(false, |a| !a.is_empty());
        let has_ornament = ornament_type.is_some();

        if has_tuplet_bracket || has_tie || has_slur || has_articulations || has_ornament {
            self.buffer.push_str("  <notations>\n");

            // Add tuplet bracket notation if specified (only start/stop)
            if let Some(bracket_type) = tuplet_bracket {
                self.buffer.push_str(&format!("    <tuplet type=\"{}\" bracket=\"yes\" show-number=\"actual\" number=\"1\"/>\n", bracket_type));
            }

            // Add tied element if specified (visual representation)
            if let Some(tie_type) = tie {
                self.buffer.push_str(&format!("    <tied type=\"{}\"/>\n", tie_type));
            }

            // Add slur element if specified
            if let Some(slur_type) = slur {
                self.buffer.push_str(&format!("    <slur type=\"{}\" number=\"1\"/>\n", slur_type));
            }

            // Add ornament element if detected
            if let Some(orn_type) = ornament_type {
                self.buffer.push_str("    <ornament>\n");
                match orn_type {
                    "trill" => self.buffer.push_str("      <trill-mark/>\n"),
                    "turn" => self.buffer.push_str("      <turn/>\n"),
                    "mordent" => self.buffer.push_str("      <mordent/>\n"),
                    "inverted-turn" => self.buffer.push_str("      <inverted-turn/>\n"),
                    "inverted-mordent" => self.buffer.push_str("      <inverted-mordent/>\n"),
                    _ => self.buffer.push_str(&format!("      <{}/>\n", orn_type)),
                }
                self.buffer.push_str("    </ornament>\n");
            }

            // Add articulations if specified
            if let Some(arts) = articulations {
                for art in arts {
                    self.buffer.push_str(&format!("    <{}/>\n", art.xml_name()));
                }
            }

            self.buffer.push_str("  </notations>\n");
        }

        self.buffer.push_str("</note>\n");

        // Update last_note for next division/tie
        self.last_note = Some((*pitch_code, octave));
        Ok(())
    }

    /// Write rest with duration
    pub fn write_rest(&mut self, duration_divs: usize, musical_duration: f64) {
        self.write_rest_with_tuplet(duration_divs, musical_duration, None, None);
    }

    /// Write rest with duration, optional time_modification and tuplet bracket
    /// time_modification: Option<(usize, usize)> = (actual_notes, normal_notes) - written on ALL tuplet rests
    /// tuplet_bracket: Option<&str> = "start" or "stop" - only on first/last tuplet rests
    pub fn write_rest_with_tuplet(&mut self, duration_divs: usize, musical_duration: f64, time_modification: Option<(usize, usize)>, tuplet_bracket: Option<&str>) {
        self.buffer.push_str("<note>\n");
        self.buffer.push_str("  <rest/>\n");
        self.buffer.push_str(&format!("  <duration>{}</duration>\n", duration_divs));

        // Add time-modification if specified (for ALL tuplet rests)
        if let Some((actual_notes, normal_notes)) = time_modification {
            self.buffer.push_str("  <time-modification>\n");
            self.buffer.push_str(&format!("    <actual-notes>{}</actual-notes>\n", actual_notes));
            self.buffer.push_str(&format!("    <normal-notes>{}</normal-notes>\n", normal_notes));
            self.buffer.push_str("  </time-modification>\n");
        }

        // For tuplets, calculate note type based on actual duration within tuplet
        // musical_duration is in beats (quarter notes), but represents fraction of subdivisions
        // We need to scale by (actual_notes/normal_notes) to get the display duration
        let (note_type, dots) = if let Some((actual_notes, normal_notes)) = time_modification {
            let display_duration = musical_duration * (actual_notes as f64 / normal_notes as f64);
            duration_to_note_type(display_duration)
        } else {
            duration_to_note_type(musical_duration)
        };
        self.buffer.push_str(&format!("  <type>{}</type>\n", note_type));
        for _ in 0..dots {
            self.buffer.push_str("  <dot/>\n");
        }

        // Add tuplet bracket notation if specified (only start/stop)
        if let Some(bracket_type) = tuplet_bracket {
            self.buffer.push_str("  <notations>\n");
            self.buffer.push_str(&format!("    <tuplet type=\"{}\" bracket=\"yes\" show-number=\"actual\" number=\"1\"/>\n", bracket_type));
            self.buffer.push_str("  </notations>\n");
        }

        self.buffer.push_str("</note>\n");

        // Rest breaks note context
        self.last_note = None;
    }

    /// Write a grace note (ornament/embellishment before main note)
    /// Grace notes have no duration and appear with a slash by default
    /// pitch_code: The pitch of the grace note
    /// octave: Octave offset relative to middle C
    /// slash: Whether to show slash (true = acciaccatura, false = appoggiatura)
    /// placement: Optional placement ("above" or "below")
    pub fn write_grace_note(&mut self, pitch_code: &PitchCode, octave: i8, slash: bool, placement: Option<&str>) -> Result<(), String> {
        let (step, alter) = pitch_code_to_step_alter(pitch_code);
        let xml_octave = octave + 4; // music-text octave 0 = MIDI octave 4 (middle C)

        self.buffer.push_str("<note>\n");

        // Grace element (with or without slash and optional placement)
        if slash {
            if let Some(place) = placement {
                self.buffer.push_str(&format!("  <grace slash=\"yes\" placement=\"{}\"/>\n", place));
            } else {
                self.buffer.push_str("  <grace slash=\"yes\"/>\n");
            }
        } else {
            if let Some(place) = placement {
                self.buffer.push_str(&format!("  <grace placement=\"{}\"/>\n", place));
            } else {
                self.buffer.push_str("  <grace/>\n");
            }
        }

        self.buffer.push_str("  <pitch>\n");
        self.buffer.push_str(&format!("    <step>{}</step>\n", step));
        if alter != 0 {
            self.buffer.push_str(&format!("    <alter>{}</alter>\n", alter));
        }
        self.buffer.push_str(&format!("    <octave>{}</octave>\n", xml_octave));
        self.buffer.push_str("  </pitch>\n");

        // Grace notes use 8th note type by default
        self.buffer.push_str("  <type>eighth</type>\n");

        self.buffer.push_str("</note>\n");

        Ok(())
    }

    /// Write an ornament element in notations block
    /// ornament_type: "trill", "mordent", "turn", "inverted-turn", "tremolo"
    /// placement: Optional placement ("above" or "below")
    pub fn write_ornament_notation(&mut self, ornament_type: &str, placement: Option<&str>) -> String {
        let mut notation = format!("    <ornament");
        if let Some(place) = placement {
            notation.push_str(&format!(" placement=\"{}\"", place));
        }
        notation.push_str(">\n");

        // Add the specific ornament element
        match ornament_type {
            "trill" => notation.push_str("      <trill-mark/>\n"),
            "mordent" => notation.push_str("      <mordent/>\n"),
            "inverted-mordent" => notation.push_str("      <inverted-mordent/>\n"),
            "turn" => notation.push_str("      <turn/>\n"),
            "inverted-turn" => notation.push_str("      <inverted-turn/>\n"),
            "tremolo" => notation.push_str("      <tremolo/>\n"),
            _ => notation.push_str(&format!("      <{}/>\n", ornament_type)),
        }

        notation.push_str("    </ornament>\n");
        notation
    }

    /// Write an articulation element
    /// articulation_type: "accent", "staccato", "tenuto", "pizzicato", etc.
    /// placement: Optional placement ("above" or "below")
    pub fn write_articulation_notation(&mut self, articulation_type: &str, placement: Option<&str>) -> String {
        let mut notation = format!("    <{}", articulation_type);
        if let Some(place) = placement {
            notation.push_str(&format!(" placement=\"{}\"", place));
        }
        notation.push_str("/>\n");
        notation
    }

    /// Reset note context (for breath marks, line starts)
    pub fn reset_context(&mut self) {
        self.last_note = None;
    }

    /// Indicate new staff/system (for line breaks)
    pub fn new_system(&mut self) {
        self.buffer.push_str("<print new-system=\"yes\"/>\n");
    }

    /// Finalize and return complete MusicXML string
    pub fn finalize(self) -> String {
        let mut xml = String::new();
        xml.push_str("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
        xml.push_str("<!DOCTYPE score-partwise PUBLIC \"-//Recordare//DTD MusicXML 3.1 Partwise//EN\" \"http://www.musicxml.org/dtds/partwise.dtd\">\n");
        xml.push_str("<score-partwise version=\"3.1\">\n");

        // Add work/movement-title if present
        if let Some(title) = &self.title {
            if !title.is_empty() {
                xml.push_str("  <movement-title>");
                xml.push_str(&xml_escape(title));
                xml.push_str("</movement-title>\n");
            }
        }

        xml.push_str("  <part-list>\n");
        xml.push_str("    <score-part id=\"P1\">\n");
        xml.push_str("      <part-name></part-name>\n");
        xml.push_str("    </score-part>\n");
        xml.push_str("  </part-list>\n");
        xml.push_str("  <part id=\"P1\">\n");
        xml.push_str(&self.buffer);
        xml.push_str("  </part>\n");
        xml.push_str("</score-partwise>\n");
        xml
    }

    /// Write MusicXML attributes (clef, key, divisions)
    fn write_attributes(&mut self, divisions: Option<usize>) {
        self.buffer.push_str("  <attributes>\n");
        if let Some(div) = divisions {
            self.buffer.push_str(&format!("    <divisions>{}</divisions>\n", div));
        }

        // Write key signature (use fifths from parsed key, default to C major = 0)
        let fifths = self.key_signature.unwrap_or(0);
        self.buffer.push_str(&format!("    <key><fifths>{}</fifths></key>\n", fifths));

        self.buffer.push_str("    <clef><sign>G</sign><line>2</line></clef>\n");
        // NO time signature per spec (FR-023)
        self.buffer.push_str("  </attributes>\n");
    }
}

/// Parse a key signature string to circle of fifths position (-7 to +7)
///
/// Examples:
/// - "C" or "C major" -> 0
/// - "G" or "G major" -> 1
/// - "D" or "D major" -> 2
/// - "F" or "F major" -> -1
/// - "A minor" -> 0 (relative minor of C)
/// - "E minor" -> 1 (relative minor of G)
fn parse_key_to_fifths(key_str: &str) -> Option<i8> {
    let key_lower = key_str.trim().to_lowercase();

    // Check if it's explicitly a minor key (for future use)
    let _is_minor = key_lower.contains("minor") || key_lower.contains("min");

    // Extract the base note (first word or character)
    let base_note = key_lower.split_whitespace().next().unwrap_or(&key_lower);

    // Map note names to fifths position for major keys
    let major_fifths = match base_note {
        "c" | "c♮" => 0,
        "g" | "g♮" => 1,
        "d" | "d♮" => 2,
        "a" | "a♮" => 3,
        "e" | "e♮" => 4,
        "b" | "b♮" => 5,
        "f#" | "f♯" | "fs" | "f#♮" | "f♯♮" => 6,
        "c#" | "c♯" | "cs" | "c#♮" | "c♯♮" => 7,
        "f" | "f♮" => -1,
        "bb" | "b♭" | "bf" | "bb♮" | "b♭♮" => -2,
        "eb" | "e♭" | "ef" | "eb♮" | "e♭♮" => -3,
        "ab" | "a♭" | "af" | "ab♮" | "a♭♮" => -4,
        "db" | "d♭" | "df" | "db♮" | "d♭♮" => -5,
        "gb" | "g♭" | "gf" | "gb♮" | "g♭♮" => -6,
        "cb" | "c♭" | "cf" | "cb♮" | "c♭♮" => -7,
        _ => return None,
    };

    // For minor keys, the fifths value is same as relative major
    // (e.g., A minor = C major = 0, E minor = G major = 1)
    Some(major_fifths)
}

/// Escape special XML characters
fn xml_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

impl Default for MusicXmlBuilder {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{PitchSystem, Accidental};

    #[test]
    fn test_builder_new() {
        let builder = MusicXmlBuilder::new();
        assert_eq!(builder.measure_number, 1);
        assert_eq!(builder.last_note, None);
        assert_eq!(builder.measure_started, false);
        assert_eq!(builder.attributes_written, false);
    }

    #[test]
    fn test_write_note_updates_last_note() {
        let mut builder = MusicXmlBuilder::new();
        builder.start_measure();
        let pitch = Pitch::new("1".to_string(), Accidental::Natural, 0, PitchSystem::Number);
        builder.write_note(&pitch, 4, 1.0).unwrap();

        assert!(builder.last_note_legacy.is_some());
        assert!(builder.buffer.contains("<step>C</step>"));
        assert!(builder.buffer.contains("<octave>4</octave>"));
    }

    #[test]
    fn test_write_rest_clears_last_note() {
        let mut builder = MusicXmlBuilder::new();
        builder.start_measure();
        let pitch = Pitch::new("1".to_string(), Accidental::Natural, 0, PitchSystem::Number);
        builder.write_note(&pitch, 4, 1.0).unwrap();
        builder.write_rest(4, 1.0);

        assert_eq!(builder.last_note, None);
        assert!(builder.buffer.contains("<rest/>"));
    }

    #[test]
    fn test_reset_context() {
        let mut builder = MusicXmlBuilder::new();
        builder.start_measure();
        let pitch = Pitch::new("2".to_string(), Accidental::Natural, 1, PitchSystem::Number);
        builder.write_note(&pitch, 2, 0.5).unwrap();
        assert!(builder.last_note_legacy.is_some());

        builder.reset_context();
        assert_eq!(builder.last_note, None);
    }

    #[test]
    fn test_octave_conversion() {
        let mut builder = MusicXmlBuilder::new();
        builder.start_measure();
        let pitch = Pitch::new("1".to_string(), Accidental::Natural, 0, PitchSystem::Number);
        builder.write_note(&pitch, 4, 1.0).unwrap();

        // octave 0 in music-text = MIDI octave 4 (middle C)
        assert!(builder.buffer.contains("<octave>4</octave>"));
    }

    #[test]
    fn test_alter_omitted_for_natural() {
        let mut builder = MusicXmlBuilder::new();
        builder.start_measure();
        let pitch = Pitch::new("1".to_string(), Accidental::Natural, 0, PitchSystem::Number);
        builder.write_note(&pitch, 4, 1.0).unwrap();

        // Natural notes should not have <alter> element
        assert!(!builder.buffer.contains("<alter>"));
    }

    #[test]
    fn test_alter_included_for_sharp() {
        let mut builder = MusicXmlBuilder::new();
        builder.start_measure();
        let pitch = Pitch::new("1".to_string(), Accidental::Sharp, 0, PitchSystem::Number);
        builder.write_note(&pitch, 4, 1.0).unwrap();

        assert!(builder.buffer.contains("<alter>1</alter>"));
    }

    #[test]
    fn test_attributes_written_once() {
        let mut builder = MusicXmlBuilder::new();
        builder.start_measure_with_divisions(None, false);
        let first_buffer = builder.buffer.clone();
        builder.end_measure();

        builder.start_measure_with_divisions(None, false);
        let second_buffer = builder.buffer.clone();

        // Attributes should only appear once (in first measure)
        assert_eq!(first_buffer.matches("<attributes>").count(), 1);
        assert_eq!(second_buffer.matches("<attributes>").count(), 1); // Still 1 total
    }

    #[test]
    fn test_no_time_signature() {
        let mut builder = MusicXmlBuilder::new();
        builder.start_measure();

        // Should NOT contain time signature element
        assert!(!builder.buffer.contains("<time>"));
        assert!(!builder.buffer.contains("<beats>"));
        assert!(!builder.buffer.contains("<beat-type>"));
    }

    #[test]
    fn test_finalize_structure() {
        let mut builder = MusicXmlBuilder::new();
        builder.start_measure();
        builder.end_measure();

        let xml = builder.finalize();

        assert!(xml.contains("<?xml version=\"1.0\""));
        assert!(xml.contains("<!DOCTYPE score-partwise"));
        assert!(xml.contains("<score-partwise version=\"3.1\">"));
        assert!(xml.contains("<part-name></part-name>"));
        assert!(xml.contains("</score-partwise>"));
    }

    #[test]
    fn test_new_system_marker() {
        let mut builder = MusicXmlBuilder::new();
        builder.start_measure_with_divisions(Some(1), true);

        // Should have print new-system BEFORE attributes
        let buffer = &builder.buffer;
        let print_pos = buffer.find("<print new-system=\"yes\"/>").unwrap();
        let attr_pos = buffer.find("<attributes>").unwrap();

        assert!(print_pos < attr_pos, "print element should come before attributes");
    }

    #[test]
    fn test_write_grace_note() {
        let mut builder = MusicXmlBuilder::new();
        builder.start_measure();

        // Write grace note using PitchCode for G (pitch 5 in number system = G)
        let grace_pitch_code = PitchCode::N5; // G natural
        builder.write_grace_note(&grace_pitch_code, 0, true).unwrap();

        // Should contain grace element with slash
        assert!(builder.buffer.contains("<grace slash=\"yes\"/>"));

        // Should contain pitch information
        assert!(builder.buffer.contains("<step>G</step>"));
        assert!(builder.buffer.contains("<octave>4</octave>"));

        // Should have eighth note type (default for grace notes)
        assert!(builder.buffer.contains("<type>eighth</type>"));

        // Should NOT contain duration element (grace notes have no duration)
        assert!(!builder.buffer.contains("<duration>"));
    }

    #[test]
    fn test_write_grace_note_without_slash() {
        let mut builder = MusicXmlBuilder::new();
        builder.start_measure();

        // Write grace note without slash (appoggiatura)
        let grace_pitch_code = PitchCode::N1; // C natural
        builder.write_grace_note(&grace_pitch_code, 0, false).unwrap();

        // Should contain grace element without slash
        assert!(builder.buffer.contains("<grace/>"));
        assert!(!builder.buffer.contains("slash=\"yes\""));
    }

    #[test]
    fn test_grace_note_with_accidental() {
        let mut builder = MusicXmlBuilder::new();
        builder.start_measure();

        // Write grace note with sharp (F# = pitch 4 with sharp)
        let grace_pitch_code = PitchCode::N4s; // F#
        builder.write_grace_note(&grace_pitch_code, 0, true).unwrap();

        // Should contain pitch with alteration
        assert!(builder.buffer.contains("<step>F</step>"));
        assert!(builder.buffer.contains("<alter>1</alter>"));
    }
}
