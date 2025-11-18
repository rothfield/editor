#!/usr/bin/env python3
"""
Check half-flat (1hf) glyph
"""
import fontforge

font_path = "dist/fonts/NotationFont-Number.ttf"
font = fontforge.open(font_path)

# 1hf = character '1' (index 0) with half-flat (acc_type 2)
# variant_index = (2 * 5) + 0 = 10
# codepoint = 0xE000 + (0 * 30) + 10 = 0xE00A
halfflat_cp = 0xE00A

print(f"Half-flat 1hf (U+{halfflat_cp:04X}):")
try:
    glyph = font[halfflat_cp]
    print(f"  Name: {glyph.glyphname}")
    print(f"  Width: {glyph.width}")

    # Count contours
    contour_count = 0
    if glyph.foreground:
        for contour in glyph.foreground:
            contour_count += 1

    print(f"  Contour count: {contour_count}")
    print(f"  Expected: 1 (from '1') + 2 (from flat) + 1 (slash) = 4 contours")

    # Export to SVG
    glyph.export("artifacts/1hf-halfflat.svg")
    print(f"\n✓ Exported to artifacts/1hf-halfflat.svg")

except Exception as e:
    print(f"  ERROR: {e}")
