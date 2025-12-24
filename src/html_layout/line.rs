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
        syllable_widths: &[f32],
        superscript_edit_mode: bool,
        selection: Option<&crate::models::notation::Selection>,
    ) -> RenderLine {
        // Build cell_widths from cache by computing display_char() for each cell
        let cell_widths: Vec<f32> = line.cells
            .iter()
            .map(|cell| {
                let glyph = cell.display_char();
                crate::html_layout::document::get_glyph_width(&glyph)
            })
            .collect();

        // Build char_widths for cursor positioning (one width per character in glyph)
        let char_widths: Vec<f32> = line.cells
            .iter()
            .flat_map(|cell| {
                let glyph = cell.display_char();
                let glyph_width = crate::html_layout::document::get_glyph_width(&glyph);
                let char_count = glyph.chars().count();
                // Distribute glyph width evenly across characters
                vec![glyph_width / char_count.max(1) as f32; char_count]
            })
            .collect();
        // Derive beats using WASM BeatDeriver
        let beats = self.beat_deriver.extract_implicit_beats(&line.cells);

        // Build role maps for CSS classes
        let cell_style_builder = CellStyleBuilder::new();
        let beat_roles = cell_style_builder.build_beat_role_map(&beats, &line.cells);
        let slur_roles = cell_style_builder.build_slur_role_map(&line.cells);
        let superscript_roles = cell_style_builder.build_superscript_role_map(&line.cells);

        // Distribute lyrics to cells
        let syllable_assignments = if !line.lyrics.is_empty() {
            distribute_lyrics(&line.lyrics, &line.cells)
        } else {
            Vec::new()
        };

        // Calculate effective widths (max of cell width and syllable width + padding)
        let effective_widths = self.calculate_effective_widths(
            &cell_widths,
            &syllable_assignments,
            syllable_widths,
            config,
        );

        // Build superscript anchor map (superscript_index -> anchor_cell_index)
        // Only needed when superscript edit mode is OFF
        let superscript_anchors = if !superscript_edit_mode {
            self.find_superscript_anchors(&line.cells, &superscript_roles)
        } else {
            HashMap::new()
        };

        // NOTE: superscript_indicator removed - superscripts now stored directly in cell.superscript field
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

        let mut _beat_idx = 0;
        let mut beat_start_x = config.left_margin;

        for working_idx in 0..working_cells.len() {
            let cell = &working_cells[working_idx];
            let original_cell_idx = cell_index_map[working_idx];

            let cell_x = if let Some(beat_id) = cell_to_beat[working_idx] {
                // Cell is in a beat - use beat-aware positioning
                let beat = &beats[beat_id];

                // Update beat_start_x when processing the FIRST cell of a beat
                // This handles both the first beat (where beat_id == beat_idx initially)
                // and subsequent beats (where beat_id != beat_idx)
                if working_idx == beat.start {
                    beat_start_x = cumulative_x;
                    _beat_idx = beat_id;
                }

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
                let skipped_char_count = line.cells[skipped_idx].display_char().chars().count();
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
                &char_widths,
                &mut char_width_offset,
                &beat_roles,
                &slur_roles,
                &superscript_roles,
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

        // Position lyrics syllables (with collision avoidance)
        let lyrics = self.position_lyrics(
            &syllable_assignments,
            &line.lyrics,
            &line.cells,
            &cells,
            &beats,
            syllable_widths,
            config,
            line_y_offset,
        );

        // Position tala characters
        let tala = self.position_tala(&line.tala, &line.cells, &cells, config, line_y_offset);

        // Octave dots are no longer generated as separate overlays
        // They are now embedded in the font glyphs via glyph substitution in RenderCell
        let octave_dots = Vec::new();

        // Compute slur arcs from slur indicators in cells
        let slurs = self.compute_slur_arcs(&line.cells, &cells, &superscript_anchors, config);

        // Calculate line height based on content
        let has_beats = beats.iter().any(|b| b.end - b.start >= 1);
        let has_slurs = slurs.len() > 0;  // Check if any slurs were computed
        let has_octave_dots = line.cells.iter().any(|c| c.get_octave() != 0);
        let height = self.calculate_line_height(!line.lyrics.is_empty(), has_beats, has_slurs, has_octave_dots, config);

        // Compute beat loop arcs from beat indicators
        let beat_loops = self.compute_beat_loop_arcs(&beats, &cells, &line.cells, config);

        // Compute superscript arcs (shallow arcs connecting parent note to superscripts)
        // Only when superscript edit mode is OFF
        let superscript_arcs = if !superscript_edit_mode {
            self.compute_superscript_arcs_from_cells(
                &line.cells,
                &cells,
                &effective_widths,
                config,
                line_y_offset,
            )
        } else {
            Vec::new()
        };

        // Position superscripts separately when edit mode is OFF
        let superscripts = if !superscript_edit_mode {
            self.position_superscripts_from_cells(
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
            system_marker: line.system_start_count.map(|count| {
                if count == 1 {
                    "single".to_string()
                } else {
                    "start".to_string()
                }
            }),
            lyrics,
            tala,
            height,
            y: line_y_offset,
            slurs,
            beat_loops,
            superscript_arcs,
            superscripts,
            octave_dots,
        }
    }

    /// Compute slur arcs from slur indicators in cells
    /// When superscript edit mode is ON, slurs on superscript cells redirect to anchor note
    /// When superscript edit mode is OFF, superscript cells don't exist in the vector
    fn compute_slur_arcs(
        &self,
        cells: &[Cell],
        render_cells: &[RenderCell],
        superscript_anchors: &HashMap<usize, usize>,
        config: &LayoutConfig,
    ) -> Vec<RenderArc> {
        let mut arcs = Vec::new();
        let mut slur_start: Option<(usize, &RenderCell)> = None;

        for (idx, cell) in cells.iter().enumerate() {
            if cell.is_slur_start() {
                // If this is a superscript cell (when edit mode ON), use its anchor instead
                let actual_idx = if let Some(&anchor_idx) = superscript_anchors.get(&idx) {
                    anchor_idx
                } else {
                    idx
                };

                // Get render cell (index matches since no filtering)
                if let Some(render_cell) = render_cells.get(actual_idx) {
                    slur_start = Some((actual_idx, render_cell));
                }
            } else if cell.is_slur_end() {
                if let Some((start_idx, start_cell)) = slur_start {
                    // If this is a superscript cell (when edit mode ON), use its anchor instead
                    let actual_idx = if let Some(&anchor_idx) = superscript_anchors.get(&idx) {
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
            // Only create beat loops for beats with 2+ RHYTHMIC elements
            // Count only pitched/unpitched elements - exclude breath marks
            // Breath marks are phrasing marks, not rhythmic elements
            let rhythm_element_count = (beat.start..=beat.end)
                .filter(|&idx| {
                    if let Some(cell) = _original_cells.get(idx) {
                        matches!(cell.get_kind(),
                            ElementKind::PitchedElement | ElementKind::UnpitchedElement)
                    } else {
                        false
                    }
                })
                .count();

            if rhythm_element_count >= 2 {
                // Multi-element beat (2+ rhythmic elements) - create beat loop
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

    /// Compute superscript arcs from cell.superscripts (when edit mode is OFF)
    /// DEPRECATED: Grace notes are now superscript characters.
    /// Superscripts are visually distinct and don't need arcs.
    fn compute_superscript_arcs_from_cells(
        &self,
        _original_cells: &[Cell],
        _render_cells: &[RenderCell],
        _effective_widths: &[f32],
        _config: &LayoutConfig,
        _line_y_offset: f32,
    ) -> Vec<RenderArc> {
        // Grace notes are now superscript characters - no arcs needed
        Vec::new()
    }

    /// Create a smooth frown-shaped arc for superscripts (horizontal with upward curve)
    /// Arc goes from parent note top to superscript position
    fn create_superscript_arc_positioned(
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
            id: format!("arc-superscript-{:.0}-{:.0}", start_x, end_x),
            start_x,
            start_y,
            end_x,
            end_y,
            cp1_x,
            cp1_y,
            cp2_x,
            cp2_y,
            color: "#1e40af".to_string(), // Dark blue color for superscripts
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

    /// Calculate effective widths for cells
    ///
    /// Note: Cell widths are NOT expanded for lyrics. Lyrics handle their own
    /// collision avoidance in position_lyrics(). This keeps the textarea layout
    /// unchanged while still preventing lyric overlap.
    fn calculate_effective_widths(
        &self,
        cell_widths: &[f32],
        _syllable_assignments: &[SyllableAssignment],
        _syllable_widths: &[f32],
        _config: &LayoutConfig,
    ) -> Vec<f32> {
        // Return cell widths unchanged - no expansion for lyrics
        cell_widths.to_vec()
    }

    /// Find anchor cells for superscript spans
    /// Returns a map: superscript_cell_index -> anchor_cell_index
    ///
    /// Priority: Left PITCHED → Right PITCHED → Left LINE element
    fn find_superscript_anchors(
        &self,
        cells: &[Cell],
        superscript_roles: &HashMap<usize, String>,
    ) -> HashMap<usize, usize> {
        let mut anchors = HashMap::new();

        // Find superscript spans
        let mut superscript_spans = Vec::new();
        let mut span_start: Option<usize> = None;

        for (idx, _cell) in cells.iter().enumerate() {
            if superscript_roles.contains_key(&idx) {
                if span_start.is_none() {
                    span_start = Some(idx);
                }
            } else if let Some(start) = span_start {
                superscript_spans.push((start, idx - 1));
                span_start = None;
            }
        }
        // Handle trailing span
        if let Some(start) = span_start {
            superscript_spans.push((start, cells.len() - 1));
        }

        // For each superscript span, find anchor
        for (start_idx, end_idx) in superscript_spans {
            // Priority 1: Look left for PITCHED element
            let mut anchor = None;
            for i in (0..start_idx).rev() {
                if cells[i].get_kind() == ElementKind::PitchedElement {
                    anchor = Some(i);
                    break;
                }
            }

            // Priority 2: Look right for PITCHED element
            if anchor.is_none() {
                for i in (end_idx + 1)..cells.len() {
                    if cells[i].get_kind() == ElementKind::PitchedElement {
                        anchor = Some(i);
                        break;
                    }
                }
            }

            // Priority 3: Look left for any LINE element (pitched or unpitched)
            if anchor.is_none() {
                for i in (0..start_idx).rev() {
                    if cells[i].get_kind() == ElementKind::PitchedElement
                        || cells[i].get_kind() == ElementKind::UnpitchedElement {
                        anchor = Some(i);
                        break;
                    }
                }
            }

            // Map all superscript cells in this span to the anchor
            if let Some(anchor_idx) = anchor {
                for idx in start_idx..=end_idx {
                    anchors.insert(idx, anchor_idx);
                }
            }
        }

        anchors
    }

    /// Position lyrics syllables with collision avoidance
    ///
    /// Lyrics are positioned left-aligned with their assigned cells, but if a lyric
    /// would collide with the next one, it is pushed right to avoid overlap.
    /// This is a fallback when perfect alignment isn't possible.
    ///
    /// Edge cases:
    /// - No pitched elements: assign all lyrics to first cell position
    /// - Empty line: position at default first cell x
    fn position_lyrics(
        &self,
        assignments: &[SyllableAssignment],
        lyrics_text: &str,
        original_cells: &[Cell],
        render_cells: &[RenderCell],
        beats: &[BeatSpan],
        syllable_widths: &[f32],
        config: &LayoutConfig,
        line_y_offset: f32,
    ) -> Vec<RenderLyric> {
        let mut result = Vec::new();
        let lyrics_trimmed = lyrics_text.trim();

        if lyrics_trimmed.is_empty() {
            return result;
        }

        // Minimum gap between lyrics (in pixels)
        const MIN_LYRIC_GAP: f32 = 2.0;

        // Adaptive Y positioning: below beat loops, octave dots, or cell
        const BEAT_LOOP_GAP: f32 = 2.0;
        const BEAT_LOOP_HEIGHT: f32 = 5.0;
        const OCTAVE_DOT_OFFSET_EM: f32 = 0.35;
        const LYRICS_GAP: f32 = 4.0;

        let cell_bottom = config.cell_y_offset + config.cell_height;
        let has_beats = beats.iter().any(|b| b.end - b.start >= 1);
        let has_octave_dots = original_cells.iter().any(|c| c.get_octave() != 0);

        // Add line_y_offset to calculate absolute Y position for the document
        let lyrics_y = line_y_offset + if has_beats {
            cell_bottom + BEAT_LOOP_GAP + BEAT_LOOP_HEIGHT + LYRICS_GAP
        } else if has_octave_dots {
            cell_bottom + (OCTAVE_DOT_OFFSET_EM * config.font_size) + LYRICS_GAP
        } else {
            cell_bottom + LYRICS_GAP
        };

        // Check if line has any pitched elements
        let has_pitched_elements = original_cells.iter().any(|c| matches!(c.get_kind(), ElementKind::PitchedElement));

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

        // Track the minimum X position for the next lyric to avoid collision
        let mut min_next_x = config.left_margin;

        // Render all assignments with collision avoidance
        for (i, assignment) in assignments.iter().enumerate() {
            // Get the cell's X position (ideal position for this lyric)
            let cell_x = if let Some(cell) = render_cells.get(assignment.cell_index) {
                cell.x
            } else {
                config.left_margin
            };

            // Use the larger of: cell position or minimum required position
            // This ensures no overlap with the previous lyric
            let lyric_x = cell_x.max(min_next_x);

            // Get this syllable's width for calculating the next minimum position
            // Fallback: estimate from text length if no measured width available
            let measured_width = syllable_widths.get(i).copied().unwrap_or(0.0);
            let syllable_width = if measured_width > 0.0 {
                measured_width
            } else {
                // Estimate: ~7px per character for typical lyric font
                assignment.syllable.chars().count() as f32 * 7.0
            };

            // Update min_next_x for the next lyric
            min_next_x = lyric_x + syllable_width + MIN_LYRIC_GAP;

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
                if cell.get_kind().is_barline() {
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
            if Self::char_requires_collision_avoidance(&cell.display_char()) {
                return true;
            }
        }
        false
    }

    /// Position superscripts from cell.superscripts (when superscript_edit_mode is OFF)
    /// DEPRECATED: Grace notes are now superscript characters.
    /// Superscripts render at 50% scale via the font - no positioning needed here.
    fn position_superscripts_from_cells(
        &self,
        _original_cells: &[Cell],
        _render_cells: &[RenderCell],
        _effective_widths: &[f32],
        _config: &LayoutConfig,
        _line_y_offset: f32,
    ) -> Vec<RenderSuperscript> {
        // Grace notes are now superscript characters rendered inline via the font
        Vec::new()
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

#[cfg(test)]
mod line_variant_tests {
    use crate::models::core::{Cell, Document, Line};
    use crate::models::elements::ElementKind;
    use crate::models::pitch_code::PitchCode;
    use crate::models::StaffRole;

    fn make_pitched_cell(pitch_code: PitchCode, col: usize) -> Cell {
        use crate::renderers::font_utils::glyph_for_pitch;
        use crate::models::PitchSystem;

        // Get proper glyph codepoint for the pitch
        // kind is derived from codepoint via get_kind()
        let glyph = glyph_for_pitch(pitch_code, 0, PitchSystem::Number).unwrap_or('X');
        Cell {
            codepoint: glyph as u32,
            flags: 0,
            x: 0.0,
            y: 0.0,
            w: 0.0,
            h: 0.0,
            bbox: (0.0, 0.0, 0.0, 0.0),
            hit: (0.0, 0.0, 0.0, 0.0),
        }
    }

    fn make_test_line(cells: Vec<Cell>) -> Line {
        let mut line = Line {
            cells,
            text: Vec::new(),
            label: String::new(),
            tala: String::new(),
            lyrics: String::new(),
            tonic: None,
            pitch_system: None,
            key_signature: String::new(),
            time_signature: String::new(),
            tempo: String::new(),
            beats: Vec::new(),
            slurs: Vec::new(),
            part_id: "P1".to_string(),
            system_id: 1,
            staff_role: StaffRole::Melody,
            system_start_count: None,
            new_system: false,
        };
        line.sync_text_from_cells();
        line
    }

    /// Test that multi-cell beats get underlined variants in RenderCell.char
    /// This verifies that cell.char is set to line variant codepoints
    #[test]
    fn test_html_layout_outputs_line_variants_for_underlined_beats() {
        use crate::html_layout::{LayoutConfig, LayoutEngine};
        use crate::models::PitchSystem;

        // Create 3 adjacent pitched cells (should form a multi-cell beat with underlines)
        let cell1 = make_pitched_cell(PitchCode::N1, 0);
        let cell2 = make_pitched_cell(PitchCode::N2, 1);
        let cell3 = make_pitched_cell(PitchCode::N3, 2);

        let line = make_test_line(vec![cell1, cell2, cell3]);
        let mut doc = Document::new();
        doc.lines = vec![line];
        doc.pitch_system = Some(PitchSystem::Number);

        // Apply line variants (underline/overline)
        doc.compute_line_variants();

        // Now compute layout and check RenderCell output
        let config = LayoutConfig {
            syllable_widths: vec![],
            font_size: 24.0,
            line_height: 48.0,
            left_margin: 0.0,
            cell_y_offset: 0.0,
            cell_height: 24.0,
            min_syllable_padding: 4.0,
            word_spacing: 10.0,
            slur_offset_above: 10.0,
            beat_loop_offset_below: 10.0,
            beat_loop_height: 20.0,
        };

        let engine = LayoutEngine::new();
        let display_list = engine.compute_layout(&doc, &config);

        // Get the render cells from line 0
        let render_line = &display_list.lines[0];
        let render_cells = &render_line.cells;

        assert_eq!(render_cells.len(), 3, "Should have 3 render cells");

        // Check that render cells have underlined PUA variants
        // NOTE line variants are in 0x1A000+ range (Number system base)
        // ASCII line variants are in 0xE800-0xEFFF range
        // For multi-cell beat: first=left underline, middle=middle underline, last=right underline
        for (i, rc) in render_cells.iter().enumerate() {
            let first_char = rc.char.chars().next().expect("RenderCell should have a char");
            let codepoint = first_char as u32;

            // Number system NOTE line variants are in 0x1A000+ range
            // Formula: line_cp = 0x1A000 + (note_offset × 15) + variant_idx
            // If variant_idx > 0, it has line decorations (underline/overline)
            // Variant encoding: 0=none, 1-2=underline (M/L/R minus none), 3-5=overline, 6-14=combined
            let is_note_line_variant = codepoint >= 0x1A000 && codepoint < 0x1F600;
            let is_ascii_line_variant = codepoint >= 0xE800 && codepoint < 0xF000;

            assert!(
                is_note_line_variant || is_ascii_line_variant,
                "Cell {} should have line variant in NOTE range (0x1A000+) or ASCII range (0xE800-0xEFFF) \
                 (got U+{:04X} '{}'). This means cell.char is not being set to line variant codepoint.",
                i, codepoint, first_char
            );

            // Verify that the underline was properly encoded
            // The encoding in get_pua_note_line_variant_codepoint uses indices 0-14:
            // 0-2: Underline only (Middle=0, Left=1, Right=2)
            // So variant_idx 0-2 means underline is present
            if is_note_line_variant {
                let offset = codepoint - 0x1A000;
                let variant_idx = offset % 15;

                // For this test (multi-cell beat), we expect underlines:
                // Cell 0: Left underline → variant_idx=1
                // Cell 1: Middle underline → variant_idx=0
                // Cell 2: Right underline → variant_idx=2
                let expected_variant = match i {
                    0 => 1, // Left
                    1 => 0, // Middle
                    2 => 2, // Right
                    _ => unreachable!(),
                };
                assert_eq!(
                    variant_idx, expected_variant,
                    "Cell {} has variant_idx={}, expected {} for underline",
                    i, variant_idx, expected_variant
                );
            }
        }
    }
}

#[cfg(test)]
mod lyric_collision_tests {
    use crate::models::core::{Cell, Document, Line};
    use crate::models::elements::ElementKind;
    use crate::models::pitch_code::PitchCode;
    use crate::models::StaffRole;
    use crate::html_layout::{LayoutConfig, LayoutEngine};
    use crate::models::PitchSystem;

    fn make_pitched_cell(pitch_code: PitchCode) -> Cell {
        use crate::renderers::font_utils::glyph_for_pitch;

        let glyph = glyph_for_pitch(pitch_code, 0, PitchSystem::Number).unwrap_or('X');
        Cell {
            codepoint: glyph as u32,
            flags: 0,
            x: 0.0,
            y: 0.0,
            w: 0.0,
            h: 0.0,
            bbox: (0.0, 0.0, 0.0, 0.0),
            hit: (0.0, 0.0, 0.0, 0.0),
        }
    }

    fn make_whitespace_cell() -> Cell {
        // Space character (U+0020) - ElementKind::Whitespace
        Cell {
            codepoint: 0x0020,
            flags: 0,
            x: 0.0,
            y: 0.0,
            w: 0.0,
            h: 0.0,
            bbox: (0.0, 0.0, 0.0, 0.0),
            hit: (0.0, 0.0, 0.0, 0.0),
        }
    }

    fn make_test_line(cells: Vec<Cell>, lyrics: &str) -> Line {
        let mut line = Line {
            cells,
            text: Vec::new(),
            label: String::new(),
            tala: String::new(),
            lyrics: lyrics.to_string(),
            tonic: None,
            pitch_system: None,
            key_signature: String::new(),
            time_signature: String::new(),
            tempo: String::new(),
            beats: Vec::new(),
            slurs: Vec::new(),
            part_id: "P1".to_string(),
            system_id: 1,
            staff_role: StaffRole::Melody,
            system_start_count: None,
            new_system: false,
        };
        line.sync_text_from_cells();
        line
    }

    /// Test that long syllables trigger cell width expansion to prevent collision.
    ///
    /// BUG: The collision detection in calculate_effective_widths uses sum of widths
    /// to estimate cell positions, but actual positions use beat-aware gap distribution.
    /// This causes the algorithm to miss collisions.
    ///
    /// Setup: Two notes separated by space (beat boundary creates gap)
    /// - Note 1 at position ~12px with syllable "deer" (30px wide, ends at ~42px)
    /// - Note 2 at position ~24px with syllable "a"
    /// Expected: The cell width should expand so "deer" doesn't overlap "a"
    #[test]
    fn test_lyric_collision_detected_with_beat_spacing() {
        // Create cells: 1 2 (two pitched notes separated by beat boundary)
        let cells = vec![
            make_pitched_cell(PitchCode::N1), // "1"
            make_whitespace_cell(),           // " " (beat boundary)
            make_pitched_cell(PitchCode::N2), // "2"
        ];

        let line = make_test_line(cells, "deer a");
        let mut doc = Document::new();
        doc.lines = vec![line];
        doc.pitch_system = Some(PitchSystem::Number);

        // Set up glyph width cache with small widths (12px per character)
        crate::html_layout::document::set_glyph_width_cache(
            [("1".to_string(), 12.0), ("2".to_string(), 12.0), (" ".to_string(), 8.0)]
                .into_iter()
                .collect()
        );

        // Syllable widths: "deer" = 30px (wider than cell), "a" = 10px
        let config = LayoutConfig {
            syllable_widths: vec![30.0, 10.0],  // "deer" = 30px, "a" = 10px
            font_size: 24.0,
            line_height: 48.0,
            left_margin: 12.0,
            cell_y_offset: 0.0,
            cell_height: 24.0,
            min_syllable_padding: 4.0,
            word_spacing: 10.0,
            slur_offset_above: 10.0,
            beat_loop_offset_below: 10.0,
            beat_loop_height: 20.0,
        };

        let engine = LayoutEngine::new();
        let display_list = engine.compute_layout(&doc, &config);

        let render_line = &display_list.lines[0];
        let lyrics = &render_line.lyrics;

        assert_eq!(lyrics.len(), 2, "Should have 2 lyrics: 'deer' and 'a'");

        // Verify no collision: first lyric's right edge should not exceed second's left edge
        let first_lyric = &lyrics[0];
        let second_lyric = &lyrics[1];
        let first_right_edge = first_lyric.x + 30.0;  // "deer" width
        let second_left_edge = second_lyric.x;

        assert!(
            first_right_edge <= second_left_edge,
            "Lyric collision detected: '{}' ends at {:.1}px but '{}' starts at {:.1}px",
            first_lyric.text,
            first_right_edge,
            second_lyric.text,
            second_left_edge
        );
    }

    /// Test that close adjacent notes with long syllables don't collide.
    /// This simulates the user's bug: "deer" overlapping with "a".
    #[test]
    fn test_lyric_collision_multiple_adjacent_notes() {
        // Create cells: 1 2 3 (three adjacent pitched notes, no spaces = one beat)
        let cells = vec![
            make_pitched_cell(PitchCode::N1), // "1" -> "deer"
            make_pitched_cell(PitchCode::N2), // "2" -> "a"
            make_pitched_cell(PitchCode::N3), // "3" -> "female"
        ];

        let line = make_test_line(cells, "deer a female");
        let mut doc = Document::new();
        doc.lines = vec![line];
        doc.pitch_system = Some(PitchSystem::Number);

        // Set up glyph width cache
        crate::html_layout::document::set_glyph_width_cache(
            [("1".to_string(), 12.0), ("2".to_string(), 12.0), ("3".to_string(), 12.0)]
                .into_iter()
                .collect()
        );

        // Syllable widths that would cause collision without expansion
        let config = LayoutConfig {
            syllable_widths: vec![30.0, 10.0, 40.0],  // "deer" = 30px, "a" = 10px, "female" = 40px
            font_size: 24.0,
            line_height: 48.0,
            left_margin: 12.0,
            cell_y_offset: 0.0,
            cell_height: 24.0,
            min_syllable_padding: 4.0,
            word_spacing: 10.0,
            slur_offset_above: 10.0,
            beat_loop_offset_below: 10.0,
            beat_loop_height: 20.0,
        };

        let engine = LayoutEngine::new();
        let display_list = engine.compute_layout(&doc, &config);

        let render_line = &display_list.lines[0];
        let lyrics = &render_line.lyrics;

        assert_eq!(lyrics.len(), 3, "Should have 3 lyrics");

        // Check all adjacent pairs for collision
        for i in 0..lyrics.len() - 1 {
            let current = &lyrics[i];
            let next = &lyrics[i + 1];
            let syllable_width = config.syllable_widths[i];
            let current_right = current.x + syllable_width;
            let next_left = next.x;

            assert!(
                current_right <= next_left,
                "Lyric collision at position {}: '{}' ends at {:.1}px but '{}' starts at {:.1}px",
                i,
                current.text,
                current_right,
                next.text,
                next_left
            );
        }
    }

    fn make_dash_cell() -> Cell {
        // Dash character (U+002D) - ElementKind::UnpitchedElement
        Cell {
            codepoint: 0x002D,
            flags: 0,
            x: 0.0,
            y: 0.0,
            w: 0.0,
            h: 0.0,
            bbox: (0.0, 0.0, 0.0, 0.0),
            hit: (0.0, 0.0, 0.0, 0.0),
        }
    }

    /// Test the exact user scenario: notes separated by dashes in a multi-element beat
    /// BUG: Notes 3 and 1 in "3--1" (no spaces) form a single beat. The beat-aware positioning
    /// distributes gaps, but the collision algorithm uses sum-based positions.
    #[test]
    fn test_lyric_collision_user_scenario_with_dashes() {
        // Simulate: "3--1" (note, dash, dash, note) - NO SPACES = single beat
        // This forms ONE beat with 4 elements, where gaps are distributed
        let cells = vec![
            make_pitched_cell(PitchCode::N3), // "3" -> "deer"
            make_dash_cell(),                 // "-"
            make_dash_cell(),                 // "-"
            make_pitched_cell(PitchCode::N1), // "1" -> "a"
        ];

        let line = make_test_line(cells, "deer a");
        let mut doc = Document::new();
        doc.lines = vec![line];
        doc.pitch_system = Some(PitchSystem::Number);

        // Set up glyph width cache - dashes are narrow
        crate::html_layout::document::set_glyph_width_cache(
            [
                ("1".to_string(), 12.0),
                ("3".to_string(), 12.0),
                ("-".to_string(), 6.0),
            ]
                .into_iter()
                .collect()
        );

        // Syllable widths: "deer" is much wider than cells between notes
        // Cells: [N3, -, -, N1] with widths [12, 6, 6, 12] = 36 total
        // Collision detection: sum([12]) = 12 for N3, sum([12,6,6]) = 24 for N1
        // Distance = 24 - 12 = 12, but "deer" is 30px wide!
        // Sum-based: 12 + 30 = 42 > 24 → collision detected, should expand
        let config = LayoutConfig {
            syllable_widths: vec![30.0, 10.0],  // "deer" = 30px
            font_size: 24.0,
            line_height: 48.0,
            left_margin: 12.0,
            cell_y_offset: 0.0,
            cell_height: 24.0,
            min_syllable_padding: 4.0,
            word_spacing: 10.0,
            slur_offset_above: 10.0,
            beat_loop_offset_below: 10.0,
            beat_loop_height: 20.0,
        };

        let engine = LayoutEngine::new();
        let display_list = engine.compute_layout(&doc, &config);

        let render_line = &display_list.lines[0];
        let lyrics = &render_line.lyrics;

        assert_eq!(lyrics.len(), 2, "Should have 2 lyrics: 'deer' and 'a'");

        let first_lyric = &lyrics[0];
        let second_lyric = &lyrics[1];
        let first_right_edge = first_lyric.x + 30.0;  // "deer" width
        let second_left_edge = second_lyric.x;

        assert!(
            first_right_edge <= second_left_edge,
            "Lyric collision detected: '{}' ends at {:.1}px but '{}' starts at {:.1}px. \
             This demonstrates the bug where beat-aware positioning differs from sum-based collision detection.",
            first_lyric.text,
            first_right_edge,
            second_lyric.text,
            second_left_edge
        );
    }
}
