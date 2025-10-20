# Arrow Key Navigation Fixes - Multiline Support

## Overview
Implemented proper multiline navigation for arrow keys in the music notation editor, matching standard text editor behavior.

## Changes Made

### File: `src/js/editor.js`

#### 1. **navigateLeft()** - Lines 883-910
**Before**: Only moved left within current line. At line beginning, did nothing.
**After**:
- Moves left within current line as before
- When at line beginning (charPos === 0), moves to **end of previous line**
- Logs navigation event with stave and char position details

**Key Logic**:
```javascript
if (currentCharPos > 0) {
  // Normal left movement within line
  this.setCursorPosition(currentCharPos - 1);
} else if (currentCharPos === 0 && currentStave > 0) {
  // Move to end of previous line
  const prevMaxCharPos = this.calculateMaxCharPosition(prevLine);
  this.theDocument.state.cursor.stave = prevStave;
  this.setCursorPosition(prevMaxCharPos);
}
```

#### 2. **navigateRight()** - Lines 915-935
**Before**: Only moved right within current line. At line end, did nothing.
**After**:
- Moves right within current line as before
- When at line end (charPos === maxCharPos), moves to **beginning of next line**
- Logs navigation event

**Key Logic**:
```javascript
if (currentCharPos < maxCharPos) {
  // Normal right movement within line
  this.setCursorPosition(currentCharPos + 1);
} else if (currentCharPos === maxCharPos && currentStave < lineCount - 1) {
  // Move to beginning of next line
  this.theDocument.state.cursor.stave = currentStave + 1;
  this.setCursorPosition(0);
}
```

#### 3. **navigateUp()** - Lines 940-961
**Before**: Moved to previous line and **always reset cursor to column 0**.
**After**:
- Moves to previous line
- **Preserves column position** by clamping to max char position of target line
- If target line is shorter, places cursor at line end instead of 0
- Logs movement with preserved char position

**Key Logic**:
```javascript
const currentCharPos = this.getCursorPosition();
this.theDocument.state.cursor.stave = currentStave - 1;
const prevMaxCharPos = this.calculateMaxCharPosition(prevLine);
const targetCharPos = Math.min(currentCharPos, prevMaxCharPos);
this.setCursorPosition(targetCharPos);
```

#### 4. **navigateDown()** - Lines 966-987
**Before**: Moved to next line and **always reset cursor to column 0**.
**After**:
- Moves to next line
- **Preserves column position** by clamping to max char position of target line
- If target line is shorter, places cursor at line end instead of 0
- Logs movement with preserved char position

**Key Logic**: Same as navigateUp, but for next line.

#### 5. **calculateMaxCharPosition()** - Lines 994-1004
**New Helper Method**
- Calculates max character position for any given line (not just current line)
- Sums all `cell.char.length` values in the line
- Used by Up/Down navigation to preserve column and by Left/Right for line boundaries
- Returns 0 for empty lines

**Usage**:
```javascript
const prevMaxCharPos = this.calculateMaxCharPosition(prevLine);
const targetCharPos = Math.min(currentCharPos, prevMaxCharPos);
```

## Behavior Examples

### Left Arrow at Line Boundaries
```
Line 1: s r g    │ Line 1: s r g
Line 2: │m p d   │ Line 2: m p d
        ↑ cursor │         ↑ cursor at end of line 1
```
Pressing left arrow moves from beginning of line 2 to end of line 1.

### Right Arrow at Line Boundaries
```
Line 1: s r g│   │ Line 1: s r g
Line 2: m p d│   │ Line 2: │m p d
        ↑ cursor │         ↑ cursor at start of line 2
```
Pressing right arrow moves from end of line 1 to beginning of line 2.

### Up/Down Arrow Column Preservation
```
Line 1: s r g     │ Line 1: s r │ g
Line 2: m p d n   │ Line 2: m p │ d n
Line 3: d         │ Line 3: d
        ↑ col 2   │         ↑ col 2 (preserved)
```
Pressing up/down arrows maintains the cursor column position across lines, clamping to line end if shorter.

## Testing

Tests are provided in: `tests/e2e/test_arrow_multiline_navigation.py`

Key test scenarios:
1. ✅ Left arrow at line beginning → moves to previous line end
2. ✅ Right arrow at line end → moves to next line beginning
3. ✅ Up/down arrows → preserve column position
4. ✅ Boundary conditions → no wrap at document edges

## Implementation Details

### Character Position System
The editor uses a **character-based** position system:
- Position is the sum of all `cell.char.length` values up to that point
- Multi-character cells (like `||` for barlines) count as 2+ chars
- Each line has independent character positions (resets at line boundary)

### Line/Stave System
- `document.lines[staveIndex]` contains line data
- `cursor.stave` is the current line index (0-based)
- `cursor.column` is the character position within that line

### Integration with Rendering
After navigation:
1. `setCursorPosition()` updates cursor state
2. `showCursor()` is called by keyboard handler to update visual cursor
3. Cursor manager uses pixel positioning from DisplayList

## Backward Compatibility

✅ All existing functionality preserved:
- Character-by-character movement within lines unchanged
- Home/End keys still work correctly
- Multiline structure unchanged
- WASM integration unchanged
- Rendering system unchanged

## Performance Notes

- O(n) operation for calculateMaxCharPosition (n = cells in line)
- Called only when crossing line boundaries
- Minimal overhead for typical line sizes (< 50 cells)
