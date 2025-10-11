# ECS Editor Project Constitution

**Created**: 2025-10-11
**Purpose**: Define development environment, standards, and principles for the ECS Editor project

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
│   ├── rust/           # WASM module source (performance-critical operations)
│   │   ├── lib.rs       # Main WASM library
│   │   ├── charcell.rs # CharCell data structures
│   │   ├── parsing.rs  # Text parsing and beat derivation
│   │   └── utils.rs    # Utility functions
│   ├── js/             # JavaScript host application
│   │   ├── main.js     # Application entry point
│   │   ├── editor.js   # Editor functionality
│   │   ├── ui.js       # UI components and interactions
│   │   └── utils.js    # JavaScript utilities
│   ├── css/            # Separate CSS files (UnoCSS)
│   │   ├── main.css    # Main styles
│   │   └── components.css # Component-specific styles
│   └── tests/          # Playwright Python tests
│       ├── e2e/        # End-to-end tests
│       ├── fixtures/   # Test data
│       └── utils.py    # Test utilities
├── tests/
│   ├── e2e/            # End-to-end tests
│   └── fixtures/       # Test data
├── Makefile            # Build orchestration
├── package.json        # Node.js dependencies and scripts
├── tsconfig.json       # TypeScript configuration
├── eslint.config.js    # ESLint configuration
├── wasm-pack.toml     # Rust WASM packaging
└── dist/               # Built artifacts
```

### File Separation Requirements
- **No embedded JavaScript or CSS in HTML**
- All styles in separate `.css` files using UnoCSS
- All JavaScript in separate `.js` files with ES6 modules
- WASM module as separate `.wasm` file
- TypeScript definitions for WASM module integration
- Proper module bundling with tree-shaking

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