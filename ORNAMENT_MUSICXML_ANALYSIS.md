# Ornament Implementation Analysis - Music Notation Editor

## Executive Summary

The editor has a sophisticated ornament system with grace notes already implemented in MusicXML export. This analysis covers the complete architecture, current support, and recommendations for further MusicXML ornament/articulation features.

---

## 1. KEY FILES RELATED TO ORNAMENTS

### Rust Core (WASM Module)

#### Data Structures
- **`/home/john/editor/src/models/notation.rs`** (lines 348-470)
  - `OrnamentType` enum: Mordent, Trill, Turn, Appoggiatura, Acciaccatura (currently symbolic, not deeply used)
  - `OrnamentPlacement` enum: Before/After positioning
  - `Ornament` struct: Contains cells making up the ornament

- **`/home/john/editor/src/models/elements.rs`** (lines 595-958)
  - `OrnamentIndicator` enum: 7 variants tracking ornament span boundaries
    - `OrnamentBeforeStart/End` - Ornaments before parent note
    - `OrnamentAfterStart/End` - Ornaments after parent note
    - `OrnamentOnTopStart/End` - Ornaments above note (trills, mordents)
  - `OrnamentPositionType` enum: Before, After, OnTop
  - Complete serialization/deserialization support

- **`/home/john/editor/src/models/core.rs`** (lines 17-93, 189-244)
  - `Cell` struct: Contains `ornament_indicator` and `ornaments` fields
  - Methods: `set_ornament_start()`, `set_ornament_end()`, `set_ornament_start_with_position()`, `is_rhythm_transparent()`
  - Ornament cells are marked rhythm-transparent (zero duration per spec)

#### MusicXML Export
- **`/home/john/editor/src/renderers/musicxml/mod.rs`** (lines 350-527)
  - **Grace note collection**: Lines 350-386
    - Tracks ornament span boundaries via `in_ornament_span` flag
    - Collects pitched elements within spans as `pending_grace_notes`
    - Stores as `Vec<(PitchCode, i8)>` (pitch + octave)
  - **Grace note writing**: Lines 501-503
    - Calls `builder.write_grace_note()` before main note
    - Passes `slash: true` (renders as acciaccatura with slash)

- **`/home/john/editor/src/renderers/musicxml/builder.rs`** (lines 301-328)
  - `write_grace_note()` method
    - Generates MusicXML `<note>` element
    - Adds `<grace/>` or `<grace slash="yes"/>` element
    - Sets pitch, octave (no duration for grace notes)
    - Default type: `eighth`

### JavaScript Frontend
- **`/home/john/editor/src/js/editor.js`** (lines 76-81)
  - WASM API binding: `applyOrnament`, `removeOrnament`, `getOrnamentEditMode`, `setOrnamentEditMode`

### Tests & Specifications
- **`/home/john/editor/tests/e2e-pw/tests/ornament-export.spec.js`**
  - T016: MusicXML export with `<grace/>` elements
  - T017: LilyPond export with `\grace {}` syntax
  - Tests verify grace notes have no duration element

- **`/home/john/editor/tests/e2e-pw/tests/ornament-basic.spec.js`**
  - T013: Ornament indicators set via Alt+0
  - T014: Visual CSS styling
  - T015: Zero-width floating layout
  - T037: Collision detection for overlapping ornaments

---

## 2. MUSICXML EXPORT CODE ARCHITECTURE

### Export Flow
```
to_musicxml(document)
  ↓
Iterate each line as system
  ↓
Split at barlines → measures
  ↓
Calculate measure divisions (LCM)
  ↓
process_segment(cells, divisions)
  ↓
Beat processing loop:
  - Skip ornament indicators (start/end)
  - Collect grace notes in between
  - Write grace notes before main note
  ↓
MusicXML output with <grace/> elements
```

### Current Ornament Support (Grace Notes)

**What Works:**
- Grace notes extracted from ornament spans
- Written as `<grace/>` or `<grace slash="yes"/>`
- Correctly positioned before main notes
- Support for sharp/flat accidentals in grace notes
- Octave handling

**Example Output:**
```xml
<note>
  <grace slash="yes"/>
  <pitch>
    <step>G</step>
    <octave>4</octave>
  </pitch>
  <type>eighth</type>
</note>
<note>
  <pitch>
    <step>C</step>
    <octave>4</octave>
  </pitch>
  <duration>4</duration>
  <type>quarter</type>
</note>
```

### Missing MusicXML Features

#### 1. Articulations (Currently Not Exported)
- Accents: `<accent/>`
- Staccato: `<staccato/>`
- Tenuto: `<tenuto/>`
- Pizzicato: `<pizzicato/>`

**Location:** Would go in `<notations>` element after tuplets

#### 2. Ornament Elements (Currently Using Grace Notes Only)
- Trill: `<ornament>...</ornament>` with specific child elements
- Mordent: `<ornament>...</ornament>`
- Turn: `<ornament>...</ornament>`
- Tremolo: `<tremolo/>`

**MusicXML Format:**
```xml
<notations>
  <ornament type="trill">
    <acc-upper line="2"/>
  </ornament>
</notations>
```

#### 3. Grace Note Variations (Currently All Acciaccaturas)
- Slash control (current: always slash for acciaccaturas)
- Duration types (current: always eighth)
- Steal-time attributes

#### 4. Placement Attributes (Currently Default)
- `placement="above"` / `placement="below"`
- Already captured in `OrnamentPositionType` (not used in export)

#### 5. Technical Ornament Attributes
- `long="yes"` for extended trills
- `accidental="sharp"|"natural"|"flat"` for accidentals
- `trill-step="whole"|"half"|"unison"`
- `two-note-turn="yes"` for two-note turns

---

## 3. DOCUMENT MODEL STRUCTURE

### Cell-Based Architecture
```rust
struct Cell {
    char: String,                           // "2", "3", etc.
    kind: ElementKind,                      // PitchedElement, etc.
    ornament_indicator: OrnamentIndicator,  // OrnamentBeforeStart, etc.
    ornaments: Vec<Ornament>,               // Attached ornaments (edit mode)
    pitch_code: Option<PitchCode>,          // Canonical pitch
    octave: i8,                             // -1, 0, 1
}

struct Ornament {
    cells: Vec<Cell>,           // Notes making up ornament
    placement: OrnamentPlacement // Before/After
}
```

### Ornament Representation
1. **In Normal Mode:** Ornament indicators mark span boundaries
   - `OrnamentBeforeStart` → `...` → `OrnamentBeforeEnd`
   - Cells between indicators contain pitched elements for grace notes

2. **In Edit Mode:** Ornaments stored in Cell.ornaments array
   - `ornament_edit_mode: true` in Document
   - Each ornament is self-contained Ornament struct

3. **Serialization:**
   - Ornament indicators: Always present, normalized to name/value
   - Ornaments array: Only serialized if non-empty
   - Skipped in MusicXML layout calculations (rhythm-transparent)

---

## 4. CURRENT MUSICXML ORNAMENT/ARTICULATION SUPPORT MATRIX

| Feature | Status | Location | Notes |
|---------|--------|----------|-------|
| **Grace Notes** | ✅ Complete | `builder.rs:301-328` | Acciaccatura (with slash) style |
| **Grace Note Pitches** | ✅ Complete | `mod.rs:378-386` | Full pitch with accidentals |
| **Grace Note Octaves** | ✅ Complete | `builder.rs:303, 319` | Correctly offset (+4) |
| **Slur Elements** | ✅ Complete | `mod.rs:512-516, builder.rs:154-156` | `<slur>` notation |
| **Tuplets/Tuplet Brackets** | ✅ Complete | `mod.rs:324-329, detect_tuplet()` | Full tuplet detection |
| **Ties** | ✅ Complete | `mod.rs:298-321, 505-509` | Hyphenation → MusicXML ties |
| **Key Signature** | ✅ Complete | `builder.rs:376-377` | Circle of fifths parsing |
| **Divisions/Measure Setup** | ✅ Complete | `builder.rs:50-70` | LCM-based rhythm |
| **Articulations** | ❌ Missing | — | No accent, staccato, tenuto, etc. |
| **Ornament Elements** | ⚠️ Partial | — | Only grace notes; no trill/mordent/turn notation |
| **Placement Attributes** | ❌ Not Used | `elements.rs:945-951` | Data captured but not exported |
| **Tremolo** | ❌ Missing | — | Not supported in editor |
| **Glissando** | ❌ Missing | — | Not supported in editor |
| **Breath Marks** | ✅ Exported | `mod.rs:466-468` | Resets context, outputs `<breath-mark>` (TODO verify) |

---

## 5. IMPLEMENTATION RECOMMENDATIONS

### Phase 1: Quick Wins (1-2 hours)
1. **Add Placement Attributes to Grace Notes**
   - Use `OrnamentPositionType` from `OrnamentIndicator.position_type()`
   - Add `placement` parameter to `write_grace_note()`
   - Map: `OnTop` → "above", `Before` → "before", `After` → "after"

2. **Add Slash Control for Grace Notes**
   - Distinguish appoggiatura (no slash) vs. acciaccatura (slash)
   - Could be derived from ornament type (if used) or position

### Phase 2: Medium Effort (3-5 hours)
1. **Basic Articulations**
   - Add to `builder.write_note_with_beam_from_pitch_code()` signature
   - Create `write_articulation()` helper
   - Integrate into beat processing logic
   - Support: accent, staccato, tenuto, pizzicato

2. **Ornament Elements (Standard MusicXML)**
   - Detect ornament type from document metadata (if available)
   - Generate `<ornament>` element with appropriate children
   - Follows same `<notations>` structure as grace notes

### Phase 3: Advanced (5-8 hours)
1. **Two-Note Ornaments**
   - Extend grace note collection to support upper/lower neighbors
   - Add `two-note-turn` attribute

2. **Trill Line Extensions**
   - Support `<wavy-line>` in addition to trill ornament
   - Visual representation across multiple notes

3. **Dynamic Ornament Attributes**
   - `long="yes"` for extended trills
   - `accidental` specification for specific modifications

---

## 6. CODE INTEGRATION POINTS

### Adding Articulation Support

**Step 1:** Modify Cell structure (optional - use document metadata instead)
```rust
// In models/core.rs
pub struct Cell {
    // ... existing fields
    pub articulation: Option<ArticulationType>,  // NEW
}
```

**Step 2:** Extend builder signature
```rust
// In builder.rs
pub fn write_note_with_beam_from_pitch_code(
    &mut self,
    pitch_code: &PitchCode,
    octave: i8,
    duration_divs: usize,
    musical_duration: f64,
    beam: Option<&str>,
    time_modification: Option<(usize, usize)>,
    tuplet_bracket: Option<&str>,
    tie: Option<&str>,
    slur: Option<&str>,
    articulations: Option<Vec<ArticulationType>>,  // NEW
) -> Result<(), String>
```

**Step 3:** Add articulation writing in notations block
```rust
// After tuplets, ties, slur in builder.rs (around line 158)
if let Some(arts) = articulations {
    for art in arts {
        match art {
            ArticulationType::Accent => self.buffer.push_str("    <accent/>\n"),
            ArticulationType::Staccato => self.buffer.push_str("    <staccato/>\n"),
            // ... etc
        }
    }
}
```

**Step 4:** Call from process_beat
```rust
// In mod.rs (around line 518)
builder.write_note_with_beam_from_pitch_code(
    pitch_code, *octave, *duration_divs, *musical_duration,
    None, tuplet_info, tuplet_bracket, tie, slur,
    None,  // articulations - would extract from cell or document
)?;
```

---

## 7. TESTING STRATEGY

### Unit Tests (Rust)
- Test each articulation type in builder
- Verify XML element structure
- Test combinations (articulation + grace note, etc.)

### E2E Tests (Playwright)
- Type ornament → select → apply
- Export to MusicXML
- Inspector: Verify MusicXML contains expected elements
- No visual tests (grace notes rendering is OSMD/MusicXML viewer responsibility)

### Test Locations
```
tests/e2e-pw/tests/
  ornament-export.spec.js (expand with articulation tests)
  musicxml-articulation.spec.js (new)
```

---

## 8. REFERENCES & SPECS

### MusicXML 3.1 Specification
- **Ornament Element:** `<ornament>` with children: `<trill-mark>`, `<turn>`, `<inverted-turn>`, `<tremolo>`, etc.
- **Articulation Element:** Direct children of `<notations>`: `<accent>`, `<staccato>`, `<tenuto>`, `<pizzicato>`, etc.
- **Grace Note:** `<grace>` with optional `slash="yes"` attribute
- **Placement:** `above`, `below`, or default (application-specific)

### Files Already Using Correct Patterns
- Grace notes: `builder.rs:301-328` (model to follow)
- Tuplets: `mod.rs:144-145` (notations block structure)
- Slurs: `builder.rs:154-156` (same notations location)

---

## Summary Table

| Category | Current | Gap | Priority |
|----------|---------|-----|----------|
| Grace Notes | ✅ Full | — | Complete |
| Placement (data) | ✅ Captured | Export missing | Medium |
| Articulations | ❌ None | Decode → Export | High |
| Ornament Elements | ⚠️ Via grace | Native ornament notation | Medium |
| Two-note ornaments | ❌ None | Complex | Low |
| Breath marks | ✅ Concept | Verify MusicXML output | Low |

