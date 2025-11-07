# Ornament Layout System - Quick Reference

## In One Picture

```
EDIT MODE (Inline)           →           DISPLAY MODE (Floating)
[C][@start][a][b][@end][D]   →          [C{ornament}][D]
  ↑                                        ↑
All selectable,                    Ornament extracted,
Directly editable                  positioned above parent
```

## Key Files (in priority order)

1. **`src/html_layout/line.rs`** - Core layout logic
   - `position_ornaments_from_cells()` - Line 761: Main positioning
   - `compute_ornament_arcs_from_cells()` - Line 305: Arc calculation
   - `extract_ornaments_from_indicators()` - Line 832: Extraction

2. **`src/models/elements.rs`** - Data structures
   - `OrnamentIndicator` enum - Line 624: 6 position variants
   - `OrnamentPositionType` - Line 831: Before/After/OnTop

3. **`src/models/core.rs`** - Cell definition
   - `Cell.ornament_indicator` - Line 47: Inline marker
   - `Cell.ornament` - Line 51: Attached ornament

4. **`src/js/renderer.js`** - JavaScript rendering
   - Lines 946-966: Ornament span rendering

5. **`src/html_layout/display_list.rs`** - Output structures
   - `RenderOrnament` - Line 197: Positioned overlay
   - `RenderArc` - Line 72: Connecting curve

## Key Concepts

### Three Rendering Concepts

1. **Ornament Indicator** - Cell property marking ornament boundaries
   - Example: `@start` and `@end` delimiter cells
   - Used in EDIT mode to show where ornaments are
   - Removed in DISPLAY mode (extracted into Ornament struct)

2. **Ornament Object** - Extracted group of cells
   - Contains: vector of cells between indicators
   - Attached to: the anchor cell
   - Used in DISPLAY mode for positioning

3. **RenderOrnament** - Final positioned character
   - Contains: single character, x, y, classes
   - Rendered as: floating span with absolute positioning
   - Visible to: JavaScript renderer

### Two Edit Modes

**Edit Mode ON:**
- Ornament cells inline with main content
- Cells have `ornament_indicator` set
- All cells selectable/editable
- No extraction, no floating layout

**Edit Mode OFF:**
- Ornament cells extracted into `Ornament` objects
- Attached to anchor cell
- Removed from main cell array
- Positioned as floating overlay

## Critical Positioning Formula

```
Ornament Y = (line_y_offset + cell_y_offset + cell_height * 0.75) - (font_size * 0.8)
                            ↑                                          ↑
                    Baseline at 75% of cell height           Offset above baseline

With defaults (font_size=32, cell_height=24, cell_y_offset=5):
Y = (line_y + 5 + 18) - 25.6 = (line_y + 23) - 25.6 = line_y - 2.6

So ornaments appear about 2.6px above the baseline, scaled up!
```

## Horizontal Positioning

```
ornament_x = parent_cell.x + parent_cell.w + (index * 7.2)
                                              └─ 12.0 * 0.6 (60% scale)
```

## Arc Control Point Algorithm

```
If ornament spans from x=35 to x=50 (span=15px):

arch_height = (span * 0.15).clamp(3.0, 8.0)
            = (15 * 0.15).clamp(3.0, 8.0)
            = 2.25.clamp(3.0, 8.0)
            = 3.0px

Control points at 33% and 67% of span:
cp1 = (35 + 15*0.33, baseline_y - 3.0) = (40.0, -3.0)
cp2 = (35 + 15*0.67, baseline_y - 3.0) = (45.0, -3.0)
```

## The Six OrnamentIndicator Variants

| Variant | Mode | Position | Use Case |
|---------|------|----------|----------|
| `None` | N/A | N/A | No ornament |
| `OrnamentBeforeStart` | EDIT | Before | Grace note before parent |
| `OrnamentBeforeEnd` | EDIT | Before | End of before-grace sequence |
| `OrnamentAfterStart` | EDIT | After | Grace note after parent |
| `OrnamentAfterEnd` | EDIT | After | End of after-grace sequence |
| `OrnamentOnTopStart` | EDIT | OnTop | Trill/mordent on parent |
| `OrnamentOnTopEnd` | EDIT | OnTop | End of on-top sequence |

## What OrnamentPlacement Does (Losing Information)

```
In Ornament struct after extraction:

OrnamentAfterStart/End    →  placement = After
OrnamentOnTopStart/End    →  placement = After   ← BUG: Information lost!
OrnamentBeforeStart/End   →  placement = Before

Loss: "OnTop" becomes indistinguishable from "After"
Effect: Cannot distinguish trill from grace note in display mode
```

## Anchor Finding Priority (Mode ON only)

```
1. Search LEFT for PITCHED element
2. Search RIGHT for PITCHED element
3. Search LEFT for any LINE element (pitched or unpitched)
4. No anchor = ornament is orphaned (not rendered)
```

## Current Spacing Behavior

```
Horizontal: Sequential, no gap (7.2px per char)
Vertical:   Fixed position above parent
            Multiple ornaments on same anchor?
            → Not handled, would overlap!
```

## The Extraction Process (Mode OFF)

```
Input:  [C][@@start][a][b][@@end][D]
        0    1       2   3   4    5

Scan:   for each cell in order
        if cell.ornament_indicator.is_start() {
          find matching .is_end()
          extract cells[start..=end]
          attach to cell[start-1] as ornament
          skip to end+1
        }

Output: [C{ornament:cells=[@@start,a,b,@@end]}][D]
        0                                       1
```

## Display List Structure

```
RenderLine {
  cells: Vec<RenderCell>,           ← Main grid
  ornaments: Vec<RenderOrnament>,   ← Floating overlays
  ornament_arcs: Vec<RenderArc>,    ← Connecting curves
  slurs: Vec<RenderArc>,            ← Slur curves
  beat_loops: Vec<RenderArc>,       ← Beat grouping curves
  lyrics: Vec<RenderLyric>,
  tala: Vec<RenderTala>,
  octave_dots: Vec<RenderOctaveDot>,
}
```

## Constants (All Defined in Rust)

| Name | Value | Context |
|------|-------|---------|
| Ornament scale | 0.6 | Applied to default 12.0px cell width |
| Baseline offset | 0.75 | Position in cell (75% down) |
| Vertical offset | 0.8 | Above baseline (font-size multiplier) |
| Arc height factor | 0.15 | Proportional to span |
| Arc height min | 3.0px | Clamp lower bound |
| Arc height max | 8.0px | Clamp upper bound |
| Arc color | #1e40af | Dark blue |
| JS font-size scale | 0.6 | 19.2px for 32px base |
| JS color | #1e40af | Dark blue |

## Tests to Understand the System

1. **`ornament-basic.spec.js`** - Simple ornament creation
2. **`ornament-edit-mode.spec.js`** - Mode switching behavior
3. **`ornament-layout-collision.spec.js`** - Positioning validation
4. **`ornament-export.spec.js`** - MusicXML export

## Missing Pieces (Not Implemented)

1. ❌ Collision detection between adjacent ornaments
2. ❌ Dynamic vertical stacking if overlap detected
3. ❌ Gap spacing between multiple ornaments
4. ❌ Preservation of "OnTop" position type post-extraction
5. ❌ Line height adjustment for ornament depth
6. ❌ Kerning/proportional spacing between ornament chars

## Debugging Tips

**"Where is my ornament?"**
1. Check `cell.ornament_indicator` - should be Start/End in EDIT mode
2. Check edit mode: `getOrnamentEditMode()` in WASM
3. Verify anchor finding: ornament needs a pitched note within range

**"Why is it in the wrong place?"**
1. Check `position_ornaments_from_cells()` - Y calculation
2. Check `parent_cell.x + parent_cell.w` - should be right edge
3. Verify `font_size * 0.8` calculation - Y offset

**"Why is it overlapping?"**
1. No collision detection → overlaps are expected
2. Check if line height is sufficient for all elements
3. Try increasing vertical offset factor (0.8 → 1.0)

