//! Line-level layout computation
//!
//! This module computes layout for a single line, including cell positioning,
//! lyrics assignment (with edge case handling), and tala positioning.

use crate::models::*;
use crate::parse::beats::BeatDeriver;
use super::lyrics::*;
use super::display_list::*;
use super::document::LayoutConfig;
use super::cell::CellStyleBuilder;

/// Computes layout for a single line
pub struct LayoutLineComputer<'a> {
    beat_deriver: &'a BeatDeriver,
}

impl<'a> LayoutLineComputer<'a> {
    /// Create a new line computer
    pub fn new(beat_deriver: &'a BeatDeriver) -> Self {
        Self { beat_deriver }
    }

    /// Compute layout for a single line
    pub fn compute_line_layout(
        &self,
        line: &Line,
        line_idx: usize,
        config: &LayoutConfig,
        cell_widths: &[f32],
        syllable_widths: &[f32],
        char_widths: &[f32],
    ) -> RenderLine {
        // Derive beats using WASM BeatDeriver
        let beats = self.beat_deriver.extract_implicit_beats(&line.cells);

        // Build role maps for CSS classes
        let cell_style_builder = CellStyleBuilder::new();
        let beat_roles = cell_style_builder.build_beat_role_map(&beats, &line.cells);
        let slur_roles = cell_style_builder.build_slur_role_map(&line.cells);

        // Distribute lyrics to cells
        let syllable_assignments = if !line.lyrics.is_empty() {
            distribute_lyrics(&line.lyrics, &line.cells)
        } else {
            Vec::new()
        };

        // Calculate effective widths (max of cell width and syllable width + padding)
        let effective_widths = self.calculate_effective_widths(
            cell_widths,
            &syllable_assignments,
            syllable_widths,
            config,
        );

        // Render cells with cumulative X positioning
        let mut cells = Vec::new();
        let mut cumulative_x = config.left_margin;
        let mut char_width_offset = 0;

        for (cell_idx, cell) in line.cells.iter().enumerate() {
            let render_cell = cell_style_builder.build_render_cell(
                cell,
                cell_idx,
                line_idx,
                cumulative_x,
                config,
                cell_widths,
                char_widths,
                &mut char_width_offset,
                &beat_roles,
                &slur_roles,
            );

            let effective_width = effective_widths.get(cell_idx).copied().unwrap_or(12.0);
            cumulative_x += effective_width;

            cells.push(render_cell);
        }

        // Position lyrics syllables (with edge case handling)
        let lyrics = self.position_lyrics(
            &syllable_assignments,
            &line.lyrics,
            &line.cells,
            &cells,
            &beats,
            config,
        );

        // Position tala characters
        let tala = self.position_tala(&line.tala, &line.cells, &cells, config);

        // Calculate line height based on content
        let has_beats = beats.iter().any(|b| b.end - b.start >= 1);
        let height = self.calculate_line_height(!line.lyrics.is_empty(), has_beats, config);

        RenderLine {
            line_index: line_idx,
            cells,
            label: if line.label.is_empty() {
                None
            } else {
                Some(line.label.clone())
            },
            lyrics,
            tala,
            height,
        }
    }

    /// Calculate effective widths for cells, considering lyrics syllable widths
    fn calculate_effective_widths(
        &self,
        cell_widths: &[f32],
        syllable_assignments: &[SyllableAssignment],
        syllable_widths: &[f32],
        config: &LayoutConfig,
    ) -> Vec<f32> {
        let mut effective = cell_widths.to_vec();

        // Ensure we have enough effective widths
        if effective.is_empty() {
            return effective;
        }

        // For each syllable assignment, ensure the cell is wide enough
        for (syll_idx, assignment) in syllable_assignments.iter().enumerate() {
            if let Some(syll_width) = syllable_widths.get(syll_idx) {
                let required = syll_width + config.min_syllable_padding;
                if let Some(eff) = effective.get_mut(assignment.cell_index) {
                    *eff = eff.max(required);
                }
            }
        }

        effective
    }

    /// Position lyrics syllables with edge case handling
    ///
    /// Edge cases:
    /// - No pitched elements: assign all lyrics to first cell position
    /// - Unassigned syllables: position to the right with metadata
    /// - Empty line: position at default first cell x
    fn position_lyrics(
        &self,
        assignments: &[SyllableAssignment],
        lyrics_text: &str,
        original_cells: &[Cell],
        render_cells: &[RenderCell],
        beats: &[BeatSpan],
        config: &LayoutConfig,
    ) -> Vec<RenderLyric> {
        // Parse all syllables to find unassigned ones
        let all_syllables = parse_lyrics(lyrics_text);
        let mut result = Vec::new();

        // Adaptive Y positioning based on beat presence
        let has_beats = beats.iter().any(|b| b.end - b.start >= 1);
        let lyrics_y = if has_beats { 65.0 } else { 57.0 };

        // Check if line has any pitched elements
        let has_pitched_elements = original_cells.iter().any(|c| matches!(c.kind, ElementKind::PitchedElement));

        // Add assigned syllables (normal case)
        for assignment in assignments {
            if let Some(cell) = render_cells.get(assignment.cell_index) {
                result.push(RenderLyric {
                    text: assignment.syllable.clone(),
                    x: cell.x + cell.w / 2.0, // Center under cell
                    y: lyrics_y,
                    assigned: true,
                });
            }
        }

        // Handle unassigned syllables
        if assignments.len() < all_syllables.len() {
            let unassigned_syllables: Vec<String> = all_syllables[assignments.len()..].to_vec();

            if !unassigned_syllables.is_empty() {
                if !has_pitched_elements {
                    // No pitched elements: assign all unassigned to first cell position
                    let first_x = if let Some(cell) = render_cells.first() {
                        cell.x + cell.w / 2.0
                    } else {
                        config.left_margin + 30.0 // Default position if no cells
                    };

                    for syllable in unassigned_syllables {
                        result.push(RenderLyric {
                            text: syllable,
                            x: first_x,
                            y: lyrics_y,
                            assigned: false,
                        });
                    }
                } else {
                    // Has pitched elements: position unassigned to the right
                    let last_x = if let Some(cell) = render_cells.last() {
                        cell.x + cell.w + 20.0 // 20px padding after last cell
                    } else {
                        config.left_margin + 30.0
                    };

                    for syllable in unassigned_syllables {
                        result.push(RenderLyric {
                            text: syllable,
                            x: last_x,
                            y: lyrics_y,
                            assigned: false,
                        });
                    }
                }
            }
        }

        result
    }

    /// Position tala characters above barlines
    fn position_tala(
        &self,
        tala: &str,
        original_cells: &[Cell],
        render_cells: &[RenderCell],
        _config: &LayoutConfig,
    ) -> Vec<RenderTala> {
        if tala.is_empty() {
            return Vec::new();
        }

        // Find barline positions
        let barline_positions: Vec<f32> = original_cells
            .iter()
            .enumerate()
            .filter_map(|(idx, cell)| {
                if matches!(cell.kind, ElementKind::Barline) {
                    render_cells.get(idx).map(|rc| rc.x)
                } else {
                    None
                }
            })
            .collect();

        // Distribute tala characters to barlines
        tala.chars()
            .enumerate()
            .take(barline_positions.len())
            .map(|(idx, ch)| RenderTala {
                text: ch.to_string(),
                x: barline_positions[idx],
                y: 8.0, // TALA_VERTICAL_OFFSET constant from JS
            })
            .collect()
    }

    /// Calculate line height based on content
    fn calculate_line_height(
        &self,
        has_lyrics: bool,
        has_beats: bool,
        _config: &LayoutConfig,
    ) -> f32 {
        if has_lyrics {
            let lyrics_y = if has_beats { 65.0 } else { 57.0 };
            let lyrics_font_size = 14.0; // text-sm
            let lyrics_bottom_padding = 8.0;
            lyrics_y + lyrics_font_size + lyrics_bottom_padding
        } else {
            80.0 // LINE_CONTAINER_HEIGHT from JS constants
        }
    }
}
