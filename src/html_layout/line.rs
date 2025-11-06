//! Line-level layout computation
//!
//! This module computes layout for a single line, including cell positioning,
//! lyrics assignment (with edge case handling), and tala positioning.

use std::collections::HashMap;
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
        ornament_edit_mode: bool,
    ) -> RenderLine {
        // Derive beats using WASM BeatDeriver
        let beats = self.beat_deriver.extract_implicit_beats(&line.cells);

        // Build role maps for CSS classes
        let cell_style_builder = CellStyleBuilder::new();
        let beat_roles = cell_style_builder.build_beat_role_map(&beats, &line.cells);
        let slur_roles = cell_style_builder.build_slur_role_map(&line.cells);
        let ornament_roles = cell_style_builder.build_ornament_role_map(&line.cells);

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

        // Build ornament anchor map (ornament_index -> anchor_cell_index)
        // Only needed when ornament edit mode is OFF
        let ornament_anchors = if !ornament_edit_mode {
            self.find_ornament_anchors(&line.cells, &ornament_roles)
        } else {
            HashMap::new()
        };

        // Extract ornaments from indicators and attach to anchor cells when mode is OFF
        let (working_cells, cell_index_map) = if !ornament_edit_mode {
            self.extract_ornaments_from_indicators(&line.cells)
        } else {
            // Just copy cells when mode is ON, with identity mapping
            let cells = line.cells.to_vec();
            let map: Vec<usize> = (0..cells.len()).collect();
            (cells, map)
        };

        // Render cells with cumulative X positioning
        let mut cells = Vec::new();
        let mut cumulative_x = config.left_margin;
        let mut char_width_offset = 0;

        // Calculate X positions and create render cells
        // Note: When ornament_edit_mode is OFF, ornaments are extracted and stored in cell.ornaments
        // working_cells contains the modified cells with ornaments attached
        // cell_index_map maps working_cells indices to original line.cells indices
        let mut last_original_idx = 0;
        for (working_idx, cell) in working_cells.iter().enumerate() {
            // All cells use normal inline positioning
            let cell_x = cumulative_x;

            // Use original cell index from mapping for dataset
            let original_cell_idx = cell_index_map[working_idx];

            // Skip character widths for any cells we skipped (ornaments that were extracted)
            // This ensures char_width_offset stays in sync with the actual characters we're rendering
            for skipped_idx in last_original_idx..original_cell_idx {
                let skipped_char_count = line.cells[skipped_idx].char.chars().count();
                char_width_offset += skipped_char_count;
            }
            last_original_idx = original_cell_idx + 1;

            let render_cell = cell_style_builder.build_render_cell(
                cell,
                original_cell_idx,  // Use original index so JavaScript can map back correctly
                line_idx,
                cell_x,
                config,
                line_y_offset,
                &effective_widths,  // Use effective widths (expanded for syllables)
                char_widths,
                &mut char_width_offset,
                &beat_roles,
                &slur_roles,
                &ornament_roles,
            );

            // Advance X position for next cell
            // Use effective_widths which accounts for syllable padding
            // This ensures X positions match the actual rendered cell widths
            let effective_width = effective_widths.get(original_cell_idx).copied().unwrap_or(12.0);
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

        // Position octave dots
        let octave_dots = self.position_octave_dots(&line.cells, &cells, config);

        // Compute slur arcs from slur indicators in cells
        let slurs = self.compute_slur_arcs(&line.cells, &cells, &ornament_anchors, config);

        // Calculate line height based on content
        let has_beats = beats.iter().any(|b| b.end - b.start >= 1);
        let has_slurs = slurs.len() > 0;  // Check if any slurs were computed
        let has_octave_dots = line.cells.iter().any(|c| c.octave != 0);
        let height = self.calculate_line_height(!line.lyrics.is_empty(), has_beats, has_slurs, has_octave_dots, config);

        // Compute beat loop arcs from beat indicators
        let beat_loops = self.compute_beat_loop_arcs(&beats, &cells, &line.cells, config);

        // Compute ornament arcs (shallow arcs connecting parent note to ornaments)
        // Only when ornament edit mode is OFF
        let ornament_arcs = if !ornament_edit_mode {
            self.compute_ornament_arcs_from_cells(
                &line.cells,
                &cells,
                &effective_widths,
                config,
                line_y_offset,
            )
        } else {
            Vec::new()
        };

        // Position ornaments separately when edit mode is OFF
        let ornaments = if !ornament_edit_mode {
            self.position_ornaments_from_cells(
                &working_cells,
                &cells,
                &effective_widths,
                config,
                line_y_offset,
            )
        } else {
            Vec::new()
        };

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
            ornament_arcs,
            ornaments,
            octave_dots,
        }
    }

    /// Compute slur arcs from slur indicators in cells
    /// When ornament edit mode is ON, slurs on ornament cells redirect to anchor note
    /// When ornament edit mode is OFF, ornament cells don't exist in the vector
    fn compute_slur_arcs(
        &self,
        cells: &[Cell],
        render_cells: &[RenderCell],
        ornament_anchors: &HashMap<usize, usize>,
        config: &LayoutConfig,
    ) -> Vec<RenderArc> {
        let mut arcs = Vec::new();
        let mut slur_start: Option<(usize, &RenderCell)> = None;

        for (idx, cell) in cells.iter().enumerate() {
            if cell.slur_indicator.is_start() {
                // If this is an ornament cell (when edit mode ON), use its anchor instead
                let actual_idx = if let Some(&anchor_idx) = ornament_anchors.get(&idx) {
                    anchor_idx
                } else {
                    idx
                };

                // Get render cell (index matches since no filtering)
                if let Some(render_cell) = render_cells.get(actual_idx) {
                    slur_start = Some((actual_idx, render_cell));
                }
            } else if cell.slur_indicator.is_end() {
                if let Some((start_idx, start_cell)) = slur_start {
                    // If this is an ornament cell (when edit mode ON), use its anchor instead
                    let actual_idx = if let Some(&anchor_idx) = ornament_anchors.get(&idx) {
                        anchor_idx
                    } else {
                        idx
                    };

                    // Get render cell (index matches since no filtering)
                    if let Some(end_cell) = render_cells.get(actual_idx) {
                        // Create bezier curve for slur
                        let arc = self.create_bezier_arc(
                            start_idx,
                            actual_idx,
                            start_cell,
                            end_cell,
                            "up",
                            "#4a5568",
                            config,
                        );
                        arcs.push(arc);
                    }
                    slur_start = None;
                }
            }
        }

        arcs
    }

    /// Compute beat loop arcs from beat spans
    /// Arc Y coordinates are stored as ABSOLUTE (including line_y_offset),
    /// which JavaScript will use directly in the SVG overlay
    fn compute_beat_loop_arcs(
        &self,
        beats: &[BeatSpan],
        render_cells: &[RenderCell],
        original_cells: &[Cell],
        config: &LayoutConfig,
    ) -> Vec<RenderArc> {
        let mut arcs = Vec::new();

        for beat in beats {
            // Only create beat loops for beats with 2+ non-continuation cells
            let non_continuation_count = (beat.start..=beat.end)
                .filter(|&i| {
                    original_cells.get(i).map(|c| !c.continuation).unwrap_or(false)
                })
                .count();

            if non_continuation_count >= 2 {
                // Multi-element beat (not counting continuations) - create beat loop
                // Cell indices match render indices (no filtering)
                if let (Some(start_cell), Some(end_cell)) =
                    (render_cells.get(beat.start), render_cells.get(beat.end)) {

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
        }

        arcs
    }

    /// Compute ornament arcs from cell.ornaments (when edit mode is OFF)
    /// Creates smooth frown-shaped arcs connecting parent note to ornaments
    fn compute_ornament_arcs_from_cells(
        &self,
        original_cells: &[Cell],
        render_cells: &[RenderCell],
        _effective_widths: &[f32],
        _config: &LayoutConfig,
        _line_y_offset: f32,
    ) -> Vec<RenderArc> {
        let mut arcs = Vec::new();

        // Iterate through cells and create arcs for those with ornaments
        for (cell_idx, cell) in original_cells.iter().enumerate() {
            if cell.ornament.is_none() {
                continue;
            }

            // Get parent cell's render info
            let parent_cell = if let Some(rc) = render_cells.get(cell_idx) {
                rc
            } else {
                continue;
            };

            // Calculate total width of ornaments (scaled down by 0.6)
            // Use default cell width of 12.0
            let total_ornament_width: f32 = cell.ornament.as_ref()
                .map(|orn| orn.cells.iter().map(|_| 12.0 * 0.6).sum())
                .unwrap_or(0.0);

            // Ornaments start at RIGHT edge of parent
            let ornament_start_x = parent_cell.x + parent_cell.w;
            let ornament_end_x = ornament_start_x + total_ornament_width;

            // Arc Y is at the TOP of the parent note's bounding box
            let arc_y = parent_cell.y;

            // Create arc from parent to ornament span (horizontal with upward curve)
            let arc = self.create_ornament_arc_positioned(
                parent_cell.x + (parent_cell.w / 2.0),
                ornament_end_x,
                arc_y,
                ornament_end_x,
                arc_y,  // Same Y for start and end (horizontal)
            );
            arcs.push(arc);
        }

        arcs
    }

    /// Create a smooth frown-shaped arc for ornaments (horizontal with upward curve)
    /// Arc goes from parent note top to ornament position
    fn create_ornament_arc_positioned(
        &self,
        start_x: f32,
        end_x: f32,
        start_y: f32,
        _anchor_x: f32,
        end_y: f32,
    ) -> RenderArc {
        // Calculate horizontal span
        let span = (end_x - start_x).abs();

        // Arc height for frown shape - proportional to span
        let arch_height = (span * 0.15).max(3.0).min(8.0);

        // Symmetrical control points for smooth frown (upward curve)
        // Place control points at 1/3 and 2/3 of the span horizontally
        let cp1_x = start_x + span * 0.33;
        let cp1_y = start_y - arch_height;

        let cp2_x = start_x + span * 0.67;
        let cp2_y = end_y - arch_height;

        RenderArc {
            id: format!("arc-ornament-{:.0}-{:.0}", start_x, end_x),
            start_x,
            start_y,
            end_x,
            end_y,
            cp1_x,
            cp1_y,
            cp2_x,
            cp2_y,
            color: "#1e40af".to_string(), // Dark blue color for ornaments
            direction: "up".to_string(),
        }
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
        _config: &LayoutConfig,
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

    /// Find anchor cells for ornament spans
    /// Returns a map: ornament_cell_index -> anchor_cell_index
    ///
    /// Priority: Left PITCHED → Right PITCHED → Left LINE element
    fn find_ornament_anchors(
        &self,
        cells: &[Cell],
        ornament_roles: &HashMap<usize, String>,
    ) -> HashMap<usize, usize> {
        let mut anchors = HashMap::new();

        // Find ornament spans
        let mut ornament_spans = Vec::new();
        let mut span_start: Option<usize> = None;

        for (idx, _cell) in cells.iter().enumerate() {
            if ornament_roles.contains_key(&idx) {
                if span_start.is_none() {
                    span_start = Some(idx);
                }
            } else if let Some(start) = span_start {
                ornament_spans.push((start, idx - 1));
                span_start = None;
            }
        }
        // Handle trailing span
        if let Some(start) = span_start {
            ornament_spans.push((start, cells.len() - 1));
        }

        // For each ornament span, find anchor
        for (start_idx, end_idx) in ornament_spans {
            // Priority 1: Look left for PITCHED element
            let mut anchor = None;
            for i in (0..start_idx).rev() {
                if cells[i].kind == ElementKind::PitchedElement {
                    anchor = Some(i);
                    break;
                }
            }

            // Priority 2: Look right for PITCHED element
            if anchor.is_none() {
                for i in (end_idx + 1)..cells.len() {
                    if cells[i].kind == ElementKind::PitchedElement {
                        anchor = Some(i);
                        break;
                    }
                }
            }

            // Priority 3: Look left for any LINE element (pitched or unpitched)
            if anchor.is_none() {
                for i in (0..start_idx).rev() {
                    if cells[i].kind == ElementKind::PitchedElement
                        || cells[i].kind == ElementKind::UnpitchedElement {
                        anchor = Some(i);
                        break;
                    }
                }
            }

            // Map all ornament cells in this span to the anchor
            if let Some(anchor_idx) = anchor {
                for idx in start_idx..=end_idx {
                    anchors.insert(idx, anchor_idx);
                }
            }
        }

        anchors
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

        // Check if line has any pitched elements (excluding continuation cells)
        let has_pitched_elements = original_cells.iter().any(|c| !c.continuation && matches!(c.kind, ElementKind::PitchedElement));

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
                if cell.kind.is_barline() {
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

    /// Position octave dots for cells with octave markings
    fn position_octave_dots(
        &self,
        cells: &[Cell],
        render_cells: &[RenderCell],
        config: &LayoutConfig,
    ) -> Vec<RenderOctaveDot> {
        use super::display_list::RenderOctaveDot;

        let mut octave_dots = Vec::new();

        // Constants from JS: SMALL_FONT_SIZE = 12, BASE_FONT_SIZE = 32
        let dot_font_size = 12.0;
        let upper_offset = dot_font_size * 0.5; // -0.5em
        let lower_offset = dot_font_size * 0.35; // -0.35em (from bottom)

        for (cell, render_cell) in cells.iter().zip(render_cells.iter()) {
            // Skip cells without octave markings or continuation cells
            if cell.octave == 0 || cell.continuation {
                continue;
            }

            let text = match cell.octave.abs() {
                1 => "•",
                2 => "••",
                _ => continue, // Invalid octave value
            };

            let letter_spacing = if cell.octave.abs() == 2 { 2.0 } else { 0.0 };

            // Center horizontally over cell
            let x = render_cell.x + (render_cell.w / 2.0);

            // Position vertically based on octave sign (absolute coordinates)
            let y = if cell.octave > 0 {
                // Upper octave: above cell
                render_cell.y - upper_offset
            } else {
                // Lower octave: below cell (bottom + offset)
                render_cell.y + config.cell_height + lower_offset
            };

            octave_dots.push(RenderOctaveDot {
                text: text.to_string(),
                x,
                y,
                letter_spacing,
            });
        }

        octave_dots
    }

    /// Position ornaments from cell.ornaments (when ornament_edit_mode is OFF)
    /// Ornaments are positioned to the RIGHT and UP from their parent note
    fn position_ornaments_from_cells(
        &self,
        original_cells: &[Cell],
        render_cells: &[RenderCell],
        _effective_widths: &[f32],
        config: &LayoutConfig,
        line_y_offset: f32,
    ) -> Vec<RenderOrnament> {
        use super::display_list::RenderOrnament;

        let mut ornaments = Vec::new();

        // Calculate baseline position for parent note
        // Baseline is approximately 75% down from top of the cell for typical fonts
        let baseline_offset_in_cell = config.cell_height * 0.75;
        let parent_baseline_y = line_y_offset + config.cell_y_offset + baseline_offset_in_cell;

        // Position ornaments above the parent baseline (0.8x font size = 0.7 + 10%)
        let ornament_offset_above_baseline = config.font_size * 0.8;
        let ornament_y = parent_baseline_y - ornament_offset_above_baseline;

        // Iterate through cells and render their ornaments
        for (cell_idx, cell) in original_cells.iter().enumerate() {
            if cell.ornament.is_none() {
                continue;
            }

            // Get parent cell's render info
            let parent_cell = if let Some(rc) = render_cells.get(cell_idx) {
                rc
            } else {
                continue;
            };

            // Position ornaments to the RIGHT of parent note
            // Start position is at the right edge of parent
            let mut ornament_x = parent_cell.x + parent_cell.w;

            // Render ornament's cells
            if let Some(ornament) = &cell.ornament {
                for ornament_cell in &ornament.cells {
                    // Use smaller width for ornaments (scaled down by 0.6)
                    // Use default cell width of 12.0
                    let ornament_width = 12.0 * 0.6;

                    ornaments.push(RenderOrnament {
                        text: ornament_cell.char.clone(),
                        x: ornament_x,
                        y: ornament_y,
                        classes: vec!["ornament-char".to_string()],
                    });

                    // Move X position for next ornament character
                    ornament_x += ornament_width;
                }
            }
        }

        ornaments
    }

    /// Extract ornaments from inline indicator cells and attach them to anchor cells
    ///
    /// When ornament_edit_mode is OFF, this function:
    /// - Scans for OrnamentStart/OrnamentEnd indicator pairs
    /// - Extracts cells between indicators (the ornament content)
    /// - Creates Ornament objects and attaches them to the anchor cell
    /// - Removes the indicator cells from the returned vector
    ///
    /// Returns a tuple of (modified cell vector, index mapping)
    /// where the mapping maps result indices to original cell indices
    fn extract_ornaments_from_indicators(&self, cells: &[Cell]) -> (Vec<Cell>, Vec<usize>) {
        let mut result: Vec<Cell> = Vec::new();
        let mut index_map: Vec<usize> = Vec::new();
        let mut i = 0;

        while i < cells.len() {
            let cell = &cells[i];

            // Check if this cell has an ornament start indicator
            if cell.ornament_indicator.is_start() {
                let start_idx = i;
                let position_type = cell.ornament_indicator.position_type();

                // Find the matching end indicator
                let mut end_idx = None;
                for j in (start_idx + 1)..cells.len() {
                    if cells[j].ornament_indicator.is_end()
                        && cell.ornament_indicator.matches(&cells[j].ornament_indicator) {
                        end_idx = Some(j);
                        break;
                    }
                }

                if let Some(end_idx) = end_idx {
                    // Extract ornament cells (from start to end, inclusive)
                    let ornament_cells: Vec<Cell> = cells[(start_idx)..=end_idx]
                        .iter()
                        .cloned()
                        .collect();

                    // Create the Ornament object
                    let placement = match position_type {
                        crate::models::elements::OrnamentPositionType::Before => {
                            crate::models::elements::OrnamentPlacement::Before
                        }
                        crate::models::elements::OrnamentPositionType::After |
                        crate::models::elements::OrnamentPositionType::OnTop => {
                            crate::models::elements::OrnamentPlacement::After
                        }
                    };

                    let ornament = crate::models::elements::Ornament {
                        cells: ornament_cells,
                        placement,
                    };

                    // Find the anchor cell (the cell immediately before the start indicator)
                    if start_idx > 0 {
                        // Attach ornament to the anchor cell
                        if let Some(anchor_cell) = result.last_mut() {
                            anchor_cell.ornament = Some(ornament);
                        }
                    }

                    // Skip past all the ornament cells (including the end indicator)
                    i = end_idx + 1;
                    continue;
                }
            }

            // Regular cell - add it to result with its original index
            result.push(cell.clone());
            index_map.push(i);
            i += 1;
        }

        (result, index_map)
    }


    /// Calculate line height based on actual content
    ///
    /// Lines should have variable height based on what's actually rendered:
    /// - Minimal height for simple notes
    /// - Additional space when decorations (slurs, beat arcs) are present
    /// - Even more space when lyrics are present
    fn calculate_line_height(
        &self,
        has_lyrics: bool,
        has_beats: bool,
        has_slurs: bool,
        has_octave_dots: bool,
        config: &LayoutConfig,
    ) -> f32 {
        const SLUR_HEIGHT: f32 = 8.0;
        const BEAT_LOOP_HEIGHT: f32 = 7.0;
        const OCTAVE_DOT_HEIGHT: f32 = 4.0;
        const DECORATION_GAP: f32 = 2.0;
        const LYRICS_GAP: f32 = 4.0;

        let cell_bottom = config.cell_y_offset + config.cell_height;

        // Calculate space needed for decorations
        let mut decoration_height: f32 = 0.0;
        if has_slurs {
            decoration_height = decoration_height.max(SLUR_HEIGHT);
        }
        if has_beats {
            decoration_height = decoration_height.max(BEAT_LOOP_HEIGHT);
        }
        if has_octave_dots {
            decoration_height = decoration_height.max(OCTAVE_DOT_HEIGHT);
        }

        // Start with baseline height (cell + bottom padding)
        let baseline_bottom_padding = config.cell_y_offset;
        let mut total_height = cell_bottom + baseline_bottom_padding;

        // Add decoration space if decorations are present
        if decoration_height > 0.0 {
            total_height += DECORATION_GAP + decoration_height;
        }

        // Add lyrics space if lyrics are present
        if has_lyrics {
            let lyrics_font_size = config.font_size * 0.5;
            let lyrics_bottom_padding = config.font_size;
            total_height += LYRICS_GAP + lyrics_font_size + lyrics_bottom_padding;
        }

        total_height
    }
}
