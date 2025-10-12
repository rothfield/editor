//! Recursive descent parser with production rules
//!
//! This module provides three cases of parsing:
//! 1. parse(char) - Single character tokenizer
//! 2. parse(before, char) - Look back combination (accidentals, text)
//! 3. parse(char, after) - Look forward combination (barlines)

use crate::models::{Cell, ElementKind, LaneKind, PitchSystem};
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

    // Try single-char barline: "|", ":"
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

    // Fallback to text
    log::info!("  ℹ️ Parsed as text (fallback)");
    parse_text(s, column)
}

/// Parse a single character into a Cell (Case 1: tokenizer)
/// Always succeeds - returns Text as fallback
pub fn parse_single(c: char, pitch_system: PitchSystem, column: usize) -> Cell {
    parse(&c.to_string(), pitch_system, column)
}

/// Try to combine previous cell with new character (Case 2: look back)
/// Returns Some(new_cell) if combination is valid, None otherwise
pub fn parse_with_before(prev: &Cell, c: char, pitch_system: PitchSystem) -> Option<Cell> {
    // Build combined string
    let combined_str = format!("{}{}", prev.grapheme, c);
    log::info!("  ⬅️ parse_with_before: trying '{}'", combined_str);

    // Try to parse the combined string
    let cell = parse(&combined_str, pitch_system, prev.col);

    // Only combine if it's NOT just text (text is fallback, means parse failed)
    if cell.kind != ElementKind::Text {
        log::info!("  ✅ Combined into {:?}", cell.kind);
        Some(cell)
    } else if prev.kind == ElementKind::Text {
        // Both prev and new are text, so combine them as text
        log::info!("  ✅ Combined as text");
        Some(cell)
    } else {
        log::info!("  ❌ Cannot combine");
        None
    }
}

/// Try to combine current character with next character (Case 3: look forward)
/// Returns Some(new_cell) if combination is valid, None otherwise
pub fn parse_with_after(c: char, next: &Cell, pitch_system: PitchSystem, column: usize) -> Option<Cell> {
    // Build combined string
    let combined_str = format!("{}{}", c, next.grapheme);
    log::info!("  ➡️ parse_with_after: trying '{}'", combined_str);

    // Try to parse the combined string
    let cell = parse(&combined_str, pitch_system, column);

    // Only combine if it's NOT just text (text is fallback, means parse failed)
    if cell.kind != ElementKind::Text {
        log::info!("  ✅ Combined into {:?}", cell.kind);
        Some(cell)
    } else {
        log::info!("  ❌ Cannot combine");
        None
    }
}

// ============================================================================
// Production Rules
// ============================================================================

/// Parse note (includes accidentals: "1", "1#", "2bb", "c#", etc.)
fn parse_note(s: &str, pitch_system: PitchSystem, column: usize) -> Option<Cell> {
    let dispatcher = get_dispatcher();
    if dispatcher.lookup(s, pitch_system) {
        let mut cell = Cell::new(s.to_string(), ElementKind::PitchedElement, LaneKind::Letter, column);
        cell.pitch_system = Some(pitch_system);
        cell.pitch_code = Some(s.to_string());
        cell.set_head(true);
        Some(cell)
    } else {
        None
    }
}

/// Parse barline (includes "|", ":", "|:", ":|", "||", etc.)
fn parse_barline(s: &str, column: usize) -> Option<Cell> {
    if matches!(s, "|" | ":" | "|:" | ":|" | "||") {
        let cell = Cell::new(s.to_string(), ElementKind::Barline, LaneKind::Letter, column);
        Some(cell)
    } else {
        None
    }
}

/// Parse whitespace
fn parse_whitespace(s: &str, column: usize) -> Option<Cell> {
    if s == " " {
        let cell = Cell::new(s.to_string(), ElementKind::Whitespace, LaneKind::Letter, column);
        Some(cell)
    } else {
        None
    }
}

/// Parse unpitched element (dash, underscore)
fn parse_unpitched(s: &str, column: usize) -> Option<Cell> {
    if s == "-" || s == "_" {
        let cell = Cell::new(s.to_string(), ElementKind::UnpitchedElement, LaneKind::Letter, column);
        Some(cell)
    } else {
        None
    }
}

/// Parse breath mark (apostrophe, comma)
fn parse_breath_mark(s: &str, column: usize) -> Option<Cell> {
    if s == "'" || s == "," {
        let cell = Cell::new(s.to_string(), ElementKind::BreathMark, LaneKind::Letter, column);
        Some(cell)
    } else {
        None
    }
}

/// Parse text (fallback)
fn parse_text(s: &str, column: usize) -> Cell {
    Cell::new(s.to_string(), ElementKind::Text, LaneKind::Letter, column)
}

// ============================================================================
// Token Combiner
// ============================================================================

/// Try to combine tokens using recursive descent
/// After inserting a character at position, try combinations:
/// 1. Look back: Can we combine prev + current?
/// 2. Look forward: Can we combine current + next?
pub fn try_combine_tokens(cells: &mut Vec<Cell>, insert_pos: usize, pitch_system: PitchSystem) {
    log::info!("🔄 try_combine_tokens called: insert_pos={}, cells.len()={}, pitch_system={:?}",
        insert_pos, cells.len(), pitch_system);

    if cells.is_empty() {
        log::info!("  ⚠️ cells is empty, returning");
        return;
    }

    // Log current state
    let cells_str: Vec<String> = cells.iter().map(|c| format!("'{}'[{}]", c.grapheme, c.kind as u8)).collect();
    log::info!("  📋 Current cells: [{}]", cells_str.join(", "));

    // Case 2: Look back - try to combine with previous cell
    if insert_pos > 0 && insert_pos < cells.len() {
        let current_char = cells[insert_pos].grapheme.chars().next().unwrap_or('\0');
        log::info!("  ⬅️ Case 2 (Look back): prev='{}', current_char='{}'",
            cells[insert_pos - 1].grapheme, current_char);

        if let Some(combined) = parse_with_before(&cells[insert_pos - 1], current_char, pitch_system) {
            log::info!("  ✅ Combination succeeded: '{}'", combined.grapheme);
            // Replace previous cell with combined cell
            cells[insert_pos - 1] = combined;
            // Remove current cell
            cells.remove(insert_pos);

            // Update column indices
            for i in insert_pos..cells.len() {
                if cells[i].col > 0 {
                    cells[i].col -= 1;
                }
            }

            let cells_str: Vec<String> = cells.iter().map(|c| format!("'{}'", c.grapheme)).collect();
            log::info!("  📋 After combination: [{}]", cells_str.join(", "));
            return;
        } else {
            log::info!("  ❌ Look back combination failed");
        }
    } else {
        log::info!("  ⏭️ Skipping Case 2 (Look back): insert_pos={}, cells.len()={}", insert_pos, cells.len());
    }

    // Case 3: Look forward - try to combine with next cell
    if insert_pos < cells.len() - 1 {
        let current_char = cells[insert_pos].grapheme.chars().next().unwrap_or('\0');
        log::info!("  ➡️ Case 3 (Look forward): current_char='{}', next='{}'",
            current_char, cells[insert_pos + 1].grapheme);

        if let Some(combined) = parse_with_after(current_char, &cells[insert_pos + 1], pitch_system, cells[insert_pos].col) {
            log::info!("  ✅ Combination succeeded: '{}'", combined.grapheme);
            // Replace current cell with combined cell
            cells[insert_pos] = combined;
            // Remove next cell
            cells.remove(insert_pos + 1);

            // Update column indices
            for i in (insert_pos + 1)..cells.len() {
                if cells[i].col > 0 {
                    cells[i].col -= 1;
                }
            }

            let cells_str: Vec<String> = cells.iter().map(|c| format!("'{}'", c.grapheme)).collect();
            log::info!("  📋 After combination: [{}]", cells_str.join(", "));
            return;
        } else {
            log::info!("  ❌ Look forward combination failed");
        }
    } else {
        log::info!("  ⏭️ Skipping Case 3 (Look forward): insert_pos={}, cells.len()={}", insert_pos, cells.len());
    }

    log::info!("  🏁 No combination performed");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_single_note() {
        let cell = parse_single('1', PitchSystem::Number, 0);
        assert_eq!(cell.kind, ElementKind::PitchedElement);
        assert_eq!(cell.grapheme, "1");
    }

    #[test]
    fn test_parse_single_text() {
        let cell = parse_single('x', PitchSystem::Number, 0);
        assert_eq!(cell.kind, ElementKind::Text);
        assert_eq!(cell.grapheme, "x");
    }

    #[test]
    fn test_parse_with_before_accidental() {
        let note = parse_single('1', PitchSystem::Number, 0);
        let combined = parse_with_before(&note, '#', PitchSystem::Number);

        assert!(combined.is_some());
        let combined = combined.unwrap();
        assert_eq!(combined.grapheme, "1#");
        assert_eq!(combined.kind, ElementKind::PitchedElement);
    }

    #[test]
    fn test_parse_with_before_double_accidental() {
        let note = parse_single('1', PitchSystem::Number, 0);
        let sharp = parse_with_before(&note, '#', PitchSystem::Number).unwrap();
        let double_sharp = parse_with_before(&sharp, '#', PitchSystem::Number);

        assert!(double_sharp.is_some());
        let double_sharp = double_sharp.unwrap();
        assert_eq!(double_sharp.grapheme, "1##");
    }

    #[test]
    fn test_parse_western_note_with_accidental() {
        let note = parse_single('c', PitchSystem::Western, 0);
        let combined = parse_with_before(&note, '#', PitchSystem::Western);

        assert!(combined.is_some());
        let combined = combined.unwrap();
        assert_eq!(combined.grapheme, "c#");
    }

    #[test]
    fn test_try_combine_tokens() {
        let mut cells = vec![
            parse_single('1', PitchSystem::Number, 0),
            parse_single('#', PitchSystem::Number, 1),
        ];

        try_combine_tokens(&mut cells, 1, PitchSystem::Number);

        assert_eq!(cells.len(), 1);
        assert_eq!(cells[0].grapheme, "1#");
        assert_eq!(cells[0].kind, ElementKind::PitchedElement);
    }
}
