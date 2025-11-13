//! Recursive descent parser with production rules
//!
//! This module provides three cases of parsing:
//! 1. parse(char) - Single character tokenizer
//! 2. parse(before, char) - Look back combination (accidentals, text)
//! 3. parse(char, after) - Look forward combination (barlines)

use crate::models::{Cell, ElementKind, PitchCode, PitchSystem};
use crate::parse::pitch_system::PitchSystemDispatcher;

/// Get a pitch system dispatcher (cheap to create)
fn get_dispatcher() -> PitchSystemDispatcher {
    PitchSystemDispatcher::new()
}

/// Parse a string into a Cell (recursive descent entry point)
/// Tries all production rules in order: MULTI-CHAR FIRST, then single-char
pub fn parse(s: &str, pitch_system: PitchSystem, column: usize) -> Cell {
    log::info!("🔍 parse('{}', {:?}, {})", s, pitch_system, column);

    // MULTI-CHARACTER PATTERNS FIRST (greedy matching)

    // Try multi-char barlines: "|:", ":|", "||"
    if s.len() > 1 {
        if let Some(cell) = parse_barline(s, column) {
            log::info!("  ✅ Parsed as multi-char barline");
            return cell;
        }
    }

    // Try notes with accidentals: "1#", "2bb", "c#", etc.
    if s.len() > 1 {
        if let Some(cell) = parse_note(s, pitch_system, column) {
            log::info!("  ✅ Parsed as multi-char note");
            return cell;
        }
    }

    // SINGLE-CHARACTER PATTERNS

    // Try single-char note: "1", "2", "c", etc.
    if let Some(cell) = parse_note(s, pitch_system, column) {
        log::info!("  ✅ Parsed as note");
        return cell;
    }

    // Try single-char barline: "|"
    if let Some(cell) = parse_barline(s, column) {
        log::info!("  ✅ Parsed as barline");
        return cell;
    }

    // Try whitespace
    if let Some(cell) = parse_whitespace(s, column) {
        log::info!("  ✅ Parsed as whitespace");
        return cell;
    }

    // Try unpitched element
    if let Some(cell) = parse_unpitched(s, column) {
        log::info!("  ✅ Parsed as unpitched");
        return cell;
    }

    // Try breath mark
    if let Some(cell) = parse_breath_mark(s, column) {
        log::info!("  ✅ Parsed as breath mark");
        return cell;
    }

    // Try symbol (single non-alphanumeric character)
    if let Some(cell) = parse_symbol(s, column) {
        log::info!("  ✅ Parsed as symbol");
        return cell;
    }

    // Fallback to text
    log::info!("  ℹ️ Parsed as text (fallback)");
    parse_text(s, column)
}

/// Parse a single character into a Cell (Case 1: tokenizer)
/// Always succeeds - returns Text as fallback
pub fn parse_single(c: char, pitch_system: PitchSystem, column: usize) -> Cell {
    parse(&c.to_string(), pitch_system, column)
}


// ============================================================================
// Production Rules
// ============================================================================

/// Parse note (includes accidentals: "1", "1#", "2bb", "c#", etc.)
fn parse_note(s: &str, pitch_system: PitchSystem, column: usize) -> Option<Cell> {
    let dispatcher = get_dispatcher();
    if dispatcher.lookup(s, pitch_system) {
        // Try to parse pitch code from string
        let pitch_code = PitchCode::from_string(s, pitch_system);

        // Create cell with char (will be recomputed later, but set it now for display)
        let mut cell = Cell::new(s.to_string(), ElementKind::PitchedElement, column);
        cell.pitch_system = Some(pitch_system);
        cell.pitch_code = pitch_code;
        Some(cell)
    } else {
        None
    }
}

/// Parse barline (includes "|", "|:", ":|", "||", etc.)
/// Note: ":" alone is NOT a barline - it's text
/// Determines barline type and creates appropriate ElementKind variant
fn parse_barline(s: &str, column: usize) -> Option<Cell> {
    let barline_kind = match s {
        "|" => ElementKind::SingleBarline,
        "|:" => ElementKind::RepeatLeftBarline,
        ":|" => ElementKind::RepeatRightBarline,
        "||" => ElementKind::DoubleBarline,
        _ => return None,
    };

    let cell = Cell::new(s.to_string(), barline_kind, column);
    Some(cell)
}

/// Parse whitespace
fn parse_whitespace(s: &str, column: usize) -> Option<Cell> {
    if s == " " {
        // Keep ASCII space as-is (don't convert to nbsp)
        let cell = Cell::new(" ".to_string(), ElementKind::Whitespace, column);
        Some(cell)
    } else {
        None
    }
}

/// Parse unpitched element (dash, underscore)
fn parse_unpitched(s: &str, column: usize) -> Option<Cell> {
    if s == "-" || s == "_" {
        let cell = Cell::new(s.to_string(), ElementKind::UnpitchedElement, column);
        Some(cell)
    } else {
        None
    }
}

/// Parse breath mark (apostrophe, comma)
fn parse_breath_mark(s: &str, column: usize) -> Option<Cell> {
    if s == "'" || s == "," {
        let cell = Cell::new(s.to_string(), ElementKind::BreathMark, column);
        Some(cell)
    } else {
        None
    }
}

/// Parse symbol (single non-alphanumeric character)
/// Matches characters like: :, @, #, !, ?, ~, `, ^, etc.
/// Note: This is parsed BEFORE text fallback to capture symbolic notation
///
/// Characters handled elsewhere are excluded:
/// - | (barline)
/// - - (unpitched element)
/// - _ (unpitched element)
/// - ' (breath mark)
/// - , (breath mark)
/// - (space) (whitespace)
fn parse_symbol(s: &str, column: usize) -> Option<Cell> {
    // Must be single character
    if s.len() != 1 {
        return None;
    }

    let ch = s.chars().next().unwrap();

    // Must be non-alphanumeric
    if ch.is_alphanumeric() {
        return None;
    }

    // Must not already be matched by other rules
    // (pipe, dash, underscore, apostrophe, comma, space are handled elsewhere)
    if matches!(ch, '|' | '-' | '_' | '\'' | ',' | ' ') {
        return None;
    }

    let cell = Cell::new(s.to_string(), ElementKind::Symbol, column);
    Some(cell)
}

/// Parse text (fallback)
fn parse_text(s: &str, column: usize) -> Cell {
    Cell::new(s.to_string(), ElementKind::Text, column)
}

// ============================================================================
// REMOVED: Continuation Marker System
// ============================================================================
// The continuation cell system has been removed. Multi-character notation like
// "1#", "||", "|:" is now handled as single cells with appropriate pitch_code
// or ElementKind. See WASM-first architecture in CLAUDE.md.

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_single_note() {
        let cell = parse_single('1', PitchSystem::Number, 0);
        assert_eq!(cell.kind, ElementKind::PitchedElement);
        assert_eq!(cell.char, "1");
    }

    #[test]
    fn test_parse_single_text() {
        let cell = parse_single('x', PitchSystem::Number, 0);
        assert_eq!(cell.kind, ElementKind::Text);
        assert_eq!(cell.char, "x");
    }


    // REMOVED: Tests for continuation cell system (no longer used)
    // Multi-character notation like "1#", "||", "|:" now creates single cells

    #[test]
    fn test_barline_single() {
        // Test single "|" should be SingleBarline
        let cell = parse_single('|', PitchSystem::Number, 0);
        assert_eq!(cell.char, "|");
        assert_eq!(cell.kind, ElementKind::SingleBarline);
    }

    #[test]
    fn test_note_with_sharp() {
        // Test "1#" should parse as single pitched element with Sharp pitch_code
        let cell = parse("1#", PitchSystem::Number, 0);
        assert_eq!(cell.char, "1#");
        assert_eq!(cell.kind, ElementKind::PitchedElement);
        assert!(cell.pitch_code.is_some());
    }

    #[test]
    fn test_double_barline() {
        // Test "||" should parse as single DoubleBarline
        let cell = parse("||", PitchSystem::Number, 0);
        assert_eq!(cell.char, "||");
        assert_eq!(cell.kind, ElementKind::DoubleBarline);
    }

    #[test]
    fn test_repeat_left_barline() {
        // Test "|:" should parse as single RepeatLeftBarline
        let cell = parse("|:", PitchSystem::Number, 0);
        assert_eq!(cell.char, "|:");
        assert_eq!(cell.kind, ElementKind::RepeatLeftBarline);
    }

    #[test]
    fn test_repeat_right_barline() {
        // Test ":|" should parse as single RepeatRightBarline
        let cell = parse(":|", PitchSystem::Number, 0);
        assert_eq!(cell.char, ":|");
        assert_eq!(cell.kind, ElementKind::RepeatRightBarline);
    }

    #[test]
    fn test_colon_alone_is_symbol() {
        // Test ":" alone should be Symbol
        let cell = parse_single(':', PitchSystem::Number, 0);
        assert_eq!(cell.char, ":");
        assert_eq!(cell.kind, ElementKind::Symbol);
    }

    #[test]
    fn test_at_symbol() {
        // Test "@" should be Symbol
        let cell = parse_single('@', PitchSystem::Number, 0);
        assert_eq!(cell.char, "@");
        assert_eq!(cell.kind, ElementKind::Symbol);
    }

    #[test]
    fn test_hash_symbol_vs_accidental() {
        // Test "#" alone should be Symbol (not part of note)
        let cell = parse_single('#', PitchSystem::Number, 0);
        assert_eq!(cell.char, "#");
        assert_eq!(cell.kind, ElementKind::Symbol);
    }

    #[test]
    fn test_mixed_symbols_and_text() {
        // Test that symbols parse correctly before falling back to text
        let cell1 = parse_single('!', PitchSystem::Number, 0);
        assert_eq!(cell1.kind, ElementKind::Symbol);

        let cell2 = parse_single('?', PitchSystem::Number, 0);
        assert_eq!(cell2.kind, ElementKind::Symbol);

        let cell3 = parse_single('~', PitchSystem::Number, 0);
        assert_eq!(cell3.kind, ElementKind::Symbol);

        // Alphanumeric should still be text (or note if valid)
        let cell4 = parse_single('x', PitchSystem::Number, 0);
        assert_eq!(cell4.kind, ElementKind::Text);
    }
}
