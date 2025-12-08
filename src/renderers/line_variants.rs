//! Line variant glyph mapping
//!
//! Maps base glyphs to 19 line variant PUA codepoints based on underline/overline state.
//! Used by both document model (compute_line_variants) and text export.

/// Line-capable characters that have 19 line variants in the font
pub const LINE_CAPABLE_CHARS: &[char] = &[
    // Number system (7 chars)
    '1', '2', '3', '4', '5', '6', '7',
    // Western system (14 chars)
    'A', 'B', 'C', 'D', 'E', 'F', 'G', 'a', 'b', 'c', 'd', 'e', 'f', 'g',
    // Sargam system (12 chars) - S r R g G m M P d D n N
    'S', 'r', 'R', 'g', 'G', 'm', 'M', 'P', 'd', 'D', 'n', 'N',
    // Special characters
    '-',  // Dash (rest/extension)
    '\'', // Breath mark
    ' ',  // Space (can have lines for beat grouping)
    '\u{00A0}', // Non-breaking space (NBSP)
];

/// PUA bases for 19 line variant system
pub mod pua {
    pub const UNDERLINE_BASE: u32 = 0xE800;  // 37 chars × 4 variants
    pub const OVERLINE_BASE: u32 = 0xE900;   // 37 chars × 3 variants
    pub const COMBINED_BASE: u32 = 0xEA00;   // 37 chars × 12 variants
}

/// Underline state for line variants
#[derive(Clone, Copy, PartialEq, Debug)]
pub enum UnderlineState {
    None,
    Middle,  // Inside beat group
    Left,    // Start of beat group (left arc)
    Right,   // End of beat group (right arc)
    Both,    // Single-note beat (both arcs)
}

/// Overline state for line variants
#[derive(Clone, Copy, PartialEq, Debug)]
pub enum OverlineState {
    None,
    Middle,  // Inside slur
    Left,    // Start of slur (left arc)
    Right,   // End of slur (right arc)
}

/// Get the 19-variant line codepoint for a character
///
/// Returns None if:
/// - Character is not in LINE_CAPABLE_CHARS
/// - Both underline and overline are None (plain character)
pub fn get_line_variant_codepoint(
    base_char: char,
    underline: UnderlineState,
    overline: OverlineState,
) -> Option<char> {
    // Find character index in LINE_CAPABLE_CHARS
    let char_index = LINE_CAPABLE_CHARS.iter().position(|&c| c == base_char)?;

    // No line needed - return None to use plain character
    if underline == UnderlineState::None && overline == OverlineState::None {
        return None;
    }

    // Calculate variant index and PUA codepoint based on line states
    let variant_cp = match (underline, overline) {
        // Underline-only (indices 0-3)
        (UnderlineState::Middle, OverlineState::None) => {
            pua::UNDERLINE_BASE + (char_index as u32 * 4) + 0
        }
        (UnderlineState::Left, OverlineState::None) => {
            pua::UNDERLINE_BASE + (char_index as u32 * 4) + 1
        }
        (UnderlineState::Right, OverlineState::None) => {
            pua::UNDERLINE_BASE + (char_index as u32 * 4) + 2
        }
        (UnderlineState::Both, OverlineState::None) => {
            pua::UNDERLINE_BASE + (char_index as u32 * 4) + 3
        }

        // Overline-only (indices 0-2 relative to overline base)
        (UnderlineState::None, OverlineState::Middle) => {
            pua::OVERLINE_BASE + (char_index as u32 * 3) + 0
        }
        (UnderlineState::None, OverlineState::Left) => {
            pua::OVERLINE_BASE + (char_index as u32 * 3) + 1
        }
        (UnderlineState::None, OverlineState::Right) => {
            pua::OVERLINE_BASE + (char_index as u32 * 3) + 2
        }

        // Combined (4 underline × 3 overline = 12 variants)
        (u, o) => {
            // Map underline state to index 0-3
            let u_idx = match u {
                UnderlineState::Middle => 0,
                UnderlineState::Left => 1,
                UnderlineState::Right => 2,
                UnderlineState::Both => 3,
                UnderlineState::None => return None,
            };
            // Map overline state to index 0-2
            let o_idx = match o {
                OverlineState::Middle => 0,
                OverlineState::Left => 1,
                OverlineState::Right => 2,
                OverlineState::None => return None,
            };
            // Combined variant index: u_idx * 3 + o_idx
            pua::COMBINED_BASE + (char_index as u32 * 12) + (u_idx * 3 + o_idx)
        }
    };

    char::from_u32(variant_cp)
}

/// Check if a character is line-capable (can have underline/overline variants)
pub fn is_line_capable(c: char) -> bool {
    LINE_CAPABLE_CHARS.contains(&c)
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
