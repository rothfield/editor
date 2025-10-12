//! MusicXML export (stub for POC)
//!
//! This module provides MusicXML export functionality.

pub mod export;
pub mod attributes;

pub use export::*;
pub use attributes::*;

/// MusicXML exporter
pub struct MusicXMLExporter;

impl MusicXMLExporter {
    pub fn export(_document: &crate::models::Document) -> Result<String, String> {
        Ok("MusicXML export not implemented in POC".to_string())
    }
}