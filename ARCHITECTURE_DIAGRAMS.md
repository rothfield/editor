# Architecture Diagrams

## 1. Current Double-Click Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ Browser Event: dblclick                                         │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│ MouseHandler.handleDoubleClick(event)                           │
│ - Convert screen coords to editor-relative                      │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│ calculateCellPosition(x, y)                                     │
│ - Determine which line (Y-based)                                │
│ - Get all .char-cell elements                                   │
│ - Filter ornaments (normal mode)                                │
│ - Measure rendered positions from DOM                           │
│ - Snap to cell boundary                                         │
│ ────────────────────────────────────────────────────────────    │
│ Returns: Stop Index (0..N+1)                                    │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 ▼
     ┌───────────────────────────┐
     │ selectBeatOrCharGroup()   │
     │ cellIndex = stop index    │
     └────┬──────────────────────┘
          │
    ┌─────┴─────────────────────────────┐
    │                                   │
    │ Check beat-loop classes           │
    │                                   │
    ▼                                   ▼
┌──────────────────────┐     ┌──────────────────────┐
│ BRANCH 1: Beat       │     │ BRANCH 2: Character  │
│ (DOM-based)          │     │ (Model-based)        │
│                      │     │                      │
│ IF cell has:         │     │ IF cell.continuation │
│ - beat-loop-first    │     │ is true/false        │
│ - beat-loop-middle   │     │                      │
│ - beat-loop-last     │     │ Scan backward for    │
│                      │     │ continuation=false   │
│ Scan backward for    │     │ (start of group)     │
│ beat-loop-first      │     │                      │
│ (start of beat)      │     │ Scan forward while   │
│                      │     │ continuation=true    │
│ Scan forward for     │     │ (end of group)       │
│ beat-loop-last       │     │                      │
│ (end of beat)        │     │ Return: [start, end] │
│                      │     │                      │
│ Return: [start, end] │     │                      │
│                      │     │                      │
│ ISSUES:              │     │ ADVANTAGES:          │
│ - DOM-dependent      │     │ - Model-based        │
│ - Not testable       │     │ - Testable           │
│ - Render-order dep   │     │ - Deterministic      │
│ - Duplicate logic    │     │ - Reliable           │
└──────────┬───────────┘     └────────┬─────────────┘
           │                         │
           └──────────┬──────────────┘
                      │
                      ▼
         ┌────────────────────────────┐
         │ initializeSelection()       │
         │ startIndex, endIndex        │
         │                            │
         │ Store in:                  │
         │ document.state.selection   │
         │                            │
         │ Convert to stop indices    │
         └────────────────┬───────────┘
                          │
                          ▼
         ┌────────────────────────────┐
         │ updateSelectionDisplay()   │
         │                            │
         │ Call renderSelectionVisual │
         │ Add 'selected' CSS class   │
         │ to DOM cells in range      │
         └────────────────────────────┘
```

## 2. Drag Selection Flow (Comparison)

```
┌─────────────────────────────────────────────────────────────────┐
│ Browser: mousedown event                                        │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 ▼
     ┌───────────────────────────────┐
     │ JS: handleMouseDown()          │
     │ - calculateCellPosition()      │
     │ - isDragging = true            │
     └────────────┬──────────────────┘
                  │
                  ▼
     ┌────────────────────────────────────────┐
     │ WASM: mouseDown(pos)                   │
     │ - Clamp position to valid bounds       │
     │ - Clear selection                      │
     │ - Start selection at position          │
     │ - Return EditorDiff                    │
     └────────────┬─────────────────────────┘
                  │
                  ▼
     ┌──────────────────────────────────────┐
     │ JS: updateCursorFromWASM(diff)        │
     │ - Copy selection from diff            │
     │ - Update document.state.selection     │
     │ - Trigger display update              │
     └──────────────────────────────────────┘

Browser: mousemove (while isDragging)
                 │
                 ▼
     ┌────────────────────────────────────────┐
     │ WASM: mouseMove(pos)                   │
     │ - Extend selection from anchor to pos  │
     │ - Return EditorDiff                    │
     └────────────┬─────────────────────────┘
                  │
                  ▼
     ┌──────────────────────────────────────┐
     │ JS: updateCursorFromWASM(diff)        │
     │ - Update selection bounds              │
     │ - Refresh visual                      │
     └──────────────────────────────────────┘

Browser: mouseup event
                 │
                 ▼
     ┌────────────────────────────────────────┐
     │ WASM: mouseUp(pos)                     │
     │ - Finalize selection at position       │
     │ - Return EditorDiff                    │
     └────────────┬─────────────────────────┘
                  │
                  ▼
     ┌──────────────────────────────────────┐
     │ JS: updateCursorFromWASM(diff)        │
     │ - Final selection state                │
     │ - isDragging = false (after delay)     │
     └──────────────────────────────────────┘
```

## 3. Beat Structure Derivation

```
Input: Line.cells = [N, -, -, r, S, b, b, G, |]
       Indices:      [0, 1, 2, 3, 4, 5, 6, 7, 8]

                    Iterate through cells
                             │
                    ┌────────┴─────────┐
                    │                  │
        ┌──────────────────┐  ┌─────────────────┐
        │ Skip if          │  │ Check if beat   │
        │ rhythm-          │  │ element         │
        │ transparent      │  │ (pitched/       │
        │ (ornaments)      │  │  unpitched/     │
        │                  │  │  breath)        │
        └──────────────────┘  └────────┬────────┘
                                       │
                    ┌──────────────────┼──────────────────┐
                    │                  │                  │
           ┌────────▼────────┐  ┌──────▼──────┐  ┌───────▼──────┐
           │ Cell 0: N       │  │ Cell 4: S   │  │ Cell 5: b    │
           │ is_beat=true    │  │ is_beat=true│  │ is_beat=true │
           │ beat_start=0    │  │ beat_start=4│  │ beat_end=6   │
           │ beat_end=0      │  │ beat_end=4  │  │ (continues)  │
           │                 │  │             │  │              │
           │ Cell 1: -       │  │ Cell 5: b   │  │ Cell 7: G    │
           │ is_beat=false   │  │ is_beat=true│  │ is_beat=true │
           │ (separator)     │  │ beat_end=5  │  │ beat_end=7   │
           │                 │  │             │  │              │
           │ BEAT 1 ENDS     │  │ Cell 6: b   │  │ Cell 8: |    │
           │ BeatSpan(0,3)   │  │ is_beat=true│  │ is_beat=false│
           │                 │  │ beat_end=6  │  │              │
           │ Cell 2: -       │  │             │  │ BEAT 2 ENDS  │
           │ is_beat=false   │  │ Cell 7: G   │  │ BeatSpan(4,7)│
           │ (separator)     │  │ is_beat=true│  │              │
           │                 │  │ beat_end=7  │  │              │
           │ Cell 3: r       │  │             │  │              │
           │ is_beat=true    │  │ Cell 8: |   │  │              │
           │ beat_end=3      │  │ is_beat=false│  │              │
           │                 │  │ (separator) │  │              │
           └─────────────────┘  └─────────────┘  └──────────────┘

Output: beats = [
  BeatSpan { start: 0, end: 3, duration: 1.0 },
  BeatSpan { start: 4, end: 7, duration: 1.0 }
]

                    CSS Classes Applied
                            │
         ┌──────────────────┬┴─────────────┬──────────┐
         │                  │              │          │
         ▼                  ▼              ▼          ▼
    beat-loop-      beat-loop-        beat-loop-   beat-loop-
      first          middle             middle      last
       │              │                  │          │
    Cell 0         Cell 1             Cell 2      Cell 3
       N              -                  -           r
```

## 4. Selection State Structure

```
document.state.selection = {
  ┌─────────────────────────────────────┐
  │ WASM Model (anchor/head)            │
  ├─────────────────────────────────────┤
  │ anchor: { line: 0, col: 5 }         │
  │ head: { line: 0, col: 10 }          │
  │                                     │
  │ During drag, both change:           │
  │ - anchor stays fixed (mouseDown)    │
  │ - head moves with cursor (Move/Up)  │
  └─────────────────────────────────────┘
           │
           ▼
  ┌─────────────────────────────────────┐
  │ Normalized Bounds                   │
  ├─────────────────────────────────────┤
  │ start: { line: 0, col: 5 }          │
  │ end: { line: 0, col: 10 }           │
  │                                     │
  │ start = min(anchor, head)           │
  │ end = max(anchor, head)             │
  └─────────────────────────────────────┘
           │
           ▼
  ┌─────────────────────────────────────┐
  │ Metadata                            │
  ├─────────────────────────────────────┤
  │ is_empty: false                     │
  │ is_forward: true (anchor <= head)   │
  │ active: true                        │
  └─────────────────────────────────────┘
           │
           ▼
  ┌─────────────────────────────────────┐
  │ Visual Rendering                    │
  ├─────────────────────────────────────┤
  │ For each cell in range [start, end):│
  │   Add CSS class: 'selected'         │
  │                                     │
  │ .char-cell.selected { bg: blue }    │
  └─────────────────────────────────────┘
```

## 5. Cell Position Calculation Algorithm

```
Input: click at (x=42, y=150) screen-relative

Step 1: Determine Line from Y
        │
        ├─ Get all .notation-line elements
        ├─ Convert Y to editor-relative
        ├─ Find line containing Y (or closest)
        └─ Return: lineIndex = 0

Step 2: Get Cell Elements
        │
        ├─ .notation-line[0].querySelectorAll('.char-cell')
        └─ Return: [cell0, cell1, cell2, cell3, ...]

Step 3: Filter Out Ornaments (Normal Mode)
        │
        ├─ For each cellElement:
        │  ├─ Get cell index from data-cell-index
        │  ├─ Look up cell in model
        │  └─ If cell.ornament_indicator !== 'none'
        │     └─ Remove from navigable list
        │
        └─ Return: navigableCells (ornaments filtered)

Step 4: Measure Rendered Positions
        │
        ├─ Get bounding rect for each cell
        ├─ Convert to editor-relative coordinates
        │
        └─ cursorPositions = [
             cell[0].left,    // Position 0
             cell[0].right,   // Position 1
             cell[1].right,   // Position 2
             cell[2].right,   // Position 3
             ...
           ]

Step 5: Find Cell Containing X
        │
        ├─ For each cell i:
        │  ├─ leftBoundary = cursorPositions[i]
        │  ├─ rightBoundary = cursorPositions[i+1]
        │  │
        │  └─ If x in [leftBoundary, rightBoundary):
        │     │
        │     └─ Calculate midpoint
        │        ├─ If x >= midpoint
        │        │  └─ Return i+1 (right boundary)
        │        └─ Else
        │           └─ Return i (left boundary)

Output: Stop Index (0..N+1)
        │
        └─ 0 = before first cell
           1 = after first cell (or between 0 and 1)
           N = after Nth cell
```

## 6. Recommended Architecture Improvement

```
CURRENT (Hybrid - Fragile):
┌─────────────────┐
│ JavaScript      │ Beat selection via DOM scanning
├─────────────────┤
│ DOM Classes     │ beat-loop-first/middle/last
├─────────────────┤
│ WASM            │ Already has beat structure
└─────────────────┘
        ↑
   Problem: Duplication,
   fragility, not testable

RECOMMENDED (WASM-first):
┌─────────────────┐
│ JavaScript      │ Event → WASM → Display
├─────────────────┤
│ WASM Function   │ select_beat_at_position(pos)
│ "Selects beat   │ - Finds beat containing pos
│  containing"    │ - Returns SelectionInfo
├─────────────────┤
│ WASM Backend    │ Reuse existing beat derivation
│ (existing)      │
└─────────────────┘
        ↑
   Benefit:
   - Testable
   - Deterministic
   - No DOM dependency
   - Single source of truth
```

## 7. Selection Flow Comparison

```
DRAG SELECTION (WASM-backed):
───────────────────────────────

Browser Event     JS Handler      WASM Operation    JS Update
──────────────    ───────────     ──────────────    ─────────
mousedown    →    mouseDown()  →  mouse_down()   →  updateCursorFromWASM()
mousemove    →    mouseMove()  →  mouse_move()   →  updateCursorFromWASM()
mouseup      →    mouseUp()    →  mouse_up()     →  updateCursorFromWASM()


DOUBLE-CLICK SELECTION (JavaScript-only):
──────────────────────────────────────────

Browser Event          JS Handler                  JS Update
──────────────────     ──────────────────────      ──────────────
dblclick        →      handleDoubleClick()    →    selectBeatOrCharGroup()
                       calculateCellPosition()  →  initializeSelection()
                                             →    updateSelectionDisplay()

NOTE: Double-click does NOT go through WASM
      This is the architectural inconsistency
      that should be fixed!
```

