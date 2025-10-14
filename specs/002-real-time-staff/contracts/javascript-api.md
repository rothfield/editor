# JavaScript API Contract: OSMD Renderer

## Overview

This contract defines the JavaScript API for the OSMD renderer module. This module wraps OpenSheetMusicDisplay library and provides caching, error handling, and performance optimization.

## Module API

### `OSMDRenderer` Class

**Purpose**: Encapsulate OSMD rendering with IndexedDB caching

**Location**: `src/js/osmd-renderer.js`

---

## Constructor

### `new OSMDRenderer(containerId, options)`

**Parameters**:
- `containerId: string` - DOM element ID for rendering target
- `options?: OSMDOptions` - Optional configuration (default values provided)

**OSMDOptions**:
```typescript
interface OSMDOptions {
    backend?: 'svg' | 'canvas';           // Default: 'svg'
    zoom?: number;                        // Default: 0.5 (0.1-2.0)
    autoBeam?: boolean;                   // Default: true
    drawTitle?: boolean;                  // Default: false
    drawComposer?: boolean;               // Default: false
    drawPartNames?: boolean;              // Default: false
    newSystemFromXML?: boolean;           // Default: true
    cacheEnabled?: boolean;               // Default: true
    logLevel?: 'trace'|'debug'|'info'|'warn'|'error'; // Default: 'warn'
}
```

**Example**:
```javascript
const renderer = new OSMDRenderer('staff-notation-container', {
    zoom: 0.5,
    cacheEnabled: true
});
```

**Errors**:
- Throws if `containerId` element not found in DOM
- Throws if OSMD library not loaded (global `opensheetmusicdisplay` undefined)

---

## Methods

### `async render(musicXmlString)`

**Purpose**: Render MusicXML to staff notation (with caching)

**Parameters**:
- `musicXmlString: string` - Valid MusicXML 3.1 document

**Returns**: `Promise<RenderResult>`
```typescript
interface RenderResult {
    success: boolean;
    cached: boolean;         // Whether result came from cache
    renderTime: number;      // Milliseconds for rendering
    cacheTime?: number;      // Milliseconds for cache operations
    error?: string;          // Error message if success=false
}
```

**Behavior**:
1. Calculate content hash of MusicXML
2. Check IndexedDB cache for matching hash
3. If cached: Restore HTML from cache (< 50ms)
4. If not cached: Render with OSMD, store in cache (300-600ms)
5. Return result with timing information

**Example**:
```javascript
const result = await renderer.render(musicXmlString);
if (result.success) {
    console.log(`Rendered in ${result.renderTime}ms (cached: ${result.cached})`);
} else {
    console.error('Render failed:', result.error);
}
```

**Errors** (caught, not thrown):
- Invalid MusicXML → `success: false`, error message set
- OSMD rendering failure → `success: false`, preserves previous render
- Cache read/write failure → Logs warning, continues without cache

**Performance Contract**:
- Cache hit: < 50ms (target), < 100ms (maximum)
- Cache miss (simple score): 100-300ms
- Cache miss (medium score): 300-600ms
- Cache miss (complex score): 600-2000ms

---

### `async clearCache()`

**Purpose**: Clear all cached renders from IndexedDB

**Returns**: `Promise<void>`

**Example**:
```javascript
await renderer.clearCache();
console.log('Cache cleared');
```

**Errors**: None thrown (logs warnings on failure)

---

### `getCacheStats()`

**Purpose**: Get cache performance statistics

**Returns**: `CacheStats`
```typescript
interface CacheStats {
    hits: number;           // Cache hit count
    misses: number;         // Cache miss count
    hitRate: number;        // hits / (hits + misses), 0.0-1.0
    totalRenders: number;   // Total render() calls
    avgCacheHitTime: number;    // Average cache hit time (ms)
    avgCacheMissTime: number;   // Average cache miss time (ms)
}
```

**Example**:
```javascript
const stats = renderer.getCacheStats();
console.log(`Cache hit rate: ${(stats.hitRate * 100).toFixed(1)}%`);
```

---

### `setZoom(level)`

**Purpose**: Change zoom level for future renders

**Parameters**:
- `level: number` - Zoom factor (0.1 to 2.0)

**Returns**: `void`

**Example**:
```javascript
renderer.setZoom(0.75);  // Larger notation
```

**Validation**: Clamps to range [0.1, 2.0] if out of bounds

---

### `destroy()`

**Purpose**: Clean up OSMD instance and event listeners

**Returns**: `void`

**Example**:
```javascript
renderer.destroy();  // Call before removing from DOM
```

**Behavior**:
- Clears container innerHTML
- Nullifies OSMD instance
- Removes any event listeners
- Does NOT clear cache (use `clearCache()` separately)

---

## Caching Implementation

### Cache Key Generation

```javascript
function hashMusicXml(xml) {
    // Simple hash function (FNV-1a)
    let hash = 2166136261;
    for (let i = 0; i < xml.length; i++) {
        hash ^= xml.charCodeAt(i);
        hash *= 16777619;
    }
    return hash.toString(36);
}
```

### IndexedDB Schema

**Database Name**: `osmd-cache`
**Object Store**: `renders`
**Key**: Hash string (e.g., "7x9k2m")
**Value**:
```typescript
interface CacheEntry {
    hash: string;
    html: string;          // Rendered SVG as HTML string
    timestamp: number;     // Date.now() when cached
    size: number;          // html.length in bytes
}
```

### Cache Eviction Strategy

**LRU (Least Recently Used)**:
- Maximum cache entries: 100
- When full: Remove oldest by timestamp
- No time-based expiration (manual clear only)

---

## Error Handling Contract

### Error Categories

#### 1. Initialization Errors (thrown)
```javascript
// OSMD library not loaded
throw new Error('OSMD library not loaded. Include opensheetmusicdisplay script.');

// Container not found
throw new Error(`Container element '#${containerId}' not found`);
```

#### 2. Rendering Errors (not thrown, returned in result)
```javascript
{
    success: false,
    cached: false,
    renderTime: 0,
    error: 'OSMD rendering failed: Invalid MusicXML structure'
}
```

#### 3. Cache Errors (logged, degraded mode)
```javascript
console.warn('Cache read failed, proceeding with render:', error);
// Continues rendering without cache
```

### Error Recovery

**Strategy**: Graceful degradation with preserve-last-render

```javascript
async render(musicXmlString) {
    try {
        await this.osmd.load(musicXmlString);
        await this.osmd.render();

        this.lastSuccessfulRender = this.container.innerHTML;  // Preserve

        return { success: true, cached: false, renderTime };

    } catch (error) {
        console.error('Rendering failed:', error);

        // Preserve previous render (don't clear container)
        return { success: false, cached: false, renderTime: 0, error: error.message };
    }
}
```

---

## Integration with Editor

### Recommended Integration Pattern

```javascript
// In MusicNotationEditor class (editor.js)
class MusicNotationEditor {
    async initialize() {
        // ... existing initialization ...

        // Initialize OSMD renderer
        const { OSMDRenderer } = await import('./osmd-renderer.js');
        this.osmdRenderer = new OSMDRenderer('staff-notation-container', {
            zoom: 0.5,
            cacheEnabled: true
        });

        console.log('OSMD renderer initialized');
    }

    async exportMusicXML() {
        if (!this.wasmModule || !this.theDocument) {
            return null;
        }

        try {
            const musicxml = this.wasmModule.exportMusicXML(this.theDocument);
            console.log(`MusicXML exported: ${musicxml.length} bytes`);
            return musicxml;
        } catch (error) {
            console.error('MusicXML export failed:', error);
            return null;
        }
    }

    async renderStaffNotation() {
        if (!this.osmdRenderer) {
            console.warn('OSMD renderer not initialized');
            return;
        }

        const musicxml = await this.exportMusicXML();
        if (!musicxml) {
            this.showStaffNotationError('Export failed');
            return;
        }

        const result = await this.osmdRenderer.render(musicxml);

        if (result.success) {
            const msg = result.cached ? 'from cache' : 'fresh render';
            console.log(`Staff notation rendered in ${result.renderTime}ms (${msg})`);
        } else {
            this.showStaffNotationError(result.error);
        }
    }

    // Debounced update on document changes
    onDocumentChanged() {
        // ... existing rendering ...

        // Debounce staff notation (100ms)
        clearTimeout(this.staffNotationTimer);
        this.staffNotationTimer = setTimeout(() => {
            if (this.currentTab === 'staff-notation') {
                this.renderStaffNotation();
            }
        }, 100);
    }

    // Render when switching to staff notation tab
    onTabSwitch(tabName) {
        // ... existing tab switching ...

        if (tabName === 'staff-notation') {
            this.renderStaffNotation();

            // Return focus to editor after short delay
            setTimeout(() => {
                this.canvas.focus();
            }, 50);
        }
    }
}
```

---

## Performance Monitoring

### Recommended Instrumentation

```javascript
async render(musicXmlString) {
    const perfMark = `osmd-render-${Date.now()}`;
    performance.mark(`${perfMark}-start`);

    // ... rendering logic ...

    performance.mark(`${perfMark}-end`);
    performance.measure(
        'OSMD Render',
        `${perfMark}-start`,
        `${perfMark}-end`
    );

    const measure = performance.getEntriesByName('OSMD Render')[0];
    console.log(`OSMD render: ${measure.duration.toFixed(2)}ms`);

    // Cleanup marks
    performance.clearMarks(`${perfMark}-start`);
    performance.clearMarks(`${perfMark}-end`);
}
```

### Performance Logging Format

```javascript
// Success - cache hit
"Staff notation rendered in 12.45ms (from cache)"

// Success - cache miss
"Staff notation rendered in 387.23ms (fresh render)"

// Failure
"Staff notation rendering failed: Invalid MusicXML structure"
```

---

## Testing Contract

### Unit Tests (if using Jest/Vitest)

```javascript
describe('OSMDRenderer', () => {
    test('constructor throws if container not found', () => {
        expect(() => new OSMDRenderer('nonexistent')).toThrow();
    });

    test('render succeeds with valid MusicXML', async () => {
        const renderer = new OSMDRenderer('test-container');
        const result = await renderer.render(validMusicXML);
        expect(result.success).toBe(true);
        expect(result.renderTime).toBeGreaterThan(0);
    });

    test('render fails gracefully with invalid MusicXML', async () => {
        const renderer = new OSMDRenderer('test-container');
        const result = await renderer.render('invalid xml');
        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
    });

    test('cache hit is faster than cache miss', async () => {
        const renderer = new OSMDRenderer('test-container');

        const firstRender = await renderer.render(validMusicXML);
        expect(firstRender.cached).toBe(false);

        const secondRender = await renderer.render(validMusicXML);
        expect(secondRender.cached).toBe(true);
        expect(secondRender.renderTime).toBeLessThan(firstRender.renderTime);
    });
});
```

### E2E Tests (Playwright Python)

```python
async def test_staff_notation_basic(page):
    """Test basic staff notation rendering"""
    await page.goto('http://localhost:8080')

    # Type simple notation
    await page.type('.editor-canvas', '1 2 3')

    # Switch to staff notation tab
    await page.click('#tab-staff-notation')

    # Wait for render
    await page.wait_for_selector('#staff-notation-container svg', timeout=2000)

    # Verify SVG rendered
    svg = await page.query_selector('#staff-notation-container svg')
    assert svg is not None

    # Verify performance (< 500ms)
    logs = await page.evaluate('() => console.logs')
    assert any('rendered' in log and 'ms' in log for log in logs)
```

---

## Browser Compatibility

**Supported Browsers**:
- Chrome/Edge 90+ (optimal performance with WebGL)
- Firefox 88+ (good performance)
- Safari 14+ (acceptable performance)

**Required APIs**:
- IndexedDB (for caching)
- ES6 modules (import/export)
- async/await
- Performance API (for timing)
- SVG rendering

**Graceful Degradation**:
- No IndexedDB → Renders work, no caching
- Old browser → Falls back to slower rendering, no optimizations

---

## Security Considerations

### Input Validation
- MusicXML string sanitized by OSMD library
- No innerHTML injection (OSMD controls all DOM creation)
- Cache keys hashed (no user-controlled keys)

### XSS Prevention
- OSMD library handles XML parsing safely
- No eval() or Function() constructors used
- All DOM manipulation via OSMD APIs

### Storage Limits
- IndexedDB quota enforced by browser (~50-100MB typical)
- Cache eviction prevents unbounded growth
- User can clear cache via DevTools or API

---

## Example Usage

### Basic Usage
```javascript
import { OSMDRenderer } from './osmd-renderer.js';

const renderer = new OSMDRenderer('staff-notation-container');

const musicxml = await fetch('example.musicxml').then(r => r.text());
const result = await renderer.render(musicxml);

if (result.success) {
    console.log('Rendered successfully!');
}
```

### With Error Handling
```javascript
try {
    const renderer = new OSMDRenderer('staff-notation-container');

    const result = await renderer.render(musicxml);

    if (!result.success) {
        showError('Rendering failed: ' + result.error);
    }

} catch (error) {
    showError('Initialization failed: ' + error.message);
}
```

### With Performance Monitoring
```javascript
const renderer = new OSMDRenderer('staff-notation-container');

for (let i = 0; i < 10; i++) {
    const result = await renderer.render(musicxml);
    console.log(`Render ${i+1}: ${result.renderTime}ms (cached: ${result.cached})`);
}

const stats = renderer.getCacheStats();
console.log(`Cache hit rate: ${(stats.hitRate * 100).toFixed(1)}%`);
console.log(`Avg cache hit: ${stats.avgCacheHitTime.toFixed(2)}ms`);
console.log(`Avg cache miss: ${stats.avgCacheMissTime.toFixed(2)}ms`);
```
