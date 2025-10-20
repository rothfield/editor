# Accidental Symbol Size Adjustment

## Summary
Increased the size of fancy sharp (#) and flat (b) symbols by 50% for better visual prominence and readability, and moved them up by 1/2 of the new font size for optimal positioning.

## Changes Made

### File: `src/js/renderer.js` - setupBeatLoopStyles() method

#### Sharp Symbol (♯) - Lines 124-136
**Font Size - Before:**
```css
font-size: ${BRAVURA_FONT_SIZE}px;
```

**Font Size - After:**
```css
font-size: ${BRAVURA_FONT_SIZE * 1.5}px;
```

**Position - Before:**
```css
top: calc(50% + ${BRAVURA_VERTICAL_OFFSET}px);
```

**Position - After (moved up by 1/2 font size):**
```css
top: calc(50% + ${BRAVURA_VERTICAL_OFFSET}px - ${BRAVURA_FONT_SIZE * 0.75}px);
```

#### Flat Symbol (♭) - Lines 143-155
**Font Size - Before:**
```css
font-size: ${BRAVURA_FONT_SIZE}px;
```

**Font Size - After:**
```css
font-size: ${BRAVURA_FONT_SIZE * 1.5}px;
```

**Position - Before:**
```css
top: calc(50% + ${BRAVURA_VERTICAL_OFFSET}px);
```

**Position - After (moved up by 1/2 font size):**
```css
top: calc(50% + ${BRAVURA_VERTICAL_OFFSET}px - ${BRAVURA_FONT_SIZE * 0.75}px);
```

## Technical Details

### Size Calculation
- `BRAVURA_FONT_SIZE = BASE_FONT_SIZE * 0.70` (from constants.js)
- New size = `BRAVURA_FONT_SIZE * 1.5` = 50% larger
- Example: if BRAVURA_FONT_SIZE = 10px, new size = 15px

### Position Calculation (Vertical Movement)
- Move up by: `BRAVURA_FONT_SIZE * 0.75` (half of new font size)
- New vertical position = `50% + BRAVURA_VERTICAL_OFFSET - (BRAVURA_FONT_SIZE * 0.75)`
- This moves the symbols up by 1/2 of their new size
- Example: if BRAVURA_FONT_SIZE = 10px
  - New font size = 15px
  - Move up by = 7.5px
  - Net effect: symbols appear higher on the cell

### Scope
- ✅ Applies to `.char-cell.accidental-sharp::after`
- ✅ Applies to `.char-cell.accidental-flat::after`
- ✅ Uses SMuFL (Bravura) music font for professional glyphs
- ✅ Positioning maintained via `translate(-50%, -50%)` centering

### Visual Impact
| Aspect | Before | After | Change |
|--------|--------|-------|--------|
| Size | 100% | 150% | +50% |
| Vertical Position | At standard offset | Moved up 1/2 font size | Higher placement |
| Prominence | Standard | Larger & Higher | More visible |
| Readability | Good | Better | Easier to spot |
| Visual weight | Equal to regular notes | More noticeable | Better hierarchy |

## Visual Examples

### Before (Original Position)
```
  s#     g♭     p#
   ↑     ↑      ↑ small size, standard position
```

### After (Larger & Moved Up)
```
 s#     g♭     p#
  ↑     ↑      ↑ larger (50% bigger) + moved up 1/2 font size
```

### Positioning Detail
```
Cell before (centered):       Cell after (larger & moved up):
    #                              #↑
    ↑ at center                    ↑ higher, larger
    s
```

## Impact on Layout

✅ **Horizontal centering preserved** - still centered left-right via `left: 50%` and `translate(-50%, ...)`
✅ **Vertical position adjusted** - moved up by 0.75 * BRAVURA_FONT_SIZE
✅ **Vertical centering** - still uses `transform: translate(-50%, -50%)`
✅ **Z-index maintained** - still above cells (z-index: 3)
✅ **Pointer events** - still disabled (`pointer-events: none`)

## Affected Elements

### SMuFL Glyphs Used
- **Sharp (♯)**: U+E262 in Bravura font
- **Flat (♭)**: U+E260 in Bravura font

### These are Musical Accidentals
- Applied when note has accidental modifier
- Appears above the cell
- Black color (#000)
- Professional music notation appearance

## Browser Compatibility

✅ Works in all modern browsers that support:
- SMuFL font rendering (Bravura)
- CSS `font-size` property
- Absolute positioning with transforms

## Build Status
✅ Build successful - no errors
✅ Ready for testing

## Testing Checklist

- [ ] Create notes with sharp accidentals (e.g., `s#`)
- [ ] Create notes with flat accidentals (e.g., `g♭`)
- [ ] Verify symbols are 50% larger than before
- [ ] Verify symbols are positioned higher (moved up from center)
- [ ] Verify symbols are still horizontally centered
- [ ] Verify no layout distortion
- [ ] Verify symbols render clearly at different zoom levels
- [ ] Verify performance unchanged
- [ ] Compare visual alignment with staff notation

## No Other Changes
- Barlines (repeat marks, double bars) unchanged - still use original BRAVURA_FONT_SIZE
- Octave dots unchanged
- Cell rendering unchanged
- All other styling unchanged

## Backward Compatibility
✅ Fully backward compatible
✅ No breaking changes
✅ Just visual size increase and position adjustment for accidentals
✅ All existing code unchanged - pure CSS styling improvement
