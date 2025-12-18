# Beat Grammar Specification

This document defines the formal grammar for beat parsing and segmentation.

**Related files:**
- `src/parse/grammar.rs` - Parser implementation
- `src/parse/beats.rs` - Beat derivation
- `tools/fontgen/atoms.yaml` - Input alphabet (codepoints)
- `src/ir/builder.rs` - Export processing

---

## Beat Grammar

```ebnf
(* A beat is a sequence of timed-elements, optionally separated by breath marks *)
Beat            = TimedElement (BreathMark? TimedElement)*

(* Timed elements consume measure time and define beat boundaries *)
TimedElement    = PitchedElement                (* note: 1-7, C-B, S-N, d-t *)
                | UnpitchedElement              (* dash: - *)

(* Beat separators end a beat *)
BeatSeparator   = Whitespace | Barline | Symbol | Text
```

---

## Superscript Elements

Superscripts can appear **inside** beats but do not **define** beat boundaries.
They are rhythm-transparent (do not consume measure time).

**Key rule:** A beat always begins and ends with a timed element (pitch or dash).
Superscripts between timed elements are included in the beat's underline span.

```ebnf
(* Superscript elements - processed separately from beat derivation *)
SuperscriptElement  = GracePitch
                    | GraceUnpitched
                    | NonPitchSuperscript

GracePitch          = Superscript(PitchedElement)
                      (* grace note - exports as MusicXML <grace/>, LilyPond \grace *)

GraceUnpitched      = Superscript(UnpitchedElement)
                      (* grace rest - if needed for export *)

NonPitchSuperscript = Superscript(Other)
                      (* no export semantics, visual only *)
```

---

## Element Classification

| Element Type | Consumes Time | Defines Beat Boundary | Inside Beat | Underlined | Exports As |
|--------------|---------------|----------------------|-------------|------------|------------|
| PitchedElement | Yes | Yes | Yes | Yes | Note |
| UnpitchedElement (dash) | Yes | Yes | Yes | Yes | Rest or tie |
| BreathMark | No | No | Yes | No | Breath mark |
| GracePitch (superscript) | No | No | Yes | Yes | Grace note |
| GraceUnpitched (superscript) | No | No | Yes | Yes | Grace rest |
| NonPitchSuperscript | No | No | Yes | Yes | (none) |
| Whitespace/Barline | No | No (separator) | No | No | Structure |

---

## Superscript Attachment Rules

Superscripts can appear individually or in **groups** (consecutive superscript pitches). During export processing, superscript groups attach to adjacent timed-elements as a unit:

**Inside beats:**
1. Superscript group **between** timed-elements → `grace_notes_before` on next timed-element

**Outside beats (orphan superscript groups):**
2. Superscript group **immediately before** a pitch (no separator) → `grace_notes_before` on that pitch
3. Superscript group **after** a beat or separated by whitespace → `grace_notes_after` on previous pitch

**Rule:** Orphan superscript groups attach to the **previous** pitch unless they are immediately followed by a pitch (no separator), in which case they attach as grace notes **before** the following pitch.

**Examples of superscript groups:**
- `⁵⁶⁷` = group of 3 grace pitches, exported together
- `1 ⁵⁶ 2` = orphan group between beats, attaches to previous pitch (1)
- `1 ⁵⁶2` = group immediately before pitch 2, attaches as grace_before on 2

---

## Examples

### Inside beats (underlined together)

| Input | Timed Elements | Underline Span | Superscripts |
|-------|----------------|----------------|--------------|
| `1` | 1 | (none - single) | none |
| `12` | 1, 2 | `1̲2̲` | none |
| `1-2` | 1, -, 2 | `1̲-̲2̲` | none |
| `1'2` | 1, 2 | `1̲'̲2̲` | none (breath inside) |
| `1⁵2` | 1, 2 | `1̲⁵̲2̲` (all 3) | ⁵ → grace_before on 2 |
| `1⁵2-` | 1, 2, - | `1̲⁵̲2̲-̲` (all 4) | ⁵ → grace_before on 2 |
| `¹²34` (1,2 super) | 3, 4 | `¹̲²̲3̲4̲` (all 4) | ¹² → grace_before on 3 |

### Outside beats (orphan superscripts)

| Input | Beats | Superscript Attachment |
|-------|-------|------------------------|
| `⁵1` | beat: `1` | ⁵ right before pitch → grace_before on 1 |
| `1 ⁵2` | beat1: `1`, beat2: `2` | ⁵ right before pitch → grace_before on 2 |
| `1⁵ 2` | beat1: `1⁵`, beat2: `2` | ⁵ inside beat1, grace_before on... (no following pitch in beat) → grace_after on 1 |
| `1 ⁵ 2` | beat1: `1`, beat2: `2` | ⁵ orphan, not right before pitch → grace_after on 1 |
| `1 ⁵⁶ 2` | beat1: `1`, beat2: `2` | ⁵⁶ orphan group, not right before pitch → grace_after on 1 |
| `1 ⁵⁶2` | beat1: `1`, beat2: `2` | ⁵⁶ right before pitch → grace_before on 2 |

---

## Key Principles

1. **Beat boundaries defined by timed-elements** — a beat always starts and ends with a pitch or dash
2. **Underlines span first to last element** — includes ALL intervening elements (superscripts too)
3. **Superscripts are rhythm-transparent** — they don't count toward subdivisions or define boundaries
4. **Grace notes export with host** — attached to adjacent timed-element for MusicXML/LilyPond
