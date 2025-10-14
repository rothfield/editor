//! Error types for MusicXML conversion
//!
//! Defines the error hierarchy for conversion failures, with fatal errors
//! (ParseError) and internal errors that shouldn't occur in normal operation.

use thiserror::Error;

/// Top-level conversion error type
#[derive(Debug, Clone, Error)]
pub enum ConversionError {
    /// Fatal XML parsing error
    #[error("XML parsing failed: {0}")]
    ParseError(#[from] ParseError),

    /// Internal conversion error (should be rare, indicates a bug)
    #[error("Internal conversion error: {0}")]
    InternalError(String),
}

/// Fatal XML parsing errors
#[derive(Debug, Clone, Error)]
pub enum ParseError {
    /// XML is malformed (not well-formed)
    #[error("Invalid XML: {0}")]
    InvalidXml(String),

    /// MusicXML format not supported (e.g., timewise instead of partwise)
    #[error("Unsupported MusicXML format: {0}")]
    UnsupportedFormat(String),

    /// Required structural element is missing
    #[error("Missing required element: {0}")]
    MissingRequiredElement(String),
}
