#!/usr/bin/env python3
"""
Generate notation font with dotted variants for multiple notation systems.

Notation systems:
- Number: 1234567 (1 and 2 dots above/below)
- Western: CDEFGABcdefgab (1 and 2 dots above/below)
- Sargam: SrRgGmMPdDnN (1 and 2 dots above/below)
- Doremi (Solfege): drmfsltDRMFSLT (1 and 2 dots above/below)

Each base character gets 4 variants:
- variant 0: 1 dot above
- variant 1: 2 dots above
- variant 2: 1 dot below
- variant 3: 2 dots below

Characters are mapped to PUA (Private Use Area) starting at 0xE000.
"""

import sys
import os

# Define base characters for each notation system
BASE_CHARS = {
    "number":   "1234567",
    "western":  "CDEFGABcdefgab",
    "sargam":   "SrRgGmMPdDnN",
    "doremi":   "drmfsltDRMFSLT",
}

# Build ordered list of all characters
ALL_CHARS = (
    BASE_CHARS["number"] +
    BASE_CHARS["western"] +
    BASE_CHARS["sargam"] +
    BASE_CHARS["doremi"]
)

print(f"Base characters: {ALL_CHARS}")
print(f"Total base chars: {len(ALL_CHARS)}")
print(f"Total variants (4 per char): {len(ALL_CHARS) * 4}")

# Try to import fontforge
try:
    import fontforge
except ImportError:
    print("ERROR: fontforge Python module not found.")
    print("Install it with: pip install fontforge")
    print("Or system package: apt-get install fonttools python3-fontforge")
    sys.exit(1)


def get_bounding_box(glyph):
    """Get bounding box of a glyph."""
    if not glyph:
        return None
    try:
        bbox = glyph.boundingBox()
        if bbox:
            return bbox
    except:
        pass
    return None


def create_dot_variants(input_font_path, output_font_path, pua_start=0xE000):
    """
    Create font with dotted variants for all notation characters.

    Args:
        input_font_path: Path to base TTF font (e.g., /path/to/Inter.ttc)
        output_font_path: Path to output TTF font
        pua_start: Starting codepoint for PUA (default 0xE000)
    """

    print(f"\nLoading font: {input_font_path}")
    font = fontforge.open(input_font_path)

    # Set font metadata
    font.fontname = "NotationMonoDotted"
    font.fullname = "Notation Mono Dotted"
    font.familyname = "Notation Mono"

    # Get dot glyph
    print("\nGetting dot reference...")
    dot_glyph = font[ord('.')]
    if not dot_glyph:
        print("ERROR: No dot glyph (.) found in font")
        return False

    dot_name = dot_glyph.glyphname
    dot_bbox = get_bounding_box(dot_glyph)
    if not dot_bbox:
        print("ERROR: Could not get bounding box for dot glyph")
        return False

    dx_min, dy_min, dx_max, dy_max = dot_bbox
    dot_width = dx_max - dx_min
    dot_height = dy_max - dy_min

    print(f"  Dot glyph: '{dot_name}'")
    print(f"  Dot size: {dot_width}x{dot_height}")
    print(f"  Dot bbox: ({dx_min}, {dy_min}, {dx_max}, {dy_max})")

    # Create variants for each base character
    print(f"\nGenerating {len(ALL_CHARS)} base chars × 4 variants = {len(ALL_CHARS) * 4} glyphs...")

    created = 0
    for i, base_char in enumerate(ALL_CHARS):
        base_glyph = font[ord(base_char)]
        if not base_glyph:
            print(f"  WARNING: Character '{base_char}' not found in font")
            continue

        base_bbox = get_bounding_box(base_glyph)
        if not base_bbox:
            print(f"  WARNING: Could not get bbox for '{base_char}'")
            continue

        bx_min, by_min, bx_max, by_max = base_bbox
        base_width = bx_max - bx_min
        base_height = by_max - by_min

        # Center dot horizontally over base glyph
        dot_x_offset = bx_min + (base_width - dot_width) / 2 - dx_min

        # Compute vertical spacing (2 pixels between dots)
        dot_spacing = dot_height + 2

        # Generate 4 variants for this character
        for variant_idx in range(4):
            codepoint = pua_start + i * 4 + variant_idx
            glyph_name = f"{base_char}_v{variant_idx}"

            # Create new glyph
            g = font.createChar(codepoint, glyph_name)

            # Add base glyph reference
            g.addReference(base_glyph.glyphname)

            # Add dot references based on variant
            if variant_idx == 0:  # 1 dot above
                y_pos_above = by_max - dy_min + 2
                if i == 0:
                    print(f"    DEBUG v0: by_max={by_max}, dy_min={dy_min}, y_pos_above={y_pos_above}, dot_x_offset={dot_x_offset}")
                try:
                    g.addReference(dot_name, (1, 0, 0, 1, dot_x_offset, y_pos_above))
                except Exception as e:
                    if i == 0:
                        print(f"  ERROR adding 1-dot-above reference: {e}")

            elif variant_idx == 1:  # 2 dots above
                y_pos_above1 = by_max - dy_min + 2
                y_pos_above2 = y_pos_above1 + dot_spacing
                g.addReference(dot_name, (1, 0, 0, 1, dot_x_offset, y_pos_above1))
                g.addReference(dot_name, (1, 0, 0, 1, dot_x_offset, y_pos_above2))

            elif variant_idx == 2:  # 1 dot below
                y_pos_below = by_min - dy_max - 2
                if i == 0:
                    print(f"    DEBUG v2: by_min={by_min}, dy_max={dy_max}, y_pos_below={y_pos_below}, dot_x_offset={dot_x_offset}")
                try:
                    g.addReference(dot_name, (1, 0, 0, 1, dot_x_offset, y_pos_below))
                except Exception as e:
                    if i == 0:
                        print(f"  ERROR adding 1-dot-below reference: {e}")

            elif variant_idx == 3:  # 2 dots below
                y_pos_below1 = by_min - dy_max - 2
                y_pos_below2 = y_pos_below1 - dot_spacing
                g.addReference(dot_name, (1, 0, 0, 1, dot_x_offset, y_pos_below1))
                g.addReference(dot_name, (1, 0, 0, 1, dot_x_offset, y_pos_below2))

            # Copy width from base glyph
            g.width = base_glyph.width

            # Verify references were added
            ref_count = len(g.references)
            expected_refs = 1 + (1 if variant_idx == 0 else 2 if variant_idx == 1 else 1 if variant_idx in (2, 3) else 0)
            if ref_count != expected_refs and i == 0:  # Only warn for first character
                print(f"  WARNING: {base_char}_v{variant_idx} has {ref_count} refs, expected {expected_refs}")

            created += 1

        if (i + 1) % 10 == 0:
            print(f"  Generated {created} glyphs for {i + 1}/{len(ALL_CHARS)} base chars...")

    print(f"\nTotal glyphs created: {created}")

    # Debug: check references before flatten
    print("\nDEBUG: Checking references before flatten:")
    for cp in range(0xE000, 0xE004):
        g = font[cp]
        print(f"  0x{cp:04X} ({g.glyphname}): {len(g.references)} references")

    # Flatten the font to convert all references to outlines
    print("\nFlattening font (converting references to outlines)...")
    font.flatten()

    # Debug: check references after flatten
    print("DEBUG: Checking references after flatten:")
    for cp in range(0xE000, 0xE004):
        g = font[cp]
        print(f"  0x{cp:04X} ({g.glyphname}): {len(g.references)} references")

    # Save font
    print(f"\nSaving font to: {output_font_path}")
    try:
        font.generate(output_font_path)
        print("✓ Font generated successfully!")
        return True
    except Exception as e:
        print(f"ERROR: Failed to generate font: {e}")
        return False


def write_mapping_json(output_path):
    """Write a JSON file documenting the codepoint mappings."""
    import json

    mapping = {
        "base_chars": ALL_CHARS,
        "pua_start": 0xE000,
        "variants": ["1 dot above", "2 dots above", "1 dot below", "2 dots below"],
        "systems": BASE_CHARS,
        "glyphs": {}
    }

    for i, base_char in enumerate(ALL_CHARS):
        mapping["glyphs"][base_char] = {
            "base_index": i,
            "codepoint": hex(0xE000 + i * 4),
            "variants": {
                "above1": hex(0xE000 + i * 4 + 0),
                "above2": hex(0xE000 + i * 4 + 1),
                "below1": hex(0xE000 + i * 4 + 2),
                "below2": hex(0xE000 + i * 4 + 3),
            }
        }

    with open(output_path, 'w') as f:
        json.dump(mapping, f, indent=2)

    print(f"✓ Mapping saved to: {output_path}")


def main():
    # Paths
    script_dir = os.path.dirname(os.path.abspath(__file__))
    static_fonts_dir = os.path.join(script_dir, "static", "fonts")
    input_font = os.path.join(static_fonts_dir, "Inter.ttc")
    output_font = os.path.join(static_fonts_dir, "NotationMonoDotted.ttf")
    mapping_file = os.path.join(script_dir, "notation_font_mapping.json")

    print("=" * 70)
    print("NOTATION FONT GENERATOR")
    print("=" * 70)
    print(f"\nInput font:  {input_font}")
    print(f"Output font: {output_font}")
    print(f"Mapping:     {mapping_file}")

    # Check input font exists
    if not os.path.exists(input_font):
        print(f"ERROR: Input font not found: {input_font}")
        sys.exit(1)

    # Create output directory if needed
    os.makedirs(static_fonts_dir, exist_ok=True)

    # Generate font
    success = create_dot_variants(input_font, output_font)
    if not success:
        sys.exit(1)

    # Write mapping file
    write_mapping_json(mapping_file)

    print("\n" + "=" * 70)
    print("SUCCESS!")
    print("=" * 70)
    print(f"\nGenerated font can be used in CSS:")
    print("""
    @font-face {{
        font-family: 'NotationMonoDotted';
        src: url('/fonts/NotationMonoDotted.ttf') format('truetype');
    }}

    .notation {{
        font-family: 'NotationMonoDotted', monospace;
    }}
    """)


if __name__ == "__main__":
    main()
