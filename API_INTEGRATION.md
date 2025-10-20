# LilyPond Endpoint Integration

This document describes the integration between the WebUI and the LilyPond rendering services.

## Architecture

```
┌─────────────┐
│   WebUI     │
│ (Browser)   │
└──────┬──────┘
       │ HTTP
       ↓
┌──────────────────────┐
│  Backend API Proxy   │ (Node.js, port 3000)
│  /api/lilypond/*     │
└──────┬───────────────┘
       │ HTTP (Docker network)
       ↓
┌──────────────────────┐
│ LilyPond Service     │ (Node.js, port 8787)
│ POST /engrave        │
└──────────────────────┘
```

## Endpoints

### WebUI → Backend API

**Endpoint:** `POST /api/lilypond/render`

**Request:**
```json
{
  "lilypond_source": "\\version \"2.24.0\" \\score { ... }",
  "output_format": "svg",
  "template_variant": "minimal"  // optional
}
```

**Response (Success):**
```json
{
  "success": true,
  "svg_base64": "base64-encoded SVG content",
  "format": "svg"
}
```

**Response (Error):**
```json
{
  "success": false,
  "error": "Error description",
  "details": "Additional error information"
}
```

### Backend API → LilyPond Service

**Endpoint:** `POST /engrave`

**Request:**
```json
{
  "ly": "\\version \"2.24.0\" \\score { ... }",
  "format": "svg"
}
```

**Response:** Binary SVG or PDF content with `Content-Type: image/svg+xml` or `application/pdf`

## Files Created

### Backend API Server (`/home/john/editor/server/`)

- **index.js** - Express server implementing the API proxy
- **package.json** - Node.js dependencies
- **Dockerfile** - Docker image definition
- **.dockerignore** - Docker build excludes

### Configuration

- **docker-compose.yaml** - Updated to include both lilypond-service and api services

### WebUI Updates

- **lilypond-renderer.js** - Updated response handling for new base64 format

## Running Services

### Start All Services

```bash
cd /home/john/editor/lilypond-service
docker-compose up -d
```

### Service Ports

- Backend API: `http://localhost:3000`
- LilyPond Service: `http://localhost:8787` (internal only)

### Health Checks

```bash
# Backend API health
curl http://localhost:3000/health

# LilyPond service status through proxy
curl http://localhost:3000/api/lilypond/health
```

## Data Flow Example

1. **WebUI renders notes:**
   ```javascript
   const renderer = new LilyPondRenderer();
   renderer.render(lilypondSource, {
     format: 'svg',
     onSuccess: (data) => {
       // data.svg_base64 contains rendered SVG
       displaySVG(data.svg_base64);
     }
   });
   ```

2. **Request sent to Backend API:**
   ```
   POST http://localhost:3000/api/lilypond/render
   Body: { lilypond_source: "...", output_format: "svg" }
   ```

3. **Backend API proxies to LilyPond Service:**
   ```
   POST http://lilypond:8787/engrave
   Body: { ly: "...", format: "svg" }
   ```

4. **LilyPond Service returns SVG binary**

5. **Backend API converts to base64 and responds:**
   ```json
   { success: true, svg_base64: "...", format: "svg" }
   ```

6. **WebUI receives and displays SVG from base64**

## Error Handling

The backend API provides comprehensive error handling:

- **400 Bad Request** - Invalid input parameters
- **503 Service Unavailable** - LilyPond service not running
- **504 Gateway Timeout** - Rendering took too long (>20s)
- **500 Internal Server Error** - Other errors

## Security

- Input validation on both API and LilyPond service
- Request size limits (512KB for LilyPond source)
- Render timeout (15s in LilyPond service, 20s in API proxy)
- Non-root execution in containers
- Base64 encoding for binary responses

## Troubleshooting

### Fontconfig Cache Issues

Fixed in the current implementation by:
- Setting `FONTCONFIG_FILE=/dev/null` to suppress cache warnings
- Configuring `XDG_CACHE_HOME=/tmp/.fontconfig` for tmpfs-based caching
- Adding `/tmp/.fontconfig` tmpfs mount in docker-compose.yaml

### LilyPond Compilation Errors

If you see "LilyPond compilation failed" errors:

1. Check LilyPond syntax is valid
2. Avoid using `\include` or Scheme expressions (#(...))
3. Check container logs: `sudo docker logs lilypond-service`
4. Common issues:
   - Fontconfig cache: Now handled automatically
   - LilyPond 2.24.0+ uses different safe mode: removed `-dsafe=#t` flag
   - Missing `\version` directive: Add `\version "2.24.0"` at the start

### Service Connection Issues

```bash
# Check if services are running
docker ps | grep lilypond

# Check API logs
docker logs editor-api

# Check LilyPond service logs
docker logs lilypond-service

# Test direct lilypond-service access
curl http://localhost:8787/
```

### CORS Issues

The backend API serves static files and handles API requests. If WebUI is hosted separately, CORS headers may need to be added to the API server.

## Development

### Rebuild Backend API

```bash
cd /home/john/editor/lilypond-service
docker-compose build api
docker-compose up -d api
```

### Local Testing

```bash
# Install dependencies
cd /home/john/editor/server
npm install

# Run locally (without Docker)
NODE_ENV=development LILYPOND_SERVICE_URL=http://localhost:8787 node index.js
```

## Future Improvements

- [ ] Add request rate limiting
- [ ] Implement caching on backend API level
- [ ] Add WebSocket support for real-time rendering
- [ ] Support PNG output format
- [ ] Add template support (minimal vs full layouts)
