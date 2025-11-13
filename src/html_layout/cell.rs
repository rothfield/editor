//! Cell-level layout and styling
//!
//! This module handles CSS class generation, data attribute building,
//! and effective width calculations for individual cells.

use crate::models::*;
use crate::models::pitch_code::AccidentalType;
use super::display_list::*;
use super::document::LayoutConfig;
use crate::renderers::{get_glyph_codepoint, get_accidental_glyph_codepoint, get_combined_accidental_octave_glyph};
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
        ornament_roles: &HashMap<usize, String>,
    ) -> RenderCell {
        // Build CSS classes
        let mut classes = vec!["char-cell".to_string()];
        classes.push(format!("kind-{}", self.element_kind_to_css(cell.kind)));

        // State classes
        if cell.flags & 0x02 != 0 {
            classes.push("selected".to_string());
        }
        if cell.flags & 0x04 != 0 {
            classes.push("focused".to_string());
        }
        if cell.flags & 0x01 != 0 {
            classes.push("head-marker".to_string());
        }

        // Beat/slur/ornament role classes
        if let Some(role) = beat_roles.get(&cell_idx) {
            classes.push(role.clone());
        }
        if let Some(role) = slur_roles.get(&cell_idx) {
            classes.push(role.clone());
        }
        if let Some(role) = ornament_roles.get(&cell_idx) {
            classes.push(role.clone());
        }

        // Build data attributes
        let mut dataset = HashMap::new();
        dataset.insert("lineIndex".to_string(), line_idx.to_string());
        dataset.insert("cellIndex".to_string(), cell_idx.to_string());
        dataset.insert("column".to_string(), cell.col.to_string());

        // Pitch system class
        if let Some(pitch_system) = cell.pitch_system {
            classes.push(format!("pitch-system-{}", self.pitch_system_to_css(pitch_system)));
        }

        // No continuation cells in new architecture - multi-char glyphs rendered as single cell
        // Composite glyphs (e.g., 1#, 2♭) are stored directly in cell.char field

        // Get actual cell width (for cursor positioning)
        // Whitespace cells need a minimum width so cursor advances
        let actual_cell_width = cell_widths.get(cell_idx).copied().unwrap_or(12.0);
        let actual_cell_width = if cell.kind == ElementKind::Whitespace {
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

        // Track character count for char_widths array offset (legacy compatibility)
        let char_count = cell.char.chars().count();
        *char_width_offset += char_count;

        // cursor_right is at the right edge of the cell
        let cursor_right = cumulative_x + actual_cell_width;

        // Calculate Y position for cells (with line offset for multi-line documents)
        let y = line_y_offset + config.cell_y_offset;

        // Get barline type from ElementKind for SMuFL rendering (CSS class name)
        let barline_type = match cell.kind {
            ElementKind::SingleBarline => "single-bar".to_string(),
            ElementKind::RepeatLeftBarline => "repeat-left-start".to_string(),
            ElementKind::RepeatRightBarline => "repeat-right-start".to_string(),
            ElementKind::DoubleBarline => "double-bar-start".to_string(),
            _ => String::new(),
        };

        // Character rendering strategy: render composite glyph from pitch_code
        // For pitched elements with accidentals, compute the composite glyph codepoint
        // For barlines, render the multi-char string (||, |:, :|)
        let char = if cell.kind == ElementKind::PitchedElement && !cell.char.is_empty() {
            if let Some(pitch_code) = cell.pitch_code {
                // Extract base character (first char of cell.char, e.g., '1' from "1#")
                let base_char = cell.char.chars().next().unwrap_or(' ');

                // Get accidental type
                let acc_type = pitch_code.accidental_type();
                let acc_type_num = match acc_type {
                    AccidentalType::Sharp => 1,
                    AccidentalType::Flat => 2,
                    AccidentalType::DoubleSharp => 3,
                    AccidentalType::DoubleFlat => 4,
                    _ => 0,
                };

                // Compute composite glyph based on accidental AND octave
                if acc_type != AccidentalType::None && cell.octave != 0 {
                    // BOTH accidental and octave: use combined glyph (e.g., "1# with dot above")
                    let composite_glyph = get_combined_accidental_octave_glyph(base_char, acc_type_num, cell.octave);
                    composite_glyph.to_string()
                } else if acc_type != AccidentalType::None {
                    // Only accidental, no octave: use accidental glyph (e.g., "1#")
                    let composite_glyph = get_accidental_glyph_codepoint(base_char, acc_type_num);
                    composite_glyph.to_string()
                } else if cell.octave != 0 {
                    // Only octave, no accidental: use octave glyph (e.g., "1 with dot above")
                    get_glyph_codepoint(base_char, cell.octave).to_string()
                } else {
                    // No accidental, no octave - just base char
                    base_char.to_string()
                }
            } else {
                cell.char.clone()
            }
        } else {
            cell.char.clone()
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
            match cell.slur_indicator {
                SlurIndicator::SlurStart => {
                    slur_start = Some(idx);
                }
                SlurIndicator::SlurEnd => {
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
                SlurIndicator::None => {}
            }
        }

        map
    }

    /// Build map of cell index to ornament role class
    /// Deprecated: ornament indicators have been removed
    pub fn build_ornament_role_map(&self, _cells: &[Cell]) -> HashMap<usize, String> {
        // With the new system, ornaments are stored inline with cells, not as separate indicator cells
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
