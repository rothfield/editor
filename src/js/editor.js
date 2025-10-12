/**
 * Music Notation Editor - Core Editor Functionality
 *
 * This class provides the core editor functionality with WASM integration,
 * document management, and basic event handling for the Music Notation Editor POC.
 */

import DOMRenderer from './renderer.js';
import logger, { LOG_CATEGORIES } from './logger.js';

class MusicNotationEditor {
    constructor(canvasElement) {
        this.canvas = canvasElement;
        this.wasmModule = null;
        this.document = null;
        this.renderer = null;
        this.eventHandlers = new Map();
        this.isInitialized = false;

        // Performance monitoring
        this.performanceMetrics = {
            typingLatency: [],
            beatDerivation: [],
            renderTime: [],
            focusActivation: [],
            navigationLatency: [],
            selectionLatency: [],
            commandLatency: [], // Musical command performance
        };

        // Initialize performance monitoring
        this.startPerformanceMonitoring();
    }

    /**
     * Initialize the editor with WASM module
     */
    async initialize() {
        try {
            console.log('Initializing Music Notation Editor...');

            // Load WASM module
            const startTime = performance.now();
            const wasmModule = await import('/dist/pkg/editor_wasm.js');

            // Initialize WASM
            await wasmModule.default();

            // Initialize WASM components
            this.wasmModule = {
                parser: new wasmModule.CellParser(),
                beatDeriver: new wasmModule.BeatDeriver(),
                layoutRenderer: new wasmModule.LayoutRenderer(16),
                graphemeSegmenter: new wasmModule.GraphemeSegmenter(),
                // New recursive descent API
                insertCharacter: wasmModule.insertCharacter,
                parseText: wasmModule.parseText,
                deleteCharacter: wasmModule.deleteCharacter,
                applyOctave: wasmModule.applyOctave
            };

            const loadTime = performance.now() - startTime;
            console.log(`WASM module loaded in ${loadTime.toFixed(2)}ms`);

            // Initialize renderer
            this.renderer = new DOMRenderer(this.canvas);

            // Setup event handlers
            this.setupEventHandlers();

            // Create initial empty document
            await this.createNewDocument();

            this.isInitialized = true;
            console.log('Music Notation Editor initialized successfully');

            // Show ready state
            this.updatePerformanceIndicator('ready');

        } catch (error) {
            console.error('Failed to initialize editor:', error);
            this.showError('Failed to initialize music notation engine');
            throw error;
        }
    }

    /**
     * Create a new empty document
     */
    async createNewDocument() {
        const emptyDoc = {
            metadata: {
                title: "Untitled Document",
                pitch_system: 1, // Number system
                created_at: new Date().toISOString()
            },
            lines: [{
                label: "",
                lanes: [[], [], [], []], // Empty lanes
                metadata: {},
                beats: [],
                slurs: []
            }],
            state: {
                cursor: { line: 0, lane: 1, column: 0 },
                selection: null,
                has_focus: false
            }
        };

        await this.loadDocument(emptyDoc);
    }

    /**
     * Load document from JSON string
     */
    async loadDocument(jsonString) {
        try {
            if (this.wasmModule) {
                this.document = typeof jsonString === 'string' ? JSON.parse(jsonString) : jsonString;
                await this.render();
                this.updateDocumentDisplay();
            }
        } catch (error) {
            console.error('Failed to load document:', error);
            this.showError('Failed to load document');
            throw error;
        }
    }

    /**
     * Save document to JSON string
     */
    async saveDocument() {
        try {
            return JSON.stringify(this.document);
        } catch (error) {
            console.error('Failed to save document:', error);
            this.showError('Failed to save document');
            throw error;
        }
    }

    /**
     * Insert text at current cursor position using recursive descent parser
     */
    async insertText(text) {
        if (!this.isInitialized || !this.wasmModule) {
            logger.warn(LOG_CATEGORIES.EDITOR, 'insertText called before initialization');
            return;
        }

        logger.time('insertText', LOG_CATEGORIES.EDITOR);
        const cursorPos = this.getCursorPosition();
        const pitchSystem = this.getCurrentPitchSystem();

        logger.info(LOG_CATEGORIES.EDITOR, 'Inserting text', {
            text,
            cursorPos,
            pitchSystem: this.getPitchSystemName(pitchSystem)
        });

        const startTime = performance.now();

        try {

            if (this.document && this.document.lines && this.document.lines.length > 0) {
                const line = this.document.lines[0];
                let letterLane = line.lanes[1]; // Letter lane

                logger.debug(LOG_CATEGORIES.PARSER, 'Processing characters', {
                    charCount: text.length,
                    initialLaneSize: letterLane.length
                });

                // Insert each character using recursive descent parser
                let currentPos = cursorPos;
                for (const char of text) {
                    const lengthBefore = letterLane.length;

                    logger.debug(LOG_CATEGORIES.PARSER, `Inserting char '${char}'`, {
                        position: currentPos,
                        laneSizeBefore: lengthBefore
                    });

                    // Call WASM recursive descent API
                    const updatedCells = this.wasmModule.insertCharacter(
                        letterLane,
                        char,
                        currentPos,
                        pitchSystem
                    );

                    const lengthAfter = updatedCells.length;

                    // Update letter lane with combined cells
                    line.lanes[1] = updatedCells;
                    letterLane = updatedCells;

                    // Adjust cursor based on actual change in cell count
                    // If cells combined, length might not increase by 1
                    const cellDelta = lengthAfter - lengthBefore;
                    logger.trace(LOG_CATEGORIES.PARSER, `Cell delta: ${cellDelta}`, {
                        lengthBefore,
                        lengthAfter
                    });
                    currentPos += cellDelta;
                }

                // Update cursor position
                logger.debug(LOG_CATEGORIES.CURSOR, 'Updating cursor position', {
                    from: cursorPos,
                    to: currentPos
                });
                this.setCursorPosition(currentPos);
            }

            await this.render();
            this.updateDocumentDisplay();

            const endTime = performance.now();
            const duration = endTime - startTime;
            this.recordPerformanceMetric('typingLatency', duration);

            logger.timeEnd('insertText', LOG_CATEGORIES.EDITOR, { duration: `${duration.toFixed(2)}ms` });

        } catch (error) {
            logger.error(LOG_CATEGORIES.EDITOR, 'Failed to insert text', {
                error: error.message,
                stack: error.stack
            });
            console.error('Failed to insert text:', error);
            this.showError('Failed to insert text');
        }
    }

    /**
     * Parse musical notation text with real-time processing using recursive descent
     */
    async parseText(text) {
        if (!this.isInitialized || !this.wasmModule) {
            return;
        }

        const startTime = performance.now();

        try {
            // Validate input before parsing
            if (!this.validateNotationInput(text)) {
                console.warn('Invalid notation input:', text);
                this.showError('Invalid musical notation');
                return;
            }

            const pitchSystem = this.getCurrentPitchSystem();

            // Parse text using WASM recursive descent parser
            if (this.document && this.document.lines && this.document.lines.length > 0) {
                const cells = this.wasmModule.parseText(text, pitchSystem);
                const line = this.document.lines[0];
                line.lanes[1] = cells; // Replace letter lane with parsed cells
            }

            // Extract beats for visualization
            await this.extractAndRenderBeats(text);

            // Render updated document
            await this.render();
            this.updateDocumentDisplay();

            const endTime = performance.now();
            this.recordPerformanceMetric('beatDerivation', endTime - startTime);

            // Log successful parsing
            this.addToConsoleLog(`Parsed notation: "${text}"`);

        } catch (error) {
            console.error('Failed to parse text:', error);
            this.showError('Failed to parse musical notation');
        }
    }

    /**
     * Validate notation input before processing
     */
    validateNotationInput(text) {
        if (!text || text.trim().length === 0) {
            return true; // Empty input is valid
        }

        // Basic validation - allow number system, western system, and common notation elements
        const validPatterns = [
            /^[1234567#b\s|]+$/, // Number system
            /^[cdefgabCDEFGAB#b\s|]+$/, // Western system
            /^[|\-\s,']+$/ // Barlines, dashes, breath marks
        ];

        // Remove whitespace for validation
        const cleanText = text.replace(/\s+/g, '');

        return validPatterns.some(pattern => pattern.test(cleanText)) || cleanText.length === 0;
    }

    /**
     * Extract and render beats from notation
     */
    async extractAndRenderBeats(text) {
        try {
            // Simple beat extraction - identify temporal segments
            const beats = this.extractTemporalSegments(text);

            // Update beat visualization
            this.updateBeatVisualization(beats);

            this.addToConsoleLog(`Extracted ${beats.length} beat(s) from notation`);

        } catch (error) {
            console.error('Failed to extract beats:', error);
        }
    }

    /**
     * Extract temporal segments from notation text
     */
    extractTemporalSegments(text) {
        const segments = [];
        let currentSegment = '';
        let inBeat = false;

        for (let i = 0; i < text.length; i++) {
            const char = text[i];

            // Check if character starts or ends a beat
            if (this.isTemporalChar(char) || this.isAccidental(char)) {
                if (!inBeat) {
                    // Start new beat
                    if (currentSegment.trim()) {
                        segments.push(currentSegment.trim());
                    }
                    currentSegment = char;
                    inBeat = true;
                } else {
                    currentSegment += char;
                }
            } else if (this.isBeatSeparator(char)) {
                // End current beat
                if (currentSegment.trim()) {
                    segments.push(currentSegment.trim());
                }
                currentSegment = '';
                inBeat = false;
            } else {
                // Non-temporal character, end beat
                if (currentSegment.trim()) {
                    segments.push(currentSegment.trim());
                }
                currentSegment = char;
                inBeat = false;
            }
        }

        // Add final segment if exists
        if (currentSegment.trim()) {
            segments.push(currentSegment.trim());
        }

        return segments.filter(segment => segment.length > 0);
    }

    /**
     * Check if character is temporal (musical note)
     */
    isTemporalChar(char) {
        return /[1234567cdefgabCDEFGAB]/.test(char);
    }

    /**
     * Check if character is an accidental
     */
    isAccidental(char) {
        return /[#b]/.test(char);
    }

    /**
     * Check if character separates beats
     */
    isBeatSeparator(char) {
        return /[|\s]/.test(char);
    }

    /**
     * Update beat visualization in the DOM
     */
    updateBeatVisualization(beats) {
        const beatContainer = document.getElementById('beat-visualization');
        if (!beatContainer) return;

        beatContainer.innerHTML = '';

        beats.forEach((beat, index) => {
            const beatElement = document.createElement('div');
            beatElement.className = 'beat-indicator';
            beatElement.textContent = `Beat ${index + 1}: ${beat}`;
            beatElement.style.cssText = `
                font-size: 10px;
                color: #666;
                margin: 2px;
                padding: 2px 4px;
                background: #f0f0f0;
                border-radius: 2px;
            `;

            beatContainer.appendChild(beatElement);
        });
    }

    /**
     * Delete text at specified range
     */
    async deleteRange(start, end) {
        if (!this.isInitialized || !this.wasmModule) {
            return;
        }

        try {
            // Simple deletion for POC - manual array manipulation
            if (this.document && this.document.lines && this.document.lines.length > 0) {
                const line = this.document.lines[0];
                const letterLane = line.lanes[1]; // Letter lane

                // Delete cells in range
                letterLane.splice(start, end - start);
            }

            this.setCursorPosition(start);
            await this.render();
            this.updateDocumentDisplay();
        } catch (error) {
            console.error('Failed to delete range:', error);
            this.showError('Failed to delete selection');
        }
    }

    /**
     * Get current cursor position
     */
    getCursorPosition() {
        if (this.document && this.document.state) {
            return this.document.state.cursor.column;
        }
        return 0;
    }

    /**
     * Set cursor position
     */
    setCursorPosition(position) {
        if (this.document && this.document.state) {
            this.document.state.cursor.column = position;
            this.updateCursorPositionDisplay();
            this.updateCursorVisualPosition();
        }
    }

    /**
     * Convert pitch between systems with enhanced functionality
     */
    async convertPitchSystem(pitch, fromSystem, toSystem) {
        if (!this.isInitialized || !this.wasmModule) {
            return pitch;
        }

        try {
            // Stub implementation for POC - pitch conversion not yet implemented
            this.addToConsoleLog(`Pitch system conversion not yet implemented (${this.getPitchSystemName(fromSystem)} to ${this.getPitchSystemName(toSystem)})`);
            return pitch;
        } catch (error) {
            console.error('Failed to convert pitch system:', error);
            return pitch;
        }
    }

    /**
     * Get pitch system name from enum value
     */
    getPitchSystemName(system) {
        const names = {
            0: 'Unknown',
            1: 'Number',
            2: 'Western',
            3: 'Sargam',
            4: 'Bhatkhande',
            5: 'Tabla'
        };
        return names[system] || 'Unknown';
    }

    /**
     * Set document pitch system
     */
    async setPitchSystem(system) {
        try {
            const state = await this.saveDocument();
            const doc = JSON.parse(state);

            if (doc.metadata) {
                doc.metadata.pitch_system = system;
                await this.loadDocument(JSON.stringify(doc));
                this.addToConsoleLog(`Document pitch system set to: ${this.getPitchSystemName(system)}`);
            }
        } catch (error) {
            console.error('Failed to set pitch system:', error);
            this.showError('Failed to set pitch system');
        }
    }

    /**
     * Get current pitch system
     */
    getCurrentPitchSystem() {
        if (this.document && this.document.metadata) {
            return this.document.metadata.pitch_system || 1; // Default to Number system
        }
        return 1;
    }

    /**
     * Validate pitch notation for current system
     */
    validatePitchNotation(notation) {
        const system = this.getCurrentPitchSystem();

        switch (system) {
            case 1: // Number system
                return /^[1234567#b]*$/.test(notation);
            case 2: // Western system
                return /^[cdefgabCDEFGAB#b]*$/.test(notation);
            default:
                return false;
        }
    }

    /**
     * Detect pitch system from notation
     */
    detectPitchSystem(notation) {
        if (/^[1234567#b]+$/.test(notation)) {
            return 1; // Number system
        } else if (/^[cdefgabCDEFGAB#b]+$/.test(notation)) {
            return 2; // Western system
        }
        return 0; // Unknown
    }

    /**
     * Handle keyboard input
     */
    handleKeyboardEvent(event) {
        const key = event.key;
        const modifiers = {
            alt: event.altKey,
            ctrl: event.ctrlKey,
            shift: event.shiftKey,
        };

        // Ignore Ctrl key combinations (let browser handle them)
        if (modifiers.ctrl) {
            return;
        }

        // Route to appropriate handler
        if (modifiers.alt && !modifiers.ctrl && !modifiers.shift) {
            this.handleAltCommand(key);
        } else if (modifiers.shift && !modifiers.alt && !modifiers.ctrl && this.isSelectionKey(key)) {
            // Only route to selection handler for actual selection keys (arrows, Home, End)
            this.handleShiftCommand(key);
        } else {
            this.handleNormalKey(key);
        }
    }

    /**
     * Check if key is a selection key (arrow keys, Home, End)
     */
    isSelectionKey(key) {
        return ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(key);
    }

    /**
     * Handle Alt+key commands (musical commands) with enhanced validation
     */
    handleAltCommand(key) {
        const startTime = performance.now();

        // Log command for debugging
        this.addToConsoleLog(`Musical command: Alt+${key.toLowerCase()}`);

        switch (key.toLowerCase()) {
            case 's':
                this.applySlur();
                break;
            case 'u':
                this.applyOctave(1); // Upper octave (+1)
                break;
            case 'm':
                this.applyOctave(0); // Middle octave (0, remove octave marking)
                break;
            case 'l':
                this.applyOctave(-1); // Lower octave (-1)
                break;
            case 't':
                this.showTalaDialog();
                break;
            default:
                console.log('Unknown Alt command:', key);
                this.showWarning(`Unknown musical command: Alt+${key}`, {
                    important: false,
                    details: `Available commands: Alt+S (slur), Alt+U (upper octave), Alt+M (middle octave), Alt+L (lower octave), Alt+T (tala)`
                });
                return;
        }

        // Record command performance
        const endTime = performance.now();
        this.recordPerformanceMetric('commandLatency', endTime - startTime);
    }

    /**
     * Handle Shift+key commands (selection)
     */
    handleShiftCommand(key) {
        const startTime = performance.now();
        let handled = false;

        switch (key) {
            case 'ArrowLeft':
                this.extendSelectionLeft();
                handled = true;
                break;
            case 'ArrowRight':
                this.extendSelectionRight();
                handled = true;
                break;
            case 'ArrowUp':
                this.extendSelectionUp();
                handled = true;
                break;
            case 'ArrowDown':
                this.extendSelectionDown();
                handled = true;
                break;
            case 'Home':
                this.extendSelectionToStart();
                handled = true;
                break;
            case 'End':
                this.extendSelectionToEnd();
                handled = true;
                break;
            default:
                // Ignore non-selection Shift commands (like Shift+#, Shift alone, etc.)
                return;
        }

        // Only record performance for actual selection commands
        if (handled) {
            const endTime = performance.now();
            this.recordPerformanceMetric('selectionLatency', endTime - startTime);

            // Update display
            this.updateSelectionDisplay();
        }
    }

    /**
     * Handle normal keys (text input) with selection awareness
     */
    handleNormalKey(key) {
        switch (key) {
            case 'ArrowLeft':
            case 'ArrowRight':
            case 'ArrowUp':
            case 'ArrowDown':
            case 'Home':
            case 'End':
                // Clear selection when navigating
                if (this.hasSelection()) {
                    this.clearSelection();
                }
                this.handleNavigation(key);
                break;
            case 'Backspace':
                this.handleBackspace();
                break;
            case 'Delete':
                this.handleDelete();
                break;
            default:
                // Insert text character - replace selection if exists
                if (key.length === 1 && !key.match(/[Ff][0-9]/)) { // Exclude F-keys
                    if (this.hasSelection()) {
                        this.replaceSelectedText(key);
                    } else {
                        this.insertText(key);
                    }
                }
        }
    }

    /**
     * Handle navigation keys with enhanced functionality
     */
    handleNavigation(key) {
        const startTime = performance.now();

        switch (key) {
            case 'ArrowLeft':
                this.navigateLeft();
                break;
            case 'ArrowRight':
                this.navigateRight();
                break;
            case 'ArrowUp':
                this.navigateUp();
                break;
            case 'ArrowDown':
                this.navigateDown();
                break;
            case 'Home':
                this.navigateHome();
                break;
            case 'End':
                this.navigateEnd();
                break;
            default:
                console.log('Unknown navigation key:', key);
                return;
        }

        // Record navigation performance
        const endTime = performance.now();
        this.recordPerformanceMetric('navigationLatency', endTime - startTime);
    }

    /**
     * Navigate left one character with grapheme-safe positioning
     */
    navigateLeft() {
        const currentPos = this.getCursorPosition();
        if (currentPos > 0) {
            // Find previous grapheme boundary
            const newPos = this.findPreviousGraphemeBoundary(currentPos);
            this.setCursorPosition(newPos);
        }
    }

    /**
     * Navigate right one character with grapheme-safe positioning
     */
    navigateRight() {
        const currentPos = this.getCursorPosition();
        const maxPos = this.getMaxCursorPosition();

        if (currentPos < maxPos) {
            // Find next grapheme boundary
            const newPos = this.findNextGraphemeBoundary(currentPos);
            this.setCursorPosition(newPos);
        }
    }

    /**
     * Navigate up to previous lane (for multi-lane navigation)
     */
    navigateUp() {
        const currentLane = this.getCurrentLane();
        if (currentLane > 0) {
            this.setCurrentLane(currentLane - 1);
        }
    }

    /**
     * Navigate down to next lane (for multi-lane navigation)
     */
    navigateDown() {
        const currentLane = this.getCurrentLane();
        if (currentLane < 3) { // 4 lanes: 0-3
            this.setCurrentLane(currentLane + 1);
        }
    }

    /**
     * Navigate to beginning of current line
     */
    navigateHome() {
        this.setCursorPosition(0);
    }

    /**
     * Navigate to end of current line
     */
    navigateEnd() {
        const maxPos = this.getMaxCursorPosition();
        this.setCursorPosition(maxPos);
    }

    /**
     * Find previous grapheme boundary (grapheme-safe navigation)
     */
    findPreviousGraphemeBoundary(currentPos) {
        if (!this.document || !this.document.lines || this.document.lines.length === 0) {
            return Math.max(0, currentPos - 1);
        }

        const line = this.document.lines[0];
        const letterLane = line.lanes[1]; // Letter lane

        if (letterLane.length === 0 || currentPos === 0) {
            return 0;
        }

        // First try Cell-based navigation for structured tokens
        for (let i = letterLane.length - 1; i >= 0; i--) {
            const cell = letterLane[i];
            if (cell.col < currentPos) {
                if (cell.is_head && cell.token_length > 1) {
                    // We're at or after a multi-character token, jump to its start
                    return cell.col;
                } else if (!cell.is_head && i > 0) {
                    // We're inside a token, find its head
                    const headCell = letterLane[i - 1];
                    if (headCell && headCell.is_head) {
                        return headCell.col;
                    }
                }
                // Single character or token boundary found
                return cell.col;
            }
        }

        // Fallback: use Intl.Segmenter for grapheme-aware navigation
        return this.findPreviousGraphemeBoundaryIntl(currentPos);
    }

    /**
     * Find previous grapheme boundary using Intl.Segmenter (fallback method)
     */
    findPreviousGraphemeBoundaryIntl(currentPos) {
        try {
            const text = this.getCurrentTextContent();
            if (!text || currentPos <= 0) return 0;

            const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
            const segments = [...segmenter.segment(text)];

            let accumulatedLength = 0;
            for (let i = segments.length - 1; i >= 0; i--) {
                const segment = segments[i];
                if (accumulatedLength + segment.segment.length < currentPos) {
                    return accumulatedLength + segment.segment.length;
                }
                accumulatedLength += segment.segment.length;
            }

            return 0;
        } catch (error) {
            // Ultimate fallback: simple character-based navigation
            return Math.max(0, currentPos - 1);
        }
    }

    /**
     * Find next grapheme boundary (grapheme-safe navigation)
     */
    findNextGraphemeBoundary(currentPos) {
        if (!this.document || !this.document.lines || this.document.lines.length === 0) {
            return currentPos + 1;
        }

        const line = this.document.lines[0];
        const letterLane = line.lanes[1]; // Letter lane

        if (letterLane.length === 0) {
            return currentPos + 1;
        }

        // First try Cell-based navigation for structured tokens
        for (let i = 0; i < letterLane.length; i++) {
            const cell = letterLane[i];
            if (cell.col > currentPos) {
                if (cell.is_head && cell.token_length > 1) {
                    // Jump to end of multi-character token
                    return cell.col + cell.token_length - 1;
                }
                // Single character or boundary found
                return cell.col;
            }
        }

        // Fallback: use Intl.Segmenter for grapheme-aware navigation
        return this.findNextGraphemeBoundaryIntl(currentPos);
    }

    /**
     * Find next grapheme boundary using Intl.Segmenter (fallback method)
     */
    findNextGraphemeBoundaryIntl(currentPos) {
        try {
            const text = this.getCurrentTextContent();
            if (!text) return currentPos + 1;

            const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
            const segments = [...segmenter.segment(text)];

            let accumulatedLength = 0;
            for (const segment of segments) {
                if (accumulatedLength > currentPos) {
                    return accumulatedLength;
                }
                accumulatedLength += segment.segment.length;
            }

            // If we're at the end, return position after last character
            return accumulatedLength;
        } catch (error) {
            // Ultimate fallback: simple character-based navigation
            return currentPos + 1;
        }
    }

    /**
     * Enhanced grapheme-safe navigation for complex grapheme clusters
     */
    isComplexGraphemeCluster(text, position) {
        try {
            const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
            const segments = [...segmenter.segment(text)];

            let accumulatedLength = 0;
            for (const segment of segments) {
                if (accumulatedLength === position && segment.segment.length > 1) {
                    return true; // Multi-byte grapheme cluster at this position
                }
                accumulatedLength += segment.segment.length;
                if (accumulatedLength > position) {
                    break;
                }
            }
            return false;
        } catch (error) {
            return false;
        }
    }

    /**
     * Get grapheme cluster at position
     */
    getGraphemeClusterAt(position) {
        try {
            const text = this.getCurrentTextContent();
            if (!text || position < 0 || position >= text.length) return '';

            const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
            const segments = [...segmenter.segment(text)];

            let accumulatedLength = 0;
            for (const segment of segments) {
                if (accumulatedLength <= position && position < accumulatedLength + segment.segment.length) {
                    return segment.segment;
                }
                accumulatedLength += segment.segment.length;
            }
            return '';
        } catch (error) {
            // Fallback to single character
            const text = this.getCurrentTextContent();
            return text.charAt(position) || '';
        }
    }

    /**
     * Enhanced selection extension with grapheme awareness
     */
    extendSelectionGraphemeLeft() {
        const currentPos = this.getCursorPosition();
        let selection = this.getSelection();

        if (!selection) {
            this.initializeSelection(currentPos, currentPos);
            selection = this.getSelection(); // Get the newly created selection
        }

        // Find the actual start of the current grapheme cluster
        const graphemeStart = this.findPreviousGraphemeBoundary(currentPos);
        if (graphemeStart < currentPos && selection) {
            this.initializeSelection(graphemeStart, selection.end);
            this.setCursorPosition(graphemeStart);
        }
    }

    /**
     * Enhanced selection extension with grapheme awareness
     */
    extendSelectionGraphemeRight() {
        const currentPos = this.getCursorPosition();
        let selection = this.getSelection();

        if (!selection) {
            this.initializeSelection(currentPos, currentPos);
            selection = this.getSelection(); // Get the newly created selection
        }

        // Find the actual end of the current grapheme cluster
        const graphemeEnd = this.findNextGraphemeBoundary(currentPos);
        const maxPos = this.getMaxCursorPosition();

        if (graphemeEnd > currentPos && graphemeEnd <= maxPos && selection) {
            this.initializeSelection(selection.start, graphemeEnd);
            this.setCursorPosition(graphemeEnd);
        }
    }

    /**
     * Get maximum cursor position in current line
     */
    getMaxCursorPosition() {
        if (!this.document || !this.document.lines || this.document.lines.length === 0) {
            return 0;
        }

        const line = this.document.lines[0];
        const letterLane = line.lanes[1]; // Letter lane

        if (letterLane.length === 0) {
            return 0;
        }

        // Find the last position based on the last Cell
        const lastCell = letterLane[letterLane.length - 1];
        if (lastCell) {
            return lastCell.col + (lastCell.token_length || 1);
        }

        return 0;
    }

    /**
     * Get current lane index
     */
    getCurrentLane() {
        if (this.document && this.document.state && this.document.state.cursor) {
            return this.document.state.cursor.lane || 1; // Default to letter lane
        }
        return 1;
    }

    /**
     * Set current lane index
     */
    setCurrentLane(laneIndex) {
        if (this.document && this.document.state && this.document.state.cursor) {
            this.document.state.cursor.lane = laneIndex;
        }
    }

    /**
     * Update cursor visual position based on current cursor position
     */
    updateCursorVisualPosition() {
        const cursor = this.getCursorElement();
        if (!cursor) return;

        const cursorPos = this.getCursorPosition();
        const charWidth = 12; // Approximate character width
        const lane = this.getCurrentLane();

        // Calculate vertical offset for lane
        const laneOffsets = [0, 16, 32, 48]; // Visual offsets for lanes
        const yOffset = laneOffsets[lane] || 16;

        cursor.style.left = `${cursorPos * charWidth}px`;
        cursor.style.top = `${yOffset}px`;
        cursor.style.height = '16px';
    }

    // ==================== SELECTION MANAGEMENT ====================

    /**
     * Initialize selection range
     */
    initializeSelection(startPos, endPos) {
        if (!this.document || !this.document.state) {
            return;
        }

        this.document.state.selection = {
            start: Math.min(startPos, endPos),
            end: Math.max(startPos, endPos),
            active: true,
            lane: this.getCurrentLane()
        };
    }

    /**
     * Clear current selection
     */
    clearSelection() {
        if (this.document && this.document.state) {
            this.document.state.selection = null;
        }
        this.clearSelectionVisual();
        this.updateDocumentDisplay();
    }

    /**
     * Check if there's an active selection
     */
    hasSelection() {
        return !!(this.document && this.document.state && this.document.state.selection && this.document.state.selection.active);
    }

    /**
     * Get current selection range
     */
    getSelection() {
        if (this.hasSelection()) {
            return this.document.state.selection;
        }
        return null;
    }

    /**
     * Get selected text content
     */
    getSelectedText() {
        const selection = this.getSelection();
        if (!selection) {
            return '';
        }

        if (!this.document || !this.document.lines || this.document.lines.length === 0) {
            return '';
        }

        const line = this.document.lines[0];
        const letterLane = line.lanes[selection.lane || 1];

        if (letterLane.length === 0) {
            return '';
        }

        // Extract text from selection range
        const selectedCells = letterLane.filter(cell =>
            cell.col >= selection.start && cell.col < selection.end
        );

        return selectedCells.map(cell => cell.grapheme || '').join('');
    }

    /**
     * Extend selection to the left (grapheme-aware)
     */
    extendSelectionLeft() {
        const startTime = performance.now();

        // Use enhanced grapheme-aware selection extension
        this.extendSelectionGraphemeLeft();

        // Record performance
        const endTime = performance.now();
        this.recordPerformanceMetric('selectionLatency', endTime - startTime);
    }

    /**
     * Extend selection to the right (grapheme-aware)
     */
    extendSelectionRight() {
        const startTime = performance.now();

        // Use enhanced grapheme-aware selection extension
        this.extendSelectionGraphemeRight();

        // Record performance
        const endTime = performance.now();
        this.recordPerformanceMetric('selectionLatency', endTime - startTime);
    }

    /**
     * Extend selection up to previous lane
     */
    extendSelectionUp() {
        const currentLane = this.getCurrentLane();
        const selection = this.getSelection();

        if (!selection) {
            // Start new selection
            this.initializeSelection(this.getCursorPosition(), this.getCursorPosition());
        }

        if (currentLane > 0) {
            this.setCurrentLane(currentLane - 1);
            const updatedSelection = this.getSelection();
            if (updatedSelection) {
                updatedSelection.lane = currentLane - 1;
            }
        }
    }

    /**
     * Extend selection down to next lane
     */
    extendSelectionDown() {
        const currentLane = this.getCurrentLane();
        const selection = this.getSelection();

        if (!selection) {
            // Start new selection
            this.initializeSelection(this.getCursorPosition(), this.getCursorPosition());
        }

        if (currentLane < 3) { // 4 lanes: 0-3
            this.setCurrentLane(currentLane + 1);
            const updatedSelection = this.getSelection();
            if (updatedSelection) {
                updatedSelection.lane = currentLane + 1;
            }
        }
    }

    /**
     * Extend selection to start of line
     */
    extendSelectionToStart() {
        const selection = this.getSelection();

        if (!selection) {
            // Start new selection from current position to start
            this.initializeSelection(0, this.getCursorPosition());
        } else {
            // Extend existing selection to start
            this.initializeSelection(0, selection.end);
        }

        this.setCursorPosition(0);
    }

    /**
     * Extend selection to end of line
     */
    extendSelectionToEnd() {
        const maxPos = this.getMaxCursorPosition();
        const selection = this.getSelection();

        if (!selection) {
            // Start new selection from current position to end
            this.initializeSelection(this.getCursorPosition(), maxPos);
        } else {
            // Extend existing selection to end
            this.initializeSelection(selection.start, maxPos);
        }

        this.setCursorPosition(maxPos);
    }

    /**
     * Update visual selection display
     */
    updateSelectionDisplay() {
        // Clear previous selection
        this.clearSelectionVisual();

        const selection = this.getSelection();
        if (!selection) {
            return;
        }

        // Add visual selection for selected range
        this.renderSelectionVisual(selection);

        // Update ephemeral model display to show current selection state
        this.updateDocumentDisplay();
    }

    /**
     * Render visual selection highlighting
     */
    renderSelectionVisual(selection) {
        if (!this.renderer || !this.renderer.canvas) {
            return;
        }

        const charWidth = 12; // Approximate character width
        const laneOffsets = [0, 16, 32, 48]; // Visual offsets for lanes
        const yOffset = laneOffsets[selection.lane] || 16;

        // Create selection highlight
        const selectionElement = document.createElement('div');
        selectionElement.className = 'selection-highlight';
        selectionElement.style.cssText = `
            position: absolute;
            left: ${selection.start * charWidth}px;
            top: ${yOffset}px;
            width: ${(selection.end - selection.start) * charWidth}px;
            height: 16px;
            background-color: rgba(59, 130, 246, 0.3); /* Blue with transparency */
            border: 1px solid rgba(59, 130, 246, 0.5);
            pointer-events: none;
            z-index: 2;
        `;

        this.renderer.canvas.appendChild(selectionElement);

        // Store reference for later clearing
        this._currentSelectionElement = selectionElement;
    }

    /**
     * Clear visual selection
     */
    clearSelectionVisual() {
        if (this._currentSelectionElement && this._currentSelectionElement.parentElement) {
            this._currentSelectionElement.parentElement.removeChild(this._currentSelectionElement);
            this._currentSelectionElement = null;
        }
    }

    /**
     * Replace selected text with new text
     */
    async replaceSelectedText(newText) {
        const selection = this.getSelection();
        if (!selection) {
            return await this.insertText(newText);
        }

        try {
            // Delete selected range
            await this.deleteRange(selection.start, selection.end);

            // Insert new text at selection start position
            this.setCursorPosition(selection.start);
            await this.insertText(newText);

            // Clear selection
            this.clearSelection();

        } catch (error) {
            console.error('Failed to replace selected text:', error);
            this.showError('Failed to replace selection');
        }
    }

    /**
     * Delete selected content
     */
    async deleteSelection() {
        const selection = this.getSelection();
        if (!selection) {
            return;
        }

        try {
            await this.deleteRange(selection.start, selection.end);
            this.setCursorPosition(selection.start);
            this.clearSelection();
        } catch (error) {
            console.error('Failed to delete selection:', error);
            this.showError('Failed to delete selection');
        }
    }

    /**
     * Handle backspace key with selection awareness and beat recalculation
     */
    async handleBackspace() {
        if (this.hasSelection()) {
            // Delete selected content
            await this.deleteSelection();
            await this.recalculateBeats();
        } else {
            const cursorPos = this.getCursorPosition();
            if (cursorPos > 0) {
                // Use WASM API to delete character
                if (this.document && this.document.lines && this.document.lines.length > 0) {
                    const line = this.document.lines[0];
                    const letterLane = line.lanes[1];

                    try {
                        const updatedCells = this.wasmModule.deleteCharacter(letterLane, cursorPos - 1);
                        line.lanes[1] = updatedCells;
                        this.setCursorPosition(cursorPos - 1);
                    } catch (e) {
                        console.error('Failed to delete character:', e);
                        // Fallback to old method
                        await this.deleteRange(cursorPos - 1, cursorPos);
                        this.setCursorPosition(cursorPos - 1);
                    }
                }

                // Recalculate beats after deletion
                await this.recalculateBeats();

                await this.render();
                this.updateDocumentDisplay();
            }
        }
    }

    /**
     * Handle delete key with selection awareness and beat recalculation
     */
    async handleDelete() {
        if (this.hasSelection()) {
            // Delete selected content
            await this.deleteSelection();
            await this.recalculateBeats();
        } else {
            const cursorPos = this.getCursorPosition();
            const maxPos = this.getMaxCursorPosition();

            if (cursorPos < maxPos) {
                // Use WASM API to delete character
                if (this.document && this.document.lines && this.document.lines.length > 0) {
                    const line = this.document.lines[0];
                    const letterLane = line.lanes[1];

                    try {
                        const updatedCells = this.wasmModule.deleteCharacter(letterLane, cursorPos);
                        line.lanes[1] = updatedCells;
                    } catch (e) {
                        console.error('Failed to delete character:', e);
                        // Fallback to old method
                        await this.deleteRange(cursorPos, cursorPos + 1);
                    }
                }

                // Recalculate beats after deletion
                await this.recalculateBeats();

                await this.render();
                this.updateDocumentDisplay();
            }
        }
    }

    /**
     * Recalculate beats after content changes
     */
    async recalculateBeats() {
        try {
            if (this.document && this.document.lines && this.document.lines.length > 0) {
                // Get current text content
                const text = this.getCurrentTextContent();

                // Re-extract beats from updated content
                await this.extractAndRenderBeats(text);

                this.addToConsoleLog(`Recalculated beats after edit`);
            }
        } catch (error) {
            console.error('Failed to recalculate beats:', error);
        }
    }

    /**
     * Get current text content from the document
     */
    getCurrentTextContent() {
        if (!this.document || !this.document.lines || this.document.lines.length === 0) {
            return '';
        }

        const line = this.document.lines[0];
        const letterLane = line.lanes[1]; // Letter lane

        return letterLane.map(cell => cell.grapheme || '').join('');
    }

    /**
     * Validate that a selection is valid for musical commands
     */
    validateSelectionForCommands() {
        if (!this.hasSelection()) {
            this.showError('No selection - please select text to apply musical commands', {
                source: 'Command Validation',
                details: 'Use Shift+Arrow keys to create a selection, then try the command again'
            });
            return false;
        }

        const selection = this.getSelection();
        if (!selection) {
            return false;
        }

        // Check if selection is empty
        if (selection.start >= selection.end) {
            this.showError('Empty selection - please select text to apply musical commands', {
                source: 'Command Validation'
            });
            return false;
        }

        // Get selected text to check if it contains valid musical elements
        const selectedText = this.getSelectedText();
        if (!selectedText || selectedText.trim().length === 0) {
            this.showError('Empty selection - please select text to apply musical commands', {
                source: 'Command Validation'
            });
            return false;
        }

        return true;
    }

    /**
     * Apply slur to current selection with toggle behavior
     */
    async applySlur() {
        if (!this.isInitialized || !this.wasmModule) {
            return;
        }

        // Validate selection
        if (!this.validateSelectionForCommands()) {
            return;
        }

        try {
            const selection = this.getSelection();
            const selectedText = this.getSelectedText();

            // Check if there's already a slur on this selection
            const hasExistingSlur = this.hasSlurOnSelection(selection);

            if (hasExistingSlur) {
                this.addToConsoleLog(`Removing slur from selection: "${selectedText}"`);
                await this.removeSlurFromSelection(selection);
            } else {
                this.addToConsoleLog(`Applying slur to selection: "${selectedText}"`);
                // Stub implementation for POC - manually create slur
                if (this.document && this.document.lines && this.document.lines.length > 0) {
                    const line = this.document.lines[0];
                    if (!line.slurs) {
                        line.slurs = [];
                    }
                    line.slurs.push({
                        start: { line: 0, lane: selection.lane || 1, column: selection.start },
                        end: { line: 0, lane: selection.lane || 1, column: selection.end },
                        direction: 0, // Upward
                        visual: {
                            curvature: 0.15,
                            thickness: 1.5,
                            highlighted: false
                        }
                    });
                }
            }

            await this.render();
            await this.updateSlurDisplay();

            const action = hasExistingSlur ? 'removed' : 'applied';
            this.addToConsoleLog(`Slur ${action} ${action === 'removed' ? 'from' : 'to'} "${selectedText}"`);
        } catch (error) {
            console.error('Failed to apply slur:', error);
            this.showError('Failed to apply slur - please ensure you have a valid selection', {
                source: 'Slur Command',
                details: error.message
            });
        }
    }

    /**
     * Check if there's already a slur on the given selection
     */
    hasSlurOnSelection(selection) {
        if (!this.document || !this.document.lines || this.document.lines.length === 0) {
            return false;
        }

        const line = this.document.lines[0];
        if (!line.slurs || line.slurs.length === 0) {
            return false;
        }

        // Check if any slur overlaps with the current selection
        return line.slurs.some(slur => {
            const slurStart = slur.start?.column || 0;
            const slurEnd = slur.end?.column || 0;

            // Check for overlap between slur and selection
            return (slurStart <= selection.end && slurEnd >= selection.start);
        });
    }

    /**
     * Remove slur from the given selection
     */
    async removeSlurFromSelection(selection) {
        if (!this.document || !this.document.lines || this.document.lines.length === 0) {
            return;
        }

        const line = this.document.lines[0];
        if (!line.slurs || line.slurs.length === 0) {
            return;
        }

        // Find and remove slurs that overlap with the selection
        line.slurs = line.slurs.filter(slur => {
            const slurStart = slur.start?.column || 0;
            const slurEnd = slur.end?.column || 0;

            // Keep only slurs that don't overlap with selection
            return !(slurStart <= selection.end && slurEnd >= selection.start);
        });

        // Note: setDocumentState is not needed - we update this.document directly
    }

    /**
     * Update slur visual display
     */
    async updateSlurDisplay() {
        // This will be enhanced when T045 (Slur Rendering with Canvas) is implemented
        // For now, just update the console and document display
        this.updateDocumentDisplay();

        const slurCount = this.getSlurCount();
        this.addToConsoleLog(`Document now contains ${slurCount} slur(s)`);
    }

    /**
     * Get the total number of slurs in the document
     */
    getSlurCount() {
        if (!this.document || !this.document.lines || this.document.lines.length === 0) {
            return 0;
        }

        const line = this.document.lines[0];
        return line.slurs ? line.slurs.length : 0;
    }

    /**
     * Apply octave to current selection with enhanced validation
     */
    async applyOctave(octave) {
        if (!this.isInitialized || !this.wasmModule) {
            logger.warn(LOG_CATEGORIES.COMMAND, 'applyOctave called before initialization');
            return;
        }

        logger.time('applyOctave', LOG_CATEGORIES.COMMAND);

        // Validate selection
        if (!this.validateSelectionForCommands()) {
            logger.warn(LOG_CATEGORIES.COMMAND, 'applyOctave called without valid selection');
            return;
        }

        try {
            const selection = this.getSelection();
            const selectedText = this.getSelectedText();

            logger.info(LOG_CATEGORIES.COMMAND, 'Applying octave', {
                octave,
                selection: `${selection.start}..${selection.end}`,
                selectedText
            });

            // Validate octave value
            if (![-1, 0, 1].includes(octave)) {
                logger.error(LOG_CATEGORIES.COMMAND, 'Invalid octave value', { octave });
                this.showError('Invalid octave value', {
                    source: 'Octave Command',
                    details: `Octave must be -1 (lower), 0 (middle), or 1 (upper), got: ${octave}`
                });
                return;
            }

            const octaveNames = {
                '-1': 'lower (-1)',
                '0': 'middle (0)',
                '1': 'upper (1)'
            };

            this.addToConsoleLog(`Applying octave ${octaveNames[octave]} to selection: "${selectedText}"`);

            // Call WASM function to apply octave to selected cells
            if (this.document && this.document.lines && this.document.lines.length > 0) {
                const line = this.document.lines[0];
                const letterLane = line.lanes[1]; // Letter lane

                logger.debug(LOG_CATEGORIES.COMMAND, 'Calling WASM applyOctave', {
                    laneSize: letterLane.length,
                    range: `${selection.start}..${selection.end}`
                });

                try {
                    const updatedCells = this.wasmModule.applyOctave(
                        letterLane,
                        selection.start,
                        selection.end,
                        octave
                    );
                    line.lanes[1] = updatedCells;
                    logger.info(LOG_CATEGORIES.COMMAND, 'WASM applyOctave successful', {
                        cellsModified: updatedCells.length
                    });
                } catch (e) {
                    logger.error(LOG_CATEGORIES.COMMAND, 'WASM applyOctave failed, using fallback', {
                        error: e.message
                    });
                    console.error('WASM applyOctave failed:', e);
                    // Fallback to manual application
                    let fallbackCount = 0;
                    for (let i = selection.start; i < selection.end && i < letterLane.length; i++) {
                        const cell = letterLane[i];
                        // Only apply octave to pitched elements (kind 1)
                        if (cell.kind === 1) {
                            cell.octave = octave;
                            fallbackCount++;
                        }
                    }
                    logger.info(LOG_CATEGORIES.COMMAND, 'Fallback application complete', { cellsModified: fallbackCount });
                }
            }

            await this.render();

            logger.timeEnd('applyOctave', LOG_CATEGORIES.COMMAND);
            this.addToConsoleLog(`Octave ${octaveNames[octave]} applied successfully to "${selectedText}"`);
        } catch (error) {
            logger.error(LOG_CATEGORIES.COMMAND, 'Failed to apply octave', {
                error: error.message,
                stack: error.stack
            });
            console.error('Failed to apply octave:', error);
            this.showError('Failed to apply octave - please ensure you have a valid selection', {
                source: 'Octave Command',
                details: error.message
            });
        }
    }

    /**
     * Show tala input dialog
     */
    showTalaDialog() {
        const tala = prompt('Enter tala (digits 0-9+):');
        if (tala !== null) {
            this.setTala(tala);
        }
    }

    /**
     * Set tala for current line
     */
    async setTala(talaString) {
        try {
            // Update document metadata
            const state = await this.saveDocument();
            const doc = JSON.parse(state);

            if (doc.lines.length > 0) {
                doc.lines[0].metadata.tala = talaString;
                await this.loadDocument(JSON.stringify(doc));
            }
        } catch (error) {
            console.error('Failed to set tala:', error);
            this.showError('Failed to set tala');
        }
    }

    /**
     * Render the current document
     */
    async render() {
        if (!this.renderer) {
            return;
        }

        const startTime = performance.now();

        try {
            const state = await this.saveDocument();
            const doc = JSON.parse(state);
            this.renderer.renderDocument(doc);

            const endTime = performance.now();
            this.recordPerformanceMetric('renderTime', endTime - startTime);

        } catch (error) {
            console.error('Failed to render document:', error);
        }
    }

    /**
     * Setup event handlers
     */
    setupEventHandlers() {
        // NOTE: Keyboard events are handled by EventManager globally
        // to avoid duplicate event handling

        // Focus events
        this.canvas.addEventListener('focus', () => {
            this.canvas.classList.add('focused');
            this.showCursor();
            this.recordFocusActivation();
        });

        this.canvas.addEventListener('blur', () => {
            this.canvas.classList.remove('focused');
            this.hideCursor();
        });

        // Click events for caret positioning
        this.canvas.addEventListener('click', (event) => {
            // Clear selection when clicking
            this.clearSelection();
            this.handleCanvasClick(event);
        });
    }

    /**
     * Handle canvas click for caret positioning
     */
    handleCanvasClick(event) {
        const rect = this.canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        // Calculate Cell position from click coordinates
        const charCellPosition = this.calculateCellPosition(x, y);

        if (charCellPosition !== null) {
            this.setCursorPosition(charCellPosition);
            this.canvas.focus();
        }
    }

    /**
     * Calculate Cell position from coordinates
     */
    calculateCellPosition(x, y) {
        // Simplified calculation - in a real implementation,
        // this would use the layout engine to calculate positions
        const charWidth = 12; // Approximate character width
        const column = Math.floor(x / charWidth);

        return Math.max(0, column);
    }

    /**
     * Show cursor with enhanced blinking and positioning
     */
    showCursor() {
        const cursor = this.getCursorElement();
        if (cursor) {
            cursor.style.display = 'block';
            this.startCursorBlinking();
            this.updateCursorVisualPosition();
        }
    }

    /**
     * Hide cursor
     */
    hideCursor() {
        const cursor = this.getCursorElement();
        if (cursor) {
            cursor.style.display = 'none';
            this.stopCursorBlinking();
        }
    }

    /**
     * Get or create cursor element with enhanced styling
     */
    getCursorElement() {
        let cursor = document.querySelector('.cursor-indicator');
        if (!cursor) {
            cursor = this.createCursorElement();
            this.canvas.appendChild(cursor);
        }
        return cursor;
    }

    /**
     * Create cursor element with proper styling
     */
    createCursorElement() {
        const cursor = document.createElement('div');
        cursor.className = 'cursor-indicator';

        // Add cursor animation styles
        const style = document.createElement('style');
        style.textContent = `
            @keyframes cursor-blink {
                0%, 50% { opacity: 1; }
                51%, 100% { opacity: 0; }
            }

            .cursor-indicator {
                position: absolute;
                width: 2px;
                height: 16px;
                background-color: #0066cc;
                z-index: 5;
                pointer-events: none;
                transition: all 0.1s ease-out;
            }

            .cursor-indicator.blinking {
                animation: cursor-blink 1s step-end infinite;
            }

            .cursor-indicator.focused {
                background-color: #004499;
                box-shadow: 0 0 3px rgba(0, 102, 204, 0.5);
            }

            .cursor-indicator.selecting {
                background-color: #ff6b35;
                box-shadow: 0 0 3px rgba(255, 107, 53, 0.5);
            }
        `;
        document.head.appendChild(style);

        return cursor;
    }

    /**
     * Start cursor blinking animation
     */
    startCursorBlinking() {
        const cursor = this.getCursorElement();
        if (cursor) {
            cursor.classList.add('blinking');

            // Stop blinking on focus loss
            this._blinkInterval = setInterval(() => {
                if (this.document && !this.document.state.has_focus) {
                    this.stopCursorBlinking();
                }
            }, 100);
        }
    }

    /**
     * Stop cursor blinking animation
     */
    stopCursorBlinking() {
        const cursor = this.getCursorElement();
        if (cursor) {
            cursor.classList.remove('blinking');
        }

        if (this._blinkInterval) {
            clearInterval(this._blinkInterval);
            this._blinkInterval = null;
        }
    }

    /**
     * Update cursor visual positioning with enhanced accuracy
     */
    updateCursorVisualPosition() {
        const cursor = this.getCursorElement();
        if (!cursor) return;

        const cursorPos = this.getCursorPosition();
        const lane = this.getCurrentLane();

        // Calculate precise positioning based on actual grapheme lengths
        const charWidth = 12; // Approximate character width
        const lineHeight = 16; // Line height in pixels
        const laneOffsets = [0, lineHeight, lineHeight * 2, lineHeight * 3]; // Visual offsets for lanes
        const yOffset = laneOffsets[lane] || lineHeight;

        // Calculate pixel position by summing grapheme lengths of all cells before cursor
        let pixelPos = 0;
        if (this.document && this.document.lines && this.document.lines.length > 0) {
            const line = this.document.lines[0];
            const letterLane = line.lanes[lane];

            for (let i = 0; i < cursorPos && i < letterLane.length; i++) {
                const cell = letterLane[i];
                // Add the length of this cell's grapheme (e.g., "1#" has length 2)
                pixelPos += (cell.grapheme || '').length * charWidth;
            }
        } else {
            // Fallback if no document
            pixelPos = cursorPos * charWidth;
        }

        // Set cursor position
        cursor.style.left = `${pixelPos}px`;
        cursor.style.top = `${yOffset}px`;
        cursor.style.height = `${lineHeight}px`;

        // Update cursor appearance based on state
        if (this.hasSelection()) {
            cursor.classList.add('selecting');
        } else {
            cursor.classList.remove('selecting');
        }

        if (this.document && this.document.state && this.document.state.has_focus) {
            cursor.classList.add('focused');
        } else {
            cursor.classList.remove('focused');
        }

        // Ensure cursor is visible when focused
        if (this.document && this.document.state && this.document.state.has_focus) {
            cursor.style.opacity = '1';
        }
    }

    /**
     * Get cursor position with lane information
     */
    getCursorPositionWithLane() {
        if (this.document && this.document.state && this.document.state.cursor) {
            return {
                column: this.document.state.cursor.column,
                lane: this.document.state.cursor.lane || 1
            };
        }
        return {
            column: 0,
            lane: 1
        };
    }

    /**
     * Set cursor position with lane information
     */
    setCursorPositionWithLane(position) {
        if (this.document && this.document.state) {
            this.document.state.cursor = {
                line: 0,
                lane: position.lane,
                column: position.column
            };
            this.updateCursorPositionDisplay();
            this.updateCursorVisualPosition();
        }
    }

    /**
     * Animate cursor to new position
     */
    async animateCursorTo(position) {
        const cursor = this.getCursorElement();
        if (!cursor) return;

        const targetLeft = position.column * 12; // Approximate character width
        const laneOffsets = [0, 16, 32, 48];
        const targetTop = laneOffsets[position.lane] || 16;

        // Smooth animation to new position
        cursor.style.transition = 'left 0.15s ease-out, top 0.15s ease-out';
        cursor.style.left = `${targetLeft}px`;
        cursor.style.top = `${targetTop}px`;

        // Update internal position after animation
        setTimeout(() => {
            this.setCursorPositionWithLane(position);
            cursor.style.transition = '';
        }, 150);
    }

    /**
     * Update cursor position display in UI
     */
    updateCursorPositionDisplay() {
        const cursorPos = document.getElementById('cursor-position');
        if (cursorPos) {
            const pos = this.getCursorPositionWithLane();
            cursorPos.textContent = `Col: ${pos.column}, Lane: ${pos.lane}`;
        }

        const charCount = document.getElementById('char-count');
        if (charCount && this.document && this.document.lines && this.document.lines[0]) {
            const letterLane = this.document.lines[0].lanes[1];
            charCount.textContent = letterLane.length;
        }

        const selectionInfo = document.getElementById('selection-info');
        if (selectionInfo) {
            if (this.hasSelection()) {
                const selection = this.getSelection();
                const selectionText = this.getSelectedText();
                const selectionLength = selection.end - selection.start;
                selectionInfo.textContent = `Selected: ${selectionLength} chars (${selectionText})`;
                selectionInfo.className = 'text-xs text-success';
            } else {
                selectionInfo.textContent = 'No selection';
                selectionInfo.className = 'text-xs text-ui-disabled-text';
            }
        }
    }

    /**
     * Update document display in debug panel
     */
    updateDocumentDisplay() {
        // Update ephemeral model (full document with state)
        const docJson = document.getElementById('document-json');
        if (docJson && this.document) {
            // Create a display-friendly version of the document
            const displayDoc = this.createDisplayDocument(this.document);
            docJson.textContent = this.toYAML(displayDoc);
        }

        // Update persistent model (saveable content only, no state)
        const persistentJson = document.getElementById('persistent-json');
        if (persistentJson && this.document) {
            // Rust now handles cell field exclusion via #[serde(skip)] on ephemeral rendering fields
            // We only need to exclude the state object (runtime cursor/selection data)
            const persistentDoc = {
                metadata: this.document.metadata,
                lines: this.document.lines
            };
            const displayDoc = this.createDisplayDocument(persistentDoc);
            persistentJson.textContent = this.toYAML(displayDoc);
        }
    }

    /**
     * Convert JavaScript object to concise YAML format
     */
    toYAML(obj, indent = 0) {
        const spaces = '  '.repeat(indent);

        if (obj === null) return 'null';
        if (obj === undefined) return 'undefined';

        const type = typeof obj;

        // Handle primitives
        if (type === 'string') return `"${obj}"`;
        if (type === 'number' || type === 'boolean') return String(obj);

        // Handle arrays
        if (Array.isArray(obj)) {
            if (obj.length === 0) return '[]';

            // Inline for simple arrays
            if (obj.every(item => typeof item !== 'object' || item === null)) {
                const items = obj.map(item => this.toYAML(item, 0)).join(', ');
                return `[${items}]`;
            }

            // Multi-line for complex arrays
            return '\n' + obj.map(item => {
                const value = this.toYAML(item, indent + 1);
                if (value.startsWith('\n')) {
                    return `${spaces}  -${value}`;
                }
                return `${spaces}  - ${value}`;
            }).join('\n');
        }

        // Handle objects
        if (type === 'object') {
            const keys = Object.keys(obj);
            if (keys.length === 0) return '{}';

            return '\n' + keys.map(key => {
                const value = this.toYAML(obj[key], indent + 1);
                if (value.startsWith('\n')) {
                    return `${spaces}  ${key}:${value}`;
                }
                return `${spaces}  ${key}: ${value}`;
            }).join('\n');
        }

        return String(obj);
    }

    /**
     * Create a display-friendly version of the document with string pitch systems
     */
    createDisplayDocument(doc) {
        // Deep clone the document
        const displayDoc = JSON.parse(JSON.stringify(doc));

        // Convert document-level pitch_system to string
        if (displayDoc.metadata && typeof displayDoc.metadata.pitch_system === 'number') {
            const systemNum = displayDoc.metadata.pitch_system;
            displayDoc.metadata.pitch_system = `${this.getPitchSystemName(systemNum)} (${systemNum})`;
        }

        // Convert line-level pitch_systems to strings
        if (displayDoc.lines && Array.isArray(displayDoc.lines)) {
            displayDoc.lines.forEach(line => {
                if (line.metadata && typeof line.metadata.pitch_system === 'number') {
                    const systemNum = line.metadata.pitch_system;
                    line.metadata.pitch_system = `${this.getPitchSystemName(systemNum)} (${systemNum})`;
                }
            });
        }

        return displayDoc;
    }

    /**
     * Update cursor position display
     */
    updateCursorPositionDisplay() {
        const cursorPos = document.getElementById('cursor-position');
        if (cursorPos) {
            cursorPos.textContent = this.getCursorPosition();
        }

        const charCount = document.getElementById('char-count');
        if (charCount && this.document && this.document.lines && this.document.lines[0]) {
            const letterLane = this.document.lines[0].lanes[1];
            charCount.textContent = letterLane.length;
        }
    }

    /**
     * Record performance metrics
     */
    recordPerformanceMetric(operation, duration) {
        if (!this.performanceMetrics[operation]) {
            this.performanceMetrics[operation] = [];
        }
        this.performanceMetrics[operation].push(duration);

        // Keep only last 100 measurements
        if (this.performanceMetrics[operation].length > 100) {
            this.performanceMetrics[operation].shift();
        }
    }

    /**
     * Record focus activation time
     */
    recordFocusActivation() {
        this.recordPerformanceMetric('focusActivation', 5); // Simulated time
    }

    /**
     * Start performance monitoring
     */
    startPerformanceMonitoring() {
        // Monitor performance periodically
        setInterval(() => {
            this.checkPerformanceTargets();
        }, 5000);
    }

    /**
     * Check performance against targets
     */
    checkPerformanceTargets() {
        const targets = {
            focusActivation: 10,      // ms
            typingLatency: 50,        // ms
            beatDerivation: 10,       // ms
            renderTime: 10,          // ms
            navigationLatency: 16,    // ms (60fps target)
            selectionLatency: 16,     // ms (60fps target)
            commandLatency: 20,       // ms (musical commands target)
        };

        for (const [operation, target] of Object.entries(targets)) {
            const measurements = this.performanceMetrics[operation];
            if (measurements && measurements.length > 0) {
                const avg = measurements.reduce((a, b) => a + b, 0) / measurements.length;
                if (avg > target) {
                    console.warn(`Performance warning: ${operation} averaging ${avg.toFixed(2)}ms (target: ${target}ms)`);
                }
            }
        }
    }

    /**
     * Update performance indicator
     */
    updatePerformanceIndicator(status) {
        const indicator = document.getElementById('performance-indicator');
        if (indicator) {
            indicator.className = `text-${status === 'ready' ? 'success' : 'error'}`;
            indicator.textContent = status === 'ready' ? 'Ready' : 'Error';
            indicator.classList.remove('hidden');
        }
    }

    /**
     * Show error message with enhanced handling
     */
    showError(message, options = {}) {
        const errorInfo = {
            message,
            timestamp: new Date().toISOString(),
            source: options.source || 'Editor',
            recoverable: options.recoverable !== false,
            details: options.details || null
        };

        console.error(message, errorInfo);
        this.addToConsoleErrors(errorInfo);
        this.updatePerformanceIndicator('error');

        // Show user notification if recoverable
        if (errorInfo.recoverable) {
            this.showUserNotification(errorInfo);
        }

        // Log to performance metrics
        this.recordError(errorInfo);
    }

    /**
     * Show warning message
     */
    showWarning(message, options = {}) {
        const warningInfo = {
            message,
            timestamp: new Date().toISOString(),
            source: options.source || 'Editor',
            details: options.details || null
        };

        console.warn(message, warningInfo);
        this.addToConsoleWarnings(warningInfo);

        // Show user notification for important warnings
        if (options.important) {
            this.showUserNotification({
                ...warningInfo,
                type: 'warning'
            });
        }
    }

    /**
     * Add message to console errors with enhanced information
     */
    addToConsoleErrors(errorInfo) {
        const errorsTab = document.getElementById('console-errors-list');
        if (errorsTab) {
            // Remove placeholder if this is the first real entry
            this.removePlaceholder(errorsTab);

            const errorElement = this.createConsoleEntry(errorInfo, 'error');
            errorsTab.appendChild(errorElement);
            errorsTab.scrollTop = errorsTab.scrollHeight;

            // Limit error history to prevent memory issues
            this.limitConsoleHistory(errorsTab, 100);
        }
    }

    /**
     * Add message to console warnings
     */
    addToConsoleWarnings(warningInfo) {
        const warningsTab = document.getElementById('console-warnings-list');
        if (warningsTab) {
            const warningElement = this.createConsoleEntry(warningInfo, 'warning');
            warningsTab.appendChild(warningElement);
            warningsTab.scrollTop = warningsTab.scrollHeight;

            // Limit warning history
            this.limitConsoleHistory(warningsTab, 50);
        }
    }

    /**
     * Add message to console log
     */
    addToConsoleLog(message) {
        const logTab = document.getElementById('console-log-list');
        if (logTab) {
            // Remove placeholder if this is the first real entry
            this.removePlaceholder(logTab);

            const logElement = this.createConsoleEntry({
                message: typeof message === 'string' ? message : JSON.stringify(message),
                timestamp: new Date().toISOString(),
                source: 'Editor'
            }, 'log');

            logTab.appendChild(logElement);
            logTab.scrollTop = logTab.scrollHeight;

            // Limit log history
            this.limitConsoleHistory(logTab, 200);
        }
    }

    /**
     * Create console entry element
     */
    createConsoleEntry(info, type) {
        const element = document.createElement('div');
        element.className = `console-entry console-${type}`;

        const timestamp = new Date(info.timestamp || new Date().toISOString());
        const typeClass = type === 'error' ? 'text-error' : type === 'warning' ? 'text-warning' : 'text-info';

        element.innerHTML = `
            <span class="${typeClass}">${timestamp.toLocaleTimeString()}</span>
            <span class="font-medium">${this.capitalizeFirst(type)}:</span>
            <span>${info.message}</span>
            ${info.source ? `<span class="text-ui-disabled-text text-xs ml-2">(${info.source})</span>` : ''}
        `;

        // Add details if available
        if (info.details) {
            const detailsElement = document.createElement('details');
            detailsElement.className = 'console-details text-xs mt-1';
            detailsElement.innerHTML = `<summary>Details</summary><pre class="bg-ui-background p-1 rounded">${info.details}</pre>`;
            element.appendChild(detailsElement);
        }

        return element;
    }

    /**
     * Show user notification
     */
    showUserNotification(info) {
        const notification = document.createElement('div');
        notification.className = `notification notification-${info.type || 'error'}`;
        notification.innerHTML = `
            <div class="notification-content">
                <div class="notification-title">${this.capitalizeFirst(info.type || 'error')}</div>
                <div class="notification-message">${info.message}</div>
            </div>
            <button class="notification-close" onclick="this.parentElement.remove()">×</button>
        `;

        // Style the notification
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${info.type === 'error' ? '#dc2626' : info.type === 'warning' ? '#f59e0b' : '#3b82f6'};
            color: white;
            padding: 12px 16px;
            border-radius: 6px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            z-index: 1000;
            max-width: 300px;
            animation: slideIn 0.3s ease-out;
        `;

        // Add animation
        const style = document.createElement('style');
        style.textContent = `
            @keyframes slideIn {
                from {
                    transform: translateX(100%);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
            .notification-content {
                margin-right: 8px;
            }
            .notification-title {
                font-weight: 600;
                margin-bottom: 4px;
            }
            .notification-message {
                font-size: 14px;
                line-height: 1.4;
            }
            .notification-close {
                background: none;
                border: none;
                color: white;
                font-size: 18px;
                cursor: pointer;
                padding: 0;
                margin-left: 8px;
            }
            .notification-close:hover {
                background: rgba(255, 255, 255, 0.2);
            }
        `;
        document.head.appendChild(style);

        document.body.appendChild(notification);

        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (notification.parentElement) {
                notification.remove();
            }
        }, 5000);

        // Handle manual close
        const closeBtn = notification.querySelector('.notification-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                notification.remove();
            });
        }
    }

    /**
     * Remove placeholder text from console tabs
     */
    removePlaceholder(container) {
        // Check if the first child is a placeholder
        const firstChild = container.firstElementChild;
        if (firstChild && firstChild.textContent.includes('No logs') ||
            firstChild && firstChild.textContent.includes('No errors')) {
            container.removeChild(firstChild);
        }
    }

    /**
     * Limit console history to prevent memory issues
     */
    limitConsoleHistory(container, maxEntries) {
        const entries = container.children;
        while (entries.length > maxEntries) {
            container.removeChild(entries[0]);
        }
    }

    /**
     * Record error for performance monitoring
     */
    recordError(errorInfo) {
        if (!this.errorHistory) {
            this.errorHistory = [];
        }

        this.errorHistory.push({
            ...errorInfo,
            count: 1
        });

        // Keep only last 100 errors
        if (this.errorHistory.length > 100) {
            this.errorHistory.shift();
        }

        // Check for error patterns
        this.analyzeErrorPatterns();
    }

    /**
     * Analyze error patterns for troubleshooting
     */
    analyzeErrorPatterns() {
        if (this.errorHistory.length < 5) return;

        // Check for repeated errors
        const errorCounts = {};
        this.errorHistory.forEach(error => {
            const key = error.message.substring(0, 50); // First 50 chars as key
            errorCounts[key] = (errorCounts[key] || 0) + 1;
        });

        const repeatedErrors = Object.entries(errorCounts).filter(([_, count]) => count > 3);
        if (repeatedErrors.length > 0) {
            console.warn('Repeated error patterns detected:', repeatedErrors);
        }
    }

    /**
     * Get error statistics
     */
    getErrorStats() {
        if (!this.errorHistory) {
            return { total: 0, recent: [], patterns: {} };
        }

        const recent = this.errorHistory.slice(-10);
        const errorsBySource = {};

        this.errorHistory.forEach(error => {
            errorsBySource[error.source] = (errorsBySource[error.source] || 0) + 1;
        });

        return {
            total: this.errorHistory.length,
            recent: recent.map(e => ({
                message: e.message,
                timestamp: e.timestamp,
                source: e.source
            })),
            errorsBySource,
            errorRate: this.errorHistory.length / (performance.now() / 1000) // errors per second
        };
    }

    /**
     * Clear error history
     */
    clearErrorHistory() {
        this.errorHistory = [];
        const errorsTab = document.getElementById('console-errors-list');
        if (errorsTab) {
            errorsTab.innerHTML = '';
        }
        const warningsTab = document.getElementById('console-warnings-list');
        if (warningsTab) {
            warningsTab.innerHTML = '';
        }
    }

    /**
     * Capitalize first letter
     */
    capitalizeFirst(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    /**
     * Get performance statistics
     */
    getPerformanceStats() {
        const stats = {};
        for (const [operation, measurements] of Object.entries(this.performanceMetrics)) {
            if (measurements && measurements.length > 0) {
                const avg = measurements.reduce((a, b) => a + b, 0) / measurements.length;
                const min = Math.min(...measurements);
                const max = Math.max(...measurements);

                stats[operation] = {
                    average: avg,
                    min: min,
                    max: max,
                    count: measurements.length
                };
            }
        }
        return stats;
    }
}

export default MusicNotationEditor;