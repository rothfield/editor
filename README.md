# Music Notation Editor

A high-performance music notation editor built with a **Cell-based architecture**, combining Rust WebAssembly for logic with a modern JavaScript frontend.

![Status](https://img.shields.io/badge/status-active-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)
![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)
![Rust](https://img.shields.io/badge/rust-1.75%2B-orange)

## Features

- **High Performance**: Rust-based WASM module for fast music notation processing
- **Cell Architecture**: Innovative cell-based document model for flexible music editing
- **Real-time Rendering**: Instant visual feedback as you compose
- **Music Export**: Export to multiple formats (MusicXML, MIDI, LilyPond)
- **Full Stack Modern**: TypeScript/JavaScript frontend + Rust WASM backend
- **Cross-platform**: Works in any modern web browser

## Quick Start

### Prerequisites

- **Node.js** 18+ ([install](https://nodejs.org/))
- **Rust** 1.75+ ([install](https://rustup.rs/))
- **wasm-pack** (installed via `make setup`)

### Development Setup

```bash
# Clone the repository
git clone https://github.com/rothfield/editor.git
cd editor

# Install all dependencies and tools
make setup

# Start development server with hot reload
make serve
```

The editor will open at `http://localhost:8080` with live reloading.

## Build Commands

### For Development

```bash
# Start dev server (rebuilds on changes)
make serve

# Build all components (WASM + JS + CSS)
make build

# Build WASM module only (fastest WASM rebuild)
make build-wasm-fast       # ~0.3 seconds
```

### For Production

```bash
# Build optimized production version
make build-prod

# Serve production build locally
make serve-prod
```

### Build Profile Reference

| Command | Time | Optimization | Use Case |
|---------|------|-------------|----------|
| `make build-dev` | ~17s | None | Active development |
| `make build-wasm-fast` | ~0.3s | Minimal (no wasm-opt) | Quick WASM iteration |
| `make build-prod` | ~25s | Maximum | Production deployment |

See [BUILD_OPTIMIZATION_GUIDE.md](BUILD_OPTIMIZATION_GUIDE.md) for detailed build information.

## Project Structure

```
editor/
├── src/
│   ├── rs/                      # Rust WebAssembly module
│   │   ├── api.rs              # WASM API bindings
│   │   ├── models/             # Core data structures
│   │   ├── parse/              # Music notation parsing
│   │   └── converters/         # Export converters (MusicXML, MIDI, LilyPond)
│   └── js/                      # JavaScript/TypeScript frontend
│       ├── editor.js           # Main editor UI
│       ├── ui.js               # UI components
│       ├── dev-server.js       # Dev server
│       └── main.js             # Entry point
├── tests/                       # E2E tests (Playwright + pytest)
├── dist/                        # Build output
├── Cargo.toml                   # Rust dependencies
├── package.json                 # Node dependencies
├── Makefile                     # Build orchestration
└── BUILD_OPTIMIZATION_GUIDE.md  # Detailed build info
```

## Architecture

### Cell-Based Model

The editor uses an innovative **cell-based architecture** where:
- Each musical element is a **Cell** with properties (pitch, duration, type, etc.)
- Cells are arranged in lines, allowing flexible multi-line editing
- Operations are performed on cell collections, enabling efficient batch processing

### Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Rendering** | OpenSheetMusicDisplay 1.7.6 | Visual music notation |
| **Backend** | Rust 1.75 + WASM | High-performance logic, parsing, conversion |
| **Frontend** | JavaScript ES2022+ | User interface, real-time interaction |
| **Build** | wasm-pack, Node.js 18+ | Compilation and bundling |
| **Testing** | Playwright + pytest | E2E and integration testing |

## Development Workflow

### 1. Make Changes

Edit source files in `src/`:
```bash
# Rust backend changes
src/api.rs
src/models/core.rs
src/converters/

# JavaScript frontend changes
src/js/editor.js
src/js/ui.js
```

### 2. Fast Rebuild (Recommended)

For rapid iteration, rebuild only the changed components:

```bash
# WASM changes
make build-wasm-fast              # ~0.3 seconds

# JavaScript changes
make build-js                     # ~2 seconds

# Full rebuild
make build                        # ~17 seconds
```

### 3. Test Changes

```bash
# Run full test suite
make test

# Run E2E tests
make test-e2e

# Run tests in headless mode
make test-headless

# Run with coverage report
make test-coverage
```

### 4. Prepare for Deployment

```bash
# Full production build with optimizations
make build-prod

# Create distribution package
make package
```

## Testing

### Run All Tests
```bash
make test
```

### Run Specific Test Suites
```bash
# E2E tests with browser UI
make test-e2e

# Headless (CI-friendly)
make test-headless

# With coverage report
make test-coverage
```

### Test Files Location
```
tests/
├── e2e/                    # End-to-end tests
├── conftest.py            # Pytest configuration
└── pytest.ini             # Pytest settings
```

## Code Quality

### Linting
```bash
# Lint JavaScript
make lint

# Lint Rust
cargo clippy
```

### Formatting
```bash
# Format all code
make format

# Format JavaScript with Prettier
npm run format

# Format Rust with rustfmt
cargo fmt
```

### Type Checking
```bash
# Run type checks
make type-check
```

## Performance Optimization

The editor uses advanced build optimizations for fast compilation:

- **Parallel Codegen**: 256 units for development (vs 1 for release)
- **Thin LTO**: Balanced link-time optimization
- **Incremental Builds**: Automatic caching of unchanged modules
- **Optional Ramdisk**: 2GB RAM disk for ultra-fast builds

See [BUILD_OPTIMIZATION_GUIDE.md](BUILD_OPTIMIZATION_GUIDE.md) for details.

### Enable Ramdisk (Optional)
```bash
bash scripts/auto_setup_ramdisk.sh
```

## Environment Variables

```bash
# Development
DEBUG=true npm run dev

# Production
NODE_ENV=production make serve-prod
```

## Troubleshooting

### Build Issues

**Problem**: `wasm-opt` errors
```bash
# Solution: Use fast build (skips wasm-opt)
make build-wasm-fast
```

**Problem**: Slow builds
```bash
# Solution: Enable ramdisk for faster I/O
bash scripts/auto_setup_ramdisk.sh
```

**Problem**: Dependencies not found
```bash
# Solution: Clean and reinstall
make clean
make setup
```

### Runtime Issues

**Problem**: Module not found errors
```bash
# Solution: Rebuild WASM module
make build-wasm-fast
npm run build-js
```

**Problem**: Hot reload not working
```bash
# Solution: Check dev server is running
make serve
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

Please ensure all tests pass before submitting:
```bash
make pre-commit
```

## Documentation

- [BUILD_OPTIMIZATION_GUIDE.md](BUILD_OPTIMIZATION_GUIDE.md) - Detailed build system documentation
- [CLAUDE.md](CLAUDE.md) - Project development guidelines

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For issues, questions, or contributions:
- GitHub Issues: [github.com/rothfield/editor/issues](https://github.com/rothfield/editor/issues)
- Repository: [github.com/rothfield/editor](https://github.com/rothfield/editor)

## Acknowledgments

- OpenSheetMusicDisplay for music rendering
- Rust community for excellent WebAssembly tooling
- Contributors and testers

---

**Made with ❤️ for musicians and developers**
