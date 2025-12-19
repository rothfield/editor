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
include!(concat!(env!("OUT_DIR"), "/beat_element_predicates.rs"));

// ============================================================================
// GlyphExt - Fluent API for codepoint transformations
// ============================================================================

use crate::renderers::line_variants::{
    LowerLoopRole, SlurRole, get_pua_note_line_variant_codepoint, decode_line_variant,
    encode_ascii_line_variant,
};

/// Extension trait for glyph codepoint transformations.
///
/// Adds fluent transformation methods directly to `char`. Each method
/// transforms the codepoint and returns a new `char`. If a transformation
/// doesn't apply (e.g., `.octave()` on a dash), returns self unchanged.
///
/// # Example
/// ```
/// use crate::renderers::font_utils::{GlyphExt, glyph_for_pitch};
/// use crate::models::elements::PitchSystem;
/// use crate::models::pitch_code::PitchCode;
/// use crate::renderers::line_variants::LowerLoopRole;
///
/// let ch = glyph_for_pitch(PitchCode::N1, 0, PitchSystem::Number)
///     .unwrap()
///     .octave(1)
///     .underline(LowerLoopRole::Left)
///     .superscript(true);
/// ```
///
/// Also aliased as `CharTransform` for compatibility.
pub trait GlyphExt {
    /// Set octave (-2 to +2). No-op on non-pitched glyphs.
    fn octave(self, oct: i8) -> Self;

    /// Set accidental (None, Sharp, Flat, DoubleSharp, DoubleFlat, HalfFlat).
    /// Preserves degree (1-7), octave, pitch_system, line variants, superscript.
    /// No-op on non-pitched glyphs.
    fn accidental(self, acc: crate::models::pitch_code::AccidentalType) -> Self;

    /// Set underline state for beat grouping.
    fn underline(self, state: LowerLoopRole) -> Self;

    /// Set overline state for slurs.
    fn overline(self, state: SlurRole) -> Self;

    /// Convert to/from superscript (grace note). Pass `true` to make superscript, `false` to make normal.
    fn superscript(self, enable: bool) -> Self;

    // Checked variants for debugging/tests
    /// Like `underline()` but returns `None` if transformation not applicable.
    fn try_underline(self, state: LowerLoopRole) -> Option<Self> where Self: Sized;

    /// Like `superscript()` but returns `None` if transformation not applicable.
    fn try_superscript(self, enable: bool) -> Option<Self> where Self: Sized;
}

/// Alias for GlyphExt trait (for backward compatibility)
pub use GlyphExt as CharTransform;

/// Internal decoded representation of a glyph for efficient chained transformations.
#[derive(Clone, Copy, Debug)]
struct GlyphParts {
    /// Base codepoint (without line variants or superscript)
    base_cp: u32,
    /// Current line variant index (0-15)
    line_variant: u8,
    /// Whether currently a superscript
    is_super: bool,
}

impl GlyphParts {
    /// Decode a char into its parts
    fn decode(ch: char) -> Self {
        let cp = ch as u32;

        // Check if superscript (0xF8000+)
        if is_superscript(cp) {
            if let Some(base_cp) = from_superscript(cp) {
                let line_variant = (cp % SUPERSCRIPT_LINE_VARIANTS) as u8;
                return GlyphParts { base_cp, line_variant, is_super: true };
            }
            // Invalid superscript codepoint (e.g., in gap between systems)
            // Treat as plain codepoint
        }

        // Check if NOTE line variant PUA (0x1A000+)
        // These encode pitch PUA codepoints with line variants
        // Formula: line_cp = LINE_BASE + (note_offset × 15) + variant_idx
        if let Some((base_cp, line_variant)) = Self::decode_note_line_variant(cp) {
            return GlyphParts { base_cp, line_variant, is_super: false };
        }

        // Check if ASCII line variant PUA (0xE800-0xEBFF)
        // ASCII chars stay as ASCII - they have their own line variant encoding
        if let Some(decoded) = decode_line_variant(ch) {
            let line_variant = line_states_to_variant(decoded.underline, decoded.overline);
            let base_cp = decoded.base_char as u32;
            return GlyphParts { base_cp, line_variant, is_super: false };
        }

        // Plain codepoint (ASCII, base PUA pitch, etc.)
        GlyphParts { base_cp: cp, line_variant: 0, is_super: false }
    }

    /// Decode NOTE line variant PUA (0x1A000+)
    /// Returns (base_pitch_pua_cp, line_variant)
    fn decode_note_line_variant(cp: u32) -> Option<(u32, u8)> {
        // NOTE line variant bases and corresponding pitch PUA bases
        // Formula: line_cp = LINE_BASE + (note_offset × 15) + variant_idx
        const NUMBER_LINE_BASE: u32 = 0x1A000;
        const NUMBER_SOURCE_BASE: u32 = 0xE000;
        const NUMBER_SIZE: u32 = 210;  // 7 chars × 30 variants

        const WESTERN_LINE_BASE: u32 = 0x1B000;
        const WESTERN_SOURCE_BASE: u32 = 0xE100;
        const WESTERN_SIZE: u32 = 210;

        const SARGAM_LINE_BASE: u32 = 0x1D000;
        const SARGAM_SOURCE_BASE: u32 = 0xE300;
        const SARGAM_SIZE: u32 = 360;  // 12 chars × 30 variants

        const DOREMI_LINE_BASE: u32 = 0x1F000;
        const DOREMI_SOURCE_BASE: u32 = 0xE500;
        const DOREMI_SIZE: u32 = 210;

        const VARIANTS_PER_NOTE: u32 = 15;

        // Check each system range
        let (line_base, source_base, max_notes) = if cp >= NUMBER_LINE_BASE && cp < NUMBER_LINE_BASE + NUMBER_SIZE * VARIANTS_PER_NOTE {
            (NUMBER_LINE_BASE, NUMBER_SOURCE_BASE, NUMBER_SIZE)
        } else if cp >= WESTERN_LINE_BASE && cp < WESTERN_LINE_BASE + WESTERN_SIZE * VARIANTS_PER_NOTE {
            (WESTERN_LINE_BASE, WESTERN_SOURCE_BASE, WESTERN_SIZE)
        } else if cp >= SARGAM_LINE_BASE && cp < SARGAM_LINE_BASE + SARGAM_SIZE * VARIANTS_PER_NOTE {
            (SARGAM_LINE_BASE, SARGAM_SOURCE_BASE, SARGAM_SIZE)
        } else if cp >= DOREMI_LINE_BASE && cp < DOREMI_LINE_BASE + DOREMI_SIZE * VARIANTS_PER_NOTE {
            (DOREMI_LINE_BASE, DOREMI_SOURCE_BASE, DOREMI_SIZE)
        } else {
            return None;
        };

        let offset = cp - line_base;
        let note_offset = offset / VARIANTS_PER_NOTE;
        let variant_idx = (offset % VARIANTS_PER_NOTE) as u8;

        if note_offset >= max_notes {
            return None;
        }

        // Convert variant_idx (0-14) to our line_variant (0-15)
        // The encoding in get_pua_note_line_variant_codepoint is:
        // 0-2: Underline only (M/L/R)
        // 3-5: Overline only (M/L/R)
        // 6-14: Combined (u_idx * 3 + o_idx)
        let line_variant = Self::note_variant_to_line_variant(variant_idx);

        let base_cp = source_base + note_offset;
        Some((base_cp, line_variant))
    }

    /// Convert NOTE line variant encoding to our unified line_variant (0-15)
    fn note_variant_to_line_variant(variant_idx: u8) -> u8 {
        // NOTE encoding:
        // 0 = Middle underline, 1 = Left underline, 2 = Right underline
        // 3 = Middle overline, 4 = Left overline, 5 = Right overline
        // 6-14 = Combined (u_idx * 3 + o_idx where u/o are 0=M, 1=L, 2=R)
        //
        // Our unified encoding (line_states_to_variant):
        // 0 = None/None, 1 = L/None, 2 = M/None, 3 = R/None
        // 4 = None/L, 5 = None/M, 6 = None/R
        // 7-15 = Combined

        match variant_idx {
            // Underline only: M=0→2, L=1→1, R=2→3
            0 => 2,  // Middle underline
            1 => 1,  // Left underline
            2 => 3,  // Right underline
            // Overline only: M=3→5, L=4→4, R=5→6
            3 => 5,  // Middle overline
            4 => 4,  // Left overline
            5 => 6,  // Right overline
            // Combined: need to map (u_idx, o_idx) to our combined format
            n if n >= 6 && n <= 14 => {
                let combined = n - 6;
                let u_idx = combined / 3;  // 0=M, 1=L, 2=R
                let o_idx = combined % 3;  // 0=M, 1=L, 2=R
                // Our combined uses: u_idx: L=0, M=1, R=2 and o_idx: L=0, M=1, R=2
                // NOTE uses: u_idx: M=0, L=1, R=2 and o_idx: M=0, L=1, R=2
                let our_u = match u_idx { 0 => 1, 1 => 0, 2 => 2, _ => 0 };  // M→1, L→0, R→2
                let our_o = match o_idx { 0 => 1, 1 => 0, 2 => 2, _ => 0 };
                // Our combined formula: 7 + (our_u * 3) + our_o
                7 + (our_u * 3) + our_o
            }
            _ => 0,
        }
    }

    /// Encode parts back to a char
    fn encode(self) -> char {
        let cp = if self.is_super {
            // Encode as superscript with line variant
            let super_cp = get_superscript_glyph(self.base_cp, self.line_variant);
            // If superscript conversion fails (returns 0), fall back to base
            if super_cp != 0 { super_cp } else { self.base_cp }
        } else if self.line_variant != 0 {
            // Encode with line variant
            let (underline, overline) = variant_to_line_states(self.line_variant);

            // ASCII chars (0x20-0x7E) stay as ASCII line variants
            if self.base_cp >= 0x20 && self.base_cp <= 0x7E {
                char::from_u32(self.base_cp)
                    .and_then(|ch| encode_ascii_line_variant(ch, underline, overline))
                    .map(|c| c as u32)
                    .unwrap_or(self.base_cp)
            } else {
                // Pitch PUA codepoints use NOTE line variants
                get_pua_note_line_variant_codepoint(self.base_cp, underline, overline)
                    .map(|c| c as u32)
                    .unwrap_or(self.base_cp)
            }
        } else {
            // Plain base codepoint
            self.base_cp
        };

        char::from_u32(cp).unwrap_or('?')
    }
}

impl GlyphExt for char {
    fn octave(self, oct: i8) -> Self {
        let cp = self as u32;

        // ASCII line variants (0xE800-0xED96) are system-agnostic
        // Underline: 0xE800 + 95×3 = 0xE91D, Overline: 0xE920 + 95×3 = 0xEA3D
        // Combined: 0xEA40 + 95×9 = 0xED97
        // They don't support pitch transforms - return unchanged
        if cp >= 0xE800 && cp < 0xED97 {
            return self;
        }

        // ASCII superscripts (0xF8000-0xF85FF) are also system-agnostic
        if cp >= 0xF8000 && cp < 0xF8600 {
            return self;
        }

        let parts = GlyphParts::decode(self);

        // Try to get pitch info and change octave
        if let Some((pitch, _old_oct)) = pitch_from_codepoint(parts.base_cp) {
            if let Some(new_base) = glyph_for_pitch_from_cp(pitch, oct, parts.base_cp) {
                let new_parts = GlyphParts {
                    base_cp: new_base as u32,
                    line_variant: parts.line_variant,
                    is_super: parts.is_super,
                };
                return new_parts.encode();
            }
        }

        // Not applicable - return unchanged
        self
    }

    fn accidental(self, acc: crate::models::pitch_code::AccidentalType) -> Self {
        use crate::models::pitch_code::AccidentalType;

        let self_cp = self as u32;

        // ASCII line variants (0xE800-0xED96) are system-agnostic
        // They don't support pitch transforms - return unchanged
        if self_cp >= 0xE800 && self_cp < 0xED97 {
            return self;
        }

        // ASCII superscripts (0xF8000-0xF85FF) are also system-agnostic
        if self_cp >= 0xF8000 && self_cp < 0xF8600 {
            return self;
        }

        let parts = GlyphParts::decode(self);
        let cp = parts.base_cp;

        // Only apply to codepoints that are recognized as pitch glyphs
        // This ensures we don't corrupt non-pitch codepoints
        if pitch_from_codepoint(cp).is_none() {
            return self; // Not a recognized pitch - return unchanged
        }

        // Detect pitch system and compute new codepoint using atoms.yaml formula:
        // codepoint = system_pua_base + (char_index × 30) + variant_index
        // variant_index = (accidental_type × 5) + octave_idx
        // accidental_type: 0=natural, 1=flat, 2=half-flat, 3=double-flat, 4=double-sharp, 5=sharp
        // octave_idx: 0=base, 1=-2, 2=-1, 3=+1, 4=+2

        let (system_base, _max_chars) = match cp {
            0xE000..=0xE0D1 => (0xE000u32, 7),   // Number: 7 × 30 = 210
            0xE100..=0xE1D1 => (0xE100u32, 7),   // Western: 7 × 30 = 210
            0xE300..=0xE467 => (0xE300u32, 12),  // Sargam: 12 × 30 = 360
            0xE500..=0xE5D1 => (0xE500u32, 7),   // Doremi: 7 × 30 = 210
            _ => return self, // Not a pitch PUA - return unchanged
        };

        let offset = cp - system_base;
        let char_index = offset / 30;
        let old_variant = offset % 30;
        let octave_idx = old_variant % 5;  // Preserve octave (0=base, 1=-2, 2=-1, 3=+1, 4=+2)

        // Map AccidentalType to atoms.yaml accidental_type index
        let new_acc_type: u32 = match acc {
            AccidentalType::None | AccidentalType::Natural => 0,  // natural
            AccidentalType::Flat => 1,
            AccidentalType::HalfFlat => 2,
            AccidentalType::DoubleFlat => 3,
            AccidentalType::DoubleSharp => 4,
            AccidentalType::Sharp => 5,
        };

        let new_variant = (new_acc_type * 5) + octave_idx;
        let new_cp = system_base + (char_index * 30) + new_variant;

        // Verify the new codepoint is also recognized by pitch_from_codepoint
        // If not, return self unchanged (decode_char has incomplete coverage for some systems)
        if pitch_from_codepoint(new_cp).is_none() {
            return self;
        }

        let new_parts = GlyphParts {
            base_cp: new_cp,
            line_variant: parts.line_variant,
            is_super: parts.is_super,
        };
        new_parts.encode()
    }

    fn underline(self, state: LowerLoopRole) -> Self {
        let mut parts = GlyphParts::decode(self);
        let new_variant = set_underline_in_variant(parts.line_variant, state);
        parts.line_variant = new_variant;
        parts.encode()
    }

    fn overline(self, state: SlurRole) -> Self {
        let mut parts = GlyphParts::decode(self);
        let new_variant = set_overline_in_variant(parts.line_variant, state);
        parts.line_variant = new_variant;
        parts.encode()
    }

    fn superscript(self, enable: bool) -> Self {
        let mut parts = GlyphParts::decode(self);
        parts.is_super = enable;
        parts.encode()
    }

    fn try_underline(self, state: LowerLoopRole) -> Option<Self> {
        let parts = GlyphParts::decode(self);
        let new_variant = set_underline_in_variant(parts.line_variant, state);

        // Check if the transformation actually works
        let new_parts = GlyphParts {
            base_cp: parts.base_cp,
            line_variant: new_variant,
            is_super: parts.is_super,
        };
        let result = new_parts.encode();

        // Verify the result encodes the expected state
        let check = GlyphParts::decode(result);
        if check.line_variant == new_variant {
            Some(result)
        } else {
            None
        }
    }

    fn try_superscript(self, enable: bool) -> Option<Self> {
        let parts = GlyphParts::decode(self);
        let new_parts = GlyphParts {
            base_cp: parts.base_cp,
            line_variant: parts.line_variant,
            is_super: enable,
        };
        let result = new_parts.encode();

        // Verify the result encodes the expected state
        let check = GlyphParts::decode(result);
        if check.is_super == enable {
            Some(result)
        } else {
            None
        }
    }
}

/// Helper: get pitch info from a codepoint
fn pitch_from_codepoint(cp: u32) -> Option<(crate::models::pitch_code::PitchCode, i8)> {
    let ch = char::from_u32(cp)?;
    // Try each system
    pitch_from_glyph_number(ch)
        .or_else(|| pitch_from_glyph_western(ch))
        .or_else(|| pitch_from_glyph_sargam(ch))
}

/// Helper: get glyph for pitch, inferring system from source codepoint
fn glyph_for_pitch_from_cp(pitch: crate::models::pitch_code::PitchCode, octave: i8, source_cp: u32) -> Option<char> {
    // Infer system from source codepoint range
    let system = if source_cp >= 0xE000 && source_cp < 0xE100 {
        crate::models::elements::PitchSystem::Number
    } else if source_cp >= 0xE100 && source_cp < 0xE300 {
        crate::models::elements::PitchSystem::Western
    } else if source_cp >= 0xE300 && source_cp < 0xE500 {
        crate::models::elements::PitchSystem::Sargam
    } else {
        crate::models::elements::PitchSystem::Number
    };
    glyph_for_pitch(pitch, octave, system)
}

/// Helper: set underline in line variant byte
fn set_underline_in_variant(variant: u8, underline: LowerLoopRole) -> u8 {
    let (_, overline) = variant_to_line_states(variant);
    line_states_to_variant(underline, overline)
}

/// Helper: set overline in line variant byte
fn set_overline_in_variant(variant: u8, overline: SlurRole) -> u8 {
    let (underline, _) = variant_to_line_states(variant);
    line_states_to_variant(underline, overline)
}

/// Convert line variant index (0-15) to (LowerLoopRole, SlurRole)
fn variant_to_line_states(variant: u8) -> (LowerLoopRole, SlurRole) {
    match variant {
        0 => (LowerLoopRole::None, SlurRole::None),
        1 => (LowerLoopRole::Left, SlurRole::None),
        2 => (LowerLoopRole::Middle, SlurRole::None),
        3 => (LowerLoopRole::Right, SlurRole::None),
        4 => (LowerLoopRole::None, SlurRole::Left),
        5 => (LowerLoopRole::None, SlurRole::Middle),
        6 => (LowerLoopRole::None, SlurRole::Right),
        7 => (LowerLoopRole::Left, SlurRole::Left),
        8 => (LowerLoopRole::Left, SlurRole::Middle),
        9 => (LowerLoopRole::Left, SlurRole::Right),
        10 => (LowerLoopRole::Middle, SlurRole::Left),
        11 => (LowerLoopRole::Middle, SlurRole::Middle),
        12 => (LowerLoopRole::Middle, SlurRole::Right),
        13 => (LowerLoopRole::Right, SlurRole::Left),
        14 => (LowerLoopRole::Right, SlurRole::Middle),
        15 => (LowerLoopRole::Right, SlurRole::Right),
        _ => (LowerLoopRole::None, SlurRole::None),
    }
}

/// Convert (LowerLoopRole, SlurRole) to line variant index (0-15)
fn line_states_to_variant(underline: LowerLoopRole, overline: SlurRole) -> u8 {
    match (underline, overline) {
        (LowerLoopRole::None, SlurRole::None) => 0,
        (LowerLoopRole::Left, SlurRole::None) => 1,
        (LowerLoopRole::Middle, SlurRole::None) => 2,
        (LowerLoopRole::Right, SlurRole::None) => 3,
        (LowerLoopRole::None, SlurRole::Left) => 4,
        (LowerLoopRole::None, SlurRole::Middle) => 5,
        (LowerLoopRole::None, SlurRole::Right) => 6,
        (LowerLoopRole::Left, SlurRole::Left) => 7,
        (LowerLoopRole::Left, SlurRole::Middle) => 8,
        (LowerLoopRole::Left, SlurRole::Right) => 9,
        (LowerLoopRole::Middle, SlurRole::Left) => 10,
        (LowerLoopRole::Middle, SlurRole::Middle) => 11,
        (LowerLoopRole::Middle, SlurRole::Right) => 12,
        (LowerLoopRole::Right, SlurRole::Left) => 13,
        (LowerLoopRole::Right, SlurRole::Middle) => 14,
        (LowerLoopRole::Right, SlurRole::Right) => 15,
    }
}

// ============================================================================
// CodepointTransform - Bit manipulation trait for u32 codepoints
// ============================================================================

/// Extension trait for direct bit manipulation on u32 codepoints.
///
/// This provides efficient operations for reading/modifying line variant bits
/// without going through char conversion. Used by the slur algorithm:
///
/// ```rust
/// for cell in &mut self.cells {
///     if cell.codepoint.slur_left() {
///         in_slur = true;
///     }
///     if !cell.codepoint.slur_left() && !cell.codepoint.slur_right() {
///         cell.codepoint = cell.codepoint.overline_mid(in_slur);
///     }
///     if cell.codepoint.slur_right() {
///         in_slur = false;
///     }
/// }
/// ```
///
/// # Design
/// - Slur markers (Left/Right overline) are durable - set once
/// - Middle overline is derived - recalculated on each redraw
/// - No String allocation, direct codepoint math
pub trait CodepointTransform {
    /// Check if this codepoint has overline Left (slur start marker)
    fn slur_left(self) -> bool;

    /// Check if this codepoint has overline Right (slur end marker)
    fn slur_right(self) -> bool;

    /// Set or clear overline Middle based on `in_slur` state
    /// Returns new codepoint with middle bit modified
    fn overline_mid(self, set: bool) -> Self;

    /// Check if this codepoint has underline Left (beat start)
    fn beat_left(self) -> bool;

    /// Check if this codepoint has underline Right (beat end)
    fn beat_right(self) -> bool;

    /// Set or clear underline Middle based on `in_beat` state
    fn underline_mid(self, set: bool) -> Self;

    /// Get the current overline state
    fn get_overline(self) -> SlurRole;

    /// Get the current underline state
    fn get_underline(self) -> LowerLoopRole;

    /// Set overline state directly
    fn set_overline(self, state: SlurRole) -> Self;

    /// Set underline state directly
    fn set_underline(self, state: LowerLoopRole) -> Self;

    /// Strip all line variants (reset to base codepoint)
    fn strip_lines(self) -> Self;

    /// Convert to char for display
    fn to_char(self) -> char;
}

impl CodepointTransform for u32 {
    fn slur_left(self) -> bool {
        self.get_overline() == SlurRole::Left
    }

    fn slur_right(self) -> bool {
        self.get_overline() == SlurRole::Right
    }

    fn overline_mid(self, set: bool) -> Self {
        let current = self.get_overline();
        // Only modify if current state is None or Middle
        // Don't touch Left/Right (durable markers)
        if current == SlurRole::Left || current == SlurRole::Right {
            self
        } else {
            let new_state = if set { SlurRole::Middle } else { SlurRole::None };
            self.set_overline(new_state)
        }
    }

    fn beat_left(self) -> bool {
        self.get_underline() == LowerLoopRole::Left
    }

    fn beat_right(self) -> bool {
        self.get_underline() == LowerLoopRole::Right
    }

    fn underline_mid(self, set: bool) -> Self {
        let current = self.get_underline();
        // Only modify if current state is None or Middle
        // Don't touch Left/Right (durable markers)
        if current == LowerLoopRole::Left || current == LowerLoopRole::Right {
            self
        } else {
            let new_state = if set { LowerLoopRole::Middle } else { LowerLoopRole::None };
            self.set_underline(new_state)
        }
    }

    fn get_overline(self) -> SlurRole {
        if let Some(ch) = char::from_u32(self) {
            let parts = GlyphParts::decode(ch);
            let (_, overline) = variant_to_line_states(parts.line_variant);
            overline
        } else {
            SlurRole::None
        }
    }

    fn get_underline(self) -> LowerLoopRole {
        if let Some(ch) = char::from_u32(self) {
            let parts = GlyphParts::decode(ch);
            let (underline, _) = variant_to_line_states(parts.line_variant);
            underline
        } else {
            LowerLoopRole::None
        }
    }

    fn set_overline(self, state: SlurRole) -> Self {
        if let Some(ch) = char::from_u32(self) {
            ch.overline(state) as u32
        } else {
            self
        }
    }

    fn set_underline(self, state: LowerLoopRole) -> Self {
        if let Some(ch) = char::from_u32(self) {
            ch.underline(state) as u32
        } else {
            self
        }
    }

    fn strip_lines(self) -> Self {
        if let Some(ch) = char::from_u32(self) {
            let parts = GlyphParts::decode(ch);
            let stripped = GlyphParts {
                base_cp: parts.base_cp,
                line_variant: 0,
                is_super: parts.is_super,
            };
            stripped.encode() as u32
        } else {
            self
        }
    }

    fn to_char(self) -> char {
        char::from_u32(self).unwrap_or('?')
    }
}

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
// UNIFIED CHARACTER DECODING
// ============================================================================

/// Fully decoded character information
///
/// Contains all information that can be extracted from any character:
/// - ASCII input characters ('1', 'S', '-', etc.)
/// - Pitch PUA glyphs (with octave variants)
/// - Line variant PUA glyphs (with underline/overline)
#[derive(Clone, Debug, PartialEq)]
pub struct DecodedChar {
    /// The underlying ASCII character ('1', '2', 'S', '-', ' ', etc.)
    pub base_char: char,

    /// Pitch code if this is a pitched character
    pub pitch_code: Option<crate::models::pitch_code::PitchCode>,

    /// Octave offset (-2 to +2), 0 for non-pitched or base octave
    pub octave: i8,

    /// Underline state (for beat grouping)
    pub underline: LowerLoopRole,

    /// Overline state (for slurs)
    pub overline: SlurRole,
}

impl DecodedChar {
    /// Create a new DecodedChar with default values
    pub fn new(base_char: char) -> Self {
        Self {
            base_char,
            pitch_code: None,
            octave: 0,
            underline: LowerLoopRole::None,
            overline: SlurRole::None,
        }
    }

    /// Check if this is a pitched character
    pub fn is_pitched(&self) -> bool {
        self.pitch_code.is_some()
    }

    /// Check if this has any line decorations
    pub fn has_lines(&self) -> bool {
        self.underline != LowerLoopRole::None || self.overline != SlurRole::None
    }
}

/// Decode any character into its full component information
///
/// This is the single source of truth for understanding what any character
/// (ASCII, Pitch PUA, or Line Variant PUA) represents.
///
/// # Arguments
/// * `ch` - Any character to decode
/// * `pitch_system` - The pitch system context for interpreting pitch characters
///
/// # Returns
/// A `DecodedChar` with all extractable information
///
/// # Examples
/// ```
/// use crate::renderers::font_utils::decode_char;
/// use crate::models::elements::PitchSystem;
///
/// // ASCII '1' → N1 at octave 0, no lines
/// let d = decode_char('1', PitchSystem::Number);
/// assert_eq!(d.base_char, '1');
/// assert!(d.pitch_code.is_some());
/// assert_eq!(d.octave, 0);
///
/// // Line variant PUA → base char with underline
/// let d = decode_char('\u{E805}', PitchSystem::Number);
/// assert_eq!(d.base_char, '2');
/// assert!(d.has_lines());
/// ```
pub fn decode_char(
    ch: char,
    pitch_system: crate::models::elements::PitchSystem,
) -> DecodedChar {
    let cp = ch as u32;

    // 0. Check if it's a superscript glyph (0xF8000+)
    if is_superscript(cp) {
        let line_variant = (cp % SUPERSCRIPT_LINE_VARIANTS) as u8;
        let (underline, overline) = variant_to_line_states(line_variant);

        // Get base (non-superscript) codepoint and decode it
        if let Some(base_cp) = from_superscript(cp) {
            if let Some(base_ch) = char::from_u32(base_cp) {
                // Recursively decode the base char to get pitch info
                let base_decoded = decode_char(base_ch, pitch_system);
                return DecodedChar {
                    base_char: base_decoded.base_char,
                    pitch_code: base_decoded.pitch_code,
                    octave: base_decoded.octave,
                    underline,
                    overline,
                };
            }
        }
        // Fallback if base conversion fails
        return DecodedChar {
            base_char: ch,
            pitch_code: None,
            octave: 0,
            underline,
            overline,
        };
    }

    // 1. Check if it's a NOTE line variant PUA (0x1A000+)
    // These encode pitch PUA codepoints with line variants and preserve octave
    if let Some((base_pitch_cp, line_variant)) = GlyphParts::decode_note_line_variant(cp) {
        let (underline, overline) = variant_to_line_states(line_variant);

        // Decode the base pitch codepoint to get pitch info
        // Try the specified system first, then try all systems to find the pitch
        let base_ch = char::from_u32(base_pitch_cp);
        let pitch_info = base_ch.and_then(|ch| {
            pitch_from_glyph(ch, pitch_system)
                .or_else(|| pitch_from_glyph_number(ch))
                .or_else(|| pitch_from_glyph_western(ch))
                .or_else(|| pitch_from_glyph_sargam(ch))
        });

        if let Some((pitch_code, octave)) = pitch_info {
            let base_char = pitch_code_to_base_char(pitch_code, pitch_system);
            return DecodedChar {
                base_char,
                pitch_code: Some(pitch_code),
                octave,
                underline,
                overline,
            };
        }

        // Even if pitch lookup fails, return line variant info
        return DecodedChar {
            base_char: base_ch.unwrap_or('?'),
            pitch_code: None,
            octave: 0,
            underline,
            overline,
        };
    }

    // 2. Check if it's an ASCII line variant PUA (0xE800-0xEBFF)
    if let Some(decoded) = decode_line_variant(ch) {
        // Line variant found - extract base char and line states
        // Then try to get pitch info from the base char
        let pitch_code_opt = pitch_from_glyph(decoded.base_char, pitch_system)
            .map(|(pc, _)| pc);

        return DecodedChar {
            base_char: decoded.base_char,
            pitch_code: pitch_code_opt,
            octave: 0, // ASCII line variants don't encode octave (known limitation)
            underline: decoded.underline,
            overline: decoded.overline,
        };
    }

    // 3. Check if it's a pitch PUA glyph (0xE000-0xE7FF range, system-dependent)
    if let Some((pitch_code, octave)) = pitch_from_glyph(ch, pitch_system) {
        // Pitch PUA - has pitch + octave, no lines
        // Derive base char from pitch code
        let base_char = pitch_code_to_base_char(pitch_code, pitch_system);

        return DecodedChar {
            base_char,
            pitch_code: Some(pitch_code),
            octave,
            underline: LowerLoopRole::None,
            overline: SlurRole::None,
        };
    }

    // 4. Plain ASCII or unknown - try to parse as pitch
    let pitch_info = pitch_from_glyph(ch, pitch_system);

    DecodedChar {
        base_char: ch,
        pitch_code: pitch_info.map(|(pc, _)| pc),
        octave: pitch_info.map(|(_, o)| o).unwrap_or(0),
        underline: LowerLoopRole::None,
        overline: SlurRole::None,
    }
}

/// Convert a PitchCode back to its base ASCII character
fn pitch_code_to_base_char(
    pitch_code: crate::models::pitch_code::PitchCode,
    pitch_system: crate::models::elements::PitchSystem,
) -> char {
    let degree = pitch_code.degree();
    match pitch_system {
        crate::models::elements::PitchSystem::Number => {
            char::from_digit(degree as u32, 10).unwrap_or('?')
        }
        crate::models::elements::PitchSystem::Western => {
            match degree {
                1 => 'C', 2 => 'D', 3 => 'E', 4 => 'F',
                5 => 'G', 6 => 'A', 7 => 'B', _ => '?',
            }
        }
        crate::models::elements::PitchSystem::Sargam => {
            match degree {
                1 => 'S', 2 => 'R', 3 => 'G', 4 => 'M',
                5 => 'P', 6 => 'D', 7 => 'N', _ => '?',
            }
        }
        _ => char::from_digit(degree as u32, 10).unwrap_or('?'),
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

// ============================================================================
// SUPERSCRIPT ↔ NORMAL CONVERSION API
// ============================================================================

/// Convert a normal pitch codepoint to its superscript equivalent
///
/// This is used when the user presses Alt+O to convert selected pitches to grace notes.
/// The superscript codepoint encodes the same pitch information but renders at 50% scale.
///
/// Handles all codepoint formats:
/// - Base PUA pitches (0xE000-0xE5FF)
/// - Line variant pitches (0x1A000+) - preserves underline/overline
/// - ASCII pitches (0x20-0x7E)
///
/// # Arguments
/// * `normal_cp` - Normal pitch codepoint (ASCII, base PUA, or line variant PUA)
///
/// # Returns
/// * `Some(superscript_cp)` - The superscript codepoint (0xF8000+)
/// * `None` - If the codepoint cannot be converted
///
/// # Example
/// ```
/// // Normal "1" (0xE000) → Superscript "1" (0xF8600)
/// assert_eq!(to_superscript(0xE000), Some(0xF8600));
/// // Line variant "1" with underline → Superscript "1" with underline
/// assert_eq!(to_superscript(0x1A001), Some(0xF8601));
/// ```
pub fn to_superscript(normal_cp: u32) -> Option<u32> {
    // Decode to get base codepoint and line variant
    if let Some(ch) = char::from_u32(normal_cp) {
        let parts = GlyphParts::decode(ch);

        // Already a superscript - return as-is
        if parts.is_super {
            return Some(normal_cp);
        }

        // Convert line_variant (u8) to SuperscriptOverline enum
        let line_variant = SuperscriptOverline::from_index(parts.line_variant)
            .unwrap_or(SuperscriptOverline::None);

        // Convert base to superscript with preserved line variant
        superscript_glyph(parts.base_cp, line_variant)
            .map(|c| c as u32)
    } else {
        None
    }
}

/// Convert a superscript codepoint back to its normal equivalent
///
/// This is the inverse of `to_superscript`. Used when removing grace note status.
///
/// # Arguments
/// * `super_cp` - Superscript codepoint (0xF8000+)
///
/// # Returns
/// * `Some(normal_cp)` - The normal pitch codepoint
/// * `None` - If not a valid superscript codepoint
pub fn from_superscript(super_cp: u32) -> Option<u32> {
    if !is_superscript(super_cp) {
        return None;
    }

    // Remove line variant (last 4 bits)
    let base_offset = (super_cp % SUPERSCRIPT_LINE_VARIANTS) as u32;
    let without_variant = super_cp - base_offset;

    // Determine which system and convert back
    if without_variant >= SUPERSCRIPT_ASCII_BASE && without_variant < SUPERSCRIPT_NUMBER_BASE {
        // ASCII superscript - only 95 printable chars (0x20-0x7E)
        let source_offset = (without_variant - SUPERSCRIPT_ASCII_BASE) / SUPERSCRIPT_LINE_VARIANTS;
        if source_offset < 95 {
            Some(0x20 + source_offset)
        } else {
            None // Invalid - beyond printable ASCII range
        }
    } else if without_variant >= SUPERSCRIPT_NUMBER_BASE && without_variant < SUPERSCRIPT_WESTERN_BASE {
        // Number system - 7 chars × 30 variants = 210
        let source_offset = (without_variant - SUPERSCRIPT_NUMBER_BASE) / SUPERSCRIPT_LINE_VARIANTS;
        if source_offset < 210 {
            Some(0xE000 + source_offset)
        } else {
            None
        }
    } else if without_variant >= SUPERSCRIPT_WESTERN_BASE && without_variant < SUPERSCRIPT_SARGAM_BASE {
        // Western system - 7 chars × 30 variants = 210
        let source_offset = (without_variant - SUPERSCRIPT_WESTERN_BASE) / SUPERSCRIPT_LINE_VARIANTS;
        if source_offset < 210 {
            Some(0xE100 + source_offset)
        } else {
            None
        }
    } else if without_variant >= SUPERSCRIPT_SARGAM_BASE && without_variant < SUPERSCRIPT_DOREMI_BASE {
        // Sargam system - 12 chars × 30 variants = 360
        let source_offset = (without_variant - SUPERSCRIPT_SARGAM_BASE) / SUPERSCRIPT_LINE_VARIANTS;
        if source_offset < 360 {
            Some(0xE300 + source_offset)
        } else {
            None
        }
    } else if without_variant >= SUPERSCRIPT_DOREMI_BASE {
        // Doremi system - 7 chars × 30 variants = 210
        let source_offset = (without_variant - SUPERSCRIPT_DOREMI_BASE) / SUPERSCRIPT_LINE_VARIANTS;
        if source_offset < 210 {
            Some(0xE500 + source_offset)
        } else {
            None
        }
    } else {
        None
    }
}

/// Convert a character to superscript (WASM export)
///
/// Takes a normal character and returns its superscript codepoint.
/// Returns 0 if conversion not possible.
#[wasm_bindgen(js_name = toSuperscript)]
pub fn to_superscript_wasm(normal_cp: u32) -> u32 {
    to_superscript(normal_cp).unwrap_or(0)
}

/// Convert a superscript character back to normal (WASM export)
///
/// Takes a superscript codepoint and returns the normal codepoint.
/// Returns 0 if not a valid superscript.
#[wasm_bindgen(js_name = fromSuperscript)]
pub fn from_superscript_wasm(super_cp: u32) -> u32 {
    from_superscript(super_cp).unwrap_or(0)
}

/// Check if a character is a superscript (grace note) - for use in IR builder
pub fn is_grace_note_codepoint(cp: u32) -> bool {
    is_superscript(cp)
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

    // ============================================================================
    // DECODE_CHAR TESTS
    // ============================================================================

    #[test]
    fn test_decode_char_ascii_pitch() {
        // ASCII '1' should decode to N1 at octave 0, no lines
        let d = decode_char('1', PitchSystem::Number);
        assert_eq!(d.base_char, '1');
        assert_eq!(d.pitch_code, Some(PitchCode::N1));
        assert_eq!(d.octave, 0);
        assert_eq!(d.underline, LowerLoopRole::None);
        assert_eq!(d.overline, SlurRole::None);
        assert!(d.is_pitched());
        assert!(!d.has_lines());
    }

    #[test]
    fn test_decode_char_pitch_pua_with_octave() {
        // Pitch PUA for N1 at octave +1 should decode correctly
        let glyph = glyph_for_pitch(PitchCode::N1, 1, PitchSystem::Number).unwrap();
        let d = decode_char(glyph, PitchSystem::Number);
        assert_eq!(d.base_char, '1');
        assert_eq!(d.pitch_code, Some(PitchCode::N1));
        assert_eq!(d.octave, 1);
        assert_eq!(d.underline, LowerLoopRole::None);
        assert_eq!(d.overline, SlurRole::None);
    }

    #[test]
    fn test_decode_char_line_variant_underline() {
        use crate::renderers::line_variants::get_line_variant_codepoint;

        // Line variant for '1' with underline middle
        let line_char = get_line_variant_codepoint('1', LowerLoopRole::Middle, SlurRole::None)
            .unwrap();
        let d = decode_char(line_char, PitchSystem::Number);

        assert_eq!(d.base_char, '1');
        assert_eq!(d.pitch_code, Some(PitchCode::N1));
        assert_eq!(d.octave, 0); // Line variants don't preserve octave
        assert_eq!(d.underline, LowerLoopRole::Middle);
        assert_eq!(d.overline, SlurRole::None);
        assert!(d.has_lines());
    }

    #[test]
    fn test_decode_char_line_variant_overline() {
        use crate::renderers::line_variants::get_line_variant_codepoint;

        // Line variant for '2' with overline left
        let line_char = get_line_variant_codepoint('2', LowerLoopRole::None, SlurRole::Left)
            .unwrap();
        let d = decode_char(line_char, PitchSystem::Number);

        assert_eq!(d.base_char, '2');
        assert_eq!(d.pitch_code, Some(PitchCode::N2));
        assert_eq!(d.underline, LowerLoopRole::None);
        assert_eq!(d.overline, SlurRole::Left);
    }

    #[test]
    fn test_decode_char_line_variant_combined() {
        use crate::renderers::line_variants::get_line_variant_codepoint;

        // Line variant with both underline and overline
        let line_char = get_line_variant_codepoint('3', LowerLoopRole::Left, SlurRole::Right)
            .unwrap();
        let d = decode_char(line_char, PitchSystem::Number);

        assert_eq!(d.base_char, '3');
        assert_eq!(d.pitch_code, Some(PitchCode::N3));
        assert_eq!(d.underline, LowerLoopRole::Left);
        assert_eq!(d.overline, SlurRole::Right);
    }

    #[test]
    fn test_decode_char_non_pitched() {
        // Dash should decode with no pitch
        let d = decode_char('-', PitchSystem::Number);
        assert_eq!(d.base_char, '-');
        assert_eq!(d.pitch_code, None);
        assert_eq!(d.octave, 0);
        assert!(!d.is_pitched());

        // Space
        let d = decode_char(' ', PitchSystem::Number);
        assert_eq!(d.base_char, ' ');
        assert_eq!(d.pitch_code, None);
    }

    #[test]
    fn test_decode_char_unknown() {
        // Unknown character should return as-is
        let d = decode_char('x', PitchSystem::Number);
        assert_eq!(d.base_char, 'x');
        assert_eq!(d.pitch_code, None);
        assert_eq!(d.octave, 0);
        assert_eq!(d.underline, LowerLoopRole::None);
        assert_eq!(d.overline, SlurRole::None);
    }

    #[test]
    fn test_decode_char_sargam() {
        // Test with Sargam system
        let d = decode_char('S', PitchSystem::Sargam);
        assert_eq!(d.base_char, 'S');
        assert!(d.pitch_code.is_some());
        assert_eq!(d.octave, 0);
    }

    #[test]
    fn test_decode_char_line_variant_dash() {
        use crate::renderers::line_variants::get_line_variant_codepoint;

        // Line variant for dash (non-pitched) with underline
        let line_char = get_line_variant_codepoint('-', LowerLoopRole::Middle, SlurRole::None)
            .unwrap();
        let d = decode_char(line_char, PitchSystem::Number);

        assert_eq!(d.base_char, '-');
        assert_eq!(d.pitch_code, None); // Dash is not pitched
        assert_eq!(d.underline, LowerLoopRole::Middle);
        assert!(!d.is_pitched());
        assert!(d.has_lines());
    }

    // ============================================================================
    // SUPERSCRIPT CONVERSION TESTS
    // ============================================================================

    #[test]
    fn test_to_superscript_number_system() {
        // Number "1" at base octave (0xE000) → superscript (0xF8600)
        let result = to_superscript(0xE000);
        assert_eq!(result, Some(0xF8600));
    }

    #[test]
    fn test_to_superscript_ascii() {
        // ASCII '1' (0x31) → superscript ASCII
        let result = to_superscript(0x31);
        assert!(result.is_some());
        let cp = result.unwrap();
        assert!(cp >= 0xF8000 && cp < 0xF8600); // ASCII superscript range
    }

    #[test]
    fn test_to_superscript_line_variant() {
        // Line variant "1" with underline-left (0x1A001) should convert to
        // superscript "1" with underline-left preserved
        let line_variant_cp = 0x1A001u32; // Number "1" with underline-left
        let result = to_superscript(line_variant_cp);
        assert!(result.is_some(), "Should convert line variant codepoint");
        let super_cp = result.unwrap();
        // Should be in superscript range
        assert!(super_cp >= 0xF8000, "Should be superscript codepoint");
        // Should preserve underline-left (variant 1)
        assert_eq!(super_cp % 16, 1, "Should preserve underline-left variant");
    }

    #[test]
    fn test_to_superscript_from_superscript() {
        // Already superscript should return as-is
        let super_cp = 0xF8600u32;
        let result = to_superscript(super_cp);
        assert_eq!(result, Some(super_cp), "Superscript should return as-is");
    }

    #[test]
    fn test_from_superscript_number_system() {
        // Superscript 0xF8600 → normal 0xE000
        let result = from_superscript(0xF8600);
        assert_eq!(result, Some(0xE000));
    }

    #[test]
    fn test_from_superscript_ascii() {
        // First convert to superscript, then back
        let original = 0x31; // '1'
        let super_cp = to_superscript(original).unwrap();
        let back = from_superscript(super_cp);
        assert_eq!(back, Some(original));
    }

    #[test]
    fn test_superscript_round_trip_number() {
        // Test round-trip for all number system pitches
        for offset in 0..(7 * 30) {
            let normal = 0xE000 + offset;
            if let Some(super_cp) = to_superscript(normal) {
                let back = from_superscript(super_cp);
                assert_eq!(back, Some(normal), "Round-trip failed for 0x{:X}", normal);
            }
        }
    }

    #[test]
    fn test_superscript_round_trip_western() {
        // Test round-trip for Western system
        for offset in 0..(7 * 30) {
            let normal = 0xE100 + offset;
            if let Some(super_cp) = to_superscript(normal) {
                let back = from_superscript(super_cp);
                assert_eq!(back, Some(normal), "Round-trip failed for 0x{:X}", normal);
            }
        }
    }

    #[test]
    fn test_is_grace_note_codepoint() {
        // Superscript codepoints are grace notes
        assert!(is_grace_note_codepoint(0xF8600));
        assert!(is_grace_note_codepoint(0xF8000));

        // Normal codepoints are not grace notes
        assert!(!is_grace_note_codepoint(0xE000));
        assert!(!is_grace_note_codepoint(0x31));
    }

    #[test]
    fn test_from_superscript_invalid() {
        // Non-superscript codepoints should return None
        assert_eq!(from_superscript(0xE000), None);
        assert_eq!(from_superscript(0x31), None);
        assert_eq!(from_superscript(0), None);
    }

    // ============================================================================
    // GLYPH_EXT TRAIT TESTS
    // ============================================================================

    #[test]
    fn test_glyph_ext_underline_idempotence() {
        // ch.underline(X).underline(X) == ch.underline(X)
        let ch = glyph_for_pitch(PitchCode::N1, 0, PitchSystem::Number).unwrap();

        let once = ch.underline(LowerLoopRole::Left);
        let twice = ch.underline(LowerLoopRole::Left).underline(LowerLoopRole::Left);
        assert_eq!(once, twice, "Underline should be idempotent");

        let once_mid = ch.underline(LowerLoopRole::Middle);
        let twice_mid = ch.underline(LowerLoopRole::Middle).underline(LowerLoopRole::Middle);
        assert_eq!(once_mid, twice_mid, "Underline middle should be idempotent");
    }

    #[test]
    fn test_glyph_ext_superscript_idempotence() {
        // ch.superscript(true).superscript(true) == ch.superscript(true)
        let ch = glyph_for_pitch(PitchCode::N1, 0, PitchSystem::Number).unwrap();

        let once = ch.superscript(true);
        let twice = ch.superscript(true).superscript(true);
        assert_eq!(once, twice, "Superscript should be idempotent");
    }

    #[test]
    fn test_glyph_ext_superscript_toggle() {
        // ch.superscript(true).superscript(false) returns to original
        let ch = glyph_for_pitch(PitchCode::N1, 0, PitchSystem::Number).unwrap();

        let super_then_normal = ch.superscript(true).superscript(false);
        assert_eq!(ch, super_then_normal, "Superscript should toggle back to original");
    }

    #[test]
    fn test_glyph_ext_underline_remove() {
        // ch.underline(X).underline(None) removes underline
        let ch = glyph_for_pitch(PitchCode::N1, 0, PitchSystem::Number).unwrap();

        let with_underline = ch.underline(LowerLoopRole::Left);
        let removed = with_underline.underline(LowerLoopRole::None);
        assert_eq!(ch, removed, "Underline None should remove underline");
    }

    #[test]
    fn test_glyph_ext_order_independence_underline_overline() {
        // ch.underline(X).overline(Y) == ch.overline(Y).underline(X)
        let ch = glyph_for_pitch(PitchCode::N1, 0, PitchSystem::Number).unwrap();

        let under_over = ch.underline(LowerLoopRole::Left).overline(SlurRole::Middle);
        let over_under = ch.overline(SlurRole::Middle).underline(LowerLoopRole::Left);
        assert_eq!(under_over, over_under, "Underline and overline should commute");
    }

    #[test]
    fn test_glyph_ext_order_independence_superscript_underline() {
        // ch.superscript(true).underline(X) == ch.underline(X).superscript(true)
        let ch = glyph_for_pitch(PitchCode::N1, 0, PitchSystem::Number).unwrap();

        let super_under = ch.superscript(true).underline(LowerLoopRole::Left);
        let under_super = ch.underline(LowerLoopRole::Left).superscript(true);
        assert_eq!(super_under, under_super, "Superscript and underline should commute");
    }

    #[test]
    fn test_glyph_ext_order_independence_triple() {
        // All three transforms should commute
        let ch = glyph_for_pitch(PitchCode::N1, 0, PitchSystem::Number).unwrap();

        let result1 = ch.underline(LowerLoopRole::Left).overline(SlurRole::Right).superscript(true);
        let result2 = ch.superscript(true).underline(LowerLoopRole::Left).overline(SlurRole::Right);
        let result3 = ch.overline(SlurRole::Right).superscript(true).underline(LowerLoopRole::Left);

        assert_eq!(result1, result2, "All transforms should commute (1==2)");
        assert_eq!(result2, result3, "All transforms should commute (2==3)");
    }

    #[test]
    fn test_glyph_ext_roundtrip_decode_encode() {
        // For any transformed glyph, decode→encode should preserve it
        let ch = glyph_for_pitch(PitchCode::N1, 0, PitchSystem::Number).unwrap();

        // Transform with multiple operations
        let transformed = ch
            .underline(LowerLoopRole::Left)
            .overline(SlurRole::Middle)
            .superscript(true);

        // Decode and re-encode
        let parts = GlyphParts::decode(transformed);
        let re_encoded = parts.encode();

        assert_eq!(transformed, re_encoded, "Decode→encode should preserve glyph");
    }

    #[test]
    fn test_glyph_ext_non_pitch_no_panic() {
        // Non-pitched glyphs (dash, space) should not panic
        let dash = '-';
        let space = ' ';

        // These should all return self unchanged (no-op)
        assert_eq!(dash.octave(1), dash);
        assert_eq!(space.octave(-1), space);

        // Underline/overline might work on some chars
        let _ = dash.underline(LowerLoopRole::Left);
        let _ = space.superscript(true);
    }

    #[test]
    fn test_glyph_ext_checked_variants() {
        // try_superscript should return Some for valid transforms
        let ch = glyph_for_pitch(PitchCode::N1, 0, PitchSystem::Number).unwrap();

        let result = ch.try_superscript(true);
        assert!(result.is_some(), "try_superscript should succeed on pitch glyph");

        // Verify the result is actually a superscript
        let super_ch = result.unwrap();
        assert!(is_superscript(super_ch as u32), "Result should be a superscript codepoint");
    }

    #[test]
    fn test_glyph_ext_all_pitches_roundtrip() {
        // Test roundtrip for all natural pitches with transforms
        for pitch_code in [
            PitchCode::N1, PitchCode::N2, PitchCode::N3, PitchCode::N4,
            PitchCode::N5, PitchCode::N6, PitchCode::N7,
        ] {
            let ch = glyph_for_pitch(pitch_code, 0, PitchSystem::Number).unwrap();

            // Apply transforms
            let transformed = ch
                .underline(LowerLoopRole::Middle)
                .superscript(true);

            // Decode and verify state
            let parts = GlyphParts::decode(transformed);
            assert!(parts.is_super, "Should be superscript for {:?}", pitch_code);
            assert_eq!(parts.line_variant, 2, "Should have middle underline for {:?}", pitch_code);
        }
    }

    // ============================================================================
    // CODEPOINT_TRANSFORM TRAIT TESTS
    // ============================================================================

    #[test]
    fn test_codepoint_transform_slur_left() {
        use super::CodepointTransform;

        let ch = glyph_for_pitch(PitchCode::N1, 0, PitchSystem::Number).unwrap();
        let cp = ch as u32;

        // Base codepoint should not be a slur
        assert!(!cp.slur_left());
        assert!(!cp.slur_right());

        // Set overline Left (slur start)
        let with_slur_start = cp.set_overline(SlurRole::Left);
        assert!(with_slur_start.slur_left());
        assert!(!with_slur_start.slur_right());

        // Set overline Right (slur end)
        let with_slur_end = cp.set_overline(SlurRole::Right);
        assert!(!with_slur_end.slur_left());
        assert!(with_slur_end.slur_right());
    }

    #[test]
    fn test_codepoint_transform_overline_mid() {
        use super::CodepointTransform;

        let ch = glyph_for_pitch(PitchCode::N1, 0, PitchSystem::Number).unwrap();
        let cp = ch as u32;

        // Set middle overline
        let with_middle = cp.overline_mid(true);
        assert_eq!(with_middle.get_overline(), SlurRole::Middle);

        // Clear middle overline
        let without_middle = with_middle.overline_mid(false);
        assert_eq!(without_middle.get_overline(), SlurRole::None);

        // overline_mid should NOT change Left/Right markers
        let with_left = cp.set_overline(SlurRole::Left);
        let still_left = with_left.overline_mid(true);
        assert_eq!(still_left.get_overline(), SlurRole::Left, "overline_mid should not change Left");

        let with_right = cp.set_overline(SlurRole::Right);
        let still_right = with_right.overline_mid(false);
        assert_eq!(still_right.get_overline(), SlurRole::Right, "overline_mid should not change Right");
    }

    #[test]
    fn test_codepoint_transform_beat_underlines() {
        use super::CodepointTransform;

        let ch = glyph_for_pitch(PitchCode::N2, 0, PitchSystem::Number).unwrap();
        let cp = ch as u32;

        // Set underline Left (beat start)
        let with_beat_start = cp.set_underline(LowerLoopRole::Left);
        assert!(with_beat_start.beat_left());
        assert!(!with_beat_start.beat_right());

        // Set underline Right (beat end)
        let with_beat_end = cp.set_underline(LowerLoopRole::Right);
        assert!(!with_beat_end.beat_left());
        assert!(with_beat_end.beat_right());

        // Set middle underline
        let with_middle = cp.underline_mid(true);
        assert_eq!(with_middle.get_underline(), LowerLoopRole::Middle);
    }

    #[test]
    fn test_codepoint_transform_strip_lines() {
        use super::CodepointTransform;

        let ch = glyph_for_pitch(PitchCode::N3, 0, PitchSystem::Number).unwrap();
        let cp = ch as u32;

        // Add both underline and overline
        let decorated = cp
            .set_underline(LowerLoopRole::Left)
            .set_overline(SlurRole::Middle);

        // Strip lines
        let stripped = decorated.strip_lines();
        assert_eq!(stripped.get_underline(), LowerLoopRole::None);
        assert_eq!(stripped.get_overline(), SlurRole::None);
    }

    #[test]
    fn test_codepoint_transform_idempotent() {
        use super::CodepointTransform;

        let ch = glyph_for_pitch(PitchCode::N1, 0, PitchSystem::Number).unwrap();
        let cp = ch as u32;

        // overline_mid(true) should be idempotent
        let once = cp.overline_mid(true);
        let twice = once.overline_mid(true);
        assert_eq!(once, twice, "overline_mid(true) should be idempotent");

        // underline_mid(true) should be idempotent
        let once_u = cp.underline_mid(true);
        let twice_u = once_u.underline_mid(true);
        assert_eq!(once_u, twice_u, "underline_mid(true) should be idempotent");
    }

    #[test]
    fn test_codepoint_transform_to_char() {
        use super::CodepointTransform;

        let ch = glyph_for_pitch(PitchCode::N1, 0, PitchSystem::Number).unwrap();
        let cp = ch as u32;

        // to_char should return the original char
        assert_eq!(cp.to_char(), ch);

        // Invalid codepoint should return '?'
        let invalid: u32 = 0xFFFFFFFF;
        assert_eq!(invalid.to_char(), '?');
    }

    #[test]
    fn test_codepoint_transform_combined_operations() {
        use super::CodepointTransform;

        let ch = glyph_for_pitch(PitchCode::N4, 0, PitchSystem::Number).unwrap();
        let cp = ch as u32;

        // Combine slur start (overline Left) with beat middle (underline Middle)
        let combined = cp
            .set_overline(SlurRole::Left)
            .underline_mid(true);

        assert!(combined.slur_left(), "Should still have slur left");
        assert_eq!(combined.get_underline(), LowerLoopRole::Middle);

        // overline_mid should not affect Left
        let after_mid = combined.overline_mid(true);
        assert!(after_mid.slur_left(), "Should preserve slur left after overline_mid");
    }

    #[test]
    fn test_space_overline_middle() {
        use super::CodepointTransform;
        use crate::renderers::line_variants::pua;

        let space: u32 = ' ' as u32;  // 0x20
        let with_middle = space.set_overline(SlurRole::Middle);

        println!("Space codepoint: 0x{:X}", space);
        println!("After set_overline(Middle): 0x{:X}", with_middle);
        println!("Expected ASCII_OVERLINE_BASE: 0x{:X}", pua::ASCII_OVERLINE_BASE);

        // Expected: 0xE920 (ASCII_OVERLINE_BASE + 0)
        assert_eq!(with_middle, pua::ASCII_OVERLINE_BASE, "Space with Middle overline should be ASCII_OVERLINE_BASE");
    }

    // ============================================================================
    // DURABILITY TESTS - Exhaustive codepoint transformation invariant tests
    // ============================================================================

    /// Helper: get pitch system from codepoint range
    fn system_for_cp(cp: u32) -> Option<PitchSystem> {
        match cp {
            0xE000..=0xE0FF | 0x1A000..=0x1AFFF | 0xF8600..=0xF93FF => Some(PitchSystem::Number),
            0xE100..=0xE1FF | 0x1B000..=0x1BFFF | 0xF9400..=0xFA1FF => Some(PitchSystem::Western),
            0xE300..=0xE4FF | 0x1D000..=0x1EFFF | 0xFA200..=0xFAFFF => Some(PitchSystem::Sargam),
            // Doremi range (0xE500+) - use Number as fallback since Doremi not in PitchSystem enum
            0xE500..=0xE6FF | 0x1F000..=0x1FFFF | 0xFB000..=0xFBFFF => Some(PitchSystem::Number),
            _ => None,
        }
    }

    /// EXHAUSTIVE TEST: Every codepoint, every transformation
    /// Tests that transformations preserve all other attributes
    #[test]
    fn test_exhaustive_durability() {
        use crate::models::pitch_code::AccidentalType;

        let mut tested = 0;
        let mut failures = Vec::new();

        // Loop through ALL codepoints in the font's PUA ranges
        let all_cps: Vec<u32> = (0xE000..=0xEFFFu32)           // BMP PUA (pitch, ASCII lines)
            .chain(0x1A000..=0x1FFFFu32)                       // NOTE line variants
            .chain(0xF8000..=0x100000u32)                      // Superscript (Supplementary PUA-A)
            .collect();

        println!("Scanning {} potential codepoints for durability...", all_cps.len());

        for cp in all_cps {
            if let Some(ch) = char::from_u32(cp) {
                let system = system_for_cp(cp).unwrap_or(PitchSystem::Number);
                let original = decode_char(ch, system);
                let original_is_super = is_superscript(cp);

                // Test octave transformation preserves: pitch_code, underline, overline, superscript
                for oct in -2..=2i8 {
                    let transformed = ch.octave(oct);
                    let after = decode_char(transformed, system);
                    let after_is_super = is_superscript(transformed as u32);

                    // pitch_code (degree+accidental) must be preserved
                    if after.pitch_code != original.pitch_code {
                        failures.push(format!("octave({}) on 0x{:X} changed pitch_code: {:?} -> {:?}",
                            oct, cp, original.pitch_code, after.pitch_code));
                    }
                    // underline must be preserved
                    if after.underline != original.underline {
                        failures.push(format!("octave({}) on 0x{:X} changed underline: {:?} -> {:?}",
                            oct, cp, original.underline, after.underline));
                    }
                    // overline must be preserved
                    if after.overline != original.overline {
                        failures.push(format!("octave({}) on 0x{:X} changed overline: {:?} -> {:?}",
                            oct, cp, original.overline, after.overline));
                    }
                    // superscript must be preserved
                    if after_is_super != original_is_super {
                        failures.push(format!("octave({}) on 0x{:X} changed superscript: {} -> {}",
                            oct, cp, original_is_super, after_is_super));
                    }

                    // Octave roundtrip: ch.octave(x).octave(original) should preserve all properties
                    // Note: We compare semantic properties, not raw codepoints, because
                    // ASCII line variants may be canonicalized to NOTE line variants
                    let roundtrip = transformed.octave(original.octave);
                    let roundtrip_decoded = decode_char(roundtrip, system);
                    let roundtrip_is_super = is_superscript(roundtrip as u32);
                    if roundtrip_decoded.pitch_code != original.pitch_code ||
                       roundtrip_decoded.octave != original.octave ||
                       roundtrip_decoded.underline != original.underline ||
                       roundtrip_decoded.overline != original.overline ||
                       roundtrip_is_super != original_is_super {
                        failures.push(format!(
                            "octave roundtrip failed: 0x{:X}.octave({}).octave({}) = 0x{:X} - properties changed",
                            cp, oct, original.octave, roundtrip as u32
                        ));
                    }
                }

                // Test accidental transformation preserves: degree, octave, underline, overline, superscript
                // NOTE: Only test on codepoints that decode_char recognizes as pitches
                // (Some Sargam PUA codepoints aren't fully supported by decode_char yet)
                if original.pitch_code.is_some() {
                    for acc in [AccidentalType::None, AccidentalType::Sharp, AccidentalType::Flat,
                                AccidentalType::DoubleSharp, AccidentalType::DoubleFlat, AccidentalType::HalfFlat] {
                        let transformed = ch.accidental(acc);
                        let after = decode_char(transformed, system);
                        let after_is_super = is_superscript(transformed as u32);

                        // degree must be preserved (check via pitch_code.degree() if available)
                        let orig_degree = original.pitch_code.map(|p| p.degree());
                        let after_degree = after.pitch_code.map(|p| p.degree());
                        if orig_degree != after_degree {
                            failures.push(format!("accidental({:?}) on 0x{:X} changed degree: {:?} -> {:?}",
                                acc, cp, orig_degree, after_degree));
                        }
                        // octave must be preserved
                        if after.octave != original.octave {
                            failures.push(format!("accidental({:?}) on 0x{:X} changed octave: {} -> {}",
                                acc, cp, original.octave, after.octave));
                        }
                        // underline must be preserved
                        if after.underline != original.underline {
                            failures.push(format!("accidental({:?}) on 0x{:X} changed underline: {:?} -> {:?}",
                                acc, cp, original.underline, after.underline));
                        }
                        // overline must be preserved
                        if after.overline != original.overline {
                            failures.push(format!("accidental({:?}) on 0x{:X} changed overline: {:?} -> {:?}",
                                acc, cp, original.overline, after.overline));
                        }
                        // superscript must be preserved
                        if after_is_super != original_is_super {
                            failures.push(format!("accidental({:?}) on 0x{:X} changed superscript: {} -> {}",
                                acc, cp, original_is_super, after_is_super));
                        }
                    }
                }

                // Test underline transformation preserves: pitch_code, octave, overline, superscript
                for state in [LowerLoopRole::None, LowerLoopRole::Left, LowerLoopRole::Middle, LowerLoopRole::Right] {
                    let transformed = ch.underline(state);
                    let after = decode_char(transformed, system);
                    let after_is_super = is_superscript(transformed as u32);

                    if after.pitch_code != original.pitch_code {
                        failures.push(format!("underline({:?}) on 0x{:X} changed pitch_code: {:?} -> {:?}",
                            state, cp, original.pitch_code, after.pitch_code));
                    }
                    if after.octave != original.octave {
                        failures.push(format!("underline({:?}) on 0x{:X} changed octave: {} -> {}",
                            state, cp, original.octave, after.octave));
                    }
                    if after.overline != original.overline {
                        failures.push(format!("underline({:?}) on 0x{:X} changed overline: {:?} -> {:?}",
                            state, cp, original.overline, after.overline));
                    }
                    if after_is_super != original_is_super {
                        failures.push(format!("underline({:?}) on 0x{:X} changed superscript: {} -> {}",
                            state, cp, original_is_super, after_is_super));
                    }
                }

                // Test overline transformation preserves: pitch_code, octave, underline, superscript
                for state in [SlurRole::None, SlurRole::Left, SlurRole::Middle, SlurRole::Right] {
                    let transformed = ch.overline(state);
                    let after = decode_char(transformed, system);
                    let after_is_super = is_superscript(transformed as u32);

                    if after.pitch_code != original.pitch_code {
                        failures.push(format!("overline({:?}) on 0x{:X} changed pitch_code: {:?} -> {:?}",
                            state, cp, original.pitch_code, after.pitch_code));
                    }
                    if after.octave != original.octave {
                        failures.push(format!("overline({:?}) on 0x{:X} changed octave: {} -> {}",
                            state, cp, original.octave, after.octave));
                    }
                    if after.underline != original.underline {
                        failures.push(format!("overline({:?}) on 0x{:X} changed underline: {:?} -> {:?}",
                            state, cp, original.underline, after.underline));
                    }
                    if after_is_super != original_is_super {
                        failures.push(format!("overline({:?}) on 0x{:X} changed superscript: {} -> {}",
                            state, cp, original_is_super, after_is_super));
                    }
                }

                // Test superscript transformation preserves: pitch_code, octave, underline, overline
                let as_super = ch.superscript(true);
                let after_super = decode_char(as_super, system);

                if after_super.pitch_code != original.pitch_code {
                    failures.push(format!("superscript(true) on 0x{:X} changed pitch_code: {:?} -> {:?}",
                        cp, original.pitch_code, after_super.pitch_code));
                }
                if after_super.octave != original.octave {
                    failures.push(format!("superscript(true) on 0x{:X} changed octave: {} -> {}",
                        cp, original.octave, after_super.octave));
                }
                if after_super.underline != original.underline {
                    failures.push(format!("superscript(true) on 0x{:X} changed underline: {:?} -> {:?}",
                        cp, original.underline, after_super.underline));
                }
                if after_super.overline != original.overline {
                    failures.push(format!("superscript(true) on 0x{:X} changed overline: {:?} -> {:?}",
                        cp, original.overline, after_super.overline));
                }

                // Superscript roundtrip (if started non-super)
                if !original_is_super {
                    let roundtrip = as_super.superscript(false);
                    let after_rt = decode_char(roundtrip, system);
                    if after_rt.pitch_code != original.pitch_code ||
                       after_rt.octave != original.octave ||
                       after_rt.underline != original.underline ||
                       after_rt.overline != original.overline {
                        failures.push(format!("superscript roundtrip on 0x{:X} changed attributes", cp));
                    }
                }

                tested += 1;
            }
        }

        // Report results
        if !failures.is_empty() {
            let sample: Vec<_> = failures.iter().take(20).collect();
            panic!("Durability failures ({} of {} tested):\n{}{}",
                failures.len(), tested,
                sample.iter().map(|s| s.as_str()).collect::<Vec<_>>().join("\n"),
                if failures.len() > 20 { format!("\n... and {} more", failures.len() - 20) } else { String::new() }
            );
        }
        println!("Tested {} codepoints - all passed", tested);
    }

    /// Test mathematical invariants: commutativity, idempotence, roundtrip
    #[test]
    fn test_mathematical_invariants() {
        let mut failures = Vec::new();
        let mut tested = 0;

        // Test on a subset of pitch codepoints for performance
        // (Full exhaustive test is in test_exhaustive_durability)
        let test_cps: Vec<u32> = (0xE000..=0xE0D1u32)  // Number pitch PUA
            .chain(0xE100..=0xE1D1u32)                 // Western pitch PUA
            .collect();

        let octaves: [i8; 5] = [-2, -1, 0, 1, 2];
        let underlines = [LowerLoopRole::None, LowerLoopRole::Left, LowerLoopRole::Middle, LowerLoopRole::Right];
        let overlines = [SlurRole::None, SlurRole::Left, SlurRole::Middle, SlurRole::Right];

        for cp in test_cps {
            let ch = match char::from_u32(cp) {
                Some(c) => c,
                None => continue,
            };
            let system = system_for_cp(cp).unwrap_or(PitchSystem::Number);
            let original = decode_char(ch, system);

            // 1. COMMUTATIVITY: underline/overline order independence
            for &u in &underlines {
                for &o in &overlines {
                    let path1 = ch.underline(u).overline(o);
                    let path2 = ch.overline(o).underline(u);
                    if path1 != path2 {
                        failures.push(format!(
                            "Commutativity failed: 0x{:X}.underline({:?}).overline({:?}) != .overline.underline",
                            cp, u, o
                        ));
                    }
                }
            }

            // 2. COMMUTATIVITY: octave/underline order independence
            for &oct in &octaves {
                for &u in &underlines {
                    let path1 = ch.octave(oct).underline(u);
                    let path2 = ch.underline(u).octave(oct);
                    if path1 != path2 {
                        failures.push(format!(
                            "Commutativity failed: 0x{:X}.octave({}).underline({:?}) != .underline.octave",
                            cp, oct, u
                        ));
                    }
                }
            }

            // 3. IDEMPOTENCE: same transform twice = once
            for &oct in &octaves {
                let once = ch.octave(oct);
                let twice = ch.octave(oct).octave(oct);
                if once != twice {
                    failures.push(format!("Idempotence failed: 0x{:X}.octave({}) twice != once", cp, oct));
                }
            }
            for &u in &underlines {
                let once = ch.underline(u);
                let twice = ch.underline(u).underline(u);
                if once != twice {
                    failures.push(format!("Idempotence failed: 0x{:X}.underline({:?}) twice != once", cp, u));
                }
            }

            // 4. MULTI-HOP OCTAVE ROUNDTRIP: ch.octave(a).octave(b).octave(c).octave(orig) == ch
            for &a in &octaves {
                for &b in &octaves {
                    for &c in &octaves {
                        let result = ch.octave(a).octave(b).octave(c).octave(original.octave);
                        if result != ch {
                            failures.push(format!(
                                "3-hop octave failed: 0x{:X}.octave({}).octave({}).octave({}).octave({}) != original",
                                cp, a, b, c, original.octave
                            ));
                        }
                    }
                }
            }

            // 5. FULL ROUNDTRIP: complex chain returning to original
            let complex_roundtrip = ch
                .octave(1)
                .underline(LowerLoopRole::Left)
                .overline(SlurRole::Middle)
                .superscript(true)
                .octave(-1)
                .underline(LowerLoopRole::None)
                .overline(SlurRole::None)
                .superscript(false)
                .octave(original.octave)
                .underline(original.underline)
                .overline(original.overline);

            if complex_roundtrip != ch {
                failures.push(format!(
                    "Complex roundtrip failed: 0x{:X} -> 0x{:X}",
                    cp, complex_roundtrip as u32
                ));
            }

            tested += 1;
        }

        if !failures.is_empty() {
            let sample: Vec<_> = failures.iter().take(20).collect();
            panic!("Mathematical invariant failures ({}):\n{}{}",
                failures.len(),
                sample.iter().map(|s| s.as_str()).collect::<Vec<_>>().join("\n"),
                if failures.len() > 20 { format!("\n... and {} more", failures.len() - 20) } else { String::new() }
            );
        }
        println!("Tested {} codepoints for mathematical invariants - all passed", tested);
    }
}
