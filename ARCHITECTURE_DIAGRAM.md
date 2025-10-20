# Architecture Diagram - Music Notation Editor

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Web Browser (Client)                             │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                        index.html                                │  │
│  │  ┌─────────────────┬──────────────────┬─────────────────────┐   │  │
│  │  │  Menu Bar       │  Main Editor     │  Debug Sidebar      │   │  │
│  │  │  File/Edit/Line │  #notation-      │  9 Tab Panels:      │   │  │
│  │  │  Menus          │  editor          │  - Staff Notation   │   │  │
│  │  │                 │                  │  - MusicXML         │   │  │
│  │  │                 │  Input Handler   │  - LilyPond Src     │   │  │
│  │  │                 │  ↓ (keyboard)    │  - LilyPond PNG     │   │  │
│  │  │                 │                  │  - Ephemeral Model  │   │  │
│  │  │                 │ Cursor Position  │  - Persistent Model │   │  │
│  │  │                 │ Selection        │  - Console Errors   │   │  │
│  │  │                 │                  │  - Console Log      │   │  │
│  │  │                 │ MIDI Controls    │  - HTML             │   │  │
│  │  └─────────────────┴──────────────────┴─────────────────────┘   │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                  ↓                                      │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                    JavaScript/TypeScript Layer                   │  │
│  │                                                                  │  │
│  │  src/js/ (25 files total)                                       │  │
│  │  ┌──────────────────────────────────────────────────────────┐  │  │
│  │  │ main.js                        - App initialization     │  │  │
│  │  │ editor.js                      - Document state mgmt    │  │  │
│  │  │ keyboard-handler.js            - Input processing       │  │  │
│  │  │ ui.js                          - Tab management         │  │  │
│  │  │ lilypond-renderer.js           - API to /api/lilypond   │  │  │
│  │  │ lilypond-tab.js                - Source display         │  │  │
│  │  │ lilypond-png-tab.js            - Rendered output        │  │  │
│  │  │ osmd-renderer.js               - Staff notation         │  │  │
│  │  │ midi-player.js                 - Audio playback         │  │  │
│  │  └──────────────────────────────────────────────────────────┘  │  │
│  │                           ↓                                    │  │
│  │  ┌──────────────────────────────────────────────────────────┐  │  │
│  │  │        WASM Module (editor_wasm)                         │  │  │
│  │  │        dist/pkg/editor_wasm.js + .wasm                  │  │  │
│  │  │                                                          │  │  │
│  │  │  Rust API Functions (src/api.rs):                       │  │  │
│  │  │  • insertCharacter()                                    │  │  │
│  │  │  • deleteCharacter()                                    │  │  │
│  │  │  • parseText()                                          │  │  │
│  │  │  • applyOctave()                                        │  │  │
│  │  │  • applySlur()                                          │  │  │
│  │  │  • exportMusicXML()                                     │  │  │
│  │  │  • convertMusicXMLToLilyPond()                          │  │  │
│  │  │  • computeLayout()                                      │  │  │
│  │  └──────────────────────────────────────────────────────────┘  │  │
│  │                           ↓                                    │  │
│  │  ┌──────────────────────────────────────────────────────────┐  │  │
│  │  │     Rust Core Logic (src/)                              │  │  │
│  │  │                                                          │  │  │
│  │  │  • models/          - Cell, Document, Line structures  │  │  │
│  │  │  • parse/           - Grammar & parsing                │  │  │
│  │  │  • converters/      - MusicXML conversion              │  │  │
│  │  │    └─ musicxml/     - MusicXML to LilyPond             │  │  │
│  │  │  • renderers/       - Layout engine, SVG, Music XML    │  │  │
│  │  └──────────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                  │
                    fetch POST /api/lilypond/render
                         { lilypond_source, ... }
                                  │
                                  ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                      Backend (MISSING LINK)                             │
│                                                                          │
│  ⚠️  NO SERVER LISTENING ON /api/lilypond/render                        │
│                                                                          │
│  SHOULD DO:                                                              │
│  1. Receive JSON payload                                                │
│  2. Extract lilypond_source, template_variant, output_format            │
│  3. Call lilypond-service /engrave endpoint                             │
│  4. Transform response to JSON format                                   │
│  5. Return { success: true, svg: "...", format: "..." }                 │
└─────────────────────────────────────────────────────────────────────────┘
                                  │
                    curl POST http://localhost:8787/engrave
                         { "ly": "...", "format": "svg" }
                                  │
                                  ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                  LilyPond Rendering Service (Docker)                    │
│                  lilypond-service/server.js:8787                        │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  Container: lilypond-service (debian:stable-slim)              │   │
│  │  Security: read-only FS, non-root user, resource limits        │   │
│  │                                                                 │   │
│  │  Endpoints:                                                    │   │
│  │  POST /engrave     - Render LilyPond to SVG/PDF               │   │
│  │  GET  /health      - Health check                             │   │
│  │  GET  /            - Service info                             │   │
│  │                                                                 │   │
│  │  Processing:                                                   │   │
│  │  1. Validate input (no \include, no Scheme, etc.)            │   │
│  │  2. Check SHA-256 cache                                       │   │
│  │  3. Execute lilypond binary (15s timeout)                     │   │
│  │  4. Return SVG/PDF or error                                   │   │
│  │  5. Cache result for 1 year                                   │   │
│  │                                                                 │   │
│  │  Temp Dirs:                                                    │   │
│  │  /tmp/lilypond-cache   - SHA-256 hash cache                   │   │
│  │  /tmp/lilypond-work    - Work files                           │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                                  │
                        Binary SVG/PDF
                                  │
                                  ↓
         [Browser receives SVG/PDF and displays it]
```

---

## Data Flow - Character Insertion

```
User Types "1"
    ↓
keyboard-handler.js → onInput event
    ↓
editor.insertCharacter('1', cursorPos)
    ↓
wasmModule.insertCharacter(
    cells: Array<Cell>,
    '1',
    cursorPos,
    pitchSystem: 1 (Number)
) [WASM]
    ↓
Returns: {
    cells: [{ char: '1', kind: PitchedElement, pitch_code: N1, ... }],
    newCursorPos: 1
}
    ↓
editor.cells = cells
editor.cursor = newCursorPos
    ↓
editor.render() - Update UI
    ↓
lilypond-tab.js (wrapped in render hook):
    exportMusicXML() → convertMusicXMLToLilyPond()
    ↓
lilypond-png-tab.js (debounced, 2s):
    lilypondRenderer.render(source, { minimal: true, format: 'svg' })
    ↓
fetch POST /api/lilypond/render {
    lilypond_source: "\\version \"2.24.0\"\n...",
    template_variant: "minimal",
    output_format: "svg"
}
    ↓
[Backend would convert to lilypond-service format]
    ↓
[Service returns SVG]
    ↓
lilypond-png-tab.displayResult(result)
    → Render SVG in tab
```

---

## File Organization - Absolute Paths

### Frontend Bundle
```
/home/john/editor/
├── index.html                      # Main entry point
├── dist/
│   ├── main.js                     # Bundled JavaScript (rollup output)
│   ├── main.css                    # Generated CSS (unocss)
│   └── pkg/
│       ├── editor_wasm.js          # WASM wrapper
│       ├── editor_wasm_bg.wasm     # Binary WASM module
│       └── editor_wasm.d.ts        # TypeScript definitions
```

### JavaScript Source (25 files)
```
/home/john/editor/src/js/
├── main.js                         # Application entry point
├── editor.js                       # Core editor controller
├── ui.js                           # UI management
├── events.js                       # Event delegation
├── keyboard-handler.js             # Keyboard input
├── text-input-handler.js           # Text processing
├── cursor-manager.js               # Cursor positioning
├── lilypond-renderer.js            # API client for /api/lilypond/render
├── lilypond-tab.js                 # LilyPond source tab
├── lilypond-png-tab.js             # LilyPond render tab
├── osmd-renderer.js                # Staff notation (OSMD)
├── midi-player.js                  # Audio playback
├── slur-renderer.js                # Slur visualization
├── lyrics-renderer.js              # Lyrics display
├── file-ops.js                     # File operations
├── menu-system.js                  # Menu handling
├── resize-handle.js                # Sidebar resize
├── performance-monitor.js          # Performance tracking
├── autosave.js                     # Auto-save feature
├── logger.js                       # Console logging
├── constants.js                    # App constants
├── wasm-integration.js             # WASM binding
└── dev-server.js                   # Dev server
```

### Rust/WASM Source
```
/home/john/editor/src/
├── api.rs                          # WASM API exports (1046 lines)
├── lib.rs                          # Crate entry point
├── models/                         # Data structures
│   ├── mod.rs
│   ├── cell.rs                     # Cell model
│   ├── document.rs                 # Document model
│   └── ...
├── parse/                          # Grammar & parsing
│   ├── grammar.rs                  # Parser implementation
│   └── ...
├── converters/
│   └── musicxml/
│       └── musicxml_to_lilypond/
│           ├── mod.rs              # Main converter
│           ├── converter.rs        # Conversion logic
│           ├── parser.rs           # XML parsing
│           ├── lilypond.rs         # LilyPond generation
│           ├── templates.rs        # Mustache templates
│           └── templates/          # Template files
├── renderers/
│   ├── musicxml/                   # MusicXML export
│   ├── svg/                        # SVG rendering
│   ├── layout_engine.rs            # Layout calculations
│   └── display_list.rs             # Rendering primitives
```

### LilyPond Service
```
/home/john/editor/lilypond-service/
├── server.js                       # Express.js server (406 lines)
├── package.json                    # Node dependencies
├── Dockerfile                      # Container definition
├── docker-compose.yaml             # Orchestration
├── README.md                       # Service documentation
└── setup-archlinux.sh              # Docker setup script
```

### Build Configuration
```
/home/john/editor/
├── Cargo.toml                      # Rust project config
├── Cargo.lock                      # Dependency lock file
├── package.json                    # Node project config
├── Makefile                        # Build orchestration (267 lines)
├── rollup.config.js                # JavaScript bundler
└── build-css.sh                    # CSS generation script
```

---

## API Endpoint Summary

### Client-side (JavaScript to /api/lilypond/render)

**Endpoint**: `POST /api/lilypond/render`

**Status**: ⚠️ MISSING - No backend implementation

**Request**:
```json
{
  "lilypond_source": "\\version \"2.24.0\"\n\\score { ... }",
  "template_variant": "minimal" or "full",
  "output_format": "svg" or "png"
}
```

**Expected Response**:
```json
{
  "success": true,
  "svg": "<svg>...</svg>",
  "png_base64": "iVBORw0KG...",
  "format": "svg"
}
```

### Service Endpoint (lilypond-service)

**Endpoint**: `POST /engrave`

**Status**: ✓ IMPLEMENTED (Docker container)

**Request**:
```json
{
  "ly": "\\version \"2.24.0\"\n\\score { ... }",
  "format": "svg" or "pdf"
}
```

**Response**: Binary SVG or PDF file

**Error Codes**:
- 400: Invalid LilyPond source or compilation failed
- 408: Render timeout
- 413: Payload too large (>512KB)
- 422: Invalid parameters
- 500: Server error

---

## Development Workflow

```
Makefile Targets
├── build            → build-wasm + build-js + build-css
├── build-wasm       → wasm-pack build . --target web --out-dir dist/pkg
├── build-js         → rollup -c (bundles src/js/* → dist/main.js)
├── build-css        → unocss (generates dist/main.css)
├── serve            → npm run dev (watches & rebuilds)
└── build-prod       → Optimized production build

LilyPond Service Targets
├── lilypond-build   → docker-compose build
├── lilypond-start   → docker-compose up -d (port 8787)
├── lilypond-stop    → docker-compose down
├── lilypond-health  → curl http://localhost:8787/health
└── lilypond-test    → curl -X POST http://localhost:8787/engrave ...
```

---

## Module Dependencies

### WASM/Rust (Cargo.toml)
- wasm-bindgen 0.2.92
- roxmltree 0.19 (XML parsing)
- mustache 0.9 (templating)
- serde/serde_json (serialization)
- serde-wasm-bindgen (JS ↔ Rust)
- thiserror (error handling)

### JavaScript/Node (package.json)
- osmd-audio-player 0.7.0
- rollup 4.14.0 (bundler)
- unocss 66.5.3 (CSS generation)
- wasm-pack (build tool)
- playwright 1.44.0 (E2E testing)

### LilyPond Service (lilypond-service/package.json)
- express 4.18.2
- (no dev dependencies)

---

## Key Observations

1. **Decoupled Architecture**: WASM handles logic, JS handles UI
2. **Format Chain**: Notation → Cells → MusicXML → LilyPond → SVG/PDF
3. **Critical Gap**: `/api/lilypond/render` endpoint missing
4. **Security First**: Input validation, timeouts, resource limits, non-root execution
5. **Production Ready**: Caching, health checks, proper signal handling
6. **Multi-Format**: Supports Number, Western, Sargam pitch systems
