//! XML parsing layer for MusicXML documents
//!
//! This module provides wrappers around roxmltree for parsing MusicXML 3.1 documents.
//! It extracts the document structure (parts, measures) and parses musical elements
//! (pitches, durations, attributes).

use crate::converters::musicxml::musicxml_to_lilypond::errors::ParseError;
use crate::converters::musicxml::musicxml_to_lilypond::types::{Duration, PartGroup, Pitch, Rational};
use roxmltree::{Document, Node};

// ============================================================================
// XML DOCUMENT WRAPPER (T020)
// ============================================================================

/// Wrapper around roxmltree::Document for MusicXML parsing
pub struct XmlDocument<'a> {
    _xml: Box<str>, // Owned XML string (may have DOCTYPE stripped)
    doc: Document<'a>,
    divisions_per_quarter: u32,
}

impl<'a> XmlDocument<'a> {
    /// Parse XML string into XmlDocument
    pub fn parse(xml: &str) -> Result<XmlDocument<'static>, ParseError> {
        // Strip DOCTYPE declaration (roxmltree rejects DTDs for security)
        let xml_without_dtd: Box<str> = if xml.contains("<!DOCTYPE") {
            xml.lines()
                .filter(|line| !line.trim_start().starts_with("<!DOCTYPE"))
                .collect::<Vec<_>>()
                .join("\n")
                .into_boxed_str()
        } else {
            xml.to_string().into_boxed_str()
        };

        // Leak the string to get a 'static reference
        // This is acceptable for one-time conversions in WASM
        let xml_static: &'static str = Box::leak(xml_without_dtd.clone());

        let doc = Document::parse(xml_static)
            .map_err(|e| ParseError::InvalidXml(format!("XML parse error: {}", e)))?;

        Ok(XmlDocument {
            _xml: xml_without_dtd,
            doc,
            divisions_per_quarter: 1, // Default, will be updated from attributes
        })
    }

    /// Get the root score-partwise element
    pub fn get_score_partwise(&'a self) -> Result<Node<'a, 'a>, ParseError> {
        let root = self.doc.root_element();

        if root.tag_name().name() != "score-partwise" {
            return Err(ParseError::UnsupportedFormat(format!(
                "Expected score-partwise, found {}",
                root.tag_name().name()
            )));
        }

        Ok(root)
    }

    /// Extract title from MusicXML document
    pub fn extract_title(&'a self) -> Option<String> {
        let score = self.get_score_partwise().ok()?;

        // Try movement-title first (more common)
        if let Some(title_node) = get_child(score, "movement-title") {
            if let Some(title) = get_text(title_node) {
                let trimmed = title.trim();
                if !trimmed.is_empty() {
                    return Some(trimmed.to_string());
                }
            }
        }

        // Fallback to work/work-title
        if let Some(work_node) = get_child(score, "work") {
            if let Some(title_node) = get_child(work_node, "work-title") {
                if let Some(title) = get_text(title_node) {
                    let trimmed = title.trim();
                    if !trimmed.is_empty() {
                        return Some(trimmed.to_string());
                    }
                }
            }
        }

        None
    }

    /// Extract composer from MusicXML document
    pub fn extract_composer(&'a self) -> Option<String> {
        let score = self.get_score_partwise().ok()?;

        // Look in identification/creator elements
        if let Some(identification) = get_child(score, "identification") {
            // First try creator with type="composer"
            for creator_node in identification.children() {
                if creator_node.is_element() && creator_node.tag_name().name() == "creator" {
                    if let Some(creator_type) = creator_node.attribute("type") {
                        if creator_type == "composer" {
                            if let Some(composer) = get_text(creator_node) {
                                let trimmed = composer.trim();
                                if !trimmed.is_empty() {
                                    return Some(trimmed.to_string());
                                }
                            }
                        }
                    }
                }
            }

            // Fallback: any creator element without type or with type="composer"
            for creator_node in identification.children() {
                if creator_node.is_element() && creator_node.tag_name().name() == "creator" {
                    if let Some(composer) = get_text(creator_node) {
                        let trimmed = composer.trim();
                        if !trimmed.is_empty() {
                            return Some(trimmed.to_string());
                        }
                    }
                }
            }
        }

        None
    }

    /// Extract all parts from the document
    pub fn extract_parts(&'a self) -> Result<Vec<PartNode<'a>>, ParseError> {
        let score = self.get_score_partwise()?;

        let parts: Vec<PartNode> = score
            .children()
            .filter(|n| n.is_element() && n.tag_name().name() == "part")
            .map(|n| PartNode::new(n))
            .collect();

        if parts.is_empty() {
            return Err(ParseError::MissingRequiredElement(
                "No parts found in score".to_string(),
            ));
        }

        Ok(parts)
    }

    /// Extract part grouping information from <part-list>
    ///
    /// Parses <part-group> elements to determine which parts should be
    /// grouped together (e.g., with brackets/braces in LilyPond StaffGroup).
    pub fn extract_part_groups(&'a self) -> Vec<PartGroup> {
        let score = match self.get_score_partwise() {
            Ok(s) => s,
            Err(_) => return Vec::new(),
        };

        let part_list = match get_child(score, "part-list") {
            Some(pl) => pl,
            None => return Vec::new(),
        };

        let mut groups: Vec<PartGroup> = Vec::new();
        let mut active_groups: std::collections::HashMap<u32, (Vec<String>, Option<String>, bool)> =
            std::collections::HashMap::new();

        // Iterate through part-list children to process part-groups and score-parts
        for child in part_list.children() {
            if !child.is_element() {
                continue;
            }

            match child.tag_name().name() {
                "part-group" => {
                    let group_type = child.attribute("type").unwrap_or("");
                    let group_number = child
                        .attribute("number")
                        .and_then(|n| n.parse::<u32>().ok())
                        .unwrap_or(1);

                    if group_type == "start" {
                        // Start a new group, extract symbol and barline from start element
                        let symbol = get_child(child, "group-symbol")
                            .and_then(get_text)
                            .map(|s| s.to_string());

                        let barline = get_child(child, "group-barline")
                            .and_then(get_text)
                            .map(|s| s == "yes")
                            .unwrap_or(true);

                        active_groups.insert(group_number, (Vec::new(), symbol, barline));
                    } else if group_type == "stop" {
                        // Close the group and save it
                        if let Some((part_ids, symbol, barline)) = active_groups.remove(&group_number) {
                            groups.push(PartGroup {
                                number: group_number,
                                part_ids,
                                symbol,
                                barline,
                            });
                        }
                    }
                }
                "score-part" => {
                    // Add this part ID to all active groups
                    if let Some(part_id) = child.attribute("id") {
                        for (part_ids, _, _) in active_groups.values_mut() {
                            part_ids.push(part_id.to_string());
                        }
                    }
                }
                _ => {}
            }
        }

        groups
    }

    /// Set current divisions (for duration calculations)
    pub fn set_divisions(&mut self, divisions: u32) {
        self.divisions_per_quarter = divisions;
    }

    /// Get current divisions
    pub fn divisions(&self) -> u32 {
        self.divisions_per_quarter
    }
}

// ============================================================================
// PART AND MEASURE NODES (T021)
// ============================================================================

/// Wrapper around a MusicXML <part> element
#[derive(Clone, Copy)]
pub struct PartNode<'a> {
    node: Node<'a, 'a>,
}

impl<'a> PartNode<'a> {
    pub fn new(node: Node<'a, 'a>) -> Self {
        Self { node }
    }

    /// Get the part ID from the id attribute
    pub fn get_part_id(&self) -> String {
        self.node
            .attribute("id")
            .unwrap_or("unknown")
            .to_string()
    }

    /// Get all measures in this part
    pub fn get_measures(&self) -> Vec<MeasureNode<'a>> {
        self.node
            .children()
            .filter(|n| n.is_element() && n.tag_name().name() == "measure")
            .map(|n| MeasureNode::new(n))
            .collect()
    }
}

/// Wrapper around a MusicXML <measure> element
#[derive(Clone, Copy)]
pub struct MeasureNode<'a> {
    node: Node<'a, 'a>,
}

impl<'a> MeasureNode<'a> {
    pub fn new(node: Node<'a, 'a>) -> Self {
        Self { node }
    }

    /// Get the measure number
    pub fn get_number(&self) -> u32 {
        self.node
            .attribute("number")
            .and_then(|s| s.parse().ok())
            .unwrap_or(0)
    }

    /// Get all note elements in this measure
    pub fn get_notes(&self) -> Vec<Node<'a, 'a>> {
        self.node
            .children()
            .filter(|n| n.is_element() && n.tag_name().name() == "note")
            .collect()
    }

    /// Get all attributes elements in this measure
    pub fn get_attributes(&self) -> Vec<Node<'a, 'a>> {
        self.node
            .children()
            .filter(|n| n.is_element() && n.tag_name().name() == "attributes")
            .collect()
    }

    /// Get all direction elements in this measure
    pub fn get_directions(&self) -> Vec<Node<'a, 'a>> {
        self.node
            .children()
            .filter(|n| n.is_element() && n.tag_name().name() == "direction")
            .collect()
    }

    /// Get all children (in document order)
    pub fn get_children(&self) -> Vec<Node<'a, 'a>> {
        self.node.children().filter(|n| n.is_element()).collect()
    }

    /// Get underlying node for advanced access
    pub fn node(&self) -> Node<'a, 'a> {
        self.node
    }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/// Get first child element with given tag name
pub fn get_child<'a, 'input>(node: Node<'a, 'input>, tag: &str) -> Option<Node<'a, 'input>> {
    node.children()
        .find(|n| n.is_element() && n.tag_name().name() == tag)
}

/// Get text content of a node
pub fn get_text(node: Node) -> Option<String> {
    node.text().map(|s| s.to_string())
}

/// Get text content of first child with given tag
pub fn get_child_text(node: Node, tag: &str) -> Option<String> {
    get_child(node, tag).and_then(get_text)
}

// ============================================================================
// PITCH PARSING (T022)
// ============================================================================

/// Parse a MusicXML <pitch> element to Pitch
pub fn parse_pitch(pitch_node: Node) -> Result<Pitch, ParseError> {
    // Extract step (C, D, E, F, G, A, B)
    let step_str = get_child_text(pitch_node, "step").ok_or_else(|| {
        ParseError::MissingRequiredElement("pitch missing step element".to_string())
    })?;

    let step = match step_str.as_str() {
        "C" => 0,
        "D" => 1,
        "E" => 2,
        "F" => 3,
        "G" => 4,
        "A" => 5,
        "B" => 6,
        _ => {
            return Err(ParseError::InvalidXml(format!(
                "Invalid step: {}",
                step_str
            )))
        }
    };

    // Extract octave
    let octave_str = get_child_text(pitch_node, "octave").ok_or_else(|| {
        ParseError::MissingRequiredElement("pitch missing octave element".to_string())
    })?;

    let octave: i8 = octave_str.parse().map_err(|_| {
        ParseError::InvalidXml(format!("Invalid octave: {}", octave_str))
    })?;

    // Extract alteration (optional, supports microtonal values like -0.5 for quarter-flat)
    let alteration: f32 = get_child_text(pitch_node, "alter")
        .and_then(|s| s.parse::<f32>().ok())
        .unwrap_or(0.0);

    // Create and validate pitch
    Pitch::new(step, alteration, octave)
        .map_err(|e| ParseError::InvalidXml(format!("Invalid pitch: {}", e)))
}

// ============================================================================
// DURATION PARSING (T023)
// ============================================================================

/// Parse a MusicXML note duration
pub fn parse_duration(note_node: Node, divisions: u32) -> Result<Duration, ParseError> {
    // Get duration value in divisions
    let duration_str = get_child_text(note_node, "duration").ok_or_else(|| {
        ParseError::MissingRequiredElement("note missing duration element".to_string())
    })?;

    let duration_value: u32 = duration_str.parse().map_err(|_| {
        ParseError::InvalidXml(format!("Invalid duration value: {}", duration_str))
    })?;

    // Count dots
    let dots = note_node
        .children()
        .filter(|n| n.is_element() && n.tag_name().name() == "dot")
        .count() as u8;

    // Check for tuplet (time-modification) FIRST
    // Store both reduced (for calculation) and unreduced (for LilyPond output) ratios
    let (tuplet_factor, tuplet_actual_unreduced, tuplet_normal_unreduced) = if let Some(time_mod) = get_child(note_node, "time-modification") {
        let actual_notes = get_child_text(time_mod, "actual-notes")
            .and_then(|s| s.parse::<i32>().ok())
            .ok_or_else(|| {
                ParseError::MissingRequiredElement("time-modification missing actual-notes".to_string())
            })?;

        let normal_notes = get_child_text(time_mod, "normal-notes")
            .and_then(|s| s.parse::<i32>().ok())
            .ok_or_else(|| {
                ParseError::MissingRequiredElement("time-modification missing normal-notes".to_string())
            })?;

        // Rational auto-reduces, but we need unreduced values for LilyPond
        (
            Some(Rational::new(normal_notes, actual_notes)),
            Some(actual_notes as u32),
            Some(normal_notes as u32),
        )
    } else {
        (None, None, None)
    };

    // Try to use the <type> element if available (more reliable for tuplets)
    let duration = if let Some(type_str) = get_child_text(note_node, "type") {
        let log = match type_str.as_str() {
            "whole" => 0,
            "half" => 1,
            "quarter" => 2,
            "eighth" => 3,
            "16th" => 4,
            "32nd" => 5,
            "64th" => 6,
            "128th" => 7,
            "256th" => 8,
            _ => return Err(ParseError::InvalidXml(format!("Unknown note type: {}", type_str))),
        };

        // Use new constructor if we have tuplet info
        if let (Some(factor), Some(actual), Some(normal)) = (tuplet_factor, tuplet_actual_unreduced, tuplet_normal_unreduced) {
            Duration::new_with_tuplet(log, dots, factor, actual, normal)
        } else {
            Duration::new(log, dots, tuplet_factor)
        }
    } else {
        // Fallback: calculate from divisions (may fail for complex tuplets)
        let mut duration = Duration::from_musicxml(divisions, duration_value, dots)
            .map_err(|e| ParseError::InvalidXml(format!("Duration calculation error: {}", e)))?;
        duration.factor = tuplet_factor;
        duration.tuplet_actual = tuplet_actual_unreduced;
        duration.tuplet_normal = tuplet_normal_unreduced;
        duration
    };

    Ok(duration)
}

/// Parse divisions from attributes element
pub fn parse_divisions(attributes_node: Node) -> Option<u32> {
    get_child_text(attributes_node, "divisions").and_then(|s| s.parse().ok())
}

// ============================================================================
// ATTRIBUTE PARSING HELPERS
// ============================================================================

/// Parse key signature from attributes
pub fn parse_key(key_node: Node) -> Option<(i8, String)> {
    let fifths = get_child_text(key_node, "fifths")
        .and_then(|s| s.parse().ok())?;

    let mode = get_child_text(key_node, "mode").unwrap_or_else(|| "major".to_string());

    Some((fifths, mode))
}

/// Parse time signature from attributes
pub fn parse_time(time_node: Node) -> Option<(u8, u8)> {
    let beats = get_child_text(time_node, "beats")
        .and_then(|s| s.parse().ok())?;

    let beat_type = get_child_text(time_node, "beat-type")
        .and_then(|s| s.parse().ok())?;

    Some((beats, beat_type))
}

/// Parse clef from attributes
pub fn parse_clef(clef_node: Node) -> Option<(String, Option<u8>)> {
    let sign = get_child_text(clef_node, "sign")?;

    let line = get_child_text(clef_node, "line").and_then(|s| s.parse().ok());

    Some((sign, line))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::converters::musicxml::musicxml_to_lilypond::types::PitchLanguage;

    #[test]
    fn test_parse_simple_musicxml() {
        let xml = r#"<?xml version="1.0"?>
<score-partwise>
  <part id="P1">
    <measure number="1">
    </measure>
  </part>
</score-partwise>"#;

        let doc = XmlDocument::parse(xml).unwrap();
        let score = doc.get_score_partwise().unwrap();
        assert_eq!(score.tag_name().name(), "score-partwise");

        let parts = doc.extract_parts().unwrap();
        assert_eq!(parts.len(), 1);
        assert_eq!(parts[0].get_part_id(), "P1");

        let measures = parts[0].get_measures();
        assert_eq!(measures.len(), 1);
        assert_eq!(measures[0].get_number(), 1);
    }

    #[test]
    fn test_parse_pitch() {
        let xml = r#"<pitch><step>C</step><octave>4</octave></pitch>"#;
        let doc = Document::parse(xml).unwrap();
        let pitch_node = doc.root_element();

        let pitch = parse_pitch(pitch_node).unwrap();
        assert_eq!(pitch.step, 0); // C
        assert_eq!(pitch.octave, 4);
        assert_eq!(pitch.alteration, 0.0);
    }

    #[test]
    fn test_parse_pitch_with_alteration() {
        let xml = r#"<pitch><step>C</step><alter>1</alter><octave>4</octave></pitch>"#;
        let doc = Document::parse(xml).unwrap();
        let pitch_node = doc.root_element();

        let pitch = parse_pitch(pitch_node).unwrap();
        assert_eq!(pitch.step, 0); // C
        assert_eq!(pitch.octave, 4);
        assert_eq!(pitch.alteration, 1.0); // Sharp
    }

    #[test]
    fn test_parse_pitch_with_half_flat() {
        let xml = r#"<pitch><step>C</step><alter>-0.5</alter><octave>4</octave></pitch>"#;
        let doc = Document::parse(xml).unwrap();
        let pitch_node = doc.root_element();

        let pitch = parse_pitch(pitch_node).unwrap();
        assert_eq!(pitch.step, 0); // C
        assert_eq!(pitch.octave, 4);
        assert!((pitch.alteration - -0.5).abs() < 0.01); // Half-flat (quarter-flat)
    }

    #[test]
    fn test_parse_pitch_with_three_quarter_flat() {
        let xml = r#"<pitch><step>D</step><alter>-1.5</alter><octave>4</octave></pitch>"#;
        let doc = Document::parse(xml).unwrap();
        let pitch_node = doc.root_element();

        let pitch = parse_pitch(pitch_node).unwrap();
        assert_eq!(pitch.step, 1); // D
        assert_eq!(pitch.octave, 4);
        assert!((pitch.alteration - -1.5).abs() < 0.01); // Three-quarter-flat
    }

    #[test]
    fn test_pitch_to_lilypond_quarter_flat_english() {
        let pitch = Pitch::new(0, -0.5, 4).unwrap();
        let ly = pitch.to_lilypond_string(PitchLanguage::English);
        assert_eq!(ly, "cqf'"); // C quarter-flat, octave 4
    }

    #[test]
    fn test_pitch_to_lilypond_quarter_flat_nederlands() {
        let pitch = Pitch::new(0, -0.5, 4).unwrap();
        let ly = pitch.to_lilypond_string(PitchLanguage::Nederlands);
        assert_eq!(ly, "ceh'"); // C quarter-flat, octave 4
    }

    #[test]
    fn test_pitch_to_lilypond_quarter_sharp_english() {
        let pitch = Pitch::new(1, 0.5, 4).unwrap();
        let ly = pitch.to_lilypond_string(PitchLanguage::English);
        assert_eq!(ly, "dqs'"); // D quarter-sharp, octave 4
    }

    #[test]
    fn test_pitch_to_lilypond_all_microtonal_english() {
        // Test all microtonal alterations in English
        let test_cases = vec![
            (-2.0, "cff'"),   // double flat
            (-1.5, "ctqf'"),  // three-quarter-flat
            (-1.0, "cf'"),    // flat
            (-0.5, "cqf'"),   // quarter-flat
            (0.0, "c'"),      // natural
            (0.5, "cqs'"),    // quarter-sharp
            (1.0, "cs'"),     // sharp
            (1.5, "ctqs'"),   // three-quarter-sharp
            (2.0, "css'"),    // double sharp
        ];

        for (alteration, expected) in test_cases {
            let pitch = Pitch::new(0, alteration, 4).unwrap();
            let ly = pitch.to_lilypond_string(PitchLanguage::English);
            assert_eq!(ly, expected, "Failed for alteration {}", alteration);
        }
    }
}
