# FSM Pattern Reference from doremi-script

**Source**: `archive/doremi-script/src/doremi_script/to_lilypond.cljc` (lines 542-682)

**Purpose**: Document the explicit state machine pattern used in the Clojure implementation as a reference for the Rust FSM refactoring.

## Key Insight: Dash Handling

The Clojure code shows the correct way to handle consecutive dashes:

```clojure
[:in-beat :dash]
(start-dash accum obj)

[:collecting-dashes-in-beat :dash]
(-> accum (update-in [:dash-microbeats] inc))
```

**What happens**:
1. **First dash**: State is `InBeat`, token is `:dash` → call `start-dash`, transition to `CollectingDashesInBeat`
2. **Subsequent dashes**: State is `CollectingDashesInBeat`, token is `:dash` → increment `dash-microbeats` counter, stay in same state
3. **Other token**: Exit dashing state by calling `finish-dashes` and processing the new token

**Result**: Multiple consecutive dashes are counted as **ONE element** with duration = dash-microbeats / beat-length

## State Transition Table

```clojure
;; Beat state transitions:
[:in-beat :dash]                          → start-dash (→ :collecting-dashes-in-beat)
[:collecting-dashes-in-beat :dash]        → increment dash-microbeats
[:collecting-dashes-in-beat :pitch]       → finish-dashes, start-pitch (→ :collecting-pitch-in-beat)
[:collecting-dashes-in-beat :beat]        → finish-dashes, finish-beat, start-beat (→ :in-beat)
[:collecting-dashes-in-beat :barline]     → finish-dashes, finish-beat, save-barline (→ :in-notes-line)

[:in-beat :pitch]                         → start-pitch (→ :collecting-pitch-in-beat)
[:collecting-pitch-in-beat :dash]         → increment current-pitch.micro-beats
[:collecting-pitch-in-beat :pitch]        → finish-pitch, start-pitch (→ :collecting-pitch-in-beat)
[:collecting-pitch-in-beat :beat]         → finish-pitch, finish-beat, start-beat (→ :in-beat)
[:collecting-pitch-in-beat :barline]      → finish-pitch, finish-beat, save-barline (→ :in-notes-line)
```

## How to Translate to Rust

### 1. States Enum
```rust
#[derive(Debug, Clone, Copy, PartialEq)]
enum BeatProcessingState {
    InBeat,
    CollectingDashesInBeat,
    CollectingPitchInBeat,
}
```

### 2. Transition Function
```rust
fn beat_transition(
    state: BeatProcessingState,
    cell: &Cell,
    accum: &mut BeatAccumulator,
) -> BeatProcessingState {
    match (state, cell) {
        // Dashes
        (BeatProcessingState::InBeat, Cell::Dash) => {
            accum.start_dash();
            BeatProcessingState::CollectingDashesInBeat
        }
        (BeatProcessingState::CollectingDashesInBeat, Cell::Dash) => {
            accum.dash_microbeats += 1;
            BeatProcessingState::CollectingDashesInBeat
        }
        // ... more transitions ...
    }
}
```

### 3. Main Loop
```rust
fn normalize_beat_fsm(beat: &[Cell]) -> BeatResult {
    let mut accum = BeatAccumulator::new();
    let mut state = BeatProcessingState::InBeat;

    for cell in beat {
        state = beat_transition(state, cell, &mut accum);
    }

    // Finalize any pending state
    accum.finalize(state);
    accum.into_result()
}
```

## Critical Mathematical Properties

**Within a beat**:
- Sum of all `element_divisions` = `beat_divisions`
- Each element occupies consecutive "slots" in the beat subdivision
- Dashes extend the previous element's duration

**Example**: Beat `1--3` with 4 micro-beats
```
1--3
↓ ↓ ↓ ↓
4 divisions total = beat_divisions

Element 1: occupies slots [0,1,2] = 3 divisions
Element 3: occupies slot [3] = 1 division

duration_note_1 = 3/4 * quarter_note = dotted eighth
duration_note_3 = 1/4 * quarter_note = sixteenth
```

## Files to Create/Modify

1. **`src/renderers/musicxml/fsm.rs`** (NEW)
   - Define `BeatProcessingState` enum
   - Define `BeatAccumulator` struct
   - Implement `beat_transition()` function
   - Unit tests for all state transitions

2. **`src/renderers/musicxml/beat.rs`** (REWRITE)
   - Replace `normalize_beat()` with `normalize_beat_fsm()`
   - Use explicit state machine loop
   - Call `beat_transition()` for each cell

3. **Supporting functions**:
   - `start_dash()` - initialize dash collection
   - `finish_dashes()` - finalize and emit rest/note
   - `start_pitch()` - initialize note collection
   - `finish_pitch()` - finalize and emit note
   - `finish_beat()` - finalize beat and return result

## References

- **Automata Theory**: Explicit state transitions are formally correct pattern from theory
- **Compiler Design**: FSM pattern used in lexers (tokenization) and parsers (syntax analysis)
- **Gang of Four State Pattern**: "Behavioral design pattern that allows an object to alter its behavior when its internal state changes"
- **Clojure Source**: Lines 542-682 of `archive/doremi-script/src/doremi_script/to_lilypond.cljc`
