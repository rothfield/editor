//! Lyrics Distribution - Lilypond-style FSM Algorithm
//!
//! Implements finite state machine for distributing lyrics syllables to pitched elements,
//! respecting slurs (melismas) where multiple notes share one syllable.

use serde::{Serialize, Deserialize};
use crate::models::{Cell, ElementKind, SlurIndicator};

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
/// Splits on whitespace and hyphens, PRESERVING spaces and hyphen indicators.
///
/// # Examples
/// - "hello world" -> ["hello", " ", "world"]
/// - "hel-lo wor-ld" -> ["hel-", "lo", " ", "wor-", "ld"]
/// - "he-llo john" -> ["he-", "llo", " ", "john"]
///
/// # Arguments
/// * `lyrics` - Raw lyrics string
///
/// # Returns
/// Array of syllable strings (including space characters)
pub fn parse_lyrics(lyrics: &str) -> Vec<String> {
    let lyrics = lyrics.trim();
    if lyrics.is_empty() {
        return Vec::new();
    }

    let mut syllables = Vec::new();
    let mut current_word = String::new();

    for ch in lyrics.chars() {
        if ch.is_whitespace() {
            // Finish current word
            if !current_word.is_empty() {
                parse_word_into_syllables(&current_word, &mut syllables);
                current_word.clear();
            }
            // Skip the whitespace (don't add as syllable)
        } else if ch == '-' {
            // Add current part with hyphen
            if !current_word.is_empty() {
                syllables.push(current_word.clone() + "-");
                current_word.clear();
            } else {
                // Standalone hyphen (e.g., double hyphen "he--llo")
                syllables.push("-".to_string());
            }
        } else {
            // Regular character
            current_word.push(ch);
        }
    }

    // Add remaining word
    if !current_word.is_empty() {
        parse_word_into_syllables(&current_word, &mut syllables);
    }

    syllables
}

/// Helper function to parse a word into syllables (handles internal hyphens)
fn parse_word_into_syllables(word: &str, syllables: &mut Vec<String>) {
    let chars: Vec<char> = word.chars().collect();
    let mut current_part = String::new();
    let mut i = 0;

    while i < chars.len() {
        let ch = chars[i];

        if ch == '-' {
            if !current_part.is_empty() {
                syllables.push(current_part.clone() + "-");
                current_part.clear();
            }
        } else {
            current_part.push(ch);
        }

        i += 1;
    }

    if !current_part.is_empty() {
        syllables.push(current_part);
    }
}

/// Merge two adjacent syllables into one
///
/// Combines syllables while preserving hyphens:
/// - If first ends with hyphen ("syl-"), keep it and concatenate: "syl-" + "la" → "syl-la"
/// - Otherwise joins with hyphen separator: "syl" + "la" → "syl-la"
///
/// # Arguments
/// * `syl1` - First syllable
/// * `syl2` - Second syllable
///
/// # Returns
/// Merged syllable string with hyphen preserved/added
pub fn merge_syllables(syl1: &str, syl2: &str) -> String {
    if syl1.ends_with('-') {
        // First syllable has hyphen, keep it and concatenate
        format!("{}{}", syl1, syl2)
    } else {
        // Join with hyphen
        format!("{}-{}", syl1, syl2)
    }
}

/// Distribute syllables to pitch elements, respecting slurs (melismas)
///
/// # Special Case: 0 or 1 Pitched Notes
/// If the line has 0 or 1 pitched elements, only the FIRST WORD is assigned
/// (split by spaces, preserving hyphens within words).
/// Example: "He-llo world" with 1 note → assigns "He-llo" only
///
/// # Normal Case: 2+ Pitched Notes
/// Uses FSM algorithm:
/// 1. Parse lyrics into syllables (split on spaces and hyphens)
/// 2. Scan cells left to right
/// 3. For each pitched element:
///    - If in melisma (inside slur), skip (no syllable)
///    - If slur starts here, assign syllable and enter melisma state
///    - If normal pitch, assign syllable
/// 4. Track slur depth for nested slurs
///
/// # Remaining Syllables Feature
/// If there are fewer notes than syllables, the LAST pitched note gets
/// all remaining syllables combined with hyphens:
/// - Example: "hel-lo-wor-ld" (4 syllables) with 2 notes
/// - Note 1: "hel"
/// - Note 2 (last): "lo-wor-ld" (all remaining combined)
///
/// # Arguments
/// * `lyrics` - Raw lyrics string
/// * `cells` - Array of Cell objects from the line
///
/// # Returns
/// Array of syllable assignments (cell index and syllable text)
pub fn distribute_lyrics(lyrics: &str, cells: &[Cell]) -> Vec<SyllableAssignment> {
    let lyrics_trimmed = lyrics.trim();
    let mut assignments = Vec::new();

    if lyrics_trimmed.is_empty() || cells.is_empty() {
        return assignments;
    }

    // Count pitched elements (excluding continuation cells which are part of accidentals)
    let pitched_count = cells.iter()
        .filter(|c| !false /* REMOVED: continuation field */ && matches!(c.kind, ElementKind::PitchedElement))
        .count();

    // Special case: 0 or 1 pitched notes - assign entire lyrics as-is (no splitting)
    if pitched_count <= 1 {
        // Find first pitched element index (excluding continuations), or use 0 if none exist
        let cell_index = cells.iter()
            .position(|c| !false /* REMOVED: continuation field */ && matches!(c.kind, ElementKind::PitchedElement))
            .unwrap_or(0);

        // Assign entire lyrics string unchanged
        assignments.push(SyllableAssignment {
            cell_index,
            syllable: lyrics_trimmed.to_string(),
        });
        return assignments;
    }

    // Normal case: 2+ pitched notes - split into syllables and distribute
    let syllables = parse_lyrics(lyrics_trimmed);

    if syllables.is_empty() {
        return assignments;
    }

    // Count non-whitespace syllables for remaining syllables feature
    let non_whitespace_syllables: Vec<usize> = syllables.iter()
        .enumerate()
        .filter(|(_, syl)| !syl.trim().is_empty())
        .map(|(idx, _)| idx)
        .collect();

    let mut syllable_index = 0;
    let mut state = LyricsState::SeekingPitch;
    let mut slur_depth: i32 = 0; // Track nested slurs
    let mut pitched_index = 0; // Track which pitched element we're on

    for (cell_index, cell) in cells.iter().enumerate() {
        // Only process pitched elements (kind == 1 / PitchedElement) that are not continuations
        if false /* REMOVED: continuation field */ || !matches!(cell.kind, ElementKind::PitchedElement) {
            continue;
        }

        let is_last_pitched_element = pitched_index == pitched_count - 1;
        pitched_index += 1;

        // Track slur state
        let slur_indicator = cell.slur_indicator;

        // CHECK SLUR STATE FIRST - before consuming syllables
        // For melisma notes (SlurEnd or inside slur), don't consume syllables
        match slur_indicator {
            SlurIndicator::SlurEnd => {
                // Slur ends - this pitch is still part of melisma, don't consume syllable
                slur_depth = slur_depth.saturating_sub(1);
                if slur_depth == 0 {
                    state = LyricsState::SeekingPitch;
                }
                continue;
            }
            SlurIndicator::None => {
                if state == LyricsState::InMelisma {
                    // Inside slur - skip this pitch (part of melisma), don't consume syllable
                    continue;
                }
            }
            SlurIndicator::SlurStart => {
                // Will consume and assign syllable below
            }
        }

        // NOW consume syllable (only reached if we're going to assign)
        // Skip whitespace syllables (don't assign them to cells)
        while syllable_index < syllables.len() && syllables[syllable_index].trim().is_empty() {
            syllable_index += 1;
        }

        if syllable_index >= syllables.len() {
            break; // No more non-whitespace syllables
        }

        // Check if there are multiple remaining syllables for the remaining syllables feature
        let remaining_non_whitespace = non_whitespace_syllables.iter()
            .filter(|&&idx| idx >= syllable_index)
            .count();

        // If this is the last pitched element and there are MULTIPLE remaining syllables, combine them
        let syll_text = if is_last_pitched_element && remaining_non_whitespace > 1 {
            // Combine all remaining non-whitespace syllables
            let remaining: Vec<String> = syllables[syllable_index..]
                .iter()
                .filter(|syl| !syl.trim().is_empty())
                .cloned()
                .collect();

            // Join remaining syllables by merging them pairwise
            let mut combined = remaining[0].clone();
            for syl in &remaining[1..] {
                combined = merge_syllables(&combined, syl);
            }

            // Advance to end of syllables
            syllable_index = syllables.len();
            combined
        } else {
            // Normal case: single syllable assignment
            let mut syll_text = syllables[syllable_index].clone();
            let mut next_idx = syllable_index + 1;
            while next_idx < syllables.len() && syllables[next_idx].trim().is_empty() {
                syll_text.push('\u{00A0}'); // Append nbsp
                next_idx += 1;
            }
            syllable_index = next_idx;
            syll_text
        };

        // Assign syllable based on slur state
        match slur_indicator {
            SlurIndicator::SlurStart => {
                // Slur starts - assign syllable to this pitch, then enter melisma
                assignments.push(SyllableAssignment {
                    cell_index,
                    syllable: syll_text,
                });
                slur_depth += 1;
                state = LyricsState::InMelisma;
            }
            SlurIndicator::None => {
                // Normal pitch (not in melisma) - assign syllable
                assignments.push(SyllableAssignment {
                    cell_index,
                    syllable: syll_text,
                });
                state = LyricsState::SyllableAssigned;
            }
            SlurIndicator::SlurEnd => {
                unreachable!("SlurEnd already handled above");
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
            Cell::new("S".to_string(), ElementKind::PitchedElement, 0),
            Cell::new("R".to_string(), ElementKind::PitchedElement, 1),
            Cell::new("G".to_string(), ElementKind::PitchedElement, 2),
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

    #[test]
    fn test_distribute_lyrics_remaining_syllables_two_notes_four_syllables() {
        // 4 syllables but only 2 notes - last note should get remaining
        let lyrics = "hel-lo-wor-ld";
        let cells = vec![
            Cell::new("S".to_string(), ElementKind::PitchedElement, 0),
            Cell::new("R".to_string(), ElementKind::PitchedElement, 1),
        ];

        let assignments = distribute_lyrics(lyrics, &cells);
        assert_eq!(assignments.len(), 2);
        assert_eq!(assignments[0].cell_index, 0);
        assert_eq!(assignments[0].syllable, "hel-");
        assert_eq!(assignments[1].cell_index, 1);
        // Last note should get remaining syllables combined
        assert_eq!(assignments[1].syllable, "lo-wor-ld");
    }

    #[test]
    fn test_distribute_lyrics_remaining_syllables_three_notes_four_syllables() {
        // 4 syllables with 3 notes - last note gets remaining
        let lyrics = "hel-lo-wor-ld";
        let cells = vec![
            Cell::new("S".to_string(), ElementKind::PitchedElement, 0),
            Cell::new("R".to_string(), ElementKind::PitchedElement, 1),
            Cell::new("G".to_string(), ElementKind::PitchedElement, 2),
        ];

        let assignments = distribute_lyrics(lyrics, &cells);
        assert_eq!(assignments.len(), 3);
        assert_eq!(assignments[0].syllable, "hel-");
        assert_eq!(assignments[1].syllable, "lo-");  // Hyphen is attached to syllable
        // Last note gets remaining syllables
        assert_eq!(assignments[2].syllable, "wor-ld");
    }

    #[test]
    fn test_distribute_lyrics_equal_notes_and_syllables() {
        // Equal number of notes and syllables - normal behavior
        let lyrics = "hel-lo";
        let cells = vec![
            Cell::new("S".to_string(), ElementKind::PitchedElement, 0),
            Cell::new("R".to_string(), ElementKind::PitchedElement, 1),
        ];

        let assignments = distribute_lyrics(lyrics, &cells);
        assert_eq!(assignments.len(), 2);
        // Should each get one syllable normally (not combined)
        assert_eq!(assignments[0].syllable, "hel-");
        assert_eq!(assignments[1].syllable, "lo");
    }

    #[test]
    fn test_distribute_lyrics_more_notes_than_syllables() {
        // More notes than syllables - extra notes get no lyric
        let lyrics = "hel-lo";
        let cells = vec![
            Cell::new("S".to_string(), ElementKind::PitchedElement, 0),
            Cell::new("R".to_string(), ElementKind::PitchedElement, 1),
            Cell::new("G".to_string(), ElementKind::PitchedElement, 2),
        ];

        let assignments = distribute_lyrics(lyrics, &cells);
        // Only two assignments (one per syllable)
        assert_eq!(assignments.len(), 2);
        assert_eq!(assignments[0].syllable, "hel-");
        assert_eq!(assignments[1].syllable, "lo");
    }

    #[test]
    fn test_distribute_lyrics_single_note_multiple_syllables() {
        // Single note with multiple syllables - gets all of them
        let lyrics = "hel-lo-wor-ld";
        let cells = vec![
            Cell::new("S".to_string(), ElementKind::PitchedElement, 0),
        ];

        let assignments = distribute_lyrics(lyrics, &cells);
        // Single note with multiple syllables gets all of them as-is (no splitting)
        assert_eq!(assignments.len(), 1);
        assert_eq!(assignments[0].syllable, "hel-lo-wor-ld");
    }
}
