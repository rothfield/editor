# Implementation Plan: Real-Time Staff Notation Rendering

**Branch**: `002-real-time-staff` | **Date**: 2025-10-14 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-real-time-staff/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Add real-time visual staff notation rendering to the music notation editor POC. Users will see traditional 5-line staff notation (sheet music) automatically updated as they type, with notes, rests, barlines, and duration indicators displayed within 100ms of editing. The system converts the internal Cell-based document model to MusicXML format in Rust/WASM, then renders it using OSMD (OpenSheetMusicDisplay) library in JavaScript.

## Technical Context

**Language/Version**: Rust 1.75+ (WASM module), JavaScript ES2022+ (host application), Node.js 18+
**Primary Dependencies**: wasm-bindgen 0.2.92, OSMD (OpenSheetMusicDisplay) 1.7.6, existing Cell-based editor
**Storage**: N/A (feature reads existing document model, no new persistence)
**Testing**: Playwright (Python bindings) in headless mode for E2E tests
**Target Platform**: Modern browsers with WASM support (Chrome, Firefox, Safari)
**Project Type**: Web application (Rust/WASM backend + JavaScript frontend)
**Performance Goals**: MusicXML export < 10ms, rendering update < 100ms (debounced), tab switch < 50ms focus return
**Constraints**: Must work with existing Cell-based document model, no fallback implementations (Principle VII), maintain 60fps editor performance
**Scale/Scope**: Up to 50 measures per document, single-line POC scope, single voice notation

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Principle I - Performance First**: ✅ PASS
- MusicXML export implemented in Rust/WASM
- JavaScript handles only UI orchestration and OSMD library integration
- No computational work in JavaScript layer

**Principle II - Test-Driven Development**: ⚠️ ATTENTION REQUIRED
- E2E tests MUST be written before implementation
- Test scenarios from user stories (typing "1 2 3", barlines, durations, multi-line)
- Tests validate 100ms update timing, tab switching behavior, error handling
- Action: Generate test scenarios in Phase 1

**Principle III - User Experience Focus**: ✅ PASS
- Focus returns to editor after tab switching (existing pattern)
- Debounced rendering (100ms) prevents interrupting typing flow
- Staff notation tab integrates with existing tab system

**Principle IV - Clean Architecture**: ✅ PASS
- Rust code organized in `src/renderers/musicxml/` module
- JavaScript code organized in separate `src/js/osmd-renderer.js` file
- No embedded CSS/JavaScript in HTML
- Clear separation: WASM exports, JS orchestrates, OSMD renders

**Principle V - Developer Experience**: ✅ PASS
- MusicXML export logged with byte count for debugging
- Rendering errors logged to Console Errors tab
- Performance metrics for export/render timing
- Data structure display shows document state used for export

**Principle VI - Standards Compliance**: ✅ PASS
- MusicXML standard format for music interchange
- OSMD library follows VexFlow rendering standards
- ES6+ JavaScript with modern async/await patterns
- Follows existing project structure conventions

**Principle VII - No Fallbacks**: ✅ PASS
- **CRITICAL**: No JavaScript fallback for MusicXML export
- If WASM export fails, display error and preserve last valid rendering
- OSMD is the only rendering path (no canvas/SVG fallbacks)
- Feature disabled if WASM module unavailable

**Initial Assessment**: PASSES all gates with attention required for TDD (tests before implementation)

---

## Post-Design Constitution Re-Check

*Re-evaluated after Phase 1 design completion*

**Principle I - Performance First**: ✅ PASS
- MusicXML export: Rust/WASM implementation confirmed
- Helper modules (duration, pitch, builder) are pure computation
- JavaScript layer: Only OSMD wrapper and UI orchestration
- **No changes from initial assessment**

**Principle II - Test-Driven Development**: ✅ PASS (with action items)
- E2E test scenarios defined in quickstart.md
- Unit test examples provided for Rust modules
- Test files specified: `test_staff_notation_*.py`
- **Action Required**: Write tests before implementation begins
- **Test coverage**: Basic notation, barlines, durations, multi-line, performance

**Principle III - User Experience Focus**: ✅ PASS
- Focus management pattern confirmed (50ms delay after render)
- 100ms debouncing preserves typing flow
- Staff notation tab integrates seamlessly
- Error states preserve last valid render
- **No changes from initial assessment**

**Principle IV - Clean Architecture**: ✅ PASS
- Module organization confirmed:
  - Rust: `src/renderers/musicxml/` (mod.rs, builder.rs, duration.rs, pitch.rs)
  - JavaScript: `src/js/osmd-renderer.js` (new dedicated module)
  - Contracts documented in `contracts/` directory
- **No embedded code in HTML** (only script tag for OSMD CDN)
- **Clear separation of concerns** verified in data-model.md

**Principle V - Developer Experience**: ✅ PASS
- Comprehensive logging defined in contracts:
  - WASM: debug/info/warn/error levels
  - JavaScript: Console Log/Errors tabs
- Performance metrics: Export time, render time, cache hit rate
- Data structure display: Document state visible before export
- Error messages: Descriptive, actionable
- **Debugging guide provided** in quickstart.md

**Principle VI - Standards Compliance**: ✅ PASS
- MusicXML 3.1 standard confirmed
- ES6+ JavaScript patterns documented (async/await, modules)
- Project structure follows constitution's file organization
- Code organization matches existing patterns (renderers/, js/)
- **No deviations from standards**

**Principle VII - No Fallbacks**: ✅ PASS (CRITICAL VALIDATION)
- **WASM export is ONLY export path** - No JavaScript fallback
- **OSMD is ONLY rendering path** - No canvas/SVG fallbacks
- **Error handling strategy**: Display error, preserve last render, do NOT fall back
- **Feature disabled if WASM unavailable** - Documented in contracts
- **Graceful degradation**: Cache failures log warning, continue render (acceptable)
- **VALIDATED**: No violation of "No Fallbacks" principle

**Final Assessment**: ✅ ALL GATES PASS

**Post-Design Confidence**: HIGH
- All design artifacts complete (research, data-model, contracts, quickstart)
- Architecture validated against all constitutional principles
- No constitutional violations identified
- Ready to proceed with `/speckit.tasks` for task generation

## Project Structure

### Documentation (this feature)

```
specs/002-real-time-staff/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
│   └── musicxml-export.md  # WASM API contract
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```
src/
├── models/              # Existing Cell-based document model (unchanged)
│   ├── core.rs          # Cell, Line, Document structures
│   ├── elements.rs      # ElementKind enum
│   ├── pitch.rs         # PitchCode, PitchInfo
│   └── barlines.rs      # Barline types
├── renderers/           # Rendering modules
│   ├── svg/             # Existing SVG renderer (unchanged)
│   └── musicxml/        # NEW: MusicXML export module
│       ├── mod.rs       # Main export entry point
│       ├── builder.rs   # MusicXML document builder state machine
│       ├── duration.rs  # Duration calculation helpers
│       └── pitch.rs     # Pitch conversion helpers
├── api.rs               # WASM bindings (add exportMusicXML function)
├── lib.rs               # WASM library entry point (unchanged)
└── js/                  # JavaScript host application
    ├── main.js          # Application entry point (unchanged)
    ├── editor.js        # Core editor (add MusicXML export method)
    ├── osmd-renderer.js # NEW: OSMD wrapper and rendering logic
    └── ui.js            # UI components (add Staff Notation tab)

tests/
├── e2e/                 # NEW: E2E tests for staff notation feature
│   ├── test_staff_notation_basic.py
│   ├── test_staff_notation_barlines.py
│   ├── test_staff_notation_durations.py
│   └── test_staff_notation_multiline.py
└── fixtures/            # Test data
    └── notation_samples.json

index.html               # UPDATED: Add OSMD library script tag + Staff Notation tab
```

**Structure Decision**: Web application structure with Rust/WASM backend for MusicXML export and JavaScript frontend for UI and OSMD integration. New `renderers/musicxml/` module in Rust follows existing renderer pattern (SVG). JavaScript adds single new module `osmd-renderer.js` following existing organization.

## Complexity Tracking

*No constitutional violations - table not needed*

