// OSMD (OpenSheetMusicDisplay) renderer for VexFlow staff notation output
// Implements IndexedDB caching for fast startup (FR-032)
export class OSMDRenderer {
    constructor(containerId) {
        this.containerId = containerId;
        this.osmd = null;
        this.renderToken = 0;
        this.cache = null; // IndexedDB cache for rendered staff notation
        this.lastMusicXmlHash = null; // Track last rendered content to skip unnecessary re-renders
        this.initCache();
    }

    // Initialize IndexedDB cache for staff notation renders
    async initCache() {
        try {
            const dbRequest = indexedDB.open('vexflow-staff-notation-cache', 1);

            dbRequest.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('renders')) {
                    db.createObjectStore('renders');
                }
            };

            dbRequest.onsuccess = (e) => {
                this.cache = e.target.result;
                console.log('[OSMD] Cache initialized');
            };

            dbRequest.onerror = (e) => {
                console.warn('[OSMD] Cache init failed, will render without cache', e);
            };
        } catch (e) {
            console.warn('[OSMD] IndexedDB not available', e);
        }
    }

    // Simple hash function for MusicXML content (FR-032b)
    hashMusicXml(musicxml) {
        let hash = 0;
        for (let i = 0; i < musicxml.length; i++) {
            const char = musicxml.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return hash.toString(36); // Base36 for shorter keys
    }

    // Get cached SVG from IndexedDB
    async getCachedRender(hash) {
        if (!this.cache) return null;

        return new Promise((resolve) => {
            try {
                const transaction = this.cache.transaction(['renders'], 'readonly');
                const store = transaction.objectStore('renders');
                const request = store.get(hash);

                request.onsuccess = () => {
                    resolve(request.result || null);
                };

                request.onerror = () => {
                    console.warn('[OSMD] Cache read error');
                    resolve(null);
                };
            } catch (e) {
                console.warn('[OSMD] Cache get failed', e);
                resolve(null);
            }
        });
    }

    // Store rendered SVG in IndexedDB
    async setCachedRender(hash, svg) {
        if (!this.cache) return;

        try {
            const transaction = this.cache.transaction(['renders'], 'readwrite');
            const store = transaction.objectStore('renders');
            store.put(svg, hash);
        } catch (e) {
            console.warn('[OSMD] Cache write failed', e);
        }
    }

    async init() {
        if (!this.osmd) {
            this.osmd = new opensheetmusicdisplay.OpenSheetMusicDisplay(this.containerId, {
                backend: 'svg',
                drawingParameters: 'default',
                autoBeam: true,
                drawTitle: true,
                drawSubtitle: false,
                drawComposer: false,
                drawLyricist: false,
                drawPartNames: false,
                drawPartAbbreviations: false,
                drawCredits: false,
                drawMetronomeMarks: false,
                newSystemFromXML: true  // Respect <print new-system="yes"/> directives
            });

            this.osmd.setLogLevel('warn');

            // Adjust spacing parameters
            const engravingRules = this.osmd.EngravingRules;
            if (engravingRules) {
                engravingRules.MinimumDistanceBetweenNotes = 2.0;
                engravingRules.MinimumNoteDistance = 2.0;
            }
        }
    }

    async render(musicxml) {
        const myToken = ++this.renderToken;
        const hash = this.hashMusicXml(musicxml);

        // Skip if unchanged (dirty flag check - e.g., arrow key navigation)
        if (hash === this.lastMusicXmlHash) {
            console.log('[OSMD] MusicXML unchanged, skipping render');
            return;
        }

        try {
            // Check cache first (FR-032a: display cached preview on load)
            const cachedSvg = await this.getCachedRender(hash);
            if (cachedSvg) {
                if (myToken !== this.renderToken) return; // canceled by newer update
                document.getElementById(this.containerId).innerHTML = cachedSvg;
                this.lastMusicXmlHash = hash; // Track what we rendered
                console.log('[OSMD] Rendered from cache (<50ms)');
                return;
            }

            // Cache miss - perform full render (FR-032c: invalidate on content change)
            console.log('[OSMD] Cache miss, rendering...');
            await this.init();
            await this.osmd.load(musicxml);
            if (myToken !== this.renderToken) return; // canceled by newer update

            this.osmd.Zoom = 0.5;
            await this.osmd.render();

            // Store rendered SVG in cache
            const container = document.getElementById(this.containerId);
            const renderedSvg = container.innerHTML;
            await this.setCachedRender(hash, renderedSvg);

            this.lastMusicXmlHash = hash; // Track what we rendered
            console.log('[OSMD] Rendered successfully and cached');
        } catch (e) {
            console.error('[OSMD] Render error:', e);
            document.getElementById(this.containerId).innerHTML =
                '<div style="color:#b00020;padding:20px;">Failed to render staff notation (see console)</div>';
        }
    }
}
