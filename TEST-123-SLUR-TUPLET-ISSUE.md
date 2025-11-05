# Test 123: Slur-Tuplet Interaction Bug

## Summary
Test 123 (`test-123-slur-tuplet-interaction.spec.js`) demonstrates a critical bug where slur markers are placed on the **wrong notes** when a slur spans a tuplet (triplet, quintuplet, etc.).

**Status**: ❌ **FAILING** (2 of 3 tests fail)

## The Bug: "One Off" Slur Placement

### Issue Description
When applying a slur over all notes in a tuplet, the slur markers are shifted one note to the left, and the **last note loses its slur marker entirely**.

### Visual Example: 3-Note Triplet

**Input**: Type `123` (3 notes in one beat = triplet) with slur over all notes

**Expected Output**:
```
Note 1 (C): <slur type="start">     ← Slur starts here
Note 2 (D): <slur type="continue">  ← Slur continues (or no marker)
Note 3 (E): <slur type="stop">      ← Slur stops here
```

**Actual Output** (BUG):
```
Note 1 (C): <slur type="start">     ✓ Correct
Note 2 (D): <slur type="stop">      ✗ WRONG - should continue or have no marker
Note 3 (E): (no slur marker)         ✗ MISSING - should have type="stop"
```

### Example: 5-Note Quintuplet

**Input**: Type `12345` (5 notes in one beat = quintuplet) with slur over all notes

**Expected Output**:
```
Note 1: <slur type="start">
Note 2: <slur type="continue">
Note 3: <slur type="continue">
Note 4: <slur type="continue">
Note 5: <slur type="stop">
```

**Actual Output** (BUG):
```
Note 1: <slur type="start">     ✓ Correct
Note 2: <slur type="continue">  ✓ Correct
Note 3: <slur type="continue">  ✓ Correct
Note 4: <slur type="stop">      ✗ WRONG - should continue
Note 5: (no slur marker)         ✗ MISSING - should have stop
```

## Root Cause Analysis

The bug is in how slur indicators are extracted and mapped to notes within a tuplet.

### Code Location
- **File**: `src/renderers/musicxml/beat.rs` (lines 507-514)
- **Problem**: Slur assignment uses `slur_indicator` from the cell directly, without accounting for tuplet processing

```rust
// Current buggy code (beat.rs:507-514)
let slur = match slur_indicator {
    SlurIndicator::SlurStart => Some("start"),
    SlurIndicator::SlurEnd => Some("stop"),
    SlurIndicator::None => None,
};

builder.write_note_with_beam_from_pitch_code(
    pitch_code, *octave, *duration_divs, *musical_duration,
    None, tuplet_info, tuplet_bracket, tie, slur, None, *ornament_type
)?;
```

### Issue Explanation

1. **Slur markers come from cells** (Document Model):
   - When selecting `1 2 3` and pressing Alt+S, cell `2` gets `SlurStart` and cell `3` gets `SlurEnd`

2. **But tuplet processing reorders notes**:
   - The beat processor extracts notes from cells in sequence
   - It builds `elements` array with tuplet information
   - The loop iterates `for (idx, element) in elements`
   - **The problem**: `slur_indicator` is tied to the cell, but the note at position `idx` in the tuplet may not correspond to the same cell index

3. **Result**: The slur markers are one note off, and the last note gets no marker

### Related Files

- **IR Building**: `src/renderers/musicxml/cell_to_ir.rs` - FSM extracts slur indicators from cells
- **Beat Processing**: `src/renderers/musicxml/beat.rs` (lines 444-514) - Assigns tuplet brackets and slur markers
- **MusicXML Emission**: `src/renderers/musicxml/builder.rs` (lines 171-202, 270-293) - Writes slur elements
- **Data Structures**: `src/renderers/musicxml/export_ir.rs` (lines 213-231) - `SlurData` type definition

## Test Cases

### Test 1: Triplet with Slur (FAILING)
```javascript
await editor.keyboard.type('123');  // 3-note triplet
// Select and apply slur with Alt+S
// Expected: slur on all 3 notes
// Actual: slur missing from note 3, stop marker on wrong note
```

### Test 2: Quintuplet with Slur (FAILING)
```javascript
await editor.keyboard.type('12345');  // 5-note quintuplet
// Select and apply slur with Alt+S
// Expected: slur on all 5 notes with proper continue/stop chain
// Actual: slur missing from note 5, stop marker on note 4 instead
```

### Test 3: Diagnostic Output (PASSING)
Prints raw MusicXML and Display List for manual inspection of the bug.

## How to Run the Tests

```bash
# Run all 3 tests
npx playwright test tests/e2e-pw/tests/test-123-slur-tuplet-interaction.spec.js

# Run only the failing tests to see the bug clearly
npx playwright test tests/e2e-pw/tests/test-123-slur-tuplet-interaction.spec.js -g "FAILING"

# Run with detailed output
npx playwright test tests/e2e-pw/tests/test-123-slur-tuplet-interaction.spec.js --reporter=list

# Run in headed mode to see the editor
npx playwright test tests/e2e-pw/tests/test-123-slur-tuplet-interaction.spec.js --headed
```

## Expected Fix

The fix should ensure that:

1. **Slur markers stay with their notes** when tuplets are processed
2. **Correct sequencing**: start → continue (optional) → stop
3. **All notes covered**: Every note in the slurred tuplet has a slur marker
4. **Tuplet and slur independence**: Tuplet brackets and slur brackets should not interfere

### Solution Approach

The slur indicators need to be tracked through the tuplet processing pipeline. Options:

1. **Option A**: Re-index slur markers after tuplet element reordering
   - Track which cell indices have slur markers
   - After building `elements`, re-assign slur markers based on final positions

2. **Option B**: Include slur data in BeatElement enum
   - Store slur_indicator directly in each `BeatElement`
   - Eliminate cell-based lookup during note writing

3. **Option C**: Process slurs in IR phase, not beat phase
   - Attach slur information during `cell_to_ir` conversion
   - Make it part of the IR structure, not a separate pass

## Impact

This bug affects:
- ✗ Any slur spanning a tuplet (triplet, quintuplet, sextuplet, etc.)
- ✓ Regular slurs without tuplets (still work correctly)
- ✓ Tuplets without slurs (still render correctly)
- ✗ Mixed tuplet+slur notation in modern music scores

## Test Artifacts

When tests run, artifacts are saved in:
- `test-results/` - Screenshots and videos on failure
- `test-results/test-123-slur-tuplet-inter-*.md` - Detailed error context
- Compare MusicXML in test output to see the exact marker placement

## Related Issues

- User report: "Slurs seem to be one off in the case of tuplets. missing last note in slur."
- Issue affects correct MusicXML export for notation software integration
