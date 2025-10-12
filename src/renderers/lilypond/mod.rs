//! LilyPond export (stub for POC)
//!
//! This module provides LilyPond export functionality.

pub mod export;
pub mod notation;

pub use export::*;
pub use notation::*;

/// LilyPond exporter
pub struct LilyPondExporter;

impl LilyPondExporter {
    pub fn export(_document: &crate::models::Document) -> Result<String, String> {
        Ok("LilyPond export not implemented in POC".to_string())
    }
}