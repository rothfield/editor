# Research & Design Decisions: Music Notation Ornament Support

**Feature**: 006-music-notation-ornament
**Date**: 2025-10-26
**Status**: Complete

## Overview

This document captures design decisions for implementing WYSIWYG ornament styling. Ornaments follow the same "select and apply" pattern as slurs and octaves.

---

## Decision #1: Selection Model

**Question**: How should ornaments be applied to cells?

**Decision**: Use existing "select and apply" pattern (same as slurs)

**Rationale**:
- Slurs already implement this pattern successfully
- Users select cells → Press keyboard shortcut or menu item → WASM function modifies cells
- Code path: `ui.js → editor.js → wasm-integration.js → api.rs`
- Consistent UX across all similar features (slurs, octaves, ornaments)

**Implementation**:
```javascript
// JavaScript (editor.js)
async applyOrnament(positionType = 'after') {
  const cells = await wasmModule.applyOrnament(
    this.cells,
    this.selectionStart,
    this.selectionEnd,
    positionType  // 'before', 'after', or 'top'
  );
  this.cells = cells;
  this.render();
}
```

```rust
// Rust (api.rs)
#[wasm_bindgen]
pub fn apply_ornament(
    cells_json: &str,
    start: usize,
    end: usize,
    position_type: &str,  // "before", "after", or "top"
) -> String {
    // Set ornament indicators on selected cells
    // Return modified cells as JSON
}
```

**Alternatives Considered**:
- ❌ Delimiter syntax (`<234>`) - rejected because spec explicitly says NO syntax
- ❌ Right-click context menu - rejected for keyboard-only interaction constraint

---

## Decision #2: Edit Mode Mechanics

**Question**: How do ornamental cells "leave the editable text flow" while staying in the document?

**Decision**: Render filtering + CSS positioning

**Rationale**:
- Cells remain in the `cells` array at all times
- When rendering:
  - **Normal mode** (`editMode: false`): Filter out ornamental cells from main line rendering, render them separately as positioned overlays
  - **Edit mode** (`editMode: true`): Render ornamental cells inline like normal cells
- No data transformation when toggling modes (cells unchanged)
- Simple boolean flag controls rendering behavior

**Implementation**:
```javascript
// renderer.js
renderLine(cells, editMode) {
  if (editMode) {
    // Render all cells inline (including ornaments)
    return this.renderAllCellsInline(cells);
  } else {
    // Split: main cells vs ornamental cells
    const mainCells = cells.filter(c => c.ornament_indicator === 'None');
    const ornamentCells = cells.filter(c => c.ornament_indicator !== 'None');

    // Render main line normally
    const mainHTML = this.renderAllCellsInline(mainCells);

    // Render ornaments as absolute-positioned overlays
    const ornamentHTML = this.renderOrnamentOverlays(ornamentCells);

    return mainHTML + ornamentHTML;
  }
}
```

**Alternatives Considered**:
- ❌ Physically remove cells from array - rejected because data loss risk, complex undo
- ❌ Separate ornament array - rejected because violates single source of truth

---

## Decision #3: Attachment Algorithm

**Question**: How to determine which cell an ornament "attaches to" for positioning?

**Decision**: Position-based proximity rules (computed at render time)

**Rules**:
1. **Before ornaments** → attach to first NON-ornamental cell to the RIGHT
2. **After ornaments** → attach to first NON-ornamental cell to the LEFT
3. **Top ornaments** → attach to NEAREST NON-ornamental cell (left or right, whichever is closer)

**Rationale**:
- Simple, deterministic algorithm
- No ambiguity about attachment
- Handles edge cases (ornaments at start/end of line)
- Orphaned ornaments (no nearby cell) logged as warning, skipped from rendering

**Implementation** (WASM):
```rust
struct OrnamentSpan {
    start_idx: usize,
    end_idx: usize,
    position_type: OrnamentPositionType,  // Before/After/Top
}

fn resolve_attachments(cells: &[Cell]) -> HashMap<usize, Vec<OrnamentSpan>> {
    // 1. Extract ornament spans from cells
    // 2. For each span, find anchor cell index using rules above
    // 3. Group spans by anchor index
    // Returns: HashMap<anchor_cell_index, ornament_spans>
}
```

**Alternatives Considered**:
- ❌ Explicit parent_id field - rejected because violates "no explicit ownership" principle from spec
- ❌ User-specified attachment - rejected for complexity, not in spec requirements

---

## Decision #4: Collision Detection

**Question**: How to prevent overlapping floating ornaments?

**Decision**: Two-pass layout with horizontal spacing injection

**Algorithm**:
1. **Pass 1**: Position all ornaments at zero width (floating over anchors)
2. **Collision check**: Compare bounding boxes of all ornament groups
3. **Pass 2**: If collision detected, add horizontal spacing to shift subsequent cells right

**Rationale**:
- Simple two-pass approach meets performance target (<100ms for 1000 cells)
- Only adds spacing when necessary (preserves compact layout)
- Max 2 iterations prevents infinite loops

**Implementation**:
```rust
fn layout_with_collision_detection(cells: &[Cell], attachments: &AttachmentMap) -> Vec<BoundingBox> {
    // Pass 1: Initial layout (ornaments at zero width)
    let mut bboxes = compute_initial_layout(cells, attachments);

    // Check for collisions
    let collisions = detect_collisions(&bboxes);

    if !collisions.is_empty() {
        // Pass 2: Add spacing to resolve collisions
        bboxes = add_spacing_for_collisions(bboxes, collisions);
    }

    bboxes
}
```

**Alternatives Considered**:
- ❌ Always add spacing - rejected because wastes horizontal space
- ❌ Vertical offset on collision - rejected because changes visual appearance unpredictably

---

## Decision #5: MusicXML Mapping

**Question**: How to represent before/after/top positions in MusicXML?

**Decision**: Use `placement` attribute + element ordering

**MusicXML representation**:
- **Before ornaments**: `<grace/>` elements BEFORE main `<note>` element, `placement="above"`
- **After ornaments**: `<grace/>` elements AFTER main `<note>` element (acciaccatura), `placement="above"`
- **Top ornaments**: `<grace/>` elements BEFORE main note, `placement="above"` (same as before)

**Rationale**:
- MusicXML `<grace/>` element is standard for grace notes
- Element ordering (before/after main note) conveys timing
- `placement` attribute indicates visual positioning
- Full roundtrip fidelity achievable

**Limitations**:
- MusicXML doesn't distinguish "top" from "before" explicitly (both use placement="above")
- On import, "top" ornaments will be interpreted as "before" ornaments
- Acceptable loss per spec: "export as best as possible given format capabilities"

**Implementation**:
```rust
fn export_ornaments_to_musicxml(cell: &Cell, ornaments: &[OrnamentSpan]) -> String {
    let mut xml = String::new();

    // Export "before" ornaments
    for span in ornaments.iter().filter(|s| s.position_type == Before) {
        xml.push_str("<grace/>");
        xml.push_str(&export_pitch(span.cells[0]));
    }

    // Export main note
    xml.push_str("<note>");
    xml.push_str(&export_pitch(cell));
    xml.push_str("</note>");

    // Export "after" ornaments (acciaccatura)
    for span in ornaments.iter().filter(|s| s.position_type == After) {
        xml.push_str("<grace slash=\"yes\"/>");
        xml.push_str(&export_pitch(span.cells[0]));
    }

    xml
}
```

**Alternatives Considered**:
- ❌ Custom XML extension - rejected because breaks MusicXML compatibility
- ❌ Don't export position type - rejected because loses user intent

---

## Decision #6: Performance Strategy

**Question**: Can WASM meet performance targets?

**Decision**: Yes, with optimizations

**Performance targets**:
- Attachment resolution: < 10ms for 1000 cells
- Layout computation: < 100ms for 1000 cells
- Edit mode toggle: < 2s for 1000 cells

**Optimizations**:
1. **Lazy evaluation**: Only compute attachments when rendering (not on every keystroke)
2. **Caching**: Cache attachment map when edit mode is OFF (no changes to ornament structure)
3. **SIMD-friendly**: Use Vec operations for collision detection (batch processing)
4. **Early exit**: Stop layout passes if no collisions detected

**Benchmarking plan**:
- Synthetic test: 1000 cells, 100 ornaments (10% ornament density)
- Measure each phase: attachment (target <10ms), layout (target <100ms), render (target <1.9s total)
- Log performance warnings if targets missed

**Alternatives Considered**:
- ❌ JavaScript implementation - rejected because fails Performance First principle
- ❌ Web Workers - rejected because over-engineering for current scope

---

## Decision #7: Visual Styling

**Question**: How to style ornamental cells?

**Decision**: CSS classes + inline styles

**Styling**:
```css
.ornament-cell {
  font-size: 0.75em;           /* 75% of normal size */
  vertical-align: super;        /* Raised above baseline */
  position: relative;
  top: -0.3em;                  /* Additional vertical offset */
  color: #6366f1;               /* Indigo-500 */
}

.ornament-cell[data-edit-mode="true"] {
  /* In edit mode: normal horizontal spacing */
  display: inline-block;
}

.ornament-cell[data-edit-mode="false"] {
  /* In normal mode: zero width (absolute positioning handled separately) */
  position: absolute;
  width: 0;
}
```

**Rationale**:
- UnoCSS utility classes for consistency
- CSS handles visual presentation (WASM handles logic)
- `data-edit-mode` attribute controls layout strategy
- Indigo color provides visual distinction without being distracting

**Alternatives Considered**:
- ❌ SVG rendering - rejected because Text-based cells use DOM, not SVG
- ❌ Canvas rendering - rejected for same reason

---

## Decision #8: Remove Existing Delimiter Parsing

**Question**: What to do with existing `mark_ornament_spans()` in grammar.rs?

**Decision**: Delete it

**Rationale**:
- Current implementation parses `<234>` syntax
- Spec explicitly says NO syntax (WYSIWYG only)
- Keeping both approaches creates confusion
- Delete `mark_ornament_spans()` function entirely
- Remove delimiter parsing from tokenizer

**Migration strategy**:
1. Comment out `mark_ornament_spans()` call in parser
2. Verify no tests break
3. Delete function
4. Remove from exports

**Alternatives Considered**:
- ❌ Keep both (delimiter shortcut + WYSIWYG) - rejected because spec says NO syntax
- ❌ Add flag to enable/disable - rejected because over-engineering

---

## Summary of Decisions

| # | Topic | Decision |
|---|-------|----------|
| 1 | Selection Model | Use "select and apply" pattern (like slurs) |
| 2 | Edit Mode | Render filtering + CSS (no data transformation) |
| 3 | Attachment | Position-based proximity rules (computed at render) |
| 4 | Collision | Two-pass layout with horizontal spacing injection |
| 5 | MusicXML | Use `<grace/>` with `placement` attribute + ordering |
| 6 | Performance | WASM with lazy evaluation, caching, batch processing |
| 7 | Visual Styling | CSS classes (75% size, raised, indigo color) |
| 8 | Existing Code | Delete delimiter parsing from grammar.rs |

---

## Open Questions

None - all design decisions resolved.

---

## Next Steps

1. ✅ Research complete
2. ⏳ Generate `data-model.md` (Phase 1)
3. ⏳ Generate `contracts/` (Phase 1)
4. ⏳ Generate `quickstart.md` (Phase 1)
5. ⏳ Run `/speckit.tasks` (Phase 2)
