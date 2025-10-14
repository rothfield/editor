# Data Model: Staff Notation Rendering

## Overview

This feature does NOT introduce new persistent data structures. It operates on the existing Cell-based document model, transforming it into MusicXML format for rendering. All entities described are either read-only views of existing data or ephemeral runtime structures.

## Existing Entities (Read-Only)

### Document
**Source**: `src/models/core.rs`
**Purpose**: Root document structure containing all musical content

**Key Fields**:
- `lines: Vec<Line>` - Collection of notation lines

**Relationships**: Contains multiple Lines

**Usage in Feature**: Iterated to extract all lines for MusicXML export

---

### Line
**Source**: `src/models/core.rs`
**Purpose**: Single line of musical notation

**Key Fields**:
- `cells: Vec<Cell>` - Ordered collection of notation elements

**Relationships**: Contained by Document, contains multiple Cells

**Usage in Feature**: Each line becomes a musical system (with `<print new-system="yes"/>` in MusicXML)

---

### Cell
**Source**: `src/models/core.rs`
**Purpose**: Individual notation element (note, rest, barline, whitespace)

**Key Fields**:
- `kind: ElementKind` - Type of element
- `pitch_code: Option<String>` - Pitch identifier (for pitched elements)
- `octave: i8` - Octave number (-4 to +4)
- `content: String` - Visual text representation
- `is_temporal: bool` - Whether element has duration

**Relationships**: Contained by Line

**Validation Rules**:
- PitchedElement MUST have `pitch_code` and `octave`
- UnpitchedElement (rest) MUST NOT have `pitch_code`
- Barline and Whitespace are non-temporal

**Usage in Feature**:
- Temporal elements (PitchedElement, UnpitchedElement) become notes/rests
- Barlines trigger measure boundaries
- Whitespace delimits beats

---

### ElementKind
**Source**: `src/models/elements.rs`
**Purpose**: Discriminator for cell types

**Variants**:
- `PitchedElement` - Musical note with specific pitch
- `UnpitchedElement` - Rest or unpitched percussion
- `Barline` - Measure separator
- `Whitespace` - Beat delimiter
- `BreathMark` - Phrasing indicator

**Usage in Feature**:
```rust
match cell.kind {
    ElementKind::PitchedElement => export_note(...),
    ElementKind::UnpitchedElement => export_rest(...),
    ElementKind::Barline => close_measure(...),
    ElementKind::Whitespace | ElementKind::BreathMark => end_beat(...),
    _ => skip,
}
```

---

### Pitch
**Source**: `src/models/pitch.rs`
**Purpose**: Pitch representation with system awareness

**Key Fields**:
- `base: String` - Base pitch (e.g., "1", "C", "Sa")
- `accidental: Accidental` - Sharp/flat modifier
- `octave: i8` - Octave number
- `system: PitchSystem` - Which notation system (Number, Western, etc.)

**Relationships**: Referenced by Cell (parsed from `pitch_code`)

**Usage in Feature**: Converted to MusicXML `<step>`, `<alter>`, `<octave>` elements

**Conversion Logic**:
```rust
fn to_musicxml_pitch(pitch: &Pitch) -> Result<(String, i8, i8), String> {
    match pitch.system {
        PitchSystem::Number => {
            // 1→C, 2→D, 3→E, 4→F, 5→G, 6→A, 7→B
            let step = number_to_step(&pitch.base)?;
            let alter = pitch.accidental.semitone_offset();
            Ok((step, alter, pitch.octave + 4))  // Adjust to MIDI octave
        }
        PitchSystem::Western => {
            // c→C, d→D, etc. (uppercase for natural)
            let step = pitch.base.to_uppercase();
            let alter = pitch.accidental.semitone_offset();
            Ok((step, alter, pitch.octave + 4))
        }
        _ => Err("Unsupported pitch system for MusicXML export")
    }
}
```

---

### Accidental
**Source**: `src/models/pitch.rs`
**Purpose**: Pitch alteration modifier

**Variants**:
- `Natural` - No alteration (0 semitones)
- `Sharp` - Raise by semitone (+1)
- `Flat` - Lower by semitone (-1)
- `DoubleSharp` - Raise by whole tone (+2)
- `DoubleFlat` - Lower by whole tone (-2)

**Usage in Feature**: Maps to MusicXML `<alter>` value

---

### PitchSystem
**Source**: `src/models/pitch.rs`
**Purpose**: Notation system discriminator

**Variants**:
- `Number` - Number system (1-7)
- `Western` - Western notation (C-B)
- `Sargam` - Indian Sargam (Sa Re Ga...)
- `Bhatkhande` - Bhatkhande notation
- `Tabla` - Tabla notation

**Usage in Feature**: Determines conversion strategy to MusicXML. Initially support Number and Western only.

---

## Ephemeral Entities (Runtime Only)

### MusicXmlDocument
**Source**: `src/renderers/musicxml/builder.rs` (NEW)
**Purpose**: State machine for building MusicXML output

**Fields**:
- `parts: Vec<Part>` - Musical parts
- `current_measure: Option<Measure>` - Measure being built
- `measure_divisions: i32` - Time divisions for current measure
- `measure_number: i32` - Current measure counter

**State Transitions**:
1. `new()` → Initial state
2. `start_measure()` → Building measure
3. `add_note() / add_rest()` → Accumulating content
4. `end_measure()` → Measure complete
5. `finalize()` → Generate XML string

**Validation Rules**:
- Must have at least one part
- Each measure must have divisions set before adding notes
- First measure must have attributes (clef, key)

---

### Beat
**Source**: Derived during export (not persisted)
**Purpose**: Group of simultaneous or sequential notes within beat boundary

**Fields**:
- `cells: Vec<&Cell>` - References to cells in this beat
- `subdivisions: usize` - Number of temporal elements

**Derivation Logic**:
```rust
fn extract_implicit_beats(cells: &[Cell]) -> Vec<Beat> {
    let mut beats = Vec::new();
    let mut current_beat = Vec::new();

    for cell in cells {
        match cell.kind {
            ElementKind::PitchedElement | ElementKind::UnpitchedElement => {
                current_beat.push(cell);
            }
            ElementKind::Whitespace | ElementKind::BreathMark => {
                if !current_beat.is_empty() {
                    beats.push(Beat {
                        cells: current_beat,
                        subdivisions: current_beat.len()
                    });
                    current_beat = Vec::new();
                }
            }
            _ => {}
        }
    }

    if !current_beat.is_empty() {
        beats.push(Beat { cells: current_beat, subdivisions: current_beat.len() });
    }

    beats
}
```

**Validation Rules**:
- Beat must contain at least one temporal element
- All cells in beat must be contiguous in source line

---

### Measure
**Source**: `src/renderers/musicxml/builder.rs` (NEW)
**Purpose**: Musical measure with time-aligned notes and rests

**Fields**:
- `number: i32` - Measure number (1-indexed)
- `divisions: i32` - Time divisions (LCM of all beat subdivisions)
- `notes: Vec<NoteEvent>` - Notes and rests in this measure
- `barline_type: Option<BarlineType>` - Ending barline style
- `new_system: bool` - Whether to start new line

**Derivation**:
- `divisions` = LCM of all beat subdivisions in measure
- Each note/rest duration = `divisions / beat.subdivisions`
- `new_system` = true if this is first measure of new Line

**Validation Rules**:
- `divisions` must be positive integer
- Total duration of notes/rests should match expected measure length (not enforced in POC - no time signature)
- `barline_type` determined by Barline cell at measure end

---

### NoteEvent
**Source**: `src/renderers/musicxml/builder.rs` (NEW)
**Purpose**: Individual note or rest within measure

**Fields**:
- `pitch: Option<(String, i8, i8)>` - (step, alter, octave) for notes, None for rests
- `duration: i32` - Duration in divisions
- `note_type: String` - Visual note type ("whole", "half", "quarter", "eighth", etc.)
- `dot_count: usize` - Number of dots (0-2)
- `tuplet: Option<(usize, usize)>` - Tuplet ratio (actual_notes, normal_notes)
- `tie: Option<TieType>` - Tie start/stop
- `beam: Option<BeamType>` - Beam grouping

**Derivation**:
```rust
fn duration_to_note_type(duration: f64) -> (&'static str, usize) {
    // duration relative to whole note (1.0 = whole, 0.5 = half, etc.)
    if duration >= 1.0 { ("whole", 0) }
    else if duration >= 0.75 { ("half", 1) }    // dotted half
    else if duration >= 0.5 { ("half", 0) }
    else if duration >= 0.375 { ("quarter", 1) } // dotted quarter
    else if duration >= 0.25 { ("quarter", 0) }
    else if duration >= 0.1875 { ("eighth", 1) } // dotted eighth
    else if duration >= 0.125 { ("eighth", 0) }
    else if duration >= 0.0625 { ("16th", 0) }
    else { ("32nd", 0) }
}
```

---

### TupletDetection
**Source**: Derived during beat processing
**Purpose**: Identify non-standard subdivisions requiring tuplet notation

**Logic**:
```rust
fn detect_tuplet(subdivisions: usize) -> Option<(usize, usize)> {
    match subdivisions {
        1 | 2 | 4 | 8 | 16 => None,  // Standard divisions
        3 => Some((3, 2)),            // Triplet
        5 => Some((5, 4)),            // Quintuplet
        6 => Some((6, 4)),            // Sextuplet
        7 => Some((7, 4)),            // Septuplet
        9 => Some((9, 8)),            // Nonuplet
        _ => Some((subdivisions, nearest_power_of_2(subdivisions)))
    }
}
```

---

## Data Flow

```
User Types Notation
        ↓
Document (Cell-based model)
        ↓
[MusicXML Export Triggered]
        ↓
Iterate Document.lines
        ↓
For each Line:
  Extract Beats from cells
        ↓
  Calculate Measure divisions (LCM of beat subdivisions)
        ↓
  For each Beat:
    Convert Cells to NoteEvents
    Detect tuplets
    Calculate durations
        ↓
  Build Measure with NoteEvents
        ↓
MusicXmlDocument.finalize()
        ↓
Generate XML String
        ↓
Pass to OSMD
        ↓
Render SVG
        ↓
Display in Staff Notation Tab
```

## Validation Summary

### Input Validation (Pre-Export)
- Document must have at least one Line
- Each Line must have at least one Cell
- PitchedElements must have valid `pitch_code` and `octave`
- Pitch system must be Number or Western (others unsupported initially)

### Export Validation (During Processing)
- At least one temporal element must exist (note or rest)
- Each measure must have at least one beat
- Divisions calculation must not overflow (max 960 for practical use)
- Tuplet ratios must be reasonable (actual_notes < 20)

### Output Validation (Post-Export)
- Generated XML must be well-formed
- Must pass MusicXML 3.1 DTD validation (optional, for debugging)
- OSMD must successfully parse the output (critical)

## Error Handling

### Invalid Pitch Code
```rust
Err("Invalid pitch code: {code}") → Skip note, log error, continue
```

### Unsupported Pitch System
```rust
Err("Pitch system {system} not supported for MusicXML export") → Skip note, warn user
```

### Empty Document
```rust
if document.lines.is_empty() {
    return generate_empty_musicxml(); // Single measure with whole rest
}
```

### Division Overflow
```rust
if divisions > 960 {
    return Err("Measure too complex: {divisions} divisions exceeds limit");
}
```

### OSMD Rendering Failure
```javascript
try {
    await osmd.render();
} catch (error) {
    console.error('OSMD rendering failed:', error);
    // Preserve last valid render, show error indicator
}
```

## Performance Considerations

### Memory Usage
- Ephemeral structures deallocated after export completes
- MusicXML string ~1-5KB for typical measure
- OSMD rendering uses ~50-200KB per render (cached in IndexedDB)

### Time Complexity
- Beat extraction: O(n) where n = number of cells
- LCM calculation: O(m log m) where m = number of beats
- Note conversion: O(n) where n = number of temporal elements
- Overall export: O(n) where n = total cells in document

### Optimization Targets
- MusicXML export: < 10ms for 50 measures
- OSMD rendering: < 500ms for 50 measures (first render)
- Cache hit: < 50ms (subsequent renders)
