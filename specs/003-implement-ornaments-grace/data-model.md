# Phase 1: Data Model & Entities

**Date**: 2025-10-22
**Status**: Design Complete
**Research**: [research.md](research.md) (Phase 0 complete)

---

## Overview

Ornaments are sequences of pitches (pitch+) that embellish primary notes. They are stored separately from the main note cell sequence and rendered as CSS-positioned DOM elements at 75% font size.

---

## Core Entities

### 1. Ornament (Root Aggregate)

**Purpose**: Represents a complete ornament - a sequence of decorative pitches attached to a single target note.

**Fields:**

```rust
pub struct Ornament {
    /// Unique identifier (within line scope)
    pub id: String,

    /// Sequence of pitches in the ornament (minimum 1)
    pub pitches: Vec<OrnamentPitch>,

    /// Position relative to target note: Before | After
    pub placement: OrnamentPlacement,

    /// Reference to target note (cell index)
    pub target_cell_index: usize,

    /// Calculated x,y position for rendering (0.1px precision)
    pub position: OrnamentPosition,

    /// Bounding box for hit detection and UI interaction
    pub bounding_box: BoundingBox,

    /// Ornament symbol (for rendering, e.g., "Sa", "R#", etc.)
    pub display_symbol: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OrnamentPlacement {
    Before = 0,  // Before main note (grace note, before beat)
    After = 1,   // After main note (after-grace)
}
```

**Validation Rules:**
- `pitches.len() >= 1` - Must have at least one pitch
- `target_cell_index < line.cells.len()` - Target must be valid cell
- `target_cell_index >= 0` - No negative indices
- Each `OrnamentPitch` must be valid (see below)
- `position` and `bounding_box` must be consistent (calculated from pitches)

**State Transitions:**
- **Created** → User opens dialog, selects "New Ornament"
- **Editing** → Dialog open, user modifying pitches/placement
- **Saved** → User closes dialog with confirmation
- **Deleted** → User removes ornament from document

**Relationships:**
- **1→N**: One Ornament contains many OrnamentPitches
- **N→1**: Many Ornaments target one Cell (multiple ornaments on same note)
- **Child**: OrnamentPosition, BoundingBox (calculated from pitches)

---

### 2. OrnamentPitch (Child Entity)

**Purpose**: Individual pitch within an ornament sequence.

**Fields:**

```rust
pub struct OrnamentPitch {
    /// Pitch name in normalized form (e.g., "D", "E", "F#", "Bb")
    pub pitch_name: String,

    /// Accidental: None, Sharp, Flat (stored separately for rendering)
    pub accidental: Accidental,

    /// Octave: relative to main note (0 = same, 1 = upper, -1 = lower)
    pub octave: i8,

    /// Display symbol for this pitch (e.g., "Sa", "G#", "1b")
    pub symbol: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Accidental {
    None,   // Natural
    Sharp,  // # symbol
    Flat,   // b symbol
}
```

**Validation Rules:**
- `pitch_name` must be valid pitch in current notation system (S, R, G, M, P, etc.)
- `octave` in range [-2, 2] (ornaments don't jump multiple octaves)
- `symbol` must match `pitch_name` + `accidental` (consistency check)
- Accidental symbols rendered with special Bravura font

**Relationships:**
- **Parent**: OrnamentPitch belongs to exactly one Ornament
- **Child**: None (leaf entity)

---

### 3. OrnamentPosition (Calculated Value)

**Purpose**: Precise x,y coordinates for rendering ornament on screen.

**Fields:**

```rust
pub struct OrnamentPosition {
    /// X coordinate (pixels, 0.1px precision)
    pub x: f32,

    /// Y coordinate (pixels, 0.1px precision)
    pub y: f32,

    /// Width of rendered ornament (pixels)
    pub width: f32,

    /// Height of rendered ornament (pixels)
    pub height: f32,
}

impl OrnamentPosition {
    /// Calculate position based on target note and font size
    pub fn calculate(
        target_x: f32,
        target_y: f32,
        font_size: f32,
        placement: OrnamentPlacement,
        pitch_count: usize,
    ) -> Self {
        let ornament_size = font_size * 0.75;  // 75% of base

        let y = match placement {
            OrnamentPlacement::Before => target_y - (ornament_size * pitch_count as f32),
            OrnamentPlacement::After => target_y + (font_size * 0.1),
        };

        Self {
            x: (target_x * 10.0).round() / 10.0,  // 0.1px precision
            y: (y * 10.0).round() / 10.0,
            width: ornament_size,
            height: ornament_size * pitch_count as f32,
        }
    }
}
```

**Calculation Rules:**
- X = target note's x-coordinate (overlay vertically, no horizontal shift)
- Y = target note's y-coordinate ± vertical offset based on placement and pitch count
- Width = 75% of base font size
- Height = 75% of base font × number of pitches
- All coordinates: 0.1px precision (rounded to 1 decimal place)

---

### 4. BoundingBox (Calculated Value)

**Purpose**: Rectangular bounds around entire rendered ornament for hit detection and UI interaction.

**Fields:**

```rust
pub struct BoundingBox {
    /// Top-left X coordinate (pixels)
    pub left: f32,

    /// Top-left Y coordinate (pixels)
    pub top: f32,

    /// Width of box (pixels)
    pub width: f32,

    /// Height of box (pixels)
    pub height: f32,
}

impl BoundingBox {
    /// Tight bounding box from position and content
    pub fn from_position(position: &OrnamentPosition, max_pitch_width: f32) -> Self {
        Self {
            left: position.x,
            top: position.y,
            width: max_pitch_width + 2.0,  // Small padding for accidentals
            height: position.height,
        }
    }

    /// Check if point is within bounding box
    pub fn contains(&self, x: f32, y: f32) -> bool {
        x >= self.left && x <= self.left + self.width &&
        y >= self.top && y <= self.top + self.height
    }
}
```

**Calculation Rules:**
- Derived from OrnamentPosition and pitch symbols
- Width accounts for widest pitch symbol + accidentals (tight fit, minimal padding)
- Height = OrnamentPosition.height
- Used for: mouse hover, selection, future click handling

---

## Collections & Aggregates

### OrnamentSequence (Collection)

**Purpose**: Store all ornaments for a single line-element.

```rust
pub struct OrnamentSequence {
    /// All ornaments, indexed by ID
    pub ornaments: HashMap<String, Ornament>,

    /// Ordering: ornament appears in order added
    pub order: Vec<String>,
}

impl OrnamentSequence {
    pub fn add(&mut self, ornament: Ornament) -> Result<String, String> {
        let id = ornament.id.clone();
        self.ornaments.insert(id.clone(), ornament);
        self.order.push(id.clone());
        Ok(id)
    }

    pub fn remove(&mut self, id: &str) -> Result<(), String> {
        self.ornaments.remove(id);
        self.order.retain(|oid| oid != id);
        Ok(())
    }

    pub fn get_for_cell(&self, cell_index: usize) -> Vec<&Ornament> {
        self.ornaments.values()
            .filter(|o| o.target_cell_index == cell_index)
            .collect()
    }
}
```

---

## Storage & Persistence

### JSON Serialization Format

Ornaments embedded in line-element document structure:

```json
{
  "line": {
    "cells": [
      { "pitch_code": "S", "x": 100, ... },
      { "pitch_code": "R", "x": 150, ... }
    ],
    "ornaments": [
      {
        "id": "orn-1",
        "pitches": [
          { "pitch_name": "D", "accidental": "Sharp", "octave": 0, "symbol": "R#" }
        ],
        "placement": 0,
        "target_cell_index": 0,
        "position": { "x": 100.0, "y": -24.0, "width": 24.0, "height": 24.0 },
        "bounding_box": { "left": 100.0, "top": -24.0, "width": 26.0, "height": 24.0 },
        "display_symbol": "R#"
      }
    ]
  }
}
```

**Persistence Rules:**
- Ornaments stored with line-element (no separate tables/files)
- Positions recalculated on load (not persisted, only calculated on render)
- Bounding boxes recalculated on render
- Display symbols derived from pitches (not separately stored, consistency check)

---

## WASM API Signatures

### Parsing & Validation

```rust
/// Parse ornament text and create OrnamentData
#[wasm_bindgen]
pub fn parse_ornament(
    text: &str,
    base_pitch: u8,
) -> Result<OrnamentData, JsValue>;

/// Validate ornament against current document state
#[wasm_bindgen]
pub fn validate_ornament(
    ornament: &OrnamentData,
    target_cell_index: usize,
    line_length: usize,
) -> Result<(), JsValue>;
```

### Positioning & Rendering

```rust
/// Calculate layout for ornament
#[wasm_bindgen]
pub fn calculate_ornament_layout(
    ornament_text: &str,
    base_x: f32,
    base_y: f32,
    font_size: f32,
) -> Result<OrnamentPosition, JsValue>;

/// Calculate bounding box for ornament
#[wasm_bindgen]
pub fn calculate_ornament_bbox(
    position: &OrnamentPosition,
    pitches: &JsValue,  // Vec<OrnamentPitch> via serde_wasm_bindgen
) -> Result<BoundingBox, JsValue>;
```

### Export

```rust
/// Export ornament to MusicXML <grace> element
#[wasm_bindgen]
pub fn export_ornament_musicxml(
    ornament: &JsValue,
) -> Result<String, JsValue>;

/// Export ornament to Lilypond grace note syntax
#[wasm_bindgen]
pub fn export_ornament_lilypond(
    ornament: &JsValue,
) -> Result<String, JsValue>;
```

---

## Validation & Constraints

### Ornament-Level Constraints

| Constraint | Validation | Error Message |
|-----------|-----------|---------------|
| Min pitches | `pitches.len() >= 1` | "Ornament must have at least one pitch" |
| Max pitches | `pitches.len() <= 10` | "Ornament has too many pitches (max 10)" |
| Valid target | `target_cell_index < cells.len()` | "Target note index out of bounds" |
| No dashes | `cell[target] != Dash` | "Cannot attach ornament to rest/dash" |
| Placement | `placement ∈ {Before, After}` | "Invalid placement (before/after)" |

### Pitch-Level Constraints

| Constraint | Validation | Error Message |
|-----------|-----------|---------------|
| Valid pitch | `pitch_name ∈ notation_pitches` | "Invalid pitch name for notation system" |
| Valid accidental | `accidental ∈ {None, Sharp, Flat}` | "Invalid accidental" |
| Valid octave | `octave ∈ [-2, 2]` | "Octave out of reasonable range" |
| Symbol match | `symbol == format_symbol(pitch_name, accidental)` | "Symbol doesn't match pitch data" |

---

## State Machine (Life Cycle)

```
┌─────────────┐
│   Created   │  User selects "New Ornament"
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Editing   │  Dialog open, user modifying
└──────┬──────┘
       │
       ├─► (Save) ──► ┌────────┐
       │              │ Saved  │  In document
       │              └────────┘
       │
       └─► (Cancel) ──► (Discarded - no state)
```

---

## Related Entities (External References)

### LineElement

Ornaments are children of LineElement:

```rust
pub struct LineElement {
    pub cells: Vec<Cell>,
    pub ornaments: OrnamentSequence,  // NEW: Contains all ornaments for this line
    // ... other fields
}
```

### Cell

Target reference:

```rust
pub struct Cell {
    pub pitch_code: String,
    pub x: f32,  // Used for position calculation
    pub y: f32,  // Used for position calculation
    // ... other fields
}
```

---

## Summary Table

| Entity | Type | Parent | Fields | Validation |
|--------|------|--------|--------|-----------|
| **Ornament** | Aggregate | LineElement | pitches, placement, target_cell, position, bbox | >=1 pitch, valid target |
| **OrnamentPitch** | Value | Ornament | pitch_name, accidental, octave, symbol | Valid pitch/octave |
| **OrnamentPosition** | Calculated | Ornament | x, y, width, height | 0.1px precision |
| **BoundingBox** | Calculated | Ornament | left, top, width, height | Tight fit |
| **OrnamentSequence** | Collection | LineElement | ornaments, order | No duplicates |

---

**Next**: API Contracts (`contracts/`)
