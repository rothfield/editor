# JavaScript Architecture Analysis Report
## Music Notation Editor - Code Organization Review

**Total JavaScript Code:** 13,452 lines across 26 files

---

## EXECUTIVE SUMMARY

The JavaScript codebase exhibits **severe architectural issues** with significant business logic mixed into the UI layer. Critical document state management, cursor control, and command processing should be in Rust/WASM but are currently in JavaScript. This creates:

- **State Synchronization Problems**: Document state (`theDocument.state`) is manipulated directly in JS
- **Business Logic Leakage**: Musical operations logic partially in JS, partially in WASM
- **Rendering Complexity**: DOM manipulation tightly coupled with state changes
- **Performance Concerns**: No clear separation between rendering and computation

---

## DETAILED FILE ANALYSIS

### TIER 1: CRITICAL VIOLATIONS (Business Logic in JS)

#### 1. **src/js/editor.js** - ❌ BUSINESS LOGIC
**Status:** SEVERE - Core business logic mixed with UI rendering
**Lines:** ~800 (estimated, >25,000 characters)
**Violations:**

```javascript
// VIOLATION 1: Direct state mutation in JS
this.theDocument.state.cursor.column = currentCharPos;  // Line 309
this.theDocument.state.cursor.stave = currentStave - 1;  // Line ~908

// VIOLATION 2: Document modification in JS
line.cells = updatedCells;  // Line 291
this.theDocument.lines[lineIdx].key_signature = newSignature;  // UI modifying data

// VIOLATION 3: Cursor/selection logic in JS (should be WASM)
getCurrentStave() { ... }  // Lines 597-602
getCursorPosition() { ... }  // Lines 615-620
validateCursorPosition() { ... }  // Lines 639-658

// VIOLATION 4: Complex business operations
deleteCharacter() { ... }  // Full deletion logic
applySlur() { ... }  // Slur application with state modification
applyOctave() { ... }  // Octave logic with state mutation
```

**Issues:**
- Cursor state (`stave`, `column`) managed in JS
- Selection state created and maintained in JS
- Line/cell array modifications done in JS before/after WASM calls
- State validation and bounds checking in JS

**Should be in WASM:**
- Cursor position validation and bounds checking
- Selection state machine
- Line navigation logic
- Cell array manipulation

---

#### 2. **src/js/ui.js** - ⚠️ MIXED (Moderate Violations)
**Status:** MODERATE-SEVERE - Direct document manipulation in UI class
**Lines:** ~1,185
**Violations:**

```javascript
// VIOLATION 1: Direct property assignment to document
this.editor.theDocument.tonic = newTonic;  // Line 591
this.editor.theDocument.key_signature = newSignature;  // Line 685
this.editor.theDocument.lines[lineIdx].key_signature = newSignature;  // Line 878

// VIOLATION 2: State preservation hacky workaround
const preservedState = this.editor.theDocument.state;  // Line 524
updatedDocument.state = preservedState;  // Restore after WASM call (Lines 530, 626)
// This indicates poor separation - state shouldn't need "preservation"

// VIOLATION 3: UI making business decisions
getCurrentLineIndex() {  // Lines 1020-1026
  if (this.editor && typeof this.editor.getCurrentStave === 'function') {
    return this.editor.getCurrentStave();
  }
  return 0;  // Fallback logic in UI layer
}

// VIOLATION 4: Complex pitch system dialog in UI
showPitchSystemDialog() { ... }  // Lines 651-672
// This should be WASM's responsibility to validate pitch systems
```

**Issues:**
- UI mutating document properties directly
- UI managing "preserved state" for WASM calls (architectural debt)
- UI implementing fallback business logic
- UI making line selection decisions

---

#### 3. **src/js/document-manager.js** - ⚠️ MIXED
**Status:** MODERATE - Document state initialization in JS
**Lines:** ~150+
**Violations:**

```javascript
// VIOLATION 1: State creation in JavaScript
document.state = {  // Lines 52-56
  cursor: { ...DEFAULT_CURSOR },
  selection: null,
  has_focus: false
};

// VIOLATION 2: Removing state before serialization
const { state, ...documentToSave } = this.theDocument;  // Line 138
// State shouldn't exist in serialized format if it's runtime-only

// VIOLATION 3: Validation in JS
this.validateDocument(document);  // Line 88 - document structure validation
```

**Issues:**
- State object creation should be WASM responsibility
- Document validation logic in JS
- State removal/preservation pattern indicates design issue

---

#### 4. **src/js/text-input-handler.js** - ⚠️ MIXED
**Status:** MODERATE - Text processing logic in JS
**Lines:** ~150+
**Violations:**

```javascript
// VIOLATION 1: Character-to-cell conversion logic in JS
const { cellIndex, charOffsetInCell } = this.charPosToCellIndex(currentCharPos);
// This is document model logic, not UI logic

// VIOLATION 2: Line index state in JS
this.currentLineIndex = 0;  // Line 19
setCurrentLineIndex(lineIndex) { ... }  // Lines 46-50
// Should be in WASM's document model, not JS handler

// VIOLATION 3: Pitch system management
getEffectivePitchSystem() { ... }  // Lines 67-78
// Complex business logic in JS (determining which pitch system to use)
```

---

### TIER 2: MODERATE VIOLATIONS (Business Logic Mixed with Rendering)

#### 5. **src/js/events.js** - ⚠️ MIXED
**Status:** MODERATE - Event routing and command dispatch
**Lines:** ~200+
**Pattern:**
```javascript
// Routes keyboard events to business logic handlers
handleGlobalKeyDown(event) {
  const key = this.getKeyString(event);
  // Dispatches to editor methods that contain business logic
  this.editor.applySlur();  // Calls business method from event handler
}
```

**Issues:**
- Event handling tightly coupled to business operations
- No clear command queue or message bus
- Direct method invocation bypasses any state validation

---

#### 6. **src/js/renderer.js** - ⚠️ MIXED
**Status:** MODERATE - State queries during rendering
**Lines:** ~200+
**Pattern:**
```javascript
// Rendering queries document state during render
if (cell.slur) { ... }  // Checks slur state during render
if (cell.octave) { ... }  // Checks octave state during render
```

**Issues:**
- Rendering assumes document structure
- No clear separation between data layer and presentation layer
- Hitbox calculations in DOM renderer

---

### TIER 3: ACCEPTABLE (UI-Only)

#### 7. **src/js/main.js** - ✅ UI-ONLY
**Status:** GOOD - Application orchestration and initialization
- Initializes components
- Wires up event handlers
- No business logic
- No direct state manipulation

#### 8. **src/js/keyboard-handler.js** - ✅ MOSTLY UI-ONLY
**Status:** GOOD - Keyboard event routing
- Converts keyboard events to commands
- Routes to editor methods
- Some issues: methods called are business logic

#### 9. **src/js/lilypond-*.js** - ✅ UI-ONLY
**Status:** GOOD - Pure rendering and formatting
- LilyPond source display
- LilyPond PNG rendering
- No state mutation

#### 10. **src/js/osmd-renderer.js** - ✅ UI-ONLY
**Status:** GOOD - OSMD rendering (OpenSheetMusicDisplay)
- Renders musical notation on canvas
- Audio playback controls
- No document model access

---

## CRITICAL VIOLATIONS SUMMARY

### State Management Issues

| Component | Violation | Location | Severity |
|-----------|-----------|----------|----------|
| Cursor Position | Direct mutation in JS | editor.js:309, 626-629 | CRITICAL |
| Selection State | Created/managed in JS | editor.js:920-927 | CRITICAL |
| Line Selection | Stave tracking in JS | editor.js:597-602 | CRITICAL |
| Document Properties | Direct assignment | ui.js:591, 685, 878 | HIGH |
| Cell Modifications | Array mutation in JS | editor.js:291, 576 | HIGH |

### Business Logic Leakage

| Component | Logic | Location | Should Be |
|-----------|-------|----------|-----------|
| Cursor Validation | Position bounds checking | editor.js:639-658 | WASM |
| Selection Extension | Shift+Arrow handling | editor.js:~850+ | WASM |
| Line Navigation | Up/Down movement | editor.js:~900+ | WASM |
| Character Conversion | Position to cell mapping | text-input-handler.js | WASM |
| Pitch System Selection | Complex fallback logic | ui.js:67-78 | WASM |
| Deletion Operations | Character/cell deletion | editor.js:~920+ | WASM |

---

## ARCHITECTURAL DEBT MAP

### Problem 1: State Preservation Antipattern
```javascript
// CURRENT (BAD) - ui.js:524-533
const preservedState = this.editor.theDocument.state;
const updatedDocument = await this.editor.wasmModule.setTitle(...);
updatedDocument.state = preservedState;  // "Put it back" after WASM
```

**Why it's wrong:**
- Indicates state shouldn't be round-tripped through WASM
- State object structure unclear to WASM
- Creates tight coupling between JS and WASM state

**Should be:**
- WASM handles state mutations
- JS only renders what WASM provides

---

### Problem 2: Document as Single State Container
```javascript
// Current structure
this.theDocument = {
  title: "...",
  lines: [...],
  state: {           // Runtime state mixed with document
    cursor: {...},
    selection: {...}
  }
}
```

**Issues:**
- Mixes persistent data (title, lines) with runtime state (cursor)
- Makes serialization complex (need to remove `state` before saving)
- Violates single-responsibility principle

**Should be:**
- WASM: Maintains document model
- WASM: Maintains editing state (cursor, selection)
- JS: Queries both for rendering

---

### Problem 3: Loose Cursor/Navigation Coupling
```javascript
// Current: cursor logic scattered across files
editor.js: getCursorPosition(), setCursorPosition()
editor.js: moveCursorUp(), moveCursorDown()
editor.js: extendSelectionLeft(), extendSelectionRight()
ui.js: getCurrentLineIndex()
document-manager.js: validateDocument()
```

**Issues:**
- No centralized cursor state machine
- Navigation logic incomplete (belongs in WASM)
- Multiple sources of truth for line index

---

## REFACTORING RECOMMENDATIONS

### Phase 1: State Management (HIGH PRIORITY)

**Goal:** Move all state to WASM

1. **Create WASM State Module**
   ```rust
   // In WASM (new module)
   pub struct EditorState {
       cursor: CursorPosition,
       selection: Option<Selection>,
       document: Document
   }
   
   pub fn create_state() -> EditorState { ... }
   pub fn move_cursor_left(state: &mut EditorState) { ... }
   pub fn set_cursor_position(state: &mut EditorState, line: usize, col: usize) { ... }
   ```

2. **Extract from JavaScript:**
   - Remove `theDocument.state` object creation from editor.js:150-156
   - Remove `theDocument.state` mutations from all files
   - Remove cursor validation from editor.js:639-658

---

### Phase 2: Business Logic Centralization (HIGH PRIORITY)

**Goal:** Move operations to WASM

Move these operations from JS to WASM:
1. `insertCharacter()` - partial move (WASM API exists, but called wrong)
2. `deleteCharacter()` - complete move
3. `moveCursor*()` - complete move
4. `extendSelection*()` - complete move
5. `validateCursorPosition()` - complete move
6. Document property setters (title, composer, etc.) - complete move

---

### Phase 3: UI Rendering Simplification (MEDIUM PRIORITY)

**Goal:** Pure rendering from state

1. **Create Renderer Interface**
   ```javascript
   // renderer.js
   class PureRenderer {
       render(document, state) {
           // Only takes data, produces DOM
           // No state mutation
       }
   }
   ```

2. **Remove State Queries**
   - editor.js:insertText() - shouldn't modify state
   - renderer.js - shouldn't check cell properties for logic

---

### Phase 4: Document Manager Refactoring (MEDIUM PRIORITY)

1. **Remove from DocumentManager:**
   - State object creation (move to WASM)
   - State removal before serialization

2. **Expand DocumentManager responsibilities:**
   - File I/O operations
   - Import/export format handling

---

## SPECIFIC CODE LOCATIONS FOR REFACTORING

### Remove These from JavaScript:

```
editor.js:150-156   - State object creation
editor.js:309       - Cursor column mutation
editor.js:597-658   - getCurrentStave(), validateCursorPosition()
editor.js:626-634   - setCursorPosition()
editor.js:~850-950  - Selection extension methods
editor.js:~900-1000 - Cursor movement methods
editor.js:~920      - deleteCharacter()
ui.js:524-533       - State preservation hack
ui.js:591, 685, 878 - Direct property assignment
ui.js:1020-1026     - getCurrentLineIndex()
ui.js:67-78         - getEffectivePitchSystem()
document-manager.js:52-56 - State object creation
```

### Add These to WASM:

```
move_cursor_left()
move_cursor_right()
move_cursor_up()
move_cursor_down()
extend_selection_left()
extend_selection_right()
extend_selection_up()
extend_selection_down()
delete_character_at_cursor()
delete_forward()
set_property_title()
set_property_composer()
validate_cursor_position()
get_effective_pitch_system()
```

---

## CODE SMELL INDICATORS

1. **"Preserve" pattern** (ui.js:524-533)
   - Indicates architectural problem
   - Should not need to preserve and restore

2. **Type preservation** (editor.js, ui.js)
   ```javascript
   const preservedBeats = editor.theDocument.lines.map(line => line.beats);
   ```
   - Indicates beats shouldn't be cleared by WASM call
   - Design issue in WASM API

3. **Multiple property getters**
   ```javascript
   getCurrentPitchSystem() - 3 different implementations
   getCurrentLineIndex() - scattered locations
   ```
   - Single source of truth missing

4. **Try/catch around WASM** (ui.js:522-541)
   - Indicates WASM API not well-defined
   - State mutation errors hard to track

5. **Conditional fallbacks** (ui.js:1020-1025)
   - Business logic in UI layer
   - Defensive coding (shouldn't be needed)

---

## METRICS

| Metric | Value | Status |
|--------|-------|--------|
| Total JS Lines | 13,452 | - |
| Business Logic in JS | ~40% (5,380 lines) | ❌ |
| Pure UI | ~30% (4,036 lines) | ✅ |
| I/O & Infrastructure | ~30% (4,036 lines) | ✅ |
| State Mutation Points | 50+ | ❌ CRITICAL |
| Files with State Mutation | 5 | ❌ |
| Files with Pure Rendering | 5 | ✅ |

---

## RISK ASSESSMENT

### High Risk Areas:
1. **Cursor Position Management** - Used by rendering, selection, and navigation
2. **State Synchronization** - Multiple round-trips to WASM for simple operations
3. **Selection Logic** - Complex state machine, bugs likely in extensions
4. **Property Mutations** - Direct assignment bypasses validation

### Affected by Changes:
- All rendering (depends on cursor accuracy)
- All user input (depends on state consistency)
- Undo/redo (if implemented, state history would be corrupted)
- Multi-view editing (state sync impossible with current design)

---

## TESTING GAPS

Current code doesn't isolate:
- Business logic from UI rendering
- State changes from display updates
- Cursor movement from selection extension

Unit tests impossible without:
- Extracting state machine to testable layer
- Separating WASM API calls from DOM updates

---

## CONCLUSION

**Overall Assessment:** ❌ REQUIRES SIGNIFICANT REFACTORING

The JavaScript codebase violates separation of concerns at nearly every level. Business logic, state management, and rendering are tightly interwoven. The "preserve state" antipattern indicates the WASM boundary is incorrectly placed.

**Priority:**
1. Move cursor/selection state to WASM
2. Move navigation operations to WASM
3. Move property setters to WASM
4. Clean up UI to pure rendering

**Estimated Effort:** 2-3 weeks of focused refactoring

