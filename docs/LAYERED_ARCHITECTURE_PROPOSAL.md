# Layered Architecture Proposal
## Text-First Design for Music Notation Editor

**Date:** 2025-01-14
**Status:** Proposal
**Author:** Architecture Review

---

## Executive Summary

This document proposes refactoring the music notation editor from a **Cell-based architecture** to a **text-first layered architecture**. The goal is to separate concerns, enable text editor features, and make the system more maintainable and extensible.

**Key Changes:**
- Text buffer becomes the source of truth (not Cells)
- Musical semantics become a stateless interpretation layer
- Cells become ephemeral views (generated on-demand for rendering)
- Annotations (ornaments, slurs) track automatically via position updates

**Expected Benefits:**
- ✅ Simpler undo/redo (text diffs instead of Cell arrays)
- ✅ Standard text editor features work (find/replace, multi-cursor, vim mode)
- ✅ Swappable text core (can use Rope, CRDT, etc.)
- ✅ Smaller memory footprint (text + annotations vs. Cell arrays)
- ✅ Better testability (test with string literals, not mock Cells)
- ✅ Clean separation of concerns (each layer has one job)

**Recommendation:** Start with **proof-of-concept** (implement one feature using new architecture) before committing to full refactor.

---

## Current Architecture: Cell-Based Model

### How It Works Today

The editor stores musical notation as **Cells** - structured objects that bundle content, semantics, layout, and UI state:

```rust
// src/models/core.rs
pub struct Cell {
    // Content
    pub char: String,              // What to display: "1", "C#", "||", etc.

    // Musical semantics
    pub kind: ElementKind,         // Pitched, Unpitched, Barline, Rest, etc.
    pub pitch_code: Option<PitchCode>,  // Sharp, Flat, Natural, etc.
    pub pitch_system: Option<PitchSystem>,  // Number, Western, Sargam
    pub octave: i8,                // -2, -1, 0, +1, +2

    // Annotations
    pub slur_indicator: SlurIndicator,  // SlurStart, SlurEnd, None
    pub ornament: Option<Ornament>,     // Trill, Mordent, Turn, etc.

    // Layout (ephemeral, calculated at render time)
    pub x: f32, pub y: f32,        // Screen position
    pub w: f32, pub h: f32,        // Dimensions
    pub bbox: (f32, f32, f32, f32), // Bounding box
    pub hit: (f32, f32, f32, f32),  // Hit testing area

    // UI state
    pub flags: u8,                 // Selected, focused, head-marker
    pub col: usize,                // Column index
}

pub struct Line {
    pub cells: Vec<Cell>,  // Cells ARE the document
}

pub struct Document {
    pub lines: Vec<Line>,
}
```

### Data Flow

```
User types '1'
    ↓
Parse character → Create Cell
    ↓
Insert Cell into document.lines[0].cells
    ↓
Render Cells to DOM
    ↓
Export: Cells → IR → MusicXML → LilyPond/OSMD
```

### Key Characteristics

1. **Cell is the primitive** - Everything operates on Cells
2. **Tightly coupled** - Content, semantics, layout, and UI state bundled together
3. **Stateful** - Cells are stored, not generated
4. **Large data structures** - Each Cell carries 15+ fields
5. **Custom operations** - Text editing requires Cell-aware code

---

## Problems with Current Architecture

### 1. Mixed Concerns

Cells bundle everything:
- **Content** (what to display)
- **Semantics** (musical meaning)
- **Layout** (where to draw)
- **UI state** (selection, focus)

**Impact:** Changing one concern requires touching Cell definition, causing ripple effects across the codebase.

### 2. Large Memory Footprint

**Example document:** `"1 2 3 4"` (4 notes)

**Current storage:**
```rust
vec![
    Cell { char: "1", kind: Pitched, pitch_code: Natural1, octave: 0,
           x: 10.0, y: 20.0, w: 12.0, h: 18.0,
           bbox: (10, 20, 22, 38), hit: (8, 18, 24, 40),
           flags: 0x02, col: 0, ... },
    // ... 3 more cells with ~15 fields each
]
```

**Size:** ~240 bytes per Cell × 4 = ~960 bytes

**Text-first storage:**
```rust
text: "1 2 3 4"  // 7 bytes
```

**Size:** 7 bytes (137x smaller)

### 3. Expensive Undo/Redo

**Current:** Must serialize entire Cell arrays
```javascript
undoStack.push(JSON.stringify(document.lines[0].cells));
```

For a 100-cell line: ~24KB per undo state.

**Impact:** Undo stack grows quickly, memory pressure, slow operations.

### 4. Can't Leverage Text Editor Features

Standard text operations don't work:

- ❌ **Find/replace:** Can't use regex on Cells
- ❌ **Multi-cursor:** Single cursor hard-coded
- ❌ **Rectangular selection:** No concept of text columns
- ❌ **Vim mode:** Can't reuse text motion libraries
- ❌ **Collaborative editing:** Can't use OT/CRDT algorithms designed for text

### 5. Circular Dependencies

```
Cell definition
    ↓ (depends on)
ElementKind, PitchCode, Ornament
    ↓ (used by)
Parser, Renderer, Exporter
    ↓ (operates on)
Cell
```

Everything depends on Cell, Cell depends on everything. Hard to change, hard to test.

### 6. Sync Issues

Multiple sources of truth:
- Cell.char (what's stored)
- Cell.pitch_code (semantic interpretation)
- Display glyph (what's rendered)

**Example bug:** Cell.char = "1#" but pitch_code = Natural (mismatch!)

### 7. Testing Complexity

**Test a transpose operation:**
```rust
#[test]
fn test_transpose() {
    let mut cells = vec![
        Cell {
            char: "1".to_string(),
            kind: ElementKind::Pitched,
            col: 0,
            flags: 0,
            pitch_code: Some(PitchCode::Natural1),
            pitch_system: Some(PitchSystem::Number),
            octave: 0,
            slur_indicator: SlurIndicator::None,
            ornament: None,
            x: 0.0, y: 0.0, w: 0.0, h: 0.0,  // Must provide layout!
            bbox: (0.0, 0.0, 0.0, 0.0),
            hit: (0.0, 0.0, 0.0, 0.0),
        },
        // ... repeat for every note
    ];
    transpose(&mut cells, Interval::MajorSecond);
    assert_eq!(cells[0].pitch_code, Some(PitchCode::Natural2));
}
```

50+ lines to test a simple operation. Most lines are boilerplate.

---

## Proposed Architecture: Four Layers

### Overview

```
┌──────────────────────────────────────┐
│ Layer 3: Export (IR → MusicXML)     │  Already well-designed
├──────────────────────────────────────┤
│ Layer 2: Musical Structure           │  Derived view
│          (beats, measures, events)   │  (calculate from text)
├──────────────────────────────────────┤
│ Layer 1: Glyph Semantics            │  Stateless mapping
│          (char ↔ pitch)              │  (lookup tables)
├──────────────────────────────────────┤
│ Layer 0: Text Editor Core           │  NEW: Pure text
│          (text buffer + cursor)      │  (no musical knowledge)
└──────────────────────────────────────┘
         │
         ├─ Annotations (ornaments, slurs)
         └─ Layout Cache (positions, bbox)
```

**Key Principle:** Each layer depends only on layers below it. No upward dependencies.

### Dependency Flow

```
Layer 0 (Text)
    ↓ knows Layer 0 exists
Layer 1 (Semantics)
    ↓ knows Layer 1 exists
Layer 2 (Structure)
    ↓ knows Layer 2 exists
Layer 3 (Export)

NO UPWARD ARROWS
```

---

## Layer 0: Text Editor Core

### Purpose
Provide basic text editing operations with no knowledge of musical notation.

### Interface

```rust
// src/text/buffer.rs
pub trait TextCore {
    fn get_line(&self, line: usize) -> &str;
    fn insert_char(&mut self, pos: TextPos, ch: char);
    fn delete_char(&mut self, pos: TextPos);
    fn replace_range(&mut self, range: TextRange, text: &str);
    fn undo(&mut self);
    fn redo(&mut self);
}
```

### Simple Implementation

```rust
pub struct SimpleBuffer {
    lines: Vec<String>,
    undo_stack: Vec<TextEdit>,
}

impl TextCore for SimpleBuffer {
    fn get_line(&self, line: usize) -> &str {
        &self.lines[line]
    }

    fn insert_char(&mut self, pos: TextPos, ch: char) {
        self.lines[pos.line].insert(pos.col, ch);
        self.undo_stack.push(TextEdit::Insert(pos, ch));
    }

    fn delete_char(&mut self, pos: TextPos) {
        let ch = self.lines[pos.line].remove(pos.col);
        self.undo_stack.push(TextEdit::Delete(pos, ch));
    }

    fn undo(&mut self) {
        if let Some(edit) = self.undo_stack.pop() {
            match edit {
                TextEdit::Insert(pos, _) => self.delete_char(pos),
                TextEdit::Delete(pos, ch) => self.insert_char(pos, ch),
            }
        }
    }
}
```

### Advanced Implementations (Future)

```rust
// For large documents
pub struct RopeBuffer {
    rope: xi_rope::Rope,
}

// For collaborative editing
pub struct CRDTBuffer {
    crdt: automerge::Text,
}

// All implement the same TextCore trait
```

**Benefit:** Swap implementations without changing upper layers.

---

## Layer 1: Glyph Semantics

### Purpose
Stateless mapping between text characters and musical meaning.

### Core Types

```rust
// src/glyphs/semantics.rs
pub struct GamutPitch {
    pub normalized: NormalizedPitch,  // Do, Re, Mi, Fa, Sol, La, Ti
    pub octave: i8,                   // -2, -1, 0, +1, +2
    pub accidental: Accidental,       // Natural, Sharp, Flat, etc.
}

pub enum NormalizedPitch {
    Do, Re, Mi, Fa, Sol, La, Ti
}

pub enum Accidental {
    Natural, Sharp, Flat, DoubleSharp, DoubleFlat
}
```

### Stateless Functions

```rust
// Parse character to musical meaning
pub fn char_to_pitch(ch: char, system: PitchSystem) -> Option<GamutPitch> {
    match (ch, system) {
        ('1', PitchSystem::Number) => Some(GamutPitch {
            normalized: NormalizedPitch::Do,
            octave: 0,
            accidental: Accidental::Natural,
        }),
        ('C', PitchSystem::Western) => Some(GamutPitch {
            normalized: NormalizedPitch::Do,
            octave: 0,
            accidental: Accidental::Natural,
        }),
        // ... lookup table for all chars
        _ => None,
    }
}

// Encode musical meaning to character
pub fn pitch_to_char(pitch: &GamutPitch, system: PitchSystem) -> char {
    // Inverse of char_to_pitch
    // Uses lookup tables from font_utils.rs
}
```

### Integration with Existing Font System

This layer **already partially exists** in `src/renderers/font_utils.rs`:
- `glyph_for_pitch(pitch, octave, system) → char`
- Lookup tables for all pitch systems
- Code point calculation for octaves and accidentals

**Refactoring needed:** Extract the semantic mapping logic (pitch ↔ char) from font rendering concerns.

---

## Layer 2: Musical Structure

### Purpose
Derive musical structures (beats, measures, events) from text + semantics.

### Core Types

```rust
// src/structure/line_analysis.rs
pub struct NoteToken {
    pub text_range: TextRange,        // Position in text
    pub gamut: GamutPitch,             // From Layer 1
    pub ornament: Option<Ornament>,    // From annotations
}

pub struct Beat {
    pub tokens: Vec<NoteToken>,
    pub text_range: TextRange,
}

pub struct Measure {
    pub beats: Vec<Beat>,
    pub text_range: TextRange,
}

pub struct LineAnalysis {
    pub measures: Vec<Measure>,
}
```

### Analysis Function

```rust
pub fn analyze_line(
    text: &str,
    annotations: &AnnotationLayer,
    system: PitchSystem
) -> LineAnalysis {
    let mut tokens = vec![];

    // Tokenize using Layer 1
    for (pos, ch) in text.char_indices() {
        if let Some(gamut) = char_to_pitch(ch, system) {
            // Merge annotation data
            let ornament = annotations.ornaments.get(&TextPos::new(0, pos)).cloned();

            tokens.push(NoteToken {
                text_range: TextRange::new(pos, pos + 1),
                gamut,
                ornament,
            });
        }
    }

    // Group into beats (spaces separate beats)
    let beats = group_by_beats(tokens);

    // Group into measures (barlines separate measures)
    let measures = group_by_measures(beats);

    LineAnalysis { measures }
}
```

### Relationship to Current IR Pipeline

This layer **replaces** parts of `src/renderers/musicxml/line_to_ir.rs` (the FSM that processes cells). Instead of processing Cells, it processes text + annotations.

---

## Layer 3: Export

### Purpose
Convert musical structures to interchange formats (MusicXML, LilyPond).

### Current Implementation (Keep)

```
LineAnalysis → IR (ExportLine, ExportMeasure, ExportEvent)
    ↓
MusicXML emission (emitter.rs, builder.rs)
    ↓
LilyPond conversion (musicxml_to_lilypond/)
```

**No changes needed.** This layer is already well-designed and format-agnostic.

**New input:** Instead of `line_to_ir(cells)`, it becomes `line_to_ir(text, annotations)`.

---

## Annotation Pattern: Metadata on Text

### Problem
Text is just characters. Where do ornaments, slurs, and other metadata live?

### Solution: Separate Annotation Layer

Store metadata **separately** from text, linked by positions:

```rust
// src/text/annotations.rs
pub struct AnnotationLayer {
    pub ornaments: BTreeMap<TextPos, Ornament>,  // Point annotations
    pub slurs: Vec<SlurSpan>,                    // Range annotations
    pub dynamics: BTreeMap<TextPos, Dynamic>,
}

pub struct SlurSpan {
    pub start: TextPos,
    pub end: TextPos,
}
```

### Example

```rust
// Text
text: "1 2 3 4"

// Annotations (separate)
ornaments: {
    TextPos(0, 0): Ornament::Trill,      // Trill on "1"
    TextPos(0, 4): Ornament::Mordent,    // Mordent on "3"
}

slurs: [
    SlurSpan { start: TextPos(0, 0), end: TextPos(0, 6) }  // Slur from "1" to "4"
]
```

### Automatic Position Tracking

When text changes, annotations **automatically update** their positions:

```rust
impl AnnotationLayer {
    pub fn on_insert(&mut self, pos: TextPos) {
        self.shift_after(pos, 1);  // Shift all annotations >= pos right by 1
    }

    pub fn on_delete(&mut self, pos: TextPos) {
        self.ornaments.remove(&pos);  // Remove annotation at deleted position
        self.shift_after(pos, -1);     // Shift remaining left by 1
    }

    fn shift_after(&mut self, pos: TextPos, delta: i32) {
        // For point annotations (ornaments)
        let shifted: Vec<_> = self.ornaments
            .iter()
            .filter(|(p, _)| **p >= pos)
            .map(|(p, o)| {
                let new_pos = TextPos {
                    line: p.line,
                    col: (p.col as i32 + delta) as usize,
                };
                (new_pos, o.clone())
            })
            .collect();

        for (old_pos, _) in shifted.iter() {
            self.ornaments.remove(old_pos);
        }
        for (new_pos, ornament) in shifted {
            self.ornaments.insert(new_pos, ornament);
        }

        // For range annotations (slurs)
        for slur in &mut self.slurs {
            if slur.start >= pos {
                slur.start.col = (slur.start.col as i32 + delta) as usize;
            }
            if slur.end >= pos {
                slur.end.col = (slur.end.col as i32 + delta) as usize;
            }
        }

        // Remove invalid slurs (where start >= end)
        self.slurs.retain(|s| s.start < s.end);
    }
}
```

### Example: Edit Tracking

**Initial state:**
```
text:      "1 2 3"
           0 1 2 3 4
ornaments: {0→Trill, 4→Mordent}
```

**Insert 'x' at position 2:**
```rust
buffer.insert_char(TextPos(0, 2), 'x');
annotations.on_insert(TextPos(0, 2));

// Result:
text:      "1 x2 3"
           0 1 2 3 4 5
ornaments: {0→Trill, 5→Mordent}
           (stayed)  (shifted right)
```

**Delete 'x' at position 2:**
```rust
buffer.delete_char(TextPos(0, 2));
annotations.on_delete(TextPos(0, 2));

// Result:
text:      "1 2 3"
           0 1 2 3 4
ornaments: {0→Trill, 4→Mordent}
           (back to original)
```

### Industry Standard Pattern

This is how all modern editors handle metadata:

| Editor | Text | Annotations |
|--------|------|-------------|
| **VS Code** | Plain text | Decorations API (highlights, errors) |
| **Google Docs** | Text | Comments, suggestions |
| **Prosemirror** | Document | Marks, decorations |
| **Jupyter** | Code cells | Cell metadata |
| **This editor** | "1 2 3" | Ornaments, slurs, dynamics |

---

## Cells Become Views

### Key Insight
In the layered architecture, **Cells are generated, not stored.**

### Generation Function

```rust
// src/views/cell_view.rs
pub fn cells_from_text(
    text: &str,
    annotations: &AnnotationLayer,
    system: PitchSystem
) -> Vec<Cell> {
    let mut cells = vec![];

    for (pos, ch) in text.char_indices() {
        // Get semantic info from Layer 1
        let (kind, pitch_code) = if let Some(gamut) = char_to_pitch(ch, system) {
            (ElementKind::Pitched, Some(gamut.to_pitch_code()))
        } else {
            (ElementKind::Unknown, None)
        };

        // Get annotation data
        let ornament = annotations.ornaments.get(&TextPos::new(0, pos)).cloned();
        let slur_indicator = get_slur_indicator(pos, &annotations.slurs);

        cells.push(Cell {
            char: ch.to_string(),
            kind,
            pitch_code,
            octave: 0,  // From gamut if pitched
            ornament,
            slur_indicator,
            col: pos,
            flags: 0,
            x: 0.0, y: 0.0, w: 0.0, h: 0.0,  // Layout calculated later
            bbox: (0.0, 0.0, 0.0, 0.0),
            hit: (0.0, 0.0, 0.0, 0.0),
        });
    }

    cells
}
```

### Rendering Pipeline

```rust
// JavaScript renderer
renderDocument() {
    // 1. Get text from WASM
    const text = wasmModule.getLineText(0);

    // 2. Get annotations from WASM
    const annotations = wasmModule.getAnnotations();

    // 3. Generate Cells (view layer)
    const cells = wasmModule.cellsFromText(text, annotations, pitchSystem);

    // 4. Layout (calculate positions)
    layoutEngine.computePositions(cells);

    // 5. Render to DOM
    domRenderer.render(cells);
}
```

**Cells are ephemeral:** Created when needed, discarded after rendering.

---

## Benefits

### 1. Simpler Undo/Redo

**Before:**
```javascript
undoStack.push({
    cells: deepClone(document.lines[0].cells)  // ~24KB for 100 cells
});
```

**After:**
```rust
undoStack.push(TextEdit::Insert(pos, ch));  // ~16 bytes
```

**Impact:** 1000x smaller undo stack, faster operations.

### 2. Text Editor Features Work

```rust
// Find/replace
buffer.find_replace("C", "D");

// Multi-cursor
buffer.add_cursor_at(pos);

// Rectangular selection
buffer.select_rectangle(start, end);

// Vim mode
buffer.apply_vim_motion(Motion::Word);
```

All work because text is text, not custom structures.

### 3. Swappable Text Core

```rust
// Change ONE line:
let buffer: Box<dyn TextCore> = Box::new(RopeBuffer::new());
// vs.
let buffer: Box<dyn TextCore> = Box::new(SimpleBuffer::new());

// Everything else just works
```

### 4. Better Testing

**Before (50+ lines):**
```rust
let mut cells = vec![Cell { /* 15 fields */ }, /* ... */];
```

**After (3 lines):**
```rust
let mut buffer = TextBuffer::from_str("1 2 3");
transpose(&mut buffer, Interval::MajorSecond, PitchSystem::Number);
assert_eq!(buffer.to_string(), "2 3 4");
```

### 5. Clean Separation of Concerns

```
Layer 0: Text editing (no music)
Layer 1: Semantics (stateless)
Layer 2: Structure (derived)
Layer 3: Export (already clean)

Each layer has ONE job.
```

### 6. No More Sync Bugs

**Current problem:** Cell.char and Cell.pitch_code can be out of sync.

**After:** Text is source of truth. Semantics are **derived** from text each time. Can't be out of sync.

### 7. Smaller Memory Footprint

**Example:** 100-note document

**Current:**
- 100 Cells × ~240 bytes = 24KB

**After:**
- Text: ~200 bytes
- Annotations: ~800 bytes (if all have ornaments)
- **Total: 1KB (24x smaller)**

Layout cache generated on-demand, discarded after rendering.

---

## Tradeoffs

### What We Give Up

#### 1. Cell as Single Unit
**Current:** Cell is one object with everything.
**After:** Information spread across layers.

**Mitigation:** Cells still exist as views. Code can work with Cell objects when needed.

#### 2. Direct Cell Mutation
**Current:** `cell.pitch_code = Sharp`
**After:** `buffer.replace_char(pos, sharp_char)`

**Mitigation:** Higher-level operations abstract this away.

#### 3. Immediate Consistency
**Current:** Change Cell → immediately consistent across codebase.
**After:** Change text → must regenerate views.

**Mitigation:** View generation is fast (microseconds for typical lines).

### What We Keep

- ✅ Cell-based rendering (Cells still exist as views)
- ✅ Current export pipeline (Layer 3 unchanged)
- ✅ Existing font system (Layer 1 uses it)
- ✅ User experience (no visible changes)

---

## Migration Strategy

### Phase 0: Proof-of-Concept

**Goal:** Validate the approach before committing to full refactor.

**Task:** Implement **one new command** using layered architecture.

**Candidate: "Select Whole Beat" command**

```rust
// Layer 0: Get text
let text = buffer.get_line(cursor.line);

// Layer 1: Tokenize
let tokens = tokenize(text, system);

// Layer 2: Find beat containing cursor
let beat = find_beat_at_pos(tokens, cursor.col);

// Layer 0: Set selection
buffer.set_selection(beat.text_range);
```

**Deliverables:**
1. Implement Layers 0-2 (minimal versions)
2. Implement the command
3. Compare with Cell-based equivalent
4. Measure code complexity, performance
5. Decide: proceed or abandon

**Estimated effort:** 1-2 weeks

---

### Phase 1: Foundation

**Build Layer 0 and annotation system alongside existing code.**

**Tasks:**
1. Create `src/text/` module
   - `buffer.rs` - TextCore trait, SimpleBuffer implementation
   - `cursor.rs` - Cursor, Selection (text-only)
   - `annotations.rs` - AnnotationLayer, shift logic

2. Create `src/glyphs/` module
   - Extract semantic logic from `font_utils.rs`
   - Implement `char_to_pitch` / `pitch_to_char`

3. Add dual storage to Document (temporary):
   ```rust
   pub struct Document {
       pub lines: Vec<Line>,  // Current (Cells)
       pub text_lines: Vec<String>,  // NEW (text buffer)
       pub annotations: Vec<AnnotationLayer>,  // NEW
   }
   ```

4. Keep both in sync during migration

**Deliverables:**
- Working text buffer implementation
- Annotation system with automatic position tracking
- Tests for both

**Estimated effort:** 2-3 weeks

---

### Phase 2: Implement Layer 2

**Build musical structure analysis on top of text.**

**Tasks:**
1. Create `src/structure/` module
   - `line_analysis.rs` - Tokenization, beat grouping
   - Reuse logic from `line_to_ir.rs` FSM

2. Implement `analyze_line(text, annotations) → LineAnalysis`

3. Create `cells_from_text()` view generator

4. Test: Generate Cells from text, compare with stored Cells

**Deliverables:**
- Working structure analysis
- Cell generation from text
- Tests comparing generated vs. stored Cells

**Estimated effort:** 2-3 weeks

---

### Phase 3: Migrate Features Incrementally

**Move operations one-by-one from Cell-based to text-based.**

**Priority order:**
1. **Undo/Redo** (high impact, low risk)
2. **Text operations** (insert, delete, backspace)
3. **Cursor movement** (left, right, up, down)
4. **Selection** (extend, clear)
5. **Musical operations** (transpose, octave shift)
6. **Annotations** (apply/remove ornament, slur)

**For each operation:**
1. Implement text-based version
2. Add feature flag: `USE_TEXT_CORE`
3. Test both versions in parallel
4. Compare behavior, performance
5. Switch to text-based when confident
6. Remove Cell-based version

**Estimated effort:** 6-8 weeks

---

### Phase 4: Remove Cell Storage

**Make Cells fully ephemeral.**

**Tasks:**
1. Remove `Document.lines: Vec<Line>`
2. Keep only `Document.text_lines` and `Document.annotations`
3. Generate Cells on-demand for rendering
4. Update serialization (save text + annotations, not Cells)
5. Migration script for old documents

**Deliverables:**
- Cells are no longer stored
- Document format updated
- Migration path for existing documents

**Estimated effort:** 2-3 weeks

---

### Phase 5: Optimize and Polish

**Improve performance, add advanced features.**

**Tasks:**
1. Profile and optimize hot paths
2. Consider Rope implementation for large documents
3. Implement text editor features (find/replace, multi-cursor)
4. Add comprehensive tests
5. Documentation

**Estimated effort:** 4-6 weeks

---

## Concrete Examples

### Example 1: Transpose Operation

**Current (Cell-based):**
```rust
pub fn transpose(cells: &mut Vec<Cell>, interval: Interval) {
    for cell in cells {
        if let Some(pitch_code) = cell.pitch_code {
            let new_pitch = pitch_code.transpose(interval);
            cell.pitch_code = Some(new_pitch);
            cell.char = pitch_to_string(new_pitch, cell.pitch_system);
        }
    }
}
```

**After (Text-based):**
```rust
pub fn transpose(
    buffer: &mut dyn TextCore,
    range: TextRange,
    interval: Interval,
    system: PitchSystem
) {
    for pos in range {
        let ch = buffer.get_char(pos);

        // Layer 1: char → pitch
        if let Some(mut gamut) = char_to_pitch(ch, system) {
            // Musical logic
            gamut.transpose(interval);

            // Layer 1: pitch → char
            let new_ch = pitch_to_char(&gamut, system);

            // Layer 0: update text
            buffer.replace_char(pos, new_ch);
        }
    }
}
```

**Test:**
```rust
#[test]
fn test_transpose() {
    let mut buffer = SimpleBuffer::from_str("1 2 3");
    transpose(&mut buffer, TextRange::all(), Interval::MajorSecond, PitchSystem::Number);
    assert_eq!(buffer.to_string(), "2 3 4");
}
```

---

### Example 2: Apply Ornament

**Current (Cell-based):**
```rust
pub fn apply_ornament(cells: &mut Vec<Cell>, pos: usize, ornament: Ornament) {
    cells[pos].ornament = Some(ornament);
}
```

**After (Annotation-based):**
```rust
pub fn apply_ornament(
    annotations: &mut AnnotationLayer,
    pos: TextPos,
    ornament: Ornament
) {
    annotations.ornaments.insert(pos, ornament);
}
```

**Automatic tracking:**
```rust
// User types 'x' before the ornament
buffer.insert_char(TextPos(0, 0), 'x');
annotations.on_insert(TextPos(0, 0));

// Ornament automatically shifts to stay on the right note
// No manual update needed!
```

---

### Example 3: Undo/Redo

**Current (Cell-based):**
```javascript
class UndoManager {
    constructor() {
        this.undoStack = [];
    }

    snapshot() {
        // Clone entire Cell array
        this.undoStack.push({
            cells: JSON.parse(JSON.stringify(document.lines[0].cells)),
            cursor: { ...cursor }
        });
    }

    undo() {
        const snapshot = this.undoStack.pop();
        document.lines[0].cells = snapshot.cells;
        cursor = snapshot.cursor;
    }
}

// Each snapshot: ~24KB for 100 cells
```

**After (Text-based):**
```rust
enum TextEdit {
    Insert(TextPos, char),
    Delete(TextPos, char),
    Replace(TextRange, String, String),
}

impl TextBuffer {
    fn insert_char(&mut self, pos: TextPos, ch: char) {
        self.lines[pos.line].insert(pos.col, ch);
        self.undo_stack.push(TextEdit::Insert(pos, ch));
    }

    fn undo(&mut self) {
        match self.undo_stack.pop() {
            Some(TextEdit::Insert(pos, _)) => self.delete_char(pos),
            Some(TextEdit::Delete(pos, ch)) => self.insert_char(pos, ch),
            Some(TextEdit::Replace(range, old, _)) => self.replace_range(range, &old),
            None => {}
        }
    }
}

// Each edit: ~16 bytes
```

**Impact:** 1000x smaller undo stack.

---

### Example 4: Slur Management

**Current (Cell-based):**
```rust
// Two separate markers on different cells
cells[0].slur_indicator = SlurIndicator::SlurStart;
cells[3].slur_indicator = SlurIndicator::SlurEnd;

// Renderer must find matching pairs
for i in 0..cells.len() {
    if cells[i].slur_indicator == SlurStart {
        for j in i+1..cells.len() {
            if cells[j].slur_indicator == SlurEnd {
                draw_slur(cells[i].x, cells[j].x);
                break;
            }
        }
    }
}
```

**After (Annotation-based):**
```rust
// One explicit range object
annotations.slurs.push(SlurSpan {
    start: TextPos(0, 0),
    end: TextPos(0, 6)
});

// Renderer uses explicit range
for slur in &annotations.slurs {
    let start_pos = text_pos_to_pixel(slur.start);
    let end_pos = text_pos_to_pixel(slur.end);
    draw_curve(start_pos, end_pos);
}
```

**Benefits:**
- Explicit connection (no pairing needed)
- Multiple slurs handled easily
- Overlapping slurs supported
- Automatic position tracking on edits

---

## Recommendation

### Start with Proof-of-Concept

**Before committing to a full refactor:**

1. ✅ Implement Layers 0-2 (minimal versions)
2. ✅ Build one new feature using the layered architecture
3. ✅ Compare with Cell-based equivalent
4. ✅ Measure:
   - Code complexity (lines of code, dependencies)
   - Performance (rendering time, memory usage)
   - Test coverage (ease of testing)
5. ✅ Decide: Is the benefit worth the migration cost?

**Suggested feature for proof-of-concept:**
- "Select whole beat" (involves all layers)
- "Transpose selection" (musical operation on text)
- "Find/replace pitch" (demonstrates text capabilities)

**Timeline:** 1-2 weeks for POC, then reassess.

### If POC is Successful: Gradual Migration

- ✅ Build new system alongside old (dual storage)
- ✅ Migrate features incrementally (feature flags)
- ✅ Keep both working during transition
- ✅ Remove old system only when confident
- ✅ Timeline: 4-6 months for complete migration

### Risk Mitigation

1. **Backward compatibility:** Old documents must still load
2. **Feature parity:** No regressions during migration
3. **Performance:** New system must be >= current performance
4. **Testing:** Comprehensive tests at each phase
5. **Rollback plan:** Can revert to Cell-based if needed

---

## Conclusion

The layered architecture proposal offers significant benefits:
- Cleaner separation of concerns
- Smaller memory footprint
- Better testability
- Standard text editor features
- Future extensibility

The annotation pattern provides a proven solution for metadata management without sacrificing text-first principles.

**Recommendation:** Validate with proof-of-concept before committing to full refactor. If successful, migrate incrementally over 4-6 months.

**Next steps:**
1. Review and approve this proposal
2. Implement proof-of-concept
3. Measure results
4. Decide: proceed or adjust

---

## Appendix: Related Reading

### Industry Examples
- **VS Code Architecture:** Text buffer + decoration API
- **Prosemirror:** Document model with marks and decorations
- **Xi Editor:** Rope-based text buffer with layers
- **Operational Transformation:** CRDT algorithms for collaborative text editing

### Implementation References
- `src/models/core.rs` - Current Cell definition
- `src/renderers/font_utils.rs` - Glyph semantics (Layer 1 exists here)
- `src/renderers/musicxml/line_to_ir.rs` - Structure analysis (basis for Layer 2)
- `src/text/` - (NEW) Text editor core
- `src/glyphs/` - (NEW) Semantic layer
- `src/structure/` - (NEW) Musical structure layer

### Further Questions?

Contact the architecture team or open an issue for discussion.

---

**Document Version:** 1.0
**Last Updated:** 2025-01-14
