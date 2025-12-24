# RGR: System Marker MusicXML Export Bug

## Problem
Lines with different `system_id` values (e.g., None followed by Start) should render as separate systems in VexFlow/OSMD, but they were being vertically stacked on the same system.

## Root Cause
MusicXML was only emitting `<print new-system="yes"/>` in P2, not in P1. According to the MusicXML spec, system breaks **must appear at the same measure position across ALL parts** for reliable rendering. This is stated in the W3C MusicXML spec documentation.

## Red Phase - Failing Test

### Test Written
`test_two_lines_separate_systems_with_print_new_system()` in `src/renderers/musicxml/emitter.rs`

```rust
// Check P1's first measure - should have <print new-system="yes"/>
let p1_part = xml.split("<part id=\"P1\">").nth(1).expect("P1 part not found");
let p1_first_measure = p1_part.split("</measure>").next().expect("P1 first measure not found");
assert!(p1_first_measure.contains("<print new-system=\"yes\"/>"),
        "P1's first measure MUST have <print new-system=\"yes\"/> (MusicXML spec: system breaks must appear in same position across all parts)");

// Check P2's first measure - should have <print new-system="yes"/>
let p2_part = xml.split("<part id=\"P2\">").nth(1).expect("P2 part not found");
let p2_first_measure = p2_part.split("</measure>").next().expect("P2 first measure not found");
assert!(p2_first_measure.contains("<print new-system=\"yes\"/>"),
        "P2's first measure MUST have <print new-system=\"yes\"/> to display on separate system");
```

### Test Status
❌ **FAILED** - P1's first measure did not have `<print new-system="yes"/>`, only P2 did.

## Green Phase - Fix

### Code Changes

**File:** `src/renderers/musicxml/emitter.rs`

**Location:** Lines 119-120, 185-201

**Change 1:** Calculate `has_multiple_systems` before emitting part-list
```rust
// Check if we have multiple separate systems (needed later for system break logic)
let has_multiple_systems = system_ids.len() > 1;
```

**Change 2:** Emit system breaks in ALL parts when multiple systems exist
```rust
// CRITICAL FIX: Per MusicXML spec, <print new-system="yes"/> must appear at the SAME
// measure position across ALL parts. To ensure separate systems render correctly,
// we emit system breaks consistently in ALL parts when we have multiple systems.

// Emit one <part> per unique part_id, combining all lines with that part_id
for part_id in &unique_part_ids {
    let lines = &parts_map[part_id];
    let current_system_id = lines[0].system_id;

    // If we have multiple separate systems, ALL parts should have system breaks
    // at their first measure to ensure proper separation
    let starts_new_system = has_multiple_systems;

    // Combine all measures from all lines in this part
    let combined_part_xml = emit_combined_part(lines, document_key_signature, starts_new_system)?;
    xml.push_str(&combined_part_xml);
}
```

### Test Status After Fix
✅ **PASSED** - Both P1 and P2 now have `<print new-system="yes"/>` in measure 1

## Refactor Phase

No refactoring needed. The solution is simple and follows the MusicXML spec correctly.

## Verification

### Unit Test
```bash
cargo test test_two_lines_separate_systems_with_print_new_system --lib
```
**Result:** ✅ PASSED

### E2E Test
```bash
npx playwright test tests/e2e-pw/tests/system-marker-musicxml-export.spec.js --project=chromium
```
**Result:** ✅ PASSED

### MusicXML Output (Before Fix)
```xml
<part id="P1">
  <measure number="1">
    <!-- NO <print new-system="yes"/> -->
    <attributes>...</attributes>
  </measure>
</part>
<part id="P2">
  <measure number="1">
    <print new-system="yes"/>  <!-- Only in P2 -->
    <attributes>...</attributes>
  </measure>
</part>
```

### MusicXML Output (After Fix)
```xml
<part id="P1">
  <measure number="1">
    <print new-system="yes"/>  <!-- Now in P1 too! -->
    <attributes>...</attributes>
  </measure>
</part>
<part id="P2">
  <measure number="1">
    <print new-system="yes"/>  <!-- Still in P2 -->
    <attributes>...</attributes>
  </measure>
</part>
```

## Key Learnings

1. **MusicXML Spec Requirement:** System breaks (`<print new-system="yes"/>`) must appear at the same measure position across ALL parts, not just the part that's changing system.

2. **Why It Matters:** OSMD/VexFlow renderers rely on synchronized system breaks to properly layout separate systems. Without this, they stack parts vertically by default.

3. **Single-Measure Parts:** Our use case (each document line = separate part with single measure) is unconventional for MusicXML, but the fix handles it correctly by emitting breaks in ALL parts when multiple systems exist.

## Files Modified

- `src/renderers/musicxml/emitter.rs` - Lines 119-120, 185-201 (logic fix)
- `src/renderers/musicxml/emitter.rs` - Lines 1428-1519 (new test)
- `tests/e2e-pw/tests/system-marker-musicxml-export.spec.js` - New E2E test

## Related Tests

- `test_group_header_with_two_melodies_separate_systems` - Existing test for 3 separate systems
- `test_group_header_with_two_items_single_system` - Test for bracketed systems
- All 23 MusicXML emitter tests pass ✅
