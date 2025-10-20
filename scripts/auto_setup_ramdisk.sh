#!/bin/bash

# Auto Ramdisk Setup - Runs on login
# Sets up ramdisk without requiring manual sudo each time

set -e

PROJECT_DIR=$PROJECT 
#"/home/john/projects/music-text"
RAMDISK_MOUNT="/mnt/rust_ramdisk"
RAMDISK_SIZE="2G"

echo "🚀 Auto-setting up Rust ramdisk..."

# Check if ramdisk is already mounted
if mountpoint -q "$RAMDISK_MOUNT" 2>/dev/null; then
    echo "✅ Ramdisk already mounted"
else
    echo "💾 Setting up ramdisk (will prompt for sudo)"
    sudo mkdir -p "$RAMDISK_MOUNT"
    sudo mount -t tmpfs -o size=$RAMDISK_SIZE tmpfs "$RAMDISK_MOUNT"
    echo "✅ Ramdisk mounted"
fi

# Set up project symlink
cd "$PROJECT_DIR"

RAMDISK_TARGET="$RAMDISK_MOUNT/dist"
sudo mkdir -p "$RAMDISK_TARGET"
sudo chown "$USER:$USER" "$RAMDISK_TARGET"

# Handle existing target directory
if [ -d "target" ] && [ ! -L "target" ]; then
    echo "💾 Moving existing target to ramdisk"
    cp -r target/* "$RAMDISK_TARGET/" 2>/dev/null || true
    rm -rf target
fi

# Create/update symlink
if [ -L "target" ]; then
    rm -f target
fi

ln -s "$RAMDISK_TARGET" target

echo "✅ Ramdisk ready at $RAMDISK_TARGET"
echo "📊 Usage: $(df -h "$RAMDISK_MOUNT" | tail -1 | awk '{print $3 "/" $2}')"
