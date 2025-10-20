# Pitch System Implementation - ChatGPT Recommendations

This document contains ChatGPT's recommendations for implementing multi-notation support in the music text editor.

## Context

Multi-model music text editor supporting multiple pitch systems:
- **Western/ABC**: C D E F# (absolute pitches)
- **Do-Re-Mi/Solfege**: Do Re Mi Fa (relative)
- **Number notation**: 1 2 3 4 (relative)
- **Sargam**: S R G M (relative)

---

## Question 1: What happens when switching notation?

### Scenario
If the user starts a document in ABC notation, what should happen if they switch to 123?

### Recommendation

**Don't mutate stored pitches.** Keep an internal, canonical pitch model.

1. **Re-render only**: When the user picks "123," re-render the same canonical stream using the Number renderer.

2. **Ask for missing context**: ABC/Western are absolute; Number and Do-Re-Mi are relative. On switch to 123, prompt for tonic/key/mode (or reuse the document's current one) so scale-degrees are unambiguous.

3. **Show preview + reversible toggle**: Offer a side-by-side preview and let them switch back instantly (view mode, not destructive conversion).

4. **Round-trip fidelity**: Preserve original token text for export/undo (e.g., keep a `source_text` field and `notation=abc` on tokens for lossless round-trip), but keep editing against the canonical model.

---

## Question 2: Multiple pitch systems in same document?

### Should you support multiple systems in the same document?

**Yes, at the document level and section/line level.** It's common in pedagogy and analysis (e.g., Western staff + scale-degree numbers, or Do-Re-Mi glosses).

### Recommended granularity:

1. **Document default notation**: one setting (e.g., 123)
2. **Per-line override**: a `Line.notation` that can differ from the document default (great for examples, quotations, or analysis lines)
3. **Inline override (rare)**: allow short spans (parenthetical glosses) with an explicit markup, but treat them as annotations, not the primary editable stream

### Same line mixed systems?

**Generally no for primary content.** Mixing in one line:

- Hurts readability and spacing (different glyph widths)
- Complicates parsing (spaces are beat separators)
- Confuses relative vs absolute semantics (Do-Re-Mi/Number need tonic; ABC doesn't)

**If you must**, constrain it to inline annotations with clear styling (e.g., gray superscript "(mi=E♭)" or "(3)" above/below the note). Keep the editable, beat-carrying text in one system per line.

---

## Implementation Checklist

### Model
- Keep `Note` with canonical `pitch_code` (Number) + accidental, plus tonic/key/mode on the Line/Document for relative renderers
- Store `notation_source` + `source_text` for tokens to preserve original import/export faithfully

### Rendering
- Renderer takes `(canonical notes, line.notation, tonic/key)` → glyphs
- Spacing: plan for different glyph widths across notations; keep beats aligned by existing column model

### Conversion UI
- On notation change: prompt for tonic/key if needed, show preview, do render-only switch
- If any pitch becomes ambiguous in relative systems (modal mixture, chromaticism), flag it and suggest local accidentals or a temporary absolute line

### Editing rules
- Document has a default notation
- Each line can declare a notation override
- Disallow free mixing inside a line, except explicitly marked annotations that don't affect parsing or beat layout

### Export
- Export in current view notation or original source notation (user choice)
- Keep round-trip: export can use `source_text` where available; otherwise use renderer

---

## Policy Summary

| Scenario | Support |
|----------|---------|
| Multiple systems per document | ✅ Yes |
| Per-line overrides | ✅ Yes (recommended) |
| Inline mixing (annotations only) | ⚠️ Only as annotations |
| Mixing systems within same beat/primary line content | ❌ No (too error-prone) |

---

## Question 3: Should document pitch system set all lines?

### Recommendation

**No**—changing the document pitch system should **not** blindly change every line.

Make the document setting a **default/fallback**, and only update lines that are inheriting the default (i.e., have no explicit override). Leave lines with explicit overrides alone. Offer an optional bulk-apply.

### Model Design

```rust
document.notation_default: NotationKind
line.notation_override: NotationKind | null

// Effective notation
effective_notation = line.notation_override ?? document.notation_default
```

Similar pattern for:
- `document.tonic/mode`, `line.tonic_override`

### Behavior when user changes document pitch system

1. **Update only the default**: set `document.notation_default`
2. **Re-render all lines** using `effective_notation`
3. **Do not touch** any `line.notation_override` values
4. **Provide a bulk option**:
   - "Apply to: ( ) Inherited lines only ( ) All lines (override everything)"
   - Default to "Inherited lines only" (safe)

### UX Affordances

- **Line badge or tooltip**: show whether a line is "Inherits document default" vs "Overridden to Do-Re-Mi"
- **Quick actions on a line**:
  - "Use document default" → sets `notation_override = null`
  - "Set line notation to …" → sets/changes `notation_override`
- **New lines**: start as `notation_override = null` (inherit document default)

### Edge Cases

- **Relative vs absolute**: if switching the default to a relative system (123/Do-Re-Mi), ensure `document.tonic/mode` is set (prompt if missing)
- **Imports**: imported lines that arrived in a specific notation get `notation_override` set on import
- **Export**: allow export "as displayed" or "as imported"

---

## Question 4: Field naming - `line.notation_override`?

### Recommendation

**Use just `line.notation` (optional), not `notation_override`.**

### Why:

- "Override" is implied by presence. If `line.notation` is set → it overrides; if it's null → inherit from document
- Keeps API cleaner and mirrors how theme/locale overrides are commonly modeled

### Suggested Shapes

**Document:**
```typescript
document.notationDefault: NotationKind
```

**Line (TypeScript):**
```typescript
notation?: NotationKind // omitted = inherit

// Getter
effectiveNotation = line.notation ?? document.notationDefault
```

**Line (Rust):**
```rust
notation: Option<NotationKind>

// Helper
fn effective_notation(&self, doc: &Document) -> NotationKind {
    self.notation.unwrap_or(doc.notation_default)
}
```

### Parallel fields (same pattern):
```typescript
tonic?: Tonic
mode?: Mode
tempo?: Tempo
```

Each optional on the line, inheriting from document defaults.

---

## Question 5: Rust Implementation with `Option<Notation>`

### Complete Implementation

```rust
use std::fmt;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Notation {
    Western,   // ABC / letter names (C, Db, …)
    Number,    // 1 2 3 …
    Solfege,   // Do Re Mi …
    Sargam,    // S r R g G …
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Mode {
    Ionian, Dorian, Phrygian, Lydian,
    Mixolydian, Aeolian, Locrian
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Tonic {
    pub pitch_class: u8, // 0 = C, 1 = C#, … 11 = B
    pub octave: i8,
}

#[derive(Debug)]
pub struct Document {
    pub notation_default: Notation,
    pub tonic_default: Option<Tonic>,
    pub mode_default: Option<Mode>,
    pub lines: Vec<Line>,
}

#[derive(Debug)]
pub struct Line {
    /// If Some, overrides the document default; if None, inherits.
    pub notation: Option<Notation>,
    pub tonic: Option<Tonic>,
    pub mode: Option<Mode>,
    pub text: String,
}

impl Line {
    pub fn effective_notation(&self, doc: &Document) -> Notation {
        self.notation.unwrap_or(doc.notation_default)
    }

    pub fn effective_tonic(&self, doc: &Document) -> Option<Tonic> {
        self.tonic.or(doc.tonic_default)
    }

    pub fn effective_mode(&self, doc: &Document) -> Option<Mode> {
        self.mode.or(doc.mode_default)
    }
}

impl Document {
    pub fn new(notation_default: Notation) -> Self {
        Self {
            notation_default,
            tonic_default: None,
            mode_default: None,
            lines: Vec::new(),
        }
    }

    pub fn set_notation_default(&mut self, new_default: Notation) {
        self.notation_default = new_default;
        // Note: do NOT mutate line.notation; inherited lines change automatically
    }
}

impl Line {
    pub fn new(text: impl Into<String>) -> Self {
        Self {
            notation: None,
            tonic: None,
            mode: None,
            text: text.into()
        }
    }
}
```

### Tests

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn inheritance_works() {
        let mut doc = Document::new(Notation::Western);
        doc.lines.push(Line::new("C D E F"));
        doc.lines.push(Line {
            notation: Some(Notation::Number),
            ..Line::new("1 2 3 4")
        });

        // Before change
        assert_eq!(doc.lines[0].effective_notation(&doc), Notation::Western);
        assert_eq!(doc.lines[1].effective_notation(&doc), Notation::Number);

        // Change document default
        doc.set_notation_default(Notation::Sargam);

        // Inherited line follows document
        assert_eq!(doc.lines[0].effective_notation(&doc), Notation::Sargam);
        // Overridden line is unchanged
        assert_eq!(doc.lines[1].effective_notation(&doc), Notation::Number);
    }

    #[test]
    fn tonic_mode_inherit() {
        let mut doc = Document::new(Notation::Number);
        doc.tonic_default = Some(Tonic { pitch_class: 0, octave: 4 }); // C4
        doc.mode_default = Some(Mode::Ionian);

        let mut line = Line::new("1 2 3 4");
        assert_eq!(line.effective_tonic(&doc).unwrap().pitch_class, 0);
        assert!(matches!(line.effective_mode(&doc), Some(Mode::Ionian)));

        // Local override
        line.tonic = Some(Tonic { pitch_class: 2, octave: 4 }); // D4
        assert_eq!(line.effective_tonic(&doc).unwrap().pitch_class, 2);
    }
}
```

---

## Question 6: Passing document.notation to renderer

### The Problem

Don't thread raw `document.notation` everywhere.

### Solution A: Pass RenderContext

Minimal plumbing; explicit and testable.

```rust
#[derive(Clone, Copy, Debug)]
pub struct RenderContext {
    pub notation_default: Notation,
    pub tonic_default: Option<Tonic>,
    pub mode_default: Option<Mode>,
}

pub trait PitchRenderer {
    fn render_line(&mut self, line: &Line, cx: &RenderContext) -> SvgGroup;
}

impl PitchRenderer for SvgRenderer {
    fn render_line(&mut self, line: &Line, cx: &RenderContext) -> SvgGroup {
        let eff_notation = line.notation.unwrap_or(cx.notation_default);
        let eff_tonic = line.tonic.or(cx.tonic_default);
        let eff_mode = line.mode.or(cx.mode_default);
        self.render_tokens(line, eff_notation, eff_tonic, eff_mode)
    }
}
```

### Solution B: Pre-resolve into ViewModel (Recommended)

Do an evaluation pass that resolves inheritance → renderer never sees `Option`.

```rust
pub struct LineView<'a> {
    pub src: &'a Line,
    pub notation: Notation,
    pub tonic: Option<Tonic>,
    pub mode: Option<Mode>,
}

pub fn resolve_view<'a>(doc: &'a Document) -> Vec<LineView<'a>> {
    doc.lines
        .iter()
        .map(|line| LineView {
            src: line,
            notation: line.notation.unwrap_or(doc.notation_default),
            tonic: line.tonic.or(doc.tonic_default),
            mode: line.mode.or(doc.mode_default),
        })
        .collect()
}

// Renderer API becomes clean:
fn render_line_view(&mut self, view: &LineView) -> SvgGroup { /* ... */ }
```

### Solution C: Memoized resolver with generation counter

For caching:

```rust
pub struct Document {
    pub notation_default: Notation,
    pub generation: u64, // bump on any setting change
    /* ... */
}

pub struct ResolverCache {
    gen_seen: u64,
    last: Vec<LineView<'static>>,
}
```

On render start: if `doc.generation != cache.gen_seen`, recompute views; else reuse.

### Which to Choose?

| Approach | Best For |
|----------|----------|
| **A (RenderContext)** | Simplest and explicit. Good for small/medium editors. |
| **B (ViewModel)** | **Best engineering trade-off.** One pass resolves everything; renderer is dumb/fast; easier to unit test and export. |
| **C (Memoized)** | Add later if perf requires it. |

### Practical Tips

1. Keep effective getters on `Line` anyway; they're useful in non-render code
2. For WASM, pass a compact struct over the JS boundary per line or per document
3. If you do a layout pass, store resolved values alongside layout
4. Avoid globals/thread-locals; they complicate tests and multi-doc tabs
5. When document default changes, invalidate: bump generation, clear caches, recompute views/layout

---

## Summary

**TL;DR:**
- ✅ Multiple systems per document (line-level overrides)
- ✅ Use `line.notation: Option<Notation>` (not `notation_override`)
- ✅ Document has `notation_default`, lines inherit if `None`
- ✅ Don't mutate content on notation change (view-only transform)
- ✅ Pass `RenderContext` or pre-resolve to `LineView`
- ❌ Avoid mixing within same line (except annotations)

**Keep the editor predictable, preserve round-trip fidelity, and give power users the flexibility they want.**
