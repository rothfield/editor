# Implementation Plan: Music Notation Ornament Support

**Branch**: `006-music-notation-ornament` | **Date**: 2025-10-26 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/006-music-notation-ornament/spec.md`

## Summary

Implement WYSIWYG ornament styling feature that allows users to select cells and apply ornamental embellishment formatting via Edit menu or keyboard shortcuts (Alt-0). Ornaments use the same "select and apply" interaction pattern as slurs and octaves. When applied, selected cells receive ornament indicators, leave the editable text flow, and are rendered as visual overlays (smaller, raised, colored) with zero horizontal width. Users can toggle Edit Ornament Mode (Alt+Shift+O) to make ornaments editable again. Ornamental cells containing pitches export as MusicXML `<grace/>` elements and LilyPond `\grace {}` syntax.

**Key Distinction**: This is NOT delimiter-based syntax (no `<234>` parsing). This is UI-driven selection and styling, similar to applying bold/italic in a word processor.

## Technical Context

**Language/Version**: Rust 1.75+ (WASM module) + JavaScript ES2022+ (host application)
**Primary Dependencies**: wasm-bindgen 0.2.92, OSMD 1.7.6, UnoCSS (styling)
**Storage**: JSON file format for document persistence
**Testing**: Playwright (headless E2E tests in Docker)
**Target Platform**: Modern web browsers with WASM support
**Project Type**: Single web application (editor POC)
**Performance Goals**: <16ms keyboard latency (60fps), <100ms layout computation, <2s edit mode toggle for 1000 cells
**Constraints**: Single-line editor, 16-point typeface, keyboard-only interaction (Cell editor), up to 1000 cells per document
**Scale/Scope**: POC feature affecting ~500 LOC Rust (WASM), ~300 LOC JavaScript (UI), 5-7 E2E tests

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### ✓ Performance First (Principle I)
- **Status**: PASS
- Layout computation (attachment resolution, floating positioning, collision detection) implemented in Rust/WASM
- JavaScript handles only UI orchestration (menu commands, keyboard shortcuts, mode toggle)

### ✓ Test-Driven Development (Principle II - NON-NEGOTIABLE)
- **Status**: PASS
- E2E tests written BEFORE implementation
- Tests execute through compiled WASM module (full integration)
- Tests run in Docker for cross-platform compatibility

### ✓ User Experience Focus (Principle III)
- **Status**: PASS
- Focus returns to editor after menu operations
- Keyboard shortcuts (Alt-0, Alt+Shift+O) for all operations
- Edit mode toggle completes in <2s for 1000 cells

### ✓ Clean Architecture (Principle IV)
- **Status**: PASS
- No embedded JavaScript/CSS in HTML
- Rust modules organized: models/, parse/, renderers/, api.rs
- JavaScript organized: editor.js, ui.js, renderer.js

### ✓ Developer Experience (Principle V)
- **Status**: PASS
- Inspector tabs display ornament data (LilyPond, MusicXML, Document Model, WASM Layout)
- Performance logging for layout computation
- Console error/log tabs for debugging

### ✓ Standards Compliance (Principle VI)
- **Status**: PASS
- Follows existing file structure
- UnoCSS for styling
- ES6+ JavaScript with proper error handling

### ✓ No Fallbacks (Principle VII - NON-NEGOTIABLE)
- **Status**: PASS
- No JavaScript fallback for attachment resolution or layout computation
- WASM handles all ornament-specific logic
- Proper WASM implementation required

### ✓ MusicXML First (Principle VIII)
- **Status**: PASS
- Ornaments map cleanly to MusicXML `<grace/>` elements
- Export includes placement attributes for position types (before/after/top)
- Full roundtrip fidelity for ornament data

### ✓ Export Strategy (Principle IX)
- **Status**: PASS
- MusicXML as primary export target
- LilyPond export uses existing MusicXML→LilyPond converter
- Direct LilyPond export only if converter limitations found

**Overall Gate Status**: ✅ PASS - All constitutional principles satisfied

## Project Structure

### Documentation (this feature)

```
specs/006-music-notation-ornament/
├── spec.md              # Feature specification (corrected: WYSIWYG, no delimiters)
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (design decisions)
├── data-model.md        # Phase 1 output (entities, fields, relationships)
├── quickstart.md        # Phase 1 output (usage examples)
├── contracts/           # Phase 1 output (API specifications)
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```
src/
├── models/
│   ├── core.rs              # Cell data structure (add ornament_indicator field if missing)
│   └── elements.rs          # OrnamentIndicator enum (6 variants: BeforeStart/End, AfterStart/End, OnTopStart/End)
├── renderers/
│   └── layout_engine.rs     # NEW: Attachment resolution, floating layout, collision detection
├── js/
│   ├── editor.js            # MODIFY: Add ornamentEditMode state, toggleOrnamentEditMode()
│   ├── ui.js                # MODIFY: Add menu items (Edit → Ornament, Ornament Before, Ornament Top), keyboard shortcuts (Alt-0, Alt+Shift+O)
│   └── renderer.js          # MODIFY: Render ornamental cells with visual styling (75% size, raised, indigo color)
├── api.rs                   # WASM API: expose layout functions, selection operations
└── html_layout/
    └── cell.rs              # MODIFY: Cell rendering with ornament visual styles

tests/e2e-pw/tests/
├── ornament-selection.spec.js    # NEW: Select cells, apply ornament, verify indicators
├── ornament-rendering.spec.js    # NEW: Verify visual styling, floating layout
├── ornament-edit-mode.spec.js    # NEW: Toggle mode, verify editability
├── ornament-export.spec.js       # NEW: MusicXML/LilyPond export verification
└── ornament-beats.spec.js        # NEW: Verify rhythm-transparent behavior
```

**Structure Decision**: Single project (music notation editor POC). Follows existing organization with models in Rust, UI in JavaScript. New layout_engine.rs module handles ornament-specific rendering logic in WASM for performance.

## Complexity Tracking

*No violations - all constitution principles satisfied*

## Phase 0: Research & Design Decisions

**Goal**: Resolve all technical unknowns and document design decisions

### Research Topics

1. **Selection Model**: How do slurs currently work? (same "select and apply" pattern)
2. **Edit Mode Mechanics**: How to remove cells from editable flow while preserving them?
3. **Attachment Algorithm**: Rules for determining which cell an ornament attaches to
4. **Collision Detection**: Algorithm for detecting floating ornament overlaps
5. **MusicXML Mapping**: How to represent before/after/top positions in MusicXML
6. **Performance**: Can layout computation meet <100ms target for 1000 cells?

**Output**: research.md with decisions, rationale, and alternatives considered

## Phase 1: Data Model & Contracts

**Prerequisites**: research.md complete

### Data Model Entities

**Output file**: `data-model.md`

1. **Cell** (existing, MODIFY)
   - Fields: add/verify `ornament_indicator: OrnamentIndicator`
   - Methods: `is_rhythm_transparent()` returns `!matches!(ornament_indicator, OrnamentIndicator::None)`

2. **OrnamentIndicator** (enum, existing or NEW)
   - Variants: `None`, `OrnamentBeforeStart`, `OrnamentBeforeEnd`, `OrnamentAfterStart`, `OrnamentAfterEnd`, `OrnamentOnTopStart`, `OrnamentOnTopEnd`
   - Methods: `is_start()`, `is_end()`, `position_type()`, `matches()`

3. **OrnamentSpan** (ephemeral, NEW)
   - Fields: `cells: Vec<Cell>`, `position_type: OrnamentPositionType`, `start_idx: usize`, `end_idx: usize`
   - Purpose: Runtime structure for attachment resolution

4. **AttachmentMap** (ephemeral, NEW)
   - Type: `HashMap<usize, OrnamentGroups>` (maps anchor cell index to its ornaments)
   - Purpose: Groups ornament spans by their attachment target

### API Contracts

**Output directory**: `contracts/`

#### JavaScript API (src/js/)

**File**: `contracts/ornament-ui-api.md`

- `applyOrnament(positionType: 'before' | 'after' | 'top'): void` - Apply ornament styling to selected cells
- `removeOrnament(): void` - Remove ornament styling from selected cells
- `toggleOrnamentEditMode(): void` - Toggle edit mode on/off

#### WASM API (src/api.rs)

**File**: `contracts/ornament-wasm-api.md`

- `#[wasm_bindgen] pub fn compute_ornament_layout(cells_json: &str, edit_mode: bool) -> String`
- `#[wasm_bindgen] pub fn resolve_ornament_attachments(cells_json: &str) -> String`
- `#[wasm_bindgen] pub fn export_to_musicxml(cells_json: &str) -> String` (MODIFY: handle ornaments)
- `#[wasm_bindgen] pub fn derive_beats(cells_json: &str) -> String` (MODIFY: exclude ornaments)

### Usage Examples

**Output file**: `quickstart.md`

**Example 1**: Apply ornament to notes
```javascript
// User types: 2 3 4 1
// User selects cells 0-2 (notes 2, 3, 4)
editor.setSelection(0, 2);
editor.applyOrnament('before'); // Apply "before" ornament
// Result: Cells 0-2 get OrnamentBeforeStart/End indicators
// Visual: 2,3,4 appear smaller, raised, colored, floating before cell 3 (note 1)
```

**Example 2**: Toggle edit mode
```javascript
// Normal mode: ornaments are visual overlays (not editable)
editor.ornamentEditMode; // false

// User presses Alt+Shift+O
editor.toggleOrnamentEditMode();
// Edit mode: ornaments return to text flow (editable)
editor.ornamentEditMode; // true

// User edits ornamental cells, then toggles again
editor.toggleOrnamentEditMode();
// Normal mode: ornaments leave flow again
editor.ornamentEditMode; // false
```

**Example 3**: Export to MusicXML
```javascript
// Cells with OrnamentBeforeStart/End indicators export as <grace/> elements
const musicxml = await wasmModule.export_to_musicxml(JSON.stringify(cells));
// Contains: <grace/><pitch><step>D</step>...</pitch></grace>
```

## Phase 2: Task Breakdown

**Note**: Task generation happens in `/speckit.tasks` command (separate from this plan).

**Expected task structure**:
- Phase 1: Setup (test infrastructure, data-testid attributes)
- Phase 2: Data model (OrnamentIndicator enum, Cell.ornament_indicator field)
- Phase 3: UI (menu items, keyboard shortcuts, selection logic)
- Phase 4: WASM layout (attachment resolution, floating positioning, collision detection)
- Phase 5: Rendering (visual styling, CSS)
- Phase 6: Edit mode (toggle mechanics, editability control)
- Phase 7: Export (MusicXML, LilyPond)
- Phase 8: E2E tests (all scenarios)
- Phase 9: Performance optimization

**Estimated effort**: 12-15 hours total implementation

## Next Steps

1. ✅ Phase 0: Generate `research.md` (resolve design decisions)
2. ⏳ Phase 1: Generate `data-model.md`, `contracts/`, `quickstart.md`
3. ⏳ Phase 1: Update agent context with new technology/dependencies
4. ⏳ Phase 2: Run `/speckit.tasks` to generate implementation tasks

---

**Plan Status**: Phase 0 research needed before proceeding to data model design
