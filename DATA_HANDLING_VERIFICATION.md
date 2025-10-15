# Data Handling Verification: Octave and Slur Management

## Problem Statement
Ensure that:
1. JavaScript does NOT directly manipulate octave or slur data
2. Octave and slur data appear in the persistent model tab
3. Ephemeral rendering fields are excluded from persistence

## Verification Results ✅

### JavaScript Data Handling

**VERIFIED: JavaScript ONLY reads octave/slur data, never writes**

```javascript
// Octave handling - JS only calls WASM API
applyOctave(octave) {
  const updatedCells = this.wasmModule.applyOctave(
    letterLane,
    selection.start,
    selection.end,
    octave
  );
  stave.line = updatedCells;  // Replace with WASM results
}

// Slur handling - JS only calls WASM API
applySlur() {
  const updatedCells = wasmModule.applySlur(
    letterLane,
    selection.start,
    selection.end
  );
  stave.line = updatedCells;  // Replace with WASM results
}

// Rendering - JS only READS the data
if (cell.slurIndicator === 1) { /* render slur start */ }
if (cell.octave !== 0) { /* render octave dot */ }
```

### Rust Serialization Configuration

**VERIFIED: Octave and Slur ARE PERSISTED ✅**

Location: `src/models/core.rs` (lines 16-61)

```rust
pub struct Cell {
    // MUSICAL DATA FIELDS - ALL PERSISTED ✅
    pub glyph: String,                // ✅ PERSISTED
    pub kind: ElementKind,               // ✅ PERSISTED
    pub lane: LaneKind,                  // ✅ PERSISTED
    pub col: usize,                      // ✅ PERSISTED
    pub flags: u8,                       // ✅ PERSISTED
    pub pitch_code: Option<String>,      // ✅ PERSISTED
    pub pitch_system: Option<PitchSystem>, // ✅ PERSISTED

    /// Octave marking for pitched elements (-1 = lower, 0 = middle/none, 1 = upper)
    pub octave: Option<i8>,              // ✅ PERSISTED - NO #[serde(skip)]

    /// Slur indicator (None, SlurStart, SlurEnd)
    pub slur_indicator: SlurIndicator,   // ✅ PERSISTED - NO #[serde(skip)]

    // EPHEMERAL RENDERING FIELDS - NOT PERSISTED ❌
    #[serde(skip)]
    pub x: f32,                          // ❌ NOT PERSISTED
    #[serde(skip)]
    pub y: f32,                          // ❌ NOT PERSISTED
    #[serde(skip)]
    pub w: f32,                          // ❌ NOT PERSISTED
    #[serde(skip)]
    pub h: f32,                          // ❌ NOT PERSISTED
    #[serde(skip)]
    pub bbox: (f32, f32, f32, f32),      // ❌ NOT PERSISTED
    #[serde(skip)]
    pub hit: (f32, f32, f32, f32),       // ❌ NOT PERSISTED
}
```

**Key Point:** Only fields with `#[serde(skip)]` are excluded from serialization. The `octave` and `slur_indicator` fields have NO skip annotation, so they are included in persistence.

## Data Flow Architecture

```
User Action (Alt+U/M/L for octave, Alt+S for slur)
    ↓
JavaScript Event Handler
    ↓
WASM API Call (applyOctave / applySlur)
    ↓
WASM Modifies Cell Data (octave, slur_indicator)
    ↓
WASM Returns Updated Cells
    ↓
JavaScript Replaces Document Cells
    ↓
Render (JS reads octave/slur for visual display)
    ↓
Serialize (Rust excludes x,y,w,h,bbox,hit)
    ↓
Persistent Model Display (shows octave, slur_indicator)
```

## Result

### Persistent Model Will Show (Example):
```yaml
staves:
  - line:
    - grapheme: "1"
      kind: 1                  # PitchedElement
      lane: 1                  # Letter
      col: 0
      flags: 0
      pitch_code: null
      pitch_system: null
      octave: 1                # ✅ PRESENT - Upper octave (+1)
      slur_indicator: 1        # ✅ PRESENT - SlurStart
      # x, y, w, h, bbox, hit NOT included ✅

    - grapheme: "2"
      kind: 1
      lane: 1
      col: 1
      octave: null             # ✅ PRESENT - No octave marking
      slur_indicator: 2        # ✅ PRESENT - SlurEnd
```

**Note:** The `octave` field will ALWAYS appear in the persistent model (as `null`, `0`, `-1`, or `1`), because it does NOT have `#[serde(skip)]`.

### Ephemeral Model Will Show:
```yaml
staves:
  - line:
    - grapheme: "1"
      # ... all fields including x, y, w, h ...
```

## Summary

✅ **JavaScript never sets octave or slur data** - only calls WASM APIs
✅ **WASM is the single source of truth** for musical data modifications
✅ **Ephemeral rendering fields are excluded** from persistent storage
✅ **Octave and slur data ARE INCLUDED** in the persistent model ⭐

The architecture correctly separates:
- **Musical data** (octave, slur) - managed by WASM, **PERSISTED** ✅
- **Rendering data** (x, y, w, h) - calculated by JS, **EPHEMERAL** ❌

## Verification Checklist

To verify octave appears in persistent model:
1. Type some notes: `123`
2. Select the notes with Shift+Arrow keys
3. Press `Alt+U` to apply upper octave
4. Open the **Persistent Model** tab
5. You should see `octave: 1` on those cells

Example output:
```yaml
line:
  - grapheme: "1"
    octave: 1        # ← This field WILL appear
    slur_indicator: 0
    # x, y, w, h will NOT appear
```
