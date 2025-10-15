# Lyrics Rendering Algorithm

## Overview

This implementation provides Lilypond-style lyrics rendering with automatic syllable distribution to pitches, respecting slurs (melismas).

## Features

- **Syllable parsing**: Splits lyrics on spaces and hyphens (`"hel-lo"` → `["hel-", "lo"]`)
- **Melisma support**: Multiple notes under a slur share one syllable
- **FSM-based**: Clean state machine for syllable assignment
- **Position-aware**: Syllables rendered directly below their notes

## Algorithm

### FSM States

1. **SEEKING_PITCH**: Looking for next pitch to assign syllable
2. **IN_MELISMA**: Inside a slur, skip pitches
3. **SYLLABLE_ASSIGNED**: Just assigned, move to next

### Distribution Logic

```
For each cell:
  If not PitchedElement (kind != 1): skip

  If SlurStart:
    - Assign syllable to this pitch
    - Enter melisma state
    - Increment slur depth

  If SlurEnd:
    - Skip this pitch (part of melisma)
    - Decrement slur depth
    - Exit melisma if depth = 0

  If in melisma:
    - Skip this pitch

  Else:
    - Assign syllable to this pitch
```

## Examples

### Example 1: No slurs
```
Pitches:  S  R  G  M
Lyrics:   "one two three four"
Result:   one two three four
```

### Example 2: Simple melisma
```
Pitches:  S(slur) R G(end) M  P
Lyrics:   "one two three"
Result:   one     -  -     two three
          └────melisma────┘
```

### Example 3: Hyphenated syllables
```
Pitches:  S  R  G  M
Lyrics:   "hel-lo wor-ld"
Result:   hel- lo wor- ld
```

## Files

- `src/js/lyrics-renderer.js`: Main implementation
- `tests/lyrics_test.js`: Comprehensive test suite
- `src/js/renderer.js`: Integration point (renderLyrics method)

## Usage

```javascript
import { renderLyrics } from './lyrics-renderer.js';

// Parse, distribute, and render in one call
renderLyrics(lyricsString, cellsArray, lineElement);

// Or use individual functions
const syllables = parseLyrics("hel-lo world");
const assignments = distributeLyrics("hel-lo world", cells);
renderLyricsAssignments(assignments, lineElement);
```

## Cell Structure Requirements

Cells must have:
- `kind`: ElementKind (1 = PitchedElement)
- `slurIndicator` or `slur_indicator`: 0=None, 1=SlurStart, 2=SlurEnd
- `x`, `y`: Position coordinates

## Testing

Run tests:
```bash
node tests/lyrics_test.js
```

All 9 test cases cover:
- Simple lyrics parsing
- Hyphenated syllables
- Melisma handling
- Multiple slurs
- Edge cases (empty lyrics, syllable/pitch count mismatches)
