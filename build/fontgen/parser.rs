/// atoms.yaml parser for FontSpec generation
///
/// Parses the atoms.yaml file to extract notation systems and glyph variant
/// configuration, producing a FontSpec that can be validated and serialized.

use super::{FontSpec, NotationSystem, GlyphVariantConfig};
use serde_yaml::Value;
use std::path::Path;
use std::fs;

/// Parse atoms.yaml file and return a FontSpec
pub fn parse_atoms_yaml(path: &Path) -> Result<FontSpec, String> {
    // Read file
    let content = fs::read_to_string(path)
        .map_err(|e| format!("Failed to read atoms.yaml: {}", e))?;

    // Parse YAML
    let atoms: Value = serde_yaml::from_str(&content)
        .map_err(|e| format!("Failed to parse atoms.yaml as YAML: {}", e))?;

    // Extract glyph variants config first (needed to calculate variants_per_char)
    let glyph_variants = extract_glyph_variants(&atoms)?;

    // Extract notation systems (using glyph_variants to calculate variants_per_char)
    let mut notation_systems = extract_notation_systems(&atoms)?;

    // Calculate variants_per_char for each system if not specified
    let expected_variants = glyph_variants.accidental_types * glyph_variants.octave_variants;
    for system in &mut notation_systems {
        if system.variants_per_char == 0 {
            system.variants_per_char = expected_variants;
        }
    }

    Ok(FontSpec {
        notation_systems,
        glyph_variants,
    })
}

/// Extract notation systems from atoms.yaml
fn extract_notation_systems(atoms: &Value) -> Result<Vec<NotationSystem>, String> {
    let systems_value = atoms
        .get("notation_systems")
        .ok_or_else(|| "notation_systems not found in atoms.yaml".to_string())?;

    let systems_seq = systems_value
        .as_sequence()
        .ok_or_else(|| "notation_systems must be a sequence".to_string())?;

    let mut systems = Vec::new();

    for (idx, system_value) in systems_seq.iter().enumerate() {
        let system_name = system_value
            .get("system_name")
            .and_then(|v| v.as_str())
            .ok_or_else(|| format!("System {}: system_name not found", idx))?
            .to_string();

        let pua_base = system_value
            .get("pua_base")
            .and_then(|v| parse_hex_value(v))
            .ok_or_else(|| format!("System {}: pua_base not found or invalid", idx))?;

        // Extract characters
        let characters = system_value
            .get("characters")
            .and_then(|v| v.as_sequence())
            .ok_or_else(|| format!("System {}: characters not found", idx))?
            .iter()
            .enumerate()
            .map(|(char_idx, char_value)| {
                let ch = char_value
                    .get("char")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        format!(
                            "System {}: character {} missing 'char' field",
                            idx, char_idx
                        )
                    })?;
                if ch.len() != 1 {
                    return Err(format!(
                        "System {}: character {} must be a single character, got '{}'",
                        idx, char_idx, ch
                    ));
                }
                Ok(ch.chars().next().unwrap())
            })
            .collect::<Result<Vec<_>, String>>()?;

        // Get variants_per_char if specified in atoms.yaml (fallback: will be calculated)
        let variants_per_char = system_value
            .get("variants_per_char")
            .and_then(|v| v.as_u64())
            .map(|v| v as usize)
            .unwrap_or(0); // 0 means it will be calculated later

        systems.push(NotationSystem {
            name: system_name,
            characters,
            pua_base,
            variants_per_char,
        });
    }

    Ok(systems)
}

/// Extract glyph variants config from atoms.yaml
fn extract_glyph_variants(atoms: &Value) -> Result<GlyphVariantConfig, String> {
    let glyph_variants_value = atoms
        .get("glyph_variants")
        .ok_or_else(|| "glyph_variants not found in atoms.yaml".to_string())?;

    let accidental_types = glyph_variants_value
        .get("accidental_types")
        .and_then(|v| v.as_u64())
        .ok_or_else(|| "glyph_variants.accidental_types not found or not a number".to_string())?
        as usize;

    let octave_variants = glyph_variants_value
        .get("octave_variants")
        .and_then(|v| v.as_u64())
        .ok_or_else(|| "glyph_variants.octave_variants not found or not a number".to_string())?
        as usize;

    Ok(GlyphVariantConfig {
        accidental_types,
        octave_variants,
    })
}

/// Parse hexadecimal number from YAML value
fn parse_hex_value(value: &Value) -> Option<u32> {
    match value {
        Value::Number(n) => {
            // Direct number: 0xE100 -> parse as u64
            n.as_u64().map(|v| v as u32)
        }
        Value::String(s) => {
            // String hex: "0xE100" -> parse manually
            if s.starts_with("0x") || s.starts_with("0X") {
                u32::from_str_radix(&s[2..], 16).ok()
            } else {
                s.parse::<u32>().ok()
            }
        }
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::NamedTempFile;

    fn create_test_atoms() -> NamedTempFile {
        let mut file = NamedTempFile::new().unwrap();
        let content = r#"
notation_systems:
  - system_name: number
    display_name: "Number System"
    pua_base: 0xE100
    variants_per_char: 25
    characters:
      - char: "1"
      - char: "2"
      - char: "3"
  - system_name: western
    display_name: "Western"
    pua_base: 0xE200
    variants_per_char: 25
    characters:
      - char: "C"
      - char: "D"

glyph_variants:
  accidental_types: 5
  octave_variants: 5
"#;
        file.write_all(content.as_bytes()).unwrap();
        file.flush().unwrap();
        file
    }

    #[test]
    fn test_parse_atoms_success() {
        let file = create_test_atoms();
        let spec = parse_atoms_yaml(file.path()).unwrap();

        assert_eq!(spec.notation_systems.len(), 2);
        assert_eq!(spec.notation_systems[0].name, "number");
        assert_eq!(spec.notation_systems[0].characters, vec!['1', '2', '3']);
        assert_eq!(spec.notation_systems[0].pua_base, 0xE100);

        assert_eq!(spec.notation_systems[1].name, "western");
        assert_eq!(spec.notation_systems[1].characters, vec!['C', 'D']);
        assert_eq!(spec.notation_systems[1].pua_base, 0xE200);

        assert_eq!(spec.glyph_variants.accidental_types, 5);
        assert_eq!(spec.glyph_variants.octave_variants, 5);
    }

    #[test]
    fn test_parse_hex_value() {
        // Test hex string parsing
        let hex_str = Value::String("0xE100".to_string());
        assert_eq!(parse_hex_value(&hex_str), Some(0xE100));

        // Test number parsing (YAML stores it as number, not string)
        let hex_num = Value::Number(serde_yaml::Number::from(0xE100i64));
        assert_eq!(parse_hex_value(&hex_num), Some(0xE100));
    }

    #[test]
    fn test_parse_missing_fields() {
        let mut file = NamedTempFile::new().unwrap();
        let content = r#"
notation_systems: []
"#;
        file.write_all(content.as_bytes()).unwrap();
        file.flush().unwrap();

        let result = parse_atoms_yaml(file.path());
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("glyph_variants"));
    }
}
