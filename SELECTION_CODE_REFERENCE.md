# Selection Implementation - Code Reference

## Quick Location Guide

| Component | File | Lines |
|-----------|------|-------|
| Selection initialization & queries | editor.js | 1090-1162 |
| Keyboard Shift+Arrow handling | editor.js | 778-825 |
| Selection extension methods | editor.js | 1166-1280 |
| Selection visualization | editor.js | 1285-1341 |
| Mouse handlers (not wired) | editor.js | 1975-2089 |
| Cursor positioning logic | editor.js | 2026-2088 |
| Cell click handler | renderer.js | 632-639 |
| Cell click listener wiring | renderer.js | 564-567 |
| Global keyboard routing | events.js | 130-172 |

---

## Code Snippets

### 1. Selection Data Structure

**File**: `editor.js`, Line 114-118

```javascript
document.state = {
  cursor: { stave: 0, column: 0 },
  selection: null,  // null or { start, end, active }
  has_focus: false
};
```

### 2. Initialize Selection

**File**: `editor.js`, Lines 1095-1105

```javascript
initializeSelection(startPos, endPos) {
  if (!this.theDocument || !this.theDocument.state) {
    return;
  }

  this.theDocument.state.selection = {
    start: Math.min(startPos, endPos),
    end: Math.max(startPos, endPos),
    active: true
  };
}
```

**Usage**: Called by:
- `extendSelectionLeft/Right/Up/Down/ToStart/ToEnd()`
- `handleMouseMove()` (when implemented)
- `handleMouseUp()` (when implemented)

### 3. Clear Selection

**File**: `editor.js`, Lines 1110-1116

```javascript
clearSelection() {
  if (this.theDocument && this.theDocument.state) {
    this.theDocument.state.selection = null;
  }
  this.clearSelectionVisual();
  this.updateDocumentDisplay();
}
```

### 4. Check Selection Status

**File**: `editor.js`, Lines 1121-1133

```javascript
hasSelection() {
  return !!(this.theDocument && this.theDocument.state && 
            this.theDocument.state.selection && 
            this.theDocument.state.selection.active);
}

getSelection() {
  if (this.hasSelection()) {
    return this.theDocument.state.selection;
  }
  return null;
}
```

### 5. Get Selected Text

**File**: `editor.js`, Lines 1138-1161

```javascript
getSelectedText() {
  const selection = this.getSelection();
  if (!selection) {
    return '';
  }

  if (!this.theDocument || !this.theDocument.lines || 
      this.theDocument.lines.length === 0) {
    return '';
  }

  const line = this.theDocument.lines[0];
  const cells = line.cells || [];

  if (cells.length === 0) {
    return '';
  }

  // Extract text from selection range (no lanes - just cell indices)
  const selectedCells = cells.filter((cell, index) =>
    index >= selection.start && index < selection.end
  );

  return selectedCells.map(cell => cell.char || '').join('');
}
```

### 6. Extend Selection Left

**File**: `editor.js`, Lines 1166-1188

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
    // Extend selection to include previous cell
    if (currentCellIndex === selection.end) {
      // Extending left from end
      this.initializeSelection(newIndex, selection.end);
    } else {
      // Extending left from start
      this.initializeSelection(newIndex, selection.end);
    }
    this.setCursorPosition(newIndex);
  }
}
```

### 7. Extend Selection Right

**File**: `editor.js`, Lines 1193-1229

```javascript
extendSelectionRight() {
  console.log('🟢 extendSelectionRight called');
  const currentCellIndex = this.getCursorPosition();
  const maxCellIndex = this.getMaxCellIndex();
  let selection = this.getSelection();

  if (!selection) {
    // Start new selection
    this.initializeSelection(currentCellIndex, currentCellIndex);
    selection = this.getSelection();
  }

  if (currentCellIndex < maxCellIndex) {
    const newIndex = currentCellIndex + 1;
    // Extend selection to include next cell
    if (currentCellIndex === selection.start) {
      // Extending right from start
      this.initializeSelection(selection.start, newIndex);
    } else {
      // Extending right from end
      this.initializeSelection(selection.start, newIndex);
    }
    this.setCursorPosition(newIndex);
  }
}
```

### 8. Update Selection Display

**File**: `editor.js`, Lines 1285-1299

```javascript
updateSelectionDisplay() {
  // Clear previous selection
  this.clearSelectionVisual();

  const selection = this.getSelection();
  if (!selection) {
    return;
  }

  // Add visual selection for selected range
  this.renderSelectionVisual(selection);

  // Update ephemeral model display to show current selection state
  this.updateDocumentDisplay();
}
```

### 9. Render Visual Selection

**File**: `editor.js`, Lines 1305-1325

```javascript
renderSelectionVisual(selection) {
  if (!this.renderer || !this.renderer.element) {
    console.warn('No renderer or renderer element');
    return;
  }

  // Find the line element
  const lineElement = this.renderer.element.querySelector(`[data-line="0"]`);
  if (!lineElement) {
    console.warn('Line element not found, cannot render selection');
    return;
  }

  // Add 'selected' class to all cells in the selection range
  for (let i = selection.start; i < selection.end; i++) {
    const cellElement = lineElement.querySelector(`[data-cell-index="${i}"]`);
    if (cellElement) {
      cellElement.classList.add('selected');
    }
  }
}
```

### 10. Clear Visual Selection

**File**: `editor.js`, Lines 1331-1341

```javascript
clearSelectionVisual() {
  if (!this.renderer || !this.renderer.element) {
    return;
  }

  // Remove 'selected' class from all cells
  const selectedCells = this.renderer.element.querySelectorAll('.char-cell.selected');
  selectedCells.forEach(cell => {
    cell.classList.remove('selected');
  });
}
```

### 11. Handle Shift+Arrow Keyboard

**File**: `editor.js`, Lines 778-825

```javascript
handleShiftCommand(key) {
  console.log('🔵 handleShiftCommand called:', key);
  let handled = false;

  switch (key) {
    case 'ArrowLeft':
      console.log('  → Calling extendSelectionLeft');
      this.extendSelectionLeft();
      handled = true;
      break;
    case 'ArrowRight':
      console.log('  → Calling extendSelectionRight');
      this.extendSelectionRight();
      handled = true;
      break;
    case 'ArrowUp':
      console.log('  → Calling extendSelectionUp');
      this.extendSelectionUp();
      handled = true;
      break;
    case 'ArrowDown':
      console.log('  → Calling extendSelectionDown');
      this.extendSelectionDown();
      handled = true;
      break;
    case 'Home':
      console.log('  → Calling extendSelectionToStart');
      this.extendSelectionToStart();
      handled = true;
      break;
    case 'End':
      console.log('  → Calling extendSelectionToEnd');
      this.extendSelectionToEnd();
      handled = true;
      break;
    default:
      console.log('  → Unknown key, ignoring');
      return;
  }

  if (handled) {
    // Update display
    console.log('  → Updating selection display');
    this.updateSelectionDisplay();
    console.log('  → Selection state:', this.getSelection());
  }
}
```

### 12. Mouse Down Handler (NOT WIRED)

**File**: `editor.js`, Lines 1975-1979

```javascript
handleMouseDown(event) {
  // Just focus the editor for now
  this.element.focus();
  event.preventDefault();
}
```

**What it SHOULD do**:
```javascript
handleMouseDown(event) {
  if (!event.target.closest('[data-cell-index]')) return;
  
  const rect = this.element.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  
  const cellPosition = this.calculateCellPosition(x, y);
  
  this.isDragging = true;
  this.dragStartPos = cellPosition;
  this.dragEndPos = cellPosition;
}
```

### 13. Mouse Move Handler (NOT WIRED)

**File**: `editor.js`, Lines 1984-2004

```javascript
handleMouseMove(event) {
  if (!this.isDragging) return;

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

    // Prevent default to avoid text selection behavior
    event.preventDefault();
  }
}
```

### 14. Mouse Up Handler (NOT WIRED)

**File**: `editor.js`, Lines 2009-2024

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

### 15. Calculate Cell Position from Coordinates

**File**: `editor.js`, Lines 2047-2089

```javascript
calculateCellPosition(x, y) {
  // Use DisplayList for accurate cursor positioning
  if (!this.renderer || !this.renderer.displayList) {
    console.warn('DisplayList not available, using fallback');
    return 0;
  }

  const displayList = this.renderer.displayList;
  const firstLine = displayList.lines && displayList.lines[0];

  if (!firstLine || !firstLine.cells || firstLine.cells.length === 0) {
    return 0;
  }

  // Build array of cursor positions:
  // [0] = cursor_left of first cell
  // [1] = cursor_right of first cell
  // [2] = cursor_right of second cell
  // ...
  const cursorPositions = [];

  // Position 0: before first cell
  cursorPositions.push(firstLine.cells[0].cursor_left);

  // Positions 1..N: after each cell
  for (const cell of firstLine.cells) {
    cursorPositions.push(cell.cursor_right);
  }

  // Find the cursor position closest to the click
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

### 16. Cell Click Handler in Renderer

**File**: `renderer.js`, Lines 564-567

```javascript
span.addEventListener('click', (e) => {
  e.stopPropagation();
  this.handleCellClick(cell, e);
});

// Lines 632-639
handleCellClick(charCell, event) {
  console.log('Cell clicked:', charCell);

  // Update cursor position
  if (window.musicEditor) {
    window.musicEditor.setCursorPosition(charCell.col);
  }
}
```

### 17. Global Keyboard Event Routing

**File**: `events.js`, Lines 130-172

```javascript
handleGlobalKeyDown(event) {
  // Ignore bare modifier keys
  const modifierKeys = ['Alt', 'Control', 'Shift', 'Meta', 'AltGraph'];
  if (modifierKeys.includes(event.key)) {
    console.log('Ignoring bare modifier key press:', event.key);
    return;
  }

  const key = this.getKeyString(event);

  // Check for global shortcuts
  if (this.globalShortcuts[key]) {
    event.preventDefault();
    event.stopPropagation();
    this.globalShortcuts[key]();
    return;
  }

  // Route to editor if it has focus
  if (this.editorFocus()) {
    // Prevent certain default behaviors
    if (this.preventDefaultWhenFocused.includes(key)) {
      event.preventDefault();
    }

    // Route to editor
    if (this.editor && this.editor.handleKeyboardEvent) {
      this.editor.handleKeyboardEvent(event);
      // Prevent further propagation after editor handles the event
      event.stopPropagation();
    }
  }
}
```

---

## Commands Using Selection

### Apply Slur

**File**: `editor.js`, Lines 1567-1639

Uses `this.getSelection()` to determine range for `applySlur()` WASM call.

### Apply Octave

**File**: `editor.js`, Lines 1692-1805

Uses `this.getSelection()` to determine range for `applyOctave()` WASM call.

### Replace Selected Text

**File**: `editor.js`, Lines 1346-1366

```javascript
async replaceSelectedText(newText) {
  const selection = this.getSelection();
  if (!selection) {
    return await this.insertText(newText);
  }

  try {
    // Delete selected range
    await this.deleteRange(selection.start, selection.end);

    // Insert new text at selection start position
    this.setCursorPosition(selection.start);
    await this.insertText(newText);

    // Clear selection
    this.clearSelection();
  } catch (error) {
    console.error('Failed to replace selected text:', error);
    this.showError('Failed to replace selection');
  }
}
```

### Delete Selection

**File**: `editor.js`, Lines 1371-1385

```javascript
async deleteSelection() {
  const selection = this.getSelection();
  if (!selection) {
    return;
  }

  try {
    await this.deleteRange(selection.start, selection.end);
    this.setCursorPosition(selection.start);
    this.clearSelection();
  } catch (error) {
    console.error('Failed to delete selection:', error);
    this.showError('Failed to delete selection');
  }
}
```

---

## Display Data Structures

### Selection Range

```javascript
{
  start: 0,      // First cell index (inclusive)
  end: 3,        // Last cell index (exclusive, like array slice)
  active: true   // Whether selection is currently active
}
```

### Cursor Position

```javascript
{
  stave: 0,      // Line number (always 0 for main line)
  column: 5      // Cell index position
}
```

### DisplayList Cell

```javascript
{
  x: 100,                    // Pixel X position
  y: 32,                     // Pixel Y position
  w: 12,                     // Width in pixels
  h: 16,                     // Height in pixels
  char: "1",                 // The glyph
  cursor_left: 98,           // Pixel position before cell
  cursor_right: 110,         // Pixel position after cell
  char_positions: [98, 104], // Position of each character
  classes: ["char-cell"],    // CSS classes
  dataset: {                 // Data attributes
    cellIndex: "0"
  }
}
```

