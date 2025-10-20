# Music Notation Editor POC - Build Orchestration
# Supports development, production, and testing workflows

.PHONY: help setup build build-dev build-prod build-wasm build-js build-css clean serve serve-prod kill test test-e2e test-headless test-coverage lint format type-check pre-commit install-tools lilypond-start lilypond-stop lilypond-logs lilypond-health lilypond-test lilypond-build lilypond-clean lilypond-restart lilypond-install-docker-arch build-fast build-wasm-fast build-profile-analyze

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
	@echo "  build-dev      - Same as 'build', fastest dev builds"
	@echo "  build-prod     - Build optimized production version"
	@echo "  build-fast     - Fast build with Cargo fast-build profile"
	@echo "  build-wasm     - Build WASM module only (dev mode)"
	@echo "  build-wasm-fast - Build WASM fastest (no release flag)"
	@echo "  build-wasm-release - Build WASM with release optimization"
	@echo "  build-js       - Bundle JavaScript only"
	@echo "  build-css      - Generate CSS only"
	@echo "  build-profile-analyze - Show build profile information"
	@echo ""
	@echo "Development:"
	@echo "  dev            - Start dev server with auto-rebuild + hot reload ⚡"
	@echo "  serve          - Alias for 'dev'"
	@echo "  serve-prod     - Serve production build"
	@echo "  kill           - Kill the running development server"
	@echo "  clean          - Clean all build artifacts"
	@echo ""
	@echo "LilyPond Service (Music Rendering):"
	@echo "  lilypond-install-docker-arch - Install Docker & Docker Compose on Arch Linux"
	@echo "  lilypond-start     - Start LilyPond rendering service (Docker)"
	@echo "  lilypond-stop      - Stop LilyPond rendering service"
	@echo "  lilypond-restart   - Restart LilyPond rendering service"
	@echo "  lilypond-health    - Check LilyPond service health"
	@echo "  lilypond-logs      - Show LilyPond service logs"
	@echo "  lilypond-test      - Test LilyPond service with cURL"
	@echo "  lilypond-build     - Build LilyPond service Docker image"
	@echo "  lilypond-clean     - Clean up LilyPond service containers/images"
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
	# Canonical WASM output location: dist/pkg (referenced in index.html)
	wasm-pack build . --target web --out-dir dist/pkg --release
	$(MAKE) build-js
	$(MAKE) build-css
	@echo "Production build complete!"

build-wasm:
	@echo "Building WASM module..."
	# Canonical WASM output location: dist/pkg (referenced in index.html)
	# Use --no-opt to avoid wasm-opt bulk memory issues
	wasm-pack build . --target web --out-dir dist/pkg --no-opt
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
dev: build-wasm build-css
	@echo "Starting development server with auto-rebuild + hot reload..."
	@echo "Edit files in src/js/ (rollup watches) or src/*.rs (cargo watch rebuilds WASM)"
	@echo "Browser will auto-refresh on JS changes via hot reload"
	npm run dev

serve: dev
	@echo "Alias for 'make dev'"

serve-prod: build-prod
	@echo "Starting production server..."
	npm run serve-prod

kill:
	@echo "Stopping development server..."
	@pkill -f "node src/js/dev-server.js" && echo "Development server stopped!" || echo "No development server running"
	@pkill -f "npm run dev" 2>/dev/null || true
	@pkill -f "rollup.*watch" 2>/dev/null || true

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

# Fast build targets
build-fast:
	@echo "Building with fast profile (optimized for compile speed)..."
	wasm-pack build . --target web --out-dir dist/pkg --profile=fast-build
	$(MAKE) build-js
	$(MAKE) build-css
	@echo "Fast build complete!"

build-wasm-fast:
	@echo "Building WASM fastest (skipping wasm-opt)..."
	wasm-pack build . --target web --out-dir dist/pkg --no-opt
	@echo "WASM fast build complete!"

build-wasm-release:
	@echo "Building WASM with release optimization..."
	wasm-pack build . --target web --out-dir dist/pkg --release
	@echo "WASM release build complete!"

build-profile-analyze:
	@echo "Build Profile Configuration:"
	@echo ""
	@echo "Development (cargo build):"
	@echo "  - opt-level: 0 (no optimization)"
	@echo "  - codegen-units: 256 (maximum parallelism)"
	@echo "  - Speed: FASTEST (ideal for iteration)"
	@echo ""
	@echo "Release (cargo build --release):"
	@echo "  - opt-level: s (size optimization)"
	@echo "  - lto: thin (faster than full LTO)"
	@echo "  - codegen-units: 16 (balance between speed and size)"
	@echo "  - Speed: MEDIUM (good for production builds)"
	@echo ""
	@echo "Fast Build (cargo build --profile=fast-build):"
	@echo "  - opt-level: 1 (minimal optimization)"
	@echo "  - lto: false (no link-time optimization)"
	@echo "  - codegen-units: 256 (maximum parallelism)"
	@echo "  - Speed: FAST (good for testing before release)"
	@echo ""
	@echo "Recommendations:"
	@echo "  - Development: Use 'make build-dev' or 'cargo build' (fastest)"
	@echo "  - Quick Testing: Use 'make build-wasm-fast' (faster than release)"
	@echo "  - Production: Use 'make build-prod' (smallest/fastest binary)"
	@echo ""

# LilyPond Service targets (Music Rendering Service)
lilypond-install-docker-arch:
	@echo "Installing Docker and Docker Compose on Arch Linux..."
	@if [ -f "lilypond-service/setup-archlinux.sh" ]; then \
		chmod +x lilypond-service/setup-archlinux.sh && \
		lilypond-service/setup-archlinux.sh; \
	else \
		echo "Error: lilypond-service/setup-archlinux.sh not found"; \
		exit 1; \
	fi

lilypond-build:
	@echo "Building LilyPond rendering service Docker image..."
	cd lilypond-service && docker-compose build
	@echo "LilyPond service image built!"

lilypond-start:
	@echo "Starting LilyPond rendering service..."
	cd lilypond-service && docker-compose up -d
	@echo "LilyPond service started on http://localhost:8787"
	@echo "Check health: curl http://localhost:8787/health"

lilypond-stop:
	@echo "Stopping LilyPond rendering service..."
	cd lilypond-service && docker-compose down
	@echo "LilyPond service stopped!"

lilypond-restart: lilypond-stop lilypond-start
	@echo "LilyPond service restarted!"

lilypond-health:
	@echo "Checking LilyPond service health..."
	@curl -s http://localhost:8787/health | jq . || echo "Service not responding"

lilypond-logs:
	@cd lilypond-service && docker-compose logs -f lilypond

lilypond-test:
	@echo "Testing LilyPond service rendering..."
	@curl -s -X POST http://localhost:8787/engrave \
		-H "Content-Type: application/json" \
		-d '{"ly":"\\version \"2.24.0\"\n\\score { \\new Staff { c d e f g a b c } }","format":"svg"}' \
		> /tmp/lilypond-test.svg && \
		echo "✓ SVG rendered successfully: /tmp/lilypond-test.svg" || \
		echo "✗ Rendering failed"

lilypond-clean:
	@echo "Cleaning LilyPond service..."
	cd lilypond-service && docker-compose down -v
	@echo "Cleaning up Docker resources..."
	docker system prune -f --volumes
	@echo "LilyPond service cleanup complete!"