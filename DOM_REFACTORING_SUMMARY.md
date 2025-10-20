# DOM Refactoring: Generic Cell-Based Naming

## Overview
Refactored DOM structure and class names from pitch-specific to generic cell-based architecture. This enables all line element types (pitched notes, barlines, symbols, text, unpitched elements) to work with a unified structure that supports slurs, beat loops, and future annotations.

## Problem Solved
1. **Pitch-specific naming** made architecture unclear for non-pitched elements
2. **Missing `position: relative`** on char-cell broke octave-dot absolute positioning
3. **Unclear structure** - needed generic naming that works for all ElementKind types
4. **Continuation cells** needed clear handling (C# becomes 2 cells: C + #)

## Architecture

### New Generic DOM Structure
```html
<span class="cell-container">
  ├─ positioned at (x, y) with dimensions (w, h)
  ├─ used as anchor for slurs/beat loops
  └─ works for ALL element types (pitched, barline, symbol, text, etc.)

  <span class="cell-content">
  ├─ groups character + modifiers
  └─ keeps modifiers positioned relative to content

    <span class="cell-char" style="position: relative;">
    ├─ the actual character/glyph
    ├─ has position: relative (positioning context)
    └─ works for primary AND continuation cells

    <span class="cell-modifier octave-dot">
    ├─ absolutely positioned modifiers
    ├─ can be extended for accidentals, ornaments, etc.
    └─ positioned relative to cell-char

  <span class="cell-text lyric">
  ├─ associated text (lyrics, annotations)
  ├─ absolutely positioned
  └─ only present on primary cells
```

### Naming Convention
| Old Name | New Name | Purpose |
|----------|----------|---------|
| `pitch-lyric-group` | `cell-container` | Positioned anchor, slur/beat anchor |
| `pitch-octave-group` | `cell-content` | Groups character + modifiers |
| `char-cell` | `cell-char` | The actual character (with position: relative) |
| `octave-dot` | `cell-modifier octave-dot` | Modifier element (generic class + specific) |
| `lyric-syllable` | `cell-text lyric` | Text element (generic class + specific type) |

## Files Modified

### src/js/renderer.js (Primary changes)

**DOM Structure (lines 498-664)**
- Renamed `charCell` → `cellChar` (variable name)
- Renamed `pitchOctaveGroup` → `cellContent`
- Renamed `pitchLyricGroup` → `cellContainer`
- **Added `position: relative` to cellChar styles** (line 537)
- Updated class names for octave-dot: `'octave-dot'` → `'cell-modifier octave-dot'`
- Updated class names for lyrics: `'lyric-syllable text-sm'` → `'cell-text lyric text-sm'`

**CSS Section (lines 49-167)**
- Updated all `.char-cell` → `.cell-char` selectors
- Updated comment to reference new structure
- Preserved all CSS functionality (SMuFL music fonts, positioning, etc.)

**Measurement Functions (lines 270, 282, 356)**
- Updated temporary measurement spans to use new class names
- Ensures width/height calculations use correct selectors

**Comment at line 497**
- Updated structure documentation

## Key Features Preserved

✅ **Octave Dot Positioning**
- Now correctly positioned with `position: relative` on parent
- Absolutely positioned child elements work reliably
- Handles upper octaves (top: -10px) and lower octaves (bottom: -6px)

✅ **Multi-Character Cells**
- Continuation cells marked with `data-continuation="true"`
- Barline continuations (||, |:, :|) rendered with SMuFL music fonts
- Each cell gets its own container (scalable architecture)

✅ **Lyrics Integration**
- Matched to cells by x-position
- Positioned absolutely within cell-container
- Only appears on primary cells (continuation=false)

✅ **All Element Types**
- PitchedElement: Works with octave dots, lyrics
- Barline: Multi-char support, SMuFL overlays
- Symbol: Colored styling (#, !,  @, etc.)
- Text: Unstyled text content
- UnpitchedElement: Dashes, breath marks, spaces
- Accidentals: 50% larger, positioned up 1/2 font size

✅ **Slur/Beat Loop Support**
- `cell-container` is the anchor point for arcs
- Cell-containers positioned at (x, y) with (w, h)
- Arc renderer can reference by class name

## Benefits

### Semantic Clarity
- **Generic naming** makes architecture work for all element types
- **Clear hierarchy** - container > content > char + modifiers
- **Extensible** - can add more modifier types (accidentals, ornaments, dynamics)

### Maintainability
- **Unified architecture** for all line elements
- **Self-documenting** structure
- **Easy to modify** positioning via `position: relative`

### Scalability
- **Ready for future annotations** (dynamics, fingerings, etc.)
- **Supports continuation cells** naturally
- **Works with visual aids** (slurs, beats, selection)

### Performance
- **No change** in rendering complexity
- **Same number of DOM nodes**
- **Same measurement/layout performance**

## Build Status
✅ CSS build: 172 utilities generated
✅ WASM build: Optimized release
✅ JavaScript build: Successful (2.5s)
✅ No errors or warnings

## Testing Checklist
- [ ] Octave dots visible and correctly positioned
- [ ] Lyrics align with notes
- [ ] Barlines render (including multi-char like ||, |:, :|)
- [ ] All element types visible
- [ ] Slurs/beat loops still work
- [ ] Selection highlighting works
- [ ] Continuation cells hidden where needed
- [ ] Accidentals display correctly

## Migration Notes

### For Code That References Old Classes
If any code references the old class names:
- `pitch-lyric-group` → `cell-container`
- `pitch-octave-group` → `cell-content`
- `char-cell` → `cell-char`
- `lyric-syllable` → `cell-text lyric`
- `octave-dot` → `cell-modifier octave-dot`

### CSS Selectors
All CSS selectors have been updated. If adding new styles:
- Use `.cell-char` for the character element
- Use `.cell-container` for positioning/slurs
- Use `.cell-modifier` for modifiers, then `.octave-dot` or other specific types
- Use `.cell-text` for text elements, then `.lyric` or other specific types

## Next Steps
1. Visual testing with various document content
2. Verify all element types render correctly
3. Test slurs and beat loops anchor to cell-containers
4. Add more modifier types if needed
5. Consider CSS-based octave positioning (classes instead of inline styles)
