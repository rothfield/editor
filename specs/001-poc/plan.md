# Implementation Plan: Music Notation Editor POC

**Branch**: `001-poc` | **Date**: 2025-10-11 | **Spec**: `/specs/001-poc/spec.md`
**Input**: Feature specification from `/specs/001-poc/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Create a Music Notation Editor POC using a Cell-based architecture for WYSIWYG editing of musical notation. The system will support dual pitch systems (Number and Western), keyboard-only editing, selection-based musical commands (slurs, octaves), and real-time beat derivation with visual rendering. Performance-critical operations (text processing, beat derivation) will be implemented in Rust/WASM, while the user interface will use JavaScript with modern ES6+ features and utility-based styling.

## Technical Context

**Language/Version**: Rust 1.75+ (WASM module), JavaScript ES6+ (ES2022+)
**Primary Dependencies**: wasm-bindgen (WASM interop), UnoCSS (styling), Playwright Python (testing)
**Storage**: JSON files for document persistence
**Testing**: Playwright (Python bindings) in headless mode for E2E testing
**Target Platform**: Web browsers with WASM support (modern browsers)
**Project Type**: Web application with WASM performance module
**Performance Goals**: <50ms typing latency, <10ms focus activation, <16ms navigation (60fps), <10ms beat derivation
**Constraints**: Single-line editing only, 16-point typeface, keyboard-only interaction model, <1s file operations
**Scale/Scope**: Up to 1,000 Cells per document, POC scope with extensibility for multi-line future

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Constitution Requirements Analysis

**✅ PASSING GATES:**
- **Development Environment**: Arch Linux + Fish shell - matches project setup
- **Core Technologies**: Rust (WASM) + JavaScript ES6+ - aligned with specification
- **File Organization**: Separate JS/CSS files, no embedded content - meets requirements
- **Testing Standards**: Playwright Python bindings, headless mode - specified in requirements
- **Performance Standards**: Response time targets (<10ms focus, <50ms typing, <16ms navigation) - defined in requirements
- **POC Scope Limitations**: Single line, 16-point typeface, keyboard-only - clearly defined
- **UI/UX Standards**: Menu-based navigation, focus management, UnoCSS - specified in requirements

**⚠️  RESEARCH NEEDED:**
- **UnoCSS Integration**: Best practices for utility-first CSS in music notation context
- **WASM Performance Optimization**: Rust compilation settings for <10ms beat derivation target
- **Grapheme Cluster Handling**: Intl.Segmenter API implementation for multi-character tokens
- **Cell Architecture**: Detailed data structure design for lanes and temporal columns
- **Beat Visualization**: Rendering approach for lower loops/arcs in browser context

## Project Structure

### Documentation (this feature)

```
specs/[###-feature]/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```
editor/
├── src/
│   ├── rust/              # WASM module source (performance-critical operations)
│   │   ├── lib.rs         # Main WASM library entry point
│   │   ├── models/        # Domain-driven data model organization
│   │   │   ├── core.rs    # Core Cell data structures
│   │   │   ├── elements.rs # Musical element definitions (Pitched, Unpitched, etc.)
│   │   │   ├── notation.rs # Notation-specific models (slurs, ornaments, beats)
│   │   │   ├── pitch.rs   # Pitch representation and conversion logic
│   │   │   ├── barlines.rs # Barline handling and beat separation
│   │   │   └── pitch_systems/ # Pitch system implementations
│   │   │       ├── number.rs    # Number system (1-7)
│   │   │       ├── western.rs   # Western system (cdefgab/CDEFGAB)
│   │   │       ├── sargam.rs    # Sargam system (S, R, G, M, P, D, N)
│   │   │       ├── bhatkhande.rs # Bhatkhande system
│   │   │       └── tabla.rs     # Tabla notation
│   │   ├── parse/         # Text processing and analysis
│   │   │   ├── cell.rs # Cell parsing and grapheme handling
│   │   │   ├── beats.rs    # Beat derivation algorithms
│   │   │   ├── tokens.rs   # Token recognition and validation
│   │   │   └── grammar.rs  # Musical grammar parsing
│   │   ├── renderers/     # Visual rendering and output formats
│   │   │   ├── layout.rs   # Position calculation and layout algorithms
│   │   │   ├── curves.rs   # Slur and arc rendering (Bézier curves)
│   │   │   ├── annotations.rs # Upper/lower annotation positioning
│   │   │   ├── svg/        # SVG rendering output
│   │   │   │   ├── elements.rs # SVG element rendering
│   │   │   │   └── document.rs # SVG document generation
│   │   │   ├── musicxml/   # MusicXML export (stub for POC)
│   │   │   │   ├── export.rs # MusicXML export functionality
│   │   │   │   └── attributes.rs # MusicXML attribute handling
│   │   │   └── lilypond/   # LilyPond export (stub for POC)
│   │   │       ├── export.rs # LilyPond export functionality
│   │   │       └── notation.rs # LilyPond notation mapping
│   │   └── utils/         # Utility functions and helpers
│   │       ├── grapheme.rs # Grapheme cluster handling
│   │       └── performance.rs # Performance optimization utilities
│   ├── js/                # JavaScript host application
│   │   ├── main.js        # Application entry point and initialization
│   │   ├── editor.js      # Core editor functionality and Cell management
│   │   ├── ui.js          # UI components and user interactions
│   │   └── utils.js       # JavaScript utilities and helper functions
│   ├── css/               # Separate CSS files (UnoCSS)
│   │   ├── main.css       # Main application styles
│   │   └── components.css # Component-specific styles
│   └── tests/             # Playwright Python tests
│       ├── e2e/           # End-to-end tests
│       ├── fixtures/      # Test data and fixtures
│       └── utils.py       # Test utilities and helpers
├── tests/                 # Additional test directories
│   ├── e2e/               # End-to-end tests
│   └── fixtures/          # Test data
├── Makefile               # Build orchestration and development commands
├── package.json           # Node.js dependencies and scripts
├── tsconfig.json          # TypeScript configuration (for JSDoc type checking)
├── eslint.config.js       # ESLint configuration for code quality
├── wasm-pack.toml         # Rust WASM packaging configuration
└── dist/                  # Built artifacts and distribution files
```

**Structure Decision**: Web application with WASM performance module. The Rust/WASM module handles performance-critical operations (text processing, beat derivation), while JavaScript manages the user interface and application logic. File organization follows constitution requirements with separate JS/CSS files and modular architecture.

## Complexity Tracking

*Fill ONLY if Constitution Check has violations that must be justified*

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |
