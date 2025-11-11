//! Layout Engine - Computes all layout calculations and generates DisplayList
//!
//! This module contains the core layout logic that takes cell measurements from JavaScript,
//! performs all positioning calculations, and returns a complete DisplayList ready for rendering.

use crate::models::*;
use crate::parse::beats::BeatDeriver;
use super::lyrics::*;
use super::display_list::*;
use serde::{Serialize, Deserialize};
use web_sys::console;
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

    /// Ornament edit mode: true = editable (inline), false = locked (attached to anchors)
    #[serde(default)]
    pub ornament_edit_mode: bool,
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
        let mut cumulative_y = 0.0;

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
                cumulative_y,
            );

            cell_width_offset += line.cells.len();
            syllable_width_offset += syllable_count;
            char_width_offset += char_count;

            cumulative_y += render_line.height;
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
        y: f32,
    ) -> RenderLine {
        // Derive beats using WASM BeatDeriver
        let beats = self.beat_deriver.extract_implicit_beats(&line.cells);

        // Build role maps for CSS classes
        let beat_roles = self.build_beat_role_map(&beats, &line.cells);
        let slur_roles = self.build_slur_role_map(&line.cells);
        // TODO: Ornament layout system refactored - ornament_indicator removed from Cell
        // Ornaments are now stored in cell.ornament: Option<Ornament>
        // For now, use empty map to avoid breaking builds
        let ornament_roles = HashMap::new();

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

        // Render cells with different strategies based on ornament edit mode
        console::log_1(&format!("🎨 Layout engine: ornament_edit_mode={}", config.ornament_edit_mode).into());

        let cells = if config.ornament_edit_mode {
            // EDITABLE MODE: Layout all cells inline (including ornaments)
            console::log_1(&"📝 Using INLINE layout (edit mode ON)".into());
            self.layout_cells_inline(
                &line.cells,
                line_idx,
                &effective_widths,
                cell_widths,
                char_widths,
                &beat_roles,
                &slur_roles,
                &ornament_roles,
                config,
            )
        } else {
            // LOCKED MODE: Layout main cells tighter, position ornaments attached to anchors
            console::log_1(&"🔒 Using LOCKED layout (edit mode OFF)".into());
            self.layout_cells_with_locked_ornaments(
                &line.cells,
                line_idx,
                &effective_widths,
                cell_widths,
                char_widths,
                &beat_roles,
                &slur_roles,
                &ornament_roles,
                config,
            )
        };

        // Position lyrics syllables
        let lyrics = self.position_lyrics(
            &syllable_assignments,
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
            y,
        }
    }

    /// Layout all cells inline (editable mode - ornaments are part of normal flow)
    fn layout_cells_inline(
        &self,
        line_cells: &[Cell],
        line_idx: usize,
        effective_widths: &[f32],
        cell_widths: &[f32],
        char_widths: &[f32],
        beat_roles: &HashMap<usize, String>,
        slur_roles: &HashMap<usize, String>,
        ornament_roles: &HashMap<usize, String>,
        config: &LayoutConfig,
    ) -> Vec<RenderCell> {
        let mut cells = Vec::new();
        let mut cumulative_x = config.left_margin;
        let mut char_width_offset = 0;

        for (cell_idx, cell) in line_cells.iter().enumerate() {
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

        cells
    }

    /// Layout cells with locked ornaments (locked mode - ornaments attached to anchors)
    fn layout_cells_with_locked_ornaments(
        &self,
        line_cells: &[Cell],
        line_idx: usize,
        effective_widths: &[f32],
        cell_widths: &[f32],
        char_widths: &[f32],
        beat_roles: &HashMap<usize, String>,
        slur_roles: &HashMap<usize, String>,
        ornament_roles: &HashMap<usize, String>,
        config: &LayoutConfig,
    ) -> Vec<RenderCell> {
        let mut cells = Vec::with_capacity(line_cells.len());

        // Step 1: Extract ornament spans to identify all cells inside ornament ranges
        let ornament_spans = extract_ornament_spans(line_cells);
        console::log_1(&format!("🔍 Found {} ornament spans in line", ornament_spans.len()).into());

        let mut ornament_cell_indices_set = std::collections::HashSet::new();

        for span in &ornament_spans {
            // Mark all cells in the span as ornament cells (including Start and End indicators)
            console::log_1(&format!("  Span: start={}, end={}, type={:?}", span.start_idx, span.end_idx, span.position_type).into());
            for idx in span.start_idx..=span.end_idx {
                ornament_cell_indices_set.insert(idx);
            }
        }

        // Step 2: Separate ornament cells from main cells
        let mut main_cell_indices = Vec::new();
        let mut ornament_cell_indices = Vec::new();

        for (idx, _cell) in line_cells.iter().enumerate() {
            if ornament_cell_indices_set.contains(&idx) {
                ornament_cell_indices.push(idx);
            } else {
                main_cell_indices.push(idx);
            }
        }

        // Step 3: Layout main cells (tighter spacing - no ornament width)
        let mut cumulative_x = config.left_margin;
        let mut char_width_offset = 0;
        let mut main_cell_positions = HashMap::new(); // Track positions for anchor lookup

        for &cell_idx in &main_cell_indices {
            let cell = &line_cells[cell_idx];

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

            // Accidental classes
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

            let effective_width = effective_widths.get(cell_idx).copied().unwrap_or(12.0);
            let actual_cell_width = cell_widths.get(cell_idx).copied().unwrap_or(12.0);

            // Calculate character positions
            let char_count = cell.char.chars().count();
            let mut char_positions = Vec::with_capacity(char_count + 1);
            char_positions.push(cumulative_x);

            let mut char_x = cumulative_x;
            for i in 0..char_count {
                if let Some(&width) = char_widths.get(char_width_offset + i) {
                    char_x += width;
                } else {
                    char_x += actual_cell_width / char_count as f32;
                }
                char_positions.push(char_x);
            }

            char_width_offset += char_count;

            let cursor_right = *char_positions.last().unwrap_or(&(cumulative_x + actual_cell_width));
            let y = config.cell_y_offset;

            main_cell_positions.insert(cell_idx, cumulative_x);

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

        // Step 4: Group ornament spans by anchor cell
        let mut ornament_groups: HashMap<usize, Vec<&OrnamentSpan>> = HashMap::new();

        for span in &ornament_spans {
            if let Some(anchor_idx) = find_anchor_cell(line_cells, span) {
                ornament_groups.entry(anchor_idx).or_insert_with(Vec::new).push(span);
            }
        }

        // Step 5: Position ornament cells attached to anchors with collision avoidance
        for (anchor_idx, spans) in ornament_groups {
            let anchor_x = main_cell_positions.get(&anchor_idx).copied().unwrap_or(0.0);

            // Stack ornaments vertically to avoid collision
            for (stack_idx, span) in spans.iter().enumerate() {
                // Calculate base offset based on position type
                let base_offset_x = match span.position_type {
                    OrnamentPositionType::Before => -10.0,
                    OrnamentPositionType::After => 10.0,
                    OrnamentPositionType::OnTop => 0.0,
                };

                let base_offset_y = match span.position_type {
                    OrnamentPositionType::OnTop => -10.0,
                    _ => 0.0,
                };

                // Collision avoidance: stack vertically
                let collision_offset_y = stack_idx as f32 * -8.0;

                // Position each cell in the ornament span
                for ornament_cell_idx in span.start_idx..=span.end_idx {
                    let cell = &line_cells[ornament_cell_idx];

                    // Build CSS classes for ornament cell
                    let mut classes = vec!["char-cell".to_string(), "ornament-cell".to_string()];
                    classes.push(format!("kind-{}", self.element_kind_to_css(cell.kind)));

                    if cell.flags & 0x02 != 0 {
                        classes.push("selected".to_string());
                    }
                    if cell.flags & 0x04 != 0 {
                        classes.push("focused".to_string());
                    }

                    if let Some(role) = ornament_roles.get(&ornament_cell_idx) {
                        classes.push(role.clone());
                    }

                    if let Some(pitch_system) = cell.pitch_system {
                        classes.push(format!("pitch-system-{}", self.pitch_system_to_css(pitch_system)));
                    }

                    let mut dataset = HashMap::new();
                    dataset.insert("lineIndex".to_string(), line_idx.to_string());
                    dataset.insert("cellIndex".to_string(), ornament_cell_idx.to_string());
                    dataset.insert("column".to_string(), cell.col.to_string());
                    dataset.insert("octave".to_string(), cell.octave.to_string());
                    dataset.insert("testid".to_string(), "ornament-cell".to_string());

                    let x = anchor_x + base_offset_x;
                    let y = config.cell_y_offset + base_offset_y + collision_offset_y;

                    cells.push(RenderCell {
                        char: cell.char.clone(),
                        x,
                        y,
                        w: 0.0, // Zero width - ornament overlay
                        h: config.cell_height,
                        classes,
                        dataset,
                        cursor_left: x,
                        cursor_right: x,
                        char_positions: vec![x],
                    });
                }
            }
        }

        // Sort cells back to original order for rendering
        cells.sort_by_key(|cell| {
            cell.dataset.get("cellIndex")
                .and_then(|s| s.parse::<usize>().ok())
                .unwrap_or(0)
        });

        cells
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
    /// DISABLED: Ornament indicator system refactored - now using cell.ornament: Option<Ornament>
    /// TODO: Reimplement using new ornament structure
    #[allow(dead_code)]
    fn build_ornament_role_map(&self, _cells: &[Cell]) -> HashMap<usize, String> {
        // Temporarily return empty map
        // When ornament layout is reimplemented, this should detect cells with
        // ornament data and assign appropriate role classes
        HashMap::new()
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

    // TEMPORARILY DISABLED: Position ornaments relative to their target cells
    // This function uses old data structures (RenderOrnament, RenderOrnamentCell, cell.ornaments field)
    // Will be re-implemented for User Story 3 (edit mode ornaments with cell.ornaments field)
    //
    // For now, ornament positioning for User Story 1 is handled in JavaScript renderer (src/js/renderer.js)
    /*
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
    */

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
        config: &LayoutConfig,
    ) -> f32 {
        if has_lyrics {
            // Adjust lyrics positions based on new cell_y_offset
            let lyrics_y = if has_beats {
                config.cell_y_offset + config.cell_height + 7.0  // 7px gap
            } else {
                config.cell_y_offset + config.cell_height + 7.0  // 7px gap
            };
            let lyrics_font_size = 14.0; // text-sm
            let lyrics_bottom_padding = 8.0;
            lyrics_y + lyrics_font_size + lyrics_bottom_padding
        } else {
            // LINE_CONTAINER_HEIGHT = CELL_VERTICAL_PADDING + CELL_HEIGHT + CELL_BOTTOM_PADDING
            config.cell_y_offset + config.cell_height + config.cell_y_offset
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

// ============================================================================
// T030-T033: Ornament Attachment Resolution
// ============================================================================

/// Represents a span of ornamental cells (cells with ornament indicators)
/// Used for attachment resolution to determine which note each ornament group attaches to
#[derive(Clone, Debug)]
pub struct OrnamentSpan {
    /// Index of cell with Start indicator
    pub start_idx: usize,

    /// Index of cell with End indicator
    pub end_idx: usize,

    /// Position type: Before/After/OnTop
    pub position_type: OrnamentPositionType,

    /// Cells in this ornament span (for rendering)
    pub cells: Vec<Cell>,
}

impl OrnamentSpan {
    /// Create an OrnamentSpan from a slice of cells
    /// DISABLED: Ornament indicator system refactored
    #[allow(dead_code)]
    pub fn from_cells(cells: &[Cell], start_idx: usize, end_idx: usize) -> Self {
        // Default to Before position type - ornament system being refactored
        let position_type = OrnamentPositionType::Before;
        let span_cells: Vec<Cell> = cells[start_idx..=end_idx].to_vec();

        Self {
            start_idx,
            end_idx,
            position_type,
            cells: span_cells,
        }
    }
}

/// Groups ornament spans by position type for a single anchor cell
#[derive(Clone, Debug, Default)]
pub struct OrnamentGroups {
    pub before: Vec<OrnamentSpan>,
    pub after: Vec<OrnamentSpan>,
    pub on_top: Vec<OrnamentSpan>,
}

/// T031: Extract all ornament spans from a cell array
/// DISABLED: Ornament indicator system refactored - now using cell.ornament: Option<Ornament>
/// Scans cells for Start/End indicator pairs and returns OrnamentSpan structures
#[allow(dead_code)]
pub fn extract_ornament_spans(_cells: &[Cell]) -> Vec<OrnamentSpan> {
    // Return empty list - ornament system being refactored
    Vec::new()
}

/// T033: Find the anchor cell for an ornament span based on position type
/// DISABLED: Ornament indicator system refactored - now using cell.ornament: Option<Ornament>
#[allow(dead_code)]
pub fn find_anchor_cell(_cells: &[Cell], _span: &OrnamentSpan) -> Option<usize> {
    // Return None - ornament system being refactored
    None
}

// ============================================================================
// T036: Collision Detection - Two-Pass Layout Algorithm
// ============================================================================

/// Bounding box for collision detection
#[derive(Clone, Debug)]
pub struct BoundingBox {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
    pub cell_idx: usize,
}

impl BoundingBox {
    /// Check if this bounding box overlaps with another
    pub fn overlaps(&self, other: &BoundingBox) -> bool {
        // Check for no overlap (easier to reason about)
        let no_overlap = self.x + self.width <= other.x  // self is completely left of other
            || other.x + other.width <= self.x            // other is completely left of self
            || self.y + self.height <= other.y            // self is completely above other
            || other.y + other.height <= self.y;          // other is completely above self

        !no_overlap
    }
}

/// Detect collisions between bounding boxes
///
/// Returns pairs of (cell_idx1, cell_idx2) that collide
pub fn detect_collisions(bboxes: &[BoundingBox]) -> Vec<(usize, usize)> {
    let mut collisions = Vec::new();

    for i in 0..bboxes.len() {
        for j in (i + 1)..bboxes.len() {
            if bboxes[i].overlaps(&bboxes[j]) {
                collisions.push((bboxes[i].cell_idx, bboxes[j].cell_idx));
            }
        }
    }

    collisions
}

/// T036: Two-pass layout with collision detection
///
/// Pass 1: Compute initial layout with zero-width ornaments
/// Check for collisions
/// Pass 2: If collisions detected, add horizontal spacing
///
/// Returns adjusted bounding boxes
pub fn layout_with_collision_detection(
    cells: &[Cell],
    base_font_size: f32,
    base_height: f32,
) -> Vec<BoundingBox> {
    // Pass 1: Initial layout (ornaments at zero width)
    let mut bboxes = Vec::new();
    let mut cumulative_x = 0.0;

    for (idx, cell) in cells.iter().enumerate() {
        // Check if cell has ornament - ornament system being refactored
        let is_ornament = cell.ornament.is_some();

        // Zero width for ornaments in initial pass
        let width = if is_ornament {
            0.0
        } else {
            let char_count = cell.char.chars().count();
            base_font_size * char_count as f32 * 0.6
        };

        let height = if is_ornament {
            base_height * 0.75
        } else {
            base_height
        };

        bboxes.push(BoundingBox {
            x: cumulative_x,
            y: 0.0,
            width,
            height,
            cell_idx: idx,
        });

        cumulative_x += width;
    }

    // Check for collisions
    let collisions = detect_collisions(&bboxes);

    if !collisions.is_empty() {
        // Pass 2: Add spacing to resolve collisions
        // Find the rightmost collision point
        let mut max_collision_x: f32 = 0.0;
        for (idx1, idx2) in &collisions {
            let bbox1 = &bboxes[*idx1];
            let bbox2 = &bboxes[*idx2];
            let collision_right = bbox1.x.max(bbox2.x) + bbox1.width.max(bbox2.width);
            max_collision_x = max_collision_x.max(collision_right);
        }

        // Add spacing: shift all cells after the collision point
        let spacing = base_font_size * 0.5; // Add 0.5em spacing
        for bbox in bboxes.iter_mut() {
            if bbox.x >= max_collision_x {
                bbox.x += spacing;
            }
        }
    }

    bboxes
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_detect_collisions_no_overlap() {
        let bboxes = vec![
            BoundingBox {
                x: 0.0,
                y: 0.0,
                width: 10.0,
                height: 20.0,
                cell_idx: 0,
            },
            BoundingBox {
                x: 15.0,
                y: 0.0,
                width: 10.0,
                height: 20.0,
                cell_idx: 1,
            },
        ];

        let collisions = detect_collisions(&bboxes);
        assert_eq!(collisions.len(), 0);
    }

    #[test]
    fn test_detect_collisions_with_overlap() {
        let bboxes = vec![
            BoundingBox {
                x: 0.0,
                y: 0.0,
                width: 10.0,
                height: 20.0,
                cell_idx: 0,
            },
            BoundingBox {
                x: 5.0, // Overlaps with first bbox
                y: 5.0,
                width: 10.0,
                height: 20.0,
                cell_idx: 1,
            },
        ];

        let collisions = detect_collisions(&bboxes);
        assert_eq!(collisions.len(), 1);
        assert_eq!(collisions[0], (0, 1));
    }
}
