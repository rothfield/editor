# Rust FontSpec Migration - Minimal MVP (1-2 Weeks)

**Status**: Approved MVP
**Timeline**: 1-2 weeks
**Goal**: Rust validates atoms.yaml → emits fontspec.json → Python consumes it

---

## Executive Summary

**The Problem**: Python and Rust both parse atoms.yaml independently, risking inconsistency.

**The Solution (Minimal)**:
1. Rust parses atoms.yaml in build.rs
2. Rust emits `static/fontspec.json` (minimal canonical spec)
3. Python reads fontspec.json instead of atoms.yaml
4. Delete 400 lines of Python YAML parsing

**Benefits**:
- ✅ Single source of truth (Rust validates atoms.yaml)
- ✅ Impossible for Python/Rust to disagree
- ✅ Simpler Python (~800 lines → ~400 lines)
- ✅ Automatic (happens during cargo build)

---

## Minimal FontSpec (v1)

### What We're Building

```rust
// src/fontgen/lib.rs

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FontSpec {
    pub notation_systems: Vec<NotationSystem>,
    pub glyph_variants: GlyphVariantConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NotationSystem {
    pub name: String,              // "number", "western", etc.
    pub characters: Vec<char>,     // ['1', '2', ..., '7']
    pub pua_base: u32,             // 0xE100
    pub variants_per_char: usize,  // 25
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GlyphVariantConfig {
    pub accidental_types: usize,   // 5 (none, sharp, flat, double-sharp, double-flat)
    pub octave_variants: usize,    // 5 (0, -2, -1, +1, +2)
}
```

### What We're NOT Building (v1)

❌ `accidental_types: Vec<AccidentalType>` - Python hardcodes sharp/flat/etc
❌ `pua_blocks: Vec<PUABlock>` - Derived from notation_systems
❌ `source_fonts` - Python already has paths hardcoded
❌ Extensive validation - Just PUA overlaps
❌ CLI tool - build.rs calls lib directly
❌ Complex error types - Use anyhow for now

---

## Implementation Plan

### Week 1: Rust → JSON (3-4 days)

#### Day 1: Module Setup
```bash
# File structure
src/fontgen/
├── lib.rs       # Main module (load, validate, emit)
└── tests.rs     # Golden tests
```

#### Day 2: FontSpec Loader
```rust
// src/fontgen/lib.rs

use serde::{Serialize, Deserialize};
use serde_yaml;
use std::fs;

pub fn load_atoms_yaml(path: &str) -> anyhow::Result<FontSpec> {
    let contents = fs::read_to_string(path)?;
    let yaml: serde_yaml::Value = serde_yaml::from_str(&contents)?;

    let notation_systems = extract_notation_systems(&yaml)?;
    let glyph_variants = extract_glyph_variants(&yaml)?;

    Ok(FontSpec {
        notation_systems,
        glyph_variants,
    })
}

fn extract_notation_systems(yaml: &serde_yaml::Value) -> anyhow::Result<Vec<NotationSystem>> {
    let systems = yaml["notation_systems"]
        .as_sequence()
        .ok_or_else(|| anyhow::anyhow!("Missing notation_systems"))?;

    let mut result = Vec::new();

    for sys in systems {
        let name = sys["system_name"].as_str().unwrap().to_string();

        let chars: Vec<char> = sys["characters"]
            .as_sequence()
            .unwrap()
            .iter()
            .map(|c| c["char"].as_str().unwrap().chars().next().unwrap())
            .collect();

        let pua_base = sys["pua_base"].as_u64().unwrap() as u32;
        let variants_per_char = sys["variants_per_char"].as_u64().unwrap() as usize;

        result.push(NotationSystem {
            name,
            characters: chars,
            pua_base,
            variants_per_char,
        });
    }

    Ok(result)
}

fn extract_glyph_variants(yaml: &serde_yaml::Value) -> anyhow::Result<GlyphVariantConfig> {
    let gv = &yaml["glyph_variants"];

    Ok(GlyphVariantConfig {
        accidental_types: gv["accidental_types"].as_u64().unwrap() as usize,
        octave_variants: gv["octave_variants"].as_u64().unwrap() as usize,
    })
}
```

#### Day 3: Validation (Minimal)
```rust
// src/fontgen/lib.rs

pub fn validate_spec(spec: &FontSpec) -> anyhow::Result<()> {
    // ONLY validation: PUA ranges don't overlap

    let mut ranges: Vec<(String, u32, u32)> = Vec::new();

    for sys in &spec.notation_systems {
        let start = sys.pua_base;
        let end = start + (sys.characters.len() * sys.variants_per_char) as u32;
        ranges.push((sys.name.clone(), start, end));
    }

    // Check overlaps
    for i in 0..ranges.len() {
        for j in (i + 1)..ranges.len() {
            let (name1, start1, end1) = &ranges[i];
            let (name2, start2, end2) = &ranges[j];

            if !(end1 <= *start2 || end2 <= *start1) {
                anyhow::bail!(
                    "PUA overlap: {} (0x{:X}-0x{:X}) overlaps {} (0x{:X}-0x{:X})",
                    name1, start1, end1, name2, start2, end2
                );
            }
        }
    }

    // Check variants_per_char matches formula
    let expected = spec.glyph_variants.accidental_types * spec.glyph_variants.octave_variants;
    for sys in &spec.notation_systems {
        if sys.variants_per_char != expected {
            anyhow::bail!(
                "System {}: variants_per_char is {} but should be {} × {} = {}",
                sys.name, sys.variants_per_char,
                spec.glyph_variants.accidental_types,
                spec.glyph_variants.octave_variants,
                expected
            );
        }
    }

    Ok(())
}
```

#### Day 4: JSON Emitter + build.rs Integration
```rust
// src/fontgen/lib.rs

pub fn emit_fontspec_json(spec: &FontSpec, path: &str) -> anyhow::Result<()> {
    let json = serde_json::to_string_pretty(spec)?;
    fs::write(path, json)?;
    Ok(())
}

// Main pipeline (called by build.rs)
pub fn generate_fontspec() -> anyhow::Result<()> {
    println!("cargo:rerun-if-changed=tools/fontgen/atoms.yaml");

    let spec = load_atoms_yaml("tools/fontgen/atoms.yaml")?;
    validate_spec(&spec)?;
    emit_fontspec_json(&spec, "static/fontspec.json")?;

    Ok(())
}
```

```rust
// build.rs (updated)

fn main() {
    // Load and validate atoms.yaml
    let atoms_path = PathBuf::from("tools/fontgen/atoms.yaml");
    println!("cargo:rerun-if-changed=tools/fontgen/atoms.yaml");

    // Generate fontspec.json (NEW)
    if let Err(e) = editor_fontgen::generate_fontspec() {
        eprintln!("ERROR generating fontspec.json: {}", e);
        std::process::exit(1);
    }

    // Existing: Generate font constants with new per-system architecture
    // ... (existing code unchanged)
}
```

**Golden Test**:
```rust
// src/fontgen/tests.rs

#[test]
fn test_roundtrip_atoms_yaml() {
    let spec = load_atoms_yaml("tools/fontgen/atoms.yaml").unwrap();
    validate_spec(&spec).unwrap();

    // Verify structure
    assert_eq!(spec.notation_systems.len(), 4);
    assert_eq!(spec.glyph_variants.accidental_types, 5);
    assert_eq!(spec.glyph_variants.octave_variants, 5);

    // Emit and reload
    emit_fontspec_json(&spec, "/tmp/test_fontspec.json").unwrap();

    let json_content = fs::read_to_string("/tmp/test_fontspec.json").unwrap();
    let reloaded: FontSpec = serde_json::from_str(&json_content).unwrap();

    assert_eq!(spec.notation_systems.len(), reloaded.notation_systems.len());
}

#[test]
fn test_pua_overlap_detection() {
    let mut spec = load_atoms_yaml("tools/fontgen/atoms.yaml").unwrap();

    // Create artificial overlap
    spec.notation_systems[1].pua_base = spec.notation_systems[0].pua_base + 50;

    let result = validate_spec(&spec);
    assert!(result.is_err());
    assert!(result.unwrap_err().to_string().contains("overlap"));
}
```

---

### Week 2: Python Consumes JSON (2-3 days)

#### Day 1: Remove YAML Parsing
```python
# tools/fontgen/generate.py

# OLD (DELETE ~400 lines):
# def load_spec_from_yaml(atoms_path):
#     config = yaml.safe_load(open(atoms_path))
#     notation_systems = config.get('notation_systems', [])
#     ...

# NEW (ADD ~20 lines):
def load_fontspec(path='static/fontspec.json'):
    """Load fontspec.json generated by Rust"""
    if not os.path.exists(path):
        print(f"ERROR: {path} not found")
        print("Run: cargo build (fontspec.json generated automatically)")
        sys.exit(1)

    with open(path) as f:
        return json.load(f)

def main():
    spec = load_fontspec()

    # Use spec directly
    for system in spec['notation_systems']:
        create_system_glyphs(font, system)
```

#### Day 2: Update Glyph Creation
```python
def create_system_glyphs(font, system):
    """Create glyphs for a notation system using fontspec"""
    name = system['name']
    characters = [c for c in system['characters']]  # ['1', '2', ..., '7']
    pua_base = system['pua_base']                    # 0xE100
    variants_per_char = system['variants_per_char']  # 25

    for char_idx, char in enumerate(characters):
        for variant_idx in range(variants_per_char):
            cp = pua_base + (char_idx * variants_per_char) + variant_idx
            create_single_glyph(font, char, cp, variant_idx)

def create_single_glyph(font, base_char, codepoint, variant_idx):
    """Create a single glyph variant"""
    # Python hardcodes accidental logic (no spec needed)
    accidental_idx = variant_idx // 5   # 0-4: none, sharp, flat, double-sharp, double-flat
    octave_idx = variant_idx % 5        # 0-4: octave variants

    glyph = font.createChar(codepoint, f"{base_char}_v{variant_idx}")
    # ... build glyph based on accidental_idx and octave_idx
```

#### Day 3: Test & Verify
```python
# tools/fontgen/test_generate.py (NEW)

def test_fontspec_loads():
    """Test that fontspec.json loads correctly"""
    spec = load_fontspec('static/fontspec.json')

    assert 'notation_systems' in spec
    assert 'glyph_variants' in spec
    assert len(spec['notation_systems']) == 4
    assert spec['glyph_variants']['accidental_types'] == 5

def test_font_generation():
    """Test that font generates without errors"""
    result = subprocess.run(
        ['python3', 'tools/fontgen/generate.py', '--validate-only'],
        capture_output=True,
    )
    assert result.returncode == 0

def test_glyph_count():
    """Test that font has correct number of glyphs"""
    # Generate font
    subprocess.run(['make', 'fonts'], check=True)

    # Load mapping JSON
    with open('static/fonts/NotationFont-map.json') as f:
        mapping = json.load(f)

    # Verify count: 47 base chars
    assert len(mapping['notes']) == 47
```

**Add --validate-only flag**:
```python
# tools/fontgen/generate.py

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--validate-only', action='store_true',
                        help='Validate fontspec.json without generating font')
    args = parser.parse_args()

    spec = load_fontspec()
    print(f"✓ Loaded fontspec.json: {len(spec['notation_systems'])} systems")

    if args.validate_only:
        print("✓ Validation passed")
        return

    # Generate font
    font = build_font(spec)
    # ...
```

---

## What Gets Deleted

### From Python (~400 lines removed)
```python
# DELETE: All YAML parsing
def parse_notation_systems(config): ...
def parse_accidental_composites(config): ...
def validate_pua_allocations(config): ...
def extract_glyph_variants(config): ...
# ... etc

# DELETE: All atoms.yaml references
config = yaml.safe_load(open('tools/fontgen/atoms.yaml'))
```

### From Rust (nothing!)
- We're adding Rust code, not removing anything
- build.rs gets a few new lines to call fontgen

---

## Build Integration

### Updated Makefile
```makefile
# Makefile (minimal changes)

# Note: fontspec.json is generated automatically by build.rs
# No manual step needed!

fonts:
	@echo "Generating NotationFont.ttf..."
	@python3 tools/fontgen/generate.py --strict
	@echo "✓ Fonts generated"

build-wasm:
	@echo "Building WASM (generates fontspec.json automatically)..."
	wasm-pack build . --target web --out-dir dist/pkg --no-opt
	@echo "✓ WASM build complete"
	@echo "✓ fontspec.json generated in static/"

build: build-wasm fonts build-js build-css
	@echo "Build complete!"
```

**No changes needed** - fontspec.json is generated during `cargo build` automatically!

---

## Testing Strategy

### 3 Golden Tests (Total)

**Test 1: Rust Roundtrip**
```rust
#[test]
fn roundtrip() {
    let spec = load_atoms_yaml("tools/fontgen/atoms.yaml").unwrap();
    validate_spec(&spec).unwrap();
    emit_fontspec_json(&spec, "/tmp/test.json").unwrap();
    let reloaded: FontSpec = serde_json::from_str(
        &fs::read_to_string("/tmp/test.json").unwrap()
    ).unwrap();
    assert_eq!(spec.notation_systems.len(), reloaded.notation_systems.len());
}
```

**Test 2: Python Loads JSON**
```python
def test_fontspec_loads():
    subprocess.run(['cargo', 'build'], check=True)  # Generate fontspec.json
    spec = load_fontspec('static/fontspec.json')
    assert len(spec['notation_systems']) == 4
```

**Test 3: Font Builds**
```bash
# Integration test
make fonts
test -f static/fonts/NotationFont.ttf || exit 1
test -f static/fonts/NotationFont-map.json || exit 1
echo "✓ Font generation works with fontspec.json"
```

**That's it.** No test matrix, no comprehensive coverage. Just verify the pipeline works.

---

## Timeline

| Day | Task | Deliverable |
|-----|------|-------------|
| **Day 1** | Module setup + FontSpec structs | `src/fontgen/lib.rs` compiles |
| **Day 2** | atoms.yaml loader | `load_atoms_yaml()` works |
| **Day 3** | Validation + emitter | `validate_spec()` + `emit_fontspec_json()` |
| **Day 4** | build.rs integration | fontspec.json auto-generated |
| **Day 5** | Remove Python YAML parsing | -400 lines |
| **Day 6** | Update glyph creation | Python uses fontspec.json |
| **Day 7** | Tests + verification | All tests pass |

**Total: 7 days (1.5 weeks max)**

---

## Success Criteria

✅ **Week 1 Complete When**:
- `cargo build` generates `static/fontspec.json`
- fontspec.json contains 4 notation systems
- Rust tests pass (roundtrip + overlap detection)

✅ **Week 2 Complete When**:
- `python3 generate.py --validate-only` returns 0
- Font generation works: `make fonts` succeeds
- Font has 47 base chars, 1175 note glyphs, 14 symbols
- Python YAML parsing code deleted (~400 lines)

✅ **MVP Complete When**:
- All existing E2E tests pass (no regressions)
- fontspec.json checked into git
- atoms.yaml still exists (human-edited spec)
- Python never touches atoms.yaml

---

## What We're NOT Doing (Save for v2)

| Feature | Why Skip |
|---------|----------|
| `AccidentalType` in spec | Python hardcodes sharp/flat/etc (works fine) |
| PUA blocks array | Derived from notation_systems (redundant) |
| Source fonts in spec | Python has paths hardcoded (no need to change) |
| Extensive validation | PUA overlaps is 90% of bugs |
| CLI tool | build.rs integration is simpler |
| Comprehensive tests | 3 golden tests are enough |
| Documentation | Write after it works |
| fontspec v2/v3 | YAGNI - start with v1 only |

---

## Code Size Summary

| Module | Before | After | Change |
|--------|--------|-------|--------|
| **Rust** | 0 lines | ~200 lines | **+200** |
| **Python YAML parsing** | ~400 lines | 0 lines | **-400** |
| **Python JSON loading** | 0 lines | ~20 lines | **+20** |
| **Net change** | - | - | **-180 lines** |

**Complexity**: -66% (massive simplification)

---

## Example fontspec.json (Minimal)

```json
{
  "notation_systems": [
    {
      "name": "number",
      "characters": ["1", "2", "3", "4", "5", "6", "7"],
      "pua_base": 57600,
      "variants_per_char": 25
    },
    {
      "name": "western",
      "characters": ["C", "D", "E", "F", "G", "A", "B", "c", "d", "e", "f", "g", "a", "b"],
      "pua_base": 57856,
      "variants_per_char": 25
    },
    {
      "name": "sargam",
      "characters": ["S", "r", "R", "g", "G", "m", "M", "P", "d", "D", "n", "N"],
      "pua_base": 58368,
      "variants_per_char": 25
    },
    {
      "name": "doremi",
      "characters": ["d", "r", "m", "f", "s", "l", "t", "D", "R", "M", "F", "S", "L", "T"],
      "pua_base": 58880,
      "variants_per_char": 25
    }
  ],
  "glyph_variants": {
    "accidental_types": 5,
    "octave_variants": 5
  }
}
```

**That's the entire spec.** ~40 lines of JSON. Everything else is derived.

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Breaking font generation | Keep Python YAML parsing in parallel for 1 week, compare outputs byte-for-byte |
| Build.rs errors | Emit clear error messages, fail fast |
| JSON format drift | Version field (unused now, but room to grow) |
| Python can't read JSON | Test in Week 2 Day 1, fix immediately |

---

## Next Steps (Immediate)

**Step 1**: Create module structure
```bash
mkdir -p src/fontgen
touch src/fontgen/lib.rs
touch src/fontgen/tests.rs
```

**Step 2**: Add dependencies
```toml
# Cargo.toml
[dependencies]
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
serde_yaml = "0.9"
anyhow = "1.0"
```

**Step 3**: Implement FontSpec structs (copy from above)

**Step 4**: Implement `load_atoms_yaml()` (copy from above)

**Step 5**: Implement `validate_spec()` (copy from above)

**Step 6**: Implement `emit_fontspec_json()` (copy from above)

**Step 7**: Update build.rs to call `generate_fontspec()`

**Step 8**: Run `cargo build` and verify `static/fontspec.json` exists

**Step 9**: Update generate.py to load fontspec.json

**Step 10**: Run `make fonts` and verify it works

---

## FAQ

**Q: What if I need to add a new notation system later?**
A: Just edit atoms.yaml, add the system. Rust will validate and emit it automatically.

**Q: What about accidental_types? Won't I need them eventually?**
A: Maybe in v2. For now, Python knows sharp = variant_idx // 5 == 1. That's fine.

**Q: Why not use a CLI tool instead of build.rs?**
A: Fewer moving parts. One `cargo build` does everything. Less to remember.

**Q: What if fontspec.json gets out of sync with atoms.yaml?**
A: Impossible. fontspec.json is regenerated on every `cargo build`. Delete it and rebuild.

**Q: Should I check fontspec.json into git?**
A: Yes. It's a build artifact but also serves as documentation of what Python expects.

---

**End of Minimal MVP Plan**
