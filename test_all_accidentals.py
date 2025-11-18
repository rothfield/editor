#!/usr/bin/env python3
"""
Verify all accidental types are correct
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

# Test character "1" (index 0) with all accidentals
# variant_index = (acc_type * 5) + octave_idx
# Base octave (octave_idx = 0)

accidentals = [
    (0, "natural", 1),      # 1 contour (just the "1")
    (1, "flat", 3),         # 3 contours ("1" + flat symbol)
    (2, "half-flat", 4),    # 4 contours ("1" + flat + slash)
    (3, "double-flat", 4),  # 4 contours ("1" + double-flat symbol which has 3 contours)
    (4, "double-sharp", 2), # 2 contours ("1" + double-sharp symbol which has 1 contour)
    (5, "sharp", 3),        # 3 contours ("1" + sharp symbol)
]

print("Testing all accidentals for character '1' (base octave):\n")
print(f"{'Accidental':<15} {'Codepoint':<12} {'Contours':<10} {'Expected':<10} {'Status':<10}")
print("=" * 65)

all_pass = True
for acc_type, acc_name, expected_contours in accidentals:
    variant_index = (acc_type * 5) + 0  # octave_idx = 0 (base octave)
    codepoint = 0xE000 + (0 * 30) + variant_index  # char_idx = 0 (character "1")

    try:
        glyph = font[codepoint]
        actual_contours = count_contours(glyph)
        status = "✓ PASS" if actual_contours == expected_contours else "✗ FAIL"
        if actual_contours != expected_contours:
            all_pass = False

        print(f"{acc_name:<15} U+{codepoint:04X}    {actual_contours:<10} {expected_contours:<10} {status:<10}")

    except Exception as e:
        print(f"{acc_name:<15} U+{codepoint:04X}    ERROR: {e}")
        all_pass = False

print("=" * 65)
if all_pass:
    print("\n✓ ALL TESTS PASSED!")
else:
    print("\n✗ SOME TESTS FAILED!")

font.close()
