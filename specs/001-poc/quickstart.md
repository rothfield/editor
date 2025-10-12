# Quickstart Guide: Music Notation Editor POC

**Branch**: `001-poc` | **Date**: 2025-10-11 | **Status**: Phase 1 Complete

This guide provides step-by-step instructions for setting up, building, and running the Music Notation Editor POC.

---

## Overview

The Music Notation Editor POC is a web-based application that demonstrates a cell-based architecture for WYSIWYG music notation editing. It supports dual pitch systems (Number and Western), keyboard-only interaction, and real-time beat visualization.

**Key Features:**
- **Cell Architecture**: Grapheme-safe musical notation representation
- **Dual Pitch Systems**: Number system (1-7) and Western system (cdefgab/CDEFGAB)
- **Keyboard-Only Editing**: Complete navigation and editing via keyboard
- **Real-Time Beat Visualization**: Automatic beat derivation and rendering
- **Selection-Based Commands**: Alt+S for slurs, Alt-u/m/l for octaves
- **Performance Optimized**: WASM for critical operations, <10ms beat derivation

---

## Prerequisites

### System Requirements
- **Operating System**: Arch Linux (or any Linux distribution)
- **Shell**: Fish shell (recommended) or Bash
- **Browser**: Modern browser with WASM support (Chrome 89+, Firefox 125+, Safari 14.1+)

### Required Software
```bash
# Install Rust
sudo pacman -S rust

# Install Node.js and npm
sudo pacman -S nodejs npm

# Install Fish shell (if not already installed)
sudo pacman -S fish

# Install Python for Playwright testing
sudo pacman -S python python-pip

# Install yay for AUR packages (optional but recommended)
git clone https://aur.archlinux.org/yay.git
cd yay
makepkg -si
```

### Development Tools
```bash
# Install wasm-pack for Rust-WASM compilation
cargo install wasm-pack

# Install Playwright Python bindings
pip install playwright

# Install Playwright browsers
playwright install

# Install Node.js dependencies (after project setup)
npm install
```

---

## Project Setup

### Clone and Initialize
```bash
# Clone the repository (replace with actual repository URL)
git clone <repository-url> editor
cd editor

# Set up the development environment
make setup
```

### Project Structure
```
editor/
├── src/
│   ├── rust/              # WASM module source
│   │   ├── lib.rs         # Main entry point
│   │   ├── models/        # Data models
│   │   ├── parse/         # Text processing
│   │   ├── renderers/     # Visual rendering
│   │   └── utils/         # Utilities
│   ├── js/                # JavaScript host application
│   ├── css/               # UnoCSS styles
│   └── tests/             # Playwright tests
├── Makefile               # Build orchestration
├── package.json           # Node.js dependencies
└── dist/                  # Built artifacts
```

---

## Building the Application

### Build Commands
```bash
# Build everything (Rust WASM + JavaScript + CSS)
make build

# Build only the WASM module
make build-wasm

# Build only the JavaScript bundle
make build-js

# Build with development optimizations
make build-dev

# Clean build artifacts
make clean
```

### Build Process Overview
1. **Rust Compilation**: Compile Rust code to WASM module with optimizations
2. **JavaScript Bundling**: Bundle JavaScript with ES6 modules and tree-shaking
3. **CSS Processing**: Generate UnoCSS utilities and optimize styles
4. **Asset Integration**: Combine all components into dist/ directory

---

## Running the Application

### Development Server
```bash
# Start development server with hot reload
make serve

# Or run directly with Node.js
npm run dev
```

The application will be available at `http://localhost:8080`

### Production Build
```bash
# Build for production
make build-prod

# Serve production build locally
make serve-prod
```

---

## Basic Usage

### Getting Started
1. **Open the Application**: Navigate to `http://localhost:8080`
2. **Set Focus**: Click on the editor canvas or use Tab to navigate to it
3. **Start Typing**: Begin entering musical notation immediately

### Musical Notation Entry

#### Number System (Default)
```text
# Basic melody
12345671

# With accidentals
1# 2b 3 4# 5b 6 7 1

# With dashes (sustain)
1--2 3-4 5--6-7-1

# With barlines
123|456|71
```

#### Western System
```text
# Basic melody (lowercase)
cdefgabC

# Basic melody (uppercase)
CDEFGABc

# With accidentals
C# D# E F G# A# B# C
c b a g f e d c

# Mixed case with accidentals
C# D Eb F# G A# Bb C
```

#### Keyboard Shortcuts
- **Arrow Keys**: Navigate left/right between cells
- **Shift + Arrow**: Create and expand selection
- **Home/End**: Move to line beginning/end
- **Backspace**: Delete previous character or selection
- **Alt + S**: Toggle slur on selection
- **Alt + U**: Toggle octave +1 (bullet above) on selection
- **Alt + M**: Set octave 0 (no display) on selection
- **Alt + L**: Toggle octave -1 (bullet below) on selection
- **Alt + T**: Open tala input dialog

### Menu Operations
- **File → New**: Create new empty document
- **File → Save**: Save document as JSON
- **File → Open**: Load document from JSON file
- **File → Export MusicXML**: Show stub message (not implemented in POC)
- **File → Export LilyPond**: Show stub message (not implemented in POC)
- **File → Set Title**: Set composition title
- **File → Set Tonic**: Set composition tonic (C, D, E, etc.)
- **File → Set Pitch System**: Set default pitch system for composition
- **File → Set Key Signature**: Set key signature for composition

### Stave Operations
- **Stave → Set Label**: Set stave label (appears at beginning)
- **Stave → Set Tonic**: Set stave-specific tonic (overrides composition)
- **Stave → Set Pitch System**: Set stave-specific pitch system
- **Stave → Set Lyrics**: Set stave lyrics (displayed below first note)
- **Stave → Set Tala**: Set tala notation (digits 0-9+ above barlines)
- **Stave → Set Key Signature**: Set stave-specific key signature

### Debug Information
- **Document Tab**: Shows current cell data structure in real-time
- **Console Errors Tab**: Displays error messages with timestamps
- **Console Log Tab**: Shows debug information and action logs

---

## Development Workflow

### Making Changes
1. **Edit Source Code**: Modify Rust, JavaScript, or CSS files
2. **Auto-Rebuild**: Development server automatically rebuilds on changes
3. **Test Changes**: Refresh browser to see updates
4. **Run Tests**: Execute test suite to validate changes

### Testing
```bash
# Run all tests
make test

# Run only E2E tests
make test-e2e

# Run tests in headless mode
make test-headless

# Run tests with coverage
make test-coverage
```

### Code Quality
```bash
# Lint JavaScript code
npm run lint

# Format JavaScript code
npm run format

# Type check JavaScript
npm run type-check

# Lint Rust code
cargo clippy

# Format Rust code
cargo fmt
```

---

## Troubleshooting

### Common Issues

#### Build Failures
```bash
# Clean and rebuild
make clean
make build

# Check Rust version
rustc --version  # Should be 1.75+

# Check Node.js version
node --version    # Should be 18+

# Clear npm cache
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

#### WASM Loading Issues
```bash
# Check WASM support
# Open browser console and test:
typeof WebAssembly !== 'undefined'  // Should be true

# Rebuild WASM module
make build-wasm

# Check browser console for WASM errors
```

#### Performance Issues
```bash
# Check build optimizations
make build-prod

# Monitor performance in browser dev tools
# Network tab: Check WASM loading time
# Performance tab: Check JavaScript execution time
# Memory tab: Check for memory leaks
```

#### Focus Issues
- **Click the editor canvas** to activate focus
- **Use Tab key** to navigate to the editor
- **Check console** for focus-related errors
- **Verify canvas has outline** when focused

### Debug Mode
```bash
# Run with verbose logging
RUST_LOG=debug npm run dev

# Enable browser debug mode
# Add ?debug=true to URL
```

### Getting Help
1. **Check Console**: Look for error messages in browser console
2. **Review Logs**: Check Console Errors and Console Log tabs
3. **Check Issues**: Review GitHub issues for known problems
4. **Ask Questions**: Use project discussions or issues for help

---

## Advanced Usage

### Custom Configuration
```javascript
// Customize beat rendering parameters
const config = {
    draw_single_cell_loops: true,
    breath_ends_beat: false,
    loop_offset_px: 25.0,
    loop_height_px: 8.0,
};
```

### Extending Pitch Systems
```rust
// Add new pitch system in src/rust/models/pitch_systems/
// Follow existing patterns for Number and Western systems
```

### Custom Rendering
```javascript
// Extend DOM renderer for custom visualization
class CustomRenderer extends DOMRenderer {
    renderCustomAnnotation(element) {
        // Custom rendering logic
    }
}
```

---

## Performance Tips

### Optimizing for Speed
- **Use Number System**: Faster parsing than Western system
- **Avoid Long Documents**: Performance degrades after 1000 cells
- **Minimize Selections**: Large selections can slow rendering
- **Use Development Builds**: Faster iteration during development

### Memory Management
- **Clear Console Logs**: Periodically clear debug information
- **Avoid Memory Leaks**: Properly clean up event listeners
- **Monitor Heap Usage**: Use browser dev tools memory tab

---

## Contributing

### Development Setup
```bash
# Install development dependencies
make setup-dev

# Run pre-commit hooks
make pre-commit

# Run full test suite
make test-all
```

### Code Style
- **Rust**: Follow `cargo fmt` and `cargo clippy` recommendations
- **JavaScript**: Use ESLint configuration and Prettier formatting
- **CSS**: Use UnoCSS utilities and avoid custom styles
- **Documentation**: Update JSDoc comments and Rust documentation

### Submitting Changes
1. **Create Feature Branch**: `git checkout -b feature-name`
2. **Make Changes**: Implement feature with tests
3. **Run Tests**: Ensure all tests pass
4. **Update Documentation**: Update relevant documentation
5. **Submit Pull Request**: Include description and testing details

---

## Next Steps

### For Users
- **Explore Features**: Try different pitch systems and keyboard shortcuts
- **Create Music**: Compose simple melodies and rhythms
- **Experiment**: Test the limits of beat visualization and selection

### For Developers
- **Read Data Model**: Understand cell architecture
- **Study API Contracts**: Learn WASM-JavaScript integration
- **Extend Features**: Add new pitch systems or rendering capabilities
- **Optimize Performance**: Improve beat derivation and rendering speed

### For Researchers
- **Analyze Architecture**: Study cell vs traditional music notation
- **Benchmark Performance**: Compare with existing music editors
- **Explore Extensions**: Investigate multi-line and polyphonic support
- **Research Applications**: Consider educational and professional use cases

---

## Resources

### Documentation
- **Data Model**: `/specs/001-poc/data-model.md` - Complete API documentation
- **API Contracts**: `/specs/001-poc/contracts/api.md` - Interface specifications
- **Research**: `/specs/001-poc/research.md` - Technical research findings
- **Implementation Plan**: `/specs/001-poc/plan.md` - Technical architecture

### External Resources
- **Rust Book**: https://doc.rust-lang.org/book/
- **WebAssembly**: https://webassembly.org/
- **UnoCSS**: https://uno.antfu.me/
- **Playwright**: https://playwright.dev/
- **wasm-bindgen**: https://rustwasm.github.io/wasm-bindgen/

### Community
- **GitHub Repository**: [Project repository URL]
- **Issues**: Report bugs and request features
- **Discussions**: Ask questions and share ideas
- **Documentation**: Contribute to documentation and examples

---

**Congratulations!** You now have a working Music Notation Editor POC. Start exploring the features, experiment with different notation styles, and enjoy creating music with this innovative cell-based editor.