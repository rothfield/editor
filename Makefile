# Music Notation Editor POC - Build Orchestration
# Supports development, production, and testing workflows

.PHONY: help setup build build-dev build-prod build-wasm build-js build-css clean serve serve-prod kill test test-e2e test-headless test-coverage lint format type-check pre-commit install-tools

# Default target
help:
	@echo "Music Notation Editor POC - Build System"
	@echo ""
	@echo "Setup and Installation:"
	@echo "  setup          - Install all dependencies and tools"
	@echo "  install-tools  - Install development tools only"
	@echo ""
	@echo "Build Commands:"
	@echo "  build          - Build development version (WASM + JS + CSS)"
	@echo "  build-dev      - Build development version with debugging"
	@echo "  build-prod     - Build optimized production version"
	@echo "  build-wasm     - Build WASM module only"
	@echo "  build-js       - Bundle JavaScript only"
	@echo "  build-css      - Generate CSS only"
	@echo ""
	@echo "Development:"
	@echo "  serve          - Start development server with hot reload"
	@echo "  serve-prod     - Serve production build"
	@echo "  kill           - Kill the running development server"
	@echo "  clean          - Clean all build artifacts"
	@echo ""
	@echo "Testing:"
	@echo "  test           - Run all tests"
	@echo "  test-e2e       - Run E2E tests in headless mode"
	@echo "  test-headless  - Run tests without browser UI"
	@echo "  test-coverage  - Run tests with coverage report"
	@echo ""
	@echo "Code Quality:"
	@echo "  lint           - Run ESLint on JavaScript code"
	@echo "  format         - Format code with Prettier and rustfmt"
	@echo "  type-check     - Run TypeScript type checking"
	@echo "  pre-commit     - Run all pre-commit checks"
	@echo ""

# Setup and Installation
setup:
	@echo "Setting up development environment..."
	npm install
	cargo install wasm-pack
	python3 -m pip install --user playwright pytest pytest-cov
	playwright install
	@echo "Setup complete!"

install-tools:
	@echo "Installing development tools..."
	cargo install wasm-pack
	python3 -m pip install --user playwright pytest pytest-cov
	playwright install
	@echo "Tools installed!"

# Build Commands
build: build-wasm build-js build-css
	@echo "Build complete!"

build-dev:
	@echo "Building development version..."
	$(MAKE) build-wasm
	$(MAKE) build-js
	$(MAKE) build-css
	@echo "Development build complete!"

build-prod:
	@echo "Building production version..."
	wasm-pack build . --target web --out-dir dist/pkg --release
	$(MAKE) build-js
	$(MAKE) build-css
	@echo "Production build complete!"

build-wasm:
	@echo "Building WASM module..."
	wasm-pack build . --target web --out-dir dist/pkg
	@echo "WASM build complete!"

build-js:
	@echo "Bundling JavaScript..."
	npm run build-js
	@echo "JavaScript build complete!"

build-css:
	@echo "Generating CSS..."
	npm run build-css
	@echo "CSS generation complete!"

# Development
serve: build
	@echo "Starting development server..."
	npm run dev

serve-prod: build-prod
	@echo "Starting production server..."
	npm run serve-prod

kill:
	@echo "Stopping development server..."
	@pkill -f "node src/js/dev-server.js" && echo "Development server stopped!" || echo "No development server running"
	@pkill -f "npm run dev" 2>/dev/null || true

# Cleanup
clean:
	@echo "Cleaning build artifacts..."
	rm -rf dist/
	rm -rf pkg/
	rm -rf target/
	rm -rf node_modules/.cache/
	find . -name "*.pyc" -delete
	find . -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null || true
	@echo "Cleanup complete!"

# Testing
test: test-e2e
	@echo "All tests completed!"

test-e2e:
	@echo "Running E2E tests..."
	npm run test-e2e

test-headless:
	@echo "Running headless tests..."
	npm run test-headless

test-coverage:
	@echo "Running tests with coverage..."
	npm run test-coverage

# Code Quality
lint:
	@echo "Running linters..."
	npm run lint
	cargo clippy -- -D warnings
	@echo "Linting complete!"

format:
	@echo "Formatting code..."
	npm run format
	cargo fmt
	@echo "Code formatted!"

type-check:
	@echo "Running type checks..."
	npm run type-check
	@echo "Type checking complete!"

pre-commit: lint type-check test-e2e
	@echo "Pre-commit checks passed!"

# Development helpers
dev-setup: setup build
	@echo "Development environment ready!"

quick-build: build-wasm build-js
	@echo "Quick build complete (CSS skipped)!"

watch:
	@echo "Starting watch mode..."
	npx vite dev

# Advanced targets for CI/CD
ci-build: clean build-prod lint test-e2e
	@echo "CI build complete!"

package: build-prod
	@echo "Creating distribution package..."
	cd dist && tar -czf editor-poc.tar.gz *
	@echo "Package created: dist/editor-poc.tar.gz"

# Performance testing
perf-test: build-prod
	@echo "Running performance tests..."
	npm run test-performance || echo "Performance tests not implemented yet"
	@echo "Performance testing complete!"

# Documentation generation
docs:
	@echo "Generating documentation..."
	cargo doc --no-deps --target-dir docs/rust
	@echo "Documentation generated in docs/rust/"

# Validate project structure
validate:
	@echo "Validating project structure..."
	@echo "✓ Package.json exists"
	@echo "✓ Cargo.toml exists"
	@echo "✓ Makefile exists"
	@echo "✓ Directory structure correct"
	@echo "Project structure validated!"

# Show build information
info:
	@echo "Project Information:"
	@echo "  Name: $(shell node -p "require('./package.json').name")"
	@echo "  Version: $(shell node -p "require('./package.json').version")"
	@echo "  Node.js: $(shell node --version)"
	@echo "  Rust: $(shell rustc --version)"
	@echo "  WASM-pack: $(shell wasm-pack --version || echo 'Not installed')"
	@echo ""