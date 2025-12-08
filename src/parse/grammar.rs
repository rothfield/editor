//! Recursive descent parser with production rules
//!
//! This module provides three cases of parsing:
//! 1. parse(char) - Single character tokenizer
//! 2. parse(before, char) - Look back combination (accidentals, text)
//! 3. parse(char, after) - Look forward combination (barlines)

use crate::models::{Cell, ElementKind, PitchCode, PitchSystem};
use crate::models::constraints::ScaleConstraint;
use crate::models::pitch_code::AccidentalType;
use crate::parse::pitch_system::PitchSystemDispatcher;

/// Get a pitch system dispatcher (cheap to create)
fn get_dispatcher() -> PitchSystemDispatcher {
    PitchSystemDispatcher::new()
}

/// Parse a string into a Cell (recursive descent entry point)
/// Tries all production rules in order: MULTI-CHAR FIRST, then single-char
pub fn parse(s: &str, pitch_system: PitchSystem, column: usize, constraint: Option<&ScaleConstraint>) -> Cell {
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
        if let Some(cell) = parse_note(s, pitch_system, column, constraint) {
            log::info!("  ✅ Parsed as multi-char note");
            return cell;
        }
    }

    // SINGLE-CHARACTER PATTERNS

    // Try single-char note: "1", "2", "c", etc.
    if let Some(cell) = parse_note(s, pitch_system, column, constraint) {
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
pub fn parse_single(c: char, pitch_system: PitchSystem, column: usize, constraint: Option<&ScaleConstraint>) -> Cell {
    parse(&c.to_string(), pitch_system, column, constraint)
}


// ============================================================================
// Production Rules
// ============================================================================

/// Parse note (includes accidentals: "1", "1#", "2bb", "c#", etc.)
/// Applies scale constraint transformation if active
fn parse_note(s: &str, pitch_system: PitchSystem, column: usize, constraint: Option<&ScaleConstraint>) -> Option<Cell> {
    use crate::renderers::font_utils::glyph_for_pitch;
    use crate::models::constraints::DegreeConstraint;

    let dispatcher = get_dispatcher();
    if dispatcher.lookup(s, pitch_system) {
        // Try to parse pitch code from string
        let pitch_code = PitchCode::from_string(s, pitch_system);

        // Apply constraint transformation if active
        let transformed_pitch_code = if let (Some(pc), Some(cst)) = (pitch_code, constraint) {
            let degree = pc.degree() as usize;
            if degree < 1 || degree > 7 {
                pitch_code // Out of range, keep original
            } else {
                let degree_idx = degree - 1;
                let degree_constraint = &cst.degrees[degree_idx];

                match degree_constraint {
                    DegreeConstraint::Omit => {
                        // This degree is omitted from the scale - don't insert
                        log::info!("  ⚠️ Degree {} omitted by constraint, blocking insert", degree);
                        return None;
                    }
                    DegreeConstraint::Only(allowed_accidentals) => {
                        if allowed_accidentals.len() == 1 {
                            // Single allowed accidental - transform to it
                            let required_accidental = allowed_accidentals[0];
                            let current_accidental = pc.accidental_type();

                            if current_accidental != required_accidental {
                                // Need to transform
                                let transformed_notation = match pitch_system {
                                    PitchSystem::Number => {
                                        format!("{}{}", degree, accidental_to_suffix(required_accidental))
                                    }
                                    _ => s.to_string(), // TODO: Handle other pitch systems
                                };

                                log::info!("  🔄 Transforming '{}' to '{}' per constraint", s, transformed_notation);

                                // Re-parse with transformed notation
                                PitchCode::from_string(&transformed_notation, pitch_system)
                            } else {
                                // Already has correct accidental
                                pitch_code
                            }
                        } else {
                            // Multiple allowed accidentals - check if current is allowed
                            let current_accidental = pc.accidental_type();
                            if allowed_accidentals.contains(&current_accidental) {
                                pitch_code // Keep original
                            } else {
                                // Transform to first allowed accidental
                                let required_accidental = allowed_accidentals[0];
                                let transformed_notation = match pitch_system {
                                    PitchSystem::Number => {
                                        format!("{}{}", degree, accidental_to_suffix(required_accidental))
                                    }
                                    _ => s.to_string(),
                                };

                                log::info!("  🔄 Transforming '{}' to '{}' per constraint", s, transformed_notation);
                                PitchCode::from_string(&transformed_notation, pitch_system)
                            }
                        }
                    }
                    DegreeConstraint::Any => {
                        pitch_code // No constraint, keep original
                    }
                }
            }
        } else {
            pitch_code // No constraint or invalid pitch code
        };

        // Initialize cell.char with the correct PUA glyph (octave 0 initially)
        let initial_char = if let Some(pc) = transformed_pitch_code {
            glyph_for_pitch(pc, 0, pitch_system)
                .map(|g| g.to_string())
                .unwrap_or_else(|| s.to_string())
        } else {
            s.to_string()
        };

        let mut cell = Cell::new(initial_char, ElementKind::PitchedElement, column);
        cell.pitch_system = Some(pitch_system);
        cell.pitch_code = transformed_pitch_code;
        cell.octave = 0; // Initialize at base octave
        Some(cell)
    } else {
        None
    }
}

/// Helper to convert AccidentalType to notation suffix
fn accidental_to_suffix(acc: AccidentalType) -> &'static str {
    match acc {
        AccidentalType::None => "",
        AccidentalType::Natural => "nat", // Explicit natural notation
        AccidentalType::Sharp => "#",
        AccidentalType::Flat => "b",
        AccidentalType::DoubleSharp => "##",
        AccidentalType::DoubleFlat => "bb",
        AccidentalType::HalfFlat => "b/",
    }
}

/// Parse barline (includes "|", "|:", ":|", "||", etc.)
/// Note: ":" alone is NOT a barline - it's text
/// Converts ASCII input to actual Unicode barline characters for direct rendering
fn parse_barline(s: &str, column: usize) -> Option<Cell> {
    use crate::renderers::font_utils::{
        BARLINE_SINGLE, BARLINE_DOUBLE, BARLINE_REPEAT_LEFT, BARLINE_REPEAT_RIGHT
    };

    let (barline_kind, barline_char) = match s {
        "|" => (ElementKind::SingleBarline, BARLINE_SINGLE),
        "|:" => (ElementKind::RepeatLeftBarline, BARLINE_REPEAT_LEFT),
        ":|" => (ElementKind::RepeatRightBarline, BARLINE_REPEAT_RIGHT),
        "||" => (ElementKind::DoubleBarline, BARLINE_DOUBLE),
        _ => return None,
    };

    // Store the actual Unicode barline character, not the ASCII placeholder
    let cell = Cell::new(barline_char.to_string(), barline_kind, column);
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
        use crate::renderers::font_utils::glyph_for_pitch;
        let cell = parse_single('1', PitchSystem::Number, 0, None);
        assert_eq!(cell.kind, ElementKind::PitchedElement);
        // Should return Unicode glyph for Number 1 at base octave
        let expected_glyph = glyph_for_pitch(PitchCode::N1, 0, PitchSystem::Number)
            .expect("Should have glyph for N1");
        assert_eq!(cell.char, expected_glyph.to_string());
    }

    #[test]
    fn test_parse_single_text() {
        let cell = parse_single('x', PitchSystem::Number, 0, None);
        assert_eq!(cell.kind, ElementKind::Text);
        assert_eq!(cell.char, "x");
    }


    // REMOVED: Tests for continuation cell system (no longer used)
    // Multi-character notation like "1#", "||", "|:" now creates single cells

    #[test]
    fn test_barline_single() {
        // Test single "|" should be SingleBarline with Unicode character
        use crate::renderers::font_utils::BARLINE_SINGLE;
        let cell = parse_single('|', PitchSystem::Number, 0, None);
        assert_eq!(cell.char, BARLINE_SINGLE.to_string());
        assert_eq!(cell.kind, ElementKind::SingleBarline);
    }

    #[test]
    fn test_note_with_sharp() {
        use crate::renderers::font_utils::glyph_for_pitch;
        // Test "1#" should parse as single pitched element with Sharp pitch_code
        let cell = parse("1#", PitchSystem::Number, 0, None);
        // Should return Unicode glyph for Number 1 sharp at base octave
        let expected_glyph = glyph_for_pitch(PitchCode::N1s, 0, PitchSystem::Number)
            .expect("Should have glyph for N1s");
        assert_eq!(cell.char, expected_glyph.to_string());
        assert_eq!(cell.kind, ElementKind::PitchedElement);
        assert_eq!(cell.pitch_code, Some(PitchCode::N1s));
    }

    #[test]
    fn test_double_barline() {
        use crate::renderers::font_utils::BARLINE_DOUBLE;
        // Test "||" should parse as single DoubleBarline with Unicode character
        let cell = parse("||", PitchSystem::Number, 0, None);
        assert_eq!(cell.char, BARLINE_DOUBLE.to_string());
        assert_eq!(cell.kind, ElementKind::DoubleBarline);
    }

    #[test]
    fn test_repeat_left_barline() {
        use crate::renderers::font_utils::BARLINE_REPEAT_LEFT;
        // Test "|:" should parse as single RepeatLeftBarline with Unicode character
        let cell = parse("|:", PitchSystem::Number, 0, None);
        assert_eq!(cell.char, BARLINE_REPEAT_LEFT.to_string());
        assert_eq!(cell.kind, ElementKind::RepeatLeftBarline);
    }

    #[test]
    fn test_repeat_right_barline() {
        use crate::renderers::font_utils::BARLINE_REPEAT_RIGHT;
        // Test ":|" should parse as single RepeatRightBarline with Unicode character
        let cell = parse(":|", PitchSystem::Number, 0, None);
        assert_eq!(cell.char, BARLINE_REPEAT_RIGHT.to_string());
        assert_eq!(cell.kind, ElementKind::RepeatRightBarline);
    }

    #[test]
    fn test_colon_alone_is_symbol() {
        // Test ":" alone should be Symbol
        let cell = parse_single(':', PitchSystem::Number, 0, None);
        assert_eq!(cell.char, ":");
        assert_eq!(cell.kind, ElementKind::Symbol);
    }

    #[test]
    fn test_at_symbol() {
        // Test "@" should be Symbol
        let cell = parse_single('@', PitchSystem::Number, 0, None);
        assert_eq!(cell.char, "@");
        assert_eq!(cell.kind, ElementKind::Symbol);
    }

    #[test]
    fn test_hash_symbol_vs_accidental() {
        // Test "#" alone should be Symbol (not part of note)
        let cell = parse_single('#', PitchSystem::Number, 0, None);
        assert_eq!(cell.char, "#");
        assert_eq!(cell.kind, ElementKind::Symbol);
    }

    #[test]
    fn test_mixed_symbols_and_text() {
        // Test that symbols parse correctly before falling back to text
        let cell1 = parse_single('!', PitchSystem::Number, 0, None);
        assert_eq!(cell1.kind, ElementKind::Symbol);

        let cell2 = parse_single('?', PitchSystem::Number, 0, None);
        assert_eq!(cell2.kind, ElementKind::Symbol);

        let cell3 = parse_single('~', PitchSystem::Number, 0, None);
        assert_eq!(cell3.kind, ElementKind::Symbol);

        // Alphanumeric should still be text (or note if valid)
        let cell4 = parse_single('x', PitchSystem::Number, 0, None);
        assert_eq!(cell4.kind, ElementKind::Text);
    }
}
