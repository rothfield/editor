# Implementation Plan: Music Notation Ornament Support

**Branch**: `006-music-notation-ornament` | **Date**: 2025-10-25 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/006-music-notation-ornament/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Add support for music notation ornaments (grace notes) as first-class tokens in the editor's linear token stream. Ornaments are rhythm-transparent embellishments rendered at ~75% size above baseline with zero horizontal width (floating layout) when edit mode is OFF, and inline with normal spacing when edit mode is ON. The system supports three position types (before/after/top) encoded implicitly in six indicator variants: `OrnamentBeforeStart/End`, `OrnamentAfterStart/End`, and `OrnamentOnTopStart/End`. Attachment to parent notes is computed algorithmically at render/export time. Ornaments must be excluded from beat calculations and exported correctly to MusicXML (as `<grace/>` elements) and LilyPond.

## Technical Context

**Language/Version**: Rust 1.75+ (WASM module) + JavaScript ES2022+ (host application)
**Primary Dependencies**: wasm-bindgen 0.2.92, OSMD 1.7.6, serde 1.0.197, quick-xml 0.31, mustache 0.9
**Storage**: JSON file format for document persistence
**Testing**: Playwright (headless E2E tests in Docker)
**Target Platform**: Web browser with WASM support (Chromium, Firefox, WebKit)
**Project Type**: Web application (single WASM module + JavaScript host)
**Performance Goals**: < 16ms keyboard latency (60fps), < 10ms beat derivation, < 100ms rendering updates
**Constraints**: Single-line POC scope, 16-point typeface, up to 1000 cells per document, < 2s edit mode toggle
**Scale/Scope**: POC feature for ~100 lines of Rust code, ~200 lines JavaScript, ~10 E2E test scenarios

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Principle I: Performance First ✅
**Status**: PASS
**Rationale**: All performance-critical operations (ornament attachment resolution, beat derivation exclusion, rendering coordinate calculations) will be implemented in Rust/WASM. JavaScript handles only UI orchestration (edit mode toggle, keyboard shortcuts).

### Principle II: Test-Driven Development (NON-NEGOTIABLE) ✅
**Status**: PASS
**Rationale**: E2E tests MUST be written before implementation. Tests will verify complete workflow: user types ornament syntax → WASM processes → renders correctly → exports to MusicXML/LilyPond. Tests run in Docker with Playwright. Minimum one end-to-end test demonstrating ornament addition, rendering, and export.

**Required E2E Test Scenarios**:
1. LilyPond smoke test: Type ornament notation → verify LilyPond export contains grace notes
2. MusicXML export: Verify `<grace/>` elements with correct placement attributes
3. Edit mode toggle: Verify layout changes (inline ↔ floating) without data modification
4. Beat calculation: Verify ornaments excluded from beat subdivision counting
5. Collision detection: Verify horizontal spacing added when ornaments collide

### Principle III: User Experience Focus ✅
**Status**: PASS
**Rationale**: Focus returns to editor immediately after edit mode toggle. Keyboard shortcut (Alt+Shift+O) for edit mode toggle. < 2s mode transition meets 60fps target. No latency added to existing keyboard operations.

### Principle IV: Clean Architecture ✅
**Status**: PASS
**Rationale**: Ornament logic separated into proper modules:
- Rust: `src/models/elements.rs` (OrnamentIndicator enum expansion), `src/parse/tokens.rs` (ornament parsing), `src/renderers/musicxml/export.rs` (grace note export), `src/renderers/layout_engine.rs` (attachment resolution + rendering)
- JavaScript: `src/js/editor.js` (edit mode state), `src/js/ui.js` (keyboard shortcuts), `src/js/renderer.js` (visual styling toggle)

### Principle V: Developer Experience ✅
**Status**: PASS
**Rationale**: Inspector tabs (LilyPond, MusicXML, WASM Layout, Doc Model) will show ornament data at each stage. Ornaments visible in Document Model tab as separate tokens with indicator variants. Performance metrics logged for attachment resolution and rendering.

### Principle VI: Standards Compliance ✅
**Status**: PASS
**Rationale**: Code follows existing file structure. Rust domain-driven design (models/parse/renderers). JavaScript ES6+ with proper error handling. UnoCSS for styling (small font size, vertical positioning, collision spacing).

### Principle VII: No Fallbacks - Implementation Excellence (NON-NEGOTIABLE) ✅
**Status**: PASS
**Rationale**: No JavaScript fallbacks. All ornament logic (attachment resolution, beat exclusion, rendering calculations) implemented correctly in WASM first time. No partial implementations. If WASM cannot provide functionality, feature not implemented until proper WASM support exists.

### Principle VIII: MusicXML First - Standardized Interchange Format ✅
**Status**: PASS
**Rationale**: Ornaments designed with full MusicXML support: grace notes export as `<grace/>` elements with no duration. Position types (before/after/top) mapped to MusicXML placement attributes. MusicXML compatibility validated in E2E tests alongside functional testing.

### Principle IX: Export Strategy - Leverage Ecosystem Tools ✅
**Status**: PASS
**Rationale**: Primary export target is MusicXML (`<grace/>` elements). LilyPond export uses MusicXML → LilyPond converter (existing `musicxml2ly` tool or internal converter). Direct LilyPond export only if converter loses critical ornament position information.

**Initial Assessment**: ALL GATES PASS. No violations. Ready for Phase 0 research.

---

## Post-Design Constitution Re-Check

*Re-evaluated after Phase 0 (Research) and Phase 1 (Design) completion*

### Principle I: Performance First ✅
**Status**: PASS (Confirmed)
**Evidence**:
- `data-model.md`: All attachment resolution, beat derivation, collision detection implemented in Rust
- `contracts/ornament-api.md`: 6 WASM functions with performance targets (< 100ms layout for 1000 cells)
- `research.md`: Single-pass O(n) attachment algorithm designed

### Principle II: Test-Driven Development ✅
**Status**: PASS (Confirmed)
**Evidence**:
- `contracts/ornament-api.md`: Inspector-first testing strategy defined
- Required test files identified: `ornament-basic.spec.js`, `ornament-edit-mode.spec.js`, `ornament-export.spec.js`, `ornament-beats.spec.js`
- `quickstart.md`: User scenarios defined for test coverage

### Principle III: User Experience Focus ✅
**Status**: PASS (Confirmed)
**Evidence**:
- `quickstart.md`: Keyboard shortcut Alt+Shift+O documented
- `data-model.md`: < 2s mode transition target, focus management preserved
- `contracts/ornament-api.md`: Performance targets ensure 60fps keyboard response

### Principle IV: Clean Architecture ✅
**Status**: PASS (Confirmed)
**Evidence**:
- `data-model.md`: Clear module separation (models/elements.rs, parse/tokens.rs, renderers/layout_engine.rs)
- `contracts/ornament-api.md`: Clean WASM API with 6 functions
- No embedded logic in HTML/CSS

### Principle V: Developer Experience ✅
**Status**: PASS (Confirmed)
**Evidence**:
- `contracts/ornament-api.md`: `resolve_ornament_attachments()` function for inspector display
- `quickstart.md`: Inspector tab usage documented (LilyPond, MusicXML, Doc Model)
- Performance logging for all WASM functions

### Principle VI: Standards Compliance ✅
**Status**: PASS (Confirmed)
**Evidence**:
- `data-model.md`: Follows existing `SlurIndicator` pattern for `OrnamentIndicator`
- `research.md`: UnoCSS utility classes identified for styling
- Rust domain-driven design maintained

### Principle VII: No Fallbacks ✅
**Status**: PASS (Confirmed)
**Evidence**:
- `contracts/ornament-api.md`: All 6 functions implemented in Rust/WASM
- `data-model.md`: JavaScript only manages UI state (edit mode flag), all logic in WASM
- No degraded behavior or JavaScript fallbacks

### Principle VIII: MusicXML First ✅
**Status**: PASS (Confirmed)
**Evidence**:
- `research.md`: Decision #6 - MusicXML `<grace/>` element mapping designed
- `contracts/ornament-api.md`: `export_to_musicxml()` function with placement attributes
- `quickstart.md`: MusicXML export examples provided

### Principle IX: Export Strategy ✅
**Status**: PASS (Confirmed)
**Evidence**:
- `research.md`: Decision #7 - Use existing MusicXML→LilyPond converter
- `contracts/ornament-api.md`: `export_to_lilypond()` wraps converter
- Leverage ecosystem tools (no parallel exporter)

**Post-Design Assessment**: ALL GATES STILL PASS. No violations introduced during design phase. Ready for Phase 2 (Tasks).

## Project Structure

### Documentation (this feature)

```
specs/006-music-notation-ornament/
├── spec.md              # Feature specification (input)
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
│   └── ornament-api.md  # WASM API contract for ornament operations
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

**Structure Decision**: Single project structure (WASM module + JavaScript host). This is a web application with Rust/WASM for performance-critical operations and JavaScript for UI orchestration.

```
src/
├── models/
│   ├── core.rs                  # Cell struct (modify: add ornament rendering fields)
│   ├── elements.rs              # OrnamentIndicator enum (MODIFY: expand to 6 variants)
│   ├── notation.rs              # Musical notation models
│   └── pitch.rs                 # Pitch representation
├── parse/
│   ├── tokens.rs                # Token parsing (MODIFY: add ornament syntax parsing)
│   ├── grammar.rs               # Grammar parsing
│   └── beats.rs                 # Beat derivation (MODIFY: exclude ornaments)
├── renderers/
│   ├── layout_engine.rs         # Layout calculations (MODIFY: add attachment resolution, collision detection)
│   ├── display_list.rs          # Display list rendering
│   └── musicxml/
│       ├── export.rs            # MusicXML export (MODIFY: add grace note export)
│       └── builder.rs           # MusicXML builder utilities
├── converters/
│   └── musicxml/
│       └── musicxml_to_lilypond/
│           └── converter.rs     # MusicXML→LilyPond (MODIFY: handle grace notes)
├── html_layout/
│   ├── cell.rs                  # Cell layout (MODIFY: ornament visual styling)
│   └── document.rs              # Document layout
├── api.rs                       # WASM API (NEW: ornament operations)
└── lib.rs                       # WASM module entry

src/js/
├── editor.js                    # Core editor (MODIFY: edit mode state)
├── ui.js                        # UI components (MODIFY: keyboard shortcuts)
├── renderer.js                  # Rendering (MODIFY: visual styling toggle)
├── osmd-renderer.js             # OSMD integration
└── main.js                      # Application entry

tests/e2e-pw/tests/
├── 00-lilypond-smoke.spec.js    # LilyPond smoke test (EXISTS)
├── ornament-basic.spec.js       # NEW: Basic ornament operations
├── ornament-edit-mode.spec.js   # NEW: Edit mode toggle
├── ornament-export.spec.js      # NEW: MusicXML/LilyPond export
└── ornament-beats.spec.js       # NEW: Beat calculation exclusion

tests/e2e-pw/helpers/
└── inspectors.js                # Inspector helper utilities (EXISTS)
```

## Complexity Tracking

*Fill ONLY if Constitution Check has violations that must be justified*

**No violations detected.** All constitutional principles satisfied.
