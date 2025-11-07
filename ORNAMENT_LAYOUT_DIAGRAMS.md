# Ornament Layout System - Visual Architecture Diagrams

## 1. Cell Indicator State Machine

```
                    Ornament Edit Mode: ON
                    (Inline, Editable)
                            │
        ┌───────────────────┴───────────────────┐
        │                                       │
        v                                       v
    OrnamentBeforeStart          OrnamentAfterStart
    OrnamentBeforeEnd            OrnamentAfterEnd
                                 OrnamentOnTopStart
                                 OrnamentOnTopEnd

        Edit UI                 Position in Text
        ────────────────────────────────────
        Before: Grace note      Placed before anchor
        After:  Grace note      Placed after anchor
        OnTop:  Trill/mordent   Above anchor


                    Ornament Edit Mode: OFF
                    (Extracted, Display-only)
                            │
                            v
        Ornament object attached to anchor Cell
        cells: [start, content..., end]
        placement: Before | After
```

## 2. Layout Pipeline: Mode OFF (Display)

```
LINE CELLS (From parser)
┌──────────────────────────────────────────────────┐
│ [C] [@START] [a] [b] [@END] [D] [E] [F]        │
│  ^                          ^                    │
│  └─ Anchor note            └─ Next content      │
└──────────────────────────────────────────────────┘
                    ↓
        extract_ornaments_from_indicators()
        (Scan for start/end pairs, extract middle)
                    ↓
WORKING CELLS (Modified for layout)
┌──────────────────────────────┐
│ [C {ornament}] [D] [E] [F]  │
│  │                           │
│  └─ Attached Ornament:      │
│     {                        │
│       cells: [@, a, b, @],   │
│       placement: After       │
│     }                        │
└──────────────────────────────┘
                    ↓
        position_ornaments_from_cells()
        (Calculate X, Y for each ornament char)
                    ↓
RENDER DATA (To JavaScript)
┌─────────────────────────────────────────────┐
│ RenderOrnament[] {                          │
│   { text: 'a', x: 42.0, y: 18.0, ... },   │
│   { text: 'b', x: 49.2, y: 18.0, ... },   │
│ }                                           │
│                                             │
│ RenderArc[] {                               │
│   { id: 'arc-ornament-...',                │
│     start_x: 35.0, start_y: 34.0,          │
│     end_x: 50.0, end_y: 34.0,              │
│     cp1_x: 37.3, cp1_y: 29.0,              │
│     cp2_x: 47.7, cp2_y: 29.0,              │
│     color: '#1e40af', direction: 'up'      │
│   }                                         │
│ }                                           │
└─────────────────────────────────────────────┘
                    ↓
    JavaScript Renderer + SVG Arc Overlay
```

## 3. Positioning Mathematics

### Vertical Stack

```
Normal Note Cell (baseline at 75%)
┌────────────┐
│            │ ─ 0% (top)
│            │
│            │ ─ 75% (baseline)
│ C          │
│            │ ─ 100% (bottom)
└────────────┘
       ^
       │ font_size * 0.8 = 25.6px up
       │
   ┌───────┐
   │  abc  │ ─ Ornament (60% scale)
   └───────┘
```

### Horizontal Layout

```
Parent Note        Ornament Characters (Sequential)
┌────────┐  gap=0  ┌──┐┌──┐┌──┐
│   C    │   ──→   │a ││b ││c │
└────────┘         └──┘└──┘└──┘
 w=14px            7.2px each

Total ornament span: 7.2 * 3 = 21.6px
```

### Arc Curve (Bezier Control Points)

```
Parent Center ──────────────────→ Ornament End
      (35.0)                         (50.0)
        │ span = 50 - 35 = 15px      │
        │ arch_height = (15 * 0.15).clamp(3,8) = 2.25 → 3.0px
        │                            │
        └─→ CP1 (33% along): (40.0, -3.0)
        └─→ CP2 (67% along): (45.0, -3.0)

        Curve shape:
        ┌─────────────────┐
        │   (upward arc)  │
        └─────────────────┘
```

## 4. Mode Switching: Edit ON ↔ OFF

### Mode ON (Editing)
```
Line.cells = [C, @start, a, b, @end, D, E]
                   ↓
All cells rendered inline
[C] [@start] [a] [b] [@end] [D] [E]
        ↑                         ↑
    Selectable            Selectable
    for editing           for editing
        
Ornament edit mode = true
ornament_edit_mode in layout_config = true
renderLine.ornaments = []  // Empty!
renderLine.ornament_arcs = []  // Empty!
```

### Mode OFF (Display)
```
Line.cells = [C, @start, a, b, @end, D, E]
                   ↓
extract_ornaments_from_indicators()
                   ↓
Working cells = [C, D, E]  (with C.ornament attached)
                   ↓
Position ornaments + create arcs
                   ↓
renderLine.cells = [C, D, E]  // No indicators!
renderLine.ornaments = [RenderOrnament{a}, RenderOrnament{b}]
renderLine.ornament_arcs = [RenderArc{...}]

Ornament edit mode = false
ornament_edit_mode in layout_config = false
```

## 5. Cell Structure with Ornament Fields

```
Cell {
    char: 'C',
    kind: PitchedElement,
    col: 0,
    ornament_indicator: None,      ← Used in EDIT mode
    ornament: None,                ← Used in DISPLAY mode
    pitch_code: Some(C),
    pitch_system: Some(Western),
    octave: 0,
    slur_indicator: None,
    x: 10.0,
    y: 5.0,
    w: 14.0,
    h: 24.0,
    bbox: (10.0, 5.0, 24.0, 29.0),
    hit: (8.0, 3.0, 26.0, 31.0),
    flags: 0x01 (head marker),
}

Optional Ornament (when mode OFF):
{
    cells: [
        Cell { char: '@', kind: Symbol, ornament_indicator: OrnamentAfterStart },
        Cell { char: 'a', kind: PitchedElement, ... },
        Cell { char: 'b', kind: PitchedElement, ... },
        Cell { char: '@', kind: Symbol, ornament_indicator: OrnamentAfterEnd },
    ],
    placement: After,
}
```

## 6. Anchor Finding Algorithm (Mode ON)

```
Input: Ornament cells spanning indices 2-4
       [C] [@start] [a] [b] [@end] [D]
       0    1        2    3    4     5

find_ornament_anchors():
  ornament_spans = [(1, 4)]  // @start at 1, @end at 4
  
  For span (1, 4):
    // Priority 1: Left for PITCHED
    Search: [0] = C (PITCHED) ✓
    
    anchor = 0  (C)
    
  Return: {
    1: 0,  // @start anchors to C
    2: 0,  // a anchors to C
    3: 0,  // b anchors to C
    4: 0,  // @end anchors to C
  }
```

## 7. Rendering Flow in JavaScript

```
DisplayList from WASM
│
├─ lines[0].cells → Render cell grid (inline)
│                   [C][D][E][F]...
│                   ↑ position: absolute
│                   └─ x, y from RenderCell
│
├─ lines[0].ornaments → Render ornament overlay (floating)
│                       [a][b] (scaled 60%, blue color)
│                       ↑ position: absolute
│                       └─ x, y from RenderOrnament
│
├─ lines[0].ornament_arcs → SVG overlay (ArcRenderer)
│                           ┌─────┐ (bezier curve)
│                           └─────┘
│
├─ lines[0].slurs → SVG overlay (upward arcs)
│
├─ lines[0].beat_loops → SVG overlay (downward arcs)
│
└─ lines[0].lyrics → Positioned text
```

## 8. CSS Classes Applied

### Ornament Cells in Edit Mode

```
<span class="char-cell 
             kind-symbol 
             ornament-cell
             ornament-before-start 
             pitch-system-number"
      data-testid="ornament-cell"
      ...>
  @
</span>
```

### Ornament Characters in Display Mode

```
<span class="char-cell 
             ornament-char"
      data-testid="ornament-cell"
      style="position: absolute; 
              font-size: 19.2px; 
              color: #1e40af; 
              pointer-events: none;">
  a
</span>
```

## 9. Constants Flow

```
Rust WASM Layout
├─ config.font_size = 32px
├─ config.cell_height = 24px
├─ config.cell_y_offset = 5px
├─ Default cell width = 12.0px
└─ Ornament scale = 0.6 → 7.2px

    ↓ (serialized in DisplayList)

JavaScript Renderer
├─ BASE_FONT_SIZE = 32px
├─ BASE_FONT_SIZE * 0.6 = 19.2px (CSS font-size)
├─ y_offset = parent_baseline - (32 * 0.8) = baseline - 25.6px
└─ x_offset = parent.x + parent.w (sequential from there)
```

## 10. Current Limitation: No Collision Avoidance

```
Without Collision Detection:
┌─────────────────────────┐
│     abc  def  ghi       │ ← Ornaments may overlap
│ C   D    E    F    G    │ ← Notes
└─────────────────────────┘

All ornaments positioned at:
  y = baseline - 25.6px
  x = parent.x + parent.w (sequential)

Risk Areas:
- Adjacent notes with ornaments touching
- Ornaments overlapping with slurs/lyrics
- Line height not accounting for ornament depth
```

