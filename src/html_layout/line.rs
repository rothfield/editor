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

    /// Calculate total width needed for each beat
    /// Returns a vector where each element is the sum of effective widths for cells in that beat
    fn calculate_beat_widths(
        &self,
        beats: &[BeatSpan],
        effective_widths: &[f32],
    ) -> Vec<f32> {
        beats.iter().map(|beat| {
            (beat.start..=beat.end)
                .map(|cell_idx| effective_widths.get(cell_idx).copied().unwrap_or(12.0))
                .sum()
        }).collect()
    }

    /// Distribute space evenly within a beat
    ///
    /// If beat has extra space, divide it evenly among gaps between cells.
    /// Returns X positions for each cell in the beat (relative to beat start).
    ///
    /// # Arguments
    /// * `beat` - The beat span defining which cells to position
    /// * `total_beat_width` - Total width available for this beat
    /// * `effective_widths` - Effective width of each cell
    /// * `beat_start_x` - Absolute X position where beat starts
    ///
    /// # Returns
    /// Vector of absolute X positions for each cell in the beat
    fn distribute_space_within_beat(
        &self,
        beat: &BeatSpan,
        total_beat_width: f32,
        effective_widths: &[f32],
        beat_start_x: f32,
    ) -> Vec<f32> {
        let num_cells = beat.width();

        // Calculate sum of cell widths
        let sum_widths: f32 = (beat.start..=beat.end)
            .map(|cell_idx| effective_widths.get(cell_idx).copied().unwrap_or(12.0))
            .sum();

        // Calculate extra space and gap size
        let extra_space = total_beat_width - sum_widths;
        let num_gaps = if num_cells > 1 { num_cells - 1 } else { 0 };
        let gap_size = if num_gaps > 0 && extra_space > 0.0 {
            extra_space / num_gaps as f32
        } else {
            0.0
        };

        // Calculate X positions for each cell
        let mut positions = Vec::with_capacity(num_cells);
        let mut current_x = beat_start_x;

        for cell_idx in beat.start..=beat.end {
            positions.push(current_x);
            let cell_width = effective_widths.get(cell_idx).copied().unwrap_or(12.0);
            current_x += cell_width + gap_size;
        }

        positions
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
        selection: Option<&crate::models::notation::Selection>,
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

        // NOTE: ornament_indicator removed - ornaments now stored directly in cell.ornament field
        // Always use identity mapping (no extraction needed)
        let working_cells = line.cells.to_vec();
        let cell_index_map: Vec<usize> = (0..working_cells.len()).collect();

        // Calculate beat widths (sum of effective widths for each beat)
        let beat_widths = self.calculate_beat_widths(&beats, &effective_widths);

        // Create a mapping of cell_idx -> beat_idx for quick lookup
        let mut cell_to_beat: Vec<Option<usize>> = vec![None; working_cells.len()];
        for (beat_idx, beat) in beats.iter().enumerate() {
            for cell_idx in beat.start..=beat.end {
                cell_to_beat[cell_idx] = Some(beat_idx);
            }
        }

        // Render cells with beat-aware positioning (even spacing within beats)
        // Cells outside beats (spaces, barlines, text) use tight-packed positioning
        let mut cells = Vec::new();
        let mut char_width_offset = 0;
        let mut cumulative_x = config.left_margin;
        let mut last_original_idx = 0;

        let mut beat_idx = 0;
        let mut beat_start_x = config.left_margin;

        for working_idx in 0..working_cells.len() {
            let cell = &working_cells[working_idx];
            let original_cell_idx = cell_index_map[working_idx];

            let cell_x = if let Some(beat_id) = cell_to_beat[working_idx] {
                // Cell is in a beat - use beat-aware positioning
                if beat_id != beat_idx {
                    // Starting a new beat
                    beat_start_x = cumulative_x;
                    beat_idx = beat_id;
                }

                let beat = &beats[beat_id];
                let total_beat_width = beat_widths[beat_id];
                let cell_positions = self.distribute_space_within_beat(
                    beat,
                    total_beat_width,
                    &effective_widths,
                    beat_start_x
                );

                // Find this cell's position within the beat
                let beat_cell_idx = working_idx - beat.start;
                cell_positions[beat_cell_idx]
            } else {
                // Cell is NOT in a beat (space, barline, text) - use tight-packed positioning
                cumulative_x
            };

            // Skip character widths for any cells we skipped
            for skipped_idx in last_original_idx..original_cell_idx {
                let skipped_char_count = line.cells[skipped_idx].char.chars().count();
                char_width_offset += skipped_char_count;
            }
            last_original_idx = original_cell_idx + 1;

            let render_cell = cell_style_builder.build_render_cell(
                cell,
                original_cell_idx,
                line_idx,
                cell_x,
                config,
                line_y_offset,
                &effective_widths,
                char_widths,
                &mut char_width_offset,
                &beat_roles,
                &slur_roles,
                &ornament_roles,
                selection,
            );

            // Advance cumulative position
            let effective_width = effective_widths.get(original_cell_idx).copied().unwrap_or(12.0);

            // Update cumulative_x based on whether we're in a beat or not
            if let Some(beat_id) = cell_to_beat[working_idx] {
                let beat = &beats[beat_id];
                // If this is the last cell in the beat, advance by the total beat width
                if working_idx == beat.end {
                    cumulative_x = beat_start_x + beat_widths[beat_id];
                }
            } else {
                // Not in a beat - just advance by cell width
                cumulative_x += effective_width;
            }

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

        // Octave dots are no longer generated as separate overlays
        // They are now embedded in the font glyphs via glyph substitution in RenderCell
        let octave_dots = Vec::new();

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
            staff_role: match line.staff_role {
                crate::models::StaffRole::Melody => "melody",
                crate::models::StaffRole::GroupHeader => "group-header",
                crate::models::StaffRole::GroupItem => "group-item",
            }.to_string(),
            lyrics,
            tala,
            height,
            y: line_y_offset,
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
        _original_cells: &[Cell],
        config: &LayoutConfig,
    ) -> Vec<RenderArc> {
        let mut arcs = Vec::new();

        for beat in beats {
            // Only create beat loops for beats with 2+ cells
            // NEW ARCHITECTURE: No continuation cells, so just count all cells in beat
            let cell_count = (beat.start..=beat.end).count();

            if cell_count >= 2 {
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
        config: &LayoutConfig,
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

            // Check if collision avoidance applies to this ornament
            let has_following_notes = Self::has_significant_following_chars(original_cells, cell_idx);
            let has_upper_octave_dot = cell.octave > 0;

            // Determine arc starting Y position
            // If collision avoidance is active, start arc ABOVE the note top
            // Otherwise, start from the note top
            let arc_y = if has_following_notes || has_upper_octave_dot {
                let base_avoidance = if has_following_notes {
                    config.font_size * 0.4  // 0.4x font size for following notes
                } else {
                    0.0
                };

                let octave_avoidance = if has_upper_octave_dot {
                    12.0 * 0.5 + 2.0  // Octave dot offset (6px) + 2px margin
                } else {
                    0.0
                };

                // Apply the larger avoidance distance
                let total_avoidance = base_avoidance.max(octave_avoidance);
                parent_cell.y - total_avoidance
            } else {
                // Standard arc: start from top of parent note
                parent_cell.y
            };

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
        config: &LayoutConfig,
    ) -> RenderArc {
        // Anchor points at cell edges (not centers)
        // Beat arc spans from left edge of first cell to right edge of last cell
        let is_downward = direction == "down";

        // Position arcs using actual measurements from layout config
        // These values come from JavaScript constants and are passed via config

        // Position based on arc direction
        let baseline_offset = if is_downward {
            // Beat loops: positioned below the cell, moved down 1/4 of font size
            // Cell height already includes octave dots (they're part of the font glyphs)
            config.cell_height + (config.font_size * 0.25)
        } else {
            // Slurs: positioned above glyphs using slur_offset_above
            config.slur_offset_above
        };

        // Arc anchors: left edge of first cell, right edge of last cell
        let start_x = start_cell.x;
        let start_y = start_cell.y + baseline_offset;

        let end_x = end_cell.x + end_cell.w;
        let end_y = end_cell.y + baseline_offset;

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


    /// Helper: Check if a character requires collision avoidance
    /// Returns true if the character is NOT a space, nbsp, or dash
    /// i.e., it's an actual note or other significant character
    fn char_requires_collision_avoidance(ch: &str) -> bool {
        match ch {
            " " | "\u{00A0}" | "-" => false, // space, nbsp, dash - no collision avoidance
            _ => true,                         // all other chars need avoidance
        }
    }

    /// Helper: Check if any following cells have significant characters
    /// Returns true if there are non-space/non-dash characters following this position
    fn has_significant_following_chars(cells: &[Cell], start_idx: usize) -> bool {
        // Look at the next few cells to see if there are significant characters
        for cell in cells.iter().skip(start_idx + 1).take(3) {
            if Self::char_requires_collision_avoidance(&cell.char) {
                return true;
            }
        }
        false
    }

    /// Position ornaments from cell.ornaments (when ornament_edit_mode is OFF)
    /// Ornaments are positioned to the RIGHT and UP from their parent note
    /// With collision avoidance: ornaments move UP further if following cells have notes
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

            // Check if following cells have significant characters (collision detection)
            let has_following_notes = Self::has_significant_following_chars(original_cells, cell_idx);

            // Check if the parent note has an upper octave dot (raised above the note)
            let has_upper_octave_dot = cell.octave > 0;

            // Calculate collision avoidance distance
            // If there are significant following characters, move up by 0.4x font size
            // If there's also an upper octave dot, add extra spacing to avoid it (octave dot is ~6px above)
            let adjusted_ornament_y = if has_following_notes || has_upper_octave_dot {
                let base_avoidance = if has_following_notes {
                    config.font_size * 0.4  // 0.4x font size for following notes
                } else {
                    0.0
                };

                let octave_avoidance = if has_upper_octave_dot {
                    12.0 * 0.5 + 2.0  // Octave dot offset (6px) + 2px margin
                } else {
                    0.0
                };

                // Apply the larger avoidance distance
                let total_avoidance = base_avoidance.max(octave_avoidance);
                ornament_y - total_avoidance
            } else {
                ornament_y
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

                    // Apply glyph substitution for octave shifts (same as regular cells)
                    let ornament_char = if ornament_cell.kind == ElementKind::PitchedElement
                        && ornament_cell.octave != 0
                        && !ornament_cell.char.is_empty()
                    {
                        let base_char = ornament_cell.char.chars().next().unwrap_or(' ');
                        use crate::renderers::get_glyph_codepoint;
                        get_glyph_codepoint(base_char, ornament_cell.octave).to_string()
                    } else {
                        ornament_cell.char.clone()
                    };

                    ornaments.push(RenderOrnament {
                        text: ornament_char,
                        x: ornament_x,
                        y: adjusted_ornament_y,
                        classes: vec!["ornament-char".to_string()],
                    });

                    // Move X position for next ornament character
                    ornament_x += ornament_width;
                }
            }
        }

        ornaments
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

#[cfg(test)]
mod ornament_collision_tests {
    use super::*;

    #[test]
    fn test_char_requires_collision_avoidance_spaces() {
        // Spaces should NOT require collision avoidance
        assert!(!LayoutLineComputer::char_requires_collision_avoidance(" "));
    }

    #[test]
    fn test_char_requires_collision_avoidance_nbsp() {
        // Non-breaking space should NOT require collision avoidance
        assert!(!LayoutLineComputer::char_requires_collision_avoidance("\u{00A0}"));
    }

    #[test]
    fn test_char_requires_collision_avoidance_dash() {
        // Dash should NOT require collision avoidance
        assert!(!LayoutLineComputer::char_requires_collision_avoidance("-"));
    }

    #[test]
    fn test_char_requires_collision_avoidance_note() {
        // Notes should require collision avoidance
        assert!(LayoutLineComputer::char_requires_collision_avoidance("C"));
        assert!(LayoutLineComputer::char_requires_collision_avoidance("1"));
        assert!(LayoutLineComputer::char_requires_collision_avoidance("S"));
        assert!(LayoutLineComputer::char_requires_collision_avoidance("r"));
    }

    #[test]
    fn test_char_requires_collision_avoidance_special() {
        // Special characters should require collision avoidance
        assert!(LayoutLineComputer::char_requires_collision_avoidance("#"));
        assert!(LayoutLineComputer::char_requires_collision_avoidance("b"));
        assert!(LayoutLineComputer::char_requires_collision_avoidance("|"));
    }

    #[test]
    fn test_char_requires_collision_avoidance_lowercase_letters() {
        // Lowercase letters should require collision avoidance
        assert!(LayoutLineComputer::char_requires_collision_avoidance("a"));
        assert!(LayoutLineComputer::char_requires_collision_avoidance("z"));
    }

    #[test]
    fn test_char_requires_collision_avoidance_accidentals() {
        // Accidentals should require collision avoidance
        assert!(LayoutLineComputer::char_requires_collision_avoidance("2")); // "b" (flat in some systems)
        assert!(LayoutLineComputer::char_requires_collision_avoidance("3")); // "#" (sharp in some systems)
    }
}

// COMMENTED OUT: Even spacing tests (feature reverted)
// Kept for future reference
#[cfg(test)]
mod even_spacing_tests {
    use super::*;
    use crate::parse::beats::BeatDeriver;

    // Helper to create test fixtures
    // Note: Can't use static lifetime for BeatDeriver, so tests create their own instances

    #[test]
    fn test_calculate_beat_widths() {
        let beat_deriver = BeatDeriver::new();
        let computer = LayoutLineComputer::new(&beat_deriver);
        let effective_widths = vec![10.0, 20.0, 15.0, 12.0];

        // Beat 1: cells 0-1
        // Beat 2: cells 2-3
        let beats = vec![
            BeatSpan::new(0, 1, 1.0),
            BeatSpan::new(2, 3, 1.0),
        ];

        let beat_widths = computer.calculate_beat_widths(&beats, &effective_widths);

        assert_eq!(beat_widths.len(), 2);
        assert_eq!(beat_widths[0], 30.0); // 10 + 20
        assert_eq!(beat_widths[1], 27.0); // 15 + 12
    }

    #[test]
    fn test_distribute_space_within_beat_no_extra_space() {
        let beat_deriver = BeatDeriver::new();
        let computer = LayoutLineComputer::new(&beat_deriver);
        let beat = BeatSpan::new(0, 2, 1.0); // 3 cells
        let effective_widths = vec![10.0, 20.0, 15.0];
        let total_beat_width = 45.0; // Exactly sum of widths
        let beat_start_x = 0.0;

        let positions = computer.distribute_space_within_beat(
            &beat,
            total_beat_width,
            &effective_widths,
            beat_start_x,
        );

        // No extra space, so positions are tight-packed
        assert_eq!(positions.len(), 3);
        assert_eq!(positions[0], 0.0);   // First cell at start
        assert_eq!(positions[1], 10.0);  // Second cell after first (no gap)
        assert_eq!(positions[2], 30.0);  // Third cell after second (no gap)
    }

    #[test]
    fn test_distribute_space_within_beat_with_extra_space() {
        let beat_deriver = BeatDeriver::new();
        let computer = LayoutLineComputer::new(&beat_deriver);
        let beat = BeatSpan::new(0, 2, 1.0); // 3 cells
        let effective_widths = vec![10.0, 20.0, 15.0];
        let total_beat_width = 65.0; // 20 extra pixels beyond sum (45)
        let beat_start_x = 100.0;

        let positions = computer.distribute_space_within_beat(
            &beat,
            total_beat_width,
            &effective_widths,
            beat_start_x,
        );

        // Extra space = 65 - 45 = 20
        // Num gaps = 3 - 1 = 2
        // Gap size = 20 / 2 = 10
        assert_eq!(positions.len(), 3);
        assert_eq!(positions[0], 100.0);  // First cell at beat start
        assert_eq!(positions[1], 120.0);  // 100 + 10 (width) + 10 (gap)
        assert_eq!(positions[2], 150.0);  // 120 + 20 (width) + 10 (gap)
    }

    #[test]
    fn test_distribute_space_single_cell_beat() {
        let beat_deriver = BeatDeriver::new();
        let computer = LayoutLineComputer::new(&beat_deriver);
        let beat = BeatSpan::new(0, 0, 1.0); // 1 cell
        let effective_widths = vec![10.0];
        let total_beat_width = 30.0; // Extra space, but no gaps to distribute it to
        let beat_start_x = 50.0;

        let positions = computer.distribute_space_within_beat(
            &beat,
            total_beat_width,
            &effective_widths,
            beat_start_x,
        );

        // Single cell, no gaps
        assert_eq!(positions.len(), 1);
        assert_eq!(positions[0], 50.0);  // Just positioned at beat start
    }

    #[test]
    fn test_distribute_space_two_cells_even_distribution() {
        let beat_deriver = BeatDeriver::new();
        let computer = LayoutLineComputer::new(&beat_deriver);
        let beat = BeatSpan::new(0, 1, 1.0); // 2 cells
        let effective_widths = vec![10.0, 10.0];
        let total_beat_width = 30.0; // 10 extra pixels
        let beat_start_x = 0.0;

        let positions = computer.distribute_space_within_beat(
            &beat,
            total_beat_width,
            &effective_widths,
            beat_start_x,
        );

        // Extra space = 30 - 20 = 10
        // Num gaps = 2 - 1 = 1
        // Gap size = 10 / 1 = 10
        assert_eq!(positions.len(), 2);
        assert_eq!(positions[0], 0.0);   // First cell
        assert_eq!(positions[1], 20.0);  // 0 + 10 (width) + 10 (gap)
    }
}
