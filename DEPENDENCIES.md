# System Dependencies

Complete list of all dependencies required to build, develop, and test the Music Notation Editor.

## Required Tools

| Dependency | Version Required | Purpose |
|------------|------------------|---------|
| **Node.js** | >= 18.0.0 | JavaScript runtime and build tooling |
| **npm** | >= 9.0.0 | Package manager (bundled with Node.js) |
| **Rust** | >= 1.75 | WASM module compilation |
| **cargo** | >= 1.75 | Rust package manager (bundled with Rust) |
| **wasm-pack** | latest | Rust → WASM build tool |
| **Python** | >= 3.8 | Font generation and testing |
| **pip** | >= 20.0 | Python package manager |

## Optional Tools

| Dependency | Version Required | Purpose |
|------------|------------------|---------|
| **Docker** | >= 20.10 | LilyPond service, cross-browser E2E testing |
| **docker-compose** | >= 1.29 | Service orchestration |

## Python Packages

These are installed automatically via `make setup` using `requirements.txt`:

| Package | Version | Purpose |
|---------|---------|---------|
| **PyYAML** | >= 6.0 | YAML parsing for font configuration |
| **pytest** | >= 7.0.0 | Python testing framework |
| **pytest-cov** | >= 4.0.0 | Test coverage reporting |
| **playwright** | >= 1.40.0 | E2E browser testing |

## Installation Guides

### Ubuntu / Debian

```bash
# Update package list
sudo apt update

# Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"

# Install Python 3 and pip
sudo apt install -y python3 python3-pip

# Install Docker (optional)
sudo apt install -y docker.io docker-compose
sudo usermod -aG docker $USER  # Add user to docker group
# Log out and back in for group membership to take effect

# Verify installations
node --version    # Should be >= 18.0.0
npm --version     # Should be >= 9.0.0
rustc --version   # Should be >= 1.75
python3 --version # Should be >= 3.8
docker --version  # Optional

# Run automated setup
make setup
```

### Arch Linux

```bash
# Install Node.js
sudo pacman -S nodejs npm

# Install Rust
sudo pacman -S rust

# Install Python
sudo pacman -S python python-pip

# Install Docker (optional)
sudo pacman -S docker docker-compose
sudo systemctl enable --now docker
sudo usermod -aG docker $USER  # Add user to docker group
# Log out and back in for group membership to take effect

# Verify installations
node --version    # Should be >= 18.0.0
npm --version     # Should be >= 9.0.0
rustc --version   # Should be >= 1.75
python3 --version # Should be >= 3.8
docker --version  # Optional

# Run automated setup
make setup
```

### macOS

```bash
# Install Homebrew (if not already installed)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Node.js
brew install node

# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"

# Python 3 is usually pre-installed on macOS
# Upgrade pip
python3 -m pip install --upgrade pip

# Install Docker Desktop (optional)
# Download from: https://www.docker.com/products/docker-desktop

# Verify installations
node --version    # Should be >= 18.0.0
npm --version     # Should be >= 9.0.0
rustc --version   # Should be >= 1.75
python3 --version # Should be >= 3.8
docker --version  # Optional

# Run automated setup
make setup
```

### Windows (WSL2)

**Note:** Windows users should use WSL2 (Windows Subsystem for Linux) for development.

```bash
# First, install WSL2 and Ubuntu:
# 1. Open PowerShell as Administrator
# 2. Run: wsl --install
# 3. Restart computer
# 4. Open "Ubuntu" from Start menu

# Inside WSL2 Ubuntu terminal, follow Ubuntu installation steps above
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"
sudo apt install -y python3 python3-pip

# Docker Desktop for Windows integrates with WSL2
# Download from: https://www.docker.com/products/docker-desktop

# Verify installations
node --version    # Should be >= 18.0.0
npm --version     # Should be >= 9.0.0
rustc --version   # Should be >= 1.75
python3 --version # Should be >= 3.8
docker --version  # Optional

# Run automated setup
make setup
```

## Automated Setup

After installing system dependencies, run:

```bash
make setup
```

This will:
- Install npm packages
- Install wasm-pack
- Install Python packages from requirements.txt
- Install Playwright browsers

## Verification

### Quick Verification

Run the automated verification script:

```bash
make verify-deps
```

This checks all dependencies and reports any missing or incorrect versions.

### Manual Verification

Check each dependency individually:

```bash
# Node.js and npm
node --version    # Should show v18.x.x or higher
npm --version     # Should show 9.x.x or higher

# Rust and cargo
rustc --version   # Should show 1.75 or higher
cargo --version   # Should show 1.75 or higher

# wasm-pack (installed via make setup)
wasm-pack --version

# Python and pip
python3 --version # Should show 3.8 or higher
pip3 --version    # Should show 20.0 or higher

# Python packages (after make setup)
python3 -c "import yaml; print('PyYAML OK')"
python3 -c "import pytest; print('pytest OK')"
python3 -c "import playwright; print('playwright OK')"

# Docker (optional)
docker --version
docker-compose --version
```

## Troubleshooting

### "wasm-pack not found"

```bash
cargo install wasm-pack
```

### "Playwright browsers not installed"

```bash
npx playwright install
```

### "Permission denied" for Docker

```bash
# Add your user to the docker group
sudo usermod -aG docker $USER

# Log out and back in for changes to take effect
# Or run: newgrp docker
```

### Node.js version too old

```bash
# Ubuntu/Debian: Use NodeSource repository
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# macOS: Use Homebrew
brew update
brew upgrade node

# Or use nvm (Node Version Manager) for any platform
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 18
nvm use 18
```

### Rust version too old

```bash
rustup update stable
```

### Python packages installation fails

```bash
# Upgrade pip first
python3 -m pip install --upgrade pip

# Install packages with user flag
python3 -m pip install --user -r requirements.txt
```

### "make: command not found"

```bash
# Ubuntu/Debian
sudo apt install build-essential

# macOS
xcode-select --install

# Or use npm scripts instead:
npm run build
npm run dev
npm run test
```

## Build Tool Hierarchy

The project uses a layered build system:

```
┌─────────────────────────────────────────┐
│  Makefile (Primary Developer Interface) │
└──────────────┬──────────────────────────┘
               │
       ┌───────┴────────┬─────────────┬─────────────┐
       │                │             │             │
   ┌───▼───┐    ┌──────▼──────┐  ┌──▼──┐    ┌─────▼─────┐
   │  npm  │    │   cargo     │  │ py  │    │   bash    │
   │scripts│    │  (Rust)     │  │(font│    │ scripts   │
   └───────┘    └─────────────┘  └─────┘    └───────────┘
```

**Recommended workflow:**
- Use `make` commands for all primary development tasks
- Use `npm run` only for JavaScript-specific tooling (linting, formatting)
- Use `cargo` only for Rust-specific development (clippy, doc)
- Never directly invoke Python or bash scripts (use Makefile targets)

## Quick Reference

| Task | Command |
|------|---------|
| Install all dependencies | `make setup` |
| Verify dependencies | `make verify-deps` |
| Start development server | `make dev` |
| Build for production | `make build-prod` |
| Run tests | `make test` |
| Clean build artifacts | `make clean` |
| View all commands | `make help` |

## Support

For issues with dependencies or installation:
1. Check this file for troubleshooting steps
2. Run `make verify-deps` to identify missing/incorrect dependencies
3. Open an issue at [github.com/rothfield/editor/issues](https://github.com/rothfield/editor/issues)
