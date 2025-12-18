//! Cell-level layout and styling
//!
//! This module handles CSS class generation, data attribute building,
//! and effective width calculations for individual cells.

use crate::models::*;
use super::display_list::*;
use super::document::LayoutConfig;
// Font utils no longer needed here - Cell::display_char() handles glyph derivation
use std::collections::HashMap;

/// Builder for cell styling and layout
pub struct CellStyleBuilder;

impl CellStyleBuilder {
    /// Create a new cell style builder
    pub fn new() -> Self {
        Self
    }

    /// Build a complete RenderCell with all styling and positioning
    pub fn build_render_cell(
        &self,
        cell: &Cell,
        cell_idx: usize,
        line_idx: usize,
        cumulative_x: f32,
        config: &LayoutConfig,
        line_y_offset: f32,
        cell_widths: &[f32],
        _char_widths: &[f32],
        char_width_offset: &mut usize,
        beat_roles: &HashMap<usize, String>,
        slur_roles: &HashMap<usize, String>,
        superscript_roles: &HashMap<usize, String>,
        selection: Option<&crate::models::notation::Selection>,
    ) -> RenderCell {
        // Build CSS classes
        let mut classes = vec!["char-cell".to_string()];
        classes.push(format!("kind-{}", self.element_kind_to_css(cell.get_kind())));

        // State classes - check both cell flags AND selection manager
        let mut is_selected = cell.flags & 0x02 != 0;

        // If not selected by flags, check selection manager
        if !is_selected {
            if let Some(sel) = selection {
                // Check if this cell is within the selection range
                let cell_line = line_idx;
                let cell_col = cell_idx; // Use cell_idx (array position)

                // Selection range is [start, end) - exclusive of end
                let in_range = cell_line >= sel.start().line && cell_line <= sel.end().line;
                if in_range {
                    is_selected = if sel.start().line == sel.end().line {
                        // Single-line selection
                        cell_col >= sel.start().col && cell_col < sel.end().col
                    } else if cell_line == sel.start().line {
                        // First line of multi-line selection
                        cell_col >= sel.start().col
                    } else if cell_line == sel.end().line {
                        // Last line of multi-line selection
                        cell_col < sel.end().col
                    } else {
                        // Middle line of multi-line selection
                        true
                    };
                }
            }
        }

        if is_selected {
            classes.push("selected".to_string());
        }
        if cell.flags & 0x04 != 0 {
            classes.push("focused".to_string());
        }
        if cell.flags & 0x01 != 0 {
            classes.push("head-marker".to_string());
        }

        // Beat/slur/superscript role classes
        if let Some(role) = beat_roles.get(&cell_idx) {
            classes.push(role.clone());
        }
        if let Some(role) = slur_roles.get(&cell_idx) {
            classes.push(role.clone());
        }
        if let Some(role) = superscript_roles.get(&cell_idx) {
            classes.push(role.clone());
        }

        // Build data attributes
        let mut dataset = HashMap::new();
        dataset.insert("lineIndex".to_string(), line_idx.to_string());
        dataset.insert("cellIndex".to_string(), cell_idx.to_string());
        dataset.insert("column".to_string(), cell_idx.to_string());

        // Pitch system class
        if let Some(pitch_system) = cell.get_pitch_system() {
            classes.push(format!("pitch-system-{}", self.pitch_system_to_css(pitch_system)));
        }

        // No continuation cells in new architecture - multi-char glyphs rendered as single cell
        // Composite glyphs (e.g., 1#, 2♭) are stored directly in cell.char field

        // Get actual cell width (for cursor positioning)
        // Whitespace cells need a minimum width so cursor advances
        let actual_cell_width = cell_widths.get(cell_idx).copied().unwrap_or(12.0);
        let actual_cell_width = if cell.get_kind() == ElementKind::Whitespace {
            actual_cell_width.max(8.0) // Whitespace minimum 8px
        } else {
            actual_cell_width
        };

        // NEW: One cell = one glyph (NotationFont composite glyphs)
        // char_positions only needs [cursor_left, cursor_right] for each cell
        let char_positions = vec![
            cumulative_x,                    // cursor_left (before glyph)
            cumulative_x + actual_cell_width // cursor_right (after glyph)
        ];

        // Character rendering: use the stored character (already populated during cell creation)
        let char = cell.display_char();

        // Track character count for char_widths array offset (legacy compatibility)
        let char_count = char.chars().count();
        *char_width_offset += char_count;

        // cursor_right is at the right edge of the cell
        let cursor_right = cumulative_x + actual_cell_width;

        // Calculate Y position for cells (with line offset for multi-line documents)
        let y = line_y_offset + config.cell_y_offset;

        // Get barline type from ElementKind for SMuFL rendering (CSS class name)
        let barline_type = match cell.get_kind() {
            ElementKind::SingleBarline => "single-bar".to_string(),
            ElementKind::RepeatLeftBarline => "repeat-left-start".to_string(),
            ElementKind::RepeatRightBarline => "repeat-right-start".to_string(),
            ElementKind::DoubleBarline => "double-bar-start".to_string(),
            _ => String::new(),
        };


        RenderCell {
            char,
            x: cumulative_x,
            y,
            w: actual_cell_width,
            h: config.cell_height,
            classes,
            dataset,
            cursor_left: cumulative_x,
            cursor_right,
            char_positions,
            barline_type,
        }
    }

    /// Build map of cell index to beat role class
    pub fn build_beat_role_map(&self, beats: &[BeatSpan], _cells: &[Cell]) -> HashMap<usize, String> {
        let mut map = HashMap::new();

        for beat in beats {
            // Count cells in this beat
            let cell_count = (beat.start..=beat.end).count();

            // Only draw loops for beats with 2+ cells
            if cell_count >= 2 {
                let first_idx = beat.start;
                let last_idx = beat.end;

                // Mark all cells in the beat span
                for i in first_idx..=last_idx {
                    let role = if i == first_idx {
                        "beat-loop-first"
                    } else if i == last_idx {
                        "beat-loop-last"
                    } else {
                        "beat-loop-middle"
                    };
                    map.insert(i, role.to_string());
                }
            }
        }

        map
    }

    /// Build map of cell index to slur role class
    pub fn build_slur_role_map(&self, cells: &[Cell]) -> HashMap<usize, String> {
        let mut map = HashMap::new();
        let mut slur_start: Option<usize> = None;

        for (idx, cell) in cells.iter().enumerate() {
            if cell.is_slur_start() {
                slur_start = Some(idx);
            } else if cell.is_slur_end() {
                if let Some(start) = slur_start {
                    // Mark all cells in the slur span
                    for i in start..=idx {
                        let role = if i == start {
                            "slur-first"
                        } else if i == idx {
                            "slur-last"
                        } else {
                            "slur-middle"
                        };
                        map.insert(i, role.to_string());
                    }
                    slur_start = None;
                }
            }
        }

        map
    }

    /// Build map of cell index to superscript role class
    /// Deprecated: superscript indicators have been removed
    pub fn build_superscript_role_map(&self, _cells: &[Cell]) -> HashMap<usize, String> {
        // With the new system, superscripts are stored inline with cells, not as separate indicator cells
        HashMap::new()
    }

    /// Convert ElementKind to CSS class name
    pub fn element_kind_to_css(&self, kind: ElementKind) -> &str {
        match kind {
            ElementKind::PitchedElement => "pitched",
            ElementKind::UnpitchedElement => "unpitched",
            ElementKind::UpperAnnotation => "upper-annotation",
            ElementKind::LowerAnnotation => "lower-annotation",
            ElementKind::BreathMark => "breath",
            ElementKind::SingleBarline
            | ElementKind::RepeatLeftBarline
            | ElementKind::RepeatRightBarline
            | ElementKind::DoubleBarline => "barline",
            ElementKind::Whitespace => "whitespace",
            ElementKind::Nbsp => "nbsp",
            ElementKind::Text => "text",
            ElementKind::Symbol => "symbol",
            ElementKind::Unknown => "unknown",
        }
    }

    /// Convert PitchSystem to CSS class name
    pub fn pitch_system_to_css(&self, system: PitchSystem) -> &str {
        match system {
            PitchSystem::Number => "number",
            PitchSystem::Western => "western",
            PitchSystem::Sargam => "sargam",
            PitchSystem::Bhatkhande => "bhatkhande",
            PitchSystem::Tabla => "tabla",
            PitchSystem::Unknown => "unknown",
        }
    }
}
