# Quickstart Guide: Music Notation Ornaments

**Feature**: 006-music-notation-ornament
**Date**: 2025-10-25
**Audience**: End users, developers

## Overview

This guide shows you how to add ornamental embellishments (grace notes) to your musical notation using the editor's inline syntax. Ornaments are small notes played before, after, or on top of main notes to add expressive character to melodies.

---

## Basic Syntax

### Three Position Types

Ornaments can be positioned in three ways relative to the main note:

| Position | Syntax | Visual Result | Musical Meaning |
|----------|--------|---------------|-----------------|
| **Before** | `<234> 1` | Grace notes appear **left** of main note | Leading ornament (most common) |
| **After** | `1 >234<` | Grace notes appear **right** of main note | Trailing ornament |
| **On Top** | `^234^ 1` | Grace notes appear **above** main note | Layered ornament |

### Syntax Rules

- **Before**: `<...>` markers (points right →)
- **After**: `>...<` markers (points left ←)
- **On Top**: `^...^` markers (points up/down ↕)
- **Content**: Any valid pitch notation between markers (numbers, letters, accidentals)

---

## Examples

### Example 1: Simple Grace Note (Before)

**Input**:
```
<2> 1
```

**Result**: Grace note D appears before main note C

**Visual**:
```
  ²ᵈ
C
```

**MusicXML Export**:
```xml
<note><grace/><pitch><step>D</step></pitch></note>
<note><pitch><step>C</step></pitch><duration>4</duration></note>
```

---

### Example 2: Multiple Grace Notes (Before)

**Input**:
```
<234> 1
```

**Result**: Grace notes D, E, F appear before main note C

**Visual**:
```
  ²³⁴
C
```

---

### Example 3: After-Position Ornament

**Input**:
```
1 >234<
```

**Result**: Grace notes D, E, F appear after main note C

**Visual**:
```
C ²³⁴
```

**MusicXML Export**: Uses `<grace slash="yes"/>` (acciaccatura notation)

---

### Example 4: On-Top Ornament

**Input**:
```
^23^ 1
```

**Result**: Grace notes D, E layered on top of main note C

**Visual**:
```
²³
C
```

---

### Example 5: Multiple Ornaments in Sequence

**Input**:
```
<23> 1 2 >45< 3
```

**Result**:
- Grace notes D, E before note C
- Main notes C, D, E
- Grace notes F, G after note D

**Visual**:
```
²³      ⁴⁵
C D E
```

---

### Example 6: Ornaments with Accidentals

**Input**:
```
<2#3b> 1
```

**Result**: Grace notes D♯, E♭ before note C

---

### Example 7: Western Pitch System

**Input** (assuming Western pitch system):
```
<de> c
```

**Result**: Grace notes D, E before note C

---

## Edit Mode

### Toggle Between Inline and Floating Layout

**Keyboard Shortcut**: `Alt+Shift+O`

| Mode | Visual Layout | Use Case |
|------|---------------|----------|
| **Edit Mode OFF** (Floating) | Ornaments float above main notes with zero horizontal width | Final viewing, compact layout |
| **Edit Mode ON** (Inline) | Ornaments appear in sequence with normal spacing | Editing ornaments directly |

**Example**:

**Input**: `<234> 1 4`

**Edit Mode OFF (Floating)**:
```
²³⁴
C   F
```
*(Ornaments 2,3,4 positioned above C, take no horizontal space)*

**Edit Mode ON (Inline)**:
```
² ³ ⁴ C F
```
*(Ornaments 2,3,4 displayed sequentially with spacing)*

---

## Beat Calculations

Ornaments are **rhythm-transparent** and do NOT count toward beat subdivisions.

**Example**:

**Input**: `<234> 1--4`

**Beat Count**: **4 beats** (from `1--4` only)
- Ornaments 2, 3, 4 are excluded from counting
- Main notes: 1, -, -, 4

**Visual**:
```
²³⁴
C - - F
1 2 3 4  (beat positions)
```

---

## Export Formats

### MusicXML Export

Ornaments export as `<grace/>` elements:

```xml
<!-- Before-ornaments -->
<note><grace/><pitch>...</pitch></note>

<!-- After-ornaments (with slash) -->
<note><grace slash="yes"/><pitch>...</pitch></note>

<!-- OnTop-ornaments -->
<note><grace/><pitch>...</pitch><notations><placement>above</placement></notations></note>
```

### LilyPond Export

Ornaments export using grace note syntax:

```lilypond
% Before-ornaments
\grace { d'16 e' } c'4

% After-ornaments
c'4 \acciaccatura { d'16 }

% OnTop-ornaments
\appoggiatura { e'8 } c'4
```

---

## Visual Styling

Ornaments automatically render with:
- **Font Size**: 75% of regular notes (superscript-like)
- **Vertical Position**: Raised above baseline
- **Color**: Indigo (for visual distinction)
- **Horizontal Spacing**:
  - Edit Mode OFF: Zero width (floating)
  - Edit Mode ON: Normal width (inline)

---

## Common Patterns

### Pattern 1: Trill-like Ornament

**Input**: `<232> 1`

**Result**: D-C-D grace notes before C (creates trill effect)

---

### Pattern 2: Arpeggio Ornament

**Input**: `<135> 1`

**Result**: C-E-G grace notes before C (arpeggio pickup)

---

### Pattern 3: Turn Ornament

**Input**: `<212> 1`

**Result**: D-C-D grace notes before C (turn figure)

---

### Pattern 4: Slide Ornament (After)

**Input**: `1 >234<`

**Result**: Grace notes after main note (slide-off effect)

---

## Advanced Usage

### Multiple Position Types on Same Note

**Input**: `<12> 1 >34<`

**Result**:
- Before-ornaments: C, D (left of main note)
- Main note: C
- After-ornaments: E, F (right of main note)

**Note**: On-top ornaments can also be added: `<12> ^56^ 1 >34<`

---

### Ornaments on Adjacent Notes

**Input**: `<2> 1 >3< <4> 2`

**Result**:
- Note 1 (C): Grace note D before, Grace note E after
- Note 2 (D): Grace note F before

**Collision Detection**: System automatically adds spacing if ornaments would overlap

---

## Troubleshooting

### Issue: Unmatched Markers

**Input**: `<234 1` (missing closing `>`)

**Result**: Warning logged, markers treated as literal text

**Solution**: Ensure every `<` has matching `>`, every `>` has matching `<`, every `^` has matching `^`

---

### Issue: Ornaments Affecting Beat Count

**Input**: `<234> 1--4` shows 7 beats instead of 4

**Diagnosis**: Ornament parsing failed, cells not marked as rhythm-transparent

**Solution**: Check syntax, verify markers are correct

---

### Issue: Ornaments Not Visible

**Diagnosis**: Edit mode might be ON, and ornaments scrolled off-screen

**Solution**: Toggle edit mode (`Alt+Shift+O`) or scroll to view inline ornaments

---

## Inspector Tabs

Use inspector tabs to verify ornament data:

### LilyPond Tab
Check that grace notes appear in LilyPond export:
```lilypond
\grace { d'16 e' } c'4
```

### MusicXML Tab
Verify `<grace/>` elements:
```xml
<note><grace/><pitch><step>D</step></pitch></note>
```

### Document Model Tab
See ornament indicator values:
```json
{
  "text": "<",
  "ornament_indicator": {"name": "ornament_before_start", "value": 1}
}
```

---

## Performance Tips

1. **Limit ornament count**: Typical usage is 2-10 grace notes per measure
2. **Use edit mode strategically**: Toggle OFF for compact viewing, ON for precise editing
3. **Collision detection**: Automatic spacing added when needed (no action required)

---

## Summary Cheat Sheet

| Task | Syntax | Shortcut |
|------|--------|----------|
| Add grace notes before | `<234> 1` | — |
| Add grace notes after | `1 >234<` | — |
| Add grace notes on top | `^234^ 1` | — |
| Toggle edit mode | — | `Alt+Shift+O` |
| Export to MusicXML | Menu → Export → MusicXML | — |
| Export to LilyPond | Menu → Export → LilyPond | — |
| View ornament data | Inspector → Document Model | — |

---

## Next Steps

- Experiment with different ornament positions
- Try combining ornaments with slurs: `(<23> 1 2)`
- Export to MusicXML and import into MuseScore/Finale
- Toggle edit mode to see layout differences

**Happy ornamenting! 🎵**
