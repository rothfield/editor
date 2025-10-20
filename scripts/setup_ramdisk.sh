#!/bin/bash

# Rust Project Ramdisk Setup Script
# Creates ramdisk for target directory and rebuilds project

set -e  # Exit on any error

PROJECT_DIR="/home/john/projects/music-text"
RAMDISK_MOUNT="/mnt/rust_ramdisk"
RAMDISK_SIZE="2G"

echo "🚀 Setting up Rust compilation ramdisk..."

# Check if running as root for mount operations
if [ "$EUID" -ne 0 ]; then
    echo "❌ This script needs sudo privileges for mounting ramdisk"
    echo "Run with: sudo ./setup_ramdisk.sh"
    exit 1
fi

# Create mount point if it doesn't exist
if [ ! -d "$RAMDISK_MOUNT" ]; then
    echo "📁 Creating ramdisk mount point: $RAMDISK_MOUNT"
    mkdir -p "$RAMDISK_MOUNT"
fi

# Check if ramdisk is already mounted
if mountpoint -q "$RAMDISK_MOUNT"; then
    echo "✅ Ramdisk already mounted at $RAMDISK_MOUNT"
else
    echo "💾 Mounting ${RAMDISK_SIZE} ramdisk at $RAMDISK_MOUNT"
    mount -t tmpfs -o size=$RAMDISK_SIZE tmpfs "$RAMDISK_MOUNT"
fi

# Create target directory on ramdisk
RAMDISK_TARGET="$RAMDISK_MOUNT/target"
if [ ! -d "$RAMDISK_TARGET" ]; then
    echo "📂 Creating target directory on ramdisk"
    mkdir -p "$RAMDISK_TARGET"
fi

# Change to project directory
cd "$PROJECT_DIR"

# Backup existing target directory if it exists and is not a symlink
if [ -d "target" ] && [ ! -L "target" ]; then
    echo "💾 Backing up existing target directory"
    if [ -d "target.backup" ]; then
        rm -rf "target.backup"
    fi
    mv target target.backup
    echo "   Backed up to target.backup"
fi

# Remove existing symlink if it exists
if [ -L "target" ]; then
    echo "🔗 Removing existing target symlink"
    rm -f target
fi

# Create symlink to ramdisk target
echo "🔗 Creating symlink: target -> $RAMDISK_TARGET"
ln -s "$RAMDISK_TARGET" target

# Set ownership to the user who called sudo
REAL_USER=$(who am i | awk '{print $1}')
if [ -n "$REAL_USER" ]; then
    echo "👤 Setting ownership to $REAL_USER"
    chown -h "$REAL_USER:$REAL_USER" target
    chown -R "$REAL_USER:$REAL_USER" "$RAMDISK_TARGET"
fi

echo ""
echo "✅ Ramdisk setup complete!"
echo "📊 Ramdisk usage:"
df -h "$RAMDISK_MOUNT"

echo ""
echo "🔨 Starting initial project build..."

# Switch back to normal user for building
if [ -n "$REAL_USER" ]; then
    sudo -u "$REAL_USER" bash -c "
        cd '$PROJECT_DIR' && \
        echo '🦀 Building Rust project...' && \
        cargo build --release && \
        echo '🌐 Building WASM package...' && \
        wasm-pack build --dev --target web --out-dir webapp/pkg
    "
else
    echo "⚠️  Warning: Could not determine real user, skipping build"
fi

echo ""
echo "🎉 Setup complete! Your builds will now be much faster."
echo "💡 Ramdisk will persist until reboot."
echo "💡 To make permanent, add to /etc/fstab:"
echo "    tmpfs $RAMDISK_MOUNT tmpfs size=$RAMDISK_SIZE 0 0"