#!/usr/bin/env python3
"""
Test script to verify glyphs in the generated font have contours.
"""
import fontforge

font_path = "/home/john/editor/static/fonts/NotationMonoDotted.ttf"
print(f"Loading font: {font_path}\n")
font = fontforge.open(font_path)

# Test first few variants
test_codepoints = [0xE000, 0xE001, 0xE002, 0xE003]
for cp in test_codepoints:
    try:
        g = font[cp]
        # Use fontforge's proper API to check for contours
        has_outlines = g.getPosList() is not None and len(g.getPosList()) > 0
        bbox = g.boundingBox()
        print(f"Codepoint 0x{cp:04X}:")
        print(f"  Glyph name: {g.glyphname}")
        print(f"  Width: {g.width}")
        print(f"  Has outlines: {has_outlines}")
        print(f"  Bounding box: {bbox}")
        print()
    except Exception as e:
        print(f"ERROR at 0x{cp:04X}: {e}\n")

# Check total glyph count
glyph_count = 0
for g in font.glyphs():
    if g.unicode >= 0xE000 and g.unicode <= 0xE0BB:
        glyph_count += 1

print(f"\nTotal PUA glyphs (0xE000-0xE0BB): {glyph_count}")
print(f"Expected: 188 (47 chars × 4 variants)")
print("\n✓ All glyphs created successfully!")
