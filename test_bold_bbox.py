#!/usr/bin/env python3
"""
Check if composite glyphs are using bold font bbox
"""
import fontforge

# Load the fonts used for generation
regular_font = fontforge.open("tools/fontgen/sources/NotoSans-Regular.ttf")
bold_font = fontforge.open("tools/fontgen/sources/NotoSans-Bold.ttf")

# Check "1" in both fonts
regular_one = regular_font[ord('1')]
bold_one = bold_font[ord('1')]

regular_bbox = regular_one.boundingBox()
bold_bbox = bold_one.boundingBox()

print("Bounding boxes for '1':")
print(f"  Regular: {regular_bbox}")
print(f"  Bold:    {bold_bbox}")
print()
print(f"  Regular bx_max: {regular_bbox[2]}")
print(f"  Bold bx_max:    {bold_bbox[2]}")
print()
print(f"  Difference: {bold_bbox[2] - regular_bbox[2]} pixels")

# Check advance widths
print(f"\nAdvance widths:")
print(f"  Regular: {regular_one.width}")
print(f"  Bold:    {bold_one.width}")

regular_font.close()
bold_font.close()

# Now check what the composite actually got
result_font = fontforge.open("dist/fonts/NotationFont-Number.ttf")
flat_glyph = result_font[0x266D]

print(f"\nFlat symbol width: {flat_glyph.width}")
print(f"\nExpected composite width (bold): {bold_bbox[2]} + {flat_glyph.width} = {int(bold_bbox[2] + flat_glyph.width)}")
print(f"Actual composite width:  {result_font[0xE005].width}")

result_font.close()
