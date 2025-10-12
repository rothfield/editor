//! Token recognition and validation
//!
//! This module provides token recognition and validation
//! for musical notation parsing.

use serde::{Serialize, Deserialize};
use crate::models::*;

/// Token types for musical notation
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub enum TokenType {
    Pitched,
    Unpitched,
    Barline,
    BreathMark,
    Whitespace,
    Text,
}

/// Token with metadata
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Token {
    pub text: String,
    pub token_type: TokenType,
    pub position: usize,
    pub length: usize,
}

impl Token {
    pub fn new(text: String, token_type: TokenType, position: usize) -> Self {
        let length = text.chars().count();
        Self {
            text,
            token_type,
            position,
            length,
        }
    }
}

/// Token recognizer for musical notation
pub struct TokenRecognizer;

impl TokenRecognizer {
    pub fn recognize_token(text: &str, position: usize) -> Token {
        let token_type = if text.trim().is_empty() {
            TokenType::Whitespace
        } else if Self::is_barline(text) {
            TokenType::Barline
        } else if Self::is_breath_mark(text) {
            TokenType::BreathMark
        } else if Self::is_pitched(text) {
            TokenType::Pitched
        } else if Self::is_unpitched(text) {
            TokenType::Unpitched
        } else {
            TokenType::Text
        };

        Token::new(text.to_string(), token_type, position)
    }

    fn is_barline(text: &str) -> bool {
        matches!(text, "|" | "||" | "|:" | ":|" | "|||")
    }

    fn is_breath_mark(text: &str) -> bool {
        matches!(text, "," | "'" | "\"")
    }

    fn is_pitched(text: &str) -> bool {
        // Simple pattern matching for pitched elements
        let base = text.trim_end_matches('#').trim_end_matches('b');
        matches!(base, "1"|"2"|"3"|"4"|"5"|"6"|"7"|"c"|"d"|"e"|"f"|"g"|"a"|"b"|"C"|"D"|"E"|"F"|"G"|"A"|"B"|"S"|"R"|"G"|"M"|"P"|"D"|"N")
    }

    fn is_unpitched(text: &str) -> bool {
        matches!(text, "-"|"_"|" ")
    }
}