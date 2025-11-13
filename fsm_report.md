# FSM Architecture Research Report: Cross-Beat Dash Extension

**Date:** 2025-11-11
**Purpose:** Document findings from archive codebase research to fix cross-beat dash handling
**Problem:** `1 -` (pitch + space + dash) currently produces `c4 r4` (note + rest) instead of `c2` (extended note)

---

## Executive Summary

The archive implementation at `/home/john/editor/archive/music-text/tmp/last_src/rhythm/analyzer.rs` contains a **complete FSM with cross-beat extension tracking** that solves the dash-after-space problem. However, even this implementation produces **tied notes** (c4~ c4) rather than a single extended note.

**Key Finding:** To achieve single extended notes (c2), we need to **merge dash-only beats** at the structural level BEFORE FSM processing, not just track extension state within the FSM.

---

## Archive FSM State Definitions

### States (4 total)

```rust
enum State {
    S0,                       // Initial/Between elements
    ExtendingPitchInBeat,     // Extending current note with dashes
    ExtendingDashInBeat,      // Extending dashes (rests/ties) with more dashes
    Halt,                     // End of processing
}
```

### Critical State Variables (Missing from Current Implementation)

```rust
struct FSM {
    state: State,

    // ⭐ KEY: These three fields enable cross-beat extension
    extension_chain_active: bool,        // Tracks if last note can extend across beats
    last_note_across_beats: Option<Degree>, // Stores pitch to create tied notes
    pending_tie: bool,                   // Marks when dash creates tie intention

    current_beat: Option<Beat>,
    output: Vec<Item>,
}
```

**Current system is missing all three cross-beat tracking fields!**

---

## How Cross-Beat Extension Works (Archive)

### Example: `1 -` Processing

**Step 1: Process `1` (Note)**
```
State: S0 → ExtendingPitchInBeat
Action: start_beat_with_note()
Set: extension_chain_active = true
Set: last_note_across_beats = Some(Degree::N1)
```

**Step 2: Process ` ` (Whitespace/Beat boundary)**
```
State: ExtendingPitchInBeat + Whitespace
Action: finish_beat() → emits Beat with note "1" (1 subdivision)
State: → S0
CRITICAL: extension_chain_active REMAINS true ✅
CRITICAL: last_note_across_beats REMAINS Some(N1) ✅
```

**Step 3: Process `-` (Dash in new beat)**
```
State: S0 + Dash
Check: extension_chain_active && last_note_across_beats.is_some()
Result: TRUE → calls start_beat_with_tied_note()
Creates: New beat with TIED note (same pitch as previous)
Sets: pending_tie = true
State: → ExtendingPitchInBeat
```

**Output:**
- Beat 1: Note N1 (1 subdivision)
- Beat 2: Note N1 (1 subdivision) **with tie-to-previous flag**

**LilyPond result:** `c4~ c4` (tied half-note)

---

## Current FSM (Broken Implementation)

### Current States

```rust
pub enum CellGroupingState {
    InBeat,
    CollectingDashesInBeat,
    CollectingPitchInBeat,
    CollectingTrailingGraceNotes,
}
```

### Current Accumulator (Missing Critical Fields)

```rust
pub struct BeatAccumulator {
    pub events: Vec<ExportEvent>,
    pub current_divisions: usize,
    pub pending_pitch: Option<PitchInfo>,
    pub has_main_element: bool,

    // ❌ MISSING: extension_chain_active
    // ❌ MISSING: last_note_across_beats
    // ❌ MISSING: pending_tie
}
```

### Why Current System Fails

When finishing a beat, **all state is reset**:

```rust
(State::CollectingPitchInBeat, Whitespace) => {
    self.finish_pitch();
    State::InBeat  // ❌ Loses all cross-beat context
}
```

Result: Dash after space has no memory of previous note → becomes a rest.

---

## Key Differences: Archive vs. Current

| Feature | Archive FSM | Current FSM | Impact |
|---------|-------------|-------------|--------|
| **Cross-beat tracking** | ✅ `extension_chain_active` | ❌ Missing | Dashes become rests |
| **Pitch memory** | ✅ `last_note_across_beats` | ❌ Missing | Can't create tied notes |
| **Tie intention** | ✅ `pending_tie` | ❌ Missing | No tie detection |
| **State persistence** | ✅ Persists across beats | ❌ Resets at boundary | Loses chain |
| **Breathmark handling** | ✅ Clears extension chain | ❌ Not implemented | Can't end phrases |

---

## Archive FSM Transition Logic (Critical Cases)

### Case 1: Dash in S0 with Extension Chain Active

```rust
(State::S0, ParsedElement::Dash { .. }) => {
    if self.extension_chain_active && self.last_note_across_beats.is_some() {
        self.pending_tie = true;  // Mark tie intention
        self.start_beat_with_tied_note(element);
    } else {
        self.start_beat_with_rest(element);
    }
}
```

**Decision:** Active extension chain? → Create tied note : Create rest

### Case 2: Whitespace Preserves Extension Chain

```rust
(State::ExtendingPitchInBeat, ParsedElement::Whitespace { .. }) => {
    self.finish_beat();  // Emits beat
    self.state = State::S0;  // Return to S0
    // ✅ extension_chain_active REMAINS TRUE
    // ✅ last_note_across_beats REMAINS SET
}
```

**Critical difference:** Archive FSM preserves cross-beat state through whitespace transitions.

### Case 3: Breathmark Clears Extension Chain

```rust
fn handle_breathmark(&mut self) {
    self.extension_chain_active = false;  // ✅ Explicit clear
    self.last_note_across_beats = None;
    self.pending_tie = false;
    self.output.push(Item::Breathmark);
}
```

**Purpose:** Musical breathmark ends phrase, prevents dashes from extending.

### Case 4: Update Extension Chain After Note

```rust
fn update_extension_chain(&mut self, element: &ParsedElement) {
    if let ParsedElement::Note { degree, .. } = element {
        self.last_note_across_beats = Some(*degree);
        self.extension_chain_active = true;
    }
}
```

**Called by:** Every function that creates a note element.

---

## Test Case Comparison

| Input | Archive Output | Current Output | Status |
|-------|----------------|----------------|--------|
| `1 -` | `c4~ c4` (tied) | `c4 r4` (rest) | ❌ Current broken |
| `1- 2` | `c4. d8` | `c4. d8` | ✅ Both work (in-beat) |
| `1 - 2` | `c4~ c4 d4` | `c4 r4 d4` | ❌ Current broken |
| `1 ' -` | `c4 r4` | `c4 r4` | ✅ Both work (breathmark clears) |
| `1 2 -` | `c8 d8~ d4` | `c8 d8 r4` | ❌ Current broken |

---

## State Transition Table (Archive FSM)

| Current State | Input | Next State | Action | Cross-Beat State |
|---------------|-------|------------|--------|------------------|
| **S0** | Note | ExtendingPitchInBeat | Start beat, set chain | `extension_chain_active = true` |
| **S0** | Dash (chain active) | ExtendingPitchInBeat | Create tied note | `pending_tie = true` |
| **S0** | Dash (chain inactive) | ExtendingDashInBeat | Create rest | - |
| **S0** | Whitespace | S0 (self) | Ignore | - |
| **S0** | Breathmark | S0 (self) | Clear chain | `extension_chain_active = false` |
| **ExtendingPitchInBeat** | Dash | Self | Extend note duration | - |
| **ExtendingPitchInBeat** | Note | Self | Add new note, update chain | `last_note_across_beats = new` |
| **ExtendingPitchInBeat** | Whitespace | S0 | Finish beat | **Preserve chain** ✅ |
| **ExtendingPitchInBeat** | Barline | S0 | Finish beat, emit barline | **Preserve chain** ✅ |
| **ExtendingDashInBeat** | Dash | Self | Extend rest duration | - |
| **ExtendingDashInBeat** | Note | ExtendingPitchInBeat | Finish rest, start note | Set chain |
| **ExtendingDashInBeat** | Whitespace | S0 | Finish beat | - |

---

## Current FSM State Transition Table

| Current State | Input | Next State | Action | Problem |
|---------------|-------|------------|--------|---------|
| **InBeat** | Dash | CollectingDashesInBeat | Start rest | ❌ No chain check |
| **CollectingPitchInBeat** | Whitespace | InBeat | Finish beat | ❌ **Resets all state** |
| **CollectingPitchInBeat** | Dash | Self | Extend note | ✅ Works in-beat |

**Key Problem:** Unconditional reset to `InBeat` without checking extension chain.

---

## Side-by-Side FSM Execution

### Archive FSM (Correct for Tied Notes)

```
Input: "1 -"

[State: S0, chain_active: false]
  → Note '1'
    Action: start_beat_with_note()
    Set: chain_active = true, last_note = N1
[State: ExtendingPitchInBeat, chain_active: true, last_note: N1]
  → Whitespace
    Action: finish_beat() → emit Beat(Note N1, 1 div)
[State: S0, chain_active: TRUE ✅, last_note: N1 ✅]
  → Dash '-'
    Check: chain_active && last_note? → YES
    Action: start_beat_with_tied_note(N1)
[State: ExtendingPitchInBeat]
  → END
    Action: finish_beat() → emit Beat(Note N1 tied, 1 div)

Output: Beat(N1) + Beat(N1 tied) = c4~ c4
```

### Current FSM (Broken)

```
Input: "1 -"

[State: InBeat]
  → Note '1'
    Action: start_pitch()
[State: CollectingPitchInBeat]
  → Whitespace
    Action: finish_pitch() → emit Note(N1, 1 div)
[State: InBeat] ❌ ALL STATE LOST
  → Dash '-'
    Check: Is pitched? → NO
    Action: start_dash() → creates REST ❌
[State: CollectingDashesInBeat]
  → END
    Action: finish_dashes() → emit Rest(1 div)

Output: Note(N1) + Rest(1) = c4 r4 ❌
```

---

## The Gap: Tied Notes vs. Single Extended Note

### Archive Produces Tied Notes (Not Ideal)

Even the archive FSM produces `c4~ c4` (two tied notes), not `c2` (one extended note).

**Why?** Because beats are processed independently, then ties are added between them.

### What We Actually Want

According to user requirements:
- `1 -` should produce **ONE** note with 2 divisions
- Output: `c2` (half note)
- NOT: `c4~ c4` (two tied quarters)

### Solution: Beat Merging

To get a single extended note, we need to:

1. **Detect dash-only beats** - Beat contains ONLY dash characters
2. **Check if mergeable** - Previous beat ended with a note
3. **Merge at structural level** - Combine cells BEFORE FSM processing
4. **Result:** FSM sees one long beat → produces one extended note

**Example:**
```
Input cells: [Cell('1', col=0), Cell(' ', col=1), Cell('-', col=2)]

Beat boundaries: [0, 2, 3]
  Beat 1: cells[0..2] = ['1', ' ']
  Beat 2: cells[2..3] = ['-']

Check: Is beat 2 dash-only? YES
Check: Did beat 1 end with note? YES
Action: MERGE
  Combined beat: cells[0..3] = ['1', ' ', '-']

FSM processes: ['1', '-'] (filtered spaces)
Result: Single note with 2 divisions
Output: c2
```

---

## Implementation Requirements

### Phase 1: Add Archive FSM State Tracking

**Add to `BeatAccumulator`:**
```rust
pub extension_chain_active: bool,
pub last_note_across_beats: Option<PitchCode>,
pub last_note_octave: i8,
```

**Update `finish_pitch()` to set state:**
```rust
self.last_note_across_beats = Some(pitch.pitch_code);
self.last_note_octave = pitch.octave;
self.extension_chain_active = true;
```

**Update `finish_dashes()` to clear state:**
```rust
self.extension_chain_active = false;
self.last_note_across_beats = None;
```

### Phase 2: Detect Dash-Only Beats

```rust
fn is_dash_only_beat(cells: &[&Cell]) -> bool {
    !cells.is_empty() &&
    cells.iter().all(|c| c.kind == ElementKind::UnpitchedElement && c.char == "-")
}
```

### Phase 3: Merge Dash-Only Beats

**In beat processing loop:**
```rust
while i < beat_boundaries.len() - 1 {
    let mut beat_cells = collect_beat_cells(i);

    // Look ahead to next beat
    if next_beat_is_dash_only() && current_beat_ended_with_note() {
        // MERGE: Append next beat's dashes
        beat_cells.extend(next_beat_cells);
        i += 1;  // Skip next beat
    }

    // Process merged beat
    process_beat(beat_cells);
    i += 1;
}
```

### Phase 4: Remove Post-Processing Workaround

Delete `extend_notes_across_beat_boundaries()` function - no longer needed.

---

## Expected Outcomes

### Before (Current Broken State)
```
Input: "1 -"
Process: Beat 1: Note(1) | Beat 2: Rest(1)
Output: c4 r4  ❌
```

### After Phase 1 (Archive FSM Ported)
```
Input: "1 -"
Process: Beat 1: Note(1, tie-start) | Beat 2: Note(1, tie-stop)
Output: c4~ c4  🟡 Better but not ideal
```

### After Phase 3 (Beat Merging)
```
Input: "1 -"
Process: Merged beat: Note(2)
Output: c2  ✅ Perfect!
```

---

## Edge Cases to Handle

### Multiple Dash-Only Beats
```
Input: "1 - - -"
Process: Merge all three dash-only beats
Output: c1 (whole note)
```

### Dash-Only Beat After Rest
```
Input: "- 1 -"
Process: First dash is rest (no chain), second dash extends note
Output: r4 c4~ c4 (or r4 c2 after merge)
```

### Barline Clears Extension Chain
```
Input: "1 | -"
Process: Barline clears extension_chain_active
Output: c4 | r4 (no cross-measure extension)
```

### Mixed Content Beat
```
Input: "1 -2"
Process: Beat has dash AND pitch, don't merge across space
Output: c4. d8 (in-beat extension works)
```

---

## Advantages of Beat Merging Approach

### vs. Archive FSM (Tied Notes)

**Archive approach:**
- Creates two separate beats with tie flags
- More complex LilyPond output: `c4~ c4`
- Requires tie rendering logic
- More verbose MusicXML (two `<note>` elements)

**Beat merging approach:**
- Creates single beat with extended duration
- Simpler LilyPond output: `c2`
- No tie logic needed
- Cleaner MusicXML (one `<note>` element)

### Alignment with RHYTHM.md Principles

From RHYTHM.md:
> "Physical distance on the page = Musical time duration"

Beat merging directly implements this:
- `1 -` occupies 2 character positions
- Merged into single note with 2 divisions
- Visual space directly maps to duration

---

## Files to Modify

1. **`src/renderers/musicxml/line_to_ir.rs`**
   - Add fields to `BeatAccumulator` (~line 42-73)
   - Add `is_dash_only_beat()` helper
   - Modify beat processing loop (~line 907-937)
   - Update `finish_pitch()` to set extension chain
   - Update `finish_dashes()` to clear extension chain
   - Delete `extend_notes_across_beat_boundaries()` function (~line 436-485)
   - Delete call to removed function (~line 986)
   - Update `test_cross_beat_tie()` → `test_cross_beat_extension()`

2. **`tests/e2e-pw/tests/cross-beat-tie.spec.js`**
   - Rename to `cross-beat-extension.spec.js`
   - Update assertions:
     - Expect 1 note, not 2
     - Expect no `<tie>` elements
     - Expect `c2` not `c4~ c4`

---

## Testing Strategy

### Unit Tests

```rust
#[test]
fn test_cross_beat_extension() {
    // "1 -" → single note with 2 divisions
    assert_eq!(measures[0].events.len(), 1);
    assert_eq!(measures[0].events[0].divisions, 2);
    assert!(measures[0].events[0].tie.is_none());
}

#[test]
fn test_multiple_dash_beats() {
    // "1 - - -" → single note with 4 divisions
    assert_eq!(measures[0].events[0].divisions, 4);
}

#[test]
fn test_barline_clears_extension() {
    // "1 | -" → no cross-measure extension
    assert_eq!(measures[0].events[0].divisions, 1);
    assert!(matches!(measures[1].events[0], ExportEvent::Rest { .. }));
}
```

### E2E Tests

- Verify MusicXML has single `<note>` with correct `<duration>`
- Verify LilyPond outputs `c2` not `c4~ c4`
- Verify no `<tie>` elements in MusicXML

---

## Risk Assessment

**Low Risk:**
- Beat merging happens at structural level (before FSM)
- FSM sees merged cells, processes normally
- Clean separation: detection → merge → process

**Potential Issues:**
- Need careful tracking of `beat_event_ranges` after merge
- Barline handling must clear extension chain
- Multiple consecutive dash-only beats need iteration

**Mitigation:**
- Comprehensive test coverage
- Incremental implementation (Phase 1, then Phase 2, etc.)
- Each phase independently testable

---

## Conclusion

The archive FSM provides the **cross-beat state tracking** needed to fix the current broken behavior, but it still produces tied notes (c4~ c4) rather than single extended notes (c2).

To achieve the desired single extended note output, we need to:

1. **Port archive FSM state tracking** (extension_chain_active, last_note_across_beats)
2. **Add beat merging logic** to combine dash-only beats structurally
3. **Remove post-processing workaround** that creates tied notes

This approach is **cleaner, more intuitive, and better aligned** with the "spatial = temporal" principle of the rhythm system.

---

**Implementation Status:** Ready to begin Phase 1 (Add state tracking fields)
