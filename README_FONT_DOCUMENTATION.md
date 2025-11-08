# Font Architecture & Pitch Rendering - Complete Documentation

## Quick Start

**New to the font system?** Start here:

1. **CODEBASE_EXPLORATION_SUMMARY.md** - High-level overview (5 min read)
2. **FONT_SYSTEM_OVERVIEW.txt** - Visual diagrams and data flow (10 min read)
3. **FONT_ARCHITECTURE.md** - Complete technical reference (15 min read)
4. **INTEGRATION_POINTS.md** - Practical modification guide (10 min read)

---

## Documentation Files

### Entry Point Documents

#### [CODEBASE_EXPLORATION_SUMMARY.md](CODEBASE_EXPLORATION_SUMMARY.md) ⭐ START HERE
- **Length**: ~3 KB
- **Time**: 5 minutes
- **Purpose**: High-level overview of all documentation
- **Contains**:
  - Summary of three main documents
  - Current font architecture (three-layer system)
  - Key components overview
  - Integration points summary
  - Common modifications checklist
  - File references and key insights

---

### Technical Reference Documents

#### [FONT_SYSTEM_OVERVIEW.txt](FONT_SYSTEM_OVERVIEW.txt)
- **Length**: 17 KB
- **Time**: 10-15 minutes
- **Purpose**: Visual understanding of the system
- **Best for**: Understanding data flow and architecture
- **Contains**:
  - Complete rendering pipeline (ASCII diagram)
  - Data flow: Cell → PitchCode → Glyphs
  - Font inventory with codepoints
  - Key constants and formulas
  - Pitch system support matrix
  - CSS class hierarchy
  - Real examples and walkthroughs

**When to use**: Want to see how a note becomes a glyph? Need visual reference? Start here.

---

#### [FONT_ARCHITECTURE.md](FONT_ARCHITECTURE.md)
- **Length**: 13 KB
- **Time**: 15-20 minutes
- **Purpose**: Comprehensive technical reference
- **Best for**: Understanding all layers of the system
- **Contains**:
  - Layer 1: Font Files & Loading
  - Layer 2: Pitch Code to CSS Mapping
  - Layer 3: Cell Rendering Pipeline
  - Layer 4: Octave Rendering (PUA glyphs)
  - Layer 5: MusicXML Export
  - Complete file structure
  - Current limitations
  - Future enhancement points

**When to use**: Need complete reference? Implementing new features? Make this your bible.

---

#### [INTEGRATION_POINTS.md](INTEGRATION_POINTS.md)
- **Length**: 8.6 KB
- **Time**: 10 minutes
- **Purpose**: Practical modification guide
- **Best for**: Implementing changes to the system
- **Contains**:
  - Quick reference table (system layer → files)
  - 8 detailed integration points with code examples
  - Common modifications checklist
  - Quick code snippets
  - Before/after examples

**When to use**: Adding new pitch systems? New accidentals? New fonts? Follow the checklists here.

---

## The Three-Layer Font System

```
┌─────────────────────────────────────────────────────────────────┐
│ LAYER 1: Bravura (SMuFL Standard Music Font)                    │
│ ├─ Accidentals: Sharps (U+E262), Flats (U+E260), Doubles       │
│ ├─ Barlines: Single (U+E030), Double (U+E031), Repeats (U+E040) │
│ └─ File: /static/fonts/Bravura.woff2 (242 KB)                  │
├─────────────────────────────────────────────────────────────────┤
│ LAYER 2: NotationMonoDotted (Custom Font - Octave Indicators)   │
│ ├─ 47 base characters × 4 octave variants = 188 glyphs         │
│ ├─ PUA Range: U+E000 - U+E0BB                                   │
│ └─ File: /static/fonts/NotationMonoDotted.ttf (472 KB)         │
├─────────────────────────────────────────────────────────────────┤
│ LAYER 3: Inter (UI Text Font)                                   │
│ ├─ Regular text, UI components, base pitch characters          │
│ └─ File: /static/fonts/Inter.ttc (13 MB)                       │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow

```
Rust WASM
    ↓ Cell { pitch_code, octave, ... }
    ↓
Rust Layout Engine (src/html_layout/cell.rs)
    ├─ Analyze pitch_code → get AccidentalType
    ├─ Calculate PUA codepoint if octave != 0
    └─ Generate CSS classes: pitch-accidental-*, pitch-system-*
    ↓
JavaScript DOM Renderer (src/js/renderer.js)
    ├─ Create <span> with CSS classes
    ├─ CSS ::after rules apply SMuFL glyphs
    └─ Character substitution uses NotationMonoDotted
    ↓
Browser Font Rendering
    ├─ Bravura: accidentals (via CSS content property)
    ├─ NotationMonoDotted: octave dots (glyph substitution)
    └─ Inter: text and UI
    ↓
Visual Output: Stylized musical notation
```

---

## Quick Reference

### Key Files

| Component | Location | Purpose |
|-----------|----------|---------|
| Pitch Systems | `src/models/elements.rs` | PitchSystem enum (Number, Western, Sargam, etc.) |
| Accidentals | `src/models/elements.rs` | Accidental enum (Sharp, Flat, DoubleSharp, etc.) |
| Pitch Codes | `src/models/pitch_code.rs` | PitchCode enum (35 variants, system conversions) |
| Cell Rendering | `src/html_layout/cell.rs` | CSS class generation, octave glyph mapping |
| Font Utils | `src/renderers/font_utils.rs` | PUA codepoint calculation (get_glyph_codepoint) |
| MusicXML Export | `src/renderers/musicxml/pitch.rs` | System-agnostic pitch export |
| DOM Rendering | `src/js/renderer.js` | CSS rules, glyph styling, pseudo-elements |
| Font Loading | `index.html` (lines 15-38) | @font-face declarations |

### Critical Constants

```rust
// In src/renderers/font_utils.rs
const ALL_CHARS: &str = "1234567CDEFGABcdefgabSrRgGmMPdDnNdrmfsltDRMFSLT";
// ↑ MUST match font glyph order exactly!

const PUA_START: u32 = 0xE000;  // Private Use Area base
const CHARS_PER_VARIANT: u32 = 4;  // ±1, ±2 octaves

// Formula: codepoint = 0xE000 + (char_index * 4) + variant_idx
```

### CSS Classes Reference

```css
/* Accidental classes (with SMuFL content) */
.pitch-accidental-sharp       /* content: '\uE262' (♯) */
.pitch-accidental-flat        /* content: '\uE260' (♭) */
.pitch-accidental-double-sharp /* content: '\uE263' (𝄪) */
.pitch-accidental-double-flat  /* content: '\uE264' (𝄫) */

/* Pitch system classes */
.pitch-system-number
.pitch-system-western
.pitch-system-sargam

/* Kind classes */
.kind-pitched
.kind-barline
.kind-text
.kind-symbol
```

---

## Common Tasks

### Adding a New Pitch System (e.g., Doremi)

**Files to modify**:
1. `src/models/elements.rs` - Add PitchSystem variant and 8 method cases
2. `src/models/pitch_code.rs` - Add to_doremi_string() and from_doremi()
3. `src/renderers/font_utils.rs` - Update ALL_CHARS if new characters
4. Regenerate NotationMonoDotted.ttf font

See **INTEGRATION_POINTS.md** for step-by-step instructions.

### Adding a New Accidental Type (e.g., QuarterSharp)

**Files to modify**:
1. `src/models/elements.rs` - Add Accidental variant and 4 method cases
2. `src/models/pitch_code.rs` - Update accidental_type() matching
3. `src/js/renderer.js` - Add CSS rule with SMuFL codepoint
4. `src/renderers/musicxml/pitch.rs` - Update if MusicXML needs it

See **INTEGRATION_POINTS.md** for step-by-step instructions.

### Adding a New Font

**Files to modify**:
1. `index.html` - Add @font-face declaration
2. `src/js/renderer.js` - Update CSS to use new font-family
3. `src/renderers/font_utils.rs` - Update glyph mapping if using PUA

See **INTEGRATION_POINTS.md** for step-by-step instructions.

---

## Testing

### Unit Tests
- **PitchCode tests**: `src/models/pitch_code.rs` (35+ test cases)
- **Font Utils tests**: `src/renderers/font_utils.rs` (13+ test cases)
- **Accidental tests**: `src/utils/pitch_utils.rs` (6+ test cases)

### E2E Tests
- **Location**: `tests/e2e-pw/tests/`
- **Inspector-first approach**: Verify LilyPond/MusicXML output correctness
- **Run**: `npx playwright test tests/e2e-pw/tests/notation-font-*.spec.js`

### Build Verification
```bash
# Build WASM and check for warnings
npm run build-wasm

# Run all tests
cargo test

# Run Playwright tests
npx playwright test
```

---

## Architecture Decisions

### Why Three-Layer Font System?

1. **Bravura (SMuFL)**: Standard for accidentals and musical symbols
   - Ubiquitous, well-maintained, standardized
   - Used by Finale, Dorico, and many music notation programs

2. **NotationMonoDotted (Custom)**: Octave indicators
   - Not part of SMuFL
   - Custom solution using PUA glyphs for space-efficient rendering
   - Single character = one note with octave indication

3. **Inter**: UI text
   - Clean, modern, professional appearance
   - Separate from music notation concerns

### Why PUA (Private Use Area)?

- Avoids conflicts with standard Unicode ranges
- Can store multiple variants (4 per character)
- Compact: 47 characters × 4 variants = 188 glyphs in 256 available slots

### Why CSS Classes for Accidentals?

- **Semantic**: Class name describes what it represents (sharp, flat)
- **Flexible**: Easy to change visual representation (change CSS, not code)
- **Maintainable**: All styling in one place (CSS)
- **Performance**: No runtime glyph calculation for accidentals

### Why System-Agnostic PitchCode?

- Works with any pitch system (Number, Western, Sargam, etc.)
- Conversion via MIDI note numbers (internal representation)
- MusicXML export unchanged when adding new systems

---

## Performance Considerations

### Rendering Optimization
- **Rust layout engine**: Pre-calculates all CSS classes and coordinates
- **JS DOM rendering**: Minimal DOM manipulation, use classes for styling
- **Font loading**: WOFF2 format (smaller than TTF/OTF)
- **PUA glyphs**: Direct Unicode substitution (no extra font lookups)

### Memory Usage
- **PitchCode enum**: 35 variants, compact representation
- **CSS classes**: String concatenation only once per cell
- **Font files**: Bravura 242KB, NotationMonoDotted 472KB (minimal overhead)

---

## Future Extensions

### Planned Enhancements
1. **Microtonal Support** (SMuFL U+E280-U+E28F)
2. **Articulation Marks** (staccato, tenuto, accent)
3. **Dynamics** (p, f, ff, pp glyphs)
4. **Notation Variants** (OpenType features)
5. **Expand Octave Range** (currently ±2, support ±3, ±4, etc.)

### Available PUA Space
- Currently using: 188 codepoints (47 × 4)
- Available: 256 - 188 = 68 more codepoints
- Could add: 17 more base characters (68 ÷ 4)

---

## FAQ

**Q: I want to add support for quarter-tone accidentals. Where do I start?**
A: Read "Adding a New Accidental Type" section. Main changes: elements.rs, pitch_code.rs, renderer.js, and find the SMuFL codepoint (U+E280+ range).

**Q: Can I change the font rendering without regenerating the NotationMonoDotted font?**
A: Only if you don't change the glyph set. You can adjust sizing, positioning, colors all in CSS. To add/remove characters requires font regeneration.

**Q: What happens if I change ALL_CHARS order?**
A: The glyph codepoint calculation will be wrong. MUST match font glyph order exactly. Always regenerate font if you change this string.

**Q: Can I export to MusicXML with custom pitch systems?**
A: Yes! The pitch_code_to_step_alter() function is system-agnostic. Any pitch system exports to standard MusicXML automatically.

**Q: How do I test octave rendering changes?**
A: Create E2E test in tests/e2e-pw/tests/, use inspector tabs to verify output. Run: `npx playwright test tests/e2e-pw/tests/notation-font-*.spec.js --headed`

---

## Document Maintenance

**Last Updated**: November 8, 2025
**Status**: Complete and Ready for Development
**Scope**: Font architecture, pitch rendering, all integration points

All documentation is kept in sync with the codebase. When making changes to the font system, update relevant documentation sections.

---

## Support & Questions

For questions about:
- **Architecture**: See FONT_SYSTEM_OVERVIEW.txt
- **Implementation**: See INTEGRATION_POINTS.md
- **References**: See FONT_ARCHITECTURE.md
- **Code examples**: See code snippets in INTEGRATION_POINTS.md

All absolute file paths are in `/home/john/editor/` directory.
