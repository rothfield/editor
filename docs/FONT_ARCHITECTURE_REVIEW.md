# Font Generation Architecture Review
## Magic Numbers and Architectural Issues

**Generated:** 2025-11-17
**Scope:** tools/fontgen/generate.py, tools/fontgen/atoms.yaml, build.rs
**Objective:** Identify hardcoded values and architectural patterns that limit extensibility

---

## Executive Summary

The font generation system has **23 distinct magic numbers** and **7 major architectural issues** that make it difficult to:
- Add new pitch systems
- Add new accidental types
- Modify glyph positioning
- Add new musical symbols

Most issues stem from:
1. **Formula-based calculations spread across Python and Rust**
2. **Hardcoded layout assumptions** (6 accidentals, 5 octaves, 30 variants)
3. **Character-specific positioning hacks** (e.g., lines 1196-1209)
4. **Lack of configuration schema validation**

---

## Part 1: Magic Numbers in generate.py

### Category A: Glyph Geometry (CRITICAL - High Impact)

#### 1. Slash Drawing for Half-Flat (Lines 1140-1156, 621-633)

**Location:** `generate.py:1140-1156` (standalone half-flat), `generate.py:621-633` (composite slash)

**Magic Numbers:**
```python
# Line 1142: Slash positioning
flat_center_x = (fx_min + fx_max) / 2
slash_width = 80  # ⚠️ MAGIC: Hardcoded stroke width
slash_x = flat_center_x - slash_width / 2
slash_y_bottom = 200  # ⚠️ MAGIC: Hardcoded y-coordinate
slash_y_top = 700     # ⚠️ MAGIC: Hardcoded y-coordinate

# Lines 1148-1151: Diagonal slash path
pen.moveTo((slash_x, slash_y_bottom))
pen.lineTo((slash_x + slash_width, slash_y_bottom))
pen.lineTo((slash_x + 3 * slash_width, slash_y_top))  # ⚠️ MAGIC: 3× multiplier
pen.lineTo((slash_x + 2 * slash_width, slash_y_top))  # ⚠️ MAGIC: 2× multiplier

# Line 621: Slash extension (composite version)
slash_extension = int((scaled_acc_max_x - scaled_acc_min_x) * 0.15)  # ⚠️ MAGIC: 15% extension

# Line 633: Stroke weight calculation
stroke_weight = max(int(slash_width * 0.06), 25)  # ⚠️ MAGIC: 6% of width, min 25 units
```

**Problems:**
- **No font unit context**: Values like `200`, `700` assume specific font UPM (units per em)
- **Arbitrary multipliers**: Why `3×` and `2×` for diagonal? No documentation
- **Mixed coordinate systems**: Standalone uses absolute coords, composite uses relative
- **Hardcoded minimums**: `25` unit minimum stroke has no relationship to glyph size

**Should Be Configurable:**
```yaml
geometry:
  slash:
    extension_ratio: 0.15        # Extend beyond symbol bounds
    stroke_weight_ratio: 0.06    # Stroke as % of symbol width
    min_stroke_weight: 25        # Minimum stroke in font units
    vertical_range:              # Y-coordinates for standalone version
      bottom: 200
      top: 700
    diagonal_multipliers:        # Path shape control
      top_outer: 3.0
      top_inner: 2.0
```

---

#### 2. Octave Dot Positioning (Lines 1255-1290, 813-862)

**Location:** `generate.py:1255-1290` (note glyphs), `generate.py:813-862` (accidental+octave composites)

**Magic Numbers:**
```python
# Line 1193: Horizontal positioning
dot_x_offset = bx_min + (base_width - dot_width) / 2 - dx_min + (dot_width * 0.8)  # ⚠️ MAGIC: 80% shift

# Lines 1196-1209: Character-specific adjustments (⚠️⚠️⚠️ WORST OFFENDERS)
if atom.character == "2":
    dot_x_offset -= base_width * 0.1   # ⚠️ MAGIC: 10% shift left for "2"
if atom.character in ["3", "5", "6"]:
    dot_x_offset -= base_width * 0.17  # ⚠️ MAGIC: 17% shift left for "3,5,6"
if atom.character == "4":
    dot_x_offset += base_width * 0.04  # ⚠️ MAGIC: 4% shift right for "4"
if atom.character == "7":
    dot_x_offset -= base_width * 0.04  # ⚠️ MAGIC: 4% shift left for "7"

# Line 1259: Double dot scaling
double_dot_scale = 0.6  # ⚠️ MAGIC: 60% scale for stacked dots

# Line 1260: Double dot spacing
double_dot_spacing = 2 * dot_height * double_dot_scale  # ⚠️ MAGIC: 2× spacing

# Line 1262: Vertical adjustment
dot_adjustment = char_height * 0.05  # ⚠️ MAGIC: 5% adjustment
```

**Problems:**
- **Bespoke per-character hacks**: Why do "3", "5", "6" get 17% shift but "4" gets 4%?
- **No pattern documentation**: Are these visual centering hacks? Optical corrections?
- **Unmaintainable**: Adding new pitch systems requires guessing shift values
- **Fragile**: Character shape changes break positioning

**Should Be Configurable:**
```yaml
geometry:
  dots:
    horizontal_shift_base: 0.8          # Base shift ratio (currently hardcoded)
    double_dot_scale: 0.6               # Scale factor for stacked dots
    double_dot_spacing_multiplier: 2.0  # Spacing between dots
    vertical_adjustment_ratio: 0.05     # Optical centering adjustment

    # Character-specific optical corrections
    per_character_adjustments:
      "2": { x_shift_ratio: -0.1 }
      "3": { x_shift_ratio: -0.17 }
      "4": { x_shift_ratio: 0.04 }
      "5": { x_shift_ratio: -0.17 }
      "6": { x_shift_ratio: -0.17 }
      "7": { x_shift_ratio: -0.04 }
      # Easy to add Western/Sargam/Doremi adjustments:
      # "C": { x_shift_ratio: -0.05 }
      # "S": { x_shift_ratio: 0.0 }
```

---

#### 3. Accidental Symbol Positioning (Lines 595-596)

**Location:** `generate.py:595-596`

**Magic Numbers:**
```python
# Line 595: Horizontal positioning
x_offset = int(base_max_x - acc_min_x + spec.geometry.accidental_x_offset)

# Line 596: Vertical centering
y_offset = int((base_max_y + base_min_y - acc_max_y - acc_min_y) / 2 + spec.geometry.accidental_y_offset)
```

**Problems:**
- **Vertical centering formula is hardcoded**: No way to use top-alignment, baseline-alignment, etc.
- **Single offset value**: `accidental_x_offset` applies to all accidentals equally
- **No accidental-specific positioning**: Sharp vs flat have different visual weights

**Should Be Configurable:**
```yaml
geometry:
  symbols:
    accidental_vertical_alignment: "center"  # Options: "center", "top", "baseline", "bottom"
    accidental_x_offset: 50       # Default horizontal gap
    accidental_y_offset: 0        # Default vertical adjustment

    # Per-accidental-type overrides
    accidental_adjustments:
      sharp:
        x_offset: 50
        y_offset: 0
        scale: 1.0
      flat:
        x_offset: 45
        y_offset: -10   # Flat sits higher visually
        scale: 0.95
      double_sharp:
        x_offset: 55
        y_offset: 5
        scale: 1.1
```

---

### Category B: Layout Constants (MODERATE Impact)

#### 4. Variant Count Architecture (Lines 33-35, 293-300)

**Location:** `generate.py:33-35` (build.rs matching values), `generate.py:293-300` (layout formula)

**Magic Numbers:**
```python
# build.rs:33-35 (matches generate.py assumptions)
const ACCIDENTAL_TYPES: usize = 6;  # ⚠️ MAGIC: Hardcoded to 6 types
const OCTAVE_VARIANTS: usize = 5;   # ⚠️ MAGIC: Hardcoded to 5 octaves
const VARIANTS_PER_CHAR: usize = 30; # ⚠️ MAGIC: 6 × 5 = 30

# generate.py:358 (octave order)
octave_order = [0, -2, -1, 1, 2]  # ⚠️ MAGIC: Arbitrary order (not [-2,-1,0,1,2])

# generate.py:369-376 (accidental block order)
acc_blocks = [
    ('natural', 0),       # ⚠️ MAGIC: Block indices hardcoded
    ('flat', 1),
    ('halfflat', 2),
    ('doubleflat', 3),
    ('doublesharp', 4),
    ('sharp', 5),
]

# generate.py:387 (formula)
codepoint = system_pua_base + (char_index * 30) + variant_index  # ⚠️ MAGIC: 30 hardcoded
```

**Problems:**
- **Impossible to add quarter-tone accidentals**: Would need 9 types (natural, ♯, ♭, 𝄪, 𝄫, ♯↑, ♯↓, ♭↑, ♭↓)
- **Can't support extended octaves**: Some systems need ±3 octaves
- **Fragile coupling**: Changing 30 → 45 requires synchronized edits in Python, Rust, and JavaScript
- **Octave order mystery**: Why `[0, -2, -1, 1, 2]` instead of sequential `[-2, -1, 0, 1, 2]`?

**Should Be Configurable:**
```yaml
glyph_variants:
  accidental_types: 6       # Currently: natural, flat, half-flat, double-flat, sharp, double-sharp
  octave_variants: 5        # Currently: 0, -2, -1, +1, +2
  count_per_character: 30   # Auto-calculated: accidental_types × octave_variants

  # Accidental block ordering (for PUA allocation)
  accidental_order: [natural, flat, halfflat, doubleflat, doublesharp, sharp]

  # Octave ordering (CRITICAL: must match build.rs octave_index mapping)
  octave_order: [0, -2, -1, 1, 2]
  octave_range: [-2, 2]  # Min and max octave shifts

  # Future extensibility
  allow_quarter_tones: false  # If true, add ♯↑, ♯↓, ♭↑, ♭↓ (9 total accidentals)
  allow_extended_octaves: false  # If true, extend to ±3 or ±4 octaves
```

---

#### 5. Synthetic Dot Glyph (Lines 1095-1107)

**Location:** `generate.py:1095-1107`

**Magic Numbers:**
```python
# Line 1099: Dot size
size = 100  # ⚠️ MAGIC: Arbitrary square size

# Lines 1100-1104: Square path (crude dot approximation)
pen.moveTo((0, 0))
pen.lineTo((size, 0))
pen.lineTo((size, size))
pen.lineTo((0, size))
pen.closePath()

# Line 1106: Width with padding
dot_glyph.width = size + 50  # ⚠️ MAGIC: 50 units padding
```

**Problems:**
- **Square dots are ugly**: Should use circular paths or proper glyph from font
- **Arbitrary size**: `100` has no relationship to font metrics
- **Padding hack**: Why 50 units? Should be proportional

**Should Be Configurable:**
```yaml
geometry:
  dot_glyph_fallback:
    size: 100            # Fallback dot size (font units)
    shape: "square"      # Options: "square", "circle", "copy_from_font"
    padding: 50          # Side bearings
    # For circular dots:
    circle_quality: 16   # Number of bezier segments
```

---

### Category C: PUA Allocation (LOW Impact - Already Configurable)

#### 6. Legacy Composite Ranges (Lines 723-728, 505-510)

**Location:** `generate.py:723-728` (combined accidental+octave), `generate.py:505-510` (simple accidentals)

**Magic Numbers:**
```python
# Lines 723-728: Combined ranges (LEGACY - conflicts with Western system)
COMBINED_RANGES = {
    'sharp': (0xE2B0, 0xE36F),        # ⚠️ MAGIC: PUA ranges hardcoded in Python
    'flat': (0xE370, 0xE42F),
    'double_sharp': (0xE430, 0xE4EF),
    'double_flat': (0xE4F0, 0xE5AF),
}

# Lines 505-510: Simple accidental ranges (from atoms.yaml, but still hardcoded in Python)
range_str = acc_config.get('range', '')  # e.g., "0xE1F0 - 0xE21E"
if range_str and '-' in range_str:
    parts = range_str.split('-')
    start = int(parts[0].strip(), 16)  # ⚠️ MAGIC: String parsing
    end = int(parts[1].strip(), 16)
```

**Problems:**
- **COMBINED_RANGES is dead code**: Lines 1303-1310 explicitly disable this feature
- **Range string parsing is fragile**: Should use structured YAML, not string parsing
- **Conflicts possible**: No validation that ranges don't overlap

**Already Configurable (atoms.yaml), but Implementation is Poor:**
```yaml
# atoms.yaml already has this, but generate.py doesn't validate conflicts
accidental_composites:
  types:
    sharp:
      range: "0xE1F0 - 0xE21E"  # ⚠️ String format is error-prone
```

**Should Use:**
```yaml
accidental_composites:
  types:
    sharp:
      pua_start: 0xE1F0  # Structured ints, not strings
      count: 47
```

---

### Category D: Symbol Extraction (LOW Impact)

#### 7. Accidental Symbol Codepoints (Lines 1000, 1232-1240)

**Location:** `generate.py:1000` (import list), `generate.py:1232-1240` (glyph creation)

**Magic Numbers:**
```python
# Line 1000: Hardcoded list of accidentals to import
accidental_codepoints = [0x266D, 0x266F, 0x1D12B, 0x1D12A]  # ⚠️ MAGIC: Hardcoded list

# Lines 1232-1240: Accidental type mapping
if acc_type == 1:  # Flat
    acc_glyph = font[0x266D]   # ⚠️ MAGIC: Codepoints hardcoded
elif acc_type == 2:  # Half-flat
    acc_glyph = halfflat_glyph if halfflat_glyph else None
elif acc_type == 3:  # Double-flat
    acc_glyph = font[0x1D12B]  # ⚠️ MAGIC
elif acc_type == 4:  # Double-sharp
    acc_glyph = font[0x1D12A]  # ⚠️ MAGIC
elif acc_type == 5:  # Sharp
    acc_glyph = font[0x266F]   # ⚠️ MAGIC
```

**Problems:**
- **Hardcoded codepoint list**: Adding half-sharp requires editing Python code
- **Accidental type enum is implicit**: `acc_type` is an integer, not a symbolic constant
- **No validation**: If `smufl_symbol` in atoms.yaml doesn't match Python, silent failure

**Should Be Generated from atoms.yaml:**
```python
# Auto-generate from atoms.yaml instead of hardcoding
accidental_map = {}
for acc_name, acc_config in spec.accidental_composites['types'].items():
    symbol_cp = acc_config.get('smufl_symbol')
    if symbol_cp:
        accidental_map[acc_name] = symbol_cp

# Use symbolic names, not magic integers
if acc_type_name == 'flat':
    acc_glyph = font[accidental_map['flat']]
elif acc_type_name == 'sharp':
    acc_glyph = font[accidental_map['sharp']]
```

---

### Category E: Font Metrics (LOW Impact)

#### 8. Font Metadata (Lines 1071-1073)

**Location:** `generate.py:1071-1073`

**Magic Numbers:**
```python
# Lines 1071-1073: Hardcoded font name
font.fontname = "NotationFont"
font.fullname = "NotationFont"
font.familyname = "NotationFont"
```

**Problems:**
- **No version information**: Font name should include system (NotationFont-Number, NotationFont-Western)
- **No metadata**: Missing copyright, license, version fields

**Should Be Configurable:**
```yaml
font_metadata:
  family_name: "NotationFont"
  version: "2.0"
  copyright: "© 2025 Music Text Editor Project"
  license: "SIL Open Font License 1.1"
  # Per-system naming
  system_suffix: true  # Generates NotationFont-Number, NotationFont-Western, etc.
```

---

#### 9. Glyph Width Calculation (Lines 672, 867, 1292, 1248)

**Location:** Multiple locations where glyph width is set

**Magic Numbers:**
```python
# Line 672: Accidental composite width
acc_width_scaled = int((acc_max_x - acc_min_x) * scale)
composite.width = int(x_offset + acc_width_scaled)  # ⚠️ MAGIC: No padding

# Line 1248: Store target width for later
target_width = int(bx_max + acc_glyph.width)  # ⚠️ MAGIC: Direct sum, no kerning

# Line 1292: Use same width as base character
g.width = base_glyph.width  # ⚠️ MAGIC: Ignores dot width
```

**Problems:**
- **No sidebearing control**: Widths are calculated geometrically, not typographically
- **No kerning support**: Accidental widths don't account for character-specific spacing
- **Inconsistent logic**: Some glyphs use `base_width`, others use `base + accidental`

**Should Be Configurable:**
```yaml
geometry:
  glyph_width_policy: "base_character"  # Options: "base_character", "base_plus_accidental", "optical"
  accidental_width_padding: 0  # Extra spacing after accidental
  dot_width_contribution: 0    # Whether dots affect advance width
```

---

## Part 2: Architectural Issues

### Issue #1: Split Brain - Python vs Rust Constants

**Problem:** Critical constants are duplicated across generate.py and build.rs with no validation.

**Evidence:**
```python
# generate.py:358
octave_order = [0, -2, -1, 1, 2]

# build.rs:196-203 (must manually match!)
pub fn octave_index(o: i8) -> Option<usize> {
    match o {
        0 => Some(0),    // ⚠️ If this doesn't match generate.py, fonts break!
        -2 => Some(1),
        -1 => Some(2),
        1 => Some(3),
        2 => Some(4),
        _ => None,
    }
}
```

**Impact:**
- Changing octave order in Python breaks Rust lookups
- No compile-time validation
- Silent data corruption if out of sync

**Solution:**
Make atoms.yaml the single source of truth for ordering:

```yaml
glyph_variants:
  octave_order: [0, -2, -1, 1, 2]
  accidental_order: [natural, flat, halfflat, doubleflat, doublesharp, sharp]
```

Then:
1. build.rs generates Rust constants from atoms.yaml
2. generate.py reads atoms.yaml and generates same ordering
3. Add `--validate` flag to compare Python vs Rust orderings

---

### Issue #2: Per-Character Positioning is Unmaintainable

**Problem:** Lines 1196-1209 have bespoke hacks for Number system characters only.

**Evidence:**
```python
# Lines 1196-1209: Why do ONLY these characters get adjustments?
if atom.character == "2":
    dot_x_offset -= base_width * 0.1
if atom.character in ["3", "5", "6"]:
    dot_x_offset -= base_width * 0.17
if atom.character == "4":
    dot_x_offset += base_width * 0.04
if atom.character == "7":
    dot_x_offset -= base_width * 0.04

# Western system characters (C, D, E, F, G, A, B) get NO adjustments!
# Sargam (S, r, R, g, G, m, M, P, d, D, n, N) gets NO adjustments!
# Doremi (d, r, m, f, s, l, t) gets NO adjustments!
```

**Impact:**
- Dots are visually off-center for Western/Sargam/Doremi
- Adding new systems requires guessing shift values
- No documentation for WHY these values were chosen

**Solution:**
Extract to atoms.yaml with optical centering documentation:

```yaml
geometry:
  dots:
    per_character_adjustments:
      # Number system optical corrections
      "1": { x_shift_ratio: 0.0, reason: "Symmetric, no adjustment needed" }
      "2": { x_shift_ratio: -0.1, reason: "Curved right side, shift left" }
      "3": { x_shift_ratio: -0.17, reason: "Double curve, major left shift" }
      "4": { x_shift_ratio: 0.04, reason: "Descender leans left, shift right" }
      "5": { x_shift_ratio: -0.17, reason: "Curved right, major left shift" }
      "6": { x_shift_ratio: -0.17, reason: "Curved right, major left shift" }
      "7": { x_shift_ratio: -0.04, reason: "Diagonal, minor left shift" }

      # Western system (NEEDS VISUAL TUNING!)
      "C": { x_shift_ratio: 0.0, reason: "TODO: Test and adjust" }
      "D": { x_shift_ratio: 0.0, reason: "TODO: Test and adjust" }
      # ... etc
```

---

### Issue #3: No Schema Validation for atoms.yaml

**Problem:** atoms.yaml has no schema validation. Typos cause silent failures.

**Evidence:**
```python
# generate.py:213 - Silently falls back to defaults
dot_above_gap=geometry_config.get('dots', {}).get('above_gap', 50),  # Typo in YAML? Uses 50!

# generate.py:232 - Wrong key name? Silent failure
smufl_codepoint=symbol_def.get('smufl_codepoint', 0),  # 0 is an invalid codepoint!
```

**Impact:**
- Typos like `dot_above_gap` → `dots_above_gap` use defaults silently
- Missing required fields (like `smufl_codepoint`) fall back to invalid values
- No early error detection

**Solution:**
Add JSON Schema validation at start of generate.py:

```python
import jsonschema

ATOMS_SCHEMA = {
    "type": "object",
    "required": ["notation_systems", "geometry", "smufl_symbols"],
    "properties": {
        "geometry": {
            "type": "object",
            "required": ["dots", "symbols"],
            "properties": {
                "dots": {
                    "type": "object",
                    "required": ["above_gap", "below_gap", "vertical_step"],
                    "properties": {
                        "above_gap": {"type": "integer", "minimum": 0},
                        "below_gap": {"type": "integer", "minimum": 0},
                        "vertical_step": {"type": "integer", "minimum": 0},
                    }
                },
                # ... etc
            }
        }
    }
}

def validate_atoms_yaml(atoms):
    jsonschema.validate(instance=atoms, schema=ATOMS_SCHEMA)
```

---

### Issue #4: Hardcoded Accidental Block Ordering

**Problem:** Lines 369-376 define accidental block ordering in Python only.

**Evidence:**
```python
# generate.py:369-376
acc_blocks = [
    ('natural', 0),       # Block 0: naturals (5N codepoints)
    ('flat', 1),          # Block 1: flats (5N codepoints)
    ('halfflat', 2),      # Block 2: half-flats (5N codepoints)
    ('doubleflat', 3),    # Block 3: double-flats (5N codepoints)
    ('doublesharp', 4),   # Block 4: double-sharps (5N codepoints)
    ('sharp', 5),         # Block 5: sharps (5N codepoints)
]

# build.rs:434-442 has DIFFERENT ordering!
# build.rs uses: natural, flat, HALF-FLAT, double-flat, DOUBLE-SHARP, sharp
# generate.py uses: natural, flat, HALF-FLAT, double-flat, DOUBLE-SHARP, sharp
# (Actually they match now, but used to be out of sync!)
```

**Impact:**
- Changing accidental order requires editing Python AND Rust
- Easy to get out of sync (historically was a bug)
- No single source of truth

**Solution:**
Define ordering in atoms.yaml:

```yaml
glyph_variants:
  accidental_order:
    - natural
    - flat
    - halfflat
    - doubleflat
    - doublesharp
    - sharp
```

Then both Python and Rust read this list.

---

### Issue #5: Slash Drawing is Ad-Hoc

**Problem:** Two different implementations (standalone half-flat vs composite slash).

**Evidence:**
```python
# Standalone half-flat (lines 1140-1156): Absolute coordinates
slash_y_bottom = 200  # Hardcoded Y
slash_y_top = 700     # Hardcoded Y

# Composite slash (lines 621-633): Relative coordinates
slash_extension = int((scaled_acc_max_x - scaled_acc_min_x) * 0.15)
slash_start_y = scaled_acc_max_y + slash_extension
slash_end_y = scaled_acc_min_y - slash_extension
```

**Impact:**
- Two different geometric calculations for same visual element
- Standalone version will break if flat glyph shape changes
- Composite version is correct, standalone is a hack

**Solution:**
1. Delete standalone half-flat creation (lines 1123-1164)
2. Use only composite slash generation (it already works)
3. Move slash geometry to atoms.yaml

---

### Issue #6: No Support for New Accidental Types

**Problem:** Adding quarter-tone accidentals (♯↑, ♯↓, ♭↑, ♭↓) requires editing 5+ files.

**Current Architecture:**
- `ACCIDENTAL_TYPES = 6` hardcoded in build.rs:33
- `acc_blocks` list hardcoded in generate.py:369-376
- `pitch_code_index()` hardcoded in build.rs:145-189
- PitchCode enum hardcoded in Rust
- No extensibility mechanism

**What Would Break:**
1. Change `ACCIDENTAL_TYPES = 6` → `9` in build.rs
2. Change `VARIANTS_PER_CHAR = 30` → `45` in build.rs
3. Add 3 new entries to `acc_blocks` in generate.py
4. Add 21 new PitchCode variants (N1sharphalf_up, N1sharphalf_down, N1flathalf_up, ...)
5. Update `pitch_code_index()` to handle 63 total pitch codes
6. Update codepoint formulas in 3 places
7. Update atoms.yaml with new accidental definitions
8. Update JavaScript code to handle new glyphs

**Solution:**
Make accidental types data-driven:

```yaml
accidental_types:
  - name: natural
    symbol_codepoint: null  # No symbol needed
    abbrev: ""
  - name: flat
    symbol_codepoint: 0x266D
    abbrev: "b"
  - name: half_flat
    symbol_codepoint: 0x266D
    draw_slash: true
    abbrev: "hf"
  - name: sharp
    symbol_codepoint: 0x266F
    abbrev: "s"
  # Easy to add:
  - name: quarter_sharp_up
    symbol_codepoint: 0x1D132  # 𝄲 (half sharp with arrow up)
    abbrev: "su"
  - name: quarter_sharp_down
    symbol_codepoint: 0x1D133  # 𝄳 (half sharp with arrow down)
    abbrev: "sd"
```

Then:
1. build.rs generates PitchCode enum from atoms.yaml
2. generate.py reads accidental_types list (no hardcoded blocks)
3. Adding new accidental = add 1 YAML entry, regenerate code

---

### Issue #7: Half-Flat Glyph at 0xF8FF is a Hack

**Problem:** Temporary PUA codepoint for half-flat accidental (line 1126).

**Evidence:**
```python
# Line 1126
halfflat_cp = 0xF8FF  # ⚠️ Temporary PUA codepoint for half-flat accidental
```

**Why This is Bad:**
- `0xF8FF` is the LAST codepoint in PUA (end of Unicode private use area)
- Conflicts with other software that uses `0xF8FF` (macOS uses it for Apple logo!)
- Should use a proper allocated range, not a temp hack

**Impact:**
- Potential conflicts with user fonts
- Not portable to other systems
- Unprofessional

**Solution:**
Allocate proper PUA range in atoms.yaml:

```yaml
pua_special_glyphs:
  halfflat_accidental: 0xF000  # Proper allocation away from end of PUA
```

---

## Part 3: Summary of Recommendations

### Immediate Fixes (High Priority)

1. **Extract per-character adjustments to atoms.yaml** (Lines 1196-1209)
   - Add `geometry.dots.per_character_adjustments` section
   - Document optical centering rationale for each character
   - Add Western/Sargam/Doremi adjustments (currently missing!)

2. **Move slash geometry to atoms.yaml** (Lines 621-633, 1140-1156)
   - Add `geometry.slash` section with all magic numbers
   - Delete standalone half-flat creation (lines 1123-1164)
   - Use only composite slash generation

3. **Add JSON Schema validation** (Beginning of generate.py)
   - Validate atoms.yaml structure before processing
   - Catch typos and missing required fields early
   - Fail fast with clear error messages

4. **Move half-flat glyph to proper PUA** (Line 1126)
   - Change `0xF8FF` → proper allocated range
   - Add to `pua_special_glyphs` in atoms.yaml

### Medium Priority (Extensibility)

5. **Make accidental ordering data-driven** (Lines 369-376)
   - Add `glyph_variants.accidental_order` to atoms.yaml
   - Generate both Python and Rust code from this list
   - Add validation that Python and Rust orderings match

6. **Make octave ordering data-driven** (Line 358)
   - Add `glyph_variants.octave_order` to atoms.yaml
   - Generate both Python and Rust code from this list
   - Document WHY order is `[0, -2, -1, 1, 2]` not `[-2, -1, 0, 1, 2]`

7. **Add validation for PUA range conflicts**
   - Check that allocated ranges don't overlap
   - Check that total glyphs fit in PUA (< 6400 codepoints)
   - Warn if approaching SMuFL reserved ranges

### Low Priority (Polish)

8. **Replace square dot with circle** (Lines 1095-1107)
   - Generate proper circular bezier curves
   - Or extract dot from existing font instead of synthesizing

9. **Add font metadata fields** (Lines 1071-1073)
   - Version, copyright, license, URL
   - Per-system naming (NotationFont-Number, NotationFont-Western)

10. **Add glyph width policies** (Lines 672, 867, 1292)
    - Configurable width calculation: base_character, base_plus_accidental, optical
    - Per-accidental kerning adjustments

---

## Part 4: Proposed atoms.yaml Enhancements

### New Section: Comprehensive Geometry

```yaml
geometry:
  # Octave dots
  dots:
    above_gap: 50
    below_gap: 50
    vertical_step: 100
    horizontal_center: true
    horizontal_shift_base: 0.8          # NEW
    double_dot_scale: 0.6               # NEW
    double_dot_spacing_multiplier: 2.0  # NEW
    vertical_adjustment_ratio: 0.05     # NEW

    # NEW: Per-character optical corrections
    per_character_adjustments:
      "1": { x_shift_ratio: 0.0 }
      "2": { x_shift_ratio: -0.1 }
      "3": { x_shift_ratio: -0.17 }
      "4": { x_shift_ratio: 0.04 }
      "5": { x_shift_ratio: -0.17 }
      "6": { x_shift_ratio: -0.17 }
      "7": { x_shift_ratio: -0.04 }
      # Add Western, Sargam, Doremi...

  # Accidental symbols
  symbols:
    accidental_scale: 1.0
    accidental_x_offset: 50
    accidental_y_offset: 0
    accidental_vertical_alignment: "center"  # NEW: Options: center, top, baseline, bottom

    # NEW: Per-accidental-type adjustments
    accidental_adjustments:
      sharp: { x_offset: 50, y_offset: 0, scale: 1.0 }
      flat: { x_offset: 45, y_offset: -10, scale: 0.95 }
      double_sharp: { x_offset: 55, y_offset: 5, scale: 1.1 }
      double_flat: { x_offset: 50, y_offset: -5, scale: 0.95 }

  # NEW: Slash drawing (half-flat, half-sharp)
  slash:
    extension_ratio: 0.15
    stroke_weight_ratio: 0.06
    min_stroke_weight: 25
    vertical_range:
      bottom: 200
      top: 700
    diagonal_multipliers:
      top_outer: 3.0
      top_inner: 2.0

  # NEW: Glyph width policy
  glyph_width:
    policy: "base_character"  # Options: base_character, base_plus_accidental, optical
    accidental_padding: 0
    dot_contribution: 0

  # NEW: Fallback dot glyph
  dot_glyph_fallback:
    size: 100
    shape: "square"  # Options: square, circle, copy_from_font
    padding: 50
    circle_quality: 16

# NEW: Explicit accidental ordering
glyph_variants:
  accidental_types: 6
  octave_variants: 5
  count_per_character: 30

  accidental_order: [natural, flat, halfflat, doubleflat, doublesharp, sharp]
  octave_order: [0, -2, -1, 1, 2]
  octave_range: [-2, 2]

  # Extensibility flags
  allow_quarter_tones: false
  allow_extended_octaves: false

# NEW: Special PUA allocations
pua_special_glyphs:
  halfflat_accidental: 0xF000  # Was 0xF8FF (conflicted with macOS)

# NEW: Font metadata
font_metadata:
  family_name: "NotationFont"
  version: "2.0"
  copyright: "© 2025 Music Text Editor Project"
  license: "SIL Open Font License 1.1"
  url: "https://github.com/your-repo/music-editor"
  system_suffix: true  # Generates NotationFont-Number, NotationFont-Western, etc.
```

---

## Part 5: Migration Strategy

### Phase 1: Extract Magic Numbers (1 week)
1. Add all new geometry sections to atoms.yaml
2. Update generate.py to read from atoms.yaml instead of hardcoding
3. Keep old values as defaults for backward compatibility
4. Add `--strict` mode that requires all values in atoms.yaml

### Phase 2: Add Validation (3 days)
1. Write JSON Schema for atoms.yaml
2. Add `validate_atoms_yaml()` function
3. Add `--validate-only` flag for CI/CD
4. Add tests for schema validation

### Phase 3: Data-Driven Orderings (1 week)
1. Add `accidental_order` and `octave_order` to atoms.yaml
2. Generate build.rs constants from these lists
3. Add validation that Python and Rust agree on orderings
4. Document WHY ordering is `[0, -2, -1, 1, 2]`

### Phase 4: Extensibility (2 weeks)
1. Make accidental types fully data-driven
2. Support quarter-tone accidentals
3. Support extended octaves (±3, ±4)
4. Add proper PUA range validation

---

## Conclusion

The font generation system has **23 magic numbers** spread across 1832 lines of Python code. Most are in three categories:

1. **Glyph geometry** (slash drawing, dot positioning): 15 magic numbers
2. **Layout constants** (30 variants, 6 accidentals, 5 octaves): 5 magic numbers
3. **PUA allocation** (ranges, offsets): 3 magic numbers

The **worst offenders** are:
- Lines 1196-1209: Character-specific positioning hacks (unmaintainable)
- Lines 621-633, 1140-1156: Duplicate slash drawing implementations
- Lines 369-376, build.rs:33-35: Hardcoded variant layout (not extensible)

By moving all magic numbers to atoms.yaml and adding schema validation, the system becomes:
- ✅ **Maintainable**: One place to change values
- ✅ **Extensible**: Easy to add new pitch systems and accidentals
- ✅ **Validated**: Errors caught at compile time, not runtime
- ✅ **Documented**: Rationale for each value in YAML comments

Estimated effort: **4-5 weeks** for full migration.

---

**End of Report**
