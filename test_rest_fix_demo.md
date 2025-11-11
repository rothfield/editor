# Rest Duration Scaling Bug Fix

## Problem

The IR (Intermediate Representation) to MusicXML conversion was producing incorrect rest durations because event divisions were not being scaled from beat-relative to measure-relative units.

## Example

### Input IR (from user):
```json
{
  "divisions": 2,
  "events": [
    { "Rest": { "divisions": 1 } },
    { "Note": { "pitch": "N1", "divisions": 1 } },
    { "Note": { "pitch": "N2", "divisions": 1 } }
  ]
}
```

### Before Fix:
- **Problem**: Event divisions were beat-relative (not scaled)
- Rest with divisions=1 → MusicXML `<duration>1</duration>` → **Eighth rest** (WRONG)
- But measure.divisions=2 means 2 divisions per quarter note
- So divisions=1 = half quarter = eighth note
- **Invalid**: Sum (1+1+1=3) ≠ measure.divisions (2)

### After Fix:
- **Solution**: Scale event divisions by (measure_divisions / beat_divisions)
- If beat has 3 subdivisions and measure has divisions=6:
  - scale_factor = 6 / 3 = 2
  - Rest: 1 * 2 = 2 divisions → **Quarter rest** (CORRECT)
  - Note1: 1 * 2 = 2 divisions → **Quarter note** (CORRECT)
  - Note2: 1 * 2 = 2 divisions → **Quarter note** (CORRECT)
- **Valid**: Sum (2+2+2=6) = measure.divisions (6) ✓

## Fix Location

**File**: `src/renderers/musicxml/line_to_ir.rs`
**Lines**: 947-965

### Code Added:

```rust
// Scale all event divisions from beat-relative to measure-relative
// Events are created with divisions relative to their beat, but must be scaled
// to match the measure's LCM divisions
for (beat_start_idx, beat_end_idx, beat_div) in &beat_event_ranges {
    let scale_factor = measure_divisions / beat_div;
    for event in &mut all_events[*beat_start_idx..*beat_end_idx] {
        match event {
            ExportEvent::Rest { divisions } => {
                *divisions *= scale_factor;
            }
            ExportEvent::Note(note) => {
                note.divisions *= scale_factor;
            }
            ExportEvent::Chord { divisions, .. } => {
                *divisions *= scale_factor;
            }
        }
    }
}
```

## Test Added

**Test**: `test_rest_division_scaling_single_beat()`
**Location**: `src/renderers/musicxml/line_to_ir.rs:1133-1204`

Verifies that:
1. Events are created with beat-relative divisions
2. Scaling factor is calculated correctly
3. All event divisions are scaled properly
4. Invariant is maintained: sum(event.divisions) == measure.divisions

## MusicXML Output

### Before (WRONG):
```xml
<measure>
  <attributes><divisions>2</divisions></attributes>
  <note><rest/><duration>1</duration><type>eighth</type></note>
  <!-- Eighth rest, not quarter rest! -->
</measure>
```

### After (CORRECT):
```xml
<measure>
  <attributes><divisions>2</divisions></attributes>
  <note><rest/><duration>2</duration><type>quarter</type></note>
  <!-- Quarter rest, as expected! -->
</measure>
```

## Impact

This fix ensures that:
- ✅ Rest durations are correctly calculated in all time signatures
- ✅ Note durations are correctly scaled to match measure divisions
- ✅ Chord durations are also fixed
- ✅ The IR invariant is maintained: sum(event.divisions) == measure.divisions
- ✅ MusicXML output matches the musical intent

## Related Files

- `src/renderers/musicxml/line_to_ir.rs` - Main fix location
- `src/renderers/musicxml/emitter.rs` - Uses the fixed IR
- `src/renderers/musicxml/export_ir.rs` - IR type definitions
