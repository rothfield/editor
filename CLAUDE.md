# editor Development Guidelines

Auto-generated from all feature plans. Last updated: 2025-12-08

---

## ⚠️ **PRIME DIRECTIVE: WASM-FIRST ARCHITECTURE** ⚠️

**STOP AND ASK:** "Does this code belong in JavaScript or WASM?"

**Default: WASM (Rust).** Only platform I/O and UI glue belongs in JavaScript.

**✅ WASM (Rust):** Document model, text/selection ops, state management, undo/redo, clipboard prep, all business logic
**✅ JavaScript:** Browser events, Platform APIs, DOM rendering, UI components

**Interface:** JS sends commands (`insert_text`, `backspace`) → WASM returns data (`CaretInfo`, `DocDiff`)

**Before writing JS:** Check `src/api/` for existing WASM function, verify it's in `WASMBridge.ts` `functionNames` array

---

## Active Technologies
- Rust 1.75+ (WASM), JavaScript ES2022+, wasm-bindgen 0.2.92, OSMD 1.7.6, serde, quick-xml, mustache

## Commands
`cargo test` | `cargo clippy` | `npm run build-wasm` | `npx playwright test`

## Testing Conventions

**Use Number System (1-7) for all test input.** Examples: `1 2 3`, `| 1--2 -- 3 4 |`

**Debug logging:** Write E2E tests to capture logs, don't ask user to check browser console.

## Rhythmic Notation Reference
See **[@RHYTHM.md](RHYTHM.md)** for spatial rhythm, beat grouping, tuplets.

**CRITICAL:** Spaces create beat boundaries. Each beat = 1/1 (quarter note in 4/4).
- `1'---` → ONE beat: note (1/4) + rest (3/4)
- `1 '---` → TWO beats: quarter + quarter

## Music Notation Font System

**NotationFont** = Noto Sans + music glyphs in PUA. Source: `tools/fontgen/atoms.yaml`

**Architecture:** atoms.yaml → build.rs generates Rust constants → JS loads via `getFontConfig()`

**Glyph Coverage:**
- 33 base characters (Number 1234567, Western CDEFGAB, Sargam SrRgGmMPdDnN, Doremi drmfslt)
- Octave variants (dots above/below)
- Accidentals (sharp, flat, double-sharp, double-flat, half-flat, natural)
- Musical symbols (barlines, ornaments)

**PUA Allocation:**
```
0xE000-0xE6FF: Note variants (pitch + octave + accidental)
0xE800-0xE8FF: Underline variants (beat grouping)
0xE900-0xE9FF: Overline variants (slurs)
0xEA00-0xEBFF: Combined underline + overline
0xF8000+:      Superscript variants (grace notes, 16 line variants each)
```

**Note:** Even though 50,000+ codepoints seems excessive, they form the **input alphabet** for parsing. Pitched codepoints encode pitch + octave + accidental + line variant. Non-pitch elements (barlines, whitespace, breath marks, dashes) are also part of the alphabet with semantic significance. See `src/parse/GRAMMAR.md` for the formal grammar.

**Formula:** `codepoint = PUA_START + (char_index × CHARS_PER_VARIANT) + variant_index`

**Verify font changes:** Run app → Font Test tab → check all variants render correctly

**Related:** `tools/fontgen/generate.py`, `src/renderers/font_utils.rs`, `FONT_ARCHITECTURE_NOTO.md`

### Underlined Variants for Beat Grouping

Notes subdividing a beat show continuous underlines via GSUB ligatures:
- `char + U+0332` → underlined variant
- Adjacent underlines connect seamlessly

### Layered Text-First Design

```
Layer 0: Text Buffer (source of truth)
Layer 1: Glyph Semantics (char ↔ pitch lookup tables)
Layer 2: Musical Structure (beats, measures - computed on demand)
Layer 3: Export (IR → MusicXML → LilyPond/OSMD)
```

**Key:** `(PitchCode, octave) → char` via direct lookup. Cells are views, not storage.

**Cell.char:** Holds the display glyph directly, including line variants (underline/overline) as PUA codepoints. No separate `combined_char` field - variants are encoded in `cell.char` itself.

**Design Principles:**
1. All stateful ops go through Layer 0 (text buffer)
2. Layers 1-2 are pure functions
3. Migration: additive, not destructive

## Export Architecture

```
Document → IR (src/ir/) → MusicXML (src/renderers/musicxml/) → LilyPond/OSMD
```

**IR:** `src/ir/types.rs` (definitions), `src/ir/builder.rs` (FSM conversion)

**Adding features:** Cell model → IR types → builder.rs FSM → MusicXML emitter → test end-to-end

<!-- MANUAL ADDITIONS START -->

## Playwright Testing

**Core principle:** Use inspector tabs (LilyPond, MusicXML, DocModel) as ground truth. No `waitForTimeout()`.

**Commands:**
```bash
npx playwright test my-test.spec.js --project=chromium  # Fast iteration
npx playwright test my-test.spec.js --headed            # Debug visually
./scripts/run-tests-docker.sh tests/e2e-pw/tests/x.js   # WebKit on Arch
npx playwright test --last-failed                       # Rerun failures
```

**Config:** `{ open: 'never' }` for HTML reports. Artifacts in `test-results/`.

**Writing tests:**
- Use `page.getByTestId()`, `expect.poll()`, auto-waiting `expect()`
- Import `openTab`, `readPaneText` from `tests/helpers/inspectors.js`
- Verify LilyPond/MusicXML output, not just visuals
- Add `data-testid` attributes to new UI elements

**Common Issues:**
| Issue | Solution |
|-------|----------|
| WebKit fails on Arch | Use Docker: `./scripts/run-tests-docker.sh` |
| Flaky test | Remove `waitForTimeout()`, use `expect.poll()` |
| Element not found | Add `data-testid`, use proper waits |
| LilyPond empty | Check WASM loaded, verify export triggered |

**Workflow for new features:**
1. Add `data-testid` attributes during implementation
2. Write test in `tests/e2e-pw/tests/`
3. Start with `--project=chromium --headed`
4. Verify inspector output
5. Test all browsers, then Docker for WebKit

## WASM Function Integration

**⚠️ DO NOT FORGET - wastes time to debug later**

**Checklist for new WASM functions:**
1. Add `#[wasm_bindgen]` in `src/api/`
2. `npm run build-wasm`
3. Add to `functionNames` array in `src/js/core/WASMBridge.ts`
4. Add stub declaration in `WASMBridge.ts`
5. Add to `WASMModule` interface in `src/types/wasm-module.ts`
6. If document-mutating: add to `documentMutatingFunctions` array
7. Test in browser with hard refresh (Ctrl+Shift+R)

## Feature Completion Criteria

**DO NOT CLAIM COMPLETE UNLESS:**
1. ✅ E2E tests pass
2. ✅ No console errors ([BROWSER] ERROR / [PAGE ERROR])
3. ✅ No compiler warnings
4. ✅ Inspector tabs show correct output
5. ✅ Manual browser test at http://localhost:8080

**Why:** Unit tests passing ≠ feature working end-to-end. Silent failures (undefined returns, missing WASM exports) are hardest to debug.

## JavaScript Architecture

```
src/js/
├── editor.ts              # Main orchestrator
├── core/WASMBridge.ts     # Type-safe WASM wrapper with error handling
├── coordinators/
│   ├── CursorCoordinator.ts
│   ├── SelectionCoordinator.js
│   ├── ClipboardCoordinator.js
│   ├── RenderCoordinator.js
│   ├── InspectorCoordinator.js
│   └── MusicalCoordinator.js
├── handlers/
│   ├── KeyboardHandler.js
│   └── MouseHandler.js
└── managers/ExportManager.js
```

**TypeScript files:** `editor.ts`, `WASMBridge.ts`, `CursorCoordinator.ts`, `src/types/wasm-module.ts`, `src/types/wasm.ts`

## Tonic and Transposition

**Tonic** (reference pitch, "1" or "Sa") ≠ **Key Signature** (staff accidentals). They're independent.

```
src/transposition/
├── degree_transpose.rs   # Scale-aware pitch mapping
├── to_western_pitch.rs   # (degree, tonic) → Western pitch
├── lookup_table.rs       # Pitch normalization
└── reference_table.rs    # Reference tables for all tonics

src/models/
├── tonic.rs              # Tonic enum (17 pitches)
└── western_pitch.rs      # WesternPitch for MusicXML
```

See `TONIC_KEY_SIGNATURE_RESEARCH.md` for design rationale.

## Text Layer (src/text/)

- `buffer.rs` - Line-based storage (insert, delete, get_line, set_line)
- `cursor.rs` - TextPos { line, col }, TextRange { start, end }
- `annotations.rs` - Superscripts, slurs; auto-track position changes on edits

**Annotation tracking:** `on_insert()`, `on_delete()`, `on_replace()` shift positions automatically.

## Line Variants (src/renderers/line_variants.rs)

Underline (beat grouping): None, Middle, Left, Right, Both
Overline (slurs): None, Middle, Left, Right
Combined: 5 × 4 = 20 variants (19 excluding None/None)

**Superscripts:** `SuperscriptLineVariant` enum (0-15) for superscript decorations
```rust
None = 0,
UnderlineLeft = 1, UnderlineMiddle = 2, UnderlineRight = 3,
OverlineLeft = 4, OverlineMiddle = 5, OverlineRight = 6,
// Combined variants 7-15...
```

## Undo System (src/undo/mod.rs)

Command pattern: InsertText, DeleteText, Batch. Max history: 100.

**Batching breaks on:**
- Operation type change
- Cursor position jump
- Whitespace character

**Note:** Time-based batching disabled (WASM doesn't support `SystemTime::now()`).

<!-- MANUAL ADDITIONS END -->
