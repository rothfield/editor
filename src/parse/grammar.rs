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
/// Stores barlines as ASCII - JavaScript layer converts to SMuFL glyphs for display
fn parse_barline(s: &str, column: usize) -> Option<Cell> {
    if matches!(s, "|" | "|:" | ":|" | "||") {
        let cell = Cell::new(s.to_string(), ElementKind::Barline, column);
        Some(cell)
    } else {
        None
    }
}

/// Parse whitespace
fn parse_whitespace(s: &str, column: usize) -> Option<Cell> {
    if s == " " {
        let cell = Cell::new(s.to_string(), ElementKind::Whitespace, column);
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
// Continuation Marker
// ============================================================================

/// Mark cells as continuations of previous cells
/// This replaces the old token combination approach
pub fn mark_continuations(cells: &mut Vec<Cell>) {
    log::info!("🔗 mark_continuations called for {} cells", cells.len());

    for i in 1..cells.len() {
        // Get current and previous characters
        let curr_char = cells[i].char.chars().next().unwrap_or('\0');
        let prev_char = cells[i - 1].char.chars().next().unwrap_or('\0');
        let prev_kind = cells[i - 1].kind;

        // Check for specific barline combinations
        if (prev_char == '|' && curr_char == ':') ||   // |:
           (prev_char == ':' && curr_char == '|') ||   // :|
           (prev_char == '|' && curr_char == '|') {    // ||
            cells[i].continuation = true;
            cells[i].kind = ElementKind::Barline;
            // Also force the previous cell to be a Barline (for ":" in ":|")
            cells[i - 1].kind = ElementKind::Barline;
            log::info!("  ✅ Cell[{}] '{}' marked as barline continuation of Cell[{}] '{}' → combined barline",
                     i, cells[i].char, i - 1, cells[i - 1].char);
        }
        // Check if current cell should continue previous cell (accidentals, text)
        else if should_continue_with_limit(cells, i, prev_kind, curr_char) {
            cells[i].continuation = true;
            cells[i].kind = prev_kind;  // Inherit parent's kind

            // IMPORTANT: If this is an accidental continuation, update parent's pitch_code
            if prev_kind == ElementKind::PitchedElement && matches!(curr_char, '#' | 'b') {
                // Find the root (first non-continuation cell) to get pitch_system
                let mut root_idx = i - 1;
                while root_idx > 0 && cells[root_idx].continuation {
                    root_idx -= 1;
                }

                // Get pitch system from root cell
                if let Some(pitch_system) = cells[root_idx].pitch_system {
                    // Combine all chars from root through current cell
                    let mut combined = String::new();
                    for j in root_idx..=i {
                        combined.push_str(&cells[j].char);
                    }

                    // Reparse pitch_code with combined string
                    let new_pitch_code = PitchCode::from_string(&combined, pitch_system);
                    cells[root_idx].pitch_code = new_pitch_code;
                    log::info!("  ✅ Cell[{}] '{}' marked as continuation, updated Cell[{}] pitch_code to {:?} (combined: '{}')",
                             i, cells[i].char, root_idx, cells[root_idx].pitch_code, combined);
                }
            } else {
                log::info!("  ✅ Cell[{}] '{}' marked as continuation of Cell[{}] (kind={:?})",
                         i, cells[i].char, i - 1, prev_kind);
            }
        }
    }

    let continuation_count = cells.iter().filter(|c| c.continuation).count();
    log::info!("  🏁 Marked {} cells as continuations", continuation_count);
}

/// Check if current character should continue previous cell
fn should_continue(prev_kind: ElementKind, curr_char: char) -> bool {
    match prev_kind {
        ElementKind::PitchedElement => {
            // If previous is a note and current is accidental
            matches!(curr_char, '#' | 'b')
        }
        ElementKind::Text => {
            // If previous is text and current is letter
            curr_char.is_alphabetic()
        }
        _ => false
    }
}

/// Check if current character should continue previous cell (with accidental limit)
/// For PitchedElement: limits accidentals to maximum of 2 (double sharp/flat)
fn should_continue_with_limit(cells: &[Cell], i: usize, prev_kind: ElementKind, curr_char: char) -> bool {
    match prev_kind {
        ElementKind::PitchedElement => {
            // If current is not an accidental, can't continue
            if !matches!(curr_char, '#' | 'b') {
                return false;
            }

            // Find the root cell (trace back to non-continuation)
            let mut root_idx = i - 1;
            while root_idx > 0 && cells[root_idx].continuation {
                root_idx -= 1;
            }

            // Count existing accidentals in the glyph
            let mut accidental_count = 0;
            for j in root_idx..i {
                let c = cells[j].char.chars().next().unwrap_or('\0');
                if matches!(c, '#' | 'b') {
                    accidental_count += 1;
                }
            }

            // Limit to 2 accidentals (double sharp or double flat)
            accidental_count < 2
        }
        ElementKind::Text => {
            // If previous is text and current is letter
            curr_char.is_alphabetic()
        }
        _ => false
    }
}

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


    #[test]
    fn test_mark_continuations() {
        let mut cells = vec![
            parse_single('1', PitchSystem::Number, 0),
            parse_single('#', PitchSystem::Number, 1),
        ];

        mark_continuations(&mut cells);

        // Should still have 2 cells (not combined)
        assert_eq!(cells.len(), 2);

        // First cell unchanged
        assert_eq!(cells[0].char, "1");
        assert_eq!(cells[0].kind, ElementKind::PitchedElement);
        assert_eq!(cells[0].continuation, false);

        // Second cell marked as continuation
        assert_eq!(cells[1].char, "#");
        assert_eq!(cells[1].continuation, true);
        assert_eq!(cells[1].kind, ElementKind::PitchedElement); // Inherits parent's kind
    }

    #[test]
    fn test_barline_left_repeat() {
        // Test "|:" should be left repeat barline
        let mut cells = vec![
            parse_single('|', PitchSystem::Number, 0),
            parse_single(':', PitchSystem::Number, 1),
        ];

        mark_continuations(&mut cells);

        // Should have 2 cells
        assert_eq!(cells.len(), 2);

        // First cell: "|" as Barline
        assert_eq!(cells[0].char, "|");
        assert_eq!(cells[0].kind, ElementKind::Barline);
        assert_eq!(cells[0].continuation, false);

        // Second cell: ":" as continuation, forced to Barline
        assert_eq!(cells[1].char, ":");
        assert_eq!(cells[1].continuation, true);
        assert_eq!(cells[1].kind, ElementKind::Barline);
    }

    #[test]
    fn test_barline_right_repeat() {
        // Test ":|" should be right repeat barline
        let mut cells = vec![
            parse_single(':', PitchSystem::Number, 0),
            parse_single('|', PitchSystem::Number, 1),
        ];

        mark_continuations(&mut cells);

        // Should have 2 cells
        assert_eq!(cells.len(), 2);

        // First cell: ":" was Text, but should be forced to Barline
        assert_eq!(cells[0].char, ":");
        assert_eq!(cells[0].kind, ElementKind::Barline); // Forced to Barline
        assert_eq!(cells[0].continuation, false);

        // Second cell: "|" as continuation of barline
        assert_eq!(cells[1].char, "|");
        assert_eq!(cells[1].continuation, true);
        assert_eq!(cells[1].kind, ElementKind::Barline);
    }

    #[test]
    fn test_barline_double() {
        // Test "||" should be double barline
        let mut cells = vec![
            parse_single('|', PitchSystem::Number, 0),
            parse_single('|', PitchSystem::Number, 1),
        ];

        mark_continuations(&mut cells);

        // Should have 2 cells
        assert_eq!(cells.len(), 2);

        // First cell: "|" as Barline
        assert_eq!(cells[0].char, "|");
        assert_eq!(cells[0].kind, ElementKind::Barline);
        assert_eq!(cells[0].continuation, false);

        // Second cell: "|" as continuation
        assert_eq!(cells[1].char, "|");
        assert_eq!(cells[1].continuation, true);
        assert_eq!(cells[1].kind, ElementKind::Barline);
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
