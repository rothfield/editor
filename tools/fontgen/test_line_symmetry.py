#!/usr/bin/env python3
"""
Test that underline and overline have the SAME visual extent.

Both should:
- Span exactly the character advance width (0 to width)
- Have arcs positioned identically (just mirrored vertically)
"""

import fontforge

FONT_PATH = "/home/john/editor/dist/fonts/NotationFont.ttf"

def test_line_symmetry():
    font = fontforge.open(FONT_PATH)
    errors = []

    # Check that bottom and top arcs have same X extent
    bottom_left = font[0xE704]
    top_left = font[0xE706]
    
    bl_bbox = bottom_left.boundingBox()
    tl_bbox = top_left.boundingBox()
    
    print(f"Bottom-left arc X: {bl_bbox[0]:.0f} to {bl_bbox[2]:.0f}")
    print(f"Top-left arc X: {tl_bbox[0]:.0f} to {tl_bbox[2]:.0f}")
    
    if bl_bbox[0] != tl_bbox[0] or bl_bbox[2] != tl_bbox[2]:
        errors.append(f"Left arcs have different X extent: bottom=({bl_bbox[0]:.0f},{bl_bbox[2]:.0f}) top=({tl_bbox[0]:.0f},{tl_bbox[2]:.0f})")

    # Check underlined vs overlined variant for '1' (or any char)
    # Find them by checking glyphs with width 572 (the '1' width)
    underlined_1 = None
    overlined_1 = None
    
    for i in range(200):
        try:
            u = font[0xE800 + i]
            o = font[0xEC00 + i]
            if u.width == 572:  # '1' has width 572
                underlined_1 = u
                overlined_1 = o
                break
        except:
            pass
    
    if underlined_1 and overlined_1:
        u_bbox = underlined_1.boundingBox()
        o_bbox = overlined_1.boundingBox()
        
        print(f"\nUnderlined '1' X extent: {u_bbox[0]:.0f} to {u_bbox[2]:.0f}")
        print(f"Overlined '1' X extent: {o_bbox[0]:.0f} to {o_bbox[2]:.0f}")
        
        if u_bbox[0] != o_bbox[0] or u_bbox[2] != o_bbox[2]:
            errors.append(f"Lined variants have different X extent: underline=({u_bbox[0]:.0f},{u_bbox[2]:.0f}) overline=({o_bbox[0]:.0f},{o_bbox[2]:.0f})")
    
    font.close()
    
    if errors:
        print("\nFAIL: Underline and overline are NOT symmetric")
        for e in errors:
            print(f"  - {e}")
        return False
    else:
        print("\nPASS: Underline and overline are symmetric")
        return True


if __name__ == "__main__":
    success = test_line_symmetry()
    exit(0 if success else 1)
