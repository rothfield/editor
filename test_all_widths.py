#!/usr/bin/env python3
"""
Comprehensive test: verify all accidental glyphs have correct widths
"""
import fontforge

font_path = "dist/fonts/NotationFont-Number.ttf"
font = fontforge.open(font_path)

# Get base "1" character info
one_glyph = font[ord('1')]
one_bbox = one_glyph.boundingBox()
one_bx_max = one_bbox[2]  # Where "1" ends visually

# Test all accidental types for character "1" (base octave)
accidentals = [
    (0, "natural", one_glyph.width),  # Should match base char
    (1, "flat", None),                # Will calculate expected
    (2, "half-flat", None),
    (3, "double-flat", None),
    (4, "double-sharp", None),
    (5, "sharp", None),
]

print("Testing accidental glyph widths for character '1' (base octave):\n")
print(f"{'Accidental':<15} {'Codepoint':<12} {'Actual Width':<15} {'Expected':<15} {'Status':<10}")
print("=" * 75)

all_pass = True
for acc_type, acc_name, expected_width in accidentals:
    variant_index = (acc_type * 5) + 0  # octave_idx = 0 (base octave)
    codepoint = 0xE000 + (0 * 30) + variant_index  # char_idx = 0 (character "1")

    try:
        glyph = font[codepoint]
        actual_width = glyph.width

        # Calculate expected width for accidentals (if not specified)
        if expected_width is None:
            # Get accidental symbol
            acc_codepoints = {
                1: 0x266D,   # flat
                2: 0xF8FF,   # half-flat (our custom glyph)
                3: 0x1D12B,  # double-flat
                4: 0x1D12A,  # double-sharp
                5: 0x266F,   # sharp
            }
            acc_glyph = font[acc_codepoints[acc_type]]
            expected_width = int(one_bx_max + acc_glyph.width)

        status = "✓ PASS" if actual_width == expected_width else "✗ FAIL"
        if actual_width != expected_width:
            all_pass = False

        print(f"{acc_name:<15} U+{codepoint:04X}    {actual_width:<15} {expected_width:<15} {status:<10}")

    except Exception as e:
        print(f"{acc_name:<15} U+{codepoint:04X}    ERROR: {e}")
        all_pass = False

print("=" * 75)
if all_pass:
    print("\n✓ ALL WIDTH TESTS PASSED!")
    print("\nGlyphs with accidentals now have correct advance widths.")
    print("No overlapping with next characters!")
else:
    print("\n✗ SOME WIDTH TESTS FAILED!")

font.close()
