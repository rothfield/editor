# Selection Implementation Flow Diagrams

## Keyboard Selection Flow (Shift+Arrow)

```
User presses Shift+Right Arrow
    |
    v
document.addEventListener('keydown')
    |
    v
EventManager.handleGlobalKeyDown(event)
    |
    +-- Check if editor has focus
    |
    v
editor.handleKeyboardEvent(event)
    |
    +-- Check if Shift+Arrow combination
    |
    v
editor.handleShiftCommand('ArrowRight')
    |
    v
editor.extendSelectionRight()
    |
    +-- Get current cursor position
    |
    +-- Get current selection (or create new one)
    |
    +-- Determine if extending from start or end
    |
    +-- Call initializeSelection(start, newEnd)
    |
    +-- setCursorPosition(newEnd)
    |
    v
editor.updateSelectionDisplay()
    |
    +-- clearSelectionVisual() - remove 'selected' class from all cells
    |
    +-- renderSelectionVisual(selection) - add 'selected' class to cells
    |
    v
DOM updated with visual selection
    |
    v
updateDocumentDisplay() - updates debug panel
```

### Data Flow

```
document.state.selection = {
  start: 0,      // Cell index where selection starts
  end: 3,        // Cell index where selection ends (exclusive)
  active: true
}

Cells [0, 1, 2] are visually highlighted with 'selected' class
Cursor is positioned at cell 3
```

---

## Mouse Selection Flow (STUB - Not Connected)

```
User clicks and drags on cells
    |
    v
span.addEventListener('mousedown') [WOULD trigger]
    |
    +-- Only click event is currently wired (in renderer.js)
    |
    +-- Would need to call:
    |   editor.handleMouseDown(event)
    |
    v
(NOT CURRENTLY IMPLEMENTED)
Would set:
  this.isDragging = true
  this.dragStartPos = cellPosition
  this.dragEndPos = cellPosition
    |
    v
document.addEventListener('mousemove') [NOT WIRED]
    |
    +-- Would call:
    |   editor.handleMouseMove(event)
    |
    +-- If isDragging is true:
    |   - Calculate new cell position from mouse coordinates
    |   - Update dragEndPos
    |   - Call initializeSelection(dragStartPos, dragEndPos)
    |   - Call updateSelectionDisplay()
    |
    v
document.addEventListener('mouseup') [NOT WIRED]
    |
    +-- Would call:
    |   editor.handleMouseUp(event)
    |
    +-- Finalize selection
    |
    +-- Set isDragging = false
    |
    v
Selection remains in document.state.selection
```

---

## Current Mouse Behavior (Click Only)

```
User clicks on a cell
    |
    v
span.addEventListener('click') [CURRENTLY WIRED in renderer.js]
    |
    v
renderer.handleCellClick(cell, event)
    |
    +-- Call editor.setCursorPosition(charCell.col)
    |
    v
cursor.column = cellIndex
    |
    v
Cursor visual updated
Selection is NOT created (click doesn't start drag)
```

---

## Position Conversion Chain

```
Pixel X coordinate
    |
    v
calculateCellPosition(x, y)
    |
    +-- Find closest cursor position in DisplayList
    |
    v
Cell Index (0, 1, 2, ...)
    |
    v
Can be used for:
    |
    +-- selection.start / selection.end
    |   |
    |   v
    |   Used in renderSelectionVisual() to find cells to highlight
    |
    +-- setCursorPosition()
    |   |
    |   v
    |   Stored in document.state.cursor.column
    |
    +-- cellIndexToCharPos() if needed
        |
        v
        Character position (0, 1, 2, ...)
        |
        v
        Can be used for:
        |
        +-- WASM API calls (some expect cell index, some char position)
```

---

## Selection State Machine

```
                    +-----------+
                    |   START   |
                    | selection |
                    |  = null   |
                    +-----------+
                           |
                           | User presses Shift+Arrow
                           |
                           v
                    +-----------+
                    | SELECTING |
                    | start/end |
                    | assigned  |
                    +-----------+
                     |         ^
                     |         |
  Shift+Arrow key    |         | Shift+Arrow key
  extends range      |         | extends range
  (keeps extending)  |         |
                     v         |
                    +-----------+
                    | EXTENDED  |
                    | different |
                    | start/end |
                    +-----------+
                           |
                           | Plain arrow key (no Shift)
                           |
                           v
                    +-----------+
                    |   CLEARED |
                    | selection |
                    |  = null   |
                    +-----------+
```

---

## Key Method Relationships

```
initializeSelection(start, end)
    |
    +-- Sets document.state.selection
    +-- Normalizes: min(start,end) and max(start,end)
    +-- Sets active: true

getSelection()
    |
    +-- Returns document.state.selection or null

hasSelection()
    |
    +-- Returns !!selection.active

clearSelection()
    |
    +-- Sets document.state.selection = null
    +-- Calls clearSelectionVisual()
    +-- Calls updateDocumentDisplay()

getSelectedText()
    |
    +-- Filters cells[start..end]
    +-- Concatenates cell.char values

updateSelectionDisplay()
    |
    +-- Calls clearSelectionVisual()
    +-- Calls renderSelectionVisual()
    +-- Calls updateDocumentDisplay()

renderSelectionVisual(selection)
    |
    +-- Finds each cell in range
    +-- Adds 'selected' class to DOM elements

clearSelectionVisual()
    |
    +-- Finds all .selected cells
    +-- Removes 'selected' class
```

---

## Event Routing Chain

```
Global Browser Events
    |
    +-- keydown
    |   |
    |   v
    |   EventManager.handleGlobalKeyDown() (events.js)
    |   |
    |   +-- Route to editor.handleKeyboardEvent()
    |       |
    |       v
    |       Check if Shift+Arrow -> handleShiftCommand()
    |       |
    |       v
    |       extendSelectionLeft/Right/Up/Down/ToStart/ToEnd()
    |
    +-- click [WIRED]
    |   |
    |   v
    |   renderer.handleCellClick() (renderer.js)
    |   |
    |   v
    |   editor.setCursorPosition()
    |
    +-- mousedown [NOT WIRED to editor]
    |   (Would go to handleMouseDown)
    |
    +-- mousemove [NOT WIRED to editor]
    |   (Would go to handleMouseMove)
    |
    +-- mouseup [NOT WIRED to editor]
        (Would go to handleMouseUp)
```

---

## CSS Classes for Selection Visualization

```
.selected
    |
    +-- Applied to span.char-cell elements
    |
    +-- Indicates cell is part of active selection
    |
    +-- CSS styling not shown in provided code
    |
    v
Could be styled like:
    .selected {
      background-color: #e0e7ff;  /* Light blue */
      border-bottom: 2px solid #4f46e5;  /* Blue underline */
    }

Other cell classes:
    .char-cell           - All cells
    .beat-first          - First cell of beat group
    .beat-middle         - Middle cell of beat group
    .beat-last           - Last cell of beat group
    .slur-first          - First cell with slur
    .slur-middle         - Middle cell with slur
    .slur-last           - Last cell with slur
    [data-octave="1"]    - Upper octave marker
    [data-octave="-1"]   - Lower octave marker
```

---

## DisplayList Structure (Used for Positioning)

```
displayList
    |
    +-- lines[0]
    |   |
    |   +-- cells[0]
    |   |   |
    |   |   +-- cursor_left: number    (pixel X position before this cell)
    |   |   +-- cursor_right: number   (pixel X position after this cell)
    |   |   +-- x: number              (pixel X of cell content)
    |   |   +-- y: number              (pixel Y of cell content)
    |   |   +-- w: number              (cell width in pixels)
    |   |   +-- h: number              (cell height in pixels)
    |   |   +-- char: string           (the glyph)
    |   |   +-- classes: string[]      (CSS classes)
    |   |   +-- dataset: Object        (data attributes)
    |   |
    |   +-- cells[1]
    |   |   ... (similar structure)
    |   |
    |   +-- height: number
    |   +-- line_index: number
    |   +-- label: string (optional)
    |   +-- lyrics: Array
    |   +-- tala: Array
```

Used by:
- `calculateCellPosition()` to map pixel coordinates to cell indices
- `charPosToPixel()` to map character positions to pixel coordinates
- `renderFromDisplayList()` to render cells with pre-calculated positions

