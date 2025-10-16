# Music Editor: Mouse Selection vs Keyboard Selection Analysis

## Executive Summary

The music editor has **two different selection mechanisms** that operate very differently:

1. **Keyboard Selection (Shift+Arrow)**: Cell-based, working with cursor positions and explicitly tracked selection ranges
2. **Mouse Selection**: **PARTIALLY IMPLEMENTED** - handlers exist but are not wired up to the DOM; mouse clicks currently only position the cursor

---

## 1. KEYBOARD SELECTION (Shift+Arrow Keys)

### Entry Point
**File**: `/home/john/editor/src/js/editor.js`

### Flow
```
EventManager.handleGlobalKeyDown() 
  → editor.handleKeyboardEvent(event)
  → handleShiftCommand(key)  [if Shift+ArrowKey detected]
  → extendSelectionLeft/Right/Up/Down/ToStart/ToEnd()
  → updateSelectionDisplay()
```

### Data Structure
Selection is stored in `document.state.selection`:
```javascript
{
  start: number,    // Starting cell index (0-based)
  end: number,      // Ending cell index (exclusive, like array slice)
  active: boolean   // Whether selection is currently active
}
```

### Key Methods

#### `handleShiftCommand(key)` (Lines 778-825)
- Detects Shift+arrow combinations
- Routes to appropriate extend methods
- Calls `updateSelectionDisplay()` to render selection

#### `extendSelectionLeft()` (Lines 1166-1188)
```javascript
extendSelectionLeft() {
  const currentCellIndex = this.getCursorPosition();
  let selection = this.getSelection();
  
  if (!selection) {
    // Start new selection
    this.initializeSelection(currentCellIndex, currentCellIndex);
    selection = this.getSelection();
  }
  
  if (currentCellIndex > 0) {
    const newIndex = currentCellIndex - 1;
    // Extend from current direction
    if (currentCellIndex === selection.end) {
      // Extending from end
      this.initializeSelection(newIndex, selection.end);
    } else {
      // Extending from start
      this.initializeSelection(newIndex, selection.end);
    }
    this.setCursorPosition(newIndex);
  }
}
```

#### `extendSelectionRight()` (Lines 1193-1229)
- Similar logic but extends in opposite direction
- Checks `currentCellIndex === selection.start` to determine extension direction
- Updates cursor to new position

#### Selection Visualization (Lines 1305-1325)
```javascript
renderSelectionVisual(selection) {
  // Find line element
  const lineElement = this.renderer.element.querySelector(`[data-line="0"]`);
  
  // Add 'selected' class to all cells in range
  for (let i = selection.start; i < selection.end; i++) {
    const cellElement = lineElement.querySelector(`[data-cell-index="${i}"]`);
    if (cellElement) {
      cellElement.classList.add('selected');
    }
  }
}
```

### CSS for Visual Selection
The `selected` class highlighting is NOT shown in the grep results, but cells are marked with this class.

---

## 2. MOUSE SELECTION

### Current State: STUB IMPLEMENTATION ONLY

Mouse event handlers exist but are **NOT connected to the actual mouse events**.

### Files Involved
- `/home/john/editor/src/js/editor.js`: Contains handler methods
- `/home/john/editor/src/js/renderer.js`: Cell click handler
- `/home/john/editor/src/js/events.js`: Global event manager

### Handler Methods (Lines 1975-2024)

#### `handleMouseDown(event)` (Lines 1975-1979)
```javascript
handleMouseDown(event) {
  // Just focus the editor for now
  this.element.focus();
  event.preventDefault();
}
```
**Note**: Does NOT initiate selection! Just focuses editor.

#### `handleMouseMove(event)` (Lines 1984-2004)
```javascript
handleMouseMove(event) {
  if (!this.isDragging) return;  // Early exit if not dragging
  
  const rect = this.element.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  
  const cellPosition = this.calculateCellPosition(x, y);
  
  if (cellPosition !== null) {
    this.dragEndPos = cellPosition;
    
    // Update selection range
    this.initializeSelection(this.dragStartPos, cellPosition);
    this.setCursorPosition(cellPosition);
    this.updateSelectionDisplay();
    
    event.preventDefault();
  }
}
```
**Note**: Needs `this.isDragging` to be true (never set).

#### `handleMouseUp(event)` (Lines 2009-2024)
```javascript
handleMouseUp(event) {
  if (this.isDragging) {
    // Finalize selection before clearing isDragging flag
    if (this.dragStartPos !== this.dragEndPos) {
      this.initializeSelection(this.dragStartPos, this.dragEndPos);
      this.updateSelectionDisplay();
    }
    
    // Delay clearing the dragging flag to prevent click event from clearing selection
    setTimeout(() => {
      this.isDragging = false;
      this.dragStartPos = null;
      this.dragEndPos = null;
    }, 10);
  }
}
```

#### `calculateCellPosition(x, y)` (Lines 2047-2089)
```javascript
calculateCellPosition(x, y) {
  // Uses DisplayList for accurate cursor positioning
  if (!this.renderer || !this.renderer.displayList) {
    console.warn('DisplayList not available, using fallback');
    return 0;
  }
  
  const displayList = this.renderer.displayList;
  const firstLine = displayList.lines && displayList.lines[0];
  
  if (!firstLine || !firstLine.cells || firstLine.cells.length === 0) {
    return 0;
  }
  
  // Build cursor positions array
  const cursorPositions = [];
  cursorPositions.push(firstLine.cells[0].cursor_left);
  
  for (const cell of firstLine.cells) {
    cursorPositions.push(cell.cursor_right);
  }
  
  // Find closest position to click
  let closestIndex = 0;
  let minDistance = Math.abs(x - cursorPositions[0]);
  
  for (let i = 1; i < cursorPositions.length; i++) {
    const distance = Math.abs(x - cursorPositions[i]);
    if (distance < minDistance) {
      minDistance = distance;
      closestIndex = i;
    }
  }
  
  return closestIndex;
}
```

### Cell Click Handler (Lines 632-639, in renderer.js)
```javascript
handleCellClick(charCell, event) {
  console.log('Cell clicked:', charCell);
  
  // Update cursor position
  if (window.musicEditor) {
    window.musicEditor.setCursorPosition(charCell.col);
  }
}
```
**Current behavior**: Click sets cursor position only, does NOT start selection drag.

### Renderer Click Listener (renderer.js, Lines 564-567)
```javascript
span.addEventListener('click', (e) => {
  e.stopPropagation();
  this.handleCellClick(cell, e);
});
```

---

## 3. KEY DIFFERENCES

| Aspect | Keyboard Selection | Mouse Selection |
|--------|-------------------|-----------------|
| **Status** | Fully Implemented | Stub Only |
| **Trigger** | Shift+Arrow keys | Mouse down/drag/up |
| **Unit** | Cell indices | Pixel coordinates |
| **Selection Start** | `initializeSelection()` | `this.dragStartPos` (never set) |
| **Visual Feedback** | CSS class 'selected' on cells | Would highlight cells in range |
| **Cursor Movement** | Explicit via `setCursorPosition()` | Track mouse position |
| **Data Structure** | `document.state.selection` | `this.isDragging`, `dragStartPos`, `dragEndPos` |
| **Wired to Events** | Yes (EventManager routes) | No (handlers exist but not connected) |

---

## 4. MISSING MOUSE SELECTION IMPLEMENTATION

### What's NOT Wired Up

1. **No mousedown listener**: The `handleMouseDown()` method exists but is never called
2. **No mousemove listener**: The `handleMouseMove()` method exists but is never called
3. **No mouseup listener**: The `handleMouseUp()` method exists but is never called
4. **No initial drag start**: `this.isDragging` is never set to true
5. **No drag tracking**: `dragStartPos` and `dragEndPos` are never initialized

### What Would Need to Happen

To enable mouse selection, the editor needs:

```javascript
// In setupEventHandlers() or similar:
this.element.addEventListener('mousedown', (event) => {
  if (event.target.closest('[data-cell-index]')) {
    const cellPosition = calculateCellPosition(event.clientX - rect.left, event.clientY - rect.top);
    this.isDragging = true;
    this.dragStartPos = cellPosition;
    this.dragEndPos = cellPosition;
  }
});

document.addEventListener('mousemove', this.handleMouseMove.bind(this));
document.addEventListener('mouseup', this.handleMouseUp.bind(this));
```

---

## 5. CURSOR POSITIONING

Both selection methods use the same position conversion system:

### Character Position (Logical)
- 0-based index into the character sequence
- Works across cells (e.g., a 2-character cell like "1#" has positions 0 and 1)

### Cell Index (Logical)
- 0-based index into the cells array
- Used for selection `start` and `end`

### Pixel Position (Visual)
- X coordinate in pixels on screen
- Used for DisplayList cursor positioning

### Conversion Functions
- `charPosToCellIndex(charPos)`: Character position → Cell index + offset
- `cellIndexToCharPos(cellIndex)`: Cell index → Character position
- `charPosToPixel(charPos)`: Character position → Pixel X coordinate
- `calculateCellPosition(x, y)`: Pixel coordinates → Closest cell index

---

## 6. SELECTION STATE IN DOCUMENT

Selection is stored alongside other ephemeral (non-persistent) state:

```javascript
document.state = {
  cursor: { stave: 0, column: 0 },
  selection: null,  // null or { start, end, active }
  has_focus: false
}
```

### Selection Lifecycle

**Initialization** (when first key pressed):
```javascript
initializeSelection(startPos, endPos) {
  this.theDocument.state.selection = {
    start: Math.min(startPos, endPos),
    end: Math.max(startPos, endPos),
    active: true
  };
}
```

**Clearing** (when navigation without Shift occurs):
```javascript
clearSelection() {
  if (this.theDocument && this.theDocument.state) {
    this.theDocument.state.selection = null;
  }
  this.clearSelectionVisual();
  this.updateDocumentDisplay();
}
```

---

## 7. INTEGRATION WITH COMMANDS

Selection is used by musical notation commands:

### Command Validation
```javascript
validateSelectionForCommands() {
  if (!this.hasSelection()) return false;
  
  const selection = this.getSelection();
  if (selection.start >= selection.end) return false;
  
  const selectedText = this.getSelectedText();
  if (!selectedText || selectedText.trim().length === 0) return false;
  
  return true;
}
```

### Musical Commands Using Selection
- `applySlur()`: Applies to `selection.start` to `selection.end`
- `applyOctave()`: Applies to `selection.start` to `selection.end`
- `replaceSelectedText()`: Deletes range, inserts new text
- `deleteSelection()`: Deletes `selection.start` to `selection.end`

---

## 8. IMPLEMENTATION RECOMMENDATIONS

### For Mouse Selection
1. Add mousedown listener to detect drag start
2. Set `this.isDragging = true` and initialize `dragStartPos`
3. Wire mousemove/mouseup to document listeners (already bound)
4. Use `calculateCellPosition()` to convert pixel to cell coordinates
5. Use same `initializeSelection()` method for consistency

### For Better Selection UX
1. Add visual feedback during mouse drag (e.g., cursor changes to text-select)
2. Add keyboard modifiers (Shift+click to extend, Ctrl+A for select all)
3. Add auto-scroll when dragging near viewport edges
4. Consider multi-line selection (currently only supports main line)

### Unified Selection Model
Both mechanisms should:
- Use same `document.state.selection` structure
- Call same `initializeSelection()` method
- Use same `updateSelectionDisplay()` for rendering
- Use same `getSelection()` for querying

---

## 9. RELATED CODE FILES

- `/home/john/editor/src/js/editor.js` - Main selection implementation
- `/home/john/editor/src/js/renderer.js` - Cell rendering and hover
- `/home/john/editor/src/js/events.js` - Global keyboard event routing
- `/home/john/editor/src/js/main.js` - App initialization and wiring
- `/home/john/editor/src/js/keyboard-handler.js` - Keyboard shortcuts (unused)

