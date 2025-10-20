# CORS Fix for LilyPond Service

## Problem

When the webui (browser) tried to make cross-origin requests to the lilypond-service at `http://localhost:8787/engrave`, browsers blocked the requests with CORS (Cross-Origin Resource Sharing) errors.

**Browser Error:**
```
Access to XMLHttpRequest at 'http://localhost:8787/engrave' from origin 'http://localhost:8080'
has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.
```

## Solution

Added CORS middleware to the lilypond-service Express server to include appropriate CORS headers in all responses.

## Implementation

### File Modified: `lilypond-service/server.js`

Added CORS middleware (lines 54-67) after request size limit middleware:

```javascript
// Middleware: CORS headers for cross-origin requests from webui
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '3600');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }

  next();
});
```

## How It Works

### 1. Preflight Request
When browser makes a POST request with JSON, it first sends an OPTIONS preflight request:

```
OPTIONS /engrave
Host: localhost:8787
Access-Control-Request-Method: POST
Access-Control-Request-Headers: Content-Type
```

### 2. Server Response
Lilypond-service responds with CORS headers:

```
HTTP 200 OK
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type
Access-Control-Max-Age: 3600
```

### 3. Actual Request
Browser then makes the actual POST request:

```
POST /engrave
Host: localhost:8787
Content-Type: application/json

{"ly": "...", "format": "svg"}
```

### 4. Final Response
Server returns response with CORS headers:

```
HTTP 200 OK
Access-Control-Allow-Origin: *
Content-Type: image/svg+xml
[binary SVG data]
```

## CORS Headers Explained

| Header | Value | Meaning |
|--------|-------|---------|
| `Access-Control-Allow-Origin` | `*` | Allow requests from any origin |
| `Access-Control-Allow-Methods` | `GET, POST, OPTIONS` | Allow these HTTP methods |
| `Access-Control-Allow-Headers` | `Content-Type` | Allow Content-Type header in requests |
| `Access-Control-Max-Age` | `3600` | Cache preflight results for 1 hour |

## Security Notes

**Current Configuration:**
- `Access-Control-Allow-Origin: *` - Allows requests from **any origin**
- This is secure for development/local networks
- Suitable because the service is designed for localhost only

**For Production/External Access:**
If exposing lilypond-service to external networks, restrict origins:

```javascript
res.setHeader('Access-Control-Allow-Origin', 'https://example.com');
```

Or restrict to specific origins:

```javascript
const allowedOrigins = [
  'http://localhost:8080',
  'https://music-editor.example.com'
];

const origin = req.headers.origin;
if (allowedOrigins.includes(origin)) {
  res.setHeader('Access-Control-Allow-Origin', origin);
}
```

## Testing

### Verify CORS Headers

```bash
# Send preflight request
curl -i -X OPTIONS http://localhost:8787/engrave \
  -H 'Access-Control-Request-Method: POST'

# Expected response includes:
# Access-Control-Allow-Origin: *
# Access-Control-Allow-Methods: GET, POST, OPTIONS
```

### Browser Test

Open test page in browser:
```
http://localhost:8080/test-lilypond-renderer.html
```

Check browser console - rendering should now work without CORS errors.

### Using curl (includes CORS headers in response)

```bash
curl -i -X POST http://localhost:8787/engrave \
  -H 'Content-Type: application/json' \
  -d '{"ly": "\\version \"2.24.0\" \\score { \\new Staff { c4 d4 } \\layout {} }", "format": "svg"}'

# Response includes CORS headers:
# HTTP/1.1 200 OK
# Access-Control-Allow-Origin: *
# Content-Type: image/svg+xml
# [binary SVG data]
```

## Backwards Compatibility

✅ **No Breaking Changes**
- Non-CORS requests (from curl, Postman, etc.) still work
- CORS headers don't affect non-browser clients
- OPTIONS requests are handled gracefully

## Deployment

### Docker Rebuild

The CORS middleware is built into the Docker image:

```bash
cd lilypond-service
sudo docker-compose build --no-cache lilypond
sudo docker-compose up -d
```

### Verification After Restart

```bash
# Check service is running
sudo docker-compose ps

# Test CORS preflight
curl -i -X OPTIONS http://localhost:8787/engrave

# Test rendering
curl -X POST http://localhost:8787/engrave \
  -H 'Content-Type: application/json' \
  -d '{"ly": "...", "format": "svg"}'
```

## Integration with WebUI

The webui's `lilypond-renderer.js` can now make requests without CORS issues:

```javascript
fetch('http://localhost:8787/engrave', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ ly: source, format: 'svg' })
})
// Now works! Previously would get CORS error
```

## Future Improvements

- [ ] Add environment variable to configure allowed origins
- [ ] Add rate limiting per origin
- [ ] Add request logging for CORS requests
- [ ] Support credentials if needed

## References

- [MDN: CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)
- [Express CORS](https://expressjs.com/en/resources/middleware/cors.html)
- [Preflight Requests](https://developer.mozilla.org/en-US/docs/Glossary/Preflight_request)
