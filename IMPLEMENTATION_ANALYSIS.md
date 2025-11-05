# Current Implementation Analysis: Double-Click, Selection, and Beat Structure

**Date**: 2025-11-03  
**Branch**: 006-music-notation-ornament  
**Purpose**: Comprehensive analysis for implementing new double-click and selection features

---

## Executive Summary

This document analyzes the current architecture for:
1. **Double-click event handling** (JavaScript → DOM scanning)
2. **Selection logic** (hybrid WASM + JavaScript model)
3. **Beat structure** (ephemeral BeatSpan calculations)
4. **Mouse event handlers** (WASM-backed drag selection)

**Key Finding**: Selection uses two separate mechanisms:
- **DOM-based** (fragile): scanning CSS classes for beat detection
- **Model-based** (reliable): Cell.continuation flag for character groups

**Recommendation**: Unify by moving beat selection logic to WASM.

---

## 1. Double-Click Event Handling (JavaScript)

### Location
**File**: `/home/john/editor/src/js/handlers/MouseHandler.js` (lines 143-262)

### Entry Point: `handleDoubleClick()`
```javascript
handleDoubleClick(event) {
  const rect = this.editor.element.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  
  const cellPosition = this.calculateCellPosition(x, y);
  
  if (cellPosition !== null) {
    this.selectBeatOrCharGroup(cellPosition);
  }
  
  event.preventDefault();
}
```

**Flow**:
1. Convert browser coordinates to editor-relative coordinates
2. Calculate cell position using DOM measurements
3. Delegate to `selectBeatOrCharGroup()` for selection logic

### Selection Logic: `selectBeatOrCharGroup(cellIndex)`

Implements **two-branch logic**:

#### Branch 1: Beat Selection (DOM-based)
When clicked cell has CSS classes: `beat-loop-first`, `beat-loop-middle`, or `beat-loop-last`

```javascript
if (hasBeatClass) {
  // Scan backward for beat-loop-first
  for (let i = cellIndex; i >= 0; i--) {
    if (el.classList.contains('beat-loop-first')) {
      startIndex = i;
      break;
    }
    // Stop if we leave the beat group
    if (!el.classList.contains('beat-loop-*')) break;
  }
  
  // Scan forward for beat-loop-last
  for (let i = cellIndex; i < cellElements.length; i++) {
    if (el.classList.contains('beat-loop-last')) {
      endIndex = i;
      break;
    }
    // Stop if we leave the beat group
    if (!el.classList.contains('beat-loop-*')) break;
  }
}
```

**Issues with this approach**:
- Depends on DOM being rendered correctly
- Fragile: relies on CSS class markers
- Not testable in unit tests
- Order-dependent (must find classes in render order)

#### Branch 2: Character Group Selection (Model-based)
When cell is part of continuation chain

```javascript
else {
  // Scan backward for continuation=false
  for (let i = cellIndex; i >= 0; i--) {
    if (!cells[i].continuation) {
      startIndex = i;
      break;
    }
  }
  
  // Scan forward while continuation=true
  for (let i = startIndex + 1; i < cells.length; i++) {
    if (cells[i].continuation) {
      endIndex = i;
    } else {
      break;
    }
  }
}
```

**Advantages of this approach**:
- Works with Cell model directly
- Testable
- Not dependent on DOM render state
- Deterministic

### Selection Finalization
```javascript
this.editor.initializeSelection(startIndex, endIndex + 1);  // end is exclusive
this.editor.setCursorPosition(endIndex);
this.editor.updateSelectionDisplay();
```

---

## 2. Selection Logic: WASM vs JavaScript

### WASM Level (Selection Manager)

**Location**: `/home/john/editor/src/api/core.rs` (lines 2425-2490)

#### Mouse Event Functions
```rust
#[wasm_bindgen(js_name = mouseDown)]
pub fn mouse_down(pos_js: JsValue) -> Result<JsValue, JsValue> {
    // Clears selection, starts new selection at click position
    doc.state.selection_manager.clear_selection();
    doc.state.selection_manager.start_selection(clamped_pos);
    // Returns EditorDiff with updated selection
}

#[wasm_bindgen(js_name = mouseMove)]
pub fn mouse_move(pos_js: JsValue) -> Result<JsValue, JsValue> {
    // Extends selection from anchor to current position
    doc.state.selection_manager.extend_selection(&clamped_pos);
    // Returns EditorDiff
}

#[wasm_bindgen(js_name = mouseUp)]
pub fn mouse_up(pos_js: JsValue) -> Result<JsValue, JsValue> {
    // Finalizes selection
    doc.state.selection_manager.extend_selection(&clamped_pos);
    // Returns EditorDiff
}
```

#### Selection Manager
Uses anchor/head model:
- **anchor**: Fixed point where selection started
- **head**: Moving point (current cursor position)

Maintains:
- `desired_col`: Y-coordinate memory for multi-line navigation
- `is_forward`: Direction of selection (anchor <= head)

### JavaScript Level

**Location**: `/home/john/editor/src/js/editor.js` (lines 800-843, 1100-1254)

#### Selection Storage Structure
```javascript
document.state.selection = {
  // WASM model (anchor/head)
  anchor: { line: 0, col: 5 },
  head: { line: 0, col: 10 },
  
  // Normalized bounds
  start: { line: 0, col: 5 },        // min(anchor, head)
  end: { line: 0, col: 10 },         // max(anchor, head)
  
  // Metadata
  is_empty: boolean,
  is_forward: boolean,
  active: boolean,
  
  // Legacy (backward compatibility)
  startStopIndex: number,
  endStopIndex: number,
}
```

#### Key Methods

**`updateCursorFromWASM(diff)`** (lines 800-843)
- Receives EditorDiff from WASM
- Copies selection from diff to document state
- Triggers visual update

**`initializeSelection(startCellIndex, endCellIndex)`** (lines 1105-1138)
- Used by double-click handler
- Converts cell indices to stop indices
- Stores normalized selection

**`updateSelectionDisplay()`** (lines 1237-1254)
- Clears previous 'selected' CSS classes
- Calls `renderSelectionVisual()` to add new ones

**`renderSelectionVisual(selection)`** (lines 1260-1292)
- Iterates through DOM cells
- Adds 'selected' class to cells in range
- Works with normalized start.col to end.col

### Selection Flow Comparison

**Drag Selection** (mouseDown/Up):
```
Browser: mousedown → WASM: mouseDown() → JS: updateCursorFromWASM()
         mousemove → WASM: mouseMove() → JS: updateCursorFromWASM()
         mouseup   → WASM: mouseUp()   → JS: updateCursorFromWASM()
```

**Double-Click Selection** (direct JS):
```
Browser: dblclick → JS: handleDoubleClick()
                   → JS: selectBeatOrCharGroup()
                   → JS: initializeSelection()
                   → JS: updateSelectionDisplay()
```

**Note**: Double-click does NOT go through WASM - it's pure JavaScript.

---

## 3. Beat Structure in Document Model

### Data Structure: BeatSpan

**Location**: `/home/john/editor/src/models/notation.rs` (lines 10-75)

```rust
#[wasm_bindgen]
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct BeatSpan {
    pub start: usize,           // Starting column index (inclusive)
    pub end: usize,             // Ending column index (inclusive)
    pub duration: f32,          // Duration in relative units
    pub visual: BeatVisual,     // Rendering config
}

#[wasm_bindgen]
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
pub struct BeatVisual {
    pub loop_offset_px: f32,    // SVG arc offset
    pub loop_height_px: f32,    // SVG arc height
    pub draw_single_cell: bool, // Render single-cell beats
}
```

### Storage in Line

```rust
pub struct Line {
    pub cells: Vec<Cell>,
    
    // Derived beat spans (calculated at render time, NOT persisted)
    #[serde(skip)]
    pub beats: Vec<BeatSpan>,
}
```

**Critical**: Beats are **ephemeral** - recalculated every time the line is rendered.

### Beat Derivation Algorithm

**Location**: `/home/john/editor/src/parse/beats.rs` (lines 65-125)

**Method**: `extract_implicit_beats(cells: &[Cell]) -> Vec<BeatSpan>`

```rust
pub fn extract_implicit_beats(&self, cells: &[Cell]) -> Vec<BeatSpan> {
    let mut beats = Vec::new();
    let mut beat_start = None;
    let mut beat_end = None;
    
    for (index, cell) in cells.iter().enumerate() {
        // SKIP rhythm-transparent cells (ornaments)
        if cell.is_rhythm_transparent() {
            continue;
        }
        
        let is_beat = self.is_beat_element(cell);
        
        if is_beat {
            // Collect beat elements
            if beat_start.is_none() {
                beat_start = Some(index);
            }
            beat_end = Some(index);
        } else {
            // Non-beat separates beats
            if let (Some(start), Some(end)) = (beat_start, beat_end) {
                beats.push(BeatSpan::new(start, end, 1.0));
            }
            beat_start = None;
            beat_end = None;
        }
    }
    
    // Handle trailing beat
    if let (Some(start), Some(end)) = (beat_start, beat_end) {
        beats.push(BeatSpan::new(start, end, 1.0));
    }
    
    beats
}

fn is_beat_element(&self, cell: &Cell) -> bool {
    matches!(
        cell.kind,
        ElementKind::PitchedElement
        | ElementKind::UnpitchedElement
        | ElementKind::BreathMark
    )
}
```

**Key Points**:
1. Rhythm-transparent cells (ornaments) are **skipped completely**
2. Beat elements: pitched notes, unpitched elements, breath marks
3. Consecutive beat elements form one beat span
4. Any non-beat separates beats

**Example**:
```
Input cells:  N - - r S b b G |
              ↑         ↑ ↑ ↑
              beat1     beat2
Output beats: [BeatSpan(0,3), BeatSpan(5,7)]
```

### CSS Class Markers

**Location**: `/home/john/editor/src/renderers/layout_engine.rs` (lines 623-633)

When rendering, cells are marked with beat roles:

```rust
for i in first_idx..=last_idx {
    let role = if i == first_idx {
        "beat-loop-first"      // First cell in beat
    } else if i == last_idx {
        "beat-loop-last"       // Last cell in beat
    } else {
        "beat-loop-middle"     // Middle cells
    };
    
    cell_classes.push(role);
}
```

**Purpose**: Visual rendering
- Beat loops rendered as SVG arcs above staff
- First and last cells define arc endpoints
- Middle cells are part of same arc

---

## 4. Mouse Event Handlers Architecture

### JavaScript Layer

**Location**: `/home/john/editor/src/js/handlers/MouseHandler.js`

#### Handler Methods

1. **`handleMouseDown(event)`** (lines 22-58)
   - Sets drag flag: `editor.isDragging = true`
   - Calls WASM: `wasmModule.mouseDown(pos)`
   - Updates cursor from returned diff

2. **`handleMouseMove(event)`** (lines 64-94)
   - Only if `isDragging === true`
   - Calls WASM: `wasmModule.mouseMove(pos)`
   - Updates cursor from returned diff

3. **`handleMouseUp(event)`** (lines 100-141)
   - Calls WASM: `wasmModule.mouseUp(pos)`
   - Sets `justDragSelected = true` flag (prevents click clearing selection)
   - Clears drag state after 100ms delay

4. **`handleCanvasClick(event)`** (lines 269-288)
   - Direct cursor positioning (no WASM call)
   - Used when not dragging

5. **`handleDoubleClick(event)`** (lines 147-159)
   - Beat/character selection (detailed in Section 1)

#### Cell Position Calculation

**Method**: `calculateCellPosition(x, y) -> number`

```javascript
calculateCellPosition(x, y) {
    // 1. Determine which line
    const lineIndex = this.calculateLineFromY(y);
    
    // 2. Get all char-cell elements
    const allCellElements = lineContainer.querySelectorAll('.char-cell');
    
    // 3. FILTER: Remove ornament cells in normal mode
    const navigableCellElements = Array.from(allCellElements).filter(cellElement => {
        if (editMode || !line) return true;
        const cellIndex = parseInt(cellElement.getAttribute('data-cell-index'), 10);
        const cell = line.cells[cellIndex];
        // Skip ornament cells
        if (cell && cell.ornament_indicator && cell.ornament_indicator.name !== 'none') {
            return false;
        }
        return true;
    });
    
    // 4. Measure actual rendered positions from DOM
    const cursorPositions = [];
    cursorPositions.push(firstCell.left - editorRect.left);  // Position 0
    for (const cell of navigableCellElements) {
        cursorPositions.push(cell.right - editorRect.left);  // Positions 1..N
    }
    
    // 5. Find which cell the X coordinate falls in
    for (let i = 0; i < navigableCellElements.length; i++) {
        const leftBoundary = cursorPositions[i];
        const rightBoundary = cursorPositions[i + 1];
        
        if (x >= leftBoundary && x < rightBoundary) {
            // Determine left or right half
            const cellMidpoint = (leftBoundary + rightBoundary) / 2;
            if (x >= cellMidpoint) {
                // Right half: cursor after this cell
                return i + 1;
            } else {
                // Left half: cursor before this cell
                return i;
            }
        }
    }
    
    return cursorPositions.length;  // Right edge
}
```

**Returns**: Stop index (not cell index)
- Stop 0: before first cell
- Stop 1: after first cell
- Stop N: after Nth cell

### WASM Layer

**Location**: `/home/john/editor/src/api/core.rs` (lines 2425-2490)

#### Document Storage
```rust
lazy_static! {
    static ref DOCUMENT: Mutex<Option<Document>> = Mutex::new(None);
}
```

**Always**:
1. Lock document mutex
2. Get mutable reference
3. Clamp position to valid bounds
4. Perform operation (mouseDown/Move/Up)
5. Return EditorDiff

#### Operations

**mouseDown**: Clear selection, start new at position
```rust
doc.state.selection_manager.clear_selection();
doc.state.selection_manager.start_selection(clamped_pos);
doc.state.selection_manager.desired_col = clamped_pos.col;
```

**mouseMove**: Extend selection to position
```rust
doc.state.selection_manager.extend_selection(&clamped_pos);
doc.state.selection_manager.desired_col = clamped_pos.col;
```

**mouseUp**: Finalize selection
```rust
doc.state.selection_manager.extend_selection(&clamped_pos);
doc.state.selection_manager.desired_col = clamped_pos.col;
```

**Return**: EditorDiff
```rust
pub struct EditorDiff {
    pub caret: CaretInfo,           // Current cursor info
    pub selection: Option<SelectionInfo>,  // Current selection
    pub changed_staves: Vec<usize>, // Which lines changed
}
```

---

## 5. Key Data Structures

### Cell Model
**Location**: `/home/john/editor/src/models/core.rs` (lines 14-70)

```rust
pub struct Cell {
    pub char: String,                    // Single visible character
    pub kind: ElementKind,               // Type: Pitched, Unpitched, Text, etc.
    pub continuation: bool,              // True if continuation (e.g., "#" after note)
    pub col: usize,                      // Physical column in line
    pub flags: u8,                       // Bit flags (selection, focus)
    pub pitch_code: Option<PitchCode>,   // Canonical pitch
    pub pitch_system: Option<PitchSystem>,
    pub octave: i8,                      // -1, 0, 1
    pub slur_indicator: SlurIndicator,
    pub ornament_indicator: OrnamentIndicator,
    pub ornaments: Vec<Ornament>,
    
    // Layout cache (ephemeral, not saved)
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
    pub bbox: (f32, f32, f32, f32),
    pub hit: (f32, f32, f32, f32),
}
```

### Position Types
**Location**: `/home/john/editor/src/models/notation.rs`

```rust
#[wasm_bindgen]
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub struct Pos {
    pub line: usize,    // Line index
    pub col: usize,     // Column index (0-based)
}

#[wasm_bindgen]
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Selection {
    pub anchor: Pos,    // Fixed point where selection started
    pub head: Pos,      // Moving point (cursor during selection)
}
```

---

## 6. Architecture Recommendations

### Current Problem
Double-click selection uses **DOM scanning** (Branch 1) which is:
- Fragile (depends on render order)
- Not testable
- Tight coupling to rendering
- Duplicate logic (WASM already knows beat structure)

### Recommended Solution
Move beat selection to WASM:

**Add WASM function**:
```rust
#[wasm_bindgen(js_name = selectBeatAtPosition)]
pub fn select_beat_at_position(pos_js: JsValue) -> Result<SelectionInfo, JsValue> {
    // Load document
    // Find beat containing position
    // Return normalized selection
}
```

**Benefits**:
- Testable with Rust unit tests
- Deterministic behavior
- Reusable for other features
- Better separation of concerns
- Works for all beat types automatically

**JavaScript changes** (minimal):
```javascript
handleDoubleClick(event) {
    // ... calculate cell position ...
    
    // Call WASM instead of DOM scanning
    const selection = this.editor.wasmModule.selectBeatAtPosition(pos);
    this.editor.initializeSelection(selection.start.col, selection.end.col + 1);
    this.editor.updateSelectionDisplay();
}
```

---

## 7. Summary Table

| Component | Location | Language | Purpose |
|-----------|----------|----------|---------|
| **Double-click handler** | MouseHandler.handleDoubleClick() | JS | Event capture |
| **Beat selection logic** | MouseHandler.selectBeatOrCharGroup() | JS | DOM-based detection |
| **Character selection** | MouseHandler.selectBeatOrCharGroup() | JS | Model-based detection |
| **Cell position calc** | MouseHandler.calculateCellPosition() | JS | Hit testing |
| **Beat derivation** | BeatDeriver.extract_implicit_beats() | Rust | Beat span calculation |
| **Beat storage** | Line.beats | Model | Ephemeral cache |
| **CSS marking** | layout_engine.rs | Rust | beat-loop-* classes |
| **Selection state** | document.state.selection | JS | Storage |
| **WASM selection** | SelectionManager | Rust | Anchor/head model |
| **Mouse down/move/up** | api/core.rs | Rust | Drag selection |
| **Visual update** | Editor.updateSelectionDisplay() | JS | DOM update |

---

## 8. Testing Opportunities

### Unit Tests (Rust)
```rust
#[test]
fn test_extract_beats_skips_ornaments() {
    let cells = vec![
        Cell::new("C".to_string(), ElementKind::PitchedElement, 0),
        Cell::new("[".to_string(), ElementKind::OrnamentStart, 1),
        Cell::new("g".to_string(), ElementKind::PitchedElement, 2), // ornament
        Cell::new("]".to_string(), ElementKind::OrnamentEnd, 3),
        Cell::new("D".to_string(), ElementKind::PitchedElement, 4),
    ];
    
    let beats = BeatDeriver::new().extract_implicit_beats(&cells);
    assert_eq!(beats.len(), 2);  // Should be 2 beats (C and D)
}

#[test]
fn test_select_beat_at_position() {
    let selection = select_beat_at_position(Pos::new(0, 2));
    assert_eq!(selection.start.col, 0);
    assert_eq!(selection.end.col, 4);
}
```

### E2E Tests (Playwright)
```javascript
test('double-click selects entire beat', async ({ page }) => {
    await typeInEditor(page, 'C-r D');
    
    // Double-click on cell in first beat
    const firstCell = page.locator('[data-cell-index="0"]');
    await firstCell.dblclick();
    
    // Check that all cells in beat are selected
    const selected = await page.locator('.selected').count();
    expect(selected).toBe(3);  // C, -, r
});
```

---

## 9. Files to Modify for New Features

### For WASM-based beat selection:
- `src/api/core.rs` - Add `select_beat_at_position()` function
- `src/js/handlers/MouseHandler.js` - Modify `selectBeatOrCharGroup()`
- `src/js/editor.js` - Ensure WASM wrapper includes new function (lines 64-101)

### For multi-line selection:
- `src/models/notation.rs` - Extend Selection::contains()
- `src/js/editor.js` - Update renderSelectionVisual() for multiple lines

### For ornament selection:
- `src/api/core.rs` - Add `select_ornament_at_position()`
- `src/js/handlers/MouseHandler.js` - Conditional logic for ornament cells

---

## References

- `/home/john/editor/CLAUDE.md` - WASM-first architecture guidelines
- `/home/john/editor/RHYTHM.md` - Spatial rhythmic notation system
- `/home/john/editor/src/parse/beats.rs` - Beat derivation algorithm
- `/home/john/editor/src/models/notation.rs` - Data structures
- `/home/john/editor/src/js/handlers/MouseHandler.js` - Event handlers

