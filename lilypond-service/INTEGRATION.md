# Integration Guide: LilyPond Service with Web App

This guide shows how to integrate the LilyPond rendering service with your web application.

## Architecture

```
┌─────────────────┐
│   Web App       │
│  (JavaScript)   │
└────────┬────────┘
         │
         │ 1. GET LilyPond source from WASM
         │ 2. POST to /engrave endpoint
         │
         ├─────────────────────────────────────────┐
         │                                         │
      POST /engrave                      Content-Type: application/json
      {                                  Accept: image/svg+xml
        "ly": "\\version \"2.24.0\"...",
        "format": "svg"
      }
         │                                         │
         ▼                                         ▼
┌─────────────────────────────────────────────────────┐
│   LilyPond Service (Docker Container)               │
│   - Input validation & sanitization                 │
│   - Timeout protection (15s)                        │
│   - SHA-256 caching                                 │
│   - Non-root execution                              │
└─────────────────────────────────────────────────────┘
         │
         │ Render with `lilypond --svg`
         │
         ▼
    ┌─────────────────┐
    │  SVG/PDF Data   │
    └────────┬────────┘
             │
             │ 200 OK + image/svg+xml
             │
             ▼
         ┌─────────────────┐
         │   Web App       │
         │  Display SVG    │
         └─────────────────┘
```

## Frontend Integration

### 1. JavaScript Helper Function

Create a helper function to call the LilyPond service:

```javascript
/**
 * Render LilyPond source to SVG using the rendering service
 * @param {string} lilypondSource - LilyPond source code
 * @param {string} format - Output format: "svg" or "pdf"
 * @param {string} serviceUrl - Base URL of LilyPond service (default: http://localhost:8787)
 * @returns {Promise<Blob>} - SVG or PDF data as Blob
 */
async function renderLilyPondToSVG(
  lilypondSource,
  format = 'svg',
  serviceUrl = 'http://localhost:8787'
) {
  try {
    const response = await fetch(`${serviceUrl}/engrave`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ly: lilypondSource,
        format: format,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Rendering failed: ${error.error}`);
    }

    return await response.blob();
  } catch (err) {
    console.error('LilyPond rendering error:', err);
    throw err;
  }
}
```

### 2. In Your Application (e.g., lilypond-png-tab.js)

```javascript
async function displayLilyPondPreview() {
  try {
    // 1. Get LilyPond source from WASM
    const musicxml = this.editor.wasmModule.exportMusicXML(this.editor.theDocument);
    const result = this.editor.wasmModule.convertMusicXMLToLilyPond(musicxml, null);
    const parsed = JSON.parse(result);
    const lilypondSource = parsed.lilypond_source;

    // 2. Render to SVG using the service
    const svgBlob = await renderLilyPondToSVG(lilypondSource, 'svg');
    const svgUrl = URL.createObjectURL(svgBlob);

    // 3. Display in container
    const container = document.getElementById('lilypond-preview');
    const img = document.createElement('img');
    img.src = svgUrl;
    img.style.maxWidth = '100%';
    img.style.height = 'auto';
    container.innerHTML = '';
    container.appendChild(img);

    // 4. Offer download
    const downloadBtn = document.getElementById('download-svg');
    downloadBtn.onclick = () => {
      const a = document.createElement('a');
      a.href = svgUrl;
      a.download = 'score.svg';
      a.click();
    };
  } catch (err) {
    console.error('Failed to render LilyPond:', err);
    document.getElementById('error-message').textContent = err.message;
  }
}
```

### 3. Error Handling

```javascript
async function renderWithErrorHandling(lilypondSource, format = 'svg') {
  try {
    // Check service health first
    const healthResponse = await fetch('http://localhost:8787/health');
    if (!healthResponse.ok) {
      throw new Error('LilyPond service is unavailable');
    }

    // Render
    const blob = await renderLilyPondToSVG(lilypondSource, format);
    return blob;
  } catch (err) {
    if (err.message.includes('Rendering timeout')) {
      // Timeout: offer to download .ly file instead
      console.warn('Rendering timed out. Offering .ly download...');
      offerLilypondSourceDownload(lilypondSource);
    } else if (err.message.includes('Invalid LilyPond')) {
      // Validation error: show details
      console.error('Invalid LilyPond syntax:', err);
      showSyntaxErrorUI(err.details);
    } else {
      // Service unavailable: suggest fallback
      console.error('Service error:', err);
      showServiceUnavailableUI();
    }
    throw err;
  }
}
```

## Environment Configuration

### Development

Add to your `.env` file:

```bash
LILYPOND_SERVICE_URL=http://localhost:8787
LILYPOND_SERVICE_ENABLED=true
```

In your JavaScript:

```javascript
const LILYPOND_SERVICE_URL = process.env.LILYPOND_SERVICE_URL || 'http://localhost:8787';
const LILYPOND_SERVICE_ENABLED = process.env.LILYPOND_SERVICE_ENABLED !== 'false';
```

### Production

Behind a reverse proxy (e.g., Caddy):

```caddyfile
# Caddy reverse proxy configuration
example.com/api/lilypond {
    reverse_proxy localhost:8787 {
        header_up X-Forwarded-For {http.request.header.X-Forwarded-For}
        header_up X-Forwarded-Proto https

        # Rate limiting
        rate 100/m

        # Timeouts
        timeout 20s
        dial_timeout 5s
    }
}
```

Then use:
```javascript
const LILYPOND_SERVICE_URL = 'https://example.com/api/lilypond';
```

## Deployment

### Docker

Start the service:

```bash
cd lilypond-service
docker-compose up -d
```

Verify it's running:

```bash
curl http://localhost:8787/health
```

### Kubernetes (optional)

Create a deployment:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: lilypond-service
spec:
  replicas: 2
  selector:
    matchLabels:
      app: lilypond-service
  template:
    metadata:
      labels:
        app: lilypond-service
    spec:
      containers:
      - name: lilypond
        image: lilypond-service:latest
        ports:
        - containerPort: 8787
        resources:
          limits:
            cpu: "1"
            memory: "512Mi"
          requests:
            cpu: "500m"
            memory: "256Mi"
        livenessProbe:
          httpGet:
            path: /health
            port: 8787
          initialDelaySeconds: 5
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 8787
          initialDelaySeconds: 5
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: lilypond-service
spec:
  selector:
    app: lilypond-service
  ports:
  - port: 8787
    targetPort: 8787
  type: ClusterIP
```

## Performance Optimization

### 1. Debounce Rendering

```javascript
let renderTimeout;

function debounceRender(lilypondSource, delayMs = 800) {
  clearTimeout(renderTimeout);
  renderTimeout = setTimeout(() => {
    renderWithErrorHandling(lilypondSource, 'svg');
  }, delayMs);
}

// In your editor
editor.on('change', (source) => {
  debounceRender(source);
});
```

### 2. Cache on Client Side

```javascript
const renderCache = new Map();

async function cachedRender(lilypondSource, format = 'svg') {
  const key = `${lilypondSource}:${format}`;
  if (renderCache.has(key)) {
    console.log('Cache hit');
    return renderCache.get(key);
  }

  const blob = await renderWithErrorHandling(lilypondSource, format);
  renderCache.set(key, blob);

  // Clear cache if it grows too large
  if (renderCache.size > 50) {
    const firstKey = renderCache.keys().next().value;
    renderCache.delete(firstKey);
  }

  return blob;
}
```

### 3. Concurrent Rendering

```javascript
async function renderMultipleFormats(lilypondSource) {
  try {
    const [svgBlob, pdfBlob] = await Promise.all([
      renderLilyPondToSVG(lilypondSource, 'svg'),
      renderLilyPondToSVG(lilypondSource, 'pdf'),
    ]);

    return { svgBlob, pdfBlob };
  } catch (err) {
    console.error('Concurrent rendering failed:', err);
    throw err;
  }
}
```

## Fallback Strategy

```javascript
async function renderLilyPondWithFallback(lilypondSource) {
  try {
    // Try to use rendering service
    if (LILYPOND_SERVICE_ENABLED) {
      return await renderLilyPondToSVG(lilypondSource, 'svg');
    }
  } catch (err) {
    console.warn('Service unavailable, falling back...');
  }

  // Fallback: offer .ly file download
  console.log('Offering LilyPond source file for manual compilation');
  offerLilypondSourceDownload(lilypondSource);

  return null;
}
```

## Testing

### Unit Test

```javascript
describe('renderLilyPondToSVG', () => {
  it('should render simple notation', async () => {
    const source = '\\version "2.24.0"\n\\score { \\new Staff { c d e f } }';
    const blob = await renderLilyPondToSVG(source, 'svg');

    expect(blob.type).toBe('image/svg+xml');
    expect(blob.size).toBeGreaterThan(0);
  });

  it('should reject invalid notation', async () => {
    const source = '\\invalid { }';

    try {
      await renderLilyPondToSVG(source, 'svg');
      fail('Should have thrown');
    } catch (err) {
      expect(err.message).toContain('Rendering failed');
    }
  });

  it('should block dangerous directives', async () => {
    const source = '\\include "file.ly"';

    try {
      await renderLilyPondToSVG(source, 'svg');
      fail('Should have thrown');
    } catch (err) {
      expect(err.message).toContain('not allowed');
    }
  });
});
```

## Monitoring

### Prometheus Metrics

Export metrics from the service (optional):

```javascript
app.get('/metrics', (req, res) => {
  const metrics = {
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    renders_total: rendersTotal,
    renders_cached: rendersCached,
    renders_failed: rendersFailed,
    avg_render_time_ms: avgRenderTime,
  };
  res.json(metrics);
});
```

### Log Aggregation

Forward Docker logs to your logging system:

```bash
# View logs
docker-compose logs -f lilypond

# Or configure Docker to use syslog/Splunk/ELK
docker run --log-driver=awslogs \
           --log-opt awslogs-group=/lilypond-service \
           lilypond-service:latest
```

## Security

### In Production

1. **Use HTTPS** - Reverse proxy handles TLS
2. **Rate limit** - Prevent abuse (see Caddy example)
3. **Authenticate** - Add API key validation if needed
4. **Audit logging** - Log all requests for compliance
5. **No direct exposure** - Always use reverse proxy

## Support & Troubleshooting

See [README.md](./README.md) for:
- Troubleshooting
- Performance tuning
- Security model
- Advanced sandboxing
