# Beat Loops Shallow Arc Adjustment

## Summary
Modified the beat loop bezier curve calculation to be much shallower and only grow very slightly as beat spans increase beyond 8 units.

## Changes Made

### File: `src/js/arc-renderer.js` - calculateArcPath() method

#### Before (Lines 305-316)
```javascript
// All arcs (slurs and beat loops) used same formula
let archHeight = span * 0.25;
archHeight = Math.max(6, Math.min(archHeight, 28));

if (span > 300) {
  archHeight *= 0.7;
}
```

**Result:** Beat loops could be as tall as 6-28px, making them prominent

#### After (Lines 305-333)
```javascript
if (isDownward) {
  // Beat loops: shallow by design
  if (span <= 8) {
    archHeight = 3;
  } else {
    archHeight = 3 + ((span - 8) * 0.05);
    archHeight = Math.min(archHeight, 8);
  }
} else {
  // Slurs: keep original formula
  archHeight = span * 0.25;
  archHeight = Math.max(6, Math.min(archHeight, 28));

  if (span > 300) {
    archHeight *= 0.7;
  }
}
```

**Result:** Beat loops start at 3px and grow very gradually to max 8px

## Behavior Details

### Beat Loop Height by Span Size

| Span | Height | Visual |
|------|--------|--------|
| 2-8 | 3px | Very subtle |
| 10 | 3.1px | Barely visible increase |
| 20 | 3.6px | Slight visual growth |
| 50 | 5.1px | Moderate but understated |
| 100 | 7.6px | Approaching maximum |
| 150+ | 8px (max) | Capped, never excessive |

### Comparison with Slurs

| Aspect | Slurs | Beat Loops |
|--------|-------|-----------|
| Small spans (2-8) | 6px minimum | 3px |
| Medium spans (20-50) | 5-12px | 3.6-5px |
| Large spans (100+) | 25-28px (softened) | 8px max |
| Visual prominence | Strong, clear | Subtle, understated |
| Purpose | Mark phrase boundaries | Group beats together |

## Implementation Details

### Formula
```
For beat loops (downward arcs):

if (span ≤ 8):
  height = 3 pixels

else (span > 8):
  height = 3 + ((span - 8) × 0.05)
  height = min(height, 8 pixels)
```

### Key Numbers
- **Base height**: 3px (very shallow)
- **Growth rate**: 0.05px per unit of span beyond 8
- **Maximum height**: 8px (hard cap)
- **Threshold**: span > 8 before any growth

### Examples
- Span 8: 3px
- Span 10: 3 + (10-8) × 0.05 = 3.1px
- Span 20: 3 + (20-8) × 0.05 = 3.6px
- Span 50: 3 + (50-8) × 0.05 = 5.1px
- Span 100: 3 + (100-8) × 0.05 = 7.6px
- Span 200: min(3 + (200-8) × 0.05, 8) = min(12.6, 8) = 8px

## Visual Impact

### Before
Beat loops were as prominent as slurs, creating visual competition:
```
          ╱─────╲      (slurs above)
      ╱──────────╲
     ╱            ╲
  [─────────────]
    ╲────────────╱      (beat loops below could be 6-28px)
      ╲──────────╱
        ╲─────╱
```

### After
Beat loops are subtle visual indicators:
```
          ╱─────╲      (slurs above, 6-28px)
      ╱──────────╲
     ╱            ╲
  [─────────────]
     ╰──────────╯       (beat loops below, 3-8px - subtle)
```

## Design Rationale

1. **Subtlety**: Beat loops should indicate grouping without dominating
2. **Gradualism**: Growth proportional to span size, but capped
3. **Consistency**: Threshold at 8 provides clear rule
4. **Professional**: Mirrors music engraving practices for secondary indicators
5. **Usability**: Less visual clutter while still showing structure

## Interaction with Slurs

✅ Slurs remain unchanged - still use 25% of span formula
✅ Both types can coexist without visual conflict
✅ Beat loops are clearly secondary to slurs (smaller, less prominent)
✅ Clear visual hierarchy: slurs > beat loops > notation

## Testing Verification

To verify shallow beats:
1. Create notation with 2-3 notes in a beat → see 3px arc
2. Create notation with 10-20 notes → see gradual height increase
3. Create notation with 100+ notes → see 8px maximum
4. Compare visual weight of beat loops vs slurs → beat loops should be much smaller

## Build Status
✅ Build successful - no errors
✅ All changes isolated to arc-renderer.js
✅ Backward compatible with existing code

## Files Modified
- `src/js/arc-renderer.js` - Updated calculateArcPath() method
- `BEAT_LOOPS_BEZIER_REFACTOR.md` - Updated documentation
- `TEST_BEAT_LOOPS_BEZIER.md` - Updated testing guide
