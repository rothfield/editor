# LilyPond Rendering Service - Architecture Overview

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Web Application                              │
│                      (Browser / JavaScript)                          │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                ┌────────────┴────────────┐
                │                         │
        [WASM Module]            [JavaScript]
   (MusicXML → LilyPond)    (HTTP Client)
        GET .ly source          POST /engrave
                │                         │
                └────────────┬────────────┘
                             │
                    POST /engrave
              {
                "ly": "\\version...",
                "format": "svg"
              }
                             │
        ┌────────────────────▼─────────────────────┐
        │   LilyPond Rendering Service             │
        │   (Docker Container - Sandboxed)         │
        │                                          │
        │  ┌──────────────────────────────────┐   │
        │  │  Input Validation & Sanitization │   │
        │  │  - Block \include                │   │
        │  │  - Block Scheme expressions      │   │
        │  │  - Block external URLs           │   │
        │  └────────────┬─────────────────────┘   │
        │               │                         │
        │  ┌────────────▼─────────────────────┐   │
        │  │  SHA-256 Cache Lookup            │   │
        │  │  - If hit: return cached result  │   │
        │  │  - If miss: continue to render   │   │
        │  └────────────┬─────────────────────┘   │
        │               │                         │
        │  ┌────────────▼─────────────────────┐   │
        │  │  Execute lilypond CLI            │   │
        │  │  - lilypond --svg temp.ly        │   │
        │  │  - lilypond --pdf temp.ly        │   │
        │  │  - Timeout: 15 seconds           │   │
        │  │  - CGroup limits: 1 CPU, 512 MB  │   │
        │  └────────────┬─────────────────────┘   │
        │               │                         │
        │  ┌────────────▼─────────────────────┐   │
        │  │  Cache Result                    │   │
        │  │  /tmp/lilypond-cache/{hash}.svg  │   │
        │  └────────────┬─────────────────────┘   │
        │               │                         │
        │  ┌────────────▼─────────────────────┐   │
        │  │  Return Response                 │   │
        │  │  - Content-Type: image/svg+xml   │   │
        │  │  - Status: 200 OK                │   │
        │  └──────────────────────────────────┘   │
        │                                          │
        └────────────────────┬─────────────────────┘
                             │
                    ◄─────── SVG/PDF Data
                    
        ┌────────────────────▼─────────────────────┐
        │   Web Application Display                │
        │   - Inline SVG in DOM                    │
        │   - Download as PNG/PDF                  │
        │   - Show error messages                  │
        └──────────────────────────────────────────┘
```

## Components

### 1. Web Application (Frontend)

**Responsibility**: UI, editing, calling the rendering service

- Display notation in real-time
- Provide export options (SVG, PDF, PNG)
- Show rendering status and errors
- Debounce requests (avoid hammering service)

### 2. WASM Module

**Responsibility**: Convert MusicXML to LilyPond source

- Runs in browser (no network required for conversion)
- Template selection (Minimal/Standard/MultiStave)
- Output: `{ lilypond_source: "...", skipped_elements: [...] }`
- Zero network latency

### 3. LilyPond Rendering Service

**Responsibility**: Render LilyPond to SVG/PDF

- Accepts LilyPond source via HTTP POST
- Validates and sanitizes input
- Executes lilypond CLI in sandboxed container
- Returns SVG/PDF to client
- Caches results for performance

### 4. Docker Container

**Responsibility**: Isolated, secure execution environment

```
┌─────────────────────────────────────┐
│   Debian stable-slim                │
│   ├─ lilypond (music compiler)      │
│   ├─ nodejs (runtime)               │
│   ├─ tini (process reaper)          │
│   └─ server.js (Express app)        │
│                                     │
│   Security Layer:                   │
│   ├─ Non-root user (UID 10001)      │
│   ├─ Read-only root FS              │
│   ├─ /tmp tmpfs only (64 MB)        │
│   ├─ CPU limit: 1 core              │
│   ├─ RAM limit: 512 MB              │
│   └─ Process timeout: 15 seconds    │
└─────────────────────────────────────┘
```

## Data Flow

### Request Path

```
1. User edits notation in web app
   ↓
2. WASM: Convert to MusicXML (if needed)
   ↓
3. WASM: MusicXML → LilyPond (template-based)
   ↓
4. JavaScript: POST LilyPond source to /engrave
   Content: { "ly": "...", "format": "svg" }
   ↓
5. Service: Validate input
   - Check for dangerous directives
   - Check size limit (512 KB)
   ↓
6. Service: SHA-256 hash lookup in cache
   - If HIT: return cached result (instant)
   - If MISS: continue to step 7
   ↓
7. Service: Execute lilypond CLI
   - Write source to /tmp/temp.ly
   - Execute: lilypond --svg /tmp/temp.ly
   - Timeout protection: 15 seconds
   - Resource limits: 1 CPU, 512 MB RAM
   ↓
8. Service: Cache result
   - Write SVG to /tmp/lilypond-cache/{hash}.svg
   ↓
9. Service: Return response
   - Status: 200 OK
   - Content-Type: image/svg+xml
   - Body: SVG data
   ↓
10. Browser: Display SVG
    - Insert into DOM
    - Offer download options
```

### Error Path

```
Invalid Input → Validation Error → 400 Bad Request
                                   error: "Invalid LilyPond source"
                                   details: ["\\include not allowed", ...]

Compilation Error → LilyPond Fails → 400 Bad Request
                                     error: "LilyPond compilation failed"
                                     stderr: "..."

Timeout → Process Killed → 408 Request Timeout
                           error: "Rendering timeout exceeded"

Request Too Large → Size Check → 413 Payload Too Large
                                 error: "Source exceeds max size"

Server Error → Exception → 500 Internal Server Error
                           error: "Server error"
                           message: "..."
```

## Security Model

### Input Validation

**Layer 1: Request Size**
- Max 512 KB (configurable)
- Enforced by Express middleware
- Returns 413 if exceeded

**Layer 2: Format Validation**
- Only "svg" or "pdf" allowed
- Returns 422 if invalid

**Layer 3: Directive Blocking**
- Regex patterns match dangerous directives
- Blocks: `\include`, `#(...)`, external URLs, system calls
- Returns 400 with details if found

### Container Isolation

**Layer 1: Read-Only Filesystem**
- Root FS is read-only
- Only `/tmp` is writable (tmpfs, 64 MB)
- Prevents filesystem tampering

**Layer 2: Resource Limits**
- CPU: 1 core max
- RAM: 512 MB max
- tmpfs: 64 MB max
- Prevents DoS attacks

**Layer 3: Process Timeout**
- Maximum render time: 15 seconds
- Process killed if exceeded
- Returns 408 if timeout

**Layer 4: Non-Root User**
- Runs as `runner` (UID 10001)
- Cannot escalate privileges
- Cannot modify system files

**Layer 5: Process Management**
- tini handles signals correctly
- No PID 1 issues
- Proper zombie reaping

## Performance Optimizations

### Caching

**SHA-256 Based**
```
Input: LilyPond source + format
  ↓
SHA-256("{source}{format}")
  ↓
Cache key: /tmp/lilypond-cache/{hash}.{format}
  ↓
Check if exists
  - If yes: return from cache (instant)
  - If no: render and cache
```

**Example**:
- First request: ~1-2 seconds (render)
- Same request again: <10 ms (cache hit)
- Different notation: ~1-2 seconds (new render)

### Debouncing

Client side (JavaScript):
```javascript
// Don't render on every keystroke
// Wait 800ms after user stops typing
debounceRender(source, 800);
```

Prevents overwhelming the service during active editing.

### Concurrent Rendering

The service can handle multiple requests simultaneously:
```javascript
// Render SVG and PDF at the same time
Promise.all([
  renderLilyPondToSVG(source, 'svg'),
  renderLilyPondToSVG(source, 'pdf')
])
```

## Deployment Scenarios

### Development

```bash
# Local machine
docker-compose up -d
# Service on http://localhost:8787
```

### Staging / Production

```
┌─────────────────────────────────┐
│   Reverse Proxy (nginx/Caddy)   │
│   - HTTPS/TLS termination       │
│   - Rate limiting               │
│   - Request size caps           │
│   - Load balancing (if scaled)  │
└────────────┬────────────────────┘
             │
┌────────────▼────────────────────┐
│   Docker Container (x1-N)       │
│   lilypond-service:latest       │
│   - Internal on port 8787       │
│   - No direct internet access   │
└─────────────────────────────────┘
```

### High-Volume Scenarios

```
┌─────────────────────────────────────┐
│   Reverse Proxy + Rate Limiter      │
│   (nginx with lua-resty)            │
└────────────┬────────────────────────┘
             │
┌────────────▼────────────────────┐
│   Redis Cache Layer             │
│   (distributed caching)         │
└────────────┬────────────────────┘
             │
    ┌────────┴────────┬─────────┬──────────┐
    │                 │         │          │
┌───▼───┐  ┌─────┬──▼──┐  ┌──▼──┐   ┌────▼────┐
│Lily 1 │  │Lily 2    │  │Lily 3│   │Lily N   │
└───────┘  └─────┬────┘  └──────┘   └─────────┘
               Load balanced pool
```

## Monitoring & Observability

### Health Checks

```bash
# Liveness probe
GET /health
→ 200 OK { status: "ok" }

# Readiness probe
GET /
→ 200 OK { service: "LilyPond Rendering Service" }
```

### Logging

All operations logged with timestamp:
```
[2024-01-15T12:34:56Z] POST /engrave
[RENDER] format=svg, size=245 bytes
[CACHED] /tmp/lilypond-cache/...
[2024-01-15T12:34:58Z] POST /engrave
[CACHE HIT] /tmp/lilypond-cache/...
```

### Metrics (Optional)

```
GET /metrics
→ {
    uptime: 123.45,
    memory: {...},
    renders_total: 1234,
    renders_cached: 1100,
    renders_failed: 5,
    avg_render_time_ms: 1200
  }
```

## Dependencies

### Runtime
- Node.js 18+
- Express.js 4.18+

### System
- Debian stable-slim base image
- lilypond (music notation compiler)
- tini (process reaper)

### Docker
- Docker 20.10+
- Docker Compose 1.29+

## Limits & Trade-offs

| Factor | Current | Tunable |
|--------|---------|---------|
| Max request size | 512 KB | ✅ MAX_REQUEST_SIZE env var |
| Render timeout | 15s | ✅ RENDER_TIMEOUT env var |
| RAM limit | 512 MB | ✅ docker-compose.yaml |
| CPU limit | 1 core | ✅ docker-compose.yaml |
| tmpfs size | 64 MB | ✅ docker-compose.yaml |
| Cache size | Limited by tmpfs | ✅ Increase tmpfs |

## Next Steps

1. **Monitor**: Add Prometheus metrics export
2. **Scale**: Add Redis caching for multi-instance deployments
3. **Security**: Add API key authentication
4. **Performance**: Profile lilypond bottlenecks
5. **Integration**: Connect to web app via fetch API
