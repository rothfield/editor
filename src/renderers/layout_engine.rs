//! Layout Engine - Computes all layout calculations and generates DisplayList
//!
//! This module contains the core layout logic that takes cell measurements from JavaScript,
//! performs all positioning calculations, and returns a complete DisplayList ready for rendering.

use crate::models::*;
use crate::parse::beats::BeatDeriver;
use super::lyrics::*;
use super::display_list::*;
use serde::{Serialize, Deserialize};
use std::collections::HashMap;

/// Configuration for layout calculations
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct LayoutConfig {
    /// Measured cell widths from JavaScript (parallel to cells array)
    pub cell_widths: Vec<f32>,

    /// Measured syllable widths from JavaScript (parallel to syllable assignments)
    pub syllable_widths: Vec<f32>,

    /// Measured character widths for each cell (flattened array)
    /// Each cell contributes glyph.chars().count() widths
    pub char_widths: Vec<f32>,

    /// Font size in pixels
    pub font_size: f32,

    /// Line height in pixels
    pub line_height: f32,

    /// Left margin in pixels
    pub left_margin: f32,

    /// Y offset for cells from line top
    pub cell_y_offset: f32,

    /// Height of cells
    pub cell_height: f32,

    /// Minimum padding between syllables
    pub min_syllable_padding: f32,
}

/// Main layout engine for computing display lists
pub struct LayoutEngine {
    beat_deriver: BeatDeriver,
}

impl LayoutEngine {
    /// Create a new layout engine
    pub fn new() -> Self {
        Self {
            beat_deriver: BeatDeriver::new(),
        }
    }

    /// Compute complete layout for a document
    ///
    /// This is the main entry point that takes a document and measurements,
    /// performs all layout calculations, and returns a DisplayList ready for rendering.
    ///
    /// # Arguments
    /// * `document` - The document to layout
    /// * `config` - Layout configuration with measurements from JavaScript
    ///
    /// # Returns
    /// DisplayList with all positioning, classes, and rendering data
    pub fn compute_layout(&self, document: &Document, config: &LayoutConfig) -> DisplayList {
        let mut lines = Vec::new();
        let mut cell_width_offset = 0;
        let mut syllable_width_offset = 0;
        let mut char_width_offset = 0;

        // Process each line
        for (line_idx, line) in document.lines.iter().enumerate() {
            // Get cell widths for this line
            let cell_widths = if cell_width_offset < config.cell_widths.len() {
                &config.cell_widths[cell_width_offset..(cell_width_offset + line.cells.len()).min(config.cell_widths.len())]
            } else {
                &[]
            };

            // Count syllables in this line to get correct offset
            let syllable_count = if !line.lyrics.is_empty() {
                distribute_lyrics(&line.lyrics, &line.cells).len()
            } else {
                0
            };

            // Get syllable widths for this line
            let syllable_widths = if syllable_width_offset < config.syllable_widths.len() {
                &config.syllable_widths[syllable_width_offset..(syllable_width_offset + syllable_count).min(config.syllable_widths.len())]
            } else {
                &[]
            };

            // Count total characters in this line
            let char_count: usize = line.cells.iter().map(|cell| cell.char.chars().count()).sum();

            // Get character widths for this line
            let char_widths = if char_width_offset < config.char_widths.len() {
                &config.char_widths[char_width_offset..(char_width_offset + char_count).min(config.char_widths.len())]
            } else {
                &[]
            };

            let render_line = self.compute_line_layout(
                line,
                line_idx,
                config,
                cell_widths,
                syllable_widths,
                char_widths,
            );

            cell_width_offset += line.cells.len();
            syllable_width_offset += syllable_count;
            char_width_offset += char_count;

            lines.push(render_line);
        }

        DisplayList {
            header: Some(DocumentHeader {
                title: document.title.clone(),
                composer: document.composer.clone(),
            }),
            lines,
        }
    }

    /// Compute layout for a single line
    fn compute_line_layout(
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
        let beat_roles = self.build_beat_role_map(&beats, &line.cells);
        let slur_roles = self.build_slur_role_map(&line.cells);
        let ornament_roles = self.build_ornament_role_map(&line.cells);

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

            // Pitch system class
            if let Some(pitch_system) = cell.pitch_system {
                classes.push(format!("pitch-system-{}", self.pitch_system_to_css(pitch_system)));
            }

            // Accidental (sharp/flat) class - for music font rendering
            if cell.char.contains('#') {
                classes.push("accidental-sharp".to_string());
            }
            if cell.char.contains('b') {
                classes.push("accidental-flat".to_string());
            }

            // Build data attributes
            let mut dataset = HashMap::new();
            dataset.insert("lineIndex".to_string(), line_idx.to_string());
            dataset.insert("cellIndex".to_string(), cell_idx.to_string());
            dataset.insert("column".to_string(), cell.col.to_string());
            dataset.insert("octave".to_string(), cell.octave.to_string());
            dataset.insert("glyphLength".to_string(), cell.char.chars().count().to_string());
            dataset.insert("continuation".to_string(), cell.continuation.to_string());

            // Get effective width for this cell
            let effective_width = effective_widths.get(cell_idx).copied().unwrap_or(12.0);

            // Get actual cell width (for cursor positioning, not including syllable padding)
            let actual_cell_width = cell_widths.get(cell_idx).copied().unwrap_or(12.0);

            // Calculate character positions for this cell
            let char_count = cell.char.chars().count();
            let mut char_positions = Vec::with_capacity(char_count + 1);
            char_positions.push(cumulative_x); // Position before first character

            // Add position after each character
            let mut char_x = cumulative_x;
            for i in 0..char_count {
                if let Some(&width) = char_widths.get(char_width_offset + i) {
                    char_x += width;
                } else {
                    // Fallback to proportional width
                    char_x += actual_cell_width / char_count as f32;
                }
                char_positions.push(char_x);
            }

            char_width_offset += char_count;

            // cursor_right should be at the position after the last character
            let cursor_right = *char_positions.last().unwrap_or(&(cumulative_x + actual_cell_width));

            // Calculate Y position for cells
            // IMPORTANT: Cells are rendered as children of their .notation-line containers
            // So Y should be relative to the line, NOT global to the editor
            // All cells in all lines use the same Y offset relative to their container
            let y = config.cell_y_offset;

            cells.push(RenderCell {
                char: cell.char.clone(),
                x: cumulative_x,
                y,
                w: effective_width,
                h: config.cell_height,
                classes,
                dataset,
                cursor_left: cumulative_x,
                cursor_right,
                char_positions,
            });

            cumulative_x += effective_width;
        }

        // Position lyrics syllables
        let lyrics = self.position_lyrics(
            &syllable_assignments,
            &cells,
            &beats,
            config,
        );

        // Position tala characters
        let tala = self.position_tala(&line.tala, &line.cells, &cells, config);

        // Position ornaments (grace notes)
        let ornaments = self.position_ornaments(
            &line.cells,
            &cells,
            line_idx,
            config,
        );

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
            ornaments,
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

    /// Build map of cell index to beat role class (includes both pitched and continuation cells)
    fn build_beat_role_map(&self, beats: &[BeatSpan], cells: &[Cell]) -> HashMap<usize, String> {
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
    fn build_slur_role_map(&self, cells: &[Cell]) -> HashMap<usize, String> {
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
    fn build_ornament_role_map(&self, cells: &[Cell]) -> HashMap<usize, String> {
        let mut map = HashMap::new();
        let mut ornament_start: Option<usize> = None;

        for (idx, cell) in cells.iter().enumerate() {
            match cell.ornament_indicator {
                OrnamentIndicator::OrnamentStart => {
                    ornament_start = Some(idx);
                }
                OrnamentIndicator::OrnamentEnd => {
                    if let Some(start) = ornament_start {
                        // Mark all cells in the ornament span
                        for i in start..=idx {
                            let role = if i == start {
                                "ornament-first"
                            } else if i == idx {
                                "ornament-last"
                            } else {
                                "ornament-middle"
                            };
                            map.insert(i, role.to_string());
                        }
                        ornament_start = None;
                    }
                }
                OrnamentIndicator::None => {}
            }
        }

        map
    }

    /// Position lyrics syllables below their cells
    fn position_lyrics(
        &self,
        assignments: &[SyllableAssignment],
        cells: &[RenderCell],
        beats: &[BeatSpan],
        _config: &LayoutConfig,
    ) -> Vec<RenderLyric> {
        // Adaptive Y positioning based on beat presence
        let has_beats = beats.iter().any(|b| b.end - b.start >= 1);
        let lyrics_y = if has_beats { 65.0 } else { 57.0 };

        assignments
            .iter()
            .filter_map(|assignment| {
                cells.get(assignment.cell_index).map(|cell| RenderLyric {
                    text: assignment.syllable.clone(),
                    x: cell.x + cell.w / 2.0, // Center under cell
                    y: lyrics_y,
                })
            })
            .collect()
    }

    /// Position ornaments relative to their target cells
    fn position_ornaments(
        &self,
        original_cells: &[Cell],
        render_cells: &[RenderCell],
        line_index: usize,
        config: &LayoutConfig,
    ) -> Vec<RenderOrnament> {
        let mut ornaments = Vec::new();
        let mut global_ornament_index = 0;

        // Iterate through cells to find ornaments
        for (cell_index, cell) in original_cells.iter().enumerate() {
            if cell.ornaments.is_empty() {
                continue;
            }

            // Get the render cell for position information
            let render_cell = match render_cells.get(cell_index) {
                Some(rc) => rc,
                None => continue,
            };

            // Process each ornament attached to this cell
            for (ornament_index, ornament) in cell.ornaments.iter().enumerate() {
                // Calculate position using the same logic as WASM calculate_ornament_layout
                let ornament_size = config.font_size * 0.75; // 75% of base
                let pitch_count = ornament.cells.len();
                let ornament_width = ornament_size * pitch_count as f32;

                let (x, y) = match ornament.placement {
                    crate::models::OrnamentPlacement::Top => (
                        render_cell.x,
                        render_cell.y - (config.font_size * 0.6) // 60% above baseline
                    ),
                    crate::models::OrnamentPlacement::Before => (
                        render_cell.x - ornament_width - (config.font_size * 0.2), // Left with gap
                        render_cell.y
                    ),
                    crate::models::OrnamentPlacement::After => (
                        render_cell.x + render_cell.w + (config.font_size * 0.2), // Right of cell with gap
                        render_cell.y
                    ),
                };

                // Convert ornament cells to RenderOrnamentCell
                let ornament_cells: Vec<RenderOrnamentCell> = ornament.cells.iter().map(|cell| {
                    RenderOrnamentCell {
                        char: cell.char.clone(),
                        accidental: if cell.accidental == crate::models::Accidental::Natural {
                            None
                        } else {
                            Some(format!("{:?}", cell.accidental))
                        },
                        octave: cell.octave,
                    }
                }).collect();

                ornaments.push(RenderOrnament {
                    cells: ornament_cells,
                    x: (x * 10.0).round() / 10.0, // 0.1px precision
                    y: (y * 10.0).round() / 10.0, // 0.1px precision
                    placement: format!("{:?}", ornament.placement),
                    cell_index,
                    line_index,
                    ornament_index: global_ornament_index,
                });

                global_ornament_index += 1;
            }
        }

        ornaments
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
                if cell.kind.is_barline() {
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

    /// Convert ElementKind to CSS class name
    fn element_kind_to_css(&self, kind: ElementKind) -> &str {
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
    fn pitch_system_to_css(&self, system: PitchSystem) -> &str {
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

impl Default for LayoutEngine {
    fn default() -> Self {
        Self::new()
    }
}
