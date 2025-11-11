# Code Review Tasks - Priority Ordered

**Generated**: 2025-11-11
**Status**: 15 failing tests, 2 compilation errors, significant technical debt

---

## 🔴 PRIORITY 1: CRITICAL (Fix Immediately)

### Task 1: Fix 15 Failing Unit Tests
**Severity**: CRITICAL
**Effort**: 4-8 hours
**Files**: Multiple test modules

**Current Status**: `cargo test` shows 251 passed, 15 failed

**Failing Tests**:
- `api::core::tests::test_beat_selection_*` (4 failures)
- `api::core::tests::test_double_click_*` (2 failures)
- `api::core::tests::test_edit_replace_range_deletes_multichar_token`
- `html_layout::lyrics::tests::*` (4 failures)
- `models::core::tests::test_staff_role_system_id_assignment_g_m_m`
- `renderers::musicxml::builder::tests::test_write_grace_note*` (2 failures)
- `renderers::musicxml::export_ir::tests::test_measure_validation_empty`
- `undo::tests::test_batching_on_whitespace`

**Action Steps**:
1. Run `cargo test` to see full error output
2. Fix each test one by one, starting with compilation errors
3. Verify all tests pass before marking complete
4. Add regression tests if bugs are found

**Acceptance Criteria**: All 266 unit tests pass (`cargo test` exits with 0)

---

### Task 2: Fix Compilation Errors in Test Code
**Severity**: CRITICAL
**Effort**: 30 minutes
**Files**:
- `src/api/core.rs:3403`
- `src/undo/mod.rs:321`

**Issue 1 - Missing Result return type**:
```rust
// src/api/core.rs:3403 - BEFORE
#[test]
fn test_edit_replace_range_deletes_multichar_token() {
    let doc_guard = lock_document()?;  // ❌ Can't use ? without Result
    // ...
}

// AFTER
#[test]
fn test_edit_replace_range_deletes_multichar_token() -> Result<(), Box<dyn std::error::Error>> {
    let doc_guard = lock_document()?;
    // ...
    Ok(())
}
```

**Issue 2 - Non-existent enum variant**:
```rust
// src/undo/mod.rs:321 - BEFORE
Cell {
    kind: ElementKind::Pitch,  // ❌ Doesn't exist
    // ...
}

// AFTER
Cell {
    kind: ElementKind::PitchedElement,  // ✅ Correct variant
    // ...
}
```

**Acceptance Criteria**: `cargo test` compiles without errors

---

### Task 3: Reduce Excessive .unwrap() and .expect() Usage
**Severity**: HIGH
**Effort**: 4-6 hours
**Files**:
- `src/api/core.rs` (40 instances)
- `src/api/position.rs` (28 instances)
- `src/renderers/musicxml/*` (61 instances across 5 files)

**Problem**: Can cause panics in production, especially in WASM where errors are hard to debug

**Bad Pattern**:
```rust
let selection = doc.state.selection_manager.current_selection.as_ref().unwrap();
let result = serde_wasm_bindgen::from_value(result.unwrap()).unwrap();
```

**Good Pattern**:
```rust
let selection = doc.state.selection_manager.current_selection
    .as_ref()
    .ok_or_else(|| JsValue::from_str("No selection available"))?;

let result = result
    .ok_or_else(|| JsValue::from_str("Operation failed"))?;
let result: SelectionInfo = serde_wasm_bindgen::from_value(result)
    .map_err(|e| JsValue::from_str(&format!("Deserialization error: {:?}", e)))?;
```

**Action Steps**:
1. Start with `src/api/core.rs` - the main API surface
2. Replace `.unwrap()` with `?` operator and proper Result types
3. Add meaningful error messages using `.ok_or_else()` or `.map_err()`
4. Update function signatures to return `Result<T, JsValue>` where needed
5. Test each change to ensure error handling works correctly

**Target**: Reduce unwrap/expect count from 133+ to <20 (only in truly safe contexts)

**Acceptance Criteria**:
- Critical paths in `api/core.rs` and `api/position.rs` use proper error handling
- All WASM-exposed functions return Result types
- Run `cargo clippy -- -W clippy::unwrap_used` to verify

---

### Task 4: Add try-finally for Temporary DOM Elements
**Severity**: HIGH
**Effort**: 1 hour
**Files**:
- `src/js/renderer.js:647-725` (measureCellWidths)
- `src/js/renderer.js:808-885` (measureCharacterWidths)

**Problem**: Memory leaks if errors occur during measurement

**Bad Pattern**:
```javascript
const temp = document.createElement('div');
document.body.appendChild(temp);
// ... operations that might throw ...
document.body.removeChild(temp);  // ⚠️ Never reached if error occurs
```

**Good Pattern**:
```javascript
const temp = document.createElement('div');
try {
    document.body.appendChild(temp);
    // ... measurements ...
    return results;
} finally {
    if (temp.parentNode) {
        document.body.removeChild(temp);
    }
}
```

**Action Steps**:
1. Wrap `measureCellWidths()` body in try-finally
2. Wrap `measureCharacterWidths()` body in try-finally
3. Test error scenarios to ensure cleanup happens
4. Search for other instances: `git grep "appendChild.*temp"`

**Acceptance Criteria**: All temp DOM elements are cleaned up even on error

---

## 🟠 PRIORITY 2: HIGH (Fix This Week)

### Task 5: Add Missing Event Listener Cleanup
**Severity**: MEDIUM-HIGH
**Effort**: 30 minutes
**Files**: `src/js/events.js:736-743`

**Problem**: Memory leaks on repeated initialization (e.g., HMR, page navigation)

**Current Cleanup**:
```javascript
destroy() {
    document.removeEventListener('keydown', this.handleGlobalKeyDown, { capture: true });
    document.removeEventListener('focusin', this.handleGlobalFocus);
    document.removeEventListener('focusout', this.handleGlobalBlur);
    document.removeEventListener('click', this.handleGlobalClick);
    // ⚠️ Missing: window resize, beforeunload, visibilitychange
    this.eventListeners.clear();
}
```

**Fix**:
```javascript
destroy() {
    // Existing cleanup...
    window.removeEventListener('resize', this.handleWindowResize);
    window.removeEventListener('beforeunload', this.handleBeforeUnload);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);

    // Clean up any MutationObservers
    if (this.mutationObserver) {
        this.mutationObserver.disconnect();
    }

    this.eventListeners.clear();
}
```

**Action Steps**:
1. Audit all `addEventListener` calls in events.js
2. Ensure corresponding `removeEventListener` in destroy()
3. Store event handler references for proper cleanup
4. Test with browser DevTools Memory profiler

**Acceptance Criteria**: All event listeners removed when EventManager.destroy() called

---

### Task 6: Remove Excessive Console Logging (370 instances)
**Severity**: MEDIUM
**Effort**: 2-3 hours
**Files**: Throughout `src/js/` directory

**Problem**: Log noise, performance overhead, unprofessional in production

**Files with Most Logging**:
- `editor.js`: 48 console.log calls
- `main.js`: 43 calls
- `ui.js`: 39 calls
- `events.js`: 34 calls
- `dev-server.js`: 35 calls

**Action Steps**:
1. Use existing `logger.js` utility consistently
2. Replace debug `console.log` with `logger.debug()` (respects log level)
3. Replace info logs with `logger.info()`
4. Keep error logs as `logger.error()`
5. Remove temporary debug statements
6. Add environment check: `if (import.meta.env.DEV)` for debug logs

**Example Refactor**:
```javascript
// BEFORE
console.log('[Editor] Initializing...', config);
console.log('[Editor] WASM loaded');

// AFTER
import logger from './core/logger.js';
logger.debug('[Editor] Initializing...', config);
logger.info('[Editor] WASM loaded');
```

**Target**: Reduce from 370 to <50 strategic log points

**Acceptance Criteria**:
- No `console.log` in production code (search: `git grep "console\.log" src/js/`)
- All logging uses logger utility with appropriate levels
- Logs can be silenced in production via environment config

---

### Task 7: Add E2E Tests for Missing Features
**Severity**: MEDIUM
**Effort**: 6-8 hours
**Files**: `tests/e2e-pw/tests/` (new files)

**Missing Coverage**:
- ❌ Ornament copy/paste E2E test
- ❌ Multi-staff grouping E2E test
- ❌ Grace notes rendering E2E test
- ❌ Lyrics rendering E2E test (tests exist but failing)
- ❌ Tempo/time signature changes E2E test
- ❌ MusicXML export validation E2E test

**Action Steps**:
1. Create `ornaments-copy-paste.spec.js`:
   - Type note with ornament (e.g., `1tr`)
   - Copy cell, paste elsewhere
   - Verify ornament preserved in MusicXML output

2. Create `multi-staff-grouping.spec.js`:
   - Create document with multiple staves
   - Set staff roles (Melody, Bass, Percussion)
   - Verify MusicXML `<part-group>` tags

3. Create `grace-notes-rendering.spec.js`:
   - Type grace note notation
   - Verify WASM DOM layout shows grace class
   - Verify MusicXML contains `<grace/>` element

4. Fix `lyrics-rendering.spec.js`:
   - Investigate 4 failing tests in `html_layout::lyrics::tests`
   - Update test expectations or fix rendering bug

5. Create `tempo-time-signature.spec.js`:
   - Set tempo and time signature in metadata
   - Verify MusicXML `<sound tempo="120"/>` and `<time>` elements

6. Create `musicxml-export-validation.spec.js`:
   - Export document as MusicXML
   - Validate against MusicXML 3.1 schema (use xmllint)
   - Check for common errors (invalid divisions, missing attributes)

**Acceptance Criteria**:
- All 6 new test files added
- All tests pass in all browsers (chromium, firefox, webkit)
- Use inspector-first pattern (check LilyPond/MusicXML tabs, not visuals)

---

### Task 8: Replace panic! with Result Returns in Production Code
**Severity**: MEDIUM
**Effort**: 2 hours
**Files**:
- `src/renderers/musicxml/duration.rs:19`
- Any other panic! calls in non-test code

**Problem**: Panics crash the WASM module, causing entire app to fail

**Bad Pattern**:
```rust
// src/renderers/musicxml/duration.rs:19
panic!("Unsupported tuplet normal-notes value: {}. Supported values: 1, 2, 4, 8...", normal_notes);
```

**Good Pattern**:
```rust
// Return a Result with descriptive error
fn calculate_tuplet_duration(normal_notes: u32) -> Result<Duration, String> {
    match normal_notes {
        1 | 2 | 4 | 8 => {
            // calculation
            Ok(duration)
        }
        _ => Err(format!(
            "Unsupported tuplet normal-notes value: {}. Supported: 1, 2, 4, 8",
            normal_notes
        ))
    }
}
```

**Action Steps**:
1. Search for all panic! calls: `rg "panic!" src/ --type rust`
2. Filter to non-test code (ignore #[test] functions)
3. Convert each to return `Result<T, E>`
4. Propagate errors up the call chain with `?`
5. Handle errors gracefully at WASM boundary (return JsValue error)

**Acceptance Criteria**:
- Zero panic! calls in production code paths
- All error cases return descriptive Result::Err
- Test error handling with invalid inputs

---

## 🟡 PRIORITY 3: MEDIUM (Fix This Sprint)

### Task 9: Refactor Large JavaScript Files
**Severity**: MEDIUM
**Effort**: 8-12 hours
**Files**:
- `src/js/editor.js` (3,411 lines ⚠️)
- `src/js/ui.js` (1,843 lines)
- `src/js/renderer.js` (1,428 lines)

**Problem**: Hard to maintain, test, and understand; violates single responsibility principle

**Proposed Structure for editor.js**:
```
src/js/editor/
├── editor.js          (200 lines - main class, initialization)
├── selection.js       (300 lines - selection management)
├── editing.js         (400 lines - text editing operations)
├── rendering.js       (300 lines - render coordination)
├── export.js          (200 lines - export orchestration)
├── undo-redo.js       (200 lines - undo/redo management)
└── state.js           (100 lines - state management)
```

**Action Steps**:
1. Create `src/js/editor/` directory
2. Extract selection methods to `selection.js` (move_caret, set_selection, etc.)
3. Extract editing methods to `editing.js` (insert_text, backspace, delete, etc.)
4. Extract export methods to `export.js` (all generate_* and export_* methods)
5. Update imports in main.js
6. Run E2E tests to verify no regression
7. Repeat for ui.js (split into components) and renderer.js (split layout/rendering)

**Target**: No file >800 lines

**Acceptance Criteria**:
- All E2E tests still pass
- Code coverage maintained
- Imports follow consistent pattern
- Documentation updated

---

### Task 10: Address TODOs in Export Pipeline
**Severity**: MEDIUM
**Effort**: 4-6 hours
**Files**:
- `src/renderers/musicxml/line_to_ir.rs`
- `src/renderers/musicxml/emitter.rs`

**Critical TODOs**:

1. **Slash notation support** (line 110):
```rust
slash: false, // TODO: wire up slash notation
```
**Action**: Add slash field to Cell model, parse from input, pass to IR

2. **Slur placement** (line 479):
```rust
placement: SlurPlacement::Above, // TODO: derive from context
```
**Action**: Implement heuristic (stem direction, voice, staff position)

3. **Clef derivation** (line 1031):
```rust
clef: "treble".to_string(), // TODO: derive from line metadata
```
**Action**: Add clef to staff metadata, expose in API, use in export

4. **Selected text replacement** (api/core.rs:865):
```rust
// TODO: In the future, replace selected text instead of just clearing
```
**Action**: Implement replace_selection() that preserves formatting

5. **Ornament layout** (layout_engine.rs:718):
```rust
// TEMPORARILY DISABLED: Position ornaments relative to their target cells
```
**Action**: Re-enable and fix positioning algorithm

**Acceptance Criteria**:
- All 5 TODOs resolved or converted to tracked issues
- Features tested with E2E tests
- MusicXML export validates correctly

---

### Task 11: Extract Magic Numbers to Named Constants
**Severity**: LOW-MEDIUM
**Effort**: 2 hours
**Files**: Throughout `src/js/`

**Problem**: Hard to understand intent, difficult to adjust values

**Bad Examples**:
```javascript
// src/js/renderer.js:659
cellWidths.push(BASE_FONT_SIZE * 0.1);  // What is 0.1?

// src/js/renderer.js:669
span.style.fontSize = `${BASE_FONT_SIZE * 0.6}px`;  // Why 0.6?

// src/js/main.js:476
const maxAttempts = 40; // 2 seconds at 50ms intervals
```

**Good Pattern**:
```javascript
// At top of file
const CONSTANTS = {
    // Character spacing
    MIN_CELL_WIDTH_RATIO: 0.1,        // 10% of base font size
    CONTINUATION_FONT_RATIO: 0.6,     // 60% of base for continuation chars

    // Timing
    WASM_LOAD_MAX_ATTEMPTS: 40,       // 40 attempts * 50ms = 2s timeout
    WASM_LOAD_RETRY_MS: 50,
};

// In code
cellWidths.push(BASE_FONT_SIZE * CONSTANTS.MIN_CELL_WIDTH_RATIO);
span.style.fontSize = `${BASE_FONT_SIZE * CONSTANTS.CONTINUATION_FONT_RATIO}px`;
const maxAttempts = CONSTANTS.WASM_LOAD_MAX_ATTEMPTS;
```

**Action Steps**:
1. Identify all magic numbers: `git grep -E "[0-9]+\.[0-9]+" src/js/`
2. Group by purpose (spacing, timing, sizing, etc.)
3. Extract to CONSTANTS objects at file top
4. Document rationale in comments
5. Update all usages

**Target**: Replace 30+ magic numbers with named constants

**Acceptance Criteria**:
- No unexplained numeric literals in hot paths
- Constants have descriptive names and comments
- Visual appearance unchanged (values same)

---

### Task 12: Fix Unused Imports and Doc Comment Warnings
**Severity**: LOW
**Effort**: 30 minutes
**Files**:
- `src/api/helpers.rs:19`
- `src/converters/musicxml/musicxml_to_lilypond/converter.rs:610-612`
- `src/models/core.rs:225-229`

**Issue 1 - Unused doc comment**:
```rust
// src/api/helpers.rs:19 - BEFORE
/// WASM-owned document storage (canonical source of truth)
lazy_static! {  // ❌ Doc comment not on target
    pub(crate) static ref DOCUMENT: Mutex<Option<Document>> = Mutex::new(None);
}

// AFTER
lazy_static! {
    /// WASM-owned document storage (canonical source of truth)
    pub(crate) static ref DOCUMENT: Mutex<Option<Document>> = Mutex::new(None);
}
```

**Issue 2 - Unused imports**:
```rust
// src/converters/musicxml/musicxml_to_lilypond/converter.rs:610-612
// Remove these if truly unused:
use super::*;
use crate::converters::musicxml::musicxml_to_lilypond::lilypond::generate_lilypond_document;
use crate::converters::musicxml::musicxml_to_lilypond::parser::XmlDocument;
```

**Issue 3 - Derivable Default**:
```rust
// src/models/core.rs:225-229 - BEFORE
impl Default for StaffRole {
    fn default() -> Self {
        StaffRole::Melody
    }
}

// AFTER (remove manual impl, use derive)
#[derive(Default)]
pub enum StaffRole {
    #[default]
    Melody,
    Bass,
    Percussion,
}
```

**Acceptance Criteria**:
- `cargo build` shows zero warnings
- `cargo clippy` shows zero warnings

---

### Task 13: Add Unit Tests for Untested Modules
**Severity**: MEDIUM
**Effort**: 6-8 hours
**Files**:
- `src/api/position.rs` (has TODO comment)
- `src/renderers/layout_engine.rs`
- `src/converters/musicxml/` (complex conversion logic)

**Action Steps**:

1. **position.rs** (line 206 has explicit TODO):
```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_position_from_row_col() {
        let pos = Position::from_row_col(5, 10);
        assert_eq!(pos.row, 5);
        assert_eq!(pos.col, 10);
    }

    #[test]
    fn test_position_equality() {
        let pos1 = Position::from_row_col(1, 2);
        let pos2 = Position::from_row_col(1, 2);
        assert_eq!(pos1, pos2);
    }

    #[test]
    fn test_position_ordering() {
        let pos1 = Position::from_row_col(1, 2);
        let pos2 = Position::from_row_col(1, 3);
        let pos3 = Position::from_row_col(2, 1);
        assert!(pos1 < pos2);
        assert!(pos2 < pos3);
    }
}
```

2. **layout_engine.rs** - Test ornament layout (currently disabled):
```rust
#[cfg(test)]
mod tests {
    #[test]
    fn test_ornament_positioning() {
        // Create cell with ornament
        // Run layout engine
        // Verify ornament positioned relative to target cell
    }
}
```

3. **converters/musicxml/** - Test MusicXML → LilyPond conversion:
```rust
#[cfg(test)]
mod tests {
    #[test]
    fn test_musicxml_to_lilypond_basic_note() {
        let xml = r#"<note><pitch><step>C</step><octave>4</octave></pitch></note>"#;
        let ly = convert_to_lilypond(xml).unwrap();
        assert!(ly.contains("c'"));
    }
}
```

**Target**: Add 50+ new unit tests

**Acceptance Criteria**:
- All new tests pass
- Coverage for critical paths (position calculations, layout, conversion)
- Each module has `#[cfg(test)] mod tests`

---

## 🟢 PRIORITY 4: NICE TO HAVE (Long-Term)

### Task 14: Improve Test Coverage to 80%
**Severity**: LOW
**Effort**: 16-20 hours (ongoing)
**Files**: Throughout codebase

**Current Status**:
- Unit tests: 266 (251 passing, 15 failing)
- E2E tests: 154 files
- Rust files with tests: 29

**Target Coverage**:
- **Core modules (api/, models/): 90%+**
- **Renderers (renderers/): 80%+**
- **Converters (converters/): 70%+**
- **Overall: 80%+**

**Action Steps**:
1. Install coverage tool: `cargo install cargo-tarpaulin`
2. Run coverage: `cargo tarpaulin --out Html --output-dir coverage`
3. Identify uncovered code in core modules
4. Write tests for critical paths first (happy paths, edge cases, error cases)
5. Add property-based tests for complex algorithms (rhythm parsing, layout)
6. Set up CI to enforce minimum coverage thresholds

**Acceptance Criteria**:
- 80% line coverage in `cargo tarpaulin` report
- All critical functions have at least basic tests
- CI fails if coverage drops below 75%

---

### Task 15: Apply Clippy Suggestions and Enable Stricter Linting
**Severity**: LOW
**Effort**: 2-4 hours
**Files**: Throughout Rust codebase

**Current Status**: 5+ clippy warnings

**Action Steps**:
1. Run `cargo clippy --fix` to auto-fix simple issues
2. Run `cargo clippy -- -W clippy::pedantic` to see all suggestions
3. Address high-impact suggestions:
   - `clippy::unwrap_used` (already covered in Task 3)
   - `clippy::expect_used`
   - `clippy::panic` (already covered in Task 8)
   - `clippy::missing_errors_doc`
   - `clippy::missing_panics_doc`
4. Enable stricter lints in `Cargo.toml`:
```toml
[lints.clippy]
unwrap_used = "deny"
expect_used = "warn"
panic = "deny"
missing_errors_doc = "warn"
```
5. Update CI to fail on clippy warnings

**Acceptance Criteria**:
- `cargo clippy` runs clean (zero warnings)
- Stricter lints enabled in Cargo.toml
- CI enforces clean clippy

---

## 📊 SUMMARY

| Priority | Tasks | Estimated Effort | Impact |
|----------|-------|------------------|--------|
| **P1 (Critical)** | 4 tasks | 10-16 hours | Fix blocking issues |
| **P2 (High)** | 4 tasks | 15-21 hours | Improve stability |
| **P3 (Medium)** | 5 tasks | 22-30 hours | Reduce tech debt |
| **P4 (Nice to Have)** | 2 tasks | 18-24 hours | Long-term quality |
| **TOTAL** | **15 tasks** | **65-91 hours** | Clean, stable codebase |

---

## 🎯 RECOMMENDED EXECUTION ORDER

### Week 1 (Critical Path):
1. Task 2: Fix compilation errors (30 min)
2. Task 1: Fix failing unit tests (4-8 hours)
3. Task 4: Add try-finally for DOM elements (1 hour)
4. Task 5: Add event listener cleanup (30 min)

**Goal**: All tests passing, no memory leaks

### Week 2 (Stability):
5. Task 3: Reduce .unwrap() usage (4-6 hours)
6. Task 8: Replace panic! with Result (2 hours)
7. Task 7: Add E2E tests for missing features (6-8 hours)

**Goal**: Robust error handling, comprehensive test coverage

### Week 3 (Polish):
8. Task 6: Remove excessive logging (2-3 hours)
9. Task 11: Extract magic numbers (2 hours)
10. Task 12: Fix warnings (30 min)
11. Task 10: Address export TODOs (4-6 hours)

**Goal**: Clean, maintainable code

### Week 4+ (Refactoring):
12. Task 9: Refactor large files (8-12 hours)
13. Task 13: Add unit tests (6-8 hours)
14. Task 14: Improve coverage to 80% (16-20 hours, ongoing)
15. Task 15: Apply clippy (2-4 hours)

**Goal**: Long-term maintainability

---

## ✅ SUCCESS CRITERIA

This code review is **COMPLETE** when:

- [ ] All 266 unit tests pass (`cargo test`)
- [ ] Zero compilation errors or warnings (`cargo build`)
- [ ] No memory leaks in JavaScript (profiler verified)
- [ ] All event listeners properly cleaned up
- [ ] Critical paths use proper error handling (no .unwrap() in hot paths)
- [ ] No panic! in production code
- [ ] E2E tests cover all major features
- [ ] Console.log count reduced to <50
- [ ] All files <800 lines
- [ ] Test coverage >80% in core modules
- [ ] Clippy runs clean

**Timeline**: 4-6 weeks for complete implementation

---

**Generated by**: Claude Code Review Agent
**Review Date**: 2025-11-11
**Next Review**: 2025-12-11 (1 month)
