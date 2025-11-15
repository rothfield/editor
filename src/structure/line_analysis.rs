//! Line analysis: tokenization and beat grouping
//!
//! Analyzes a line of text to extract musical structure:
//! - Tokenizes characters into musical elements
//! - Groups tokens into beats (space-delimited)
//! - Identifies beat boundaries for cursor operations

use crate::text::cursor::{TextPos, TextRange};
use crate::models::pitch_code::PitchCode;
use crate::models::elements::PitchSystem;

/// A musical token (pitch, rest, barline, etc.)
#[derive(Debug, Clone, PartialEq)]
pub struct Token {
    /// Position in text
    pub text_range: TextRange,

    /// The character(s) this token represents
    pub text: String,

    /// Musical interpretation (if this is a pitched element)
    pub pitch_code: Option<PitchCode>,

    /// Whether this is a space (beat delimiter)
    pub is_space: bool,

    /// Whether this is a barline
    pub is_barline: bool,
}

impl Token {
    /// Create a new token
    pub fn new(text_range: TextRange, text: String) -> Self {
        let is_space = text.trim().is_empty();
        let is_barline = text == "|";

        Self {
            text_range,
            text,
            pitch_code: None,
            is_space,
            is_barline,
        }
    }

    /// Create a token with pitch information
    pub fn pitched(text_range: TextRange, text: String, pitch_code: PitchCode) -> Self {
        Self {
            text_range,
            text,
            pitch_code: Some(pitch_code),
            is_space: false,
            is_barline: false,
        }
    }
}

/// A beat (space-delimited group of tokens)
#[derive(Debug, Clone, PartialEq)]
pub struct Beat {
    /// Tokens in this beat (excluding leading/trailing spaces)
    pub tokens: Vec<Token>,

    /// Text range covering this beat
    pub text_range: TextRange,
}

impl Beat {
    /// Create a new beat
    pub fn new(tokens: Vec<Token>, text_range: TextRange) -> Self {
        Self { tokens, text_range }
    }

    /// Check if this beat contains a position
    pub fn contains(&self, pos: TextPos) -> bool {
        self.text_range.contains(pos)
    }

    /// Check if this beat is empty (no tokens)
    pub fn is_empty(&self) -> bool {
        self.tokens.is_empty()
    }
}

/// Musical structure of a line
#[derive(Debug, Clone, PartialEq)]
pub struct LineStructure {
    /// All beats in the line
    pub beats: Vec<Beat>,

    /// All tokens (including spaces and barlines)
    pub all_tokens: Vec<Token>,
}

impl LineStructure {
    /// Create a new line structure
    pub fn new(beats: Vec<Beat>, all_tokens: Vec<Token>) -> Self {
        Self { beats, all_tokens }
    }

    /// Find the beat containing a cursor position
    pub fn beat_at_position(&self, pos: TextPos) -> Option<&Beat> {
        self.beats.iter().find(|beat| beat.contains(pos))
    }
}

/// Tokenize a line of text into musical elements
///
/// Uses Layer 1 (pitch_from_char) to interpret characters as pitches.
/// For the POC, we use a simplified parser that recognizes:
/// - Number system characters (1-7)
/// - Spaces (beat delimiters)
/// - Barlines (|)
/// - Everything else as unknown
pub fn tokenize_line(text: &str, line_num: usize, _system: PitchSystem) -> Vec<Token> {
    let mut tokens = Vec::new();
    let chars: Vec<char> = text.chars().collect();
    let mut col = 0;

    for ch in chars {
        let start = TextPos::new(line_num, col);
        let end = TextPos::new(line_num, col + 1);
        let range = TextRange::new(start, end);

        // Simple pitch detection for POC (Number system only)
        let token = if ch.is_whitespace() {
            Token::new(range, ch.to_string())
        } else if ch == '|' {
            let mut t = Token::new(range, ch.to_string());
            t.is_barline = true;
            t
        } else if ('1'..='7').contains(&ch) {
            // Number system pitch
            let pitch_code = match ch {
                '1' => PitchCode::N1,
                '2' => PitchCode::N2,
                '3' => PitchCode::N3,
                '4' => PitchCode::N4,
                '5' => PitchCode::N5,
                '6' => PitchCode::N6,
                '7' => PitchCode::N7,
                _ => unreachable!(),
            };
            Token::pitched(range, ch.to_string(), pitch_code)
        } else if ch == '-' {
            // Dash (extension or rest)
            Token::new(range, ch.to_string())
        } else {
            // Unknown character
            Token::new(range, ch.to_string())
        };

        tokens.push(token);
        col += 1;
    }

    tokens
}

/// Group tokens into beats (space-delimited)
///
/// Beats are separated by spaces. A beat contains all non-space tokens
/// between two spaces (or start/end of line).
pub fn group_into_beats(tokens: Vec<Token>, line_num: usize) -> Vec<Beat> {
    let mut beats = Vec::new();
    let mut current_beat_tokens: Vec<Token> = Vec::new();
    let mut beat_start_col: Option<usize> = None;

    for token in tokens {
        if token.is_space {
            // Space encountered - finalize current beat if any
            if !current_beat_tokens.is_empty() {
                let start_col = beat_start_col.unwrap_or(0);
                let end_col = current_beat_tokens.last().unwrap().text_range.end.col;
                let beat_range = TextRange::new(
                    TextPos::new(line_num, start_col),
                    TextPos::new(line_num, end_col),
                );
                beats.push(Beat::new(current_beat_tokens, beat_range));
                current_beat_tokens = Vec::new();
                beat_start_col = None;
            }
        } else {
            // Non-space token - add to current beat
            if beat_start_col.is_none() {
                beat_start_col = Some(token.text_range.start.col);
            }
            current_beat_tokens.push(token);
        }
    }

    // Finalize last beat if any
    if !current_beat_tokens.is_empty() {
        let start_col = beat_start_col.unwrap_or(0);
        let end_col = current_beat_tokens.last().unwrap().text_range.end.col;
        let beat_range = TextRange::new(
            TextPos::new(line_num, start_col),
            TextPos::new(line_num, end_col),
        );
        beats.push(Beat::new(current_beat_tokens, beat_range));
    }

    beats
}

/// Analyze a line to extract musical structure
///
/// Returns beats and tokens for the line.
pub fn analyze_line(text: &str, line_num: usize, system: PitchSystem) -> LineStructure {
    let tokens = tokenize_line(text, line_num, system);
    let beats = group_into_beats(tokens.clone(), line_num);
    LineStructure::new(beats, tokens)
}

/// Find the beat containing a cursor position
///
/// This is the core function for "Select whole beat" feature.
pub fn find_beat_at_position(text: &str, pos: TextPos, system: PitchSystem) -> Option<Beat> {
    let structure = analyze_line(text, pos.line, system);
    structure.beat_at_position(pos).cloned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tokenize_simple_line() {
        let text = "1 2 3";
        let tokens = tokenize_line(text, 0, PitchSystem::Number);

        assert_eq!(tokens.len(), 5); // "1", " ", "2", " ", "3"
        assert_eq!(tokens[0].text, "1");
        assert_eq!(tokens[0].pitch_code, Some(PitchCode::N1));
        assert!(tokens[1].is_space);
        assert_eq!(tokens[2].text, "2");
        assert_eq!(tokens[2].pitch_code, Some(PitchCode::N2));
    }

    #[test]
    fn test_group_into_beats() {
        let text = "1 2 3";
        let tokens = tokenize_line(text, 0, PitchSystem::Number);
        let beats = group_into_beats(tokens, 0);

        assert_eq!(beats.len(), 3); // Three beats: "1", "2", "3"
        assert_eq!(beats[0].tokens.len(), 1);
        assert_eq!(beats[0].tokens[0].text, "1");
        assert_eq!(beats[1].tokens.len(), 1);
        assert_eq!(beats[1].tokens[0].text, "2");
        assert_eq!(beats[2].tokens.len(), 1);
        assert_eq!(beats[2].tokens[0].text, "3");
    }

    #[test]
    fn test_multi_token_beat() {
        let text = "1-- 2- 3";
        let tokens = tokenize_line(text, 0, PitchSystem::Number);
        let beats = group_into_beats(tokens, 0);

        assert_eq!(beats.len(), 3);
        assert_eq!(beats[0].tokens.len(), 3); // "1", "-", "-"
        assert_eq!(beats[1].tokens.len(), 2); // "2", "-"
        assert_eq!(beats[2].tokens.len(), 1); // "3"
    }

    #[test]
    fn test_find_beat_at_position() {
        let text = "1 2 3";

        // Position at '1' (col 0)
        let beat = find_beat_at_position(text, TextPos::new(0, 0), PitchSystem::Number);
        assert!(beat.is_some());
        assert_eq!(beat.unwrap().tokens[0].text, "1");

        // Position at '2' (col 2)
        let beat = find_beat_at_position(text, TextPos::new(0, 2), PitchSystem::Number);
        assert!(beat.is_some());
        assert_eq!(beat.unwrap().tokens[0].text, "2");

        // Position at '3' (col 4)
        let beat = find_beat_at_position(text, TextPos::new(0, 4), PitchSystem::Number);
        assert!(beat.is_some());
        assert_eq!(beat.unwrap().tokens[0].text, "3");
    }

    #[test]
    fn test_beat_ranges() {
        let text = "1-- 2";
        let structure = analyze_line(text, 0, PitchSystem::Number);

        assert_eq!(structure.beats.len(), 2);

        // First beat: "1--" from col 0-2
        assert_eq!(structure.beats[0].text_range.start.col, 0);
        assert_eq!(structure.beats[0].text_range.end.col, 3);

        // Second beat: "2" from col 4-4
        assert_eq!(structure.beats[1].text_range.start.col, 4);
        assert_eq!(structure.beats[1].text_range.end.col, 5);
    }

    #[test]
    fn test_beat_contains_position() {
        let text = "1-- 2";
        let structure = analyze_line(text, 0, PitchSystem::Number);

        // Position col 0 should be in first beat
        assert!(structure.beats[0].contains(TextPos::new(0, 0)));

        // Position col 1 should be in first beat
        assert!(structure.beats[0].contains(TextPos::new(0, 1)));

        // Position col 2 should be in first beat
        assert!(structure.beats[0].contains(TextPos::new(0, 2)));

        // Position col 3 (space) should NOT be in any beat
        assert!(!structure.beats[0].contains(TextPos::new(0, 3)));
        assert!(!structure.beats[1].contains(TextPos::new(0, 3)));

        // Position col 4 should be in second beat
        assert!(structure.beats[1].contains(TextPos::new(0, 4)));
    }
}
