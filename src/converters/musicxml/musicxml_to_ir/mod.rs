//! MusicXML to IR converter
//!
//! This module converts MusicXML documents into the editor's Intermediate Representation (IR).
//! The IR can then be converted to the editor's Document model.
//!
//! # Architecture
//!
//! ```text
//! MusicXML String
//!   ↓ [Parse with roxmltree]
//! XML DOM
//!   ↓ [Extract musical data]
//! IR (Vec<ExportLine>)
//!   ↓ [Convert to spatial notation]
//! Document (Cell-based)
//! ```
//!
//! # Design Principles
//!
//! 1. **Preserve musical semantics**: Capture all essential musical information
//! 2. **Format-agnostic output**: Produce IR that matches export IR structure
//! 3. **Error handling**: Gracefully handle malformed or incomplete MusicXML
//! 4. **MusicXML 3.1 support**: Target the current MusicXML standard

pub mod parser;

pub use parser::{
    parse_musicxml_to_ir,
    MusicXMLParseError,
    MusicXMLParseResult,
};

#[cfg(test)]
#[path = "tests.rs"]
mod tests;
