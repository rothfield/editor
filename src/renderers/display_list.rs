//! Display List for Layout Rendering
//!
//! This module defines the output structure returned from the layout engine to JavaScript.
//! The DisplayList contains all pre-calculated positions, dimensions, and classes needed
//! for JavaScript to render DOM elements without any layout calculations.

use serde::{Serialize, Deserialize};
use std::collections::HashMap;

/// Top-level display list containing all rendering information
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct DisplayList {
    /// Optional document header (title, composer)
    pub header: Option<DocumentHeader>,

    /// All lines to render with their cells, lyrics, and tala
    pub lines: Vec<RenderLine>,
}

/// Document header information
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct DocumentHeader {
    /// Document title
    pub title: Option<String>,

    /// Composer/author name
    pub composer: Option<String>,
}

/// A single line with all its rendering information
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct RenderLine {
    /// Line index for identification
    pub line_index: usize,

    /// All cells in this line with positions and styles
    pub cells: Vec<RenderCell>,

    /// Optional line label
    pub label: Option<String>,

    /// Positioned lyrics syllables
    pub lyrics: Vec<RenderLyric>,

    /// Positioned tala characters
    pub tala: Vec<RenderTala>,

    /// Calculated height for this line
    pub height: f32,
}

/// A single cell with all rendering information
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct RenderCell {
    /// The character text to display
    pub char: String,

    /// X position (left edge)
    pub x: f32,

    /// Y position (top edge)
    pub y: f32,

    /// Width (including any padding for lyrics)
    pub w: f32,

    /// Height
    pub h: f32,

    /// CSS class names to apply
    pub classes: Vec<String>,

    /// Data attributes (data-* attributes)
    pub dataset: HashMap<String, String>,

    /// X position for cursor BEFORE this cell (at left edge)
    pub cursor_left: f32,

    /// X position for cursor AFTER this cell (at right edge of glyph, not allocated width)
    pub cursor_right: f32,

    /// X positions for cursor at each character boundary within this cell
    /// Length = glyph.chars().count() + 1
    /// [0] = before first char, [1] = after first char, ..., [n] = after last char
    pub char_positions: Vec<f32>,
}

/// A positioned lyric syllable
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct RenderLyric {
    /// Syllable text
    pub text: String,

    /// X position (horizontal center under cell)
    pub x: f32,

    /// Y position (top of text)
    pub y: f32,
}

/// A positioned tala character
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct RenderTala {
    /// Tala character (digit)
    pub text: String,

    /// X position (horizontal center above barline)
    pub x: f32,

    /// Y position (top of text)
    pub y: f32,
}
