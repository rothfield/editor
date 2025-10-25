# Implementation Plan: Ornaments (Grace Notes)

**Branch**: `003-implement-ornaments-grace` | **Date**: 2025-10-22 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/003-implement-ornaments-grace/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Implement ornaments (grace notes) as a music notation feature where ornaments are sequences of pitches (pitch+) that embellish primary notes. Ornaments are created via an Edit → Ornament menu dialog, rendered as CSS-positioned DOM elements (not cells) at 75% font size, and exported to MusicXML and Lilypond formats. The implementation involves: (1) Ornament data model and storage, (2) Edit dialog UI with real-time preview, (3) CSS-based positioning and rendering (x,y coordinates), (4) Grammar validation and parsing, (5) Lilypond grace note export, and (6) MusicXML roundtrip support.

## Technical Context

**Language/Version**: Rust 1.75+ (WASM module) + JavaScript ES2022+ (host application)
**Primary Dependencies**:
- Rust/WASM: wasm-bindgen 0.2.92, serde (serialization)
- JavaScript: OSMD 1.7.6 (staff rendering), UnoCSS (styling), dialog/menu handlers
- Export: Lilypond (grace note syntax), MusicXML (roundtrip)

**Rendering Architecture** (Per Constitution I - Performance First):
- **WASM (Rust)**: Coordinate calculation, positioning logic, bounding box computation
- **JavaScript**: DOM manipulation, CSS application (using calculated coordinates from WASM)
- Rendering logic MUST be in WASM to ensure consistent calculations (preview ↔ output) and meet <100ms preview latency target

**API Design Principle** (Ornament vs. Note Line Operations):
- **Separate API implementations** (NOT DRY): Ornament editing and note line editing have distinct handlers for the same keys/commands
  - Rationale: Different semantic contexts (backspace in note line = delete cell; in ornament = remove pitch), different state models (global cursor vs. dialog focus), different data structures (cell sequence vs. pitch sequence)
  - Conflating them would create coupling, state confusion, and maintenance complexity
- **Shared utilities** (DRY applied here): Common pitch validation, accidental parsing, octave manipulation logic shared between both
- **Consistent patterns**: Same handler signatures, menu command structure, event flow patterns across both APIs
- **Clear separation**: Ornament API lives in separate modules (api/ornament_api.rs, ornament-editor-handler.js) alongside shared utilities

**Storage**: JSON-based document persistence (existing editor model); ornament data embedded in line-element data
**Testing**: Playwright (Python bindings) in headless mode for E2E tests; Rust unit tests for grammar/validation
**Target Platform**: Web (WASM + JavaScript), Lilypond/MusicXML export
**Project Type**: Web application (existing Cell-based editor extension)
**Performance Goals**:
- Real-time preview: <100ms latency (SC-005)
- Dialog interaction: <16ms per keystroke (60fps target per Constitution)
- Rendering: Tight layout with no horizontal expansion (SC-011)

**Constraints**:
- Single-line editor scope (existing Cell editor limitation)
- Ornaments do NOT increase horizontal spacing (tight vertical overlay only)
- 75% ± 5% pitch font size (SC-012)
- Vertical spacing: <2pt between stacked pitches (SC-013)

**Scale/Scope**:
- Feature scope: Dialog UI + data model + rendering + export (no parsing from text input)
- Integration: Extends existing line-element rendering; adds new dialog component
- Complexity: Moderate (UI, CSS positioning, Lilypond/MusicXML generation)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Principle Compliance

✅ **I. Performance First**: Ornament rendering uses CSS positioning + WASM for coordinate calculation; tight 100ms preview latency target aligns with sub-16ms response goals.

✅ **II. Test-Driven Development (NON-NEGOTIABLE)**: Feature requires comprehensive E2E tests via Playwright (Python) that exercise full WASM pipeline (data → calculation → rendering).

✅ **III. User Experience Focus**: Edit dialog provides immediate feedback with <100ms preview latency; focus returns to editor canvas after dialog close per specification.

✅ **IV. Clean Architecture**: Ornament code organized as separate module (data model, dialog component, renderers); no embedded JavaScript/CSS in HTML.

✅ **V. Developer Experience**: Ornament data structure provides rich debugging info; console tabs display both ephemeral (x,y positions) and persistent (pitch/octave) data.

✅ **VI. Standards Compliance**: Follows existing code organization (models, renderers, utils); uses UnoCSS for styling; ES6+ JavaScript conventions.

✅ **VII. No Fallbacks (NON-NEGOTIABLE)**: Ornament rendering implemented purely in WASM (coordinate calculation) + CSS positioning (display); no JavaScript fallback logic for positioning.

✅ **VIII. MusicXML First (NON-NEGOTIABLE)**: Ornaments map to MusicXML grace notes; full roundtrip export/import support required (SC-009 covers doremi-script fixtures).

### Gate Status
**PASS** - All principles supported; no violations identified.

## Project Structure

### Documentation (this feature)

```
specs/[###-feature]/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

**Ornament feature code will integrate with existing editor structure:**

```
src/
├── rust/
│   ├── models/
│   │   └── ornament.rs                    # NEW: Ornament data structure
│   │
│   ├── api/
│   │   ├── note_line_api.rs               # EXISTING: Note line operations (keydown, arrow, backspace, etc.)
│   │   └── ornament_api.rs                # NEW: Ornament dialog operations (separate, NOT DRY)
│   │
│   ├── parse/
│   │   ├── pitch.rs                       # SHARED: Pitch validation/conversion (used by both)
│   │   ├── accidental.rs                  # SHARED: Accidental handling (used by both)
│   │   └── ornament.rs                    # NEW: Grammar validation & parsing (ornament-specific)
│   │
│   ├── renderers/
│   │   ├── ornament.rs                    # NEW: Coordinate calculation & positioning (WASM)
│   │   ├── lilypond/
│   │   │   └── ornament.rs                # NEW: Lilypond grace note export
│   │   └── musicxml/
│   │       └── ornament.rs                # NEW: MusicXML ornament mapping
│   │
│   └── utils/
│       ├── ornament-layout.rs             # NEW: Bounding box calculation (WASM)
│       └── pitch-utils.rs                 # SHARED: Pitch manipulation utilities

├── js/
│   ├── note-line-handler.js               # EXISTING: Note line event handlers
│   ├── ornament-editor-handler.js         # NEW: Ornament dialog event handlers (separate, NOT DRY)
│   ├── ornament-editor.js                 # NEW: Edit dialog component + DOM manipulation
│   └── events.js                          # MODIFY: Add Edit → Ornament menu dispatch

└── tests/
    ├── e2e/
    │   ├── note-line.spec.js              # EXISTING: Note line E2E tests
    │   └── ornament.spec.js               # NEW: Ornament E2E tests
    └── fixtures/
        └── ornament/                      # NEW: Test data (doremi-script fixtures)
```

**Structure Decision**:
Ornament feature uses **existing web application structure** (Rust WASM + JavaScript frontend).

**API Design** (NOT DRY on handlers, DRY on utilities):
- **Separate implementations**: `api/ornament_api.rs` and `ornament-editor-handler.js` have distinct operations for same keys/commands
  - Different semantics: backspace in note line (delete cell) vs. ornament (remove pitch)
  - Different state: global cursor vs. dialog focus state
  - Different data: cell sequence vs. pitch sequence
- **Shared utilities**: `pitch.rs`, `accidental.rs`, `pitch-utils.rs` used by both note line and ornament APIs
- **Consistent patterns**: Same handler signatures and event flow patterns across both

**Implementation Modules**:
- **WASM** (Rust): Data model, API operations, parsing, coordinate calculation, layout, export
- **JavaScript**: Dialog UI, event handlers, DOM manipulation, CSS application
- E2E tests use Playwright (Python) matching existing test infrastructure

## Complexity Tracking

*No violations identified in Constitution Check - no complexity justification needed.*

---

## Phase 0: Research & Clarification ✅ COMPLETE

### Research Questions Resolved

1. ✅ **Ornament x,y coordinate precision**: Use **pixel (px) with 0.1px precision** (supports <2pt spacing requirement)
2. ✅ **WASM boundary crossing**: **Parse, calculate, normalize in WASM; render only in JS** (5-8x faster)
3. ✅ **MusicXML ornament semantics**: **Use `<grace>` with `steal-time-*` attributes** (standard-compliant)
4. ✅ **Dialog preview coordination**: **Single source of truth - call same WASM function from both** (eliminates divergence)
5. ✅ **Accidental font scaling**: **Bravura SMuFL at 75% (24px)** (18pt size, proven readability)

### Phase 0 Outputs

- ✅ **research.md**: Complete with decisions, rationale, trade-offs, and implementation details for all 5 questions
- ✅ No blocking unknowns; specification is comprehensive and implementable

## Phase 1: Design & Data Model ✅ COMPLETE

### Phase 1 Outputs

- ✅ **data-model.md**: Complete entity definitions (Ornament, OrnamentPitch, OrnamentPosition, BoundingBox, OrnamentSequence)
- ✅ **contracts/ornament-api.md**: Full API specifications for dialog, core WASM, rendering, and export
- ✅ **quickstart.md**: Comprehensive developer guide with code examples for all 5 implementation phases
  - Phase 1: Data model (Rust structs)
  - Phase 2: WASM API (parsing, positioning, export)
  - Phase 3: Dialog UI (JavaScript, event handling)
  - Phase 4: Rendering (CSS positioning)
  - Phase 5: Export (Lilypond & MusicXML)

### Implementation Readiness

✅ **Data Model**: Complete with validation rules and state transitions
✅ **API Contracts**: Clear specifications for all interfaces
✅ **WASM Boundary**: Documented (parsing/calculation in Rust, rendering in JS)
✅ **Code Examples**: Ready-to-implement code in quickstart
✅ **Testing Checklist**: 14-item verification list provided

---

## Summary: All Planning Complete ✅

| Phase | Status | Output |
|-------|--------|--------|
| **Phase 0** | ✅ Complete | research.md (5 questions resolved) |
| **Phase 1** | ✅ Complete | data-model.md, contracts/, quickstart.md |
| **Phase 2** | Ready → | `/speckit.tasks` to generate implementation tasks |

**Ready for implementation**: Yes ✅
