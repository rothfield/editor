# Implementation Plan: Music Notation Editor POC

**Document**: Implementation Plan
**Created**: 2025-10-11
**Purpose**: Preserve architectural decisions and technology guidance removed from specification
**Specification**: `/specs/001-poc/spec.md`

---

## 🎯 Overview

This document captures the implementation details and technology decisions that were removed from the main specification to keep it technology-agnostic. It provides guidance for implementing the Music Notation Editor POC while allowing development teams to make final technology choices.

---

## 🏗️ Architecture Overview

### Core Model: Cell + Ordered Lanes

```rust
pub struct Line {
    /// Ordered top → bottom: [Upper, Letter, Lower]
    pub lanes: [Vec<Cell>; 3],

    /// Line-level attributes
    pub tala: Option<String>,        // "+203"
    pub lyrics: Option<String>,      // "sa re ga ma" (rendered under line, not column-aligned)
    pub label: Option<String>,       // "Verse 1"
    pub tonic: Option<String>,       // "C", "1", "D#"
    pub key_signature: Option<String>, // "F#", "Bb"
}

pub struct Cell {
    pub grapheme: String,        // "S", "C#", "3b", "-", "'", "|"
    pub lane: LaneKind,          // Upper, Letter, Lower
    pub kind: ElementKind,       // PitchedElement, UnpitchedElement, etc.
    pub col: usize,              // Physical column index (0-based)

    // Musical semantics
    pub pitch_code: Option<String>,   // Canonical pitch ("C#", "3b", "S")
    pub notation: Option<String>,     // "Sargam" | "Number" | "Western" | "DoReMi"
    pub pitch_system: Option<PitchSystem>, // Number | Western

    // Annotations
    pub mordent: bool,
    pub upper_dots: u8,
    pub lower_dots: u8,
    pub tala: Option<char>,
    pub slur_start: bool,
    pub slur_end: bool,

    // Layout cache
    pub x: f32, pub y: f32, pub w: f32,
    pub bbox: (f32,f32,f32,f32),
    pub hit:  (f32,f32,f32,f32),
}

pub enum LaneKind { Upper, Letter, Lower }
pub enum ElementKind { PitchedElement, UnpitchedElement, UpperAnnotation, LowerAnnotation, LyricElement }
pub enum PitchSystem { Number, Western }
```

### Key Architectural Principles

1. **Cell arrays = source of truth** (canonical document representation)
2. **ECS = optional optimization** (transient UI state, not required for POC)
3. **Lanes = vertical positioning zones** (Upper/Lower have variable baselines)
4. **Beat derivation = implicit words of temporal columns** (line-grammar.md algorithm)

---

## 🛠️ Technology Stack (Recommended)

### Frontend Technologies

#### **Styling System: UnoCSS**
- **Why**: Utility-first CSS framework, atomic classes, highly performant
- **Alternatives**: Tailwind CSS, plain CSS, Styled Components
- **Rationale**: Utility-based styling aligns with Cell positioning needs

#### **JavaScript Runtime: ES6+ (ES2022+)**
- **Features**: Modern syntax, const/let, arrow functions, template literals
- **Modules**: ES6 import/export syntax
- **Async**: Async/await patterns
- **Type Safety**: TypeScript preferred, JSDoc minimum

#### **WASM Integration: Rust + wasm-bindgen**
- **Performance**: Critical operations (text processing, beat derivation) in compiled code
- **Interop**: wasm-bindgen for type-safe JavaScript-Rust communication
- **Memory**: Proper lifecycle management and error handling
- **Alternatives**: AssemblyScript, plain JavaScript

#### **Module Bundling: Tree-shaking**
- **Tools**: Webpack, Rollup, Vite
- **Goal**: Eliminate unused code, optimize bundle size
- **Loading**: WebAssembly.instantiateStreaming with caching

### Development Tools

#### **Build System: Makefile**
- **Purpose**: Orchestrate Rust compilation, JavaScript bundling, testing
- **Commands**: `make build`, `make test`, `make serve`
- **Integration**: Coordinates all development workflow steps

#### **Testing: Playwright (Python bindings)**
- **Type**: End-to-end testing in headless mode
- **Coverage**: 100% user story coverage requirement
- **Automation**: Comprehensive validation of all features

#### **Code Quality:**
- **Linting**: ESLint with modern standards configuration
- **Type Checking**: TypeScript strict mode or comprehensive JSDoc
- **Format**: Prettier for consistent code style

### Development Environment

#### **Platform: Arch Linux with Fish Shell**
- **Shell**: Fish shell for enhanced command-line experience
- **Package Management**: Pacman (with yay for AUR packages)
- **Editor**: User's preferred editor with appropriate extensions

---

## 📁 File Structure Organization

### Recommended Project Layout

```
ecs-editor/
├── src/
│   ├── rust/              # WASM module source
│   │   ├── lib.rs          # Main WASM library
│   │   ├── cell.rs     # Cell data structures
│   │   ├── parsing.rs      # Text parsing and beat derivation
│   │   ├── utils.rs        # Utility functions
│   │   └── mod.rs          # Module declarations
│   ├── js/                # JavaScript host application
│   │   ├── main.js         # Application entry point
│   │   ├── editor.js       # Editor functionality
│   │   ├── ui.js           # UI components and interactions
│   │   └── utils.js        # JavaScript utilities
│   ├── css/               # Separate CSS files
│   │   ├── main.css        # Main styles
│   │   └── components.css   # Component-specific styles
│   ├── tests/             # Playwright Python tests
│   │   ├── e2e/            # End-to-end tests
│   │   ├── fixtures/       # Test data
│   │   └── utils.py        # Test utilities
│   └── assets/            # Static assets
├── Makefile                # Build orchestration
├── package.json           # Node.js dependencies
├── tsconfig.json          # TypeScript configuration
├── eslint.config.js        # ESLint configuration
├── wasm-pack.toml         # Rust WASM packaging
└── dist/                   # Built artifacts
```

### File Separation Requirements

- ❌ **No embedded JavaScript or CSS in HTML**
- ✅ **All styles in separate `.css` files**
- ✅ **All JavaScript in separate `.js` files**
- ✅ **WASM module as separate `.wasm` file**
- ✅ **TypeScript definitions for WASM module integration**

---

## ⚡ Performance Optimization Strategy

### Critical Operations (WASM/Rust)

1. **Text Processing**: Grapheme segmentation, character analysis
2. **Beat Derivation**: `extract_implicit_beats` algorithm
3. **Pitch System Conversion**: Number ↔ Western conversion logic
4. **Memory Management**: Efficient Cell array operations

### JavaScript Performance

1. **Rendering**: Efficient DOM updates, batch operations
2. **Event Handling**: Proper listener management, no memory leaks
3. **Module Loading**: Lazy loading, tree-shaking
4. **State Management**: Minimal re-renders, dirty region tracking

### Performance Targets (From Specification)

| Operation | Target Time |
|------------|-------------|
| Focus activation | < 10ms |
| Typing latency | < 50ms |
| Arrow key navigation | < 16ms (60fps) |
| Beat derivation | < 10ms |
| Tab switching | < 50ms |
| UnoCSS load | < 100ms |
| File operations | < 1s |

### Rendering Pipeline

```javascript
// Performance optimization flow
on_edit(doc):
  dirty = compute_dirty_range(...)
  layout(dirty)                 // Update x/y/w, bbox/hit
  derive_beats(dirty)
  derive_slurs(dirty)
  render_patch(dirty)           // Update only changed nodes

on_pointer(evt):
  hit = hit_test(evt.x, evt.y)
  update UIState (caret/selection/hover)
  render_overlay_patch()
```

---

## 🎨 UI Implementation Details

### Menu Structure

#### **File Menu**
- New, Open, Save
- Export MusicXML, Export LilyPond
- Set Title, Set Tonic, Set Pitch System, Set Key Signature

#### **Line Menu**
- Set Label, Set Tonic, Set Pitch System
- Set Lyrics, Set Tala, Set Key Signature

### Focus Management

```javascript
// Focus management implementation
function activateCursor(canvas) {
    canvas.focus();                    // Immediate focus
    canvas.classList.add('focused');      // Visual indicator
    showCursor();                       // Make cursor visible
}

// Automatic focus return
function handleMenuOperation() {
    performMenuAction();
    requestAnimationFrame(() => {
        canvas.focus();               // Return focus to editor
    });
}
```

### Component Architecture

```javascript
// UI components (ES6 modules)
export class EditorCanvas {
    constructor() {
        this.cells = [];
        this.caret = null;
        this.selection = null;
        this.setupEventListeners();
    }
}

export class TabGroup {
    constructor(tabs) {
        this.tabs = tabs;
        this.activeTab = 0;
        this.setupTabNavigation();
    }
}
```

---

## 🎵 Musical Notation Implementation

### Pitch System Conversion

```rust
// Pitch system conversion in Rust/WASM
pub fn convert_pitch_system(
    pitch_code: &str,
    from: PitchSystem,
    to: PitchSystem
) -> String {
    match (from, to) {
        (Number, Western) => number_to_western(pitch_code),
        (Western, Number) => western_to_number(pitch_code),
        (Number, Number) | (Western, Western) => pitch_code.to_string(),
    }
}
```

### Beat Derivation Algorithm

```rust
// Core beat extraction algorithm (from beat_groups.rs)
pub fn extract_implicit_beats(
    cells: &[Cell],
    draw_single_cell_loops: bool
) -> Vec<BeatSpan> {
    // Algorithm processes contiguous temporal columns
    // to create BeatSpan objects
    // (See line-grammar.md for complete implementation)
}
```

### Rendering Parameters

```rust
// Configurable rendering parameters
pub struct RenderingConfig {
    pub draw_single_cell_loops: bool = false,
    pub breath_ends_beat: bool = true,
    pub loop_offset_px: f32 = 20.0,
    pub loop_height_px: f32 = 6.0,
}
```

---

## 📊 Data Structure Management

### Document Hierarchy

```rust
pub struct Document {
    pub title: Option<String>,
    pub tonic: Option<String>,
    pub lines: Vec<Line>,
}

pub struct Line {
    pub lanes: [Vec<Cell>; 3], // Upper, Letter, Lower
    pub tala: Option<String>,
    pub lyrics: Option<String>,
    pub label: Option<String>,
    pub tonic: Option<String>,
    pub key_signature: Option<String>,
}
```

### JSON Serialization

```json
{
  "title": "Raga Yaman",
  "tonic": "C",
  "lines": [
    {
      "tala": "+203",
      "lyrics": "sa re ga ma",
      "label": "Alap",
      "lanes": [
        [
          {"grapheme": ".", "lane": "Upper", "kind": "UpperAnnotation", "col": 0, "upper_dots": 1, "lower_dots": 0},
          {"grapheme": ":", "lane": "Upper", "kind": "Accent", "col": 1, "upper_dots": 2, "lower_dots": 0}
        ],
        [
          {"grapheme": "S", "lane": "Letter", "kind": "PitchedElement", "col": 0, "pitch_code": "C", "notation": "Sargam"},
          {"grapheme": "-", "lane": "Letter", "kind": "UnpitchedElement", "col": 1},
          {"grapheme": "-", "lane": "Letter", "kind": "UnpitchedElement", "col": 2},
          {"grapheme": "r", "lane": "Letter", "kind": "PitchedElement", "col": 3, "pitch_code": "Db", "notation": "Sargam"}
        ],
        [
          {"grapheme": ".", "lane": "Lower", "kind": "LowerAnnotation", "col": 3, "upper_dots": 0, "lower_dots": 1}
        ]
      ]
    }
  ]
}
```

---

## 🎮 Export Capabilities

### MusicXML Export

```rust
// MusicXML export (future implementation)
pub fn export_to_musicxml(document: &Document) -> Result<String, Error> {
    let mut musicxml = MusicXMLDocument::new();

    // Add metadata
    if let Some(title) = &document.title {
        musicxml.set_title(title.clone());
    }

    // Add lines as parts
    for (i, line) in document.lines.iter().enumerate() {
        let part = create_part_from_line(line, i)?;
        musicxml.add_part(part);
    }

    Ok(musicxml.serialize())
}
```

### LilyPond Export

```rust
// LilyPond export (future implementation)
pub fn export_to_lilypond(document: &Document) -> Result<String, Error> {
    let mut lilypond = String::new();

    // Header
    lilypond.push_str("\\version \"2.24.2\"\n");
    lilypond.push_str("\\language \"english\"\n\n");

    // Global header
    if let Some(title) = &document.title {
        lilypond.push_str(&format!("\\header {{\n  title = \"{}\"\n}}\n\n", title));
    }

    // Add lines as music expressions
    for line in &document.lines {
        lilypond.push_str(&create_lilypond_line(line)?);
    }

    Ok(lilypond)
}
```

---

## 🧪 Testing Strategy

### E2E Testing Framework

```python
# Playwright test structure (Python bindings)
from playwright.sync_api import Playwright, expect

class TestMusicNotationPOC:
    def __init__(self, page: Page):
        self.page = page
        self.editor = page.locator('#editor-canvas')

    def test_basic_notation_entry(self):
        """Test basic music notation entry and rendering"""
        # Type "12345671" in Number system
        self.editor.press("12345671")

        # Verify beat segmentation
        beats = self.get_beat_spans()
        expect(len(beats)).to_be_greater_than(0)

        # Test pitch system switching
        self.switch_to_western()
        self.verify_western_display()

    def test_keyboard_commands(self):
        """Test keyboard shortcuts and commands"""
        # Test alt-S slur command
        self.editor.press("a+A")  # Select range
        self.page.keyboard.press("Alt+s")

        # Verify slur is applied
        self.verify_slur_applied()

        # Test octave commands
        self.page.keyboard.press("Alt+u")
        self.verify_octave_applied()
```

### Performance Testing

```javascript
// Performance benchmarks
const performanceTests = {
    focusActivation: () => measureFocusActivationTime(),
    typingLatency: () => measureTypingLatency(),
    navigationSpeed: () => measureArrowKeyNavigation(),
    beatDerivation: () => measureBeatDerivationTime(),
};

async function runPerformanceBenchmarks() {
    for (name, test) of Object.entries(performanceTests)) {
        const time = await test();
        console.log(`${name}: ${time}ms`);
        assert(time < getTargetTime(name), `${name} too slow`);
    }
}
```

---

## 🚀 Deployment Strategy

### Build Process

```makefile
# Makefile for build orchestration
.PHONY: all build test

build:
	@echo "Building Rust WASM module..."
	cargo build --target wasm32-unknown-unknown --release
	@echo "Bundling JavaScript..."
	npm run build
	@echo "Building complete!"

test:
	@echo "Running E2E tests..."
	npm test
	@echo "Tests complete!"

serve:
	@echo "Starting development server..."
	npm run dev

clean:
	cargo clean
	rm -rf dist node_modules
```

### Distribution

- **Local Development**: `npm run dev`
- **Production Build**: `make build`
- **Testing**: `make test`
- **Static Assets**: Host from `dist/` directory

---

## 🔧 Development Workflow

### 1. Environment Setup

```bash
# Install Rust (Arch Linux)
sudo pacman -S rust

# Install Node.js dependencies
npm install

# Install development tools
cargo install wasm-pack  # For WASM building
```

### 2. Development Cycle

```bash
# Start development
make serve

# Make changes
# - Edit Rust code in src/rust/
# - Edit JavaScript in src/js/
# - Edit styles in src/css/

# Tests run automatically
# Or manually: npm test

# Build for production
make build
```

### 3. Quality Assurance

```bash
# Lint code
npm run lint

# Type checking
npm run type-check

# Run full test suite
make test
```

---

## 📝 Success Metrics & Validation

### Functional Success

- **95%** of musical notation renders correctly with proper beat segmentation
- **100%** of selection-based commands work correctly
- **100%** of pitch system conversions maintain accuracy
- **100%** of focus management functions work properly

### Performance Success

- **All response time targets** met (see table above)
- **Headless test execution** < 30 seconds
- **Resource usage** within specified limits
- **No memory leaks** in long-running sessions

### Development Success

- **Clean, maintainable codebase** with >90% maintainability index
- **Comprehensive test coverage** for all features
- **Automated quality gates** (linting, testing, type checking)
- **Smooth developer experience** with hot reload

---

## 🔄 Future Extensibility

### Phase 2 Features (Beyond POC)

- **Multi-line support**: Extend editing interface to multiple lines per document
- **Advanced annotations**: Dynamics, articulations, ornamentation
- **Import/Export**: Implement full MusicXML, LilyPond, MIDI export (POC only has stub menu items)
- **Collaboration**: Real-time editing, version control integration
- **Mobile Support**: Touch interfaces, responsive design

### Scalability Considerations

- **Large Documents**: 10,000+ Cells per line
- **Complex Notation**: Polyphonic music, multiple voices
- **Performance Optimization**: Virtual scrolling, incremental rendering
- **Memory Management**: Efficient garbage collection, object pooling

---

## 📚 Decision Matrix

### Technology Choices Rationale

| Technology | Reason for Choice | Alternatives Considered |
|------------|----------------------|----------------------|
| **Rust/WASM** | Performance-critical operations, type safety | AssemblyScript, plain JS |
| **UnoCSS** | Utility-first approach, atomic classes | Tailwind CSS, plain CSS |
| **Playwright** | Comprehensive E2E testing, headless mode | Cypress, Selenium |
| **Makefile** | Simple orchestration, cross-platform | npm scripts, CMake |
| **ES6+ (2022)** | Modern features, wide support | ES5, TypeScript |

### Trade-offs

- **Simplicity vs Features**: POC scope intentionally limited
- **Performance vs Complexity**: WASM optimization for core operations
- **Flexibility vs Standards**: Tech-agnostic spec vs concrete guidance

---

## 📚 Summary

This implementation plan preserves the architectural decisions and technology guidance that make the Music Notation Editor POC achievable while maintaining the specification's technology-agnostic approach. Teams can use this as a starting point and adapt as needed for their specific requirements and constraints.

**Key Success Factors:**
1. **Cell Model**: Simple, elegant, powerful architecture
2. **Performance**: WASM for critical operations, JavaScript for UI
3. **Testing**: Comprehensive E2E coverage with headless execution
4. **Extensibility**: Clean separation allows future growth
5. **Developer Experience**: Modern tooling and workflow

**The implementation details here are recommendations, not requirements. Teams should adapt them based on their specific expertise, constraints, and project needs.**