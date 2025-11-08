#!/usr/bin/env python3
"""
Notation Font Generator - Complete Edition
Generates NotationMono font with:
  - Base pitch characters (all systems)
  - Dotted variants (above/below, single/double)
  - Sharp accidentals (1#, 2#, etc.)
  - Barlines and staff notation symbols
"""

import sys
import os
import fontforge
import yaml

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

BARLINE_CHARS = "|"  # Single barline
ACCIDENTAL_CHARS = "#"  # Sharp symbol (base character)

def load_atoms_config(atoms_path):
    """Load bravura_symbols configuration from atoms.yaml"""
    try:
        with open(atoms_path, 'r') as f:
            config = yaml.safe_load(f)
        return config.get('bravura_symbols', [])
    except Exception as e:
        print(f"WARNING: Could not load atoms.yaml: {e}")
        return []

def create_comprehensive_font(input_font_path, output_font_path, bravura_font_path=None, atoms_config=None):
    """
    Create a complete notation font with dots, sharps, barlines, and Bravura symbols.
    """

    print(f"\nLoading font: {input_font_path}")
    font = fontforge.open(input_font_path)

    # Load Bravura if available for special symbols
    bravura = None
    if bravura_font_path and os.path.exists(bravura_font_path):
        try:
            print(f"Loading Bravura font: {bravura_font_path}")
            bravura = fontforge.open(bravura_font_path)
        except Exception as e:
            print(f"  WARNING: Could not load Bravura: {e}")

    # Set font metadata
    font.fontname = "NotationMono"
    font.fullname = "Notation Mono"
    font.familyname = "Notation"

    print(f"\nFont loaded successfully")

    # Verify base characters
    print(f"\nVerifying {len(ALL_CHARS)} base pitch characters...")
    missing = []
    for char in ALL_CHARS:
        glyph = font[ord(char)]
        if not glyph:
            missing.append(char)

    if missing:
        print(f"  WARNING: Missing characters: {missing}")
    else:
        print(f"  ✓ All {len(ALL_CHARS)} pitch characters found")

    # Get dot glyph for variants
    print(f"\nPreparing dotted variants...")
    dot_glyph = font[ord('.')]
    if not dot_glyph:
        print("  ERROR: No dot glyph (.) found in font")
        return False

    dot_bbox = dot_glyph.boundingBox()
    if not dot_bbox:
        print("  ERROR: Could not get bounding box for dot glyph")
        return False

    dx_min, dy_min, dx_max, dy_max = dot_bbox
    dot_width = dx_max - dx_min
    dot_height = dy_max - dy_min
    dot_name = dot_glyph.glyphname

    print(f"  Dot glyph: '{dot_name}'")
    print(f"  Dot bbox: ({dx_min}, {dy_min}, {dx_max}, {dy_max})")
    print(f"  Dot size: {dot_width}x{dot_height}")

    # Create dotted variants
    print(f"\nGenerating {len(ALL_CHARS)} base chars × 4 variants = {len(ALL_CHARS) * 4} dotted glyphs...")
    pua_start = 0xE000
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
        dot_spacing = dot_height + 100
        bbox_offset = 50

        # Generate 4 variants: 1 dot above, 2 dots above, 1 dot below, 2 dots below
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

    # After creating all composite glyphs, need to decompose references so they're embedded
    print(f"\nEmbedding references (decomposing composite glyphs)...")
    for cp in range(pua_start, pua_start + len(ALL_CHARS) * 4):
        try:
            g = font[cp]
            if g and g.isComposite():
                # Decompose converts references to actual outlines
                g.decompose()
        except:
            pass
    print(f"  ✓ References embedded")

    print(f"  ✓ Total dotted glyphs created: {created}")

    # Create sharp accidentals (1#, 2#, etc.)
    print(f"\nGenerating sharp accidentals...")
    sharp_glyph = font[ord('#')]
    if not sharp_glyph:
        print("  ERROR: Could not find '#' (sharp) glyph in font")
        return False

    accidentals_created = 0
    sharp_base_cp = 0xE1F0  # Start sharp accidentals after dotted variants

    for base_char in ALL_CHARS:
        base_glyph = font[ord(base_char)]
        if not base_glyph:
            continue

        # Create composite glyph: base_char + sharp
        accidental_cp = sharp_base_cp + accidentals_created
        accidental_name = f"{base_char}_sharp"

        composite = font.createChar(accidental_cp, accidental_name)
        composite.clear()

        # Add base character
        composite.addReference(base_glyph.glyphname, (1, 0, 0, 1, 0, 0))

        # Get sharp bbox to position it
        sharp_bbox = sharp_glyph.boundingBox()
        if sharp_bbox:
            sx_min, sy_min, sx_max, sy_max = sharp_bbox
            sharp_width = sx_max - sx_min

            # Get base bbox to position sharp to the right
            base_bbox = base_glyph.boundingBox()
            if base_bbox:
                bx_min, by_min, bx_max, by_max = base_bbox
                base_width = bx_max - bx_min

                # Position sharp to the right of base character
                sharp_x_offset = base_width + 50 - sx_min

                # Add sharp symbol
                composite.addReference(sharp_glyph.glyphname, (1, 0, 0, 1, sharp_x_offset, 0))
                composite.width = base_glyph.width + 200  # Extra space for sharp

                accidentals_created += 1

    print(f"  ✓ Sharp accidentals created: {accidentals_created}")

    # Decompose sharp accidental references so they're embedded
    print(f"\nEmbedding sharp accidental references...")
    for cp in range(sharp_base_cp, sharp_base_cp + accidentals_created):
        try:
            g = font[cp]
            if g and g.isComposite():
                g.decompose()
        except:
            pass
    print(f"  ✓ Sharp references embedded")

    # Extract symbols from Bravura (accidentals, barlines, ornaments)
    symbols_created = 0
    if bravura and atoms_config:
        print(f"\nExtracting Bravura symbols from atoms.yaml...")

        for symbol_def in atoms_config:
            glyph_name = symbol_def.get('glyph_name')
            label = symbol_def.get('label')
            smufl_codepoint = symbol_def.get('smufl_codepoint')
            codepoint_offset = symbol_def.get('codepoint_offset', 0)

            # Symbol codepoint: start after sharp accidentals at 0xE220
            symbol_cp = 0xE220 + codepoint_offset

            try:
                # Try to find glyph in Bravura by name or codepoint
                bravura_glyph = None

                # First try by glyph name (preferred)
                try:
                    bravura_glyph = bravura[glyph_name]
                except:
                    pass

                # If not found by name, try by smufl_codepoint
                if not bravura_glyph and smufl_codepoint:
                    try:
                        bravura_glyph = bravura[smufl_codepoint]
                    except:
                        pass

                if bravura_glyph:
                    # Create new glyph in our font
                    symbol_glyph = font.createChar(symbol_cp, f"symbol_{glyph_name}")
                    symbol_glyph.clear()

                    # Copy glyph from Bravura using pen API
                    pen = symbol_glyph.glyphPen()
                    if pen:
                        bravura_glyph.draw(pen)
                        pen = None

                    # Set width from source glyph
                    bbox = bravura_glyph.boundingBox()
                    if bbox:
                        symbol_glyph.width = int(bbox[2] - bbox[0]) + 100
                    else:
                        symbol_glyph.width = 600

                    # Correct direction
                    symbol_glyph.correctDirection()

                    print(f"  ✓ {label} (U+{symbol_cp:04X})")
                    symbols_created += 1
                else:
                    print(f"  ✗ {label}: glyph '{glyph_name}' not found in Bravura")

            except Exception as e:
                print(f"  ERROR extracting {label}: {e}")

        if symbols_created > 0:
            print(f"\n  ✓ Total Bravura symbols extracted: {symbols_created}")
    else:
        if not atoms_config:
            print(f"\nSkipping Bravura symbols (no atoms.yaml config)")
        else:
            print(f"\nSkipping Bravura symbols (Bravura not available)")

    # Correct direction and prepare glyphs for output
    print(f"\nPreparing {created + accidentals_created + symbols_created} custom glyphs...")
    for cp in range(pua_start, pua_start + created):
        g = font[cp]
        if g:
            g.correctDirection()

    for cp in range(sharp_base_cp, sharp_base_cp + accidentals_created):
        g = font[cp]
        if g:
            g.correctDirection()

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
    repo_root = os.path.dirname(os.path.dirname(script_dir))  # scripts/fonts -> editor
    static_fonts_dir = os.path.join(repo_root, "static", "fonts")
    input_font = os.path.join(static_fonts_dir, "Inter.ttc")
    output_font = os.path.join(static_fonts_dir, "NotationMono.ttf")
    bravura_font = os.path.join(static_fonts_dir, "Bravura.otf")
    atoms_yaml = os.path.join(repo_root, "tools", "fontgen", "atoms.yaml")

    print("=" * 70)
    print("NOTATION FONT GENERATOR - Complete Edition")
    print("Features: Dots, Sharps, Barlines (with Bravura symbols)")
    print("=" * 70)
    print(f"\nInput font:  {input_font}")
    print(f"Output font: {output_font}")
    if os.path.exists(bravura_font):
        print(f"Bravura font: {bravura_font}")
    if os.path.exists(atoms_yaml):
        print(f"Atoms config: {atoms_yaml}")

    if not os.path.exists(input_font):
        print(f"ERROR: Input font not found: {input_font}")
        sys.exit(1)

    os.makedirs(static_fonts_dir, exist_ok=True)

    # Load atoms config for symbol extraction
    atoms_config = load_atoms_config(atoms_yaml) if os.path.exists(atoms_yaml) else None

    # Only pass bravura if it exists
    bravura_path = bravura_font if os.path.exists(bravura_font) else None
    success = create_comprehensive_font(input_font, output_font, bravura_path, atoms_config)
    if not success:
        sys.exit(1)

    print("\n" + "=" * 70)
    print("SUCCESS - Font ready for use!")
    print("=" * 70)


if __name__ == "__main__":
    main()
