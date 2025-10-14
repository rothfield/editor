# MusicXML → OSMD → VexFlow Rendering Pipeline Port Plan

**Date:** 2025-10-14
**Status:** Ready to Execute
**Goal:** Port document → MusicXML → OSMD → VexFlow rendering pipeline for real-time staff notation display

---

## Overview

Port the MusicXML export and VexFlow rendering from the archive project. The data structures are nearly identical - just need to adjust iteration patterns.

### Data Structure Comparison

**Archive:**
```rust
Document.tree: Node::Root {
    elements: Vec<Node::Line {
        elements: Vec<Node> // PitchedElement, UnpitchedElement, Barline, Whitespace
    }>
}
```

**Current:**
```rust
Document.lines: Vec<Line {
    cells: Vec<Cell { kind: ElementKind, ... }>
}>
```

**Key insight:** Same structure, different wrapper. No adapter needed!

---

## Phase 1: Port MusicXML Export (Rust)

### Files to Port (Direct Copy + Minimal Changes)

#### 1.1 Port Helper Modules (No Changes)

**File:** `src/renderers/musicxml/duration.rs`
- Copy from archive: `archive/music-editor/src/tree/renderers/musicxml/duration.rs`
- **Changes:** None - pure calculation functions
- **Functions:**
  - `duration_to_note_type(duration: f64) -> (&'static str, usize)`
  - `note_type_from_tuplet_normal(normal_notes: usize) -> &'static str`

**File:** `src/renderers/musicxml/pitch.rs`
- Copy from archive: `archive/music-editor/src/tree/renderers/musicxml/pitch.rs`
- **Changes:** None - PitchCode enum works the same
- **Function:** `pitch_to_step_alter(code: PitchCode) -> (&'static str, i32)`

**File:** `src/renderers/musicxml/builder.rs`
- Copy from archive: `archive/music-editor/src/tree/renderers/musicxml/builder.rs`
- **Changes:** None - state machine is model-agnostic
- **Class:** `MusicXmlBuilder` with methods for notes, rests, measures, tuplets, ties, beaming

#### 1.2 Rewrite Main Export (Minimal Changes)

**File:** `src/renderers/musicxml/mod.rs`

**Archive version (tree-based):**
```rust
pub fn to_musicxml(doc: &Document) -> String {
    let mut builder = MusicXmlBuilder::new();

    // Extract lines from tree
    let lines = extract_lines(&doc.tree);  // ← Tree navigation

    for (i, line_elements) in lines.iter().enumerate() {
        process_line(&mut builder, line_elements, i > 0);
    }

    builder.finalize()
}

fn extract_lines(root: &Node) -> Vec<Vec<Node>> {
    if let Node::Root { elements, .. } = root {
        elements.iter()
            .filter_map(|n| if let Node::Line { elements, .. } = n {
                Some(elements.clone())
            } else { None })
            .collect()
    }
}
```

**Current version (Cell-based) - DIRECT REWRITE:**
```rust
pub fn to_musicxml(doc: &Document) -> String {
    let mut builder = MusicXmlBuilder::new();

    // Extract lines directly from document
    for (i, line) in doc.lines.iter().enumerate() {  // ← Direct iteration
        process_line(&mut builder, &line.cells, i > 0);
    }

    builder.finalize()
}

// No extract_lines needed!
```

**Key changes:**
- `doc.tree.elements` → `doc.lines`
- `Node::Line { elements }` → `Line { cells }`
- Pass `&line.cells` instead of tree nodes

#### 1.3 Rewrite Beat Extraction

**Archive version:**
```rust
fn extract_implicit_beats(elements: &[Node]) -> Vec<Vec<&Node>> {
    // Scan nodes for whitespace, group PitchedElement/UnpitchedElement
    let mut beats = Vec::new();
    let mut current_beat = Vec::new();

    for element in elements {
        match element {
            Node::PitchedElement { .. } | Node::UnpitchedElement { .. } => {
                current_beat.push(element);
            }
            Node::Whitespace { .. } | Node::BreathMark { .. } => {
                if !current_beat.is_empty() {
                    beats.push(current_beat);
                    current_beat = Vec::new();
                }
            }
            _ => {}
        }
    }

    if !current_beat.is_empty() {
        beats.push(current_beat);
    }

    beats
}
```

**Current version - DIRECT REWRITE:**
```rust
fn extract_implicit_beats(cells: &[Cell]) -> Vec<Vec<&Cell>> {
    let mut beats = Vec::new();
    let mut current_beat = Vec::new();

    for cell in cells {
        match cell.kind {
            ElementKind::PitchedElement | ElementKind::UnpitchedElement => {
                current_beat.push(cell);
            }
            ElementKind::Whitespace | ElementKind::BreathMark => {
                if !current_beat.is_empty() {
                    beats.push(current_beat);
                    current_beat = Vec::new();
                }
            }
            _ => {}
        }
    }

    if !current_beat.is_empty() {
        beats.push(current_beat);
    }

    beats
}
```

**Key changes:**
- `&[Node]` → `&[Cell]`
- `Node::PitchedElement` → `cell.kind == ElementKind::PitchedElement`
- Access fields via `cell.field` instead of pattern matching

#### 1.4 Rewrite Process Beat

**Archive extracts from Node fields:**
```rust
match node {
    Node::PitchedElement { octave, code, .. } => {
        // Use octave, code
    }
}
```

**Current extracts from Cell fields:**
```rust
if cell.kind == ElementKind::PitchedElement {
    let octave = cell.octave;
    let code = parse_pitch_code(&cell.pitch_code?)?;
    // Use octave, code
}
```

#### 1.5 Handle PitchCode

**Archive:** `Node::PitchedElement { code: PitchCode, ... }`
**Current:** `Cell { pitch_code: Option<String>, ... }`

**Solution:** Parse string to enum
```rust
fn parse_pitch_code(s: &str) -> Result<PitchCode, String> {
    use crate::models::pitch::PitchCode;

    match s {
        "N1" => Ok(PitchCode::N1),
        "N1s" => Ok(PitchCode::N1s),
        "N1b" => Ok(PitchCode::N1b),
        "N2" => Ok(PitchCode::N2),
        // ... etc (35 variants total)
        _ => Err(format!("Unknown pitch code: {}", s))
    }
}
```

Or better: Check if current project already has PitchCode enum and use it directly!

---

## Phase 2: WASM Binding

**File:** `src/api.rs`

Add export function:
```rust
#[wasm_bindgen(js_name = exportMusicXML)]
pub fn export_musicxml(document_js: JsValue) -> Result<String, JsValue> {
    wasm_info!("exportMusicXML called");

    let document: Document = serde_wasm_bindgen::from_value(document_js)
        .map_err(|e| JsValue::from_str(&format!("Deserialization error: {}", e)))?;

    let musicxml = crate::renderers::musicxml::to_musicxml(&document);

    wasm_info!("MusicXML generated: {} bytes", musicxml.len());
    Ok(musicxml)
}
```

Rebuild WASM:
```bash
make wasm-build
```

---

## Phase 3: JavaScript Integration

### 3.1 Port OSMD Renderer

**File:** `src/js/osmd-renderer.js`

Copy directly from archive:
```bash
cp archive/music-editor/static/js/osmd-renderer.js src/js/osmd-renderer.js
```

**No changes needed** - works as-is!

### 3.2 Update editor.js

Add to `MusicNotationEditor` class:

```javascript
async initialize() {
    // ... existing code ...

    // Import OSMD renderer
    const { OSMDRenderer } = await import('./osmd-renderer.js');
    this.osmdRenderer = new OSMDRenderer('staff-notation-container');

    console.log('OSMD renderer initialized');
}

async exportMusicXML() {
    if (!this.wasmModule || !this.theDocument) {
        return null;
    }

    try {
        const musicxml = this.wasmModule.exportMusicXML(this.theDocument);
        console.log('MusicXML exported:', musicxml.length, 'bytes');
        return musicxml;
    } catch (error) {
        console.error('MusicXML export failed:', error);
        return null;
    }
}

async renderStaffNotation() {
    if (!this.osmdRenderer) return;

    const musicxml = await this.exportMusicXML();
    if (!musicxml) return;

    await this.osmdRenderer.render(musicxml);
}
```

Add debounced rendering after document changes:
```javascript
// Trigger on every document change
async onDocumentChanged() {
    // ... existing rendering ...

    // Debounce staff notation (100ms)
    clearTimeout(this.staffNotationTimer);
    this.staffNotationTimer = setTimeout(() => {
        this.renderStaffNotation();
    }, 100);
}
```

---

## Phase 4: HTML Updates

### 4.1 Add OSMD Library

**File:** `index.html`

In `<head>`:
```html
<!-- OSMD for staff notation rendering -->
<script src="https://unpkg.com/opensheetmusicdisplay@1.7.6/build/opensheetmusicdisplay.min.js"></script>
```

### 4.2 Add Staff Notation Tab

In tab navigation:
```html
<button id="tab-staff-notation" class="tab" data-tab="staff-notation">
    Staff Notation
</button>
```

In tab content area:
```html
<div id="tab-content-staff-notation" data-tab-content="staff-notation"
     class="tab-content hidden flex-1 flex flex-col p-4">
    <h3 class="text-sm font-semibold mb-2 text-gray-700">
        Staff Notation (VexFlow)
    </h3>
    <div id="staff-notation-container"
         class="flex-1 bg-white p-4 border-2 border-gray-300 rounded overflow-auto">
        <div class="text-sm text-gray-500">
            Start typing music to see staff notation...
        </div>
    </div>
</div>
```

### 4.3 Wire Up Tab Switching

Add to tab click handler:
```javascript
if (tabName === 'staff-notation' && window.musicEditor) {
    await window.musicEditor.renderStaffNotation();
}
```

---

## Phase 5: Testing

### Quick Tests

1. **Empty document:**
   - Expected: Whole rest

2. **Simple melody:** `1 2 3`
   - Expected: 3 quarter notes

3. **With barlines:** `1 2 | 3 4 ||`
   - Expected: 2 measures

4. **Extended duration:** `1 - 2`
   - Expected: Half note, quarter note

5. **Multiple lines:**
   - Expected: System break between lines

6. **Cache test:**
   - Type note, check render time
   - Type another note, check render time (should be <50ms)

---

## Summary of Changes

### Files to Port (Copy + Minimal Edits)

| File | Source | Changes |
|------|--------|---------|
| `duration.rs` | Archive | None |
| `pitch.rs` | Archive | None |
| `builder.rs` | Archive | None |
| `mod.rs` | Archive | Rewrite iterations (tree → cells) |
| `osmd-renderer.js` | Archive | None |

### Files to Modify

| File | Change |
|------|--------|
| `src/api.rs` | Add `exportMusicXML` WASM binding |
| `src/js/editor.js` | Add MusicXML export + OSMD integration |
| `index.html` | Add OSMD library + tab |

### Total Effort Estimate

- **Rust porting:** 4-6 hours (mostly mechanical)
- **JavaScript integration:** 2-3 hours
- **HTML updates:** 1 hour
- **Testing:** 2-3 hours
- **Total:** 9-13 hours

---

## Implementation Order

1. ✅ Port `duration.rs` (copy file)
2. ✅ Port `pitch.rs` (copy file)
3. ✅ Port `builder.rs` (copy file)
4. ✅ Rewrite `mod.rs` (adapt tree → cells iteration)
5. ✅ Add WASM binding in `api.rs`
6. ✅ Rebuild WASM
7. ✅ Port `osmd-renderer.js` (copy file)
8. ✅ Update `editor.js`
9. ✅ Update `index.html`
10. ✅ Test

---

**Ready to execute!**
