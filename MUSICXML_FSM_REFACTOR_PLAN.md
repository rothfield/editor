# MusicXML Export: Production Refactor with IR Layer

**Date**: 2025-10-28 (Updated: POC → Production)
**Branch**: 006-music-notation-ornament
**Architecture**: Three-layer design with IR (Intermediate Representation)
**Priority**: High - Current code is POC-level, missing slurs/lyrics/staves

---

## Executive Summary

**Current State**: POC-level MusicXML export missing critical features:
- ❌ Slurs (mentioned by user as missing)
- ❌ Lyrics (completely absent)
- ❌ Multiple staves (single staff only)
- ❌ Chords (simultaneous pitches)
- ❌ Articulations (structure exists, not wired)
- ❌ Proper beam grouping (only grace notes)
- ❌ **Bug**: `--` produces `r1` instead of `r4`

**Decision**: Full refactor with IR layer (not minimal patch) because:
1. Adding features to POC code = technical debt
2. IR layer makes slurs/lyrics/staves trivial to add
3. Do it once properly instead of 4 separate rewrites

**Architecture**: ChatGPT-aligned three-layer design
1. **Layer 1** (existing): Document model (`Document → Line → Vec<Cell>`)
2. **Layer 2** (NEW, FSM lives here): Cell grouping (`Vec<Cell> → Vec<ExportMeasure>`)
3. **Layer 3** (NEW): XML emitter (`Vec<ExportMeasure> → MusicXML String`)

---

## Problem Statement

### Immediate Bug
- Input: `--` (two dashes at beat start)
- Expected: LilyPond `r4` (quarter rest = one beat)
- Actual: LilyPond `r1` (whole rest = four beats)

### Broader Issues (POC Limitations)

**Current implementation in `src/renderers/musicxml/`**:
- Scattered logic across converter.rs, measure.rs, beat.rs, builder.rs
- Implicit FSM (boolean flags instead of explicit states)
- Cannot handle:
  - Slurs across multiple notes
  - Lyrics attachment to syllables
  - Multiple staves in same score
  - Chords (simultaneous pitches at same timestamp)
  - Proper beam grouping for main notes (only grace notes)
  - Many articulations (staccato, accent, etc.)

**Why minimal fix won't work**:
- Fixing `--` bug in current code: 5 lines
- Adding slurs: rewrite beat processing
- Adding lyrics: rewrite cell grouping
- Adding staves: rewrite measure structure
- = **4 rewrites instead of 1**

**Better approach**: Refactor once with IR layer, then features are easy.

---

## Document Model (from `src/models/core.rs`)

```rust
pub struct Document {
    pub title: Option<String>,
    pub composer: Option<String>,
    pub key_signature: Option<String>,
    pub lines: Vec<Line>,  // Currently: 1 line = 1 staff (limitation)
}

pub struct Line {
    pub cells: Vec<Cell>,         // Flat array, NOT hierarchical
    pub lyrics: String,           // ❌ Currently string, not structured
    pub key_signature: String,
    pub time_signature: String,
    // ... more fields
}

pub struct Cell {
    pub char: String,                    // Single glyph
    pub kind: ElementKind,
    pub continuation: bool,              // Part of previous cell
    pub col: usize,                      // Column position
    pub pitch_code: Option<PitchCode>,
    pub octave: i8,
    pub slur_indicator: SlurIndicator,   // ✅ Exists but not exported
    pub ornament_indicator: OrnamentIndicator,
    // ... more fields
}
```

**Key observations**:
- Slur data exists in cells but never exported to MusicXML ❌
- Lyrics is unstructured string, not per-note syllables ❌
- No staff assignment per cell ❌

---

## Feature Matrix: Current vs. Target

| Feature | Current Status | IR Support | Target |
|---------|---------------|------------|--------|
| **Notes/rests** | ✅ Works | `ExportEvent::Note/Rest` | ✅ Preserve |
| **-- bug** | ❌ Broken | FSM fix in `CollectingRestDashes` | ✅ Fix |
| **Tuplets** | ✅ Works | `ExportEvent::Tuplet` | ✅ Preserve |
| **Grace notes** | ✅ Works (before/after/on-top) | `ExportEvent::GraceBefore/After` | ✅ Preserve |
| **Ties** | ✅ Basic | `NoteData.tie_start/end` flags | ✅ Preserve |
| **Slurs** | ❌ **MISSING** | `NoteData.slur_start/end` flags | ✅ **ADD** |
| **Lyrics** | ❌ **MISSING** | `ExportEvent::Lyrics { syllable, syllabic }` | ✅ **ADD** |
| **Multiple staves** | ❌ **MISSING** | `NoteData.staff` number | ✅ **ADD** |
| **Chords** | ❌ **MISSING** | `ExportEvent::Chord(Vec<NoteData>)` | ✅ **ADD** |
| **Beaming** | 🟡 Grace only | `NoteData.beam_state` | ✅ Expand |
| **Articulations** | 🟡 Struct exists | `NoteData.articulations` | ✅ Wire up |
| **Dynamics** | ❌ Missing | `ExportEvent::Direction(Dynamic)` | 🔵 Future |
| **Key signature** | ✅ Works | `MeasureAttrs.key_signature` | ✅ Preserve |
| **Pitch handling** | ✅ Works | `PitchCode` → (step, alter) | ✅ Preserve |
| **Duration** | ✅ Works | `duration_divs` + conversion | ✅ Preserve |
| **LCM divisions** | ✅ Works | `calculate_divisions()` | ✅ Preserve |
| **Continuation cells** | ✅ Works | Skip in FSM | ✅ Preserve |
| **Rhythm-transparent** | ✅ Works | Separate FSM path | ✅ Preserve |
| **Breath marks** | ✅ Works | Reset tie context | ✅ Preserve |
| **Barlines** | ✅ Works | Measure boundaries | ✅ Preserve |

**Legend**:
- ✅ Working, preserve
- ❌ Missing, must add
- 🟡 Partial, must complete
- 🔵 Future, not required now

---

## Three-Layer Architecture

```
┌─────────────────────────────────────────────────────┐
│ Layer 1: Document Model (EXISTING)                 │
│ Document → Lines → Cells (flat, editor-focused)    │
└──────────────────┬──────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────┐
│ Layer 2: Export IR (NEW - FSM LIVES HERE)          │
│ Vec<Cell> → [FSM: group_cells_into_events()]       │
│          ↓                                          │
│ Vec<ExportMeasure> with:                            │
│   - Notes/rests with durations                      │
│   - Slurs (start/end flags)                         │
│   - Lyrics (syllable + syllabic type)               │
│   - Staff assignments                               │
│   - Chords (simultaneous pitches)                   │
│   - Articulations, dynamics, etc.                   │
│                                                     │
│ ⚠️  THIS IS WHERE WE FIX THE -- BUG                │
└──────────────────┬──────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────┐
│ Layer 3: MusicXML Emitter (NEW)                    │
│ Vec<ExportMeasure> → [Simple FSM] → String         │
│                                                     │
│ Outer FSM: Score → Part → Measures                 │
│ Inner FSM: Attributes → Events                     │
│                                                     │
│ Just serialize structured IR, no complex logic     │
└─────────────────────────────────────────────────────┘
```

---

## Layer 2: Export IR Types (EXTENDED)

**File**: `src/renderers/musicxml/export_ir.rs` (NEW)

```rust
/// Intermediate representation: one measure with structured events
pub struct ExportMeasure {
    pub number: u32,
    pub attrs: MeasureAttrs,
    pub events: Vec<ExportEvent>,
}

pub struct MeasureAttrs {
    pub divisions: u32,              // LCM of all beat divisions
    pub time_signature: Option<(u32, u32)>,
    pub key_signature: Option<i8>,   // Circle of fifths (-7 to +7)
    pub clef: Option<Clef>,
    pub staves: u32,                 // NEW: Number of staves (default 1)
}

/// Logical musical events
pub enum ExportEvent {
    Note(NoteData),
    Chord(Vec<NoteData>),            // Simultaneous pitches (same col)
    Rest {
        duration_divs: u32,
        staff: u32,                  // NEW: Which staff this rest is on
    },

    // Grace notes
    GraceBefore { notes: Vec<NoteData> },
    GraceAfter { notes: Vec<NoteData> },

    // Tuplets
    Tuplet {
        ratio: (u32, u32),           // (actual, normal) e.g. (3,2)
        events: Vec<ExportEvent>,
    },

    // NEW: Lyrics
    Lyrics {
        syllable: String,
        syllabic: Syllabic,          // single, begin, middle, end
        verse: u32,                  // Verse number (1-based)
    },

    // NEW: Directions (dynamics, tempo, etc.)
    Direction(DirectionType),
}

pub struct NoteData {
    pub pitch_code: PitchCode,
    pub octave: i8,
    pub duration_divs: u32,

    // NEW: Staff assignment
    pub staff: u32,                  // 1-based staff number

    // Slurs (NEWLY WIRED)
    pub slur_start: bool,
    pub slur_end: bool,
    pub slur_number: u32,            // For multiple simultaneous slurs

    // Ties
    pub tie_start: bool,
    pub tie_end: bool,

    // Beaming (EXPANDED)
    pub beam_state: Option<BeamState>,  // begin, continue, end

    // Articulations (NEWLY WIRED)
    pub articulations: Vec<ArticulationType>,  // staccato, accent, etc.

    // Ornaments
    pub ornament_type: Option<OrnamentType>,  // trill, turn, mordent
}

pub enum Syllabic {
    Single,   // One-syllable word
    Begin,    // Start of multi-syllable word
    Middle,   // Middle syllable
    End,      // End syllable
}

pub enum BeamState {
    Begin,
    Continue,
    End,
}

pub enum ArticulationType {
    Accent,
    Staccato,
    Tenuto,
    Marcato,
    StrongAccent,
    // ... more
}

pub enum DirectionType {
    Dynamic(DynamicType),     // p, mf, f, etc.
    Tempo(TempoMarking),      // "Allegro", etc.
    // ... more
}
```

---

## Layer 2 FSM: Cell Grouping (EXTENDED)

**File**: `src/renderers/musicxml/line_to_ir.rs` (NEW)

### FSM States

```rust
enum CellGroupingState {
    Start,
    CollectingRestDashes { count: usize, staff: u32 },
    CollectingPitch {
        pitch: PitchCode,
        octave: i8,
        extensions: usize,
        slur_start: bool,
        slur_end: bool,
        slur_number: u32,       // NEW
        staff: u32,              // NEW
        articulations: Vec<ArticulationType>,  // NEW
    },
    CollectingGraceNotesBefore { notes: Vec<NoteData> },
    CollectingGraceNotesAfter { notes: Vec<NoteData> },
    CollectingChord {              // NEW: For simultaneous pitches
        notes: Vec<NoteData>,
        same_col: usize,
    },
}
```

### FSM Transition Function (EXTENDED)

```rust
fn group_cells_into_events(
    cells: &[Cell],
    line_lyrics: &str,         // NEW: Parse lyrics
    staff_number: u32,          // NEW: Which staff is this line
) -> Vec<ExportEvent> {
    let mut events = Vec::new();
    let mut state = CellGroupingState::Start;
    let mut i = 0;

    // NEW: Parse lyrics into syllables
    let lyrics_syllables = parse_lyrics_to_syllables(line_lyrics);
    let mut lyric_index = 0;

    while i < cells.len() {
        let cell = &cells[i];

        // Skip continuation cells
        if cell.continuation {
            i += 1;
            continue;
        }

        // Handle rhythm-transparent (ornaments/grace notes)
        if cell.is_rhythm_transparent() {
            let note = cell_to_note_data(cell, staff_number);
            match &mut state {
                CellGroupingState::Start => {
                    state = CellGroupingState::CollectingGraceNotesBefore {
                        notes: vec![note]
                    };
                }
                CellGroupingState::CollectingGraceNotesBefore { notes } => {
                    notes.push(note);
                }
                _ => {
                    finalize_state(&mut state, &mut events);
                    state = CellGroupingState::CollectingGraceNotesAfter {
                        notes: vec![note]
                    };
                }
            }
            i += 1;
            continue;
        }

        // NEW: Check for chords (multiple pitched cells at same col)
        if cell.kind == ElementKind::PitchedElement && i + 1 < cells.len() {
            let next_cell = &cells[i + 1];
            if next_cell.kind == ElementKind::PitchedElement && next_cell.col == cell.col {
                // Start chord collection
                let notes = collect_chord_notes(cells, i, staff_number);
                events.push(ExportEvent::Chord(notes.clone()));
                i += notes.len();
                continue;
            }
        }

        // Core FSM transitions (same as before, but with extensions)
        match (&state, &cell.kind, cell.char.as_str()) {

            // === DASH HANDLING (FIXES -- BUG!) ===
            (CellGroupingState::Start, ElementKind::UnpitchedElement, "-") => {
                state = CellGroupingState::CollectingRestDashes {
                    count: 1,
                    staff: staff_number,
                };
            }
            (CellGroupingState::CollectingRestDashes { count, staff },
             ElementKind::UnpitchedElement, "-") => {
                // ✅ KEY FIX: INCREMENT counter
                state = CellGroupingState::CollectingRestDashes {
                    count: count + 1,
                    staff: *staff,
                };
            }

            // === PITCH HANDLING (WITH SLURS + ARTICULATIONS) ===
            (CellGroupingState::Start, ElementKind::PitchedElement, _) |
            (CellGroupingState::CollectingGraceNotesBefore { .. },
             ElementKind::PitchedElement, _) => {
                finalize_state(&mut state, &mut events);

                if let Some(pitch_code) = cell.pitch_code {
                    state = CellGroupingState::CollectingPitch {
                        pitch: pitch_code,
                        octave: cell.octave,
                        extensions: 1,
                        slur_start: cell.slur_indicator.is_slur_start(),  // ✅ WIRE UP
                        slur_end: cell.slur_indicator.is_slur_end(),      // ✅ WIRE UP
                        slur_number: 1,  // TODO: Parse from indicator if multiple slurs
                        staff: staff_number,
                        articulations: Vec::new(),  // TODO: Parse from cell
                    };
                }
            }

            // === DASH AFTER PITCH = EXTENSION ===
            (CellGroupingState::CollectingPitch { pitch, octave, extensions,
                                                   slur_start, slur_end, slur_number,
                                                   staff, articulations },
             ElementKind::UnpitchedElement, "-") => {
                state = CellGroupingState::CollectingPitch {
                    pitch: *pitch,
                    octave: *octave,
                    extensions: extensions + 1,  // ✅ INCREMENT
                    slur_start: *slur_start,
                    slur_end: *slur_end,
                    slur_number: *slur_number,
                    staff: *staff,
                    articulations: articulations.clone(),
                };
            }

            // Other transitions...
            _ => {
                finalize_state(&mut state, &mut events);
                continue;
            }
        }

        i += 1;
    }

    // Finalize any pending state
    finalize_state(&mut state, &mut events);

    // NEW: Attach lyrics to notes
    attach_lyrics_to_events(&mut events, &lyrics_syllables);

    events
}

fn finalize_state(state: &mut CellGroupingState, events: &mut Vec<ExportEvent>) {
    match std::mem::replace(state, CellGroupingState::Start) {
        CellGroupingState::CollectingRestDashes { count, staff } => {
            events.push(ExportEvent::Rest {
                duration_divs: count as u32,
                staff,
            });
        }
        CellGroupingState::CollectingPitch { pitch, octave, extensions,
                                              slur_start, slur_end, slur_number,
                                              staff, articulations } => {
            events.push(ExportEvent::Note(NoteData {
                pitch_code: pitch,
                octave,
                duration_divs: extensions as u32,
                staff,
                slur_start,
                slur_end,
                slur_number,
                tie_start: false,  // Computed in later pass
                tie_end: false,
                beam_state: None,  // Computed in later pass
                articulations,
                ornament_type: None,
            }));
        }
        CellGroupingState::CollectingGraceNotesBefore { notes } => {
            events.push(ExportEvent::GraceBefore { notes });
        }
        CellGroupingState::CollectingGraceNotesAfter { notes } => {
            events.push(ExportEvent::GraceAfter { notes });
        }
        CellGroupingState::CollectingChord { notes, .. } => {
            events.push(ExportEvent::Chord(notes));
        }
        CellGroupingState::Start => {}
    }
}

/// NEW: Parse lyrics string into syllables
fn parse_lyrics_to_syllables(lyrics: &str) -> Vec<(String, Syllabic)> {
    let mut syllables = Vec::new();

    // Split on spaces, handle hyphens for multi-syllable words
    for word in lyrics.split_whitespace() {
        if word.contains('-') {
            // Multi-syllable word: "hel-lo" → ["hel-", "lo"]
            let parts: Vec<&str> = word.split('-').collect();
            for (i, part) in parts.iter().enumerate() {
                let syllabic = if parts.len() == 1 {
                    Syllabic::Single
                } else if i == 0 {
                    Syllabic::Begin
                } else if i == parts.len() - 1 {
                    Syllabic::End
                } else {
                    Syllabic::Middle
                };
                syllables.push((part.to_string(), syllabic));
            }
        } else {
            // Single-syllable word
            syllables.push((word.to_string(), Syllabic::Single));
        }
    }

    syllables
}

/// NEW: Attach parsed lyrics to note events
fn attach_lyrics_to_events(
    events: &mut Vec<ExportEvent>,
    syllables: &[(String, Syllabic)],
) {
    let mut syllable_index = 0;

    for i in 0..events.len() {
        // Only attach lyrics to main notes, not grace notes or rests
        if matches!(events[i], ExportEvent::Note(_)) {
            if syllable_index < syllables.len() {
                let (syllable, syllabic) = &syllables[syllable_index];
                // Insert lyrics event right after this note
                events.insert(i + 1, ExportEvent::Lyrics {
                    syllable: syllable.clone(),
                    syllabic: syllabic.clone(),
                    verse: 1,
                });
                syllable_index += 1;
            }
        }
    }
}

/// NEW: Collect simultaneous pitches at same column (chord)
fn collect_chord_notes(
    cells: &[Cell],
    start_idx: usize,
    staff: u32,
) -> Vec<NoteData> {
    let mut notes = Vec::new();
    let first_col = cells[start_idx].col;

    let mut i = start_idx;
    while i < cells.len() && cells[i].col == first_col {
        if let Some(pitch_code) = cells[i].pitch_code {
            notes.push(NoteData {
                pitch_code,
                octave: cells[i].octave,
                duration_divs: 1,  // Computed later with extensions
                staff,
                slur_start: cells[i].slur_indicator.is_slur_start(),
                slur_end: cells[i].slur_indicator.is_slur_end(),
                slur_number: 1,
                tie_start: false,
                tie_end: false,
                beam_state: None,
                articulations: Vec::new(),
                ornament_type: None,
            });
        }
        i += 1;
    }

    notes
}
```

---

## Layer 3: MusicXML Emitter (WITH SLURS/LYRICS/STAVES)

**File**: `src/renderers/musicxml/emitter.rs` (NEW)

```rust
pub fn emit_musicxml(
    all_measures: Vec<Vec<ExportMeasure>>,  // Vec per staff
    doc: &Document,
) -> String {
    let mut out = String::new();
    let mut ctx = EmitterContext::new();

    emit_xml_header(&mut out);
    out.push_str("<score-partwise version=\"3.1\">\n");

    // Part list
    emit_part_list(&mut out, doc, all_measures.len());

    // For each staff (part)
    for (part_idx, measures) in all_measures.iter().enumerate() {
        write!(out, "  <part id=\"P{}\">\n", part_idx + 1);

        for measure in measures {
            emit_measure(&mut out, &mut ctx, measure);
        }

        out.push_str("  </part>\n");
    }

    out.push_str("</score-partwise>\n");
    out
}

fn emit_measure(
    out: &mut String,
    ctx: &mut EmitterContext,
    measure: &ExportMeasure,
) {
    write!(out, "    <measure number=\"{}\">\n", measure.number);

    // Attributes
    if ctx.needs_attributes(&measure.attrs) {
        emit_attributes(out, &measure.attrs);
        ctx.update(&measure.attrs);
    }

    for event in &measure.events {
        match event {
            ExportEvent::Note(n) => emit_note(out, n, ctx),
            ExportEvent::Chord(notes) => emit_chord(out, notes, ctx),
            ExportEvent::Rest { duration_divs, staff } => {
                emit_rest(out, *duration_divs, *staff, ctx);
            }
            ExportEvent::GraceBefore { notes } => {
                emit_grace_notes(out, notes, ctx, false);  // not steal-time
            }
            ExportEvent::GraceAfter { notes } => {
                emit_grace_notes(out, notes, ctx, true);   // steal-time-previous
            }
            ExportEvent::Tuplet { ratio, events } => {
                emit_tuplet(out, ratio, events, ctx);
            }
            // NEW: Lyrics
            ExportEvent::Lyrics { syllable, syllabic, verse } => {
                emit_lyric(out, syllable, syllabic, *verse);
            }
            // NEW: Directions
            ExportEvent::Direction(dir) => {
                emit_direction(out, dir, ctx);
            }
        }
    }

    out.push_str("    </measure>\n");
}

fn emit_note(out: &mut String, note: &NoteData, ctx: &EmitterContext) {
    out.push_str("      <note>\n");

    // NEW: Staff assignment (if multiple staves)
    if ctx.current_staves > 1 {
        out.push_str(&format!("        <staff>{}</staff>\n", note.staff));
    }

    // Pitch
    let (step, alter) = pitch_code_to_step_alter(&note.pitch_code);
    out.push_str("        <pitch>\n");
    out.push_str(&format!("          <step>{}</step>\n", step));
    if alter != 0 {
        out.push_str(&format!("          <alter>{}</alter>\n", alter));
    }
    out.push_str(&format!("          <octave>{}</octave>\n", note.octave + 4));
    out.push_str("        </pitch>\n");

    // Duration
    out.push_str(&format!("        <duration>{}</duration>\n", note.duration_divs));

    // Type
    let musical_duration = note.duration_divs as f64 / ctx.current_divisions as f64;
    let (note_type, dot_count) = duration_to_note_type(musical_duration);
    out.push_str(&format!("        <type>{}</type>\n", note_type));
    for _ in 0..dot_count {
        out.push_str("        <dot/>\n");
    }

    // NEW: Beam
    if let Some(beam_state) = &note.beam_state {
        let beam_value = match beam_state {
            BeamState::Begin => "begin",
            BeamState::Continue => "continue",
            BeamState::End => "end",
        };
        out.push_str(&format!("        <beam number=\"1\">{}</beam>\n", beam_value));
    }

    // Notations
    let has_notations = note.tie_start || note.tie_end ||
                       note.slur_start || note.slur_end ||
                       !note.articulations.is_empty() ||
                       note.ornament_type.is_some();

    if has_notations {
        out.push_str("        <notations>\n");

        // Ties
        if note.tie_start {
            out.push_str("          <tied type=\"start\"/>\n");
        }
        if note.tie_end {
            out.push_str("          <tied type=\"stop\"/>\n");
        }

        // NEW: Slurs (WIRED UP)
        if note.slur_start {
            out.push_str(&format!(
                "          <slur type=\"start\" number=\"{}\"/>\n",
                note.slur_number
            ));
        }
        if note.slur_end {
            out.push_str(&format!(
                "          <slur type=\"stop\" number=\"{}\"/>\n",
                note.slur_number
            ));
        }

        // NEW: Articulations (WIRED UP)
        if !note.articulations.is_empty() {
            out.push_str("          <articulations>\n");
            for art in &note.articulations {
                let tag = match art {
                    ArticulationType::Accent => "accent",
                    ArticulationType::Staccato => "staccato",
                    ArticulationType::Tenuto => "tenuto",
                    ArticulationType::Marcato => "strong-accent",
                    ArticulationType::StrongAccent => "strong-accent",
                };
                out.push_str(&format!("            <{}/>\\n", tag));
            }
            out.push_str("          </articulations>\n");
        }

        // Ornaments
        if let Some(ornament_type) = &note.ornament_type {
            emit_ornament_notation(out, ornament_type);
        }

        out.push_str("        </notations>\n");
    }

    out.push_str("      </note>\n");
}

/// NEW: Emit lyrics element
fn emit_lyric(
    out: &mut String,
    syllable: &str,
    syllabic: &Syllabic,
    verse: u32,
) {
    out.push_str(&format!("      <lyric number=\"{}\"">\n", verse));

    let syllabic_str = match syllabic {
        Syllabic::Single => "single",
        Syllabic::Begin => "begin",
        Syllabic::Middle => "middle",
        Syllabic::End => "end",
    };
    out.push_str(&format!("        <syllabic>{}</syllabic>\n", syllabic_str));
    out.push_str(&format!("        <text>{}</text>\n", syllable));
    out.push_str("      </lyric>\n");
}
```

---

## Implementation Phases (EXTENDED)

### Phase 1: Create IR Types (2 hours) ✅ COMPLETED
**File**: `src/renderers/musicxml/export_ir.rs`

- [x] Define `ExportLine` (key_signature, time_signature, clef, measures, lyrics)
- [x] Define `ExportMeasure` (divisions only - no staves/clef/key per measure)
- [x] Define `ExportEvent` enum (Note, Rest, Chord with proper structure)
- [x] Define `NoteData` (pitch, divisions, grace_notes_before/after, lyrics, slur, articulations, beam, tie)
- [x] Define `GraceNoteData`, `LyricData`, `SlurData`, `BeamData`, `TieData`
- [x] Define enums: `Syllabic`, `SlurPlacement`, `SlurType`, `BeamState`, `TieType`, `ArticulationType`
- [x] Add unit tests
- [x] Ensure all types follow data model principle: "only include what's in Document/Line/Cell"

**Architectural Decisions**:
- ✅ Line-level attributes (key_signature, time_signature, clef) NOT repeated per measure
- ✅ Measure-level: ONLY `divisions` (which varies due to LCM)
- ✅ ExportLine mirrors Line in Document model
- ✅ No invented abstractions (e.g., no Part type)

### Phase 2: Implement Cell→IR FSM Core (4 hours) ✅ COMPLETED
**File**: `src/renderers/musicxml/line_to_ir.rs`

- [x] Define `CellGroupingState` enum (InBeat, CollectingDashesInBeat, CollectingPitchInBeat, CollectingTrailingGraceNotes)
- [x] Implement `group_cells_into_events()` FSM with explicit state transitions
- [x] Implement `BeatAccumulator` helper struct
- [x] **Unit test -- bug fix**: `["--"]` → `[Rest { divisions: 2 }]` ✅ PASSES
- [x] Test all core state transitions:
  - ✅ Single dash → Rest { divisions: 1 }
  - ✅ Multiple consecutive dashes → ONE Rest { divisions: N }
  - ✅ Four dashes → Rest { divisions: 4 } (NOT r1 whole rest!)
  - ✅ Empty beat → empty Vec
- [x] Unit tests: 5/5 passing

**Key Fix**: Consecutive dashes now correctly form a single Rest element with combined divisions (not separate rest elements). This fixes the bug where `--` was producing `r1` instead of `r4`.

### Phase 3: Add Slurs/Lyrics/Chords (4 hours) ✅ COMPLETED
**File**: `src/renderers/musicxml/line_to_ir.rs` (continued)

- [x] Implement `parse_lyrics_to_syllables()` (handle hyphens + spaces)
- [x] Implement `attach_slur_to_note()` (wire up slur indicators)
- [x] Implement `collect_chord_notes()` (same col detection with BTreeMap)
- [x] Implement `attach_first_lyric()` (attach syllable to note)
- [x] Test lyrics parsing:
  - ✅ "hel-lo world" → [("hel", Begin), ("lo", End), ("world", Single)]
  - ✅ "no-tes-long" → [("no", Begin), ("tes", Middle), ("long", End)]
  - ✅ Empty and whitespace handling
- [x] Test chord detection:
  - ✅ Single column grouping
  - ✅ Multiple pitches at same col
  - ✅ Pitches at different columns
- [x] Test slur flags propagation:
  - ✅ SlurStart → SlurData with type=Start
  - ✅ SlurEnd → SlurData with type=Stop

**Unit tests: 18/18 passing**
- 5 core FSM tests (Phase 2)
- 13 Phase 3 helper function tests

### Phase 4: Measure Builder (2 hours) - HELPER FUNCTIONS ✅
**File**: `src/renderers/musicxml/line_to_ir.rs` (continued)

Helper functions completed:
- [x] Implement `gcd(a, b)` - Greatest common divisor
- [x] Implement `lcm(a, b)` - Least common multiple
- [x] Implement `lcm_multiple(numbers)` - LCM of multiple numbers (for measure divisions)
- [x] Implement `find_barlines(cells)` - Find barline positions for measure splitting
- [x] Unit tests for all helpers:
  - ✅ GCD: test_gcd (4 cases)
  - ✅ LCM: test_lcm (3 cases)
  - ✅ LCM Multiple: test_lcm_multiple (5 cases)
  - ✅ Barline finding: 3 tests (no barlines, one barline, multiple barlines)

**Unit tests: 26/26 passing total**
- 5 Phase 2 (FSM core)
- 13 Phase 3 (lyrics/slurs/chords)
- 8 Phase 4 (LCM/GCD/barlines/beat boundaries/measure+document builders)

**Complete Implementation**:
- [x] Implement `find_beat_boundaries()` and `find_beat_boundaries_refs()` - Beat boundary detection
- [x] Implement `build_export_measures_from_line(line)` - Core orchestrator:
  - Splits into measures by barlines
  - Splits into beats by whitespace
  - Processes beats through FSM
  - Calculates measure divisions using LCM
- [x] Implement `build_export_measures_from_document(document)` - Document-level:
  - Creates ExportLine for each line with metadata
  - Returns Vec<ExportLine> (one per staff)

### Phase 5: Build Measures from Document ✅ COMPLETED
**File**: `src/renderers/musicxml/line_to_ir.rs` (completed as part of Phase 4)

- [x] Implement `build_export_measures_from_document(doc)` → `Vec<ExportLine>`
- [x] Map each `Line` → one ExportLine (staff)
- [x] Handle multiple staves (if doc has multiple lines)
- [x] Preserve line metadata (key_signature, time_signature, lyrics)

### Phase 6: Refactor Emitter (3 hours)
**File**: `src/renderers/musicxml/emitter.rs`

- [ ] Implement `emit_musicxml()` (handle multiple parts)
- [ ] Implement `emit_measure()`
- [ ] Implement `emit_note()` (with staff, slurs, articulations)
- [ ] Implement `emit_chord()` (first note regular, rest with `<chord/>`)
- [ ] Implement `emit_rest()` (with staff)
- [ ] Implement `emit_grace_notes()` (preserve beaming logic)
- [ ] Implement `emit_lyric()` (syllabic + text)
- [ ] Implement `emit_tuplet()` (preserve time-modification logic)

### Phase 7: Integration (1 hour)
**File**: `src/renderers/musicxml/converter.rs`

- [ ] Update `to_musicxml()` to use new pipeline
- [ ] Delete old functions: `normalize_beat()`, old `process_beat()`
- [ ] Keep helper functions: `pitch_code_to_step_alter()`, `duration_to_note_type()`
- [ ] Update `mod.rs` exports

### Phase 8: Testing & Validation (3 hours)

**Core Tests**:
- [ ] `test-dash-rest-duration.spec.js` - **MUST PASS**: `--` → `r4`
- [ ] All existing E2E tests pass

**New Feature Tests**:
- [ ] **Slurs**: Input with `cell.slur_indicator` → MusicXML `<slur type="start|stop"/>`
- [ ] **Lyrics**: `line.lyrics = "hel-lo world"` → MusicXML `<lyric>` with syllabic types
- [ ] **Multiple staves**: Document with 2 lines → 2 parts with correct `<staff>` numbers
- [ ] **Chords**: Cells at same col → `<note><chord/>` in MusicXML
- [ ] **Articulations**: Wire up and test at least staccato, accent

**Regression Tests**:
- [ ] Tuplets (3:2, 5:4, 6:4, 7:4, 9:8)
- [ ] Grace notes (before, after, on-top)
- [ ] Ties
- [ ] Beaming
- [ ] Ornaments
- [ ] Key signatures
- [ ] Complex combinations

**Total Estimated Time**: ~20 hours (2.5 days)

---

## Migration Strategy

### Option A: Feature Flag (RECOMMENDED)
```rust
pub fn to_musicxml(doc: &Document) -> String {
    #[cfg(feature = "ir_export")]
    {
        let measures = line_to_ir::build_export_measures_from_document(doc);
        emitter::emit_musicxml(measures, doc)
    }

    #[cfg(not(feature = "ir_export"))]
    {
        old_to_musicxml_impl(doc)
    }
}
```

**Timeline**:
- Week 1-2: Implement new pipeline, feature flag OFF
- Week 3: Enable flag, side-by-side comparison tests
- Week 4: Fix discrepancies, make default
- Week 5: Delete old code

### Option B: Direct Replacement
- Implement new pipeline
- Replace `to_musicxml()` immediately
- Higher risk but faster

**Recommendation**: Option A (feature flag) for production system

---

## Success Criteria

### Functional Requirements
- [ ] **Bug fix**: `--` produces `r4` (quarter rest), not `r1`
- [ ] **Slurs**: Cell slur indicators exported to MusicXML `<slur>`
- [ ] **Lyrics**: Line lyrics string parsed and attached to notes
- [ ] **Multiple staves**: Document lines → separate MusicXML parts
- [ ] **Chords**: Same-column pitches → `<chord/>` elements
- [ ] All existing features preserved (tuplets, grace notes, ties, etc.)
- [ ] All E2E tests pass

### Code Quality
- [ ] FSM states explicit in enum
- [ ] All state transitions documented
- [ ] IR layer independently testable
- [ ] Clear separation: Cell grouping → IR → XML emission
- [ ] No hidden state in nested functions

### Architectural Benefits
- [ ] Adding future features (dynamics, fermata, etc.) = add `ExportEvent` variant
- [ ] Testable without full XML pipeline
- [ ] Aligned with data model (flat Cells)
- [ ] Room to expand (beam grouping, voice separation, etc.)

---

## Future Extensions (Not Required Now)

After core implementation, these become easy:

- [ ] **Dynamics**: Add `ExportEvent::Direction(Dynamic(mf))`, emit `<direction><dynamics><mf/>`
- [ ] **Fermatas**: Add to `NoteData.notations`
- [ ] **Pedal markings**: Add `ExportEvent::Direction(Pedal)`
- [ ] **Rehearsal marks**: Add `MeasureAttrs.rehearsal_mark`
- [ ] **Repeats**: Enhance barline handling in IR
- [ ] **Voices**: Add `NoteData.voice` number, emit `<voice>`
- [ ] **Beam grouping (main notes)**: Compute beam states in IR builder
- [ ] **Proper tuplet brackets**: More sophisticated ratio detection
- [ ] **Cue notes**: Add `NoteData.is_cue` flag

All of these: **add 1 enum variant + 1 emit function**. No architectural changes needed.

---

## Why This Approach Wins

### vs. Minimal Fix
- Minimal fix: 5 hours, then 4 more rewrites for slurs/lyrics/staves
- IR refactor: 20 hours once, future features trivial

### vs. Current POC Code
1. **Explicit FSM**: No boolean flags, clear state transitions
2. **Testability**: Unit test cell grouping without XML
3. **Extensibility**: New features = new IR variants
4. **Correctness**: Fixes `--` bug with proper state tracking
5. **Professional**: Production-quality, not POC

### vs. Direct Clojure Mapping
1. **Data model fit**: Works with flat Cells, not parse tree
2. **Simpler**: 5-state cell grouping vs. 9-state monolithic FSM
3. **Practical**: Solves our actual problem (POC → production)

---

## References

1. **Document Model**: `src/models/core.rs`
2. **Clojure FSM Pattern**: `archive/doremi-script/src/doremi_script/to_lilypond.cljc`
3. **Reference Doc**: `src/renderers/musicxml/reference/CLOJURE_FSM_PATTERN.md`
4. **Current POC**: `src/renderers/musicxml/` (beat.rs, builder.rs, converter.rs)
5. **Bug Test**: `tests/e2e-pw/tests/test-dash-rest-duration.spec.js`

---

**Plan Version**: 3.0 (Production Refactor)
**Last Updated**: 2025-10-28
**Status**: Ready for implementation - awaiting user approval
