//! Diagnostics module for editor error detection
//!
//! Generic diagnostic system that detects and reports editor errors.
//! Slurs are the first customer, but the system is designed for reuse
//! with other error types (invalid barlines, beat grouping errors, etc.)

pub mod slurs;

use serde::{Deserialize, Serialize};

/// Severity level for diagnostic marks
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum DiagnosticSeverity {
    Error,
    Warning,
    Info,
}

/// A diagnostic mark highlighting an issue at a specific location
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct DiagnosticMark {
    /// Line index in the document
    pub line: usize,
    /// Column (cell index) within the line
    pub col: usize,
    /// Length of the highlight (number of cells, default 1)
    pub len: usize,
    /// Severity level
    pub severity: DiagnosticSeverity,
    /// Kind identifier (e.g., "slur_orphan_begin", "slur_orphan_end")
    pub kind: String,
    /// Human-readable message
    pub message: String,
}

impl DiagnosticMark {
    /// Create a new diagnostic mark
    pub fn new(
        line: usize,
        col: usize,
        severity: DiagnosticSeverity,
        kind: impl Into<String>,
        message: impl Into<String>,
    ) -> Self {
        Self {
            line,
            col,
            len: 1,
            severity,
            kind: kind.into(),
            message: message.into(),
        }
    }

    /// Create with custom length (for range highlights)
    pub fn with_len(mut self, len: usize) -> Self {
        self.len = len;
        self
    }
}

/// Collection of diagnostic marks for an entire document
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct Diagnostics {
    /// All diagnostic marks
    pub marks: Vec<DiagnosticMark>,
}

impl Diagnostics {
    /// Create empty diagnostics
    pub fn new() -> Self {
        Self { marks: Vec::new() }
    }

    /// Add a mark
    pub fn add(&mut self, mark: DiagnosticMark) {
        self.marks.push(mark);
    }

    /// Extend with multiple marks
    pub fn extend(&mut self, marks: impl IntoIterator<Item = DiagnosticMark>) {
        self.marks.extend(marks);
    }

    /// Check if there are any errors
    pub fn has_errors(&self) -> bool {
        self.marks
            .iter()
            .any(|m| m.severity == DiagnosticSeverity::Error)
    }

    /// Check if there are any diagnostics
    pub fn is_empty(&self) -> bool {
        self.marks.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_diagnostic_mark_creation() {
        let mark = DiagnosticMark::new(
            0,
            5,
            DiagnosticSeverity::Error,
            "test_error",
            "Test error message",
        );

        assert_eq!(mark.line, 0);
        assert_eq!(mark.col, 5);
        assert_eq!(mark.len, 1);
        assert_eq!(mark.severity, DiagnosticSeverity::Error);
        assert_eq!(mark.kind, "test_error");
    }

    #[test]
    fn test_diagnostics_has_errors() {
        let mut diags = Diagnostics::new();
        assert!(!diags.has_errors());

        diags.add(DiagnosticMark::new(
            0,
            0,
            DiagnosticSeverity::Warning,
            "warn",
            "Warning",
        ));
        assert!(!diags.has_errors());

        diags.add(DiagnosticMark::new(
            0,
            1,
            DiagnosticSeverity::Error,
            "err",
            "Error",
        ));
        assert!(diags.has_errors());
    }
}
