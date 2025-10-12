<!--
Sync Impact Report:
Version change: 1.0.0 → 1.1.0 (MINOR)
Modified sections: File Structure, Project Principles
Added sections: Governance, Version Policy, Compliance Review
Templates requiring updates:
✅ plan.md (updated structure without mod.rs files)
⚠ spec-template.md (may need governance alignment)
⚠ tasks-template.md (may need principle alignment)
Follow-up TODOs: None
-->

# ECS Editor Project Constitution

**Version**: 1.1.0
**Created**: 2025-10-11
**Last Amended**: 2025-10-11
**Purpose**: Define development environment, standards, principles, and governance for the ECS Editor project

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
ecs-editor/
├── src/
│   ├── rust/              # WASM module source (performance-critical operations)
│   │   ├── lib.rs         # Main WASM library entry point
│   │   ├── models/        # Domain-driven data model organization
│   │   │   ├── core.rs    # Core CharCell data structures
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
│   │   │   ├── charcell.rs # CharCell parsing and grapheme handling
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
│   │   ├── editor.js      # Core editor functionality and CharCell management
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

## Testing Standards

### E2E Testing with Playwright
- **All features must have comprehensive E2E tests**
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
- Up to 1,000 CharCells per document

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
  - Document tab (CharCell data structure)
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
- **CharCell**: Core data structure
- **Temporal vs Non-temporal**: Clear separation
- **Implicit beats**: Derived from contiguous temporal elements
- **Octave display**: Range -4 to +4 (dots above/below)

## Development Workflow

### Build Process
- **Makefile** orchestrates all build steps
- **Rust compilation** to WASM for performance-critical code
- **JavaScript bundling** for host application
- **UnoCSS processing** for styles
- **Testing** automated via Makefile targets

### Quality Assurance
- **E2E tests** run before each commit
- **Headless testing** ensures CI/CD compatibility
- **Coverage reports** generated for all feature areas
- **Performance benchmarks** validate response time targets

## Project Principles

1. **Performance First**: WASM for critical operations, optimized rendering
2. **Test-Driven**: All features must have comprehensive E2E tests
3. **User Experience Focus**: Immediate responsiveness, intuitive navigation
4. **Clean Architecture**: Separated concerns, external file organization
5. **Developer Tools**: Rich debugging information and console logging
6. **Standards Compliance**: Consistent code organization and file structure

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

---

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
- **Code Review**: All pull requests must validate constitutional compliance
- **Automated Checks**: CI/CD pipelines enforce technical standards where possible
- **Documentation Updates**: Changes affecting constitutional requirements must update relevant sections
- **Training**: New contributors must be oriented to constitutional principles

### Conflict Resolution
When conflicts arise between principles:
1. **Performance First** and **Test-Driven** take precedence over implementation details
2. **User Experience Focus** overrides architectural preferences when user impact is significant
3. **Clean Architecture** guides implementation decisions but doesn't prevent pragmatic solutions
4. **Standards Compliance** ensures consistency but allows for justified exceptions

### Constitutional Evolution
This constitution is a living document that should evolve with the project:
- **Regular Reviews**: Assess relevance and completeness of principles
- **Community Input**: Encourage feedback and suggestions from all contributors
- **Documentation**: Maintain clear rationale for all principles and requirements
- **Accessibility**: Ensure constitution is understandable and actionable for all team members