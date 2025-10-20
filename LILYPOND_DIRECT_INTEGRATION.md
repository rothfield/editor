# WebUI - LilyPond Service Direct Integration

This document describes the direct integration between the webui and the LilyPond rendering service running at `http://localhost:8787/engrave`.

## Architecture

```
WebUI (Browser)
    ↓ fetch() to http://localhost:8787/engrave
LilyPond Service (Docker Container)
    ↓ spawns lilypond CLI with binary output
SVG or PDF Output
    ↓ returned as binary (Content-Type: image/svg+xml or application/pdf)
WebUI Browser
    ↓ receives binary, converts to base64
    ↓ displays SVG inline or embeds PDF
```

## Integration Summary

### Changed: `src/js/lilypond-renderer.js`

The `LilyPondRenderer` class now directly calls the lilypond-service Docker container instead of going through an intermediate API proxy.

**Changes Made:**

1. **Endpoint Update (Line 11)**
   ```javascript
   // OLD: this.apiEndpoint = '/api/lilypond/render';
   // NEW:
   this.apiEndpoint = 'http://localhost:8787/engrave';
   ```

2. **Request Payload (Lines 73-77)**
   ```javascript
   // OLD: { lilypond_source, template_variant, output_format }
   // NEW:
   const payload = {
     ly: lilypondSource,        // LilyPond source code
     format: format              // 'svg' or 'pdf'
   };
   ```

3. **Response Handling (Lines 90-112)**
   - Detects `Content-Type` header
   - If JSON: parse as error response
   - If binary: convert ArrayBuffer to base64
   - Return as `{svg_base64|pdf_base64, format, success}`

4. **New Helper Method (Lines 125-132)**
   ```javascript
   _arrayBufferToBase64(buffer) {
     const bytes = new Uint8Array(buffer);
     let binary = '';
     for (let i = 0; i < bytes.byteLength; i++) {
       binary += String.fromCharCode(bytes[i]);
     }
     return btoa(binary);
   }
   ```

## How It Works

### 1. Request Flow

```javascript
// Browser calls render
renderer.render('\\version "2.24.0" \\score { ... }', {
  format: 'svg'
});

// → _performRender() is called
// → Creates payload: { ly: "...", format: "svg" }
// → fetch('http://localhost:8787/engrave', { POST, JSON body })
```

### 2. Server Processing

```
Docker: lilypond-service (port 8787)
  ↓
POST /engrave
  ↓
Validate LilyPond source (blocks \include, #(...), etc.)
  ↓
Spawn: lilypond --svg --output=/tmp/temp123 /tmp/temp123.ly
  ↓
Generate: /tmp/temp123.svg (or .pdf)
  ↓
Return binary with Content-Type: image/svg+xml
```

### 3. Browser Response Handling

```javascript
// Receive binary response
const arrayBuffer = await response.arrayBuffer();

// Convert to base64
const base64Data = this._arrayBufferToBase64(arrayBuffer);

// Return result
onSuccess({
  svg_base64: base64Data,
  format: 'svg',
  success: true
});

// UI component displays
const svgString = atob(result.svg_base64);
container.innerHTML = svgString;
```

## API Endpoint Specification

### POST /engrave

**Request:**
```json
{
  "ly": "\\version \"2.24.0\" \\score { \\new Staff { c4 d4 e4 f4 } \\layout {} }",
  "format": "svg"
}
```

**Success Response (200):**
- Content-Type: `image/svg+xml` or `application/pdf`
- Body: Binary SVG or PDF content

**Error Response (4xx/5xx):**
- Content-Type: `application/json`
- Body:
  ```json
  {
    "error": "Error message",
    "stderr": "Compiler output (if applicable)"
  }
  ```

## Testing

### Test Page

Open in browser: `http://localhost:8080/test-lilypond-renderer.html`

Features:
- Text editor for LilyPond source
- Format selector (SVG/PDF)
- Render button
- Live output display
- Console logging

### Manual cURL Test

```bash
# SVG Render
curl -X POST http://localhost:8787/engrave \
  -H 'Content-Type: application/json' \
  -d '{"ly": "\\version \"2.24.0\" \\score { \\new Staff { c4 d4 e4 f4 } \\layout {} }", "format": "svg"}' \
  > output.svg

# PDF Render
curl -X POST http://localhost:8787/engrave \
  -H 'Content-Type: application/json' \
  -d '{"ly": "\\version \"2.24.0\" \\score { \\new Staff { c4 d4 e4 f4 } \\layout {} }", "format": "pdf"}' \
  > output.pdf
```

## Docker Service Requirements

### Start Services

```bash
cd /home/john/editor/lilypond-service
docker-compose up -d
```

### Services Running

- **lilypond-service** (8787) - The rendering engine
  - POST `/engrave` - Render LilyPond
  - GET `/health` - Health check

- **editor-api** (3000) - Optional proxy (not used by webui now)

### Verify Service

```bash
# Check status
sudo docker-compose -f lilypond-service/docker-compose.yaml ps

# Check health
curl http://localhost:8787/health

# View logs
sudo docker logs lilypond-service -f
```

## Integration Points in WebUI

### Main Renderer Class

File: `/home/john/editor/src/js/lilypond-renderer.js` (150 lines)

Used by:
- `lilypond-png-tab.js` - Displays rendered output
- `lilypond-tab.js` - Updates on source code changes
- `main.js` - Initializes renderer

### DOM Elements

- `#lilypond-render-container` - Output display area
- `#lilypond-source` - Source code editor

### Usage Example

```javascript
import LilyPondRenderer from './lilypond-renderer.js';

const renderer = new LilyPondRenderer();

renderer.render(sourceCode, {
  format: 'svg',
  onSuccess: (result) => {
    // result.svg_base64 - base64 encoded SVG
    // result.format - 'svg'
    const svgString = atob(result.svg_base64);
    document.getElementById('lilypond-render-container').innerHTML = svgString;
  },
  onError: (error) => {
    console.error('Render error:', error);
  }
});
```

## Performance Characteristics

- **Timeout:** 15 seconds per render
- **Max Source Size:** 512 KB
- **Debounce:** 2 seconds (prevents excessive re-renders)
- **Cache:** SHA-256 based on source code + format

## Error Handling

### Network Errors

```
CORS error → Check WebUI and service are on localhost
Connection refused → Service not running
Timeout → Render taking >15s or network issue
```

### Compilation Errors

```
"\\include directive is not allowed"
"Scheme expressions (#(...)) are not allowed"
"External URLs are not allowed"
"LilyPond compilation failed" (with stderr output)
```

## Advantages of Direct Integration

1. **Reduced Latency** - No intermediate proxy
2. **Binary Efficiency** - Direct binary streaming
3. **Simpler Architecture** - One fewer service to manage
4. **Better Error Debugging** - Direct stderr from lilypond
5. **Easier Development** - Single HTTP connection

## Backwards Compatibility

⚠️ **Breaking Change:** The old `/api/lilypond/render` endpoint is no longer used by webui.

The backend API proxy (editor-api on port 3000) is still available if needed for other clients, but webui connects directly to lilypond-service.

## Troubleshooting

### "LilyPond service unavailable"

```bash
# Check if service is running
sudo docker-compose -f lilypond-service/docker-compose.yaml ps

# Restart service
sudo docker-compose -f lilypond-service/docker-compose.yaml restart lilypond
```

### CORS Errors

WebUI and lilypond-service are both on `localhost`, so same-origin policy should allow requests.

If running on different machines:
- Configure CORS headers in lilypond-service
- Or use API proxy (editor-api on port 3000)

### Fontconfig Errors

Already fixed in Docker image:
- `FONTCONFIG_FILE=/dev/null`
- `XDG_CACHE_HOME=/tmp/.fontconfig`
- Pre-generated font cache

### Rendering Timeout

Check if lilypond process is hung:
```bash
sudo docker exec lilypond-service ps aux
```

Check for large/complex LilyPond files exceeding 512KB limit.

## Configuration

To change lilypond-service URL, edit `lilypond-renderer.js` line 11:

```javascript
this.apiEndpoint = 'http://your-server:8787/engrave';
```

Or make it configurable:

```javascript
constructor(endpoint = 'http://localhost:8787/engrave') {
  this.apiEndpoint = endpoint;
}
```
