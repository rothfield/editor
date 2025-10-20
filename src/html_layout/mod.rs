//! HTML Layout Engine
//!
//! This module computes layout for HTML/DOM rendering, generating a DisplayList
//! with all positioning, classes, and rendering data needed for JavaScript to render.

pub mod document;
pub mod line;
pub mod cell;
pub mod lyrics;
pub mod display_list;
pub mod curves;

pub use document::{LayoutEngine, LayoutConfig};
pub use display_list::{DisplayList, RenderLine, RenderCell, RenderLyric, RenderTala};
pub use lyrics::{parse_lyrics, distribute_lyrics, SyllableAssignment};
