#!/usr/bin/env python3
"""
Generate visual test images to verify underline/overline symmetry.

Creates PNG images showing:
1. Pre-composed underlined vs overlined characters
2. Combining marks alone (fallback rendering)
3. Full loops with arcs

Note: PIL/Pillow does NOT support OpenType GSUB ligatures, so this shows
the RAW glyph rendering, not the ligature-substituted result.
"""

from PIL import Image, ImageDraw, ImageFont
import os

FONT_PATH = "/home/john/editor/dist/fonts/NotationFont.ttf"
OUTPUT_DIR = "/home/john/editor/tools/fontgen"

def create_comparison_image():
    """Create side-by-side comparison of underline vs overline."""

    # Load font at large size for visibility
    try:
        font = ImageFont.truetype(FONT_PATH, 72)
        font_small = ImageFont.truetype(FONT_PATH, 24)
    except Exception as e:
        print(f"Error loading font: {e}")
        return

    # Create image
    img = Image.new('RGB', (800, 500), 'white')
    draw = ImageDraw.Draw(img)

    y = 20

    # Title
    draw.text((20, y), "Underline vs Overline Symmetry Test", fill='black', font=font_small)
    y += 40

    # Test 1: Pre-composed variants (PUA glyphs)
    draw.text((20, y), "Pre-composed (PUA):", fill='gray', font=font_small)
    y += 30

    # Underlined "123" using PUA codepoints (0xE800 + index)
    # Need to find the right indices for 1, 2, 3
    underlined_text = "\uE811\uE812\uE813"  # Approximate - may need adjustment
    draw.text((50, y), underlined_text, fill='black', font=font)
    draw.text((250, y + 20), "underlined (0xE800+)", fill='red', font=font_small)
    y += 100

    # Overlined "123" using PUA codepoints (0xEC00 + index)
    overlined_text = "\uEC11\uEC12\uEC13"  # Approximate - may need adjustment
    draw.text((50, y), overlined_text, fill='black', font=font)
    draw.text((250, y + 20), "overlined (0xEC00+)", fill='blue', font=font_small)
    y += 100

    # Test 2: Combining marks (raw, no ligatures in PIL)
    draw.text((20, y), "Combining marks (raw):", fill='gray', font=font_small)
    y += 30

    # Just combining underlines
    combining_underline = "\u0332\u0332\u0332"
    draw.text((50, y), combining_underline, fill='red', font=font)
    draw.text((250, y + 20), "U+0332 x3", fill='red', font=font_small)
    y += 80

    # Just combining overlines
    combining_overline = "\u0305\u0305\u0305"
    draw.text((50, y), combining_overline, fill='blue', font=font)
    draw.text((250, y + 20), "U+0305 x3", fill='blue', font=font_small)
    y += 80

    # Test 3: With base characters
    draw.text((20, y), "With base chars (123 + combining):", fill='gray', font=font_small)
    y += 30

    text_with_underline = "1\u03322\u03323\u0332"
    draw.text((50, y), text_with_underline, fill='black', font=font)
    draw.text((300, y + 20), "123 + U+0332", fill='red', font=font_small)

    text_with_overline = "1\u03052\u03053\u0305"
    draw.text((450, y), text_with_overline, fill='black', font=font)
    draw.text((600, y + 20), "123 + U+0305", fill='blue', font=font_small)

    # Save
    output_path = os.path.join(OUTPUT_DIR, "test_symmetry_comparison.png")
    img.save(output_path)
    print(f"Saved: {output_path}")

    return img


def create_loop_arc_image():
    """Create image showing loop arcs."""

    try:
        font = ImageFont.truetype(FONT_PATH, 96)
        font_small = ImageFont.truetype(FONT_PATH, 24)
    except Exception as e:
        print(f"Error loading font: {e}")
        return

    img = Image.new('RGB', (600, 400), 'white')
    draw = ImageDraw.Draw(img)

    y = 20
    draw.text((20, y), "Loop Arc Glyphs", fill='black', font=font_small)
    y += 50

    # Bottom arcs (U+E704, U+E705)
    draw.text((20, y), "Bottom arcs:", fill='gray', font=font_small)
    bottom_arcs = "\uE704  \uE705"
    draw.text((150, y - 20), bottom_arcs, fill='red', font=font)
    draw.text((350, y), "U+E704, U+E705", fill='red', font=font_small)
    y += 120

    # Top arcs (U+E706, U+E707)
    draw.text((20, y), "Top arcs:", fill='gray', font=font_small)
    top_arcs = "\uE706  \uE707"
    draw.text((150, y - 20), top_arcs, fill='blue', font=font)
    draw.text((350, y), "U+E706, U+E707", fill='blue', font=font_small)
    y += 120

    # Full loops
    draw.text((20, y), "Full loops:", fill='gray', font=font_small)
    y += 30

    # Bottom loop: arc + underlined chars + arc
    bottom_loop = "\uE704" + "1\u03322\u0332" + "\uE705"
    draw.text((50, y), bottom_loop, fill='black', font=font)
    draw.text((300, y + 30), "underline loop", fill='red', font=font_small)

    # Top loop: arc + overlined chars + arc
    top_loop = "\uE706" + "1\u03052\u0305" + "\uE707"
    draw.text((50, y + 100), top_loop, fill='black', font=font)
    draw.text((300, y + 130), "overline loop", fill='blue', font=font_small)

    output_path = os.path.join(OUTPUT_DIR, "test_loop_arcs.png")
    img.save(output_path)
    print(f"Saved: {output_path}")

    return img


def create_width_measurement_image():
    """Create image with measurement markers to verify equal widths."""

    try:
        font = ImageFont.truetype(FONT_PATH, 72)
        font_small = ImageFont.truetype(FONT_PATH, 18)
    except Exception as e:
        print(f"Error loading font: {e}")
        return

    img = Image.new('RGB', (500, 300), 'white')
    draw = ImageDraw.Draw(img)

    # Draw underlined and overlined text with measurement lines
    y = 50

    # Underlined
    text_u = "1\u03322\u03323\u0332"
    bbox_u = draw.textbbox((50, y), text_u, font=font)
    draw.text((50, y), text_u, fill='black', font=font)
    draw.rectangle([bbox_u[0]-2, bbox_u[1]-2, bbox_u[2]+2, bbox_u[3]+2], outline='red', width=2)
    width_u = bbox_u[2] - bbox_u[0]
    draw.text((bbox_u[2] + 10, y + 20), f"width: {width_u}px", fill='red', font=font_small)
    draw.text((300, y + 20), "underline", fill='red', font=font_small)

    y = 170

    # Overlined
    text_o = "1\u03052\u03053\u0305"
    bbox_o = draw.textbbox((50, y), text_o, font=font)
    draw.text((50, y), text_o, fill='black', font=font)
    draw.rectangle([bbox_o[0]-2, bbox_o[1]-2, bbox_o[2]+2, bbox_o[3]+2], outline='blue', width=2)
    width_o = bbox_o[2] - bbox_o[0]
    draw.text((bbox_o[2] + 10, y + 20), f"width: {width_o}px", fill='blue', font=font_small)
    draw.text((300, y + 20), "overline", fill='blue', font=font_small)

    # Summary
    draw.text((50, 260), f"Width difference: {abs(width_u - width_o)}px",
              fill='green' if width_u == width_o else 'red', font=font_small)

    output_path = os.path.join(OUTPUT_DIR, "test_width_measurement.png")
    img.save(output_path)
    print(f"Saved: {output_path}")
    print(f"  Underline width: {width_u}px")
    print(f"  Overline width: {width_o}px")
    print(f"  Difference: {abs(width_u - width_o)}px")

    return img


if __name__ == "__main__":
    print("Generating visual symmetry test images...")
    print(f"Using font: {FONT_PATH}")
    print()

    create_comparison_image()
    create_loop_arc_image()
    create_width_measurement_image()

    print()
    print("Done! Check the PNG files in tools/fontgen/")
