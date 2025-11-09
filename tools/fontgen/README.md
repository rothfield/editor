# Notation Font Generation (v6+ - SPEC.md Compliant)

This directory contains the **authoritative font generation tooling** for the notation font system.

**📖 Start here**: Read the formal specification at [`SPEC.md`](SPEC.md) for complete details.

**Quick links**:
- [`atoms.yaml`](atoms.yaml) - Single source of truth for notation systems
- [`generate.py`](generate.py) - The generator script (5 clean stages)
- [`mapping-golden.json`](mapping-golden.json) - Codepoint snapshot (detects reshuffling)
- [`test_generator.py`](test_generator.py) - Comprehensive test suite
- [`base_fonts/README.md`](base_fonts/README.md) - How to get Bravura

## Overview

The notation font system provides visual octave shifts (via dots above/below characters) for multiple notation systems:
- **Number** (1-7): default system
- **Western** (A-B-C-D-E-F-G): letter names
- **Sargam** (S-r-R-g-G-m-M-P-d-D-n-N): Indian classical notation
- **Doremi** (d-r-m-f-s-l-t, D-R-M-F-S-L-T): Solfège notation (includes 'f' for Fa)

Each character can have 4 dot variants:
- 1 dot above (octave shift +1)
- 2 dots above (octave shift +2)
- 1 dot below (octave shift -1)
- 2 dots below (octave shift -2)

## Architecture

### Files in this Directory

```
tools/fontgen/
├── generate.py                 # Main font generator script (Python 3 + FontForge)
├── atoms.yaml                  # Single source of truth for all notation systems
├── README.md                   # This file
└── archive/                    # Previous versions (for reference)
    ├── generate_v1_original.py
    ├── generate_notation_font_v2.py
    ├── generate_notation_font_v3.py
    ├── generate_notation_font_v4.py
    └── generate_notation_font_v5.py
```

### Generated Files (in `static/fonts/`)

```
static/fonts/
├── NotationFont.ttf     # The font file (TTF format) - Noto Sans base + Noto Music symbols + custom variants
└── NotationFont-map.json # Codepoint mapping for runtime lookup
```

## Key Concepts

### atoms.yaml - Single Source of Truth

`atoms.yaml` defines:
- All supported notation systems
- Character definitions for each system
- Character order (CRITICAL: must be consistent everywhere)
- Glyph variant counts (always 4: 1-2 dots above/below)
- PUA (Private Use Area) mapping formula

**Never hardcode** character lists or codepoints. Always reference `atoms.yaml`.

### Character Order (CRITICAL!)

The character order in `atoms.yaml` must match **everywhere** in the codebase:

```
1234567CDEFGABcdefgabSrRgGmMPdDnNdrmfsltDRMFSLT
```

Breaking down by system:
- **Number** (indices 0-6): `1234567`
- **Western** (indices 7-20): `CDEFGABcdefgab`
- **Sargam** (indices 21-32): `SrRgGmMPdDnN`
- **Doremi** (indices 33-46): `drmfsltDRMFSLT`

**Total: 47 base characters × 4 variants = 188 glyphs**

### Codepoint Formula

Each character gets 4 consecutive codepoints in the PUA (starting at 0xE600 to avoid SMuFL standard ranges):

```
codepoint = 0xE600 + (character_index × 4) + variant_index
```

**Variant indices:**
- 0 = 1 dot above
- 1 = 2 dots above
- 2 = 1 dot below
- 3 = 2 dots below

**Example:** Character '1' (index 0)
- 1 dot above = 0xE600 + (0 × 4) + 0 = **0xE600**
- 2 dots above = 0xE600 + (0 × 4) + 1 = **0xE601**
- 1 dot below = 0xE600 + (0 × 4) + 2 = **0xE602**
- 2 dots below = 0xE600 + (0 × 4) + 3 = **0xE603**

### JSON Mapping File

`NotationFont-map.json` is generated from `atoms.yaml` and contains:
- Character index → codepoint lookup table
- System definitions
- Summary statistics

Use this file at **build time** to generate static lookup tables in Rust/JS.

## Running the Generator

### Prerequisites

```bash
# Python 3.7+
python3 --version

# PyYAML
pip install PyYAML

# FontForge (needed for font generation, but not for validation)
sudo pacman -S fontforge        # Arch Linux
sudo apt-get install fontforge  # Debian/Ubuntu
brew install fontforge          # macOS

# Noto Music font (included in sources/)
# Already checked in at: tools/fontgen/sources/NotoMusic.ttf
```

### Generator Flags (v6+)

```bash
python3 tools/fontgen/generate.py [FLAGS]
```

| Flag | Purpose | When to Use |
|------|---------|------------|
| _(none)_ | Generate font (dev mode) | Local development, fast iteration |
| `--strict` | Fail on any errors | CI/production builds |
| `--validate-only` | Check YAML only (no FontForge) | Pre-commit hook, quick validation |
| `--debug-html` | Generate visual specimen | Check dot/symbol positioning |
| `--base-font PATH` | Override base font (default: `static/fonts/Inter.ttc`) | Use different base font |
| `--noto-music-font PATH` | Override Noto Music path (default: `tools/fontgen/sources/NotoMusic.ttf`) | Use different source music font |
| `--atoms PATH` | Override atoms.yaml (default: `tools/fontgen/atoms.yaml`) | N/A |
| `--output-dir PATH` | Override output directory (default: `static/fonts`) | N/A |

### Build Modes

#### Development Mode (Default - Lenient)

```bash
python3 tools/fontgen/generate.py
```

**Behavior**:
- ✅ Missing Noto Music? Continues (custom variants only, no SMuFL symbols)
- ❌ Missing base font (Inter)? Fails (critical)
- ✅ Good for: local dev, quick iteration on geometry

#### Strict Mode (CI/Release)

```bash
python3 tools/fontgen/generate.py --strict
```

**Behavior**:
- ❌ Missing Noto Music? FAIL
- ❌ Missing base font? FAIL
- ❌ Codepoint collision? FAIL
- ❌ PUA overflow? FAIL
- ✅ Good for: CI builds, production releases

### Validate-Only Mode (No FontForge)

```bash
python3 tools/fontgen/generate.py --validate-only
```

**Behavior**:
- ✅ Load atoms.yaml
- ✅ Assign codepoints
- ✅ Validate layout
- ✅ Compare to mapping-golden.json
- ❌ DO NOT generate font file
- ❌ Does NOT require FontForge installed
- ✅ Good for: pre-commit hooks, CI validation, quick checks

### Debug HTML Specimen

```bash
python3 tools/fontgen/generate.py --debug-html
```

**Output**: `static/fonts/debug-specimen.html`

- Shows all 47 base characters × 4 variants
- Shows all 11 symbols
- Use to verify visual alignment of dots
- Open in browser: `open static/fonts/debug-specimen.html`

### Examples

```bash
# Development: quick iteration
python3 tools/fontgen/generate.py

# Development: with visual check
python3 tools/fontgen/generate.py --debug-html
open static/fonts/debug-specimen.html

# Pre-commit: validate without FontForge
python3 tools/fontgen/generate.py --validate-only

# CI/Release: strict mode (requires Noto Music)
python3 tools/fontgen/generate.py --strict

# Custom Noto Music path
python3 tools/fontgen/generate.py \
  --noto-music-font /usr/share/fonts/NotoMusic.ttf

# All custom
python3 tools/fontgen/generate.py \
  --base-font static/fonts/Inter.ttc \
  --noto-music-font tools/fontgen/sources/NotoMusic.ttf \
  --atoms tools/fontgen/atoms.yaml \
  --output-dir static/fonts \
  --strict \
  --debug-html
```

### Expected Output

```
======================================================================
NOTATION FONT GENERATOR (Noto Music-based)
======================================================================

Configuration:
  atoms.yaml:    /home/john/editor/tools/fontgen/atoms.yaml
  base font:     /home/john/editor/static/fonts/Inter.ttc
  Noto Music:    /home/john/editor/tools/fontgen/sources/NotoMusic.ttf
  output dir:    /home/john/editor/static/fonts
  mode:          STRICT

[STAGE 1] Loading atom specification...
  ✓ number: 7 characters
  ✓ western: 14 characters
  ✓ sargam: 12 characters
  ✓ doremi: 14 characters
  ✓ Character order validated: 1234567CDEFGABcdefgabSrRgGmMPdDnNdrmfsltDRMFSLT

[STAGE 2] Assigning PUA codepoints (starting at 0xe600)
  ✓ Assigned 188 note atoms: 0xe600 - 0xe6bb
  ✓ Assigned 14 SMuFL symbols at standard codepoints: 0xe030 - 0xe56e

[STAGE 3] Building NotationFont (Inter base + Noto Music symbols + custom variants)
  Loading base font: /home/john/editor/static/fonts/Inter.ttc
  ✓ Base font loaded
  Loading Noto Music for SMuFL symbols...
  ✓ Noto Music loaded
  Importing glyphs from Noto Music...
  ✓ Imported 549 glyphs from Noto Music
  Creating 188 note glyphs...
  ✓ Font saved: /home/john/editor/static/fonts/NotationFont.ttf

[STAGE 4] Building JSON mapping
  ✓ Notes: 47
  ✓ Symbols: 14
  ✓ JSON mapping saved: /home/john/editor/static/fonts/NotationFont-map.json

======================================================================
SUCCESS!
======================================================================

Generated files:
  ✓ /home/john/editor/static/fonts/NotationFont.ttf
  ✓ /home/john/editor/static/fonts/NotationFont-map.json
```

## Testing

### Run Test Suite

```bash
# Install pytest if not available
pip install pytest

# Run all tests
pytest tools/fontgen/test_generator.py -v

# Run specific test class
pytest tools/fontgen/test_generator.py::TestCodepointStability -v

# Run with coverage
pytest tools/fontgen/test_generator.py --cov=tools.fontgen
```

### What Tests Check

✅ **YAML Validation**: atoms.yaml parses correctly, all systems defined
✅ **Codepoint Allocation**: Sequential, no duplicates, valid PUA range
✅ **Stability**: Codepoints match golden snapshot (detects reshuffling)
✅ **Variants**: All 4 dot variants generated per character
✅ **Systems**: Number, Western, Sargam, Doremi all present with correct counts

---

## Modifying the Font System

### To Add a New Character

**IMPORTANT**: Follow the append-only rule (SPEC.md Section 11.4)

1. **Edit `atoms.yaml`:**
   - ADD the character to the END of the appropriate notation system
   - Update `character_order` field (append new characters)
   - Update `character_order_by_system`
   - Update `summary.total_base_characters`

2. **Regenerate the font:**
   ```bash
   python3 tools/fontgen/generate.py --validate-only  # Quick check first
   python3 tools/fontgen/generate.py                  # Full generation
   ```

3. **Test stability:**
   ```bash
   pytest tools/fontgen/test_generator.py::TestCodepointStability
   ```

4. **Update application code:**
   - Rebuild Rust with updated JSON mapping
   - Update JavaScript constants if hardcoded

**Example**: Adding a character to Number system
```yaml
# WRONG - inserts in middle, reshuffles all subsequent codepoints
notation_systems:
  - system_name: number
    characters:
      - char: "0"  # ← Inserted before 1
      - char: "1"
      ...

# CORRECT - appends at end
notation_systems:
  - system_name: number
    characters:
      - char: "1"
      ...
      - char: "7"
      - char: "8"  # ← Appended
```

### To Change Dot Positioning

**v6+**: All geometry is configurable in atoms.yaml - no code changes needed!

1. **Edit `atoms.yaml` geometry section:**
   ```yaml
   geometry:
     dots:
       above_gap: 50         # Distance from char top to first dot
       below_gap: 50         # Distance from char bottom to first dot
       vertical_step: 100    # Spacing between 1-dot and 2-dot
   ```

2. **Regenerate:**
   ```bash
   python3 tools/fontgen/generate.py --debug-html
   open static/fonts/debug-specimen.html  # Visual check
   ```

3. **Iterate:**
   - Adjust values in atoms.yaml
   - Regenerate
   - Check specimen until satisfied
   - Commit atoms.yaml change

### To Change Base Font

1. **Place new base font in `tools/fontgen/sources/` or anywhere accessible**
2. **Regenerate with custom path:**
   ```bash
   python3 tools/fontgen/generate.py --base-font path/to/new-font.ttf
   ```

3. **Or update default in generator:**
   - Edit `generate.py` line ~688
   - Change `default="tools/fontgen/sources/NotoSans-Regular.ttf"` to your font path

## Integration with Application Code

### JavaScript Usage

```javascript
import mapping from '../static/fonts/NotationFont-map.json';

function getGlyph(baseChar, octaveShift) {
    // Find character in mapping
    const atom = mapping.atoms.find(a => a.character === baseChar);
    if (!atom) return baseChar;

    if (octaveShift === 0) return baseChar;

    // Map shift to variant index
    const variant = {
        1: '1_dot_above',
        2: '2_dots_above',
        '-1': '1_dot_below',
        '-2': '2_dots_below'
    }[octaveShift];

    return atom.variants[variant]?.codepoint || baseChar;
}
```

### Rust Usage

At **build time**, read `NotationFont-map.json` and generate a static table:

```rust
// Generate this at build time from mapping JSON
static ATOM_GLYPHS: &[AtomGlyph] = &[
    AtomGlyph {
        index: 0,
        character: '1',
        base_unicode: Some('1'),
        dots: [
            Some('\u{E600}'),  // +1
            Some('\u{E601}'),  // +2
            Some('\u{E602}'),  // -1
            Some('\u{E603}'),  // -2
        ]
    },
    // ... rest of atoms
];

fn glyph_for(base_char: char, octave_shift: i8) -> char {
    let atom = ATOM_GLYPHS.iter().find(|a| a.character == base_char)?;
    match octave_shift {
        0 => base_char,
        1 => atom.dots[0].unwrap_or(base_char),
        2 => atom.dots[1].unwrap_or(base_char),
        -1 => atom.dots[2].unwrap_or(base_char),
        -2 => atom.dots[3].unwrap_or(base_char),
        _ => base_char,
    }
}
```

## Testing

### Quick Manual Test

1. Generate the font:
   ```bash
   python3 tools/fontgen/generate.py
   ```

2. Create a test HTML file:
   ```html
   <style>
       @font-face {
           font-family: 'NotationFont';
           src: url('static/fonts/NotationFont.ttf') format('truetype');
       }
       .test { font-family: 'NotationFont', monospace; font-size: 32px; }
   </style>

   <div class="test">
       <!-- Test all systems -->
       <p>Number: &#xE600; &#xE604; &#xE608;</p>
       <p>Western: &#xE61C; &#xE620;</p>
       <p>Sargam: &#xE684; &#xE688;</p>
       <p>Doremi (including f): &#xE690;</p>
   </div>
   ```

3. Open in browser and verify dots appear

### Automated Testing

In `tests/e2e-pw/tests/notation-font-*.spec.js`:

```javascript
test('verify notation font loads and renders', async ({ page }) => {
    const mapping = await fetch('/fonts/NotationFont-map.json')
        .then(r => r.json());

    // Verify all systems have characters
    expect(mapping.summary.systems.number.count).toBe(7);
    expect(mapping.summary.systems.western.count).toBe(14);
    expect(mapping.summary.systems.sargam.count).toBe(12);
    expect(mapping.summary.systems.doremi.count).toBe(14);

    // Verify total glyphs
    expect(mapping.summary.total_glyphs).toBe(188);

    // Verify character order
    expect(mapping.character_order).toBe(
        '1234567CDEFGABcdefgabSrRgGmMPdDnNdrmfsltDRMFSLT'
    );
});
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "fontforge module not found" | Install: `pip install fontforge` or `apt-get install fonttools python3-fontforge` |
| "PyYAML not found" | Install: `pip install PyYAML` |
| "atoms.yaml not found" | Run from editor/ root: `python3 tools/fontgen/generate.py` |
| "Base font not found" | Check `static/fonts/Inter.ttc` exists, or pass `--base-font` |
| "Noto Music not found" | Check `tools/fontgen/sources/NotoMusic.ttf` exists, or pass `--noto-music-font` |
| Font doesn't load in browser | Verify `static/fonts/NotationFont.ttf` exists and is deployed |
| Dots not visible at runtime | Check CSS includes `@font-face` for NotationFont |
| Character order mismatch | Verify atoms.yaml and code use identical order |
| Codepoints wrong in output | Delete `NotationFont-map.json` and regenerate |

## Architecture Decisions

### Why atoms.yaml?

- **Single source of truth**: One place to define all characters
- **Decouples systems**: Adding a new notation system doesn't require code changes
- **Explicit ordering**: Character order is documented, not scattered in code
- **Generates JSON**: Mapping file is authoritative and can be used everywhere

### Why JSON mapping file?

- **Build-time generated**: Eliminates hardcoded constants in app code
- **Runtime readable**: Browser can fetch and validate against actual font
- **Stable reference**: Can be versioned and compared across builds
- **Debugging aid**: Inspect mapping to verify codepoints

### Why Private Use Area (0xE000)?

- **No conflicts**: PUA is reserved for applications, won't clash with Unicode updates
- **Standard practice**: Used by music fonts like Bravura, SMuFL compliant
- **Invisible to text**: Won't accidentally appear in plain text exports

## Build Integration (Makefile)

### Recommended Makefile Targets

Add these to your top-level `Makefile`:

```makefile
# Editor root Makefile

.PHONY: fonts fonts-validate fonts-debug

# Regenerate font (strict mode)
fonts:
	@echo "Generating notation font (strict mode)..."
	python3 tools/fontgen/generate.py --strict
	@echo "✓ Font generation complete"

# Quick validation (no FontForge needed)
fonts-validate:
	@echo "Validating font configuration..."
	python3 tools/fontgen/generate.py --validate-only
	@echo "✓ Configuration valid"

# Visual debug specimen
fonts-debug:
	@echo "Generating debug specimen..."
	python3 tools/fontgen/generate.py --debug-html
	@open static/fonts/debug-specimen.html || true

# Full editor build depends on fonts
editor: fonts
	npm run build-wasm
	npm run build-js

# Pre-commit hook
.PHONY: pre-commit
pre-commit: fonts-validate
	@echo "✓ Ready to commit"
```

### Usage

```bash
# Regenerate font
make fonts

# Quick validation
make fonts-validate

# Visual debug
make fonts-debug

# Full editor build (includes fonts)
make editor
```

---

## Version History

- **v6+ (current - SPEC.md compliant)**:
  - 5 clean stages (load → assign → build → map → validate)
  - Geometry configuration in atoms.yaml
  - Build modes (dev vs strict)
  - New flags (--validate-only, --debug-html, --strict)
  - Codepoint stability testing
  - Bravura symbol extraction with correct SMuFL names
- **v5**: Flattened composites, improved dot positioning
- **v4**: Referenced composites (dots weren't baked in)
- **v3**: Initial working version with all 4 systems
- **v2**: Attempted SMuFL mapping (abandoned)
- **v1**: Basic proof-of-concept

See `archive/` for previous implementations.

## Next Steps

1. ✅ Font generation infrastructure in place
2. Read the generated `NotationMonoDotted-map.json` at build time
3. Generate static lookup tables in Rust/JS
4. Test all notation systems in the editor UI
5. Deploy to production

---

**Last updated**: 2025-11-08
**Status**: Ready for production
