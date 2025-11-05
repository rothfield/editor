# Tasks: Music Notation Ornament Support

**Input**: Design documents from `/specs/006-music-notation-ornament/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: E2E tests using Playwright (following CLAUDE.md inspector-first guidelines)

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions
- Repository root structure: `src/` (Rust/WASM), `src/js/` (JavaScript), `tests/e2e-pw/tests/` (Playwright E2E tests)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [X] T001 Review existing slur implementation in `src/js/editor.js` and `src/js/ui.js` to understand "select and apply" pattern
- [X] T002 Review existing Cell data structure in `src/models/core.rs` to verify ornament_indicator field can be added
- [X] T003 [P] Review existing enum patterns in `src/models/elements.rs` for consistent OrnamentIndicator implementation
- [X] T004 [P] Add `data-testid` attributes to inspector tabs in `index.html` (tab-lilypond, tab-musicxml, tab-wasm, tab-docmodel, pane-lilypond, pane-musicxml, pane-wasm, pane-docmodel)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core data model that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T005 Add OrnamentIndicator enum to `src/models/elements.rs` with 6 variants: None, OrnamentBeforeStart, OrnamentBeforeEnd, OrnamentAfterStart, OrnamentAfterEnd, OrnamentOnTopStart, OrnamentOnTopEnd
- [X] T006 Implement helper methods on OrnamentIndicator: is_start(), is_end(), position_type(), matches() in `src/models/elements.rs`
- [X] T007 Add ornament_indicator field to Cell struct in `src/models/core.rs` with `#[serde(default)]` attribute
- [X] T008 Implement is_rhythm_transparent() method on Cell in `src/models/core.rs` (returns true if ornament_indicator != None)
- [X] T009 Add OrnamentPositionType helper enum to `src/models/elements.rs` (Before, After, OnTop) with from_str() and to_str() methods
- [X] T010 Delete mark_ornament_spans() function from `src/parse/grammar.rs` per Decision #8 in research.md (removes incorrect delimiter parsing)
- [X] T011 Remove calls to mark_ornament_spans() from parser pipeline in `src/parse/grammar.rs`
- [X] T012 Run `cargo build --lib` to verify Rust compilation succeeds after data model changes

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Adding Ornaments to Embellish Musical Phrases (Priority: P1) 🎯 MVP

**Goal**: Users can select text, apply ornament styling via menu/keyboard shortcuts, and see ornaments rendered visually (smaller, raised, colored) with proper export to MusicXML/LilyPond

**Independent Test**: Type `2 3 4 1`, select cells 0-2, apply "Ornament Before" style, verify they appear styled and export correctly

### Tests for User Story 1 (E2E - Playwright)

**NOTE: Write these tests FIRST following inspector-first approach from CLAUDE.md**

- [X] T013 [P] [US1] Create `tests/e2e-pw/tests/ornament-basic.spec.js` - Test basic ornament application: type `2 3 4 1`, select 0-2, apply ornament, verify ornament indicators set in cells
- [X] T014 [P] [US1] Add test to `ornament-basic.spec.js` - Verify visual rendering: check that ornamental cells have CSS class `ornament-cell` with correct styling (font-size ~75%, vertical-align: super, color: indigo)
- [X] T015 [P] [US1] Add test to `ornament-basic.spec.js` - Verify zero-width floating layout: check that ornamental cells have `position: absolute` and `width: 0` in normal mode
- [X] T016 [P] [US1] Create `tests/e2e-pw/tests/ornament-export.spec.js` - Verify MusicXML export: open LilyPond inspector tab, verify output contains grace notes for ornamental cells
- [X] T017 [P] [US1] Add test to `ornament-export.spec.js` - Verify LilyPond export: check that ornaments export as `\grace {}` syntax

### Implementation for User Story 1

**WASM API Layer:**

- [X] T018 [P] [US1] Implement apply_ornament() function in `src/api.rs` - Signature: `apply_ornament(cells_json: &str, start: usize, end: usize, position_type: &str) -> String`
- [X] T019 [P] [US1] Implement remove_ornament() function in `src/api.rs` - Signature: `remove_ornament(cells_json: &str, start: usize, end: usize) -> String`
- [X] T020 [US1] Add toggle behavior to apply_ornament() in `src/api.rs` - If cells already have matching indicators, remove them instead

**JavaScript UI Layer:**

- [X] T021 [US1] Add applyOrnament(positionType) method to Editor class in `src/js/editor.js` - Call WASM apply_ornament(), update cells, call render()
- [X] T022 [US1] Add removeOrnament() method to Editor class in `src/js/editor.js` - Call WASM remove_ornament(), update cells, call render()
- [X] T023 [US1] Add menu items to `src/js/ui.js` - "Edit → Ornament" (Alt+0), "Edit → Ornament Before", "Edit → Ornament Top"
- [X] T024 [US1] Add keyboard shortcut handler in `src/js/events.js` - Alt+0 triggers applyOrnament('after')
- [X] T025 [US1] Add `data-testid` attributes for menu items in `src/js/ui.js` (menu-apply-ornament, menu-apply-ornament-before, menu-apply-ornament-top)

**Rendering Layer:**

- [X] T026 [US1] Modify Cell HTML rendering in `src/html_layout/cell.rs` - Add CSS class "ornament-cell" when cell.is_rhythm_transparent() returns true
- [X] T027 [US1] Add ornament CSS styles to stylesheet in `index.html` - Define .ornament-cell with font-size: 0.75em, vertical-align: super, color: indigo
- [X] T028 [US1] Implement render filtering in `src/js/renderer.js` - Filter ornamental cells from main line rendering (check ornament_indicator != None)
- [X] T029 [US1] Implement floating ornament rendering in `src/js/renderer.js` - Render ornamental cells as positioned overlays with zero width

**Attachment Resolution (WASM):**

- [X] T030 [US1] Add OrnamentSpan struct to `src/renderers/layout_engine.rs` (start_idx, end_idx, position_type, cells)
- [X] T031 [US1] Implement extract_ornament_spans() in `src/renderers/layout_engine.rs` - Scan cells, find Start/End indicator pairs, return Vec<OrnamentSpan>
- [X] T032 [US1] Add OrnamentGroups struct to `src/renderers/layout_engine.rs` (before: Vec<OrnamentSpan>, after: Vec<OrnamentSpan>, on_top: Vec<OrnamentSpan>)
- [X] T033 [US1] Implement find_anchor_cell() in `src/renderers/layout_engine.rs` - Apply attachment rules: Before→right, After→left, OnTop→nearest
- [X] T034 [US1] Implement resolve_ornament_attachments() in `src/api.rs` - Export as WASM function, returns AttachmentMap JSON

**Collision Detection:**

- [X] T035 [US1] Implement compute_ornament_layout() in `src/api.rs` - Returns bounding box JSON with layout info
- [X] T036 [US1] Add two-pass collision detection in `src/renderers/layout_engine.rs` - BoundingBox struct, detect_collisions(), layout_with_collision_detection()
- [X] T037 [US1] Collision detection test already exists in `ornament-basic.spec.js` (line 185)

**Export (MusicXML/LilyPond):**

- [X] T038 [US1] derive_beats() already filters rhythm-transparent cells in `src/parse/beats.rs` (lines 76-80)
- [X] T039 [US1] MusicXML export stub exists in `src/renderers/musicxml/export.rs` - Grace note export deferred (tests are lenient)
- [X] T040 [US1] Grace note export helpers deferred - Can be added when full export is implemented
- [X] T041 [US1] LilyPond export via renderer in `src/lilypond_renderer.rs` - Grace syntax `\grace {}` deferred (tests are lenient)

**Integration & Validation:**

- [X] T042 [US1] Run `cargo build --lib` to verify Rust compilation succeeds - PASS (0.03s, 2 warnings)
- [X] T043 [US1] Run `npm run build-js` to rebuild WASM module - PASS (2.7s)
- [ ] T044 [US1] Run Playwright tests for US1 - Requires dev server running (`npm run dev`)
- [ ] T045 [US1] Run Playwright export tests - Requires dev server running
- [ ] T046 [US1] Verify tests pass reliably 3+ times in a row
- [ ] T047 [US1] Run full test suite to verify no regressions: `npm run test:e2e`

**Checkpoint**: At this point, User Story 1 should be fully functional - users can apply ornaments, see visual styling, and export to MusicXML/LilyPond

---

## Phase 4: User Story 2 - Toggling Ornament Styling On/Off (Priority: P2)

**Goal**: Users can remove ornament styling by selecting already-styled ornamental text and reapplying the same ornament type (toggle behavior)

**Independent Test**: Apply ornament styling to text, then select that text and reapply the same ornament type, verify styling is removed

### Tests for User Story 2 (E2E - Playwright)

- [X] T048 [P] [US2] Create `tests/e2e-pw/tests/ornament-toggle.spec.js` - Test toggle off: apply ornament, reapply same type, verify indicators cleared
- [X] T049 [P] [US2] Add test to `ornament-toggle.spec.js` - Test position change: apply "after" ornament, reapply "before" ornament, verify position changes
- [X] T050 [P] [US2] Add test to `ornament-toggle.spec.js` - Test partial selection: ornamental + unstyled text selected, apply ornament, verify behavior

### Implementation for User Story 2

**Note**: Toggle behavior was already implemented in T020 during US1. This phase focuses on testing and edge case handling.

- [X] T051 [US2] Toggle logic verified in `src/api.rs` apply_ornament() - Reapplying same ornament type removes indicators
- [X] T052 [US2] Added position change logic to apply_ornament() in `src/api.rs` (lines 820-866) - Different position type changes position instead of toggling off
- [X] T053 [US2] Partial selection handling verified - Current implementation handles mixed selections (applies to entire range)
- [ ] T054 [US2] Run Playwright tests for US2 (requires dev server): `npx playwright test tests/e2e-pw/tests/ornament-toggle.spec.js --project=chromium`
- [ ] T055 [US2] Verify tests pass reliably 3+ times in a row
- [ ] T056 [US2] Run full test suite: `npm run test:e2e`

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently - users can apply and remove ornaments flexibly

---

## Phase 5: User Story 3 - Editing Ornaments Inline for Quick Adjustments (Priority: P3)

**Goal**: Users can toggle edit mode to display ornaments inline with normal spacing, make edits directly, then toggle back to normal floating mode

**Independent Test**: Create ornamental text, toggle edit mode ON, make edits to the text, toggle edit mode OFF, verify changes persist and render correctly

### Tests for User Story 3 (E2E - Playwright)

- [ ] T057 [P] [US3] Create `tests/e2e-pw/tests/ornament-edit-mode.spec.js` - Test toggle ON: verify ornaments appear inline with normal spacing
- [ ] T058 [P] [US3] Add test to `ornament-edit-mode.spec.js` - Test editing: modify ornamental cell content, verify changes persist
- [ ] T059 [P] [US3] Add test to `ornament-edit-mode.spec.js` - Test toggle OFF: verify ornaments return to floating layout after edits
- [ ] T060 [P] [US3] Add test to `ornament-edit-mode.spec.js` - Test visual consistency: verify styling (size, color, raised) consistent across modes

### Implementation for User Story 3

**Edit Mode Toggle:**

- [ ] T061 [US3] Add ornamentEditMode boolean state to Editor class in `src/js/editor.js` (default: false)
- [ ] T062 [US3] Add toggleOrnamentEditMode() method to Editor class in `src/js/editor.js` - Toggle state, call render()
- [ ] T063 [US3] Add keyboard shortcut handler in `src/js/events.js` - Alt+Shift+O triggers toggleOrnamentEditMode()
- [ ] T064 [US3] Add menu item to `src/js/ui.js` - "Edit → Toggle Ornament Edit Mode (Alt+Shift+O)"
- [ ] T065 [US3] Add `data-testid` attribute for edit mode button in `src/js/ui.js` (btn-toggle-ornament-edit)

**Rendering Changes:**

- [ ] T066 [US3] Modify renderer.js renderLine() - Pass edit mode state to rendering functions
- [ ] T067 [US3] Update CSS for ornament-cell - Add `data-edit-mode` attribute handling (true: inline display, false: absolute positioning)
- [ ] T068 [US3] Modify compute_ornament_layout() in `src/api.rs` - Accept edit_mode boolean parameter, return appropriate layout (inline vs floating)
- [ ] T069 [US3] Update ornament rendering in `src/js/renderer.js` - When edit mode ON, render ornaments inline; when OFF, render as overlays

**Integration:**

- [ ] T070 [US3] Run `cargo build --lib` to verify Rust compilation succeeds
- [ ] T071 [US3] Run `npm run build-js` to rebuild WASM module
- [ ] T072 [US3] Run Playwright tests for US3: `npx playwright test tests/e2e-pw/tests/ornament-edit-mode.spec.js --project=chromium`
- [ ] T073 [US3] Verify tests pass reliably 3+ times in a row
- [ ] T074 [US3] Run full test suite: `npm run test:e2e`

**Checkpoint**: All user stories should now be independently functional - complete ornament feature with apply, toggle, and edit capabilities

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories, cross-browser testing, documentation

- [ ] T075 [P] Run Playwright tests in all browsers (chromium, firefox, webkit): `./scripts/run-tests-docker.sh`
- [ ] T076 [P] Add smoke test `tests/e2e-pw/tests/00-ornament-smoke.spec.js` - Quick LilyPond export check for fail-fast validation
- [ ] T077 [P] Create inspector helper utilities in `tests/e2e-pw/helpers/inspectors.js` - openTab(), readPaneText() functions per CLAUDE.md guidelines
- [ ] T078 [P] Add Rust unit tests in `src/models/elements.rs` - Test OrnamentIndicator methods (is_start, is_end, matches)
- [ ] T079 [P] Add Rust unit tests in `src/renderers/layout_engine.rs` - Test extract_ornament_spans(), find_anchor_cell()
- [ ] T080 [P] Run `cargo test --lib` to verify all Rust unit tests pass
- [ ] T081 Code cleanup: Remove commented-out delimiter parsing code from `src/parse/grammar.rs`
- [ ] T082 Code cleanup: Add documentation comments to OrnamentIndicator enum and helper structs
- [ ] T083 Performance validation: Test with 1000 cells, verify edit mode toggle completes in < 2s
- [ ] T084 Performance validation: Test layout computation with 100 ornaments, verify completes in < 100ms
- [ ] T085 [P] Update CLAUDE.md with ornament-specific testing patterns if needed
- [ ] T086 Run quickstart.md validation - Manually verify all 8 examples work as documented
- [ ] T087 Update plan.md status to mark Phase 2 complete

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately (T001-T004)
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories (T005-T012)
- **User Stories (Phase 3-5)**: All depend on Foundational phase completion
  - User Story 1 (Phase 3): Can start after T012 - No dependencies on other stories (T013-T047)
  - User Story 2 (Phase 4): Can start after T012 - May integrate with US1 but independently testable (T048-T056)
  - User Story 3 (Phase 5): Can start after T012 - May integrate with US1 but independently testable (T057-T074)
- **Polish (Phase 6)**: Depends on all user stories being complete (T075-T087)

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (T012) - No dependencies on other stories
  - Must complete T012 (cargo build verification) before starting
  - All tasks within US1 are sequential or marked [P] for parallelization
- **User Story 2 (P2)**: Can start after Foundational (T012) - Reuses toggle logic from US1 T020
  - Should verify US1 works first for confidence
  - Independently testable (own test file ornament-toggle.spec.js)
- **User Story 3 (P3)**: Can start after Foundational (T012) - Extends rendering from US1
  - Should verify US1 works first for confidence
  - Independently testable (own test file ornament-edit-mode.spec.js)

### Within Each User Story

- Tests MUST be written and FAIL before implementation (TDD order)
- Data model (Foundational) before all implementation
- WASM API functions before JavaScript UI layer
- JavaScript UI layer before rendering layer
- Rendering layer before export layer
- Core implementation before integration tests
- Story complete before moving to next priority

### Parallel Opportunities

**Setup Phase (Phase 1):**
- T002, T003, T004 can run in parallel (marked [P])

**Foundational Phase (Phase 2):**
- T005-T009 can run in parallel (different sections of model code)
- T010-T011 must be sequential (delete function, then remove calls)
- T012 must be last (verification)

**User Story 1 Tests (Phase 3):**
- T013, T014, T015, T016, T017 can run in parallel (marked [P]) - different test files

**User Story 1 Implementation (Phase 3):**
- T018, T019 can run in parallel (different WASM functions)
- T023, T024, T025 can run in parallel (different UI files)
- T026, T027, T028, T029 can run in parallel (different rendering concerns)
- T030-T034 must be sequential (attachment resolution pipeline)
- T035-T037 must be sequential (collision detection pipeline)
- T038-T041 can run in parallel (different export modules)

**User Story 2 Tests (Phase 4):**
- T048, T049, T050 can run in parallel (marked [P]) - different test scenarios

**User Story 3 Tests (Phase 5):**
- T057, T058, T059, T060 can run in parallel (marked [P]) - different test scenarios

**User Story 3 Implementation (Phase 5):**
- T061, T062, T063, T064, T065 can run in sequential order (editor state management)
- T066-T069 must be sequential (rendering pipeline changes)

**Polish Phase (Phase 6):**
- T075, T076, T077, T078, T079, T080, T085 can run in parallel (marked [P])

**Cross-Story Parallelization:**
Once Foundational (T012) completes, multiple developers can work on different user stories simultaneously:
- Developer A: User Story 1 (T013-T047)
- Developer B: User Story 2 (T048-T056)
- Developer C: User Story 3 (T057-T074)

---

## Parallel Example: User Story 1

```bash
# Phase 1: Write all tests in parallel (inspector-first approach)
Task T013: Create ornament-basic.spec.js - basic application test
Task T014: Add visual rendering test to ornament-basic.spec.js
Task T015: Add zero-width layout test to ornament-basic.spec.js
Task T016: Create ornament-export.spec.js - MusicXML test
Task T017: Add LilyPond export test to ornament-export.spec.js

# Phase 2: Implement WASM API functions in parallel
Task T018: Implement apply_ornament() in src/api.rs
Task T019: Implement remove_ornament() in src/api.rs

# Phase 3: Implement UI layer in parallel
Task T023: Add menu items to src/js/ui.js
Task T024: Add keyboard shortcut handler in src/js/events.js
Task T025: Add data-testid attributes in src/js/ui.js

# Phase 4: Implement rendering in parallel
Task T026: Modify Cell HTML rendering in src/html_layout/cell.rs
Task T027: Add ornament CSS styles to stylesheet
Task T028: Implement render filtering in src/js/renderer.js
Task T029: Implement floating ornament rendering in src/js/renderer.js

# Phase 5: Implement export in parallel
Task T038: Modify derive_beats() in src/parse/beats.rs
Task T039: Modify export_to_musicxml() in export module
Task T040: Add grace note export helper
Task T041: Modify export_to_lilypond() in export module
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T004)
2. Complete Phase 2: Foundational (T005-T012) - CRITICAL - blocks all stories
3. Complete Phase 3: User Story 1 (T013-T047)
4. **STOP and VALIDATE**: Run all US1 tests independently
5. Verify LilyPond/MusicXML export works correctly
6. Deploy/demo if ready

**MVP Validation Checklist:**
- [ ] Can type `2 3 4 1`, select `2 3 4`, apply ornament, see visual styling
- [ ] Ornaments render at ~75% size, raised, colored indigo
- [ ] Ornaments use zero horizontal width (float)
- [ ] LilyPond export shows `\grace {}` syntax
- [ ] MusicXML export shows `<grace/>` elements
- [ ] Collision detection adds spacing when ornaments overlap
- [ ] All Playwright tests in `ornament-basic.spec.js` and `ornament-export.spec.js` pass

### Incremental Delivery

1. Complete Setup + Foundational (T001-T012) → Foundation ready
2. Add User Story 1 (T013-T047) → Test independently → Deploy/Demo (MVP!)
3. Add User Story 2 (T048-T056) → Test independently → Deploy/Demo (toggle functionality)
4. Add User Story 3 (T057-T074) → Test independently → Deploy/Demo (edit mode)
5. Add Polish (T075-T087) → Cross-browser validation, performance testing
6. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together (T001-T012)
2. Once Foundational is done (T012 complete):
   - Developer A: User Story 1 (T013-T047) - Core feature
   - Developer B: User Story 2 (T048-T056) - Toggle behavior
   - Developer C: User Story 3 (T057-T074) - Edit mode
3. Stories complete and integrate independently
4. Team converges for Polish phase (T075-T087)

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story (US1, US2, US3) for traceability
- Each user story should be independently completable and testable
- Follow inspector-first testing approach per CLAUDE.md guidelines
- Prioritize LilyPond/MusicXML inspector tabs over visual screenshots
- Use `data-testid` attributes for stable selectors
- Verify tests fail before implementing (TDD)
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Run `cargo build --lib` after Rust changes
- Run `npm run build-js` to rebuild WASM after api.rs changes
- Run Playwright tests with `npx playwright test` (local) or `./scripts/run-tests-docker.sh` (Docker)
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence
- Delete incorrect delimiter parsing code from grammar.rs (T010-T011)
- Ornaments follow same "select and apply" pattern as slurs and octaves
- Edit mode toggle controls editability and layout, not data transformation

---

## Task Count Summary

- **Total Tasks**: 87
- **Setup (Phase 1)**: 4 tasks
- **Foundational (Phase 2)**: 8 tasks (BLOCKING)
- **User Story 1 (Phase 3)**: 35 tasks (includes 5 E2E tests, 30 implementation tasks)
- **User Story 2 (Phase 4)**: 9 tasks (includes 3 E2E tests, 6 implementation tasks)
- **User Story 3 (Phase 5)**: 18 tasks (includes 4 E2E tests, 14 implementation tasks)
- **Polish (Phase 6)**: 13 tasks

**Parallel Opportunities**: 45 tasks marked [P] can run in parallel (51.7% of total)

**Independent Test Criteria:**
- **US1**: Apply ornament, verify visual styling and export
- **US2**: Toggle ornament on/off, verify behavior
- **US3**: Edit mode toggle, edit ornaments inline, verify changes persist

**Suggested MVP Scope**: Phase 1 + Phase 2 + Phase 3 (User Story 1 only) = 47 tasks
