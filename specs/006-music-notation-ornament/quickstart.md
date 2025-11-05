# Quickstart: Music Notation Ornament Support

**Feature**: 006-music-notation-ornament
**Date**: 2025-10-26

## Overview

This quickstart guide demonstrates how to use the ornament styling feature through practical examples. Ornaments follow the same "select and apply" interaction pattern as slurs and octaves.

**Key Concept**: Ornaments are a WYSIWYG styling feature (like bold/italic in a word processor), NOT delimiter-based syntax. There is NO special syntax to learn.

---

## Example 1: Basic Ornament Application

### Scenario: Create "before" ornament for grace notes

**User Actions**:
1. Type: `2 3 4 1`
2. Select cells 0-2 (the "2 3 4" portion)
3. Press `Alt+0` (or choose **Edit → Ornament**)

**JavaScript Code Equivalent**:
```javascript
// User has typed cells with content "2", "3", "4", "1"
editor.cells = [
  { char: "2", ... },
  { char: "3", ... },
  { char: "4", ... },
  { char: "1", ... }
];

// User selects cells 0-2
editor.setSelection(0, 2);

// Apply ornament (default position: "after")
await editor.applyOrnament('after');

// Internally calls WASM:
// wasmModule.apply_ornament(cells, 0, 2, "after")
```

**Result**:
- Cells 0-2 receive ornament indicators:
  - `cells[0].ornament_indicator = OrnamentAfterStart`
  - `cells[1].ornament_indicator = None` (middle cells have no indicator)
  - `cells[2].ornament_indicator = OrnamentAfterEnd`
- Cells 0-2 **leave the editable text flow**
- Visually: "2 3 4" appear smaller (75%), raised, colored indigo, positioned after cell 2

**Data Structure**:
```json
[
  { "char": "2", "ornament_indicator": "OrnamentAfterStart" },
  { "char": "3", "ornament_indicator": "None" },
  { "char": "4", "ornament_indicator": "OrnamentAfterEnd" },
  { "char": "1", "ornament_indicator": "None" }
]
```

**Visual Rendering** (normal mode):
```
Main text flow: [1]
Floating overlay: ²³⁴ (rendered as visual decoration after cell 2, before cell 3)
```

---

## Example 2: Position Types (Before/After/Top)

### Scenario: Apply different position types

**Before Ornament** (typical grace notes):
```javascript
// User types: a b c D
editor.cells = [
  { char: "a" }, { char: "b" }, { char: "c" }, { char: "D" }
];

// Select "a b c", apply as "before" ornament
editor.setSelection(0, 2);
await editor.applyOrnament('before');

// Result: "a b c" floats BEFORE the next non-ornamental cell (D)
// Visual: ᵃᵇᶜD
```

**After Ornament** (acciaccatura):
```javascript
// User types: C d e f
editor.cells = [
  { char: "C" }, { char: "d" }, { char: "e" }, { char: "f" }
];

// Select "d e f", apply as "after" ornament
editor.setSelection(1, 3);
await editor.applyOrnament('after');

// Result: "d e f" floats AFTER the previous non-ornamental cell (C)
// Visual: Cᵈᵉᶠ
```

**Top Ornament** (mordents, trills):
```javascript
// User types: hello world
editor.cells = [
  { char: "h" }, { char: "e" }, { char: "l" }, { char: "l" }, { char: "o" },
  { char: " " },
  { char: "w" }, { char: "o" }, { char: "r" }, { char: "l" }, { char: "d" }
];

// Select "world", apply as "top" ornament
editor.setSelection(6, 10);
await editor.applyOrnament('top');

// Result: "world" floats ON TOP of nearest non-ornamental cell (the space at index 5)
// Visual:
//   ʷᵒʳˡᵈ
//   hello
```

**Menu Shortcuts**:
- **Edit → Ornament** (Alt+0): Apply "after" position (default)
- **Edit → Ornament Before**: Apply "before" position
- **Edit → Ornament Top**: Apply "on top" position

---

## Example 3: Toggle Edit Mode

### Scenario: Edit ornamental cell content

**Problem**: In normal mode, ornamental cells are visual overlays (NOT editable)

**Solution**: Toggle Edit Ornament Mode

```javascript
// Initial state: ornaments are visual overlays
editor.ornamentEditMode; // false

// User cannot select or edit ornamental cells in normal mode
// Clicking on ornaments does nothing

// User presses Alt+Shift+O (or Edit → Toggle Ornament Edit Mode)
editor.toggleOrnamentEditMode();

// State change
editor.ornamentEditMode; // true

// Now ornamental cells RETURN TO EDITABLE TEXT FLOW
// They appear inline with normal horizontal spacing
// User can select them, edit content, delete them, etc.

// User edits ornamental cell from "2" to "5"
editor.cells[0].char = "5";

// User presses Alt+Shift+O again
editor.toggleOrnamentEditMode();

// State change
editor.ornamentEditMode; // false

// Ornamental cells LEAVE FLOW AGAIN
// They become visual overlays again (now showing "5 3 4" instead of "2 3 4")
```

**Visual Comparison**:

| Mode | Display | Editable? |
|------|---------|-----------|
| Normal (edit mode OFF) | ²³⁴ (floating overlay, zero width) | ❌ No |
| Edit (edit mode ON) | `2 3 4` (inline with normal spacing) | ✅ Yes |

---

## Example 4: Remove Ornament

### Scenario: Clear ornament styling from cells

```javascript
// Cells with ornament indicators
editor.cells = [
  { char: "2", ornament_indicator: "OrnamentAfterStart" },
  { char: "3", ornament_indicator: "None" },
  { char: "4", ornament_indicator: "OrnamentAfterEnd" },
  { char: "1", ornament_indicator: "None" }
];

// Method 1: Toggle off (re-apply to same cells)
editor.setSelection(0, 2);
await editor.applyOrnament('after');
// Result: Ornament indicators removed (toggle behavior)

// Method 2: Use remove function (not yet implemented, future API)
editor.setSelection(0, 2);
await editor.removeOrnament();
// Result: cells[0-2].ornament_indicator = None
```

**After Removal**:
```json
[
  { "char": "2", "ornament_indicator": "None" },
  { "char": "3", "ornament_indicator": "None" },
  { "char": "4", "ornament_indicator": "None" },
  { "char": "1", "ornament_indicator": "None" }
]
```

Cells return to normal text flow, no longer styled as ornaments.

---

## Example 5: MusicXML Export

### Scenario: Export ornamental cells as `<grace/>` elements

```javascript
// Cells with ornament indicators
const cells = [
  { char: "D", pitch: "D4", ornament_indicator: "OrnamentBeforeStart" },
  { char: "E", pitch: "E4", ornament_indicator: "OrnamentBeforeEnd" },
  { char: "C", pitch: "C4", ornament_indicator: "None" }
];

// Export to MusicXML
const musicxml = await wasmModule.export_to_musicxml(JSON.stringify(cells));

console.log(musicxml);
```

**Output (MusicXML)**:
```xml
<note>
  <grace/>
  <pitch>
    <step>D</step>
    <octave>4</octave>
  </pitch>
</note>
<note>
  <grace/>
  <pitch>
    <step>E</step>
    <octave>4</octave>
  </pitch>
</note>
<note>
  <pitch>
    <step>C</step>
    <octave>4</octave>
  </pitch>
  <duration>1</duration>
</note>
```

**Key Points**:
- Ornamental cells export as `<grace/>` notes (zero duration)
- Main cells export as regular `<note>` elements (with duration)
- Position type ("before"/"after"/"top") maps to `placement` attribute (future enhancement)

---

## Example 6: LilyPond Export

### Scenario: Export ornamental cells as `\grace {}` syntax

```javascript
// Same cells as Example 5
const cells = [
  { char: "D", pitch: "D4", ornament_indicator: "OrnamentBeforeStart" },
  { char: "E", pitch: "E4", ornament_indicator: "OrnamentBeforeEnd" },
  { char: "C", pitch: "C4", ornament_indicator: "None" }
];

// Export to LilyPond (via MusicXML converter)
const lilypond = await wasmModule.export_to_lilypond(JSON.stringify(cells));

console.log(lilypond);
```

**Output (LilyPond)**:
```lilypond
\relative c' {
  \grace { d e } c
}
```

**Explanation**:
- `\grace { d e }` wraps ornamental cells
- Main note `c` follows
- Pitch-to-note conversion handles octave relationships

---

## Example 7: Rhythm-Transparent Behavior

### Scenario: Ornaments excluded from beat calculations

```javascript
// Cells with mixed ornaments and main notes
const cells = [
  { char: "2", ornament_indicator: "OrnamentBeforeStart" },
  { char: "3", ornament_indicator: "OrnamentBeforeEnd" },
  { char: "1", ornament_indicator: "None" }, // Main note
  { char: "4", ornament_indicator: "None" }, // Main note
];

// Derive beats (WASM function filters ornaments)
const beats = await wasmModule.derive_beats(JSON.stringify(cells));

console.log(beats);
```

**Output (beats)**:
```json
[
  { "cell_idx": 2, "beat": 0, "beat_fraction": "0/1" },  // Cell "1"
  { "cell_idx": 3, "beat": 1, "beat_fraction": "1/1" }   // Cell "4"
]
```

**Key Point**: Ornamental cells (indices 0-1) are excluded from beat calculations. Only main cells (indices 2-3) receive beat positions.

**Implementation Detail**:
```rust
pub fn derive_beats(cells_json: &str) -> String {
    let cells = parse_cells(cells_json);

    // Filter out rhythm-transparent cells (ornaments)
    let rhythmic_cells: Vec<&Cell> = cells
        .iter()
        .filter(|c| !c.is_rhythm_transparent())
        .collect();

    // Compute beats on rhythmic cells only
    let beats = compute_beats(&rhythmic_cells);

    serde_json::to_string(&beats).unwrap()
}
```

---

## Example 8: Attachment Resolution (Advanced)

### Scenario: Understanding how ornaments attach to anchor cells

```javascript
// Complex cell sequence
const cells = [
  { char: "C", ornament_indicator: "None" },                  // idx 0 - anchor
  { char: "d", ornament_indicator: "OrnamentAfterStart" },    // idx 1
  { char: "e", ornament_indicator: "OrnamentAfterEnd" },      // idx 2
  { char: "D", ornament_indicator: "None" },                  // idx 3 - anchor
  { char: "f", ornament_indicator: "OrnamentBeforeStart" },   // idx 4
  { char: "g", ornament_indicator: "OrnamentBeforeEnd" },     // idx 5
  { char: "E", ornament_indicator: "None" },                  // idx 6 - anchor
];

// Resolve attachments (WASM)
const attachmentMap = await wasmModule.resolve_ornament_attachments(JSON.stringify(cells));

console.log(JSON.parse(attachmentMap));
```

**Output (AttachmentMap)**:
```json
{
  "0": {
    "before": [],
    "after": [
      { "start_idx": 1, "end_idx": 2, "cells": ["d", "e"] }
    ],
    "on_top": []
  },
  "6": {
    "before": [
      { "start_idx": 4, "end_idx": 5, "cells": ["f", "g"] }
    ],
    "after": [],
    "on_top": []
  }
}
```

**Explanation**:
- **Span [1-2] (after)**: Attaches to cell 0 (first non-ornamental cell to the LEFT)
- **Span [4-5] (before)**: Attaches to cell 6 (first non-ornamental cell to the RIGHT)
- Cell 3 has no ornaments attached

**Attachment Rules**:
1. **Before ornaments** → attach to first non-ornamental cell to the RIGHT
2. **After ornaments** → attach to first non-ornamental cell to the LEFT
3. **Top ornaments** → attach to NEAREST non-ornamental cell (left or right)

---

## Common Patterns

### Pattern 1: Apply ornament to selection
```javascript
editor.setSelection(start, end);
await editor.applyOrnament('before'); // or 'after', 'top'
```

### Pattern 2: Toggle edit mode for modifications
```javascript
editor.toggleOrnamentEditMode(); // Turn ON
// ... edit cells ...
editor.toggleOrnamentEditMode(); // Turn OFF
```

### Pattern 3: Check if cell is ornamental
```rust
fn is_rhythm_transparent(&self) -> bool {
    !matches!(self.ornament_indicator, OrnamentIndicator::None)
}
```

### Pattern 4: Export with ornaments
```javascript
const musicxml = await wasmModule.export_to_musicxml(JSON.stringify(cells));
const lilypond = await wasmModule.export_to_lilypond(JSON.stringify(cells));
```

---

## API Reference Summary

### JavaScript (editor.js)

| Function | Parameters | Description |
|----------|------------|-------------|
| `applyOrnament()` | `positionType: 'before' \| 'after' \| 'top'` | Apply ornament styling to selection |
| `removeOrnament()` | none | Remove ornament styling from selection |
| `toggleOrnamentEditMode()` | none | Toggle edit mode on/off |

### WASM (api.rs)

| Function | Parameters | Returns | Description |
|----------|------------|---------|-------------|
| `apply_ornament` | `cells_json, start, end, position_type` | `String` (JSON) | Set ornament indicators on cells |
| `remove_ornament` | `cells_json, start, end` | `String` (JSON) | Clear ornament indicators |
| `resolve_ornament_attachments` | `cells_json` | `String` (JSON) | Compute attachment map |
| `compute_ornament_layout` | `cells_json, edit_mode` | `String` (JSON) | Compute bounding boxes for rendering |
| `derive_beats` | `cells_json` | `String` (JSON) | Compute beats (exclude ornaments) |
| `export_to_musicxml` | `cells_json` | `String` (XML) | Export to MusicXML with `<grace/>` elements |

---

## Performance Notes

- **Attachment resolution**: O(n) where n = cell count (single pass)
- **Layout computation**: O(n + m²) where m = ornament count (collision detection)
- **Edit mode toggle**: < 2s for 1000 cells (target)
- **Apply ornament**: < 50ms including WASM call + render (target)

---

## Troubleshooting

### Issue: Ornaments not visible
**Check**: Are you in edit mode? Ornaments appear inline in edit mode, as overlays in normal mode.
**Solution**: Toggle edit mode OFF (Alt+Shift+O) to see floating ornaments.

### Issue: Cannot select ornamental cells
**Check**: Are you in normal mode? Ornaments are not selectable in normal mode.
**Solution**: Toggle edit mode ON (Alt+Shift+O) to make ornaments editable.

### Issue: Ornaments overlap/collide
**Check**: Is collision detection enabled?
**Solution**: Collision detection adds horizontal spacing automatically. Check `compute_ornament_layout` output.

### Issue: Export missing ornaments
**Check**: Do cells have ornament indicators?
**Solution**: Verify `cells[i].ornament_indicator !== 'None'` for ornamental cells.

---

## Next Steps

1. ✅ Quickstart examples defined
2. ⏳ Ready for task generation (`/speckit.tasks`)
3. ⏳ Implementation phase

**See also**:
- [spec.md](./spec.md) - Feature specification
- [data-model.md](./data-model.md) - Entity definitions
- [contracts/ornament-ui-api.md](./contracts/ornament-ui-api.md) - JavaScript API contract
- [contracts/ornament-wasm-api.md](./contracts/ornament-wasm-api.md) - WASM API contract
- [research.md](./research.md) - Design decisions
