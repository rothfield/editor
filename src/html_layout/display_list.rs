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

    /// Slur arcs to render (computed with line y-offset already factored in)
    #[serde(default)]
    pub slurs: Vec<RenderArc>,

    /// Beat loop arcs to render (computed with line y-offset already factored in)
    #[serde(default)]
    pub beat_loops: Vec<RenderArc>,

    /// Ornament arcs to render (very shallow, connecting anchor note to ornaments)
    #[serde(default)]
    pub ornament_arcs: Vec<RenderArc>,

    /// Positioned ornaments (when ornament_edit_mode is OFF)
    #[serde(default)]
    pub ornaments: Vec<RenderOrnament>,

    /// Positioned octave dots
    #[serde(default)]
    pub octave_dots: Vec<RenderOctaveDot>,
}

/// A rendered arc (slur or beat loop) with pre-computed bezier curve control points
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct RenderArc {
    /// Unique identifier for this arc
    pub id: String,

    /// Start X position (center of first note)
    pub start_x: f32,

    /// Start Y position (top/bottom of first note depending on direction)
    pub start_y: f32,

    /// End X position (center of last note)
    pub end_x: f32,

    /// End Y position (top/bottom of last note depending on direction)
    pub end_y: f32,

    /// Control point 1 X
    pub cp1_x: f32,

    /// Control point 1 Y
    pub cp1_y: f32,

    /// Control point 2 X
    pub cp2_x: f32,

    /// Control point 2 Y
    pub cp2_y: f32,

    /// Arc color (hex string)
    pub color: String,

    /// Arc direction: "up" for slurs, "down" for beat loops
    pub direction: String,
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

    /// Barline type if this is a barline cell (for SMuFL glyph rendering)
    /// Options: "single", "repeatLeft", "repeatRight", "doubleBar", or empty if not a barline
    #[serde(default)]
    pub barline_type: String,
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

    /// Whether this syllable is assigned to a pitched element
    /// false = unassigned (extra syllables with no notes)
    #[serde(default)]
    pub assigned: bool,
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

/// A positioned octave dot indicator
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct RenderOctaveDot {
    /// Dot text ("•" or "••")
    pub text: String,

    /// X position (centered over cell)
    pub x: f32,

    /// Y position (absolute, in same coordinate space as cells)
    pub y: f32,

    /// Letter spacing for double dots (2.0 for "••", 0.0 for "•")
    pub letter_spacing: f32,
}

/// A positioned ornament (when ornament_edit_mode is OFF)
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct RenderOrnament {
    /// Ornament character text
    pub text: String,

    /// X position (positioned relative to anchor note)
    pub x: f32,

    /// Y position (same as cells)
    pub y: f32,

    /// CSS class names to apply
    pub classes: Vec<String>,
}
