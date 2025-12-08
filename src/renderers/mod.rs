//! Renderers module for the Music Notation Editor
//!
//! This module contains rendering/export logic for converting
//! musical notation into various output formats.

pub mod musicxml;
pub mod midi;
pub mod layout_engine;
pub mod display_list;
pub mod lyrics;
pub mod curves;
pub mod font_utils;
pub mod line_variants;

// Re-export commonly used types
pub use musicxml::*;
pub use layout_engine::{
    OrnamentSpan,
    OrnamentGroups,
    extract_ornament_spans,
    find_anchor_cell,
    BoundingBox,
    detect_collisions,
    layout_with_collision_detection,
};
// Lookup table API (lookup-based, handles accidentals and octaves in one call)
pub use font_utils::{glyph_for_pitch, pitch_from_glyph};
// Line variant API
pub use line_variants::{
    get_line_variant_codepoint,
    UnderlineState,
    OverlineState,
    is_line_capable,
};