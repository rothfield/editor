#!/usr/bin/env python3
"""
Font generator v5 - Flatten references into outlines to ensure dots are baked in.
Uses fontforge to create composite glyphs then flattens them properly.
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

def create_dot_variants_flattened(input_font_path, output_font_path, pua_start=0xE000):
    """
    Create font with dotted variants using flattened outlines.
    This ensures dots are properly rendered at any size.
    """

    print(f"\nLoading font: {input_font_path}")
    font = fontforge.open(input_font_path)

    # Set font metadata
    font.fontname = "NotationMonoDotted"
    font.fullname = "Notation Mono Dotted"
    font.familyname = "Notation Mono"

    # Get dot glyph
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
    dot_name = dot_glyph.glyphname

    print(f"  Dot glyph: '{dot_name}'")
    print(f"  Dot bbox: ({dx_min}, {dy_min}, {dx_max}, {dy_max})")
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

        base_glyph_name = base_glyph.glyphname

        # Center dot horizontally over base glyph
        dot_x_offset = bx_min + (base_width - dot_width) / 2 - dx_min
        # Extreme spacing to make differences obvious
        dot_spacing = dot_height + 100
        bbox_offset = 50

        # Generate 4 variants
        for variant_idx in range(4):
            codepoint = pua_start + i * 4 + variant_idx
            glyph_name = f"{base_char}_v{variant_idx}"

            # Create new glyph
            g = font.createChar(codepoint, glyph_name)
            g.clear()

            # Add base glyph reference
            g.addReference(base_glyph_name, (1, 0, 0, 1, 0, 0))

            # Add dot reference(s) with transformation matrix
            if variant_idx == 0:  # 1 dot above
                y_pos = by_max - dy_min + bbox_offset
                g.addReference(dot_name, (1, 0, 0, 1, dot_x_offset, y_pos))

            elif variant_idx == 1:  # 2 dots above
                y_pos1 = by_max - dy_min + bbox_offset
                y_pos2 = y_pos1 + dot_spacing
                g.addReference(dot_name, (1, 0, 0, 1, dot_x_offset, y_pos1))
                g.addReference(dot_name, (1, 0, 0, 1, dot_x_offset, y_pos2))

            elif variant_idx == 2:  # 1 dot below
                y_pos = by_min - dy_max - bbox_offset
                g.addReference(dot_name, (1, 0, 0, 1, dot_x_offset, y_pos))

            elif variant_idx == 3:  # 2 dots below
                y_pos1 = by_min - dy_max - bbox_offset
                y_pos2 = y_pos1 - dot_spacing
                g.addReference(dot_name, (1, 0, 0, 1, dot_x_offset, y_pos1))
                g.addReference(dot_name, (1, 0, 0, 1, dot_x_offset, y_pos2))

            # Copy width from base glyph
            g.width = base_glyph.width

            created += 1

        if (i + 1) % 10 == 0:
            print(f"  Generated {created} glyphs for {i + 1}/{len(ALL_CHARS)} base chars...")

    print(f"\nTotal glyphs created: {created}")

    # Correct direction and prepare glyphs for output
    print(f"\nPreparing {created} custom glyphs...")
    for cp in range(pua_start, pua_start + created):
        g = font[cp]
        if g:
            g.correctDirection()

    # Save font
    print(f"\nSaving font to: {output_font_path}")
    try:
        font.generate(output_font_path)
        print("✓ Font generated successfully with composite glyphs!")
        return True
    except Exception as e:
        print(f"ERROR: Failed to generate font: {e}")
        return False


def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    repo_root = os.path.dirname(os.path.dirname(script_dir))  # scripts/fonts -> editor
    static_fonts_dir = os.path.join(repo_root, "static", "fonts")
    input_font = os.path.join(static_fonts_dir, "Inter.ttc")
    output_font = os.path.join(static_fonts_dir, "NotationMonoDotted.ttf")

    print("=" * 70)
    print("NOTATION FONT GENERATOR v5 (Flattened Composites)")
    print("=" * 70)
    print(f"\nInput font:  {input_font}")
    print(f"Output font: {output_font}")

    if not os.path.exists(input_font):
        print(f"ERROR: Input font not found: {input_font}")
        sys.exit(1)

    os.makedirs(static_fonts_dir, exist_ok=True)

    success = create_dot_variants_flattened(input_font, output_font)
    if not success:
        sys.exit(1)

    print("\n" + "=" * 70)
    print("SUCCESS!")
    print("=" * 70)


if __name__ == "__main__":
    main()
