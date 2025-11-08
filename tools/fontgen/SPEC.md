# Notation Font Generation System - Formal Specification

**Version**: 1.0
**Last Updated**: 2025-11-08
**Status**: Canonical Reference

---

## 1. Overview

The Notation Font Generation System is a **build-time toolchain** that produces a composite font file (`NotationMonoDotted.ttf`) and a runtime mapping file (`NotationMonoDotted-map.json`) for use in the music notation editor.

### 1.1 Design Principles

1. **Single Source of Truth**: `atoms.yaml` defines all notation systems, characters, and symbols
2. **Sequential Allocation**: PUA codepoints are assigned sequentially, never by formula
3. **JSON Contract**: The mapping file is the authoritative interface between generator and editor
4. **No Hardcoded Math**: Editor code MUST NOT compute codepoints; only lookup from JSON
5. **Room to Grow**: Allocate generous PUA ranges to support future pitch systems without breaking existing codepoints

---

## 2. Architecture

### 2.1 Component Responsibilities

| Component | Responsibility | Never Does |
|-----------|---------------|------------|
| `atoms.yaml` | Define semantic universe of pitch systems and symbols | Font generation, PUA math |
| `generate.py` | Transform atoms → glyphs → font file + JSON | Define notation semantics |
| `NotationMonoDotted.ttf` | Render glyphs at runtime | Store metadata about systems |
| `NotationMonoDotted-map.json` | Provide codepoint lookup for editor | Contain build-time implementation details |
| Editor (Rust/JS) | Resolve (system, pitch, accidental, octave) → codepoint via JSON | Compute PUA offsets or assume ranges |

### 2.2 Data Flow

```
atoms.yaml (semantic spec)
    ↓
generate.py (build system)
    ├─ Inter.ttc (base font for notes)
    ├─ Bravura.otf (symbol glyphs)
    ↓
    ├─→ NotationMonoDotted.ttf (runtime font)
    └─→ NotationMonoDotted-map.json (runtime lookup)
        ↓
    Editor (Rust/JS) reads JSON at build time
        ↓
    Static lookup tables in WASM/JS
        ↓
    Runtime rendering
```

---

## 3. Private Use Area (PUA) Allocation

### 3.1 Allocation Strategy

**CRITICAL**: Codepoints are assigned **sequentially** at generation time. The exact boundaries are determined dynamically based on `atoms.yaml` contents.

#### Reserved Ranges (Planning Only - NOT Hardcoded)

| Range | Purpose | Capacity | Notes |
|-------|---------|----------|-------|
| `0xE000 - 0xE7FF` | Note atoms (all systems) | 2048 slots | Current: ~200 used, ~1850 free |
| `0xE800 - 0xE8FF` | Symbols (accidentals, ornaments, barlines) | 256 slots | Current: ~11 used, ~245 free |
| `0xE900 - 0xEFFF` | Reserved for future expansion | 1792 slots | Undefined |

**Total PUA used**: `0xE000 - 0xEFFF` (4096 codepoints)

### 3.2 Current Allocation (as of v1.0)

#### Notes (188 codepoints currently)

```
System      Characters  Variants  Total Slots  Range (approximate)
-----------------------------------------------------------------------
Number      7           × 4       28           0xE000 - 0xE01B
Western     14          × 4       56           0xE01C - 0xE053
Sargam      12          × 4       48           0xE054 - 0xE083
Doremi      14          × 4       56           0xE084 - 0xE0BB
-----------------------------------------------------------------------
TOTAL       47          × 4       188          0xE000 - 0xE0BB
```

**Variants per character**:
- Variant 0: 1 dot above (octave shift +1)
- Variant 1: 2 dots above (octave shift +2)
- Variant 2: 1 dot below (octave shift -1)
- Variant 3: 2 dots below (octave shift -2)

#### Symbols (11 codepoints currently, starting after notes)

```
Symbol                  Offset  Codepoint (current)
----------------------------------------------------
Sharp (#)              0       0xE0BC
Natural (♮)            1       0xE0BD
Flat (♭)               2       0xE0BE
Double sharp (𝄪)       3       0xE0BF
Double flat (𝄫)        4       0xE0C0
Barline (single)       5       0xE0C1
Barline (double)       6       0xE0C2
Mordent                7       0xE0C3
Inverted mordent       8       0xE0C4
Turn                   9       0xE0C5
Trill                  10      0xE0C6
----------------------------------------------------
TOTAL                  11      0xE0BC - 0xE0C6
```

**IMPORTANT**: These exact codepoints will change if note systems are added before symbols. Always use the JSON mapping.

---

## 4. File Specifications

### 4.1 `atoms.yaml` Structure

```yaml
notation_systems:
  - system_name: "number"
    display_name: "Number System"
    description: "..."
    characters:
      - char: "1"
        label: "..."
        accidentals: []  # Future: ["#", "b", "##", "bb"]

glyph_variants:
  count_per_character: 4
  variant_indices:
    0: "1 dot above"
    1: "2 dots above"
    2: "1 dot below"
    3: "2 dots below"

bravura_symbols:
  - glyph_name: "uni266F"
    label: "Sharp (#)"
    bravura_codepoint: 0x266F
    codepoint_offset: 0  # Relative to symbol start

pua:
  start: 0xE000
  allocation_strategy: "sequential"

character_order: "1234567CDEFGABcdefgabSrRgGmMPdDnNdrmfsltDRMFSLT"
```

**Requirements**:
- `character_order` MUST match the concatenation of all characters in `notation_systems`
- Each system's characters appear in the order defined
- `codepoint_offset` in `bravura_symbols` is relative to the start of the symbol range

### 4.2 `NotationMonoDotted-map.json` Structure

#### Minimal Schema (Runtime Contract)

```json
{
  "version": "1.0",
  "generated_from": "atoms.yaml",
  "pua_allocation": {
    "notes_start": "E000",
    "notes_end": "E0BB",
    "symbols_start": "E0BC",
    "symbols_end": "E0C6"
  },
  "notes": [
    {
      "id": 0,
      "system": "number",
      "character": "1",
      "variants": {
        "no_dots": null,
        "1_dot_above": {"codepoint": "E000", "octave_shift": 1},
        "2_dots_above": {"codepoint": "E001", "octave_shift": 2},
        "1_dot_below": {"codepoint": "E002", "octave_shift": -1},
        "2_dots_below": {"codepoint": "E003", "octave_shift": -2}
      }
    },
    ...
  ],
  "symbols": [
    {
      "id": 0,
      "name": "sharp",
      "kind": "accidental",
      "label": "Sharp (#)",
      "codepoint": "E0BC"
    },
    ...
  ],
  "summary": {
    "total_notes": 188,
    "total_symbols": 11,
    "systems": {
      "number": {"count": 7, "chars": "1234567"},
      "western": {"count": 14, "chars": "CDEFGABcdefgab"},
      "sargam": {"count": 12, "chars": "SrRgGmMPdDnN"},
      "doremi": {"count": 14, "chars": "drmfsltDRMFSLT"}
    }
  }
}
```

#### Required Fields

**`notes` array**: Each entry MUST have:
- `id`: Sequential integer starting at 0
- `system`: System name from atoms.yaml
- `character`: The base character
- `variants`: Map of variant name → codepoint

**`symbols` array**: Each entry MUST have:
- `id`: Sequential integer starting at 0
- `name`: Symbol identifier (lowercase, no spaces)
- `kind`: Category ("accidental", "ornament", "barline", etc.)
- `label`: Human-readable description
- `codepoint`: Hex string (e.g., "E0BC")

#### Forbidden Fields (DO NOT include in runtime JSON)

- Bravura source codepoints
- FontForge glyph names
- Intermediate build data
- PUA allocation formulas
- Character indices

---

## 5. Font Generation Process

### 5.1 Build System Stages

#### Stage 1: Load Atom Specification

```python
def load_atom_spec(yaml_path: str) -> AtomSpec:
    """
    Parse atoms.yaml and validate structure.

    Returns:
        AtomSpec with:
            - notation_systems: List[NotationSystem]
            - bravura_symbols: List[BravuraSymbol]
            - character_order: str

    Raises:
        ValueError if character_order doesn't match systems
    """
```

#### Stage 2: Assign Codepoints

```python
def assign_codepoints(spec: AtomSpec, start: int = 0xE000) -> CodepointLayout:
    """
    Sequentially assign PUA codepoints to all atoms.

    Algorithm:
        1. cp = start (0xE000)
        2. For each character in each notation system:
            a. For each variant (4 per character):
                i. Assign cp to (character, variant)
                ii. cp += 1
        3. symbol_start = cp
        4. For each symbol in bravura_symbols:
            a. Assign cp to symbol
            b. cp += 1
        5. Return layout with all assignments

    Returns:
        CodepointLayout with:
            - note_atoms: List[NoteAtom] (each has codepoint assigned)
            - symbols: List[Symbol] (each has codepoint assigned)
            - notes_range: (start, end)
            - symbols_range: (start, end)
    """
```

#### Stage 3: Build Font

```python
def build_font(
    base_font_path: str,
    bravura_font_path: str,
    layout: CodepointLayout
) -> fontforge.font:
    """
    Generate composite font with all glyphs.

    Steps:
        1. Load base font (Inter.ttc)
        2. Load Bravura font (optional)
        3. For each note atom in layout:
            a. Get base character glyph from Inter
            b. Get dot glyph from Inter
            c. Create composite glyph at atom.codepoint:
                i. Add reference to base character
                ii. Add reference(s) to dots (positioned above/below)
            d. Set glyph width from base character
        4. For each symbol in layout:
            a. Get glyph from Bravura by name or codepoint
            b. Copy glyph to symbol.codepoint in target font
        5. Flatten all composite glyphs (convert references → outlines)
        6. Return font

    Raises:
        FontError if base glyphs not found
    """
```

#### Stage 4: Build Mapping JSON

```python
def build_mapping_json(layout: CodepointLayout) -> dict:
    """
    Generate minimal runtime JSON mapping.

    Includes ONLY:
        - Note atoms: id, system, character, variants with codepoints
        - Symbols: id, name, kind, label, codepoint
        - Summary statistics

    Excludes:
        - Bravura source info
        - FontForge internals
        - Build-time metadata

    Returns:
        dict conforming to schema in section 4.2
    """
```

### 5.2 Error Handling

| Error Condition | Behavior |
|-----------------|----------|
| `atoms.yaml` not found | Fail immediately, print path |
| `character_order` mismatch | Fail with diff of expected vs. actual |
| Base font not found | Fail immediately |
| Bravura font not found | Warn, skip symbols, continue |
| Base glyph missing from Inter | Fail with character name |
| Bravura glyph missing | Warn, skip that symbol, continue |
| Duplicate codepoint | Fail immediately (sanity check failure) |
| PUA overflow (> 0xF8FF) | Fail with usage statistics |

### 5.3 Sanity Checks (run before font.generate())

```python
def validate_layout(layout: CodepointLayout):
    """
    Pre-flight checks before font generation.

    Assertions:
        1. All note atoms have codepoints assigned
        2. All symbols have codepoints assigned
        3. No duplicate codepoints
        4. All codepoints in PUA range (0xE000 - 0xF8FF)
        5. Codepoints are sequential with no gaps
    """
```

---

## 6. Editor Integration

### 6.1 Build-Time Code Generation

The editor MUST:

1. **Read `NotationMonoDotted-map.json` at build time** (not runtime)
2. **Generate static lookup tables** in Rust/JS from JSON
3. **Never compute codepoints** using formulas or offsets

#### Example: Rust Static Table

```rust
// Generated at build time from NotationMonoDotted-map.json
pub struct NoteGlyph {
    pub id: u32,
    pub system: NotationSystem,
    pub character: char,
    pub variants: [Option<char>; 4], // +1, +2, -1, -2
}

pub static NOTE_GLYPHS: &[NoteGlyph] = &[
    NoteGlyph {
        id: 0,
        system: NotationSystem::Number,
        character: '1',
        variants: [
            Some('\u{E000}'), // +1
            Some('\u{E001}'), // +2
            Some('\u{E002}'), // -1
            Some('\u{E003}'), // -2
        ],
    },
    // ... generated for all 47 characters
];

pub struct SymbolGlyph {
    pub id: u32,
    pub name: &'static str,
    pub kind: SymbolKind,
    pub codepoint: char,
}

pub static SYMBOL_GLYPHS: &[SymbolGlyph] = &[
    SymbolGlyph {
        id: 0,
        name: "sharp",
        kind: SymbolKind::Accidental,
        codepoint: '\u{E0BC}',
    },
    // ... generated for all symbols
];
```

#### Example: JavaScript Static Object

```javascript
// Generated at build time from NotationMonoDotted-map.json
export const NOTE_GLYPHS = [
  {
    id: 0,
    system: 'number',
    character: '1',
    variants: {
      1: '\uE000',   // +1
      2: '\uE001',   // +2
      '-1': '\uE002', // -1
      '-2': '\uE003', // -2
    }
  },
  // ... generated for all 47 characters
];

export const SYMBOL_GLYPHS = [
  { id: 0, name: 'sharp', kind: 'accidental', codepoint: '\uE0BC' },
  // ... generated for all symbols
];
```

### 6.2 Runtime Lookup

```rust
pub fn get_note_glyph(system: NotationSystem, character: char, octave_shift: i8) -> Option<char> {
    // Find note in static table
    let note = NOTE_GLYPHS.iter()
        .find(|n| n.system == system && n.character == character)?;

    // Map octave_shift to variant index
    match octave_shift {
        0 => Some(character), // No shift, use base Unicode character
        1 => note.variants[0],
        2 => note.variants[1],
        -1 => note.variants[2],
        -2 => note.variants[3],
        _ => None, // Out of range
    }
}

pub fn get_symbol_glyph(name: &str) -> Option<char> {
    SYMBOL_GLYPHS.iter()
        .find(|s| s.name == name)
        .map(|s| s.codepoint)
}
```

### 6.3 CSS Integration

```css
@font-face {
    font-family: 'NotationMonoDotted';
    src: url('/fonts/NotationMonoDotted.ttf') format('truetype');
    font-weight: normal;
    font-style: normal;
}

.notation-character {
    font-family: 'NotationMonoDotted', monospace;
    font-size: 18px;
}
```

---

## 7. Adding New Pitch Systems

### 7.1 Process

1. **Edit `atoms.yaml`**:
   ```yaml
   notation_systems:
     # ... existing systems
     - system_name: "bhatkhande"
       display_name: "Bhatkhande Devanagari"
       characters:
         - char: "स"  # Sa
           label: "Sa (स)"
           accidentals: []
         # ... more characters
   ```

2. **Update `character_order`**:
   ```yaml
   character_order: "1234567CDEFGABcdefgabSrRgGmMPdDnNdrmfsltDRMFSLTसरेगमपधनि"
   ```

3. **Regenerate font**:
   ```bash
   python3 tools/fontgen/generate.py
   ```

4. **Verify output**:
   - Check `NotationMonoDotted-map.json` has new system
   - Verify PUA allocation didn't break existing codepoints
   - Test new characters in browser

5. **Rebuild editor**:
   ```bash
   npm run build-wasm
   ```

### 7.2 Guarantees

- **Existing codepoints remain stable**: Adding systems APPENDS new codepoints, never changes existing ones
- **Symbols move**: Symbol codepoints will shift (e.g., from 0xE0BC to 0xE1BC) but editor doesn't care because it uses JSON
- **No code changes needed**: If build-time code generation is set up correctly, the editor picks up new systems automatically

---

## 8. Version History and Compatibility

### 8.1 JSON Schema Versioning

**Current version**: `1.0`

Future versions MUST:
- Increment `version` field in JSON
- Maintain backward compatibility for at least one major version
- Document breaking changes in this spec

### 8.2 Font Versioning

Font metadata includes:
- `fontname`: "NotationMonoDotted"
- `fullname`: "Notation Mono Dotted"
- `version`: Matches JSON version

---

## 9. Testing Requirements

### 9.1 Generator Tests

```python
def test_codepoint_assignment_sequential():
    """Verify codepoints are assigned without gaps"""

def test_no_duplicate_codepoints():
    """Verify each codepoint is unique"""

def test_character_order_matches_systems():
    """Verify atoms.yaml character_order is correct"""

def test_pua_range_valid():
    """Verify all codepoints are in 0xE000-0xF8FF"""

def test_json_schema_valid():
    """Verify output JSON matches schema"""
```

### 9.2 Integration Tests

```bash
# Generate font
python3 tools/fontgen/generate.py

# Verify files exist
test -f static/fonts/NotationMonoDotted.ttf
test -f static/fonts/NotationMonoDotted-map.json

# Verify JSON is valid
jq . static/fonts/NotationMonoDotted-map.json > /dev/null

# Verify font loads in browser (Playwright test)
npx playwright test tests/e2e-pw/tests/notation-font-loads.spec.js
```

---

## 10. Geometry Configuration

### 10.1 Positioning Parameters

**CRITICAL**: Do NOT embed magic numbers in Python code. All geometry knobs MUST be configurable.

#### Current Parameters (to be moved to atoms.yaml or config section)

```yaml
geometry:
  dots:
    above_gap: 50        # Distance from character bbox top to first dot
    below_gap: 50        # Distance from character bbox bottom to first dot
    vertical_step: 100   # Spacing between first and second dot
    horizontal_center: true  # Center dots over character width

  symbols:
    accidental_scale: 1.0      # Future: scale factor for # ♭ symbols
    accidental_x_offset: 0     # Future: horizontal positioning
    accidental_y_offset: 0     # Future: vertical positioning
    barline_scale: 1.0         # Scale factor for barlines
    ornament_scale: 1.0        # Scale factor for mordent/trill/turn
```

**Rationale**: Dot positioning is currently hardcoded in `generate.py` with values like:
```python
dot_spacing = dot_height + 100
bbox_offset = 50
```

These MUST move to `atoms.yaml` so designers can tweak positioning without reading Python code.

---

## 11. Codepoint Stability Guarantees

### 11.1 The Stability Promise

**PROMISE**: Once a codepoint is assigned to a (system, character, variant), it NEVER changes unless explicitly versioned as a breaking change.

### 11.2 Golden Mapping Snapshot

**Requirement**: The repository MUST maintain a golden snapshot of codepoint assignments.

**Location**: `tools/fontgen/mapping-golden.json`

**Purpose**: Detect accidental codepoint reshuffling during development

#### Snapshot Format

```json
{
  "version": "1.0",
  "locked_at": "2025-11-08",
  "notes": [
    {"id": 0, "system": "number", "char": "1", "variant": "1_dot_above", "codepoint": "E000"},
    {"id": 0, "system": "number", "char": "1", "variant": "2_dots_above", "codepoint": "E001"},
    ...
  ],
  "symbols": [
    {"id": 0, "name": "sharp", "codepoint": "E0BC"},
    ...
  ]
}
```

### 11.3 Stability Test

```python
def test_codepoint_stability():
    """
    Verify that regenerating the font doesn't change existing codepoint assignments.

    Algorithm:
        1. Load mapping-golden.json
        2. Generate new mapping to /tmp
        3. For each entry in golden:
            a. Find matching entry in new mapping
            b. Assert codepoint is identical
        4. Allow new entries (appended)
        5. Forbid changed codepoints

    This test MUST pass unless FONT_MAP_BREAKING_CHANGE=true is set.
    """
```

### 11.4 Append-Only Rule

**Rule**: When adding new pitch systems or characters, codepoints MUST be appended, never inserted.

**Bad** (reshuffles existing):
```yaml
# atoms.yaml v1
notation_systems:
  - number
  - western
  - sargam
  - doremi

# atoms.yaml v2 (WRONG - inserts in middle)
notation_systems:
  - number
  - bhatkhande  # ← Inserted, shifts all subsequent systems
  - western
  - sargam
  - doremi
```

**Good** (appends):
```yaml
# atoms.yaml v2 (CORRECT - appends)
notation_systems:
  - number
  - western
  - sargam
  - doremi
  - bhatkhande  # ← Appended at end
```

**Enforcement**: The `assign_codepoints()` function MUST respect existing stable IDs if present, only assigning new codepoints to new entries.

---

## 12. Build Modes

### 12.1 Development Mode (Default)

**Behavior**: Permissive, optimized for iteration

- Bravura font missing → Warn, skip symbols, continue
- Invalid Bravura glyph → Warn, skip that symbol, continue
- Missing base glyphs → Fail (can't generate notes)

**Use case**: Local development, quick iteration on dot positioning

### 12.2 Strict Mode (CI/Release)

**Flag**: `--strict` or `--require-bravura`

**Behavior**: All-or-nothing, fail on any error

- Bravura font missing → **FAIL** with error message
- Invalid Bravura glyph → **FAIL** with glyph name
- Missing base glyphs → **FAIL**
- Any codepoint collision → **FAIL**
- PUA overflow → **FAIL**

**Use case**: CI builds, production releases

**Example**:
```bash
# Dev mode (lenient)
python3 tools/fontgen/generate.py

# Strict mode (fail on missing Bravura)
python3 tools/fontgen/generate.py --strict
```

---

## 13. Debug Tooling

### 13.1 Visual Specimen Output

**Flag**: `--debug-html`

**Output**: `debug-specimen.html` alongside font file

**Purpose**: Quick visual verification of all glyphs without running the full editor

#### Example Output

```html
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>NotationMonoDotted Debug Specimen</title>
    <style>
        @font-face {
            font-family: 'NotationMonoDotted';
            src: url('./NotationMonoDotted.ttf') format('truetype');
        }
        body {
            font-family: 'NotationMonoDotted', monospace;
            font-size: 32px;
            line-height: 2;
        }
        .system { margin: 2em 0; }
        .char-row { margin: 0.5em 0; padding: 0.5em; background: #f0f0f0; }
        .label { font-family: sans-serif; font-size: 14px; color: #666; }
        .glyph { margin: 0 0.5em; }
    </style>
</head>
<body>
    <h1>NotationMonoDotted Debug Specimen</h1>
    <p class="label">Generated: 2025-11-08 | Total glyphs: 199</p>

    <div class="system">
        <h2>Number System (7 chars × 4 variants)</h2>
        <div class="char-row">
            <span class="label">1:</span>
            <span class="glyph">1</span>
            <span class="glyph">&#xE000;</span> <!-- +1 -->
            <span class="glyph">&#xE001;</span> <!-- +2 -->
            <span class="glyph">&#xE002;</span> <!-- -1 -->
            <span class="glyph">&#xE003;</span> <!-- -2 -->
        </div>
        <!-- Repeat for 2-7 -->
    </div>

    <div class="system">
        <h2>Symbols (11 glyphs)</h2>
        <div class="char-row">
            <span class="label">sharp:</span>
            <span class="glyph">&#xE0BC;</span>
        </div>
        <!-- Repeat for all symbols -->
    </div>
</body>
</html>
```

**Usage**:
```bash
python3 tools/fontgen/generate.py --debug-html
open debug-specimen.html  # Visual inspection in browser
```

### 13.2 Validation-Only Mode

**Flag**: `--validate-only`

**Purpose**: Pre-commit check without requiring FontForge

**Behavior**:
1. Load `atoms.yaml`
2. Run `assign_codepoints()`
3. Run `validate_layout()`
4. Build JSON in memory
5. Compare against `mapping-golden.json`
6. **DO NOT** generate font file
7. Exit with code 0 (success) or 1 (validation failed)

**Use case**: Fast pre-commit hook, CI validation step

**Example**:
```bash
# Pre-commit hook
python3 tools/fontgen/generate.py --validate-only
if [ $? -ne 0 ]; then
    echo "Font mapping validation failed!"
    exit 1
fi
```

---

## 14. Build Integration

### 14.1 Makefile Target

**Required**: Add a top-level `make fonts` target

```makefile
# editor/Makefile

.PHONY: fonts
fonts: static/fonts/NotationMonoDotted.ttf

static/fonts/NotationMonoDotted.ttf: tools/fontgen/atoms.yaml tools/fontgen/generate.py
	@echo "Generating notation font..."
	python3 tools/fontgen/generate.py --strict
	@echo "Validating JSON..."
	jq . static/fonts/NotationMonoDotted-map.json > /dev/null
	@echo "Running sanity tests..."
	python3 -m pytest tools/fontgen/test_generator.py
	@echo "✓ Font generation complete"

.PHONY: fonts-validate
fonts-validate:
	python3 tools/fontgen/generate.py --validate-only

.PHONY: fonts-debug
fonts-debug:
	python3 tools/fontgen/generate.py --debug-html
	open debug-specimen.html

# Main editor build depends on fonts
editor: fonts
	npm run build-wasm
	npm run build-js
```

**Usage**:
```bash
# Regenerate font (strict mode)
make fonts

# Quick validation (no FontForge needed)
make fonts-validate

# Visual debug specimen
make fonts-debug

# Full build (fonts → WASM → JS)
make editor
```

### 14.2 Build Dependency Chain

```
atoms.yaml changes
    ↓
make fonts (regenerate TTF + JSON)
    ↓
make editor (rebuild WASM with new static tables)
    ↓
Dev server restart (reload new font)
```

**Enforcement**: CI MUST run `make fonts-validate` on every commit to ensure atoms.yaml changes don't break codepoint stability.

---

## 15. Accidentals: Explicitly Deferred (v1.0)

### 15.1 Current Status

**v1.0**: Accidentals are NOT implemented. All notes are naturals.

**Code markers**:

```yaml
# atoms.yaml
notation_systems:
  - system_name: "number"
    characters:
      - char: "1"
        accidentals: []  # NOTE: v1.0 - accidentals not yet implemented
```

```python
# generate.py
def assign_codepoints(spec):
    # v1.0: Only natural notes (no #, b, ##, bb)
    # See SPEC.md Section 15 for future accidental support
    for char in spec.characters:
        # Currently ignoring char.accidentals field
        ...
```

### 15.2 Future Implementation Options

**Option 1**: Composite glyphs (base + accidental + dots)
- Each (char, accidental, octave_shift) gets its own PUA codepoint
- Example: `1#` with +1 octave = separate glyph at (e.g.) 0xE500
- Pros: Simple rendering, all in font
- Cons: Glyph explosion (47 chars × 5 accidentals × 4 variants = 940 glyphs)

**Option 2**: Editor-side composition
- Font provides accidental symbols separately (sharp, flat, etc.)
- Editor renders base character + accidental as two glyphs
- Pros: Fewer glyphs, flexible positioning
- Cons: Editor handles layout

**Decision**: Deferred to v2.0. When implementing, update:
1. `atoms.yaml` schema (add accidentals per system)
2. `generate.py` logic (handle accidentals in codepoint assignment)
3. `SPEC.md` Section 15 (promote from "deferred" to "implemented")
4. Bump JSON mapping version to `2.0`

---

## 16. Open Questions and Future Work

### 10.2 Microtonal Support

**Question**: How to handle quarter-tones, 72-EDO, etc.?

**Options**:
- Use combining characters
- Add quarter-sharp/flat symbols
- Create separate pitch system entries

**Decision**: Defer until required

### 10.3 Ligatures and Advanced Typography

**Question**: Should the font support OpenType features?

**Current**: No ligatures, no contextual alternates

**Future**: Could use OT features for automatic barline positioning, smart spacing

**Decision**: Defer - current simple approach works

---

## 11. References

- **Unicode Private Use Area**: https://www.unicode.org/charts/PDF/UE000.pdf
- **SMuFL (Standard Music Font Layout)**: https://w3c.github.io/smufl/latest/
- **Bravura Font**: https://github.com/steinbergmedia/bravura
- **FontForge Python API**: https://fontforge.org/docs/scripting/python.html

---

## 12. Appendix: Example Full Build

```bash
# 1. Ensure prerequisites
python3 --version  # 3.7+
pip install PyYAML fontforge

# 2. Verify base fonts exist
ls -lh static/fonts/Inter.ttc
ls -lh tools/fontgen/base_fonts/Bravura.otf  # optional

# 3. Run generator
cd /home/john/editor
python3 tools/fontgen/generate.py \
  --base-font static/fonts/Inter.ttc \
  --bravura-font tools/fontgen/base_fonts/Bravura.otf \
  --atoms tools/fontgen/atoms.yaml \
  --output-dir static/fonts

# 4. Verify output
ls -lh static/fonts/NotationMonoDotted.ttf
ls -lh static/fonts/NotationMonoDotted-map.json
jq .summary static/fonts/NotationMonoDotted-map.json

# 5. Test in browser
npm run dev  # Start dev server
# Open http://localhost:8080 and test rendering
```

---

**End of Specification**
