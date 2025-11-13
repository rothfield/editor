#!/bin/bash
# Install NotationFont system-wide for use in applications like leafpad

FONT_DIR="$HOME/.local/share/fonts"
FONT_FILE="/home/john/editor/static/fonts/NotationFont.ttf"

# Create fonts directory if it doesn't exist
mkdir -p "$FONT_DIR"

# Copy font file
cp "$FONT_FILE" "$FONT_DIR/NotationFont.ttf"

# Update font cache
fc-cache -f -v

echo "✓ NotationFont installed to $FONT_DIR"
echo "✓ Font cache updated"
echo ""
echo "You can now use 'NotationFont' in applications like leafpad"
echo "Restart applications to see the new font in their font menus"
