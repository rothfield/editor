//! Document-level layout computation
//!
//! This module contains the main entry point for layout calculations,
//! taking a document and measurements and producing a DisplayList.

use crate::models::*;
use crate::parse::beats::BeatDeriver;
use super::lyrics::*;
use super::display_list::*;
use super::line::LayoutLineComputer;
use serde::{Serialize, Deserialize};

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

    /// Slur positioning: distance above cell top (pixels)
    pub slur_offset_above: f32,

    /// Beat loop positioning: gap between cell bottom and beat loop (pixels)
    pub beat_loop_offset_below: f32,

    /// Beat loop arc height (pixels)
    pub beat_loop_height: f32,
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

        let line_computer = LayoutLineComputer::new(&self.beat_deriver);

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

            let render_line = line_computer.compute_line_layout(
                line,
                line_idx,
                config,
                cumulative_y,
                cell_widths,
                syllable_widths,
                char_widths,
                document.ornament_edit_mode,
            );

            // Accumulate Y offset for next line
            cumulative_y += render_line.height;

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
}

impl Default for LayoutEngine {
    fn default() -> Self {
        Self::new()
    }
}
