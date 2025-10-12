//! Slur and arc rendering (Bézier curves)
//!
//! This module provides curve rendering for slurs and other
//! musical notation elements using Bézier curves.

/// Curve renderer for slurs and musical arcs
pub struct CurveRenderer;

impl CurveRenderer {
    /// Calculate Bézier curve control points for slur
    pub fn calculate_slur_curve(start_x: f32, start_y: f32, end_x: f32, end_y: f32, curvature: f32) -> Vec<(f32, f32)> {
        let width = end_x - start_x;
        let height = width * curvature;
        let mid_x = (start_x + end_x) / 2.0;
        let mid_y = (start_y + end_y) / 2.0 - height;

        vec![
            (start_x, start_y),     // Start point
            (mid_x, mid_y),         // Control point
            (end_x, end_y),         // End point
        ]
    }

    /// Generate SVG path for slur curve
    pub fn generate_slur_path(start_x: f32, start_y: f32, end_x: f32, end_y: f32, curvature: f32) -> String {
        let control_points = Self::calculate_slur_curve(start_x, start_y, end_x, end_y, curvature);
        format!("M {} {} Q {} {} {} {}",
               start_x, start_y,
               control_points[1].0, control_points[1].1,
               end_x, end_y)
    }
}