# Implementation Tasks: Music Notation Editor POC

**Branch**: `001-poc` | **Date**: 2025-10-11 | **Generated**: speckit.tasks workflow

## Overview

This document provides a comprehensive, dependency-ordered task list for implementing the Music Notation Editor POC based on the available design artifacts. Tasks are organized by user story to enable independent implementation and testing.

**Total Tasks**: 85
**Timeline**: 6 phases, with 4 user story phases
**Parallel Opportunities**: 37 tasks (44% parallelizable)

---

## Phase 1: Project Setup and Infrastructure

**Goal**: Initialize project structure, build system, and development environment

### T001: Initialize Git Repository and Branch Structure
- **File**: N/A
- **Action**: Create main branch and `001-poc` feature branch
- **Dependencies**: None
- **Details**: Ensure clean repository state with proper branch for POC development

### T002: Setup Node.js Project Structure
- **File**: `/home/john/ecs-editor/package.json`
- **Action**: Initialize package.json with dependencies and scripts
- **Dependencies**: T001
- **Details**: Include wasm-bindgen, UnoCSS, Playwright, and development scripts

### T003: Setup Rust WASM Project Structure
- **File**: `/home/john/ecs-editor/src/rust/Cargo.toml`
- **Action**: Initialize Rust project with WASM configuration
- **Dependencies**: T001
- **Details**: Configure for wasm-pack with optimization settings

### T004: Create Build Orchestration (Makefile)
- **File**: `/home/john/ecs-editor/Makefile`
- **Action**: Create comprehensive build system with development and production targets
- **Dependencies**: T002, T003
- **Details**: Include setup, build, test, and serve commands

### T005: Configure WASM Build System
- **File**: `/home/john/ecs-editor/wasm-pack.toml`
- **Action**: Configure wasm-pack for optimal WASM compilation
- **Dependencies**: T003
- **Details**: Include release optimizations and browser compatibility

### T006: Setup TypeScript Configuration
- **File**: `/home/john/ecs-editor/tsconfig.json`
- **Action**: Configure TypeScript for JSDoc type checking
- **Dependencies**: T002
- **Details**: Enable strict type checking for JavaScript codebase

### T007: Configure ESLint and Code Quality
- **File**: `/home/john/ecs-editor/eslint.config.js`
- **Action**: Setup ESLint with modern JavaScript standards
- **Dependencies**: T002
- **Details**: Include rules for async/await, error handling, and code quality

### T008: Setup UnoCSS Configuration
- **File**: `/home/john/ecs-editor/uno.config.ts`
- **Action**: Configure UnoCSS with music notation utilities and performance optimizations
- **Dependencies**: T002
- **Details**: Include custom rules for CharCell positioning and musical elements

### T009: Create Basic HTML Structure
- **File**: `/home/john/ecs-editor/index.html`
- **Action**: Create main HTML file with editor canvas and UI containers
- **Dependencies**: T002, T008
- **Details**: Include separate JS/CSS file references (no embedded content)

### T010: Setup Development Server
- **File**: `/home/john/ecs-editor/src/js/dev-server.js`
- **Action**: Create development server with hot reload for WASM and JS
- **Dependencies**: T004, T009
- **Details**: Enable live reload during development

### T011: [P] Create Directory Structure
- **Files**: Multiple directories under `/home/john/ecs-editor/src/`
- **Action**: Create complete directory structure per plan.md
- **Dependencies**: T001
- **Details**: Create rust/, js/, css/, tests/, and subdirectories

### T012: Setup Playwright Testing Framework
- **File**: `/home/john/ecs-editor/tests/utils.py`
- **Action**: Configure Playwright Python bindings for E2E testing
- **Dependencies**: T002
- **Details**: Include headless testing configuration and utilities

---

## Phase 2: Foundational WASM Module and Data Structures

**Goal**: Implement core data models and WASM interfaces required by all user stories

### T013: Implement Core CharCell Data Structure
- **File**: `/home/john/ecs-editor/src/rust/models/core.rs`
- **Action**: Create CharCell, Line, and Document data structures
- **Dependencies**: T003, T011
- **Details**: Include serde serialization and WASM bindings

### T014: [P] Implement Element Types and Enums
- **File**: `/home/john/ecs-editor/src/rust/models/elements.rs`
- **Action**: Create ElementKind, LaneKind, and PitchSystem enums
- **Dependencies**: T003, T011
- **Details**: Include WASM-friendly representations and validation

### T015: Implement Document State Management
- **File**: `/home/john/ecs-editor/src/rust/models/core.rs`
- **Action**: Add DocumentState, CursorPosition, and Selection structures
- **Dependencies**: T013
- **Details**: Include undo/redo support and serialization

### T016: Implement Pitch System Conversion Logic
- **File**: `/home/john/ecs-editor/src/rust/models/pitch_systems/mod.rs`
- **Action**: Create pitch conversion between Number and Western systems
- **Dependencies**: T014
- **Details**: Include Number (1-7) and Western (cdefgab/CDEFGAB) with accidentals

### T017: [P] Implement Musical Notation Models
- **File**: `/home/john/ecs-editor/src/rust/models/notation.rs`
- **Action**: Create BeatSpan, SlurSpan, and musical annotation models
- **Dependencies**: T013, T014
- **Details**: Include visual rendering properties and validation

### T018: Implement WASM Module Interface
- **File**: `/home/john/ecs-editor/src/rust/lib.rs`
- **Action**: Create main WASM module with public API
- **Dependencies**: T013, T014, T015
- **Details**: Include constructor, initialization, and core operations

### T019: Implement Grapheme-Safe Text Parser
- **File**: `/home/john/ecs-editor/src/rust/parse/charcell.rs`
- **Action**: Create CharCell parser with Intl.Segmenter integration
- **Dependencies**: T013, T014
- **Details**: Handle multi-character tokens and grapheme clusters

### T020: Implement Beat Derivation Algorithm
- **File**: `/home/john/ecs-editor/src/rust/parse/beats.rs`
- **Action**: Create extract_implicit_beats algorithm with configurable parameters
- **Dependencies**: T017, T019
- **Details**: Include beat separation logic and visual span calculation

### T021: [P] Implement Layout Calculation Engine
- **File**: `/home/john/ecs-editor/src/rust/renderers/layout.rs`
- **Action**: Create position calculation for CharCell rendering
- **Dependencies**: T013, T017
- **Details**: Include lane positioning and annotation placement

### T022: Create WASM Build Test
- **File**: `/home/john/ecs-editor/src/rust/tests/wasm_build.rs`
- **Action**: Verify WASM compilation and basic functionality
- **Dependencies**: T018
- **Details**: Test core WASM module initialization

---

## Phase 3: User Story 1 - Basic Music Notation Entry (P1)

**Story Goal**: Users can enter musical notation using both Number and Western pitch systems with immediate keyboard responsiveness and automatic beat rendering.

**Independent Test**: Can enter notation in both systems, see immediate visual feedback, and verify proper beat segmentation and rendering.

### T023: Create JavaScript Editor Interface
- **File**: `/home/john/ecs-editor/src/js/editor.js`
- **Action**: Implement MusicNotationEditor class with WASM integration
- **Dependencies**: T018, T009
- **Details**: Include initialization, document loading, and basic event handling

### T024: Implement WASM Module Loading
- **File**: `/home/john/ecs-editor/src/js/main.js`
- **Action**: Create async WASM module loading and initialization
- **Dependencies**: T023
- **Details**: Include error handling and fallback mechanisms

### T025: [P] Create DOM Renderer for CharCells
- **File**: `/home/john/ecs-editor/src/js/renderer.js`
- **Action**: Implement DOM-based CharCell rendering with UnoCSS classes
- **Dependencies**: T021, T008
- **Details**: Include cell positioning, styling, and visual feedback

### T026: Implement Focus Management System
- **File**: `/home/john/ecs-editor/src/js/events.js`
- **Action**: Create canvas focus handling with immediate cursor activation
- **Dependencies**: T023, T009
- **Details**: Include click, tab, and programmatic focus support

### T027: Implement Keyboard Input Handler
- **File**: `/home/john/ecs-editor/src/js/editor.js`
- **Action**: Add keyboard event handling for character input
- **Dependencies**: T023, T026
- **Details**: Include immediate text insertion and cursor positioning

### T028: Implement Real-Time Text Processing
- **File**: `/home/john/ecs-editor/src/js/editor.js`
- **Action**: Integrate WASM text parser for real-time notation processing
- **Dependencies**: T019, T023
- **Details**: Include beat derivation and immediate visual updates

### T029: [P] Implement Beat Loop Rendering
- **File**: `/home/john/ecs-editor/src/js/renderer.js`
- **Action**: Create visual beat loops beneath derived beat spans
- **Dependencies**: T020, T025
- **Details**: Include configurable loop parameters and styling

### T030: Implement Pitch System Support
- **File**: `/home/john/ecs-editor/src/js/editor.js`
- **Action**: Add Number and Western pitch system support with conversion
- **Dependencies**: T016, T023
- **Details**: Include system switching and proper notation rendering

### T031: Implement Basic Error Handling
- **File**: `/home/john/ecs-editor/src/js/error-handling.js`
- **Action**: Create error handling for WASM operations and user input
- **Dependencies**: T023
- **Details**: Include console logging and user notification system

### T032: Create E2E Tests for Basic Notation Entry
- **File**: `/home/john/ecs-editor/tests/e2e/test_basic_notation.py`
- **Action**: Test Number and Western system entry with beat rendering
- **Dependencies**: T012, T028
- **Details**: Verify immediate responsiveness and correct notation parsing

### T033: Create Performance Tests for Input Latency
- **File**: `/home/john/ecs-editor/tests/e2e/test_performance.py`
- **Action**: Test <50ms typing latency and <10ms beat derivation targets
- **Dependencies**: T032
- **Details**: Include benchmarks for typical entry speeds

**Phase 3 Checkpoint**: Basic music notation entry functional with immediate visual feedback and beat rendering.

---

## Phase 4: User Story 2 - Keyboard-Only Editing (P2)

**Story Goal**: Users can navigate and edit notation using only keyboard controls with visual selection feedback.

**Independent Test**: Can navigate through notation using arrow keys, create selections with shift+arrows, and perform editing operations without mouse interaction.

### T034: Implement Keyboard Navigation System
- **File**: `/home/john/ecs-editor/src/js/editor.js`
- **Action**: Add arrow key navigation for CharCell movement
- **Dependencies**: T023, T027
- **Details**: Include left/right, home/end navigation with grapheme-safe positioning

### T035: Implement Visual Selection System
- **File**: `/home/john/ecs-editor/src/js/editor.js`
- **Action**: Add Shift+arrow selection with visual highlighting
- **Dependencies**: T034
- **Details**: Include selection range tracking and visual feedback

### T036: [P] Create Selection Manager in WASM
- **File**: `/home/john/ecs-editor/src/rust/models/core.rs`
- **Action**: Implement selection state management and validation
- **Dependencies**: T015
- **Details**: Include selection range calculations and cursor positioning

### T037: Implement Backspace/Delete Operations
- **File**: `/home/john/ecs-editor/src/js/editor.js`
- **Action**: Add backspace for single character and selection deletion
- **Dependencies**: T027, T035
- **Details**: Include beat recalculation and proper cursor positioning

### T038: Implement Caret Position Management
- **File**: `/home/john/ecs-editor/src/js/renderer.js`
- **Action**: Create visual caret with positioning and blinking
- **Dependencies**: T025, T034
- **Details**: Include caret visibility during focus and navigation

### T039: Implement Text Replacement on Selection
- **File**: `/home/john/ecs-editor/src/js/editor.js`
- **Action**: Add text replacement when typing with active selection
- **Dependencies**: T035, T027
- **Details**: Include selection clearing and cursor repositioning

### T040: [P] Implement Grapheme-Safe Navigation
- **File**: `/home/john/ecs-editor/src/js/editor.js`
- **Action**: Ensure navigation respects grapheme cluster boundaries
- **Dependencies**: T019, T034
- **Details**: Handle multi-character tokens correctly during navigation

### T041: Create Keyboard Navigation Tests
- **File**: `/home/john/ecs-editor/tests/e2e/test_keyboard_navigation.py`
- **Action**: Test arrow key navigation and selection operations
- **Dependencies**: T032, T034
- **Details**: Verify <16ms navigation targets and proper selection behavior

### T042: Create Editing Operations Tests
- **File**: `/home/john/ecs-editor/tests/e2e/test_editing_operations.py`
- **Action**: Test backspace, delete, and text replacement operations
- **Dependencies**: T041
- **Details**: Verify proper beat recalculation and cursor management

**Phase 4 Checkpoint**: Complete keyboard-only editing with visual selection and responsive navigation.

---

## Phase 5: User Story 3 - Selection-Based Musical Commands (P3)

**Story Goal**: Users can apply musical notations like slurs and octaves to selected ranges using keyboard shortcuts.

**Independent Test**: Can select ranges and apply slur/octave commands via keyboard shortcuts, verifying proper toggle behavior and rendering.

### T043: Implement Selection-Based Command System
- **File**: `/home/john/ecs-editor/src/js/editor.js`
- **Action**: Add Alt+key command routing for musical operations
- **Dependencies**: T035, T036
- **Details**: Include Alt+S slur, Alt-u/m/l octave commands

### T044: Implement Slur Toggle Command
- **File**: `/home/john/ecs-editor/src/js/editor.js`
- **Action**: Add Alt+S slur toggle with visual feedback
- **Dependencies**: T043
- **Details**: Include slur creation, removal, and visual indication

### T045: [P] Implement Slur Rendering with Canvas
- **File**: `/home/john/ecs-editor/src/js/renderer.js`
- **Action**: Create Canvas overlay for slur curve rendering
- **Dependencies**: T025
- **Details**: Include Bézier curve calculation and smooth rendering

### T046: Implement Octave Display System
- **File**: `/home/john/ecs-editor/src/js/renderer.js`
- **Action**: Add octave dot rendering above/below elements
- **Dependencies**: T025
- **Details**: Include octave +1 (bullet above), 0 (no display), -1 (bullet below)

### T047: Implement Octave Commands
- **File**: `/home/john/ecs-editor/src/js/editor.js`
- **Action**: Add Alt-u/m/l octave toggle commands
- **Dependencies**: T043, T046
- **Details**: Include octave application to selected pitched elements only

### T048: [P] Implement WASM Command Processing
- **File**: `/home/john/ecs-editor/src/rust/models/core.rs`
- **Action**: Create command processing for slur and octave operations
- **Dependencies**: T036
- **Details**: Include validation and state updates for musical commands

### T049: Implement Undo/Redo for Commands
- **File**: `/home/john/ecs-editor/src/js/editor.js`
- **Action**: Add undo/redo support for all musical commands
- **Dependencies**: T044, T047
- **Details**: Include history management and state restoration

### T050: Implement Tala Input Dialog
- **File**: `/home/john/ecs-editor/src/js/editor.js`
- **Action**: Add Alt-T tala input with digits 0-9+ support
- **Dependencies**: T043
- **Details**: Include tala positioning above barlines

### T051: [P] Implement Musical Ornaments Support
- **File**: `/home/john/ecs-editor/src/js/renderer.js`
- **Action**: Add mordent ornament rendering above elements
- **Dependencies**: T025
- **Details**: Include ornament positioning and visual styling

### T052: Create Musical Commands Tests
- **File**: `/home/john/ecs-editor/tests/e2e/test_musical_commands.py`
- **Action**: Test slur and octave commands with visual verification
- **Dependencies**: T042, T043
- **Details**: Verify toggle behavior and proper rendering

### T053: Create Tala and Ornaments Tests
- **File**: `/home/john/ecs-editor/tests/e2e/test_tala_ornaments.py`
- **Action**: Test tala input and ornament rendering functionality
- **Dependencies**: T052
- **Details**: Verify proper positioning and visual accuracy

**Phase 5 Checkpoint**: Full selection-based musical command system with toggle behavior and visual feedback.

---

## Phase 6: User Story 4 - UI Interface and Debug Information (P3)

**Story Goal**: Users have a clean menu-based interface with debug information tabs for development monitoring.

**Independent Test**: Can navigate menus, switch tabs, and verify focus returns correctly to the editor after UI interactions.

### T054: Implement Menu System Structure
- **File**: `/home/john/ecs-editor/src/js/ui.js`
- **Action**: Create menu system with File and Line menus
- **Dependencies**: T009
- **Details**: Include keyboard navigation and menu item organization

### T055: [P] Create File Menu Items
- **File**: `/home/john/ecs-editor/src/js/ui.js`
- **Action**: Implement File menu with New, Save, Open, Export stubs
- **Dependencies**: T054
- **Details**: Include Set Title, Tonic, Pitch System, Key Signature

### T056: Create Line Menu Items
- **File**: `/home/john/ecs-editor/src/js/ui.js`
- **Action**: Implement Line menu with line-specific operations
- **Dependencies**: T054
- **Details**: Include Set Label, Tonic, Pitch System, Lyrics, Tala, Key Signature

### T057: Implement Document Persistence
- **File**: `/home/john/ecs-editor/src/js/file-operations.js`
- **Action**: Add JSON file save/load functionality
- **Dependencies**: T055
- **Details**: Include document state serialization and file handling

### T058: [P] Create Export Menu Stubs
- **File**: `/home/john/ecs-editor/src/js/file-operations.js`
- **Action**: Implement MusicXML and LilyPond export stubs
- **Dependencies**: T055
- **Details**: Show "Not implemented in POC" messages

### T059: Implement Tab System
- **File**: `/home/john/ecs-editor/src/js/ui.js`
- **Action**: Create tab group with Document, Console Errors, Console Log tabs
- **Dependencies**: T009
- **Details**: Include tab switching and content management

### T060: Implement Document Data Display
- **File**: `/home/john/ecs-editor/src/js/ui.js`
- **Action**: Show real-time CharCell structure in Document tab
- **Dependencies**: T059
- **Details**: Include formatted JSON display and live updates

### T061: [P] Implement Console Error Display
- **File**: `/home/john/ecs-editor/src/js/error-handling.js`
- **Action**: Display error messages with timestamps in Console Errors tab
- **Dependencies**: T031, T059
- **Details**: Include error history and auto-scrolling

### T062: Implement Console Log Display
- **File**: `/home/john/ecs-editor/src/js/ui.js`
- **Action**: Show debug information and action logs in Console Log tab
- **Dependencies**: T059
- **Details**: Include log filtering and search functionality

### T063: Implement Focus Return System
- **File**: `/home/john/ecs-editor/src/js/events.js`
- **Action**: Ensure focus returns to editor after menu and tab operations
- **Dependencies**: T026, T054, T059
- **Details**: Include automatic focus restoration within 50ms

### T064: Create Menu and Navigation Tests
- **File**: `/home/john/ecs-editor/tests/e2e/test_ui_navigation.py`
- **Action**: Test menu operations and focus return behavior
- **Dependencies**: T053, T054
- **Details**: Verify focus management and UI responsiveness

### T065: [P] Create Console and Debug Tests
- **File**: `/home/john/ecs-editor/tests/e2e/test_debug_display.py`
- **Action**: Test console tabs and document data display
- **Dependencies**: T064
- **Details**: Verify real-time updates and error logging

**Phase 6 Checkpoint**: Complete UI interface with debug information and proper focus management.

---

## Phase 7: Polish and Cross-Cutting Concerns

**Goal**: Complete feature integration, performance optimization, and production readiness

### T066: Implement Performance Monitoring
- **File**: `/home/john/ecs-editor/src/js/performance-contracts.js`
- **Action**: Create performance monitoring for all target metrics
- **Dependencies**: T023
- **Details**: Include <50ms typing, <10ms beat derivation, <16ms navigation monitoring

### T067: Optimize WASM Performance
- **File**: `/home/john/ecs-editor/src/rust/lib.rs`
- **Action**: Apply optimization settings for <10ms beat derivation target
- **Dependencies**: T018
- **Details**: Include compilation flags and memory optimization

### T068: [P] Optimize CSS Performance
- **File**: `/home/john/ecs-editor/uno.config.ts`
- **Action**: Optimize UnoCSS configuration for critical path rendering
- **Dependencies**: T008
- **Details**: Include critical CSS extraction and utility pre-generation

### T069: Implement Comprehensive Error Handling
- **File**: `/home/john/ecs-editor/src/js/error-handling.js`
- **Action**: Complete error handling with user-friendly messages
- **Dependencies**: T031
- **Details**: Include WASM errors, validation errors, and network errors

### T070: Create Input Validation System
- **File**: `/home/john/ecs-editor/src/js/validation.js`
- **Action**: Implement comprehensive input validation for all user inputs
- **Dependencies**: T069
- **Details**: Include musical notation validation and document structure validation

### T071: [P] Implement Memory Management
- **File**: `/home/john/ecs-editor/src/js/editor.js`
- **Action**: Add memory management for large documents and cleanup
- **Dependencies**: T023
- **Details**: Include cleanup for event listeners and cached data

### T072: Create Production Build Configuration
- **File**: `/home/john/ecs-editor/Makefile`
- **Action**: Add production build targets with optimizations
- **Dependencies**: T004
- **Details**: Include minification, compression, and bundle optimization

### T073: Implement Accessibility Features
- **File**: `/home/john/ecs-editor/src/js/accessibility.js`
- **Action**: Add ARIA labels and keyboard accessibility support
- **Dependencies**: T054
- **Details**: Include screen reader support and focus management

### T074: [P] Create Browser Compatibility Testing
- **File**: `/home/john/ecs-editor/tests/e2e/test_browser_compatibility.py`
- **Action**: Test application across different browsers
- **Dependencies**: T012
- **Details**: Include Chrome, Firefox, Safari compatibility verification

### T075: Create Comprehensive E2E Test Suite
- **File**: `/home/john/ecs-editor/tests/e2e/test_comprehensive.py`
- **Action**: Create full feature test suite for all user stories
- **Dependencies**: T065
- **Details**: Include integration tests and user workflow validation

### T076: Implement Performance Benchmarking
- **File**: `/home/john/ecs-editor/tests/e2e/test_performance_benchmarks.py`
- **Action**: Create automated performance testing for all targets
- **Dependencies**: T066
- **Details**: Include regression testing and performance monitoring

### T077: [P] Create Documentation and Quickstart
- **File**: `/home/john/ecs-editor/README.md`
- **Action**: Create comprehensive documentation for users and developers
- **Dependencies**: T075
- **Details**: Include setup instructions, usage guide, and development workflow

### T078: Final Integration Testing
- **File**: `/home/john/ecs-editor/tests/e2e/test_final_integration.py`
- **Action**: Complete end-to-end testing of all features together
- **Dependencies**: T075, T076
- **Details**: Verify all user stories work in concert

### T079: Production Deployment Preparation
- **File**: `/home/john/ecs-editor/dist/`
- **Action**: Create production-ready distribution
- **Dependencies**: T072
- **Details**: Include optimized bundles and deployment configuration

### T080: [P] Create Performance Reports
- **File**: `/home/john/ecs-editor/docs/performance.md`
- **Action**: Document performance metrics and benchmarks
- **Dependencies**: T076
- **Details**: Include before/after comparisons and optimization results

### T081: Final Code Quality Review
- **File**: Multiple source files
- **Action**: Complete code review and quality assurance
- **Dependencies**: T078
- **Details**: Include linting, formatting, and best practices verification

### T082: Create User Acceptance Tests
- **File**: `/home/john/ecs-editor/tests/e2e/test_user_acceptance.py`
- **Action**: Create tests validating all success criteria
- **Dependencies**: T081
- **Details**: Verify all measurable outcomes and success metrics

### T083: Generate Final Documentation
- **File**: `/home/john/ecs-editor/docs/`
- **Action**: Complete all documentation for handoff
- **Dependencies**: T077, T080
- **Details**: Include API documentation, user guide, and technical notes

### T084: Project Completion Review
- **File**: N/A
- **Action**: Final review of all deliverables and requirements
- **Dependencies**: T082, T083
- **Details**: Verify all user stories complete and success criteria met

### T085: Archive and Cleanup
- **File**: Multiple
- **Action**: Clean up development artifacts and prepare for delivery
- **Dependencies**: T084
- **Details**: Remove debug code, optimize bundles, and prepare release

---

## Dependencies and Execution Order

### Phase Dependencies:
1. **Phase 1** (Setup) → **Phase 2** (Foundational) → **User Story Phases** → **Phase 7** (Polish)
2. User stories can be developed independently after Phase 2 completion
3. Each user story phase is independently testable

### User Story Dependencies:
- **US1 (P1)**: Foundation for all other stories - must complete first
- **US2 (P2)**: Depends on US1 for basic text handling
- **US3 (P3)**: Depends on US2 for selection system
- **US4 (P3)**: Can be developed in parallel with US3 after US2

### Critical Path:
T001-T012 → T013-T022 → T023-T033 → T034-T042 → T043-T053 → T054-T065 → T066-T085

---

## Parallel Execution Opportunities

### Within User Story 1 (Phase 3):
```bash
# Parallel tasks (4 developers)
T025 & T026 & T028 & T029  # Renderer, focus, processing, beats
```

### Within User Story 2 (Phase 4):
```bash
# Parallel tasks (2 developers)
T036 & T040  # WASM selection and navigation
```

### Within User Story 3 (Phase 5):
```bash
# Parallel tasks (3 developers)
T045 & T046 & T048  # Canvas rendering, octave display, WASM commands
```

### Within User Story 4 (Phase 6):
```bash
# Parallel tasks (3 developers)
T055 & T056 & T058  # File menu, Line menu, export stubs
```

### Within Polish Phase (Phase 7):
```bash
# Parallel tasks (4 developers)
T068 & T071 & T074 & T077  # CSS optimization, memory management, browser testing, documentation
```

**Total Parallel Opportunities**: 37 tasks (44% of total)

---

## Independent Test Criteria by User Story

### User Story 1 (Basic Notation Entry):
- Can enter Number system notation (1-7) with immediate visual feedback
- Can enter Western system notation (cdefgab/CDEFGAB) with immediate visual feedback
- Beat loops render automatically beneath derived beat spans
- Focus activation occurs within 10ms of canvas interaction
- Typing latency remains under 50ms for typical entry speeds

### User Story 2 (Keyboard-Only Editing):
- Can navigate using arrow keys with <16ms response time
- Can create selections using Shift+arrow keys with visual highlighting
- Can delete content using backspace with proper beat recalculation
- Can replace selected text by typing with immediate visual update
- All operations work without mouse interaction

### User Story 3 (Selection-Based Commands):
- Can apply slur using Alt+S with toggle behavior
- Can apply octaves using Alt-u/m/l with proper positioning
- Can input tala using Alt-T with digits 0-9+
- Commands respond within 20ms of keyboard input
- Musical commands apply only to appropriate element types

### User Story 4 (UI Interface and Debug):
- Can navigate all menus using keyboard
- Can switch between tabs with focus returning to editor
- Document tab shows real-time CharCell structure
- Console tabs display errors and logs with timestamps
- Focus returns to editor within 50ms after UI interactions

---

## MVP Scope Recommendation

**Recommended MVP**: User Story 1 only (T001-T033)

**MVP Deliverables**:
- Basic music notation entry with Number and Western systems
- Immediate visual feedback and beat rendering
- Focus management with keyboard responsiveness
- Basic error handling and console logging
- Performance monitoring for core metrics

**MVP Timeline**: 2-3 weeks (Phase 1-3 only)

**MVP Success Criteria**:
- Users can enter musical notation in both pitch systems
- Beat visualization renders automatically
- Typing latency <50ms, beat derivation <10ms
- Focus activation <10ms

---

## Implementation Strategy

### Incremental Delivery Approach:
1. **Week 1-2**: Complete Phase 1-2 (Setup and Foundation)
2. **Week 3-4**: Implement User Story 1 (MVP delivery)
3. **Week 5-6**: Add User Story 2 (Keyboard editing)
4. **Week 7-8**: Implement User Story 3 (Musical commands)
5. **Week 9-10**: Complete User Story 4 (UI and debug)
6. **Week 11-12**: Polish, testing, and production readiness

### Risk Mitigation:
- **Technical Risk**: WASM performance - mitigated by Phase 2 foundation
- **Integration Risk**: JavaScript-WASM communication - mitigated by early integration in T023-T024
- **Performance Risk**: Beat derivation speed - mitigated by T020 optimization
- **Usability Risk**: Focus management - mitigated by dedicated T026 implementation

### Quality Assurance:
- Each user story phase includes comprehensive testing
- Performance targets monitored throughout development
- Code quality enforced via ESLint and Rust clippy
- Cross-browser compatibility validated in Phase 7

---

**This task list provides a complete roadmap for implementing the Music Notation Editor POC with clear dependencies, parallel opportunities, and independent testing criteria for each user story.**