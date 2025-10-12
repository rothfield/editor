//! Musical grammar parsing
//!
//! This module provides musical grammar parsing and validation.

use serde::{Serialize, Deserialize};

/// Grammar parser for musical notation
pub struct GrammarParser;

impl GrammarParser {
    /// Parse musical notation grammar
    pub fn parse_grammar(text: &str) -> Result<Vec<GrammarElement>, String> {
        let mut elements = Vec::new();
        let chars: Vec<char> = text.chars().collect();
        let mut i = 0;

        while i < chars.len() {
            if let Some(element) = Self::parse_next_element(&chars, &mut i) {
                elements.push(element);
            } else {
                i += 1;
            }
        }

        Ok(elements)
    }

    fn parse_next_element(chars: &[char], index: &mut usize) -> Option<GrammarElement> {
        if *index >= chars.len() {
            return None;
        }

        let ch = chars[*index];

        // Simple grammar parsing
        if ch.is_whitespace() {
            *index += 1;
            Some(GrammarElement::Whitespace)
        } else if Self::is_pitch_char(ch) {
            let mut pitch = ch.to_string();
            *index += 1;

            // Check for accidentals
            if *index < chars.len() && (chars[*index] == '#' || chars[*index] == 'b') {
                pitch.push(chars[*index]);
                *index += 1;

                // Check for double accidentals
                if *index < chars.len() && chars[*index] == pitch.chars().last().unwrap() {
                    pitch.push(chars[*index]);
                    *index += 1;
                }
            }

            Some(GrammarElement::Pitched(pitch))
        } else if ch == '|' {
            *index += 1;
            Some(GrammarElement::Barline)
        } else if ch == '-' {
            *index += 1;
            Some(GrammarElement::Unpitched)
        } else {
            Some(GrammarElement::Text(ch.to_string()))
        }
    }

    fn is_pitch_char(ch: char) -> bool {
        matches!(ch, '1'|'2'|'3'|'4'|'5'|'6'|'7'|'c'|'d'|'e'|'f'|'g'|'a'|'b'|'C'|'D'|'E'|'F'|'G'|'A'|'B'|'S'|'R'|'M'|'P'|'N')
    }
}

/// Grammar element types
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub enum GrammarElement {
    Pitched(String),
    Unpitched,
    Barline,
    Whitespace,
    Text(String),
}