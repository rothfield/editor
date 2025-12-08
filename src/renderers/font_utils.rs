//! Font utilities for notation font glyph substitution
//!
//! This module provides utilities for mapping pitch characters with octave shifts
//! to Private Use Area (PUA) codepoints in the NotationFont.ttf.
//!
//! The NotationFont.ttf is a composite font combining:
//! - **Noto Sans**: Base font providing pitch character glyphs (1-7, A-Z, a-z)
//! - **Noto Music**: SMuFL musical symbols (accidentals, barlines, ornaments)
//!
//! **Octave Variants** (188 glyphs - 47 chars × 4 variants in PUA):
//! - 7 number system characters (1-7)
//! - 14 western system characters (C-B, c-b)
//! - 12 sargam system characters (S, r, R, g, G, m, M, P, d, D, n, N)
//! - 14 doremi system characters (d, r, m, f, s, l, t, D, R, M, F, S, L, T)
//!
//! Each character has 4 octave shift variants in the PUA:
//! - Variant 0: 1 dot above (octave +1)
//! - Variant 1: 2 dots above (octave +2)
//! - Variant 2: 1 dot below (octave -1)
//! - Variant 3: 2 dots below (octave -2)
//!
//! **Music Symbols** (from Noto Music Unicode ranges):
//! - Barlines: Single, double, repeat (left/right/both) - rendered directly as Unicode chars
//! - Ornaments: Mordent, inverted mordent, turn, trill (used by font-test.js only)
//!
//! **Note:** All constants are sourced from tools/fontgen/atoms.yaml

use wasm_bindgen::prelude::*;

// ============================================================================
// Barline Unicode Constants (from atoms.yaml via Noto Music)
// ============================================================================
// These are standard Unicode Musical Symbols (U+1D100-U+1D108)
// Barlines are rendered directly as characters, not via CSS overlays

/// Single barline: 𝄀 (U+1D100)
pub const BARLINE_SINGLE: char = '\u{1D100}';

/// Double barline: 𝄁 (U+1D101)
pub const BARLINE_DOUBLE: char = '\u{1D101}';

/// Repeat left barline (begin repeat): 𝄆 (U+1D106)
pub const BARLINE_REPEAT_LEFT: char = '\u{1D106}';

/// Repeat right barline (end repeat): 𝄇 (U+1D107)
pub const BARLINE_REPEAT_RIGHT: char = '\u{1D107}';

/// Repeat both (begin and end repeat): 𝄈 (U+1D108)
pub const BARLINE_REPEAT_BOTH: char = '\u{1D108}';

// ============================================================================
// Ornament Unicode Constants (SMuFL PUA range - for font-test.js display)
// ============================================================================

/// Mordent ornament (U+E56D)
pub const ORNAMENT_MORDENT: char = '\u{E56D}';

/// Inverted mordent (U+E56E)
pub const ORNAMENT_INVERTED_MORDENT: char = '\u{E56E}';

/// Turn ornament (U+E567)
pub const ORNAMENT_TURN: char = '\u{E567}';

/// Trill ornament (U+E566)
pub const ORNAMENT_TRILL: char = '\u{E566}';

/// Export complete font configuration to JavaScript
/// This is the single source of truth for all font codepoints (pitches, barlines, ornaments)
///
/// Returns a JSON object with:
/// - systems: Array of pitch system configurations
/// - symbols: Map of symbol names to codepoints (barlines, ornaments)
///
/// Example output:
/// ```json
/// {
///   "systems": [...],
///   "symbols": {
///     "barlineSingle": 119040,     // U+1D100
///     "ornamentTrill": 58726,      // U+E566
///     ...
///   }
/// }
/// ```
#[wasm_bindgen(js_name = getFontConfig)]
pub fn get_font_config() -> JsValue {
    #[derive(serde::Serialize)]
    struct SystemConfig {
        system_name: &'static str,
        pua_base: u32,
        char_count: usize,
        variants_per_character: usize,
        total_glyphs: usize,
    }

    #[derive(serde::Serialize)]
    struct SymbolInfo {
        name: &'static str,
        codepoint: u32,
        label: &'static str,
    }

    #[derive(serde::Serialize)]
    struct FontConfig {
        systems: Vec<SystemConfig>,
        symbols: Vec<SymbolInfo>,
    }

    // Build systems from generated MEASUREMENT_SYSTEMS (from atoms.yaml via build.rs)
    let systems: Vec<SystemConfig> = MEASUREMENT_SYSTEMS
        .iter()
        .map(|ms| SystemConfig {
            system_name: ms.name,
            pua_base: ms.pua_base,
            char_count: ms.char_count,
            variants_per_character: ms.variants_per_char,
            total_glyphs: ms.char_count * ms.variants_per_char,
        })
        .collect();

    // Musical symbols (barlines and ornaments) with their Unicode codepoints
    let symbols = vec![
        // Barlines (Unicode Musical Symbols U+1D100-U+1D108)
        SymbolInfo {
            name: "barlineSingle",
            codepoint: BARLINE_SINGLE as u32,
            label: "Barline (single)",
        },
        SymbolInfo {
            name: "barlineDouble",
            codepoint: BARLINE_DOUBLE as u32,
            label: "Barline (double)",
        },
        SymbolInfo {
            name: "barlineRepeatLeft",
            codepoint: BARLINE_REPEAT_LEFT as u32,
            label: "Barline (repeat left)",
        },
        SymbolInfo {
            name: "barlineRepeatRight",
            codepoint: BARLINE_REPEAT_RIGHT as u32,
            label: "Barline (repeat right)",
        },
        SymbolInfo {
            name: "barlineRepeatBoth",
            codepoint: BARLINE_REPEAT_BOTH as u32,
            label: "Barline (repeat both)",
        },
        // Ornaments (SMuFL PUA range)
        SymbolInfo {
            name: "ornamentMordent",
            codepoint: ORNAMENT_MORDENT as u32,
            label: "Mordent",
        },
        SymbolInfo {
            name: "ornamentInvertedMordent",
            codepoint: ORNAMENT_INVERTED_MORDENT as u32,
            label: "Inverted mordent",
        },
        SymbolInfo {
            name: "ornamentTurn",
            codepoint: ORNAMENT_TURN as u32,
            label: "Turn",
        },
        SymbolInfo {
            name: "ornamentTrill",
            codepoint: ORNAMENT_TRILL as u32,
            label: "Trill",
        },
    ];

    let config = FontConfig { systems, symbols };

    serde_wasm_bindgen::to_value(&config).unwrap_or(JsValue::NULL)
}

// ============================================================================
// NEW LOOKUP TABLE API - KISS Principle
// ============================================================================

// Include generated lookup tables from build.rs
include!(concat!(env!("OUT_DIR"), "/font_lookup_tables.rs"));
include!(concat!(env!("OUT_DIR"), "/font_measurement_systems.rs"));
include!(concat!(env!("OUT_DIR"), "/superscript_tables.rs"));

/// Get the glyph character for a pitch with octave shift
///
/// This is the new, simple API using direct lookup tables instead of formulas.
///
/// # Arguments
/// * `pitch` - The pitch code (includes accidental)
/// * `octave` - Octave shift (-2 to +2)
/// * `system` - Pitch system (Number, Western, Sargam, Doremi)
///
/// # Returns
/// The Unicode character to render, or None if octave out of range
///
/// # Examples
/// ```
/// use crate::models::pitch_code::PitchCode;
/// use crate::models::elements::PitchSystem;
///
/// // Natural 1 at base octave → '1'
/// assert_eq!(glyph_for_pitch(PitchCode::N1, 0, PitchSystem::Number), Some('1'));
///
/// // Natural 1 with +1 octave → PUA glyph with dot above
/// assert_eq!(glyph_for_pitch(PitchCode::N1, 1, PitchSystem::Number), Some('\u{E600}'));
///
/// // Sharp 1 at base octave → PUA composite glyph (1#)
/// assert_eq!(glyph_for_pitch(PitchCode::N1s, 0, PitchSystem::Number), Some('\u{E1F0}'));
///
/// // Sharp 1 with +1 octave → PUA combined glyph (1# with dot)
/// assert_eq!(glyph_for_pitch(PitchCode::N1s, 1, PitchSystem::Number), Some('\u{E2B0}'));
/// ```
pub fn glyph_for_pitch(
    pitch: crate::models::pitch_code::PitchCode,
    octave: i8,
    system: crate::models::elements::PitchSystem,
) -> Option<char> {
    let pi = pitch_code_index(pitch);
    let oi = octave_index(octave)?;

    Some(match system {
        crate::models::elements::PitchSystem::Number => NUMBER_TABLE[pi][oi],
        crate::models::elements::PitchSystem::Western => WESTERN_TABLE[pi][oi],
        crate::models::elements::PitchSystem::Sargam => SARGAM_TABLE[pi][oi],
        // Doremi, Bhatkhande, Tabla not yet implemented - use Number as fallback
        _ => NUMBER_TABLE[pi][oi],
    })
}

/// Reverse lookup: get pitch and octave from a glyph character
///
/// This completes the bidirectional Layer 1 API for glyph ↔ semantics.
///
/// # Arguments
/// * `ch` - The glyph character (from NotationFont)
/// * `system` - Pitch system to interpret the glyph
///
/// # Returns
/// `Some((PitchCode, octave))` if the character is a known pitch glyph, `None` otherwise
///
/// # Examples
/// ```
/// use crate::models::pitch_code::PitchCode;
/// use crate::models::elements::PitchSystem;
///
/// // Base '1' character → N1 at octave 0
/// assert_eq!(pitch_from_glyph('1', PitchSystem::Number), Some((PitchCode::N1, 0)));
///
/// // PUA glyph with dot above → N1 at octave +1
/// assert_eq!(pitch_from_glyph('\u{E600}', PitchSystem::Number), Some((PitchCode::N1, 1)));
///
/// // PUA sharp composite → N1s at octave 0
/// assert_eq!(pitch_from_glyph('\u{E1F0}', PitchSystem::Number), Some((PitchCode::N1s, 0)));
///
/// // Unknown glyph → None
/// assert_eq!(pitch_from_glyph('x', PitchSystem::Number), None);
/// ```
pub fn pitch_from_glyph(
    ch: char,
    system: crate::models::elements::PitchSystem,
) -> Option<(crate::models::pitch_code::PitchCode, i8)> {
    match system {
        crate::models::elements::PitchSystem::Number => pitch_from_glyph_number(ch),
        crate::models::elements::PitchSystem::Western => pitch_from_glyph_western(ch),
        crate::models::elements::PitchSystem::Sargam => pitch_from_glyph_sargam(ch),
        // Fallback to Number for unimplemented systems
        _ => pitch_from_glyph_number(ch),
    }
}

// ============================================================================
// SUPERSCRIPT GLYPH API FOR ORNAMENT RENDERING
// ============================================================================

/// Get superscript glyph for ornament rendering (WASM export)
///
/// Returns the 75% scaled superscript version of a source glyph with optional overline.
/// Used for rendering grace notes and ornaments in the editor.
///
/// # Arguments
/// * `source_cp` - Source codepoint (ASCII 0x20-0x7E or PUA pitch glyph)
/// * `overline_variant` - 0=none, 1=left-cap, 2=middle, 3=right-cap
///
/// # Returns
/// The superscript codepoint in Supplementary PUA-A (0xF0000+), or 0 if not found
///
/// # Formula
/// `superscript_cp = system_base + (source_offset × 4) + overline_variant`
///
/// # Example (JavaScript)
/// ```javascript
/// const superscriptCp = wasmModule.getSuperscriptGlyph(0x31, 0); // '1' no overline
/// const withOverline = wasmModule.getSuperscriptGlyph(0x31, 2); // '1' middle overline
/// ```
#[wasm_bindgen(js_name = getSuperscriptGlyph)]
pub fn get_superscript_glyph(source_cp: u32, overline_variant: u8) -> u32 {
    let overline = match SuperscriptOverline::from_index(overline_variant) {
        Some(o) => o,
        None => return 0, // Invalid overline variant
    };

    superscript_glyph(source_cp, overline)
        .map(|c| c as u32)
        .unwrap_or(0)
}

/// Check if a codepoint is a superscript glyph (WASM export)
///
/// Returns true if the codepoint is in the Supplementary PUA-A superscript range.
#[wasm_bindgen(js_name = isSuperscriptGlyph)]
pub fn is_superscript_glyph(cp: u32) -> bool {
    is_superscript(cp)
}

/// Get the overline variant from a superscript glyph codepoint (WASM export)
///
/// Returns the overline variant (0-3) or 255 if not a superscript glyph.
#[wasm_bindgen(js_name = getSuperscriptOverline)]
pub fn get_superscript_overline(cp: u32) -> u8 {
    superscript_overline(cp)
        .map(|o| o as u8)
        .unwrap_or(255)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::pitch_code::PitchCode;
    use crate::models::elements::PitchSystem;

    // ============================================================================
    // NEW LOOKUP TABLE API TESTS
    // ============================================================================

    #[test]
    fn test_glyph_for_pitch_natural_base_octave() {
        // NEW: 30-variant system with PUA base 0xE000 for Number system
        // N1 natural octave 0 → 0xE000 + (char_idx=0 × 30) + (variant=0) = 0xE000
        let result = glyph_for_pitch(PitchCode::N1, 0, PitchSystem::Number);
        assert_eq!(result, Some('\u{E000}'));
    }

    #[test]
    fn test_glyph_for_pitch_with_octave_plus_1() {
        // NEW: Octave +1 for N1 → variant index 3 (octave order: 0, -2, -1, +1, +2)
        // 0xE000 + (char_idx=0 × 30) + (variant=3) = 0xE003
        let result = glyph_for_pitch(PitchCode::N1, 1, PitchSystem::Number);
        assert_eq!(result, Some('\u{E003}'));
    }

    #[test]
    fn test_glyph_for_pitch_sharp_base_octave() {
        // NEW: Sharp N1 at octave 0
        // 0xE000 + (char_idx=0 × 30) + (accidental_offset=25 + octave_idx=0) = 0xE019
        let result = glyph_for_pitch(PitchCode::N1s, 0, PitchSystem::Number);
        assert_eq!(result, Some('\u{E019}'));
    }

    #[test]
    fn test_glyph_for_pitch_sharp_with_octave() {
        // NEW: Sharp N1 at octave +1
        // 0xE000 + (char_idx=0 × 30) + (accidental_offset=25 + octave_idx=3) = 0xE01C
        let result = glyph_for_pitch(PitchCode::N1s, 1, PitchSystem::Number);
        assert_eq!(result, Some('\u{E01C}'));
    }

    #[test]
    fn test_pitch_from_glyph_unknown() {
        let result = pitch_from_glyph('x', PitchSystem::Number);
        assert_eq!(result, None);
    }

    #[test]
    fn test_round_trip_all_naturals() {
        for pitch_code in [
            PitchCode::N1, PitchCode::N2, PitchCode::N3, PitchCode::N4,
            PitchCode::N5, PitchCode::N6, PitchCode::N7,
        ] {
            for octave in -2..=2 {
                // Forward: PitchCode → char
                let glyph = glyph_for_pitch(pitch_code, octave, PitchSystem::Number)
                    .expect("Should generate glyph");

                // Reverse: char → PitchCode
                let (decoded_pitch, decoded_octave) = pitch_from_glyph(glyph, PitchSystem::Number)
                    .expect("Should decode glyph");

                // Verify round-trip
                assert_eq!(decoded_pitch, pitch_code,
                    "Round-trip failed for {:?} at octave {}", pitch_code, octave);
                assert_eq!(decoded_octave, octave,
                    "Octave mismatch for {:?} at octave {}", pitch_code, octave);
            }
        }
    }

    #[test]
    fn test_round_trip_sharps() {
        for pitch_code in [
            PitchCode::N1s, PitchCode::N2s, PitchCode::N3s, PitchCode::N4s,
            PitchCode::N5s, PitchCode::N6s, PitchCode::N7s,
        ] {
            for octave in -2..=2 {
                let glyph = glyph_for_pitch(pitch_code, octave, PitchSystem::Number)
                    .expect("Should generate sharp glyph");

                let (decoded_pitch, decoded_octave) = pitch_from_glyph(glyph, PitchSystem::Number)
                    .expect("Should decode sharp glyph");

                assert_eq!(decoded_pitch, pitch_code);
                assert_eq!(decoded_octave, octave);
            }
        }
    }

    // ============================================================================
    // SUPERSCRIPT GLYPH TESTS
    // ============================================================================

    #[test]
    fn test_superscript_ascii_basic() {
        // ASCII '1' (0x31) with no line variant
        let result = superscript_ascii('1', SuperscriptOverline::None);
        // source_offset = 0x31 - 0x20 = 0x11 = 17
        // superscript_cp = 0xF8000 + (17 × 16) + 0 = 0xF8110
        assert_eq!(result, Some('\u{F8110}'));
    }

    #[test]
    fn test_superscript_ascii_with_overline() {
        // ASCII '1' (0x31) with middle overline (variant 5)
        let result = superscript_ascii('1', SuperscriptOverline::OverlineMiddle);
        // source_offset = 17, line_variant = 5
        // superscript_cp = 0xF8000 + (17 × 16) + 5 = 0xF8115
        assert_eq!(result, Some('\u{F8115}'));
    }

    #[test]
    fn test_superscript_ascii_out_of_range() {
        // Control character (0x19) should return None
        let result = superscript_ascii('\x19', SuperscriptOverline::None);
        assert_eq!(result, None);
    }

    #[test]
    fn test_superscript_number_pitch() {
        // Number system pitch at 0xE000 with no line variant
        let result = superscript_number(0xE000, SuperscriptOverline::None);
        // source_offset = 0xE000 - 0xE000 = 0
        // superscript_cp = 0xF8600 + (0 × 16) + 0 = 0xF8600
        assert_eq!(result, Some('\u{F8600}'));
    }

    #[test]
    fn test_superscript_number_with_underline() {
        // Number system pitch at 0xE000 with right-cap underline (variant 3)
        let result = superscript_number(0xE000, SuperscriptOverline::UnderlineRight);
        // superscript_cp = 0xF8600 + (0 × 16) + 3 = 0xF8603
        assert_eq!(result, Some('\u{F8603}'));
    }

    #[test]
    fn test_superscript_glyph_auto_detect_ascii() {
        // Should auto-detect ASCII and route to superscript_ascii
        let result = superscript_glyph(0x31, SuperscriptOverline::None); // '1'
        assert!(result.is_some());
        let cp = result.unwrap() as u32;
        assert!(cp >= 0xF8000 && cp < 0xF8600, "ASCII should be in 0xF8000-0xF85FF");
    }

    #[test]
    fn test_superscript_glyph_auto_detect_number() {
        // Should auto-detect Number PUA and route to superscript_number
        let result = superscript_glyph(0xE000, SuperscriptOverline::None);
        assert!(result.is_some());
        let cp = result.unwrap() as u32;
        assert!(cp >= 0xF8600 && cp < 0xF9400, "Number should be in 0xF8600-0xF93FF");
    }

    #[test]
    fn test_is_superscript() {
        // Superscript glyphs are in Supplementary PUA-A (0xF8000+)
        assert!(is_superscript(0xF8000));
        assert!(is_superscript(0xF8600));
        assert!(is_superscript(0xF9400));
        assert!(!is_superscript(0xE000)); // Regular PUA
        assert!(!is_superscript(0x31));   // ASCII
    }

    #[test]
    fn test_superscript_line_variant_extraction() {
        // Line variant is always cp % 16
        assert_eq!(superscript_overline(0xF8600), Some(SuperscriptOverline::None));
        assert_eq!(superscript_overline(0xF8601), Some(SuperscriptOverline::UnderlineLeft));
        assert_eq!(superscript_overline(0xF8602), Some(SuperscriptOverline::UnderlineMiddle));
        assert_eq!(superscript_overline(0xF8603), Some(SuperscriptOverline::UnderlineRight));
        assert_eq!(superscript_overline(0xF8604), Some(SuperscriptOverline::OverlineLeft));
        assert_eq!(superscript_overline(0xF8605), Some(SuperscriptOverline::OverlineMiddle));
        assert_eq!(superscript_overline(0xF8606), Some(SuperscriptOverline::OverlineRight));
        assert_eq!(superscript_overline(0xE000), None); // Not a superscript
    }

    #[test]
    fn test_wasm_get_superscript_glyph() {
        // Test the WASM export function
        let result = get_superscript_glyph(0x31, 0); // '1' no line
        assert!(result >= 0xF8000);

        let result_with_underline = get_superscript_glyph(0x31, 1); // '1' underline left
        assert_eq!(result_with_underline, result + 1);

        let invalid = get_superscript_glyph(0x31, 20); // Invalid line variant (max is 15)
        assert_eq!(invalid, 0);
    }
}
