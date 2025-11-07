# Ornament Layout System - Architecture Overview

## 1. Key File Paths

### Rust/WASM Files

**Models & Data Structures:**
- `/home/john/editor/src/models/elements.rs` (lines 595-958)
  - `OrnamentIndicator` enum (6 variants: None, BeforeStart, BeforeEnd, AfterStart, AfterEnd, OnTopStart, OnTopEnd)
  - `OrnamentPositionType` enum (Before, After, OnTop)
  - `OrnamentPlacement` enum (Before, After)
  - `Ornament` struct (contains cells Vec and placement)

- `/home/john/editor/src/models/core.rs` (lines 1-200)
  - `Cell` struct with ornament-related fields:
    - `ornament_indicator: OrnamentIndicator` (line 47)
    - `ornament: Option<Ornament>` (lines 50-51)

**Layout & Rendering:**
- `/home/john/editor/src/html_layout/line.rs` (759+ lines)
  - `position_ornaments_from_cells()` - Main ornament positioning (lines 761-820)
  - `compute_ornament_arcs_from_cells()` - Arc rendering (lines 305-353)
  - `create_ornament_arc_positioned()` - Arc control point calculation (lines 357-392)
  - `extract_ornaments_from_indicators()` - Extract ornament cells (lines 832-899)
  - `find_ornament_anchors()` - Anchor cell detection (lines 523-590)

- `/home/john/editor/src/html_layout/cell.rs` (1-200+ lines)
  - `CellStyleBuilder::build_render_cell()` - Cell styling
  - Applies "ornament-cell" class (line 74)

- `/home/john/editor/src/html_layout/display_list.rs` (1-211 lines)
  - `RenderOrnament` struct (lines 197-211)
  - `RenderArc` struct (lines 72-107)

### JavaScript Files

- `/home/john/editor/src/js/renderer.js`
  - Ornament rendering (lines 946-966)
  - Ornamental cell rendering in edit mode (lines 755-943)
  - ArcRenderer integration (line 51)

### Test Files

- `/home/john/editor/tests/e2e-pw/tests/ornament-layout-collision.spec.js` - Layout testing
- Multiple other ornament test files for various scenarios

---

## 2. Current Implementation Pattern

### A. Cell Structure & Ornament Storage

Each `Cell` contains two ornament-related fields:

```rust
pub struct Cell {
    // Inline indicator showing cell is part of ornament span
    pub ornament_indicator: OrnamentIndicator,  // Start/End markers
    
    // Actual ornament attached to anchor cell (only when edit mode OFF)
    pub ornament: Option<Ornament>,             // Attached after extraction
}
```

**Six Indicator States:**
- `OrnamentBeforeStart` / `OrnamentBeforeEnd` - Grace notes before parent note
- `OrnamentAfterStart` / `OrnamentAfterEnd` - Grace notes after parent note  
- `OrnamentOnTopStart` / `OrnamentOnTopEnd` - Ornaments on top of note (trills, etc.)

### B. Two Rendering Modes

#### Mode 1: Ornament Edit Mode ON (Editing)
- Ornament cells remain inline in the cell array
- All cells are visible and selectable
- Used for direct editing of ornament content
- Indicators remain on cells

#### Mode 2: Ornament Edit Mode OFF (Display)
- Ornament cells are extracted from inline representation
- Indicators + content cells are grouped into `Ornament` objects
- Attached to their anchor cell via `cell.ornament` field
- Removed from main cell vector for rendering
- Ornaments positioned separately as floating overlays

### C. Layout Pipeline (Mode OFF)

**Step 1: Extraction** (`extract_ornaments_from_indicators()`)
```
Inline cells with indicators:
[note] [@start-orn] [a] [b] [@end-orn] [next]
                    ↓
Extracted ornament object:
{
  cells: [@start-orn, a, b, @end-orn],
  placement: After
}
↓
Result:
[note {ornament}] [next]
```

**Step 2: Anchor Finding** (`find_ornament_anchors()`)
- Priority: Left PITCHED → Right PITCHED → Left LINE element
- Used for slur calculation when mode is ON

**Step 3: Cell Positioning** (`position_ornaments_from_cells()`)
- Parent baseline: 75% down from cell top
- Ornament position: `parent_baseline_y - (font_size * 0.8)`
- Horizontal: right edge of parent cell
- Scale: 60% of normal cell width (12.0 * 0.6 = 7.2px per char)

**Step 4: Arc Rendering** (`compute_ornament_arcs_from_cells()`)
- Creates shallow frown-shaped arc from parent to ornament span
- Arc height: proportional to span, scaled 0.15 with clamp(3.0, 8.0)
- Color: dark blue (#1e40af)
- Direction: "up" (upward curve)

### D. Display List Output

Two separate structures returned to JavaScript:

1. **RenderOrnament** (positioned overlay elements)
   ```rust
   pub struct RenderOrnament {
       pub text: String,           // Single character
       pub x: f32,                 // Absolute X position
       pub y: f32,                 // Absolute Y position
       pub classes: Vec<String>,   // CSS classes
   }
   ```

2. **RenderArc** (connecting arcs)
   ```rust
   pub struct RenderArc {
       pub start_x/y, end_x/y,     // Anchor points
       pub cp1_x/y, cp2_x/y,       // Bezier control points
       pub color, direction,       // Visual properties
   }
   ```

### E. JavaScript Rendering

**Ornament characters** (lines 946-966 in renderer.js):
```javascript
ornament.y - lineStartY        // Convert to relative Y
position: absolute             // Float over cell grid
font-size: BASE_FONT_SIZE * 0.6 = 19.2px (60% scale)
color: #1e40af                 // Dark blue
pointer-events: none           // Non-interactive
```

**Ornamental cells in edit mode** (lines 880-943):
- Displayed inline with normal positioning
- Class "ornament-cell" for styling
- testid "ornament-cell" for E2E testing

---

## 3. Positioning Calculations

### Horizontal Positioning

**Parent cell to ornament start:**
```
ornament_x = parent_cell.x + parent_cell.w
```

**Subsequent ornament characters:**
```
ornament_x += 12.0 * 0.6  // 7.2px per character
```

### Vertical Positioning

**Baseline calculation:**
```
baseline_offset_in_cell = cell_height * 0.75
parent_baseline_y = line_y_offset + cell_y_offset + baseline_offset_in_cell
```

**Ornament Y position:**
```
ornament_offset_above_baseline = font_size * 0.8
ornament_y = parent_baseline_y - ornament_offset_above_baseline
```

With `font_size = 32px`:
```
ornament_offset = 32 * 0.8 = 25.6px above baseline
```

### Arc Control Point Calculation

```rust
let span = (end_x - start_x).abs();
let arch_height = (span * 0.15).max(3.0).min(8.0);

// Symmetrical control points at 1/3 and 2/3 of span
let cp1_x = start_x + span * 0.33;
let cp1_y = start_y - arch_height;

let cp2_x = start_x + span * 0.67;
let cp2_y = end_y - arch_height;
```

---

## 4. Collision Detection & Spacing

**Current Status:** No automatic collision detection implemented

**Spacing Approach:**
- Fixed 60% scale for ornament characters (7.2px each)
- Sequential horizontal positioning (no gap between ornament chars)
- Vertical stacking: Multiple ornaments on same anchor → separate lines
- Test file indicates possible future spacing: `-8px` spacing between stacked ornaments

**Gap Constants:**
- `SLUR_HEIGHT: 8.0px`
- `BEAT_LOOP_HEIGHT: 7.0px`
- `OCTAVE_DOT_HEIGHT: 4.0px`
- `DECORATION_GAP: 2.0px` (between content and decorations)
- `LYRICS_GAP: 4.0px` (between decorations and lyrics)

**Line Height Calculation:**
- Baseline: `cell_bottom + baseline_bottom_padding`
- +8px if slurs present
- +7px if beat loops present
- No additional height reserved for ornaments in current layout

---

## 5. Current Limitations & Observations

### A. No Collision Detection
- Ornaments positioned at fixed height above parent
- No checking for overlap with:
  - Other ornaments on adjacent notes
  - Slurs or beat loops
  - Lyrics or tala markers
  - Dynamic width adjustment

### B. Fixed Scale
- Ornaments always 60% of cell width
- No dynamic sizing based on content
- Sequential horizontal layout (no kerning)

### C. Single Position Type
- `OrnamentPlacement` in Ornament struct maps multiple indicator types:
  - `OrnamentAfterStart/End` → `After`
  - `OrnamentOnTopStart/End` → `After` (same as after!)
- Loss of distinction between "after" and "on top" positions post-extraction

### D. Anchor Extraction
- When ornaments extracted, anchor cell found by:
  1. Search left for PITCHED element
  2. Search right for PITCHED element
  3. Search left for any LINE element
- Anchor search disabled when edit mode ON (no extraction)

### E. Arc Positioning
- Arcs are horizontal at parent note's top Y
- Ornament arcs have fixed shallow curve (proportional to span)
- No repositioning if ornaments overlap other elements

---

## 6. Data Flow Summary

```
Input: User edits with ornament indicators in line.cells
         ↓
[extract_ornaments_from_indicators]
   Remove indicator cells, create Ornament objects
         ↓
Working cells (with attached ornaments)
         ↓
[find_ornament_anchors] (for slur calculation)
         ↓
[position_ornaments_from_cells]
   Calculate X (sequential) and Y (fixed above parent)
         ↓
[compute_ornament_arcs_from_cells]
   Create bezier curves connecting parent to ornament span
         ↓
DisplayList {
  cells: [working cells],
  ornaments: [RenderOrnament { text, x, y, classes }],
  ornament_arcs: [RenderArc { ... }],
}
         ↓
JavaScript renderer.js
   Line iteration → render cells
   Ornament iteration → render floating spans
   Arc iteration → SVG overlay
```

---

## 7. Key Constants & Thresholds

| Constant | Value | Purpose |
|----------|-------|---------|
| Ornament scale | 0.6 | Character width multiplier |
| Default cell width | 12.0px | Base unit for layout |
| Ornament char width | 7.2px | 12.0 * 0.6 |
| Baseline offset | 0.75 | Position in cell (75% down) |
| Offset above baseline | 0.8 | Font-size multiplier |
| Arc height factor | 0.15 | Proportional to span |
| Arc height min/max | 3.0/8.0px | Clamp range |
| Arc control ratio | 0.57 | Position along span (57%) |
| Font scale (JS) | 60% | CSS font-size for ornaments |
| Decoration gap | 2.0px | Space before decorations |

