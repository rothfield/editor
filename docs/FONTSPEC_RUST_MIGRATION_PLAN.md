# Rust Source of Truth Architecture - Font Generation Migration Plan

**Status**: Proposed
**Timeline**: 6-7 weeks
**Goal**: Move from Python-centric font generation to Rust as single source of truth

---

## Executive Summary

Currently, `atoms.yaml` is parsed directly by both Rust (`build.rs`) and Python (`generate.py`), leading to potential inconsistencies. This plan proposes:

1. **Rust becomes the authoritative validator** of `atoms.yaml`
2. **Rust emits `fontspec.json`** as canonical specification
3. **Python consumes `fontspec.json`** (no longer parses YAML directly)
4. **Guaranteed consistency** between Rust lookups and Python font generation

**Benefits**:
- Single source of truth (Rust validates, emits spec)
- Compile-time validation of notation systems
- Simplified Python code (~1200 → ~400 lines)
- Impossible to have out-of-sync specifications
- Easy extensibility (add notation systems without code changes)

---

## Current Architecture (Problems)

```
atoms.yaml
    ├─→ build.rs (parses YAML, generates Rust constants)
    │   └─→ WASM exports getFontConfig()
    │
    └─→ generate.py (parses YAML, generates font)
        └─→ NotationFont.ttf + NotationFont-map.json
```

**Issues**:
- Two parsers for same YAML file
- No validation that Rust and Python agree
- Hard to maintain consistency across systems
- Python has complex YAML parsing logic (~400 lines)

---

## Proposed Architecture (Solution)

```
atoms.yaml
    ↓
Rust FontGen Module (NEW)
    ├─→ Parse & validate atoms.yaml
    ├─→ Emit fontspec.json (canonical spec)
    └─→ Used by build.rs for WASM constants
        ↓
fontspec.json (authoritative)
    ↓
generate.py (refactored)
    └─→ Read fontspec.json
    └─→ Generate NotationFont.ttf
```

**Key Principle**:
> atoms.yaml is human-written spec
> fontspec.json is machine-validated canonical spec
> Everything downstream consumes fontspec.json

---

## Phase 1: Rust FontGen Module (Weeks 1-2)

### 1.1 Module Structure

```
src/fontgen/
├── lib.rs              # Main module entry point
├── spec.rs             # FontSpec data structures
├── loader.rs           # atoms.yaml parser
├── validator.rs        # Validation logic
├── emitter.rs          # JSON emission
├── tests/
│   ├── spec_tests.rs
│   ├── loader_tests.rs
│   ├── validator_tests.rs
│   └── emitter_tests.rs
└── fixtures/
    ├── valid_atoms.yaml
    └── invalid_atoms.yaml
```

### 1.2 Core Data Structures

```rust
// src/fontgen/spec.rs

/// Complete font specification (emitted as fontspec.json)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FontSpec {
    pub version: String,
    pub notation_systems: Vec<NotationSystem>,
    pub accidental_types: Vec<AccidentalType>,
    pub pua_blocks: Vec<PUABlock>,
    pub glyph_variants: GlyphVariantConfig,
    pub source_fonts: SourceFonts,
}

/// A notation system (Number, Western, Sargam, Doremi)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NotationSystem {
    pub name: String,
    pub display_name: String,
    pub description: String,
    pub characters: Vec<char>,
    pub pua_base: u32,
    pub variants_per_char: usize,
    pub total_glyphs: usize,
    pub allowed_accidentals: Vec<String>,
}

/// An accidental type (sharp, flat, half-sharp, etc.)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccidentalType {
    pub name: String,
    pub label: String,
    pub symbol_codepoint: Option<u32>,
    pub draw_slash: bool,
    pub pua_range: PUARange,
    pub notes: Option<String>,
}

/// PUA (Private Use Area) allocation block
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PUABlock {
    pub name: String,
    pub start: u32,
    pub end: u32,
    pub glyph_count: usize,
    pub description: String,
}

/// Glyph variant configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GlyphVariantConfig {
    pub count_per_character: usize,
    pub accidental_types: usize,
    pub octave_variants: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PUARange {
    pub start: u32,
    pub end: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SourceFonts {
    pub base_font: FontSource,
    pub music_symbols_font: FontSource,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FontSource {
    pub path: String,
    pub name: String,
    pub version: String,
}
```

### 1.3 Validation Rules (Comprehensive)

```rust
// src/fontgen/validator.rs

pub fn validate_spec(spec: &FontSpec) -> Result<(), Vec<ValidationError>> {
    let mut errors = vec![];

    // 1. Character count validation
    validate_character_counts(&spec.notation_systems, &mut errors);

    // 2. PUA allocation validation
    validate_pua_allocations(&spec.pua_blocks, &mut errors);

    // 3. Accidental symbol validation
    validate_accidental_symbols(&spec.accidental_types, &mut errors);

    // 4. Variant structure validation
    validate_variant_structure(&spec.glyph_variants, &spec.notation_systems, &mut errors);

    // 5. Cross-system consistency
    validate_consistency(&spec.notation_systems, &mut errors);

    if errors.is_empty() {
        Ok(())
    } else {
        Err(errors)
    }
}

fn validate_character_counts(systems: &[NotationSystem], errors: &mut Vec<ValidationError>) {
    let expected_counts = [
        ("number", 7),
        ("western", 14),
        ("sargam", 12),
        ("doremi", 14),
    ];

    for (name, expected) in &expected_counts {
        if let Some(system) = systems.iter().find(|s| s.name == *name) {
            if system.characters.len() != *expected {
                errors.push(ValidationError::InvalidCharacterCount {
                    system: name.to_string(),
                    expected: *expected,
                    actual: system.characters.len(),
                });
            }
        }
    }
}

fn validate_pua_allocations(blocks: &[PUABlock], errors: &mut Vec<ValidationError>) {
    // Check for overlaps
    for i in 0..blocks.len() {
        for j in (i + 1)..blocks.len() {
            if ranges_overlap(blocks[i].start, blocks[i].end, blocks[j].start, blocks[j].end) {
                errors.push(ValidationError::PUAOverlap {
                    block1: blocks[i].name.clone(),
                    range1: (blocks[i].start, blocks[i].end),
                    block2: blocks[j].name.clone(),
                    range2: (blocks[j].start, blocks[j].end),
                });
            }
        }
    }

    // Check PUA stays within valid range (0xE000 - 0xF8FF)
    for block in blocks {
        if block.start < 0xE000 || block.end > 0xF8FF {
            errors.push(ValidationError::PUAOutOfRange {
                block: block.name.clone(),
                range: (block.start, block.end),
            });
        }
    }
}

fn validate_accidental_symbols(accidentals: &[AccidentalType], errors: &mut Vec<ValidationError>) {
    for acc in accidentals {
        if let Some(cp) = acc.symbol_codepoint {
            // Validate symbol codepoint is in valid Unicode range
            if cp > 0x10FFFF {
                errors.push(ValidationError::InvalidCodepoint {
                    accidental: acc.name.clone(),
                    codepoint: cp,
                });
            }
        } else if !acc.draw_slash {
            // Accidentals without symbols must have draw_slash=true
            errors.push(ValidationError::MissingSymbol {
                accidental: acc.name.clone(),
            });
        }
    }
}

fn validate_variant_structure(
    config: &GlyphVariantConfig,
    systems: &[NotationSystem],
    errors: &mut Vec<ValidationError>,
) {
    let expected_variants = config.accidental_types * config.octave_variants;

    for system in systems {
        if system.variants_per_char != expected_variants {
            errors.push(ValidationError::VariantMismatch {
                system: system.name.clone(),
                expected: expected_variants,
                actual: system.variants_per_char,
            });
        }
    }
}

#[derive(Debug, Clone)]
pub enum ValidationError {
    InvalidCharacterCount { system: String, expected: usize, actual: usize },
    PUAOverlap { block1: String, range1: (u32, u32), block2: String, range2: (u32, u32) },
    PUAOutOfRange { block: String, range: (u32, u32) },
    InvalidCodepoint { accidental: String, codepoint: u32 },
    MissingSymbol { accidental: String },
    VariantMismatch { system: String, expected: usize, actual: usize },
}
```

### 1.4 atoms.yaml Loader

```rust
// src/fontgen/loader.rs

use serde_yaml;
use std::fs;
use std::path::Path;

pub fn load_atoms_yaml<P: AsRef<Path>>(path: P) -> Result<FontSpec, LoadError> {
    let contents = fs::read_to_string(path)
        .map_err(|e| LoadError::FileRead(e))?;

    let raw_config: serde_yaml::Value = serde_yaml::from_str(&contents)
        .map_err(|e| LoadError::YamlParse(e))?;

    parse_config(raw_config)
}

fn parse_config(config: serde_yaml::Value) -> Result<FontSpec, LoadError> {
    let notation_systems = parse_notation_systems(&config)?;
    let accidental_types = parse_accidental_types(&config)?;
    let pua_blocks = parse_pua_blocks(&config)?;
    let glyph_variants = parse_glyph_variants(&config)?;
    let source_fonts = parse_source_fonts(&config)?;

    Ok(FontSpec {
        version: "1.0".to_string(),
        notation_systems,
        accidental_types,
        pua_blocks,
        glyph_variants,
        source_fonts,
    })
}

fn parse_notation_systems(config: &serde_yaml::Value) -> Result<Vec<NotationSystem>, LoadError> {
    let systems_yaml = config
        .get("notation_systems")
        .ok_or(LoadError::MissingField("notation_systems"))?;

    let systems_array = systems_yaml
        .as_sequence()
        .ok_or(LoadError::InvalidType("notation_systems", "array"))?;

    systems_array.iter()
        .map(|sys| parse_single_system(sys))
        .collect()
}

fn parse_single_system(sys: &serde_yaml::Value) -> Result<NotationSystem, LoadError> {
    let name = sys.get("system_name")
        .and_then(|v| v.as_str())
        .ok_or(LoadError::MissingField("system_name"))?
        .to_string();

    let display_name = sys.get("display_name")
        .and_then(|v| v.as_str())
        .ok_or(LoadError::MissingField("display_name"))?
        .to_string();

    let description = sys.get("description")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let characters = parse_characters(sys)?;

    let pua_base = sys.get("pua_base")
        .and_then(|v| v.as_u64())
        .ok_or(LoadError::MissingField("pua_base"))? as u32;

    let variants_per_char = sys.get("variants_per_char")
        .and_then(|v| v.as_u64())
        .ok_or(LoadError::MissingField("variants_per_char"))? as usize;

    let total_glyphs = characters.len() * variants_per_char;

    let allowed_accidentals = parse_allowed_accidentals(sys)?;

    Ok(NotationSystem {
        name,
        display_name,
        description,
        characters,
        pua_base,
        variants_per_char,
        total_glyphs,
        allowed_accidentals,
    })
}

#[derive(Debug)]
pub enum LoadError {
    FileRead(std::io::Error),
    YamlParse(serde_yaml::Error),
    MissingField(&'static str),
    InvalidType(&'static str, &'static str),
}
```

### 1.5 fontspec.json Emitter

```rust
// src/fontgen/emitter.rs

use serde_json;
use std::fs;
use std::path::Path;

pub fn emit_fontspec_json<P: AsRef<Path>>(
    spec: &FontSpec,
    output_path: P,
) -> Result<(), EmitError> {
    let json = serde_json::to_string_pretty(spec)
        .map_err(|e| EmitError::JsonSerialization(e))?;

    fs::write(output_path, json)
        .map_err(|e| EmitError::FileWrite(e))?;

    Ok(())
}

#[derive(Debug)]
pub enum EmitError {
    JsonSerialization(serde_json::Error),
    FileWrite(std::io::Error),
}
```

### 1.6 CLI Tool for Testing

```rust
// src/bin/fontgen.rs

use editor_fontgen::{load_atoms_yaml, validate_spec, emit_fontspec_json};
use std::env;
use std::process;

fn main() {
    let args: Vec<String> = env::args().collect();

    if args.len() < 2 {
        eprintln!("Usage: fontgen <atoms.yaml>");
        process::exit(1);
    }

    let atoms_path = &args[1];

    // Load atoms.yaml
    println!("Loading atoms.yaml from: {}", atoms_path);
    let spec = match load_atoms_yaml(atoms_path) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("Error loading atoms.yaml: {:?}", e);
            process::exit(1);
        }
    };

    // Validate
    println!("Validating font specification...");
    if let Err(errors) = validate_spec(&spec) {
        eprintln!("Validation errors:");
        for error in errors {
            eprintln!("  - {:?}", error);
        }
        process::exit(1);
    }

    println!("✓ Validation passed");

    // Emit fontspec.json
    let output_path = "static/fontspec.json";
    println!("Emitting fontspec.json to: {}", output_path);
    if let Err(e) = emit_fontspec_json(&spec, output_path) {
        eprintln!("Error emitting fontspec.json: {:?}", e);
        process::exit(1);
    }

    println!("✓ fontspec.json generated successfully");
    println!("\nSummary:");
    println!("  Notation systems: {}", spec.notation_systems.len());
    println!("  Accidental types: {}", spec.accidental_types.len());
    println!("  PUA blocks: {}", spec.pua_blocks.len());
    println!("  Total characters: {}", spec.notation_systems.iter().map(|s| s.characters.len()).sum::<usize>());
}
```

### 1.7 Unit Tests

```rust
// src/fontgen/tests/spec_tests.rs

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_fontspec_serialization() {
        let spec = FontSpec {
            version: "1.0".to_string(),
            notation_systems: vec![],
            accidental_types: vec![],
            pua_blocks: vec![],
            glyph_variants: GlyphVariantConfig {
                count_per_character: 25,
                accidental_types: 5,
                octave_variants: 5,
            },
            source_fonts: SourceFonts {
                base_font: FontSource {
                    path: "test.ttf".to_string(),
                    name: "Test".to_string(),
                    version: "1.0".to_string(),
                },
                music_symbols_font: FontSource {
                    path: "test_music.ttf".to_string(),
                    name: "Test Music".to_string(),
                    version: "1.0".to_string(),
                },
            },
        };

        let json = serde_json::to_string(&spec).unwrap();
        let deserialized: FontSpec = serde_json::from_str(&json).unwrap();

        assert_eq!(spec.version, deserialized.version);
    }

    #[test]
    fn test_load_valid_atoms_yaml() {
        let spec = load_atoms_yaml("src/fontgen/fixtures/valid_atoms.yaml").unwrap();
        assert_eq!(spec.notation_systems.len(), 4);
    }

    #[test]
    fn test_validate_character_counts() {
        // Test that validation catches incorrect character counts
        let mut spec = create_test_spec();
        spec.notation_systems[0].characters = vec!['1', '2', '3']; // Should be 7

        let result = validate_spec(&spec);
        assert!(result.is_err());
    }

    #[test]
    fn test_validate_pua_overlaps() {
        let mut spec = create_test_spec();
        spec.pua_blocks.push(PUABlock {
            name: "overlap".to_string(),
            start: 0xE100,
            end: 0xE150,
            glyph_count: 80,
            description: "Overlapping block".to_string(),
        });

        let result = validate_spec(&spec);
        assert!(result.is_err());
    }
}
```

---

## Phase 2: Python Rewrite (Weeks 2-4)

### 2.1 New Python Architecture

**Before** (atoms.yaml direct parse):
```python
# generate.py (OLD)
def load_spec_from_yaml(atoms_path):
    config = yaml.safe_load(open(atoms_path))
    notation_systems = config.get('notation_systems', [])
    accidental_composites = config.get('accidental_composites', {})
    # ... ~400 lines of YAML parsing
    return spec
```

**After** (fontspec.json consumption):
```python
# generate.py (NEW)
def load_spec_from_json(fontspec_path):
    fontspec = json.load(open(fontspec_path))
    # Direct consumption, no parsing needed
    return fontspec

def main():
    # Expect fontspec.json to exist (generated by Rust)
    if not os.path.exists('static/fontspec.json'):
        print("ERROR: fontspec.json not found. Run: cargo run --bin fontgen tools/fontgen/atoms.yaml")
        sys.exit(1)

    spec = load_spec_from_json('static/fontspec.json')
    font = build_font(spec)
    # ...
```

### 2.2 Refactored generate.py Structure

```python
# tools/fontgen/generate.py (NEW STRUCTURE)

import json
import fontforge
from dataclasses import dataclass
from typing import List, Optional

@dataclass
class FontSpec:
    """Python representation of fontspec.json (matches Rust)"""
    version: str
    notation_systems: List[dict]
    accidental_types: List[dict]
    pua_blocks: List[dict]
    glyph_variants: dict
    source_fonts: dict

def load_fontspec(path: str = 'static/fontspec.json') -> FontSpec:
    """Load fontspec.json (authoritative spec from Rust)"""
    with open(path) as f:
        data = json.load(f)

    return FontSpec(
        version=data['version'],
        notation_systems=data['notation_systems'],
        accidental_types=data['accidental_types'],
        pua_blocks=data['pua_blocks'],
        glyph_variants=data['glyph_variants'],
        source_fonts=data['source_fonts'],
    )

def build_font(spec: FontSpec) -> fontforge.font:
    """Build NotationFont from fontspec"""
    # Load base font
    font = fontforge.open(spec.source_fonts['base_font']['path'])

    # Import music symbols
    import_music_symbols(font, spec)

    # Create note glyphs
    create_note_glyphs(font, spec)

    # Create accidental composites
    create_accidental_composites(font, spec)

    return font

def create_note_glyphs(font: fontforge.font, spec: FontSpec):
    """Create all note glyphs based on fontspec"""
    for system in spec.notation_systems:
        create_system_glyphs(font, system, spec.glyph_variants)

def create_accidental_composites(font: fontforge.font, spec: FontSpec):
    """Create accidental composite glyphs"""
    for acc_type in spec.accidental_types:
        if acc_type.get('draw_slash', False):
            create_slashed_composites(font, acc_type, spec)
        else:
            create_standard_composites(font, acc_type, spec)

def create_slashed_composites(font: fontforge.font, acc_type: dict, spec: FontSpec):
    """Create composites with drawn slashes (half-sharp, half-flat)"""
    slash_renderer = SlashRenderer(
        stroke_weight=acc_type.get('slash_weight', 30),
        extension=acc_type.get('slash_extension', 0.15),
    )

    all_chars = get_all_characters(spec.notation_systems)
    pua_start = acc_type['pua_range']['start']
    symbol_cp = acc_type['symbol_codepoint']

    for i, char in enumerate(all_chars):
        cp = pua_start + i
        composite = font.createChar(cp, f"{char}_{acc_type['name']}")
        composite.clear()

        # Add base character
        composite.addReference(font[ord(char)].glyphname, (1, 0, 0, 1, 0, 0))

        # Add accidental symbol
        acc_glyph = font[symbol_cp]
        # ... positioning logic

        # Draw slash
        slash_renderer.draw_slash(composite, acc_glyph.boundingBox())

class SlashRenderer:
    """Robust slash drawing for half-sharp/half-flat"""

    def __init__(self, stroke_weight: int = 30, extension: float = 0.15):
        self.stroke_weight = stroke_weight
        self.extension = extension

    def draw_slash(self, glyph: fontforge.glyph, symbol_bbox: tuple):
        """Draw diagonal slash through accidental symbol"""
        min_x, min_y, max_x, max_y = symbol_bbox

        # Calculate slash endpoints
        start_x = min_x - (max_x - min_x) * self.extension
        start_y = max_y + (max_y - min_y) * self.extension
        end_x = max_x + (max_x - min_x) * self.extension
        end_y = min_y - (max_y - min_y) * self.extension

        # Draw filled rectangle for slash
        half_weight = self.stroke_weight / 2

        # Perpendicular vector for width
        import math
        perp_dx = -half_weight / math.sqrt(2)
        perp_dy = half_weight / math.sqrt(2)

        # Four corners of slash rectangle
        pen = glyph.glyphPen()
        pen.moveTo((int(start_x + perp_dx), int(start_y + perp_dy)))
        pen.lineTo((int(start_x - perp_dx), int(start_y - perp_dy)))
        pen.lineTo((int(end_x - perp_dx), int(end_y - perp_dy)))
        pen.lineTo((int(end_x + perp_dx), int(end_y + perp_dy)))
        pen.closePath()

def main():
    """Main entry point"""
    import argparse

    parser = argparse.ArgumentParser(description='Generate NotationFont from fontspec.json')
    parser.add_argument('--fontspec', default='static/fontspec.json', help='Path to fontspec.json')
    parser.add_argument('--strict', action='store_true', help='Fail on any errors')
    args = parser.parse_args()

    # Check fontspec.json exists
    if not os.path.exists(args.fontspec):
        print(f"ERROR: {args.fontspec} not found")
        print("Run: cargo run --bin fontgen tools/fontgen/atoms.yaml")
        sys.exit(1)

    # Load spec
    print(f"Loading fontspec from: {args.fontspec}")
    spec = load_fontspec(args.fontspec)

    # Build font
    print("Building NotationFont...")
    font = build_font(spec)

    # Save
    output_path = 'static/fonts/NotationFont.ttf'
    font.generate(output_path)
    print(f"✓ Font saved: {output_path}")

    # Generate mapping JSON
    mapping = generate_mapping(font, spec)
    with open('static/fonts/NotationFont-map.json', 'w') as f:
        json.dump(mapping, f, indent=2)
    print(f"✓ Mapping saved: static/fonts/NotationFont-map.json")

if __name__ == '__main__':
    main()
```

### 2.3 Code Size Comparison

| Module | Before | After | Change |
|--------|--------|-------|--------|
| YAML parsing | ~400 lines | 0 lines | **-100%** |
| Spec validation | ~150 lines | 0 lines (moved to Rust) | **-100%** |
| Glyph creation | ~500 lines | ~400 lines (simplified) | **-20%** |
| Total | ~1200 lines | ~400 lines | **-66%** |

---

## Phase 3: Integration & Testing (Weeks 3-5)

### 3.1 Build System Integration

**Updated Makefile**:
```makefile
# Makefile

# Generate fontspec.json from atoms.yaml (Rust validator)
fontspec:
	@echo "Generating fontspec.json from atoms.yaml..."
	@cargo run --bin fontgen tools/fontgen/atoms.yaml
	@echo "✓ fontspec.json generated"

# Generate font (requires fontspec.json)
fonts: fontspec
	@echo "Generating NotationFont.ttf from fontspec.json..."
	@python3 tools/fontgen/generate.py --strict
	@echo "✓ Fonts generated"

# Build WASM (uses fontspec.json for validation)
build-wasm: fontspec
	@echo "Building WASM module..."
	wasm-pack build . --target web --out-dir dist/pkg --no-opt
	@echo "✓ WASM build complete"

# Full build pipeline
build: fontspec fonts build-wasm build-js build-css
	@echo "Build complete!"
```

### 3.2 Integration Tests

```rust
// tests/integration/fontspec_consistency.rs

#[test]
fn test_fontspec_matches_atoms_yaml() {
    // Generate fontspec.json from atoms.yaml
    let spec = load_atoms_yaml("tools/fontgen/atoms.yaml").unwrap();
    validate_spec(&spec).unwrap();

    // Emit to temp file
    let temp_path = "/tmp/fontspec_test.json";
    emit_fontspec_json(&spec, temp_path).unwrap();

    // Load back
    let json_content = fs::read_to_string(temp_path).unwrap();
    let loaded_spec: FontSpec = serde_json::from_str(&json_content).unwrap();

    // Verify roundtrip
    assert_eq!(spec.notation_systems.len(), loaded_spec.notation_systems.len());
    assert_eq!(spec.accidental_types.len(), loaded_spec.accidental_types.len());
}

#[test]
fn test_wasm_config_matches_fontspec() {
    // Load fontspec.json
    let fontspec = load_fontspec("static/fontspec.json").unwrap();

    // Load WASM config
    let wasm_config = get_font_config(); // From WASM module

    // Verify they agree
    assert_eq!(fontspec.notation_systems.len(), wasm_config.systems.len());

    for (spec_sys, wasm_sys) in fontspec.notation_systems.iter().zip(wasm_config.systems.iter()) {
        assert_eq!(spec_sys.pua_base, wasm_sys.pua_base);
        assert_eq!(spec_sys.variants_per_char, wasm_sys.variants_per_character);
    }
}
```

```python
# tests/integration/test_fontgen_integration.py

import json
import subprocess

def test_rust_generates_valid_fontspec():
    """Test that Rust fontgen produces valid fontspec.json"""
    # Run Rust fontgen
    result = subprocess.run(
        ['cargo', 'run', '--bin', 'fontgen', 'tools/fontgen/atoms.yaml'],
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0

    # Load fontspec.json
    with open('static/fontspec.json') as f:
        fontspec = json.load(f)

    # Validate structure
    assert 'version' in fontspec
    assert 'notation_systems' in fontspec
    assert len(fontspec['notation_systems']) == 4

def test_python_consumes_fontspec():
    """Test that Python can consume fontspec.json"""
    # Ensure fontspec.json exists
    test_rust_generates_valid_fontspec()

    # Run Python font generator
    result = subprocess.run(
        ['python3', 'tools/fontgen/generate.py', '--validate-only'],
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0
    assert 'fontspec.json' in result.stdout

def test_font_generation_consistency():
    """Test that font generation is deterministic"""
    # Generate font twice
    subprocess.run(['make', 'fonts'], check=True)

    import shutil
    shutil.copy('static/fonts/NotationFont.ttf', '/tmp/font1.ttf')

    subprocess.run(['make', 'fonts'], check=True)

    import filecmp
    assert filecmp.cmp('static/fonts/NotationFont.ttf', '/tmp/font1.ttf')
```

### 3.3 E2E Tests (Playwright)

```javascript
// tests/e2e-pw/tests/fontspec-integration.spec.js

import { test, expect } from '@playwright/test';

test.describe('FontSpec Integration', () => {
  test('fontspec.json loads and matches WASM config', async ({ page }) => {
    await page.goto('/');

    // Wait for WASM to load
    await page.waitForFunction(
      () => window.editor?.wasmModule?.getFontConfig,
      { timeout: 10000 }
    );

    // Load fontspec.json via fetch
    const fontspec = await page.evaluate(async () => {
      const response = await fetch('static/fontspec.json');
      return await response.json();
    });

    // Get WASM config
    const wasmConfig = await page.evaluate(() => {
      return window.editor.wasmModule.getFontConfig();
    });

    // Verify they match
    expect(fontspec.notation_systems.length).toBe(wasmConfig.systems.length);

    for (let i = 0; i < fontspec.notation_systems.length; i++) {
      expect(fontspec.notation_systems[i].pua_base).toBe(wasmConfig.systems[i].pua_base);
      expect(fontspec.notation_systems[i].variants_per_char).toBe(wasmConfig.systems[i].variants_per_character);
    }
  });

  test('accidental composites match fontspec allocation', async ({ page }) => {
    await page.goto('/');

    const fontspec = await page.evaluate(async () => {
      const response = await fetch('static/fontspec.json');
      return await response.json();
    });

    // Check half-sharp and half-flat are in spec
    const halfSharp = fontspec.accidental_types.find(a => a.name === 'half_sharp');
    const halfFlat = fontspec.accidental_types.find(a => a.name === 'half_flat');

    expect(halfSharp).toBeDefined();
    expect(halfSharp.draw_slash).toBe(true);
    expect(halfFlat).toBeDefined();
    expect(halfFlat.draw_slash).toBe(true);
  });
});
```

---

## Phase 4: Migration & Cleanup (Weeks 4-6)

### 4.1 Deprecation Timeline

**Week 4**: Parallel systems running
- Rust validates atoms.yaml → fontspec.json
- Python reads fontspec.json (new)
- Python reads atoms.yaml (old, for comparison)
- Compare outputs, ensure identical

**Week 5**: Switch to fontspec.json only
- Remove atoms.yaml parsing from Python
- All systems use fontspec.json
- Test suite passes 100%

**Week 6**: Final cleanup
- Remove old Python YAML parsing code
- Update documentation
- Announce migration complete

### 4.2 Code Removal Checklist

```python
# tools/fontgen/generate.py - TO BE REMOVED

# ❌ Remove these functions:
def load_spec_from_yaml(atoms_path):  # ~400 lines
def parse_notation_systems(config):   # ~100 lines
def validate_pua_allocations(config): # ~80 lines
def parse_accidental_composites(config): # ~60 lines

# ✅ Keep these functions:
def load_fontspec(path):              # Load JSON spec
def build_font(spec):                 # Generate glyphs
def create_accidental_composites(font, spec):  # Slash drawing
```

### 4.3 Documentation Updates

**New Files**:
- `docs/FONTSPEC_ARCHITECTURE.md` - Complete spec format reference
- `docs/RUST_FONTGEN_GUIDE.md` - Extending Rust fontgen
- `docs/PYTHON_CONSUMER_GUIDE.md` - Using fontspec.json in Python

**Updated Files**:
- `CLAUDE.md` - Update to reflect Rust source of truth
- `tools/fontgen/README.md` - New build instructions
- `FONT_MIGRATION_NOTO_MUSIC.md` - Add fontspec.json section

### 4.4 Git Strategy

```bash
# Week 4: Add new Rust code
git add src/fontgen/
git commit -m "feat: Add Rust fontgen module (atoms.yaml validator)"

# Week 5: Refactor Python
git add tools/fontgen/generate.py
git commit -m "refactor: Python consumes fontspec.json instead of atoms.yaml"

# Week 6: Remove old code
git add tools/fontgen/generate.py
git commit -m "cleanup: Remove atoms.yaml parsing from Python"
```

---

## Benefits Analysis

### Code Quality
| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Lines of Code (Python) | 1,200 | 400 | **-66%** |
| Validation Coverage | Manual | Compile-time | **100%** |
| Spec Consistency | Manual sync | Guaranteed | **∞** |
| Error Detection | Runtime | Compile-time | **Early** |

### Developer Experience
- ✅ Add notation system: Edit atoms.yaml → Rust validates → Done
- ✅ Impossible to have out-of-sync Rust/Python
- ✅ Clear error messages from Rust compiler
- ✅ Single command: `make fonts` (handles entire pipeline)

### Maintenance
- ✅ Python code simplified (no YAML parsing complexity)
- ✅ Rust code testable (unit tests for each validation rule)
- ✅ Easy to extend (add new accidental types without code changes)

---

## Risk Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Breaking font generation | Medium | High | Run parallel systems for 2 weeks, byte-compare outputs |
| Rust compilation overhead | Low | Low | FontGen is separate crate, doesn't affect main build |
| JSON format changes | Low | Medium | Version fontspec.json (v1, v2), support multiple versions |
| Team knowledge gap | Medium | Medium | Comprehensive docs, inline comments, pair programming |
| Regression in font quality | Low | High | Visual regression tests, compare 5+ font generations |

---

## Success Metrics

### Phase 1 Complete When:
- ✅ Rust compiles without warnings
- ✅ All unit tests pass (Rust)
- ✅ fontspec.json emitted correctly
- ✅ CLI tool works: `cargo run --bin fontgen atoms.yaml`

### Phase 2 Complete When:
- ✅ Python reads fontspec.json successfully
- ✅ Font generation produces identical output
- ✅ All Python tests pass
- ✅ Slash rendering robust (no visual artifacts)

### Phase 3 Complete When:
- ✅ E2E tests pass (Playwright)
- ✅ Integration tests pass (Rust↔Python↔WASM)
- ✅ Documentation complete
- ✅ Team sign-off

### Phase 4 Complete When:
- ✅ Old Python YAML parsing removed
- ✅ Code review approved
- ✅ Migration guide published
- ✅ All tests green for 1 week

---

## Timeline Summary

| Phase | Duration | Deliverables |
|-------|----------|--------------|
| **Phase 1: Rust FontGen** | 2 weeks | Module compiles, fontspec.json emitted, tests pass |
| **Phase 2: Python Rewrite** | 2 weeks | Python uses fontspec.json, font generation works |
| **Phase 3: Integration** | 1-2 weeks | All tests pass, docs complete |
| **Phase 4: Cleanup** | 1 week | Old code removed, migration complete |

**Total: 6-7 weeks**

---

## Next Steps (Immediate)

1. **Create Rust module structure**:
   ```bash
   mkdir -p src/fontgen/{tests,fixtures}
   touch src/fontgen/{lib.rs,spec.rs,loader.rs,validator.rs,emitter.rs}
   ```

2. **Define FontSpec structures** (spec.rs)

3. **Implement atoms.yaml loader** (loader.rs)

4. **Write unit tests** (tests/)

5. **Create CLI tool** (src/bin/fontgen.rs)

6. **Test fontspec.json emission**

---

## Appendix A: fontspec.json Format

```json
{
  "version": "1.0",
  "notation_systems": [
    {
      "name": "number",
      "display_name": "Number System",
      "description": "Numerical scale degrees (1-7)",
      "characters": ["1", "2", "3", "4", "5", "6", "7"],
      "pua_base": 57600,
      "variants_per_char": 25,
      "total_glyphs": 175,
      "allowed_accidentals": ["none", "sharp", "flat", "double_sharp", "double_flat"]
    }
  ],
  "accidental_types": [
    {
      "name": "sharp",
      "label": "Sharp (♯)",
      "symbol_codepoint": 119088,
      "draw_slash": false,
      "pua_range": {
        "start": 57840,
        "end": 57886
      }
    },
    {
      "name": "half_sharp",
      "label": "Half-sharp (♯⧸)",
      "symbol_codepoint": 119088,
      "draw_slash": true,
      "pua_range": {
        "start": 57904,
        "end": 57950
      },
      "notes": "Sharp symbol with diagonal slash drawn through it"
    }
  ],
  "pua_blocks": [
    {
      "name": "number_system_natural",
      "start": 57600,
      "end": 57774,
      "glyph_count": 175,
      "description": "Number system base glyphs (1-7) with octave variants"
    }
  ],
  "glyph_variants": {
    "count_per_character": 25,
    "accidental_types": 5,
    "octave_variants": 5
  },
  "source_fonts": {
    "base_font": {
      "path": "tools/fontgen/sources/NotoSans-Regular.ttf",
      "name": "Noto Sans",
      "version": "2.x"
    },
    "music_symbols_font": {
      "path": "tools/fontgen/sources/NotoMusic.ttf",
      "name": "Noto Music",
      "version": "2.001"
    }
  }
}
```

---

## Appendix B: Validation Error Examples

```
❌ Validation Error: Invalid character count
  System: number
  Expected: 7 characters
  Actual: 5 characters
  Location: atoms.yaml line 28

❌ Validation Error: PUA overlap detected
  Block 1: western_system (0xE200 - 0xE35D)
  Block 2: sargam_system (0xE300 - 0xE4EF)
  Overlap range: 0xE300 - 0xE35D

❌ Validation Error: PUA out of range
  Block: future_system
  Range: 0xF900 - 0xFA00
  Valid range: 0xE000 - 0xF8FF

✓ All validation checks passed
```

---

**End of Migration Plan**
