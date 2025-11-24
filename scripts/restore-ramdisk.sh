#!/bin/bash
# Restore target/ from ramdisk to disk before reboot/shutdown
# Prevents loss of incremental compilation cache

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RAMDISK_TARGET="/tmp/editor-target"
BACKUP_TARGET="$PROJECT_ROOT/target-backup"

cd "$PROJECT_ROOT"

echo "💾 Restoring target/ from ramdisk to disk..."
echo ""

# Check if target is a symlink to ramdisk
if [ ! -L target ]; then
    echo "ℹ️  target/ is not a symlink - nothing to restore"
    exit 0
fi

LINK_TARGET=$(readlink target)
if [ "$LINK_TARGET" != "$RAMDISK_TARGET" ]; then
    echo "ℹ️  target/ points to $LINK_TARGET (not ramdisk)"
    exit 0
fi

# Check if ramdisk location exists and has content
if [ ! -d "$RAMDISK_TARGET" ] || [ -z "$(ls -A "$RAMDISK_TARGET" 2>/dev/null)" ]; then
    echo "ℹ️  Ramdisk location is empty - nothing to restore"
    exit 0
fi

echo "📦 Copying from ramdisk to disk..."
mkdir -p "$BACKUP_TARGET"
rsync -a --info=progress2 "$RAMDISK_TARGET/" "$BACKUP_TARGET/"

echo ""
echo "✅ Backup complete!"
echo "   Location: $BACKUP_TARGET"
echo "   Size: $(du -sh "$BACKUP_TARGET" | cut -f1)"
echo ""
echo "💡 To use the backup:"
echo "   1. Remove symlink: rm target"
echo "   2. Restore backup: mv target-backup target"
echo ""
