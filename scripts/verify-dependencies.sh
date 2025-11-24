#!/bin/bash
# Verify all system dependencies are installed with correct versions
# Usage: ./scripts/verify-dependencies.sh
# Exit code: 0 if all verified, 1 if any missing/wrong version

set -e

ERRORS=0
WARNINGS=0

echo "Verifying system dependencies for Music Notation Editor..."
echo ""

# Helper function to check version
check_version() {
    local name=$1
    local current=$2
    local required=$3

    if [ -z "$current" ]; then
        echo "❌ $name: Not found"
        return 1
    fi

    # Simple version comparison (assumes semver)
    if [ "$(printf '%s\n' "$required" "$current" | sort -V | head -n1)" = "$required" ]; then
        echo "✅ $name: $current (>= $required)"
        return 0
    else
        echo "❌ $name: $current (required >= $required)"
        return 1
    fi
}

# Check Node.js
echo "Checking Node.js..."
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found"
    echo "   Install: https://nodejs.org/ or see DEPENDENCIES.md"
    ERRORS=$((ERRORS+1))
else
    NODE_VERSION=$(node --version | sed 's/v//')
    if check_version "Node.js" "$NODE_VERSION" "18.0.0"; then
        :
    else
        ERRORS=$((ERRORS+1))
    fi
fi
echo ""

# Check npm
echo "Checking npm..."
if ! command -v npm &> /dev/null; then
    echo "❌ npm not found"
    echo "   Install: Bundled with Node.js"
    ERRORS=$((ERRORS+1))
else
    NPM_VERSION=$(npm --version)
    if check_version "npm" "$NPM_VERSION" "9.0.0"; then
        :
    else
        ERRORS=$((ERRORS+1))
    fi
fi
echo ""

# Check Rust
echo "Checking Rust..."
if ! command -v rustc &> /dev/null; then
    echo "❌ Rust not found"
    echo "   Install: https://rustup.rs/ or see DEPENDENCIES.md"
    ERRORS=$((ERRORS+1))
else
    RUST_VERSION=$(rustc --version | awk '{print $2}')
    if check_version "Rust" "$RUST_VERSION" "1.75.0"; then
        :
    else
        ERRORS=$((ERRORS+1))
    fi
fi
echo ""

# Check cargo
echo "Checking cargo..."
if ! command -v cargo &> /dev/null; then
    echo "❌ cargo not found"
    echo "   Install: Bundled with Rust"
    ERRORS=$((ERRORS+1))
else
    CARGO_VERSION=$(cargo --version | awk '{print $2}')
    echo "✅ cargo: $CARGO_VERSION"
fi
echo ""

# Check wasm-pack
echo "Checking wasm-pack..."
if ! command -v wasm-pack &> /dev/null; then
    echo "⚠️  wasm-pack not found (will be installed by 'make setup')"
    echo "   Or install manually: cargo install wasm-pack"
    WARNINGS=$((WARNINGS+1))
else
    WASM_PACK_VERSION=$(wasm-pack --version | awk '{print $2}')
    echo "✅ wasm-pack: $WASM_PACK_VERSION"
fi
echo ""

# Check Python
echo "Checking Python..."
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 not found"
    echo "   Install: https://python.org/ or see DEPENDENCIES.md"
    ERRORS=$((ERRORS+1))
else
    PYTHON_VERSION=$(python3 --version | awk '{print $2}')
    if check_version "Python" "$PYTHON_VERSION" "3.8.0"; then
        :
    else
        ERRORS=$((ERRORS+1))
    fi
fi
echo ""

# Check pip
echo "Checking pip..."
if ! command -v pip3 &> /dev/null && ! python3 -m pip --version &> /dev/null; then
    echo "❌ pip not found"
    echo "   Install: python3 -m ensurepip --upgrade"
    ERRORS=$((ERRORS+1))
else
    if command -v pip3 &> /dev/null; then
        PIP_VERSION=$(pip3 --version | awk '{print $2}')
    else
        PIP_VERSION=$(python3 -m pip --version | awk '{print $2}')
    fi
    echo "✅ pip: $PIP_VERSION"
fi
echo ""

# Check Docker (optional)
echo "Checking Docker (optional)..."
if ! command -v docker &> /dev/null; then
    echo "⚠️  Docker not found (optional for LilyPond service and E2E testing)"
    echo "   Install: https://docker.com/ or see DEPENDENCIES.md"
    WARNINGS=$((WARNINGS+1))
else
    DOCKER_VERSION=$(docker --version | awk '{print $3}' | sed 's/,//')
    echo "✅ Docker: $DOCKER_VERSION"

    # Check docker-compose
    if ! command -v docker-compose &> /dev/null; then
        echo "⚠️  docker-compose not found (optional)"
        WARNINGS=$((WARNINGS+1))
    else
        COMPOSE_VERSION=$(docker-compose --version | awk '{print $4}' | sed 's/,//')
        echo "✅ docker-compose: $COMPOSE_VERSION"
    fi
fi
echo ""

# Check Python packages (if virtualenv or already installed)
echo "Checking Python packages..."
PYTHON_PACKAGES_OK=true

if ! python3 -c "import yaml" &> /dev/null; then
    echo "⚠️  PyYAML not found (will be installed by 'make setup')"
    WARNINGS=$((WARNINGS+1))
    PYTHON_PACKAGES_OK=false
else
    echo "✅ PyYAML installed"
fi

if ! python3 -c "import pytest" &> /dev/null; then
    echo "⚠️  pytest not found (will be installed by 'make setup')"
    WARNINGS=$((WARNINGS+1))
    PYTHON_PACKAGES_OK=false
else
    echo "✅ pytest installed"
fi

if ! python3 -c "import playwright" &> /dev/null; then
    echo "⚠️  playwright not found (will be installed by 'make setup')"
    WARNINGS=$((WARNINGS+1))
    PYTHON_PACKAGES_OK=false
else
    echo "✅ playwright installed"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo "✅ All dependencies verified successfully!"
    echo ""
    echo "You're ready to build. Try:"
    echo "  make dev      # Start development server"
    echo "  make build    # Build all components"
    echo ""
    exit 0
elif [ $ERRORS -eq 0 ]; then
    echo "✅ All required dependencies verified!"
    echo "⚠️  $WARNINGS optional dependencies or packages missing"
    echo ""
    echo "Run 'make setup' to install missing packages, or see DEPENDENCIES.md"
    echo ""
    exit 0
else
    echo "❌ $ERRORS required dependencies missing or incorrect version"
    if [ $WARNINGS -gt 0 ]; then
        echo "⚠️  $WARNINGS optional dependencies or packages missing"
    fi
    echo ""
    echo "Please install missing dependencies. See DEPENDENCIES.md for installation instructions."
    echo ""
    exit 1
fi
