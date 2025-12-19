//! Line variant glyph mapping
//!
//! Maps base glyphs to 15 line variant PUA codepoints based on underline/overline state.
//! Used by both document model (compute_line_variants) and text export.
//!
//! Variant structure (15 total per character):
//! - 0-2: underline-only (middle, left, right)
//! - 3-5: overline-only (middle, left, right)
//! - 6-14: combined (3 underline × 3 overline)

/// PUA bases for 15-variant line system
///
/// Architecture: Each notation system has 15 line variants per glyph:
/// - 0-2: underline-only (middle, left, right)
/// - 3-5: overline-only (middle, left, right)
/// - 6-14: combined (3 underline × 3 overline)
///
/// Formula: line_cp = LINE_BASE + (note_offset × 15) + variant_idx
pub mod pua {
    // ASCII printable (0x20-0x7E = 95 chars)
    pub const ASCII_UNDERLINE_BASE: u32 = 0xE800;  // 95 chars × 3 variants = 285
    pub const ASCII_OVERLINE_BASE: u32 = 0xE920;   // 95 chars × 3 variants = 285
    pub const ASCII_COMBINED_BASE: u32 = 0xEA40;   // 95 chars × 9 variants = 855

    // PUA note line variants (all accidentals pre-composed into system ranges)
    // Each system: note_count × 15 variants
    pub const NUMBER_LINE_BASE: u32 = 0x1A000;   // 210 notes (1234567) × 15 = 3,150
    pub const WESTERN_LINE_BASE: u32 = 0x1B000;  // 210 notes (CDEFGAB) × 15 = 3,150
    pub const SARGAM_LINE_BASE: u32 = 0x1D000;   // 360 notes (SrRgGmMPdDnN) × 15 = 5,400
    pub const DOREMI_LINE_BASE: u32 = 0x1F000;   // 210 notes (drmfslt) × 15 = 3,150

    // PUA note source bases (for calculating offsets)
    // Each char has 30 variants: 6 accidentals × 5 octaves
    pub const NUMBER_SOURCE_BASE: u32 = 0xE000;   // 7 chars (1234567) × 30 = 210
    pub const WESTERN_SOURCE_BASE: u32 = 0xE100;  // 7 chars (CDEFGAB) × 30 = 210
    pub const SARGAM_SOURCE_BASE: u32 = 0xE300;   // 12 chars (SrRgGmMPdDnN) × 30 = 360
    pub const DOREMI_SOURCE_BASE: u32 = 0xE500;   // 7 chars (drmfslt) × 30 = 210
}

use serde::{Serialize, Deserialize};

/// Lower loop role for beat grouping (visual underline)
///
/// "Lower loop" describes the visual appearance: a curved line below notes
/// that connects subdivisions within a beat. Also known as "beat grouping".
#[derive(Clone, Copy, PartialEq, Eq, Debug, Default, Serialize, Deserialize)]
pub enum LowerLoopRole {
    #[default]
    None,
    Middle,  // Inside beat group (derived from Left/Right anchors)
    Left,    // Start of beat group (left arc) - authoritative anchor
    Right,   // End of beat group (right arc) - authoritative anchor
}

/// Slur role for musical slurs (visual overline)
///
/// "Slur" is a well-known musical term for a curved line above notes
/// indicating legato or phrase grouping.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Default, Serialize, Deserialize)]
pub enum SlurRole {
    #[default]
    None,
    Middle,  // Inside slur (derived from Left/Right anchors)
    Left,    // Start of slur (left arc) - authoritative anchor
    Right,   // End of slur (right arc) - authoritative anchor
}

// Backward compatibility aliases (deprecated)
#[deprecated(note = "Use LowerLoopRole instead")]
pub type UnderlineState = LowerLoopRole;
#[deprecated(note = "Use SlurRole instead")]
pub type OverlineState = SlurRole;

/// Check if a character is ASCII printable (line-capable)
pub fn is_ascii_line_capable(c: char) -> bool {
    c >= ' ' && c <= '~'  // 0x20-0x7E
}

/// Check if a codepoint is a PUA note (line-capable)
///
/// All notation system glyphs use the 30-variant architecture where each
/// base character gets 30 codepoints for accidental+octave combinations.
/// Accidentals are pre-composed into these ranges, not separate.
pub fn is_pua_note_line_capable(cp: u32) -> bool {
    matches!(cp,
        // Natural notes with all accidental+octave variants
        0xE000..=0xE0D1 |  // number: 7 chars (1234567) × 30 = 210 glyphs
        0xE100..=0xE1D1 |  // western: 7 chars (CDEFGAB) × 30 = 210 glyphs
        0xE300..=0xE467 |  // sargam: 12 chars (SrRgGmMPdDnN) × 30 = 360 glyphs
        0xE500..=0xE5D1    // doremi: 7 chars (drmfslt) × 30 = 210 glyphs
    )
}

/// Check if a character is line-capable (can have underline/overline variants)
pub fn is_line_capable(c: char) -> bool {
    let cp = c as u32;
    is_ascii_line_capable(c) || is_pua_note_line_capable(cp)
}

/// Get the 15-variant line codepoint for an ASCII character
///
/// Returns None if:
/// - Character is not ASCII printable (0x20-0x7E)
/// - Both underline and overline are None (plain character)
pub fn get_line_variant_codepoint(
    base_char: char,
    underline: LowerLoopRole,
    overline: SlurRole,
) -> Option<char> {
    // Only ASCII printable characters
    if !is_ascii_line_capable(base_char) {
        return None;
    }

    // No line needed - return None to use plain character
    if underline == LowerLoopRole::None && overline == SlurRole::None {
        return None;
    }

    // Calculate char index (0-94 for ASCII printable)
    let char_index = (base_char as u32) - 0x20;

    // Calculate variant index and PUA codepoint based on line states
    let variant_cp = match (underline, overline) {
        // Underline-only (indices 0-2)
        (LowerLoopRole::Middle, SlurRole::None) => {
            pua::ASCII_UNDERLINE_BASE + (char_index * 3) + 0
        }
        (LowerLoopRole::Left, SlurRole::None) => {
            pua::ASCII_UNDERLINE_BASE + (char_index * 3) + 1
        }
        (LowerLoopRole::Right, SlurRole::None) => {
            pua::ASCII_UNDERLINE_BASE + (char_index * 3) + 2
        }

        // Overline-only (indices 0-2)
        (LowerLoopRole::None, SlurRole::Middle) => {
            pua::ASCII_OVERLINE_BASE + (char_index * 3) + 0
        }
        (LowerLoopRole::None, SlurRole::Left) => {
            pua::ASCII_OVERLINE_BASE + (char_index * 3) + 1
        }
        (LowerLoopRole::None, SlurRole::Right) => {
            pua::ASCII_OVERLINE_BASE + (char_index * 3) + 2
        }

        // Combined (3 underline × 3 overline = 9 variants)
        (u, o) => {
            // Map underline state to index 0-2
            let u_idx = match u {
                LowerLoopRole::Middle => 0,
                LowerLoopRole::Left => 1,
                LowerLoopRole::Right => 2,
                LowerLoopRole::None => return None,
            };
            // Map overline state to index 0-2
            let o_idx = match o {
                SlurRole::Middle => 0,
                SlurRole::Left => 1,
                SlurRole::Right => 2,
                SlurRole::None => return None,
            };
            // Combined variant index: u_idx * 3 + o_idx
            pua::ASCII_COMBINED_BASE + (char_index * 9) + (u_idx * 3 + o_idx)
        }
    };

    char::from_u32(variant_cp)
}

/// Get the 15-variant line codepoint for a PUA note
///
/// Returns None if:
/// - Codepoint is not a PUA note (0xE000-0xE6A3)
/// - Both underline and overline are None (plain note)
///
/// Note: Accidentals are pre-composed into each system's range, so a sharp
/// note like N1s (0xE019) is within the number system range and gets its
/// line variants from NUMBER_LINE_BASE.
pub fn get_pua_note_line_variant_codepoint(
    note_cp: u32,
    underline: LowerLoopRole,
    overline: SlurRole,
) -> Option<char> {
    // No line needed - return None to use plain note
    if underline == LowerLoopRole::None && overline == SlurRole::None {
        return None;
    }

    // Determine which system this note belongs to and get the line base
    // Note: Each system includes all accidental variants (30 per char: 6 acc × 5 oct)
    let (source_base, line_base) = if note_cp >= pua::NUMBER_SOURCE_BASE && note_cp < pua::NUMBER_SOURCE_BASE + 210 {
        (pua::NUMBER_SOURCE_BASE, pua::NUMBER_LINE_BASE)
    } else if note_cp >= pua::WESTERN_SOURCE_BASE && note_cp < pua::WESTERN_SOURCE_BASE + 210 {
        (pua::WESTERN_SOURCE_BASE, pua::WESTERN_LINE_BASE)
    } else if note_cp >= pua::SARGAM_SOURCE_BASE && note_cp < pua::SARGAM_SOURCE_BASE + 360 {
        (pua::SARGAM_SOURCE_BASE, pua::SARGAM_LINE_BASE)
    } else if note_cp >= pua::DOREMI_SOURCE_BASE && note_cp < pua::DOREMI_SOURCE_BASE + 210 {
        (pua::DOREMI_SOURCE_BASE, pua::DOREMI_LINE_BASE)
    } else {
        return None;
    };

    // Calculate note offset within its system
    let note_offset = note_cp - source_base;

    // Calculate variant index (0-14)
    let variant_idx = match (underline, overline) {
        // Underline-only (indices 0-2)
        (LowerLoopRole::Middle, SlurRole::None) => 0,
        (LowerLoopRole::Left, SlurRole::None) => 1,
        (LowerLoopRole::Right, SlurRole::None) => 2,

        // Overline-only (indices 3-5)
        (LowerLoopRole::None, SlurRole::Middle) => 3,
        (LowerLoopRole::None, SlurRole::Left) => 4,
        (LowerLoopRole::None, SlurRole::Right) => 5,

        // Combined (indices 6-14)
        (u, o) => {
            let u_idx = match u {
                LowerLoopRole::Middle => 0,
                LowerLoopRole::Left => 1,
                LowerLoopRole::Right => 2,
                LowerLoopRole::None => return None,
            };
            let o_idx = match o {
                SlurRole::Middle => 0,
                SlurRole::Left => 1,
                SlurRole::Right => 2,
                SlurRole::None => return None,
            };
            6 + (u_idx * 3 + o_idx)
        }
    };

    // Calculate target codepoint: line_base + (note_offset × 15) + variant_idx
    let target_cp = line_base + (note_offset * 15) + variant_idx;
    char::from_u32(target_cp)
}

/// Encode an ASCII character with line variants into a PUA codepoint
///
/// Supports any printable ASCII char (0x20-0x7E) with underline and/or overline.
/// Returns None if:
/// - Character is not printable ASCII
/// - Both underline and overline are None (use plain char)
pub fn encode_ascii_line_variant(
    ch: char,
    underline: LowerLoopRole,
    overline: SlurRole,
) -> Option<char> {
    // Only handle printable ASCII
    if !is_ascii_line_capable(ch) {
        return None;
    }

    // No line needed - return None to use plain char
    if underline == LowerLoopRole::None && overline == SlurRole::None {
        return None;
    }

    let char_index = (ch as u32) - 0x20;

    let cp = match (underline, overline) {
        // Underline-only: 0xE800 + (char_index * 3) + variant
        (LowerLoopRole::Middle, SlurRole::None) => pua::ASCII_UNDERLINE_BASE + (char_index * 3) + 0,
        (LowerLoopRole::Left, SlurRole::None) => pua::ASCII_UNDERLINE_BASE + (char_index * 3) + 1,
        (LowerLoopRole::Right, SlurRole::None) => pua::ASCII_UNDERLINE_BASE + (char_index * 3) + 2,

        // Overline-only: 0xE920 + (char_index * 3) + variant
        (LowerLoopRole::None, SlurRole::Middle) => pua::ASCII_OVERLINE_BASE + (char_index * 3) + 0,
        (LowerLoopRole::None, SlurRole::Left) => pua::ASCII_OVERLINE_BASE + (char_index * 3) + 1,
        (LowerLoopRole::None, SlurRole::Right) => pua::ASCII_OVERLINE_BASE + (char_index * 3) + 2,

        // Combined: 0xEA40 + (char_index * 9) + (u_idx * 3 + o_idx)
        (u, o) => {
            let u_idx = match u {
                LowerLoopRole::Middle => 0,
                LowerLoopRole::Left => 1,
                LowerLoopRole::Right => 2,
                LowerLoopRole::None => return None,
            };
            let o_idx = match o {
                SlurRole::Middle => 0,
                SlurRole::Left => 1,
                SlurRole::Right => 2,
                SlurRole::None => return None,
            };
            pua::ASCII_COMBINED_BASE + (char_index * 9) + (u_idx * 3 + o_idx)
        }
    };

    char::from_u32(cp)
}

/// Result of decoding a PUA line variant character
#[derive(Clone, Debug, PartialEq)]
pub struct DecodedLineVariant {
    /// The base character or codepoint
    pub base_char: char,
    /// Lower loop role (beat grouping underline)
    pub underline: LowerLoopRole,
    /// Slur role (slur overline)
    pub overline: SlurRole,
}

/// Decode a PUA line variant codepoint into its components
///
/// Given a PUA codepoint from the ASCII line variant ranges (0xE800-0xEDB3),
/// returns the base character and line states. Returns None if the
/// codepoint is not in a line variant range.
pub fn decode_line_variant(ch: char) -> Option<DecodedLineVariant> {
    let cp = ch as u32;
    const NUM_ASCII_CHARS: u32 = 95;

    // Check ASCII underline-only range: 0xE800 + (char_index * 3) + variant
    if cp >= pua::ASCII_UNDERLINE_BASE && cp < pua::ASCII_UNDERLINE_BASE + NUM_ASCII_CHARS * 3 {
        let offset = cp - pua::ASCII_UNDERLINE_BASE;
        let char_index = offset / 3;
        let variant = offset % 3;

        let underline = match variant {
            0 => LowerLoopRole::Middle,
            1 => LowerLoopRole::Left,
            2 => LowerLoopRole::Right,
            _ => return None,
        };
        return Some(DecodedLineVariant {
            base_char: char::from_u32(0x20 + char_index)?,
            underline,
            overline: SlurRole::None,
        });
    }

    // Check ASCII overline-only range: 0xE920 + (char_index * 3) + variant
    if cp >= pua::ASCII_OVERLINE_BASE && cp < pua::ASCII_OVERLINE_BASE + NUM_ASCII_CHARS * 3 {
        let offset = cp - pua::ASCII_OVERLINE_BASE;
        let char_index = offset / 3;
        let variant = offset % 3;

        let overline = match variant {
            0 => SlurRole::Middle,
            1 => SlurRole::Left,
            2 => SlurRole::Right,
            _ => return None,
        };
        return Some(DecodedLineVariant {
            base_char: char::from_u32(0x20 + char_index)?,
            underline: LowerLoopRole::None,
            overline,
        });
    }

    // Check ASCII combined range: 0xEA40 + (char_index * 9) + (u_idx * 3 + o_idx)
    if cp >= pua::ASCII_COMBINED_BASE && cp < pua::ASCII_COMBINED_BASE + NUM_ASCII_CHARS * 9 {
        let offset = cp - pua::ASCII_COMBINED_BASE;
        let char_index = offset / 9;
        let combined_variant = offset % 9;
        let u_idx = combined_variant / 3;
        let o_idx = combined_variant % 3;

        let underline = match u_idx {
            0 => LowerLoopRole::Middle,
            1 => LowerLoopRole::Left,
            2 => LowerLoopRole::Right,
            _ => return None,
        };
        let overline = match o_idx {
            0 => SlurRole::Middle,
            1 => SlurRole::Left,
            2 => SlurRole::Right,
            _ => return None,
        };
        return Some(DecodedLineVariant {
            base_char: char::from_u32(0x20 + char_index)?,
            underline,
            overline,
        });
    }

    None
}

/// Extract the first character from a string for line variant lookup
/// Returns the char if it's line-capable, None otherwise
pub fn get_base_char_for_line_variant(s: &str) -> Option<char> {
    let c = s.chars().next()?;
    if is_line_capable(c) {
        Some(c)
    } else {
        None
    }
}
