# Music Notation Editor - Quick Reference Guide

## Key File Locations

| Component | Path | Lines | Purpose |
|-----------|------|-------|---------|
| Main HTML | `/home/john/editor/index.html` | 506 | Single-page app template |
| App Entry | `/home/john/editor/src/js/main.js` | 476 | App initialization & MIDI setup |
| WASM API | `/home/john/editor/src/api.rs` | 1046 | JavaScript-facing Rust functions |
| Lilypond Renderer | `/home/john/editor/src/js/lilypond-renderer.js` | 150 | API client for rendering |
| Lilypond Tab | `/home/john/editor/src/js/lilypond-png-tab.js` | 491 | PNG/SVG display component |
| Service Server | `/home/john/editor/lilypond-service/server.js` | 406 | LilyPond rendering service |
| Docker Config | `/home/john/editor/lilypond-service/docker-compose.yaml` | 63 | Service orchestration |
| Build Script | `/home/john/editor/Makefile` | 267 | Build & deploy automation |

---

## Core API Functions (WASM)

### Character Operations
```javascript
wasmModule.insertCharacter(cells, char, cursorPos, pitchSystem)
  → { cells, newCursorPos }

wasmModule.deleteCharacter(cells, cursorPos)
  → Array<Cell>

wasmModule.parseText(text, pitchSystem)
  → Array<Cell>
```

### Notation Operations
```javascript
wasmModule.applyOctave(cells, start, end, octave)
  → Array<Cell>

wasmModule.applySlur(cells, start, end)
  → Array<Cell>

wasmModule.removeSlur(cells, start, end)
  → Array<Cell>
```

### Export Operations
```javascript
wasmModule.exportMusicXML(document)
  → String (MusicXML 3.1)

wasmModule.convertMusicXMLToLilyPond(musicxml, settings)
  → { lilypond_source: String, skipped_elements: Array }

wasmModule.computeLayout(document, config)
  → DisplayList
```

---

## External API Endpoints

### WebUI → Backend (JSON)
**Endpoint**: `POST /api/lilypond/render`
**Status**: MISSING - Needs implementation

```javascript
Request: {
  lilypond_source: "...",
  template_variant: "minimal" | "full",
  output_format: "svg" | "png"
}

Response: {
  success: boolean,
  svg?: string,
  png_base64?: string,
  format: string,
  error?: string
}
```

### Backend → LilyPond Service (Binary)
**Endpoint**: `POST http://localhost:8787/engrave`
**Status**: IMPLEMENTED

```bash
curl -X POST http://localhost:8787/engrave \
  -H "Content-Type: application/json" \
  -d '{"ly":"\\version \"2.24.0\"\n...","format":"svg"}'

# Returns: Binary SVG or PDF
```

---

## Data Models

### Cell
```rust
struct Cell {
  char: String,
  kind: ElementKind,           // PitchedElement, Text, etc.
  continuation: bool,          // Multi-char glyph?
  col: usize,
  pitch_code: Option<PitchCode>, // Musical pitch
  pitch_system: Option<PitchSystem>,
  octave: i8,
  slur_indicator: SlurIndicator,
  x, y, w, h: f64,
  bbox, hit: (f64, f64, f64, f64),
}
```

### Document
```rust
struct Document {
  title: Option<String>,
  composer: Option<String>,
  pitch_system: Option<PitchSystem>,
  lines: Vec<Line>,
}
```

### PitchSystem
```rust
enum PitchSystem {
  Unknown,
  Number,        // 1-7
  Western,       // C-B
  Sargam,        // Sa-Ni
  Bhatkhande,    // 1-7 with diacritics
  Tabla,         // Percussion patterns
}
```

---

## Build Commands

```bash
# Development
make build              # Full build (WASM + JS + CSS)
make serve             # Dev server with hot reload
make clean             # Clean artifacts

# Production
make build-prod        # Optimized production build
make serve-prod        # Serve production

# LilyPond Service
make lilypond-start    # Start Docker service (port 8787)
make lilypond-stop     # Stop service
make lilypond-health   # Check health
make lilypond-test     # Test rendering
```

---

## Directory Tree - Source Structure

```
/home/john/editor/
├── index.html                    # Entry point
├── src/
│   ├── js/                       # 25 JavaScript files
│   │   ├── main.js              # App initialization
│   │   ├── editor.js            # Core editor
│   │   ├── lilypond-renderer.js # API client
│   │   ├── lilypond-png-tab.js  # Render display
│   │   └── ... (22 more files)
│   ├── api.rs                    # WASM API (1046 lines)
│   ├── lib.rs                    # Crate root
│   ├── models/                   # Data structures
│   ├── parse/                    # Grammar & parsing
│   ├── converters/
│   │   └── musicxml/
│   │       └── musicxml_to_lilypond/
│   │           ├── converter.rs
│   │           ├── parser.rs
│   │           ├── lilypond.rs
│   │           └── templates/
│   └── renderers/                # Layout & rendering
├── dist/                         # Build output
│   ├── main.js
│   ├── main.css
│   └── pkg/                      # WASM output
├── lilypond-service/             # Docker service
│   ├── server.js
│   ├── Dockerfile
│   └── docker-compose.yaml
├── Makefile                      # 267 lines
├── Cargo.toml                    # Rust config
└── package.json                  # Node config
```

---

## UI Components & Tabs

| Tab | File | Purpose |
|-----|------|---------|
| Staff Notation | osmd-renderer.js | OSMD integration + MIDI controls |
| MusicXML | (inline) | Display exported MusicXML |
| LilyPond Src | lilypond-tab.js | Display LilyPond source code |
| LilyPond PNG | lilypond-png-tab.js | Display rendered SVG/PNG |
| Ephemeral Model | (inline) | Full document JSON with state |
| Persistent Model | (inline) | Saveable document JSON |
| Console Errors | logger.js | Error log display |
| Console Log | logger.js | Debug log display |
| HTML | (inline) | Rendered HTML structure |

---

## Keyboard Shortcuts

| Keys | Action |
|------|--------|
| Alt+S | Apply slur to selection |
| Alt+U | Upper octave |
| Alt+M | Middle octave |
| Alt+L | Lower octave |
| Alt+T | Set tala (implied) |

---

## Pitch Systems & Values

### Number System (1-7)
- 1, 2, 3, 4, 5, 6, 7 map to Do, Re, Mi, Fa, Sol, La, Ti
- Accidentals: `#` (sharp), `b` (flat)
- Example: `1#`, `2b`

### Western System (C-B)
- C, D, E, F, G, A, B standard notation
- Accidentals: `#` (sharp), `b` (flat)
- Octave modifiers: `-1` (lower), `0` (middle), `1` (upper)

### Sargam System
- Sa, Re, Ga, Ma, Pa, Dha, Ni (traditional Indian)
- Similar accidental support

---

## Security Features (LilyPond Service)

### Input Validation
- Blocks `\include` directives
- Blocks Scheme expressions `#(...)`
- Blocks system calls
- Blocks external URLs
- Max size: 512 KB
- Timeout: 15 seconds

### Container Security
- Read-only root filesystem
- Non-root execution (UID 10001)
- Resource limits: 1 CPU, 512MB RAM
- Health check every 30 seconds
- tmpfs /tmp with 64MB limit

### Response Security
- Cache headers: 1-year immutable
- Content-Type validation
- NoSniff headers
- SHA-256 hash-based caching

---

## Performance Characteristics

### Debouncing
- In-tab LilyPond rendering: 2 seconds
- Manual refresh: Immediate (renderNow)
- Duplicate detection: Skip if source unchanged

### Caching
- Service-level SHA-256 caching
- Cache location: `/tmp/lilypond-cache`
- 1-year immutable cache headers
- Work directory: `/tmp/lilypond-work`

### Rendering
- Timeout: 15 seconds
- Max request size: 512 KB
- Output formats: SVG, PNG (via /engrave endpoint)

---

## Troubleshooting

### LilyPond Service Not Responding
```bash
# Check if service is running
curl http://localhost:8787/health

# Check logs
make lilypond-logs

# Restart service
make lilypond-stop
make lilypond-start
```

### No Rendering Output
1. Check `/api/lilypond/render` backend exists
2. Verify lilypond-service is running on port 8787
3. Check browser console for fetch errors
4. Verify LilyPond source is valid (check lilypond-src tab)

### Build Failures
```bash
# Clean and rebuild
make clean
make build

# Check specific component
make build-wasm    # WASM only
make build-js      # JS only
make build-css     # CSS only
```

---

## Critical Implementation Gap

**Missing Component**: Backend server at `/api/lilypond/render`

**Impact**: LilyPond rendering (PNG/SVG) does not work

**Solution Required**: Create endpoint that:
1. Receives JSON: `{ lilypond_source, template_variant, output_format }`
2. Calls lilypond-service `/engrave` at localhost:8787
3. Converts binary response to JSON base64
4. Returns: `{ success: true, svg/png_base64, format }`

**Current State**:
- Client-side code: READY (lilypond-renderer.js)
- Service (lilypond-service): READY (server.js, /engrave)
- Backend bridge: MISSING

---

## Dependencies Summary

### WASM/Rust
- wasm-bindgen 0.2.92
- roxmltree 0.19
- mustache 0.9
- serde, serde_json

### JavaScript
- rollup 4.14.0
- unocss 66.5.3
- osmd-audio-player 0.7.0

### LilyPond Service
- express 4.18.2
- debian:stable-slim (Docker)
- lilypond binary

---

## Quick Links

- HTML Entry: `/home/john/editor/index.html`
- Main App: `/home/john/editor/src/js/main.js`
- WASM API: `/home/john/editor/src/api.rs`
- Service: `/home/john/editor/lilypond-service/server.js`
- Documentation: `/home/john/editor/CODEBASE_EXPLORATION.md`
- Architecture: `/home/john/editor/ARCHITECTURE_DIAGRAM.md`

