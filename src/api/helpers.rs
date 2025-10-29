//! Shared helpers for WASM API operations
//!
//! This module contains common patterns and utilities for serialization,
//! deserialization, error handling, and validation across all API operations.

use wasm_bindgen::prelude::*;
use serde::de::DeserializeOwned;
use serde::Serialize;

// ============================================================================
// Console Logging Functions
// ============================================================================

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console)]
    fn log(s: &str);

    #[wasm_bindgen(js_namespace = console)]
    fn info(s: &str);

    #[wasm_bindgen(js_namespace = console)]
    fn warn(s: &str);

    #[wasm_bindgen(js_namespace = console)]
    fn error(s: &str);
}

// ============================================================================
// Logging Macros
// ============================================================================

/// Log a debug message with [WASM] prefix
#[macro_export]
macro_rules! wasm_log {
    ($($arg:tt)*) => {
        $crate::api::helpers::log_debug(&format!($($arg)*))
    };
}

/// Log an info message with [WASM] prefix
#[macro_export]
macro_rules! wasm_info {
    ($($arg:tt)*) => {
        $crate::api::helpers::log_info(&format!($($arg)*))
    };
}

/// Log a warning message with [WASM] ⚠️ prefix
#[macro_export]
macro_rules! wasm_warn {
    ($($arg:tt)*) => {
        $crate::api::helpers::log_warn(&format!($($arg)*))
    };
}

/// Log an error message with [WASM] ❌ prefix
#[macro_export]
macro_rules! wasm_error {
    ($($arg:tt)*) => {
        $crate::api::helpers::log_error(&format!($($arg)*))
    };
}

// ============================================================================
// Logging Helper Functions (called by macros)
// ============================================================================

pub fn log_debug(msg: &str) {
    log(&format!("[WASM] {}", msg));
}

pub fn log_info(msg: &str) {
    info(&format!("[WASM] {}", msg));
}

pub fn log_warn(msg: &str) {
    warn(&format!("[WASM] ⚠️ {}", msg));
}

pub fn log_error(msg: &str) {
    error(&format!("[WASM] ❌ {}", msg));
}

// ============================================================================
// Serialization/Deserialization Helpers
// ============================================================================

/// Deserialize a value from JavaScript with automatic error handling
pub fn deserialize<T: DeserializeOwned>(
    value: JsValue,
    error_context: &str,
) -> Result<T, JsValue> {
    serde_wasm_bindgen::from_value(value).map_err(|e| {
        let msg = format!("{}: {}", error_context, e);
        log_error(&msg);
        JsValue::from_str(&msg)
    })
}

/// Serialize a value to JavaScript with automatic error handling
pub fn serialize<T: Serialize>(value: &T, error_context: &str) -> Result<JsValue, JsValue> {
    serde_wasm_bindgen::to_value(value).map_err(|e| {
        let msg = format!("{}: {}", error_context, e);
        log_error(&msg);
        JsValue::from_str(&msg)
    })
}

// ============================================================================
// Validation Helpers
// ============================================================================

/// Validate that a selection range is valid
pub fn validate_selection_range(start: usize, end: usize, max_length: usize) -> Result<(), String> {
    if start >= end {
        return Err(format!("Invalid selection range: start {} >= end {}", start, end));
    }

    if start >= max_length {
        return Err(format!(
            "Start position {} out of bounds (max: {})",
            start,
            max_length.saturating_sub(1)
        ));
    }

    Ok(())
}

/// Validate that an index is within bounds
pub fn validate_index(index: usize, max_length: usize, context: &str) -> Result<(), String> {
    if index >= max_length {
        return Err(format!(
            "{} index {} out of bounds (max: {})",
            context,
            index,
            max_length.saturating_sub(1)
        ));
    }

    Ok(())
}

/// Convert pitch system number to enum
pub fn pitch_system_from_u8(ps: u8) -> crate::models::PitchSystem {
    use crate::models::PitchSystem;

    match ps {
        1 => PitchSystem::Number,
        2 => PitchSystem::Western,
        3 => PitchSystem::Sargam,
        4 => PitchSystem::Bhatkhande,
        5 => PitchSystem::Tabla,
        _ => PitchSystem::Unknown,
    }
}

/// Validate pitch system value
pub fn validate_pitch_system(ps: u8) -> Result<(), String> {
    if ps > 5 {
        return Err(format!("Invalid pitch system value: {} (must be 0-5)", ps));
    }
    Ok(())
}

/// Validate octave value
pub fn validate_octave(octave: i8) -> Result<(), String> {
    if ![-1, 0, 1].contains(&octave) {
        return Err(format!(
            "Invalid octave value: {} (must be -1, 0, or 1)",
            octave
        ));
    }
    Ok(())
}

/// Validate tala format (only digits 0-9 and +)
pub fn validate_tala(tala: &str) -> Result<(), String> {
    if !tala.is_empty() && !tala.chars().all(|c| c.is_ascii_digit() || c == '+') {
        return Err(format!(
            "Invalid tala format: '{}' (only digits 0-9, + allowed, or empty to clear)",
            tala
        ));
    }
    Ok(())
}

// ============================================================================
// Result Conversion Helpers
// ============================================================================

/// Convert a validation error to a JsValue
pub fn validation_error(msg: impl Into<String>) -> JsValue {
    let msg = msg.into();
    log_error(&msg);
    JsValue::from_str(&msg)
}
