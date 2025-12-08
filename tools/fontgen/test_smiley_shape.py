#!/usr/bin/env python3
"""
Test that arc glyphs form a SMILEY shape (bracket curving down from underline).

     1̲2̲3̲      <- text with underline
    ╰───╯     <- arcs curve DOWN and OUTWARD

- Left arc (U+E704): bottom at NEGATIVE x (curves down-left)
- Right arc (U+E705): bottom at POSITIVE x (curves down-right)
"""

import fontforge

FONT_PATH = "/home/john/editor/dist/fonts/NotationFont.ttf"

def test_smiley_shape():
    """
    For smiley/bracket shape:
    - Left arc bottom point should be at x <= 0 (curves down-left or straight down)
    - Right arc bottom point should be at x >= 0 (curves down-right or straight down)
    """
    font = fontforge.open(FONT_PATH)

    errors = []

    # Check left arc
    left_arc = font[0xE704]
    left_min_y = float('inf')
    left_x_at_min_y = 0

    for contour in left_arc.foreground:
        for point in contour:
            if point.y < left_min_y:
                left_min_y = point.y
                left_x_at_min_y = point.x

    print(f"Left arc: bottom point at ({left_x_at_min_y:.0f}, {left_min_y:.0f})")

    if left_x_at_min_y > 0:
        errors.append(f"Left arc bottom at x={left_x_at_min_y:.0f}, should be <= 0")

    # Check right arc
    right_arc = font[0xE705]
    right_min_y = float('inf')
    right_x_at_min_y = 0

    for contour in right_arc.foreground:
        for point in contour:
            if point.y < right_min_y:
                right_min_y = point.y
                right_x_at_min_y = point.x

    print(f"Right arc: bottom point at ({right_x_at_min_y:.0f}, {right_min_y:.0f})")

    if right_x_at_min_y < 0:
        errors.append(f"Right arc bottom at x={right_x_at_min_y:.0f}, should be >= 0")

    font.close()

    if errors:
        print("\nFAIL: Arcs do not form smiley shape")
        for e in errors:
            print(f"  - {e}")
        return False
    else:
        print("\nPASS: Arcs form smiley shape")
        return True


if __name__ == "__main__":
    success = test_smiley_shape()
    exit(0 if success else 1)
