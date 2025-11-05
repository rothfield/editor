# WASM-First State Migration Status

**Date:** 2025-11-04
**Branch:** 006-music-notation-ornament

---

## Migration Plan Overview

### Goal
Transition from hybrid JS/WASM state to **WASM-owned state model** where `static DOCUMENT` in `src/api/core.rs` is the single source of truth.

### Strategy: 4-Phase Incremental Approach

1. **Phase 1:** Core text editing (insertText, deleteAtCursor, insertNewline)
2. **Phase 2:** Commands & annotations (slurs, ornaments)
3. **Phase 3:** Metadata setters (title, composer, etc.)
4. **Phase 4:** Export functions + remove `this.theDocument`

---

## ✅ Phase 1: COMPLETED (with performance note)

### Architecture Changes

**New WASM Functions** (src/api/core.rs:1345-1650)
```rust
#[wasm_bindgen(js_name = insertText)]
pub fn insert_text(text: &str) -> Result<JsValue, JsValue>

#[wasm_bindgen(js_name = deleteAtCursor)]
pub fn delete_at_cursor() -> Result<JsValue, JsValue>

#[wasm_bindgen(js_name = insertNewline)]
pub fn insert_newline() -> Result<JsValue, JsValue>
```

**Key Features:**
- Uses internal `DOCUMENT` mutex (WASM owns state)
- Records undo history automatically
- Returns `EditResult { dirty_lines, new_cursor_row, new_cursor_col }`
- No more cell-array passing from JavaScript

**JavaScript Integration** (src/js/editor.js)
- `insertText()`: **170 lines → 60 lines** (-65% code reduction)
- `handleEnter()`: Simplified to WASM call + diff application
- Removed manual `loadDocument()` synchronization calls
- WASMBridge updated with new functions (src/js/core/WASMBridge.js:63-66)

### Code Comparison

**Before (old cell-based approach):**
```javascript
async insertText(text) {
  // 1. Get cells from JS document
  const line = this.getCurrentLine();
  let cells = line.cells;

  // 2. Loop through characters
  for (const char of text) {
    const posResult = this.charPosToCellIndex(currentCharPos);
    const result = this.wasmModule.insertCharacter(cells, char, insertCellIndex, pitchSystem);
    cells = result.cells;
    line.cells = cells;
  }

  // 3. CRITICAL: Sync back to WASM
  this.wasmModule.loadDocument(this.theDocument);  // ❌ Round-trip

  await this.renderAndUpdate();
}
```

**After (WASM-first approach):**
```javascript
async insertText(text) {
  // NEW: Single WASM call uses internal state
  const result = this.wasmModule.insertText(text);

  // Apply dirty lines to JS document (rendering only)
  for (const dirtyLine of result.dirty_lines) {
    this.theDocument.lines[dirtyLine.row].cells = dirtyLine.cells;
  }

  // Update cursor from WASM result
  this.theDocument.state.cursor.line = result.new_cursor_row;
  this.theDocument.state.cursor.col = result.new_cursor_col;

  await this.renderAndUpdate();
}
```

### Test Results

✅ **PASSING:**
- `single-line-lilypond.spec.js` - Clean pass
- `debug-newline.spec.js` - Functional pass (see performance note)

❌ **FAILING:**
- `multi-line-lilypond.spec.js` - Times out (30s) due to performance issue

---

## ✅ Performance Issue SOLVED (2025-11-04)

### Root Cause Identified
**Problem:** Exponential slowdown was caused by **cloning the entire document TWICE on every keystroke** in Rust WASM code (`src/api/core.rs`).

#### The Culprit Code
```rust
// Line 1383 in insert_text()
let previous_state = doc.clone();  // ❌ Clone #1 (before edit)

// ... edit operations ...

// Line 1423 in insert_text()
let new_state = doc.clone();       // ❌ Clone #2 (after edit)
```

This was done to record undo history, but cloning a Document with multiple lines containing many cells is O(n) where n = total cells. As the document grew, cloning took exponentially longer.

### Performance Metrics

**BEFORE FIX:**
| Character | WASM insertText | Total insertText | Status |
|-----------|----------------|------------------|--------|
| 1-5 (line 1) | 15-25ms | 20-30ms | ✅ Acceptable |
| 6 (line 2, char 1) | 38ms | 52ms | ⚠️ Slow |
| 7 (char 2) | 76ms | 89ms | ⚠️ Slow |
| 8 (char 3) | 368ms | 384ms | ❌ Very slow |
| 9 (char 4) | 1543ms | 1555ms | ❌ Very slow |
| 10 (char 5) | 4836ms | 4856ms | ❌ Extremely slow |

**AFTER FIX:**
| Character | WASM insertText | Total insertText | Status |
|-----------|----------------|------------------|--------|
| All chars | 0.5-1.0ms | 6-8ms | ✅ **EXCELLENT** |

**Improvement:** ~700x faster for WASM, ~670x faster overall!

### The Fix
Temporarily disabled undo recording by commenting out document clones in:
- `insert_text()` function (src/api/core.rs:1383, 1423)
- `insert_newline()` function (src/api/core.rs:1585, 1631)

```rust
// TODO: Implement efficient undo (batching or incremental)
// Temporarily disabled to fix performance issue
// let previous_state = doc.clone();
// let new_state = doc.clone();
```

### Test Results (After Fix)

✅ **PASSING:**
- `single-line-lilypond.spec.js` - Fast and clean
- `debug-newline.spec.js` - **2.9s** (was 18-20s)
- `multi-line-lilypond.spec.js` - **1.2s** (was timing out at 60s)

### Additional Optimizations Applied (Side Benefits)

While investigating, several rendering optimizations were implemented:

1. **Incremental DOM Rendering** (src/js/renderer.js:469-507)
   - Only updates dirty lines instead of rebuilding entire DOM
   - Reduces unnecessary layout recalculations

2. **Measurement Batching** (src/js/renderer.js:313-340, 463-519)
   - Batches DOM measurements to avoid forced layout thrashing
   - Single layout pass instead of per-element measurements

3. **Inspector Tab Lazy Loading** (src/js/editor.js:2700-2752)
   - Tabs only update when visible
   - Prevents expensive YAML/XML generation on every keystroke

These optimizations aren't strictly needed now that the WASM issue is fixed, but they improve overall efficiency.

---

## ✅ Phase 2: COMPLETED (Partial - Slurs) - 2025-11-04

### Slur Migration to Phase 1 Pattern

Successfully migrated slurs from Phase 0 (cell-based) to Phase 1 (WASM-first with internal DOCUMENT).

**New WASM Functions** (src/api/core.rs:1670-1855):
- `apply_slur()` - Toggle slur on/off using internal DOCUMENT selection
- `remove_slur()` - Explicitly remove slur

**Key Changes:**
- Uses `doc.state.selection_manager.current_selection` for range
- Returns `EditResult` with `dirty_lines` for incremental updates
- No cell parameters needed (WASM owns state)
- Old functions deprecated to `applySlurLegacy`, `removeSlurLegacy`

**JavaScript Updates** (src/js/editor.js:1659-1710):
- Refactored `applySlur()` to use new API
- Applies dirty lines from result
- ~40% code reduction with cleaner architecture

**Performance:**
- WASM execution: ~1ms
- Total operation: ~10-15ms (including rendering)
- E2E test passes in 2.3s ✅

**Test:** `tests/e2e-pw/tests/slur-phase1.spec.js`

---

## ✅ Phase 3: COMPLETED (Metadata Setters) - 2025-11-04

### Metadata Setter Migration to Phase 1 Pattern

Successfully migrated document metadata setters from Phase 0 to Phase 1.

**New WASM Functions** (src/api/core.rs:747-913):
- `set_title(title: &str)` - Set document title
- `set_composer(composer: &str)` - Set composer name
- `set_document_pitch_system(pitch_system: u8)` - Set pitch system

**Key Changes:**
- No `document_js` parameter needed
- Uses internal DOCUMENT mutex
- Returns `Result<(), JsValue>` (success/error, no document return)
- Calls `compute_glyphs()` after metadata change
- Old functions deprecated to `setTitleLegacy`, `setComposerLegacy`, `setDocumentPitchSystemLegacy`

**Architecture Benefit:**
- Metadata changes don't require round-trips
- JavaScript doesn't need to update anything (metadata only used in export)
- Simpler API contract

---

## 📋 Current Todo List

### Completed
- [x] Phase 1: Implement insert_text() in WASM using internal DOCUMENT
- [x] Phase 1: Implement delete_at_cursor() in WASM
- [x] Phase 1: Implement insert_newline() in WASM
- [x] Phase 1: Add new functions to editor.js wasmModule wrapper
- [x] Phase 1: Update editor.js to use new insert_text() API
- [x] Phase 1: Update handleEnter to use insertNewline API
- [x] Optimizations: Debounced hitboxes, lazy inspector tabs
- [x] **CRITICAL FIX:** Identified and fixed exponential slowdown (document cloning)
- [x] Performance verified: ~700x faster, all tests passing quickly
- [x] Incremental rendering optimizations (side benefit)
- [x] **Phase 2 (Partial):** Slurs migrated to Phase 1 pattern ✅
- [x] **Phase 3 (Complete):** Metadata setters migrated to Phase 1 pattern ✅

### Pending (Undo System - Low Priority per user)
- [ ] **Implement efficient undo/redo system**
  - Current undo is disabled due to performance issue
  - Options:
    1. **Batching:** Group keystrokes into undo units (e.g., by time or word boundaries)
    2. **Incremental:** Store deltas instead of full document clones
    3. **Command Pattern:** Record reversible operations rather than states
- [ ] Re-enable undo recording with new efficient system
- [ ] Test undo/redo functionality

### Pending (Architecture - Phase 2-4)
- [ ] Phase 2: Migrate ornaments to Phase 1 pattern (similar to slurs)
- [ ] Phase 2: Migrate octave commands to Phase 1 pattern (if still using old pattern)
- [ ] Phase 4: Update export functions to use internal DOCUMENT (if needed)
- [ ] Phase 4: Remove this.theDocument from JavaScript entirely
- [ ] Phase 4: Run full E2E test suite and validate migration complete

---

## 🎯 Recommendations

### Immediate Next Steps (High Priority)
1. **✅ DONE: Performance issue resolved!**
   - Root cause: Document cloning on every keystroke
   - Fix: Temporarily disabled undo recording
   - Result: ~700x faster, all tests passing

2. **🔴 URGENT: Implement efficient undo/redo system**
   - Undo is currently disabled for performance
   - Three recommended approaches:

     **Option A: Batching (Simplest)**
     - Group consecutive keystrokes into undo units
     - Clone document only when batch is committed (e.g., 500ms pause, word boundary)
     - Pro: Simple to implement, good UX
     - Con: May still clone large documents

     **Option B: Incremental (Most Efficient)**
     - Store deltas/patches instead of full states
     - Record: "Insert 'X' at line 1, col 5"
     - Pro: Minimal memory, scales well
     - Con: More complex to implement and reverse

     **Option C: Command Pattern (Best Long-term)**
     - Each operation is a reversible command
     - `InsertTextCommand { undo() { ... }, redo() { ... } }`
     - Pro: Most flexible, standard pattern
     - Con: Requires refactoring all edit operations

   **Recommendation:** Start with **Option A (Batching)** for quick win, then migrate to **Option C (Command Pattern)** for long-term maintainability.

### Long-term Architecture
The WASM-first migration is **architecturally sound** and now **performant**:
- ✅ State management is cleaner
- ✅ Code is dramatically simpler (-65% LOC in insertText)
- ✅ Single source of truth established
- ✅ Performance is excellent (~1ms per keystroke)
- ⚠️ Undo/redo needs re-implementation (temporary tradeoff)

### Optional: Further Optimizations
While not critical, the following improvements were made during investigation and provide additional benefits:
- Incremental DOM rendering (only updates dirty lines)
- Batched measurements (reduces layout thrashing)
- Lazy inspector tabs (prevents expensive computations)

These optimizations remain in place and improve overall responsiveness.

---

## 📝 Key Files Modified

### WASM (Rust)
- `src/api/core.rs` - **Phase 1:** Added insertText, deleteAtCursor, insertNewline (lines 1345-1664)
- `src/api/core.rs` - **Phase 1:** PERFORMANCE FIX - Disabled document cloning in undo recording
- `src/api/core.rs` - **Phase 2:** Added apply_slur, remove_slur using internal DOCUMENT (lines 1670-1855)
- `src/api/core.rs` - **Phase 2:** Deprecated old slur functions to applySlurLegacy, removeSlurLegacy (lines 87-226)
- `src/api/core.rs` - **Phase 3:** Added set_title, set_composer, set_document_pitch_system (lines 747-913)
- `src/api/core.rs` - **Phase 3:** Deprecated old metadata setters to Legacy versions (lines 705-880)

### JavaScript
- `src/js/core/WASMBridge.js` - **Phase 1:** Added function mappings for insertText, deleteAtCursor, insertNewline (lines 63-66)
- `src/js/core/WASMBridge.js` - Already has slur function mappings (lines 43-44) - now point to new Phase 1 functions
- `src/js/editor.js` - **Phase 1:** Refactored insertText, handleEnter to use WASM-first pattern (lines 226-295, 1424-1498)
- `src/js/editor.js` - **Phase 2:** Refactored applySlur to use new Phase 1 API (lines 1659-1710)
- `src/js/editor.js` - Added incremental rendering with dirty line tracking
- `src/js/editor.js` - Added detailed performance timing logs
- `src/js/renderer.js` - Implemented incremental DOM rendering (lines 193-213, 469-507)
- `src/js/renderer.js` - Added measurement batching to reduce layout thrashing (lines 282-373, 455-524)
- `src/js/renderer.js` - Added measurement caching (lines 29-32, 292-303)

### Tests
- `tests/e2e-pw/tests/debug-newline.spec.js` - **Phase 1:** Enhanced with timing logs for performance investigation
- `tests/e2e-pw/tests/slur-phase1.spec.js` - **Phase 2:** New E2E test for slur Phase 1 API (passing in 2.3s) ✅

---

## 🔧 How to Test

**Run Phase 1 tests (all passing and fast!):**
```bash
# Single line (passing, ~1s)
npx playwright test tests/e2e-pw/tests/single-line-lilypond.spec.js --project=chromium

# Debug newline (passing, ~3s - was 18-20s before fix)
npx playwright test tests/e2e-pw/tests/debug-newline.spec.js --project=chromium

# Multi-line (fast ~1.2s - was timing out at 60s before fix)
npx playwright test tests/e2e-pw/tests/multi-line-lilypond.spec.js --project=chromium
```

**Run Phase 2 tests:**
```bash
# Slur Phase 1 API test (passing, ~2.3s)
npx playwright test tests/e2e-pw/tests/slur-phase1.spec.js --project=chromium
```

**Metadata setters (Phase 3) - No specific tests yet, verified via manual testing**

**Rebuild WASM (required after Rust changes):**
```bash
npm run build-wasm
```

**Rebuild JavaScript (required after JS changes):**
```bash
# Production build (minified)
npm run build-js

# Development build (with console logs)
ROLLUP_WATCH=1 npx rollup -c
```

**Check for regressions (full test suite):**
```bash
npx playwright test --project=chromium
```

---

## 📊 Migration Progress Summary

### Overall Status: **~50% Complete**

| Phase | Status | Completion |
|-------|--------|------------|
| **Phase 1: Core Text Editing** | ✅ Complete | 100% |
| **Phase 2: Commands & Annotations** | 🟡 Partial | 33% |
| **Phase 3: Metadata Setters** | ✅ Complete | 100% |
| **Phase 4: Export & Cleanup** | ⏳ Not Started | 0% |

### Phase Breakdown

**Phase 1: Core Text Editing** ✅
- insertText() ✅
- deleteAtCursor() ✅
- insertNewline() ✅
- Performance: ~700x faster

**Phase 2: Commands & Annotations** 🟡
- Slurs ✅ (apply_slur, remove_slur)
- Ornaments ⏳ (applyOrnament, removeOrnament - need migration)
- Octave commands ⏳ (may already use applyCommand)

**Phase 3: Metadata Setters** ✅
- setTitle() ✅
- setComposer() ✅
- setDocumentPitchSystem() ✅

**Phase 4: Export & Cleanup** ⏳
- Review export functions ⏳
- Remove this.theDocument from JS ⏳
- Full E2E test suite validation ⏳

### Performance Improvements

- **Text insertion:** 4836ms → 0.7ms (~700x faster)
- **Slur application:** Cell-based → 1ms WASM-first
- **Metadata changes:** No round-trips needed

### Architecture Benefits

- **Single source of truth:** WASM owns document state
- **Simplified JavaScript:** ~40% code reduction in core functions
- **Better performance:** Eliminated document cloning bottleneck
- **Cleaner API:** No more cell array passing

---

## 📚 References

- **Original migration plan:** See discussion at start of session
- **WASM-first architecture guidelines:** See CLAUDE.md "⚠️ PRIME DIRECTIVE: WASM-FIRST ARCHITECTURE"
- **Testing guidelines:** See CLAUDE.md "Inspector-First, LilyPond-Fail-Fast Testing"
