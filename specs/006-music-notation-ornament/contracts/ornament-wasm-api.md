# WASM API Contract: Ornament Operations

**Feature**: 006-music-notation-ornament
**File**: `src/api.rs`

## Core Functions

### apply_ornament

**Purpose**: Set ornament indicators on selected cells

**Signature**:
```rust
#[wasm_bindgen]
pub fn apply_ornament(
    cells_json: &str,
    start: usize,
    end: usize,
    position_type: &str,  // "before", "after", or "top"
) -> String
```

**Logic**:
1. Parse cells from JSON
2. Validate selection range
3. Determine Start/End indicators from position_type
4. Set `cells[start].ornament_indicator = <PositionType>Start`
5. Set `cells[end].ornament_indicator = <PositionType>End`
6. Return cells as JSON

**Toggle Behavior**: If cells already have matching indicators, remove them

---

### remove_ornament

**Purpose**: Clear ornament indicators from selected cells

**Signature**:
```rust
#[wasm_bindgen]
pub fn remove_ornament(
    cells_json: &str,
    start: usize,
    end: usize,
) -> String
```

**Logic**:
1. Set `cells[i].ornament_indicator = OrnamentIndicator::None` for i in start..=end
2. Return cells as JSON

---

### resolve_ornament_attachments

**Purpose**: Compute which cells ornaments attach to (for rendering/export)

**Signature**:
```rust
#[wasm_bindgen]
pub fn resolve_ornament_attachments(cells_json: &str) -> String
```

**Returns**: JSON representation of AttachmentMap
```json
{
  "4": {
    "before": [{"start": 1, "end": 3, "cells": [...]}],
    "after": [],
    "on_top": []
  }
}
```

**Logic**: See data-model.md for algorithm

---

### compute_ornament_layout

**Purpose**: Compute bounding boxes for ornamental cells

**Signature**:
```rust
#[wasm_bindgen]
pub fn compute_ornament_layout(
    cells_json: &str,
    edit_mode: bool,
) -> String  // Returns layout JSON
```

**Returns**: Array of bounding boxes with positioning data
```json
[
  {
    "cell_idx": 1,
    "x": 100.5,
    "y": 20.0,
    "width": 0,  // Zero width in normal mode
    "height": 12.0,
    "is_ornament": true
  }
]
```

**Logic**:
- If edit_mode=true: Inline layout (ornaments have normal width)
- If edit_mode=false: Floating layout (ornaments have zero width, positioned via attachment map)

---

### derive_beats (MODIFY EXISTING)

**Purpose**: Exclude ornamental cells from beat calculations

**Modification**:
```rust
pub fn derive_beats(cells_json: &str) -> String {
    let cells = parse_cells(cells_json);

    // Filter out rhythm-transparent cells (ornaments)
    let rhythmic_cells: Vec<&Cell> = cells
        .iter()
        .filter(|c| !c.is_rhythm_transparent())
        .collect();

    // Existing beat derivation logic on rhythmic_cells only
    let beats = compute_beats(&rhythmic_cells);

    serde_json::to_string(&beats).unwrap()
}
```

---

### export_to_musicxml (MODIFY EXISTING)

**Purpose**: Export ornamental cells as `<grace/>` elements

**Modification**:
```rust
pub fn export_to_musicxml(cells_json: &str) -> String {
    let cells = parse_cells(cells_json);
    let attachments = resolve_ornament_attachments(&cells);

    let mut xml = String::new();

    for (idx, cell) in cells.iter().enumerate() {
        if cell.is_rhythm_transparent() {
            continue;  // Ornaments rendered via attachments
        }

        // Export "before" ornaments
        if let Some(groups) = attachments.get(&idx) {
            for span in &groups.before {
                xml.push_str(&export_grace_notes(span));
            }
        }

        // Export main note
        xml.push_str(&export_note(cell));

        // Export "after" ornaments (acciaccatura)
        if let Some(groups) = attachments.get(&idx) {
            for span in &groups.after {
                xml.push_str(&export_acciaccatura(span));
            }
        }
    }

    xml
}
```

---

## Helper Functions (Internal - Not Exported)

### extract_ornament_spans

```rust
fn extract_ornament_spans(cells: &[Cell]) -> Vec<OrnamentSpan> {
    let mut spans = Vec::new();
    let mut i = 0;

    while i < cells.len() {
        if cells[i].ornament_indicator.is_start() {
            // Find matching end
            let start_indicator = cells[i].ornament_indicator;
            let mut j = i + 1;

            while j < cells.len() {
                if cells[j].ornament_indicator.is_end()
                    && cells[j].ornament_indicator.matches(&start_indicator) {
                    spans.push(OrnamentSpan::from_cells(cells, i, j));
                    i = j;
                    break;
                }
                j += 1;
            }
        }
        i += 1;
    }

    spans
}
```

### find_anchor_cell

```rust
fn find_anchor_cell(cells: &[Cell], span: &OrnamentSpan) -> Option<usize> {
    match span.position_type {
        OrnamentPositionType::Before => {
            // Find first non-ornamental cell to the RIGHT
            for i in (span.end_idx + 1)..cells.len() {
                if cells[i].ornament_indicator == OrnamentIndicator::None {
                    return Some(i);
                }
            }
            None  // Orphaned
        }
        OrnamentPositionType::After => {
            // Find first non-ornamental cell to the LEFT
            for i in (0..span.start_idx).rev() {
                if cells[i].ornament_indicator == OrnamentIndicator::None {
                    return Some(i);
                }
            }
            None  // Orphaned
        }
        OrnamentPositionType::OnTop => {
            // Find NEAREST non-ornamental cell
            let left_dist = span.start_idx;
            let right_dist = cells.len() - span.end_idx - 1;

            if left_dist <= right_dist {
                // Search left first
                for i in (0..span.start_idx).rev() {
                    if cells[i].ornament_indicator == OrnamentIndicator::None {
                        return Some(i);
                    }
                }
            }

            // Search right
            for i in (span.end_idx + 1)..cells.len() {
                if cells[i].ornament_indicator == OrnamentIndicator::None {
                    return Some(i);
                }
            }

            None  // Orphaned
        }
    }
}
```

---

## Performance Targets

| Function | Target | Notes |
|----------|--------|-------|
| apply_ornament | < 5ms | Simple field assignment |
| remove_ornament | < 5ms | Simple field assignment |
| resolve_ornament_attachments | < 10ms | O(n) scan |
| compute_ornament_layout | < 100ms | Includes collision detection |
| derive_beats | < 10ms | Filter + existing logic |
| export_to_musicxml | < 500ms | Complex formatting |

---

## Error Handling

All functions return `String` (JSON) with error handling:

```rust
pub fn apply_ornament(...) -> String {
    match try_apply_ornament(...) {
        Ok(cells) => serde_json::to_string(&cells).unwrap(),
        Err(e) => {
            log::error!("Failed to apply ornament: {}", e);
            serde_json::to_string(&json!({"error": e.to_string()})).unwrap()
        }
    }
}
```

JavaScript side checks for error:
```javascript
const result = JSON.parse(wasmModule.apply_ornament(...));
if (result.error) {
  console.error('WASM error:', result.error);
  return;
}
this.cells = result;
```

---

## Testing Contract

**Unit Tests** (Rust):
- Test `apply_ornament` with valid/invalid ranges
- Test `remove_ornament` clears indicators
- Test `extract_ornament_spans` finds all spans
- Test `find_anchor_cell` with before/after/top positions
- Test `resolve_ornament_attachments` creates correct map

**Integration Tests** (E2E):
- Call from JavaScript → Verify cells modified
- Verify layout computation returns valid bounding boxes
- Verify MusicXML export contains `<grace/>` elements

---

## Next Steps

1. ✅ WASM API contract defined
2. ⏳ Generate quickstart examples
3. ⏳ Ready for task generation
