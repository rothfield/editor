# Keyboard Input Handling Analysis - Music Notation Editor

## Executive Summary

The editor implements a **WASM-first architecture** where keyboard events flow from the DOM through JavaScript event handlers to WASM Rust functions. The keyboard input handling is well-structured with clear separation of concerns: EventManager handles global event capture, KeyboardHandler routes to specific commands, and WASM functions process the actual text mutations.

---

## 1. Event Listener Attachment Points

### 1.1 Global Event Listeners (EventManager)

**File:** `/home/john/editor/src/js/events.js` (line 49)

```javascript
// Global keyboard events - use capture phase to intercept before other handlers
document.addEventListener('keydown', this.handleGlobalKeyDown, { capture: true });
```

**Why capture phase?** Ensures keyboard events are intercepted globally before reaching individual element handlers, preventing duplicate processing.

### 1.2 Editor Element Event Listeners

**File:** `/home/john/editor/src/js/editor.js` (lines 1920-2038)

The `setupEventHandlers()` method attaches:
- **Focus/blur events** - Track editor focus state visually
- **Mouse events** - Selection and cursor positioning (mousedown, mousemove, mouseup, dblclick)
- **Click events** - Set cursor position and manage selection clearing

**Important:** Keyboard events are NOT attached to the editor element itself; they're handled globally by EventManager.

---

## 2. Focus Management

### 2.1 How Focus is Managed

**Editor Element Setup:**
- The editor element has `tabindex="0"` (in index.html, line 562)
- Element is marked with `role="textbox"` for accessibility

**Focus State Tracking:**
```javascript
// events.js: Focus state object
this.focusState = {
  hasFocus: false,
  activeElement: null,
  lastFocusTime: 0
};
```

### 2.2 Focus Event Flow

1. User clicks on editor → `click` event handler focuses the element (editor.js, line 1975)
2. Element receives focus → `focusin` event fires
3. EventManager's `handleGlobalFocus()` (events.js, line 218) updates focus state
4. Visual indicators added: `editor-focused` class

### 2.3 Checking Focus Before Processing Input

**File:** `/home/john/editor/src/js/events.js` (line 194)

```javascript
if (this.editorFocus()) {
  // Route keyboard event to editor
  this.editor.handleKeyboardEvent(event);
}
```

The `editorFocus()` method (line ~380) checks if the editor element currently has focus.

---

## 3. Keyboard Input Processing Flow

### 3.1 Flow Diagram

```
Browser keydown event
         ↓
EventManager.handleGlobalKeyDown() [events.js:140]
         ↓
Filter bare modifier keys (Alt, Ctrl, Shift alone)
         ↓
Check for global shortcuts (Tab, Escape, F1, etc.)
         ↓
Check if editor has focus
         ↓
Prevent default for certain keys (Space, arrows, Alt+*, Ctrl+*)
         ↓
Editor.handleKeyboardEvent(event) [editor.js:856]
         ↓
KeyboardHandler.handleKeyboardEvent(event) [KeyboardHandler.js:21]
         ↓
Route by modifier combination:
  ├─ Ctrl+key → handleCtrlCommand() [edit operations]
  ├─ Alt+Shift+key → handleAltShiftCommand() [mode toggles]
  ├─ Alt+key → handleAltCommand() [musical commands]
  ├─ Shift+arrow → handleShiftCommand() [selection extension]
  └─ Normal key → handleNormalKey() [navigation, text insertion]
         ↓
Call appropriate WASM function or JavaScript method
```

### 3.2 Key Classes and Methods

#### EventManager (Global Entry Point)
**File:** `/home/john/editor/src/js/events.js`

| Method | Purpose |
|--------|---------|
| `handleGlobalKeyDown()` | Main keyboard event interceptor (line 140) |
| `editorFocus()` | Check if editor has focus (line ~380) |
| `getKeyString()` | Normalize key name with modifiers (line ~400) |

#### KeyboardHandler (Command Routing)
**File:** `/home/john/editor/src/js/handlers/KeyboardHandler.js`

| Method | Purpose |
|--------|---------|
| `handleKeyboardEvent()` | Main dispatcher (line 21) |
| `handleNormalKey()` | Routes navigation, text input, Backspace, Delete, Enter (line 201) |
| `handleNavigation()` | Arrow keys, Home, End (line 236) |
| `handleCtrlCommand()` | Copy, Cut, Paste, Undo, Redo (line 126) |
| `handleAltCommand()` | Slur, octave, tala (line 74) |
| `handleShiftCommand()` | Selection extension (line 155) |

#### Editor (Command Implementation)
**File:** `/home/john/editor/src/js/editor.js`

| Method | Purpose |
|--------|---------|
| `handleKeyboardEvent()` | Delegates to KeyboardHandler (line 856) |
| `insertText()` | Insert character at cursor (line 225) |
| `handleBackspace()` | Delete backward (line ~) |
| `handleDelete()` | Delete forward (line ~) |
| `handleEnter()` | Insert new line (line ~) |
| `handleCopy()` | Copy selection (line ~) |
| `handlePaste()` | Paste from clipboard (line ~) |

---

## 4. Text Insertion Pipeline

### 4.1 Character Input Path

```
KeyboardHandler.handleNormalKey(key='a')
         ↓
Editor.insertText('a')  [line 225]
         ↓
WASMBridge.insertText(text)  [calls WASM]
         ↓
WASM: insert_text() [core.rs:1127]
         ↓
Returns EditResult {
  dirty_lines: Vec<DirtyLine>,
  new_cursor_row: usize,
  new_cursor_col: usize
}
         ↓
Update JavaScript document with dirty lines
         ↓
Update cursor position from WASM result
         ↓
renderAndUpdate() - Re-render affected lines
         ↓
updateCursorPositionDisplay() - Update header
         ↓
showCursor() - Display cursor
```

### 4.2 The insertText Implementation

**File:** `/home/john/editor/src/js/editor.js` (lines 225-305)

```javascript
async insertText(text) {
  // 1. Clear selection if active (standard editor behavior)
  if (this.hasSelection()) {
    this.clearSelection();
  }

  // 2. Call WASM function
  const result = this.wasmModule.insertText(text);

  // 3. Apply dirty lines to JavaScript document
  for (const dirtyLine of result.dirty_lines) {
    this.theDocument.lines[dirtyLine.row].cells = dirtyLine.cells;
  }

  // 4. Update cursor position
  this.theDocument.state.cursor.line = result.new_cursor_row;
  this.theDocument.state.cursor.col = result.new_cursor_col;

  // 5. Render changes
  await this.renderAndUpdate(dirtyLineIndices);

  // 6. Update UI displays
  this.updateCursorPositionDisplay();
  this.showCursor();
}
```

**Performance:** Timing breakdown is logged for each operation:
- WASM insertText execution
- Applying dirty lines
- DOM rendering
- Cursor position update display

---

## 5. Navigation and Cursor Movement

### 5.1 Arrow Key Handling

**Flow:**
```
KeyboardHandler.handleNormalKey(key='ArrowLeft')
         ↓
handleNavigation('ArrowLeft')  [line 236]
         ↓
WASMBridge.moveLeft(extend=false)  [line 253]
         ↓
WASM: move_left() [core.rs:2736]
         ↓
Returns CaretInfo (or SelectionInfo if extend=true) {
  caret: Pos,
  desired_col: u32
}
         ↓
Editor.updateCursorFromWASM(diff)
         ↓
Update cursor position and re-render
```

### 5.2 Selection Extension (Shift+Arrow)

**File:** `/home/john/editor/src/js/handlers/KeyboardHandler.js` (line 155)

When Shift+Arrow is pressed:
1. `handleShiftCommand()` is called
2. Calls `wasmModule.moveLeft(extend=true)` (or other directions)
3. WASM returns SelectionInfo with anchor and head positions
4. JavaScript updates selection state in document

---

## 6. WASM API Functions

### 6.1 Text Editing Functions

**File:** `/home/john/editor/src/api/core.rs`

| Function | Signature | Purpose |
|----------|-----------|---------|
| `insertText` | `pub fn insert_text(text: &str) -> Result<JsValue>` | Insert character(s) at cursor |
| `deleteAtCursor` | (implied) | Delete at cursor position |
| `insertNewline` | (implied) | Insert new line |

### 6.2 Cursor Movement Functions

| Function | Purpose |
|----------|---------|
| `moveLeft(extend)` | Move cursor left (or extend selection if extend=true) |
| `moveRight(extend)` | Move cursor right |
| `moveUp(extend)` | Move cursor up |
| `moveDown(extend)` | Move cursor down |
| `moveHome(extend)` | Move to line start |
| `moveEnd(extend)` | Move to line end |

### 6.3 WASM Bridge Mapping

**File:** `/home/john/editor/src/js/core/WASMBridge.js` (lines 32-134)

All WASM functions are mapped in `_initializeFunctionMappings()`:
```javascript
this.insertText = wasm.insertText;
this.deleteAtCursor = wasm.deleteAtCursor;
this.insertNewline = wasm.insertNewline;
this.moveLeft = wasm.moveLeft;
this.moveRight = wasm.moveRight;
// ... etc
```

These are called via `this.editor.wasmModule.functionName()` throughout the codebase.

---

## 7. Focus Flow Details

### 7.1 Editor Element Focus

**HTML Setup** (index.html, lines 559-566):
```html
<div id="notation-editor"
     data-testid="editor-root"
     class="notation-editor focusable"
     tabindex="0"
     role="textbox"
     aria-label="Music notation editor"
     aria-multiline="false"
     spellcheck="false">
```

**Focus Triggering Points:**
1. **Click anywhere in editor container** → `click` handler calls `element.focus()` (line 1975)
2. **Application startup** → `main.js` calls `focusEditor()` (line 180 in main.js)
3. **Menu item click** → Auto-focus editor after modal closes

### 7.2 Focus State Queries

```javascript
// Check if editor has focus
editorFocus() {
  const element = document.getElementById('notation-editor');
  return document.activeElement === element || 
         element.contains(document.activeElement);
}
```

---

## 8. Special Input Handling

### 8.1 Alt Key Combinations (Musical Commands)

**File:** `/home/john/editor/src/js/handlers/KeyboardHandler.js` (line 74)

```javascript
handleAltCommand(key) {
  switch (key.toLowerCase()) {
    case 's': this.editor.applySlur();        // Alt+S = Apply slur
    case 'u': this.editor.applyOctave(1);     // Alt+U = Upper octave
    case 'm': this.editor.applyOctave(0);     // Alt+M = Middle octave  
    case 'l': this.editor.applyOctave(-1);    // Alt+L = Lower octave
    case 't': this.editor.showTalaDialog();   // Alt+T = Tala dialog
  }
}
```

**Browser compatibility handling** (line 34-38):
```javascript
// Fix for browsers that return "alt" instead of actual key
if (modifiers.alt && (key === 'alt' || key === 'Alt')) {
  const code = event.code;
  if (code && code.startsWith('Key')) {
    key = code.replace('Key', '').toLowerCase();
  }
}
```

### 8.2 Ctrl Key Commands (Edit Operations)

**File:** `/home/john/editor/src/js/handlers/KeyboardHandler.js` (line 126)

- **Ctrl+C** → Copy
- **Ctrl+X** → Cut
- **Ctrl+V** → Paste
- **Ctrl+Z** → Undo
- **Ctrl+Y** → Redo

### 8.3 Global Shortcuts

**File:** `/home/john/editor/src/js/events.js` (lines 89-135)

- **Tab** → Tab navigation
- **Escape** → Close dialogs / clear selection
- **F1** → Show help
- **Alt+Shift+O** → Toggle ornament edit mode
- **Ctrl+Shift+D** → Toggle debug HUD

---

## 9. Gaps and Observations

### 9.1 Current Implementation Gaps

1. **No IME Composition Support**
   - No handlers for `compositionstart`, `compositionupdate`, `compositionend`
   - May cause issues with CJK input methods
   - Recommendation: Add composition event handlers

2. **No `beforeinput` Event**
   - Modern approach to text input interception
   - Currently relying only on `keydown`
   - Recommendation: Add `beforeinput` for better input handling consistency

3. **No Clipboard API Verification**
   - Cut/Copy/Paste implemented but no explicit Clipboard API integration shown
   - May fall back to deprecated methods
   - Recommendation: Verify modern Clipboard API is being used

4. **Selection Clearing Logic**
   - Manual selection clearing in click handler (line 2001)
   - Could potentially be unified with WASM selection API

### 9.2 Strong Points

1. ✅ **Clean separation of concerns** - EventManager → KeyboardHandler → WASM
2. ✅ **WASM-first architecture** - Text mutations happen in Rust, JavaScript is glue
3. ✅ **Proper focus management** - Focus state tracked separately from active element
4. ✅ **Performance monitoring** - Detailed timing logs for each operation
5. ✅ **Comprehensive keyboard routing** - All modifier combinations handled
6. ✅ **Accessibility** - Proper ARIA attributes, keyboard navigation

---

## 10. Connection Summary

### Data Flow Table

| Stage | Location | Responsibility |
|-------|----------|-----------------|
| **1. Event Capture** | `events.js:49` | Global `keydown` listener intercepts all keyboard events |
| **2. Focus Check** | `events.js:194` | Verify editor has focus before processing |
| **3. Routing** | `editor.js:856` | Delegate to KeyboardHandler |
| **4. Command Dispatch** | `KeyboardHandler.js:21` | Route to specific handler based on modifiers |
| **5. WASM Call** | `editor.js:225+` | Call appropriate WASM function (insertText, moveLeft, etc.) |
| **6. Mutation** | `core.rs` | WASM performs actual document mutation |
| **7. Result** | `editor.js:250+` | Apply dirty lines and update cursor |
| **8. Render** | `editor.js:272` | Re-render affected lines |
| **9. Display Update** | `editor.js:280+` | Update cursor position in header and visual display |

### WASM Function Availability

All WASM functions are properly exported via `#[wasm_bindgen]` and wrapped in WASMBridge:
- ✅ `insertText` - called by `editor.insertText()`
- ✅ `moveLeft/Right/Up/Down` - called by navigation handlers
- ✅ `moveHome/End` - called by navigation handlers
- ✅ Other edit operations properly exposed

---

## 11. Testing Recommendations

1. **Test keyboard focus restoration** after modal dialogs
2. **Test composition events** with CJK input methods (if not already done)
3. **Test Alt key on different keyboard layouts** (especially non-US layouts)
4. **Test Shift+Arrow selection** across line boundaries
5. **Test rapid key input** to verify WASM synchronization doesn't lag
6. **Test copy/paste** with special characters and ornaments

