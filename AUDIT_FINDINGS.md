# Editor Code Audit: Leafpad-Style Plain Text Editing

## Summary

The editor has **solid foundations** for a plain-text-like editor but **critical gaps** in copy/paste, selection rendering, and undo/redo. The cursor/selection model exists but needs refinement. Input handling currently **blocks Ctrl key combinations entirely**, which breaks expected text editor behavior (Ctrl+C/V/Z/etc).

---

## Current Architecture (Good Foundations)

### ✅ Cursor State (Centralized & Good)
- **Location**: `document.state.cursor` (in `document-manager.js`)
- **Model**: `{ stave, column }` (row/column based)
- **Management**: `CursorManager` updates and renders
- **Visual**: Blinking 2px caret, positioned via cell bboxes
- **Status**: ✅ **Works well**, deterministic position tracking

### ✅ Document Buffer (Plain-ish, with Metadata)
- **Storage**: `document.lines[].cells[]` array
- **Cell structure**: Each cell is an object with `{ char, x, y, w, h, ...music-metadata }`
- **Buffer access**: `document-manager.js` provides `.exportAsText()` that reconstructs plain text
- **Status**: ✅ **Clean enough**, though cells carry music metadata (OK for now, doesn't break editing)

### ✅ Input Routing (EventManager → Editor)
- **Flow**: Global `keydown` → `EventManager.handleGlobalKeyDown` → `editor.handleKeyboardEvent`
- **Separation**: Music commands (Alt+S, Alt+O) handled separately from text input
- **Status**: ✅ **Well-organized**, clear delegation

---

## Critical Gaps (Blocking Plain-Text Feel)

### ❌ 1. Copy/Paste Not Implemented
- **Search result**: Only 1 match found in `lilypond-tab.js` (export context, not edit context)
- **Problem**: User cannot Ctrl+C/V in editor
- **Impact**: Major friction—copy/paste is sacred in text editors
- **Current state**: `handleKeyboardEvent` returns early for `modifiers.ctrl` (line 831–833 in editor.js)
  ```javascript
  if (modifiers.ctrl) {
    return;  // ← IGNORES ALL CTRL COMMANDS
  }
  ```
- **Why blocked**: Presumably to avoid conflicts with browser shortcuts, but this is wrong; we should let Ctrl+C/V through

### ❌ 2. Undo/Redo Not Implemented
- **Search result**: Grep found 0 matches for `undo`, `redo`, or `history`
- **Problem**: User cannot undo/redo text edits
- **Impact**: Very poor user experience; required for any serious editor
- **Current state**: No history buffer anywhere in code
- **Why not done**: Likely still in POC phase

### ❌ 3. Selection Rendering / Display Issues
- **Selection state exists**: `document.state.selection` is initialized in `document-manager.js` (line 54)
- **Selection logic exists**: `editor.js` has `initializeSelectionByStops()`, `extendSelectionLeft()`, `extendSelectionRight()`, etc.
- **BUT problem**:
  - No method to **visually render selection** (highlight/selection box)
  - `updateSelectionDisplay()` is called (line 563 in editor.js) but **method not defined in the class**
  - Selection works in memory but user **can't see it**
- **Impact**: User can select but doesn't know what they selected → confusing

### ❌ 4. Drag-Select Not Hooked Up
- **State exists**: `this.isDragging`, `this.dragStartPos`, `this.dragEndPos` in editor.js (lines 30–32)
- **Mouse handlers needed**: `mousedown`, `mousemove`, `mouseup` not found in event system
- **Problem**: User cannot click-and-drag to select
- **Impact**: One of the most expected text editor behaviors is missing

### ❌ 5. Selection/Cursor Model Incomplete
- **Current model**: Selection uses both `cell indices` and `stop indices` (two systems mixed)
- **Problem**: "Stop indices" are navigable elements (cells not inside ornaments in non-edit-mode)
  - This works for special navigation but complicates copy/paste
  - Copy/paste needs to work on **character positions**, not stops
- **Need to clarify**: When user selects and copies, do we want to copy:
  - Raw text (ignoring music metadata)? ✅ Yes, for Leafpad feel
  - Or include music-specific data? → Not for core editor, that's export-time job

---

## Missing Implementations (To-Do)

### ❌ A. Copy/Paste (Highest Priority)
**What's needed:**
1. Handle `Ctrl+C` / `Cmd+C` → read selection → copy to `navigator.clipboard.writeText()`
2. Handle `Ctrl+V` / `Cmd+V` → paste from clipboard → insert at cursor, replacing any selection
3. Clipboard should contain **plain text only** (not music metadata)
   - Extract text from selected cells: `cells.map(c => c.char).join('')`
4. Test: Paste into other editors (Notepad, etc.) should work with just text

**Files to modify:**
- `src/js/editor.js` → add `handleCopy()`, `handlePaste()` methods, route Ctrl+C/V
- `src/js/events.js` → DON'T block `modifiers.ctrl`; route to editor instead

### ❌ B. Undo/Redo (High Priority)
**What's needed:**
1. Simple stack-based history: `[ { type: 'insert', pos, char, ...}, { type: 'delete', pos, ... }, ... ]`
2. On each text edit (insert/delete), push to history
3. On Ctrl+Z, pop from history, **revert the operation**
4. On Ctrl+Y / Ctrl+Shift+Z, pop from redo stack, **reapply**
5. Clear redo stack when user makes a new edit
6. For POC, don't worry about merging consecutive character inserts—that's optimization

**Files to create/modify:**
- `src/js/history-manager.js` (new file) → `UndoRedoManager` class with simple push/pop
- `src/js/editor.js` → call `historyManager.push()` on each change, wire up Ctrl+Z/Y

### ❌ C. Selection Rendering (Medium Priority)
**What's needed:**
1. In renderer, after drawing cells, check if `document.state.selection` exists
2. For each selected cell, draw a **semi-transparent rect** behind it
   - Color: light blue or system selection color
   - Opacity: ~0.2 so text is still visible
3. Implement `editor.updateSelectionDisplay()` to call renderer

**Files to modify:**
- `src/js/renderer.js` → add `renderSelection()` method
- `src/js/editor.js` → uncomment/implement `updateSelectionDisplay()`

### ❌ D. Drag-Select (Medium Priority)
**What's needed:**
1. Add mouse event listeners in editor/renderer:
   - `mousedown` → set `isDragging=true`, init selection from cursor
   - `mousemove` → extend selection to current mouse position
   - `mouseup` → finalize selection, `isDragging=false`
2. Hit-test: Find which cell is under mouse cursor
   - Use cell bbox (x, y, w, h) already computed by renderer
3. Convert (x, y) → cell index → cursor position

**Files to modify:**
- `src/js/renderer.js` → add hit-testing utility
- `src/js/editor.js` → add mouse handlers

### ❌ E. Ctrl Key Unblocking (Immediate)
**What's needed:**
1. In `editor.js` line 831–833, **don't return early**
2. Instead, route to specific handlers:
   ```javascript
   if (modifiers.ctrl && !modifiers.alt && !modifiers.shift) {
     this.handleCtrlCommand(key);
     return;
   }
   ```
3. In `handleCtrlCommand()`, support:
   - Ctrl+C → copy
   - Ctrl+V → paste
   - Ctrl+Z → undo
   - Ctrl+Y → redo (or Ctrl+Shift+Z)
   - Ctrl+A → select all (bonus)
   - Let other Ctrl commands pass through (browser default)

**Files to modify:**
- `src/js/editor.js` → `handleCtrlCommand()` method

---

## Code Locations Reference

| Component | File | Lines | Status |
|-----------|------|-------|--------|
| Cursor state | `document-manager.js` | 52–56 | ✅ Good |
| Cursor management | `cursor-manager.js` | 14–310 | ✅ Good |
| Cursor visual | `renderer.js` | 158–209 | ✅ Good |
| Selection state | `document-manager.js` | 54 | ❌ Not rendered |
| Selection logic | `editor.js` | 1200–1400+ | ⚠️ Exists but no visual |
| Text input | `editor.js` | 235–354 (insertText) | ✅ Works |
| Deletion | `editor.js` | 534–568 (deleteRange) | ✅ Works |
| Keyboard routing | `editor.js` | 813–846 | ⚠️ Blocks Ctrl keys |
| Event dispatch | `events.js` | 138–204 | ✅ Good |
| Copy/Paste | `*` | — | ❌ Not found |
| Undo/Redo | `*` | — | ❌ Not found |
| Drag-select | `*` | — | ❌ Not found |

---

## Recommended Implementation Order

1. **Week 1:**
   - ✅ Unblock Ctrl keys in `editor.handleKeyboardEvent()`
   - ✅ Implement `handleCtrlCommand()` stub
   - ✅ Implement copy/paste (read/write clipboard)

2. **Week 2:**
   - ✅ Create `history-manager.js` with undo/redo stack
   - ✅ Wire up Ctrl+Z / Ctrl+Y
   - ✅ Test undo/redo with text inserts/deletes

3. **Week 3:**
   - ✅ Implement selection rendering in renderer.js
   - ✅ Fix `updateSelectionDisplay()` in editor.js
   - ✅ Test selection highlight appears correctly

4. **Week 4:**
   - ✅ Implement drag-select with hit-testing
   - ✅ Test click-and-drag to select text
   - ✅ Integration test: copy selected text via Ctrl+C

---

## Questions for You (To Clarify Before Building)

1. **Paste behavior**: When user pastes text at a cursor position with NO selection, should it:
   - Insert before cursor and push text right? (standard)
   - Or replace from cursor to next beat boundary? (music-aware)
   → I recommend standard text editor behavior.

2. **Selection vs. Music structure**: The current selection uses "stop indices" (navigable cells). For copy/paste should we:
   - Use raw character positions (simpler, Leafpad-style)?
   - Or respect beat boundaries (music-aware, but feels constrained)?
   → Recommend character positions for plain-text feel.

3. **Ornaments in copy/paste**: If user selects text that includes ornament cells, should we:
   - Copy the ornament metadata (complex)?
   - Ignore ornaments, copy only text (simpler)?
   → Recommend ignore for now; paste is "plain text" only.

4. **Undo granularity**: Should we:
   - Undo each individual character insert? (chatty history)
   - Or batch consecutive character inserts into one undo? (cleaner)
   → Standard editors batch same-direction edits within ~500ms.

---

## Testing Checklist (Acceptance Criteria)

Once implemented, test:
- [ ] Type `S--r G- m |` in editor
- [ ] Ctrl+A selects all (caret to start, text becomes highlighted)
- [ ] Ctrl+C copies the text (verified by pasting in Notepad)
- [ ] Ctrl+V pastes text at cursor
- [ ] Ctrl+Z undoes last action
- [ ] Ctrl+Y redoes last undo
- [ ] Click-drag to select text
- [ ] Selection highlight is visible and rectangular
- [ ] Delete/Backspace with selection deletes selected text
- [ ] Type while selection exists replaces selection
- [ ] Home/End still navigate within line
- [ ] Shift+Arrow extends selection visually

---

## Risk Analysis

**Low risk:**
- Copy/paste (simple string operations)
- Undo/redo (just stack management)

**Medium risk:**
- Selection rendering (need correct bbox calculation from renderer)
- Drag-select (hit-testing and mouse event coordination)

**No risk:**
- Unblocking Ctrl keys (simple flow change)

**Potential pitfalls:**
- Selection rendering with ornaments (cells that span >1 visual column)
- Character position ↔ cell index conversion (already done, but verify)
- History preservation across line splits (defer to later)

---

## Conclusion

**The editor is ~70% of the way to "feels like Leafpad":**
- ✅ Cursor works perfectly
- ✅ Text insert/delete work
- ✅ Keyboard routing is clean
- ❌ Missing: copy/paste, undo/redo, selection visibility, drag-select

**Quick wins:**
1. Unblock Ctrl keys (5 min)
2. Implement copy/paste (1–2 hours)
3. Implement undo/redo (2–3 hours)
4. Add selection rendering (1–2 hours)
5. Add drag-select (2–3 hours)

**Total estimate: ~1–2 days to get all five working and tested.**
