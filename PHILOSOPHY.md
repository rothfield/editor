# Editor Philosophy & Design Principles

## Core Philosophy: "Honor the Page, Don't Force the Score"

This editor is built on one guiding idea:

**Capture musical notation the way musicians actually write it by hand — not the way engraving software wishes it looked after cleanup.**

Most notation software assumes you're typesetting something already final and metrically valid. It forces you to choose exact durations, attach embellishments to specific host notes, satisfy bar math, and encode everything in classical Western terms immediately.

Real working notation doesn't look like that.

Handwritten practice sheets, teaching notation, raga phrases, ornament-heavy vocal lines, baroque embellishment shorthand, jazz scoops — they're all informal and expressive. They include:

- Notes written in sequence
- Tiny scoops or grace pitches drawn before a note
- Release flicks written after
- Trill/kan/meend marks drawn above the note
- Curved slurs just drawn from "here to there" with no extra ceremony
- Tala / bar / phrasing marks that are suggestive, not fully enforced
- Rhythm often implied by style, not quantified into exact durations

**That "messy but clear to musicians" state is valid music.** The editor treats that as first-class, not as "temporary garbage to be fixed."

This leads to several intentional design choices described below.

---

## 1. The Token-Based Editable Model

### 1.1 A Line of Music is a Flat Ordered List of Tokens

There is no hidden tree that you're editing indirectly. The source of truth is literally a sequence like:

```
(note S), (ornament-before 2), (note r), (ornament-after 3),
(slur-begin), (note g), (note m), (slur-end), (barline), ...
```

Each token is **strongly typed**. Examples:

#### `note`
Represents a main pitch.
- Stored with a pitch code like `S`, `r`, `3b`, etc.
- Example: `{ "kind": "note", "pitch": "S" }`

#### `ornament`
Represents a **pitched ornament mark** — a tiny pitch written visually before/after/above a main note.
- Carries pitch just like a normal note does (pitch is explicit, not guessed later)
- Position type (before/after/top) is **implicit in the indicator variant** that marks the span
- Implementation: Cells marked with indicator pairs:
  - `OrnamentBeforeStart` ... `OrnamentBeforeEnd` (before position)
  - `OrnamentAfterStart` ... `OrnamentAfterEnd` (after position)
  - `OrnamentOnTopStart` ... `OrnamentOnTopEnd` (top position)

#### `ornamentSymbol`
Represents a **non-pitched ornament mark** (e.g., trill squiggle, mordent wiggle, "kan", etc.).
- Position type **implicit in the indicator variant** that marks the span
- Implementation: Same indicator variants as pitched ornaments, cells between indicators contain the symbol

#### `slur-begin`, `slur-end`
Handwritten slurs are literally just curved lines someone draws from "this" note to "that" note.
- In the model, we mirror that literally: we insert a `slur-begin` token before the first slurred note, and a `slur-end` token after the last.
- Example: `{ "kind": "slur-begin" }` ... `{ "kind": "slur-end" }`

#### Structural / Expressive Markers
- `barline`, `dash` (sustain), `breath`, tala markers, lyrics, etc.

**So the editable document is not "a bar with notes plus sub-objects."** It's a tape of tokens in order with types.

### 1.2 Tokens are Semantically Typed at Entry Time

This is important:

- **A pitch is always stored as a pitch.**
  We are not storing raw text and guessing later if `"2b"` was a pitch or just a doodle.
  If something is a pitch, even if it's a tiny grace-like pitch, it becomes either a `note` token or an `ornament` token with pitch.

- **A trill mark is not stored as "maybe a pitch?"**
  It's stored as an `ornamentSymbol` with a symbol like `"tr"`.

This means: **the model is already musically aware at the token level.** You know what's a note and what's an ornament as soon as the token exists.

### 1.3 The Model Deliberately Does Not Over-Specify Structure

The editor does **not** force you to:

- Quantize rhythm
- Balance measures
- Provide durations
- Attach each ornament to an explicit parent note object the moment you write it

Those concerns belong to **engraving/export**, not to **writing**.

Why? Because in most handwritten teaching/working notation, those things are not fully locked yet. You can have a pre-note scoop, a released flick, and a trill above without having decided "this scoop is a 1/32 appoggiatura resolving to beat 3 of a 4/4 bar."

**The editor refuses to bully you into committing early.**

Instead, the model captures what is actually on the page:
- "this is a main pitch,"
- "this is a small pitch drawn before,"
- "this is a squiggle drawn over,"
- "the slur starts here and ends there."

---

## 2. Slurs

Slurs in handwritten notation are obvious visually but not always metrically formal. The editor mirrors that literally:

- We insert `slur-begin` and `slur-end` tokens directly in the token stream.
- Everything that appears between them (in linear order) is considered to be under that slur.
- There's no heavy slur object you have to manage with IDs.

You're just saying: "At this point in the line, a slur curve begins; later, here, that curve ends." That's exactly what a human reading the page sees.

At render/export time, those pairs get turned into actual slur arcs.

---

## 3. Ornaments

This is the biggest place where the editor diverges from "engraving software" and leans toward "faithful capture of what's on the page."

### 3.1 Ornaments are First-Class Tokens, Not Attributes

In most notation software, ornaments are secondary properties hung off a note: e.g., "this note has a trill symbol," "this note has grace notes before it." That assumes you've already decided which note they attach to and how they should engrave.

**Here, ornaments are their own tokens, living in the same stream as notes.**

There are two flavors:

#### (1) Pitched Ornaments

A tiny, explicit pitch written before/after/above the main note in handwriting (like a scoop or release flick).

**Implementation**: Ornament spans marked by indicator pairs, with cells between the indicators containing the pitch:

- **`OrnamentBeforeStart` ... `OrnamentBeforeEnd`** = written tucked before the note
- **`OrnamentAfterStart` ... `OrnamentAfterEnd`** = written just after (default)
- **`OrnamentOnTopStart` ... `OrnamentOnTopEnd`** = hovering above / on top

The pitch is stored in the cells between the indicators, using the same pitch encoding as normal notes. Position type is **implicit in which indicator variant** marks the span, similar to how different barline types are distinct enum variants.

You can have **multiple ornament tokens in a row**. That models something like several tiny pickup notes or a little cascade after the main note.

#### (2) Symbolic Ornaments

Sometimes the ornament isn't a spelled-out pitch; it's a mark like `tr` for trill, a mordent wiggle, `kan`, a meend curve, etc.

**Implementation**: Same indicator variants as pitched ornaments. Cells between the indicators contain the symbol instead of a pitch. Position type is **implicit in which indicator variant** marks the span.

**So the core invariant is:**

- Every ornament in the handwriting becomes a standalone ornament(-ish) token in our model.
- That token always knows "where was I drawn relative to the main pitch?" via its position type (encoded in the indicator variant).
- We are **not** throwing them away into "some note's metadata." We are keeping them explicit.

### 3.2 No Ornament Spans, No Fragile Grouping

We do **not** maintain open/close ornament spans (like `ornament-start-before ... ornament-end-before`) in the conceptual model.

We also do **not** force you to wrap multiple tiny pitches into a single ornament object.

Instead, **every ornament mark is individually self-tagged.**

You can just have multiple ornament tokens in sequence around a note.

This makes editing feel like handwriting: scribble a scoop, scribble another scoop, scribble a wiggle, done. Delete one? Backspace it. Copy/paste them? They paste just like notes.

**Note**: The implementation may use span indicators internally for rendering/editing efficiency, but this is an implementation detail, not part of the conceptual model.

### 3.3 Attachment is Resolved Later

During editing, ornament tokens do **not** permanently point at a parent note. They just say:

- "I am an ornament,"
- "I was visually before/after/above something,"
- "Here is my pitch (or symbol)."

When we **render or export**, we run a deterministic pass:

1. Find all potential anchor tokens (preferably pitched elements, but any token can serve as an anchor).
2. For each ornament span, decide which token it attaches to based on its indicator variant:
   - `OrnamentBeforeStart` spans → attach to the first token to the right.
   - `OrnamentAfterStart` spans → attach to the last token to the left.
   - `OrnamentOnTopStart` spans → attach to whichever neighboring token is closest (with a clear tie-break rule).
3. Group ornaments per anchor token into three categories: `before`, `after`, `top`.

Now we have, for each anchor token at render/export time:
- the main element (typically a pitch, but could be any token),
- a list of "before" ornament pitches/symbols,
- a list of "after" ornament pitches/symbols,
- a list of "top" ornament pitches/symbols.

**Note**: While attaching to pitched elements is preferable and most common, the system does NOT enforce this restriction. Ornaments can attach to any token type. This reflects the "honor the page" philosophy: if someone draws an ornament mark next to something that isn't technically a pitched note, we handle it gracefully.

This mirrors how you read the handwriting anyway: you visually cluster the little marks around nearby elements.

**And crucially, this grouping is not stored back into the editing model.** The editing model stays simple and linear. The grouping is computed on demand.

### 3.4 Ornaments are Non-Metrical Elements

A critical observation: **ornaments carry no rhythmic value themselves.**

In the token stream, we distinguish two kinds of elements:

1. **Metrical elements** — Elements that contribute to a beat and have rhythmic duration:
   - Pitched metrical elements: main notes (e.g., `S`, `r`, `3`)
   - Unpitched metrical elements: divisions (e.g., `-` for sustain) and unpitched structural markers

2. **Non-metrical elements** — Elements that are visually or expressively present but transparent to rhythm:
   - **Pitched non-metrical ornament elements**: ornament pitches (grace notes, scoops, releases, flicks)
   - Unpitched non-metrical markers: barlines, breath marks, symbolic ornaments (trill squiggles, mordents)

**Ornaments, whether pitched or symbolic, have zero rhythmic duration.** They cannot form a beat by themselves. During beat extraction and rhythm calculation:

- Ornaments are explicitly skipped (marked as `rhythm_transparent()` in the implementation).
- Only metrical elements contribute to measuring out beats.
- Ornaments are attached to adjacent metrical elements **based on their position type**, not based on beat logic.

This is why ornaments can cluster densely around a note without causing metric confusion. The beat is defined by the main note alone; the ornaments are purely embellishment and expressivity layered on top.

**Implication for export/rendering**: When exporting to MusicXML or LilyPond, ornaments become grace notes or symbolic marks attached to their anchor metrical element. They never exist as independent rhythmic entities in the notation system.

---

## 4. Rendering View (Pretty Mode)

When displaying music nicely (vs raw tokens):

- We take the grouped view (note + its before/after/top ornaments).
- We draw the main pitch as a normal note glyph.
- We **float the ornaments**:
  - `before`-ornament tokens are drawn in smaller superscript to the upper-left of the note,
  - `after`-ornament tokens to the upper-right,
  - `top`-ornament tokens above the note.
- We draw slurs by turning `slur-begin` / `slur-end` regions into curved paths.
- We apply spacing tweaks so that ornament clusters don't collide (for example, the "after" ornaments of one note bumping into the "before" ornaments of the next).

So the **engraved view looks like proper music**, not like raw text.

But it is **derived from the token stream**. The engraved view is not the thing you directly edit.

---

## 5. Export (MusicXML / LilyPond)

Export is the same grouping pass, but serialized into formal notation.

For each anchor token (typically a pitched element, but can be any token):

- `"before"` ornament pitch tokens become **pre-grace notes** (acciaccaturas) before that element.
- `"after"` ornament pitch tokens become **post-grace / aftergrace** figures.
- `"top"` ornamentSymbol tokens like `tr` map to trill/mordent/turn markings in the target format if possible; if not, they become markup text above the element.
- `"top"` ornament pitch tokens can also be expressed as grace clusters or pitch bends depending on style.

Slur-begin / slur-end pairs become actual slurs spanning the exported elements.

**Important:**
Because pitch is already explicit in ornament tokens, export does **not** have to guess pitches. It only has to decide **how to represent them** — as pre-grace, aftergrace, articulation, etc.

**Note**: While ornaments typically attach to pitched elements for musical export, the system gracefully handles ornaments attached to non-pitched tokens (e.g., rendering them as markup or omitting them if not representable in the target format).

This lets you produce standard formats (MusicXML, LilyPond) without forcing the live editor to behave like strict Western engraving software during input.

---

## 6. Why This Works

### 1. It Reflects Reality
The editor's internal model is basically a faithful digital capture of the handwritten line: "here's a note, here's a tiny pitch before it, here's a wiggle above it, here's the slur start, here's the slur end." We're not erasing nuance to make the computer comfortable.

### 2. Editing Stays Natural
You don't open a modal dialog to "edit the grace-note object." You literally just insert or delete ornament tokens around notes, the same way you'd add or scratch out a scoop on paper.

### 3. You Don't Pay the Western-Notation Tax Up Front
You can write ornament-heavy music (Hindustani, baroque, jazz inflection) without being forced to answer questions like "is this aftergrace a 32nd tied to beat 4?" at the moment of capture.

### 4. Rendering and Export are Deterministic
Because tokens are typed and ornament spans are marked by explicit indicator variants (Before/After/Top), you can **always** algorithmically group ornaments under their logical notes, float them beautifully, and serialize them into clean MusicXML/LilyPond later. That transform is **predictable and repeatable**.

### 5. The Model Keeps Slurs and Ornaments as First-Class Citizens
- Slurs aren't "some extra style on a note." They're explicit: `slur-begin`, `slur-end`.
- Ornaments aren't "some flag on a note." They're explicit tokens with pitch, marked by indicator variants (OrnamentBeforeStart/End, OrnamentAfterStart/End, OrnamentOnTopStart/End).
- That mirrors how they actually appear on the handwritten page.

---

## 7. One-Sentence Summary

**The philosophy of the editor is:**

> Store music the way it's actually written by humans — as a linear stream of explicit pitches, ornaments, and slurs — and only later, when rendering or exporting, interpret that stream into engraved notation, collision spacing, and MusicXML semantics.

---

## 8. Implementation Notes

At the implementation level (Rust WASM + JavaScript):

- Tokens are realized as **Cells** with typed `kind` fields
- The token stream is stored as a flat `Vec<Cell>` per line
- **Position type information** is embedded in ornament-indicator attributes on cells (e.g., `ornament-before-start`, `ornament-after-start`, `ornament-on-top-start`, and corresponding `-end` variants)
- Ornament spans are marked by start/end indicator pairs; cells between the indicators constitute the ornament
- Anchor location is **implicit** and computed at render/export time based on position type and position in stream
- Attachment resolution happens in the rendering layer and MusicXML export layer
- The JavaScript UI presents both "token mode" (inline editing) and "pretty mode" (rendered notation)

**Note**: Position type is NOT a separate property in the data model. It is implicit in which OrnamentIndicator enum variant marks the span (OrnamentBeforeStart/End, OrnamentAfterStart/End, or OrnamentOnTopStart/End).

See:
- `src/models/core.rs` - Cell definitions and types
- `src/renderers/musicxml/mod.rs` - MusicXML export with ornament grouping
- `specs/006-music-notation-ornament/spec.md` - Detailed ornament specification
