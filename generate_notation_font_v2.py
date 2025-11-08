#!/usr/bin/env python3
"""
Alternative font generator - copies outlines directly instead of using references.
This avoids fontforge's reference-saving issues.
"""

import sys
import os
import fontforge

BASE_CHARS = {
    "number":   "1234567",
    "western":  "CDEFGABcdefgab",
    "sargam":   "SrRgGmMPdDnN",
    "doremi":   "drmfsltDRMFSLT",
}

ALL_CHARS = (
    BASE_CHARS["number"] +
    BASE_CHARS["western"] +
    BASE_CHARS["sargam"] +
    BASE_CHARS["doremi"]
)

def create_dot_variants_direct(input_font_path, output_font_path, pua_start=0xE000):
    """Create font with dotted variants by COPYING outlines."""

    print(f"\nLoading font: {input_font_path}")
    font = fontforge.open(input_font_path)

    # Set font metadata
    font.fontname = "NotationMonoDotted"
    font.fullname = "Notation Mono Dotted"
    font.familyname = "Notation Mono"

    # Get dot glyph (will copy its outline)
    dot_glyph = font[ord('.')]
    if not dot_glyph:
        print("ERROR: No dot glyph (.) found in font")
        return False

    dot_bbox = dot_glyph.boundingBox()
    if not dot_bbox:
        print("ERROR: Could not get bounding box for dot glyph")
        return False

    dx_min, dy_min, dx_max, dy_max = dot_bbox
    dot_width = dx_max - dx_min
    dot_height = dy_max - dy_min

    print(f"  Dot size: {dot_width}x{dot_height}")

    # Create variants
    print(f"\nGenerating {len(ALL_CHARS)} base chars × 4 variants = {len(ALL_CHARS) * 4} glyphs...")

    created = 0
    for i, base_char in enumerate(ALL_CHARS):
        base_glyph = font[ord(base_char)]
        if not base_glyph:
            print(f"  WARNING: Character '{base_char}' not found in font")
            continue

        base_bbox = base_glyph.boundingBox()
        if not base_bbox:
            print(f"  WARNING: Could not get bbox for '{base_char}'")
            continue

        bx_min, by_min, bx_max, by_max = base_bbox
        base_width = bx_max - bx_min

        # Center dot horizontally
        dot_x_offset = bx_min + (base_width - dot_width) / 2
        dot_spacing = dot_height + 2

        # Generate 4 variants
        for variant_idx in range(4):
            codepoint = pua_start + i * 4 + variant_idx
            glyph_name = f"{base_char}_v{variant_idx}"

            # Create new glyph
            g = font.createChar(codepoint, glyph_name)

            # Copy base glyph outline
            base_glyph.draw(g.glyphPen())

            # Draw dot(s) at appropriate positions
            if variant_idx == 0:  # 1 dot above
                y_pos = by_max + 2
                self._draw_dot_at(font, g, dot_bbox, dot_x_offset, y_pos)

            elif variant_idx == 1:  # 2 dots above
                y_pos1 = by_max + 2
                y_pos2 = y_pos1 + dot_spacing
                self._draw_dot_at(font, g, dot_bbox, dot_x_offset, y_pos1)
                self._draw_dot_at(font, g, dot_bbox, dot_x_offset, y_pos2)

            elif variant_idx == 2:  # 1 dot below
                y_pos = by_min - dot_height - 2
                self._draw_dot_at(font, g, dot_bbox, dot_x_offset, y_pos)

            elif variant_idx == 3:  # 2 dots below
                y_pos1 = by_min - dot_height - 2
                y_pos2 = y_pos1 - dot_spacing
                self._draw_dot_at(font, g, dot_bbox, dot_x_offset, y_pos1)
                self._draw_dot_at(font, g, dot_bbox, dot_x_offset, y_pos2)

            # Copy width
            g.width = base_glyph.width
            created += 1

        if (i + 1) % 10 == 0:
            print(f"  Generated {created} glyphs for {i + 1}/{len(ALL_CHARS)} base chars...")

    print(f"\nTotal glyphs created: {created}")

    # Save font
    print(f"\nSaving font to: {output_font_path}")
    try:
        font.generate(output_font_path)
        print("✓ Font generated successfully!")
        return True
    except Exception as e:
        print(f"ERROR: Failed to generate font: {e}")
        return False


def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    static_fonts_dir = os.path.join(script_dir, "static", "fonts")
    input_font = os.path.join(static_fonts_dir, "Inter.ttc")
    output_font = os.path.join(static_fonts_dir, "NotationMonoDotted.ttf")

    print("=" * 70)
    print("NOTATION FONT GENERATOR v2 (Direct Outline Copy)")
    print("=" * 70)
    print(f"\nInput font:  {input_font}")
    print(f"Output font: {output_font}")

    if not os.path.exists(input_font):
        print(f"ERROR: Input font not found: {input_font}")
        sys.exit(1)

    os.makedirs(static_fonts_dir, exist_ok=True)

    success = create_dot_variants_direct(input_font, output_font)
    if not success:
        sys.exit(1)

    print("\n" + "=" * 70)
    print("SUCCESS!")
    print("=" * 70)


if __name__ == "__main__":
    main()
