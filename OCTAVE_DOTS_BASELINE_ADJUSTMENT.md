# Lower Octave Dots Baseline Adjustment

## Summary
Repositioned lower octave dots to hang just below the baseline (bottom of cell) instead of floating 10px below, creating a tighter, more professional appearance.

## Changes Made

### File: `src/js/renderer.js` - Lower Octave Dot Styling

#### Single Dot (data-octave="-1") - Lines 85-96
**Before:**
```css
bottom: -10px;
```

**After (hang just below baseline):**
```css
bottom: -2px;
```

#### Double Dots (data-octave="-2") - Lines 98-110
**Before:**
```css
bottom: -10px;
```

**After (hang just below baseline):**
```css
bottom: -2px;
```

## Technical Details

### Baseline Definition
- **Baseline**: The bottom edge of the cell (bottom: 0)
- **"Just below"**: A small gap (2px) to indicate the dot is hanging from the cell

### Position Change
- **Before**: 10px below the cell bottom
- **After**: 2px below the cell bottom
- **Effect**: Dots are much closer to the cell, appearing to hang from it

### Affected Elements
- `.char-cell[data-octave="-1"]::before` - Single lower octave dot (•)
- `.char-cell[data-octave="-2"]::before` - Double lower octave dots (••)

## Visual Impact

### Before (Old Spacing)
```
┌─────────┐  cell
│ s   p g │
└─────────┘
        •     10px away
       ••      (floating appearance)
```

### After (New Tight Spacing)
```
┌─────────┐  cell
│ s   p g │
└─────────┘
      •      2px away (hanging from baseline)
     ••       (hanging appearance)
```

## Design Rationale

1. **Professional Appearance**: Hanging dots from the baseline is music notation standard
2. **Visual Cohesion**: Keeps dots close to the notes they modify
3. **Reduced Clutter**: Tighter spacing reduces visual distance
4. **Consistency**: Matches upper octave dot positioning philosophy (close to baseline)

## Comparison with Upper Octave Dots

| Aspect | Upper Dots (data-octave="+1/-1") | Lower Dots (data-octave="-1/-2") |
|--------|----------------------------------|----------------------------------|
| Position | `top: -10px` | `bottom: -2px` |
| Appearance | Float above | Hang below |
| Distance | 10px away | 2px away |
| After Change | Unchanged | ✓ Changed to 2px |

## Behavior

### Single Lower Octave Indicator
- Shows when note is one octave lower
- Single dot (•)
- Now positioned 2px below cell bottom edge
- Centered horizontally

### Double Lower Octave Indicator
- Shows when note is two octaves lower
- Double dots (••)
- Spaced with 2px letter-spacing
- Now positioned 2px below cell bottom edge
- Centered horizontally

## Impact on Layout

✅ **Vertical spacing reduced** - 10px → 2px below cell
✅ **Horizontal alignment** - unchanged (still centered)
✅ **Z-index maintained** - still above cells (z-index: 2)
✅ **Pointer events** - still disabled (`pointer-events: none`)
✅ **Line height** - still 1 (compact)

## Browser Compatibility

✅ Works in all modern browsers that support:
- Absolute positioning with negative bottom values
- CSS pseudo-elements (::before)
- Unicode bullet character (•)

## Build Status
✅ Build successful - no errors
✅ Ready for testing

## Testing Checklist

- [ ] Create notes with -1 octave (single dot below)
- [ ] Create notes with -2 octaves (double dots below)
- [ ] Verify dots are positioned close to cell bottom (2px)
- [ ] Verify dots appear to "hang" from the baseline
- [ ] Verify horizontal centering maintained
- [ ] Compare visual spacing with upper octave dots
- [ ] Verify no overlap with other elements
- [ ] Test at different zoom levels

## Visual Alignment Examples

### Before
```
Cells with octave indicators (old spacing):
  ↑ 10px
s̄ (upper octave +1)
s (normal)
s (lower octave -1)
  ↓ 10px away

Result: Octave indicators floating away from baseline
```

### After
```
Cells with octave indicators (new spacing):
  ↑ 10px
s̄ (upper octave +1)
s (normal)
s• (lower octave -1 - 2px gap)
  ↓ tight to baseline

Result: Lower octave dots hang from baseline
```

## No Other Changes
- Upper octave dots unchanged (still 10px above)
- Cell rendering unchanged
- All other dot styling unchanged
- Horizontal positioning unchanged

## Backward Compatibility
✅ Fully backward compatible
✅ No breaking changes
✅ Pure visual positioning improvement
✅ All existing code unchanged

## Notes for QA

The lower octave dots are now positioned much closer to the cell baseline:
- They "hang" from the bottom of the cell
- This is the standard music notation appearance for subscript indicators
- Compare with upper octave dots (10px above) - lower dots are intentionally tighter
