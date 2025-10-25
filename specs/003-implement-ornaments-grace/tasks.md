# Tasks: Ornaments (Grace Notes)

**Input**: Design documents from `/specs/003-implement-ornaments-grace/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ornament-api.md, quickstart.md

**Tests**: E2E tests via Playwright (Python) are included per Constitution Principle II (Test-Driven Development, NON-NEGOTIABLE)

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions
- Project root: `/home/john/editor/`
- Rust/WASM: `src/rust/`
- JavaScript: `src/js/`
- Tests: `tests/e2e-pw/tests/` (Playwright), `tests/fixtures/`

## Export Strategy (Constitution Principle IX)
**Lilypond export tasks are DEFERRED**: Per Constitution Principle IX (Export Strategy - Leverage Ecosystem Tools), direct Lilypond export implementation is deferred in favor of using MusicXML → Lilypond conversion via `musicxml2ly` or similar converters. Only MusicXML export will be implemented for ornaments. Tasks T002 (Lilypond stub), T048-T050 (Lilypond export implementation), and T062 (Lilypond octave export) are marked as deferred.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [X] T001 [P] Create Rust module structure: `src/rust/models/ornament.rs` (stub), `src/rust/api/ornament_api.rs` (stub), `src/rust/parse/ornament.rs` (stub)
- [X] T002 [P] Create Rust renderer structure: `src/rust/renderers/ornament.rs` (stub), `src/rust/renderers/musicxml/ornament.rs` (stub) [DEFERRED: src/rust/renderers/lilypond/ornament.rs per Principle IX]
- [X] T003 [P] Create Rust utils structure: `src/rust/utils/ornament_layout.rs` (stub)
- [X] T004 [P] Create JavaScript structure: `src/js/ornament-editor.js` (stub), `src/js/ornament-editor-handler.js` (stub), `src/js/ornament-renderer.js` (stub)
- [X] T005 [P] Create test structure: `tests/e2e-pw/tests/ornament.spec.js` (stub), `tests/fixtures/ornament/` (directory)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T006 [P] [FOUNDATION] Implement shared pitch utilities in `src/rust/utils/pitch_utils.rs` (if not exists, or extend existing): pitch validation, accidental parsing, octave manipulation
- [ ] T007 [P] [FOUNDATION] Verify/extend `src/rust/parse/pitch.rs` for ornament pitch validation (ensure supports all notation systems: sargam, number, ABC, Hindi, doremi)
- [ ] T008 [P] [FOUNDATION] Verify/extend `src/rust/parse/accidental.rs` for ornament accidental handling (sharp #, flat b)
- [ ] T009 [FOUNDATION] Create core data model in `src/rust/models/ornament.rs`: Define `Ornament`, `OrnamentPitch`, `OrnamentPlacement` (Before/After enum), `OrnamentPosition`, `BoundingBox`, `OrnamentSequence` structs with serde serialization
- [ ] T010 [FOUNDATION] Add WASM bindings for ornament data model in `src/rust/models/ornament.rs`: Use `#[wasm_bindgen]` for types that cross WASM boundary
- [ ] T011 [FOUNDATION] Update `src/rust/models/line_element.rs` (or equivalent): Add `ornaments: OrnamentSequence` field to LineElement struct
- [ ] T012 [FOUNDATION] Add Rust unit tests for data model in `src/rust/models/ornament.rs`: Test validation rules (min 1 pitch, valid target index, octave range -2 to 2)

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: MVP - Core Ornament Feature (US1 + US2 + US5 + US6 + US7) 🎯

**Goal**: Complete end-to-end ornament creation workflow: user creates ornament via dialog with before/after placement, ornament renders in staff notation with correct layout (75% size, tight spacing, CSS positioning), and exports to MusicXML

**Independent Test**: User can open Edit → Ornament menu, enter ornament pitches in dialog, select before/after placement, save, and see rendered grace notes in staff notation with proper positioning and size. Export to MusicXML produces correct `<grace>` elements. [Lilypond export deferred per Principle IX - use musicxml2ly conversion]

**Why combined**: These P1 stories are highly interconnected - dialog UI (US5) is the interface for creation (US1) and placement selection (US2), layout (US7) is needed to position ornaments correctly, and rendering/export (US6) is needed to see results. Implementing them separately would create incomplete, non-functional increments.

### Tests for MVP Core (TDD - Write FIRST, ensure FAIL)

- [ ] T013 [P] [US1] E2E test: Create basic ornament in `tests/e2e-pw/tests/ornament.spec.js` - Test: Open Edit → Ornament, enter "Sa" (sargam), save, verify ornament appears in DOM
- [ ] T014 [P] [US2] E2E test: Before/after placement in `tests/e2e-pw/tests/ornament.spec.js` - Test: Create ornament with "before" selected, verify MusicXML output contains `<grace>` with `steal-time-following`, then edit to "after", verify `steal-time-previous` [DEFERRED: Lilypond verification per Principle IX]
- [ ] T015 [P] [US5] E2E test: Dialog UI behavior in `tests/e2e-pw/tests/ornament.spec.js` - Test: Open dialog, verify appears below line, drag dialog to new position, verify stays in place, verify real-time preview updates on input
- [ ] T016 [P] [US6] E2E test: MusicXML export in `tests/e2e-pw/tests/ornament.spec.js` - Test: Create ornament, export to MusicXML, verify `<grace>` element structure is correct [DEFERRED: Lilypond export test per Principle IX - use musicxml2ly for Lilypond conversion]
- [ ] T017 [P] [US7] E2E test: Layout and sizing in `tests/e2e-pw/tests/ornament.spec.js` - Test: Create ornament, verify ornament size is 75% ± 5% of main note, verify no horizontal spacing increase, verify vertical stacking spacing < 2pt

### Implementation: WASM Core (Parsing & Validation)

- [ ] T018 [P] [US1] Implement ornament grammar parser in `src/rust/parse/ornament.rs`: Parse `pitch+` sequences with accidentals and octave modifiers per formal grammar (spec.md lines 217-229)
- [ ] T019 [P] [US1] Implement `parse_ornament()` in `src/rust/api/ornament_api.rs`: Parse ornament text, return `OrnamentData` or error (uses grammar parser from T018)
- [ ] T020 [P] [US1] Implement `validate_ornament()` in `src/rust/api/ornament_api.rs`: Validate target cell index, check target is not dash, check pitch count >= 1
- [ ] T021 [P] [US2] Extend `OrnamentPlacement` enum usage in `src/rust/api/ornament_api.rs`: Ensure `parse_ornament()` accepts placement parameter (Before/After)
- [ ] T022 [US1] Add Rust unit tests for parser in `src/rust/parse/ornament.rs`: Test valid ornaments ("Sa", "R#G", "1b2"), invalid syntax, edge cases (empty string, unknown pitch)
- [ ] T023 [US1] Add Rust unit tests for API in `src/rust/api/ornament_api.rs`: Test parse_ornament success/error cases, validate_ornament boundary conditions

### Implementation: WASM Layout & Positioning

- [ ] T024 [P] [US7] Implement `calculate_ornament_layout()` in `src/rust/utils/ornament_layout.rs`: Calculate x,y position (0.1px precision), width, height based on target note position, font size, placement (Before/After), pitch count per research.md decision 1
- [ ] T025 [P] [US7] Implement `calculate_ornament_bbox()` in `src/rust/utils/ornament_layout.rs`: Calculate tight bounding box from OrnamentPosition and pitch symbols
- [ ] T026 [US7] Expose WASM functions in `src/rust/api/ornament_api.rs`: Add `#[wasm_bindgen]` for `calculate_ornament_layout()` and `calculate_ornament_bbox()`
- [ ] T027 [US7] Add Rust unit tests for layout in `src/rust/utils/ornament_layout.rs`: Test position calculation for before/after, test 0.1px precision rounding, test bounding box tightness

### Implementation: Dialog UI (JavaScript)

- [ ] T028 [US5] Create dialog component in `src/js/ornament-editor.js`: Implement `OrnamentEditor` class with open(), close(), render() methods, modal dialog HTML structure
- [ ] T029 [US5] Implement dialog positioning in `src/js/ornament-editor.js`: Position dialog below current line on open, implement drag-to-reposition via title bar
- [ ] T030 [P] [US1] Implement pitch input in `src/js/ornament-editor.js`: Add input field for ornament pitches, validate on keypress via WASM `parse_ornament()`
- [ ] T031 [P] [US2] Implement placement controls in `src/js/ornament-editor.js`: Add before/after radio buttons, update placement state on change
- [ ] T032 [US5] Implement real-time preview in `src/js/ornament-editor.js`: Call WASM `calculate_ornament_layout()` on input change, render preview using shared `OrnamentRenderer` (same as final render per research.md decision 4)
- [ ] T033 [US5] Implement dialog state management in `src/js/ornament-editor.js`: Track dialog state (isOpen, currentText, placement, targetCellIndex, lastError)

### Implementation: Dialog Event Handlers (JavaScript)

- [ ] T034 [P] [US1] Implement keydown handler in `src/js/ornament-editor-handler.js`: Handle typing, call `parse_ornament()`, update preview
- [ ] T035 [P] [US1] Implement backspace handler in `src/js/ornament-editor-handler.js`: Remove last character from ornament
- [ ] T036 [P] [US1] Implement Enter handler in `src/js/ornament-editor-handler.js`: Validate ornament, save to document, close dialog, trigger re-render
- [ ] T037 [P] [US1] Implement Escape handler in `src/js/ornament-editor-handler.js`: Cancel editing, discard changes, close dialog
- [ ] T038 [P] [US2] Implement placement change handler in `src/js/ornament-editor-handler.js`: Update placement state, recalculate layout, update preview

### Implementation: Menu Integration

- [ ] T039 [US1] Add Edit → Ornament menu item in `src/js/events.js`: Add menu handler that opens ornament editor dialog, detect cursor position to determine target cell

### Implementation: Rendering (JavaScript + CSS)

- [ ] T040 [P] [US7] Create ornament renderer in `src/js/ornament-renderer.js`: Implement `OrnamentRenderer` class with `renderOrnament()`, `styleOrnament()`, `updatePosition()` methods
- [ ] T041 [P] [US7] Implement CSS positioning in `src/js/ornament-renderer.js`: Apply absolute positioning with x,y from WASM (0.1px precision), apply 75% font-size, apply Bravura font
- [ ] T042 [P] [US7] Implement accidental rendering in `src/js/ornament-renderer.js`: Render # and b using Bravura SMuFL font (U+E262 sharp, U+E260 flat) at 75% * 1.4 scale per research.md decision 5
- [ ] T043 [US7] Add CSS styles for ornaments: Define `.ornament-symbol`, `.ornament-symbol.accidental-sharp::after`, `.ornament-symbol.accidental-flat::after` with z-index below slurs per FR-044
- [ ] T044 [US7] Integrate ornament rendering in `computeLayout()`: Update WASM layout calculation to include ornaments in DisplayList
- [ ] T045 [US7] Integrate ornament rendering in `renderFromDisplayList()`: Render ornaments from DisplayList using `OrnamentRenderer`

### Implementation: Rendering Logic (Rust WASM)

- [ ] T046 [P] [US6] Implement ornament rendering coordinator in `src/rust/renderers/ornament.rs`: Coordinate position calculation and symbol generation for rendering (called by computeLayout)
- [ ] T047 [US6] Integrate ornaments into DisplayList: Update DisplayList generation to include ornament positions and symbols

### Implementation: Export (Lilypond) - DEFERRED per Principle IX

- [ ] T048 [P] [US6] **[DEFERRED]** Implement Lilypond export in `src/rust/renderers/lilypond/ornament.rs`: Per Constitution Principle IX, direct Lilypond export is deferred in favor of MusicXML → Lilypond conversion via `musicxml2ly`
- [ ] T049 [US6] **[DEFERRED]** Integrate Lilypond export: Per Constitution Principle IX, direct Lilypond export is deferred in favor of MusicXML → Lilypond conversion via `musicxml2ly`
- [ ] T050 [US6] **[DEFERRED]** Add Rust unit tests for Lilypond export: Per Constitution Principle IX, direct Lilypond export is deferred in favor of MusicXML → Lilypond conversion via `musicxml2ly`

### Implementation: Export (MusicXML)

- [ ] T051 [P] [US6] Implement MusicXML export in `src/rust/renderers/musicxml/ornament.rs`: Implement `export_ornament_musicxml()` - generate `<grace>` elements with `steal-time-following` (before) or `steal-time-previous` (after) per research.md decision 3
- [ ] T052 [US6] Integrate MusicXML export: Update MusicXML renderer to call `export_ornament_musicxml()` for ornaments in line element
- [ ] T053 [US6] Add Rust unit tests for MusicXML export: Test before ornament → steal-time-following, after ornament → steal-time-previous, pitch/octave/accidental XML structure

### Implementation: Error Handling

- [ ] T054 [US1] Implement error handling in dialog: Display user-friendly error messages for invalid pitch, invalid accidental, octave out of range, empty ornament per contracts/ornament-api.md section 7
- [ ] T055 [US1] Implement WASM error format: Return structured errors from WASM (code, message, context) as `JsValue` per contracts/ornament-api.md section 7

**Checkpoint**: At this point, MVP is fully functional - users can create ornaments with before/after placement via dialog, ornaments render with correct layout/sizing, and export to Lilypond/MusicXML works

---

## Phase 4: User Story 3 - Specify Octaves for Ornament Pitches (Priority: P2)

**Goal**: Allow users to specify exact octave for each pitch in ornament sequence via dialog octave controls

**Independent Test**: User opens ornament editor, enters multi-pitch ornament, selects each pitch, adjusts octave using dialog controls, verifies preview updates in real-time, saves and verifies octave assignments preserved in output

### Tests for User Story 3 (TDD - Write FIRST)

- [ ] T056 [P] [US3] E2E test: Octave controls in `tests/e2e-pw/tests/ornament.spec.js` - Test: Create ornament "RG", select first pitch, click upper octave, verify pitch renders in upper octave, verify Lilypond output has correct octave notation

### Implementation for User Story 3

- [ ] T057 [P] [US3] Add octave controls to dialog in `src/js/ornament-editor.js`: Add upper/lower octave buttons per pitch, enable/disable based on pitch selection
- [ ] T058 [P] [US3] Implement octave up handler in `src/js/ornament-editor-handler.js`: Increment octave for selected pitch (max +2), update preview
- [ ] T059 [P] [US3] Implement octave down handler in `src/js/ornament-editor-handler.js`: Decrement octave for selected pitch (min -2), update preview
- [ ] T060 [US3] Update OrnamentPitch octave handling: Verify octave field properly serialized/deserialized in WASM boundary, verify octave validation (-2 to +2 range)
- [ ] T061 [US3] Update rendering to use octave: Ensure `calculate_ornament_layout()` accounts for octave when calculating vertical position offset
- [ ] T062 [US3] **[DEFERRED]** Update Lilypond export for octave: Per Constitution Principle IX, direct Lilypond export is deferred in favor of MusicXML → Lilypond conversion via `musicxml2ly`
- [ ] T063 [US3] Update MusicXML export for octave: Ensure `export_ornament_musicxml()` includes correct `<octave>` element value

**Checkpoint**: At this point, User Story 3 is complete - users can specify octaves for ornament pitches independently

---

## Phase 5: User Story 4 - Edit Existing Ornaments (Priority: P2)

**Goal**: Allow users to edit ornaments after creation by positioning cursor under ornament and selecting Edit → Ornament

**Independent Test**: User positions cursor under existing ornament, opens Edit → Ornament, sees current ornament data pre-populated in dialog, modifies pitches/placement/octaves, saves, sees changes reflected in staff notation

### Tests for User Story 4 (TDD - Write FIRST)

- [ ] T064 [P] [US4] E2E test: Edit existing ornament in `tests/e2e-pw/tests/ornament.spec.js` - Test: Create ornament, close dialog, position cursor under ornament, open Edit → Ornament, verify dialog shows existing pitches, modify, save, verify changes appear

### Implementation for User Story 4

- [ ] T065 [P] [US4] Implement ornament detection in `src/js/events.js`: Detect when cursor is positioned under existing ornament, enable Edit → Ornament menu
- [ ] T066 [P] [US4] Implement pre-population in `src/js/ornament-editor.js`: When editing existing ornament, load current ornament data into dialog fields (pitches, placement, octaves)
- [ ] T067 [US4] Implement update workflow in `src/js/ornament-editor-handler.js`: On save, update existing ornament in document (replace, not create new)
- [ ] T068 [US4] Add visual indicator for edit mode: Show "Edit Ornament" vs "Create Ornament" title in dialog based on mode

**Checkpoint**: At this point, User Story 4 is complete - users can edit existing ornaments independently

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [ ] T069 [P] Add test fixtures in `tests/fixtures/ornament/`: Create doremi-script test files with ornaments for regression testing (sargam, number, ABC notation examples)
- [ ] T070 [P] Run full E2E test suite: Execute `npx playwright test tests/e2e-pw/tests/ornament.spec.js` and verify all tests pass
- [ ] T071 [P] Add focus management: Ensure dialog input field auto-focused on open, focus returns to editor canvas after close per spec.md
- [ ] T072 [P] Add accessibility: Ensure dialog has proper ARIA labels, keyboard navigation works (Tab, Shift+Tab, Escape)
- [ ] T073 Code cleanup: Remove stub files, clean up comments, ensure code follows Rust/JavaScript style guidelines
- [ ] T074 Performance validation: Verify real-time preview latency < 100ms (SC-005), verify dialog interaction < 16ms per keystroke
- [ ] T075 Visual validation: Verify ornament size is 75% ± 5% (SC-012), verify vertical spacing < 2pt (SC-013), verify tight layout (SC-011)
- [ ] T076 [P] Validate against quickstart.md: Run through quickstart.md examples to ensure all code patterns work as documented
- [ ] T077 Integration test: Create complex composition with multiple ornaments, slurs, accidentals, verify rendering correctness and visual hierarchy
- [ ] T078 [P] Constitution compliance check: Verify all 8 constitution principles met (performance, TDD, UX, clean architecture, DX, standards, no fallbacks, MusicXML first)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **MVP Core (Phase 3)**: Depends on Foundational completion - US1+US2+US5+US6+US7 implemented together as cohesive unit
- **User Story 3 (Phase 4)**: Depends on MVP Core (Phase 3) completion - extends dialog with octave controls
- **User Story 4 (Phase 5)**: Depends on MVP Core (Phase 3) completion - adds editing workflow
- **Polish (Phase 6)**: Depends on all desired user stories being complete

### User Story Dependencies

- **MVP Core (US1+US2+US5+US6+US7)**: Depends on Foundational (Phase 2) - No dependencies on other stories
- **User Story 3 (P2)**: Depends on MVP Core - Extends dialog UI
- **User Story 4 (P2)**: Depends on MVP Core - Extends creation workflow with editing

### Within Each User Story

- Tests MUST be written and FAIL before implementation (TDD)
- WASM core (models, parsing, layout) before JavaScript (dialog, rendering)
- Dialog UI before event handlers
- Core implementation before export
- Story complete before moving to next priority

### Parallel Opportunities

#### Setup Phase (Phase 1)
```bash
# All T001-T005 can run in parallel (different files)
Task T001, T002, T003, T004, T005
```

#### Foundational Phase (Phase 2)
```bash
# T006, T007, T008 can run in parallel (shared utils in different files)
Task T006, T007, T008
# T009-T012 sequential (same file, dependencies)
```

#### MVP Core Tests (Phase 3)
```bash
# All tests T013-T017 can run in parallel (same file, but independent test cases)
Task T013, T014, T015, T016, T017
```

#### MVP Core Implementation (Phase 3)
```bash
# WASM parsing: T018, T019, T020, T021 can run in parallel (different concerns)
Task T018, T019, T020, T021

# WASM layout: T024, T025 can run in parallel (different functions)
Task T024, T025

# Dialog UI: T030, T031 can run in parallel (different controls)
Task T030, T031

# Event handlers: T034, T035, T036, T037, T038 can run in parallel (different handlers in same file - use caution)
Task T034, T035, T036, T037, T038

# Rendering: T040, T041, T042 can run in parallel (different aspects)
Task T040, T041, T042

# Export: Only T051 (MusicXML) - T048 (Lilypond) deferred per Principle IX
Task T051
```

---

## Parallel Example: MVP Core Phase

```bash
# Phase 3 WASM Core - Launch parsing tasks together:
Task T018: "Implement ornament grammar parser in src/rust/parse/ornament.rs"
Task T019: "Implement parse_ornament() in src/rust/api/ornament_api.rs"
Task T020: "Implement validate_ornament() in src/rust/api/ornament_api.rs"
Task T021: "Extend OrnamentPlacement enum usage in src/rust/api/ornament_api.rs"

# Phase 3 Dialog UI - Launch input controls together:
Task T030: "Implement pitch input in src/js/ornament-editor.js"
Task T031: "Implement placement controls in src/js/ornament-editor.js"

# Phase 3 Export - Only MusicXML (Lilypond deferred per Principle IX):
Task T051: "Implement MusicXML export in src/rust/renderers/musicxml/ornament.rs"
# Note: T048 (Lilypond export) deferred - use musicxml2ly conversion instead
```

---

## Implementation Strategy

### MVP First (Phases 1-3 Only)

1. Complete Phase 1: Setup (~5 tasks, all parallel)
2. Complete Phase 2: Foundational (~7 tasks, some parallel)
3. Complete Phase 3: MVP Core (~43 tasks, many parallel opportunities)
4. **STOP and VALIDATE**: Test MVP independently - run full E2E suite
5. Deploy/demo if ready (users can create ornaments, see rendering, export works)

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready (~12 tasks)
2. Add MVP Core → Test independently → Deploy/Demo (~43 tasks, complete ornament feature)
3. Add User Story 3 → Test independently → Deploy/Demo (~8 tasks, octave controls)
4. Add User Story 4 → Test independently → Deploy/Demo (~4 tasks, edit workflow)
5. Polish → Final validation → Deploy (~10 tasks)

Total: ~77 tasks

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together (~12 tasks)
2. Once Foundational is done, parallelize MVP Core:
   - Developer A: WASM core (T018-T023, T024-T027)
   - Developer B: Dialog UI (T028-T033)
   - Developer C: Event handlers & menu (T034-T039)
   - Developer D: Rendering (T040-T047)
   - Developer E: Export (T051-T053 MusicXML only; T048-T050 Lilypond deferred per Principle IX)
   - Developer F: Error handling (T054-T055)
3. Once MVP Core done, US3 and US4 can proceed in parallel
4. Polish together

---

## Notes

- [P] tasks = different files or independent concerns, no dependencies
- [Story] label maps task to specific user story for traceability
- MVP Core (US1+US2+US5+US6+US7) treated as single cohesive phase due to high interconnection
- TDD approach: Write tests FIRST for each phase, ensure they FAIL before implementation
- WASM functions must cross boundary correctly (use `#[wasm_bindgen]`, serde serialization)
- Rendering in WASM (coordinate calculation) + JavaScript (DOM manipulation) per Constitution Principle I
- MusicXML roundtrip required per Constitution Principle VIII
- Lilypond export deferred per Constitution Principle IX - use MusicXML → Lilypond conversion (musicxml2ly)
- Real-time preview must use same WASM function as final render (single source of truth)
- Coordinate precision: 0.1px (research.md decision 1)
- Accidental font: Bravura SMuFL at 75% * 1.4 scale (research.md decision 5)
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
