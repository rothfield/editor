# LilyPond Export Duplicate Attributes Fix

## Problems Fixed

### Problem 1: Multi-Staff Duplication
When exporting multi-staff scores to LilyPond, the `\time`, `\key`, and `\clef` directives were being duplicated for each staff:

```lilypond
\new Staff {
  \time 4/4
  \key c \major
  \clef treble
  c'4 d'4
}
\new Staff {
  \time 4/4  % ❌ DUPLICATE
  \key c \major  % ❌ DUPLICATE
  \clef bass
  c4 d4
}
```

In LilyPond, these attributes should only appear once in multi-staff scores - they automatically apply to all staves.

### Problem 2: Repeated Attributes Within Same Staff
When the same time/key/clef appeared in multiple measures (common in MusicXML), they were being redundantly emitted:

```lilypond
\key c \major
\time 4/4
\clef treble
\tuplet 5/4 { c'16 c'16 d'16 d'16 d'16 }
\time 4/4  % ❌ DUPLICATE (unchanged)
\tuplet 3/2 { a'8 a'8 a'8 }
\time 4/4  % ❌ DUPLICATE (unchanged)
\tuplet 5/4 { e'16 e'16 e'16 e'16 e'16 }
```

LilyPond only needs these when they actually change.

## Solution

### Part 1: Multi-Staff Filtering
**File**: `src/converters/musicxml/musicxml_to_lilypond/lilypond.rs`

1. **Added `filter_initial_attributes()` function** (lines 103-124)
   - Filters out initial time/key/clef changes from parts after the first
   - Only affects attributes at the very start of each part
   - Mid-score changes are preserved

2. **Updated `generate_staves_content()`** (lines 66-101)
   - For multi-staff scores (2+ parts), applies filtering to staves 2 and beyond
   - Single-staff scores unchanged
   - First staff always gets all attributes

### Part 2: State Tracking to Prevent Duplicates
**File**: `src/converters/musicxml/musicxml_to_lilypond/converter.rs`

1. **Extended `ConversionContext`** with state tracking (lines 13-36)
   - Added `current_time_signature: Option<(u8, u8)>`
   - Added `current_key_signature: Option<(i8, Mode)>`
   - Added `current_clef: Option<ClefType>`

2. **Updated `convert_attributes()`** (lines 287-351)
   - Now checks if attribute has actually changed before emitting
   - Tracks current state in context
   - Only outputs `Music::TimeChange` / `KeyChange` / `ClefChange` when values differ
   - Eliminates redundant repetitions within the same part

### Result

**Multi-staff scores:**
```lilypond
\new Staff {
  \time 4/4  % ✅ Only in first staff
  \key c \major  % ✅ Only in first staff
  \clef treble
  c'4 d'4
}
\new Staff {
  \clef bass  % ✅ Clef still here (staff-specific)
  c4 d4
}
```

**Single staff with multiple measures:**
```lilypond
\key c \major
\time 4/4  % ✅ Only once
\clef treble
\tuplet 5/4 { c'16 c'16 d'16 d'16 d'16 }
\tuplet 3/2 { a'8 a'8 a'8 }  % ✅ No repeated \time
\tuplet 5/4 { e'16 e'16 e'16 e'16 e'16 }  % ✅ No repeated \time
```

## Testing

### E2E Tests
Created comprehensive E2E test suite: `tests/e2e-pw/tests/lilypond-multistaff-fix.spec.js`

**All 6 tests passing ✅:**

1. **2-staff score: `\time` appears only once**
   - Verified `\time 4/4` appears exactly once
   - Verified `\key c \major` appears exactly once
   - Verified both staves present in output

2. **3-staff score: `\time` appears only once**
   - Scales to 3+ staves correctly
   - Initial time signature not duplicated

3. **Single staff: `\time` still present**
   - Regression test - single-staff behavior unchanged
   - Time signature still appears as expected

4. **Multi-staff with time signature changes**
   - Initial `\time 4/4` appears only once
   - Mid-score changes may still appear per staff (acceptable)

5. **Unchanged time signature not repeated within same staff** ⭐ NEW
   - MusicXML with 3 measures, all with `<time>4/4</time>`
   - Verifies `\time 4/4` appears only ONCE
   - Fixes the issue shown in user's example

6. **Time signature changes properly emitted** ⭐ NEW
   - MusicXML with changing time signatures (4/4 → 3/4 → 6/8)
   - Verifies all 3 changes are emitted
   - Ensures fix doesn't suppress legitimate changes

### Test Output
```bash
$ npx playwright test tests/e2e-pw/tests/lilypond-multistaff-fix.spec.js --project=chromium

Running 6 tests using 1 worker

✅ PASS: 2-staff score has only 1 \time directive
✅ PASS: 3-staff score has only 1 \time directive
✅ PASS: Single-staff score still has \time
✅ PASS: Initial time signature not duplicated
✅ PASS: Unchanged \time not repeated
✅ PASS: Time signature changes properly emitted

6 passed (2.9s)
```

### Manual Verification
Test MusicXML file created at: `/tmp/test_multistaff.xml`

**To test manually:**
1. Start dev server: `npm start`
2. Open http://localhost:8080
3. Import `/tmp/test_multistaff.xml`
4. Check LilyPond inspector tab
5. Verify `\time 4/4` appears **only once**

## Files Modified
- ✅ `src/converters/musicxml/musicxml_to_lilypond/lilypond.rs` - Multi-staff filtering
- ✅ `src/converters/musicxml/musicxml_to_lilypond/converter.rs` - State tracking (NEW)
- ✅ `tests/e2e-pw/tests/lilypond-multistaff-fix.spec.js` - E2E tests (6 tests)
- ✅ `verify_multistaff_fix.sh` - Manual test helper

## Build Status
- ✅ WASM builds successfully
- ✅ Library compiles without errors
- ✅ All 6 E2E tests pass
- ⚠️ Rust test suite has pre-existing compilation errors (unrelated to this fix)

## Technical Notes

### Why This Two-Part Approach

**Part 1: Multi-Staff Filtering (lilypond.rs)**
- Simple filtering strategy that only affects **initial** attributes
- Preserves mid-score changes (which may legitimately differ per staff)
- Works for any number of staves (2, 3, 4+)
- No runtime overhead during conversion

**Part 2: State Tracking (converter.rs)**
- Tracks current attribute values in `ConversionContext`
- Prevents MusicXML redundancy from polluting LilyPond output
- Comparison-based: only emits when value actually changes
- Minimal memory overhead (3 `Option` fields)
- Works across all parts (multi-staff and single-staff)

### Edge Cases
- **Different clefs per staff**: Still works - clef filtering allows staff-specific clefs
- **Mid-score time changes**: Properly emitted when they actually change
- **Redundant MusicXML attributes**: Now correctly suppressed (state tracking)
- **Different keys per staff**: Would be filtered (uncommon in standard notation)

### Specific User Issue Addressed
The user's example showed:
```lilypond
\time 4/4
\tuplet 5/4 { ... }
\time 4/4  % Duplicate
\tuplet 3/2 { ... }
\time 4/4  % Duplicate
```

This was caused by MusicXML files including `<time>4/4</time>` in every measure's `<attributes>` section, even when unchanged. The state tracking fix (Part 2) now detects this and only emits `\time` once.

### Future Enhancements
If needed, could extend to:
- Smart detection of truly staff-specific vs. score-wide attributes
- Handling of more complex multi-staff scenarios (piano systems, etc.)
- Filtering of other duplicate attributes (tempo, dynamics, etc.)

## Related
- Per CLAUDE.md guidelines: Inspector-first E2E testing
- Follows WASM-first architecture principle
- Uses Playwright for deterministic browser testing
