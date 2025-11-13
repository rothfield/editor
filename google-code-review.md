✦ Based on my review of the codebase, here are the top 10 recommended TODOs to improve the project's quality, maintainability, and feature completeness:

   1. Complete the JavaScript Refactoring
  The src/js/REFACTORING_SUMMARY.md outlines a plan to break down monolithic files like editor.js and ui.js into smaller, more focused modules. This is the highest
  priority task to improve code organization, testability, and maintainability on the frontend.

   2. Deprecate and Remove Legacy Rust APIs
  The Rust API contains "legacy" functions (e.g., applySlurLegacy) that pass entire data structures between JS and WASM. These should be removed in favor of the modern
  "WASM-first" approach where state is managed internally by WASM, reducing data transfer overhead and simplifying the JS code.

   3. Refactor the `core.rs` Module
  The src/api/core.rs file has become a "god module" containing a wide variety of unrelated functions. As noted in the source code, it should be broken up into more
  specific modules (e.g., document.rs, line.rs) to improve separation of concerns.

   4. Finalize the Ornament Feature Implementation
  The ornament system has been partially refactored from a marker-based system to a copy/paste workflow. The remaining legacy code and comments related to "ornament
  indicators" should be removed to finalize the new design and eliminate confusion.

   5. Complete the MusicXML to LilyPond Converter
  The converter located at src/converters/musicxml/musicxml_to_lilypond/ is explicitly marked as an "incomplete port". The code contains numerous placeholders for skipped
  elements (like "figured-bass"). Completing this feature is essential for robust LilyPond export functionality.

   6. Extract Inline CSS from `index.html`
  The index.html file contains a large, embedded <style> block. This should be moved to a separate .css file to improve code organization, enable browser caching, and make
  the styling easier to manage and maintain.

   7. Manage Third-Party JS Libraries via `package.json`
  The project includes third-party libraries like opensheetmusicdisplay directly in the dist folder. These should be managed through package.json to simplify dependency
  updates and integrate them into the existing Rollup build process.

   8. Consolidate JavaScript Constants Files
  There are two separate files for constants: src/js/constants.js and src/js/constants/editorConstants.js. These should be merged into a single source of truth to avoid
  duplication and ensure all configuration is centralized.

   9. Add Comprehensive Unit Tests for Critical Logic
  Complex areas, such as the multi-character glyph handling in src/api/cells.rs (marked with a "CRITICAL LOGIC" comment), are high-risk. These sections should be covered
  by an extensive suite of unit tests to ensure their behavior is correct and prevent future regressions.

   10. Implement Full Multi-Line Support
  Several comments throughout the codebase indicate that features like slurs and octave changes are limited to a single line. Adding support for multi-line selections and
  operations would significantly enhance the editor's capabilities.