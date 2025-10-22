# Technote: Static Web + LilyPond Service via Backend Proxy (BFF)

**Last updated:** 2025‑10‑22  
**Status:** Recommended architecture for production; direct browser→LilyPond suitable only for prototypes/internal tools.

---

## TL;DR
Put LilyPond behind your own **Backend‑for‑Frontend (BFF)** and **proxy** it. Do not call LilyPond directly from the browser in production. The BFF enforces auth, validates inputs, applies rate limits, queues work, and serves cached artifacts (PDF/SVG/PNG) via content‑addressable URLs.

---

## Why a Proxy/BFF?
- **Same‑origin simplicity:** Avoid CORS/token dance; one domain for your SPA + API.
- **Security:** Validate/strip dangerous directives (e.g., `\include`, Scheme), cap sizes, pin versions.
- **Resource control:** Timeouts, concurrency limits, back‑pressure, graceful degradation.
- **Caching:** Hash requests and serve cached results without re‑engraving.
- **Evolvability:** Swap LilyPond versions/worker pools transparently; add formats without frontend changes.

---

## High‑Level Architecture
```
Browser SPA ── /api/render ─▶ BFF/Proxy ──▶ Queue ──▶ Worker (LilyPond)
     ▲                 │                              │
     │                 └──── cached? → return URL ◀───┘
     └─ /api/jobs/:id  ────────────────▶ status/json
     └─ /scores/:hash.(pdf|svg|png) ───▶ CDN/Object Storage
```

### Components
- **Static app**: HTML/JS/CSS on CDN.
- **BFF/Proxy**: Node/Go/Rust (choice irrelevant; responsibilities critical).
- **Queue**: Redis/SQS/Rabbit (simple delayed job semantics suffice).
- **Workers**: Containerized LilyPond with strict sandboxing.
- **Storage/CDN**: Immutable artifacts keyed by content hash.

---

## Content‑Addressable Cache Key
```
key = sha256(
  LILYPOND_VERSION + "\n" +
  SOURCE_LY + "\n" +
  FLAGS_JSON + "\n" +
  FONTS_VERSION + "\n" +
  ENV_PROFILE
)
```
Store outputs at `/scores/${key}.{pdf,svg,png}` with `Cache-Control: public, max-age=31536000, immutable`.

---

## API Design (minimal, robust)

### POST /api/render
**Request**
```json
{
  "source": "% LilyPond source here...",
  "format": "pdf",          // pdf | svg | png
  "dpi": 300,                // for raster outputs
  "variant": "v2.24.3",     // optional version pin
  "options": { "paper": "a4", "landscape": false }
}
```
**Responses**
- **200** (cache hit):
```json
{ "url": "/scores/<hash>.pdf", "hash": "<hash>", "cached": true }
```
- **202** (enqueued):
```json
{ "jobId": "<id>", "hash": "<hash>", "cached": false }
```

### GET /api/jobs/:id
```json
{ "status": "queued|running|done|error", "url": "/scores/<hash>.pdf", "error": null }
```

### GET /scores/:hash.(pdf|svg|png)
- Serves immutable artifact from storage/CDN.

> Optional: **SSE/WebSocket** at `/api/stream/jobs/:id` for live updates; keep polling as the default.

---

## BFF Responsibilities Checklist
- [ ] **AuthN/AuthZ** (JWT, mTLS, API keys, etc.)
- [ ] **Input validation** (size limits, forbidden directives, flags allowlist)
- [ ] **Rate limiting** (IP/user key; burst + sustained)
- [ ] **Dedup/caching** (precompute hash; return hit immediately)
- [ ] **Job management** (enqueue, TTL, retries, idempotency key = hash)
- [ ] **Observability** (structured logs, traces, metrics: p95 render time, hit rate)
- [ ] **Error mapping** (user‑friendly 4xx/5xx; surfaced compiler stderr excerpt with throttling)

---

## Worker Sandboxing & Limits
- **Container/VM** per job with:
  - No outbound network, no user mounts
  - Read‑only root; small tmpfs `/tmp` with size limit
  - CPU quota & memory limit (cgroups)
  - **Timeouts** (hard kill on overrun)
  - seccomp/AppArmor/gVisor/Firejail profiles
- **Input hardening**
  - Strip/forbid `\include`, `-d` flags outside allowlist, Scheme blocks by policy
  - Enforce max pages, max staff systems, asset size/type checks
- **Version pinning**
  - Multiple images (e.g., `ly:v2.24.3`, `ly:v2.25.x`) tagged & selectable

---

## Nginx/Ingress Sketch
```nginx
# API proxy
location /api/ {
  proxy_pass http://bff:3001;
  proxy_read_timeout 300s;   # long tails; prefer queue instead of long sync
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}

# Immutable artifacts (or back to storage proxy)
location /scores/ {
  alias /var/www/scores/;    # or proxy to object storage gateway
  add_header Cache-Control "public, max-age=31536000, immutable";
}
```

---

## Local Dev Pattern
- SPA dev server proxies to BFF:
```js
// vite.config.js
export default { server: { proxy: { "/api": "http://localhost:3001" } } }
```
- BFF runs LilyPond **directly** for simplicity (no queue), still computes hash, and writes to a local `scores/` folder.
- Use a mocked job table for `202` flows to keep the client logic realistic.

---

## Sync vs Async Render
- **Sync** (development, tiny scores): `POST /api/render` blocks until result (with upper time limit like 10–15s).
- **Async** (production): always enqueue; return 202; client polls/SSE until done. Sync path can still short‑circuit on cache hits.

---

## Alternatives & When to Use Them
- **Direct browser → LilyPond (CORS)**: acceptable for internal tools, hack days, kiosks on trusted LAN; lacks control and caching.
- **Single monolith**: embed LilyPond in the web server; fine for small deployments but harder to scale/isolate.
- **Client‑side engraving**: for textual preview, render a **fast approximation** in WASM/SVG and defer “true” engraving to the BFF.

---

## Operational Notes
- **Metrics to watch**: cache hit rate, avg/p95 render time, job failure rate, queue depth, artifact egress, unique inputs/day.
- **Cold‑start mitigation**: pre‑warm worker pools; keep common fonts pre‑loaded; cap parallel heavy jobs.
- **Storage hygiene**: GC unreferenced artifacts by LRU + access timestamps; keep a ledger of key→usage.

---

## Security Footguns to Avoid
- Passing raw command‑line flags from users to LilyPond.
- Allowing arbitrary `\include` or Scheme evaluation.
- Mounting user‑controlled directories into the worker.
- Sharing a long‑lived worker across different users’ jobs.

---

## Example Pseudo‑Code (BFF)
```ts
// POST /api/render
const { source, format, dpi, variant, options } = req.body;
validateInput(...);
const hash = computeHash(variant, source, format, dpi, options);
const url = `/scores/${hash}.${extFor(format)}`;
if (await storage.exists(url)) return res.json({ url, hash, cached: true });
const jobId = await queue.enqueue({ hash, source, format, dpi, variant, options });
return res.status(202).json({ jobId, hash, cached: false });
```

---

## FAQ
**Q: Am I gaining anything by avoiding disk (using pipes only)?**  
**A:** For single renders, pipes can shave some I/O, but caching requires durable artifacts anyway. Prefer writing outputs directly to object storage; use tempfs for intermediates if needed.

**Q: Is tmpfs always RAM‑backed?**  
**A:** Yes, tmpfs is memory‑backed (can spill via swap). Use cgroup limits to prevent runaway usage.

**Q: How long should I keep artifacts?**  
**A:** With content‑addressable keys and immutable URLs, you can keep them "forever" or GC by LRU once storage thresholds are reached.

---

## Glossary
- **BFF**: Backend‑for‑Frontend, a service tailored to a specific UI.
- **Content‑addressable storage**: Path/filename derived from a cryptographic hash of inputs; enables perfect dedupe and immutable caching.
- **Immutable artifact**: Output that never changes for a given input hash; safe to cache indefinitely.

---

*End of technote.*

