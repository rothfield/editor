# WASM API Contract: Ornament Operations

**Feature**: 006-music-notation-ornament
**Date**: 2025-10-25
**Phase**: 1 (Design & Contracts)

## Overview

This document defines the WASM API contract for ornament-related operations exposed to JavaScript. All functions are implemented in Rust and exposed via `#[wasm_bindgen]` in `src/api.rs`.

---

## API Functions

### 1. Parse Text with Ornament Syntax

**Purpose**: Parse user input containing ornament markers into Cell array.

**Signature**:
```rust
#[wasm_bindgen]
pub fn parse_text(text: &str, pitch_system: u8) -> JsValue
```

**Parameters**:
- `text: &str` - Input text with ornament syntax (`<234>`, `>56<`, `^78^`)
- `pitch_system: u8` - Pitch system identifier (1=Number, 2=Western, etc.)

**Returns**: `JsValue` - Serialized JSON array of Cell objects

**Ornament Syntax**:
- `<...>` - Before-ornaments (attach to first token to right)
- `>...<` - After-ornaments (attach to last token to left)
- `^...^` - OnTop-ornaments (attach to nearest token)

**Example**:
```javascript
const text = "<234> 1 4 >56<";
const cells = JSON.parse(wasmModule.parse_text(text, 1)); // Number pitch system

// Result: Cells with ornament indicators set:
// [
//   {text:"<", ornament_indicator:{name:"ornament_before_start", value:1}},
//   {text:"2", ornament_indicator:{name:"none", value:0}, pitch_code:{...}},
//   {text:"3", ornament_indicator:{name:"none", value:0}, pitch_code:{...}},
//   {text:"4", ornament_indicator:{name:"none", value:0}, pitch_code:{...}},
//   {text:">", ornament_indicator:{name:"ornament_before_end", value:2}},
//   {text:"1", ornament_indicator:{name:"none", value:0}, pitch_code:{...}},
//   ...
// ]
```

**Error Handling**:
- Invalid syntax: Returns cells with error markers
- Unmatched markers: Logged as warnings, markers treated as literal text

---

### 2. Compute Layout (with Edit Mode)

**Purpose**: Compute layout coordinates for cells, including ornament positioning based on edit mode.

**Signature**:
```rust
#[wasm_bindgen]
pub fn compute_layout(cells_json: &str, edit_mode: bool) -> String
```

**Parameters**:
- `cells_json: &str` - JSON-serialized array of Cell objects
- `edit_mode: bool` - `true` = inline layout, `false` = floating layout

**Returns**: `String` - JSON-serialized layout data with positions and bounding boxes

**Layout Modes**:

**Edit Mode OFF (Floating Layout)**:
- Ornaments use zero horizontal width (float above anchor notes)
- Collision detection adds spacing when ornaments overlap
- Visual styling: 75% font size, superscript positioning
- Attachment computed and ornaments positioned relative to anchors

**Edit Mode ON (Inline Layout)**:
- Ornaments rendered inline in token stream order
- Normal horizontal spacing (same as regular cells)
- Visual styling: 75% font size, superscript positioning
- No attachment resolution needed (linear positioning)

**Example**:
```javascript
const cells = JSON.parse(wasmModule.parse_text("<23> 1", 1));
const layoutFloating = JSON.parse(wasmModule.compute_layout(
    JSON.stringify(cells),
    false  // Edit mode OFF
));
const layoutInline = JSON.parse(wasmModule.compute_layout(
    JSON.stringify(cells),
    true   // Edit mode ON
));

// layoutFloating: ornaments 2,3 positioned above note 1 (x-coordinates overlap)
// layoutInline: ornaments 2,3 positioned sequentially before note 1 (x-coordinates sequential)
```

**Performance Target**: < 100ms for 1000 cells

---

### 3. Export to MusicXML

**Purpose**: Export cells to MusicXML format with ornaments as `<grace/>` elements.

**Signature**:
```rust
#[wasm_bindgen]
pub fn export_to_musicxml(cells_json: &str) -> String
```

**Parameters**:
- `cells_json: &str` - JSON-serialized array of Cell objects

**Returns**: `String` - MusicXML document as XML string

**Grace Note Mapping**:
- **Before-ornaments** → `<grace/>` (no slash)
- **After-ornaments** → `<grace slash="yes"/>` (acciaccatura)
- **OnTop-ornaments** → `<grace/>` with `placement="above"`

**Example**:
```javascript
const cells = JSON.parse(wasmModule.parse_text("<23> 1", 1));
const musicxml = wasmModule.export_to_musicxml(JSON.stringify(cells));

// Result (simplified):
// <measure>
//   <note><grace/><pitch><step>D</step></pitch></note>
//   <note><grace/><pitch><step>E</step></pitch></note>
//   <note><pitch><step>C</step></pitch><duration>4</duration></note>
// </measure>
```

**Requirements**:
- FR-007: Grace notes exported with no duration value
- FR-007a: All three position types exported
- FR-007b: Placement attributes set based on position type

---

### 4. Export to LilyPond (via MusicXML converter)

**Purpose**: Export cells to LilyPond format, using existing MusicXML→LilyPond converter.

**Signature**:
```rust
#[wasm_bindgen]
pub fn export_to_lilypond(cells_json: &str) -> String
```

**Parameters**:
- `cells_json: &str` - JSON-serialized array of Cell objects

**Returns**: `String` - LilyPond source code

**Implementation Strategy**:
1. Export cells to MusicXML (use `export_to_musicxml`)
2. Pass MusicXML to existing converter: `src/converters/musicxml/musicxml_to_lilypond/converter.rs`
3. Return LilyPond source

**Grace Note Mapping**:
- **Before-ornaments** → `\grace { c'16 d' }`
- **After-ornaments** → `\acciaccatura { c'16 }`
- **OnTop-ornaments** → `\appoggiatura { c'8 }`

**Example**:
```javascript
const cells = JSON.parse(wasmModule.parse_text("<23> 1", 1));
const lilypond = wasmModule.export_to_lilypond(JSON.stringify(cells));

// Result:
// \relative c' {
//   \grace { d'16 e' } c'4
// }
```

---

### 5. Validate Ornament Spans

**Purpose**: Validate that ornament start/end indicators are properly balanced.

**Signature**:
```rust
#[wasm_bindgen]
pub fn validate_ornament_spans(cells_json: &str) -> JsValue
```

**Parameters**:
- `cells_json: &str` - JSON-serialized array of Cell objects

**Returns**: `JsValue` - Serialized validation result:
```javascript
{
  "valid": true,
  "errors": []
}
// OR
{
  "valid": false,
  "errors": [
    "Unmatched start indicator at index 5",
    "Mismatched indicators at indices 10 and 15"
  ]
}
```

**Validation Rules**:
- Every start indicator must have matching end indicator
- Indicators must match position type (Before/After/OnTop)
- No overlapping spans (nested ornaments not supported in POC)

**Example**:
```javascript
const cells = JSON.parse(wasmModule.parse_text("<23> 1 >45", 1)); // Missing closing <
const result = JSON.parse(wasmModule.validate_ornament_spans(JSON.stringify(cells)));

// result: {valid: false, errors: ["Unmatched start indicator at index 6"]}
```

---

### 6. Resolve Ornament Attachments (Debug/Inspector)

**Purpose**: Compute ornament attachment map for debugging/inspector display.

**Signature**:
```rust
#[wasm_bindgen]
pub fn resolve_ornament_attachments(cells_json: &str) -> String
```

**Parameters**:
- `cells_json: &str` - JSON-serialized array of Cell objects

**Returns**: `String` - JSON-serialized attachment map

**Return Format**:
```javascript
{
  "4": {  // Anchor index (note "1" at position 4)
    "before": [
      {
        "start_index": 0,
        "end_index": 4,
        "content_cells": [
          {text: "2", pitch_code: {...}},
          {text: "3", pitch_code: {...}}
        ],
        "position_type": "Before",
        "anchor_index": 4
      }
    ],
    "after": [],
    "on_top": []
  }
}
```

**Use Cases**:
- Inspector tab display (show ornament groupings)
- Debugging attachment algorithm
- Visualizing ornament relationships

**Example**:
```javascript
const cells = JSON.parse(wasmModule.parse_text("<23> 1 4 >56<", 1));
const attachments = JSON.parse(wasmModule.resolve_ornament_attachments(JSON.stringify(cells)));

// attachments:
// {
//   "5": {before: [{...}], after: [], on_top: []},  // Note "1"
//   "7": {before: [], after: [{...}], on_top: []}   // Note "4"
// }
```

---

### 7. Toggle Ornament Edit Mode (JavaScript-only)

**Note**: This is NOT a WASM function, but a JavaScript Editor method that calls WASM functions.

**Location**: `src/js/editor.js`

**Signature**:
```javascript
toggleOrnamentEditMode(): void
```

**Implementation**:
```javascript
toggleOrnamentEditMode() {
    this.ornamentEditMode = !this.ornamentEditMode;

    // Recompute layout with new mode
    const layoutData = wasmModule.compute_layout(
        JSON.stringify(this.cells),
        this.ornamentEditMode
    );

    this.layoutData = JSON.parse(layoutData);
    this.render();
}
```

**Keyboard Shortcut**: `Alt+Shift+O` (configured in `src/js/ui.js`)

---

## Data Flow Diagrams

### Parsing Flow
```
User types: "<234> 1"
     ↓
wasmModule.parse_text(text, 1)
     ↓
Rust parser recognizes:
  - "<" → OrnamentBeforeStart indicator
  - "2", "3", "4" → pitched cells (ornament content)
  - ">" → OrnamentBeforeEnd indicator
  - "1" → pitched cell (main note)
     ↓
Returns Cell array with indicators set
```

### Rendering Flow (Edit Mode OFF)
```
Cell array
     ↓
wasmModule.compute_layout(cells, false)
     ↓
Rust layout engine:
  1. Resolve attachments (ornaments 2,3,4 → note 1)
  2. Position ornaments above anchor (x overlaps, y raised)
  3. Check collisions (add spacing if needed)
  4. Compute bounding boxes
     ↓
Returns layout data with positions
     ↓
JavaScript renderer applies CSS:
  - font-size: 0.75em
  - vertical-align: super
  - color: indigo-500
```

### Export Flow
```
Cell array
     ↓
wasmModule.export_to_musicxml(cells)
     ↓
Rust exporter:
  1. Resolve attachments
  2. For each anchor with ornaments:
     - Emit <grace/> elements for before-ornaments
     - Emit main <note> element
     - Emit <grace slash="yes"/> for after-ornaments
  3. Set placement attributes
     ↓
Returns MusicXML string
```

---

## Performance Requirements

| Operation | Target | Measurement |
|-----------|--------|-------------|
| `parse_text` | < 50ms | 1000 characters |
| `compute_layout` | < 100ms | 1000 cells |
| `export_to_musicxml` | < 500ms | 1000 cells |
| `export_to_lilypond` | < 1000ms | 1000 cells (includes conversion) |
| `validate_ornament_spans` | < 10ms | 1000 cells |
| `resolve_ornament_attachments` | < 10ms | 1000 cells |

**Logging**: All WASM functions log warnings if they exceed target times.

---

## Error Handling

### Parse Errors
- **Invalid syntax**: Return best-effort parse, log warnings
- **Unmatched indicators**: Treat as literal text, log warning
- **Invalid pitch codes**: Mark cell with error, continue parsing

### Layout Errors
- **Orphaned ornaments**: Log warning, render inline at token position
- **Collision detection failure**: Use default spacing, log warning
- **Invalid cell data**: Skip cell, log error

### Export Errors
- **Missing pitch data**: Emit rest or skip, log error
- **Unbalanced indicators**: Skip ornament span, log error
- **MusicXML generation failure**: Return error XML comment, log error

**All errors logged to browser console with `⚠️` or `❌` prefix.**

---

## TypeScript Definitions (Optional)

For better JavaScript developer experience:

```typescript
interface WasmModule {
    parse_text(text: string, pitchSystem: number): string;
    compute_layout(cellsJson: string, editMode: boolean): string;
    export_to_musicxml(cellsJson: string): string;
    export_to_lilypond(cellsJson: string): string;
    validate_ornament_spans(cellsJson: string): string;
    resolve_ornament_attachments(cellsJson: string): string;
}

interface Cell {
    text: string;
    pitch_code: PitchCode | null;
    ornament_indicator: OrnamentIndicator;
    slur_indicator: SlurIndicator;
}

interface OrnamentIndicator {
    name: "none" | "ornament_before_start" | "ornament_before_end"
        | "ornament_after_start" | "ornament_after_end"
        | "ornament_on_top_start" | "ornament_on_top_end";
    value: number;
}
```

---

## Summary

### WASM API Surface
- **6 WASM functions** exposed to JavaScript
- **All performance-critical operations** in Rust
- **Clean separation**: JavaScript handles UI state, WASM handles data/layout

### Contract Guarantees
- Deterministic parsing and layout
- Performance targets met for up to 1000 cells
- Graceful error handling (no crashes)
- Standards-compliant MusicXML/LilyPond export

**Phase 1 Contracts Complete**: Ready to generate quickstart documentation.
