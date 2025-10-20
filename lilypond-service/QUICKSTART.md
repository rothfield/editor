# Quick Start Guide

## 1. Start the Service

```bash
cd /home/john/editor/lilypond-service
docker-compose up -d
```

Check it's running:
```bash
curl http://localhost:8787/health
```

## 2. Test with cURL

```bash
# Simple notation
curl -X POST http://localhost:8787/engrave \
  -H "Content-Type: application/json" \
  -d '{"ly":"\\version \"2.24.0\"\n\\score { \\new Staff { c d e f } }","format":"svg"}' \
  > /tmp/test.svg

# Multi-stave
curl -X POST http://localhost:8787/engrave \
  -H "Content-Type: application/json" \
  -d '{
    "ly":"\\version \"2.24.0\"\n\\score { \\new ChoirStaff << \\new Staff { c d e f } \\new Staff { g a b c } >> }",
    "format":"svg"
  }' > /tmp/test-multi.svg
```

## 3. Integrate with Web App

In your JavaScript:

```javascript
async function renderLilyPond(source) {
  const response = await fetch('http://localhost:8787/engrave', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ly: source, format: 'svg' })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error);
  }

  return await response.blob();
}

// Usage
const svg = await renderLilyPond('\\version "2.24.0"\n\\score { c d e f }');
const url = URL.createObjectURL(svg);
document.querySelector('img').src = url;
```

## 4. Configuration

Environment variables (in docker-compose.yaml):

- `MAX_REQUEST_SIZE`: 512 (KB) - increase for large scores
- `RENDER_TIMEOUT`: 15 (seconds) - increase for complex scores
- `PORT`: 8787 - change if needed

## 5. Deployment

### Local Development
```bash
docker-compose up -d
```

### Production (with reverse proxy)

Use Caddy or nginx to:
- Add HTTPS
- Rate limit requests
- Cache responses
- Add authentication

Example Caddy config:
```
localhost:8787 {
    reverse_proxy 127.0.0.1:8787
}
```

## 6. Monitor

View logs:
```bash
docker-compose logs -f lilypond
```

Check container stats:
```bash
docker stats lilypond-service
```

## 7. Stop

```bash
docker-compose down
```

## Troubleshooting

### Service won't start
```bash
docker-compose logs lilypond
# Check for port conflicts, disk space, or Docker daemon issues
```

### Compilation error
```bash
# The error message will be in the response:
{
  "error": "LilyPond compilation failed",
  "stderr": "... lilypond error output ..."
}
```

### Slow rendering
- Check CPU usage: `docker stats lilypond`
- Consider increasing tmpfs size in docker-compose.yaml
- Add debouncing in web app (800ms minimum)

## For More Information

- `README.md` - Full documentation
- `INTEGRATION.md` - How to integrate with web app
- `ARCHITECTURE.md` - System design overview
