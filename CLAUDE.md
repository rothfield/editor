# editor Development Guidelines

Auto-generated from all feature plans. Last updated: 2025-10-14

---

## ⚠️ **PRIME DIRECTIVE: WASM-FIRST ARCHITECTURE** ⚠️

### ***CRITICAL: BEFORE WRITING ANY JAVASCRIPT CODE***

**STOP AND ASK THE USER:** "Does this code belong in JavaScript or WASM?"

### **Default Answer: WASM (Rust)**

**MOST code should be in Rust/WASM.** Only platform I/O and UI glue belongs in JavaScript.

### **What Goes Where**

**✅ WASM (Rust) - The Core:**
- **All document model and business logic**
- **All text/selection operations**: cursor movement, selection management, insert/delete/backspace
- **State management**: cursor position (anchor/head), selection, desiredCol, undo/redo
- **Text math**: code points, graphemes, multi-line operations, block selections
- **Structure-aware operations**: columns, beats, measures, cells
- **All edit semantics**: join/split, undo batching
- **Clipboard data preparation**: get_plain_text(), get_structured()
- **Any deterministic, testable logic**

**✅ JavaScript - The Glue:**
- **Browser event capture ONLY**: keyboard, mouse, IME (compositionstart/update/end)
- **Platform APIs**: Clipboard API, focus/blur, File API
- **DOM/SVG rendering**: taking minimal diffs from WASM and updating display
- **UI components**: buttons, panels, inspector tabs
- **Event translation**: converting browser events into simple WASM commands

### **Interface Pattern**

**JS → WASM (commands):**
```rust
move_caret(dir: Direction, extend: bool) -> CaretInfo
set_selection(anchor: Pos, head: Pos) -> SelectionInfo
insert_text(text: String) -> DocDiff
backspace() -> DocDiff
delete() -> DocDiff
```

**WASM → JS (data):**
```rust
CaretInfo { caret: Pos, desiredCol: u32 }
SelectionInfo { anchor: Pos, head: Pos, ... }
DocDiff { changed_staves: Vec<u32>, ... }
```

### **When in Doubt**

If you're about to implement:
- Selection logic → **WASM**
- Cursor movement → **WASM**
- Text operations → **WASM**
- Undo/redo → **WASM**
- Document state → **WASM**
- Business rules → **WASM**

**ASK FIRST. THEN CODE IN RUST.**

### **⚠️ CRITICAL: BEFORE WRITING FRONT-END JAVASCRIPT CODE**

**ALWAYS CHECK IF THERE IS A WASM-BRIDGE FUNCTION FOR WHAT YOU NEED!!!!**

**YOU MAY HAVE TO ADD ONE!**

When writing JavaScript that needs to interact with the WASM layer:
1. **FIRST**: Check if the WASM function already exists in `src/api/`
2. **SECOND**: If it exists, verify it's exposed in `src/js/editor.js` `this.wasmModule` object
3. **THIRD**: If it doesn't exist, ADD IT TO WASM FIRST, then expose it in the bridge

**Common mistake:** Writing JavaScript logic that should be in WASM, or forgetting to add WASM functions to the bridge.

See the "WASM Function Integration Pattern" section below for the complete checklist.

---

## Active Technologies
- Rust 1.75+ (WASM module), JavaScript ES2022+ (host application), Node.js 18+ + wasm-bindgen 0.2.92, OSMD (OpenSheetMusicDisplay) 1.7.6, existing Cell-based editor (002-real-time-staff)
- Rust 1.75+ (WASM module) + JavaScript ES2022+ (host application) + wasm-bindgen 0.2.92, OSMD 1.7.6, serde 1.0.197, quick-xml 0.31, mustache 0.9 (006-music-notation-ornament)
- JSON file format for document persistence (006-music-notation-ornament)
- Rust 1.75+ (WASM module) + JavaScript ES2022+ (host application) + wasm-bindgen 0.2.92, OSMD 1.7.6, UnoCSS (styling) (006-music-notation-ornament)

## Project Structure
```
src/
tests/
```

## Commands
cargo test [ONLY COMMANDS FOR ACTIVE TECHNOLOGIES][ONLY COMMANDS FOR ACTIVE TECHNOLOGIES] cargo clippy

## Code Style
Rust 1.75+ (WASM module), JavaScript ES2022+ (host application), Node.js 18+: Follow standard conventions

## Testing Conventions

**Use the Number System (1-7) as default for all test input.** The Number pitch system is the default pitch setting for the editor.

### Test Input Guidelines

- **All test data** (Rust unit tests, integration tests, E2E Playwright tests): Use number notation by default
- **Examples:**
  - Simple sequence: `1 2 3`
  - With rhythmic notation: `| 1--2 -- 3 4 |`
  - Single line: `1`
  - Rests/extensions: `1-- 2-` (dash extends duration)

- **Why:** Ensures tests work with default editor settings without requiring pitch system configuration
- **Cross-layer consistency:** Same notation works from WASM tests to E2E browser tests

### Exception: When Testing Pitch Systems

If explicitly testing pitch system features (e.g., switching from Number to Western), use configurable input that adapts to the active system.

### Debug Logging

**CRITICAL: When adding debug logging, DO NOT ask the user to view the logs!**

Instead:
1. Write an E2E test (or temporary test) to verify the functionality
2. Run the test to capture console output
3. Use test results to diagnose the issue
4. Remove debug logging after fixing the issue

Example:
```javascript
// ❌ BAD: Adding console.log and asking user to check browser
console.log('[Feature] Debug info:', data);
// Then asking user: "Can you open browser console and check the logs?"

// ✅ GOOD: Write a test that captures the logs
test('feature works correctly', async ({ page }) => {
  const logs = [];
  page.on('console', msg => logs.push(msg.text()));

  // Perform action
  await page.click('#button');

  // Assert based on logs or behavior
  expect(logs.some(log => log.includes('[Feature] Debug info'))).toBeTruthy();
});
```

## Recent Changes
- 006-music-notation-ornament: Added Rust 1.75+ (WASM module) + JavaScript ES2022+ (host application) + wasm-bindgen 0.2.92, OSMD 1.7.6, UnoCSS (styling)
- 006-music-notation-ornament: Added Rust 1.75+ (WASM module) + JavaScript ES2022+ (host application) + wasm-bindgen 0.2.92, OSMD 1.7.6, serde 1.0.197, quick-xml 0.31, mustache 0.9
- 002-real-time-staff: Added Rust 1.75+ (WASM module), JavaScript ES2022+ (host application), Node.js 18+ + wasm-bindgen 0.2.92, OSMD (OpenSheetMusicDisplay) 1.7.6, existing Cell-based editor

## Rhythmic Notation Reference
**For questions about how rhythm works in this codebase, refer to [@RHYTHM.md](RHYTHM.md).** This document explains:
- How horizontal space represents musical time (spatial rhythmic notation)
- Beat grouping and subdivision counting
- Tuplet detection and generation
- The processing algorithm for converting spatial layout to precise durations
- LilyPond and MusicXML mapping

### Beat Boundaries and Rhythm Interpretation

**CRITICAL: Spaces create beat boundaries.**

Each beat is interpreted as 1/1 of a beat, which in 4/4 time equals a quarter note. This applies regardless of the number of subdivisions within that beat.

**Key principles:**
- **Beat boundaries created by:** spaces, barlines, symbols, text, newlines
- **Beat elements (do NOT create boundaries):** pitches, dashes, breath marks, ornaments
- Each beat gets fraction 1/1, normalized to the measure's time signature
- Within a beat, elements are subdivided proportionally

**Examples:**
- `1'---` → ONE beat with 4 subdivisions: note (1/4) + rest (3/4)
- `1 '---` → TWO beats: note (1/1) + rest (1/1) = quarter + quarter in 4/4
- `1' ---` → TWO beats: note (1/1) + rest (1/1) = quarter + quarter in 4/4
- `1 2 3` → THREE beats: each note gets 1/1 = three quarter notes in 4/4

## Music Notation Font System

### NotationFont - Custom Font for Text-Based Music Notation

Text-based music notation (main notation line, ornaments) uses **NotationFont**, which is based on **Noto Sans** - a general purpose sans-serif font from Google - with music glyphs from [Noto Music](https://github.com/notofonts/music) added to the Private Use Area (PUA). This provides proper text rendering and spacing while supporting music-specific glyphs. Variants include different pitch systems (Number, Western, Sargam, Doremi) with all combinations of octave dots and accidentals. Source: `tools/`

**IMPORTANT:** Noto Music is NOT an SMuFL font - it uses standard Unicode Musical Symbols (U+266D ♭ flat, U+266F ♯ sharp, U+1D12A 𝄪 double-sharp, U+1D12B 𝄫 double-flat), not SMuFL Private Use Area codepoints. SMuFL fonts like Bravura use U+E000+ for comprehensive notation.

**Font Architecture:**
- **Single source of truth:** `tools/fontgen/atoms.yaml` defines all characters, code points, and allocations
- **Build-time generation:** `build.rs` generates Rust constants from atoms.yaml at compile time
- **Runtime integration:** JavaScript loads code points from WASM via `getFontConfig()`
- **Font location:** `dist/fonts/NotationFont.ttf` (473 KB)

**Glyph Coverage:**
- **47 base characters:** Numbers (1-7), Western (C-B, c-b), Sargam (Sa Re Ga Ma Pa Dha Ni), Doremi (do re mi fa sol la ti)
- **188 octave variants:** Each character has 4 variants with dots above/below:
  - Variant 0: 1 dot above (octave +1) → U+E000-U+E02E
  - Variant 1: 2 dots above (octave +2) → U+E001-U+E02F
  - Variant 2: 1 dot below (octave -1) → U+E002-U+E030
  - Variant 3: 2 dots below (octave -2) → U+E003-U+E031
- **47 sharp accidentals:** Each character with # symbol → U+E1F0-U+E21E
- **Musical symbols:** Accidentals (flat, natural, sharp, double-sharp, double-flat), barlines (single, double, repeat), ornaments (trill, turn, mordent) → U+E220+

**Code Point Allocation (Private Use Area):**
```
0xE000 - 0xE0BB: 188 octave variants (47 chars × 4 variants)
0xE1F0 - 0xE21E: 47 sharp accidentals
0xE220+:         Musical symbols (barlines, ornaments, etc.)
```

**Formula:** `codepoint = PUA_START + (character_index × CHARS_PER_VARIANT) + variant_index`

### Verifying Font Changes

**⚠️ IMPORTANT:** Any changes to the font require **visual verification by AI using the Font Test tab**.

**Steps to verify new font versions:**
1. Run the application: `npm run dev`
2. Navigate to the **Font Test** tab in the Inspector panel
3. Click through the tabs:
   - **Show All:** Displays octave variants, accidentals, and symbols
   - **Sharp Accidentals:** Shows all 47 sharp variants
   - **Octave Variants:** Shows all 188 octave variants (check for visible dots!)
   - **Barlines & Symbols:** Shows musical symbols
4. Verify glyphs are **visually correct** - dots should be visible above/below characters
5. Confirm code points match expected values (shown in small blue text under each glyph)

**Example verification task:**
```
User: "I updated the font file. Can you verify the new dots are visible?"

You:
1. Take screenshot of Font Test tab (Octave Variants section)
2. Visually inspect if dots above/below characters are visible
3. Check code points: U+E000 (1 with dot), U+E001 (1 with 2 dots), etc.
4. Report: "✅ Dots visible on all variants" or "❌ Dots not visible, investigate..."
```

**Related files:**
- `src/js/font-test.js` - Font Test UI component
- `src/renderers/font_utils.rs` - Glyph code point calculation (exports `getFontConfig()`)
- `src/js/core/WASMBridge.js` - Exposes font config to JavaScript
- `tools/fontgen/atoms.yaml` - Single source of truth for font configuration
- `build.rs` - Compile-time code generation from atoms.yaml
- `FONT_MIGRATION_NOTO_MUSIC.md` - Complete migration guide
- `FONT_ARCHITECTURE_NOTO.md` - Technical deep-dive on font system

### Pitch System Test Pages (Required)

**⚠️ CRITICAL: There MUST be a test page for each pitch system.**

Each pitch system requires a standalone HTML test page to verify:
- Font rendering correctness
- Glyph-to-PUA codepoint mapping
- Accidental behavior (when accidentals should/shouldn't appear)
- Normalized pitch mapping

**Required test pages:**
- `number.html` - Number system (1-7) with accidentals
- `sargam.html` - Sargam system (S, r, R, g, G, m, M, P, d, D, n, N)
- `western.html` - Western system (C-D-E-F-G-A-B) with accidentals
- `doremi.html` - Doremi system (do-re-mi-fa-sol-la-ti) [TODO: create]

**What each test page must include:**
1. Direct font loading from `/static/fonts/NotationFont.woff2` and `.ttf`
2. Display all chromatic notes (12 semitones) for that system
3. Show PUA codepoint for each glyph (for debugging)
4. Color-coded sections (natural, flat, sharp)
5. Explanatory text about expected accidental behavior
6. Proper character index and variant_index calculation matching atoms.yaml

**Special cases to verify:**
- **Sargam**: komal notes (r, g, m, d, n) and tivra Ma (M) must NOT show accidentals (case IS the pitch)
- **Number**: accidentals MUST appear correctly (2♭, 3♭, 4#, 6♭, 7♭)
- **Western**: standard accidental display (flats and sharps)

**Formula used in all test pages:**
```javascript
const variant_index = (acc_type * 5) + octave_idx;
const codepoint = pua_base + (char_index * 30) + variant_index;
// acc_type: 0=natural, 1=flat, 2=half-flat, 3=double-flat, 4=double-sharp, 5=sharp
// octave_idx: 0=base, 1=+1 octave, 2=+2 octaves, etc.
```

**When to use these test pages:**
- After any font generation changes (`make fonts`)
- When modifying `tools/fontgen/generate.py` or `atoms.yaml`
- To verify special cases (like Sargam komal/tivra exclusions)
- When debugging glyph rendering issues

**How to verify:**
1. Open test page in browser (e.g., `http://localhost:8080/number.html`)
2. Visually inspect all glyphs render correctly
3. Check that accidental symbols appear/don't appear as expected
4. Verify PUA codepoints match atoms.yaml allocations

### ⚠️ NEW ARCHITECTURE: Layered Text-First Design

**Core Principle: Text Editor with Music Brain**

This editor is fundamentally a **text editor** with music notation semantics layered on top:

```
Layer 0: Text Buffer (source of truth)
    ↓
Layer 1: Glyph Semantics (char ↔ musical meaning)
    ↓
Layer 2: Musical Structure (beats, measures, phrases)
    ↓
Layer 3: Export (IR, MusicXML, LilyPond)
```

**Mental Model Shift: From Calculation to Lookup**

The NotationFont system uses a **simple, direct lookup table** approach. Every pitch system has a straightforward mapping:

```
(PitchCode, octave) → char (glyph in NotationFont)
```

**This is ONE-TO-ONE. SIMPLE. KISS (Keep It Simple, Stupid).**

**Key Invariant:**
- One glyph = one musical note
- One char = one code point (no grapheme clusters)
- Column = char index (no multi-byte complexity)

#### Why This Architecture?

**OLD (Complex):**
```rust
// Formula-based calculation
let variant_index = calculate_variant_from_octave(octave);
let char_index = pitch_to_index(pitch);
let codepoint = PUA_START + (char_index * CHARS_PER_VARIANT) + variant_index;
```

**NEW (Simple):**
```rust
// Direct lookup
let codepoint = PITCH_SYSTEM_TABLE[(normalized_pitch, octave)];
```

#### Benefits

1. **Clarity**: No complex formulas to understand or maintain
2. **Correctness**: Lookup tables match exactly what's in the font
3. **Debuggability**: Easy to verify - just check the table
4. **Flexibility**: Easy to add special cases or exceptions
5. **Performance**: O(1) lookup, no calculations needed

#### Implementation Pattern

Each pitch system (Number, Western, Sargam, Doremi) has its own lookup table:

```rust
// Example: Number system (1-7)
const NUMBER_SYSTEM_TABLE: &[(NormalizedPitch, Octave, char)] = &[
    // Base octave (0)
    (NormalizedPitch::Do,  0, '\u{E010}'),  // "1" base
    (NormalizedPitch::Re,  0, '\u{E014}'),  // "2" base
    (NormalizedPitch::Mi,  0, '\u{E018}'),  // "3" base
    // ... etc

    // Octave +1 (1 dot above)
    (NormalizedPitch::Do,  1, '\u{E000}'),  // "1" with dot above
    (NormalizedPitch::Re,  1, '\u{E004}'),  // "2" with dot above
    // ... etc

    // Octave -1 (1 dot below)
    (NormalizedPitch::Do, -1, '\u{E002}'),  // "1" with dot below
    // ... etc
];
```

#### Usage Pattern

```rust
fn get_glyph_for_pitch(pitch: NormalizedPitch, octave: Octave, system: PitchSystem) -> char {
    match system {
        PitchSystem::Number => NUMBER_SYSTEM_TABLE.lookup(pitch, octave),
        PitchSystem::Western => WESTERN_SYSTEM_TABLE.lookup(pitch, octave),
        PitchSystem::Sargam => SARGAM_SYSTEM_TABLE.lookup(pitch, octave),
        PitchSystem::Doremi => DOREMI_SYSTEM_TABLE.lookup(pitch, octave),
    }
}
```

#### Key Principle

**The lookup table IS the font. The font IS the lookup table.**

No formulas, no calculations, no confusion. What you see in the table is exactly what renders on screen.

### Layer Details

**Layer 0: Text Buffer (Source of Truth)**
- Simple line-based text storage
- Character = Unicode scalar value
- Operations: insert, delete, get_line, set_line
- Undo/redo operates on text edits, not cell snapshots
- Future: Can upgrade to Rope, CRDT, etc. without affecting higher layers

**Layer 1: Glyph Semantics (Bidirectional Mapping)**
- **Forward:** `glyph_for_pitch(PitchCode, octave, system) -> char`
- **Reverse:** `pitch_from_glyph(char, system) -> (PitchCode, octave)` (coming soon)
- Stateless lookup tables generated from atoms.yaml
- No parsing, no formulas, just direct array/map lookups

**Layer 2: Musical Structure (Derived, Not Stored)**
- Analyze text → beats, measures, barlines
- Tokenize: spaces = beat boundaries, `|` = barlines
- Attach metadata: ornaments, slurs, dynamics (via annotations)
- This layer doesn't store anything - it computes on demand

**Layer 3: Export (Leave Mostly Alone)**
- Text + annotations → IR → MusicXML → LilyPond/OSMD
- Current IR pipeline works fine
- Future: Might skip Cells entirely (text → IR directly)

### Cells as Views, Not Storage

**CRITICAL: Cells are generated, not stored.**

The `Cell` struct is a **view** derived from text + annotations:

```rust
/// View-only: generated from text + annotations.
/// DO NOT treat this as source-of-truth or store it in Document.
pub struct Cell {
    pub char: String,        // Display text
    pub kind: ElementKind,   // Pitch, rest, barline, etc.
    pub pitch_code: Option<PitchCode>,  // Semantic meaning
    pub col: usize,          // Position in line
    pub flags: u8,           // UI state (selected, focused)
    // ... layout fields for rendering
}
```

**Generate cells from text:**
```rust
fn cells_from_text(text: &str, annotations: &AnnotationLayer, system: PitchSystem) -> Vec<Cell>
```

**Why this matters:**
- No sync bugs (text is truth)
- Undo is simple (text edits only)
- Smaller memory footprint (don't store cells)
- Can re-derive cells anytime with different pitch system

### Design Principles

1. **All stateful operations go through Layer 0 (text buffer)**
   - No "mutate annotations and hope buffer follows"
   - No "move Cells around directly"
   - Text edits are the only mutation

2. **Layers 1-2 are pure functions**
   - Input: text, annotations, system
   - Output: derived data (glyphs, structure, cells)
   - No side effects, no state

3. **Migration strategy: Additive, not destructive**
   - Keep old APIs working during transition
   - Build new paths alongside existing code
   - Cut over aggressively once POC works
   - Don't maintain dual systems for months

**Related files for new architecture:**
- `src/renderers/font_utils.rs` - Glyph lookup tables (Layer 1)
- `tools/fontgen/atoms.yaml` - Source of truth for all code point assignments
- `build.rs` - Generates lookup tables from atoms.yaml at compile time
- `LOOKUP_TABLE_ARCHITECTURE.md` - Detailed implementation guide

## Export Architecture: From Document Model to Multiple Formats

The editor uses a **three-layer export pipeline** to support multiple output formats:

```
Document (Cell-based)
    ↓
IR (Intermediate Representation)
    ↓
MusicXML (Standard interchange format)
    ↓
    ├→ LilyPond (High-quality engraving)
    ├→ OSMD (Browser rendering)
    └→ VexFlow (Alternative browser rendering)
```

### Why This Architecture?

1. **IR is format-agnostic**: Captures all musical information once (notes, rests, measures, divisions, slurs, articulations, etc.). New export features are added here first.
2. **MusicXML is the hub**: Standard interchange format that all downstream tools understand. Easier to maintain than exporting directly to each format.
3. **Multiple renderers**: Same musical data can drive LilyPond, OSMD, VexFlow, or custom renderers without duplicating conversion logic.

### Key Components

**IR (Intermediate Representation):**
- **Location**: `src/ir/` (top-level module, format-agnostic)
  - `src/ir/types.rs` - IR type definitions
  - `src/ir/builder.rs` - Document-to-IR conversion logic
  - `src/ir/mod.rs` - Public API exports
- **Responsibilities**: Convert Cell-based document to structured musical events (format-agnostic)
- **Key types**: `ExportLine`, `ExportMeasure`, `ExportEvent`, `NoteData`, `SlurData`, `TieData`, etc.
- **Import**: `use crate::ir::*;` or `use crate::ir::build_export_measures_from_document;`

**Document-to-IR Conversion (FSM):**
- **Location**: `src/ir/builder.rs`
- **Process**: Finite State Machine processes cells sequentially, grouping them into beat-level events
- **Handles**: Grace notes, dashes (rests/extensions), rhythmic grouping, lyrics, slurs, ties
- **Entry point**: `build_export_measures_from_document(&document) -> Vec<ExportLine>`

**MusicXML Export:**
- **Location**: `src/renderers/musicxml/emitter.rs`, `builder.rs`
- **Process**: Consumes IR and emits valid MusicXML XML
- **Handles**: Divisions, note elements, slur elements, articulations, tuplets

### Adding New Musical Features

When adding support for a new musical element (e.g., slurs):

1. **Add to Cell model** if it's user-creatable (e.g., `SlurIndicator` on Cell)
2. **Add to IR types** in `src/ir/types.rs` if it needs to be exported (e.g., `SlurData` in `NoteData`)
3. **Wire up conversion** in `src/ir/builder.rs` FSM to extract from Cell and populate IR
4. **Export to formats**:
   - **MusicXML**: Update `src/renderers/musicxml/emitter.rs` and `builder.rs` to ensure correct XML output
   - **LilyPond**: Update LilyPond emitter when implemented
5. **Test end-to-end**: Document → Cell → IR → MusicXML → Inspector tab

This ensures the feature works across all downstream renderers automatically.

<!-- MANUAL ADDITIONS START -->

## Inspector-First, LilyPond-Fail-Fast Testing (Playwright + Docker)

A compact playbook for Claude CLI to make wasm/js/html/css music-notation editor tests **reliable, quiet, and end-to-end meaningful**.

### Core Principle

**Prioritize in-app inspector tabs as your oracles, in this order:**

1. **LilyPond source** — easiest end-to-end truth (export reflects editor state)
2. **MusicXML source** — structural soundness (measures, ties, tuplets)
3. **WASM DOM Layout** — semantic rendering checks (ordering, caret/bbox presence)
4. **Document Model** — logical tokens/beats/column alignment

**Fail fast if LilyPond panel is empty or incorrect.** Skip noisy visuals and browser report windows.

### Claude "System" Meta-Instructions (Summary)

You are an **autonomous test engineer** (CLI only):

1. **Use inspector tabs as ground truth**; do not open Playwright HTML report windows
2. **Prefer semantic assertions & text snapshots** over screenshots
3. **Use stable locators**: `getByRole`, `getByLabel`, `getByTestId`
4. **No sleeps**; rely on Playwright auto-wait and `expect.poll`
5. **On failure**: produce a small patch proposal (add `data-testid`, better selectors, or targeted waits)
6. **Always save artifacts to disk**; keep output quiet

### Minimal Locators (Required in App)

```html
<!-- Inspector tabs -->
<button data-testid="tab-lilypond">LilyPond</button>
<button data-testid="tab-musicxml">MusicXML</button>
<button data-testid="tab-displaylist">Display List</button>
<button data-testid="tab-docmodel">Doc Model</button>

<!-- Inspector panes -->
<pre data-testid="pane-lilypond"></pre>
<pre data-testid="pane-musicxml"></pre>
<pre data-testid="pane-displaylist"></pre>
<pre data-testid="pane-docmodel"></pre>

<!-- Editor -->
<div data-testid="editor-root" role="textbox"></div>
```

### Playwright Config (Quiet + Artifacts)

- **Reporter**: `list` (or `list + html` with `{ open: 'never' }`)
- **use**: `trace: 'on-first-retry'`, `screenshot: 'only-on-failure'`, `video: 'retain-on-failure'`
- **expect.timeout** = 5000, **test timeout** ~ 30s
- **webServer** starts your dev server and waits on URL
- **Default headless**; no report windows

### Helper Utilities (Inspector-First)

Create `tests/helpers/inspectors.js`:

```javascript
import { expect } from '@playwright/test';

export async function openTab(page, testId) {
  const tab = page.getByTestId(testId);
  await expect(tab).toBeVisible();
  await tab.click();
}

export async function readPaneText(page, testId) {
  const pane = page.getByTestId(testId);
  await expect(pane).toBeVisible();
  await expect.poll(async () => (await pane.innerText()).trim()).not.toEqual('');
  return (await pane.innerText())
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}
```

### Fail-Fast Smoke Test (Runs First)

Create `tests/e2e-pw/tests/00-lilypond-smoke.spec.js`:

```javascript
import { test, expect } from '@playwright/test';
import { openTab, readPaneText } from '../helpers/inspectors.js';

test('SMOKE: LilyPond export reflects editor content (fail-fast)', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.type('S--r G- m |'); // tiny deterministic motif

  await openTab(page, 'tab-lilypond');
  const ly = await readPaneText(page, 'pane-lilypond');

  expect(ly.length).toBeGreaterThan(0);
  expect(ly).toMatchSnapshot('smoke.ly.txt'); // stable, diffable
});
```

Replicate the pattern for **MusicXML**, **WASM layout**, and **Document Model** as secondary checks.

### Docker (Quiet) Runner

Example Docker command for quiet, artifact-focused runs:

```bash
#!/bin/bash
IMG="mcr.microsoft.com/playwright:v1.48.2-jammy"
ART="$(pwd)/artifacts"
mkdir -p "$ART"

docker run --rm -it --ipc=host \
  -v "$(pwd):/work" -w /work \
  -e CI=1 -e HOME=/work/.home \
  -v "$ART:/work/artifacts" \
  "$IMG" bash -lc "
    corepack enable && pnpm i --frozen-lockfile &&
    npx playwright install --with-deps &&
    npx playwright test --reporter=list --output=artifacts
  "
```

No report UI is opened; artifacts & traces go to `./artifacts`.

### Autonomy Loop for Claude (Terse)

1. **Plan** one hypothesis (ex: "LilyPond reflects typed motif")
2. **Run** only the needed spec/test
3. **Inspect** the right tab; grab text; normalize; assert
4. **Harden** (selectors, `expect.poll`, add `data-testid`)
5. **Artifacts (CLI)**: snapshot diffs + trace on retry; write `artifacts/triage.md`
6. **Patch**: propose tiny changes; no broad retries/timeouts; never disable tests

### Why This Works

- ✅ **End-to-end confidence** without pixel flakiness
- ✅ **Fast triage**: LilyPond text exposes real logic/regression
- ✅ **Quiet runs**: no distracting browser/HTML report windows
- ✅ **Deterministic**: stable locators + auto-wait + snapshot text

### Next Steps

1. Ensure app exposes the test IDs above
2. Convert existing specs to call `openTab`/`readPaneText` where relevant
3. Add a second smoke test for MusicXML (structure) to catch format regressions early
4. Gate heavier suites on passing the LilyPond smoke test

---

## Playwright Testing Workflow (Docker-based)

### Overview
This project uses Playwright for E2E testing, running in Docker containers to ensure consistent cross-browser testing (especially for WebKit/Safari on non-compatible systems).

**⚠️ CRITICAL: Do not open the Playwright HTML report browser window.** Always configure Playwright with `{ open: 'never' }` and rely on test output, logs, and artifacts saved to disk instead. This keeps the CLI experience clean and avoids unexpected browser windows.

### Core Testing Commands

**Local Development:**
- `npm run test:e2e` - Run all tests locally (if environment supports)
- `npm run test:headed` - Run with browser UI visible
- `npm run test:debug` - Run with Playwright Inspector
- `npm run test:ui` - Run with Playwright UI Mode

**Docker Testing:**
- `./scripts/run-tests-docker.sh` - Run all tests in Docker
- `./scripts/run-tests-docker.sh tests/e2e-pw/tests/specific.spec.js` - Run specific test file
- `docker-compose up --build playwright-tests` - Run via docker-compose

**Selective Execution:**
- `npx playwright test --project=chromium` - Single browser
- `npx playwright test --project=webkit` - WebKit only (use Docker on Arch Linux)
- `npx playwright test -g "test name pattern"` - Filter by test name
- `npx playwright test --headed` - See browser UI (local only)

### Best Practices for Claude

#### 1. Docker Image Management
- **Cache awareness**: Rebuild only when Dockerfile/dependencies change
- **Check before rebuild**: Ask user if Docker image needs rebuilding, or check if it exists
- **Layer optimization**: Suggest enabling BuildKit (`DOCKER_BUILDKIT=1`) for faster builds
- **Image tagging**: Consider tagging images with feature/commit for traceability

#### 2. Writing Tests
- **Deterministic waits**: ALWAYS use `waitForSelector()`, `waitForLoadState()`, or `expect()` with auto-waiting
- **Avoid hardcoded timeouts**: Only use `waitForTimeout()` for animations/transitions, not for element loading
- **Use locators properly**: Prefer `page.locator()` or `page.getByTestId()` over `page.$()` for auto-waiting behavior
- **Test isolation**: Each test should be independent and not rely on previous test state
- **Inspector-first**: Prioritize checking inspector tabs (LilyPond, MusicXML, WASM, DocModel) over visual rendering

**Good Pattern:**
```javascript
await page.waitForSelector('#element', { state: 'visible' });
await expect(page.locator('#element')).toBeVisible();

// Even better: use inspector tabs
const ly = await readPaneText(page, 'pane-lilypond');
expect(ly).toContain('\\relative c\'');
```

**Bad Pattern:**
```javascript
await page.waitForTimeout(2000); // ❌ Flaky and slow
```

#### 3. Running Tests Efficiently
- **Single file testing**: When developing a feature, run only the relevant test file
- **Single browser**: Use `--project=chromium` for quick iteration, then test all browsers
- **Parallel execution**: Default is parallel; use `--workers=1` only for debugging
- **Failed tests**: Use `--last-failed` to rerun only previously failed tests
- **Retries**: CI has 2 retries configured; local has 0 (immediate feedback)
- **Smoke test first**: Run `00-lilypond-smoke.spec.js` to catch obvious regressions

#### 4. Debugging Tests
**When tests fail:**
1. Check test output for specific error messages
2. Look for screenshots in `test-results/` or `artifacts/` directory
3. Use `--trace on` for detailed timeline
4. Run specific failing test with `--headed --debug`
5. Check browser console logs (tests should capture these)
6. **Inspect the inspector tabs**: Check if LilyPond/MusicXML output is correct

**Quick debug workflow:**
```bash
# 1. Run failing test with UI
npx playwright test failing-test.spec.js --headed --project=chromium

# 2. If still unclear, use inspector
npx playwright test failing-test.spec.js --debug

# 3. For Docker issues, check logs
docker logs editor-playwright-tests

# 4. Check artifacts
ls -la test-results/
cat artifacts/triage.md  # if it exists
```

#### 5. Test Artifacts
- **Screenshots**: Automatically captured on failure (`screenshot: 'only-on-failure'`)
- **Videos**: Retained on failure (`video: 'retain-on-failure'`)
- **Traces**: Captured on first retry (`trace: 'on-first-retry'`)
- **Snapshots**: Text snapshots for LilyPond/MusicXML output (`.toMatchSnapshot()`)
- **Location**: All in `test-results/` or `artifacts/` directory
- **Reports**: HTML report in `playwright-report/`, view with `npx playwright show-report`
- **Keep it quiet**: Do NOT auto-open HTML reports; save artifacts to disk instead

#### 6. CI/CD Considerations
- **Environment**: Tests run in Docker with `CI=true` environment variable
- **Workers**: Limited to 1 worker in CI for stability
- **Retries**: 2 automatic retries on CI failures
- **Forbid .only**: `forbidOnly: true` in CI prevents accidentally committed focused tests
- **Server**: Dev server starts automatically with 120s timeout

#### 7. Common Issues & Solutions

| Issue | Solution |
|-------|----------|
| "WebKit not supported on Arch" | Use Docker: `./scripts/run-tests-docker.sh` |
| "Test timeout" | Check dev server is running; increase timeout if needed |
| "Element not found" | Use proper waits; check if element exists in DOM; add `data-testid` |
| "Flaky test" | Remove `waitForTimeout()`, use deterministic waits or `expect.poll()` |
| "Docker build slow" | Enable BuildKit; check if rebuild is necessary |
| "Can't see what's happening" | Use `--headed` mode locally or check screenshots/artifacts |
| "LilyPond output empty" | Check if WASM loaded; verify export triggered; inspect console errors |
| "HTML report opened" | Set `{ open: 'never' }` in config reporter |

#### 8. Workflow for New Features

**When Claude implements a new feature:**
1. **Add `data-testid` attributes** to new UI elements during implementation
2. Write test file in `tests/e2e-pw/tests/feature-name.spec.js`
3. **Use inspector helpers**: Import `openTab` and `readPaneText` from `../helpers/inspectors.js`
4. Start with single browser: `npx playwright test new-test.spec.js --project=chromium --headed`
5. Fix issues quickly with immediate visual feedback
6. Remove `--headed` and verify test passes reliably 3+ times
7. **Verify inspector output**: Check LilyPond/MusicXML tabs contain expected output
8. Test all browsers: `npx playwright test new-test.spec.js`
9. If WebKit fails, verify in Docker: `./scripts/run-tests-docker.sh tests/e2e-pw/tests/new-test.spec.js`
10. Run full suite to ensure no regressions: `npm run test:e2e`

#### 9. Performance Optimization
- **Reduce wait times**: Minimize timeout values where possible; use `expect.poll()` for dynamic content
- **Parallel tests**: Default `fullyParallel: true` is good; keep it
- **Reuse server**: `reuseExistingServer: true` in local dev
- **Skip unnecessary browsers**: During development, test one browser first
- **Selective reruns**: Use `--last-failed` after fixing issues
- **Cache Docker images**: Don't rebuild unnecessarily

#### 10. Code Review Checklist
Before marking test work as complete, verify:
- [ ] No hardcoded `waitForTimeout()` except for animations
- [ ] Uses `waitForSelector()`, `expect.poll()`, or auto-waiting `expect()`
- [ ] Test is deterministic (passes 3+ times in a row)
- [ ] Works in all configured browsers (chromium, firefox, webkit)
- [ ] Captures relevant console logs for debugging
- [ ] Has clear test descriptions
- [ ] Follows existing test patterns in codebase
- [ ] Includes proper assertions, not just "no errors"
- [ ] **Uses inspector tabs** for end-to-end verification (LilyPond/MusicXML)
- [ ] **Has `data-testid` attributes** for stable selectors
- [ ] **Text snapshots** used where appropriate (`.toMatchSnapshot()`)
- [ ] **No auto-opening reports**; artifacts saved to disk

### Quick Reference Card

```bash
# Fast iteration (single browser, one test)
npx playwright test my-test.spec.js --project=chromium

# Debug visually
npx playwright test my-test.spec.js --headed --project=chromium

# Run in Docker (WebKit on Arch)
./scripts/run-tests-docker.sh tests/e2e-pw/tests/my-test.spec.js

# Rerun failures
npx playwright test --last-failed

# Full CI simulation
CI=true npx playwright test

# Smoke test (LilyPond fail-fast)
npx playwright test 00-lilypond-smoke.spec.js

# Quiet Docker run with artifacts
docker run --rm -v $(pwd):/work -w /work -e CI=1 \
  mcr.microsoft.com/playwright:v1.48.2-jammy \
  npx playwright test --reporter=list --output=artifacts
```

### Anti-Patterns to Avoid
1. ❌ Rebuilding Docker image unnecessarily
2. ❌ Using `waitForTimeout()` for element loading
3. ❌ Running full suite when debugging one test
4. ❌ Running all browsers during rapid iteration
5. ❌ Ignoring test artifacts (screenshots/videos/traces) when debugging
6. ❌ Not checking if dev server is already running
7. ❌ Using `.only()` in committed code
8. ❌ Writing interdependent tests that must run in sequence
9. ❌ **Auto-opening HTML reports** instead of saving artifacts
10. ❌ **Testing visuals** instead of inspector tab content
11. ❌ **Missing `data-testid` attributes** on interactive elements
12. ❌ **Ignoring LilyPond/MusicXML output** when verifying features

## IMPORTANT: WASM Function Integration Pattern

**⚠️ DO NOT FORGET THIS - It's a waste of time to debug later**

When adding a new WASM function that needs to be called from JavaScript:

### The Pattern
1. ✅ Add `#[wasm_bindgen]` to Rust function
2. ✅ Rebuild WASM: `npm run build-wasm` (generates new `.wasm` + `.js` exports)
3. ⚠️ **CRITICAL: Add the function to the JavaScript wrapper object in `src/js/editor.js`** (lines ~64-101)

### Example - DO NOT SKIP STEP 3
```rust
// src/api/core.rs
#[wasm_bindgen(js_name = generateIRJson)]
pub fn generate_ir_json(document_js: JsValue) -> Result<String, JsValue> {
    // implementation
}
```

The function is now **exported from WASM**, but JavaScript code using `this.wasmModule.generateIRJson()` will **FAIL** unless you add it here:

```javascript
// src/js/editor.js - lines ~64-101
this.wasmModule = {
    // ... other functions
    generateIRJson: wasmModule.generateIRJson  // ⚠️ ADD THIS LINE OR IT WON'T WORK
};
```

### Why This Happens
- `wasm-pack` exports all `#[wasm_bindgen]` functions to the module's public API
- The Editor class wraps WASM functions in `this.wasmModule` for organized access
- If you don't add the function to the wrapper, `this.wasmModule.functionName` will be `undefined`
- JavaScript code checking `typeof this.wasmModule?.functionName === 'function'` will fail silently
- This wastes debugging time - the function exists in WASM but isn't accessible from JS

### Quick Checklist for New WASM Functions
- [ ] Function works in Rust tests (`cargo test`)
- [ ] Added `#[wasm_bindgen]` decorator
- [ ] Ran `npm run build-wasm` successfully
- [ ] **Added to `this.wasmModule` object in `src/js/editor.js`** ← REQUIRED
- [ ] JavaScript code calls `this.wasmModule.functionName()`
- [ ] Tested in browser with hard refresh (Ctrl+Shift+R)

## ⚠️ CRITICAL: Feature Completion Criteria

**DO NOT CLAIM A FEATURE IS COMPLETE UNLESS:**

1. ✅ **E2E tests PASS** - Run the relevant Playwright test and verify it passes
2. ✅ **NO console errors** - Check browser console in test output for [BROWSER] ERROR or [PAGE ERROR] messages
3. ✅ **NO compiler warnings** - `npm run build-wasm` should complete with zero warnings
4. ✅ **Inspector tabs show correct output** - Verify MusicXML, LilyPond, etc. display expected content
5. ✅ **Manual browser testing** - Open the app at http://localhost:8080 and test the feature manually

**Why This Matters:**
- Unit tests passing ≠ feature working end-to-end
- Compiler warnings hide real issues (unused imports can mask broken code paths)
- Console errors compound and make debugging harder later
- Silent failures (undefined returns, missing WASM exports) are hardest to debug

**Example Failure Pattern (That Happened):**
- ✗ Changed `createNewDocument()` return type from `Result<JsValue>` to `Result<()>`
- ✗ Rust compiled fine (no type errors at call sites)
- ✓ WASM built successfully
- ✗ BUT: JavaScript received `undefined`, causing app initialization to fail
- 🔍 Root cause: Forgot that JavaScript code expects the function to return a value

**Always run:**
```bash
# 1. Build WASM and check for warnings
npm run build-wasm

# 2. Run E2E tests
npx playwright test tests/e2e-pw/tests/your-feature.spec.js --project=chromium

# 3. Check for console errors in test output
# Look for: [BROWSER] ERROR or [PAGE ERROR]

# 4. Manual test in browser
# Visit http://localhost:8080 and test the feature
```

<!-- MANUAL ADDITIONS END -->
