# Data Model: Music Notation Ornament Support

**Feature**: 006-music-notation-ornament
**Date**: 2025-10-26

## Entity Overview

| Entity | Type | Persistence | Purpose |
|--------|------|-------------|---------|
| Cell | Struct (modify existing) | Persistent | Add `ornament_indicator` field |
| OrnamentIndicator | Enum (add new) | Persistent | Mark ornament span boundaries |
| Ornament PositionType | Enum (ephemeral) | Runtime only | Helper for algorithms |
| OrnamentSpan | Struct (ephemeral) | Runtime only | Group cells in ornament span |
| AttachmentMap | Type alias (ephemeral) | Runtime only | Map ornaments to anchor cells |

---

## 1. Cell (Existing - MODIFY)

**File**: `src/models/core.rs`

**Modifications**:
```rust
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Cell {
    // ... existing fields ...

    #[serde(default)]
    pub ornament_indicator: OrnamentIndicator,  // NEW FIELD

    // ... existing fields ...
}

impl Cell {
    // NEW METHOD
    pub fn is_rhythm_transparent(&self) -> bool {
        !matches!(self.ornament_indicator, OrnamentIndicator::None)
    }
}
```

**Validation Rules**:
- `ornament_indicator` defaults to `OrnamentIndicator::None`
- Only one indicator type per cell (no mixing)
- Start/End indicators must be balanced in cell sequence

---

## 2. OrnamentIndicator (NEW)

**File**: `src/models/elements.rs`

**Definition**:
```rust
#[wasm_bindgen]
#[repr(u8)]
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub enum OrnamentIndicator {
    None = 0,

    OrnamentBeforeStart = 1,
    OrnamentBeforeEnd = 2,

    OrnamentAfterStart = 3,
    OrnamentAfterEnd = 4,

    OrnamentOnTopStart = 5,
    OrnamentOnTopEnd = 6,
}

impl OrnamentIndicator {
    pub fn is_start(&self) -> bool {
        matches!(self,
            OrnamentIndicator::OrnamentBeforeStart
            | OrnamentIndicator::OrnamentAfterStart
            | OrnamentIndicator::OrnamentOnTopStart
        )
    }

    pub fn is_end(&self) -> bool {
        matches!(self,
            OrnamentIndicator::OrnamentBeforeEnd
            | OrnamentIndicator::OrnamentAfterEnd
            | OrnamentIndicator::OrnamentOnTopEnd
        )
    }

    pub fn position_type(&self) -> Option<OrnamentPositionType> {
        match self {
            OrnamentIndicator::OrnamentBeforeStart | OrnamentIndicator::OrnamentBeforeEnd => {
                Some(OrnamentPositionType::Before)
            }
            OrnamentIndicator::OrnamentAfterStart | OrnamentIndicator::OrnamentAfterEnd => {
                Some(OrnamentPositionType::After)
            }
            OrnamentIndicator::OrnamentOnTopStart | OrnamentIndicator::OrnamentOnTopEnd => {
                Some(OrnamentPositionType::OnTop)
            }
            OrnamentIndicator::None => None,
        }
    }

    pub fn matches(&self, other: &OrnamentIndicator) -> bool {
        self.position_type() == other.position_type()
    }
}
```

**Serialization**: Uses custom Serialize/Deserialize (like existing enums in elements.rs)

---

## 3. OrnamentPositionType (NEW - Ephemeral)

**File**: `src/models/elements.rs`

**Definition**:
```rust
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum OrnamentPositionType {
    Before,
    After,
    OnTop,
}
```

**Purpose**: Helper enum for attachment algorithm (NOT serialized, runtime only)

**String conversion**:
```rust
impl OrnamentPositionType {
    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "before" => Some(Self::Before),
            "after" => Some(Self::After),
            "top" => Some(Self::OnTop),
            _ => None,
        }
    }

    pub fn to_str(&self) -> &'static str {
        match self {
            Self::Before => "before",
            Self::After => "after",
            Self::OnTop => "top",
        }
    }
}
```

---

## 4. OrnamentSpan (NEW - Ephemeral)

**File**: `src/renderers/layout_engine.rs` (new module)

**Definition**:
```rust
#[derive(Clone, Debug)]
pub struct OrnamentSpan {
    pub start_idx: usize,          // Index of cell with Start indicator
    pub end_idx: usize,            // Index of cell with End indicator
    pub position_type: OrnamentPositionType,  // Before/After/Top
    pub cells: Vec<Cell>,          // Cells in span (for rendering)
}

impl OrnamentSpan {
    pub fn from_cells(cells: &[Cell], start: usize, end: usize) -> Self {
        let position_type = cells[start].ornament_indicator.position_type()
            .expect("Start cell must have position type");

        Self {
            start_idx: start,
            end_idx: end,
            position_type,
            cells: cells[start..=end].to_vec(),
        }
    }

    pub fn len(&self) -> usize {
        self.end_idx - self.start_idx + 1
    }
}
```

**Purpose**: Groups cells in ornament span for layout/rendering

---

## 5. OrnamentGroups (NEW - Ephemeral)

**File**: `src/renderers/layout_engine.rs`

**Definition**:
```rust
#[derive(Clone, Debug, Default)]
pub struct OrnamentGroups {
    pub before: Vec<OrnamentSpan>,
    pub after: Vec<OrnamentSpan>,
    pub on_top: Vec<OrnamentSpan>,
}

impl OrnamentGroups {
    pub fn add_span(&mut self, span: OrnamentSpan) {
        match span.position_type {
            OrnamentPositionType::Before => self.before.push(span),
            OrnamentPositionType::After => self.after.push(span),
            OrnamentPositionType::OnTop => self.on_top.push(span),
        }
    }

    pub fn is_empty(&self) -> bool {
        self.before.is_empty() && self.after.is_empty() && self.on_top.is_empty()
    }
}
```

**Purpose**: Groups ornament spans by position type for a single anchor cell

---

## 6. AttachmentMap (NEW - Type Alias)

**File**: `src/renderers/layout_engine.rs`

**Definition**:
```rust
use std::collections::HashMap;

pub type AttachmentMap = HashMap<usize, OrnamentGroups>;
```

**Purpose**: Maps anchor cell index → ornaments attached to that cell

**Example**:
```
Cell sequence: [0:note-C] [1:orn-start] [2:orn-D] [3:orn-end] [4:note-E]

AttachmentMap:
{
  4: OrnamentGroups {
    before: [OrnamentSpan { start: 1, end: 3, cells: [D] }],
    after: [],
    on_top: []
  }
}
```

---

## Data Flow

### 1. Apply Ornament (User Action)

```
User selects cells [2, 3, 4] and presses Alt-0

JavaScript:
  editor.applyOrnament('after')
    ↓
  wasmModule.apply_ornament(cells, 2, 4, "after")

WASM (api.rs):
  - Set cells[2].ornament_indicator = OrnamentAfterStart
  - Set cells[4].ornament_indicator = OrnamentAfterEnd
  - Return modified cells

JavaScript:
  editor.cells = modified_cells
  editor.render()
```

### 2. Render (Normal Mode)

```
renderer.renderLine(cells, editMode: false)

1. Filter ornamental cells:
   mainCells = cells.filter(c => c.ornament_indicator === 'None')
   ornamentCells = cells.filter(c => c.ornament_indicator !== 'None')

2. Compute attachment (WASM):
   attachmentMap = wasmModule.resolve_ornament_attachments(cells)

3. Layout (WASM):
   layout = wasmModule.compute_ornament_layout(cells, false)

4. Render:
   - Render mainCells inline
   - Render ornamentCells as positioned overlays using layout data
```

### 3. Export to MusicXML

```
wasmModule.export_to_musicxml(cells)

1. Resolve attachments:
   attachmentMap = resolve_attachments(cells)

2. For each anchor cell:
   - Export "before" ornaments as <grace/> elements
   - Export main note as <note> element
   - Export "after" ornaments as <grace slash="yes"/> elements

3. Return MusicXML string
```

---

## Validation Rules

### Ornament Span Validation

**Rule 1**: Start/End indicators must be balanced
```rust
fn validate_ornament_spans(cells: &[Cell]) -> Result<(), String> {
    let mut stack = Vec::new();

    for (idx, cell) in cells.iter().enumerate() {
        if cell.ornament_indicator.is_start() {
            stack.push((idx, cell.ornament_indicator));
        } else if cell.ornament_indicator.is_end() {
            match stack.pop() {
                Some((start_idx, start_ind)) if start_ind.matches(&cell.ornament_indicator) => {
                    // Valid match
                }
                _ => return Err(format!("Unmatched end indicator at index {}", idx)),
            }
        }
    }

    if !stack.is_empty() {
        return Err(format!("Unmatched start indicators: {:?}", stack));
    }

    Ok(())
}
```

**Rule 2**: No nested ornaments (ornament spans cannot overlap)
- Enforcement: UI prevents creating overlapping spans
- Validation: Check that no cell has both Start and End indicators
- Validation: Check that spans don't overlap in cell sequence

---

## Performance Considerations

### Memory

- `ornament_indicator` adds 1 byte per Cell (~1KB for 1000 cells)
- Ephemeral structures (spans, attachment map) created on-demand, dropped after render
- No persistent overhead

### Computation

**Attachment resolution**: O(n) where n = cell count
- Single pass to extract spans
- Single pass to find anchors
- Total: 2n operations

**Collision detection**: O(m²) where m = ornament count
- Worst case: all ornaments collide
- Typical case: O(m) (few collisions)
- Max 100 ornaments expected, so O(10,000) acceptable

**Layout**: O(n + m)
- Render main cells: O(n)
- Position ornaments: O(m)

**Total**: O(n + m²) ≈ O(n) for typical use (m << n)

---

## Migration Notes

**Existing data**: All existing Cell instances get `ornament_indicator = None` by default (backward compatible)

**Serialization**: `#[serde(default)]` ensures old JSON files deserialize correctly

**No breaking changes**: Adding field with default value is backward compatible

---

## Next Steps

1. ✅ Data model defined
2. ⏳ Generate API contracts
3. ⏳ Generate quickstart examples
4. ⏳ Generate implementation tasks
