# WASM Build Optimization Guide

## Overview

This document explains the WASM build optimizations implemented to speed up compilation while maintaining production quality.

## Build Profiles

### 1. Development Build (`cargo build`)
**Purpose:** Fastest compilation for active development
- **opt-level:** 0 (no optimization)
- **codegen-units:** 256 (maximum parallelism)
- **LTO:** Disabled
- **Time:** ~15-20 seconds
- **Use case:** Local development, testing changes

```bash
make build-dev
# or
cargo build
```

### 2. Fast Build (`cargo build --profile=fast-build`)
**Purpose:** Quick iteration with minimal optimization
- **opt-level:** 1 (minimal optimization)
- **codegen-units:** 256 (maximum parallelism)
- **LTO:** Disabled
- **Time:** ~18-20 seconds
- **Use case:** Testing before full release build, CI/CD fast builds

```bash
make build-fast
make build-wasm-fast
```

### 3. Release Build (`cargo build --release`)
**Purpose:** Production-ready, optimized binary
- **opt-level:** s (size optimization)
- **lto:** thin (faster than full LTO, still good optimization)
- **codegen-units:** 16 (balance between speed and optimization)
- **Strip:** Enabled
- **Time:** ~20-25 seconds
- **Use case:** Production deployments, final releases

```bash
make build-prod
# or
cargo build --release
```

## WASM-Specific Optimizations

### wasm-opt Tool
The `wasm-pack` tool automatically uses `wasm-opt` for optimization during release builds:

- **Release build:** Uses wasm-opt with O4 optimization (aggressive, slowest compile, smallest file)
- **Fast build:** Skips wasm-opt with `--no-opt` flag (fastest compile, slightly larger file)

### Available WASM Build Targets

**Fast development builds (no wasm-opt):**
```bash
make build-wasm-fast
# Fastest WASM compilation, skips wasm-opt optimization
# Best for: Rapid iteration during development
```

**Release builds (with optimization):**
```bash
make build-wasm-release
# Full optimization with wasm-opt, smaller binary
# Best for: Production deployments
```

**Standard development builds:**
```bash
make build-wasm
# Uses cargo dev profile (no wasm-opt)
# Equivalent to `build-wasm-fast` for incremental development
```

## Performance Comparison

Benchmark results on this system:

| Profile | Time | Optimization | Use Case |
|---------|------|-------------|----------|
| `cargo build` | 15-18s | None | Development |
| `cargo build --profile=fast-build` | 18-20s | Minimal | Fast iteration |
| `wasm-pack build --release` | 20-25s | High (O4) | Production |

## Optimization Techniques Used

### 1. Codegen Units
- **Development:** 256 units (maximum parallelism, slower code)
- **Release:** 16 units (balanced approach)
- **Trade-off:** More units = faster compilation, slower runtime

### 2. Link-Time Optimization (LTO)
- **Development:** Disabled
- **Release:** `thin` (faster than full LTO, good results)
- **Note:** Full LTO (`true`) takes much longer, only use for final release

### 3. Optimization Level
- **Development:** 0 (no optimization, fastest)
- **Release:** s (size optimization, important for WASM)
- **Fast:** 1 (minimal optimization, balance)

### 4. Stripping
- **Development:** Disabled
- **Release:** Enabled (removes debug symbols, smaller binary)

## Recommended Workflow

### For Active Development (Fastest)
```bash
# Fastest iteration - dev build with no optimization
make build-dev
npm run dev
# Make changes and rebuild - takes ~17 seconds total
```

### For Quick WASM Iteration
```bash
# Rebuild WASM only without optimization
make build-wasm-fast
# Takes ~0.3 seconds, super fast for testing
```

### Before Testing
```bash
# Test with slightly optimized version
cargo build
# Full build with dev profile
```

### Before Deployment
```bash
# Full production build with maximum optimization
make build-prod
# Creates optimized, minimal WASM binary
```

### For CI/CD Pipeline
```bash
# Fast enough for CI with Cargo fast-build profile
make build-fast
```

## File Size Impact

Expected WASM file sizes:

| Build | Size (approx) |
|-------|--------------|
| Development (no opt) | 800KB |
| Fast Build (opt-level=1) | 700KB |
| Release (opt-level=s, O4) | 400KB |

## Incremental Builds

Incremental builds are automatically faster than full rebuilds:

```bash
# Full rebuild (clean)
cargo clean && cargo build          # ~18 seconds

# Incremental (with small changes)
cargo build                         # ~2-5 seconds
```

This is automatic - no special configuration needed.

## Troubleshooting

### wasm-opt Errors
If you see errors like "failed to execute `wasm-opt`":

1. Use the fast build without wasm-opt:
   ```bash
   make build-wasm-fast    # Uses --no-opt flag, always works
   ```

2. Try release build (activates full optimization):
   ```bash
   make build-wasm-release
   ```

3. Use regular dev build:
   ```bash
   make build-wasm         # Standard development build
   ```

### Slow Builds
If builds are still slow:

1. Check available CPU cores: `nproc`
2. Close unnecessary applications
3. Use ramdisk for faster I/O: `/mnt/rust_ramdisk`
4. Consider upgrading to SSD if using HDD

## Environment Setup

### Ramdisk (Optional but Recommended)
Use the provided ramdisk script for faster builds:

```bash
bash scripts/auto_setup_ramdisk.sh
```

This creates a 2GB RAM disk for build artifacts, significantly speeding up compilation.

## Summary of Changes

- Added `.cargo/config.toml` with optimized build settings
- Added `fast-build` profile to `Cargo.toml`
- Updated `Makefile` with new build targets:
  - `build-fast` - Fast full build
  - `build-wasm-fast` - Fast WASM only
  - `build-wasm-skip-opt` - WASM with no optimization
  - `build-profile-analyze` - Show optimization details
- Optimized Cargo profiles for parallel compilation
- Changed LTO from `true` to `thin` for faster release builds
