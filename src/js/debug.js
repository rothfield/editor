/**
 * Debug System for Music Notation Editor
 *
 * Provides comprehensive debugging information including document state,
 * performance metrics, Cell details, beat analysis, and system status.
 */

class DebugSystem {
    constructor(editor) {
        this.editor = editor;
        this.isVisible = false;
        this.updateInterval = null;
        this.lastUpdate = 0;

        // Debug data collections
        this.metrics = {
            render: { time: 0, count: 0, avgTime: 0 },
            input: { latency: 0, count: 0, avgLatency: 0 },
            memory: { used: 0, peak: 0, samples: [] }
        };

        // Debug panel elements
        this.panel = null;
        this.tabs = {};
        this.content = {};

        // Bind methods
        this.updateMetrics = this.updateMetrics.bind(this);
        this.handleTabClick = this.handleTabClick.bind(this);
    }

    /**
     * Initialize debug system
     */
    initialize() {
        this.createDebugPanel();
        this.setupEventListeners();
        this.startMetricsCollection();

        console.log('Debug system initialized');
    }

    /**
     * Create debug panel structure
     */
    createDebugPanel() {
        // Create main debug panel
        this.panel = document.createElement('div');
        this.panel.className = 'debug-panel fixed top-4 right-4 w-96 h-128 bg-white border border-gray-300 rounded-lg shadow-lg overflow-hidden hidden';
        this.panel.style.zIndex = '1000';

        // Create header
        const header = document.createElement('div');
        header.className = 'bg-gray-100 border-b border-gray-300 px-4 py-2 flex justify-between items-center';
        header.innerHTML = `
            <h3 class="font-semibold text-sm">Debug Panel</h3>
            <button class="debug-close text-gray-500 hover:text-gray-700">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                </svg>
            </button>
        `;

        // Create tab navigation
        const tabNav = document.createElement('div');
        tabNav.className = 'bg-gray-50 border-b border-gray-200 px-2 py-1 flex space-x-1';

        const tabNames = ['Document', 'Performance', 'Cells', 'Beats', 'System'];
        tabNames.forEach(name => {
            const tab = document.createElement('button');
            tab.className = 'debug-tab px-3 py-1 text-xs rounded hover:bg-gray-200 data-active:bg-blue-500 data-active:text-white';
            tab.dataset.tab = name.toLowerCase();
            tab.textContent = name;
            tabNav.appendChild(tab);
            this.tabs[name.toLowerCase()] = tab;
        });

        // Create content area
        const contentArea = document.createElement('div');
        contentArea.className = 'debug-content h-96 overflow-y-auto p-4 bg-white text-xs';

        // Create content panels for each tab
        this.createDocumentPanel(contentArea);
        this.createPerformancePanel(contentArea);
        this.createCellPanel(contentArea);
        this.createBeatsPanel(contentArea);
        this.createSystemPanel(contentArea);

        // Assemble panel
        this.panel.appendChild(header);
        this.panel.appendChild(tabNav);
        this.panel.appendChild(contentArea);

        // Add to page
        document.body.appendChild(this.panel);

        // Set initial active tab
        this.setActiveTab('document');
    }

    /**
     * Create document debug panel
     */
    createDocumentPanel(container) {
        const panel = document.createElement('div');
        panel.className = 'debug-panel-document hidden';
        panel.innerHTML = `
            <div class="space-y-4">
                <div>
                    <h4 class="font-semibold mb-2">Document State</h4>
                    <div class="bg-gray-50 p-2 rounded space-y-1">
                        <div>Lines: <span class="debug-lines-count font-mono">0</span></div>
                        <div>Cursor: <span class="debug-cursor-pos font-mono">0</span></div>
                        <div>Selection: <span class="debug-selection font-mono">None</span></div>
                        <div>Modified: <span class="debug-modified font-mono">No</span></div>
                    </div>
                </div>

                <div>
                    <h4 class="font-semibold mb-2">Metadata</h4>
                    <div class="bg-gray-50 p-2 rounded space-y-1">
                        <div>Title: <span class="debug-title font-mono">Untitled</span></div>
                        <div>Tonic: <span class="debug-tonic font-mono">C</span></div>
                        <div>Pitch System: <span class="debug-pitch-system font-mono">number</span></div>
                        <div>Tala: <span class="debug-tala font-mono">teental</span></div>
                    </div>
                </div>

                <div>
                    <h4 class="font-semibold mb-2">Document Content</h4>
                    <div class="debug-content-preview bg-gray-50 p-2 rounded font-mono text-xs max-h-32 overflow-y-auto whitespace-pre-wrap"></div>
                </div>
            </div>
        `;

        container.appendChild(panel);
        this.content.document = panel;
    }

    /**
     * Create performance debug panel
     */
    createPerformancePanel(container) {
        const panel = document.createElement('div');
        panel.className = 'debug-panel-performance hidden';
        panel.innerHTML = `
            <div class="space-y-4">
                <div>
                    <h4 class="font-semibold mb-2">Render Performance</h4>
                    <div class="bg-gray-50 p-2 rounded space-y-1">
                        <div>Last Render: <span class="debug-render-time font-mono">0ms</span></div>
                        <div>Render Count: <span class="debug-render-count font-mono">0</span></div>
                        <div>Avg Render: <span class="debug-render-avg font-mono">0ms</span></div>
                    </div>
                </div>

                <div>
                    <h4 class="font-semibold mb-2">Input Performance</h4>
                    <div class="bg-gray-50 p-2 rounded space-y-1">
                        <div>Last Input: <span class="debug-input-latency font-mono">0ms</span></div>
                        <div>Input Count: <span class="debug-input-count font-mono">0</span></div>
                        <div>Avg Input: <span class="debug-input-avg font-mono">0ms</span></div>
                    </div>
                </div>

                <div>
                    <h4 class="font-semibold mb-2">Memory Usage</h4>
                    <div class="bg-gray-50 p-2 rounded space-y-1">
                        <div>Current: <span class="debug-memory-used font-mono">0MB</span></div>
                        <div>Peak: <span class="debug-memory-peak font-mono">0MB</span></div>
                        <div>Cell Count: <span class="debug-cell-count font-mono">0</span></div>
                    </div>
                </div>

                <div>
                    <h4 class="font-semibold mb-2">Performance Graph</h4>
                    <canvas class="debug-perf-chart w-full h-32 bg-gray-50 rounded"></canvas>
                </div>
            </div>
        `;

        container.appendChild(panel);
        this.content.performance = panel;

        // Setup performance chart
        this.setupPerformanceChart();
    }

    /**
     * Create Cell debug panel
     */
    createCellPanel(container) {
        const panel = document.createElement('div');
        panel.className = 'debug-panel-cells hidden';
        panel.innerHTML = `
            <div class="space-y-4">
                <div>
                    <h4 class="font-semibold mb-2">Cell Statistics</h4>
                    <div class="bg-gray-50 p-2 rounded space-y-1">
                        <div>Total Cells: <span class="debug-total-cells font-mono">0</span></div>
                        <div>Temporal Cells: <span class="debug-temporal-cells font-mono">0</span></div>
                        <div>Pitched Cells: <span class="debug-pitched-cells font-mono">0</span></div>
                        <div>Annotation Cells: <span class="debug-annotation-cells font-mono">0</span></div>
                    </div>
                </div>

                <div>
                    <h4 class="font-semibold mb-2">Lane Distribution</h4>
                    <div class="bg-gray-50 p-2 rounded space-y-1">
                        <div>Upper: <span class="debug-lane-upper font-mono">0</span></div>
                        <div>Letter: <span class="debug-lane-letter font-mono">0</span></div>
                        <div>Lower: <span class="debug-lane-lower font-mono">0</span></div>
                        <div>Lyrics: <span class="debug-lane-lyrics font-mono">0</span></div>
                    </div>
                </div>

                <div>
                    <h4 class="font-semibold mb-2">Element Kinds</h4>
                    <div class="bg-gray-50 p-2 rounded space-y-1">
                        <div>Unknown: <span class="debug-kind-unknown font-mono">0</span></div>
                        <div>Pitched: <span class="debug-kind-pitched font-mono">0</span></div>
                        <div>Unpitched: <span class="debug-kind-unpitched font-mono">0</span></div>
                        <div>Text: <span class="debug-kind-text font-mono">0</span></div>
                        <div>Whitespace: <span class="debug-kind-whitespace font-mono">0</span></div>
                    </div>
                </div>

                <div>
                    <h4 class="font-semibold mb-2">Recent Cells</h4>
                    <div class="debug-recent-cells bg-gray-50 p-2 rounded font-mono text-xs max-h-32 overflow-y-auto"></div>
                </div>
            </div>
        `;

        container.appendChild(panel);
        this.content.cells = panel;
    }

    /**
     * Create beats debug panel
     */
    createBeatsPanel(container) {
        const panel = document.createElement('div');
        panel.className = 'debug-panel-beats hidden';
        panel.innerHTML = `
            <div class="space-y-4">
                <div>
                    <h4 class="font-semibold mb-2">Beat Statistics</h4>
                    <div class="bg-gray-50 p-2 rounded space-y-1">
                        <div>Total Beats: <span class="debug-total-beats font-mono">0</span></div>
                        <div>Avg Duration: <span class="debug-avg-beat-duration font-mono">0.0</span></div>
                        <div>Longest Beat: <span class="debug-longest-beat font-mono">0</span></div>
                        <div>Shortest Beat: <span class="debug-shortest-beat font-mono">0</span></div>
                    </div>
                </div>

                <div>
                    <h4 class="font-semibold mb-2">Beat Visualization</h4>
                    <div class="debug-beat-visualization bg-gray-50 p-2 rounded h-16 relative overflow-hidden"></div>
                </div>

                <div>
                    <h4 class="font-semibold mb-2">Beat Details</h4>
                    <div class="debug-beat-details bg-gray-50 p-2 rounded font-mono text-xs max-h-48 overflow-y-auto"></div>
                </div>

                <div>
                    <h4 class="font-semibold mb-2">Slur Information</h4>
                    <div class="debug-slur-info bg-gray-50 p-2 rounded space-y-1">
                        <div>Active Slurs: <span class="debug-slur-count font-mono">0</span></div>
                        <div class="debug-slur-details font-mono text-xs"></div>
                    </div>
                </div>
            </div>
        `;

        container.appendChild(panel);
        this.content.beats = panel;
    }

    /**
     * Create system debug panel
     */
    createSystemPanel(container) {
        const panel = document.createElement('div');
        panel.className = 'debug-panel-system hidden';
        panel.innerHTML = `
            <div class="space-y-4">
                <div>
                    <h4 class="font-semibold mb-2">Application Status</h4>
                    <div class="bg-gray-50 p-2 rounded space-y-1">
                        <div>Initialized: <span class="debug-init-status font-mono">No</span></div>
                        <div>WASM Ready: <span class="debug-wasm-status font-mono">No</span></div>
                        <div>Editor Ready: <span class="debug-editor-status font-mono">No</span></div>
                        <div>Focus State: <span class="debug-focus-state font-mono">None</span></div>
                    </div>
                </div>

                <div>
                    <h4 class="font-semibold mb-2">Browser Info</h4>
                    <div class="bg-gray-50 p-2 rounded space-y-1">
                        <div>User Agent: <span class="debug-ua font-mono text-xs break-all"></span></div>
                        <div>Language: <span class="debug-lang font-mono"></span></div>
                        <div>Platform: <span class="debug-platform font-mono"></span></div>
                    </div>
                </div>

                <div>
                    <h4 class="font-semibold mb-2">Event Listeners</h4>
                    <div class="bg-gray-50 p-2 rounded space-y-1">
                        <div>Keyboard: <span class="debug-kb-listeners font-mono">0</span></div>
                        <div>Mouse: <span class="debug-mouse-listeners font-mono">0</span></div>
                        <div>Focus: <span class="debug-focus-listeners font-mono">0</span></div>
                    </div>
                </div>

                <div>
                    <h4 class="font-semibold mb-2">Console Output</h4>
                    <div class="debug-console-output bg-gray-900 text-green-400 p-2 rounded font-mono text-xs max-h-32 overflow-y-auto"></div>
                    <button class="debug-clear-console mt-2 px-2 py-1 bg-gray-200 rounded text-xs">Clear</button>
                </div>
            </div>
        `;

        container.appendChild(panel);
        this.content.system = panel;

        // Initialize system info
        this.updateSystemInfo();
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Close button
        const closeBtn = this.panel.querySelector('.debug-close');
        closeBtn.addEventListener('click', () => this.hide());

        // Tab navigation
        Object.values(this.tabs).forEach(tab => {
            tab.addEventListener('click', () => this.handleTabClick(tab));
        });

        // Clear console button
        const clearConsoleBtn = this.content.system.querySelector('.debug-clear-console');
        clearConsoleBtn.addEventListener('click', () => this.clearConsoleOutput());

        // Listen to editor events
        if (this.editor) {
            this.setupEditorEventListeners();
        }
    }

    /**
     * Setup editor event listeners for debugging
     */
    setupEditorEventListeners() {
        // Listen for render events
        this.addEventListener('render-complete', (event) => {
            this.metrics.render.time = event.detail.renderTime || 0;
            this.metrics.render.count++;
        });

        // Listen for input events
        this.addEventListener('input-processed', (event) => {
            this.metrics.input.latency = event.detail.latency || 0;
            this.metrics.input.count++;
        });

        // Listen for document changes
        this.addEventListener('document-changed', () => {
            this.updateAllDebugInfo();
        });
    }

    /**
     * Add event listener wrapper
     */
    addEventListener(event, handler) {
        if (this.editor && this.editor.addEventListener) {
            this.editor.addEventListener(event, handler);
        }
    }

    /**
     * Handle tab click
     */
    handleTabClick(tab) {
        const tabName = tab.dataset.tab;
        this.setActiveTab(tabName);
    }

    /**
     * Set active tab
     */
    setActiveTab(tabName) {
        // Update tab states
        Object.values(this.tabs).forEach(tab => {
            tab.classList.remove('data-active:bg-blue-500', 'data-active:text-white');
        });
        this.tabs[tabName].classList.add('data-active:bg-blue-500', 'data-active:text-white');

        // Update content visibility
        Object.values(this.content).forEach(content => {
            content.classList.add('hidden');
        });
        this.content[tabName].classList.remove('hidden');

        // Update content for active tab
        this.updateTabContent(tabName);
    }

    /**
     * Update content for specific tab
     */
    updateTabContent(tabName) {
        switch (tabName) {
            case 'document':
                this.updateDocumentInfo();
                break;
            case 'performance':
                this.updatePerformanceInfo();
                break;
            case 'cells':
                this.updateCellInfo();
                break;
            case 'beats':
                this.updateBeatsInfo();
                break;
            case 'system':
                this.updateSystemInfo();
                break;
        }
    }

    /**
     * Update all debug information
     */
    updateAllDebugInfo() {
        Object.keys(this.content).forEach(tabName => {
            this.updateTabContent(tabName);
        });
    }

    /**
     * Update document information
     */
    updateDocumentInfo() {
        if (!this.editor) return;

        const document = this.editor.document;
        const metadata = this.editor.getDocumentMetadata();

        // Update document state
        this.querySelector('.debug-lines-count').textContent = document?.staves?.length || 0;
        this.querySelector('.debug-cursor-pos').textContent = this.editor.getCursorPosition() || 0;
        this.querySelector('.debug-selection').textContent = 'None'; // TODO: Get selection info
        this.querySelector('.debug-modified').textContent = 'Yes'; // TODO: Track modification state

        // Update metadata
        this.querySelector('.debug-title').textContent = metadata?.title || 'Untitled';
        this.querySelector('.debug-tonic').textContent = metadata?.tonic || 'C';
        this.querySelector('.debug-pitch-system').textContent = metadata?.pitchSystem || 'number';
        this.querySelector('.debug-tala').textContent = metadata?.tala || 'teental';

        // Update content preview
        const contentPreview = this.querySelector('.debug-content-preview');
        if (document && document.staves && document.staves.length > 0) {
            const lineNames = ['upper_line', 'line', 'lower_line', 'lyrics'];
            const content = document.staves.map(stave =>
                lineNames.map(lineName =>
                    stave[lineName].map(cell => cell.grapheme || '').join('')
                ).join(' | ')
            ).join('\n');
            contentPreview.textContent = content;
        } else {
            contentPreview.textContent = '(empty)';
        }
    }

    /**
     * Update performance information
     */
    updatePerformanceInfo() {
        // Calculate averages
        this.metrics.render.avgTime = this.metrics.render.count > 0 ?
            this.metrics.render.time / this.metrics.render.count : 0;
        this.metrics.input.avgLatency = this.metrics.input.count > 0 ?
            this.metrics.input.latency / this.metrics.input.count : 0;

        // Update render metrics
        this.querySelector('.debug-render-time').textContent = `${this.metrics.render.time.toFixed(2)}ms`;
        this.querySelector('.debug-render-count').textContent = this.metrics.render.count;
        this.querySelector('.debug-render-avg').textContent = `${this.metrics.render.avgTime.toFixed(2)}ms`;

        // Update input metrics
        this.querySelector('.debug-input-latency').textContent = `${this.metrics.input.latency.toFixed(2)}ms`;
        this.querySelector('.debug-input-count').textContent = this.metrics.input.count;
        this.querySelector('.debug-input-avg').textContent = `${this.metrics.input.avgLatency.toFixed(2)}ms`;

        // Update memory metrics
        if (performance.memory) {
            const usedMB = (performance.memory.usedJSHeapSize / 1024 / 1024).toFixed(2);
            const peakMB = (performance.memory.totalJSHeapSize / 1024 / 1024).toFixed(2);

            this.querySelector('.debug-memory-used').textContent = `${usedMB}MB`;
            this.querySelector('.debug-memory-peak').textContent = `${peakMB}MB`;
        }

        // Update Cell count
        const cellCount = this.getCellCount();
        this.querySelector('.debug-cell-count').textContent = cellCount;
    }

    /**
     * Update Cell information
     */
    updateCellInfo() {
        if (!this.editor) return;

        const stats = this.getCellStatistics();

        // Update totals
        this.querySelector('.debug-total-cells').textContent = stats.total;
        this.querySelector('.debug-temporal-cells').textContent = stats.temporal;
        this.querySelector('.debug-pitched-cells').textContent = stats.pitched;
        this.querySelector('.debug-annotation-cells').textContent = stats.annotations;

        // Update lane distribution
        this.querySelector('.debug-lane-upper').textContent = stats.lanes.upper || 0;
        this.querySelector('.debug-lane-letter').textContent = stats.lanes.letter || 0;
        this.querySelector('.debug-lane-lower').textContent = stats.lanes.lower || 0;
        this.querySelector('.debug-lane-lyrics').textContent = stats.lanes.lyrics || 0;

        // Update element kinds
        this.querySelector('.debug-kind-unknown').textContent = stats.kinds.unknown || 0;
        this.querySelector('.debug-kind-pitched').textContent = stats.kinds.pitched || 0;
        this.querySelector('.debug-kind-unpitched').textContent = stats.kinds.unpitched || 0;
        this.querySelector('.debug-kind-text').textContent = stats.kinds.text || 0;
        this.querySelector('.debug-kind-whitespace').textContent = stats.kinds.whitespace || 0;

        // Update recent cells
        const recentCells = this.querySelector('.debug-recent-cells');
        if (stats.recent && stats.recent.length > 0) {
            recentCells.innerHTML = stats.recent.map(cell =>
                `<div>${cell.grapheme} [${cell.stave},${cell.lane},${cell.col}] ${cell.kindName}</div>`
            ).join('');
        } else {
            recentCells.textContent = '(no cells)';
        }
    }

    /**
     * Update beats information
     */
    updateBeatsInfo() {
        if (!this.editor) return;

        const beatStats = this.getBeatStatistics();

        // Update beat statistics
        this.querySelector('.debug-total-beats').textContent = beatStats.total;
        this.querySelector('.debug-avg-beat-duration').textContent = beatStats.avgDuration.toFixed(1);
        this.querySelector('.debug-longest-beat').textContent = beatStats.longest;
        this.querySelector('.debug-shortest-beat').textContent = beatStats.shortest;

        // Update beat visualization
        this.updateBeatVisualization(beatStats);

        // Update beat details
        const beatDetails = this.querySelector('.debug-beat-details');
        if (beatStats.details && beatStats.details.length > 0) {
            beatDetails.innerHTML = beatStats.details.map((beat, index) =>
                `<div>Beat ${index + 1}: cols ${beat.start}-${beat.end}, duration ${beat.duration}</div>`
            ).join('');
        } else {
            beatDetails.textContent = '(no beats)';
        }

        // Update slur information
        const slurCount = this.getSlurCount();
        this.querySelector('.debug-slur-count').textContent = slurCount;
        this.querySelector('.debug-slur-details').textContent = slurCount > 0 ?
            `${slurCount} active slur(s)` : '(no slurs)';
    }

    /**
     * Update system information
     */
    updateSystemInfo() {
        // Update application status
        this.querySelector('.debug-init-status').textContent =
            this.editor?.isInitialized ? 'Yes' : 'No';
        this.querySelector('.debug-wasm-status').textContent =
            this.editor?.wasmModule ? 'Yes' : 'No';
        this.querySelector('.debug-editor-status').textContent =
            this.editor?.isReady ? 'Yes' : 'No';
        this.querySelector('.debug-focus-state').textContent =
            document.activeElement?.id || 'None';

        // Update browser info
        this.querySelector('.debug-ua').textContent = navigator.userAgent;
        this.querySelector('.debug-lang').textContent = navigator.language;
        this.querySelector('.debug-platform').textContent = navigator.platform;

        // Update event listeners (approximate)
        this.querySelector('.debug-kb-listeners').textContent = '1'; // Global keyboard handler
        this.querySelector('.debug-mouse-listeners').textContent = '1'; // Global mouse handler
        this.querySelector('.debug-focus-listeners').textContent = '1'; // Global focus handler
    }

    /**
     * Get Cell statistics
     */
    getCellStatistics() {
        const stats = {
            total: 0,
            temporal: 0,
            pitched: 0,
            annotations: 0,
            lanes: { upper: 0, letter: 0, lower: 0, lyrics: 0 },
            kinds: { unknown: 0, pitched: 0, unpitched: 0, text: 0, whitespace: 0 },
            recent: []
        };

        if (!this.editor?.document?.staves) return stats;

        const document = this.editor.document;
        const lineNames = ['upper_line', 'line', 'lower_line', 'lyrics'];
        const laneNames = ['upper', 'letter', 'lower', 'lyrics'];
        const kindNames = ['unknown', 'pitched', 'unpitched', 'upper-annotation', 'lower-annotation', 'text', 'barline', 'breath', 'whitespace'];

        document.staves.forEach((stave, staveIndex) => {
            lineNames.forEach((lineName, laneIndex) => {
                const lane = stave[lineName];
                lane.forEach((cell, cellIndex) => {
                    stats.total++;

                    if (this.isTemporalCell(cell)) {
                        stats.temporal++;
                    }

                    if (cell.kind === 1) { // PitchedElement
                        stats.pitched++;
                    }

                    if (cell.kind === 3 || cell.kind === 4) { // Annotations
                        stats.annotations++;
                    }

                    // Lane statistics
                    const laneName = laneNames[laneIndex] || 'unknown';
                    stats.lanes[laneName] = (stats.lanes[laneName] || 0) + 1;

                    // Kind statistics
                    const kindName = kindNames[cell.kind] || 'unknown';
                    stats.kinds[kindName] = (stats.kinds[kindName] || 0) + 1;

                    // Recent cells (last 10)
                    if (stats.recent.length < 10) {
                        stats.recent.push({
                            grapheme: cell.grapheme,
                            stave: staveIndex,
                            lane: laneIndex,
                            col: cellIndex,
                            kindName: kindName
                        });
                    }
                });
            });
        });

        return stats;
    }

    /**
     * Get beat statistics
     */
    getBeatStatistics() {
        const stats = {
            total: 0,
            avgDuration: 0,
            longest: 0,
            shortest: 0,
            details: []
        };

        if (!this.editor?.document?.staves) return stats;

        const document = this.editor.document;
        let totalDuration = 0;

        document.staves.forEach(stave => {
            if (stave.beats) {
                stave.beats.forEach(beat => {
                    stats.total++;
                    totalDuration += beat.duration || 1;
                    stats.longest = Math.max(stats.longest, beat.width ? beat.width() : 1);
                    stats.shortest = stats.shortest === 0 ?
                        (beat.width ? beat.width() : 1) :
                        Math.min(stats.shortest, beat.width ? beat.width() : 1);

                    stats.details.push({
                        start: beat.start || 0,
                        end: beat.end || 0,
                        duration: beat.duration || 1
                    });
                });
            }
        });

        stats.avgDuration = stats.total > 0 ? totalDuration / stats.total : 0;

        return stats;
    }

    /**
     * Get slur count
     */
    getSlurCount() {
        if (!this.editor?.document?.staves) return 0;

        return this.editor.document.staves.reduce((count, stave) => {
            return count + (stave.slurs ? stave.slurs.length : 0);
        }, 0);
    }

    /**
     * Get total Cell count
     */
    getCellCount() {
        if (!this.editor?.document?.staves) return 0;

        const lineNames = ['upper_line', 'line', 'lower_line', 'lyrics'];
        return this.editor.document.staves.reduce((count, stave) => {
            return count + lineNames.reduce((laneCount, lineName) => {
                return laneCount + stave[lineName].length;
            }, 0);
        }, 0);
    }

    /**
     * Check if cell is temporal
     */
    isTemporalCell(cell) {
        return cell.kind === 1 || cell.kind === 2; // PitchedElement or UnpitchedElement
    }

    /**
     * Update beat visualization
     */
    updateBeatVisualization(beatStats) {
        const visualization = this.querySelector('.debug-beat-visualization');
        visualization.innerHTML = '';

        if (beatStats.details && beatStats.details.length > 0) {
            const maxWidth = Math.max(...beatStats.details.map(b => b.duration));

            beatStats.details.forEach((beat, index) => {
                const beatDiv = document.createElement('div');
                beatDiv.className = 'absolute bg-blue-500 h-4';
                beatDiv.style.left = `${(beat.start / maxWidth) * 100}%`;
                beatDiv.style.width = `${(beat.duration / maxWidth) * 100}%`;
                beatDiv.style.bottom = '4px';
                beatDiv.title = `Beat ${index + 1}: duration ${beat.duration}`;
                visualization.appendChild(beatDiv);
            });
        }
    }

    /**
     * Setup performance chart
     */
    setupPerformanceChart() {
        const canvas = this.querySelector('.debug-perf-chart');
        const ctx = canvas.getContext('2d');

        // Set canvas size
        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;

        // Simple chart setup would go here
        // For POC, we'll just leave it as a placeholder
    }

    /**
     * Start metrics collection
     */
    startMetricsCollection() {
        this.updateInterval = setInterval(() => {
            this.updateMetrics();
        }, 1000);
    }

    /**
     * Update metrics
     */
    updateMetrics() {
        const now = performance.now();
        const deltaTime = now - this.lastUpdate;
        this.lastUpdate = now;

        // Update memory metrics
        if (performance.memory) {
            this.metrics.memory.used = performance.memory.usedJSHeapSize;
            this.metrics.memory.peak = Math.max(this.metrics.memory.peak, this.metrics.memory.used);

            this.metrics.memory.samples.push({
                time: now,
                used: this.metrics.memory.used
            });

            // Keep only last 60 samples (1 minute)
            if (this.metrics.memory.samples.length > 60) {
                this.metrics.memory.samples.shift();
            }
        }

        // Update active tab content
        const activeTab = this.panel.querySelector('.debug-tab[data-active-bg-blue-500]');
        if (activeTab) {
            this.updateTabContent(activeTab.dataset.tab);
        }
    }

    /**
     * Clear console output
     */
    clearConsoleOutput() {
        const consoleOutput = this.querySelector('.debug-console-output');
        consoleOutput.innerHTML = '';
    }

    /**
     * Query selector helper
     */
    querySelector(selector) {
        return this.panel.querySelector(selector);
    }

    /**
     * Show debug panel
     */
    show() {
        this.panel.classList.remove('hidden');
        this.isVisible = true;
        this.updateAllDebugInfo();
    }

    /**
     * Hide debug panel
     */
    hide() {
        this.panel.classList.add('hidden');
        this.isVisible = false;
    }

    /**
     * Toggle debug panel visibility
     */
    toggle() {
        if (this.isVisible) {
            this.hide();
        } else {
            this.show();
        }
    }

    /**
     * Clean up debug system
     */
    destroy() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }

        if (this.panel && this.panel.parentElement) {
            this.panel.parentElement.removeChild(this.panel);
        }

        this.isVisible = false;
    }
}

export { DebugSystem };
export default DebugSystem;