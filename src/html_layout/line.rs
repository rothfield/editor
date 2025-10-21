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
        line_y_offset: f32,
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
                line_y_offset,
                &effective_widths,  // Use effective widths (expanded for syllables)
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
            line_y_offset,
        );

        // Position tala characters
        let tala = self.position_tala(&line.tala, &line.cells, &cells, config, line_y_offset);

        // Calculate line height based on content
        let has_beats = beats.iter().any(|b| b.end - b.start >= 1);
        let has_octave_dots = line.cells.iter().any(|c| c.octave != 0);
        let height = self.calculate_line_height(!line.lyrics.is_empty(), has_beats, has_octave_dots, config);

        // Compute slur arcs from slur indicators in cells
        let slurs = self.compute_slur_arcs(&line.cells, &cells, config);

        // Compute beat loop arcs from beat indicators
        let beat_loops = self.compute_beat_loop_arcs(&beats, &cells, config);

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
            slurs,
            beat_loops,
        }
    }

    /// Compute slur arcs from slur indicators in cells
    fn compute_slur_arcs(
        &self,
        cells: &[Cell],
        render_cells: &[RenderCell],
        config: &LayoutConfig,
    ) -> Vec<RenderArc> {
        let mut arcs = Vec::new();
        let mut slur_start: Option<(usize, &RenderCell)> = None;

        for (idx, cell) in cells.iter().enumerate() {
            if cell.slur_indicator.is_start() {
                slur_start = Some((idx, &render_cells[idx]));
            } else if cell.slur_indicator.is_end() {
                if let Some((start_idx, start_cell)) = slur_start {
                    let end_cell = &render_cells[idx];

                    // Create bezier curve for slur
                    let arc = self.create_bezier_arc(
                        start_idx,
                        idx,
                        start_cell,
                        end_cell,
                        "up",
                        "#4a5568",
                        config,
                    );
                    arcs.push(arc);
                    slur_start = None;
                }
            }
        }

        arcs
    }

    /// Compute beat loop arcs from beat spans
    fn compute_beat_loop_arcs(
        &self,
        beats: &[BeatSpan],
        render_cells: &[RenderCell],
        config: &LayoutConfig,
    ) -> Vec<RenderArc> {
        let mut arcs = Vec::new();

        for beat in beats {
            if beat.end > beat.start {
                // Only create visible beat loops for multi-cell beats
                let start_cell = &render_cells[beat.start];
                let end_cell = &render_cells[beat.end];

                let arc = self.create_bezier_arc(
                    beat.start,
                    beat.end,
                    start_cell,
                    end_cell,
                    "down",
                    "#8b5cf6",
                    config,
                );
                arcs.push(arc);
            }
        }

        arcs
    }

    /// Create a bezier arc with control points computed for musical aesthetics
    fn create_bezier_arc(
        &self,
        start_idx: usize,
        end_idx: usize,
        start_cell: &RenderCell,
        end_cell: &RenderCell,
        direction: &str,
        color: &str,
        config: &LayoutConfig,
    ) -> RenderArc {
        // Anchor points at cell centers
        let is_downward = direction == "down";

        let start_x = start_cell.x + (start_cell.w / 2.0);
        let start_y = if is_downward {
            start_cell.y + start_cell.h
        } else {
            start_cell.y
        };

        let end_x = end_cell.x + (end_cell.w / 2.0);
        let end_y = if is_downward {
            end_cell.y + end_cell.h
        } else {
            end_cell.y
        };

        // Calculate horizontal span
        let span = (end_x - start_x).abs();

        // Calculate arch height based on arc type
        let arch_height = if is_downward {
            // Beat loops: shallow arcs
            if span <= 8.0 {
                3.0
            } else {
                3.0 + (span - 8.0) * 0.05
            }
            .min(8.0)
        } else {
            // Slurs: proportional to span
            let base_height = (span * 0.25).clamp(6.0, 28.0);
            if span > 300.0 {
                base_height * 0.7 // Soften long arcs
            } else {
                base_height
            }
        };

        // Asymmetric curve control point (55-60% from start)
        let control_point_ratio = 0.57;

        let cp1_x = start_x + span * control_point_ratio / 2.0;
        let cp1_y = if is_downward {
            start_y + arch_height
        } else {
            start_y - arch_height
        };

        let cp2_x = end_x - span * (1.0 - control_point_ratio) / 2.0;
        let cp2_y = if is_downward {
            end_y + arch_height
        } else {
            end_y - arch_height
        };

        RenderArc {
            id: format!(
                "arc-{}-{}-{}",
                if is_downward { "beat" } else { "slur" },
                start_idx,
                end_idx
            ),
            start_x,
            start_y,
            end_x,
            end_y,
            cp1_x,
            cp1_y,
            cp2_x,
            cp2_y,
            color: color.to_string(),
            direction: direction.to_string(),
        }
    }

    /// Calculate effective widths for cells, using syllable widths
    ///
    /// Each cell's effective width is the maximum of:
    /// - Original cell width
    /// - Its assigned syllable width + padding
    ///
    /// This ensures syllables fit within their cells with no squishing.
    fn calculate_effective_widths(
        &self,
        cell_widths: &[f32],
        syllable_assignments: &[SyllableAssignment],
        syllable_widths: &[f32],
        _config: &LayoutConfig,
    ) -> Vec<f32> {
        let mut effective = cell_widths.to_vec();

        // Ensure we have enough effective widths
        if effective.is_empty() || syllable_assignments.is_empty() {
            return effective;
        }

        // For each syllable assignment, ensure cell is at least as wide as the syllable
        // Skip whitespace-only syllables (they don't affect cell width)
        for (syll_idx, assignment) in syllable_assignments.iter().enumerate() {
            if let Some(syll_width) = syllable_widths.get(syll_idx) {
                // Skip if syllable is only whitespace
                if assignment.syllable.trim().is_empty() {
                    continue;
                }
                if let Some(eff) = effective.get_mut(assignment.cell_index) {
                    *eff = eff.max(*syll_width);
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
        line_y_offset: f32,
    ) -> Vec<RenderLyric> {
        let mut result = Vec::new();
        let lyrics_trimmed = lyrics_text.trim();

        if lyrics_trimmed.is_empty() {
            return result;
        }

        // Adaptive Y positioning: below beat loops, octave dots, or cell
        const BEAT_LOOP_GAP: f32 = 2.0;
        const BEAT_LOOP_HEIGHT: f32 = 5.0;
        const OCTAVE_DOT_OFFSET_EM: f32 = 0.35;
        const LYRICS_GAP: f32 = 4.0;

        let cell_bottom = config.cell_y_offset + config.cell_height;
        let has_beats = beats.iter().any(|b| b.end - b.start >= 1);
        let has_octave_dots = original_cells.iter().any(|c| c.octave != 0);

        // Add line_y_offset to calculate absolute Y position for the document
        let lyrics_y = line_y_offset + if has_beats {
            cell_bottom + BEAT_LOOP_GAP + BEAT_LOOP_HEIGHT + LYRICS_GAP
        } else if has_octave_dots {
            cell_bottom + (OCTAVE_DOT_OFFSET_EM * config.font_size) + LYRICS_GAP
        } else {
            cell_bottom + LYRICS_GAP
        };

        // Check if line has any pitched elements
        let has_pitched_elements = original_cells.iter().any(|c| matches!(c.kind, ElementKind::PitchedElement));

        // Special case: 0 pitched elements - just render entire lyrics as-is
        if !has_pitched_elements {
            result.push(RenderLyric {
                text: lyrics_trimmed.to_string(),
                x: config.left_margin,
                y: lyrics_y,
                assigned: true,
            });
            return result;
        }

        // Render all assignments (which already have spaces included)
        for assignment in assignments {
            let lyric_x = if let Some(cell) = render_cells.get(assignment.cell_index) {
                cell.x // Flush left with cell
            } else {
                config.left_margin
            };

            result.push(RenderLyric {
                text: assignment.syllable.clone(),
                x: lyric_x,
                y: lyrics_y,
                assigned: true,
            });
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
        line_y_offset: f32,
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
        // Add line_y_offset to calculate absolute Y position for the document
        tala.chars()
            .enumerate()
            .take(barline_positions.len())
            .map(|(idx, ch)| RenderTala {
                text: ch.to_string(),
                x: barline_positions[idx],
                y: line_y_offset + 8.0, // TALA_VERTICAL_OFFSET constant from JS
            })
            .collect()
    }

    /// Calculate line height based on content
    fn calculate_line_height(
        &self,
        has_lyrics: bool,
        has_beats: bool,
        has_octave_dots: bool,
        config: &LayoutConfig,
    ) -> f32 {
        if has_lyrics {
            // Reuse same calculation as position_lyrics
            const BEAT_LOOP_GAP: f32 = 2.0;
            const BEAT_LOOP_HEIGHT: f32 = 5.0;
            const OCTAVE_DOT_OFFSET_EM: f32 = 0.35;
            const LYRICS_GAP: f32 = 4.0;

            let cell_bottom = config.cell_y_offset + config.cell_height;
            let lyrics_y = if has_beats {
                cell_bottom + BEAT_LOOP_GAP + BEAT_LOOP_HEIGHT + LYRICS_GAP
            } else if has_octave_dots {
                cell_bottom + (OCTAVE_DOT_OFFSET_EM * config.font_size) + LYRICS_GAP
            } else {
                cell_bottom + LYRICS_GAP
            };

            let lyrics_font_size = config.font_size * 0.5;
            let lyrics_bottom_padding = 2.0 * config.font_size;
            lyrics_y + lyrics_font_size + lyrics_bottom_padding
        } else {
            80.0 // LINE_CONTAINER_HEIGHT from JS constants
        }
    }
}
