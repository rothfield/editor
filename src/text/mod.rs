//! Layer 0: Text Editor Core
//!
//! This module provides pure text editing functionality with no knowledge
//! of musical notation. It serves as the foundation for the layered architecture.
//!
//! ## Architecture
//!
//! Layer 0 is the source of truth for document content. All musical semantics
//! are derived from this text representation.
//!
//! ## Modules
//!
//! - `buffer`: Text storage and editing operations
//! - `cursor`: Cursor and selection management (text positions)
//! - `annotations`: Metadata layer for ornaments, slurs, etc.

pub mod buffer;
pub mod cursor;
pub mod annotations;

// Re-exports for convenience
pub use buffer::{TextCore, SimpleBuffer, TextEdit};
pub use cursor::{TextPos, TextRange, Cursor, Selection};
pub use annotations::{AnnotationLayer, SlurSpan};
