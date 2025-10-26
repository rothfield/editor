# Data Model: Music Notation Ornament Support

**Feature**: 006-music-notation-ornament
**Date**: 2025-10-25
**Phase**: 1 (Design & Contracts)

## Overview

This document defines the data structures, enums, and state required to implement ornament support in the music notation editor. The design follows the "tokens in stream" principle: ornaments are first-class tokens in the linear Cell sequence, marked by indicator variants that implicitly encode position type. Attachment to parent notes is computed algorithmically at render/export time, not stored in the editing model.

---

## Core Entities

### 1. OrnamentIndicator Enum (MODIFIED)

**Location**: `src/models/elements.rs`

**Current Definition** (3 variants):
```rust
#[repr(u8)]
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum OrnamentIndicator {
    None = 0,
    OrnamentStart = 1,
    OrnamentEnd = 2,
}
```

**New Definition** (6 variants):
```rust
#[repr(u8)]
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub enum OrnamentIndicator {
    /// No ornament indicator (default state)
    None = 0,

    /// Start of before-position ornament span (attaches to first token to right)
    OrnamentBeforeStart = 1,

    /// End of before-position ornament span
    OrnamentBeforeEnd = 2,

    /// Start of after-position ornament span (attaches to last token to left) - DEFAULT
    OrnamentAfterStart = 3,

    /// End of after-position ornament span
    OrnamentAfterEnd = 4,

    /// Start of on-top-position ornament span (attaches to nearest token)
    OrnamentOnTopStart = 5,

    /// End of on-top-position ornament span
    OrnamentOnTopEnd = 6,
}
```

**Methods** (add to impl block):
```rust
impl OrnamentIndicator {
    /// Check if this indicator marks the start of an ornament span
    pub fn is_start(&self) -> bool {
        matches!(
            self,
            OrnamentIndicator::OrnamentBeforeStart
                | OrnamentIndicator::OrnamentAfterStart
                | OrnamentIndicator::OrnamentOnTopStart
        )
    }

    /// Check if this indicator marks the end of an ornament span
    pub fn is_end(&self) -> bool {
        matches!(
            self,
            OrnamentIndicator::OrnamentBeforeEnd
                | OrnamentIndicator::OrnamentAfterEnd
                | OrnamentIndicator::OrnamentOnTopEnd
        )
    }

    /// Get the position type for this indicator
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

    /// Check if start/end indicators match (form a valid pair)
    pub fn matches(&self, other: &OrnamentIndicator) -> bool {
        match (self, other) {
            (OrnamentIndicator::OrnamentBeforeStart, OrnamentIndicator::OrnamentBeforeEnd) => true,
            (OrnamentIndicator::OrnamentAfterStart, OrnamentIndicator::OrnamentAfterEnd) => true,
            (OrnamentIndicator::OrnamentOnTopStart, OrnamentIndicator::OrnamentOnTopEnd) => true,
            _ => false,
        }
    }

    /// Convert to snake_case string for serialization (existing pattern)
    pub fn snake_case_name(&self) -> &'static str {
        match self {
            OrnamentIndicator::None => "none",
            OrnamentIndicator::OrnamentBeforeStart => "ornament_before_start",
            OrnamentIndicator::OrnamentBeforeEnd => "ornament_before_end",
            OrnamentIndicator::OrnamentAfterStart => "ornament_after_start",
            OrnamentIndicator::OrnamentAfterEnd => "ornament_after_end",
            OrnamentIndicator::OrnamentOnTopStart => "ornament_on_top_start",
            OrnamentIndicator::OrnamentOnTopEnd => "ornament_on_top_end",
        }
    }
}
```

**Serialization** (preserve existing custom serialization pattern):
```rust
impl Serialize for OrnamentIndicator {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeStruct;
        let mut state = serializer.serialize_struct("OrnamentIndicator", 2)?;
        state.serialize_field("name", &self.snake_case_name())?;
        state.serialize_field("value", &(*self as u8))?;
        state.end()
    }
}
```

---

### 2. OrnamentPositionType Enum (NEW)

**Location**: `src/models/elements.rs`

**Purpose**: Helper enum for algorithmic position handling (not stored in Cell, derived from indicator).

```rust
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum OrnamentPositionType {
    /// Ornament appears before (left of) parent note
    Before,

    /// Ornament appears after (right of) parent note - DEFAULT
    After,

    /// Ornament appears on top of (above) parent note
    OnTop,
}
```

---

### 3. Cell Struct (MODIFIED)

**Location**: `src/models/core.rs`

**Current Definition** (includes `ornament_indicator: OrnamentIndicator`):
```rust
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Cell {
    pub text: String,
    pub pitch_code: Option<PitchCode>,
    pub ornament_indicator: OrnamentIndicator,
    pub slur_indicator: SlurIndicator,
    // ... other fields
}
```

**Changes Required**: None to struct definition, but add helper method:

```rust
impl Cell {
    /// Check if this cell is part of an ornament span (rhythm-transparent)
    pub fn is_rhythm_transparent(&self) -> bool {
        !matches!(self.ornament_indicator, OrnamentIndicator::None)
    }

    /// Check if this cell is an ornament content cell (between start/end indicators)
    pub fn is_ornament_content(&self) -> bool {
        // Ornament content cells have pitch/text but no indicator (or are within span)
        // This is determined during parsing/attachment resolution
        // For now, rhythm-transparent is sufficient
        self.is_rhythm_transparent()
    }
}
```

**No New Fields Required**: Existing `ornament_indicator` field is sufficient.

---

### 4. OrnamentSpan Struct (NEW - Ephemeral)

**Location**: `src/parse/tokens.rs` or `src/renderers/layout_engine.rs`

**Purpose**: Temporary structure for attachment resolution and rendering (NOT serialized to JSON).

```rust
#[derive(Debug, Clone)]
pub struct OrnamentSpan {
    /// Starting index in cell array (OrnamentXxxStart indicator)
    pub start_index: usize,

    /// Ending index in cell array (OrnamentXxxEnd indicator)
    pub end_index: usize,

    /// Cells contained within the span (between start/end)
    pub content_cells: Vec<Cell>,

    /// Position type (derived from indicator variant)
    pub position_type: OrnamentPositionType,

    /// Index of anchor token (computed during attachment resolution)
    pub anchor_index: Option<usize>,
}

impl OrnamentSpan {
    /// Create span from cell slice and start/end indices
    pub fn from_cells(
        cells: &[Cell],
        start_index: usize,
        end_index: usize,
    ) -> Result<Self, String> {
        if start_index >= end_index || end_index > cells.len() {
            return Err(format!(
                "Invalid ornament span indices: start={}, end={}",
                start_index, end_index
            ));
        }

        let start_indicator = cells[start_index].ornament_indicator;
        let end_indicator = cells[end_index].ornament_indicator;

        if !start_indicator.is_start() || !end_indicator.is_end() {
            return Err("Invalid ornament span: start/end indicators mismatch".to_string());
        }

        if !start_indicator.matches(&end_indicator) {
            return Err("Invalid ornament span: position type mismatch".to_string());
        }

        let position_type = start_indicator
            .position_type()
            .ok_or("Invalid ornament indicator")?;

        let content_cells = cells[(start_index + 1)..end_index].to_vec();

        Ok(OrnamentSpan {
            start_index,
            end_index,
            content_cells,
            position_type,
            anchor_index: None, // Computed later
        })
    }
}
```

---

### 5. OrnamentGroups Struct (NEW - Ephemeral)

**Location**: `src/renderers/layout_engine.rs`

**Purpose**: Group ornaments by position for a single anchor token (used during rendering/export).

```rust
#[derive(Debug, Clone, Default)]
pub struct OrnamentGroups {
    /// Ornaments positioned before (left of) anchor
    pub before: Vec<OrnamentSpan>,

    /// Ornaments positioned after (right of) anchor
    pub after: Vec<OrnamentSpan>,

    /// Ornaments positioned on top (above) anchor
    pub on_top: Vec<OrnamentSpan>,
}

impl OrnamentGroups {
    /// Check if any ornaments exist for this anchor
    pub fn is_empty(&self) -> bool {
        self.before.is_empty() && self.after.is_empty() && self.on_top.is_empty()
    }

    /// Get total ornament count
    pub fn count(&self) -> usize {
        self.before.len() + self.after.len() + self.on_top.len()
    }
}
```

---

### 6. AttachmentMap Type (NEW - Ephemeral)

**Location**: `src/renderers/layout_engine.rs`

**Purpose**: Map anchor token indices to their grouped ornaments.

```rust
use std::collections::HashMap;

/// Map of anchor token index → grouped ornaments
pub type AttachmentMap = HashMap<usize, OrnamentGroups>;
```

---

## State Management

### JavaScript State (Edit Mode)

**Location**: `src/js/editor.js`

```javascript
class Editor {
    constructor() {
        // ... existing fields

        // NEW: Ornament edit mode state
        this.ornamentEditMode = false; // false = floating layout, true = inline layout
    }

    /**
     * Toggle ornament edit mode (inline ↔ floating layout)
     */
    toggleOrnamentEditMode() {
        this.ornamentEditMode = !this.ornamentEditMode;

        // Recompute layout with new mode
        this.recomputeLayout();

        // Re-render with updated styling
        this.render();

        // Log performance
        console.log(`Ornament edit mode: ${this.ornamentEditMode ? 'ON (inline)' : 'OFF (floating)'}`);
    }

    /**
     * Recompute layout using WASM with current edit mode
     */
    recomputeLayout() {
        const startTime = performance.now();

        // Call WASM layout function with edit mode parameter
        const layoutData = wasmModule.compute_layout(
            JSON.stringify(this.cells),
            this.ornamentEditMode
        );

        const duration = performance.now() - startTime;
        if (duration > 100) {
            console.warn(`⚠️ Layout computation took ${duration.toFixed(2)}ms (target: < 100ms)`);
        }

        this.layoutData = JSON.parse(layoutData);
    }
}
```

---

## Algorithms

### Attachment Resolution Algorithm

**Location**: `src/renderers/layout_engine.rs`

**Function Signature**:
```rust
pub fn resolve_ornament_attachments(cells: &[Cell]) -> AttachmentMap
```

**Algorithm**:
```rust
use std::collections::HashMap;

pub fn resolve_ornament_attachments(cells: &[Cell]) -> AttachmentMap {
    let mut attachment_map: AttachmentMap = HashMap::new();

    // Step 1: Identify all ornament spans
    let spans = extract_ornament_spans(cells);

    // Step 2: For each span, compute anchor index based on position type
    for mut span in spans {
        let anchor_index = match span.position_type {
            OrnamentPositionType::Before => {
                // Attach to first non-ornament token to RIGHT
                find_anchor_right(cells, span.end_index)
            }
            OrnamentPositionType::After => {
                // Attach to first non-ornament token to LEFT
                find_anchor_left(cells, span.start_index)
            }
            OrnamentPositionType::OnTop => {
                // Attach to NEAREST non-ornament token (left or right, prefer left if equal)
                find_anchor_nearest(cells, span.start_index, span.end_index)
            }
        };

        // Step 3: Group span by anchor and position type
        if let Some(anchor_idx) = anchor_index {
            span.anchor_index = Some(anchor_idx);

            let groups = attachment_map.entry(anchor_idx).or_insert_with(OrnamentGroups::default);

            match span.position_type {
                OrnamentPositionType::Before => groups.before.push(span),
                OrnamentPositionType::After => groups.after.push(span),
                OrnamentPositionType::OnTop => groups.on_top.push(span),
            }
        } else {
            // Orphaned ornament: log warning
            web_sys::console::warn_1(&format!(
                "⚠️ Orphaned ornament span at indices {}-{} (no anchor found)",
                span.start_index, span.end_index
            ).into());
        }
    }

    attachment_map
}

/// Extract all ornament spans from cell array
fn extract_ornament_spans(cells: &[Cell]) -> Vec<OrnamentSpan> {
    let mut spans = Vec::new();
    let mut i = 0;

    while i < cells.len() {
        if cells[i].ornament_indicator.is_start() {
            // Find matching end indicator
            if let Some(end_idx) = find_matching_end(cells, i) {
                if let Ok(span) = OrnamentSpan::from_cells(cells, i, end_idx) {
                    spans.push(span);
                }
                i = end_idx + 1; // Skip past end indicator
            } else {
                i += 1; // Unmatched start, continue
            }
        } else {
            i += 1;
        }
    }

    spans
}

/// Find matching end indicator for start indicator at index
fn find_matching_end(cells: &[Cell], start_index: usize) -> Option<usize> {
    let start_indicator = cells[start_index].ornament_indicator;

    for (offset, cell) in cells[(start_index + 1)..].iter().enumerate() {
        if start_indicator.matches(&cell.ornament_indicator) {
            return Some(start_index + 1 + offset);
        }
    }

    None
}

/// Find first non-ornament token to right of index
fn find_anchor_right(cells: &[Cell], from_index: usize) -> Option<usize> {
    for (offset, cell) in cells[(from_index + 1)..].iter().enumerate() {
        if !cell.is_rhythm_transparent() {
            return Some(from_index + 1 + offset);
        }
    }
    None
}

/// Find first non-ornament token to left of index
fn find_anchor_left(cells: &[Cell], from_index: usize) -> Option<usize> {
    for idx in (0..from_index).rev() {
        if !cells[idx].is_rhythm_transparent() {
            return Some(idx);
        }
    }
    None
}

/// Find nearest non-ornament token (prefer left if equidistant)
fn find_anchor_nearest(cells: &[Cell], start_index: usize, end_index: usize) -> Option<usize> {
    let left = find_anchor_left(cells, start_index);
    let right = find_anchor_right(cells, end_index);

    match (left, right) {
        (Some(l), Some(r)) => {
            let left_dist = start_index - l;
            let right_dist = r - end_index;
            if left_dist <= right_dist {
                Some(l)
            } else {
                Some(r)
            }
        }
        (Some(l), None) => Some(l),
        (None, Some(r)) => Some(r),
        (None, None) => None,
    }
}
```

---

### Beat Derivation Exclusion

**Location**: `src/parse/beats.rs`

**Modification**:
```rust
pub fn derive_beats(cells: &[Cell]) -> Vec<Beat> {
    // NEW: Filter out rhythm-transparent cells (ornaments)
    let rhythmic_cells: Vec<&Cell> = cells
        .iter()
        .filter(|cell| !cell.is_rhythm_transparent())
        .collect();

    // Existing beat derivation logic operates on rhythmic_cells only
    // ... (no other changes needed)
}
```

---

## Validation Rules

### Parsing Validation

**Location**: `src/parse/tokens.rs`

```rust
/// Validate ornament spans in cell array
pub fn validate_ornament_spans(cells: &[Cell]) -> Result<(), Vec<String>> {
    let mut errors = Vec::new();
    let mut open_indicators = Vec::new();

    for (i, cell) in cells.iter().enumerate() {
        let indicator = cell.ornament_indicator;

        if indicator.is_start() {
            open_indicators.push((i, indicator));
        } else if indicator.is_end() {
            if let Some((start_idx, start_indicator)) = open_indicators.pop() {
                if !start_indicator.matches(&indicator) {
                    errors.push(format!(
                        "Mismatched ornament indicators at indices {} and {}",
                        start_idx, i
                    ));
                }
            } else {
                errors.push(format!("Unmatched end indicator at index {}", i));
            }
        }
    }

    if !open_indicators.is_empty() {
        for (idx, _) in open_indicators {
            errors.push(format!("Unmatched start indicator at index {}", idx));
        }
    }

    if errors.is_empty() {
        Ok(())
    } else {
        Err(errors)
    }
}
```

---

## Serialization Format

### JSON Representation (Cell with Ornament Indicator)

```json
{
  "text": "2",
  "pitch_code": {
    "step": "D",
    "octave": 4,
    "accidental": null
  },
  "ornament_indicator": {
    "name": "ornament_before_start",
    "value": 1
  },
  "slur_indicator": {
    "name": "none",
    "value": 0
  }
}
```

### Full Example Document (with ornaments)

```json
{
  "cells": [
    {
      "text": "<",
      "pitch_code": null,
      "ornament_indicator": {"name": "ornament_before_start", "value": 1},
      "slur_indicator": {"name": "none", "value": 0}
    },
    {
      "text": "2",
      "pitch_code": {"step": "D", "octave": 4, "accidental": null},
      "ornament_indicator": {"name": "none", "value": 0},
      "slur_indicator": {"name": "none", "value": 0}
    },
    {
      "text": "3",
      "pitch_code": {"step": "E", "octave": 4, "accidental": null},
      "ornament_indicator": {"name": "none", "value": 0},
      "slur_indicator": {"name": "none", "value": 0}
    },
    {
      "text": ">",
      "pitch_code": null,
      "ornament_indicator": {"name": "ornament_before_end", "value": 2},
      "slur_indicator": {"name": "none", "value": 0}
    },
    {
      "text": "1",
      "pitch_code": {"step": "C", "octave": 4, "accidental": null},
      "ornament_indicator": {"name": "none", "value": 0},
      "slur_indicator": {"name": "none", "value": 0}
    }
  ]
}
```

**Interpretation**: Grace notes 2 and 3 appear before note 1.

---

## Summary

### New Data Structures
- `OrnamentIndicator` enum: Expanded from 3 to 6 variants (position encoded in variant names)
- `OrnamentPositionType` enum: Helper for algorithmic position handling
- `OrnamentSpan` struct: Ephemeral structure for attachment resolution
- `OrnamentGroups` struct: Groups ornaments by position for rendering/export
- `AttachmentMap` type: Maps anchor indices to grouped ornaments

### Modified Structures
- `Cell` struct: Add `is_rhythm_transparent()` helper method (no new fields)

### Key Algorithms
- **Attachment Resolution**: Single-pass O(n) scan to group ornaments by anchor
- **Beat Derivation Exclusion**: Filter rhythm-transparent cells before beat counting
- **Span Validation**: Ensure balanced start/end indicator pairs

### State Management
- **JavaScript**: `ornamentEditMode` boolean flag in Editor class
- **WASM**: `edit_mode` parameter passed to layout functions (no persistent state)

**Phase 1 Data Model Complete**: Ready to generate API contracts.
