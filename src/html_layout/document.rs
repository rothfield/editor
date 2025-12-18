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
use std::collections::HashMap;
use std::sync::Mutex;
use once_cell::sync::Lazy;

/// Global glyph width cache
/// Maps glyph character to width in CSS pixels
/// Populated once at startup by JavaScript measureAllNotationFontGlyphs()
static GLYPH_WIDTH_CACHE: Lazy<Mutex<HashMap<String, f32>>> = Lazy::new(|| {
    Mutex::new(HashMap::new())
});

/// Set the glyph width cache (called from WASM setGlyphWidthCache())
pub fn set_glyph_width_cache(cache: HashMap<String, f32>) {
    *GLYPH_WIDTH_CACHE.lock().unwrap() = cache;
}

/// Get width for a glyph character
/// Returns cached width or 12.0px fallback
pub fn get_glyph_width(glyph: &str) -> f32 {
    GLYPH_WIDTH_CACHE
        .lock()
        .unwrap()
        .get(glyph)
        .copied()
        .unwrap_or(12.0) // Fallback width if glyph not in cache
}

/// Configuration for layout calculations
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct LayoutConfig {
    /// Measured syllable widths from JavaScript (parallel to syllable assignments)
    pub syllable_widths: Vec<f32>,

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

    /// Extra spacing after word-ending syllables (pixels)
    pub word_spacing: f32,

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
        let mut syllable_width_offset = 0;
        let mut cumulative_y = 0.0;

        // Get selection range from document state
        let selection = document.state.selection_manager.get_selection();

        let line_computer = LayoutLineComputer::new(&self.beat_deriver);

        // Process each line
        for (line_idx, line) in document.lines.iter().enumerate() {
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

            let render_line = line_computer.compute_line_layout(
                line,
                line_idx,
                config,
                cumulative_y,
                syllable_widths,
                document.superscript_edit_mode,
                selection,
            );

            // Accumulate Y offset for next line
            cumulative_y += render_line.height;

            syllable_width_offset += syllable_count;

            lines.push(render_line);
        }

        // Compute system blocks from line system_ids
        let system_blocks = compute_system_blocks(document);

        DisplayList {
            header: Some(DocumentHeader {
                title: document.title.clone(),
                composer: document.composer.clone(),
            }),
            lines,
            system_blocks,
        }
    }
}

/// Compute system blocks by grouping consecutive lines with the same system_id
///
/// Note: This only creates blocks for systems with MORE than one line.
/// Single-line systems are not included (no bracket needed).
fn compute_system_blocks(document: &Document) -> Vec<SystemBlock> {
    let mut blocks = Vec::new();

    if document.lines.is_empty() {
        return blocks;
    }

    let mut current_system_id = document.lines[0].system_id;
    let mut start_idx = 0;

    for (i, line) in document.lines.iter().enumerate().skip(1) {
        if line.system_id != current_system_id {
            // End of current block, check if it has multiple lines
            if i - start_idx > 1 {
                blocks.push(SystemBlock {
                    start_line_idx: start_idx,
                    end_line_idx: i - 1,
                    system_id: current_system_id,
                });
            }

            // Start new block
            current_system_id = line.system_id;
            start_idx = i;
        }
    }

    // Handle last block
    let last_idx = document.lines.len() - 1;
    if last_idx - start_idx >= 1 {
        blocks.push(SystemBlock {
            start_line_idx: start_idx,
            end_line_idx: last_idx,
            system_id: current_system_id,
        });
    }

    blocks
}

impl Default for LayoutEngine {
    fn default() -> Self {
        Self::new()
    }
}
