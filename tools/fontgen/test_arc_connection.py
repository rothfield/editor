#!/usr/bin/env python3
"""
Test that arc glyphs connect smoothly to underlines without gaps or notches.

FAILING TEST: The arc connection points should align with the underline edges.
Currently there are visible notches at the connection points.
"""

import fontforge
import math

FONT_PATH = "/home/john/editor/dist/fonts/NotationFont.ttf"

# Expected values from generate.py
UNDERLINE_Y_BOTTOM = -180
UNDERLINE_Y_TOP = -108
LINE_THICKNESS = 72  # UNDERLINE_Y_TOP - UNDERLINE_Y_BOTTOM

def test_arc_connection_alignment():
    """
    The arc should connect to the underline with a vertical edge matching underline thickness.

    The vertical edge at x=0 should span from UNDERLINE_Y_TOP (-108) to UNDERLINE_Y_BOTTOM (-180).
    """
    font = fontforge.open(FONT_PATH)

    errors = []

    # Check that both arcs have the required Y values at x=0
    for name, codepoint in [("Left arc", 0xE704), ("Right arc", 0xE705)]:
        glyph = font[codepoint]

        has_top = False
        has_bottom = False

        for contour in glyph.foreground:
            for point in contour:
                if abs(point.x) < 1:  # At x=0
                    if abs(point.y - UNDERLINE_Y_TOP) < 5:
                        has_top = True
                    if abs(point.y - UNDERLINE_Y_BOTTOM) < 5:
                        has_bottom = True

        if not has_top:
            errors.append(f"{name} missing point at (0, {UNDERLINE_Y_TOP}) for underline top")
        if not has_bottom:
            errors.append(f"{name} missing point at (0, {UNDERLINE_Y_BOTTOM}) for underline bottom")

    font.close()

    if errors:
        print("FAIL: Arc connection alignment test failed")
        for e in errors:
            print(f"  - {e}")
        return False
    else:
        print("PASS: Arc connections align with underline edges")
        return True


def test_no_horizontal_cap_at_connection():
    """
    The arc should NOT have a horizontal stroke cap at the connection point.

    A horizontal cap creates a visible notch when the arc meets the underline.
    Instead, the arc should have a vertical edge at the connection that matches
    the underline's vertical extent.
    """
    font = fontforge.open(FONT_PATH)

    errors = []

    # Check left arc - at x=0, there should be points at BOTH y=-108 and y=-180
    left_arc = font[0xE704]

    has_top_at_connection = False
    has_bottom_at_connection = False

    for contour in left_arc.foreground:
        for point in contour:
            if -5 <= point.x <= 25:  # Near connection with overlap
                if abs(point.y - UNDERLINE_Y_TOP) < 10:
                    has_top_at_connection = True
                if abs(point.y - UNDERLINE_Y_BOTTOM) < 10:
                    has_bottom_at_connection = True

    if not has_top_at_connection:
        errors.append(f"Left arc missing top edge point (y≈{UNDERLINE_Y_TOP}) at connection")
    if not has_bottom_at_connection:
        errors.append(f"Left arc missing bottom edge point (y≈{UNDERLINE_Y_BOTTOM}) at connection")

    # Check right arc
    right_arc = font[0xE705]

    has_top_at_connection = False
    has_bottom_at_connection = False

    for contour in right_arc.foreground:
        for point in contour:
            if -25 <= point.x <= 5:  # Near connection with overlap
                if abs(point.y - UNDERLINE_Y_TOP) < 10:
                    has_top_at_connection = True
                if abs(point.y - UNDERLINE_Y_BOTTOM) < 10:
                    has_bottom_at_connection = True

    if not has_top_at_connection:
        errors.append(f"Right arc missing top edge point (y≈{UNDERLINE_Y_TOP}) at connection")
    if not has_bottom_at_connection:
        errors.append(f"Right arc missing bottom edge point (y≈{UNDERLINE_Y_BOTTOM}) at connection")

    font.close()

    if errors:
        print("FAIL: Arc has horizontal cap instead of vertical edge at connection")
        for e in errors:
            print(f"  - {e}")
        return False
    else:
        print("PASS: Arc has vertical edge at connection (no horizontal cap)")
        return True


if __name__ == "__main__":
    print("Testing arc-underline connection smoothness...\n")

    test1 = test_arc_connection_alignment()
    print()
    test2 = test_no_horizontal_cap_at_connection()

    print("\n" + "="*60)
    if test1 and test2:
        print("ALL TESTS PASSED")
        exit(0)
    else:
        print("TESTS FAILED - Arc connections need fixing")
        exit(1)
