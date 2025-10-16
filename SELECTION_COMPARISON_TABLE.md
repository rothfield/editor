# Keyboard vs Mouse Selection - Comparison Table

## Implementation Status

| Feature | Keyboard (Shift+Arrow) | Mouse (Click+Drag) | Notes |
|---------|----------------------|-------------------|-------|
| **Status** | FULLY IMPLEMENTED | STUB - NOT WIRED | Handlers exist but disconnected |
| **Event Handler** | EventManager.handleGlobalKeyDown() | handleMouseDown/Move/Up() | Mouse handlers not called |
| **Trigger** | Shift+ArrowKey | Click + Drag | Mouse drag not implemented |
| **Wiring** | Connected via EventManager | Not connected to DOM | Needs addEventListener() calls |

---

## Event Flow Comparison

### Keyboard Selection (WORKING)
```
Browser keydown event
    ↓
document.addEventListener('keydown') ✓
    ↓
EventManager.handleGlobalKeyDown() ✓
    ↓
editor.handleKeyboardEvent() ✓
    ↓
handleShiftCommand(key) ✓ [if Shift+Arrow detected]
    ↓
extendSelectionLeft/Right/Up/Down() ✓
    ↓
initializeSelection(start, end) ✓
    ↓
updateSelectionDisplay() ✓
    ↓
DOM updated with 'selected' class ✓
```

### Mouse Selection (NOT WIRED)
```
Browser mousedown/mousemove/mouseup events
    ↓
document.addEventListener('mousedown') ✗ NOT CONNECTED
document.addEventListener('mousemove') ✗ NOT CONNECTED
document.addEventListener('mouseup') ✗ NOT CONNECTED
    ↓
handleMouseDown/Move/Up() ✗ NEVER CALLED
    ↓
initializeSelection(start, end) ✗ NOT EXECUTED
    ↓
updateSelectionDisplay() ✗ NOT EXECUTED
    ↓
Selection NOT created ✗
```

---

## Data Structure Comparison

### Keyboard Selection
```javascript
// INPUT
Shift+Right Arrow key

// STATE UPDATE
document.state.selection = {
  start: 0,
  end: 3,
  active: true
}

// TRACKING
isDragging: not used
dragStartPos: not used
dragEndPos: not used

// CURSOR
document.state.cursor.column = 3

// OUTPUT
Cells 0-2 highlighted
Cursor at position 3
```

### Mouse Selection (Intended)
```javascript
// INPUT
Mouse click at pixel 150, drag to pixel 200

// STATE UPDATE
document.state.selection = {
  start: 2,      // from calculateCellPosition(pixel 150)
  end: 5,        // from calculateCellPosition(pixel 200)
  active: true
}

// TRACKING
isDragging: true
dragStartPos: 2
dragEndPos: 5

// CURSOR
document.state.cursor.column = 5

// OUTPUT
Cells 2-4 highlighted
Cursor at position 5
```

---

## Position Handling

| Type | Keyboard | Mouse | Uses |
|------|----------|-------|------|
| **Cell Index** | Direct (from cursor) | Calculated via calculateCellPosition() | Selection boundaries |
| **Character Position** | Used for cursor column | Converted to cell index | Cursor tracking |
| **Pixel Coordinates** | Not used | Mouse event clientX/clientY | Click detection |
| **DisplayList** | Used for rendering only | Used for coordinate conversion | Position calculation |

---

## Code Locations

### Keyboard Selection Code

| Method | File | Lines | Purpose |
|--------|------|-------|---------|
| handleShiftCommand() | editor.js | 778-825 | Route Shift+key to extension methods |
| extendSelectionLeft() | editor.js | 1166-1188 | Extend left from either end |
| extendSelectionRight() | editor.js | 1193-1229 | Extend right from either end |
| extendSelectionUp() | editor.js | 1234-1237 | Extend up (not implemented, stays on main line) |
| extendSelectionDown() | editor.js | 1242-1245 | Extend down (not implemented, stays on main line) |
| extendSelectionToStart() | editor.js | 1250-1262 | Shift+Home: extend to line start |
| extendSelectionToEnd() | editor.js | 1267-1280 | Shift+End: extend to line end |

### Mouse Selection Code (NOT WIRED)

| Method | File | Lines | Purpose |
|--------|------|-------|---------|
| handleMouseDown() | editor.js | 1975-1979 | Would detect drag start [NOT CALLED] |
| handleMouseMove() | editor.js | 1984-2004 | Would extend drag selection [NOT CALLED] |
| handleMouseUp() | editor.js | 2009-2024 | Would finalize selection [NOT CALLED] |
| calculateCellPosition() | editor.js | 2047-2089 | Convert pixel coords to cell index |

### Support Code

| Method | File | Lines | Purpose |
|--------|------|-------|---------|
| initializeSelection() | editor.js | 1095-1105 | Create/update selection state |
| getSelection() | editor.js | 1128-1133 | Query current selection |
| hasSelection() | editor.js | 1121-1123 | Check if selection exists |
| clearSelection() | editor.js | 1110-1116 | Clear selection state |
| getSelectedText() | editor.js | 1138-1161 | Get text from selected range |
| updateSelectionDisplay() | editor.js | 1285-1299 | Render selection visually |
| renderSelectionVisual() | editor.js | 1305-1325 | Add 'selected' class to cells |
| clearSelectionVisual() | editor.js | 1331-1341 | Remove 'selected' class from cells |

---

## Visual Selection Implementation

### CSS Class Application

**Keyboard Selection (WORKING)**
```javascript
// In renderSelectionVisual():
for (let i = selection.start; i < selection.end; i++) {
  const cellElement = lineElement.querySelector(`[data-cell-index="${i}"]`);
  if (cellElement) {
    cellElement.classList.add('selected');  // ✓ WORKS
  }
}
```

**Mouse Selection (WOULD USE SAME METHOD)**
```javascript
// Would call same renderSelectionVisual(selection) function
// Uses same CSS class application mechanism
// Just needs the mousedown/mousemove/mouseup events to trigger it
```

---

## Commands Integration

Both keyboard and mouse selection (when implemented) would work with:

| Command | Uses Selection | Effect |
|---------|---|---------|
| Alt+S (Slur) | Yes | Apply/remove slur to selected cells |
| Alt+U (Octave Up) | Yes | Apply octave +1 to selected cells |
| Alt+M (Octave Middle) | Yes | Clear octave marks from selected cells |
| Alt+L (Octave Low) | Yes | Apply octave -1 to selected cells |
| Backspace | Yes | Delete selected text or char at cursor |
| Delete | Yes | Delete selected text or char at cursor |
| Replace (Type) | Yes | Replace selection with new text |

---

## What's Missing for Mouse Selection

### Event Wiring
```javascript
// NEEDED: In setupEventHandlers() method
this.element.addEventListener('mousedown', (event) => {
  // MISSING IMPLEMENTATION
});

document.addEventListener('mousemove', this.handleMouseMove.bind(this));
document.addEventListener('mouseup', this.handleMouseUp.bind(this));
```

### Drag Start Detection
```javascript
// NEEDED: Initialize drag state in handleMouseDown
this.isDragging = true;
this.dragStartPos = cellPosition;
this.dragEndPos = cellPosition;
```

### Mouse Coordinate Conversion
```javascript
// ALREADY IMPLEMENTED: Just needs to be called
const cellPosition = this.calculateCellPosition(x, y);
```

---

## Potential Enhancements (Future)

### For Both Selection Methods
- Multi-line selection (currently main line only)
- Extend keyboard selection vertically (Up/Down arrows)
- Shift+click to extend mouse selection
- Ctrl+A to select all
- Double-click to select word/cell

### For Mouse Selection Specifically
- Visual feedback while dragging (cursor changes, highlight preview)
- Auto-scroll when dragging near viewport edges
- Middle-click paste support
- Right-click context menu with Cut/Copy/Paste

### For Keyboard Selection
- Selection extension with Shift+Ctrl+Arrow (by word)
- Clipboard integration (Ctrl+C/X/V)
- Selection history (undo/redo of selections)

---

## Summary

**Current State:**
- Keyboard selection: Fully functional and integrated
- Mouse selection: Infrastructure ready, just needs event wiring

**Next Steps:**
1. Add mousedown/mousemove/mouseup listeners to setupEventHandlers()
2. Initialize drag state in handleMouseDown()
3. Test with existing commands (slur, octave, delete)

**Code Reuse:**
Both keyboard and mouse use:
- Same `document.state.selection` structure
- Same `initializeSelection()` method
- Same `updateSelectionDisplay()` rendering
- Same command validation (`validateSelectionForCommands()`)

