#!/bin/bash

# Start web server (ramdisk configured in .cargo/config.toml)
echo "🎵 Starting Music-Text Web Server"
echo "📍 Server will run on http://127.0.0.1:3000"  
echo "⚡ Using ramdisk for faster compilation (configured in .cargo/config.toml)"
echo "🛑 Press Ctrl+C to stop"

# Check if ramdisk is mounted
if [ ! -d "/mnt/rust_ramdisk/target" ]; then
    echo "❌ Ramdisk not found at /mnt/rust_ramdisk/target"
    echo "   Please ensure ramdisk is mounted before running this script"
    exit 1
fi

# Start the web server
cargo run --release --bin cli -- --web