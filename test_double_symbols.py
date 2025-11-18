#!/usr/bin/env python3
"""
Check double-flat and double-sharp symbol contour counts
"""
import fontforge

font_path = "dist/fonts/NotationFont-Number.ttf"
font = fontforge.open(font_path)

def count_contours(glyph):
    if not glyph or not glyph.foreground:
        return 0
    count = 0
    for contour in glyph.foreground:
        count += 1
    return count

# Check double-flat symbol (U+1D12B)
double_flat_glyph = font[0x1D12B]
double_flat_contours = count_contours(double_flat_glyph)

# Check double-sharp symbol (U+1D12A)
double_sharp_glyph = font[0x1D12A]
double_sharp_contours = count_contours(double_sharp_glyph)

# Check base "1"
one_glyph = font[ord('1')]
one_contours = count_contours(one_glyph)

print(f"Contour counts:")
print(f"  Base '1' (U+0031):           {one_contours} contours")
print(f"  Double-flat ♭♭ (U+1D12B):    {double_flat_contours} contours")
print(f"  Double-sharp ×  (U+1D12A):   {double_sharp_contours} contours")
print()
print(f"Expected composite counts:")
print(f"  1bb (double-flat):  {one_contours} + {double_flat_contours} = {one_contours + double_flat_contours}")
print(f"  1ss (double-sharp): {one_contours} + {double_sharp_contours} = {one_contours + double_sharp_contours}")

font.close()
