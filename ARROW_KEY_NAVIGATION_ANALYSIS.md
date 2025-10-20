# Arrow Key Navigation Analysis - Music Notation Editor

## Overview
This document provides a comprehensive analysis of arrow key handling in the music notation editor, including how left/right arrow keys navigate through content and cursor position management at line boundaries.

---

## 1. Current Arrow Key Implementation

### Entry Point: Keyboard Handler
**File**: `/home/john/editor/src/js/keyboard-handler.js` (lines 37-40)

The keyboard handler registers arrow key shortcuts that call editor methods:
```javascript
this.registerShortcut('ArrowLeft', () => this.editor.moveCursor(-1));
this.registerShortcut('ArrowRight', () => this.editor.moveCursor(1));
this.registerShortcut('Home', () => this.editor.moveCursorToStart());
this.registerShortcut('End', () => this.editor.moveCursorToEnd());
```

**Key characteristics**:
- ArrowLeft/Right call `moveCursor()` with delta values (-1 or +1)
- Home/End have separate methods
- No direct handling of navigation logic

---

## 2. Navigation Methods in Editor

### Location: `/home/john/editor/src/js/editor.js`

#### 2.1 navigateLeft() - Lines 883-892
```javascript
navigateLeft() {
    logger.debug(LOG_CATEGORIES.CURSOR, 'Navigate left');
    const currentCharPos = this.getCursorPosition();

    if (currentCharPos > 0) {
        // Move to previous character
        this.setCursorPosition(currentCharPos - 1);
        logger.debug(LOG_CATEGORIES.CURSOR, 'Moved to char position', { pos: currentCharPos - 1 });
    }
}
```

**Behavior**:
- Only moves left if cursor position > 0
- Does NOT wrap to previous line when at start of line
- Operates on character position within current line

#### 2.2 navigateRight() - Lines 897-907
```javascript
navigateRight() {
    logger.debug(LOG_CATEGORIES.CURSOR, 'Navigate right');
    const currentCharPos = this.getCursorPosition();
    const maxCharPos = this.getMaxCharPosition();

    if (currentCharPos < maxCharPos) {
        // Move to next character
        this.setCursorPosition(currentCharPos + 1);
        logger.debug(LOG_CATEGORIES.CURSOR, 'Moved to char position', { pos: currentCharPos + 1 });
    }
}
```

**Behavior**:
- Only moves right if cursor position < max
- Does NOT wrap to next line when at end of line
- Respects line boundary (clamped to maxCharPos)

#### 2.3 navigateUp() - Lines 912-923
```javascript
navigateUp() {
    if (!this.theDocument || !this.theDocument.state) {
        return;
    }

    const currentStave = this.theDocument.state.cursor.stave;
    if (currentStave > 0) {
        this.theDocument.state.cursor.stave = currentStave - 1;
        this.setCursorPosition(0); // Move to start of previous line
        logger.debug(LOG_CATEGORIES.CURSOR, `Navigate up to stave ${currentStave - 1}`);
    }
}
```

**Behavior**:
- Changes stave (line) to previous line
- MOVES CURSOR TO START (column = 0)
- Does nothing if already on first line

#### 2.4 navigateDown() - Lines 928-939
```javascript
navigateDown() {
    if (!this.theDocument || !this.theDocument.state || !this.theDocument.lines) {
        return;
    }

    const currentStave = this.theDocument.state.cursor.stave;
    if (currentStave < this.theDocument.lines.length - 1) {
        this.theDocument.state.cursor.stave = currentStave + 1;
        this.setCursorPosition(0); // Move to start of next line
        logger.debug(LOG_CATEGORIES.CURSOR, `Navigate down to stave ${currentStave + 1}`);
    }
}
```

**Behavior**:
- Changes stave (line) to next line
- MOVES CURSOR TO START (column = 0)
- Does nothing if already on last line

---

## 3. Cursor Position Management

### 3.1 getCursorPosition() - Line 615
```javascript
getCursorPosition() {
    if (this.theDocument && this.theDocument.state) {
        return this.theDocument.state.cursor.column;
    }
    return 0;
}
```
Returns character-based column position within current line.

### 3.2 setCursorPosition(position) - Lines 625-634
```javascript
setCursorPosition(position) {
    if (this.theDocument && this.theDocument.state) {
        // Validate and clamp cursor position to valid range
        const validatedPosition = this.validateCursorPosition(position);
        this.theDocument.state.cursor.column = validatedPosition;
        this.updateCursorPositionDisplay();
        this.updateCursorVisualPosition();
        this.showCursor();
    }
}
```

**Key points**:
- Validates position before setting (calls validateCursorPosition)
- Updates display and visual position
- Shows cursor

### 3.3 validateCursorPosition(position) - Lines 639-658
```javascript
validateCursorPosition(position) {
    if (!this.theDocument || !this.theDocument.lines || this.theDocument.lines.length === 0) {
        return 0;
    }

    const maxPosition = this.getMaxCharPosition();

    // Clamp position to valid range [0, maxPosition]
    const clampedPosition = Math.max(0, Math.min(position, maxPosition));

    if (clampedPosition !== position) {
        logger.warn(LOG_CATEGORIES.CURSOR, 'Cursor position clamped', {
            requested: position,
            clamped: clampedPosition,
            maxPosition
        });
    }

    return clampedPosition;
}
```

**Behavior**:
- Clamps position to [0, maxPosition]
- Logs warning if position adjusted
- Prevents invalid cursor positions

### 3.4 getMaxCharPosition() - Lines 976-996
```javascript
getMaxCharPosition() {
    if (!this.theDocument || !this.theDocument.state || !this.theDocument.lines || this.theDocument.lines.length === 0) {
        return 0;
    }

    const currentStave = this.theDocument.state.cursor.stave;
    const line = this.theDocument.lines[currentStave];
    if (!line) {
        return 0;
    }

    const cells = line.cells || [];

    // Sum up lengths of all cell glyphs
    let totalChars = 0;
    for (const cell of cells) {
        totalChars += cell.char.length;
    }

    return totalChars;
}
```

**Key points**:
- Calculates total characters in current line
- Sums cell.char.length for all cells
- Returns 0 if no cells

---

## 4. Line Boundary Behavior

### Current Behavior Summary

| Key | At Start of Line | At End of Line | Middle of Line |
|-----|------------------|----------------|-----------------|
| **Left** | No action | Move left | Move left |
| **Right** | Move right | No action | Move right |
| **Up** | Move to previous line, START | Move to previous line, START | Move to previous line, START |
| **Down** | Move to next line, START | Move to next line, START | Move to next line, START |

### Key Observations

1. **Left/Right arrow keys do NOT wrap lines**
   - Arrow left at start of line → stays at start (no action)
   - Arrow right at end of line → stays at end (no action)
   - This is because `navigateLeft()` and `navigateRight()` only operate within current line

2. **Up/Down arrow keys DO change lines**
   - Moving to previous/next line RESETS cursor to column 0 (start of line)
   - This is unlike typical text editors which try to maintain column position

3. **Home/End keys**
   - Home: navigateHome() - moves to position 0
   - End: navigateEnd() - moves to maxCharPos

---

## 5. Multiline Document Structure

### Document Structure
```javascript
theDocument = {
    lines: [
        { cells: [...], ...otherProps },  // Line 0 (stave 0)
        { cells: [...], ...otherProps },  // Line 1 (stave 1)
        { cells: [...], ...otherProps },  // Line 2 (stave 2)
        ...
    ],
    state: {
        cursor: {
            stave: number,  // Current line index
            column: number  // Position within line (character-based)
        },
        ...otherState
    }
}
```

### Current Line Access
- `this.getCurrentLine()` - returns `this.theDocument.lines[currentStave]`
- `this.getCurrentStave()` - returns `this.theDocument.state.cursor.stave`

### Line Splitting (Enter Key)
**File**: `/home/john/editor/src/js/editor.js` lines 1568-1653

When Enter is pressed:
1. Calls WASM `splitLineAtPosition(document, stave, charPos)`
2. Current line split into two at cursor position
3. New line created at stave + 1
4. Cursor moves to START of new line (column = 0)
5. Both old and new lines have beats re-derived

---

## 6. Related Code: Cursor Manager

### File: `/home/john/editor/src/js/cursor-manager.js`

Separate class that handles cursor visual positioning:
- `move(delta)` - relative movement with bounds checking
- `moveToStart()` - move to column 0
- `moveToEnd()` - move to end of line
- `updateVisualPosition()` - updates CSS position of cursor element

The CursorManager is primarily for visual rendering, not navigation logic.

---

## 7. Test Coverage

### E2E Test Helpers
**File**: `/home/john/editor/tests/e2e-pw/utils/editor.helpers.js` lines 142-158

```javascript
export async function moveCursor(page, direction, count = 1) {
  const keyMap = {
    up: 'ArrowUp',
    down: 'ArrowDown',
    left: 'ArrowLeft',
    right: 'ArrowRight',
  };

  if (!keyMap[direction]) {
    throw new Error(`Invalid direction: ${direction}`);
  }

  for (let i = 0; i < count; i++) {
    await page.keyboard.press(keyMap[direction]);
    await page.waitForTimeout(50);
  }
}
```

### Test Usage Examples
- `/home/john/editor/tests/e2e-pw/tests/basic.spec.js` - moveCursor(page, 'left', 2)
- `/home/john/editor/tests/e2e-pw/tests/console-errors.spec.js` - multiple cursor movements
- `/home/john/editor/tests/e2e/test_visual_rendering.py` - Arrow key navigation tests

---

## 8. Expected Multiline Behavior Issues

### Issue 1: No Line Wrapping on Arrow Left/Right
**Current**: Arrow left/right cannot navigate between lines
**Question**: Should left arrow at start of line jump to end of previous line?

### Issue 2: Up/Down Arrow Loses Column Position
**Current**: Up/Down moves to column 0 of adjacent line
**Typical Editor Behavior**: Try to maintain same column position
**Impact**: User loses positional context when moving between lines

### Issue 3: Arrow Keys vs Logical Lines
**Current**: Navigation based on "stave" (physical line) not "logical line"
**Context**: Multiple lines can exist, unclear if user expects arrow keys to work across all or within stave

---

## 9. Architecture Context

### Document Model
- **Character Position**: Position within line, summing all cell.char.length
- **Stave**: Line/staff index in the document
- **Cells**: Individual musical elements with char property

### Navigation Layers
1. **Keyboard Handler** - Translates key events to editor calls
2. **Editor Navigation** - navigateLeft/Right/Up/Down methods
3. **Cursor Manager** - Visual positioning of cursor element
4. **WASM Module** - Line splitting/merging operations

---

## 10. Summary

### Current Arrow Key Implementation
- **Left/Right**: Character-level navigation within current line only
- **Up/Down**: Line-level navigation, resets to start of line
- **Home/End**: Line start/end navigation

### Line Boundary Handling
- **No wrapping** between lines with arrow left/right
- **Wrapping with arrow up/down** but resets column to 0
- **Clamping** prevents cursor from going beyond line bounds

### Expected Multiline Behavior
Not explicitly documented in codebase. Current implementation suggests:
1. Edit within lines using arrow left/right
2. Navigate between lines using arrow up/down
3. Enter key splits current line, moving cursor to new line start

### Known Characteristics
- Character-based positioning (sum of cell.char.length)
- Stave-based line organization
- No column position preservation when moving between lines
- Visual cursor managed separately from logical position
