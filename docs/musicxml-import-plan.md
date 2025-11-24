# MusicXML Import Implementation Plan

## Overview

Implement bidirectional MusicXML support by adding import functionality to complement the existing export pipeline.

## Architecture

### Current Export Pipeline
```
Document (Cell-based)
  → IR (Intermediate Representation)
    → MusicXML 3.1 String
```

### New Import Pipeline
```
MusicXML File
  ↓ [Parse with roxmltree]
IR (Intermediate Representation)
  ↓ [Reverse Builder - NEW]
Document (Cell-based)
  ↓
Editor Display
```

## Implementation Phases

### Phase 1: MusicXML → IR Parser (2-3 days)

**Goal:** Parse MusicXML into existing IR structures

**Files to Create:**
- `src/converters/musicxml/musicxml_to_ir/mod.rs` - Module entry point
- `src/converters/musicxml/musicxml_to_ir/parser.rs` - Main parsing logic
- `src/converters/musicxml/musicxml_to_ir/types.rs` - Parser-specific types

**Key Tasks:**
1. Parse `<score-partwise>` structure
2. Extract measures and attributes (divisions, key, time signature)
3. Parse note elements (pitch, duration, type)
4. Handle rests, accidentals, ties
5. Parse ornaments and articulations
6. Build `Vec<ExportLine>` with `Vec<ExportMeasure>` containing `Vec<ExportEvent>`

**Dependencies:**
- `roxmltree` (already in Cargo.toml)
- Existing IR types from `src/ir/types.rs`

**Testing:**
- Unit tests with minimal MusicXML snippets
- Test files from MuseScore, Finale, Sibelius

### Phase 2: IR → Document Converter (2-3 days)

**Goal:** Convert IR back to Cell-based Document with spatial notation

**Files to Create:**
- `src/converters/ir_to_document.rs` - Reverse builder module
- Helper functions for spatial layout reconstruction

**Key Tasks:**
1. **Rhythmic conversion:** Convert IR durations (divisions) → spatial notation (dashes)
   - Quarter note (1 beat) → `S` (single char)
   - Half note (2 beats) → `S--` (char + dashes)
   - Eighth notes → `Sr` (adjacent chars)
   - Rests → leading/trailing dashes
2. **Pitch mapping:** MusicXML pitch → configured pitch system
   - Default to Western (C-D-E-F-G-A-B)
   - User can switch to Number/Sargam after import
3. **Cell construction:** Build Cell vector with proper flags
   - ElementKind (Pitch, Rest, Barline)
   - Pitch codes, accidentals, octaves
   - Layout fields (col, row)
4. **Line/Staff organization:** Group measures into staves
5. **Ornament mapping:** MusicXML ornaments → editor syntax

**Challenges:**
- **Spatial layout:** Must reconstruct dash-based rhythmic notation from absolute divisions
- **Beat grouping:** Determine where to insert spaces (beat boundaries)
- **Multi-voice:** Flatten or preserve as multi-staff?

**Testing:**
- Round-trip tests: Document → MusicXML → IR → Document
- Verify rhythmic accuracy (subdivision counting)
- Verify pitch preservation

### Phase 3: WASM API Integration (1 day)

**Goal:** Expose import functionality to JavaScript

**Files to Modify:**
- `src/api/export.rs` - Add import functions
- `src/js/editor.js` - Add to wasmModule wrapper
- `src/js/core/WASMBridge.ts` - TypeScript bindings

**New WASM Functions:**
```rust
#[wasm_bindgen(js_name = importMusicXML)]
pub fn import_musicxml(xml_string: String) -> Result<JsValue, JsValue>;

#[wasm_bindgen(js_name = parseToIR)]
pub fn parse_to_ir(xml_string: String) -> Result<String, JsValue>;
```

**Critical Steps:**
1. Add `#[wasm_bindgen]` decorators
2. Build WASM: `npm run build-wasm`
3. **⚠️ Add to `this.wasmModule` object in `src/js/editor.js`** (lines ~64-101)
4. Test with hard refresh (Ctrl+Shift+R)

### Phase 4: JavaScript File Operations (1 day)

**Goal:** UI for opening MusicXML files

**Files to Modify:**
- `src/js/file-ops.js` - Add MusicXML file handling
- `index.html` - Update file input accept types

**Key Tasks:**
1. Add `.musicxml` and `.xml` to file picker
2. Detect file type (JSON vs MusicXML)
3. Call `importMusicXML()` for MusicXML files
4. Handle import errors gracefully
5. Update document title with filename

**UI Flow:**
```
User clicks "Open"
  → File picker shows .json, .musicxml, .xml
  → User selects MusicXML file
  → JavaScript reads file as text
  → Calls wasmModule.importMusicXML(xmlString)
  → Receives Document JsValue
  → Initializes editor with imported document
```

### Phase 5: Testing (1-2 days)

**Goal:** Comprehensive test coverage

**Test Files:**
- Create `tests/fixtures/musicxml/` directory
- Sample files from various sources:
  - MuseScore exports
  - Finale exports
  - Sibelius exports
  - Hand-crafted minimal examples

**Unit Tests:**
```rust
#[test]
fn test_parse_simple_measure() { ... }

#[test]
fn test_parse_ornaments() { ... }

#[test]
fn test_round_trip_preservation() { ... }
```

**E2E Tests:**
```javascript
// tests/e2e-pw/tests/import-musicxml.spec.js
test('import MusicXML file and verify LilyPond output', async ({ page }) => {
  // Upload test file
  // Verify inspector tabs show correct content
});
```

**Test Checklist:**
- [ ] Simple melody (quarter notes, half notes)
- [ ] Rests and tied notes
- [ ] Accidentals (sharps, flats, naturals)
- [ ] Ornaments (trill, turn, mordent)
- [ ] Multiple measures
- [ ] Key signatures
- [ ] Time signatures
- [ ] Multi-staff scores
- [ ] Round-trip accuracy (export → import → export)

## Technical Details

### MusicXML Structure

```xml
<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1">
      <part-name>Piano</part-name>
    </score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>4</duration>
        <type>quarter</type>
      </note>
    </measure>
  </part>
</score-partwise>
```

### Rhythmic Conversion Algorithm

**MusicXML → Spatial:**
```rust
fn duration_to_spatial(duration_divs: u32, divisions: u32) -> String {
    let beats = duration_divs as f64 / divisions as f64;
    let dashes = (beats * 4.0 - 1.0).max(0.0) as usize; // Subdivisions

    // Example: duration=8, divisions=4 → 2 beats → "1--"
    // Example: duration=2, divisions=4 → 0.5 beats → "1" (eighth)
}
```

### Pitch System Mapping

**MusicXML Pitch → Editor:**
```rust
fn musicxml_pitch_to_pitch_code(step: &str, alter: i8) -> PitchCode {
    match (step, alter) {
        ("C", 0) => PitchCode::Do,   // C natural
        ("C", 1) => PitchCode::Di,   // C sharp
        ("D", -1) => PitchCode::Ra,  // D flat
        ("D", 0) => PitchCode::Re,   // D natural
        // ... etc
    }
}
```

### IR Structure (Reused)

```rust
pub struct ExportLine {
    pub measures: Vec<ExportMeasure>,
}

pub struct ExportMeasure {
    pub events: Vec<ExportEvent>,
    pub time_signature: Option<(u8, u8)>,
    pub key_signature: Option<i8>,
}

pub struct ExportEvent {
    pub kind: ExportEventKind,
    pub duration_divs: u32,
    pub position_divs: u32,
}

pub enum ExportEventKind {
    Note(NoteData),
    Rest,
    Barline,
}
```

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Spatial layout ambiguity | High | Prefer standard durations; use ties for complex rhythms |
| Pitch system mismatch | Medium | Default to Western; document conversion process |
| Multi-voice complexity | Medium | Start with single-voice; flatten multi-voice as fallback |
| Ornament syntax differences | Low | Map common ornaments; ignore unsupported ones |
| Round-trip loss | High | Comprehensive testing; document limitations |

## Success Criteria

- [ ] Can import simple MusicXML melody (single staff, quarter/half notes)
- [ ] Rhythmic notation displays correctly (proper dash spacing)
- [ ] Pitch preservation verified (export → import → export identical)
- [ ] Ornaments import correctly (trill, turn, mordent)
- [ ] E2E test passes: file upload → editor display → inspector tabs
- [ ] No console errors or WASM panics
- [ ] User documentation updated

## Future Enhancements (Post-MVP)

1. **MIDI import** (similar IR-based approach)
2. **Multi-voice preservation** (map to multi-staff document)
3. **Lyrics import** (MusicXML `<lyric>` → editor lyrics)
4. **Advanced ornaments** (grace notes, appoggiaturas)
5. **Chord symbols** (MusicXML `<harmony>` → editor chords)
6. **Batch import** (multiple files at once)

## Timeline

| Phase | Estimated Time | Dependencies |
|-------|----------------|--------------|
| Phase 1: MusicXML → IR | 2-3 days | None |
| Phase 2: IR → Document | 2-3 days | Phase 1 complete |
| Phase 3: WASM API | 1 day | Phase 2 complete |
| Phase 4: JS Integration | 1 day | Phase 3 complete |
| Phase 5: Testing | 1-2 days | All phases complete |
| **Total** | **7-10 days** | |

## References

- MusicXML 3.1 Specification: https://www.w3.org/2021/06/musicxml31/
- Existing export code: `src/renderers/musicxml/emitter.rs`
- IR types: `src/ir/types.rs`
- Document model: `src/models/core.rs`
- Rhythmic notation guide: `RHYTHM.md`
