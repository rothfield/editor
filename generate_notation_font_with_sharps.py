#!/usr/bin/env python3
"""
Extended font generator - Adds sharp glyphs to NotationMonoDotted
Generates single-glyph representations for sharps (1#, 2#, etc.)
Uses SMuFL sharp accidental (U+E262) combined with pitch characters.
"""

import sys
import os
import json
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

# Accidental variants: natural, sharp, flat, double-sharp, double-flat
ACCIDENTALS = {
    "natural":  {"symbol": "", "name": "natural", "code": ""},
    "sharp":    {"symbol": "#", "name": "sharp", "code": "s"},
    "flat":     {"symbol": "b", "name": "flat", "code": "b"},
    "dsharp":   {"symbol": "##", "name": "double-sharp", "code": "ss"},
    "dflat":    {"symbol": "bb", "name": "double-flat", "code": "bb"},
}

def generate_extended_font_with_sharps(input_font_path, output_font_path, pua_start=0xE000):
    """
    Generate extended notation font with:
    1. Dotted variants (octave markers)
    2. Sharp glyphs (single unified glyph for pitches like '1#', '2#', etc.)
    """

    print(f"\nLoading font: {input_font_path}")
    font = fontforge.open(input_font_path)

    # Set font metadata
    font.fontname = "NotationMonoDotted"
    font.fullname = "Notation Mono Dotted"
    font.familyname = "Notation Mono"

    # Get glyphs we'll need
    dot_glyph = font[ord('.')]
    if not dot_glyph:
        print("ERROR: No dot glyph (.) found in font")
        return False, {}

    dot_bbox = dot_glyph.boundingBox()
    if not dot_bbox:
        print("ERROR: Could not get bounding box for dot glyph")
        return False, {}

    dx_min, dy_min, dx_max, dy_max = dot_bbox
    dot_width = dx_max - dx_min
    dot_height = dy_max - dy_min
    dot_name = dot_glyph.glyphname

    # Flatten the dot glyph itself if it has references
    if len(dot_glyph.references) > 0:
        try:
            dot_glyph.unlinkRef()
        except:
            pass

    # Get sharp glyph from SMuFL (already should exist or we'll try to create)
    # SMuFL sharp is U+E262
    try:
        sharp_glyph = font[0xE262]  # SMuFL sharp
        if not sharp_glyph or not sharp_glyph.glyphname:
            print("WARNING: SMuFL sharp (U+E262) not found, will create manually")
            # Try to use '#' instead
            sharp_glyph = font[ord('#')]
            if not sharp_glyph:
                print("ERROR: No sharp symbol found")
                return False, {}
    except:
        sharp_glyph = font[ord('#')]

    # Flatten the sharp glyph itself if it has references
    if len(sharp_glyph.references) > 0:
        try:
            sharp_glyph.unlinkRef()
        except:
            pass

    sharp_glyph_name = sharp_glyph.glyphname
    print(f"  Sharp glyph: '{sharp_glyph_name}'")

    print(f"  Dot glyph: '{dot_name}'")
    print(f"  Dot bbox: ({dx_min}, {dy_min}, {dx_max}, {dy_max})")
    print(f"  Dot size: {dot_width}x{dot_height}")

    # Track mapping for JSON
    glyph_mapping = {}

    # Phase 1: Create dotted variants (existing functionality)
    print(f"\nPhase 1: Generating {len(ALL_CHARS)} base chars × 4 dotted variants...")
    created_dotted = 0

    for i, base_char in enumerate(ALL_CHARS):
        base_glyph = font[ord(base_char)]
        if not base_glyph:
            print(f"  WARNING: Character '{base_char}' not found in font")
            continue

        # Flatten base glyph if it has references
        if len(base_glyph.references) > 0:
            try:
                base_glyph.unlinkRef()
            except:
                pass

        base_bbox = base_glyph.boundingBox()
        if not base_bbox:
            print(f"  WARNING: Could not get bbox for '{base_char}'")
            continue

        bx_min, by_min, bx_max, by_max = base_bbox
        base_width = bx_max - bx_min

        base_glyph_name = base_glyph.glyphname

        # Initialize mapping for this character
        char_map = {
            "base_index": i,
            "codepoint": hex(pua_start + i * 4),
            "variants": {}
        }

        # Center dot horizontally over base glyph
        dot_x_offset = bx_min + (base_width - dot_width) / 2 - dx_min
        # Spacing between dots and from bounding box
        dot_spacing = dot_height + dot_height * 0.5
        bbox_offset = dot_height

        # Generate 4 dotted variants
        for variant_idx in range(4):
            codepoint = pua_start + i * 4 + variant_idx
            glyph_name = f"{base_char}_v{variant_idx}"

            # Create new glyph with immediate unlink to create outlines
            g = font.createChar(codepoint, glyph_name)
            g.clear()

            # Add base glyph reference (identity transform)
            g.addReference(base_glyph_name, (1, 0, 0, 1, 0, 0))

            # Add dot reference(s) with transforms
            if variant_idx == 0:  # 1 dot above
                y_pos = by_max - dy_min + bbox_offset
                g.addReference(dot_name, (1, 0, 0, 1, dot_x_offset, y_pos))
                char_map["variants"]["above1"] = hex(codepoint)

            elif variant_idx == 1:  # 2 dots above
                y_pos1 = by_max - dy_min + bbox_offset
                y_pos2 = y_pos1 + dot_spacing
                g.addReference(dot_name, (1, 0, 0, 1, dot_x_offset, y_pos1))
                g.addReference(dot_name, (1, 0, 0, 1, dot_x_offset, y_pos2))
                char_map["variants"]["above2"] = hex(codepoint)

            elif variant_idx == 2:  # 1 dot below
                y_pos = by_min - dy_max - bbox_offset
                g.addReference(dot_name, (1, 0, 0, 1, dot_x_offset, y_pos))
                char_map["variants"]["below1"] = hex(codepoint)

            elif variant_idx == 3:  # 2 dots below
                y_pos1 = by_min - dy_max - bbox_offset
                y_pos2 = y_pos1 - dot_spacing
                g.addReference(dot_name, (1, 0, 0, 1, dot_x_offset, y_pos1))
                g.addReference(dot_name, (1, 0, 0, 1, dot_x_offset, y_pos2))
                char_map["variants"]["below2"] = hex(codepoint)

            # Keep references as-is - they work fine for basic composite glyphs
            # Fontforge's draw() method has issues with transforms that cause crashes
            # The browser can render composite glyphs just fine
            pass

            # Copy width from base glyph
            g.width = base_glyph.width

            g.round()

            bbox = g.boundingBox()
            if bbox:
                y_min, y_max = bbox[1], bbox[3]
                g.vwidth = int(y_max - y_min + bbox_offset * 2)

            created_dotted += 1

        glyph_mapping[base_char] = char_map

        if (i + 1) % 10 == 0:
            print(f"  Generated {created_dotted} dotted variant glyphs for {i + 1}/{len(ALL_CHARS)} base chars...")

    print(f"  Total dotted glyphs created: {created_dotted}")

    # Phase 2: Create sharp glyphs
    # Sharp glyphs will be composite glyphs combining base char + sharp symbol
    # Codepoints: Start after dotted variants
    # Each character gets 5 accidental forms: natural, sharp, flat, dsharp, dflat
    # But we already have naturals (base chars), so we add 4 more per character
    print(f"\nPhase 2: Generating {len(ALL_CHARS)} chars × 4 accidental glyphs (s/b/ss/bb)...")

    sharp_pua_start = pua_start + len(ALL_CHARS) * 4  # Start after dotted variants
    created_sharps = 0

    for i, base_char in enumerate(ALL_CHARS):
        base_glyph = font[ord(base_char)]
        if not base_glyph:
            continue

        base_glyph_name = base_glyph.glyphname
        base_bbox = base_glyph.boundingBox()
        if not base_bbox:
            continue

        bx_min, by_min, bx_max, by_max = base_bbox
        base_width = bx_max - bx_min

        # Get sharp glyph bbox for positioning
        sharp_bbox = sharp_glyph.boundingBox()
        if not sharp_bbox:
            continue

        sx_min, sy_min, sx_max, sy_max = sharp_bbox
        sharp_width = sx_max - sx_min
        sharp_height = sy_max - sy_min

        # For each accidental type (skip natural, we already have base char)
        accidental_codes = ["s", "b", "ss", "bb"]

        for acc_idx, acc_code in enumerate(accidental_codes):
            codepoint = sharp_pua_start + i * 4 + acc_idx
            glyph_name = f"{base_char}{acc_code}"

            # Create new glyph with references
            g = font.createChar(codepoint, glyph_name)
            g.clear()

            # Add base character reference
            g.addReference(base_glyph_name, (1, 0, 0, 1, 0, 0))

            # Position accidental to the right of the base character
            spacing = base_width * 0.1  # 10% of base char width
            sharp_x = bx_max - sx_min + spacing

            # Vertical alignment: center sharp with base
            sharp_y = (by_min + by_max) / 2 - (sy_min + sy_max) / 2

            # Add accidental symbols as references
            if acc_code == "s":  # Single sharp
                g.addReference(sharp_glyph_name, (1, 0, 0, 1, sharp_x, sharp_y))
            elif acc_code == "b":  # Single flat
                flat_glyph = font[ord('b')]
                if flat_glyph:
                    g.addReference(flat_glyph.glyphname, (1, 0, 0, 1, sharp_x, sharp_y))
            elif acc_code == "ss":  # Double sharp (two sharps)
                sharp_spacing = sharp_width + 1
                g.addReference(sharp_glyph_name, (1, 0, 0, 1, sharp_x, sharp_y))
                g.addReference(sharp_glyph_name, (1, 0, 0, 1, sharp_x + sharp_spacing, sharp_y))
            elif acc_code == "bb":  # Double flat (two flats)
                flat_glyph = font[ord('b')]
                if flat_glyph:
                    flat_width = flat_glyph.boundingBox()[2] - flat_glyph.boundingBox()[0] if flat_glyph.boundingBox() else sharp_width
                    flat_spacing = flat_width + 1
                    g.addReference(flat_glyph.glyphname, (1, 0, 0, 1, sharp_x, sharp_y))
                    g.addReference(flat_glyph.glyphname, (1, 0, 0, 1, sharp_x + flat_spacing, sharp_y))

            # Set width to accommodate base + accidental
            g.width = base_glyph.width + int(sharp_width * 1.5)

            g.round()

            created_sharps += 1

        # Update mapping with accidental glyphs
        if base_char in glyph_mapping:
            glyph_mapping[base_char]["accidentals"] = {
                "sharp": hex(sharp_pua_start + i * 4 + 0),
                "flat": hex(sharp_pua_start + i * 4 + 1),
                "dsharp": hex(sharp_pua_start + i * 4 + 2),
                "dflat": hex(sharp_pua_start + i * 4 + 3),
            }

        if (i + 1) % 10 == 0:
            print(f"  Generated {created_sharps} accidental glyphs for {i + 1}/{len(ALL_CHARS)} base chars...")

    print(f"  Total accidental glyphs created: {created_sharps}")

    # Save font
    print(f"Saving extended font to: {output_font_path}")
    try:
        font.generate(output_font_path)
        print("✓ Extended font generated successfully!")
        print(f"  Total glyphs: {created_dotted + created_sharps}")
        return True, glyph_mapping
    except Exception as e:
        print(f"ERROR: Failed to generate font: {e}")
        return False, {}


def save_mapping(glyph_mapping, output_path):
    """Save glyph mapping to JSON for JavaScript consumption"""

    mapping_data = {
        "base_chars": ALL_CHARS,
        "pua_start": 0xE000,
        "variants": [
            "1 dot above",
            "2 dots above",
            "1 dot below",
            "2 dots below"
        ],
        "systems": {
            "number": BASE_CHARS["number"],
            "western": BASE_CHARS["western"],
            "sargam": BASE_CHARS["sargam"],
            "doremi": BASE_CHARS["doremi"]
        },
        "glyphs": glyph_mapping
    }

    try:
        with open(output_path, 'w') as f:
            json.dump(mapping_data, f, indent=2)
        print(f"✓ Mapping saved to: {output_path}")
        return True
    except Exception as e:
        print(f"ERROR: Failed to save mapping: {e}")
        return False


def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    static_fonts_dir = os.path.join(script_dir, "static", "fonts")
    input_font = os.path.join(static_fonts_dir, "Inter.ttc")
    output_font = os.path.join(static_fonts_dir, "NotationMonoDotted.ttf")
    mapping_file = os.path.join(script_dir, "notation_font_mapping_extended.json")

    print("=" * 70)
    print("NOTATION FONT GENERATOR - EXTENDED (With Sharp Glyphs)")
    print("=" * 70)
    print(f"\nInput font:  {input_font}")
    print(f"Output font: {output_font}")
    print(f"Mapping:     {mapping_file}")

    if not os.path.exists(input_font):
        print(f"ERROR: Input font not found: {input_font}")
        sys.exit(1)

    os.makedirs(static_fonts_dir, exist_ok=True)

    success, glyph_mapping = generate_extended_font_with_sharps(input_font, output_font)
    if not success:
        sys.exit(1)

    # Save mapping
    if glyph_mapping:
        save_mapping(glyph_mapping, mapping_file)

    print("\n" + "=" * 70)
    print("SUCCESS!")
    print("=" * 70)
    print(f"\nFont now includes:")
    print(f"  • {len(ALL_CHARS)} base characters")
    print(f"  • 4 dotted variants per character (octave markers)")
    print(f"  • 4 accidental variants per character (s/b/ss/bb)")
    print(f"  • Total: ~{len(ALL_CHARS) * 9} glyphs in Private Use Area")
    print(f"\nJavaScript integration:")
    print(f"  • Use notation_font_mapping_extended.json for lookups")
    print(f"  • getGlyph(char, octaveShift) for dotted variants")
    print(f"  • getGlyph(char, accidental) for sharp/flat glyphs")


if __name__ == "__main__":
    main()
