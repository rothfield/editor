#!/usr/bin/env python3
"""
Check widths vs bounding box
"""
import fontforge

font_path = "dist/fonts/NotationFont-Number.ttf"
font = fontforge.open(font_path)

# Check "1" character
one_glyph = font[ord('1')]
bbox = one_glyph.boundingBox()
bx_min, by_min, bx_max, by_max = bbox
bbox_width = bx_max - bx_min

print(f"Character '1' (U+0031):")
print(f"  Advance width: {one_glyph.width}")
print(f"  Bounding box: ({bx_min}, {by_min}, {bx_max}, {by_max})")
print(f"  Bbox width: {bbox_width}")
print(f"  Left sidebearing: {bx_min}")
print(f"  Right sidebearing: {one_glyph.width - bx_max}")
print()

# Check flat symbol
flat_glyph = font[0x266D]
flat_bbox = flat_glyph.boundingBox()
fx_min, fy_min, fx_max, fy_max = flat_bbox

print(f"Flat symbol ♭ (U+266D):")
print(f"  Advance width: {flat_glyph.width}")
print(f"  Bounding box: ({fx_min}, {fy_min}, {fx_max}, {fy_max})")
print(f"  Bbox width: {fx_max - fx_min}")
print()

# Check composite 1b
composite_glyph = font[0xE005]
comp_bbox = composite_glyph.boundingBox()
cx_min, cy_min, cx_max, cy_max = comp_bbox

print(f"Composite 1b (U+E005):")
print(f"  Advance width: {composite_glyph.width}")
print(f"  Bounding box: ({cx_min}, {cy_min}, {cx_max}, {cy_max})")
print(f"  Bbox width: {cx_max - cx_min}")
print()

print("Expected positioning:")
print(f"  Base '1' ends at x={bx_max}")
print(f"  Flat should start at x={bbox_width} (using bbox_width)")
print(f"  Flat should start at x={one_glyph.width} (using advance width)")
print(f"  Actual flat starts at x={cx_min + fx_min} (based on composite bbox)")
