//! Slur diagnostics - detects orphaned/unmatched slur markers
//!
//! Uses stack-based pairing to properly handle nested slurs:
//! - On Left (slur start): push to stack
//! - On Right (slur end): pop from stack, if empty = orphan end
//! - After scan: anything left on stack = orphan starts

use crate::models::Cell;
use crate::renderers::font_utils::CodepointTransform;
use crate::renderers::line_variants::SlurRole;

use super::{DiagnosticMark, DiagnosticSeverity};

/// Analyze slurs in a line's cells, detecting orphaned markers
///
/// Returns diagnostic marks for:
/// - Orphan ends: slur end with no matching start (stack was empty)
/// - Orphan starts: slur start with no matching end (left on stack)
///
/// # Arguments
/// * `cells` - The cells in the line to analyze
/// * `line_index` - Line index in the document (for diagnostic location)
pub fn analyze_slurs(cells: &[Cell], line_index: usize) -> Vec<DiagnosticMark> {
    let mut marks = Vec::new();
    let mut stack: Vec<usize> = Vec::new(); // Stack of start cell indices

    for (idx, cell) in cells.iter().enumerate() {
        let overline = cell.codepoint.get_overline();

        match overline {
            SlurRole::Left => {
                // Slur start - push to stack
                stack.push(idx);
            }
            SlurRole::Right => {
                // Slur end - try to pop matching start
                if stack.pop().is_none() {
                    // No matching start - orphaned end
                    marks.push(DiagnosticMark::new(
                        line_index,
                        idx,
                        DiagnosticSeverity::Error,
                        "slur_orphan_end",
                        "Unmatched slur end (no opening marker)",
                    ));
                }
                // If pop succeeded, the slur is properly matched
            }
            SlurRole::Middle | SlurRole::None => {
                // Middle markers or no overline - no action needed
            }
        }
    }

    // Anything left on stack = orphaned starts (no matching end)
    for start_idx in stack {
        marks.push(DiagnosticMark::new(
            line_index,
            start_idx,
            DiagnosticSeverity::Error,
            "slur_orphan_begin",
            "Unmatched slur start (no closing marker)",
        ));
    }

    marks
}

/// Analyze slurs across all lines in a document
///
/// Note: Currently each line is analyzed independently.
/// Cross-line slurs are not supported (each line should be self-contained).
pub fn analyze_document_slurs(lines: &[crate::models::Line]) -> Vec<DiagnosticMark> {
    let mut all_marks = Vec::new();

    for (line_idx, line) in lines.iter().enumerate() {
        let line_marks = analyze_slurs(&line.cells, line_idx);
        all_marks.extend(line_marks);
    }

    all_marks
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::Cell;

    /// Helper to create a test cell with a specific slur role
    fn make_cell_with_slur_role(role: SlurRole) -> Cell {
        use crate::renderers::line_variants::set_overline_on_codepoint;

        // Start with ASCII '1' (a simple base character)
        let base_cp = '1' as u32;
        let cp = set_overline_on_codepoint(base_cp, role);

        Cell {
            codepoint: cp,
            ..Cell::default()
        }
    }

    #[test]
    fn test_matched_slur() {
        // ( 1 2 ) - properly matched
        let cells = vec![
            make_cell_with_slur_role(SlurRole::Left),
            make_cell_with_slur_role(SlurRole::Middle),
            make_cell_with_slur_role(SlurRole::Right),
        ];

        let marks = analyze_slurs(&cells, 0);
        assert!(marks.is_empty(), "Matched slur should produce no diagnostics");
    }

    #[test]
    fn test_orphan_end() {
        // 1 2 ) - end with no start
        let cells = vec![
            make_cell_with_slur_role(SlurRole::None),
            make_cell_with_slur_role(SlurRole::None),
            make_cell_with_slur_role(SlurRole::Right),
        ];

        let marks = analyze_slurs(&cells, 0);
        assert_eq!(marks.len(), 1);
        assert_eq!(marks[0].kind, "slur_orphan_end");
        assert_eq!(marks[0].col, 2);
    }

    #[test]
    fn test_orphan_start() {
        // ( 1 2 - start with no end
        let cells = vec![
            make_cell_with_slur_role(SlurRole::Left),
            make_cell_with_slur_role(SlurRole::Middle),
            make_cell_with_slur_role(SlurRole::None),
        ];

        let marks = analyze_slurs(&cells, 0);
        assert_eq!(marks.len(), 1);
        assert_eq!(marks[0].kind, "slur_orphan_begin");
        assert_eq!(marks[0].col, 0);
    }

    #[test]
    fn test_nested_slurs() {
        // ( ( ) ) - properly nested
        let cells = vec![
            make_cell_with_slur_role(SlurRole::Left),
            make_cell_with_slur_role(SlurRole::Left),
            make_cell_with_slur_role(SlurRole::Right),
            make_cell_with_slur_role(SlurRole::Right),
        ];

        let marks = analyze_slurs(&cells, 0);
        assert!(marks.is_empty(), "Properly nested slurs should produce no diagnostics");
    }

    #[test]
    fn test_multiple_orphans() {
        // ) ( - orphan end then orphan start
        let cells = vec![
            make_cell_with_slur_role(SlurRole::Right), // orphan end
            make_cell_with_slur_role(SlurRole::Left),  // orphan start
        ];

        let marks = analyze_slurs(&cells, 0);
        assert_eq!(marks.len(), 2);

        // Check we have both types
        let kinds: Vec<&str> = marks.iter().map(|m| m.kind.as_str()).collect();
        assert!(kinds.contains(&"slur_orphan_end"));
        assert!(kinds.contains(&"slur_orphan_begin"));
    }

    #[test]
    fn test_empty_cells() {
        let cells: Vec<Cell> = vec![];
        let marks = analyze_slurs(&cells, 0);
        assert!(marks.is_empty());
    }
}
