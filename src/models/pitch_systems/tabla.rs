//! Tabla notation system implementation
//!
//! Tabla notation uses specific syllables (bols) to represent percussion strokes.
//! This module provides multi-character lookahead parsing where individual characters
//! may be text, but certain combinations form musical tokens (bols).

use crate::models::pitch_code::PitchCode;
use super::PitchParser;

pub struct TablaSystem;

impl TablaSystem {
    /// Get all valid tabla bols, sorted by length (longest first) for lookahead parsing
    pub fn all_bols() -> Vec<&'static str> {
        vec![
            // 4-character bols
            "dhin", "dhir", "tita", "gadi",
            // 3-character bols
            "dha", "tin", "tun", "kat", "tit", "tet", "dhet", "gana", "dina",
            // 2-character bols
            "na", "ta", "te", "ge", "ka", "ke", "ti", "tu", "ra", "re", "ne", "di", "ga",
        ]
    }

    /// Legacy method for compatibility
    pub fn pitch_sequence() -> Vec<&'static str> {
        vec!["dha", "dhin", "na", "tin", "ta", "ke", "te"]
    }

    /// Check if a string is a valid tabla bol
    pub fn is_valid_bol(s: &str) -> bool {
        Self::all_bols().contains(&s)
    }

    /// Try to match a tabla bol starting at the given position in the input string
    /// Returns the matched bol if found, or None if no bol matches
    ///
    /// Uses longest-match strategy: tries longer bols first
    pub fn match_bol_at(input: &str, pos: usize) -> Option<&'static str> {
        if pos >= input.len() {
            return None;
        }

        let remaining = &input[pos..];

        // Try to match bols in order (longest first)
        for bol in Self::all_bols() {
            if remaining.starts_with(bol) {
                return Some(bol);
            }
        }

        None
    }
}

impl PitchParser for TablaSystem {
    fn parse_pitch(input: &str) -> Option<(PitchCode, usize)> {
        if input.is_empty() {
            return None;
        }

        // Note: Tabla is a percussion system, so mapping bols to pitch codes
        // is not semantically meaningful. However, we provide an arbitrary mapping
        // for compatibility with the PitchParser trait.
        // The mapping uses longest-match strategy as required.

        let patterns = [
            // 4-character bols (longest first)
            ("dhin", PitchCode::N1),
            ("dhir", PitchCode::N2),
            ("tita", PitchCode::N3),
            ("gadi", PitchCode::N4),
            // 3-character bols
            ("dha", PitchCode::N1),
            ("tin", PitchCode::N5),
            ("tun", PitchCode::N6),
            ("kat", PitchCode::N7),
            ("tit", PitchCode::N3),
            ("tet", PitchCode::N4),
            ("dhet", PitchCode::N2),
            ("gana", PitchCode::N5),
            ("dina", PitchCode::N6),
            // 2-character bols
            ("na", PitchCode::N1),
            ("ta", PitchCode::N2),
            ("te", PitchCode::N3),
            ("ge", PitchCode::N4),
            ("ka", PitchCode::N5),
            ("ke", PitchCode::N6),
            ("ti", PitchCode::N7),
            ("tu", PitchCode::N1),
            ("ra", PitchCode::N2),
            ("re", PitchCode::N3),
            ("ne", PitchCode::N4),
            ("di", PitchCode::N5),
            ("ga", PitchCode::N6),
        ];

        // Try longest match first
        for (pattern, pitch_code) in &patterns {
            if input.starts_with(pattern) {
                return Some((*pitch_code, pattern.len()));
            }
        }

        None
    }
}