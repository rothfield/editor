//! Performance optimization utilities
//!
//! This module provides performance optimization utilities for the
//! Music Notation Editor.

/// Performance monitor for measuring operation times
pub struct PerformanceMonitor {
    measurements: std::collections::HashMap<String, Vec<f32>>,
}

impl PerformanceMonitor {
    pub fn new() -> Self {
        Self {
            measurements: std::collections::HashMap::new(),
        }
    }

    pub fn record_measurement(&mut self, operation: &str, duration_ms: f32) {
        self.measurements.entry(operation.to_string())
            .or_insert_with(Vec::new)
            .push(duration_ms);
    }

    pub fn get_average_time(&self, operation: &str) -> Option<f32> {
        self.measurements.get(operation).map(|times| {
            if times.is_empty() {
                0.0
            } else {
                times.iter().sum::<f32>() / times.len() as f32
            }
        })
    }
}

impl Default for PerformanceMonitor {
    fn default() -> Self {
        Self::new()
    }
}