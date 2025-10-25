# Ornament API Contracts

**Version**: 1.0
**Date**: 2025-10-22
**Status**: Design Phase
**Reference**: [data-model.md](../data-model.md)

---

## Overview

Internal API contracts for ornament editing and rendering. Defines boundaries between:
- **Dialog ↔ Core**: How dialog passes user input to ornament processing
- **Core ↔ Rendering**: How rendering receives ornament positions and symbols
- **Core ↔ Export**: How ornaments are converted to Lilypond/MusicXML

---

## 1. Dialog API

### Interface: OrnamentEditorHandler

**Location**: `src/js/ornament-editor-handler.js`

**Purpose**: Handle keyboard input and menu commands in ornament dialog.

#### Events

```typescript
class OrnamentEditorHandler {
  /// User typing in ornament input field
  onKeyDown(event: KeyboardEvent, currentText: string): void

  /// Backspace: remove last character from ornament
  onBackspace(currentText: string): string

  /// Arrow keys: navigate within ornament sequence
  onArrowKey(direction: 'left'|'right', cursorPos: number): number

  /// Enter: confirm ornament and close dialog
  onEnter(ornamentText: string): Promise<void>

  /// Escape: cancel editing, discard changes
  onEscape(): void

  /// Before/After toggle via radio button
  onPlacementChange(placement: 'before'|'after'): void

  /// Octave adjustment buttons
  onOctaveUp(pitchIndex: number): void
  onOctaveDown(pitchIndex: number): void
}
```

#### State Changes

```typescript
interface DialogState {
  isOpen: boolean
  currentText: string
  placement: 'before' | 'after'
  targetCellIndex: number
  previewElement: HTMLElement
  lastError: string | null
}
```

---

## 2. Core API (WASM Boundary)

### Interface: OrnamentCore (Rust WASM)

**Location**: `src/api.rs` extension + `src/models/ornament.rs`

**Purpose**: Parse, validate, calculate, and export ornaments.

#### Parsing & Validation

```rust
#[wasm_bindgen]
pub fn parse_ornament(
    text: &str,           // e.g., "Sa", "R#G", "1b2"
    base_pitch: u8,       // Current note's pitch code
    notation: &str,       // "sargam" | "number" | "abc" | "hindi" | "doremi"
) -> Result<OrnamentData, JsValue>

#[wasm_bindgen]
pub fn validate_ornament(
    ornament: &OrnamentData,
    target_cell_index: usize,
    line_length: usize,
) -> Result<(), JsValue>
```

**Input (OrnamentData)**:
```rust
pub struct OrnamentData {
    pub pitches: Vec<OrnamentPitch>,
    pub placement: u8,  // 0=before, 1=after
    pub symbol: String,
}

pub struct OrnamentPitch {
    pub pitch_name: String,
    pub accidental: String,  // "" | "#" | "b"
    pub octave: i8,
    pub symbol: String,
}
```

**Errors**:
- `"Invalid pitch: X in notation Y"` - Pitch not valid for notation system
- `"Invalid accidental: X"` - Unknown accidental symbol
- `"Octave out of range: X"` - Octave < -2 or > 2
- `"Empty ornament"` - No pitches provided

#### Positioning & Layout

```rust
#[wasm_bindgen]
pub fn calculate_ornament_layout(
    ornament_text: &str,
    base_x: f32,
    base_y: f32,
    base_font_size: f32,
    placement: u8,
) -> Result<OrnamentPosition, JsValue>

#[wasm_bindgen]
pub fn calculate_ornament_bbox(
    position: &OrnamentPosition,
    pitch_symbols: &JsValue,  // Vec<String> (pitch symbols)
) -> Result<BoundingBox, JsValue>
```

**Output (OrnamentPosition)**:
```rust
pub struct OrnamentPosition {
    pub x: f32,       // 0.1px precision
    pub y: f32,       // 0.1px precision
    pub width: f32,
    pub height: f32,
}

pub struct BoundingBox {
    pub left: f32,
    pub top: f32,
    pub width: f32,
    pub height: f32,
}
```

**Precision**: All coordinates rounded to 0.1px (1 decimal place)

#### Export

```rust
#[wasm_bindgen]
pub fn export_ornament_lilypond(
    ornament: &OrnamentData,
    before: bool,  // true = before, false = after
) -> Result<String, JsValue>
// Returns: \grace { d' e' } or \afterGrace { d' e' }

#[wasm_bindgen]
pub fn export_ornament_musicxml(
    ornament: &OrnamentData,
    before: bool,
    main_note_pitch: &str,
) -> Result<String, JsValue>
// Returns: <grace steal-time-following="50">\n<pitch>...</pitch>\n</grace>
```

---

## 3. Rendering API

### Interface: OrnamentRenderer (JavaScript)

**Location**: `src/js/ornament-renderer.js`

**Purpose**: Render ornament DOM elements using calculated positions.

```typescript
class OrnamentRenderer {
  /// Render single ornament to DOM element
  renderOrnament(
    layout: OrnamentPosition,
    symbol: string,
    placement: 'before' | 'after'
  ): HTMLElement

  /// Apply CSS styles for ornament sizing/positioning
  styleOrnament(element: HTMLElement, layout: OrnamentPosition): void

  /// Update ornament position (on note reposition)
  updatePosition(element: HTMLElement, newLayout: OrnamentPosition): void
}
```

**CSS Classes**:
```css
.ornament-symbol {
  position: absolute;
  font-size: 75%;  /* Via CSS variable or calculated */
  font-family: 'Bravura', serif;
  z-index: 10;     /* Above notes, below slurs */
}

.ornament-symbol.accidental-sharp::after {
  content: '\uE262';  /* SMuFL sharp */
  font-family: 'Bravura', serif;
}

.ornament-symbol.accidental-flat::after {
  content: '\uE260';  /* SMuFL flat */
}
```

---

## 4. Dialog-to-Core Flow

### Create New Ornament

```
User: Opens Edit menu → Selects "Ornament" → Dialog opens

Dialog:
  1. Input field focused
  2. User types: "Sa"
  3. onKeyDown() → updatePreview()

updatePreview():
  1. Call WASM parse_ornament("Sa", currentPitch, "sargam")
  2. On success: Call calculate_ornament_layout(...)
  3. Render preview using OrnamentRenderer
  4. On error: Display error message

User: Changes placement → onPlacementChange('after')
  1. Call calculate_ornament_layout() with new placement
  2. Re-render preview

User: Clicks OK
  1. Call WASM validate_ornament(ornamentData, targetIndex, lineLength)
  2. If valid: Store in document model, close dialog
  3. If invalid: Display error, keep dialog open

Re-render: computeLayout() includes ornaments → renderFromDisplayList()
```

### Edit Existing Ornament

```
User: Positions cursor on ornament → Edit → Ornament

Dialog opens with:
  1. Current ornament data pre-populated
  2. Input field shows current symbol
  3. Placement radio buttons set correctly

User: Modifies text (same flow as "Create New")

User: Clicks OK → Update in document → Re-render
```

---

## 5. Rendering Flow

### Render ornaments as part of computeLayout()

```
computeLayout() [Rust WASM]:
  1. For each ornament in line:
     a. Call calculate_ornament_layout()
     b. Call calculate_ornament_bbox()
     c. Store in DisplayList

renderFromDisplayList() [JavaScript]:
  1. For each ornament in displayList:
     a. Create HTML element
     b. Apply styles using OrnamentRenderer
     c. Append to line-element container (above cells, below slurs)

Result: Ornaments positioned at calculated x,y with tight bounding boxes
```

---

## 6. Data Types (TypeScript Interfaces)

### Common Types

```typescript
interface OrnamentData {
  pitches: OrnamentPitch[]
  placement: 'before' | 'after'
  symbol: string
  targetCellIndex: number
}

interface OrnamentPitch {
  pitchName: string     // "S", "R", "G", etc.
  accidental: '' | '#' | 'b'
  octave: number        // -2 to 2
  symbol: string        // "Sa", "R#", etc.
}

interface OrnamentPosition {
  x: number            // px, 0.1 precision
  y: number            // px, 0.1 precision
  width: number        // px
  height: number       // px
}

interface BoundingBox {
  left: number
  top: number
  width: number
  height: number
}
```

---

## 7. Error Handling

### WASM Error Format

All WASM functions return `Result<T, JsValue>`. Errors are JavaScript objects:

```typescript
interface OrnamentError {
  code: string
  message: string
  context?: {
    input?: string
    notation?: string
    pitch?: string
  }
}
```

**Error Codes**:

| Code | Message | Recovery |
|------|---------|----------|
| `INVALID_PITCH` | "Invalid pitch: X in notation Y" | Suggest valid pitches |
| `INVALID_ACCIDENTAL` | "Invalid accidental: X" | Show accidental options |
| `OCTAVE_OUT_OF_RANGE` | "Octave out of range: X" | Show valid octave range |
| `EMPTY_ORNAMENT` | "Ornament must have at least one pitch" | Clear error on first keystroke |
| `INVALID_TARGET` | "Target note index out of bounds" | Disable ornament confirmation |
| `TARGET_IS_DASH` | "Cannot attach ornament to rest" | Show error, suggest other note |

### JavaScript Error Handling

```javascript
try {
  const layout = wasmModule.calculate_ornament_layout(
    ornamentText, baseX, baseY, fontSize, placement
  );
  updatePreview(layout);
} catch (error) {
  if (error.code === 'INVALID_PITCH') {
    showError(`${error.message} (valid: S, R, G, M, P, D, N)`);
  } else {
    showError(error.message);
  }
}
```

---

## 8. Testing Contracts

### WASM Unit Tests

```rust
#[cfg(test)]
mod ornament_tests {
  #[test]
  fn parse_valid_ornament() { ... }

  #[test]
  fn parse_with_accidentals() { ... }

  #[test]
  fn calculate_position_before() { ... }

  #[test]
  fn calculate_position_after() { ... }

  #[test]
  fn export_lilypond_grace() { ... }
}
```

### E2E Tests (Playwright)

```javascript
describe('Ornament Editing', () => {
  test('Create ornament before note', async () => { ... })
  test('Create ornament after note', async () => { ... })
  test('Edit ornament pitches', async () => { ... })
  test('Change placement', async () => { ... })
  test('Delete ornament', async () => { ... })
  test('Render matches preview', async () => { ... })
})
```

---

## Summary

| Interface | Location | Purpose | Key Methods |
|-----------|----------|---------|------------|
| **OrnamentEditorHandler** | JS | Dialog events | onKeyDown, onEnter, onEscape |
| **OrnamentCore** | WASM | Parse/validate | parse_ornament, validate_ornament |
| **OrnamentCore** | WASM | Position/render | calculate_ornament_layout, calculate_bbox |
| **OrnamentCore** | WASM | Export | export_ornament_lilypond, export_musicxml |
| **OrnamentRenderer** | JS | DOM rendering | renderOrnament, styleOrnament, updatePosition |

---

**Next**: Quickstart Guide (`quickstart.md`)
