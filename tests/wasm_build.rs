//! WASM build test
//!
//! This module tests that the WASM module can be built and basic functionality works.

use ecs_editor_wasm::*;
use wasm_bindgen_test::*;

wasm_bindgen_test_configure!(run_in_browser);

#[wasm_bindgen_test]
fn test_editor_creation() {
    let editor = MusicNotationEditor::new();
    // Test that editor can be created without panicking
    assert!(true); // If we reach here, creation succeeded
}

#[wasm_bindgen_test]
fn test_editor_initialization() {
    let mut editor = MusicNotationEditor::new();
    let result = editor.initialize();
    assert!(result.is_ok());
}

#[wasm_bindgen_test]
fn test_basic_notation_parsing() {
    let mut editor = MusicNotationEditor::new();
    editor.initialize().unwrap();

    let result = editor.parse_text("123");
    assert!(result.is_ok());
}

#[wasm_bindgen_test]
fn test_pitch_system_conversion() {
    let editor = MusicNotationEditor::new();

    // Test number to western conversion
    let result = editor.convert_pitch_system("1", 1, 2); // Number to Western
    assert!(result.is_ok());

    if let Ok(western_note) = result {
        assert_eq!(western_note, "c");
    }
}

#[wasm_bindgen_test]
fn test_cursor_position() {
    let mut editor = MusicNotationEditor::new();
    editor.initialize().unwrap();

    let result = editor.set_cursor_position(0, 1, 5); // line 0, letter lane, column 5
    assert!(result.is_ok());

    let position = editor.get_cursor_position();
    assert!(position.is_ok());
}

#[wasm_bindgen_test]
fn test_document_validation() {
    let mut editor = MusicNotationEditor::new();
    editor.initialize().unwrap();
    editor.parse_text("123").unwrap();

    let result = editor.validate_document();
    assert!(result.is_ok());

    if let Ok(is_valid) = result {
        assert!(is_valid);
    }
}

#[wasm_bindgen_test]
fn test_performance_metrics() {
    let editor = MusicNotationEditor::new();
    editor.initialize().unwrap();

    let result = editor.get_performance_metrics();
    assert!(result.is_ok());
}