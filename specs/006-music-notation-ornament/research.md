# Research: Music Notation Ornament Support

**Feature**: 006-music-notation-ornament
**Date**: 2025-10-25
**Phase**: 0 (Research & Resolution)

## Research Questions

This document resolves all "NEEDS CLARIFICATION" items from the Technical Context and addresses key technical unknowns from the feature specification.

---

## 1. OrnamentIndicator Enum Design Pattern

**Question**: How should the six ornament indicator variants be structured to match the existing SlurIndicator pattern while encoding position type implicitly?

**Research Findings**:
- **Current Pattern**: `SlurIndicator` has 3 variants: `None=0`, `SlurStart=1`, `SlurEnd=2`
- **Current Ornament**: `OrnamentIndicator` has 3 variants: `None=0`, `OrnamentStart=1`, `OrnamentEnd=2`
- **Required Change**: Expand to 6 paired variants encoding position type implicitly

**Decision**: Expand `OrnamentIndicator` enum with explicit position encoding in variant names:
```rust
#[repr(u8)]
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum OrnamentIndicator {
    None = 0,

    // Before-position ornaments (attach to first token to right)
    OrnamentBeforeStart = 1,
    OrnamentBeforeEnd = 2,

    // After-position ornaments (attach to last token to left) - DEFAULT
    OrnamentAfterStart = 3,
    OrnamentAfterEnd = 4,

    // Top-position ornaments (attach to nearest token)
    OrnamentOnTopStart = 5,
    OrnamentOnTopEnd = 6,
}
```

**Rationale**:
- Consistent with existing indicator pattern (start/end pairs)
- Position type encoded in variant name (no separate field needed)
- Numeric values assigned sequentially for efficient serialization
- `None=0` for default/no-ornament case
- After-position uses values 3-4 for default positioning (most common)

**Alternatives Considered**:
- ❌ **Separate position enum**: Adds complexity, violates "position is implicit" principle
- ❌ **Single Start/End with position field**: Requires additional data storage, breaks indicator pattern
- ✅ **Chosen approach**: Minimal changes, follows existing patterns, self-documenting

---

## 2. Ornament Syntax Parsing Strategy

**Question**: What syntax should users type to create ornaments with different position types?

**Research Findings**:
- **Existing Patterns**: Slurs use `(` and `)` indicators applied to selection
- **Spec Guidance**: "Ornaments are tokens in linear sequence" - suggests inline syntax, not selection-based
- **User Mental Model**: Grace notes written *before* or *after* main notes in traditional notation

**Decision**: Use marker-based inline syntax with position indicators:
```
Before:  <234> 1      # Grace notes 2,3,4 before note 1
After:   1 >234<      # Grace notes 2,3,4 after note 1
OnTop:   ^234^ 1      # Grace notes 2,3,4 on top of note 1
```

**Syntax Design**:
- `<...>` - Before-ornaments (points right toward anchor)
- `>...<` - After-ornaments (points left toward anchor)
- `^...^` - OnTop-ornaments (points up/down)
- Content between markers: pitched tokens (same syntax as main notes)

**Rationale**:
- Visual directionality matches attachment semantics
- Inline typing workflow (no mode switching)
- Symmetric markers make spans clear
- Consistent with existing pitch syntax (numbers, letters, accidentals)

**Alternatives Considered**:
- ❌ **Selection-based commands**: Inconsistent with "tokens in stream" model
- ❌ **Single-character markers**: Insufficient distinctiveness (e.g., `,` ambiguous)
- ❌ **Keyword syntax** (`grace:234`): Verbose, disrupts typing flow
- ✅ **Chosen approach**: Intuitive, efficient, visually distinct

---

## 3. Attachment Resolution Algorithm

**Question**: How should the system determine which token an ornament attaches to when multiple tokens are nearby?

**Research Findings**:
- **Spec Definition**: "Before→first token to right, After→last token to left, Top→nearest token"
- **Edge Cases**: Orphaned ornaments, non-pitched anchors, multiple ornaments per position
- **Performance**: Must execute in < 10ms for up to 1000 cells

**Decision**: Implement deterministic single-pass algorithm in Rust (WASM):

```rust
pub struct AttachmentResolver {
    // Grouping: Map<anchor_index, OrnamentGroups>
    // OrnamentGroups: { before: Vec<Cell>, after: Vec<Cell>, top: Vec<Cell> }
}

impl AttachmentResolver {
    pub fn resolve(cells: &[Cell]) -> HashMap<usize, OrnamentGroups> {
        // 1. Identify ornament spans (scan for indicator pairs)
        // 2. For each span, determine position type from indicator variant
        // 3. Apply attachment rule based on position:
        //    - Before: find first non-ornament token to RIGHT
        //    - After: find first non-ornament token to LEFT
        //    - Top: find NEAREST non-ornament token (left or right)
        // 4. Group ornaments by anchor index
        // 5. Return grouped map for rendering/export
    }
}
```

**Attachment Rules**:
- **Before-ornaments**: Scan right from `OrnamentBeforeEnd`, attach to first non-ornament token
- **After-ornaments**: Scan left from `OrnamentAfterStart`, attach to first non-ornament token
- **Top-ornaments**: Scan both directions, attach to nearest; if equidistant, prefer left
- **Orphaned ornaments**: No anchor found → render inline at token position, log warning

**Rationale**:
- Deterministic (same input always produces same output)
- Single-pass O(n) complexity
- No backtracking or complex heuristics
- Clear error handling for edge cases

**Alternatives Considered**:
- ❌ **Heuristic-based**: Non-deterministic, hard to test
- ❌ **Machine learning**: Overkill, performance overhead
- ❌ **User-specified anchors**: Violates "implicit attachment" principle
- ✅ **Chosen approach**: Simple, fast, predictable

---

## 4. Beat Derivation Exclusion Strategy

**Question**: How should ornaments be excluded from beat subdivision calculations without breaking existing beat derivation logic?

**Research Findings**:
- **Existing Code**: `src/parse/beats.rs` contains beat derivation logic
- **Current Model**: Beats derived from contiguous temporal elements
- **Spec Requirement**: "Ornaments are rhythm-transparent and NOT counted in beat subdivision"

**Decision**: Add `is_rhythm_transparent()` predicate to Cell model:

```rust
impl Cell {
    pub fn is_rhythm_transparent(&self) -> bool {
        // Check if cell is part of ornament span
        match self.ornament_indicator {
            OrnamentIndicator::None => false,
            OrnamentIndicator::OrnamentBeforeStart
            | OrnamentIndicator::OrnamentBeforeEnd
            | OrnamentIndicator::OrnamentAfterStart
            | OrnamentIndicator::OrnamentAfterEnd
            | OrnamentIndicator::OrnamentOnTopStart
            | OrnamentIndicator::OrnamentOnTopEnd => true,
        }
    }
}
```

**Modify Beat Derivation**:
```rust
// In src/parse/beats.rs
fn derive_beats(cells: &[Cell]) -> Vec<Beat> {
    let rhythmic_cells: Vec<&Cell> = cells
        .iter()
        .filter(|c| !c.is_rhythm_transparent())  // <-- NEW: exclude ornaments
        .collect();

    // Existing beat derivation logic operates on rhythmic_cells only
    // ...
}
```

**Rationale**:
- Minimal changes to existing beat derivation code
- Clear predicate method for reuse in other contexts (MusicXML export, MIDI generation)
- Ornament cells simply skipped in beat counting
- No special cases or complex logic

**Alternatives Considered**:
- ❌ **Separate ornament data structure**: Violates "tokens in stream" model
- ❌ **Post-processing removal**: Inefficient, error-prone
- ❌ **Duration=0 hack**: Confuses semantics (ornaments have no duration vs. zero duration)
- ✅ **Chosen approach**: Clean, self-documenting, performant

---

## 5. Collision Detection Algorithm

**Question**: How should the system detect and resolve ornament collisions when edit mode is OFF (floating layout)?

**Research Findings**:
- **Spec Requirement**: "Add horizontal spacing when ornaments collide" (FR-004b)
- **Layout Constraints**: Ornaments use zero horizontal width by default (float above)
- **Performance Target**: < 100ms rendering update

**Decision**: Implement bounding-box collision detection in layout engine:

```rust
pub struct CollisionResolver {
    // After initial layout pass, check ornament bounding boxes
    // If overlapping, insert horizontal spacing
}

impl CollisionResolver {
    pub fn resolve_collisions(layout: &mut LayoutData) {
        // 1. Collect all ornament bounding boxes with positions
        // 2. Sort by horizontal position (x-coordinate)
        // 3. Check adjacent boxes for overlap (x + width > next_x)
        // 4. If collision detected:
        //    - Calculate required spacing (overlap + margin)
        //    - Shift subsequent elements right
        //    - Recompute bounding boxes
        // 5. Repeat until no collisions (max 2 passes expected)
    }
}
```

**Collision Criteria**:
- Two ornaments collide if their bounding boxes overlap horizontally
- Margin: 2px minimum spacing between ornaments
- Only applies when edit mode is OFF (inline mode has natural spacing)

**Rationale**:
- Standard graphics technique (bounding box overlap)
- Efficient for small numbers of ornaments (typically 2-5 per note)
- Progressive refinement (most cases resolve in one pass)

**Alternatives Considered**:
- ❌ **Fixed spacing**: Wastes space when no collisions
- ❌ **Manual user adjustment**: Poor UX, violates automatic layout principle
- ❌ **No collision detection**: Overlapping ornaments unreadable
- ✅ **Chosen approach**: Automatic, efficient, predictable

---

## 6. MusicXML Grace Note Export Mapping

**Question**: How should the three position types (before/after/top) map to MusicXML placement attributes?

**Research Findings**:
- **MusicXML Spec**: `<grace/>` element for grace notes, optional `placement` attribute
- **Placement Values**: `above`, `below` (relative to staff)
- **Limitation**: MusicXML does not distinguish "before" vs "after" placement explicitly

**Decision**: Export all ornaments as `<grace/>` elements with placement hints:

```xml
<!-- Before-ornaments: placement="above", appear before main note -->
<note>
  <grace/>
  <pitch><step>C</step><octave>5</octave></pitch>
  <notations><technical><placement>above</placement></technical></notations>
</note>

<!-- After-ornaments: placement="above", use <grace slash="yes"/> for distinction -->
<note>
  <grace slash="yes"/>
  <pitch><step>D</step><octave>5</octave></pitch>
</note>

<!-- OnTop-ornaments: placement="above" (default) -->
<note>
  <grace/>
  <pitch><step>E</step><octave>5</octave></pitch>
</note>
```

**Mapping Strategy**:
- **Before** → `<grace/>` (no slash, placement above)
- **After** → `<grace slash="yes"/>` (acciaccatura notation)
- **OnTop** → `<grace/>` (default above placement)

**Rationale**:
- MusicXML standard compliance
- Before/after distinction preserved via `slash` attribute
- Sufficient for most notation software interpretation
- Acknowledges format limitations (spec: "as best as possible given MusicXML format capabilities")

**Alternatives Considered**:
- ❌ **Custom extensions**: Non-standard, breaks interoperability
- ❌ **Collapse all to single type**: Loses position information
- ❌ **Text annotations**: Fragile, not machine-readable
- ✅ **Chosen approach**: Standards-compliant, preserves essential distinction

---

## 7. LilyPond Export Strategy

**Question**: Should we implement direct LilyPond export or use MusicXML→LilyPond conversion?

**Research Findings**:
- **Constitution Principle IX**: "Prefer using existing MusicXML → format converters"
- **Existing Codebase**: `src/converters/musicxml/musicxml_to_lilypond/` already exists
- **LilyPond Grace Notes**: Uses `\grace`, `\acciaccatura`, `\appoggiatura` syntax

**Decision**: Use existing MusicXML→LilyPond converter; enhance if needed

**Approach**:
1. Export ornaments to MusicXML (Phase 1 implementation)
2. Use existing converter: `src/converters/musicxml/musicxml_to_lilypond/converter.rs`
3. Verify converter handles `<grace/>` elements correctly
4. If conversion loses position information, add minimal enhancements to converter

**LilyPond Mapping** (if direct enhancement needed):
```lilypond
% Before-ornaments
\grace { c'16 d' e' } f'4

% After-ornaments (use acciaccatura notation)
f'4 \acciaccatura { c'16 d' }

% OnTop-ornaments (use appoggiatura)
\appoggiatura { e'8 } f'4
```

**Rationale**:
- Leverages existing infrastructure
- Reduces maintenance burden (single MusicXML exporter)
- Aligns with constitution (ecosystem tools)
- Fallback: enhance converter if needed, not build parallel exporter

**Alternatives Considered**:
- ❌ **Parallel direct exporter**: Maintenance burden, code duplication
- ❌ **No LilyPond support**: Limits usefulness
- ✅ **Chosen approach**: Pragmatic, maintainable, extensible

---

## 8. Edit Mode Toggle Implementation

**Question**: How should edit mode state be managed without duplicating layout logic?

**Research Findings**:
- **Spec Requirement**: "Edit mode is display-only toggle, NOT data transformation" (FR-009a)
- **Performance Target**: < 2s mode transition, no flickering (SC-007, SC-009)
- **State Management**: JavaScript handles UI state; WASM computes layout

**Decision**: Add `edit_mode` parameter to WASM layout functions:

```rust
// In src/api.rs (WASM API)
#[wasm_bindgen]
pub fn compute_layout(cells_json: &str, edit_mode: bool) -> String {
    let cells: Vec<Cell> = serde_json::from_str(cells_json).unwrap();
    let layout = if edit_mode {
        layout_engine::compute_inline_layout(&cells)  // Normal spacing
    } else {
        layout_engine::compute_floating_layout(&cells) // Zero-width ornaments
    };
    serde_json::to_string(&layout).unwrap()
}
```

**JavaScript State Management**:
```javascript
// In src/js/editor.js
class Editor {
    constructor() {
        this.ornamentEditMode = false; // State flag
    }

    toggleOrnamentEditMode() {
        this.ornamentEditMode = !this.ornamentEditMode;
        this.recomputeLayout(); // Triggers WASM with new mode
        this.render();
    }
}
```

**Rationale**:
- Single source of truth (WASM computes layout based on mode parameter)
- No data modification (cells unchanged, only layout strategy differs)
- Efficient (layout recomputation in WASM, < 10ms for 1000 cells)
- Clean separation (JavaScript UI state, Rust layout logic)

**Alternatives Considered**:
- ❌ **Duplicate layout logic in JavaScript**: Violates Performance First
- ❌ **Store mode in Cell data**: Violates "display-only toggle" requirement
- ❌ **CSS-only toggle**: Insufficient for dynamic collision detection
- ✅ **Chosen approach**: Clean architecture, performant, maintainable

---

## 9. Visual Styling Parameters

**Question**: What exact CSS/styling parameters achieve ~75% size and 70-125% baseline positioning?

**Research Findings**:
- **Spec Requirement**: "~75% size, 70%-125% above baseline, superscript-like" (FR-004)
- **Existing Styles**: UnoCSS utility classes for font sizing and positioning
- **Browser Compatibility**: `vertical-align` and `font-size` universally supported

**Decision**: Use inline style attributes for ornament cells:

```css
/* Ornament cell styling (applied dynamically) */
.ornament-cell {
    font-size: 0.75em;           /* 75% of parent font size */
    vertical-align: super;        /* Superscript positioning */
    color: #6366f1;              /* Indigo-500 for visual distinction */
    position: relative;
    top: -0.3em;                 /* Fine-tune vertical position */
}

/* Edit mode OFF: zero width (floating) */
.ornament-cell.floating {
    position: absolute;
    width: 0;
    overflow: visible;
}

/* Edit mode ON: normal width (inline) */
.ornament-cell.inline {
    display: inline-block;
    width: auto;
}
```

**UnoCSS Classes**:
```
text-xs text-indigo-500 align-super relative -top-1
```

**Rationale**:
- Standard CSS properties (no browser-specific hacks)
- Dynamic class toggling for edit mode
- Color distinction aids readability
- Vertical positioning tuned for 16pt typeface

**Alternatives Considered**:
- ❌ **Fixed pixel sizes**: Breaks at different zoom levels
- ❌ **Transform scaling**: Affects layout unpredictably
- ❌ **SVG rendering**: Overkill for text
- ✅ **Chosen approach**: Simple, reliable, accessible

---

## 10. Performance Validation Strategy

**Question**: How will we validate that ornament operations meet performance targets?

**Research Findings**:
- **Targets**: < 16ms keyboard latency, < 10ms beat derivation, < 100ms rendering
- **Existing Infrastructure**: `src/utils/performance.rs` for WASM timing
- **Testing Framework**: Playwright E2E tests

**Decision**: Add performance assertions to E2E tests:

```javascript
// In tests/e2e-pw/tests/ornament-performance.spec.js
test('ornament rendering meets performance targets', async ({ page }) => {
    await page.goto('/');

    // Generate large document (1000 cells with 100 ornaments)
    const largeSample = generateLargeDocument(1000, 100);

    // Measure layout computation time
    const start = performance.now();
    await page.evaluate((text) => {
        window.editor.setText(text);
    }, largeSample);
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(100); // < 100ms rendering target
});
```

**WASM Performance Logging**:
```rust
// In src/utils/performance.rs
pub fn log_performance(operation: &str, duration_ms: f64) {
    if duration_ms > 10.0 {
        web_sys::console::warn_1(&format!(
            "⚠️ {} took {:.2}ms (target: < 10ms)",
            operation, duration_ms
        ).into());
    }
}
```

**Rationale**:
- Automated validation (no manual timing)
- Regression detection (tests fail if performance degrades)
- Real-world scenarios (large documents)

**Alternatives Considered**:
- ❌ **Manual timing**: Error-prone, not reproducible
- ❌ **Microbenchmarks only**: Miss integration overhead
- ❌ **No performance tests**: Can't catch regressions
- ✅ **Chosen approach**: Comprehensive, automated, realistic

---

## Summary of Decisions

| Research Area | Decision | Rationale |
|---------------|----------|-----------|
| **Indicator Enum** | 6 variants with explicit position names | Follows existing pattern, self-documenting |
| **Syntax** | Marker-based inline (`<...>`, `>...<`, `^...^`) | Intuitive directionality, efficient typing |
| **Attachment** | Single-pass deterministic algorithm | O(n) performance, predictable behavior |
| **Beat Exclusion** | `is_rhythm_transparent()` predicate | Clean, reusable, minimal code changes |
| **Collision Detection** | Bounding-box overlap with spacing insertion | Standard technique, efficient for typical cases |
| **MusicXML Export** | `<grace/>` with `slash` attribute for position | Standards-compliant, preserves distinction |
| **LilyPond Export** | Use existing MusicXML→LilyPond converter | Leverage ecosystem, reduce maintenance |
| **Edit Mode** | WASM layout parameter, JavaScript state | Clean separation, performant, no data modification |
| **Visual Styling** | 0.75em font-size, vertical-align super | Standard CSS, browser-compatible, accessible |
| **Performance** | E2E tests with timing assertions | Automated validation, regression detection |

---

## Next Steps (Phase 1: Design)

1. ✅ All technical unknowns resolved
2. → Generate `data-model.md` with concrete Rust struct definitions
3. → Generate `contracts/ornament-api.md` with WASM API signatures
4. → Generate `quickstart.md` with user-facing syntax examples
5. → Update agent context files with new technologies/patterns

**Phase 0 Complete**: Ready to proceed to Phase 1 (Design & Contracts).
