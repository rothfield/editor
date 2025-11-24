// OSMD (OpenSheetMusicDisplay) renderer for VexFlow staff notation output
// Implements IndexedDB caching for fast startup (FR-032)
import PlaybackEngine from 'osmd-audio-player';
import logger, { LOG_CATEGORIES } from './logger.js';

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
                logger.info(LOG_CATEGORIES.OSMD, 'Cache initialized');
            };

            dbRequest.onerror = (e) => {
                logger.warn(LOG_CATEGORIES.OSMD, 'Cache init failed, will render without cache', { error: e });
            };
        } catch (e) {
            logger.warn(LOG_CATEGORIES.OSMD, 'IndexedDB not available', { error: e });
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
                    logger.warn(LOG_CATEGORIES.OSMD, 'Cache read error');
                    resolve(null);
                };
            } catch (e) {
                logger.warn(LOG_CATEGORIES.OSMD, 'Cache get failed', { error: e });
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
            logger.warn(LOG_CATEGORIES.OSMD, 'Cache write failed', { error: e });
        }
    }

    // Clear cached render for a specific hash
    async clearCachedRender(hash) {
        if (!this.cache) return;

        try {
            const transaction = this.cache.transaction(['renders'], 'readwrite');
            const store = transaction.objectStore('renders');
            store.delete(hash);
            logger.info(LOG_CATEGORIES.OSMD, 'Cleared cache for hash', { hash });
        } catch (e) {
            logger.warn(LOG_CATEGORIES.OSMD, 'Cache clear failed', { error: e });
        }
    }

    // Clear all cached renders
    async clearAllCache() {
        if (!this.cache) return;

        try {
            const transaction = this.cache.transaction(['renders'], 'readwrite');
            const store = transaction.objectStore('renders');
            store.clear();
            logger.info(LOG_CATEGORIES.OSMD, 'Cleared all cached renders');
        } catch (e) {
            logger.warn(LOG_CATEGORIES.OSMD, 'Cache clear all failed', { error: e });
        }
    }

    async init() {
        if (!this.osmd) {
            this.osmd = new opensheetmusicdisplay.OpenSheetMusicDisplay(this.containerId, {
                backend: 'svg',
                drawingParameters: 'default',
                autoBeam: true,
                drawTitle: false,
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
            logger.debug(LOG_CATEGORIES.OSMD, 'MusicXML unchanged, skipping render');
            return;
        }

        try {
            // **CRITICAL**: Clear container at the START to prevent duplication
            // This prevents accumulated renders if multiple render() calls are queued
            const container = document.getElementById(this.containerId);
            if (container) {
                container.innerHTML = '';
            }

            // Check cache first (FR-032a: display cached preview on load)
            const cachedSvg = await this.getCachedRender(hash);
            if (cachedSvg) {
                if (myToken !== this.renderToken) return; // canceled by newer update

                // **CRITICAL FIX**: Initialize OSMD first (for audio playback)
                // We MUST do this BEFORE setting cached SVG, then clear the DOM it adds
                await this.init();
                // Clear any DOM elements that init() may have added
                container.innerHTML = '';
                // Set cached SVG
                container.innerHTML = cachedSvg;

                // Load MusicXML into OSMD for audio processing (without re-rendering)
                await this.osmd.load(musicxml);
                if (myToken !== this.renderToken) return; // canceled by newer update

                this.lastMusicXmlHash = hash; // Track what we rendered
                logger.debug(LOG_CATEGORIES.OSMD, 'Rendered from cache');

                // Reload audio player with new score if it exists
                await this.reloadAudioPlayerIfNeeded();
                return;
            }

            // Cache miss - perform full render (FR-032c: invalidate on content change)
            logger.debug(LOG_CATEGORIES.OSMD, 'Cache miss, rendering...');

            await this.init();
            await this.osmd.load(musicxml);
            if (myToken !== this.renderToken) return; // canceled by newer update

            this.osmd.Zoom = 0.75;  // Increased from 0.5 (1.5x bigger)
            await this.osmd.render();

            // Store rendered SVG in cache
            // (container already obtained above before clearing)
            const renderedSvg = container.innerHTML;
            await this.setCachedRender(hash, renderedSvg);

            this.lastMusicXmlHash = hash; // Track what we rendered
            logger.debug(LOG_CATEGORIES.OSMD, 'Rendered successfully and cached');

            // Reload audio player with new score if it exists
            await this.reloadAudioPlayerIfNeeded();
        } catch (e) {
            logger.error(LOG_CATEGORIES.OSMD, 'Render error', { error: e });
        }
    }

    // Reload audio player with current score (called after render)
    async reloadAudioPlayerIfNeeded() {
        if (this.audioPlayer && this.osmd && this.osmd.Sheet) {
            try {
                logger.debug(LOG_CATEGORIES.OSMD, 'Reloading audio player with updated score...');
                await this.audioPlayer.loadScore(this.osmd);
                logger.debug(LOG_CATEGORIES.OSMD, 'Audio player reloaded with new content');
            } catch (e) {
                logger.warn(LOG_CATEGORIES.OSMD, 'Failed to reload audio player', { error: e });
            }
        }
    }

    // Initialize audio player (called on first play, requires user gesture)
    async initAudioPlayer() {
        if (this.audioPlayer) {
            // Already initialized, just reload the score
            logger.debug(LOG_CATEGORIES.OSMD, 'Reloading score into existing audio player...');
            await this.audioPlayer.loadScore(this.osmd);
            logger.debug(LOG_CATEGORIES.OSMD, 'Audio player reloaded', { state: this.audioPlayer.state, ready: this.audioPlayer.ready });
            logger.debug(LOG_CATEGORIES.OSMD, 'Iteration steps', { steps: this.audioPlayer.iterationSteps });
            return;
        }

        if (!this.osmd || !this.osmd.Sheet) {
            throw new Error('OSMD not initialized or no sheet loaded. Please enter some notes first.');
        }

        logger.info(LOG_CATEGORIES.OSMD, 'Initializing audio player (first play)...');
        logger.debug(LOG_CATEGORIES.OSMD, 'OSMD instance details', {
            osmdInstance: this.osmd,
            osmdSheet: this.osmd.Sheet,
            sheetInstruments: this.osmd.Sheet.Instruments,
            sourceMeasures: this.osmd.Sheet.SourceMeasures
        });

        // Check if sheet has actual music content
        if (this.osmd.Sheet.SourceMeasures.length === 0) {
            throw new Error('No measures in sheet. The score may not have loaded properly.');
        }

        this.audioPlayer = new PlaybackEngine();
        logger.debug(LOG_CATEGORIES.OSMD, 'PlaybackEngine created, loading score...');

        await this.audioPlayer.loadScore(this.osmd);
        logger.debug(LOG_CATEGORIES.OSMD, 'Score loaded', { state: this.audioPlayer.state, ready: this.audioPlayer.ready });

        this.audioPlayer.setBpm(120); // Default tempo
        logger.info(LOG_CATEGORIES.OSMD, 'Audio player initialized with BPM 120');
        logger.debug(LOG_CATEGORIES.OSMD, 'Audio player details', {
            availableInstruments: this.audioPlayer.availableInstruments.map(i => i.name),
            scoreInstruments: this.audioPlayer.scoreInstruments.map(i => i.Name),
            iterationSteps: this.audioPlayer.iterationSteps,
            scheduler: this.audioPlayer.scheduler,
            schedulerStepQueue: this.audioPlayer.scheduler?.stepQueue
        });

        // Debug: Check if cursor works
        if (this.osmd.cursor) {
            logger.debug(LOG_CATEGORIES.OSMD, 'Cursor exists', { exists: !!this.osmd.cursor });
            logger.debug(LOG_CATEGORIES.OSMD, 'Cursor Iterator', { iterator: this.osmd.cursor.Iterator });
            logger.debug(LOG_CATEGORIES.OSMD, 'Current voice entries', { entries: this.osmd.cursor.Iterator.CurrentVoiceEntries });
        } else {
            logger.error(LOG_CATEGORIES.OSMD, 'No cursor found!');
        }
    }
}
