# WASM Migration TODO

**Last Updated:** 2025-11-04

---

## 🔥 CRITICAL - Performance Issue

- [ ] **Profile `renderer.renderDocument()` for memory leaks**
  - Character typing gets exponentially slower (15ms → 10,978ms)
  - Issue occurs on second line after pressing Enter
  - Likely: DOM node accumulation or event listener leak
  - Tool: Chrome DevTools Performance profiler
  - File: `src/js/renderer.js:191`

- [ ] **Check DOM node count growth**
  - Run: `document.querySelectorAll('*').length` before/after typing
  - Look for nodes not being cleaned up

- [ ] **Check event listener accumulation**
  - Are cell click handlers being added multiple times?
  - Check `removeEventListener()` calls in renderer

---

## ✅ Phase 1: Core Text Editing (COMPLETE)

- [x] Implement `insertText()` in WASM (src/api/core.rs:1345-1440)
- [x] Implement `deleteAtCursor()` in WASM (src/api/core.rs:1442-1549)
- [x] Implement `insertNewline()` in WASM (src/api/core.rs:1551-1650)
- [x] Wire up in WASMBridge (src/js/core/WASMBridge.js:63-66)
- [x] Refactor `insertText()` in editor.js (170 lines → 60 lines)
- [x] Refactor `handleEnter()` in editor.js
- [x] Fix: Debounce `updateHitboxesDisplay()` (was creating timer leak)
- [x] Fix: Make inspector tabs lazy (only update when visible)
- [x] Tests: `single-line-lilypond.spec.js` passing ✅
- [x] Tests: `debug-newline.spec.js` functional ⚠️ (slow but works)

---

## 🚧 Phase 1 Cleanup

- [ ] **Add deprecation warnings** to old cell-based APIs
  - `insertCharacter()` → console.warn("Deprecated: Use insertText()")
  - `deleteCharacter()` → console.warn("Deprecated: Use deleteAtCursor()")
  - File: `src/api/cells.rs:66, 248`

- [ ] **Fix `multi-line-lilypond.spec.js` timeout**
  - Currently times out at 30s
  - Will pass once performance issue is resolved

---

## 📅 Phase 2: Commands & Annotations (NOT STARTED)

- [ ] Implement `apply_slur_to_selection()` in WASM
- [ ] Implement `remove_slur_at_cursor()` in WASM
- [ ] Implement `apply_ornament_to_selection()` in WASM
- [ ] Implement `remove_ornament_at_cursor()` in WASM
- [ ] Update command handlers in JavaScript to use new APIs
- [ ] Deprecate old `applySlur(cells_js, ...)` functions
- [ ] Tests: Verify slur/ornament application in MusicXML output

---

## 📅 Phase 3: Metadata Setters (NOT STARTED)

- [ ] Implement `set_title(title: String)` in WASM
- [ ] Implement `set_composer(composer: String)` in WASM
- [ ] Implement `set_line_lyrics(line_idx, lyrics)` in WASM
- [ ] Implement `get_metadata()` in WASM (returns title/composer/etc.)
- [ ] Update metadata UI handlers in JavaScript
- [ ] Deprecate old `setTitle(document_js, ...)` functions

---

## 📅 Phase 4: Export & Final Cleanup (NOT STARTED)

- [ ] Update `exportMusicXML()` to use internal DOCUMENT
- [ ] Update `exportLilyPond()` to use internal DOCUMENT
- [ ] Update `generateIRJson()` to use internal DOCUMENT
- [ ] Update `exportMIDI()` to use internal DOCUMENT
- [ ] **Remove `this.theDocument` from JavaScript entirely**
  - Replace with query functions: `getDocumentSnapshot()`, `getLine(idx)`
  - Update all JS code that reads `this.theDocument`
- [ ] Remove all manual `loadDocument()` calls (except app init)
- [ ] Run full E2E test suite
- [ ] Performance benchmarks (compare before/after)

---

## 🎯 Success Criteria

**Phase 1:**
- ✅ Text insertion uses WASM state
- ✅ No manual `loadDocument()` syncs
- ⚠️ Typing performance is acceptable (BLOCKED by rendering issue)

**Phase 2-4:**
- All editing operations use WASM state
- `this.theDocument` removed from JavaScript
- All E2E tests passing
- Performance equal or better than before migration

---

## 📊 Metrics

**Code Reduction (Phase 1):**
- `insertText()`: 170 lines → 60 lines (-65%)
- `handleEnter()`: 74 lines → 68 lines (-8%)

**Test Status:**
- ✅ Passing: 1 (single-line-lilypond.spec.js)
- ⚠️ Slow: 1 (debug-newline.spec.js)
- ❌ Failing: 1 (multi-line-lilypond.spec.js - timeout)

**Performance:**
- First line typing: ~20ms per character ✅
- Second line typing: 59ms → 10,978ms per character ❌

---

## 🐛 Known Issues

1. **Rendering performance degradation** (CRITICAL)
   - See: WASM_MIGRATION_STATUS.md for detailed analysis
   - Symptom: Exponential slowdown on multi-line documents
   - Status: Under investigation

2. **Backspace/Delete not migrated yet**
   - Still uses old `deleteCharacter()` cell-based API
   - Complex logic for ornament/slur protection
   - Will migrate in future phase

---

## 📝 Notes

- WASM build is clean (no warnings) ✅
- Architecture is sound - state properly owned by WASM ✅
- Performance issue is rendering-specific, not WASM-related ✅
- Once rendering is fixed, can proceed to Phase 2
