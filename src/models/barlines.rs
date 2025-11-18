//! Barline handling and beat separation
//!
//! This module provides functionality for handling barlines
//! and beat separation in musical notation.

use serde::{Serialize, Deserialize};

/// Barline types and handling
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub enum BarlineType {
    Single,      // |
    Double,      // ||
    StartRepeat, // |:
    EndRepeat,   // :|
    Final,       // |||
}

impl BarlineType {
    /// Parse barline from string
    pub fn parse(text: &str) -> Option<Self> {
        match text {
            "|" => Some(BarlineType::Single),
            "||" => Some(BarlineType::Double),
            "|:" => Some(BarlineType::StartRepeat),
            ":|" => Some(BarlineType::EndRepeat),
            "|||" => Some(BarlineType::Final),
            _ => None,
        }
    }

    /// Get barline Unicode character for rendering
    /// Returns actual Unicode musical symbols, not ASCII placeholders
    pub fn symbol(&self) -> char {
        use crate::renderers::font_utils::{
            BARLINE_SINGLE, BARLINE_DOUBLE, BARLINE_REPEAT_LEFT, BARLINE_REPEAT_RIGHT
        };

        match self {
            BarlineType::Single => BARLINE_SINGLE,
            BarlineType::Double => BARLINE_DOUBLE,
            BarlineType::StartRepeat => BARLINE_REPEAT_LEFT,
            BarlineType::EndRepeat => BARLINE_REPEAT_RIGHT,
            // Final barline (|||) - use double barline for now (no dedicated Unicode char)
            BarlineType::Final => BARLINE_DOUBLE,
        }
    }
}

/// Barline position and metadata
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Barline {
    /// Column position
    pub column: usize,
    /// Barline type
    pub barline_type: BarlineType,
    /// Associated tala digit (if any)
    pub tala_digit: Option<char>,
}

impl Barline {
    /// Create new barline
    pub fn new(column: usize, barline_type: BarlineType) -> Self {
        Self {
            column,
            barline_type,
            tala_digit: None,
        }
    }

    /// Set tala digit
    pub fn set_tala_digit(&mut self, digit: char) {
        self.tala_digit = Some(digit);
    }
}