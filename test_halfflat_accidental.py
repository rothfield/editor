#!/usr/bin/env python3
"""
Check the half-flat accidental glyph at U+F8FF
"""
import fontforge

font_path = "dist/fonts/NotationFont-Number.ttf"
font = fontforge.open(font_path)

# Check the half-flat accidental glyph
halfflat_acc_cp = 0xF8FF
print(f"Half-flat accidental glyph (U+{halfflat_acc_cp:04X}):")
try:
    glyph = font[halfflat_acc_cp]
    print(f"  Name: {glyph.glyphname}")
    print(f"  Width: {glyph.width}")

    # Count contours
    contour_count = 0
    if glyph.foreground:
        for contour in glyph.foreground:
            contour_count += 1

    print(f"  Contour count: {contour_count}")
    print(f"  Expected: 2 (from flat) + 1 (slash) = 3 contours")

    # Export to SVG
    glyph.export("artifacts/halfflat-accidental.svg")
    print(f"\n✓ Exported to artifacts/halfflat-accidental.svg")

except Exception as e:
    print(f"  ERROR: {e}")
