# RGR: Auto-Close EOF Bug - "System shouldn't be changing system choices!"

## Problem
User reported: "can't set start system on 1st line of 2. system shouldn't be changing system choices!"

When user set line 0 to Start marker and kept line 1 as None, the system was automatically changing line 1's marker from None to End at EOF. This violated the user's explicit choice to keep line 1 as a standalone system.

## Root Cause
The `recalculate_system_and_part_ids()` function had EOF auto-close logic (lines 1175-1181) that automatically changed None markers to End markers at the end of the file when inside an unclosed group.

This was too aggressive and overrode the user's explicit marker choices.

## Red Phase - Failing Test

### Test Written
`test_set_line_0_to_start_line_1_stays_none()` in `src/models/core.rs`

```rust
// Simulate user clicking line 0 gutter: None → Start
doc.lines[0].system_marker = Some(SystemMarker::Start);
doc.recalculate_system_and_part_ids();

// CRITICAL: Line 1 should STAY None - do NOT auto-modify it to End!
assert_eq!(doc.lines[1].system_marker, None,
    "Line 1 should remain None - auto-close should NOT change user's explicit marker choice");
```

### Test Status
❌ **FAILED** - Line 1 was being auto-changed to End, violating the assertion

## Green Phase - Fix

### Code Changes

**File:** `src/models/core.rs`

**Location:** Lines 1175-1180 (removed)

**Change:** Removed EOF auto-close logic entirely

**Before (lines 1175-1181):**
```rust
// If we ended in_group (unclosed system at EOF), add End to last line
if in_group && group_start_index.is_some() {
    let last_idx = self.lines.len() - 1;
    if last_idx > 0 && self.lines[last_idx].system_marker.is_none() {
        self.lines[last_idx].system_marker = Some(SystemMarker::End);
    }
}
```

**After:**
```rust
// REMOVED: EOF auto-close logic
// The old logic would automatically change None to End at EOF, which violated
// user intent. Users explicitly choose None for standalone systems.
// Auto-close should ONLY happen when a new Start marker is encountered
// (handled above in lines 1145-1149), not at EOF.
```

### Test Status After Fix
✅ **PASSED** - Line 1 now stays None as the user intended

### Additional Test Updates
Updated 3 tests that expected the old (buggy) EOF auto-close behavior:
1. `test_system_marker_auto_close_at_eof` - Now expects None to stay None
2. `test_system_marker_start_followed_by_none_should_not_auto_close_none_to_end` - Updated expectations
3. `test_set_line_0_to_start_line_1_stays_none` - New RGR test

## Refactor Phase

No refactoring needed. The fix is a simple removal of problematic code.

## Verification

### Unit Tests
```bash
cargo test models::core::tests --lib
```
**Result:** ✅ 20 passed

### Key Behavior Changes

**Before Fix:**
- Start → None (EOF) → Line 1 auto-changed to End ❌
- User couldn't keep line 1 as standalone

**After Fix:**
- Start → None (EOF) → Line 1 stays None ✅
- User's explicit marker choices are respected
- Line 1 continues the unclosed group (system_id=1) but marker stays None

## Important Notes

1. **Auto-close still works for Start → Start patterns**: When a new Start is encountered, the previous line gets End added (lines 1145-1149). This is correct behavior.

2. **None markers inside Start...End pairs**: None markers between Start and End continue the group (stay in same system_id). This is correct for bracketed multi-line groups.

3. **Unclosed groups**: If a Start is not followed by End, subsequent None markers continue the group but keep their None marker. The group just doesn't have an explicit End marker.

## Files Modified

- `src/models/core.rs` - Lines 1175-1180 (removed EOF auto-close)
- `src/models/core.rs` - Lines 2253-2276 (updated test_system_marker_auto_close_at_eof)
- `src/models/core.rs` - Lines 2372-2396 (updated test_system_marker_start_followed_by_none_should_not_auto_close_none_to_end)
- `src/models/core.rs` - Lines 2418-2444 (new test_set_line_0_to_start_line_1_stays_none)

## Related Issue

This fixes the user's complaint: "system shouldn't be changing system choices!"

The system now respects the user's explicit marker choices and doesn't auto-modify them.
