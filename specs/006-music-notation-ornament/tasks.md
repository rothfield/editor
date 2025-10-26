# Implementation Tasks: Music Notation Ornament Support

**Feature**: 006-music-notation-ornament
**Branch**: `006-music-notation-ornament`
**Created**: 2025-10-25
**Status**: Ready for Implementation

---

## Task Summary

| Phase | Description | Task Count | Parallelizable |
|-------|-------------|------------|----------------|
| **Phase 1** | Setup & Infrastructure | 2 | 2 |
| **Phase 2** | Foundational (Data Model) | 3 | 3 |
| **Phase 3** | User Story 1: Basic Ornament Support (P1) | 15 | 9 |
| **Phase 4** | User Story 3: Edit Mode Toggle (P3) | 7 | 4 |
| **Phase 5** | Polish & Integration | 3 | 2 |
| **TOTAL** | | **30** | **20** |

---

## Implementation Strategy

### Approach: Test-Driven Development (TDD)
Per Constitution Principle II (NON-NEGOTIABLE), all E2E tests MUST be written and approved BEFORE implementation.

### Delivery Order:
1. **MVP** = Phase 1-3 (User Story 1: Basic ornament operations)
2. **Enhanced** = Phase 4 (User Story 3: Edit mode toggle)
3. **Polish** = Phase 5 (Cross-cutting concerns)

### Parallel Execution:
- Tasks marked **[P]** can run in parallel
- Tasks in same file must run sequentially
- Tests run before implementation (TDD order)

---

## Phase 1: Setup & Infrastructure

**Goal**: Prepare development environment and test infrastructure.

### T001: [P] Setup E2E test environment for ornaments
**Story**: Infrastructure
**File**: `tests/e2e-pw/helpers/inspectors.js`
**Action**: Verify existing inspector helpers (`openTab`, `readPaneText`) work for ornament testing
**Validation**: Can open LilyPond tab and read content
**Estimated Effort**: 15 minutes

### T002: [P] Add data-testid attributes for ornament UI
**Story**: Infrastructure
**Files**:
- `src/js/ui.js` (ornament edit mode toggle button)
- `src/js/renderer.js` (ornament cells)
**Action**: Add `data-testid` attributes for:
- `btn-toggle-ornament-edit-mode` (edit mode toggle button)
- `ornament-cell` (ornament cell elements)
**Validation**: Elements queryable via `page.getByTestId()`
**Estimated Effort**: 15 minutes

**Checkpoint**: ✓ Test infrastructure ready, can query ornament UI elements

---

## Phase 2: Foundational (Data Model)

**Goal**: Establish core data structures needed by ALL user stories.

### T003: [P] Expand OrnamentIndicator enum to 6 variants
**Story**: Foundational
**File**: `src/models/elements.rs`
**Action**:
- Modify `OrnamentIndicator` enum from 3 to 6 variants:
  ```rust
  None = 0,
  OrnamentBeforeStart = 1,
  OrnamentBeforeEnd = 2,
  OrnamentAfterStart = 3,
  OrnamentAfterEnd = 4,
  OrnamentOnTopStart = 5,
  OrnamentOnTopEnd = 6
  ```
- Add methods: `is_start()`, `is_end()`, `position_type()`, `matches()`, `snake_case_name()`
- Update custom `Serialize` impl for new variants
**Reference**: `data-model.md` lines 30-136
**Validation**: `cargo build --lib` succeeds
**Estimated Effort**: 30 minutes

### T004: [P] Add OrnamentPositionType helper enum
**Story**: Foundational
**File**: `src/models/elements.rs`
**Action**:
- Create `OrnamentPositionType` enum: `Before`, `After`, `OnTop`
- No serialization needed (ephemeral, used only in algorithms)
**Reference**: `data-model.md` lines 140-158
**Validation**: `cargo build --lib` succeeds
**Estimated Effort**: 10 minutes

### T005: [P] Add is_rhythm_transparent() to Cell
**Story**: Foundational
**File**: `src/models/core.rs`
**Action**:
- Add method to `impl Cell`:
  ```rust
  pub fn is_rhythm_transparent(&self) -> bool {
      !matches!(self.ornament_indicator, OrnamentIndicator::None)
  }
  ```
**Reference**: `data-model.md` lines 180-195
**Validation**: `cargo build --lib` succeeds
**Estimated Effort**: 10 minutes

**Checkpoint**: ✓ Data model foundation complete, OrnamentIndicator expanded to 6 variants, rhythm-transparent predicate available

---

## Phase 3: User Story 1 - Adding Grace Notes to Embellish Musical Phrases (P1)

**Goal**: Users can type ornament syntax, see ornaments rendered with correct visual styling, and export to MusicXML/LilyPond.

**Independent Test Criteria**: Type `<234> 1`, verify grace notes D, E, F appear before note C in LilyPond/MusicXML export.

### Tests (TDD: Write First)

### T006: [P] Write E2E test: Basic ornament parsing and rendering
**Story**: US1
**File**: `tests/e2e-pw/tests/ornament-basic.spec.js`
**Action**:
- Test scenario: Type `<234> 1` → verify LilyPond output contains `\grace { d'16 e' f' } c'4`
- Use inspector helpers (`openTab`, `readPaneText`)
- Verify ornament cells have `data-testid="ornament-cell"`
- Snapshot LilyPond output
**Reference**: `contracts/ornament-api.md` Export Flow, `quickstart.md` Example 2
**Validation**: Test file exists, runs (will fail until implementation)
**Estimated Effort**: 45 minutes

### T007: [P] Write E2E test: MusicXML grace note export
**Story**: US1
**File**: `tests/e2e-pw/tests/ornament-export.spec.js`
**Action**:
- Test scenario: Type `<23> 1` → verify MusicXML tab contains `<grace/>` elements
- Check placement attributes for position types
- Verify no duration attribute on grace notes
- Snapshot MusicXML output
**Reference**: `contracts/ornament-api.md` MusicXML Export, `research.md` Decision #6
**Validation**: Test file exists, runs (will fail)
**Estimated Effort**: 30 minutes

### T008: [P] Write E2E test: Beat calculation exclusion
**Story**: US1
**File**: `tests/e2e-pw/tests/ornament-beats.spec.js`
**Action**:
- Test scenario: Type `<234> 1--4` → verify beat count = 4 (not 7)
- Check Document Model tab for beat derivation output
- Verify ornaments marked as rhythm-transparent
**Reference**: `contracts/ornament-api.md` Beat Derivation, FR-006a
**Validation**: Test file exists, runs (will fail)
**Estimated Effort**: 30 minutes

### T009: [P] Write E2E test: Visual styling (75% size, superscript)
**Story**: US1
**File**: `tests/e2e-pw/tests/ornament-basic.spec.js`
**Action**:
- Test scenario: Type `<23> 1` → verify ornament cells have CSS:
  - `font-size: 0.75em` (or similar)
  - `vertical-align: super`
  - `color: indigo-500`
- Use computed styles or snapshot approach
**Reference**: `research.md` Decision #9, FR-004
**Validation**: Test file exists, runs (will fail)
**Estimated Effort**: 20 minutes

### Implementation

### T010: Add ornament syntax parsing to tokenizer
**Story**: US1
**File**: `src/parse/tokens.rs`
**Action**:
- Recognize markers: `<`, `>`, `^`
- Parse ornament spans: `<...>` → OrnamentBeforeStart/End
- Parse ornament spans: `>...<` → OrnamentAfterStart/End
- Parse ornament spans: `^...^` → OrnamentOnTopStart/End
- Set `ornament_indicator` field on cells within spans
- Extract pitch content between markers
**Reference**: `research.md` Decision #2, `quickstart.md` Syntax section
**Validation**: Parse `<234> 1` → cells have correct indicators
**Estimated Effort**: 1 hour

### T011: Add validate_ornament_spans() function
**Story**: US1
**File**: `src/parse/tokens.rs`
**Action**:
- Check balanced start/end indicators
- Check position type matches (Before start → Before end)
- Return validation errors for unmatched/mismatched indicators
**Reference**: `data-model.md` lines 543-579
**Validation**: Unmatched `<` returns validation error
**Estimated Effort**: 30 minutes

### T012: [P] Exclude ornaments from beat derivation
**Story**: US1
**File**: `src/parse/beats.rs`
**Action**:
- Modify `derive_beats()` to filter cells:
  ```rust
  let rhythmic_cells: Vec<&Cell> = cells
      .iter()
      .filter(|c| !c.is_rhythm_transparent())
      .collect();
  ```
- Existing beat logic operates on `rhythmic_cells` only
**Reference**: `data-model.md` lines 516-532, FR-006
**Validation**: Test T008 passes
**Estimated Effort**: 20 minutes

### T013: [P] Implement attachment resolution algorithm
**Story**: US1
**File**: `src/renderers/layout_engine.rs` (or new file)
**Action**:
- Create `OrnamentSpan` struct (ephemeral)
- Create `OrnamentGroups` struct (ephemeral)
- Create `AttachmentMap` type alias
- Implement `resolve_ornament_attachments(cells: &[Cell]) -> AttachmentMap`
  - Extract ornament spans
  - For each span, find anchor based on position type:
    - Before → first non-ornament token to RIGHT
    - After → first non-ornament token to LEFT
    - OnTop → NEAREST non-ornament token
  - Group spans by anchor index
- Handle orphaned ornaments (log warning)
**Reference**: `data-model.md` lines 201-315, 376-512
**Validation**: Input `<23> 1` → attachment_map[4] = {before: [span(2,3)]}
**Estimated Effort**: 1.5 hours

### T014: [P] Implement floating layout for ornaments (edit mode OFF)
**Story**: US1
**File**: `src/html_layout/cell.rs` or `src/renderers/layout_engine.rs`
**Action**:
- Add `edit_mode: bool` parameter to layout functions
- When `edit_mode = false`:
  - Resolve attachments
  - Position ornaments above anchor notes (x overlaps, y raised)
  - Set ornament width = 0 (floating)
- Compute bounding boxes
**Reference**: `research.md` Decision #8, FR-004a
**Validation**: Ornaments positioned with x-overlap, zero width
**Estimated Effort**: 1 hour

### T015: [P] Implement collision detection for floating ornaments
**Story**: US1
**File**: `src/renderers/layout_engine.rs`
**Action**:
- After initial layout, check ornament bounding boxes for overlap
- If collision detected:
  - Calculate required spacing (overlap + 2px margin)
  - Shift subsequent elements right
  - Recompute bounding boxes
- Max 2 passes
**Reference**: `research.md` Decision #5, FR-004b
**Validation**: Adjacent ornaments with collision → spacing added
**Estimated Effort**: 45 minutes

### T016: [P] Add ornament visual styling (CSS/JavaScript)
**Story**: US1
**File**: `src/js/renderer.js` or `src/html_layout/cell.rs`
**Action**:
- Apply CSS to ornament cells:
  - `font-size: 0.75em`
  - `vertical-align: super`
  - `position: relative; top: -0.3em`
  - `color: #6366f1` (indigo-500)
- Add `ornament-cell` class for identification
**Reference**: `research.md` Decision #9, FR-004, FR-012
**Validation**: Test T009 passes (visual styling correct)
**Estimated Effort**: 30 minutes

### T017: Export ornaments to MusicXML as grace notes
**Story**: US1
**File**: `src/renderers/musicxml/export.rs`
**Action**:
- Resolve attachments before export
- For each anchor with ornaments:
  - Emit `<grace/>` elements for before-ornaments (no slash)
  - Emit main `<note>` element
  - Emit `<grace slash="yes"/>` for after-ornaments
  - Set `placement` attributes based on position type
- Grace notes have NO duration attribute
**Reference**: `contracts/ornament-api.md` Export to MusicXML, `research.md` Decision #6, FR-007
**Validation**: Test T007 passes (MusicXML contains `<grace/>`)
**Estimated Effort**: 1 hour

### T018: [P] Update MusicXML→LilyPond converter for grace notes
**Story**: US1
**File**: `src/converters/musicxml/musicxml_to_lilypond/converter.rs`
**Action**:
- Check if converter handles `<grace/>` elements
- If not, add conversion logic:
  - `<grace/>` → `\grace { ... }`
  - `<grace slash="yes"/>` → `\acciaccatura { ... }`
  - Top position → `\appoggiatura { ... }`
**Reference**: `research.md` Decision #7, FR-008
**Validation**: Test T006 passes (LilyPond contains `\grace`)
**Estimated Effort**: 45 minutes

### T019: Expose ornament operations in WASM API
**Story**: US1
**File**: `src/api.rs`
**Action**:
- Add WASM functions with `#[wasm_bindgen]`:
  - `parse_text(text, pitch_system)` - Update to handle ornament syntax
  - `export_to_musicxml(cells_json)` - Expose MusicXML export
  - `export_to_lilypond(cells_json)` - Expose LilyPond export
  - `validate_ornament_spans(cells_json)` - Expose validation
  - `resolve_ornament_attachments(cells_json)` - For inspector debug
**Reference**: `contracts/ornament-api.md` API Functions
**Validation**: JavaScript can call `wasmModule.parse_text("<23> 1", 1)`
**Estimated Effort**: 30 minutes

### T020: [P] Run all E2E tests and fix failures
**Story**: US1
**Files**: All test files from T006-T009
**Action**:
- Execute: `npx playwright test ornament-basic.spec.js ornament-export.spec.js ornament-beats.spec.js`
- Debug failures using `--headed` mode
- Check inspector tabs (LilyPond, MusicXML, Doc Model)
- Fix implementation issues
- Re-run until all tests pass
**Validation**: All T006-T009 tests pass 3+ times consecutively
**Estimated Effort**: 1-2 hours (iterative debugging)

**Checkpoint**: ✓ User Story 1 complete - users can add ornaments, see visual rendering, export to MusicXML/LilyPond

---

## Phase 4: User Story 3 - Edit Mode Toggle for Inline Editing (P3)

**Goal**: Users can toggle between inline editing mode (ornaments in sequence) and floating mode (ornaments above anchors).

**Independent Test Criteria**: Type `<23> 1`, toggle edit mode, verify layout changes without data modification.

### Tests (TDD: Write First)

### T021: [P] Write E2E test: Edit mode toggle changes layout
**Story**: US3
**File**: `tests/e2e-pw/tests/ornament-edit-mode.spec.js`
**Action**:
- Test scenario: Type `<23> 1`
- Click edit mode toggle button (`btn-toggle-ornament-edit-mode`)
- Verify layout changes:
  - Edit mode ON: ornaments inline with normal spacing
  - Edit mode OFF: ornaments floating with zero width
- Check that cell data unchanged (inspect Document Model tab)
- Measure toggle time (< 2s target)
**Reference**: `quickstart.md` Edit Mode section, FR-009
**Validation**: Test file exists, runs (will fail)
**Estimated Effort**: 30 minutes

### T022: [P] Write E2E test: Edit mode toggle performance
**Story**: US3
**File**: `tests/e2e-pw/tests/ornament-edit-mode.spec.js`
**Action**:
- Test scenario: Generate large document (1000 cells, 100 ornaments)
- Measure toggle time using `performance.now()`
- Assert duration < 2000ms (2 seconds)
**Reference**: `contracts/ornament-api.md` Performance Requirements, FR-009
**Validation**: Test file exists, runs (will fail)
**Estimated Effort**: 20 minutes

### Implementation

### T023: Add ornament edit mode state to Editor
**Story**: US3
**File**: `src/js/editor.js`
**Action**:
- Add field: `this.ornamentEditMode = false`
- Add method:
  ```javascript
  toggleOrnamentEditMode() {
      this.ornamentEditMode = !this.ornamentEditMode;
      this.recomputeLayout(); // Call WASM with edit_mode param
      this.render();
  }
  ```
- Modify `recomputeLayout()` to pass `edit_mode` to WASM
**Reference**: `data-model.md` lines 322-370, FR-009a
**Validation**: Toggle sets flag, triggers re-render
**Estimated Effort**: 30 minutes

### T024: [P] Add keyboard shortcut for edit mode toggle
**Story**: US3
**File**: `src/js/ui.js`
**Action**:
- Register keyboard listener: `Alt+Shift+O`
- Call `editor.toggleOrnamentEditMode()` on keypress
- Add UI button with `data-testid="btn-toggle-ornament-edit-mode"`
- Update button label based on mode state
**Reference**: `quickstart.md` Keyboard Shortcut, FR-010
**Validation**: Pressing Alt+Shift+O toggles mode
**Estimated Effort**: 30 minutes

### T025: Implement inline layout for ornaments (edit mode ON)
**Story**: US3
**File**: `src/html_layout/cell.rs` or `src/renderers/layout_engine.rs`
**Action**:
- When `edit_mode = true`:
  - Render ornaments inline in sequential position
  - Use normal horizontal spacing (no zero-width)
  - Still apply visual styling (75% size, superscript)
  - No attachment resolution needed (linear layout)
**Reference**: `research.md` Decision #8, FR-009c
**Validation**: Edit mode ON → ornaments appear inline
**Estimated Effort**: 45 minutes

### T026: Add compute_layout() WASM function with edit_mode param
**Story**: US3
**File**: `src/api.rs`
**Action**:
- Add WASM function:
  ```rust
  #[wasm_bindgen]
  pub fn compute_layout(cells_json: &str, edit_mode: bool) -> String {
      // Dispatch to floating or inline layout based on edit_mode
      // Return JSON layout data
  }
  ```
- Log performance warnings if > 100ms
**Reference**: `contracts/ornament-api.md` Compute Layout, FR-009e
**Validation**: JavaScript can call with `edit_mode: true/false`
**Estimated Effort**: 30 minutes

### T027: [P] Run edit mode E2E tests and fix failures
**Story**: US3
**Files**: `tests/e2e-pw/tests/ornament-edit-mode.spec.js`
**Action**:
- Execute: `npx playwright test ornament-edit-mode.spec.js`
- Verify layout transitions smooth (no flickering)
- Check performance timing assertions pass
- Debug and fix failures
**Validation**: Tests T021-T022 pass 3+ times consecutively
**Estimated Effort**: 1 hour

**Checkpoint**: ✓ User Story 3 complete - users can toggle edit mode, see layout changes, performance meets target

---

## Phase 5: Polish & Integration

**Goal**: Refine cross-cutting concerns, ensure full test coverage, finalize documentation.

### T028: [P] Run full E2E test suite in Docker
**Story**: Integration
**Command**: `./scripts/run-tests-docker.sh tests/e2e-pw/tests/ornament-*.spec.js`
**Action**:
- Execute all ornament tests in Docker (WebKit compatibility)
- Verify all tests pass on all browsers (chromium, firefox, webkit)
- Check test artifacts (screenshots, traces) for failures
**Validation**: All ornament tests pass in Docker across 3 browsers
**Estimated Effort**: 30 minutes

### T029: [P] Performance validation and optimization
**Story**: Integration
**Files**: `src/renderers/layout_engine.rs`, `src/parse/beats.rs`, `src/api.rs`
**Action**:
- Run performance tests with 1000 cells, 100 ornaments
- Check WASM console logs for performance warnings
- Optimize hot paths if needed:
  - Attachment resolution (target < 10ms)
  - Layout computation (target < 100ms)
  - Beat derivation (target < 10ms)
- Verify 60fps keyboard latency maintained
**Reference**: `research.md` Decision #10, `contracts/ornament-api.md` Performance
**Validation**: All performance targets met
**Estimated Effort**: 1 hour

### T030: Documentation and inspector tab verification
**Story**: Integration
**Files**: `src/js/ui.js` (inspector tabs)
**Action**:
- Verify inspector tabs display ornament data:
  - LilyPond tab: Shows `\grace { ... }` syntax
  - MusicXML tab: Shows `<grace/>` elements
  - Document Model tab: Shows ornament_indicator values
  - WASM Layout tab: Shows attachment map (use `resolve_ornament_attachments()`)
- Update inline help text or tooltips if needed
**Reference**: `quickstart.md` Inspector Tabs, `contracts/ornament-api.md` Resolve Attachments
**Validation**: All inspector tabs display ornament data correctly
**Estimated Effort**: 30 minutes

**Checkpoint**: ✓ Feature complete - all tests passing, performance validated, documentation complete

---

## Dependencies & Execution Order

### Critical Path (Sequential):
```
Phase 1 (Setup) → Phase 2 (Foundational) → Phase 3 (US1) → Phase 4 (US3) → Phase 5 (Polish)
```

### Within Phase 3 (US1):
```
Tests (T006-T009) [write first, parallel]
  ↓
T010 (parsing) → T011 (validation)
  ↓
T012 (beat exclusion) [P]
T013 (attachment) → T014 (floating layout) → T015 (collision)
T016 (visual styling) [P]
T017 (MusicXML export) [P]
T018 (LilyPond converter) [P]
  ↓
T019 (WASM API) [after all Rust impl]
  ↓
T020 (test validation) [final step]
```

### Within Phase 4 (US3):
```
Tests (T021-T022) [write first, parallel]
  ↓
T023 (editor state) → T024 (keyboard shortcut) [sequential, same file]
T025 (inline layout) [P]
T026 (WASM API) [P]
  ↓
T027 (test validation) [final step]
```

### Parallel Execution Examples:

**Phase 2 (Foundational)**: All 3 tasks can run in parallel
```bash
# Terminal 1
Task T003: Expand OrnamentIndicator enum (src/models/elements.rs)

# Terminal 2
Task T004: Add OrnamentPositionType (src/models/elements.rs - different section)

# Terminal 3
Task T005: Add is_rhythm_transparent() (src/models/core.rs - different file)
```

**Phase 3 (US1) - Test Writing**: All 4 tests can be written in parallel
```bash
# Terminal 1
Task T006: ornament-basic.spec.js

# Terminal 2
Task T007: ornament-export.spec.js

# Terminal 3
Task T008: ornament-beats.spec.js

# Terminal 4
Task T009: ornament-basic.spec.js (visual styling test)
```

**Phase 3 (US1) - Implementation**: After parsing (T010-T011), 6 tasks can run in parallel
```bash
# Terminal 1
Task T012: Beat exclusion (src/parse/beats.rs)

# Terminal 2
Task T013-T015: Attachment + layout + collision (src/renderers/layout_engine.rs)

# Terminal 3
Task T016: Visual styling (src/js/renderer.js)

# Terminal 4
Task T017: MusicXML export (src/renderers/musicxml/export.rs)

# Terminal 5
Task T018: LilyPond converter (src/converters/musicxml/musicxml_to_lilypond/converter.rs)
```

---

## Test Coverage Summary

| Test File | Story | Scenarios Covered | Status |
|-----------|-------|-------------------|--------|
| `ornament-basic.spec.js` | US1 | Parsing, rendering, visual styling | T006, T009 |
| `ornament-export.spec.js` | US1 | MusicXML grace note export | T007 |
| `ornament-beats.spec.js` | US1 | Beat calculation exclusion | T008 |
| `ornament-edit-mode.spec.js` | US3 | Edit mode toggle, layout changes, performance | T021, T022 |

**Total Test Scenarios**: 7
**Coverage**: All functional requirements (FR-004 through FR-013)

---

## Implementation Checklist

**Before Starting**:
- [ ] Checkout branch `006-music-notation-ornament`
- [ ] Run `cargo build --lib` to verify Rust compilation
- [ ] Run `npm install` to ensure dependencies up to date
- [ ] Run `./scripts/run-tests-docker.sh` to verify test infrastructure

**Phase 1 (Setup)**:
- [ ] T001: Verify inspector helpers work
- [ ] T002: Add data-testid attributes

**Phase 2 (Foundational)**:
- [ ] T003: Expand OrnamentIndicator enum (6 variants)
- [ ] T004: Add OrnamentPositionType helper enum
- [ ] T005: Add is_rhythm_transparent() method

**Phase 3 (User Story 1) - Tests First**:
- [ ] T006: Write basic ornament test (LilyPond smoke test)
- [ ] T007: Write MusicXML export test
- [ ] T008: Write beat calculation exclusion test
- [ ] T009: Write visual styling test

**Phase 3 (User Story 1) - Implementation**:
- [ ] T010: Parse ornament syntax (`<>`, `><`, `^^`)
- [ ] T011: Add ornament span validation
- [ ] T012: Exclude ornaments from beat derivation
- [ ] T013: Implement attachment resolution algorithm
- [ ] T014: Implement floating layout (edit mode OFF)
- [ ] T015: Implement collision detection
- [ ] T016: Add ornament visual styling (CSS)
- [ ] T017: Export ornaments to MusicXML (`<grace/>`)
- [ ] T018: Update MusicXML→LilyPond converter
- [ ] T019: Expose WASM API functions
- [ ] T020: Run all US1 tests, fix failures

**Phase 4 (User Story 3) - Tests First**:
- [ ] T021: Write edit mode toggle test
- [ ] T022: Write edit mode performance test

**Phase 4 (User Story 3) - Implementation**:
- [ ] T023: Add edit mode state to Editor
- [ ] T024: Add keyboard shortcut (Alt+Shift+O)
- [ ] T025: Implement inline layout (edit mode ON)
- [ ] T026: Add compute_layout() WASM function with edit_mode param
- [ ] T027: Run all US3 tests, fix failures

**Phase 5 (Polish)**:
- [ ] T028: Run full E2E suite in Docker (all browsers)
- [ ] T029: Performance validation and optimization
- [ ] T030: Verify inspector tabs display ornament data

**Final Validation**:
- [ ] All 30 tasks completed
- [ ] All E2E tests passing (7 test scenarios)
- [ ] Performance targets met (< 100ms layout, < 2s toggle)
- [ ] Inspector tabs show ornament data
- [ ] Documentation complete (quickstart.md verified)

---

## Estimated Total Effort

| Phase | Estimated Time |
|-------|----------------|
| Phase 1: Setup | 30 minutes |
| Phase 2: Foundational | 50 minutes |
| Phase 3: User Story 1 | 9-10 hours |
| Phase 4: User Story 3 | 3-4 hours |
| Phase 5: Polish | 2 hours |
| **TOTAL** | **15-17 hours** |

**MVP Delivery** (Phase 1-3): ~11 hours
**Enhanced Delivery** (Phase 1-4): ~15 hours
**Complete Delivery** (Phase 1-5): ~17 hours

---

## Success Criteria

### User Story 1 Success:
- ✅ Users can type `<234> 1` and see grace notes before main note
- ✅ Ornaments render at 75% size, superscript style
- ✅ Ornaments use zero horizontal width (floating above)
- ✅ Ornaments excluded from beat calculations
- ✅ Export to MusicXML contains `<grace/>` elements
- ✅ Export to LilyPond contains `\grace { ... }` syntax
- ✅ All 4 E2E tests (T006-T009) pass

### User Story 3 Success:
- ✅ Users can press Alt+Shift+O to toggle edit mode
- ✅ Edit mode ON shows ornaments inline with normal spacing
- ✅ Edit mode OFF shows ornaments floating above anchors
- ✅ Toggle completes in < 2 seconds for 1000 cells
- ✅ Cell data unchanged after toggle (verified in inspector)
- ✅ All 2 E2E tests (T021-T022) pass

### Overall Feature Success:
- ✅ All 30 tasks completed
- ✅ All 7 E2E test scenarios passing in Docker (3 browsers)
- ✅ Performance targets met (60fps keyboard, < 100ms layout)
- ✅ Constitutional principles satisfied (TDD, Performance First, MusicXML First)
- ✅ Inspector tabs display ornament data at all stages
- ✅ User documentation verified (quickstart.md examples work)

---

## Notes

### TDD Approach (Constitution Principle II):
This task list follows strict Test-Driven Development:
- Tests written BEFORE implementation in each phase
- Tests marked with `[P]` for parallel writing
- Implementation tasks reference test numbers for validation
- Tests run in Docker to ensure cross-platform compatibility

### Parallel Execution:
- **20 out of 30 tasks** can run in parallel
- Tasks in different files can be parallelized
- Tasks in same file run sequentially
- Maximum parallelism: 5-6 concurrent tasks

### Performance Targets:
- Parse text: < 50ms for 1000 characters
- Compute layout: < 100ms for 1000 cells
- Export MusicXML: < 500ms for 1000 cells
- Edit mode toggle: < 2s for 1000 cells
- Beat derivation: < 10ms for 1000 cells

### Inspector-First Testing:
Per CLAUDE.md guidelines, all tests prioritize inspector tabs:
1. **LilyPond tab** - primary oracle for end-to-end correctness
2. **MusicXML tab** - structural soundness verification
3. **Document Model tab** - data integrity checks
4. **WASM Layout tab** - attachment resolution debugging

**Fail fast if LilyPond export is empty or incorrect.**

---

**Tasks Ready for Execution**: This file can be used directly with `/speckit.implement` command or manual task-by-task implementation.
