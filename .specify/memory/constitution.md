<!--
Sync Impact Report:
Version change: 1.5.0 → 1.5.1 (Clarifying WASM API exposure requirements)
Modified principles: None
Added principles: None
Added sections:
  - New bullet in WASM/Rust Integration Standards: "WASM API Exposure"
  - Clarifies when Rust functions must be exposed via #[wasm_bindgen] in api.rs
Removed sections: None
Templates requiring updates:
  - None (clarification of existing practice)
Follow-up TODOs:
  - Review existing Rust modules for functions that should be in WASM API
  - Ensure all JavaScript-callable functions are properly exposed
-->

# Music Notation Editor POC Constitution

**Version**: 1.5.1
**Ratified**: 2025-10-11
**Last Amended**: 2025-10-24
**Purpose**: Define development environment, standards, principles, and governance for the Music Notation Editor POC project

## Core Principles

### I. Performance First
Every performance-critical operation MUST be implemented in Rust/WASM. JavaScript host application handles UI and orchestration only. All text processing, beat derivation, layout calculations, and rendering (including coordinate calculation, positioning logic, and bounding box computation) execute in WASM for optimal performance.

**Rationale**: Meeting sub-16ms response time targets requires compiled code for computational tasks. WASM provides near-native performance while maintaining web platform compatibility. Rendering logic in particular (coordinate calculation, positioning, measurements) MUST be in WASM to ensure consistent, high-performance calculations that can be reused across dialog preview and final output without duplication or divergence.

### II. Test-Driven Development (NON-NEGOTIABLE)
All features MUST have comprehensive end-to-end tests written and approved BEFORE implementation. Tests run in headless mode using Playwright Python bindings. No feature is considered complete without passing E2E tests. **E2E tests MUST execute through the compiled WASM module** - tests that bypass WASM (e.g., testing only lilypond-service or JavaScript APIs) do not validate the full integration and are insufficient.

**MANDATORY**: Before completing ANY new feature, at minimum ONE end-to-end test MUST be written and MUST pass that demonstrates the complete user workflow from start to finish. This test MUST run in Docker using the provided playwright container to ensure cross-platform compatibility. Developers MUST execute `./scripts/run-tests-docker.sh [test-file]` and verify test success before marking any feature as complete.

**Rationale**: Headless E2E testing ensures CI/CD compatibility and provides confidence in user-facing functionality. Test-first development prevents regressions and validates requirements. WASM-inclusive E2E tests verify the entire integration from data model through rendering, ensuring that template changes, converter logic, and WASM compilation are all validated before merge. Running tests in Docker guarantees consistency across development environments and prevents "works on my machine" issues.

### III. User Experience Focus
Focus management MUST return to editor canvas immediately after any UI interaction (menu operations, tab switching). All keyboard operations MUST meet 60fps target (< 16ms latency). Cursor activation MUST be immediate upon focus.

**Rationale**: Musical notation input requires uninterrupted flow. Any delay or focus disruption breaks the user's creative process.

### IV. Clean Architecture
No embedded JavaScript or CSS in HTML files. All code MUST reside in separate, properly organized files. Rust modules organized by domain (models, parse, renderers, utils). JavaScript organized by responsibility (editor, ui, renderer, events, file-ops).

**Rationale**: External file organization enables maintainability, code reuse, and proper separation of concerns. Clear module boundaries reduce cognitive load.

### V. Developer Experience
Rich debugging information MUST be provided through dedicated console tabs (Errors, Log). Comprehensive data structure display MUST show both ephemeral (runtime state) and persistent (saveable) models. Performance metrics MUST be logged for all critical operations.

**Rationale**: Developer tools accelerate debugging and enable performance optimization. Transparency into internal state reduces troubleshooting time.

### VI. Standards Compliance
Code organization follows documented file structure exactly. JavaScript uses ES6+ modern syntax with proper error handling. Rust follows domain-driven design with clear module boundaries. UnoCSS for all styling with utility-first approach.

**Rationale**: Consistent code organization and standards reduce onboarding time and prevent architectural drift.

### VII. No Fallbacks - Implementation Excellence (NON-NEGOTIABLE)
All implementations MUST be done correctly the first time. No JavaScript fallbacks for WASM functionality. No partial implementations that rely on degraded behavior. If WASM/Rust cannot provide the functionality, the feature MUST NOT be implemented until proper WASM support exists. Fallback code indicates architectural failure and technical debt accumulation.

**Rationale**: JavaScript fallbacks for WASM operations defeat Performance First principle and create maintenance burden. Partial implementations that "sort of work" lead to undefined behavior, difficult debugging, and user confusion. Doing it right the first time saves debugging time, prevents technical debt, and maintains architectural integrity. Quality over speed of delivery.

### VIII. MusicXML First - Standardized Interchange Format
MusicXML is the primary interchange format for all musical notation created in this editor. Every feature MUST be designed with full MusicXML import/export capability in mind. All note entry methods, ornaments, annotations, performance directives, and musical constructs MUST have corresponding MusicXML representations. Features that cannot be cleanly mapped to MusicXML MUST be explicitly reviewed, documented, and approved with clear justification for the limitation. MusicXML compatibility MUST be validated during development alongside functional testing.

**Rationale**: MusicXML is the de facto industry standard for music notation interchange, enabling seamless interoperability with professional music software (Finale, Sibelius, MuseScore, Dorico, notation software, publishing tools). By making MusicXML compatibility a core design principle, we ensure users can freely exchange their compositions without data loss, format corruption, or vendor lock-in. This establishes the editor as a first-class participant in the broader music software ecosystem. MusicXML-first design also provides a clear, unambiguous reference specification for musical features and helps identify under-specified musical concepts early in development. Making it explicit in the constitution ensures that every architectural decision considers its impact on interoperability, preventing the accumulation of "MusicXML-incompatible" features that would require costly refactoring later.

### IX. Export Strategy - Leverage Ecosystem Tools
MusicXML is the primary export target. For other formats (Lilypond, PDF, MEI, etc.), prefer using existing MusicXML → format converters rather than maintaining parallel exporters. Only implement direct exporters when: (1) No reliable converter exists, (2) MusicXML roundtrip loses critical information, or (3) Performance requirements demand it.

**Rationale**: Reduces maintenance burden by leveraging mature ecosystem tools (e.g., `musicxml2ly` for Lilypond conversion, `verovio` for MEI). Ensures MusicXML representation stays comprehensive and standards-compliant by making it the single source of truth. Prevents code duplication and divergence between parallel export paths. Focuses development effort on MusicXML quality rather than maintaining multiple format-specific exporters.

## Development Environment

### Operating System & Shell
- **Primary OS**: Arch Linux
- **Shell**: Fish shell
- **Package Manager**: Pacman (with yay for AUR packages when needed)

### Core Technologies
- **Language**: Rust 1.75+ (WASM module) + JavaScript ES2022+ (host application)
- **Runtime**: Node.js 18+
- **WASM Bindings**: wasm-bindgen 0.2.92
- **Music Rendering**: OSMD (OpenSheetMusicDisplay) 1.7.6
- **Styling**: UnoCSS (utility-first CSS framework)
- **Testing**: Playwright (Python bindings) in headless mode
- **Build System**: Makefile + wasm-pack
- **Type Safety**: TypeScript/JSDoc for JavaScript, wasm-bindgen for Rust-JavaScript interop

### Development Tools
- **Editor**: User's preferred code editor
- **Browser**: Modern browser with WASM support for testing
- **Terminal**: Fish shell with Arch Linux environment
- **Version Control**: Git

## Code Organization Standards

### File Structure
```
music-notation-editor/
├── src/
│   ├── rust/              # WASM module source (performance-critical operations)
│   │   ├── lib.rs         # Main WASM library entry point
│   │   ├── api.rs         # JavaScript-facing WASM API
│   │   ├── models/        # Domain-driven data model organization
│   │   │   ├── core.rs    # Core Cell data structures
│   │   │   ├── elements.rs # Musical element definitions
│   │   │   ├── notation.rs # Notation-specific models
│   │   │   ├── pitch.rs   # Pitch representation and conversion
│   │   │   ├── barlines.rs # Barline handling and beat separation
│   │   │   └── pitch_systems/ # Pitch system implementations
│   │   │       ├── number.rs    # Number system (1-7)
│   │   │       ├── western.rs   # Western system (cdefgab/CDEFGAB)
│   │   │       ├── sargam.rs    # Sargam system
│   │   │       ├── bhatkhande.rs # Bhatkhande system
│   │   │       └── tabla.rs     # Tabla notation
│   │   ├── parse/         # Text processing and analysis
│   │   │   ├── grammar.rs # Musical grammar parsing (recursive descent)
│   │   │   ├── tokens.rs  # Token recognition and validation
│   │   │   └── pitch_system.rs # Pitch system parsing
│   │   ├── renderers/     # Visual rendering and output formats
│   │   │   ├── curves.rs  # Slur and arc rendering (Bézier curves)
│   │   │   ├── svg/       # SVG rendering output
│   │   │   │   ├── elements.rs # SVG element rendering
│   │   │   │   └── document.rs # SVG document generation
│   │   │   ├── musicxml/  # MusicXML export
│   │   │   │   ├── export.rs # MusicXML export functionality
│   │   │   │   └── attributes.rs # MusicXML attribute handling
│   │   │   └── lilypond/  # LilyPond export
│   │   │       ├── export.rs # LilyPond export functionality
│   │   │       ├── notation.rs # LilyPond notation mapping
│   │   │       └── mod.rs # LilyPond module
│   │   ├── musicxml_import.rs # MusicXML import functionality
│   │   └── utils/         # Utility functions and helpers
│   │       └── performance.rs # Performance optimization utilities
│   ├── js/                # JavaScript host application
│   │   ├── main.js        # Application entry point and initialization
│   │   ├── editor.js      # Core editor functionality and Cell management
│   │   ├── ui.js          # UI components and user interactions
│   │   ├── renderer.js    # DOM-based rendering system
│   │   ├── osmd-renderer.js # OSMD integration for music notation rendering
│   │   ├── events.js      # Event handling and keyboard management
│   │   ├── file-ops.js    # File operations and document persistence
│   │   ├── document-manager.js # Document state management
│   │   ├── lyrics-renderer.js # Lyrics rendering
│   │   ├── midi-player.js # MIDI playback functionality
│   │   └── constants.js   # Application constants
│   └── tests/             # Playwright Python tests
│       ├── e2e/           # End-to-end tests
│       ├── fixtures/      # Test data
│       └── utils.py       # Test utilities
├── tests/                 # Additional test directories
│   ├── e2e/               # End-to-end tests
│   └── fixtures/          # Test data
├── docs/                  # Documentation
├── Makefile               # Build orchestration
├── package.json           # Node.js dependencies and scripts
├── Cargo.toml             # Rust dependencies
├── index.html             # Main HTML entry point
└── dist/                  # Built artifacts
    ├── pkg/               # WASM build output (CANONICAL LOCATION)
    ├── main.js            # Bundled JavaScript
    └── main.css           # Generated CSS
```

### File Separation Requirements
- **No embedded JavaScript or CSS in HTML**
- All styles in separate `.css` files using UnoCSS
- All JavaScript in separate `.js` files with ES6 modules
- WASM module as separate `.wasm` file
- TypeScript definitions for WASM module integration
- Proper module bundling with tree-shaking
- **Direct module imports preferred** - avoid unnecessary mod.rs files

### JavaScript Standards
- **Modern Syntax**: ES6+ (ES2022+) with const/let, arrow functions, template literals
- **Modules**: ES6 import/export with proper dependency management
- **Async/Await**: For all asynchronous operations instead of Promise chains
- **Error Handling**: Try/catch blocks with proper Error objects
- **DOM APIs**: Modern querySelector, classList, dataset, event handling
- **Array Methods**: map, filter, reduce, forEach, find, etc.
- **Type Safety**: TypeScript or comprehensive JSDoc annotations
- **Memory Management**: Proper cleanup, event listener removal, no memory leaks
- **Code Quality**: ESLint compliance, consistent naming, maintainable structure

### WASM/Rust Integration Standards
- **Compilation**: wasm-bindgen for type-safe JavaScript interop
- **Performance**: Critical operations (text processing, beat derivation) in Rust/WASM
- **Memory Management**: Proper WASM module lifecycle management
- **Error Handling**: Comprehensive error handling across JavaScript-WASM boundary
- **Data Transfer**: Efficient serialization/deserialization between JavaScript and WASM
- **Module Loading**: WebAssembly.instantiateStreaming with proper caching
- **Optimization**: Release builds with optimal compilation settings
- **No Fallbacks**: JavaScript MUST NOT implement fallback versions of WASM functionality
- **WASM API Exposure**: When creating Rust functions, ALWAYS check if JavaScript needs to call them. If so, the function MUST be exposed through the WASM API (src/api.rs) with #[wasm_bindgen] annotation. Internal Rust functions stay in their respective modules; only JavaScript-facing functions go in api.rs.

## Testing Standards

### E2E Testing with Playwright
- **All features MUST have comprehensive E2E tests**
- **Tests run in headless mode** (no visual inspection required)
- **Python Playwright bindings** for test implementation
- **Makefile orchestration** for test execution
- **WASM MUST be built before E2E test execution** - tests that bypass WASM do not validate the full feature integration
- **Test scenarios MUST exercise the complete pipeline**: user action → WASM processing → rendering output

### Test Coverage Requirements
- Basic music notation entry (Number and Western pitch systems)
- Keyboard navigation and selection
- Focus management and cursor behavior
- Selection-based commands (slur, octave)
- Deletion operations
- UI components (menus, tabs)
- Data structure display
- Error handling and logging
- File operations

## Performance Standards

### Response Time Targets
- Focus activation: < 10ms
- Typing latency: < 50ms
- Arrow key navigation: < 16ms (60fps)
- Beat derivation: < 10ms
- Tab switching: < 50ms focus return
- Document tab updates: < 100ms

### Resource Limits
- Single line support only (POC scope)
- 16-point typeface rendering
- Up to 1,000 Cells per document

## UI/UX Standards

### Focus Management
- **Automatic focus return** to editor canvas after:
  - Menu operations
  - Tab switching
  - Any UI interaction
- **Immediate cursor activation** when canvas receives focus

### Interface Design
- **Menu-based navigation** for all functions
- **Tab group** below editor:
  - Ephemeral Model tab (runtime state + data)
  - Persistent Model tab (saveable data only)
  - Console Errors tab
  - Console Log tab
- **UnoCSS** for all styling
- **Monospace font** for predictable positioning

## Musical Notation Standards

### Pitch Systems
- **Default**: Number system (1-7)
- **Alternative**: Western system (cdefgab/CDEFGAB)
- **Additional**: Sargam, Bhatkhande, Tabla
- **Support**: Accidentals (##, bb) and octave numbers

### Data Model
- **Cell**: Core data structure (one visible grapheme cluster)
- **Temporal vs Non-temporal**: Clear separation
- **Implicit beats**: Derived from contiguous temporal elements
- **Octave display**: Range -4 to +4 (dots above/below)
- **Ephemeral vs Persistent**: Rendering fields (x, y, w, h, bbox, hit) marked with #[serde(skip)] in Rust

## Development Workflow

### Build Process
- **Makefile** orchestrates all build steps
- **Rust compilation** to WASM for performance-critical code (make build-wasm or wasm-pack build)
  - **CANONICAL WASM OUTPUT**: `dist/pkg/` (referenced by index.html)
  - Build command: `wasm-pack build . --target web --out-dir dist/pkg`
  - DO NOT use `static/pkg` or any other output directory
- **JavaScript bundling** for host application (make build-js)
- **UnoCSS processing** for styles (make build-css)
- **Testing** automated via Makefile targets (make test)

### Quality Assurance
- **E2E tests** run before each commit
- **Headless testing** ensures CI/CD compatibility
- **Coverage reports** generated for all feature areas
- **Performance benchmarks** validate response time targets

## Technical Constraints

### POC Scope Limitations
- Single line of musical notation only (with multi-line support via OSMD for rendering)
- Fixed 16-point typeface (Cell-based editor)
- Keyboard-only interaction model for Cell editor (mouse support via OSMD)
- JSON file format for document persistence
- MusicXML export/import via OSMD

### Browser Compatibility
- Modern browsers with WASM support
- Intl.Segmenter API for grapheme clustering
- ES6+ JavaScript features
- WebAudio API for MIDI playback

## Success Metrics

### Functional Success
- 95% correct notation rendering
- 100% accurate musical operations
- Complete focus management functionality
- Full E2E test coverage
- Full MusicXML import/export roundtrip fidelity (95%+ data preservation)
- Zero loss of musical meaning in MusicXML interchange

### Performance Success
- All response time targets met
- Headless test execution < 30 seconds
- Resource usage within specified limits
- No memory leaks in long-running sessions
- MusicXML export time < 500ms for typical compositions

### Interoperability Success
- All created notation renders correctly in MuseScore, Finale, Sibelius
- MusicXML files can be imported from all major notation applications
- Feature compatibility matrix maintained and updated per release
- Zero unspecified features that break MusicXML interchange

### Development Success
- Clean, maintainable codebase
- Comprehensive documentation
- Automated testing and quality gates
- Smooth developer experience
- MusicXML compatibility verified as part of code review process

## Governance

### Version Policy
This constitution follows semantic versioning (MAJOR.MINOR.PATCH):
- **MAJOR**: Backward incompatible changes to principles or governance
- **MINOR**: Addition of new principles, sections, or substantial guidance
- **PATCH**: Clarifications, wording improvements, non-semantic refinements

### Amendment Procedure
1. **Proposal**: Any project member may propose constitutional amendments
2. **Review**: Amendment must be reviewed against existing principles and project goals
3. **Impact Assessment**: Evaluate effects on existing code, documentation, and workflows
4. **Approval**: Constitutional amendments require consensus among active contributors
5. **Documentation**: Update version number and sync impact report
6. **Propagation**: Update dependent templates and documentation as needed

### Compliance Review
- **Frequency**: Quarterly reviews of constitutional compliance
- **Scope**: All code, documentation, and development practices
- **Metrics**: Adherence to principles, standards, and quality gates
- **Remediation**: Action items for non-compliance identified during reviews
- **Reporting**: Compliance status shared with all project contributors

### Principle Enforcement
- **Code Review**: All pull requests MUST validate constitutional compliance
- **Automated Checks**: CI/CD pipelines enforce technical standards where possible
- **Documentation Updates**: Changes affecting constitutional requirements MUST update relevant sections
- **Training**: New contributors MUST be oriented to constitutional principles

### Conflict Resolution
When conflicts arise between principles:
1. **No Fallbacks**, **Test-Driven**, and **MusicXML First** are NON-NEGOTIABLE and override all other principles
2. **Performance First** takes precedence over implementation convenience
3. **User Experience Focus** overrides architectural preferences when user impact is significant and does not compromise MusicXML compatibility
4. **Clean Architecture** guides implementation decisions but doesn't prevent pragmatic solutions
5. **Standards Compliance** ensures consistency and enforces MusicXML interoperability requirements

### Constitutional Evolution
This constitution is a living document that should evolve with the project:
- **Regular Reviews**: Assess relevance and completeness of principles
- **Community Input**: Encourage feedback and suggestions from all contributors
- **Documentation**: Maintain clear rationale for all principles and requirements
- **Accessibility**: Ensure constitution is understandable and actionable for all team members
