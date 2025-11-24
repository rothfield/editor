#!/bin/bash
# Setup ramdisk for faster Rust compilation
# Moves target/ to /tmp/editor-target and creates symlink

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RAMDISK_TARGET="/tmp/editor-target"

cd "$PROJECT_ROOT"

echo "🚀 Setting up ramdisk for faster compilation..."
echo ""

# Check if /tmp is tmpfs
if ! mountpoint -q /tmp || ! grep -q "tmpfs.*[[:space:]]/tmp[[:space:]]" /proc/mounts; then
    echo "⚠️  WARNING: /tmp is not a tmpfs (ramdisk)"
    echo "   Compilation will still work but won't be faster"
    echo ""
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Check available space
AVAILABLE=$(df -BG /tmp | tail -1 | awk '{print $4}' | tr -d 'G')
NEEDED=3

if [ "$AVAILABLE" -lt "$NEEDED" ]; then
    echo "❌ Not enough space in /tmp"
    echo "   Available: ${AVAILABLE}G"
    echo "   Needed: ${NEEDED}G"
    exit 1
fi

# Backup existing target if it's a real directory
if [ -d target ] && [ ! -L target ]; then
    echo "📦 Moving existing target/ to ramdisk..."

    # Create ramdisk location
    mkdir -p "$RAMDISK_TARGET"

    # Move contents
    if [ "$(ls -A target/)" ]; then
        rsync -a --remove-source-files target/ "$RAMDISK_TARGET/"
        find target/ -type d -empty -delete
    fi

    # Remove old directory
    rm -rf target

    echo "   ✓ Moved to $RAMDISK_TARGET"
fi

# Create symlink if it doesn't exist
if [ ! -L target ]; then
    mkdir -p "$RAMDISK_TARGET"
    ln -sf "$RAMDISK_TARGET" target
    echo "   ✓ Created symlink: target -> $RAMDISK_TARGET"
fi

# Verify setup
if [ -L target ] && [ -d "$RAMDISK_TARGET" ]; then
    echo ""
    echo "✅ Ramdisk setup complete!"
    echo ""
    echo "📊 Stats:"
    echo "   Location: $(readlink target)"
    echo "   Size: $(du -sh "$RAMDISK_TARGET" 2>/dev/null | cut -f1 || echo '0')"
    echo "   Available: $(df -h /tmp | tail -1 | awk '{print $4}')"
    echo ""
    echo "💡 Tips:"
    echo "   • Compilation will be 2-3x faster"
    echo "   • Data is lost on reboot (use restore-ramdisk.sh)"
    echo "   • Run 'make clean' if you need space back"
else
    echo ""
    echo "❌ Setup failed - please check errors above"
    exit 1
fi
