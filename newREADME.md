# Music Notation Editor

A **text-first music notation editor** where pitches are text characters and rhythm is counted in subdivisions. Built with Rust WebAssembly for core logic and JavaScript for the UI.

![Status](https://img.shields.io/badge/status-feature--complete-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)
![Rust](https://img.shields.io/badge/rust-1.75%2B-orange)
![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)

## What Makes This Different

### 1. Subdivision-Based Rhythmic Notation
**Like counting "1-ee-and-a, 2-ee-and-a"—each character is a subdivision.** Duration = how many subdivisions a note occupies.

```
Traditional:  ♪ ♫ ♪        (durations: 1/4, 1/8, 1/4 - power-of-2)
This editor:  S--r  g-m    (like: "1-ee-and, a-2-and")
               ↑↑↑↑  ↑↑↑
```

- `S--r` = S on "1-ee-and" (3 subdivisions), r on "a" (1 subdivision)
- `g-m` = g on "1-and" (2 subdivisions), m on "a" (1 subdivision)
- `--` at start of beat extends previous note (ties across beat boundaries)
- Spaces = beat boundaries, `|` = barlines

See [RHYTHM.md](RHYTHM.md) for the complete subdivision-based rhythm system.

### 2. Multi-Cultural Pitch Systems
Not just Western C-D-E-F-G-A-B. Full support for:

- **Number** (1-7): East Asian systems, simplified pedagogy
- **Western** (C-B, c-b): Standard Western notation
- **Sargam** (S r R g G m M P d D n N): Hindustani classical
- **Doremi** (do-re-mi-fa-sol-la-ti): Solfège systems
- **Bhatkhande** (Sa re Re ga Ga ma Ma Pa dha Dha ni Ni): Hindustani notation standard
- **Tabla** (bols for rhythm notation)

Each system has **native accidentals and octave notation**. No forced Western translation.

### 3. Text-First Layered Architecture
Musical meaning is **derived from text**, not stored separately:

```
Layer 0: Text Buffer (source of truth)
    ↓
Layer 1: Glyph Semantics (char → musical meaning via lookup tables)
    ↓
Layer 2: Musical Structure (beats, measures, phrases)
    ↓
Layer 3: Export (IR → MusicXML → LilyPond/MIDI)
```

**Benefits:**
- Undo is simple text edits (no complex cell snapshot chains)
- Switch pitch systems instantly (just re-derive glyphs from text)
- Smaller memory footprint (don't store cells, generate on demand)
- No sync bugs (text is the only source of truth)

### 4. Custom NotationFont
Built on **Noto Sans** with music glyphs in the Unicode Private Use Area:
- 47 base characters (all pitch systems)
- 188 octave variants (dots above/below)
- 47 sharp accidentals
- Musical symbols (barlines, ornaments)
- Single font file, all systems (~473 KB)

**Source of truth:** `tools/fontgen/atoms.yaml` → build-time code generation → Rust constants + JavaScript config.

## Quick Start

### Prerequisites

```bash
# Check dependencies
make verify-deps

# Required: Node.js 18+, Rust 1.75+, Python 3.8+
# Optional: Docker (for LilyPond export, cross-browser testing)
```

See [DEPENDENCIES.md](DEPENDENCIES.md) for detailed installation.

### Installation

```bash
git clone https://github.com/rothfield/editor.git
cd editor
make setup    # Install all dependencies
make serve    # Start dev server with hot reload
```

Open `http://localhost:8080` and start composing.

## Development

### Essential Commands

```bash
make serve              # Dev server with hot reload
make build              # Full build (WASM + JS + CSS)
make build-wasm-fast    # Quick WASM rebuild (~0.3s)
make test               # Run all tests
make test-e2e           # E2E tests with Playwright
```

### Build Profiles

| Command | Time | Use Case |
|---------|------|----------|
| `make build-wasm-fast` | ~0.3s | Rapid iteration (skips wasm-opt) |
| `make build` | ~17s | Development (with basic optimization) |
| `make build-prod` | ~25s | Production (maximum optimization) |

### Architecture: WASM-First Philosophy

**Core principle:** Business logic lives in Rust (WASM), JavaScript is UI glue only.

**✅ WASM (Rust):**
- Document model, text editing, cursor/selection
- Musical structure analysis, rhythm processing
- Export pipeline (IR, MusicXML, LilyPond, MIDI)
- Undo/redo, clipboard preparation
- All deterministic, testable logic

**✅ JavaScript:**
- Browser events (keyboard, mouse, IME)
- Platform APIs (Clipboard, File, focus/blur)
- DOM rendering (minimal diffs from WASM)
- UI components (inspector tabs, dialogs)

See [CLAUDE.md](CLAUDE.md) for detailed development guidelines.

## Export Pipeline

The editor uses a **three-layer export architecture**:

```
Document (Cell-based)
    ↓
IR (format-agnostic intermediate representation)
    ↓
MusicXML (standard interchange format)
    ↓
    ├→ LilyPond (high-quality engraving)
    ├→ MIDI (audio playback)
    └→ OSMD (browser rendering)
```

**Why IR?** Add new musical features once (in IR), get them in all export formats automatically.

**Locations:**
- `src/ir/` - IR types and builder (FSM-based rhythm analysis)
- `src/renderers/musicxml/` - MusicXML emitter
- `src/converters/musicxml/musicxml_to_lilypond/` - LilyPond converter
- `src/converters/musicxml/musicxml_to_midi/` - MIDI converter

## Project Structure

```
editor/
├── src/
│   ├── api/              # WASM API bindings (exposed to JavaScript)
│   ├── models/           # Core data structures (Document, Cell, PitchCode)
│   ├── text/             # Layer 0: Text buffer, cursor, annotations
│   ├── parse/            # Tokenization, pitch system parsers
│   ├── structure/        # Layer 2: Musical structure analysis
│   ├── ir/               # Intermediate representation for export
│   ├── renderers/        # Format emitters (MusicXML, MIDI, layout)
│   ├── converters/       # MusicXML → LilyPond, MusicXML → MIDI
│   ├── html_layout/      # SVG/DOM rendering logic
│   ├── undo/             # Undo/redo system
│   ├── utils/            # Utilities (pitch helpers, performance)
│   ├── js/               # JavaScript UI layer
│   │   ├── editor.js     # Main editor class (WASM bridge)
│   │   ├── ui.js         # UI components (inspector, dialogs)
│   │   ├── handlers/     # Event handlers (keyboard, mouse)
│   │   └── core/         # WASM bridge (TypeScript)
│   └── css/              # Stylesheets (UnoCSS)
├── tools/fontgen/        # Font generation (atoms.yaml → NotationFont.ttf)
├── tests/e2e-pw/         # Playwright E2E tests
├── build.rs              # Build-time code generation (font constants)
├── Cargo.toml            # Rust dependencies
├── package.json          # Node dependencies
└── Makefile              # Primary build interface
```

## Testing

### Philosophy: Inspector-First, Fail-Fast

**Don't test pixels.** Test semantic meaning via inspector tabs:

1. **LilyPond tab** — easiest end-to-end truth (export reflects editor state)
2. **MusicXML tab** — structural soundness (measures, ties, tuplets)
3. **Display List tab** — WASM DOM layout (ordering, caret/bbox presence)
4. **Document Model tab** — logical tokens/beats/column alignment

**Fail fast if LilyPond panel is empty or incorrect.** Run smoke test first:

```bash
npx playwright test 00-lilypond-smoke.spec.js  # Catches 80% of regressions
npm run test:e2e                                # Full suite
```

### Running Tests

```bash
make test                           # All tests (Rust + E2E)
make test-e2e                       # E2E with browser UI
npx playwright test --headed        # Visual debugging
npx playwright test --project=chromium  # Single browser
./scripts/run-tests-docker.sh      # Cross-browser (WebKit on Arch)
```

### Test Helpers

All E2E tests use **inspector helpers** for deterministic assertions:

```javascript
import { openTab, readPaneText } from '../helpers/inspectors.js';

// Example: Verify LilyPond export reflects typed input
await openTab(page, 'tab-lilypond');
const ly = await readPaneText(page, 'pane-lilypond');
expect(ly).toContain('\\relative c\'');
expect(ly).toMatchSnapshot('feature.ly.txt');
```

See [CLAUDE.md](CLAUDE.md) "Inspector-First Testing" section for the complete playbook.

## Font System Verification

**⚠️ CRITICAL:** Any font changes require visual verification via the **Font Test** tab.

```bash
npm run dev    # Start server
# Navigate to Inspector → Font Test tab
# Click through: Show All, Sharp Accidentals, Octave Variants, Barlines
# Visually verify glyphs render correctly
```

**Test pages for each pitch system:**
- `number.html` - Number system (1-7)
- `sargam.html` - Sargam system (S, r, R, g, G, m, M, P, d, D, n, N)
- `western.html` - Western system (C-D-E-F-G-A-B)
- `glyphs.html` - All glyphs (verification page)

**Font build process:**
1. Edit `tools/fontgen/atoms.yaml` (single source of truth)
2. Run `make fonts` (generates `static/fonts/NotationFont.ttf`)
3. `build.rs` generates Rust constants at compile time
4. JavaScript loads config via `getFontConfig()` from WASM
5. Verify glyphs in Font Test tab

## Design Philosophy

### "Honor the Page, Don't Force the Score"

Most notation software assumes you're typesetting a final, metrically-valid score. It forces exact durations, bar math, and Western classical encoding immediately.

**Real working notation doesn't look like that.**

Handwritten practice sheets, raga phrases, baroque embellishments, jazz scoops—they're informal and expressive:
- Notes in sequence, rhythm implied by style
- Tiny grace notes drawn before/after/above
- Slurs from "here to there" with no ceremony
- Tala marks that are suggestive, not enforced

**That "messy but clear to musicians" state is valid music.** This editor treats it as first-class, not "garbage to be fixed."

### Token-Based Model

A line of music is **a flat ordered list of typed tokens**, not a tree:

- `note`: Main pitch (e.g., `S`, `r`, `3b`)
- `ornament`: Pitched ornament with explicit pitch, position indicators
- `ornamentSymbol`: Non-pitched mark (e.g., `tr` for trill)
- `slur-begin`, `slur-end`: Literal markers for slur spans
- Structural markers: barlines, dashes, breath marks

**Key principles:**
1. Tokens are semantically typed at entry (no guessing later)
2. No over-specification (no forced rhythm quantization during editing)
3. Attachment is computed at render/export time (ornaments don't "belong" to tokens)
4. Rendering/export are deterministic transforms (token stream → visual/MusicXML)

See `specs/006-music-notation-ornament/spec.md` for ornament design philosophy.

## Documentation

- **[CLAUDE.md](CLAUDE.md)** - Development guidelines (WASM-first, testing workflow, integration patterns)
- **[RHYTHM.md](RHYTHM.md)** - Subdivision-based rhythm system (dash processing, tuplet generation)
- **[DEPENDENCIES.md](DEPENDENCIES.md)** - Detailed dependency installation
- **[BUILD_OPTIMIZATION_GUIDE.md](BUILD_OPTIMIZATION_GUIDE.md)** - Build system internals
- **Font System:**
  - `tools/fontgen/atoms.yaml` - Single source of truth for all code points
  - `FONT_MIGRATION_NOTO_MUSIC.md` - Migration guide
  - `FONT_ARCHITECTURE_NOTO.md` - Technical deep-dive

## Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/name`)
3. Make changes following [CLAUDE.md](CLAUDE.md) guidelines
4. Run tests (`make test`)
5. Commit and push
6. Open Pull Request

**Before submitting:**
```bash
make pre-commit    # Lint, type-check, test
```

## Roadmap

**Current Status:** Near feature-complete. Core editing, export pipeline, multi-system support working.

**Future Enhancements:**
- [ ] **Text-first migration:** Complete transition from Cell storage to text-as-truth
- [ ] **Reverse glyph lookup:** `pitch_from_glyph(char) → (PitchCode, octave)`
- [ ] **Advanced tuplets:** Nested tuplets, polyrhythms
- [ ] **Metric modulation:** Tempo relationships, complex meter changes
- [ ] **Microtonal support:** Non-12-TET pitch systems
- [ ] **Collaborative editing:** CRDT-based real-time collaboration
- [ ] **Mobile support:** Touch-optimized UI

## License

MIT License - see [LICENSE](LICENSE) for details.

## Support

- **Issues:** [github.com/rothfield/editor/issues](https://github.com/rothfield/editor/issues)
- **Repository:** [github.com/rothfield/editor](https://github.com/rothfield/editor)

## Acknowledgments

- [Noto Fonts](https://github.com/notofonts) - Font foundation (Noto Sans + Noto Music)
- [OpenSheetMusicDisplay](https://github.com/opensheetmusicdisplay/opensheetmusicdisplay) - MusicXML rendering
- [LilyPond](https://lilypond.org) - High-quality music engraving
- Rust and WebAssembly communities
- Contributors and testers

---

**Built for musicians who think in pitches and time, not in Western notation rules.**
