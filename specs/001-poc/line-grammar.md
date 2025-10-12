# Line Grammar Specification (CharCell Model — Implicit Beats)

This document defines the structure of a musical **Line** in the textual music-notation system.  
It reflects the current design direction of the WYSIWYG editor, in which all data is represented as
linear **CharCells** rather than hierarchical trees.

---

## 1. Overview

A **Line** represents one horizontal lane of musical text — typically a **Letter line** (notes),
but also **Upper annotations**, **Lower annotations**, or **Lyrics**.

Each **Line** is modeled as an array (or gap-buffer) of **CharCells**,  
one per visible grapheme cluster (column).

All columns are **physical** — meaning their order and spacing correspond exactly
to the user’s visible text in the editor.

---

## 2. CharCell structure

Every visual column is represented by a `CharCell`:

```rust
pub struct CharCell {
    pub grapheme: String,        // e.g., "S", "C#", "3b", "-", "'", "|"
    pub lane: Lane,              // Upper | Letter | Lower | Lyrics
    pub kind: ElementKind,       // PitchedElement, UnpitchedElement, etc.
    pub col: usize,              // physical column index (0-based)

    // only for PitchedElement
    pub pitch_code: Option<String>,   // canonical pitch ("C#", "3b", "S")
    pub notation: Option<String>,     // "Sargam" | "Number" | "Western" | "DoReMi"

    // annotations (applies mainly to PitchedElement)
    pub mordent: bool,
    pub upper_dots: u8,
    pub lower_dots: u8,
    pub tala: Option<char>,

    // slurs (can appear on any element)
    pub slur_start: bool,
    pub slur_end: bool,

    // layout cache
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub bbox: (f32,f32,f32,f32),
    pub hit:  (f32,f32,f32,f32),
}
3. Element kinds
rust
Copy code
pub enum ElementKind {
    PitchedElement,      // S, r, R, g, G, m, M, P, d, D, n, N, C#, 3b, etc.
    UnpitchedElement,    // -, --, |, ', space
    UpperAnnotation,     // ., :, ~, tala digits, etc.
    LowerAnnotation,     // ., :
    LyricElement,        // syllables under the line
}
Meaning
Kind	Example	Description
PitchedElement	S, r, C#, 3b	Sounded note (pitch token)
UnpitchedElement	-, --, ', `	`
UpperAnnotation	., :, ~, 5	Above-line annotation (octaves, mordents, tala)
LowerAnnotation	., :	Below-line annotation (lower octaves)
LyricElement	sa, re, ga	Lyric syllables below the line

4. Line grammar (EBNF)
ebnf
Copy code
Line         = LineElement*
LineElement  = PitchedElement
             | UnpitchedElement
             | BreathMark
             | Barline
             | Whitespace
             | Text

PitchedElement    = /[A-Ga-gSrRgGmMPdDnN1-7](#|##|b|bb)?/
UnpitchedElement  = "-" | "--" | "'" | "|" | " "
BreathMark        = "'"
Barline           = "|"
Whitespace        = " "
Text              = /[A-Za-z0-9]+/   ; typically lyrics or annotations
                         ; Text on the Letter lane is non-temporal and rendered differently (e.g., red)
5. Implicit beat segmentation
Beats are not explicitly stored — they are derived from the character sequence.

Rule summary
Each contiguous run of non-space, non-barline characters (Pitched or Unpitched elements)
forms one implicit beat.

Dashes (-) stay inside beats.

Whitespace and Barlines always end a beat.

Breath marks (') belong inside a beat (do not split it).

Formal grammar
ebnf
Copy code
Beat          = BeatElement+
BeatElement   = PitchedElement | UnpitchedElement | BreathMark
BeatSeparator = Whitespace | Barline | Text
Each Beat is a contiguous sequence of BeatElements with no BeatSeparator between them.

6. Parsing rules
Algorithm for deriving beats (pseudo-Rust):

rust
Copy code
struct BeatSpan { start: usize, end: usize }

fn derive_implicit_beats(cells: &[CharCell], breath_ends_beat: bool) -> Vec<BeatSpan> {
    let mut spans = Vec::new();
    let mut cur: Option<usize> = None;

    let is_splitter = |c: &CharCell| -> bool {
        match c.kind {
            ElementKind::UnpitchedElement if c.grapheme == "|" => true,
            ElementKind::UnpitchedElement if c.grapheme == " " => true,
            ElementKind::UnpitchedElement if c.grapheme == "'" => breath_ends_beat,
            _ => false
        }
    };

    let is_word_char = |c: &CharCell| -> bool {
        matches!(c.kind, ElementKind::PitchedElement | ElementKind::UnpitchedElement)
            && c.grapheme != "|" && c.grapheme != " " && c.grapheme != "'"
    };

    for (i, c) in cells.iter().enumerate() {
        if is_splitter(c) {
            if let Some(s) = cur {
                spans.push(BeatSpan { start: s, end: i.saturating_sub(1) });
                cur = None;
            }
            continue;
        }
        if is_word_char(c) {
            if cur.is_none() { cur = Some(i); }
        } else {
            if let Some(s) = cur {
                spans.push(BeatSpan { start: s, end: i.saturating_sub(1) });
                cur = None;
            }
        }
    }

    if let Some(s) = cur {
        spans.push(BeatSpan { start: s, end: cells.len().saturating_sub(1) });
    }

    spans
}
7. Example
Input
lua
Copy code
S--r g' mP-- | nN
Derived beats
Beat #	Elements	Explanation
1	S, -, -, r	one contiguous group
2	g, '	separated by space
3	m, P, -, -	after space and before barline
4	n, N	after barline

Rendered visualization
Lower loops drawn beneath each implicit beat span.

Loops end at spaces and barlines.

Dashes remain inside the same beat’s loop.

Breath ' stays under the same arc, not breaking it.

8. Slurs
Slurs (slur_start / slur_end) may occur on any element, in any lane.
They are paired by scan order and rendered as cubic Bézier curves connecting
the flagged elements’ centers.

9. Rendering guidelines
X position: x = column * advance_px (monospace) or measured width (proportional).

Y position: based on lane baseline (Upper above Letter, Lower and Lyrics below).

Lower loops (beats):

x1 = center(start), x2 = center(end), y = baseline + loop_offset_px.

Arc height and curvature are configurable.

Slurs: cubic Bézier with calculated control points based on span width and height.

Annotations: folded to nearest ±1 column; rendered above or below pitch tokens.

10. Rendering options
Setting	Default	Meaning
draw_single_cell_loops	false	Suppress loop for single-element beats
loop_offset_px	20.0	Distance of loops below baseline
loop_height_px	6.0	Curvature of loop arcs

11. Summary
Every CharCell corresponds to one visible column (grapheme-safe).

Beats are implicit words on the Letter line.

Spaces and barlines split beats; breaths and dashes stay within.

Slurs apply to any element, anywhere.

Loops and arcs are rendered automatically from derived spans — no manual flags needed.

The model is flat, columnar, and time-linear, ideal for a WYSIWYG textual notation editor.

Philosophy:

Music unfolds in time — not in trees.
Every column is a moment; every word is a beat.
## 11. Summary

- Every **CharCell** corresponds to one visible column (grapheme-safe).
- **Temporal columns** are those whose kind is `PitchedElement` or `UnpitchedElement`.
  - These represent actual musical time (sounded or sustained).
- **Non-temporal columns** (whitespace, lyrics, annotations, barlines) serve only as layout or visual markers.
- **Beats are implicit “words”** of temporal columns separated by spaces or barlines.
- **Breaths and dashes** remain inside beats; they don’t divide time.
- **Slurs** can span any elements, temporal or not.
- **Loops/arcs** are derived automatically from these implicit beat spans.
- The model is **flat, columnar, and time-linear only across temporal cells** —  
  everything else is structural ornamentation.

---

**Philosophy:**

> Music unfolds through its **sounded symbols**, not its spaces.  
> Only columns containing pitches or durations belong to time;  
> everything else orbits them.

