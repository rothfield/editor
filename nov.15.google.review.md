# Code Review Report: Music Notation Editor

**Date**: November 15, 2025
**Reviewer**: Gemini CLI
**Focus**: WASM-First Architecture, Multi-Character Glyph Rendering, Code Consistency

---

## Overall Assessment

The codebase is undergoing a significant architectural shift towards a WASM-first, text-buffer-as-source-of-truth model, with a new approach to multi-character glyph rendering. While substantial progress has been made, there are several areas where the old and new architectures coexist, leading to potential inconsistencies, obsolete code, and areas for further refinement.

The "Multi-Character Glyph Rendering: Textual Mental Model with Visual Overlays" section in `CLAUDE.md` is a key directive, emphasizing that the DOM should hold the "textual truth" (e.g., "1#") while CSS overlays or composite glyphs handle the visual rendering. This is largely implemented in the font generation and rendering, but some older "continuation cell" logic still appears in the Rust `Cell` model and related parsing/rendering code.

The "IMPORTANT: WASM Function Integration Pattern" is well-adhered to in `src/js/core/WASMBridge.js`, which is a strong point.

---

## Detailed Findings and Recommendations

### 1. Rust Code (`src/**`)

*   **`src/api/cells.rs`**
    *   **Issue**: The `Cell` struct (from `src/models/core.rs`) still contains a `continuation` field, contradicting the new architecture's directive of "no continuation cells".
    *   **Recommendation**: **Remove the `continuation` field from the `Cell` struct in `src/models/core.rs`** and update all code that references it.
    *   **Issue**: `insert_character` and `parse_text` functions contain obsolete logging related to "marking continuations".
    *   **Recommendation**: Remove these `wasm_log!` and `wasm_info!` statements.
    *   **Issue**: `delete_character`'s logic needs to fully align with the "no continuation cells" model once `Cell.continuation` is removed.

*   **`src/api/core.rs`**
    *   **Issue**: The `editReplaceRange` function's ornament deletion protection checks `cell.has_ornament_indicator()`, which is a stub always returning `false`.
    *   **Recommendation**: Update this logic to correctly check `cell.ornament.is_some()`.
    *   **Issue**: "SMART INSERT" logic in `insertText` and "TWO-STAGE BACKSPACE/DELETE" logic in `deleteAtCursor`/`deleteForward` correctly handle multi-character glyphs.
    *   **Recommendation**: Verify this logic is robust for all multi-character glyphs and their `ElementKind`/`PitchCode` updates.

*   **`src/api/layered.rs`**
    *   **Issue**: `applyAnnotationSlursToCells` correctly syncs the annotation layer with the `Cell` model.
    *   **Recommendation**: Ensure this function is consistently called before any operation relying on `Cell.slur_indicator`.

*   **`src/api/position.rs`**
    *   **Issue**: Functions like `getMaxCharPosition` still contain comments referencing obsolete `Cell` fields (`ornament_indicator`, `continuation`).
    *   **Recommendation**: Once `Cell.continuation` and `Cell.ornament_indicator` are removed, simplify these functions to directly process all cells without filtering based on these fields.

*   **`src/converters/musicxml/musicxml_to_lilypond/converter.rs`**
    *   **Issue**: Chord processing logic in `convert_measure` seems overly complex given the "one cell = one glyph" model.
    *   **Recommendation**: Revisit and simplify chord processing.
    *   **Issue**: Grace note attributes in `convert_note` need to be fully mapped and used.
    *   **Recommendation**: Ensure all grace note attributes are correctly mapped and used.

*   **`src/converters/musicxml/musicxml_to_lilypond/lilypond.rs`**
    *   **Issue**: `collect_lyrics_content` and `collect_lyrics_from_music` correctly extract lyrics from the `Music` IR.
    *   **Recommendation**: Ensure lyric extraction handles multi-syllable words and `LyricSyllabic` types correctly.

*   **`src/html_layout/cell.rs`**
    *   **Issue**: `build_render_cell` correctly implements multi-character glyph rendering.
    *   **Recommendation**: This is a good implementation. Ensure `Cell.continuation` is removed from the `Cell` struct.
    *   **Issue**: `build_ornament_role_map` is a stub.
    *   **Recommendation**: Implement this to assign CSS classes for ornaments based on `cell.ornament`.

*   **`src/html_layout/line.rs`**
    *   **Issue**: `layout_cells_with_locked_ornaments` relies on stub functions (`extract_ornament_spans`, `find_anchor_cell`).
    *   **Recommendation**: Fully implement these stub functions to correctly position ornaments when `ornament_edit_mode` is `false`.

*   **`src/models/core.rs`**
    *   **CRITICAL ISSUE**: The `Cell` struct still contains `pub continuation: bool,` and `pub ornament_indicator: SlurIndicator,`. These are obsolete.
    *   **CRITICAL RECOMMENDATION**: **Remove `continuation` and `ornament_indicator` fields from the `Cell` struct.** This is the most significant inconsistency.
    *   **Issue**: `Cell.has_ornament_indicator()` is a stub.
    *   **Recommendation**: Remove this method once `ornament_indicator` is removed.

*   **`src/renderers/font_utils.rs`**
    *   **Issue**: Contains both legacy (formula-based) and new (lookup table-based) font API functions.
    *   **Recommendation**: Transition all code to use the new lookup table API (`glyph_for_pitch` and `pitch_from_glyph`). Deprecate/remove legacy functions.

*   **`src/renderers/musicxml/line_to_ir.rs`**
    *   **Issue**: `normalize_beat` and `beat_transition` functions contain comments referencing obsolete `Cell.continuation` field.
    *   **Recommendation**: Remove the `continuation` field from `Cell` and simplify these checks.

### 2. JavaScript Code (`src/js/**`, `index.html`)

*   **`index.html`**
    *   **Issue**: `font-test` and `font-sandbox` tabs are present for visual verification.
    *   **Recommendation**: This is a strong point for the project. Ensure all `data-testid` attributes from `CLAUDE.md` are present.

*   **`src/js/editor.js`**
    *   **Issue**: Correctly uses WASM as the source of truth for document state.
    *   **Recommendation**: Continue enforcing this pattern.
    *   **Issue**: `insertText`, `handleBackspace`, `handleDelete` correctly use WASM functions.
    *   **Recommendation**: This is good.

*   **`src/js/cell-renderer.js`**
    *   **Issue**: `renderCell` uses `this.getCompositeGlyphChar` for multi-character glyph rendering.
    *   **Recommendation**: This is a good implementation.
    *   **Issue**: `renderOrnamentalCell` is present, but its Rust counterpart is a stub.
    *   **Recommendation**: Fully wire this up once the Rust side is complete.

*   **`src/js/style-manager.js`**
    *   **Issue**: Correctly injects CSS for the new font system and barline glyphs.
    *   **Recommendation**: This is a good implementation.

*   **`src/js/measurement-service.js`**
    *   **Issue**: `getCompositeGlyphChar` duplicates Rust logic for measurements.
    *   **Recommendation**: This duplication is necessary; ensure it stays in sync with Rust.

*   **`src/js/coordinators/ClipboardCoordinator.js`**, **`CursorCoordinator.js`**, **`InspectorCoordinator.js`**, **`RenderCoordinator.js`**, **`SelectionCoordinator.js`**
    *   **Issue**: These coordinators correctly delegate to WASM as the source of truth.
    *   **Recommendation**: This is a good architectural pattern.

*   **`src/js/handlers/KeyboardHandler.js`**
    *   **Issue**: Correctly routes commands to WASM functions for musical operations.
    *   **Recommendation**: This is a good implementation.

*   **`src/js/lilypond-png-tab.js`**
    *   **Issue**: Correctly uses WASM for MusicXML export and LilyPond conversion.
    *   **Recommendation**: This is a good implementation.

*   **`src/js/osmd-renderer.js`**
    *   **Issue**: Uses IndexedDB caching for SVG renders.
    *   **Recommendation**: This is a good performance optimization.

*   **`src/js/core/WASMBridge.js`**
    *   **Issue**: Correctly wraps all WASM functions with error handling.
    *   **Recommendation**: This is a strong point of the architecture.

### 3. Tools Code (`tools/**`)

*   **`tools/fontgen/atoms.yaml`**
    *   **Issue**: `accidental_composites` and `accidental_octave_composites` are well-defined.
    *   **Recommendation**: This declarative approach to font configuration is good.

*   **`tools/fontgen/generate.py`**
    *   **Issue**: `create_accidental_composites` and `create_accidental_octave_composites` generate composite glyphs.
    *   **Recommendation**: This is a critical part of font generation; ensure precise positioning logic.

---

## Summary of Key Recommendations

1.  **Remove Obsolete `Cell` Fields**: **CRITICAL**: Remove `continuation` and `ornament_indicator` from `src/models/core.rs::Cell`. Update all dependent code.
2.  **Update Ornament Deletion Protection**: Modify `src/api/core.rs::editReplaceRange` to check `cell.ornament.is_some()`.
3.  **Implement `build_ornament_role_map`**: Complete `src/html_layout/line.rs::build_ornament_role_map`.
4.  **Implement `layout_cells_with_locked_ornaments`**: Fully implement `src/renderers/layout_engine.rs::layout_cells_with_locked_ornaments` and its stub dependencies.
5.  **Transition to New Font API**: Ensure all Rust code uses `glyph_for_pitch` and `pitch_from_glyph` from `src/renderers/font_utils.rs`.
6.  **Review LilyPond Conversion Logic**: Pay close attention to lyrics and tuplets in `src/converters/musicxml/musicxml_to_lilypond/converter.rs` and `lilypond.rs`.
7.  **Thorough Testing**: Comprehensive unit and E2E tests are crucial for all new and modified features.

---

The project is on a good path, but resolving the inconsistencies around the `Cell` struct and fully implementing the new ornament and layout logic are the most critical next steps.
