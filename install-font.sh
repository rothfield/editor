#!/bin/bash
# Install NotationFont system-wide for use in applications like leafpad

FONT_DIR="$HOME/.local/share/fonts"
FONT_SOURCE_DIR="/home/john/editor/dist/fonts"

# Create fonts directory if it doesn't exist
mkdir -p "$FONT_DIR"

# Copy all font variants
echo "Installing NotationFont variants..."
cp "$FONT_SOURCE_DIR"/NotationFont*.ttf "$FONT_DIR/"

# Update font cache
fc-cache -f -v

echo ""
echo "✓ NotationFont variants installed to $FONT_DIR"
echo "✓ Font cache updated"
echo ""
echo "Installed fonts:"
ls -1 "$FONT_DIR"/NotationFont*.ttf 2>/dev/null | xargs -n1 basename
echo ""
echo "You can now use 'NotationFont' in applications like leafpad"
echo "Restart applications to see the new font in their font menus"
