#!/usr/bin/env python3
"""
Check flat symbol and 1b composite glyph
"""
import fontforge
import sys

font_path = "dist/fonts/NotationFont-Number.ttf"
print(f"Loading font: {font_path}\n")
font = fontforge.open(font_path)

# Check flat symbol (U+266D)
flat_cp = 0x266D
print(f"Flat symbol (U+{flat_cp:04X}):")
try:
    flat_glyph = font[flat_cp]
    print(f"  Name: {flat_glyph.glyphname}")
    print(f"  Width: {flat_glyph.width}")
    print(f"  Has foreground: {flat_glyph.foreground is not None}")
    print(f"  Layers: {flat_glyph.layers}")
    print()
except Exception as e:
    print(f"  ERROR: {e}\n")

# Check 1b composite (U+E005)
composite_cp = 0xE005
print(f"1b composite (U+{composite_cp:04X}):")
try:
    composite_glyph = font[composite_cp]
    print(f"  Name: {composite_glyph.glyphname}")
    print(f"  Width: {composite_glyph.width}")
    print(f"  Has foreground: {composite_glyph.foreground is not None}")
    print(f"  Layers: {composite_glyph.layers}")
    # Try to check if it has any actual contours
    print(f"  Layer count: {composite_glyph.layer_cnt}")

    # Check foreground layer
    if composite_glyph.foreground:
        print(f"  Foreground is not None")
        # Try to iterate over contours
        contour_count = 0
        try:
            for contour in composite_glyph.foreground:
                contour_count += 1
        except:
            pass
        print(f"  Contour count: {contour_count}")
    print()
except Exception as e:
    print(f"  ERROR: {e}\n")

# Check base "1" character (U+0031)
one_cp = ord('1')
print(f"Base '1' character (U+{one_cp:04X}):")
try:
    one_glyph = font[one_cp]
    print(f"  Name: {one_glyph.glyphname}")
    print(f"  Width: {one_glyph.width}")
    print(f"  Has foreground: {one_glyph.foreground is not None}")
    print()
except Exception as e:
    print(f"  ERROR: {e}\n")
