# MusicXML to LilyPond Lyrics Support Implementation

## Overview

This document describes the implementation of lyrics/syllable support for the MusicXML to LilyPond converter. The feature allows converting lyrics from MusicXML documents and outputting them correctly in LilyPond notation.

## Changes Made

### 1. **Type Definitions** (`src/converters/musicxml/musicxml_to_lilypond/types.rs`)

Added new types to represent lyrics in the internal music representation:

```rust
/// Lyric data for a single note
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NoteLyric {
    pub text: String,
    pub syllabic: LyricSyllabic,
}

/// Syllabic type for note lyrics
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LyricSyllabic {
    Single,    // Single syllable word
    Begin,     // First syllable of multi-syllable word
    Middle,    // Middle syllable
    End,       // Last syllable
}
```

Updated structures to include lyrics:
- `NoteEvent::lyric: Option<NoteLyric>` - Added lyric field to note events
- `ChordEvent::lyric: Option<NoteLyric>` - Added lyric field to chord events

### 2. **Parsing** (`src/converters/musicxml/musicxml_to_lilypond/converter.rs`)

Added lyric parsing from MusicXML note elements:

```rust
fn parse_lyric_from_note(note_node: Node) -> Option<NoteLyric>
```

This function:
- Extracts `<lyric>` elements from MusicXML notes
- Parses the `<syllabic>` type (begin/middle/end/single)
- Extracts the `<text>` content
- Handles only the first verse (number="1")
- Properly handles missing syllabic elements (defaults to Single)

The function is called during note conversion to attach lyrics to notes.

### 3. **LilyPond Output** (`src/converters/musicxml/musicxml_to_lilypond/lilypond.rs`)

Updated note and chord rendering to include lyrics:

#### `note_to_lilypond()`
- Adds lyrics after the note duration and articulations
- Uses LilyPond's `--` syntax for lyrics: `c4 -- "text"`
- Adds continuation hyphens for multi-syllable words:
  - `Begin` and `Middle`: Adds ` --` to indicate continuation
  - `End` and `Single`: No continuation needed

#### `chord_to_lilypond()`
- Similar lyric handling as notes
- Applies to the entire chord

Respects the `ConversionSettings::convert_lyrics` flag, allowing users to disable lyric conversion if desired.

## LilyPond Output Examples

### Single Syllable Word
```lilypond
c4 -- "hello"
```

### Multi-Syllable Word
```lilypond
c4 -- "hel" --
d4 -- "lo"
```

### Multiple Words
```lilypond
c4 -- "Hap" --
c4 -- "py"
d4 -- "birth" --
c4 -- "day"
```

## MusicXML Input Format

The converter expects standard MusicXML lyric structure:

```xml
<note>
  <pitch><step>C</step><octave>4</octave></pitch>
  <duration>4</duration>
  <type>quarter</type>
  <lyric number="1">
    <syllabic>begin</syllabic>
    <text>hel</text>
  </lyric>
</note>
```

Key points:
- Lyrics are attached to individual notes
- The `number="1"` attribute specifies the verse (only first verse is currently processed)
- The `<syllabic>` element indicates the syllable type (optional, defaults to single)
- The `<text>` element contains the syllable text

## Testing

### MusicXML Export Tests
All existing MusicXML export tests pass (12/12):
- `test_single_word_lyric_in_musicxml`
- `test_hyphenated_word_syllabic_markers`
- `test_multiple_words_with_lyrics`
- `test_lyrics_with_special_characters`
- `test_empty_lyrics_no_error`
- `test_lyrics_across_multiple_measures`
- `test_lyric_structure_in_musicxml`
- `test_verse_number_in_lyrics`
- `test_complex_hyphenated_word`
- `test_remaining_syllables_on_last_note`
- `test_remaining_syllables_with_three_notes_four_syllables`
- `test_equal_notes_and_syllables`

### Integration Tests
New integration tests verify end-to-end conversion:
- `test_convert_musicxml_with_lyrics_to_lilypond` - Basic lyrics conversion
- `test_convert_musicxml_with_lyrics_and_convert_flag` - Respects convert_lyrics setting

## Features

✅ **Complete Syllabic Support**
- Single syllables
- Begin/middle/end markers for multi-syllable words
- Proper continuation syntax

✅ **Special Character Handling**
- XML escaping in MusicXML input
- LilyPond escaping in output
- Handles apostrophes, quotes, and other special characters

✅ **Configuration**
- `ConversionSettings::convert_lyrics` flag allows disabling lyrics
- Backward compatible (lyrics are optional)

✅ **Robust Parsing**
- Handles missing syllabic elements
- Only processes first verse (number="1")
- Skips empty lyrics gracefully

## Limitations

1. **Multiple Verses**: Only the first verse (number="1") is currently processed
2. **Lyric Extensions**: LilyPond supports additional lyric elements (melisma, etc.) that are not yet implemented
3. **Associatum/Elision**: Special lyric spacing rules are not implemented

## Future Enhancements

1. Support for multiple verses
2. Lyric extensions (melisma, comma, elision)
3. Better hyphenation in LilyPond output
4. Support for separate lyrics blocks (advanced LilyPond layout)

## Compatibility

- **MusicXML**: 3.1 format
- **LilyPond**: 2.24+ (inline lyric syntax)
- **Rust**: 1.75+
- **WASM**: Fully compatible

## Code Quality

- All tests pass (2 new integration tests)
- No breaking changes
- Follows existing code patterns
- Comprehensive type safety
- Proper error handling
