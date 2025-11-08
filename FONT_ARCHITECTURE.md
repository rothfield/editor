# Font Architecture & Pitch Rendering Pipeline

## Executive Summary

The editor uses a **three-layer font system** to render pitches and musical symbols:

1. **Bravura SMuFL Font** (woff2/woff) - Standard music notation glyphs (sharps, flats, barlines)
2. **NotationMonoDotted Custom Font** (TTF) - Octave indicators (dots above/below notes)
3. **Inter Font** (TTC) - Regular text and UI elements

The pitch rendering pipeline converts from document model (Cell objects with pitch codes) → CSS classes → DOM with Unicode codepoints/glyphs.

---

## Layer 1: Font Files & Loading

### Location
- **Static folder**: `/home/john/editor/static/fonts/`
- **HTML loading**: Lines 15-38 in `/home/john/editor/index.html`

### Font Definitions

#### Bravura (SMuFL Standard Music Font)
```
File: Bravura.woff2 (242 KB), Bravura.woff (945 KB)
Purpose: Standard music notation glyphs
Font-family: 'Bravura'
```

#### NotationMonoDotted (Custom Font for Octave Markers)
```
File: NotationMonoDotted.ttf (472 KB)
Purpose: Base pitch characters with octave dot variants (47 base characters × 4 variants each)
Font-family: 'NotationMonoDotted'
```

Characters supported (47 total - 188 glyphs with octave variants):
- Number system: 1, 2, 3, 4, 5, 6, 7 (7 chars)
- Western system: C, D, E, F, G, A, B, c, d, e, f, g, a, b (14 chars)
- Sargam system: S, r, R, g, G, m, M, P, d, D, n, N (12 chars)
- Doremi system: d, r, m, f, s, l, t, D, R, M, F, S, L, T (14 chars, shared with others)

#### Inter (User Interface Font)
```
File: Inter.ttc (13 MB)
Purpose: Regular text, UI components
Font-family: 'Inter'
```

---

## Layer 2: Pitch Code to CSS Class Mapping

### Rust Data Model: PitchCode Enum

**File**: `/home/john/editor/src/models/pitch_code.rs`

PitchCode is a 35-variant enum representing all 7 base degrees × 5 accidental types:
```rust
enum PitchCode {
    // Naturals (7)
    N1, N2, N3, N4, N5, N6, N7,
    
    // Sharps (7)
    N1s, N2s, N3s, N4s, N5s, N6s, N7s,
    
    // Flats (7)
    N1b, N2b, N3b, N4b, N5b, N6b, N7b,
    
    // Double sharps (7)
    N1ss, N2ss, N3ss, N4ss, N5ss, N6ss, N7ss,
    
    // Double flats (7)
    N1bb, N2bb, N3bb, N4bb, N5bb, N6bb, N7bb,
}

impl PitchCode {
    pub fn accidental_type(&self) -> AccidentalType {
        // Returns: None | Sharp | Flat | DoubleSharp | DoubleFlat
    }
}
```

### Accidental Types
**File**: `/home/john/editor/src/models/elements.rs`

```rust
enum Accidental {
    Natural = 0,      // No symbol
    Sharp = 1,        // #
    DoubleSharp = 2,  // ##
    Flat = 3,         // b
    DoubleFlat = 4,   // bb
}

impl Accidental {
    pub fn symbol(&self) -> &'static str {
        // Returns: "", "#", "##", "b", "bb"
    }
    pub fn semitone_offset(&self) -> i8 {
        // Returns: 0, 1, 2, -1, -2
    }
}
```

### Pitch System Support
**File**: `/home/john/editor/src/models/elements.rs`

```rust
enum PitchSystem {
    Unknown = 0,
    Number = 1,        // Default system (1-7)
    Western = 2,       // C-B / c-b
    Sargam = 3,        // S, r, R, g, G, m, M, P, d, D, n, N
    Bhatkhande = 4,    // Indian classical
    Tabla = 5,         // Percussion
}

impl PitchSystem {
    pub fn supports_accidentals(&self) -> bool {
        // Returns: true for Number | Western
    }
}
```

---

## Layer 3: Cell Rendering Pipeline

### 3A: Rust Layout Engine (DOM Structure)

**File**: `/home/john/editor/src/html_layout/cell.rs`

The `CellStyleBuilder` creates `RenderCell` objects with CSS classes and data attributes:

```rust
pub struct CellStyleBuilder;

impl CellStyleBuilder {
    pub fn build_render_cell(&self, cell: &Cell, ...) -> RenderCell {
        // 1. Build CSS class list
        let mut classes = vec!["char-cell"];
        classes.push(format!("kind-{}", element_kind_to_css(cell.kind)));
        
        // 2. For pitched elements: check accidental type
        if cell.kind == ElementKind::PitchedElement && !cell.continuation {
            if let Some(pitch_code) = cell.pitch_code {
                match pitch_code.accidental_type() {
                    AccidentalType::Sharp => classes.push("pitch-accidental-sharp"),
                    AccidentalType::Flat => classes.push("pitch-accidental-flat"),
                    AccidentalType::DoubleSharp => classes.push("pitch-accidental-double-sharp"),
                    AccidentalType::DoubleFlat => classes.push("pitch-accidental-double-flat"),
                    AccidentalType::None => {},
                }
            }
        }
        
        // 3. For octave display: substitute base char with PUA glyph
        let char = if cell.octave != 0 {
            get_glyph_codepoint(base_char, cell.octave)  // → PUA char
        } else {
            base_char  // Keep original
        };
        
        // 4. Hide continuation cells (multi-char accidentals)
        if cell.continuation && cell.kind == ElementKind::PitchedElement {
            classes.push("pitch-continuation");
        }
        
        RenderCell {
            char,
            classes,
            // ... x, y, width, etc.
        }
    }
}
```

### 3B: JavaScript DOM Rendering

**File**: `/home/john/editor/src/js/renderer.js` (Lines 1-191)

CSS setup for accidental glyphs:

```css
/* Lines 83-121 */

/* Base styles for all pitch accidentals (SMuFL glyphs) */
.char-cell.pitch-accidental-sharp::after,
.char-cell.pitch-accidental-flat::after,
.char-cell.pitch-accidental-double-sharp::after,
.char-cell.pitch-accidental-double-flat::after {
    font-family: 'Bravura', serif;
    position: absolute;
    left: 100%;  /* Position to right of note */
    top: calc(50% + BRAVURA_VERTICAL_OFFSET);
    transform: translateY(-50%);
    color: #000;
    font-size: BRAVURA_FONT_SIZE * 1.4px;
    z-index: 3;
    pointer-events: none;
}

/* SMuFL Unicode codepoints */
.char-cell.pitch-accidental-sharp::after {
    content: '\uE262';  /* U+E262 sharp (♯) */
}

.char-cell.pitch-accidental-flat::after {
    content: '\uE260';  /* U+E260 flat (♭) */
}

.char-cell.pitch-accidental-double-sharp::after {
    content: '\uE263';  /* U+E263 double sharp (𝄪) */
}

.char-cell.pitch-accidental-double-flat::after {
    content: '\uE264';  /* U+E264 double flat (𝄫) */
}
```

---

## Layer 4: Octave Rendering (NotationMonoDotted Font)

**File**: `/home/john/editor/src/renderers/font_utils.rs`

The glyph substitution system maps base characters + octave shifts to Private Use Area (PUA) codepoints.

### PUA Mapping Formula

```
Codepoint = 0xE000 + (char_index * 4) + variant_index

Where:
  char_index = position in ALL_CHARS string (0-46)
  variant_index = octave mapping:
    octave +1 → variant 0
    octave +2 → variant 1
    octave -1 → variant 2
    octave -2 → variant 3
```

### Character Order (Critical!)
```
ALL_CHARS = "1234567CDEFGABcdefgabSrRgGmMPdDnNdrmfsltDRMFSLT"
           (47 characters total, some appear twice)
```

### Examples

```
get_glyph_codepoint('1', 1) → U+E000  (1 with 1 dot above)
get_glyph_codepoint('1', 2) → U+E001  (1 with 2 dots above)
get_glyph_codepoint('1', -1) → U+E002 (1 with 1 dot below)
get_glyph_codepoint('1', -2) → U+E003 (1 with 2 dots below)

get_glyph_codepoint('C', 1) → U+E01C  (C with 1 dot above, index 7)
get_glyph_codepoint('S', 1) → U+E054  (S with 1 dot above, index 21)
```

### Fallback Behavior
- If octave shift is 0 or character not found → return base character unchanged
- If octave is out of range (±3+) → return base character unchanged

---

## Layer 5: MusicXML Pitch Export

**File**: `/home/john/editor/src/renderers/musicxml/pitch.rs`

Pitch rendering is system-agnostic for MusicXML:

```rust
pub fn pitch_code_to_step_alter(pitch_code: &PitchCode) -> (&'static str, i8) {
    // Convert degree (1-7) to Western step (C-B)
    let step = match pitch_code.degree() {
        1 => "C", 2 => "D", 3 => "E", 4 => "F",
        5 => "G", 6 => "A", 7 => "B",
    };
    
    // Calculate alter (-2 to +2)
    let alter = match pitch_code {
        N1 | N2 | N3 | N4 | N5 | N6 | N7 => 0,           // Natural
        N1s | N2s | ... => 1,                             // Sharp
        N1b | N2b | ... => -1,                            // Flat
        N1ss | N2ss | ... => 2,                           // Double sharp
        N1bb | N2bb | ... => -2,                          // Double flat
    };
    
    (step, alter)
}
```

This allows seamless conversion from any pitch system (Number/Western/Sargam) to standard MusicXML.

---

## Rendering Pipeline: Complete Flow

```
Document Model (Cell)
    ↓
Rust Layout Engine (cell.rs)
    ├─ PitchCode → AccidentalType
    ├─ octave shift → PUA glyph substitution
    └─ Generate CSS classes
    ↓
JavaScript DOM Renderer (renderer.js)
    ├─ Apply "char-cell" base class
    ├─ Apply "kind-{pitched,unpitched,barline,...}" class
    ├─ Apply "pitch-accidental-{sharp,flat,...}" class → SMuFL glyph
    ├─ Substitute char with PUA codepoint if octave != 0
    └─ Create span with font-family and classes
    ↓
Browser Font Rendering
    ├─ pitch-accidental-* classes → Bravura font (SMuFL)
    ├─ NotationMonoDotted font substitutions → Custom octave glyphs
    └─ Inter font → Regular text
    ↓
Visual Output (Notes with sharps/flats/octave dots)
```

---

## Key Integration Points

### 1. Adding New Pitch Systems
- Update `PitchSystem` enum in `src/models/elements.rs`
- Add parsing/validation in `src/models/pitch_code.rs`
- Update `ALL_CHARS` string in `src/renderers/font_utils.rs` if using NotationMonoDotted
- Update `pitch_sequence()` method in `src/models/elements.rs`

### 2. Adding New Accidental Types
- Update `Accidental` enum in `src/models/elements.rs`
- Update CSS classes in `src/js/renderer.js` with new SMuFL codepoints
- Update `pitch_code.rs` accidental type matching

### 3. Adding New Fonts
- Add `@font-face` in `index.html` (lines 15-38)
- Update CSS in `src/js/renderer.js` to use new font-family
- Update glyph codepoint mapping if needed

### 4. Changes to Octave Rendering
- Modify `get_glyph_codepoint()` in `src/renderers/font_utils.rs`
- Update `ALL_CHARS` string if adding/removing characters
- Update PUA base address or formula if changing font structure

---

## File Structure

```
/home/john/editor/
├── index.html                              [Font loading, CSS styles]
├── static/fonts/
│   ├── Bravura.woff2                       [SMuFL music font - accidentals/barlines]
│   ├── Bravura.woff                        [SMuFL fallback format]
│   ├── NotationMonoDotted.ttf              [Custom font - octave indicators]
│   └── Inter.ttc                           [UI text font]
├── src/models/
│   ├── elements.rs                         [ElementKind, PitchSystem, Accidental enums]
│   ├── pitch.rs                            [Pitch struct, PitchConverter]
│   ├── pitch_code.rs                       [PitchCode enum, system conversions]
├── src/utils/
│   └── pitch_utils.rs                      [Pitch validation, accidental parsing]
├── src/html_layout/
│   ├── cell.rs                             [CellStyleBuilder, RenderCell]
│   ├── line.rs                             [Line-level layout]
│   └── document.rs                         [Document-level layout]
├── src/renderers/
│   ├── font_utils.rs                       [PUA glyph substitution logic]
│   ├── musicxml/pitch.rs                   [MusicXML pitch export]
│   └── mod.rs                              [Renderer re-exports]
└── src/js/
    ├── renderer.js                         [DOM rendering, CSS setup for glyphs]
    ├── editor.js                           [Main editor instance]
    └── main.js                             [App initialization]
```

---

## Current Limitations & Future Work

### Current Limitations
1. Octave shifts limited to ±2 (out-of-range reverts to base character)
2. NotationMonoDotted font only supports pre-defined character set
3. Accidental rendering uses CSS `::after` pseudo-elements (visual only, not in DOM)
4. No support for custom glyph spacing adjustments

### Future Enhancement Points
1. **Microtonal support**: Add 50-cent accidentals (SMuFL U+E280-U+E28F)
2. **Articulationmarks**: Staccato, tenuto, accent glyphs
3. **Dynamics**: p, f, ff, pp glyphs from SMuFL
4. **Notation variants**: Ligatures, alternate glyphs via OpenType features
5. **Font metrics API**: Query font for actual glyph widths for precise layout

