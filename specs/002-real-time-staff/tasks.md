# Tasks: Real-Time Staff Notation Rendering

**Input**: Design documents from `/specs/002-real-time-staff/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: This feature follows TDD (Test-Driven Development) per Principle II of the constitution. E2E tests are written and verified to FAIL before implementing each user story.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, SETUP, FOUND)
- Include exact file paths in descriptions

## Path Conventions
- Rust/WASM: `src/` at repository root
- JavaScript: `src/js/` at repository root
- Tests: `tests/e2e/` at repository root
- HTML: `index.html` at repository root

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and OSMD library setup

- [X] T001 [P] [SETUP] Add OSMD library script tag to `index.html` in `<head>` section: `<script src="https://unpkg.com/opensheetmusicdisplay@1.7.6/build/opensheetmusicdisplay.min.js"></script>`
- [X] T002 [P] [SETUP] Add Staff Notation tab button to `index.html` navigation with ID `tab-staff-notation` and data attribute `data-tab="staff-notation"`
- [X] T003 [P] [SETUP] Add Staff Notation tab content container to `index.html` with ID `staff-notation-container` and hidden class initially
- [X] T004 [SETUP] Verify OSMD library loads by checking `window.opensheetmusicdisplay` in browser console

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core MusicXML export infrastructure that MUST be complete before ANY user story can render staff notation

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T005 [P] [FOUND] Create `src/renderers/musicxml/` directory structure
- [X] T006 [P] [FOUND] Port `src/renderers/musicxml/duration.rs` from archive (copy unchanged - duration calculation helpers)
- [X] T007 [P] [FOUND] Port `src/renderers/musicxml/pitch.rs` from archive (adapted for current Pitch model)
- [X] T008 [P] [FOUND] Port `src/renderers/musicxml/builder.rs` from archive (adapted for current Pitch model)
- [X] T009 [FOUND] Create `src/renderers/musicxml/mod.rs` with main export function `to_musicxml(&Document) -> String` (rewrite iteration for Cell-based model)
- [X] T010 [FOUND] Implement beat extraction algorithm `extract_implicit_beats(&[Cell]) -> Vec<Beat>` in `src/renderers/musicxml/mod.rs`
- [X] T011 [FOUND] Implement pitch adapter function `cell_to_musicxml_pitch(&Cell) -> Result<(String, i8, i8)>` for Number and Western pitch systems
- [X] T012 [FOUND] Add WASM binding `exportMusicXML(JsValue) -> Result<String, JsValue>` to `src/api.rs`
- [X] T013 [FOUND] Rebuild WASM module: run `make build-wasm` and verify no compilation errors
- [X] T014 [P] [FOUND] Create `src/js/osmd-renderer.js` with `OSMDRenderer` class constructor and initialization
- [X] T015 [FOUND] Implement `OSMDRenderer.render(musicXmlString)` method with IndexedDB caching in `src/js/osmd-renderer.js`
- [X] T016 [P] [FOUND] Implement cache helper functions `hashMusicXml()`, `getCached()`, `setCache()` in `src/js/osmd-renderer.js`

**Checkpoint**: Foundation ready - MusicXML export and OSMD rendering infrastructure complete. User story implementation can now begin.

---

## Phase 3: User Story 1 - View Basic Notation as Staff (Priority: P1) 🎯 MVP

**Goal**: Users can type simple notes/rests and see them rendered as staff notation

**Independent Test**: Type "1 2 3" and verify three quarter notes appear on staff within 200ms of switching to Staff Notation tab

### Tests for User Story 1 ⚠️

**NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T017 [P] [US1] Create E2E test file `tests/e2e/test_staff_notation_basic.py` with test case `test_empty_document_shows_whole_rest`
- [ ] T018 [P] [US1] Add test case `test_simple_melody_three_notes` to `tests/e2e/test_staff_notation_basic.py` (type "1 2 3", verify 3 quarter notes)
- [ ] T019 [P] [US1] Add test case `test_render_timing_under_200ms` to `tests/e2e/test_staff_notation_basic.py` (measure performance)
- [ ] T020 [P] [US1] Add test case `test_rest_rendering` to `tests/e2e/test_staff_notation_basic.py` (type "1 r 2", verify rest symbol)
- [ ] T021 [US1] Run `make test-e2e` and verify all User Story 1 tests FAIL (expected - not implemented yet)

### Implementation for User Story 1

- [ ] T022 [US1] Add `exportMusicXML()` method to MusicNotationEditor class in `src/js/editor.js` (calls WASM module)
- [ ] T023 [US1] Add `renderStaffNotation()` method to MusicNotationEditor class in `src/js/editor.js` (calls OSMDRenderer)
- [ ] T024 [US1] Import and initialize OSMDRenderer in `initialize()` method of `src/js/editor.js`
- [ ] T025 [US1] Add tab switch handler for Staff Notation tab in `src/js/editor.js` `onTabSwitch()` method (calls renderStaffNotation, returns focus)
- [ ] T026 [US1] Wire up Staff Notation tab button click in `src/js/ui.js` or tab handler to trigger `onTabSwitch('staff-notation')`
- [ ] T027 [US1] Rebuild WASM and JavaScript: run `make build`
- [ ] T028 [US1] Manual test: Type "1 2 3", switch to Staff Notation tab, verify rendering appears
- [ ] T029 [US1] Run `make test-e2e` and verify all User Story 1 tests PASS

**Checkpoint**: User Story 1 complete - basic notation renders as staff notation. This is the MVP!

---

## Phase 4: User Story 2 - Real-Time Update During Editing (Priority: P1)

**Goal**: Staff notation updates automatically as user edits (within 100ms debounce)

**Independent Test**: Type a note, wait for render, add another note, verify staff updates within 100ms

### Tests for User Story 2 ⚠️

- [ ] T030 [P] [US2] Create E2E test file `tests/e2e/test_staff_notation_realtime.py` with test case `test_add_note_updates_staff`
- [ ] T031 [P] [US2] Add test case `test_delete_note_updates_staff` to `tests/e2e/test_staff_notation_realtime.py`
- [ ] T032 [P] [US2] Add test case `test_debouncing_rapid_edits` to `tests/e2e/test_staff_notation_realtime.py` (type quickly, verify single render after pause)
- [ ] T033 [P] [US2] Add test case `test_update_timing_under_100ms` to `tests/e2e/test_staff_notation_realtime.py` (measure debounce delay)
- [ ] T034 [P] [US2] Add test case `test_edit_on_different_tab_updates_on_return` to `tests/e2e/test_staff_notation_realtime.py`
- [ ] T035 [US2] Run `make test-e2e` and verify all User Story 2 tests FAIL (expected)

### Implementation for User Story 2

- [ ] T036 [US2] Add debounced rendering logic to `onDocumentChanged()` method in `src/js/editor.js` (100ms timeout)
- [ ] T037 [US2] Store `staffNotationTimer` property in MusicNotationEditor class for debounce management
- [ ] T038 [US2] Add check in debounced render to only update if Staff Notation tab is currently active
- [ ] T039 [US2] Update tab switch handler to render staff notation when returning to tab after edits
- [ ] T040 [US2] Rebuild JavaScript: run `make build-js`
- [ ] T041 [US2] Manual test: Type notes quickly, verify staff updates after 100ms pause
- [ ] T042 [US2] Run `make test-e2e` and verify all User Story 2 tests PASS

**Checkpoint**: User Stories 1 AND 2 complete - basic rendering + real-time updates working

---

## Phase 5: User Story 3 - Display Measures and Barlines (Priority: P2)

**Goal**: Barlines display as proper measure separators with correct styles

**Independent Test**: Type "1 2 | 3 4 ||" and verify two measures with single and double barlines

### Tests for User Story 3 ⚠️

- [ ] T043 [P] [US3] Create E2E test file `tests/e2e/test_staff_notation_barlines.py` with test case `test_single_barline_creates_two_measures`
- [ ] T044 [P] [US3] Add test case `test_double_barline_style` to `tests/e2e/test_staff_notation_barlines.py`
- [ ] T045 [P] [US3] Add test case `test_no_barlines_single_measure` to `tests/e2e/test_staff_notation_barlines.py`
- [ ] T046 [US3] Run `make test-e2e` and verify all User Story 3 tests FAIL (expected)

### Implementation for User Story 3

- [ ] T047 [US3] Implement barline detection logic in `process_line()` function of `src/renderers/musicxml/mod.rs`
- [ ] T048 [US3] Add `close_measure()` call when Barline cell encountered in `src/renderers/musicxml/mod.rs`
- [ ] T049 [US3] Implement barline type mapping ("|" → single, "||" → double) in `src/renderers/musicxml/mod.rs`
- [ ] T050 [US3] Add barline XML generation to MusicXmlBuilder in `src/renderers/musicxml/builder.rs` (likely already exists from archive)
- [ ] T051 [US3] Rebuild WASM: run `make build-wasm`
- [ ] T052 [US3] Manual test: Type "1 2 | 3 4", verify two measures appear
- [ ] T053 [US3] Run `make test-e2e` and verify all User Story 3 tests PASS

**Checkpoint**: User Stories 1, 2, AND 3 complete - measures and barlines rendering correctly

---

## Phase 6: User Story 4 - Display Extended Durations and Ties (Priority: P2)

**Goal**: Duration extension symbols ("-") display as longer note values or ties

**Independent Test**: Type "1 - 2" and verify half note followed by quarter note

### Tests for User Story 4 ⚠️

- [ ] T054 [P] [US4] Create E2E test file `tests/e2e/test_staff_notation_durations.py` with test case `test_half_note_duration`
- [ ] T055 [P] [US4] Add test case `test_whole_note_duration` to `tests/e2e/test_staff_notation_durations.py` (1 - - -)
- [ ] T056 [P] [US4] Add test case `test_tied_notes_very_long` to `tests/e2e/test_staff_notation_durations.py` (1 - - - -)
- [ ] T057 [P] [US4] Add test case `test_mixed_durations` to `tests/e2e/test_staff_notation_durations.py` (1 2 - 3)
- [ ] T058 [US4] Run `make test-e2e` and verify all User Story 4 tests FAIL (expected)

### Implementation for User Story 4

- [ ] T059 [US4] Implement duration calculation logic in `calculate_note_duration()` function of `src/renderers/musicxml/mod.rs`
- [ ] T060 [US4] Add support for UnpitchedElement detection as duration extender in `src/renderers/musicxml/mod.rs`
- [ ] T061 [US4] Implement tie detection algorithm (leading UnpitchedElements → tied note) in `src/renderers/musicxml/mod.rs`
- [ ] T062 [US4] Add tie XML generation (`<tie type="start"/>` / `<tie type="stop"/>`) to MusicXmlBuilder
- [ ] T063 [US4] Use duration helpers from `src/renderers/musicxml/duration.rs` for note type calculation
- [ ] T064 [US4] Rebuild WASM: run `make build-wasm`
- [ ] T065 [US4] Manual test: Type "1 - 2", verify half note + quarter note
- [ ] T066 [US4] Run `make test-e2e` and verify all User Story 4 tests PASS

**Checkpoint**: User Stories 1-4 complete - durations and ties rendering correctly

---

## Phase 7: User Story 5 - Display Multiple Lines as Systems (Priority: P3)

**Goal**: Multiple document lines render as separate musical systems (staff lines)

**Independent Test**: Create two lines of notation and verify they render as two vertically stacked systems

### Tests for User Story 5 ⚠️

- [ ] T067 [P] [US5] Create E2E test file `tests/e2e/test_staff_notation_multiline.py` with test case `test_two_lines_two_systems`
- [ ] T068 [P] [US5] Add test case `test_measure_continuity_across_systems` to `tests/e2e/test_staff_notation_multiline.py`
- [ ] T069 [P] [US5] Add test case `test_empty_line_shows_rest` to `tests/e2e/test_staff_notation_multiline.py`
- [ ] T070 [US5] Run `make test-e2e` and verify all User Story 5 tests FAIL (expected)

### Implementation for User Story 5

- [ ] T071 [US5] Implement line iteration logic in `to_musicxml()` function of `src/renderers/musicxml/mod.rs` (already exists from foundational)
- [ ] T072 [US5] Add system break generation (`<print new-system="yes"/>`) for lines after first in `src/renderers/musicxml/mod.rs`
- [ ] T073 [US5] Verify MusicXmlBuilder supports system breaks in `src/renderers/musicxml/builder.rs`
- [ ] T074 [US5] Ensure OSMD option `newSystemFromXML: true` is set in `src/js/osmd-renderer.js` (should already be set)
- [ ] T075 [US5] Rebuild WASM: run `make build-wasm`
- [ ] T076 [US5] Manual test: Create two lines with notation, verify two systems appear
- [ ] T077 [US5] Run `make test-e2e` and verify all User Story 5 tests PASS

**Checkpoint**: All user stories complete - full feature functionality implemented

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories, error handling, performance, logging

- [ ] T078 [P] [POLISH] Add comprehensive error handling to `exportMusicXML()` in `src/js/editor.js` (try/catch, log errors)
- [ ] T079 [P] [POLISH] Add error state display for Staff Notation tab (show error message if render fails)
- [ ] T080 [P] [POLISH] Add performance logging to `renderStaffNotation()` (export time, render time, cache hit/miss)
- [ ] T081 [P] [POLISH] Add WASM logging for MusicXML export operations in `src/renderers/musicxml/mod.rs` (debug/info/warn levels)
- [ ] T082 [P] [POLISH] Add cache statistics tracking to `OSMDRenderer` class (hits, misses, hit rate)
- [ ] T083 [POLISH] Verify focus returns to editor canvas after tab switch (50ms delay) in `src/js/editor.js`
- [ ] T084 [P] [POLISH] Add graceful handling for WASM module not loaded (check before calling exportMusicXML)
- [ ] T085 [P] [POLISH] Add graceful handling for OSMD library not loaded (check window.opensheetmusicdisplay)
- [ ] T086 [P] [POLISH] Test error recovery: Invalid MusicXML → preserve last render, show error indicator
- [ ] T087 [POLISH] Performance test: 50 measures document → verify export < 10ms, render < 600ms
- [ ] T088 [POLISH] Run full E2E test suite for all user stories: `make test-e2e`
- [ ] T089 [POLISH] Run linting and formatting: `make lint && make format`
- [ ] T090 [POLISH] Update README or docs with Staff Notation tab usage (if user-facing docs exist)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phases 3-7)**: All depend on Foundational phase completion
  - User Story 1 (P1) → MUST complete first (MVP)
  - User Story 2 (P1) → MUST complete second (builds on US1)
  - User Stories 3, 4, 5 (P2-P3) → Can proceed in order or in parallel after US1+US2
- **Polish (Phase 8)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Depends on Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P1)**: Depends on User Story 1 completion (adds real-time updates to basic rendering)
- **User Story 3 (P2)**: Depends on Foundational (Phase 2) only - Can start after US2 or in parallel with US4/US5
- **User Story 4 (P2)**: Depends on Foundational (Phase 2) only - Can start after US2 or in parallel with US3/US5
- **User Story 5 (P3)**: Depends on Foundational (Phase 2) only - Can start after US2 or in parallel with US3/US4

### Within Each User Story

1. Tests MUST be written FIRST and verified to FAIL
2. Implementation follows (tests will PASS when complete)
3. Manual testing for sanity check
4. Run test suite to verify

### Parallel Opportunities

- **Setup Phase**: T001, T002, T003 can run in parallel (different HTML sections)
- **Foundational Phase**: T005-T008 can run in parallel (different files from archive)
- **Test Writing**: All test files for a user story can be written in parallel
- **User Stories 3, 4, 5**: After US1+US2 complete, these can be worked on in parallel by different team members
- **Polish Phase**: T078-T085 can run in parallel (different files)

---

## Parallel Example: Foundational Phase

```bash
# Launch archive file ports in parallel (all different files):
Task: "Port src/renderers/musicxml/duration.rs from archive"
Task: "Port src/renderers/musicxml/pitch.rs from archive"
Task: "Port src/renderers/musicxml/builder.rs from archive"

# These depend on above, so run sequentially after:
Task: "Create src/renderers/musicxml/mod.rs with main export function"
Task: "Add WASM binding to src/api.rs"
```

## Parallel Example: User Story 1 Tests

```bash
# All test files can be written in parallel:
Task: "Create test_staff_notation_basic.py with test_empty_document_shows_whole_rest"
Task: "Add test case test_simple_melody_three_notes"
Task: "Add test case test_render_timing_under_200ms"
Task: "Add test case test_rest_rendering"
```

---

## Implementation Strategy

### MVP First (User Stories 1 & 2 Only)

1. Complete Phase 1: Setup (T001-T004)
2. Complete Phase 2: Foundational (T005-T016) - CRITICAL, blocks all stories
3. Complete Phase 3: User Story 1 (T017-T029)
4. **STOP and VALIDATE**: Test US1 independently → MVP achieved!
5. Complete Phase 4: User Story 2 (T030-T042)
6. **STOP and VALIDATE**: Test US1+US2 together → Core feature complete!
7. Deploy/demo if ready

### Incremental Delivery

1. Setup + Foundational → Foundation ready (T001-T016)
2. Add User Story 1 → Test independently → Deploy/Demo (MVP!)
3. Add User Story 2 → Test independently → Deploy/Demo (Core complete!)
4. Add User Story 3 → Test independently → Deploy/Demo (Measures added)
5. Add User Story 4 → Test independently → Deploy/Demo (Durations added)
6. Add User Story 5 → Test independently → Deploy/Demo (Multi-line added)
7. Add Polish → Full feature complete

### Parallel Team Strategy

With multiple developers:

1. **Team completes Setup + Foundational together** (T001-T016)
2. **Once Foundational is done**:
   - Developer A: User Story 1 + User Story 2 (sequential, US2 depends on US1)
3. **After US1+US2 complete**:
   - Developer A: User Story 3
   - Developer B: User Story 4
   - Developer C: User Story 5
4. **All together**: Polish phase

---

## Notes

- **[P] tasks** = different files, no dependencies → can run in parallel
- **[Story] label** maps task to specific user story for traceability
- **TDD Order**: Tests MUST be written first and FAIL before implementation
- **Each user story** should be independently completable and testable
- **Verify tests fail** before implementing (confirms tests work)
- **Commit after each task** or logical group
- **Stop at any checkpoint** to validate story independently
- **MVP = User Story 1** (basic rendering) - deploy this first!
- **Core Feature = User Stories 1 & 2** (basic rendering + real-time updates)
- **Full Feature = All 5 user stories** (measures, durations, multi-line)

## Task Count Summary

- **Total Tasks**: 90
- **Setup Tasks**: 4 (T001-T004)
- **Foundational Tasks**: 12 (T005-T016)
- **User Story 1 Tasks**: 13 (T017-T029) - Tests: 5, Implementation: 8
- **User Story 2 Tasks**: 13 (T030-T042) - Tests: 6, Implementation: 7
- **User Story 3 Tasks**: 11 (T043-T053) - Tests: 4, Implementation: 7
- **User Story 4 Tasks**: 13 (T054-T066) - Tests: 5, Implementation: 8
- **User Story 5 Tasks**: 11 (T067-T077) - Tests: 4, Implementation: 7
- **Polish Tasks**: 13 (T078-T090)

**Parallel Opportunities**: 28 tasks marked [P] can run in parallel within their phases

**MVP Scope** (User Story 1): 29 tasks (Setup + Foundational + US1)
**Core Feature Scope** (US1 + US2): 42 tasks
**Full Feature Scope** (All user stories): 90 tasks
