# LilyPond Rendering Service

A **production-ready**, **sandboxed**, containerized service for converting LilyPond source code to SVG and PDF formats.

## Features

### Security
- ✅ **Non-root execution** (UID 10001) - prevents privilege escalation
- ✅ **Read-only root filesystem** - only `/tmp` is writable (tmpfs)
- ✅ **Input sanitization** - blocks `\include`, Scheme expressions, external files
- ✅ **Process reaping** with tini - handles zombies properly
- ✅ **Resource limits** - CPU 1.0, RAM 512MB
- ✅ **Request timeouts** - 15s default max render time
- ✅ **Request size limits** - 512 KB default max
- ✅ **Immutable output caching** - SHA-256 based

### Features
- **Fast**: Caches rendered output by hash (immutable)
- **Reliable**: Graceful error handling, detailed error messages
- **Observable**: Structured logging, health check endpoint
- **Simple API**: Single `/engrave` endpoint

## Quick Start

### Prerequisites
- Docker & Docker Compose (or Docker Desktop)
- 1 GB disk space (for LilyPond installation)

### Run

```bash
# Build and start the service
docker-compose up -d

# Service will be available at http://localhost:8787
```

### Test

```bash
# Health check
curl http://localhost:8787/health

# Render simple notation to SVG
curl -X POST http://localhost:8787/engrave \
  -H "Content-Type: application/json" \
  -d '{
    "ly": "\\version \"2.24.0\"\n\\score { \\new Staff { c d e f } }",
    "format": "svg"
  }' > output.svg

# Render to PDF
curl -X POST http://localhost:8787/engrave \
  -H "Content-Type: application/json" \
  -d '{
    "ly": "\\version \"2.24.0\"\n\\score { \\new Staff { c d e f } }",
    "format": "pdf"
  }' > output.pdf
```

## API

### `POST /engrave`

Render LilyPond source code to SVG or PDF.

#### Request

```json
{
  "ly": "\\version \"2.24.0\"\n\\score { ... }",
  "format": "svg"
}
```

**Parameters:**
- `ly` (string, required): LilyPond source code
- `format` (string, default: "svg"): Output format - `"svg"` or `"pdf"`

#### Response

**Success (200)**
- Content-Type: `image/svg+xml` or `application/pdf`
- Body: Binary SVG or PDF data

**Validation Error (422)**
```json
{
  "error": "Missing or invalid \"ly\" parameter"
}
```

**LilyPond Compilation Error (400)**
```json
{
  "error": "Invalid LilyPond source",
  "details": [
    "\\include directive is not allowed",
    "..."
  ],
  "stderr": "..."
}
```

**Request Too Large (413)**
```json
{
  "error": "LilyPond source exceeds maximum size (512000 bytes)"
}
```

**Timeout (408)**
```json
{
  "error": "Rendering timeout exceeded"
}
```

**Server Error (500)**
```json
{
  "error": "Server error",
  "message": "..."
}
```

### `GET /health`

Health check endpoint.

```bash
curl http://localhost:8787/health
```

Response:
```json
{
  "status": "ok",
  "uptime": 123.456,
  "memory": {
    "rss": 12345678,
    "heapTotal": 8765432,
    "heapUsed": 3456789,
    "external": 123456
  }
}
```

### `GET /`

Service info and available endpoints.

```bash
curl http://localhost:8787/
```

## Configuration

Environment variables (set in `docker-compose.yaml`):

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 8787 | Server port |
| `MAX_REQUEST_SIZE` | 512 | Max request size in KB |
| `RENDER_TIMEOUT` | 15 | Max render time in seconds |
| `NODE_ENV` | production | Environment |

## Security Model

### Input Validation

The service **blocks** dangerous LilyPond directives:

```lilypond
\include "file.ly"              ❌ File inclusion blocked
#(define x 1)                   ❌ Scheme expressions blocked
#'(some scheme)                 ❌ Scheme data blocked
http://example.com              ❌ External URLs blocked
system("rm -rf /")              ❌ System calls blocked
```

Safe notation is allowed:
```lilypond
\version "2.24.0"               ✅ Version declaration
\score { \new Staff { ... } }   ✅ Score definition
{ c d e f }                     ✅ Notes
\key c \major                   ✅ Key signature
\time 4/4                       ✅ Time signature
```

### Container Isolation

```yaml
# Read-only root filesystem
read_only: true
tmpfs:
  - /tmp:size=64m,mode=1777    # Only /tmp is writable

# Resource limits
cpus: "1.0"                     # Max 1 CPU
memory: 512M                    # Max 512 MB RAM

# Non-root user
USER runner (UID 10001)

# Process management
ENTRYPOINT: tini                # Proper signal handling
```

### Deployment Guardrails

For production deployments:

1. **Reverse Proxy** (nginx/Caddy)
   - Request size caps (512 KB)
   - Rate limiting (e.g., 100 req/min per IP)
   - Request timeouts

2. **Monitoring**
   - Log aggregation (ELK, Datadog, etc.)
   - Alerting on errors, timeouts
   - Metrics collection (Prometheus)

3. **Scaling** (optional)
   - Horizontal scaling with load balancer
   - Cache layer (Redis) for rendered outputs
   - Queue system (Bull, RabbitMQ) for heavy workloads

4. **Advanced Sandboxing** (optional)
   - Seccomp profiles (disable network syscalls)
   - AppArmor confinement
   - gVisor/Kata for multi-tenant scenarios

## Caching

The service caches rendered outputs by SHA-256 hash:

```
Input: LilyPond source + format
  ↓
SHA-256 hash
  ↓
Cache key: /tmp/lilypond-cache/{hash}.{format}
  ↓
If exists: return cached result (instant)
If not: render and cache for future requests
```

Cache hits are marked in logs:
```
[CACHE HIT] /tmp/lilypond-cache/a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6.svg
```

## Logging

All operations are logged with timestamps:

```
[2024-01-15T12:34:56Z] POST /engrave
[RENDER] format=svg, size=245 bytes
[CACHED] /tmp/lilypond-cache/...svg
[2024-01-15T12:34:58Z] POST /engrave
[CACHE HIT] /tmp/lilypond-cache/...svg
```

## Troubleshooting

### Container won't start
```bash
# Check logs
docker-compose logs lilypond

# Common issues:
# - Port 8787 already in use
# - Insufficient disk space
# - Docker daemon not running
```

### Compilation errors
```bash
# Check LilyPond syntax
curl -X POST http://localhost:8787/engrave \
  -H "Content-Type: application/json" \
  -d '{"ly": "\\score { c d e f }", "format": "svg"}'

# Look for error details in response stderr field
```

### Slow rendering
- Check CPU/RAM usage: `docker stats lilypond`
- Look for timeout errors (408 response)
- Consider scaling with multiple instances
- Add reverse proxy with request queuing

### High memory usage
- Check for recursive LilyPond constructs
- Verify caching is working (should reduce re-renders)
- Consider reducing tmpfs size or adding memory limits

## Development

### Local testing (without Docker)

```bash
# Install dependencies
npm install

# Set environment variables
export NODE_ENV=development
export PORT=3000

# Start server
npm start
```

### Building the image locally

```bash
# Build
docker build -t lilypond-service:latest .

# Test
docker run -p 8787:8787 lilypond-service:latest
```

## Performance Benchmarks

On a modest container (1 CPU, 512 MB RAM):

- Simple notation (10 lines): ~500ms
- Multi-stave score (20 lines): ~1-2s
- Complex score (100+ lines): ~5-10s
- Cached hits: <10ms

## License

MIT

## References

- [LilyPond Manual](http://lilypond.org/doc/)
- [Docker Security Best Practices](https://docs.docker.com/engine/security/)
- [OWASP Docker Top 10](https://owasp.org/www-project-container-security/)
