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
pub fn parse(s: &str, pitch_system: PitchSystem, constraint: Option<&ScaleConstraint>) -> Cell {
    log::info!("🔍 parse('{}', {:?})", s, pitch_system);

    // UNICODE SUPERSCRIPT DIGITS → Grace notes (before multi-char patterns)
    // Unicode superscripts: ¹²³⁴⁵⁶⁷ (U+00B9, U+00B2, U+00B3, U+2074-U+2077)
    if let Some(cell) = parse_unicode_superscript(s, pitch_system) {
        log::info!("  ✅ Parsed as unicode superscript (grace note)");
        return cell;
    }

    // MULTI-CHARACTER PATTERNS FIRST (greedy matching)

    // Try multi-char barlines: "|:", ":|", "||"
    if s.len() > 1 {
        if let Some(cell) = parse_barline(s) {
            log::info!("  ✅ Parsed as multi-char barline");
            return cell;
        }
    }

    // Try notes with accidentals: "1#", "2bb", "c#", etc.
    if s.len() > 1 {
        if let Some(cell) = parse_note(s, pitch_system, constraint) {
            log::info!("  ✅ Parsed as multi-char note");
            return cell;
        }
    }

    // SINGLE-CHARACTER PATTERNS

    // Try single-char note: "1", "2", "c", etc.
    if let Some(cell) = parse_note(s, pitch_system, constraint) {
        log::info!("  ✅ Parsed as note");
        return cell;
    }

    // Try single-char barline: "|"
    if let Some(cell) = parse_barline(s) {
        log::info!("  ✅ Parsed as barline");
        return cell;
    }

    // Try whitespace
    if let Some(cell) = parse_whitespace(s) {
        log::info!("  ✅ Parsed as whitespace");
        return cell;
    }

    // Try unpitched element
    if let Some(cell) = parse_unpitched(s) {
        log::info!("  ✅ Parsed as unpitched");
        return cell;
    }

    // Try breath mark
    if let Some(cell) = parse_breath_mark(s) {
        log::info!("  ✅ Parsed as breath mark");
        return cell;
    }

    // Try symbol (single non-alphanumeric character)
    if let Some(cell) = parse_symbol(s) {
        log::info!("  ✅ Parsed as symbol");
        return cell;
    }

    // Fallback to text
    log::info!("  ℹ️ Parsed as text (fallback)");
    parse_text(s)
}

/// Parse a single character into a Cell (Case 1: tokenizer)
/// Always succeeds - returns Text as fallback
pub fn parse_single(c: char, pitch_system: PitchSystem, constraint: Option<&ScaleConstraint>) -> Cell {
    parse(&c.to_string(), pitch_system, constraint)
}


// ============================================================================
// Production Rules
// ============================================================================

/// Parse note (includes accidentals: "1", "1#", "2bb", "c#", etc.)
/// Applies scale constraint transformation if active
fn parse_note(s: &str, pitch_system: PitchSystem, constraint: Option<&ScaleConstraint>) -> Option<Cell> {
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

        let cell = Cell::new(initial_char, ElementKind::PitchedElement);
        // pitch_code and pitch_system are derived from codepoint via getters
        // octave 0 is already encoded in the codepoint from glyph_for_pitch
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
fn parse_barline(s: &str) -> Option<Cell> {
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
    let cell = Cell::new(barline_char.to_string(), barline_kind);
    Some(cell)
}

/// Parse whitespace
fn parse_whitespace(s: &str) -> Option<Cell> {
    if s == " " {
        // Keep ASCII space as-is (don't convert to nbsp)
        let cell = Cell::new(" ".to_string(), ElementKind::Whitespace);
        Some(cell)
    } else {
        None
    }
}

/// Parse unpitched element (dash only)
fn parse_unpitched(s: &str) -> Option<Cell> {
    if s == "-" {
        let cell = Cell::new(s.to_string(), ElementKind::UnpitchedElement);
        Some(cell)
    } else {
        None
    }
}

/// Parse breath mark (apostrophe, comma)
fn parse_breath_mark(s: &str) -> Option<Cell> {
    if s == "'" || s == "," {
        let cell = Cell::new(s.to_string(), ElementKind::BreathMark);
        Some(cell)
    } else {
        None
    }
}

/// Parse Unicode superscript digits as grace notes
///
/// Unicode superscripts ¹²³⁴⁵⁶⁷ are converted to PUA superscript glyphs,
/// which the IR builder recognizes as grace notes.
///
/// Unicode codepoints:
/// - ¹ U+00B9 → pitch 1 superscript
/// - ² U+00B2 → pitch 2 superscript
/// - ³ U+00B3 → pitch 3 superscript
/// - ⁴ U+2074 → pitch 4 superscript
/// - ⁵ U+2075 → pitch 5 superscript
/// - ⁶ U+2076 → pitch 6 superscript
/// - ⁷ U+2077 → pitch 7 superscript
fn parse_unicode_superscript(s: &str, pitch_system: PitchSystem) -> Option<Cell> {
    use crate::renderers::font_utils::{glyph_for_pitch, to_superscript};

    // Must be single character
    if s.chars().count() != 1 {
        return None;
    }

    let ch = s.chars().next().unwrap();

    // Map Unicode superscript to pitch degree (1-7)
    let degree: u8 = match ch {
        '¹' => 1,  // U+00B9
        '²' => 2,  // U+00B2
        '³' => 3,  // U+00B3
        '⁴' => 4,  // U+2074
        '⁵' => 5,  // U+2075
        '⁶' => 6,  // U+2076
        '⁷' => 7,  // U+2077
        _ => return None,
    };

    // Get the pitch code for this degree
    let pitch_code = match degree {
        1 => PitchCode::N1,
        2 => PitchCode::N2,
        3 => PitchCode::N3,
        4 => PitchCode::N4,
        5 => PitchCode::N5,
        6 => PitchCode::N6,
        7 => PitchCode::N7,
        _ => return None,
    };

    // Get the base glyph for this pitch
    let base_glyph = glyph_for_pitch(pitch_code, 0, pitch_system)?;
    let base_cp = base_glyph as u32;

    // Convert to superscript codepoint
    let super_cp = to_superscript(base_cp)?;
    let super_char = char::from_u32(super_cp)?;

    // Create cell with superscript codepoint
    let mut cell = Cell::new(super_char.to_string(), ElementKind::UpperAnnotation);
    cell.set_codepoint(super_cp);

    Some(cell)
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
fn parse_symbol(s: &str) -> Option<Cell> {
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

    let cell = Cell::new(s.to_string(), ElementKind::Symbol);
    Some(cell)
}

/// Parse text (fallback)
fn parse_text(s: &str) -> Cell {
    Cell::new(s.to_string(), ElementKind::Text)
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
        let cell = parse_single('1', PitchSystem::Number, None);
        assert_eq!(cell.get_kind(), ElementKind::PitchedElement);
        // Should return Unicode glyph for Number 1 at base octave
        let expected_glyph = glyph_for_pitch(PitchCode::N1, 0, PitchSystem::Number)
            .expect("Should have glyph for N1");
        assert_eq!(cell.get_char_string(), expected_glyph.to_string());
    }

    #[test]
    fn test_parse_single_text() {
        let cell = parse_single('x', PitchSystem::Number, None);
        assert_eq!(cell.get_kind(), ElementKind::Text);
        assert_eq!(cell.get_char_string(), "x");
    }

    #[test]
    fn test_f_not_pitch_in_number_system() {
        use crate::parse::pitch_system::PitchSystemDispatcher;

        // First verify the dispatcher correctly rejects F in Number system
        let dispatcher = PitchSystemDispatcher::new();
        let lookup_result = dispatcher.lookup("F", PitchSystem::Number);
        println!("dispatcher.lookup('F', Number) = {}", lookup_result);
        assert!(!lookup_result, "dispatcher.lookup should return false for F in Number system");

        // Now test parse_single
        // 'F' is a Western pitch, NOT a Number pitch
        // It should parse as Text in Number system
        let cell_f = parse_single('F', PitchSystem::Number, None);
        println!("cell_f.get_kind() = {:?}", cell_f.get_kind());
        println!("cell_f.get_char_string() = {:?}", cell_f.get_char_string());
        println!("cell_f.get_pitch_code() = {:?}", cell_f.get_pitch_code());
        assert_eq!(cell_f.get_kind(), ElementKind::Text, "F should be Text in Number system, not PitchedElement");
        assert_eq!(cell_f.get_char_string(), "F");
        assert_eq!(cell_f.get_pitch_code(), None, "F should have no pitch_code in Number system");

        let cell_f_lower = parse_single('f', PitchSystem::Number, None);
        assert_eq!(cell_f_lower.get_kind(), ElementKind::Text, "f should be Text in Number system");

        // Verify F IS a pitch in Western system
        let cell_f_western = parse_single('F', PitchSystem::Western, None);
        assert_eq!(cell_f_western.get_kind(), ElementKind::PitchedElement, "F SHOULD be PitchedElement in Western system");
        assert_eq!(cell_f_western.get_pitch_code(), Some(PitchCode::N4), "F should be pitch code N4 in Western");
    }


    // REMOVED: Tests for continuation cell system (no longer used)
    // Multi-character notation like "1#", "||", "|:" now creates single cells

    #[test]
    fn test_barline_single() {
        // Test single "|" should be SingleBarline with Unicode character
        use crate::renderers::font_utils::BARLINE_SINGLE;
        let cell = parse_single('|', PitchSystem::Number, None);
        assert_eq!(cell.get_char_string(), BARLINE_SINGLE.to_string());
        assert_eq!(cell.get_kind(), ElementKind::SingleBarline);
    }

    #[test]
    fn test_note_with_sharp() {
        use crate::renderers::font_utils::glyph_for_pitch;
        // Test "1#" should parse as single pitched element with Sharp pitch_code
        let cell = parse("1#", PitchSystem::Number, None);
        // Should return Unicode glyph for Number 1 sharp at base octave
        let expected_glyph = glyph_for_pitch(PitchCode::N1s, 0, PitchSystem::Number)
            .expect("Should have glyph for N1s");
        assert_eq!(cell.get_char_string(), expected_glyph.to_string());
        assert_eq!(cell.get_kind(), ElementKind::PitchedElement);
        assert_eq!(cell.get_pitch_code(), Some(PitchCode::N1s));
    }

    #[test]
    fn test_double_barline() {
        use crate::renderers::font_utils::BARLINE_DOUBLE;
        // Test "||" should parse as single DoubleBarline with Unicode character
        let cell = parse("||", PitchSystem::Number, None);
        assert_eq!(cell.get_char_string(), BARLINE_DOUBLE.to_string());
        assert_eq!(cell.get_kind(), ElementKind::DoubleBarline);
    }

    #[test]
    fn test_repeat_left_barline() {
        use crate::renderers::font_utils::BARLINE_REPEAT_LEFT;
        // Test "|:" should parse as single RepeatLeftBarline with Unicode character
        let cell = parse("|:", PitchSystem::Number, None);
        assert_eq!(cell.get_char_string(), BARLINE_REPEAT_LEFT.to_string());
        assert_eq!(cell.get_kind(), ElementKind::RepeatLeftBarline);
    }

    #[test]
    fn test_repeat_right_barline() {
        use crate::renderers::font_utils::BARLINE_REPEAT_RIGHT;
        // Test ":|" should parse as single RepeatRightBarline with Unicode character
        let cell = parse(":|", PitchSystem::Number, None);
        assert_eq!(cell.get_char_string(), BARLINE_REPEAT_RIGHT.to_string());
        assert_eq!(cell.get_kind(), ElementKind::RepeatRightBarline);
    }

    #[test]
    fn test_colon_alone_is_symbol() {
        // Test ":" alone should be Symbol
        let cell = parse_single(':', PitchSystem::Number, None);
        assert_eq!(cell.get_char_string(), ":");
        assert_eq!(cell.get_kind(), ElementKind::Symbol);
    }

    #[test]
    fn test_at_symbol() {
        // Test "@" should be Symbol
        let cell = parse_single('@', PitchSystem::Number, None);
        assert_eq!(cell.get_char_string(), "@");
        assert_eq!(cell.get_kind(), ElementKind::Symbol);
    }

    #[test]
    fn test_hash_symbol_vs_accidental() {
        // Test "#" alone should be Symbol (not part of note)
        let cell = parse_single('#', PitchSystem::Number, None);
        assert_eq!(cell.get_char_string(), "#");
        assert_eq!(cell.get_kind(), ElementKind::Symbol);
    }

    #[test]
    fn test_mixed_symbols_and_text() {
        // Test that symbols parse correctly before falling back to text
        let cell1 = parse_single('!', PitchSystem::Number, None);
        assert_eq!(cell1.get_kind(), ElementKind::Symbol);

        let cell2 = parse_single('?', PitchSystem::Number, None);
        assert_eq!(cell2.get_kind(), ElementKind::Symbol);

        let cell3 = parse_single('~', PitchSystem::Number, None);
        assert_eq!(cell3.get_kind(), ElementKind::Symbol);

        // Alphanumeric should still be text (or note if valid)
        let cell4 = parse_single('x', PitchSystem::Number, None);
        assert_eq!(cell4.get_kind(), ElementKind::Text);
    }

    #[test]
    fn test_unicode_superscript_to_grace_note() {
        use crate::renderers::font_utils::is_superscript;

        // Test Unicode superscript ⁴ (U+2074) → PUA superscript grace note
        let cell = parse_single('⁴', PitchSystem::Number, None);
        assert_eq!(cell.get_kind(), ElementKind::UpperAnnotation,
            "Unicode superscript should parse as UpperAnnotation (grace note)");

        // Verify codepoint is in superscript range
        let cp = cell.get_codepoint();
        assert!(is_superscript(cp),
            "Codepoint 0x{:X} should be in superscript range (0xF8000+)", cp);

        // Test other superscripts
        for (unicode_super, expected_degree) in [
            ('¹', 1), ('²', 2), ('³', 3),
            ('⁴', 4), ('⁵', 5), ('⁶', 6), ('⁷', 7),
        ] {
            let cell = parse_single(unicode_super, PitchSystem::Number, None);
            assert_eq!(cell.get_kind(), ElementKind::UpperAnnotation,
                "Unicode superscript '{}' should parse as grace note", unicode_super);
            assert!(is_superscript(cell.get_codepoint()),
                "Unicode superscript '{}' (degree {}) should have superscript codepoint",
                unicode_super, expected_degree);
        }
    }
}
