// OSMD (OpenSheetMusicDisplay) renderer for VexFlow staff notation output
// Implements IndexedDB caching for fast startup (FR-032)
import PlaybackEngine from 'osmd-audio-player';

export class OSMDRenderer {
    constructor(containerId) {
        this.containerId = containerId;
        this.osmd = null;
        this.audioPlayer = null;
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

                // Still need to load MusicXML for audio playback even when using cached visual
                await this.init();
                await this.osmd.load(musicxml);
                if (myToken !== this.renderToken) return; // canceled by newer update

                // Reload audio player with new score if it exists
                await this.reloadAudioPlayerIfNeeded();
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

            // Reload audio player with new score if it exists
            await this.reloadAudioPlayerIfNeeded();
        } catch (e) {
            console.error('[OSMD] Render error:', e);
            document.getElementById(this.containerId).innerHTML =
                '<div style="color:#b00020;padding:20px;">Failed to render staff notation (see console)</div>';
        }
    }

    // Reload audio player with current score (called after render)
    async reloadAudioPlayerIfNeeded() {
        if (this.audioPlayer && this.osmd && this.osmd.Sheet) {
            try {
                console.log('[OSMD] Reloading audio player with updated score...');
                await this.audioPlayer.loadScore(this.osmd);
                console.log('[OSMD] Audio player reloaded with new content');
            } catch (e) {
                console.warn('[OSMD] Failed to reload audio player:', e);
            }
        }
    }

    // Initialize audio player (called on first play, requires user gesture)
    async initAudioPlayer() {
        if (this.audioPlayer) {
            // Already initialized, just reload the score
            console.log('[OSMD] Reloading score into existing audio player...');
            await this.audioPlayer.loadScore(this.osmd);
            console.log('[OSMD] Audio player reloaded. State:', this.audioPlayer.state, 'Ready:', this.audioPlayer.ready);
            console.log('[OSMD] Iteration steps:', this.audioPlayer.iterationSteps);
            return;
        }

        if (!this.osmd || !this.osmd.Sheet) {
            throw new Error('OSMD not initialized or no sheet loaded. Please enter some notes first.');
        }

        console.log('[OSMD] Initializing audio player (first play)...');
        console.log('[OSMD] OSMD instance:', this.osmd);
        console.log('[OSMD] OSMD Sheet:', this.osmd.Sheet);
        console.log('[OSMD] Sheet Instruments:', this.osmd.Sheet.Instruments);
        console.log('[OSMD] Source Measures:', this.osmd.Sheet.SourceMeasures);

        // Check if sheet has actual music content
        if (this.osmd.Sheet.SourceMeasures.length === 0) {
            throw new Error('No measures in sheet. The score may not have loaded properly.');
        }

        this.audioPlayer = new PlaybackEngine();
        console.log('[OSMD] PlaybackEngine created, loading score...');

        await this.audioPlayer.loadScore(this.osmd);
        console.log('[OSMD] Score loaded. State:', this.audioPlayer.state, 'Ready:', this.audioPlayer.ready);

        this.audioPlayer.setBpm(120); // Default tempo
        console.log('[OSMD] Audio player initialized with BPM 120');
        console.log('[OSMD] Available instruments:', this.audioPlayer.availableInstruments.map(i => i.name));
        console.log('[OSMD] Score instruments:', this.audioPlayer.scoreInstruments.map(i => i.Name));
        console.log('[OSMD] Iteration steps:', this.audioPlayer.iterationSteps);
        console.log('[OSMD] Scheduler:', this.audioPlayer.scheduler);
        console.log('[OSMD] Scheduler step queue:', this.audioPlayer.scheduler?.stepQueue);

        // Debug: Check if cursor works
        if (this.osmd.cursor) {
            console.log('[OSMD] Cursor exists:', this.osmd.cursor);
            console.log('[OSMD] Cursor Iterator:', this.osmd.cursor.Iterator);
            console.log('[OSMD] Current voice entries:', this.osmd.cursor.Iterator.CurrentVoiceEntries);
        } else {
            console.error('[OSMD] No cursor found!');
        }
    }
}
