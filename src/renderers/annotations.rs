//! Upper/lower annotation positioning
//!
//! This module provides positioning logic for musical annotations
//! in the upper and lower lanes.

use crate::models::*;

/// Annotation renderer for upper and lower annotations
pub struct AnnotationRenderer;

impl AnnotationRenderer {
    /// Calculate position for upper annotation
    pub fn calculate_upper_position(base_x: f32, base_y: f32, font_size: f32) -> (f32, f32) {
        let offset_y = -font_size * 0.8;
        (base_x, base_y + offset_y)
    }

    /// Calculate position for lower annotation
    pub fn calculate_lower_position(base_x: f32, base_y: f32, font_size: f32) -> (f32, f32) {
        let offset_y = font_size * 0.4;
        (base_x, base_y + offset_y)
    }

    /// Calculate octave dot position
    pub fn calculate_octave_position(base_x: f32, base_y: f32, font_size: f32, octave_display: OctaveDisplay) -> (f32, f32, f32) {
        let (x, y) = match octave_display {
            OctaveDisplay::Above => Self::calculate_upper_position(base_x, base_y, font_size),
            OctaveDisplay::Below => Self::calculate_lower_position(base_x, base_y, font_size),
            OctaveDisplay::None => (base_x, base_y),
        };

        let size = font_size * 0.2; // Octave dot size
        (x, y, size)
    }
}