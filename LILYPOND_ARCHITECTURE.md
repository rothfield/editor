# LilyPond Export Implementation - Architecture Summary

## Overview

The editor uses a **three-layer pipeline** to handle export functionality:

```
Document (Cell-based)
    ↓
Intermediate Representation (IR)
    ↓
MusicXML
    ↓
LilyPond (via converter)
```

---

## 1. Document Model Structure for Lines

### Location
`src/models/core.rs`

### Core Data Structures

**Document:**
- `Vec<Line>` - Array of musical lines (staves/parts)
- `title, composer` - Metadata
- `tonic, pitch_system, key_signature` - Composition-level defaults
- `ornament_edit_mode` - Flag for editing ornaments

**Line** (represents a staff/part):
- `cells: Vec<Cell>` - The actual musical notation
- `label: String` - Display label (e.g., "Soprano", "Piano")
- `tala: String` - Tala notation (rhythm markers)
- `lyrics: String` - Lyrics text
- `tonic: String` - Line-level tonic (overrides document tonic)
- `pitch_system: Option<PitchSystem>` - Line-level pitch system
- `key_signature: String` - Line-level key signature
- `tempo: String` - Tempo marking
- `time_signature: String` - Time signature

**Cell** (represents one character):
- `char: String` - The visible character
- `kind: ElementKind` - PitchedElement, UnpitchedElement, Barline, Rest
- `pitch_code: Option<PitchCode>` - Canonical pitch representation
- `pitch_system: Option<PitchSystem>` - Pitch system for this cell
- `octave: i8` - Octave marking (-1, 0, 1)
- `slur_indicator: SlurIndicator` - SlurStart, SlurEnd, or None
- `ornament_indicator: OrnamentIndicator` - Ornament markers
- `ornaments: Vec<Ornament>` - Actual ornament content (when edit mode OFF)

**Key Insight:** Lines ARE the export units. Each Line becomes a Part/Staff in MusicXML and a separate stave in LilyPond.

---

## 2. Export Pipeline (3 Layers)

### Layer 1: Document → Intermediate Representation (IR)

**Location:** `src/renderers/musicxml/cell_to_ir.rs`

**Function:** `build_export_measures_from_document(document: &Document) -> Vec<ExportLine>`

**Process:**
1. For each Line in Document → create ExportLine
2. Use Finite State Machine (FSM) to process Cells sequentially:
   - Group cells into beats (space-delimited in notation)
   - Calculate beat subdivisions
   - Extract musical events (notes, rests, grace notes)
   - Handle special cases (ornaments, slurs, ties)
3. Group beats into measures
4. Calculate LCM (Least Common Multiple) for beat divisions
   - This determines `divisions` (beat subdivision count in MusicXML)

**Output Types:**

```rust
pub struct ExportLine {
    pub key_signature: Option<String>,
    pub time_signature: Option<String>,
    pub clef: String,
    pub measures: Vec<ExportMeasure>,
    pub lyrics: String,
}

pub struct ExportMeasure {
    pub divisions: usize,  // LCM of all beat subdivisions
    pub events: Vec<ExportEvent>,
}

pub enum ExportEvent {
    Note(NoteData),
    Rest(u32),  // duration in divisions
    Chord(...),
    GraceNote(...),
}

pub struct NoteData {
    pub pitch: PitchCode,
    pub divisions: u32,  // Duration in divisions
    pub slur_data: Option<SlurData>,
    pub tie_data: Option<TieData>,
    pub ornament_data: Vec<OrnamentData>,
}
```

**Key Invariant:** `sum(event.divisions) == measure.divisions`

### Layer 2: IR → MusicXML String

**Location:** `src/renderers/musicxml/emitter.rs`

**Function:** `emit_musicxml(export_lines: &[ExportLine], ...) -> Result<String, String>`

**Process:**
1. Build MusicXML document structure
2. For each ExportLine:
   - Emit `<part-list>` entry with clef
   - Emit key signature, time signature (if present)
3. For each measure:
   - Emit attributes (divisions, key, time)
   - Emit all events (notes with pitch/duration/articulation/ornaments)
   - Handle ties across measure boundaries

**Output:** Complete MusicXML 3.1 document as String

### Layer 3: MusicXML → LilyPond

**Location:** `src/converters/musicxml/musicxml_to_lilypond/`

**Entry Point:** `convert_musicxml_to_lilypond(musicxml: &str, settings: Option<ConversionSettings>) -> Result<ConversionResult, String>`

**Process:**
1. Parse MusicXML using `roxmltree`
2. Convert to internal `Music` representation
3. Extract musical content per part
4. Generate LilyPond source with proper syntax

**Output:** JSON with `lilypond_source` field containing complete LilyPond document

---

## 3. How LilyPond Export Currently Works

### WASM API Functions

**Location:** `src/api/core.rs`

1. **`exportMusicXML(document)`** → `String`
   - Calls `to_musicxml(&document)` 
   - Returns MusicXML string

2. **`convertMusicXMLToLilyPond(musicxml, settings_json)`** → `String`
   - Takes MusicXML string
   - Parses settings
   - Converts to LilyPond
   - Returns JSON: `{ lilypond_source, skipped_elements }`

3. **`generateIRJson(document)`** → `String`
   - Calls `build_export_measures_from_document(document)`
   - Returns IR as JSON (for debugging/inspection)

### JavaScript Usage

**File:** `src/js/lilypond-tab.js`

```javascript
// When tab is shown or document updates:
const musicxml = this.editor.wasmModule.exportMusicXML(this.editor.theDocument);
const settings = JSON.stringify({
    target_lilypond_version: "2.24.0",
    language: "English",
    convert_directions: true,
    convert_lyrics: true,
    convert_chord_symbols: true
});
const result = this.editor.wasmModule.convertMusicXMLToLilyPond(musicxml, settings);
const parsed = JSON.parse(result);
this.sourceElement.textContent = parsed.lilypond_source;
```

### Template System

**Location:** `src/converters/musicxml/musicxml_to_lilypond/templates.rs`

**Templates:**
- **Compact** - Bare-bones, no headers
- **Standard** - Single-staff with metadata (title, composer)
- **MultiStave** - Multiple staves with spacious layout

**Selection Logic:**
- MultiStave → 2+ parts
- Standard → Single part with title/composer
- Compact → Simple single part, no metadata

**Rendering:** Uses Mustache template engine for final LilyPond output

---

## 4. Current Handling of Multiple Lines

### Document Level
- Document stores `Vec<Line>` - can have multiple lines

### IR Level (Per-Line Export)
- Each Line → ExportLine (with separate measures)
- Lines are processed independently during IR building
- Each line preserves its own metadata (key, time signature, clef, lyrics)

### MusicXML Level
- Each ExportLine → separate `<part>` in `<part-list>`
- MusicXML structure:
  ```xml
  <score-partwise>
    <part-list>
      <score-part id="P1">...</score-part>
      <score-part id="P2">...</score-part>  <!-- Line 2 -->
    </part-list>
    <part id="P1">  <!-- Line 1 measures -->
      <measure>...</measure>
    </part>
    <part id="P2">  <!-- Line 2 measures -->
      <measure>...</measure>
    </part>
  </score-partwise>
  ```

### LilyPond Level
- Each part becomes a separate stave in LilyPond:
  ```lilypond
  \score {
    <<
      \new Staff { \new Voice = "mel" { \fixed c' { ... } } }  <!-- Line 1 -->
      \new Staff { \new Voice = "v2" { \fixed c' { ... } } }   <!-- Line 2 -->
    >>
    \layout { ... }
    \midi { ... }
  }
  ```

**Current Code:** `src/converters/musicxml/musicxml_to_lilypond/lilypond.rs` (lines 79-101)

---

## 5. Rendering of Multiple Lines (Display)

### OSMD/VexFlow Renderer
**Location:** `src/js/osmd-renderer.js`

- Uses OpenSheetMusicDisplay library
- Converts MusicXML to staff notation
- Renders both single and multi-staff pieces
- Uses cached rendering in IndexedDB

### HTML Layout Engine
**Location:** `src/html_layout/`

- Computes layout for spatial notation (cell-based)
- Processes each line independently
- `LayoutEngine.compute_layout()` processes `document.lines` sequentially
- Each line gets its own `RenderLine` in the `DisplayList`

**Key Files:**
- `src/html_layout/document.rs` - Main layout entry point
- `src/html_layout/line.rs` - Per-line layout computation
- Handles positioning, syllables, lyrics, ornaments, slurs for each line

---

## 6. Comparison: LilyPond vs Display

| Aspect | LilyPond Export | OSMD/VexFlow Display | HTML Layout |
|--------|-----------------|----------------------|-------------|
| **Input** | Document (via MusicXML) | Document (via MusicXML) | Document (Cells) |
| **Output** | LilyPond source text | SVG score notation | DOM elements |
| **Lines Handling** | Each line → separate stave | Each line → separate staff | Each line → RenderLine |
| **Process** | Document → IR → MusicXML → LilyPond | Document → MusicXML → OSMD → SVG | Document → LayoutEngine → DisplayList |
| **Rhythm Encoding** | LilyPond note values | MusicXML divisions | Spatial cell positions |

---

## 7. Key Files by Function

### Core Models
- `src/models/core.rs` - Document, Line, Cell structures

### Export Pipeline
- `src/renderers/musicxml/converter.rs` - Main entry: `to_musicxml()`
- `src/renderers/musicxml/cell_to_ir.rs` - Document → IR conversion (FSM)
- `src/renderers/musicxml/emitter.rs` - IR → MusicXML XML
- `src/converters/musicxml/mod.rs` - MusicXML → LilyPond conversion router

### LilyPond Conversion
- `src/converters/musicxml/musicxml_to_lilypond/converter.rs` - MusicXML parser
- `src/converters/musicxml/musicxml_to_lilypond/lilypond.rs` - LilyPond generation
- `src/converters/musicxml/musicxml_to_lilypond/templates.rs` - Template system
- `src/converters/musicxml/musicxml_to_lilypond/types.rs` - Internal Music types

### WASM API
- `src/api/core.rs` - JavaScript-facing functions

### JavaScript
- `src/js/lilypond-tab.js` - LilyPond display tab
- `src/js/export-ui.js` - Export dialog
- `src/js/osmd-renderer.js` - OSMD/VexFlow rendering

### Layout
- `src/html_layout/document.rs` - Document layout computation
- `src/html_layout/line.rs` - Per-line layout computation

---

## 8. Current Limitations & Opportunities

### What Works
✓ Multi-line documents supported in data model
✓ Each line has independent metadata (key, time sig, clef, lyrics, label)
✓ MusicXML properly exports multiple parts
✓ LilyPond output generates multiple staves
✓ Display rendering shows multiple lines correctly

### What Needs Clarification
? **How are multiple lines currently being used in practice?**
  - Single-line focus in UI?
  - Full multi-line editing support?
  - Part-by-part input vs. score view?

? **Label and metadata handling**
  - Are line labels displayed in HTML layout?
  - Are they exported to LilyPond?

? **Ornament export**
  - How are ornaments currently handled in MusicXML/LilyPond?
  - Are ornament positions preserved?

---

## 9. Summary: How to Add Line-Level Features

To add a new feature that affects **all lines** (e.g., line labels, line clefs, part names):

1. **Add to Line struct** (`src/models/core.rs`)
   ```rust
   pub struct Line {
       pub cells: Vec<Cell>,
       pub label: String,  // Already exists
       pub new_feature: String,  // Add here
       ...
   }
   ```

2. **Update IR conversion** (`src/renderers/musicxml/cell_to_ir.rs`)
   ```rust
   // In build_export_measures_from_document:
   for (line_idx, line) in document.lines.iter().enumerate() {
       let mut export_line = ExportLine::new(...);
       export_line.new_feature = line.new_feature.clone();  // Capture
       // ... process measures ...
   }
   ```

3. **Update MusicXML emitter** (if needed) (`src/renderers/musicxml/emitter.rs`)
   ```rust
   // When emitting part-level metadata:
   if let Some(feature) = &export_line.new_feature {
       // Emit as MusicXML element
   }
   ```

4. **Update LilyPond converter** (if needed) (`src/converters/musicxml/musicxml_to_lilypond/`)
   ```rust
   // When converting parts to staves:
   // Extract new_feature from MusicXML and incorporate into LilyPond
   ```

5. **Update display** (if needed) (`src/html_layout/line.rs`)
   ```rust
   // In LayoutLineComputer:
   if !line.new_feature.is_empty() {
       // Calculate positions/render additional elements
   }
   ```

