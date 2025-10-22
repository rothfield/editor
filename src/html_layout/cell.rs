//! Cell-level layout and styling
//!
//! This module handles CSS class generation, data attribute building,
//! and effective width calculations for individual cells.

use crate::models::*;
use crate::models::pitch_code::AccidentalType;
use super::display_list::*;
use super::document::LayoutConfig;
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
        char_widths: &[f32],
        char_width_offset: &mut usize,
        beat_roles: &HashMap<usize, String>,
        slur_roles: &HashMap<usize, String>,
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

        // Beat/slur role classes
        if let Some(role) = beat_roles.get(&cell_idx) {
            classes.push(role.clone());
        }
        if let Some(role) = slur_roles.get(&cell_idx) {
            classes.push(role.clone());
        }

        // Pitch system class
        if let Some(pitch_system) = cell.pitch_system {
            classes.push(format!("pitch-system-{}", self.pitch_system_to_css(pitch_system)));
        }

        // Accidental rendering - attach glyph to the note cell (non-continuation only)
        // For multi-char pitches like "1#", "1##", "c#", etc., the accidental class
        // is applied to the note cell, and the continuation cells are hidden
        if !cell.continuation && cell.kind == ElementKind::PitchedElement {
            if let Some(pitch_code) = cell.pitch_code {
                match pitch_code.accidental_type() {
                    AccidentalType::Sharp => classes.push("pitch-accidental-sharp".to_string()),
                    AccidentalType::Flat => classes.push("pitch-accidental-flat".to_string()),
                    AccidentalType::DoubleSharp => classes.push("pitch-accidental-double-sharp".to_string()),
                    AccidentalType::DoubleFlat => classes.push("pitch-accidental-double-flat".to_string()),
                    AccidentalType::None => {},
                }
            }
        }

        // Hide continuation cells of pitched elements (they're part of accidentals)
        if cell.continuation && cell.kind == ElementKind::PitchedElement {
            classes.push("pitch-continuation".to_string());
        }

        // Build data attributes
        let mut dataset = HashMap::new();
        dataset.insert("lineIndex".to_string(), line_idx.to_string());
        dataset.insert("cellIndex".to_string(), cell_idx.to_string());
        dataset.insert("column".to_string(), cell.col.to_string());
        dataset.insert("octave".to_string(), cell.octave.to_string());
        dataset.insert("glyphLength".to_string(), cell.char.chars().count().to_string());
        dataset.insert("continuation".to_string(), cell.continuation.to_string());

        // Get actual cell width (for cursor positioning)
        let actual_cell_width = cell_widths.get(cell_idx).copied().unwrap_or(12.0);

        // Calculate character positions for this cell
        let char_count = cell.char.chars().count();
        let mut char_positions = Vec::with_capacity(char_count + 1);
        char_positions.push(cumulative_x); // Position before first character

        // Add position after each character
        let mut char_x = cumulative_x;
        for i in 0..char_count {
            if let Some(&width) = char_widths.get(*char_width_offset + i) {
                char_x += width;
            } else {
                // Fallback to proportional width
                char_x += actual_cell_width / char_count as f32;
            }
            char_positions.push(char_x);
        }

        *char_width_offset += char_count;

        // cursor_right should be at the position after the last character
        let cursor_right = *char_positions.last().unwrap_or(&(cumulative_x + actual_cell_width));

        // Calculate Y position for cells (with line offset for multi-line documents)
        let y = line_y_offset + config.cell_y_offset;

        // Get barline type from ElementKind for SMuFL rendering (CSS class name)
        let barline_type = match cell.kind {
            ElementKind::SingleBarline => "single-bar".to_string(),
            ElementKind::RepeatLeftBarline => {
                if !cell.continuation {
                    "repeat-left-start".to_string()
                } else {
                    String::new()
                }
            }
            ElementKind::RepeatRightBarline => {
                if !cell.continuation {
                    "repeat-right-start".to_string()
                } else {
                    String::new()
                }
            }
            ElementKind::DoubleBarline => {
                if !cell.continuation {
                    "double-bar-start".to_string()
                } else {
                    String::new()
                }
            }
            _ => String::new(),
        };

        RenderCell {
            char: cell.char.clone(),
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

    /// Build map of cell index to beat role class (includes both pitched and continuation cells)
    pub fn build_beat_role_map(&self, beats: &[BeatSpan], cells: &[Cell]) -> HashMap<usize, String> {
        let mut map = HashMap::new();

        for beat in beats {
            // Collect non-continuation cell indices in this beat
            let non_continuation_indices: Vec<usize> = (beat.start..=beat.end)
                .filter(|&i| {
                    cells.get(i).map(|c| !c.continuation).unwrap_or(false)
                })
                .collect();

            // Only draw loops for beats with 2+ non-continuation cells
            if non_continuation_indices.len() >= 2 {
                // Multi-element beat - include ALL cells (continuation and non-continuation)
                let first_idx = beat.start;
                let last_idx = beat.end;

                // Mark ALL cells in the beat span (including continuations)
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
