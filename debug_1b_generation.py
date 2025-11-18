#!/usr/bin/env python3
"""
Debug the generation of 1b to see exact positioning
"""
import fontforge
import sys

# Simulate what generate.py does for "1b"
font_path = "dist/fonts/NotationFont-Number.ttf"
font = fontforge.open(font_path)

# Get base "1" character
one_glyph = font[ord('1')]
bbox = one_glyph.boundingBox()
bx_min, by_min, bx_max, by_max = bbox
base_width = bx_max - bx_min  # This is what generate.py uses

print(f"Base '1' character:")
print(f"  bbox: ({bx_min}, {by_min}, {bx_max}, {by_max})")
print(f"  base_width (bx_max - bx_min): {base_width}")
print(f"  bx_max (where '1' actually ends): {bx_max}")
print()

# Get flat symbol
flat_glyph = font[0x266D]
flat_bbox = flat_glyph.boundingBox()
fx_min, fy_min, fx_max, fy_max = flat_bbox

print(f"Flat symbol ♭:")
print(f"  bbox: ({fx_min}, {fy_min}, {fx_max}, {fy_max})")
print(f"  advance width: {flat_glyph.width}")
print()

print(f"Positioning analysis:")
print(f"  Code does: g.addReference(flat_glyph, (1, 0, 0, 1, base_width, 0))")
print(f"  This translates flat by x={base_width}")
print(f"  Flat's internal bbox starts at x={fx_min}")
print(f"  So flat should appear at x={base_width} + {fx_min} = {base_width + fx_min}")
print()
print(f"  But the '1' actually ends at x={bx_max}")
print(f"  So there will be overlap/gap of {(base_width + fx_min) - bx_max} pixels")
print()

if (base_width + fx_min) < bx_max:
    print(f"  ❌ OVERLAP: Flat overlaps with '1' by {bx_max - (base_width + fx_min)} pixels")
elif (base_width + fx_min) > bx_max:
    print(f"  ✓ GAP: {(base_width + fx_min) - bx_max} pixel gap between '1' and flat")
else:
    print(f"  ✓ PERFECT: Flat starts exactly where '1' ends")
print()

print(f"RECOMMENDATION:")
print(f"  Change line 1198 from:")
print(f"    g.addReference(acc_glyph.glyphname, (1, 0, 0, 1, base_width, 0))")
print(f"  To:")
print(f"    g.addReference(acc_glyph.glyphname, (1, 0, 0, 1, bx_max, 0))")
print(f"  This will position flat at x={bx_max} + {fx_min} = {bx_max + fx_min}")
