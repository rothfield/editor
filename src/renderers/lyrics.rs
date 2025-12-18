//! Lyrics Distribution - Lilypond-style FSM Algorithm
//!
//! Implements finite state machine for distributing lyrics syllables to pitched elements,
//! respecting slurs (melismas) where multiple notes share one syllable.

use serde::{Serialize, Deserialize};
use crate::models::{Cell, ElementKind};

/// Represents a syllable assigned to a cell
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SyllableAssignment {
    /// Index of the cell this syllable is assigned to
    pub cell_index: usize,

    /// The syllable text
    pub syllable: String,
}

/// FSM states for lyrics distribution
#[derive(Debug, Clone, Copy, PartialEq)]
enum LyricsState {
    /// Looking for next pitch to assign syllable
    SeekingPitch,

    /// Inside a slur (melisma), skip pitches
    InMelisma,

    /// Just assigned a syllable, ready for next
    SyllableAssigned,
}

/// Parse lyrics string into syllables
///
/// Splits on whitespace and hyphens, preserving hyphen indicators.
///
/// # Examples
/// - "hello world" -> ["hello", "world"]
/// - "hel-lo wor-ld" -> ["hel-", "lo", "wor-", "ld"]
/// - "he--llo" -> ["he-", "-", "llo"]
///
/// # Arguments
/// * `lyrics` - Raw lyrics string
///
/// # Returns
/// Array of syllable strings
pub fn parse_lyrics(lyrics: &str) -> Vec<String> {
    let lyrics = lyrics.trim();
    if lyrics.is_empty() {
        return Vec::new();
    }

    let mut syllables = Vec::new();
    let words: Vec<&str> = lyrics.split_whitespace().collect();

    for word in words {
        if word.is_empty() {
            continue;
        }

        // Split on hyphens but track them
        let mut current_part = String::new();
        let chars: Vec<char> = word.chars().collect();
        let mut i = 0;

        while i < chars.len() {
            let ch = chars[i];

            if ch == '-' {
                if !current_part.is_empty() {
                    // Add the part with hyphen
                    current_part.push('-');
                    syllables.push(current_part.clone());
                    current_part.clear();
                } else {
                    // Standalone hyphen (from "he--llo")
                    syllables.push("-".to_string());
                }
            } else {
                current_part.push(ch);

                // Check if this is the last char or next char is hyphen
                if i + 1 >= chars.len() {
                    // Last character, add part
                    syllables.push(current_part.clone());
                    current_part.clear();
                } else if chars[i + 1] == '-' {
                    // Next char is hyphen, will be handled in next iteration
                    // Don't push yet
                } else {
                    // Regular continuation, keep building
                }
            }

            i += 1;
        }

        // Flush any remaining part (word without hyphen at end)
        if !current_part.is_empty() {
            syllables.push(current_part);
        }
    }

    syllables
}

/// Distribute syllables to pitch elements, respecting slurs (melismas)
///
/// # Algorithm (FSM)
/// 1. Parse lyrics into syllables
/// 2. Scan cells left to right
/// 3. For each pitched element:
///    - If in melisma (inside slur), skip (no syllable)
///    - If slur starts here, assign syllable and enter melisma state
///    - If normal pitch, assign syllable
/// 4. Track slur depth for nested slurs
///
/// # Arguments
/// * `lyrics` - Raw lyrics string
/// * `cells` - Array of Cell objects from the line
///
/// # Returns
/// Array of syllable assignments (cell index and syllable text)
pub fn distribute_lyrics(lyrics: &str, cells: &[Cell]) -> Vec<SyllableAssignment> {
    let syllables = parse_lyrics(lyrics);
    let mut assignments = Vec::new();

    if syllables.is_empty() || cells.is_empty() {
        return assignments;
    }

    let mut syllable_index = 0;
    let mut state = LyricsState::SeekingPitch;
    let mut slur_depth: i32 = 0; // Track nested slurs

    for (cell_index, cell) in cells.iter().enumerate() {
        // Only process pitched elements
        if !matches!(cell.get_kind(), ElementKind::PitchedElement) {
            continue;
        }

        // Track slur state using cell methods
        if cell.is_slur_start() {
            // Slur starts - assign syllable to this pitch, then enter melisma
            if syllable_index < syllables.len() {
                assignments.push(SyllableAssignment {
                    cell_index,
                    syllable: syllables[syllable_index].clone(),
                });
                syllable_index += 1;
            }

            slur_depth += 1;
            state = LyricsState::InMelisma;
            continue;
        } else if cell.is_slur_end() {
            // Slur ends - this pitch is still part of melisma, don't assign
            slur_depth = slur_depth.saturating_sub(1);

            if slur_depth == 0 {
                state = LyricsState::SeekingPitch;
            }
            continue;
        } else {
            // Normal pitch or inside melisma
            if state == LyricsState::InMelisma {
                // Inside slur - skip this pitch (part of melisma)
                continue;
            }

            // Assign syllable to this pitch
            if syllable_index < syllables.len() {
                assignments.push(SyllableAssignment {
                    cell_index,
                    syllable: syllables[syllable_index].clone(),
                });
                syllable_index += 1;
                state = LyricsState::SyllableAssigned;
            }
        }
    }

    assignments
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_lyrics_simple() {
        let result = parse_lyrics("hello world");
        assert_eq!(result, vec!["hello", "world"]);
    }

    #[test]
    fn test_parse_lyrics_with_hyphens() {
        let result = parse_lyrics("hel-lo wor-ld");
        assert_eq!(result, vec!["hel-", "lo", "wor-", "ld"]);
    }

    #[test]
    fn test_parse_lyrics_double_hyphens() {
        let result = parse_lyrics("he--llo");
        assert_eq!(result, vec!["he-", "-", "llo"]);
    }

    #[test]
    fn test_parse_lyrics_empty() {
        let result = parse_lyrics("");
        assert_eq!(result.len(), 0);
    }

    #[test]
    fn test_distribute_lyrics_simple() {
        let lyrics = "do re mi";
        let cells = vec![
            Cell::new("S".to_string(), ElementKind::PitchedElement),
            Cell::new("R".to_string(), ElementKind::PitchedElement),
            Cell::new("G".to_string(), ElementKind::PitchedElement),
        ];

        let assignments = distribute_lyrics(lyrics, &cells);
        assert_eq!(assignments.len(), 3);
        assert_eq!(assignments[0].cell_index, 0);
        assert_eq!(assignments[0].syllable, "do");
        assert_eq!(assignments[1].cell_index, 1);
        assert_eq!(assignments[1].syllable, "re");
        assert_eq!(assignments[2].cell_index, 2);
        assert_eq!(assignments[2].syllable, "mi");
    }
}
