#!/usr/bin/env python3
"""
Count contours in each component
"""
import fontforge

font_path = "dist/fonts/NotationFont-Number.ttf"
font = fontforge.open(font_path)

def count_contours(glyph):
    """Count contours in a glyph"""
    if not glyph.foreground:
        return 0
    count = 0
    try:
        for contour in glyph.foreground:
            count += 1
    except:
        pass
    return count

# Check each component
flat_glyph = font[0x266D]
one_glyph = font[ord('1')]
composite_glyph = font[0xE005]

print(f"Contour counts:")
print(f"  Base '1' (U+0031):    {count_contours(one_glyph)} contours")
print(f"  Flat ♭ (U+266D):      {count_contours(flat_glyph)} contours")
print(f"  Expected for 1b:      {count_contours(one_glyph) + count_contours(flat_glyph)} contours")
print(f"  Actual 1b (U+E005):   {count_contours(composite_glyph)} contours")
print()

# Export each glyph to SVG for visual inspection
print("Exporting glyphs to SVG...")
flat_glyph.export("artifacts/flat-symbol.svg")
one_glyph.export("artifacts/one-character.svg")
composite_glyph.export("artifacts/1b-composite.svg")
print("✓ Exported to artifacts/")
