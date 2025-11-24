//! Format converters
//!
//! This module contains converters between different music notation formats.

pub mod musicxml;
pub mod ir_to_document;

// Re-export for convenience
pub use ir_to_document::{
    ir_to_document,
    ConversionError as IRConversionError,
    ConversionResult as IRConversionResult,
};
