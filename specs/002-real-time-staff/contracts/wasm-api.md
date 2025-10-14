# WASM API Contract: MusicXML Export

## Overview

This contract defines the WASM-JavaScript boundary for MusicXML export functionality. The contract specifies input/output formats, error handling, and performance guarantees.

## API Endpoint

### `exportMusicXML`

**Purpose**: Convert Cell-based document to MusicXML 3.1 format string

**Rust Signature**:
```rust
#[wasm_bindgen(js_name = exportMusicXML)]
pub fn export_musicxml(document_js: JsValue) -> Result<String, JsValue>
```

**JavaScript Signature**:
```typescript
function exportMusicXML(document: Document): string
```

---

## Input Contract

### Document Structure

**Type**: `Document` (deserialized from JsValue via serde)

**Required Fields**:
```typescript
interface Document {
    lines: Line[]
}

interface Line {
    cells: Cell[]
}

interface Cell {
    kind: string              // "PitchedElement" | "UnpitchedElement" | "Barline" | "Whitespace" | "BreathMark"
    content: string           // Visual representation
    is_temporal: boolean      // Whether element has duration
    pitch_code?: string       // Required for PitchedElement
    octave?: number           // Required for PitchedElement (-4 to +4)
    // Other fields ignored for MusicXML export
}
```

**Validation Rules**:
1. `document.lines` must be non-empty array (length >= 1)
2. Each `line.cells` must be non-empty array (length >= 1)
3. For `kind === "PitchedElement"`:
   - `pitch_code` must be present and valid
   - `octave` must be present and in range -4 to +4
4. At least one temporal element must exist across all lines

**Invalid Input Handling**:
```rust
// Empty document
if document.lines.is_empty() {
    return Ok(generate_empty_musicxml()); // Single measure with whole rest
}

// Invalid pitch
if kind == ElementKind::PitchedElement && pitch_code.is_none() {
    log::warn!("Skipping note without pitch code");
    continue; // Skip this note, continue processing
}

// Unsupported pitch system
if !is_supported_pitch_system(pitch_code) {
    log::warn!("Unsupported pitch system: {}", pitch_code);
    continue; // Skip this note, continue processing
}
```

---

## Output Contract

### Success Response

**Type**: `String` (MusicXML 3.1 document)

**Format**:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN"
    "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1">
      <part-name></part-name>
    </score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>24</divisions>
        <key><fifths>0</fifths></key>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <!-- Notes, rests, barlines -->
    </measure>
    <!-- More measures -->
  </part>
</score-partwise>
```

**Guarantees**:
1. **Well-formed XML**: Valid XML 1.0 structure
2. **MusicXML 3.1 compliant**: Passes DTD validation
3. **Single part**: Always exports as single instrument/voice
4. **Treble clef**: Fixed G clef on line 2
5. **C major**: Fixed key signature (0 sharps/flats)
6. **No time signature**: Measures not constrained to specific duration
7. **System breaks**: `<print new-system="yes"/>` for each Line after the first

**Size Limits**:
- Typical output: 1-5 KB per measure
- Maximum reasonable size: 500 KB (for 100+ measure documents)

---

### Error Response

**Type**: `JsValue` (JavaScript Error object)

**Error Categories**:

#### 1. Deserialization Error
**Trigger**: Invalid document structure from JavaScript
**Response**:
```rust
Err(JsValue::from_str(&format!("Deserialization error: {}", e)))
```
**JavaScript receives**:
```javascript
throw new Error("Deserialization error: missing field `lines` at line 1 column 10")
```

#### 2. Export Processing Error
**Trigger**: Fatal error during MusicXML generation (rare)
**Response**:
```rust
Err(JsValue::from_str(&format!("MusicXML export failed: {}", e)))
```
**JavaScript receives**:
```javascript
throw new Error("MusicXML export failed: division calculation overflow")
```

#### 3. WASM Module Not Loaded
**Trigger**: JavaScript calls function before WASM initialization
**Response**: JavaScript-side check
```javascript
if (!wasmModule || !wasmModule.exportMusicXML) {
    throw new Error("WASM module not initialized");
}
```

---

## Performance Contract

### Time Complexity

**Target**: O(n) where n = total number of cells

**Benchmarks**:
| Document Size | Cells | Expected Time | Maximum Time |
|---------------|-------|---------------|--------------|
| Small         | 1-50  | < 1ms         | 5ms          |
| Medium        | 51-200| 1-5ms         | 10ms         |
| Large         | 201-500| 5-10ms       | 20ms         |
| Very Large    | 501+  | 10-50ms       | 100ms        |

**Performance Guarantees**:
1. Export MUST complete in < 10ms for documents up to 50 measures (typical use case)
2. Export SHOULD complete in < 50ms for documents up to 200 measures
3. No maximum time limit (operation completes eventually or errors)

### Memory Usage

**Peak Memory**: O(n) where n = total number of cells

**Typical Usage**:
- Small document (50 cells): ~10 KB peak allocation
- Medium document (200 cells): ~40 KB peak allocation
- Large document (500 cells): ~100 KB peak allocation

**Memory Guarantees**:
1. All intermediate structures deallocated after function returns
2. No memory leaks in repeated calls
3. Output string size proportional to input complexity

---

## JavaScript Integration Pattern

### Recommended Usage

```javascript
// In editor.js (MusicNotationEditor class)
async exportMusicXML() {
    if (!this.wasmModule || !this.theDocument) {
        console.warn('exportMusicXML: WASM or document not available');
        return null;
    }

    try {
        const startTime = performance.now();

        const musicxml = this.wasmModule.exportMusicXML(this.theDocument);

        const exportTime = performance.now() - startTime;
        console.log(`MusicXML exported: ${musicxml.length} bytes in ${exportTime.toFixed(2)}ms`);

        return musicxml;

    } catch (error) {
        console.error('MusicXML export failed:', error);

        // Log to errors tab
        this.logError('MusicXML Export Error', error.message);

        return null; // Graceful degradation
    }
}
```

### Error Handling Strategy

```javascript
// User-facing error handling
async renderStaffNotation() {
    const musicxml = await this.exportMusicXML();

    if (!musicxml) {
        // Show user-friendly message
        this.showStaffNotationError('Unable to export notation. Check Console Errors tab.');
        return;
    }

    try {
        await this.osmdRenderer.render(musicxml);
    } catch (error) {
        console.error('OSMD rendering failed:', error);
        this.showStaffNotationError('Rendering failed. See console for details.');
        // Preserve last successful render
    }
}
```

---

## Logging Contract

### WASM-side Logging

**Debug Level** (development builds only):
```rust
log::debug!("Exporting document with {} lines", document.lines.len());
log::debug!("Measure {}: {} beats, {} divisions", measure_num, beat_count, divisions);
```

**Info Level** (always):
```rust
log::info!("MusicXML export complete: {} measures, {} bytes", measure_count, output.len());
```

**Warning Level** (recoverable issues):
```rust
log::warn!("Skipping note with invalid pitch code: {}", code);
log::warn!("Unsupported pitch system: {}", system);
log::warn!("Beat has no temporal elements, skipping");
```

**Error Level** (fatal issues):
```rust
log::error!("Division calculation overflow for beat with {} subdivisions", count);
log::error!("Failed to parse pitch code: {}", code);
```

### JavaScript-side Logging

**Console Log tab**:
```javascript
console.log(`MusicXML exported: ${length} bytes in ${time}ms`);
```

**Console Errors tab**:
```javascript
console.error('MusicXML export failed:', error);
this.logError('MusicXML Export', error.message);
```

---

## Testing Contract

### Unit Test Requirements

**Rust side** (`src/renderers/musicxml/tests/`):
1. Empty document → empty measure with whole rest
2. Single note → valid MusicXML with one note
3. Multiple notes → correct duration calculations
4. Barlines → proper measure boundaries
5. Multiple lines → system breaks (`<print new-system="yes"/>`)
6. Invalid pitch code → graceful skip with warning
7. Performance test → 500 cells in < 50ms

**JavaScript side** (`tests/e2e/test_staff_notation_*.py`):
1. Type "1 2 3" → export succeeds, valid MusicXML
2. Export timing → < 10ms for typical document
3. Export error → graceful fallback, error logged
4. WASM not loaded → appropriate error message

### Integration Test Requirements

1. Full pipeline: Document → MusicXML → OSMD → SVG
2. All user story scenarios (from spec.md)
3. Error recovery: Invalid document → error → fix → success
4. Performance: 50 measures → export + render < 600ms

---

## Versioning and Compatibility

### Current Version
**Version**: 1.0.0 (initial implementation)
**MusicXML Version**: 3.1
**WASM-bindgen Version**: 0.2.92

### Backward Compatibility Guarantees

**Input**: Adding new Cell fields is non-breaking (ignored by export)
**Output**: MusicXML 3.1 format stable (will not change)
**Errors**: Error message format may change (not part of contract)

### Future Compatibility Notes

**Planned additions** (non-breaking):
- Support for additional pitch systems (Sargam, Bhatkhande)
- Tuplet notation improvements
- Articulation marks (staccato, accent)

**Breaking changes** (would require major version bump):
- Changing to MusicXML 4.0 format
- Requiring additional mandatory fields in Document
- Changing function signature

---

## Security and Safety

### Input Validation
1. Deserialize safely via serde (no unsafe code)
2. Bounds check all array accesses
3. Validate numeric ranges (divisions < 960, octave in -4..+4)
4. No user-controlled memory allocation sizes

### Output Safety
1. All XML characters escaped properly
2. No injection vulnerabilities in generated XML
3. Output size bounded by input complexity

### WASM Safety
1. No `unsafe` blocks in export code
2. All panics converted to `Result::Err`
3. No memory leaks (all allocations RAII)

---

## Examples

### Example 1: Simple Melody

**Input**:
```javascript
{
    lines: [{
        cells: [
            { kind: "PitchedElement", pitch_code: "1", octave: 0, is_temporal: true, content: "1" },
            { kind: "Whitespace", is_temporal: false, content: " " },
            { kind: "PitchedElement", pitch_code: "2", octave: 0, is_temporal: true, content: "2" },
            { kind: "Whitespace", is_temporal: false, content: " " },
            { kind: "PitchedElement", pitch_code: "3", octave: 0, is_temporal: true, content: "3" }
        ]
    }]
}
```

**Output**: (simplified)
```xml
<measure number="1">
    <attributes>
        <divisions>1</divisions>
        <key><fifths>0</fifths></key>
        <clef><sign>G</sign><line>2</line></clef>
    </attributes>
    <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
    <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
    <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
</measure>
```

### Example 2: With Barlines

**Input**:
```javascript
{
    lines: [{
        cells: [
            { kind: "PitchedElement", pitch_code: "1", octave: 0, is_temporal: true, content: "1" },
            { kind: "Whitespace", is_temporal: false, content: " " },
            { kind: "PitchedElement", pitch_code: "2", octave: 0, is_temporal: true, content: "2" },
            { kind: "Barline", is_temporal: false, content: "|" },
            { kind: "PitchedElement", pitch_code: "3", octave: 0, is_temporal: true, content: "3" }
        ]
    }]
}
```

**Output**: Two measures separated by barline

### Example 3: Error Case

**Input**:
```javascript
{
    lines: [{
        cells: [
            { kind: "PitchedElement", is_temporal: true, content: "1" }  // Missing pitch_code!
        ]
    }]
}
```

**Output**: Empty measure (note skipped with warning logged)
