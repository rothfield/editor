# Pitch Rendering System: Integration Points & Modification Guide

## Quick Reference Table

| System Layer | Rust Files | JavaScript Files |
|---|---|---|
| Pitch Systems | src/models/elements.rs (PitchSystem enum) | src/models/pitch_code.rs (PitchCode enum) |
| Accidentals | src/models/elements.rs (Accidental enum) | src/utils/pitch_utils.rs (parsing) |
| Cell Rendering | src/html_layout/cell.rs (CSS classes) | src/js/renderer.js (DOM + CSS) |
| Octave Glyphs | src/renderers/font_utils.rs (PUA mapping) | |
| MusicXML Export | src/renderers/musicxml/pitch.rs (export) | |
| Font Loading | index.html (lines 15-38) | |

---

## 1. Pitch Systems

**File**: `src/models/elements.rs` (lines 219-330)

Current systems:
- `PitchSystem::Number` (1-7) [DEFAULT]
- `PitchSystem::Western` (C-B / c-b)
- `PitchSystem::Sargam` (S, r, R, g, G, m, M, P, d, D, n, N)
- `PitchSystem::Bhatkhande` (Indian classical)
- `PitchSystem::Tabla` (Percussion)

### To add a new pitch system (e.g., Doremi):

1. Add variant to enum
2. Add case to `supports_accidentals()` method
3. Add case to `is_case_sensitive()` method
4. Add case to `pitch_sequence()` method - **CRITICAL!**
5. Add case to `name()` method
6. Add case to `snake_case_name()` method
7. Add case to `css_class()` method
8. Add case to `validate_pitch()` method

---

## 2. Accidental Types

**File**: `src/models/elements.rs` (lines 338-398)

Current accidentals:
- `Accidental::Natural` (0) - no symbol
- `Accidental::Sharp` (1) - `#`
- `Accidental::DoubleSharp` (2) - `##`
- `Accidental::Flat` (3) - `b`
- `Accidental::DoubleFlat` (4) - `bb`

### To add a new accidental (e.g., Quarter-Tone):

1. Add variant to `Accidental` enum
2. Add case to `symbol()` method
3. Add case to `semitone_offset()` method
4. Add case to `parse()` method
5. Add CSS class in `src/js/renderer.js` for visual rendering
6. Update accidental detection in `src/models/pitch_code.rs`

---

## 3. Pitch Code Rendering

**File**: `src/models/pitch_code.rs`

PitchCode has 35 variants (7 degrees × 5 accidental types):
- N1, N2, N3, N4, N5, N6, N7 (naturals)
- N1s, N2s, ... N7s (sharps)
- N1b, N2b, ... N7b (flats)
- N1ss, N2ss, ... N7ss (double sharps)
- N1bb, N2bb, ... N7bb (double flats)

### Key methods:
- `degree()` → returns 1-7
- `accidental_type()` → returns AccidentalType
- `to_string(pitch_system)` → returns string representation
- `from_string(input, pitch_system)` → parses string

### When adding new pitch systems:

Update all `*_string()` methods:
- `to_number_string()`
- `to_western_string()`
- `to_sargam_string()`
- **Add**: `to_doremi_string()` (new)

And all `from_*()` methods:
- `from_number()`
- `from_western()`
- `from_sargam()`
- **Add**: `from_doremi()` (new)

---

## 4. Cell Layout & CSS Class Generation

**File**: `src/html_layout/cell.rs` (lines 14-181)

`CellStyleBuilder::build_render_cell()` generates:
1. Base classes: `["char-cell", "kind-{pitched,unpitched,...}"]`
2. Accidental classes: `["pitch-accidental-sharp", ...]`
3. Pitch system classes: `["pitch-system-number", ...]`
4. Octave glyph substitution: PUA codepoint if octave != 0

**Key logic** (lines 77-95):
```rust
if !cell.continuation && cell.kind == ElementKind::PitchedElement {
    if let Some(pitch_code) = cell.pitch_code {
        match pitch_code.accidental_type() {
            AccidentalType::Sharp => classes.push("pitch-accidental-sharp"),
            // ... add new accidentals here
        }
    }
}
```

**Octave glyph substitution** (lines 155-166):
```rust
let char = if cell.octave != 0 {
    get_glyph_codepoint(base_char, cell.octave)  // PUA lookup
} else {
    cell.char.clone()  // Keep original
};
```

---

## 5. Glyph Rendering in JavaScript

**File**: `src/js/renderer.js` (lines 83-181)

CSS rules for accidentals (SMuFL glyphs):

```css
.char-cell.pitch-accidental-sharp::after {
    font-family: 'Bravura', serif;
    position: absolute;
    left: 100%;  /* Right of note */
    content: '\uE262';  /* Sharp glyph */
}
```

### SMuFL Codepoint Reference:
- U+E260 = Flat (♭)
- U+E262 = Sharp (♯)
- U+E263 = Double Sharp (𝄪)
- U+E264 = Double Flat (𝄫)
- U+E265 = Natural (♮)
- U+E280-U+E28F = Microtonal accidentals

### Barline Glyphs (for reference):
- U+E030 = Single barline (|)
- U+E031 = Double barline (||)
- U+E040 = Repeat left (|:)
- U+E041 = Repeat right (:|)

---

## 6. Octave Glyph Substitution (NotationMonoDotted Font)

**File**: `src/renderers/font_utils.rs` (lines 1-72)

Function: `get_glyph_codepoint(base_char, octave_shift) → char`

### Formula:
```
Codepoint = 0xE000 + (char_index * 4) + variant_idx

where:
- char_index = position in ALL_CHARS string
- variant_idx: 0=+1, 1=+2, 2=-1, 3=-2
```

### Critical Constant (Line 20):
```rust
const ALL_CHARS: &str = "1234567CDEFGABcdefgabSrRgGmMPdDnNdrmfsltDRMFSLT";
// 47 characters total - order MUST match font exactly!
```

### When Adding New Characters:

1. Update `ALL_CHARS` string with new characters in order
2. Regenerate NotationMonoDotted.ttf with glyphs in same order
3. Update tests to verify codepoint mapping

---

## 7. Font Loading & Declarations

**File**: `index.html` (lines 15-38)

Current fonts:
- **Bravura** (woff2/woff) - Standard music notation glyphs
- **NotationMonoDotted** (TTF) - Octave indicators
- **Inter** (TTC) - UI text

### When Adding New Fonts:

1. Place font file in `/static/fonts/`
2. Add `@font-face` in index.html
3. Update CSS in renderer.js to use new font-family
4. Update `get_glyph_codepoint()` if using PUA substitution

---

## 8. MusicXML Pitch Export

**File**: `src/renderers/musicxml/pitch.rs`

Function: `pitch_code_to_step_alter(pitch_code: &PitchCode) → (&'static str, i8)`

### Logic:
1. Extract degree (1-7) from pitch_code
2. Map degree to Western step (C-B)
3. Calculate alter (-2 to +2) from accidental type
4. Return (step, alter) tuple

### Example:
- N4s (degree 4, sharp) → ("F", 1)
- N7b (degree 7, flat) → ("B", -1)
- N1bb (degree 1, double flat) → ("C", -2)

### System-Agnostic Design:
- Number system (1-7) inputs → Western output (C-B)
- Western system (C-B) inputs → Western output (C-B)
- Sargam system (S, R, G, ...) inputs → Western output (C-B)
- **All systems work with MusicXML export!**

**No changes needed when adding new pitch systems** - this function remains universal.

---

## Common Modifications Checklist

### Adding a New Pitch System:
- [ ] Update PitchSystem enum (src/models/elements.rs)
- [ ] Add to supports_accidentals() method
- [ ] Add to is_case_sensitive() method
- [ ] Add to pitch_sequence() method
- [ ] Add to name() method
- [ ] Add to snake_case_name() method
- [ ] Add to css_class() method
- [ ] Add to validate_pitch() method
- [ ] Update PitchCode::to_string() (src/models/pitch_code.rs)
- [ ] Update PitchCode::from_string() (src/models/pitch_code.rs)
- [ ] Update ALL_CHARS in src/renderers/font_utils.rs (if using custom font)
- [ ] Regenerate NotationMonoDotted.ttf with new glyphs
- [ ] Update tests

### Adding a New Accidental Type:
- [ ] Add variant to Accidental enum (src/models/elements.rs)
- [ ] Add to symbol() method
- [ ] Add to semitone_offset() method
- [ ] Add to parse() method
- [ ] Add new PitchCode variants if supported
- [ ] Update PitchCode::accidental_type()
- [ ] Add CSS class in src/js/renderer.js
- [ ] Add SMuFL glyph content rule in renderer.js
- [ ] Update pitch_code_to_step_alter() if new alter value needed
- [ ] Update tests

### Adding a New Font:
- [ ] Place font file in /static/fonts/
- [ ] Add @font-face in index.html
- [ ] Update CSS in src/js/renderer.js
- [ ] If using PUA glyphs, update get_glyph_codepoint() logic
- [ ] Document PUA ranges if applicable

### Modifying Octave Glyph Rendering:
- [ ] Update get_glyph_codepoint() in src/renderers/font_utils.rs
- [ ] Update ALL_CHARS string if adding/removing characters
- [ ] Regenerate NotationMonoDotted.ttf
- [ ] Update tests with new codepoint calculations
- [ ] Update MAX_OCTAVE if expanding range

---

## Quick Code Snippets

### Check if pitch system supports accidentals:
```rust
if pitch_system.supports_accidentals() {
    // Show sharp/flat UI
}
```

### Convert PitchCode to display string:
```rust
let display = pitch_code.to_string(pitch_system);  // "1#", "f#", "M", etc.
```

### Get accidental type from PitchCode:
```rust
match pitch_code.accidental_type() {
    AccidentalType::Sharp => { /* render sharp */ }
    AccidentalType::Flat => { /* render flat */ }
    _ => { /* no accidental */ }
}
```

### Apply octave glyph substitution:
```rust
let char = get_glyph_codepoint('1', 1);  // U+E000 (1 with dot above)
```

### Export to MusicXML:
```rust
let (step, alter) = pitch_code_to_step_alter(&pitch_code);
// step: "C" to "B"
// alter: -2, -1, 0, 1, 2
```

