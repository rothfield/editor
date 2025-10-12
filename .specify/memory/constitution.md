<!--
Sync Impact Report:
Version change: 1.1.0 → 1.2.0 (new principle added)
Modified principles: None
Added sections:
  - Principle VII: No Fallbacks - Implementation Excellence
Removed sections: None
Templates requiring updates:
✅ plan-template.md (constitution check gates already include fallback validation)
✅ spec-template.md (requirements already emphasize correct implementation)
✅ tasks-template.md (task quality standards already present)
⚠ Conflict Resolution section needs update to include new principle in priority order
Follow-up TODOs: None
-->

# Music Notation Editor POC Constitution

**Version**: 1.2.0
**Ratified**: 2025-10-11
**Last Amended**: 2025-10-12
**Purpose**: Define development environment, standards, principles, and governance for the Music Notation Editor POC project

## Core Principles

### I. Performance First
Every performance-critical operation MUST be implemented in Rust/WASM. JavaScript host application handles UI and orchestration only. All text processing, beat derivation, and layout calculations execute in WASM for optimal performance.

**Rationale**: Meeting sub-16ms response time targets requires compiled code for computational tasks. WASM provides near-native performance while maintaining web platform compatibility.

### II. Test-Driven Development (NON-NEGOTIABLE)
All features MUST have comprehensive end-to-end tests written and approved BEFORE implementation. Tests run in headless mode using Playwright Python bindings. No feature is considered complete without passing E2E tests.

**Rationale**: Headless E2E testing ensures CI/CD compatibility and provides confidence in user-facing functionality. Test-first development prevents regressions and validates requirements.

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

## Development Environment

### Operating System & Shell
- **Primary OS**: Arch Linux
- **Shell**: Fish shell
- **Package Manager**: Pacman (with yay for AUR packages when needed)

### Core Technologies
- **Language**: Rust (WASM module) + JavaScript (host application)
- **JavaScript**: ES6+ (ES2022+) with TypeScript/JSDoc for type safety
- **Styling**: UnoCSS (utility-first CSS framework)
- **Testing**: Playwright (Python bindings) in headless mode
- **Build System**: Makefile
- **WASM**: Performance-critical operations compiled to WebAssembly
- **Type Safety**: wasm-bindgen for JavaScript-Rust interop

### Development Tools
- **Editor**: [User's preferred editor]
- **Browser**: [User's preferred browser for testing]
- **Terminal**: Fish shell with Arch Linux environment

## Code Organization Standards

### File Structure
```
music-notation-editor/
├── src/
│   ├── rust/              # WASM module source (performance-critical operations)
│   │   ├── lib.rs         # Main WASM library entry point
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
│   │   │   ├── cell.rs    # Cell parsing and grapheme handling
│   │   │   ├── beats.rs   # Beat derivation algorithms
│   │   │   ├── tokens.rs  # Token recognition and validation
│   │   │   └── grammar.rs # Musical grammar parsing
│   │   ├── renderers/     # Visual rendering and output formats
│   │   │   ├── layout.rs  # Position calculation and layout algorithms
│   │   │   ├── curves.rs  # Slur and arc rendering (Bézier curves)
│   │   │   ├── annotations.rs # Upper/lower annotation positioning
│   │   │   ├── svg/       # SVG rendering output
│   │   │   │   ├── elements.rs # SVG element rendering
│   │   │   │   └── document.rs # SVG document generation
│   │   │   ├── musicxml/  # MusicXML export (stub for POC)
│   │   │   │   ├── export.rs # MusicXML export functionality
│   │   │   │   └── attributes.rs # MusicXML attribute handling
│   │   │   └── lilypond/  # LilyPond export (stub for POC)
│   │   │       ├── export.rs # LilyPond export functionality
│   │   │       └── notation.rs # LilyPond notation mapping
│   │   └── utils/         # Utility functions and helpers
│   │       ├── grapheme.rs # Grapheme cluster handling
│   │       └── performance.rs # Performance optimization utilities
│   ├── js/                # JavaScript host application
│   │   ├── main.js        # Application entry point and initialization
│   │   ├── editor.js      # Core editor functionality and Cell management
│   │   ├── ui.js          # UI components and user interactions
│   │   ├── renderer.js    # DOM-based rendering system
│   │   ├── events.js      # Event handling and keyboard management
│   │   ├── file-ops.js    # File operations and document persistence
│   │   └── utils.js       # JavaScript utilities and helper functions
│   ├── css/               # Separate CSS files (UnoCSS)
│   │   ├── main.css       # Main styles
│   │   └── components.css # Component-specific styles
│   └── tests/             # Playwright Python tests
│       ├── e2e/           # End-to-end tests
│       ├── fixtures/      # Test data
│       └── utils.py       # Test utilities
├── tests/                 # Additional test directories
│   ├── e2e/               # End-to-end tests
│   └── fixtures/          # Test data
├── Makefile               # Build orchestration
├── package.json           # Node.js dependencies and scripts
├── tsconfig.json          # TypeScript configuration
├── eslint.config.js       # ESLint configuration
├── wasm-pack.toml         # Rust WASM packaging
└── dist/                  # Built artifacts
```

### File Separation Requirements
- **No embedded JavaScript or CSS in HTML**
- All styles in separate `.css` files using UnoCSS
- All JavaScript in separate `.js` files with ES6 modules
- WASM module as separate `.wasm` file
- TypeScript definitions for WASM module integration
- Proper module bundling with tree-shaking
- **No mod.rs files** - Direct module imports preferred for clarity

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

## Testing Standards

### E2E Testing with Playwright
- **All features MUST have comprehensive E2E tests**
- **Tests run in headless mode** (no visual inspection required)
- **Python Playwright bindings** for test implementation
- **Makefile orchestration** for test execution

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
- **Rust compilation** to WASM for performance-critical code (make build-wasm)
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
- Single line of musical notation only
- Fixed 16-point typeface
- Keyboard-only interaction model (no mouse selection)
- JSON file format for document persistence

### Browser Compatibility
- Modern browsers with WASM support
- Intl.Segmenter API for grapheme clustering
- ES6+ JavaScript features

## Success Metrics

### Functional Success
- 95% correct notation rendering
- 100% accurate musical operations
- Complete focus management functionality
- Full E2E test coverage

### Performance Success
- All response time targets met
- Headless test execution < 30 seconds
- Resource usage within specified limits
- No memory leaks in long-running sessions

### Development Success
- Clean, maintainable codebase
- Comprehensive documentation
- Automated testing and quality gates
- Smooth developer experience

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
1. **No Fallbacks** and **Test-Driven** are NON-NEGOTIABLE and override all other principles
2. **Performance First** takes precedence over implementation convenience
3. **User Experience Focus** overrides architectural preferences when user impact is significant
4. **Clean Architecture** guides implementation decisions but doesn't prevent pragmatic solutions
5. **Standards Compliance** ensures consistency but allows for justified exceptions

### Constitutional Evolution
This constitution is a living document that should evolve with the project:
- **Regular Reviews**: Assess relevance and completeness of principles
- **Community Input**: Encourage feedback and suggestions from all contributors
- **Documentation**: Maintain clear rationale for all principles and requirements
- **Accessibility**: Ensure constitution is understandable and actionable for all team members
