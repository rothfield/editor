//! Modern API for setting tala (works with internal DOCUMENT)

use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};
use crate::api::helpers::lock_document;
use crate::wasm_info;

/// Result of setting tala
#[derive(Serialize, Deserialize)]
pub struct SetTalaResult {
    /// Line number
    pub line: usize,

    /// The tala value that was set
    pub tala: String,

    /// Success flag
    pub success: bool,

    /// Error message (if success = false)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Set tala for a line (modern API - uses internal DOCUMENT)
///
/// ## Architecture
/// - Operates directly on internal DOCUMENT mutex
/// - No document passing back and forth
/// - No state preservation needed
///
/// ## Parameters
/// - `line_index`: Line number (0-based)
/// - `tala`: Tala string (digits 0-9+)
///
/// ## Returns
/// JSON object with result:
/// ```json
/// {
///   "line": 0,
///   "tala": "1234",
///   "success": true
/// }
/// ```
#[wasm_bindgen(js_name = setLineTalaModern)]
pub fn set_line_tala_modern(line_index: usize, tala: &str) -> JsValue {
    wasm_info!("setLineTalaModern called: line_index={}, tala='{}'", line_index, tala);

    // Lock document
    let mut doc_guard = match lock_document() {
        Ok(guard) => guard,
        Err(e) => {
            let result = SetTalaResult {
                line: line_index,
                tala: tala.to_string(),
                success: false,
                error: Some(format!("Failed to lock document: {:?}", e)),
            };
            return serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL);
        }
    };

    // Get mutable document
    let document = match doc_guard.as_mut() {
        Some(doc) => doc,
        None => {
            let result = SetTalaResult {
                line: line_index,
                tala: tala.to_string(),
                success: false,
                error: Some("No document loaded".to_string()),
            };
            return serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL);
        }
    };

    // Validate line index
    if line_index >= document.lines.len() {
        let result = SetTalaResult {
            line: line_index,
            tala: tala.to_string(),
            success: false,
            error: Some(format!("Invalid line index: {}", line_index)),
        };
        return serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL);
    }

    // Set tala
    document.lines[line_index].tala = tala.to_string();

    wasm_info!("setLineTalaModern completed successfully");

    let result = SetTalaResult {
        line: line_index,
        tala: tala.to_string(),
        success: true,
        error: None,
    };

    serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL)
}
