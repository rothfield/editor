#!/usr/bin/env python3
"""Inspect NotationMono font to see what glyphs are actually in it."""

import fontforge
import sys

def inspect_font(font_path):
    print(f"Opening font: {font_path}")
    font = fontforge.open(font_path)

    print(f"\nFont: {font.fullname}")
    print(f"Total glyphs: {len(font)}")

    # Check base characters
    print("\n=== Base Characters (ASCII) ===")
    base_chars = "1234567CDEFGABcdefgabSrRgGmMPdDnNdrmfsltDRMFSLT#.|"
    for char in base_chars:
        cp = ord(char)
        try:
            glyph = font[cp]
            if glyph:
                print(f"  U+{cp:04X} ('{char}'): {glyph.glyphname} - EXISTS")
            else:
                print(f"  U+{cp:04X} ('{char}'): MISSING")
        except:
            print(f"  U+{cp:04X} ('{char}'): ERROR")

    # Check PUA octave variants (E000-E0BB)
    print("\n=== PUA Octave Variants (U+E000-U+E0BB) ===")
    octave_start = 0xE000
    octave_end = 0xE0BB
    octave_count = 0

    for cp in range(octave_start, octave_end + 1):
        try:
            glyph = font[cp]
            if glyph:
                octave_count += 1
        except:
            pass

    print(f"Found {octave_count} octave variant glyphs")

    # Check first few octave variants in detail
    print("\nFirst 10 octave variants:")
    for i in range(10):
        cp = octave_start + i
        try:
            glyph = font[cp]
            if glyph:
                print(f"  U+{cp:04X}: {glyph.glyphname} - references: {[r[0] for r in glyph.references]}")
            else:
                print(f"  U+{cp:04X}: EMPTY")
        except Exception as e:
            print(f"  U+{cp:04X}: ERROR - {e}")

    # Check PUA sharp accidentals (E1F0-E21E)
    print("\n=== PUA Sharp Accidentals (U+E1F0-U+E21E) ===")
    sharp_start = 0xE1F0
    sharp_end = 0xE21E
    sharp_count = 0

    for cp in range(sharp_start, sharp_end + 1):
        try:
            glyph = font[cp]
            if glyph:
                sharp_count += 1
        except:
            pass

    print(f"Found {sharp_count} sharp accidental glyphs")

    # Check first few sharp accidentals in detail
    print("\nFirst 5 sharp accidentals:")
    for i in range(5):
        cp = sharp_start + i
        try:
            glyph = font[cp]
            if glyph:
                print(f"  U+{cp:04X}: {glyph.glyphname} - references: {[r[0] for r in glyph.references]}")
            else:
                print(f"  U+{cp:04X}: EMPTY")
        except Exception as e:
            print(f"  U+{cp:04X}: ERROR - {e}")

    # Check dot glyph
    print("\n=== Dot Glyph (U+002E '.') ===")
    try:
        dot_glyph = font[ord('.')]
        if dot_glyph:
            print(f"Dot glyph: {dot_glyph.glyphname}")
            bbox = dot_glyph.boundingBox()
            print(f"  Bounding box: {bbox}")
            print(f"  Width: {dot_glyph.width}")
            if dot_glyph.isComposite():
                print(f"  Is composite: Yes")
                print(f"  References: {[r[0] for r in dot_glyph.references]}")
            else:
                print(f"  Is composite: No")
        else:
            print("Dot glyph: NOT FOUND")
    except Exception as e:
        print(f"Dot glyph: ERROR - {e}")

    print("\n=== Summary ===")
    print(f"Octave variants: {octave_count}/188 (expected)")
    print(f"Sharp accidentals: {sharp_count}/47 (expected)")

if __name__ == "__main__":
    font_path = "/home/john/editor/static/fonts/NotationMono.ttf"
    inspect_font(font_path)
