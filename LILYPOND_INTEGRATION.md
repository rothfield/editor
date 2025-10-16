# LilyPond PNG/SVG Generation - Implementation Guide

## Overview

Complete LilyPond rendering system with:
- **Stdin-based execution** (no disk writes)
- **Mustache templating** (minimal and full variants)
- **SVG/PNG output formats**
- **Real-time in-tab preview with refresh button**
- **Debounced rendering for performance**

## Files Created

### Frontend (JavaScript)

#### 1. `src/js/lilypond-renderer.js`
Main client-side renderer class that:
- Communicates with backend via `POST /api/lilypond/render`
- Handles Mustache template variants (minimal/full)
- Manages debouncing (2s default for real-time updates)
- Supports SVG and PNG output formats
- Cancellable pending renders

**Usage:**
```javascript
import LilyPondRenderer from './lilypond-renderer.js';

const renderer = new LilyPondRenderer();

// Real-time rendering (debounced)
renderer.render(lilypondSource, {
  minimal: true,  // Use smaller template
  format: 'svg',
  onSuccess: (result) => {
    console.log('SVG:', result.svg);
  },
  onError: (err) => console.error(err)
});

// Manual refresh (no debounce)
renderer.renderNow(lilypondSource, {
  minimal: false,
  format: 'svg',
  onSuccess: callback,
  onError: errorHandler
});
```

#### 2. `src/js/lilypond-tab.js`
UI tab component with:
- Refresh button for manual rendering
- Format toggle (SVG/PNG)
- Real-time status display
- Error messaging
- Copy-to-clipboard for SVG
- Debounced updates on document changes

**Usage:**
```javascript
import LilyPondTab from './lilypond-tab.js';
import LilyPondRenderer from './lilypond-renderer.js';

const renderer = new LilyPondRenderer();
const tab = new LilyPondTab(editor, renderer);
tab.initialize();
```

### Backend (Rust)

#### 3. `src/lilypond_renderer.rs`
Rust module providing:
- **Stdin-piped lilypond execution** - no temporary files
- **Template system**:
  - `minimal_template()`: Stripped version (~10-20% smaller output)
  - `full_template()`: Complete LilyPond with metadata
- **Format conversion**:
  - `lilypond_to_png()`: PNG via lilypond command
  - `png_to_svg()`: PNG to SVG via ImageMagick convert
- **Request/Response structures** for API serialization

**Key Functions:**
```rust
pub async fn render_lilypond(request: LilyPondRenderRequest)
  -> Result<LilyPondRenderResponse, String>
```

## Integration Steps

### 1. Update Rust `lib.rs` or `main.rs`

Add module declaration:
```rust
mod lilypond_renderer;
```

Import in API handler:
```rust
use crate::lilypond_renderer::{render_lilypond, LilyPondRenderRequest};
```

### 2. Create Backend API Endpoint

Add to your Axum router (e.g., in web server setup):

```rust
use axum::{Json, routing::post, Router};
use hyper::StatusCode;

async fn lilypond_render_handler(
    Json(payload): Json<LilyPondRenderRequest>,
) -> Result<Json<LilyPondRenderResponse>, (StatusCode, String)> {
    match render_lilypond(payload).await {
        Ok(response) => Ok(Json(response)),
        Err(err) => Err((StatusCode::INTERNAL_SERVER_ERROR, err)),
    }
}

// In router setup:
let app = Router::new()
    .route("/api/lilypond/render", post(lilypond_render_handler))
    // ... other routes
```

### 3. Integrate into Editor

In `src/js/editor.js` or `src/js/ui.js`:

```javascript
import LilyPondRenderer from './lilypond-renderer.js';
import LilyPondTab from './lilypond-tab.js';

class EditorUI {
  constructor(editor) {
    this.editor = editor;
    this.lilypondRenderer = new LilyPondRenderer();
    this.lilypondTab = new LilyPondTab(editor, this.lilypondRenderer);
  }

  initialize() {
    this.lilypondTab.initialize();
    // ... other initialization
  }
}
```

### 4. Update HTML Template

Add tab to editor UI:

```html
<div class="editor-tabs">
  <button class="tab-button" data-tab="lilypond">LilyPond</button>
</div>

<div class="editor-tab-content">
  <div id="lilypond-tab" class="tab-pane" style="display: flex; flex-direction: column;">
    <!-- Toolbar and preview created by JavaScript -->
  </div>
</div>
```

### 5. Update Build Configuration

#### For Rust dependencies in `Cargo.toml`:
```toml
[dependencies]
base64 = "0.22"  # For PNG base64 encoding
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
tokio = { version = "1", features = ["process", "io-util"] }
```

#### For JavaScript in `rollup.config.js`:
Already supports ES6 imports, no changes needed.

## Request/Response Format

### POST `/api/lilypond/render`

**Request:**
```json
{
  "lilypond_source": "c d e f g",
  "template_variant": "minimal",
  "output_format": "svg"
}
```

**Response (Success):**
```json
{
  "success": true,
  "svg": "<svg>...</svg>",
  "png_base64": null,
  "format": "svg",
  "error": null
}
```

**Response (Error):**
```json
{
  "success": false,
  "svg": null,
  "png_base64": null,
  "format": "svg",
  "error": "LilyPond failed: ..."
}
```

## Template Variants

### Minimal Template
- **Use case**: In-tab real-time preview
- **Size**: ~10-20% smaller output
- **Content**: Just score block with notes
- **Example**:
  ```lilypond
  \version "2.24.0"
  \score {
    { c d e f }
    \layout { }
    \midi { }
  }
  ```

### Full Template
- **Use case**: Display/export
- **Size**: Full metadata and layout
- **Content**: Version, language, staff, relative notation
- **Example**:
  ```lilypond
  \version "2.24.0"
  \language "english"
  \score {
    \new Staff {
      \relative c' {
        c d e f
      }
    }
    \layout { indent = #0 }
    \midi { ... }
  }
  ```

## Performance Considerations

### Debouncing
- **In-tab rendering**: 2 second debounce (minimizes server load during typing)
- **Manual refresh**: No debounce (immediate render on button click)
- **Cancelable**: Pending renders can be cancelled

### Stdin Piping
- **No disk I/O**: Faster than temp files on slow storage
- **Memory efficient**: Stream processing via pipes
- **Concurrent safe**: Each request gets independent lilypond process

### Format Optimization
- **SVG**: Best for web display and copy-paste
- **PNG**: Better for export/printing
- **Conversion**: PNG→SVG via ImageMagick (faster than lilypond SVG output)

## Dependencies Required

### System Packages
```bash
# macOS
brew install lilypond imagemagick

# Ubuntu/Debian
sudo apt-get install lilypond imagemagick

# Alpine
apk add lilypond imagemagick
```

### Rust Crates
- `tokio` - Async command execution
- `serde`/`serde_json` - Request/response serialization
- `base64` - PNG encoding

## Error Handling

### Frontend
- Network errors → "Connection failed"
- Invalid response → "Rendering error"
- Empty source → "No LilyPond source available"

### Backend
- lilypond not found → "lilypond not found: ..."
- lilypond failed → "LilyPond failed: [stderr]"
- PNG to SVG conversion failed → "PNG to SVG conversion failed: ..."
- Invalid source → "LilyPond source is empty"

## Debugging

### Enable Verbose Logging

Frontend:
```javascript
const renderer = new LilyPondRenderer();
// Logs will appear as [LilyPond] prefix
```

Backend:
```rust
// Add debug output to lilypond_renderer.rs
eprintln!("DEBUG: lilypond input: {}", lilypond_src);
```

### Test Command Line

```bash
# Test lilypond via stdin
echo 'c d e f' | lilypond --png -dno-gs-load-fonts -dinclude-eps-fonts -dresolution=150 -o /dev/stdout -

# Test PNG to SVG
lilypond_output.png | convert - svg:-
```

## Future Enhancements

1. **Caching**: Cache rendered SVG by lilypond_source hash
2. **Streaming**: Stream large SVGs instead of loading entire document
3. **Customization**: User-configurable template variables (tempo, key, time signature)
4. **Export**: Direct PNG/PDF export to file
5. **Audio Playback**: MIDI playback from lilypond-generated MIDI
6. **Batch Rendering**: Render multiple pages/staves

## Testing

### Unit Tests (Rust)
```bash
cargo test lilypond_renderer
```

### Integration Test
```bash
curl -X POST http://localhost:3000/api/lilypond/render \
  -H "Content-Type: application/json" \
  -d '{
    "lilypond_source": "c d e f g",
    "template_variant": "minimal",
    "output_format": "svg"
  }'
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Command not found: lilypond | Install lilypond package |
| Command not found: convert | Install imagemagick package |
| Empty SVG output | Check lilypond_source is valid LilyPond |
| Slow rendering | Use minimal template, increase debounce |
| Memory issues | Reduce resolution (change -dresolution=150 to 100) |

