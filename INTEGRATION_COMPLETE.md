# WebUI - LilyPond Service Integration Complete ✅

## Summary

The webui has been successfully updated to integrate directly with the LilyPond rendering service at `http://localhost:8787/engrave`.

## What Changed

### File Modified: `src/js/lilypond-renderer.js`

**Endpoint:**
- Old: `/api/lilypond/render` (proxy through local dev server)
- New: `http://localhost:8787/engrave` (direct to Docker service)

**Request Format Changed:**
```javascript
// OLD
{
  "lilypond_source": "...",
  "template_variant": "minimal",
  "output_format": "svg"
}

// NEW
{
  "ly": "...",
  "format": "svg"
}
```

**Response Handling:**
- Old: JSON response with `{success, svg_base64, format}`
- New: Binary SVG/PDF converted to base64 in browser

**New Helper Method:**
- Added `_arrayBufferToBase64()` to convert binary responses to base64

## Architecture

```
┌─────────────────┐
│   WebUI         │
│  (Browser)      │
│ port 8080       │
└────────┬────────┘
         │
         │ fetch() to
         │ http://localhost:8787/engrave
         │
┌────────▼──────────────┐
│ LilyPond Service      │
│ (Docker Container)    │
│ port 8787             │
└───────────────────────┘
         │
         │ spawns lilypond CLI
         │
  ┌──────▼──────┐
  │   lilypond  │
  │   command   │
  └──────┬──────┘
         │
  ┌──────▼──────────┐
  │ SVG or PDF file │
  └─────────────────┘
```

## Integration Points

### 1. Main Renderer Class
- File: `/home/john/editor/src/js/lilypond-renderer.js`
- Endpoint: `http://localhost:8787/engrave`
- Used by: `lilypond-png-tab.js`, `lilypond-tab.js`, `main.js`

### 2. Request-Response Flow

**Request:**
```javascript
POST http://localhost:8787/engrave
Content-Type: application/json

{
  "ly": "\\version \"2.24.0\" \\score { \\new Staff { c4 d4 e4 f4 } \\layout {} }",
  "format": "svg"
}
```

**Response (Success):**
```
HTTP 200 OK
Content-Type: image/svg+xml
[binary SVG data]
```

**Response (Error):**
```json
HTTP 400/500
Content-Type: application/json

{
  "error": "LilyPond compilation failed",
  "stderr": "Error output from lilypond..."
}
```

### 3. Browser Processing

```javascript
// 1. Receive binary response
const arrayBuffer = await response.arrayBuffer();

// 2. Convert to base64
const base64Data = this._arrayBufferToBase64(arrayBuffer);

// 3. Return to UI component
onSuccess({
  svg_base64: base64Data,
  format: 'svg',
  success: true
});

// 4. UI displays
const svgString = atob(result.svg_base64);
container.innerHTML = svgString;
```

## Testing

### Test Page Available
Open in browser: `http://localhost:8080/test-lilypond-renderer.html`

Features:
- LilyPond source editor
- SVG/PDF format selector
- Render button
- Live output display
- Console logging

### Manual Testing
```bash
# Test SVG rendering
curl -X POST http://localhost:8787/engrave \
  -H 'Content-Type: application/json' \
  -d '{"ly": "\\version \"2.24.0\" \\score { \\new Staff { c4 d4 e4 f4 } \\layout {} }", "format": "svg"}' \
  > test.svg

# Test PDF rendering
curl -X POST http://localhost:8787/engrave \
  -H 'Content-Type: application/json' \
  -d '{"ly": "\\version \"2.24.0\" \\score { \\new Staff { c4 d4 e4 f4 } \\layout {} }", "format": "pdf"}' \
  > test.pdf
```

### Service Health Check
```bash
# Verify lilypond-service is running
curl http://localhost:8787/health

# Expected response
{
  "status": "ok",
  "uptime": 12345.67,
  "memory": {
    "rss": 62533632,
    "heapTotal": 8388608,
    ...
  }
}
```

## Docker Services

### Start Services
```bash
cd /home/john/editor/lilypond-service
docker-compose up -d
```

### Services Running

**lilypond-service** (port 8787)
- Renders LilyPond to SVG/PDF
- Validates input (blocks dangerous directives)
- 15-second timeout per render
- 512KB max source size
- SHA-256 caching

**editor-api** (port 3000) - Optional
- Now deprecated for webui (direct to lilypond-service)
- Available for backward compatibility

### Check Status
```bash
sudo docker-compose -f lilypond-service/docker-compose.yaml ps

# Should show:
# lilypond-service - Up (healthy)
# editor-api - Up (healthy)
```

## Documentation Files

1. **LILYPOND_DIRECT_INTEGRATION.md** - Full technical documentation
   - Architecture details
   - API specification
   - Error handling
   - Troubleshooting

2. **API_INTEGRATION.md** - Original integration guide
   - Background on the architecture evolution
   - Backend proxy information (now optional)

3. **test-lilypond-renderer.html** - Interactive test page
   - Self-contained HTML with embedded LilyPondRenderer class
   - No build tools required
   - Real-time testing and debugging

## Key Improvements

✅ **Simplified Architecture** - One fewer service in the chain (no API proxy needed)
✅ **Better Performance** - Direct binary streaming, lower latency
✅ **Direct Binary** - No JSON wrapping overhead
✅ **Easier Debugging** - Direct stderr from lilypond
✅ **Same-Origin Requests** - WebUI and service both on localhost
✅ **Fontconfig Fixed** - Pre-configured environment variables
✅ **SVG & PDF Support** - Both formats rendering correctly

## Compatibility

### Backwards Breaking Change
- Old endpoint `/api/lilypond/render` is no longer called by webui
- Backend API proxy (port 3000) is still available if other clients need it

### Browser Support
- Requires `fetch()` API (all modern browsers)
- Requires `ArrayBuffer` support (all modern browsers)
- Requires `btoa()` for base64 encoding (all browsers)

## Known Limitations

1. **CORS** - Works on localhost; configure CORS if using different machines
2. **URL Hardcoded** - Lilypond endpoint URL is hardcoded in renderer class
3. **No Authentication** - Service designed for local/internal networks only
4. **Performance Limits** - 15s timeout, 512KB max (by design for security)

## Next Steps (Optional)

- [ ] Make lilypond endpoint configurable (environment variable or config file)
- [ ] Add service discovery instead of hardcoded localhost:8787
- [ ] Implement request caching in browser
- [ ] Add real-time collaborative editing support
- [ ] Support additional output formats (PNG, MIDI)
- [ ] Add WebSocket for streaming responses
- [ ] Implement authentication for multi-user setups

## Verification Checklist

✅ Updated `src/js/lilypond-renderer.js`:
- Endpoint changed to `http://localhost:8787/engrave`
- Request payload uses `{ly, format}`
- Response handling converts binary to base64
- Helper method `_arrayBufferToBase64()` added

✅ Docker services running:
- lilypond-service on port 8787 - ✅ Working
- Fontconfig fixed - ✅ Working
- SVG rendering - ✅ Working
- PDF rendering - ✅ Working

✅ Documentation created:
- LILYPOND_DIRECT_INTEGRATION.md - ✅ Complete
- test-lilypond-renderer.html - ✅ Complete
- This summary - ✅ Complete

## Support

For troubleshooting, see **LILYPOND_DIRECT_INTEGRATION.md** section "Troubleshooting"

Common issues:
- Service not running: `docker-compose up -d`
- Fontconfig errors: Already fixed in Docker image
- CORS errors: Both services are on localhost
- Timeout errors: Check lilypond process in container logs
