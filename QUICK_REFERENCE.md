# Quick Reference: Double-Click & Selection Implementation

## Current Double-Click Flow

```
Browser dblclick event
    ↓
MouseHandler.handleDoubleClick() [JS]
    ↓
calculateCellPosition(x, y) → stop index [JS/DOM]
    ↓
selectBeatOrCharGroup(cellIndex) [JS]
    ├─ IF beat-loop class exists → scan DOM for beat boundaries
    └─ ELSE → select character/cell
    ↓
initializeSelection(start, end) [JS]
    ├─ Store in document.state.selection
    └─ Convert cell indices to stop indices
    ↓
updateSelectionDisplay() [JS]
    └─ Add 'selected' CSS class to DOM cells
```

## Key Files

| What | File | Lines | Language |
|------|------|-------|----------|
| Double-click entry | `src/js/handlers/MouseHandler.js` | 147-159 | JS |
| Beat/char selection | `src/js/handlers/MouseHandler.js` | 165-263 | JS |
| Cell position calc | `src/js/handlers/MouseHandler.js` | 349-432 | JS |
| Beat derivation | `src/parse/beats.rs` | 65-125 | Rust |
| Mouse down/up | `src/api/core.rs` | 2425-2490 | Rust |
| Selection storage | `src/js/editor.js` | 156-159 | JS |
| Selection methods | `src/js/editor.js` | 800-843, 1100-1254 | JS |
| Data structures | `src/models/notation.rs` | 10-283 | Rust |

## Two-Branch Logic in `selectBeatOrCharGroup()`

### Branch 1: Beat Selection (DOM-based)
**Trigger**: Cell has CSS class `beat-loop-first`, `beat-loop-middle`, or `beat-loop-last`

```javascript
// Scan backward for beat-loop-first
// Scan forward for beat-loop-last
// Select all cells between them
```

**Issues**:
- Depends on render order
- Not testable
- Fragile

### Branch 2: Character Selection (Model-based)
**Trigger**: Cell starts a multi-character glyph

```javascript
// Scan backward for start of glyph
// Scan forward while part of same glyph
// Select all cells in group
```

**Advantages**:
- Model-based (deterministic)
- Testable
- Reliable

## Selection State Structure

```javascript
document.state.selection = {
  // WASM model (from mouseDown/Move/Up)
  anchor: { line: 0, col: 5 },      // Fixed point
  head: { line: 0, col: 10 },       // Moving cursor
  start: { line: 0, col: 5 },       // Normalized min
  end: { line: 0, col: 10 },        // Normalized max
  is_empty: false,
  is_forward: true,
  active: true,
  
  // Legacy (for backward compatibility)
  startStopIndex: 0,
  endStopIndex: 1,
}
```

## Beat Structure

### BeatSpan Model
```rust
pub struct BeatSpan {
    pub start: usize,       // First cell in beat (inclusive)
    pub end: usize,         // Last cell in beat (inclusive)
    pub duration: f32,      // Relative duration
    pub visual: BeatVisual, // Rendering config
}
```

### Beat Derivation
```
Input: Cell array
       ├─ Skip rhythm-transparent (ornaments)
       ├─ Identify beat elements (pitched/unpitched/breath)
       └─ Group consecutive beat elements

Output: Vec<BeatSpan>
       └─ Each span = start..end columns
```

### CSS Classes (After Render)
```
beat-loop-first   ← First cell of beat (defines arc start)
beat-loop-middle  ← Middle cells of beat
beat-loop-last    ← Last cell of beat (defines arc end)
```

## Selection Methods

### updateCursorFromWASM(diff)
- Called after mouseDown/Move/Up
- Copies selection from WASM to JS
- Triggers visual update

### initializeSelection(startCellIndex, endCellIndex)
- Called by double-click handler
- Stores in document.state.selection
- Converts to stop indices internally

### updateSelectionDisplay()
- Clears previous 'selected' classes
- Calls renderSelectionVisual()
- Updates cursor display

### renderSelectionVisual(selection)
- Iterates through DOM cells
- Adds 'selected' class to cells in range
- Works with normalized start.col to end.col

## Mouse Event Flow

### Drag Selection (WASM-backed)
```
mousedown → WASM: mouseDown(pos) → JS: updateCursorFromWASM(diff)
mousemove → WASM: mouseMove(pos) → JS: updateCursorFromWASM(diff)
mouseup   → WASM: mouseUp(pos)   → JS: updateCursorFromWASM(diff)
```

### Double-Click (Pure JavaScript)
```
dblclick → JS: handleDoubleClick()
        → JS: selectBeatOrCharGroup()
        → JS: initializeSelection()
        → JS: updateSelectionDisplay()
```

## Cell Position Calculation

**Input**: X, Y coordinates (screen-relative)

**Process**:
1. Determine line from Y coordinate
2. Get all `.char-cell` elements
3. Filter out ornament cells (in normal mode)
4. Measure rendered positions from DOM
5. Find which cell X falls in
6. Determine left/right half

**Output**: Stop index (0..N+1)

## WASM Function Locations

| Function | File | Purpose |
|----------|------|---------|
| `mouse_down` | api/core.rs:2425 | Start selection |
| `mouse_move` | api/core.rs:2445 | Extend selection |
| `mouse_up` | api/core.rs:2464 | Finalize selection |
| `extract_implicit_beats` | parse/beats.rs:70 | Derive beat spans |

## Ornament Handling

### In Beat Derivation
```rust
// Skip rhythm-transparent cells (ornaments) entirely
if cell.is_rhythm_transparent() {
    continue;
}
```

### In Cell Position Calculation
```javascript
// Filter out ornament cells in normal mode
if (editMode || !line) return true;
if (cell.ornament_indicator.name !== 'none') return false;
```

### Current Behavior
- Beats exclude ornament cells
- Double-click can't select through ornaments
- Edit mode includes ornaments

## Recommended Improvement

**Add WASM function**:
```rust
#[wasm_bindgen(js_name = selectBeatAtPosition)]
pub fn select_beat_at_position(pos_js: JsValue) -> Result<SelectionInfo, JsValue>
```

**Benefit**: Unify beat selection logic, eliminate DOM scanning

## Common Gotchas

1. **Selection is exclusive on end**: `initializeSelection(start, end + 1)`
2. **Stops ≠ Cells**: Stops are positions between cells (0..N+1)
3. **Beats are ephemeral**: Not saved to JSON, recalculated on render
4. **Continuation flag**: Only set for accidentals and modifiers
5. **Ornaments in normal mode**: Filtered from navigation, shown in edit mode

## Testing Checklist

- [ ] Double-click selects beat correctly
- [ ] Double-click selects character group correctly
- [ ] Selection state stored in document
- [ ] Visual selection displayed with 'selected' class
- [ ] Beat derivation skips ornaments
- [ ] CSS classes applied correctly
- [ ] Drag selection still works
- [ ] Multi-line selection (if enabled)

