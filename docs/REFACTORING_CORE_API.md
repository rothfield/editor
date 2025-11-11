# src/api/core.rs Refactoring Analysis

## Executive Summary

The `core.rs` file contains **63 public functions** across **4,151 lines**, making it the largest and most complex module in the WASM API. This analysis provides a detailed breakdown for safe, incremental refactoring.

## File Statistics

- **Total lines**: 4,151
- **Public functions**: 63
- **Private functions**: 5 (helper functions)
- **Test functions**: 2
- **Struct definitions**: 3 (DirtyLine, EditResult, CopyResult)
- **Global state**: 1 (DOCUMENT mutex)
- **Macros**: 4 (wasm_log, wasm_info, wasm_warn, wasm_error)

## Current Dependencies

### Imports (Lines 6-14)
```rust
use wasm_bindgen::prelude::*;
use crate::models::{Cell, PitchSystem, Document, Line, Pos, EditorDiff, CaretInfo, SelectionInfo, ElementKind, StaffRole};
use crate::parse::grammar::{parse_single, mark_continuations};
use crate::parse::grammar::parse; // #[cfg(test)]
use std::sync::Mutex;
use lazy_static::lazy_static;
use js_sys;
```

### Global State (Lines 16-19)
```rust
lazy_static! {
    static ref DOCUMENT: Mutex<Option<Document>> = Mutex::new(None);
}
```

This global state is **critical** - it's shared by all functions and must remain in a single location during refactoring.

## Function Categories (Detailed Breakdown)

### 1. **Legacy Slur Operations** (Lines 95-280, 3 functions)

**Status**: DEPRECATED - marked for removal

| Line | Function | JS Called? | Notes |
|------|----------|------------|-------|
| 106 | `apply_slur_legacy` | ❌ No | Phase 0 API, takes cell arrays |
| 179 | `remove_slur_legacy` | ❌ No | Phase 0 API, takes cell arrays |
| 246 | `has_slur_in_selection` | ✅ Yes | Used in handlers/KeyboardHandler.js |

**Dependencies**:
- Models: Cell
- No DOCUMENT mutex access

**Refactoring Risk**: LOW
- Only `has_slur_in_selection` is actively used
- Can be moved to `slurs.rs` module
- Legacy functions can be deleted after confirming no JS references

**JavaScript Usage**:
```javascript
// src/js/handlers/KeyboardHandler.js (line ~150)
const hasSlur = this.editor.wasmModule.hasSlurInSelection(cells, start, end);
```

---

### 2. **Document Metadata** (Lines 288-925, 13 functions)

**Status**: ACTIVE - split between legacy (Phase 0) and modern (Phase 1) APIs

| Line | Function | JS Called? | DOCUMENT Access | Notes |
|------|----------|------------|-----------------|-------|
| 298 | `set_title_legacy` | ❌ No | No | DEPRECATED |
| 332 | `set_title` | ✅ Yes | Yes | Active |
| 359 | `set_composer_legacy` | ❌ No | No | DEPRECATED |
| 393 | `set_composer` | ✅ Yes | Yes | Active |
| 420 | `set_document_pitch_system_legacy` | ❌ No | No | DEPRECATED |
| 467 | `set_document_pitch_system` | ✅ Yes | Yes | Active (setDocumentPitchSystem in JS) |
| 526 | `get_navigable_indices` | ✅ Yes | No | Takes line_js param |
| 577 | `set_line_lyrics` | ✅ Yes | No | Takes document_js param (legacy style) |
| 625 | `set_line_tala` | ✅ Yes | No | Takes document_js param (legacy style) |
| 679 | `set_line_pitch_system` | ✅ Yes | No | Takes document_js param (legacy style) |
| 740 | `set_line_label` | ✅ Yes | No | Takes document_js param (legacy style) |
| 792 | `set_line_new_system` | ✅ Yes | No | Takes document_js param (legacy style) |
| 879 | `set_line_staff_role` | ✅ Yes | Yes | Modern API (uses DOCUMENT mutex) |

**Dependencies**:
- Models: Document, Line, PitchSystem, StaffRole
- Parser: expand_ornaments_to_cells, collapse_ornaments_from_cells (deprecated helpers)
- Global: DOCUMENT mutex (some functions)

**Refactoring Risk**: MEDIUM
- Mix of legacy (Phase 0) and modern (Phase 1) APIs
- Some functions take `document_js` parameter (legacy)
- Others use DOCUMENT mutex (modern)
- Need to maintain both patterns during transition

**JavaScript Usage**:
```javascript
// Document-level metadata (modern API)
editor.wasmModule.setTitle("My Song");
editor.wasmModule.setComposer("John Doe");
editor.wasmModule.setDocumentPitchSystem(1); // Number system

// Line-level properties (legacy API - takes document_js)
editor.wasmModule.setLineLyrics(document, 0, "La la la");
editor.wasmModule.setLineTala(document, 0, "1234");

// Line-level properties (modern API - uses DOCUMENT)
editor.wasmModule.setLineStaffRole(0, "vocal");
```

**Recommended Module**: `documents.rs` (document-level), `lines.rs` (line-level)

---

### 3. **Core Edit Primitive** (Lines 927-1099, 1 function)

**Status**: CRITICAL - single mutation entry point

| Line | Function | JS Called? | DOCUMENT Access | Notes |
|------|----------|------------|-----------------|-------|
| 937 | `edit_replace_range` | ✅ Yes | Yes | **ONLY** function that mutates DOCUMENT |

**Dependencies**:
- Models: Document, EditorDiff, CaretInfo, SelectionInfo
- Parser: parse_single, mark_continuations
- Global: DOCUMENT mutex (critical!)

**Refactoring Risk**: **CRITICAL - DO NOT MOVE**
- This is the **single source of truth** for all document mutations
- Records undo history
- Called by insertText, deleteAtCursor, paste, etc.
- Must remain accessible to all edit operations

**JavaScript Usage**:
```javascript
// src/js/utils/editorHelpers.js
const diff = editor.wasmModule.editReplaceRange(startRow, startCol, endRow, endCol, text);
```

**Recommendation**: Keep in core.rs or create dedicated `edit_primitive.rs` if extracting

---

### 4. **Text Editing Operations** (Lines 1100-1460, 3 functions)

**Status**: ACTIVE - primary user text input handlers

| Line | Function | JS Called? | DOCUMENT Access | Notes |
|------|----------|------------|-----------------|-------|
| 1108 | `insert_text` | ✅ Yes | Yes | Called on every keystroke |
| 1219 | `delete_at_cursor` | ✅ Yes | Yes | Backspace/Delete handler |
| 1350 | `insert_newline` | ✅ Yes | Yes | Enter key handler |

**Dependencies**:
- Calls: edit_replace_range (critical dependency!)
- Models: EditorDiff, CaretInfo, SelectionInfo
- Global: DOCUMENT mutex

**Refactoring Risk**: MEDIUM
- Tightly coupled to edit_replace_range
- If moving, must ensure edit_replace_range remains accessible

**JavaScript Usage**:
```javascript
// src/js/handlers/KeyboardHandler.js
editor.wasmModule.insertText(char);
editor.wasmModule.deleteAtCursor();
editor.wasmModule.insertNewline();
```

**Recommended Module**: `text_editing.rs` or `mutations.rs`

---

### 5. **Octave Operations** (Lines 1461-1573, 1 function)

**Status**: ACTIVE - musical annotation

| Line | Function | JS Called? | DOCUMENT Access | Notes |
|------|----------|------------|-----------------|-------|
| 1467 | `apply_octave` | ✅ Yes | Yes | Toggle octave dots on selected notes |

**Dependencies**:
- Models: Cell, EditorDiff
- Global: DOCUMENT mutex

**Refactoring Risk**: LOW
- Self-contained operation
- Uses selection state from DOCUMENT

**JavaScript Usage**:
```javascript
// src/js/handlers/KeyboardHandler.js (Ctrl+1, Ctrl+2, etc.)
editor.wasmModule.applyOctave(1); // Add dot above
```

**Recommended Module**: `annotations.rs` or `octave.rs`

---

### 6. **Slur Operations** (Lines 1574-1764, 2 functions)

**Status**: ACTIVE - musical phrasing

| Line | Function | JS Called? | DOCUMENT Access | Notes |
|------|----------|------------|-----------------|-------|
| 1580 | `apply_slur` | ✅ Yes | Yes | Add slur to selection |
| 1689 | `remove_slur` | ✅ Yes | Yes | Remove slur from selection |

**Dependencies**:
- Models: Cell, SlurIndicator, EditorDiff
- Global: DOCUMENT mutex

**Refactoring Risk**: LOW
- Self-contained operations
- Uses selection state from DOCUMENT

**JavaScript Usage**:
```javascript
// src/js/handlers/KeyboardHandler.js (Ctrl+L)
editor.wasmModule.applySlur();
editor.wasmModule.removeSlur();
```

**Recommended Module**: `slurs.rs`

---

### 7. **Copy/Paste Operations** (Lines 1765-1959, 2 functions)

**Status**: ACTIVE - clipboard operations

| Line | Function | JS Called? | DOCUMENT Access | Notes |
|------|----------|------------|-----------------|-------|
| 1770 | `copy_cells` | ✅ Yes | Yes (read-only) | Copy cells to clipboard |
| 1819 | `paste_cells` | ✅ Yes | Yes | Paste cells from clipboard |

**Dependencies**:
- Calls: edit_replace_range (paste only)
- Models: Cell, CopyResult, EditorDiff
- Global: DOCUMENT mutex

**Refactoring Risk**: MEDIUM
- `paste_cells` depends on edit_replace_range
- Must maintain access to shared edit primitive

**JavaScript Usage**:
```javascript
// src/js/handlers/KeyboardHandler.js
const copyResult = editor.wasmModule.copyCells(startRow, startCol, endRow, endCol);
const diff = editor.wasmModule.pasteCells(cells, text);
```

**Recommended Module**: `clipboard.rs`

---

### 8. **Primary Selection** (Lines 1960-2030, 2 functions)

**Status**: ACTIVE - X11-style middle-click paste

| Line | Function | JS Called? | DOCUMENT Access | Notes |
|------|----------|------------|-----------------|-------|
| 1966 | `get_primary_selection` | ✅ Yes | Yes (read-only) | Get selected text |
| 1992 | `update_primary_selection` | ✅ Yes | Yes | Update primary buffer |

**Dependencies**:
- Models: Cell
- Global: DOCUMENT mutex

**Refactoring Risk**: LOW
- Self-contained operations
- Read-only access to DOCUMENT

**JavaScript Usage**:
```javascript
// src/js/handlers/MouseHandler.js
const selection = editor.wasmModule.getPrimarySelection();
editor.wasmModule.updatePrimarySelection();
```

**Recommended Module**: `clipboard.rs` (alongside copy/paste)

---

### 9. **Undo/Redo Operations** (Lines 2031-2150, 4 functions)

**Status**: CRITICAL - history management

| Line | Function | JS Called? | DOCUMENT Access | Notes |
|------|----------|------------|-----------------|-------|
| 2036 | `undo` | ✅ Yes | Yes | Restore previous state |
| 2085 | `redo` | ✅ Yes | Yes | Restore future state |
| 2135 | `can_undo` | ✅ Yes | Yes (read-only) | Check history |
| 2144 | `can_redo` | ✅ Yes | Yes (read-only) | Check history |

**Dependencies**:
- Models: Document, EditorDiff, DocumentAction
- Global: DOCUMENT mutex (critical!)

**Refactoring Risk**: HIGH
- Tightly coupled to document.state.history
- Used by all mutation operations
- Must maintain access to DOCUMENT

**JavaScript Usage**:
```javascript
// src/js/handlers/KeyboardHandler.js (Ctrl+Z, Ctrl+Shift+Z)
editor.wasmModule.undo();
editor.wasmModule.redo();

// UI updates
const canUndo = editor.wasmModule.canUndo();
const canRedo = editor.wasmModule.canRedo();
```

**Recommended Module**: `undo.rs` or keep in core.rs (due to tight coupling with DOCUMENT)

---

### 10. **Document Lifecycle** (Lines 2151-2250, 3 functions)

**Status**: CRITICAL - document state management

| Line | Function | JS Called? | DOCUMENT Access | Notes |
|------|----------|------------|-----------------|-------|
| 2157 | `load_document` | ✅ Yes | Yes | Load JS document into WASM |
| 2185 | `get_document_snapshot` | ✅ Yes | Yes (read-only) | Export WASM doc to JS |
| 2206 | `create_new_document` | ✅ Yes | Yes | Create new empty doc |

**Dependencies**:
- Models: Document, Line, PitchSystem
- Global: DOCUMENT mutex (critical!)

**Refactoring Risk**: **CRITICAL - DO NOT MOVE**
- These functions manage the DOCUMENT mutex
- Called at initialization and during save/load
- Must remain accessible to all operations

**JavaScript Usage**:
```javascript
// src/js/editor.js - initialization
editor.wasmModule.createNewDocument();
editor.wasmModule.loadDocument(document);
const snapshot = editor.wasmModule.getDocumentSnapshot();
```

**Recommendation**: Keep in core.rs or create dedicated `document_lifecycle.rs`

---

### 11. **Export Operations** (Lines 2251-2615, 6 functions)

**Status**: ACTIVE - format conversion

| Line | Function | JS Called? | DOCUMENT Access | Notes |
|------|----------|------------|-----------------|-------|
| 2252 | `export_musicxml` | ✅ Yes | Yes (read-only) | Export to MusicXML |
| 2295 | `generate_ir_json` | ✅ Yes | Yes (read-only) | Export to IR (debug) |
| 2337 | `export_midi` | ✅ Yes | Yes (read-only) | Export to MIDI |
| 2427 | `convert_musicxml_to_lilypond` | ✅ Yes | No | Static converter |
| 2476 | `compute_layout` | ✅ Yes | No | Takes document_js param |
| 2533 | `split_line_at_position` | ❌ No | No | Takes document_js param (unused?) |

**Dependencies**:
- Renderers: musicxml::to_musicxml, musicxml::line_to_ir
- Converters: musicxml_to_midi, convert_musicxml_to_lilypond
- Layout: html_layout::compute_layout
- Global: DOCUMENT mutex (some functions)

**Refactoring Risk**: LOW-MEDIUM
- Most are read-only operations
- `convert_musicxml_to_lilypond` and `compute_layout` are stateless
- Can be easily moved to separate module

**JavaScript Usage**:
```javascript
// src/js/managers/ExportManager.js
const musicxml = editor.wasmModule.exportMusicXML();
const midi = editor.wasmModule.exportMIDI(480);
const ir = editor.wasmModule.generateIRJson();

// src/js/lilypond-tab.js
const result = editor.wasmModule.convertMusicXMLToLilyPond(musicxml, settings);

// src/js/renderer.js
const displayList = editor.wasmModule.computeLayout(document, config);
```

**Recommended Module**: `export.rs` (for MusicXML/MIDI/IR), `layout.rs` (for compute_layout)

---

### 12. **Cursor/Selection API** (Lines 2618-2714, 6 functions)

**Status**: ACTIVE - selection state management

| Line | Function | JS Called? | DOCUMENT Access | Notes |
|------|----------|------------|-----------------|-------|
| 2624 | `get_caret_info` | ✅ Yes | Yes (read-only) | Get cursor position |
| 2641 | `get_selection_info` | ✅ Yes | Yes (read-only) | Get selection bounds |
| 2660 | `set_selection` | ✅ Yes | Yes | Set anchor/head |
| 2678 | `clear_selection` | ✅ Yes | Yes | Clear selection |
| 2690 | `start_selection` | ✅ Yes | Yes | Begin selection |
| 2703 | `extend_selection` | ✅ Yes | Yes | Extend to cursor |

**Dependencies**:
- Models: CaretInfo, SelectionInfo, Pos
- Global: DOCUMENT mutex

**Refactoring Risk**: HIGH
- Tightly coupled to DOCUMENT.state.selection_manager
- Used by cursor movement and mouse operations
- Must maintain access to shared state

**JavaScript Usage**:
```javascript
// src/js/handlers/MouseHandler.js, KeyboardHandler.js
const caretInfo = editor.wasmModule.getCaretInfo();
const selection = editor.wasmModule.getSelectionInfo();
editor.wasmModule.setSelection(anchor, head);
editor.wasmModule.clearSelection();
```

**Recommendation**: Keep in core.rs or create `selection.rs` with careful DOCUMENT access

---

### 13. **Cursor Movement** (Lines 2715-2945, 6 functions)

**Status**: ACTIVE - keyboard navigation

| Line | Function | JS Called? | DOCUMENT Access | Notes |
|------|----------|------------|-----------------|-------|
| 2740 | `move_left` | ✅ Yes | Yes | Left arrow key |
| 2785 | `move_right` | ✅ Yes | Yes | Right arrow key |
| 2830 | `move_up` | ✅ Yes | Yes | Up arrow key |
| 2864 | `move_down` | ✅ Yes | Yes | Down arrow key |
| 2898 | `move_home` | ✅ Yes | Yes | Home key |
| 2924 | `move_end` | ✅ Yes | Yes | End key |

**Dependencies**:
- Models: EditorDiff, CaretInfo, SelectionInfo
- Helpers: create_editor_diff (private function in core.rs)
- Global: DOCUMENT mutex

**Refactoring Risk**: HIGH
- Tightly coupled to DOCUMENT.state.cursor
- Uses create_editor_diff helper (line 2717)
- Called on every arrow key press

**JavaScript Usage**:
```javascript
// src/js/handlers/KeyboardHandler.js
editor.wasmModule.moveLeft(extend);
editor.wasmModule.moveRight(extend);
editor.wasmModule.moveUp(extend);
editor.wasmModule.moveDown(extend);
```

**Recommendation**: Keep in core.rs or create `cursor_movement.rs` with shared helpers

---

### 14. **Mouse Operations** (Lines 2946-3178, 5 functions)

**Status**: ACTIVE - mouse input handling

| Line | Function | JS Called? | DOCUMENT Access | Notes |
|------|----------|------------|-----------------|-------|
| 2950 | `mouse_down` | ✅ Yes | Yes | Mouse down event |
| 2970 | `mouse_move` | ✅ Yes | Yes | Mouse drag event |
| 2989 | `mouse_up` | ✅ Yes | Yes | Mouse release event |
| 3019 | `select_beat_at_position` | ✅ Yes | Yes | Double-click selection |
| 3144 | `select_line_at_position` | ✅ Yes | Yes | Triple-click selection |

**Dependencies**:
- Models: Pos, EditorDiff
- Parser: BeatDeriver (for beat selection)
- Helpers: create_editor_diff
- Global: DOCUMENT mutex

**Refactoring Risk**: HIGH
- Tightly coupled to DOCUMENT.state.cursor and selection_manager
- Uses create_editor_diff helper
- Called on every mouse event

**JavaScript Usage**:
```javascript
// src/js/handlers/MouseHandler.js
editor.wasmModule.mouseDown(pos);
editor.wasmModule.mouseMove(pos);
editor.wasmModule.mouseUp(pos);
editor.wasmModule.selectBeatAtPosition(pos);
editor.wasmModule.selectLineAtPosition(pos);
```

**Recommendation**: Keep in core.rs or create `mouse.rs` with shared helpers

---

### 15. **Ornament Operations** (Lines 3179-end, 6 functions)

**Status**: MIXED - modern + deprecated functions

| Line | Function | JS Called? | DOCUMENT Access | Notes |
|------|----------|------------|-----------------|-------|
| 3184 | `copy_ornament` | ❌ No? | Yes (read-only) | Modern API |
| 3232 | `clear_ornament` | ✅ Yes | Yes | Modern API |
| 3277 | `set_ornament_placement` | ✅ Yes | Yes | Modern API |
| 3329 | `copy_ornament_as_notation` | ❌ No | Yes (read-only) | DEPRECATED |
| 3358 | `paste_ornament` | ✅ Yes | Yes | Modern API |
| 3427 | `paste_ornament_from_notation` | ❌ No | Yes | DEPRECATED |

**Dependencies**:
- Models: Cell, Ornament, OrnamentPlacement, EditorDiff
- Helpers: create_editor_diff
- Global: DOCUMENT mutex

**Refactoring Risk**: LOW-MEDIUM
- Modern functions use WASM-first pattern (no cell_index param)
- Deprecated functions can be removed
- Uses create_editor_diff helper

**JavaScript Usage**:
```javascript
// Modern API (WASM-first)
editor.wasmModule.clearOrnamentFromCell();
editor.wasmModule.setOrnamentPlacementOnCell(placement);
editor.wasmModule.pasteOrnamentCells(notation, placement);
```

**Recommended Module**: `ornaments.rs`

---

## Shared Helper Functions (Private)

### Private Functions in core.rs

| Line | Function | Used By | Purpose |
|------|----------|---------|---------|
| 23 | `lock_document()` | ALL | Safe DOCUMENT mutex access |
| 501 | `expand_ornaments_to_cells()` | DEPRECATED | Legacy ornament expansion |
| 509 | `collapse_ornaments_from_cells()` | DEPRECATED | Legacy ornament collapse |
| 2717 | `create_editor_diff()` | Cursor/Mouse/Ornament | Build EditorDiff responses |

**Critical Dependencies**:
- `lock_document()` is used by **45+ functions** - must remain accessible
- `create_editor_diff()` is used by **15+ functions** - must remain accessible or be duplicated

---

## Shared Types (Lines 73-93)

### Structs Defined in core.rs

```rust
// Lines 73-78
pub struct DirtyLine {
    pub row: usize,
    pub cells: Vec<Cell>,
}

// Lines 80-86
pub struct EditResult {
    pub dirty_lines: Vec<DirtyLine>,
    pub new_cursor_row: usize,
    pub new_cursor_col: usize,
}

// Lines 88-93
pub struct CopyResult {
    pub text: String,
    pub cells: Vec<Cell>,
}
```

**Usage**:
- `DirtyLine`: Unused (legacy)
- `EditResult`: Used by cells.rs (can be moved to models)
- `CopyResult`: Used by copy_cells (can be moved to clipboard module)

---

## JavaScript Integration Map

### WASMBridge Function List (src/js/core/WASMBridge.js)

All 63 functions are wrapped in WASMBridge for error handling. Key active functions:

**High-frequency calls** (called on every keystroke/mouse move):
- insertText, deleteAtCursor
- moveLeft, moveRight, moveUp, moveDown
- mouseDown, mouseMove, mouseUp
- getCaretInfo, getSelectionInfo

**Document lifecycle** (called at startup/save/load):
- createNewDocument, loadDocument, getDocumentSnapshot

**Export operations** (called when user exports):
- exportMusicXML, exportMIDI, generateIRJson, convertMusicXMLToLilyPond

**Annotations** (called when user applies):
- applyOctave, applySlur, removeSlur
- pasteOrnamentCells, clearOrnamentFromCell

**Undo/Redo** (called on Ctrl+Z, Ctrl+Shift+Z):
- undo, redo, canUndo, canRedo

---

## Test Coverage

### Test Files Exercising core.rs Functions

| Test File | Functions Tested | Location |
|-----------|------------------|----------|
| `tests/title_test.rs` | set_title, set_composer | Integration test |
| `tests/lyrics_test.rs` | set_line_lyrics | Integration test |
| `tests/midi_test.rs` | export_midi | Integration test |
| `tests/ornament_ir_unit_test.rs` | generate_ir_json | Unit test |
| `core.rs #[cfg(test)]` | cursor targeting logic | Unit tests (lines 3474-4151) |

**Coverage gaps**:
- No tests for: mouse operations, cursor movement, selection API
- Most functions only tested through E2E Playwright tests

---

## Refactoring Strategy Recommendations

### Phase 1: Low-Risk Extractions (Can be done immediately)

#### 1.1 Export Operations → `export.rs`
**Functions**: export_musicxml, generate_ir_json, export_midi, convert_musicxml_to_lilypond
**Risk**: LOW
**Dependencies**: Read-only DOCUMENT access
**Benefit**: 4 functions, ~380 lines removed

#### 1.2 Ornament Operations → `ornaments.rs`
**Functions**: copy_ornament, clear_ornament, set_ornament_placement, paste_ornament
**Remove**: copy_ornament_as_notation, paste_ornament_from_notation (deprecated)
**Risk**: LOW-MEDIUM (needs create_editor_diff helper)
**Dependencies**: DOCUMENT access, create_editor_diff
**Benefit**: 4 active + 2 deprecated = 6 functions, ~290 lines removed

#### 1.3 Slur Operations → `slurs.rs`
**Functions**: apply_slur, remove_slur, has_slur_in_selection
**Remove**: apply_slur_legacy, remove_slur_legacy (deprecated)
**Risk**: LOW
**Dependencies**: DOCUMENT access
**Benefit**: 3 active + 2 deprecated = 5 functions, ~300 lines removed

#### 1.4 Octave Operations → `annotations.rs`
**Functions**: apply_octave
**Risk**: LOW
**Dependencies**: DOCUMENT access
**Benefit**: 1 function, ~110 lines removed

**Total Phase 1 Reduction**: ~1,080 lines (26% reduction)

---

### Phase 2: Medium-Risk Extractions (Requires careful planning)

#### 2.1 Document Metadata → `documents.rs` + `lines.rs`
**Functions**: 
- `documents.rs`: set_title, set_composer, set_document_pitch_system (3 modern + 3 legacy)
- `lines.rs`: set_line_lyrics, set_line_tala, set_line_pitch_system, set_line_label, set_line_new_system, set_line_staff_role (6 functions)
**Remove**: All *_legacy functions (6 deprecated)
**Risk**: MEDIUM (mix of DOCUMENT and document_js patterns)
**Dependencies**: Some use DOCUMENT, others take document_js
**Benefit**: 13 functions, ~640 lines removed

#### 2.2 Clipboard Operations → `clipboard.rs`
**Functions**: copy_cells, paste_cells, get_primary_selection, update_primary_selection
**Risk**: MEDIUM (paste_cells calls edit_replace_range)
**Dependencies**: edit_replace_range, DOCUMENT access
**Benefit**: 4 functions, ~265 lines removed

#### 2.3 Text Editing → `text_editing.rs`
**Functions**: insert_text, delete_at_cursor, insert_newline
**Risk**: MEDIUM (all call edit_replace_range)
**Dependencies**: edit_replace_range (critical!)
**Benefit**: 3 functions, ~360 lines removed

**Total Phase 2 Reduction**: ~1,265 lines (30% reduction)

---

### Phase 3: High-Risk Extractions (Requires extensive testing)

#### 3.1 Cursor/Selection API → `selection.rs`
**Functions**: get_caret_info, get_selection_info, set_selection, clear_selection, start_selection, extend_selection
**Risk**: HIGH (tightly coupled to DOCUMENT.state.selection_manager)
**Dependencies**: DOCUMENT access
**Benefit**: 6 functions, ~96 lines removed

#### 3.2 Cursor Movement → `cursor_movement.rs`
**Functions**: move_left, move_right, move_up, move_down, move_home, move_end
**Risk**: HIGH (uses create_editor_diff, high-frequency calls)
**Dependencies**: DOCUMENT access, create_editor_diff helper
**Benefit**: 6 functions, ~230 lines removed

#### 3.3 Mouse Operations → `mouse.rs`
**Functions**: mouse_down, mouse_move, mouse_up, select_beat_at_position, select_line_at_position
**Risk**: HIGH (uses create_editor_diff, complex selection logic)
**Dependencies**: DOCUMENT access, BeatDeriver, create_editor_diff
**Benefit**: 5 functions, ~232 lines removed

**Total Phase 3 Reduction**: ~558 lines (13% reduction)

---

### Phase 4: Critical Components (KEEP IN CORE.RS or separate carefully)

#### 4.1 KEEP IN CORE.RS
**Functions**:
- `lock_document()` - Used by 45+ functions
- `create_editor_diff()` - Used by 15+ functions
- Logging macros (wasm_log, wasm_info, wasm_warn, wasm_error)
- Global DOCUMENT mutex

#### 4.2 OPTIONAL EXTRACTION (Only if needed for clarity)
**Module**: `edit_primitive.rs`
**Functions**: edit_replace_range
**Risk**: CRITICAL - This is the single mutation entry point
**Dependencies**: ALL mutation operations depend on this

**Module**: `document_lifecycle.rs`
**Functions**: load_document, get_document_snapshot, create_new_document
**Risk**: CRITICAL - These manage DOCUMENT mutex lifecycle
**Dependencies**: ALL operations depend on these

**Module**: `undo.rs`
**Functions**: undo, redo, can_undo, can_redo
**Risk**: HIGH - Tightly coupled to DOCUMENT.state.history
**Dependencies**: ALL mutation operations record history

---

## Dependency Graph

```
core.rs (DOCUMENT mutex + helpers)
  ├─► lock_document() ───────────► [Used by 45+ functions]
  ├─► create_editor_diff() ──────► [Used by cursor/mouse/ornament ops]
  ├─► edit_replace_range() ──────► [Used by text editing, paste]
  │
  ├─► [Phase 1: LOW RISK]
  │   ├─► export.rs (read-only DOCUMENT)
  │   ├─► ornaments.rs (needs create_editor_diff)
  │   ├─► slurs.rs (DOCUMENT access)
  │   └─► annotations.rs (DOCUMENT access)
  │
  ├─► [Phase 2: MEDIUM RISK]
  │   ├─► documents.rs + lines.rs (mix of DOCUMENT/document_js)
  │   ├─► clipboard.rs (depends on edit_replace_range)
  │   └─► text_editing.rs (depends on edit_replace_range)
  │
  └─► [Phase 3: HIGH RISK]
      ├─► selection.rs (tightly coupled to DOCUMENT)
      ├─► cursor_movement.rs (needs create_editor_diff)
      └─► mouse.rs (needs create_editor_diff + BeatDeriver)
```

---

## Risks and Mitigation Strategies

### Risk 1: Breaking JavaScript Integration
**Mitigation**:
- Maintain all function names exactly as they are
- Keep `#[wasm_bindgen(js_name = ...)]` attributes unchanged
- Re-export all functions from `src/api/mod.rs`
- Run Playwright E2E tests after each extraction

### Risk 2: Losing Access to Shared Helpers
**Mitigation**:
- Extract `lock_document()` and `create_editor_diff()` to `helpers.rs`
- Make them `pub(crate)` so all api modules can access
- Alternative: Keep core.rs as a thin "coordinator" with shared helpers

### Risk 3: Breaking DOCUMENT Mutex Access
**Mitigation**:
- DOCUMENT must remain in ONE location (core.rs or dedicated module)
- All functions must access it via `lock_document()` helper
- Never clone or duplicate the mutex

### Risk 4: Test Coverage Gaps
**Mitigation**:
- Add unit tests for extracted modules BEFORE extraction
- Run full E2E test suite after each extraction
- Test both success and error paths

---

## Recommended Extraction Order

### Week 1: Easy Wins (Phase 1)
1. ✅ Extract export operations → `export.rs` (4 functions, LOW RISK)
2. ✅ Extract slur operations → `slurs.rs` (3 functions, LOW RISK)
3. ✅ Extract octave operations → `annotations.rs` (1 function, LOW RISK)
4. ✅ Extract ornament operations → `ornaments.rs` (4 functions, LOW-MEDIUM RISK)

**Result**: ~1,080 lines removed, core.rs down to ~3,070 lines

### Week 2: Metadata Cleanup (Phase 2)
5. ✅ Extract document/line metadata → `documents.rs` + `lines.rs` (13 functions, MEDIUM RISK)
6. ✅ Extract clipboard → `clipboard.rs` (4 functions, MEDIUM RISK)
7. ⚠️ Extract text editing → `text_editing.rs` (3 functions, MEDIUM RISK)

**Result**: ~1,265 lines removed, core.rs down to ~1,805 lines

### Week 3: High-Risk Operations (Phase 3)
8. ⚠️ Extract selection API → `selection.rs` (6 functions, HIGH RISK)
9. ⚠️ Extract cursor movement → `cursor_movement.rs` (6 functions, HIGH RISK)
10. ⚠️ Extract mouse operations → `mouse.rs` (5 functions, HIGH RISK)

**Result**: ~558 lines removed, core.rs down to ~1,247 lines

### Final State
**core.rs** contains:
- DOCUMENT mutex (1 static)
- lock_document() helper
- create_editor_diff() helper
- Logging macros
- edit_replace_range() (critical mutation primitive)
- Document lifecycle (load, snapshot, create)
- Undo/redo (4 functions)
- Deprecated helper functions (2 no-ops)

**Size**: ~1,200 lines (71% reduction from 4,151 lines)

---

## Success Criteria

✅ **Extraction Complete When**:
1. All E2E tests pass (Playwright)
2. All unit tests pass (cargo test)
3. No JavaScript errors in browser console
4. WASM binary size unchanged or smaller
5. No performance regressions (measure keystroke latency)

✅ **API Compatibility Maintained**:
- All function names unchanged in JavaScript
- All function signatures unchanged
- WASMBridge.js requires no modifications
- Editor.js requires no modifications

✅ **Code Quality Improved**:
- Each module < 500 lines
- Clear separation of concerns
- Reduced cognitive load when reading code
- Easier to add new features

---

## Tools and Verification

### Verify JavaScript Usage
```bash
# Find all wasmModule calls in JavaScript
grep -rh "wasmModule\.\w\+" src/js --no-filename | \
  sed 's/.*wasmModule\.\([a-zA-Z_][a-zA-Z0-9_]*\).*/\1/' | \
  sort -u
```

### Verify Function Exports
```bash
# Check that all functions are re-exported in mod.rs
grep "^pub fn" src/api/core.rs | \
  awk '{print $3}' | \
  cut -d'(' -f1 | \
  sort > /tmp/core_functions.txt

grep "^pub use" src/api/mod.rs | \
  cut -d'{' -f2 | \
  cut -d'}' -f1 | \
  tr ',' '\n' | \
  tr -d ' ' | \
  sort > /tmp/exported_functions.txt

diff /tmp/core_functions.txt /tmp/exported_functions.txt
```

### Verify WASM Build
```bash
# Ensure WASM builds without warnings
npm run build-wasm 2>&1 | grep -i warning
```

### Run E2E Tests
```bash
# Run full test suite
npx playwright test

# Run specific test file
npx playwright test tests/e2e-pw/tests/00-lilypond-smoke.spec.js
```

---

## Conclusion

This refactoring plan provides a safe, incremental approach to splitting the 4,151-line `core.rs` into manageable modules. By following the phased approach (LOW RISK → MEDIUM RISK → HIGH RISK), you can maintain API compatibility, avoid breaking JavaScript integration, and reduce the file to ~1,200 lines (71% reduction) while improving code maintainability.

**Key Success Factors**:
1. ✅ Maintain all function names and signatures
2. ✅ Keep DOCUMENT mutex in one location
3. ✅ Preserve access to shared helpers (lock_document, create_editor_diff)
4. ✅ Test after each extraction (E2E + unit tests)
5. ✅ Re-export all functions from mod.rs

**Estimated Timeline**: 3 weeks (with testing)
**Risk Level**: MEDIUM (with proper phasing and testing)
**Benefit**: 71% code reduction, improved maintainability, easier feature additions
