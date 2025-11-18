/// Font specification and generation module
///
/// This module defines the canonical FontSpec structures and validation
/// logic for music notation fonts. It's used by build.rs to:
/// 1. Parse and validate atoms.yaml
/// 2. Emit fontspec.json for Python consumption
///
/// The data flow is:
/// 1. atoms.yaml (human-editable specification)
/// 2. Rust fontgen module (validate & emit fontspec.json)
/// 3. Python (load fontspec.json & generate fonts)

pub mod parser;
pub mod emitter;

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// The complete font specification
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FontSpec {
    pub notation_systems: Vec<NotationSystem>,
    pub glyph_variants: GlyphVariantConfig,
}

/// A single notation system (e.g., "number", "western", "sargam", "doremi")
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NotationSystem {
    /// System identifier: "number", "western", "sargam", "doremi"
    pub name: String,

    /// All pitch characters in this system (e.g., ['1','2','3','4','5','6','7'])
    pub characters: Vec<char>,

    /// Base codepoint in Private Use Area (e.g., 0xE100 for Number system)
    pub pua_base: u32,

    /// Total variants per character = accidental_types × octave_variants
    /// This is derived, not stored in atoms.yaml
    pub variants_per_char: usize,
}

/// Glyph variant configuration (same for all notation systems)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GlyphVariantConfig {
    /// Number of accidental variants: none, flat, double-flat, sharp, double-sharp, etc.
    /// This is hardcoded in atoms.yaml and Python's slash drawing logic
    pub accidental_types: usize,

    /// Number of octave variants: typically 5 (0, -2, -1, +1, +2)
    pub octave_variants: usize,
}

/// Validation result with detailed error messages
#[derive(Debug)]
pub struct ValidationResult {
    pub is_valid: bool,
    pub errors: Vec<String>,
    pub warnings: Vec<String>,
}

impl ValidationResult {
    pub fn new() -> Self {
        Self {
            is_valid: true,
            errors: Vec::new(),
            warnings: Vec::new(),
        }
    }

    pub fn add_error(&mut self, msg: String) {
        self.is_valid = false;
        self.errors.push(msg);
    }

    pub fn add_warning(&mut self, msg: String) {
        self.warnings.push(msg);
    }
}

impl FontSpec {
    /// Validate the FontSpec for consistency
    pub fn validate(&self) -> ValidationResult {
        let mut result = ValidationResult::new();

        // Check that all systems have the correct variants_per_char
        let expected_variants = self.glyph_variants.accidental_types * self.glyph_variants.octave_variants;
        for system in &self.notation_systems {
            if system.variants_per_char != expected_variants {
                result.add_error(format!(
                    "System '{}': variants_per_char ({}) != accidental_types ({}) × octave_variants ({})",
                    system.name,
                    system.variants_per_char,
                    self.glyph_variants.accidental_types,
                    self.glyph_variants.octave_variants
                ));
            }
        }

        // Check for PUA overlaps
        let overlap_errors = self.check_pua_overlaps();
        for err in overlap_errors {
            result.add_error(err);
        }

        // Check that system names are unique
        let mut seen_names = HashMap::new();
        for system in &self.notation_systems {
            if let Some(_) = seen_names.insert(system.name.clone(), true) {
                result.add_error(format!("Duplicate system name: '{}'", system.name));
            }
        }

        result
    }

    /// Check if any notation systems have overlapping PUA ranges
    fn check_pua_overlaps(&self) -> Vec<String> {
        let mut errors = Vec::new();
        let mut ranges: Vec<(String, u32, u32)> = Vec::new();

        for system in &self.notation_systems {
            let start = system.pua_base;
            let end = start + (system.characters.len() * system.variants_per_char) as u32 - 1;
            ranges.push((system.name.clone(), start, end));
        }

        // Check all pairs for overlap
        for i in 0..ranges.len() {
            for j in (i + 1)..ranges.len() {
                let (name_i, start_i, end_i) = &ranges[i];
                let (name_j, start_j, end_j) = &ranges[j];

                // Check if ranges overlap
                if !((end_i < start_j) || (end_j < start_i)) {
                    errors.push(format!(
                        "PUA overlap: '{}' (0x{:X}-0x{:X}) overlaps with '{}' (0x{:X}-0x{:X})",
                        name_i, start_i, end_i, name_j, start_j, end_j
                    ));
                }
            }
        }

        errors
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::NamedTempFile;

    fn create_valid_spec() -> FontSpec {
        FontSpec {
            notation_systems: vec![
                NotationSystem {
                    name: "number".to_string(),
                    characters: vec!['1', '2', '3', '4', '5', '6', '7'],
                    pua_base: 0xE100,
                    variants_per_char: 25,
                },
                NotationSystem {
                    name: "western".to_string(),
                    characters: vec!['C', 'D', 'E', 'F', 'G', 'A', 'B'],
                    pua_base: 0xE200,
                    variants_per_char: 25,
                },
            ],
            glyph_variants: GlyphVariantConfig {
                accidental_types: 5,
                octave_variants: 5,
            },
        }
    }

    #[test]
    fn test_fontspec_validation_success() {
        let spec = create_valid_spec();
        let result = spec.validate();
        assert!(result.is_valid);
        assert!(result.errors.is_empty());
    }

    #[test]
    fn test_fontspec_validation_bad_variants() {
        let spec = FontSpec {
            notation_systems: vec![NotationSystem {
                name: "number".to_string(),
                characters: vec!['1', '2', '3', '4', '5', '6', '7'],
                pua_base: 0xE100,
                variants_per_char: 20, // WRONG: should be 25 (5 accidentals × 5 octaves)
            }],
            glyph_variants: GlyphVariantConfig {
                accidental_types: 5,
                octave_variants: 5,
            },
        };

        let result = spec.validate();
        assert!(!result.is_valid);
        assert!(!result.errors.is_empty());
    }

    #[test]
    fn test_pua_overlap_detection() {
        let spec = FontSpec {
            notation_systems: vec![
                NotationSystem {
                    name: "number".to_string(),
                    characters: vec!['1', '2', '3', '4', '5', '6', '7'],
                    pua_base: 0xE100,
                    variants_per_char: 25,
                },
                NotationSystem {
                    name: "western".to_string(),
                    characters: vec!['C', 'D', 'E', 'F', 'G', 'A', 'B'],
                    pua_base: 0xE100, // OVERLAP: same PUA base
                    variants_per_char: 25,
                },
            ],
            glyph_variants: GlyphVariantConfig {
                accidental_types: 5,
                octave_variants: 5,
            },
        };

        let result = spec.validate();
        assert!(!result.is_valid);
        assert!(!result.errors.is_empty());
        assert!(result.errors[0].contains("overlap"));
    }

    #[test]
    fn test_roundtrip_parse_emit() {
        use parser::parse_atoms_yaml;
        use emitter::emit_fontspec_json_string;

        // Create test atoms.yaml
        let mut atoms_file = NamedTempFile::new().unwrap();
        let atoms_content = r#"
notation_systems:
  - system_name: number
    pua_base: 0xE100
    characters:
      - char: "1"
      - char: "2"
  - system_name: western
    pua_base: 0xE200
    characters:
      - char: "C"

glyph_variants:
  accidental_types: 5
  octave_variants: 5
"#;
        atoms_file.write_all(atoms_content.as_bytes()).unwrap();
        atoms_file.flush().unwrap();

        // Parse atoms
        let parsed = parse_atoms_yaml(atoms_file.path()).unwrap();

        // Verify parsing
        assert_eq!(parsed.notation_systems.len(), 2);
        assert_eq!(parsed.notation_systems[0].name, "number");
        assert_eq!(parsed.notation_systems[0].variants_per_char, 25); // auto-calculated

        // Emit JSON
        let json = emit_fontspec_json_string(&parsed).unwrap();

        // Roundtrip: parse JSON back
        let roundtripped: FontSpec = serde_json::from_str(&json).unwrap();

        // Verify roundtrip
        assert_eq!(roundtripped.notation_systems.len(), 2);
        assert_eq!(roundtripped.notation_systems[0].name, "number");
        assert_eq!(roundtripped.notation_systems[0].pua_base, 0xE100);
        assert_eq!(roundtripped.glyph_variants.accidental_types, 5);

        // Validate result
        let result = roundtripped.validate();
        assert!(result.is_valid, "Roundtripped spec failed validation: {:?}", result.errors);
    }
}
