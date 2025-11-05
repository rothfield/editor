# Slur-Tuplet Fix: Root Cause Analysis and Proper Fix Location

## Status: Bug Still Present in Tuplet Case

While my initial fix in `beat.rs` works for regular slurs, it **does not fix the tuplet case**. The root cause is that the fix is in the wrong architectural layer.

## The Problem: Multi-Layer Slur Marker Processing

The editor has a complex processing pipeline for slur markers:

```
Layer 1: CELLS (Document Model)
├─ Alt+S applied to cells → marks cell[i] with SlurStart, cell[j] with SlurEnd
│
Layer 2: INTERMEDIATE REPRESENTATION (IR)  ← SLUR BUG HAPPENS HERE
├─ cell_to_ir.rs: attach_slur_to_note() transfers SlurStart/SlurEnd from cells to IR notes
├─ Problem: Doesn't account for cell-to-note reordering in tuplets
├─ fill_slur_continue_markers() fills in "continue" between start/stop
│
Layer 3: BEAT PROCESSING
├─ beat.rs: Processes IR notes by beat
├─ My fix: Tries to recompute slur types (too late!)
│
Layer 4: MusicXML EMISSION
└─ builder.rs: Writes notes with slur markers to XML
```

## Why My beat.rs Fix Doesn't Work

1. Slur markers are **already set at the IR level** before beat.rs processing
2. The IR has incorrect slur markers for tuplets due to cell-to-note mapping issues
3. My beat.rs fix computes slur types from already-incorrect IR note slurs
4. The fix is "too late" in the pipeline

## The Real Issue: cell_to_ir.rs

When converting cells to IR notes in a tuplet:

**Input (Cells):**
```
Cell[0] "1": slur_indicator=none
Cell[1] "2": slur_indicator=SlurStart   ← WRONG! Should be SlurStart on cell[0]
Cell[2] "3": slur_indicator=SlurEnd
```

**Problem:** The slur markers are on the MIDDLE note [1] instead of the START note [0]

**This happens because:**
1. When user types "123" and presses Alt+S, somehow the slur markers get set on [1] and [2]
2. This might be a selection/input bug in the editor UI layer (how Alt+S determines which cells to mark)
3. OR it could be that when cells are grouped into a beat (for tuplet processing), the mapping changes

## Existing Slur Infrastructure in cell_to_ir.rs

The code has these functions:
- `attach_slur_to_note()` (line 440) - Transfers SlurStart/SlurEnd from cell to IR note
- `fill_slur_continue_markers()` (line 407) - Fills in "continue" between start/stop

The `fill_slur_continue_markers()` function already implements the correct logic:
```rust
fn fill_slur_continue_markers(events: &mut [ExportEvent], line_inside_slur: &mut bool) {
    for event in events.iter_mut() {
        if let ExportEvent::Note(ref mut note) = event {
            if let Some(ref slur_data) = note.slur {
                match slur_data.type_ {
                    SlurType::Start => {
                        *line_inside_slur = true;  // Mark: now inside slur
                    }
                    SlurType::Stop => {
                        *line_inside_slur = false;  // Mark: slur ended
                    }
                    SlurType::Continue => {
                        // Already marked as continue, skip
                    }
                }
            } else if *line_inside_slur {
                // Add continue marker if missing between start and stop
                note.slur = Some(SlurData {
                    placement: SlurPlacement::Above,
                    type_: SlurType::Continue,
                });
            }
        }
    }
}
```

This is the RIGHT approach! It works at the IR level where we can see the full sequence of notes.

## The Proper Fix Location

**Option A: Keep fix in beat.rs BUT fix the underlying issue**
- Figure out WHY cells [1] and [2] get slur markers instead of [0] and [2]
- This is likely a UI/input issue when applying Alt+S to "123"

**Option B: Move/enhance fix to cell_to_ir.rs** (RECOMMENDED)
- After building IR events from cells, run a similar "recompute slur span" logic
- But WAIT - at the IR level, the slur markers should already be correct IF the cells were marked correctly
- The issue is that the IR processing doesn't know it's dealing with a tuplet

## Key Insight

The tuplet information is only available in `beat.rs` (during rhythm processing). But slur markers are finalized in `cell_to_ir.rs` (before beat processing).

So maybe the solution is:
1. **Revert my beat.rs fix** (since it's trying to fix the wrong layer)
2. **Investigate why Alt+S marks cells [1] and [2] instead of [0] and [2]** for "123"
3. **Either fix the input layer** (Alt+S behavior) **OR** apply the fix at the right layer

##Current Status

- My beat.rs fix: Works for space-separated notes ("1 2 3") but NOT for tuplets ("123")
- Reason: Space-separated notes are processed as multiple beats, slur computation happens correctly
- Tuplets: Processed as a single beat with tuplet markers, but the underlying IR slur markers are wrong

## Next Steps

1. Investigate why Alt+S applies markers to cells [1, 2] instead of [0, 2] when "123" is selected
2. Either:
   - Fix the selection/input bug
   - OR apply a tuplet-aware fix in cell_to_ir.rs after the beat rhythm is determined
   - OR rework the slur processing to be beat-aware, not just cell-aware

## Files Involved

- `src/renderers/musicxml/cell_to_ir.rs` - Where slur markers are transferred to IR (the real fix should be here or in input layer)
- `src/renderers/musicxml/beat.rs` - Where my current incomplete fix is (should be reverted?)
- Input/UI layer - Where Alt+S determines which cells to mark (likely where the bug originates)
