# Music Notation Editor - Codebase Exploration Report

## Executive Summary

This is a Music Notation Editor POC (Proof of Concept) with a cell-based architecture that converts between different music notation formats. It features a web-based interface with real-time staff notation rendering, MusicXML conversion, and LilyPond generation capabilities.

---

## 1. WebUI Directory Structure and Entry Points

### Main Entry Point
- **File**: `/home/john/editor/index.html` (Lines 1-506)
- **Type**: HTML template for the single-page application
- **Key Elements**:
  - CDN link to OSMD (OpenSheetMusicDisplay) v1.7.6 for staff notation
  - Main editor container: `#notation-editor`
  - Tabbed debug panel: `#tabs-panel` with multiple output formats
  - Menu system (File, Edit, Line menus)
  - MIDI playback controls
  - Status bar showing cursor position and document stats

### JavaScript Source Files
**Location**: `/home/john/editor/src/js/`

**Core Application Files**:
1. **`main.js`** (Lines 1-476)
   - Application entry point and initialization
   - Exports `MusicNotationApp` and `AppFactory`
   - Initializes editor, UI, file operations, event management
   - Sets up MIDI playback controls
   - Manages LilyPond tabs initialization

2. **`editor.js`**
   - Main editor controller
   - Manages document state and rendering pipeline

3. **`ui.js`**
   - UI component management
   - Tab visibility control
   - Status bar updates

4. **`events.js`**
   - Event delegation and management
   - Menu event handling

5. **`keyboard-handler.js`**
   - Keyboard input processing
   - Shortcut key mappings (Alt+S for slur, Alt+U/M/L for octaves)

### Tab Components
- **`lilypond-tab.js`** (Lines 1-120)
  - Displays LilyPond source code
  - Updates on document changes via wrapped `render()` function
  
- **`lilypond-png-tab.js`** (Lines 1-491)
  - Displays rendered LilyPond output (SVG/PNG)
  - Includes toolbar with refresh, format toggle, zoom controls
  - Debounced rendering with 2-second timeout
  - Real-time sync with editor updates

### UI Feature Files
- **`osmd-renderer.js`** - OpenSheetMusicDisplay integration for staff notation
- **`midi-player.js`** - MIDI audio playback (uses osmd-audio-player)
- **`slur-renderer.js`** - Visual slur indicators
- **`lyrics-renderer.js`** - Lyrics display
- **`file-ops.js`** - File open/save operations
- **`menu-system.js`** - Menu management
- **`cursor-manager.js`** - Cursor positioning in editor
- **`resize-handle.js`** - Resizable sidebar handle
- **`performance-monitor.js`** - Performance metrics
- **`text-input-handler.js`** - Text input processing
- **`autosave.js`** - Auto-save functionality
- **`logger.js`** - Console logging system
- **`constants.js`** - Application constants

---

## 2. WebUI API Connections

### Primary API Endpoint: LilyPond Rendering

**File**: `/home/john/editor/src/js/lilypond-renderer.js` (Lines 1-150)

**Endpoint Configuration**:
```javascript
this.apiEndpoint = '/api/lilypond/render';
```

**Request Structure**:
```javascript
const payload = {
  lilypond_source: lilypondSource,      // LilyPond source code string
  template_variant: 'minimal' | 'full', // Template selection
  output_format: 'svg' | 'png'          // Output format
};
```

**HTTP Method**: POST
**Content-Type**: application/json

**Response Structure**:
```javascript
{
  success: boolean,
  svg: string,          // SVG markup (if format='svg')
  png_base64: string,   // Base64-encoded PNG (if format='png')
  format: string,       // 'svg' or 'png'
  error?: string        // Error message if !success
}
```

**Features**:
- 2-second debounce for in-tab rendering (minimal=true)
- Non-debounced rendering for manual refresh (renderNow)
- Error handling with user-friendly messages
- Duplicate source detection to skip unnecessary renders

**Integration Points**:
1. **LilyPondTab** - Calls `getLilyPondSource()` from editor
2. **LilyPondPngTab** - Real-time rendering on document updates
3. **Callbacks**:
   - `onSuccess(result)` - Display rendered output
   - `onError(message)` - Display error messages

---

## 3. Existing Endpoint Patterns

### WASM API Endpoints (Browser-side, no HTTP)
These are JavaScript function calls to WASM module compiled from Rust:

**File**: `/home/john/editor/src/api.rs` (Lines 1-1046)

**Core Functions** (wasm-bindgen exports):
1. **`insertCharacter(cells, char, cursor_pos, pitch_system)`** (Lines 61-173)
   - Inserts a single character into the notation
   - Returns `{ cells, newCursorPos }`

2. **`parseText(text, pitch_system)`** (Lines 183-227)
   - Parses string into cell array (for document loading)
   - Returns `Array<Cell>`

3. **`deleteCharacter(cells, cursor_pos)`** (Lines 243-360)
   - Removes character at cursor position
   - Returns updated `Array<Cell>`

4. **`applyOctave(cells, start, end, octave)`** (Lines 372-422)
   - Applies octave modification to pitch cells
   - Returns updated `Array<Cell>`

5. **`applySlur(cells, start, end)`** (Lines 433-493)
   - Adds slur markup to cell range
   - Returns updated `Array<Cell>`

6. **`removeSlur(cells, start, end)`** (Lines 504-559)
   - Removes slur markup from cell range
   - Returns updated `Array<Cell>`

7. **Document Metadata Functions**:
   - `setTitle(document, title)` - Set composition title
   - `setComposer(document, composer)` - Set composer name
   - `setLineLabel(document, line_index, label)` - Set line label
   - `setLineLyrics(document, line_index, lyrics)` - Set lyrics
   - `setLineTala(document, line_index, tala)` - Set tala (rhythm pattern)

8. **Export Functions**:
   - `exportMusicXML(document)` - Export to MusicXML 3.1 format
   - `convertMusicXMLToLilyPond(musicxml, settings_json)` - MusicXML → LilyPond conversion
   - `computeLayout(document, config)` - Generate DisplayList for rendering

9. **Factory Functions**:
   - `createNewDocument()` - Create new empty document

### External Service: LilyPond Rendering Service

**Location**: `/home/john/editor/lilypond-service/server.js` (Lines 1-406)

**Port**: 8787 (via Docker)

**Endpoints**:

1. **`POST /engrave`** (Lines 284-335)
   - **Purpose**: Render LilyPond source to SVG or PDF
   - **Request**:
     ```json
     {
       "ly": "\\version \"2.24.0\" \\score { ... }",
       "format": "svg" | "pdf"
     }
     ```
   - **Response**: Binary SVG/PDF with cache headers
   - **Error Codes**: 400, 408, 413, 422, 500
   - **Security**: Input validation, timeout protection (15s default)

2. **`GET /health`** (Lines 340-346)
   - Health check endpoint
   - Returns status, uptime, memory usage

3. **`GET /`** (Lines 351-365)
   - Info endpoint with service metadata and limits

### Data Flow Diagram

```
User Input (Keyboard/Click)
    ↓
keyboard-handler.js → editor.js
    ↓
editor.wasmModule.insertCharacter() [WASM]
    ↓
cells updated + UI re-rendered
    ↓
lilypond-tab.js: generateLilyPondSource()
    ↓
editor.wasmModule.exportMusicXML() → convertMusicXMLToLilyPond() [WASM]
    ↓
lilypond-png-tab.js: lilypondRenderer.render()
    ↓
fetch POST /api/lilypond/render
    ↓
[Currently missing: backend receives request]
```

---

## 4. LilyPond Service Configuration and Deployment

### Docker Configuration
**File**: `/home/john/editor/lilypond-service/docker-compose.yaml`

**Key Settings**:
- **Port**: 8787 (host:container)
- **Environment Variables**:
  - `NODE_ENV`: production
  - `PORT`: 8787
  - `MAX_REQUEST_SIZE`: 512 KB
  - `RENDER_TIMEOUT`: 15 seconds
  
**Security Features**:
- Read-only root filesystem
- tmpfs /tmp with 64MB limit (mode 1777)
- Resource limits: 1 CPU, 512MB RAM
- Health check every 30 seconds (3s timeout, 3 retries)
- Non-root user execution (UID 10001)

**Dockerfile**: `/home/john/editor/lilypond-service/Dockerfile`
- Base: debian:stable-slim
- Includes: lilypond, nodejs, npm, tini
- Process manager: tini for proper signal handling
- Health check: HTTP GET to /health endpoint

### Service Startup
**Makefile targets** (Lines 216-267):
```makefile
lilypond-start:      # Start service (docker-compose up -d)
lilypond-stop:       # Stop service
lilypond-restart:    # Restart service
lilypond-health:     # Check health (curl to /health)
lilypond-logs:       # Show logs
lilypond-test:       # Test rendering with cURL
lilypond-build:      # Build image
lilypond-clean:      # Clean containers
```

### Validation and Security in Server
**Input Validation** (server.js Lines 54-91):
- Blocks `\include` directives
- Blocks Scheme expressions `#(...)`
- Blocks system calls
- Blocks external URLs
- Size limit: 512 KB default
- Timeout: 15 seconds default

### Caching
**Cache System** (server.js Lines 104-138):
- SHA-256 hash-based caching
- Cache directory: `/tmp/lilypond-cache`
- Work directory: `/tmp/lilypond-work`
- Long-lived cache headers: 1 year (immutable by hash)

---

## 5. Main Components and Pages

### Page Components

**1. Header Section** (index.html Lines 265-337)
- Menu bar with File, Edit, Line menus
- Document status display (position, pitch system, char count)
- Composition title display
- Selection info

**2. Editor Canvas** (index.html Lines 340-369)
- Main notation editor (`#notation-editor`)
- Placeholder text for input guidance
- Status bar with focus and performance info

**3. Debug Sidebar** (index.html Lines 376-499)
- **9 Tab Views**:
  1. **Staff Notation** (OSMD rendering, MIDI controls)
  2. **MusicXML** (source code display)
  3. **LilyPond Src** (LilyPond source code)
  4. **LilyPond PNG** (rendered output with zoom/refresh)
  5. **Ephemeral Model** (full JSON with runtime state)
  6. **Persistent Model** (saveable JSON)
  7. **Console Errors** (error logging)
  8. **Console Log** (debug logging)
  9. **HTML** (rendered HTML structure)

### UI Controls

**Menus**:
- **File**: New, Open, Save, Export MusicXML, Export LilyPond, Set Title/Tonic/Pitch System/Key Signature
- **Edit**: Apply Slur, Octave controls (Upper/Middle/Lower)
- **Line**: Set Label, Tonic, Pitch System, Lyrics, Tala, Key Signature

**MIDI Playback** (Lines 418-444):
- Play/Pause/Stop buttons
- BPM tempo control (40-208)
- Volume control (0-100%)
- Status display

**LilyPond Rendering Controls** (lilypond-png-tab.js):
- Refresh button (manual render)
- Format toggle (SVG/PNG)
- Zoom controls (0.5x - 2.0x)
- Copy to clipboard button
- Status display

### Document Structure

**Cell Model** (from api.rs and models):
```rust
struct Cell {
  char: String,                    // Character/glyph
  kind: ElementKind,               // PitchedElement, UnpitchedElement, Text, Barline
  continuation: bool,              // Part of multi-char glyph?
  col: usize,                      // Column index
  flags: u32,                      // Metadata flags
  pitch_code: Option<PitchCode>,  // Musical pitch (N1, N1s, C, C#, etc.)
  pitch_system: Option<PitchSystem>, // Number, Western, Sargam, Bhatkhande, Tabla
  octave: i8,                      // Octave modifier (-1, 0, 1)
  slur_indicator: SlurIndicator,   // None, Start, End, Both
  x, y, w, h: f64,                // Layout positioning
  bbox, hit: (f64, f64, f64, f64), // Bounding boxes
}
```

**Document Model**:
```rust
struct Document {
  title: Option<String>,
  composer: Option<String>,
  pitch_system: Option<PitchSystem>,
  lines: Vec<Line>,               // Multiple staves/lines
}

struct Line {
  cells: Vec<Cell>,
  label: String,                  // Line identifier
  lyrics: String,                 // Text underlay
  tala: String,                   // Rhythmic pattern (digits + '+')
  key_signature: KeySignature,
  tonic: Note,
  pitch_system: PitchSystem,
}
```

---

## 6. API Call Flow - Complete Picture

### 1. User Types Character
```
User input → keyboard-handler.js
  ↓
editor.insertCharacter(char, position)
  ↓
wasmModule.insertCharacter(cells, char, position, pitchSystem) [WASM]
  ↓
Returns: { cells: [updated], newCursorPos: number }
  ↓
editor.cells = cells
editor.render() → UI updated
  ↓
lilypond-tab.js.updateLilyPondSource() → wrapped render() hook
```

### 2. LilyPond Generation & Rendering
```
lilypond-tab.js or lilypond-png-tab.js
  ↓
wasmModule.exportMusicXML(document) [WASM]
  ↓
Returns: MusicXML string (XML 3.1 format)
  ↓
wasmModule.convertMusicXMLToLilyPond(musicxml, settings) [WASM]
  ↓
Returns: JSON { lilypond_source: string, skipped_elements: [] }
  ↓
lilypond-renderer.render(lilypondSource, options)
  ↓
fetch POST /api/lilypond/render
  ↓
[Request: { lilypond_source, template_variant, output_format }]
  ↓
[Backend: NOT YET IMPLEMENTED - needs connection to lilypond-service]
  ↓
[Expected Response: { success, svg/png_base64, format }]
  ↓
lilypond-png-tab.displayResult(result) → render SVG or PNG
```

### 3. Currently Missing Link
**The webui makes requests to `/api/lilypond/render` but there's NO backend server handling these requests.**

The lilypond-service exists and has the `/engrave` endpoint (POST, returns binary SVG/PDF), but the webui is calling `/api/lilypond/render` with JSON payloads.

**Missing implementation**:
- Express.js server at `/api/lilypond/render` 
- Conversion between JSON input to lilypond-service format
- Proxy or bridge from webui → lilypond-service Docker container
- Or: Modify lilypond-renderer.js to call `/engrave` directly

---

## 7. Build and Development Setup

### Build Tools
**Makefile** (Key targets, Lines 1-267):
```makefile
make build         # Build all (WASM + JS + CSS)
make build-wasm    # Build WASM module only
make build-js      # Bundle JavaScript
make build-css     # Generate CSS
make build-prod    # Production optimized build

make serve         # Start dev server with hot reload
make serve-prod    # Serve production build
make test          # Run E2E tests

make lilypond-start    # Start Docker service
make lilypond-build    # Build Docker image
```

### Build Output
- **WASM**: `/home/john/editor/dist/pkg/` (referenced in index.html)
- **JavaScript**: `/home/john/editor/dist/main.js` (bundled by rollup)
- **CSS**: `/home/john/editor/dist/main.css` (generated by unocss)

### Dependencies
- **WASM**: wasm-pack 0.2.92, roxmltree, mustache templates
- **WebUI**: Node.js 18+, npm, rollup, unocss
- **LilyPond Service**: Docker, debian base, lilypond binary

---

## 8. File Summary by Category

### Frontend Entry Points
- `/home/john/editor/index.html` - Main HTML template
- `/home/john/editor/src/js/main.js` - App initialization
- `/home/john/editor/dist/main.js` - Bundled output

### Core Logic (WASM/Rust)
- `/home/john/editor/src/api.rs` - JavaScript-facing API (1046 lines)
- `/home/john/editor/src/models/` - Data structures
- `/home/john/editor/src/converters/musicxml/` - MusicXML conversion
- `/home/john/editor/src/renderers/` - Layout and rendering engines

### Service Layer
- `/home/john/editor/lilypond-service/server.js` - LilyPond rendering service
- `/home/john/editor/lilypond-service/Dockerfile` - Container definition
- `/home/john/editor/lilypond-service/docker-compose.yaml` - Orchestration

### UI Components (25 JS files)
Located in `/home/john/editor/src/js/`:
- Editor components: editor.js, cursor-manager.js, text-input-handler.js
- UI: ui.js, menu-system.js, resize-handle.js
- Rendering: osmd-renderer.js, lilypond-renderer.js, lilypond-tab.js, lilypond-png-tab.js
- Support: file-ops.js, autosave.js, logger.js, performance-monitor.js, midi-player.js

---

## 9. Critical Observations

1. **Architecture Decoupling**: WASM module handles all core logic; JavaScript is primarily UI and orchestration.

2. **MusicXML-centric Pipeline**: 
   - Notation input → Cells
   - Cells → MusicXML (export)
   - MusicXML → LilyPond (conversion)
   - LilyPond → SVG/PNG (rendering)

3. **Missing Backend Integration**: 
   - WebUI calls `/api/lilypond/render` 
   - lilypond-service provides `/engrave` endpoint
   - No Express.js middleware bridges them
   - **BLOCKER**: Cannot render to PNG/SVG without fixing this

4. **Real-time vs. Batch Processing**:
   - Editor uses in-tab debouncing (2 seconds)
   - Rendering endpoint expects immediate response
   - No streaming or background job queue

5. **Security Model**:
   - Input validation in server (no \include, no Scheme)
   - Read-only container filesystem
   - Non-root execution
   - Resource limits (1 CPU, 512MB RAM)
   - Well-designed, production-ready

6. **Caching Strategy**:
   - SHA-256 hash-based caching in lilypond-service
   - 1-year immutable cache headers
   - Efficient for repeated renders

---

## 10. Recommendations for Next Steps

1. **Fix API Bridge**: Create `/api/lilypond/render` endpoint that:
   - Accepts JSON from webui
   - Calls lilypond-service `/engrave`
   - Returns JSON with SVG/PNG-base64

2. **Consider Architecture**:
   - Option A: Add Node.js Express bridge in same container
   - Option B: Modify lilypond-renderer.js to call lilypond-service directly
   - Option C: Run separate API server that proxies to lilypond-service

3. **Network Configuration**:
   - lilypond-service uses Docker network `lilypond-net`
   - Main app needs either:
     - docker-compose orchestration of both services
     - Direct HTTP calls to localhost:8787

4. **Testing**: 
   - Verify lilypond-service is running: `curl http://localhost:8787/health`
   - Test rendering: `curl -X POST http://localhost:8787/engrave ...`
   - Implement E2E tests for render pipeline

