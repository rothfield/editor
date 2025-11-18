/// JSON emitter for FontSpec
///
/// Converts a validated FontSpec to JSON format for consumption by Python.
/// The JSON output is the canonical representation used by the font generator.

use super::FontSpec;
use std::path::Path;
use std::fs;

/// Emit FontSpec as JSON to a file
pub fn emit_fontspec_json(spec: &FontSpec, path: &Path) -> Result<(), String> {
    let json = serde_json::to_string_pretty(spec)
        .map_err(|e| format!("Failed to serialize FontSpec to JSON: {}", e))?;

    fs::write(path, json)
        .map_err(|e| format!("Failed to write fontspec.json: {}", e))?;

    Ok(())
}

/// Emit FontSpec as JSON string
pub fn emit_fontspec_json_string(spec: &FontSpec) -> Result<String, String> {
    serde_json::to_string_pretty(spec)
        .map_err(|e| format!("Failed to serialize FontSpec to JSON: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fontgen::{NotationSystem, GlyphVariantConfig};
    use tempfile::NamedTempFile;

    fn create_test_spec() -> FontSpec {
        FontSpec {
            notation_systems: vec![
                NotationSystem {
                    name: "number".to_string(),
                    characters: vec!['1', '2', '3'],
                    pua_base: 0xE100,
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
    fn test_emit_fontspec_json_string() {
        let spec = create_test_spec();
        let json = emit_fontspec_json_string(&spec).unwrap();

        // Verify JSON structure
        assert!(json.contains("\"notation_systems\""));
        assert!(json.contains("\"number\""));
        assert!(json.contains("\"glyph_variants\""));
        assert!(json.contains("\"accidental_types\": 5"));
        assert!(json.contains("\"octave_variants\": 5"));
    }

    #[test]
    fn test_emit_fontspec_json_file() {
        let spec = create_test_spec();
        let file = NamedTempFile::new().unwrap();
        let path = file.path();

        emit_fontspec_json(&spec, path).unwrap();

        // Verify file was written
        let content = std::fs::read_to_string(path).unwrap();
        assert!(content.contains("\"notation_systems\""));
    }

    #[test]
    fn test_emitted_json_roundtrips() {
        let spec = create_test_spec();
        let json = emit_fontspec_json_string(&spec).unwrap();

        // Parse JSON back to FontSpec
        let parsed: FontSpec = serde_json::from_str(&json).unwrap();

        // Verify roundtrip
        assert_eq!(parsed.notation_systems.len(), 1);
        assert_eq!(parsed.notation_systems[0].name, "number");
        assert_eq!(parsed.notation_systems[0].characters, vec!['1', '2', '3']);
        assert_eq!(parsed.glyph_variants.accidental_types, 5);
    }
}
