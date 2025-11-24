#!/usr/bin/env python3
"""
Verify that the font has the correct reference transformations.
"""
import fontforge
import sys
import os

# Default to Number system font in dist/fonts
default_path = os.path.join(os.path.dirname(__file__), "dist/fonts/NotationFont-Number.ttf")
font_path = sys.argv[1] if len(sys.argv) > 1 else default_path

print(f"Opening font: {font_path}\n")
font = fontforge.open(font_path)

# Check the first few glyphs and their reference transformations
test_chars = [0xE000, 0xE001, 0xE002, 0xE003]

print("Checking reference transformations in generated font:\n")

for cp in test_chars:
    g = font[cp]
    print(f"Codepoint 0x{cp:04X} ({g.glyphname}):")
    print(f"  Number of references: {len(g.references)}")

    for i, ref in enumerate(g.references):
        ref_name = ref[0]
        transform_data = ref[1]  # Get the second element which contains transform
        # Transform should be ((xx, xy, yx, yy, dx, dy), flag) or similar
        if isinstance(transform_data, tuple) and len(transform_data) > 0:
            matrix = transform_data[0] if isinstance(transform_data[0], tuple) else transform_data
            if isinstance(matrix, tuple) and len(matrix) >= 6:
                dx, dy = matrix[4], matrix[5]
                print(f"    Ref {i}: {ref_name}")
                print(f"      Transform: xx={matrix[0]}, xy={matrix[1]}, yx={matrix[2]}, yy={matrix[3]}, dx={dx}, dy={dy}")
    print()

print("\n" + "="*60)
print("Font spacing verification:")
print("  0xE000 should have: dy around 1500-1600 (was ~270, now should be ~690)")
print("  0xE001 should have: two dots with spacing ~310 (dot_height=270 + 40)")
print("  0xE002 should have: dy around -1500 to -1600")
print("  0xE003 should have: two dots with spacing ~-310")
