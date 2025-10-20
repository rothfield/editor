#!/bin/bash

# Build script (ramdisk configured in .cargo/config.toml)
echo "🚀 Building with ramdisk (configured in .cargo/config.toml)"
echo "⚡ This should be significantly faster than regular filesystem compilation"

# Check if ramdisk is mounted
if [ ! -d "/mnt/rust_ramdisk/target" ]; then
    echo "❌ Ramdisk not found at /mnt/rust_ramdisk/target"
    echo "   Please ensure ramdisk is mounted before running this script"
    exit 1
fi

# Run the build command passed as arguments, or default to cargo build --release
if [ $# -eq 0 ]; then
    echo "📦 Running: cargo build --release"
    cargo build --release
else
    echo "📦 Running: cargo $@"
    cargo "$@"
fi

echo "✅ Build completed using ramdisk"