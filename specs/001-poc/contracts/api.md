# API Contracts: Music Notation Editor POC

**Branch**: `001-poc` | **Date**: 2025-10-11 | **Status**: Phase 1 Design

This document defines the API contracts and interfaces for the Music Notation Editor POC, including WASM module interfaces, JavaScript integration points, and user interaction APIs.

---

## Overview

The Music Notation Editor uses a **hybrid WASM-JavaScript architecture** where performance-critical operations are implemented in Rust/WASM and user interface interactions are handled in JavaScript. The API contracts define the boundaries between these components and ensure type-safe communication.

**Architecture Components:**
- **WASM Module**: Rust implementation of core music notation logic
- **JavaScript Host**: Web interface and user interaction handling
- **DOM Integration**: Real-time rendering and user feedback
- **Event System**: Keyboard input, selection, and command handling

---

## WASM Module API

### Core Module Interface

```rust
// src/rust/lib.rs - Main WASM module interface
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct MusicNotationEditor {
    document: Document,
    parser: CellParser,
    renderer: LayoutRenderer,
}

#[wasm_bindgen]
impl MusicNotationEditor {
    /// Create a new music notation editor instance
    #[wasm_bindgen(constructor)]
    pub fn new() -> MusicNotationEditor;

    /// Initialize the editor with default configuration
    #[wasm_bindgen(js_name = initialize)]
    pub fn initialize(&mut self) -> Result<(), JsValue>;

    /// Parse musical notation text into Cells
    #[wasm_bindgen(js_name = parseText)]
    pub fn parse_text(&mut self, text: &str) -> Result<JsValue, JsValue>;

    /// Get current document state as JSON
    #[wasm_bindgen(js_name = getDocumentState)]
    pub fn get_document_state(&self) -> Result<JsValue, JsValue>;

    /// Set document state from JSON
    #[wasm_bindgen(js_name = setDocumentState)]
    pub fn set_document_state(&mut self, state: &str) -> Result<(), JsValue>;

    /// Insert text at cursor position
    #[wasm_bindgen(js_name = insertText)]
    pub fn insert_text(&mut self, text: &str, position: usize) -> Result<usize, JsValue>;

    /// Delete text at specified range
    #[wasm_bindgen(js_name = deleteRange)]
    pub fn delete_range(&mut self, start: usize, end: usize) -> Result<(), JsValue>;

    /// Convert pitch systems
    #[wasm_bindgen(js_name = convertPitchSystem)]
    pub fn convert_pitch_system(&self, pitch: &str, from: u8, to: u8) -> Result<String, JsValue>;
}
```

### Cell Parser API

```rust
// src/rust/parse/cell.rs
#[wasm_bindgen]
pub struct CellParser {
    segmenter: GraphemeSegmenter,
    token_recognizer: TokenRecognizer,
}

#[wasm_bindgen]
impl CellParser {
    /// Create a new Cell parser
    #[wasm_bindgen(constructor)]
    pub fn new() -> CellParser;

    /// Parse text into Cell array
    #[wasm_bindgen(js_name = parseToCells)]
    pub fn parse_to_char_cells(&mut self, text: &str) -> Result<JsValue, JsValue>;

    /// Identify head markers for multi-character tokens
    #[wasm_bindgen(js_name = identifyHeadMarkers)]
    pub fn identify_head_markers(&self, text: &str) -> Result<JsValue, JsValue>;

    /// Validate musical notation syntax
    #[wasm_bindgen(js_name = validateNotation)]
    pub fn validate_notation(&self, text: &str) -> Result<JsValue, JsValue>;
}
```

### Beat Derivation API

```rust
// src/rust/parse/beats.rs
#[wasm_bindgen]
pub struct BeatDeriver {
    config: BeatConfig,
}

#[wasm_bindgen]
impl BeatDeriver {
    /// Create a new beat deriver with default configuration
    #[wasm_bindgen(constructor)]
    pub fn new() -> BeatDeriver;

    /// Derive implicit beats from Cell array
    #[wasm_bindgen(js_name = deriveImplicitBeats)]
    pub fn derive_implicit_beats(&self, char_cells: &JsValue) -> Result<JsValue, JsValue>;

    /// Update beat configuration
    #[wasm_bindgen(js_name = updateConfig)]
    pub fn update_config(&mut self, draw_single_cell_loops: bool, breath_ends_beat: bool);

    /// Get beat configuration
    #[wasm_bindgen(js_name = getConfig)]
    pub fn get_config(&self) -> JsValue;
}

#[wasm_bindgen]
#[derive(serde::Serialize, serde::Deserialize)]
pub struct BeatConfig {
    pub draw_single_cell_loops: bool,
    pub breath_ends_beat: bool,
    pub loop_offset_px: f32,
    pub loop_height_px: f32,
}
```

### Layout and Rendering API

```rust
// src/rust/renderers/layout.rs
#[wasm_bindgen]
pub struct LayoutRenderer {
    font_size: f32,
    char_width: f32,
    line_height: f32,
}

#[wasm_bindgen]
impl LayoutRenderer {
    /// Create a new layout renderer
    #[wasm_bindgen(constructor)]
    pub fn new(font_size: f32) -> LayoutRenderer;

    /// Calculate positions for Cell array
    #[wasm_bindgen(js_name = calculatePositions)]
    pub fn calculate_positions(&self, char_cells: &JsValue, lane: u8) -> Result<JsValue, JsValue>;

    /// Calculate beat loop positions
    #[wasm_bindgen(js_name = calculateBeatLoopPositions)]
    pub fn calculate_beat_loop_positions(&self, beats: &JsValue, char_cells: &JsValue) -> Result<JsValue, JsValue>;

    /// Calculate slur curve positions
    #[wasm_bindgen(js_name = calculateSlurPositions)]
    pub fn calculate_slur_positions(&self, slurs: &JsValue, char_cells: &JsValue) -> Result<JsValue, JsValue>;
}
```

### Pitch System Conversion API

```rust
// src/rust/models/pitch_systems/mod.rs
#[wasm_bindgen]
pub struct PitchConverter {
    number_converter: NumberSystem,
    western_converter: WesternSystem,
    sargam_converter: SargamSystem,
}

#[wasm_bindgen]
impl PitchConverter {
    /// Create a new pitch converter
    #[wasm_bindgen(constructor)]
    pub fn new() -> PitchConverter;

    /// Convert pitch between systems
    #[wasm_bindgen(js_name = convertPitch)]
    pub fn convert_pitch(&self, pitch: &str, from_system: u8, to_system: u8) -> Result<String, JsValue>;

    /// Validate pitch notation
    #[wasm_bindgen(js_name = validatePitch)]
    pub fn validate_pitch(&self, pitch: &str, system: u8) -> Result<bool, JsValue>;

    /// Get supported pitch systems
    #[wasm_bindgen(js_name = getSupportedSystems)]
    pub fn get_supported_systems(&self) -> JsValue;
}
```

### Selection and Command API

```rust
// src/rust/models/core.rs - Selection handling
#[wasm_bindgen]
pub struct SelectionManager {
    document: Document,
    current_selection: Option<Selection>,
}

#[wasm_bindgen]
impl SelectionManager {
    /// Create a new selection manager
    #[wasm_bindgen(constructor)]
    pub fn new() -> SelectionManager;

    /// Set cursor position
    #[wasm_bindgen(js_name = setCursor)]
    pub fn set_cursor(&mut self, stave: usize, lane: u8, column: usize) -> Result<(), JsValue>;

    /// Create selection range
    #[wasm_bindgen(js_name = createSelection)]
    pub fn create_selection(&mut self, start_stave: usize, start_lane: u8, start_column: usize,
                           end_stave: usize, end_lane: u8, end_column: usize) -> Result<(), JsValue>;

    /// Apply slur command to selection
    #[wasm_bindgen(js_name = applySlurCommand)]
    pub fn apply_slur_command(&mut self) -> Result<(), JsValue>;

    /// Apply octave command to selection
    #[wasm_bindgen(js_name = applyOctaveCommand)]
    pub fn apply_octave_command(&mut self, octave: i8) -> Result<(), JsValue>;

    /// Get current selection state
    #[wasm_bindgen(js_name = getSelectionState)]
    pub fn get_selection_state(&self) -> JsValue;

    /// Clear selection
    #[wasm_bindgen(js_name = clearSelection)]
    pub fn clear_selection(&mut self);
}
```

---

## JavaScript Integration API

### Main Editor Interface

```javascript
// src/js/editor.js - Main editor interface
class MusicNotationEditor {
    constructor(canvasElement) {
        this.canvas = canvasElement;
        this.wasmModule = null;
        this.document = null;
        this.renderer = null;
        this.selectionManager = null;
        this.eventHandlers = new Map();
    }

    // Initialize the editor
    async initialize() {
        try {
            // Load WASM module
            const { MusicNotationEditor } = await import('../pkg/music_notation_wasm.js');
            this.wasmModule = new MusicNotationEditor();

            // Initialize WASM module
            await this.wasmModule.initialize();

            // Setup DOM event handlers
            this.setupEventHandlers();

            // Initialize renderer
            this.renderer = new DOMRenderer(this.canvas);

            console.log('Music Notation Editor initialized');
        } catch (error) {
            console.error('Failed to initialize editor:', error);
            throw error;
        }
    }

    // Load document from JSON
    async loadDocument(jsonString) {
        try {
            await this.wasmModule.setDocumentState(jsonString);
            this.document = JSON.parse(jsonString);
            this.render();
        } catch (error) {
            console.error('Failed to load document:', error);
            throw error;
        }
    }

    // Save document to JSON
    async saveDocument() {
        try {
            const state = await this.wasmModule.getDocumentState();
            return state;
        } catch (error) {
            console.error('Failed to save document:', error);
            throw error;
        }
    }

    // Insert text at current cursor position
    async insertText(text) {
        try {
            const cursorPos = this.getCursorPosition();
            const newPosition = await this.wasmModule.insertText(text, cursorPos);
            this.setCursorPosition(newPosition);
            this.render();
        } catch (error) {
            console.error('Failed to insert text:', error);
            throw error;
        }
    }

    // Handle keyboard input
    handleKeyboardEvent(event) {
        const key = event.key;
        const modifiers = {
            alt: event.altKey,
            ctrl: event.ctrlKey,
            shift: event.shiftKey,
        };

        // Route to appropriate handler
        if (modifiers.alt && !modifiers.ctrl && !modifiers.shift) {
            this.handleAltCommand(key);
        } else if (modifiers.shift && !modifiers.alt && !modifiers.ctrl) {
            this.handleShiftCommand(key);
        } else {
            this.handleNormalKey(key);
        }
    }

    // Handle Alt+key commands (musical commands)
    handleAltCommand(key) {
        switch (key.toLowerCase()) {
            case 's':
                this.applySlur();
                break;
            case 'u':
                this.applyOctave(1);
                break;
            case 'm':
                this.applyOctave(0);
                break;
            case 'l':
                this.applyOctave(-1);
                break;
            case 't':
                this.showTalaDialog();
                break;
            default:
                console.log('Unknown Alt command:', key);
        }
    }

    // Handle Shift+key commands (selection)
    handleShiftCommand(key) {
        switch (key) {
            case 'ArrowLeft':
                this.expandSelection('left');
                break;
            case 'ArrowRight':
                this.expandSelection('right');
                break;
            case 'ArrowUp':
                this.moveCursor('up', true);
                break;
            case 'ArrowDown':
                this.moveCursor('down', true);
                break;
            case 'Home':
                this.expandSelectionToLineStart();
                break;
            case 'End':
                this.expandSelectionToLineEnd();
                break;
            default:
                console.log('Unknown Shift command:', key);
        }
    }

    // Handle normal keys (text input)
    handleNormalKey(key) {
        switch (key) {
            case 'ArrowLeft':
            case 'ArrowRight':
            case 'ArrowUp':
            case 'ArrowDown':
            case 'Home':
            case 'End':
                this.handleNavigation(key);
                break;
            case 'Backspace':
                this.handleBackspace();
                break;
            case 'Delete':
                this.handleDelete();
                break;
            default:
                // Insert text character
                if (key.length === 1) {
                    this.insertText(key);
                }
        }
    }

    // Apply slur to current selection
    async applySlur() {
        try {
            await this.wasmModule.applySlurCommand();
            this.render();
        } catch (error) {
            console.error('Failed to apply slur:', error);
        }
    }

    // Apply octave to current selection
    async applyOctave(octave) {
        try {
            await this.wasmModule.applyOctaveCommand(octave);
            this.render();
        } catch (error) {
            console.error('Failed to apply octave:', error);
        }
    }

    // Show tala input dialog
    showTalaDialog() {
        const tala = prompt('Enter tala (digits 0-9+):');
        if (tala !== null) {
            this.setTala(tala);
        }
    }

    // Set tala for current line
    async setTala(talaString) {
        try {
            // Update document metadata
            const state = await this.wasmModule.getDocumentState();
            const doc = JSON.parse(state);

            if (doc.lines.length > 0) {
                doc.lines[0].metadata.tala = talaString;
                await this.wasmModule.setDocumentState(JSON.stringify(doc));
                this.render();
            }
        } catch (error) {
            console.error('Failed to set tala:', error);
        }
    }

    // Render the current document
    async render() {
        try {
            const state = await this.wasmModule.getDocumentState();
            const doc = JSON.parse(state);

            this.renderer.renderDocument(doc);
        } catch (error) {
            console.error('Failed to render document:', error);
        }
    }

    // Get current cursor position
    getCursorPosition() {
        // Return current cursor position from DOM state
        return this.cursorPosition || 0;
    }

    // Set cursor position
    setCursorPosition(position) {
        this.cursorPosition = position;
        this.updateCursorDisplay();
    }

    // Update cursor display
    updateCursorDisplay() {
        // Update DOM to show cursor at new position
        this.renderer.updateCursor(this.cursorPosition);
    }
}
```

### DOM Renderer Interface

```javascript
// src/js/renderer.js - DOM-based renderer
class DOMRenderer {
    constructor(canvasElement) {
        this.canvas = canvasElement;
        this.charCellElements = new Map();
        this.beatLoopElements = new Map();
        this.slurCanvas = null;
        this.setupSlurCanvas();
    }

    // Render entire document
    renderDocument(document) {
        this.clearCanvas();

        // Render each line
        document.lines.forEach((line, lineIndex) => {
            this.renderLine(line, lineIndex);
        });

        // Render beat loops
        this.renderBeatLoops(document);

        // Render slurs
        this.renderSlurs(document);
    }

    // Render a single line
    renderLine(line, lineIndex) {
        const lineElement = this.getLineElement(lineIndex);

        // Render each lane
        line.lanes.forEach((lane, laneIndex) => {
            this.renderLane(lane, lineIndex, laneIndex);
        });
    }

    // Render a lane
    renderLane(lane, lineIndex, laneIndex) {
        lane.forEach((charCell, cellIndex) => {
            this.renderCell(charCell, lineIndex, laneIndex, cellIndex);
        });
    }

    // Render a single Cell
    renderCell(charCell, lineIndex, laneIndex, cellIndex) {
        const element = this.getOrCreateCellElement(charCell, lineIndex, laneIndex, cellIndex);

        // Update element content and style
        element.textContent = charCell.grapheme;
        element.className = this.getCellClasses(charCell);
        element.style.left = `${charCell.x}px`;
        element.style.top = `${charCell.y}px`;

        // Add event listeners
        this.addCellEventListeners(element, charCell);
    }

    // Get CSS classes for Cell
    getCellClasses(charCell) {
        const classes = ['char-cell'];

        // Add lane class
        classes.push(`lane-${this.getLaneName(charCell.lane)}`);

        // Add element kind class
        classes.push(`kind-${this.getElementKindName(charCell.kind)}`);

        // Add state classes
        if (charCell.flags & 0x02) classes.push('selected');
        if (charCell.flags & 0x04) classes.push('focused');

        // Add pitch system class if applicable
        if (charCell.pitch_system) {
            classes.push(`pitch-system-${this.getPitchSystemName(charCell.pitch_system)}`);
        }

        return classes.join(' ');
    }

    // Get lane name from enum
    getLaneName(laneKind) {
        const laneNames = ['upper', 'letter', 'lower', 'lyrics'];
        return laneNames[laneKind] || 'unknown';
    }

    // Get element kind name
    getElementKindName(elementKind) {
        const kindNames = [
            'unknown', 'pitched', 'unpitched', 'upper-annotation',
            'lower-annotation', 'text', 'barline', 'breath', 'whitespace'
        ];
        return kindNames[elementKind] || 'unknown';
    }

    // Get pitch system name
    getPitchSystemName(pitchSystem) {
        const systemNames = ['unknown', 'number', 'western', 'sargam', 'bhatkhande', 'tabla'];
        return systemNames[pitchSystem] || 'unknown';
    }

    // Render beat loops
    renderBeatLoops(document) {
        document.lines.forEach((line, lineIndex) => {
            line.beats.forEach((beat, beatIndex) => {
                this.renderBeatLoop(beat, lineIndex, beatIndex);
            });
        });
    }

    // Render single beat loop
    renderBeatLoop(beat, lineIndex, beatIndex) {
        const element = this.getOrCreateBeatLoopElement(beat, lineIndex, beatIndex);

        element.style.left = `${beat.visual.start_x}px`;
        element.style.width = `${beat.visual.width}px`;
        element.style.bottom = `${beat.visual.loop_offset_px}px`;
        element.style.height = `${beat.visual.loop_height_px}px`;
    }

    // Render slurs using canvas
    renderSlurs(document) {
        const ctx = this.slurCanvas.getContext('2d');
        ctx.clearRect(0, 0, this.slurCanvas.width, this.slurCanvas.height);

        document.lines.forEach((line, lineIndex) => {
            line.slurs.forEach((slur, slurIndex) => {
                this.renderSlur(ctx, slur);
            });
        });
    }

    // Render single slur
    renderSlur(ctx, slur) {
        ctx.beginPath();
        ctx.strokeStyle = '#333';
        ctx.lineWidth = slur.visual.thickness;

        // Calculate Bézier curve
        const width = slur.end.x - slur.start.x;
        const controlHeight = width * slur.visual.curvature;

        ctx.moveTo(slur.start.x, slur.start.y);
        ctx.bezierCurveTo(
            slur.start.x + width * 0.25, slur.start.y - controlHeight,
            slur.end.x - width * 0.25, slur.end.y - controlHeight,
            slur.end.x, slur.end.y
        );

        ctx.stroke();
    }

    // Setup canvas for slur rendering
    setupSlurCanvas() {
        this.slurCanvas = document.createElement('canvas');
        this.slurCanvas.className = 'slur-canvas-overlay';
        this.slurCanvas.style.position = 'absolute';
        this.slurCanvas.style.top = '0';
        this.slurCanvas.style.left = '0';
        this.slurCanvas.style.pointerEvents = 'none';
        this.canvas.appendChild(this.slurCanvas);
    }

    // Clear canvas
    clearCanvas() {
        // Remove all Cell elements
        this.charCellElements.clear();
        this.beatLoopElements.clear();

        // Clear canvas content
        while (this.canvas.firstChild) {
            this.canvas.removeChild(this.canvas.firstChild);
        }

        // Re-setup slur canvas
        this.setupSlurCanvas();
    }

    // Update cursor position
    updateCursor(position) {
        // Update cursor display
        const cursor = this.getOrCreateCursorElement();
        // Position cursor at specified position
        // Implementation details depend on layout calculations
    }
}
```

### Event System Interface

```javascript
// src/js/events.js - Event handling system
class EventManager {
    constructor(editor) {
        this.editor = editor;
        this.eventListeners = new Map();
        this.setupGlobalListeners();
    }

    // Setup global event listeners
    setupGlobalListeners() {
        // Keyboard events
        document.addEventListener('keydown', (event) => {
            if (this.editor.canvas.contains(document.activeElement)) {
                this.editor.handleKeyboardEvent(event);
            }
        });

        // Focus events
        this.editor.canvas.addEventListener('focus', () => {
            this.editor.canvas.classList.add('focused');
            this.showCursor();
        });

        this.editor.canvas.addEventListener('blur', () => {
            this.editor.canvas.classList.remove('focused');
            this.hideCursor();
        });

        // Click events for caret positioning
        this.editor.canvas.addEventListener('click', (event) => {
            this.handleCanvasClick(event);
        });
    }

    // Handle canvas click for caret positioning
    handleCanvasClick(event) {
        const rect = this.editor.canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        // Calculate Cell position from click coordinates
        const charCellPosition = this.calculateCellPosition(x, y);

        if (charCellPosition !== null) {
            this.editor.setCursorPosition(charCellPosition);
            this.editor.canvas.focus();
        }
    }

    // Calculate Cell position from coordinates
    calculateCellPosition(x, y) {
        // Implementation depends on layout calculations
        // Return column index or null if no valid position
        return null; // Placeholder
    }

    // Show cursor
    showCursor() {
        const cursor = this.getCursorElement();
        cursor.style.display = 'block';
    }

    // Hide cursor
    hideCursor() {
        const cursor = this.getCursorElement();
        cursor.style.display = 'none';
    }

    // Get cursor element
    getCursorElement() {
        let cursor = document.querySelector('.cursor-indicator');
        if (!cursor) {
            cursor = document.createElement('div');
            cursor.className = 'cursor-indicator';
            this.editor.canvas.appendChild(cursor);
        }
        return cursor;
    }
}
```

---

## File Operations API

### Document Persistence

```javascript
// src/js/file-operations.js - File handling
class FileOperations {
    constructor(editor) {
        this.editor = editor;
        this.setupMenuHandlers();
    }

    // Setup menu event handlers
    setupMenuHandlers() {
        // File menu items
        document.getElementById('menu-new').addEventListener('click', () => this.newDocument());
        document.getElementById('menu-open').addEventListener('click', () => this.openDocument());
        document.getElementById('menu-save').addEventListener('click', () => this.saveDocument());
        document.getElementById('menu-export-musicxml').addEventListener('click', () => this.exportMusicXML());
        document.getElementById('menu-export-lilypond').addEventListener('click', () => this.exportLilyPond());
    }

    // Create new document
    async newDocument() {
        try {
            const emptyDoc = {
                metadata: {
                    title: "Untitled Document",
                    pitch_system: 1, // Number system
                    created_at: new Date().toISOString()
                },
                lines: [{
                    lanes: [[], [], [], []], // Empty lanes
                    metadata: {},
                    beats: [],
                    slurs: []
                }],
                state: {
                    cursor: { stave: 0, lane: 1, column: 0 },
                    selection: null,
                    has_focus: false
                }
            };

            await this.editor.loadDocument(JSON.stringify(emptyDoc));
            this.updateDocumentTitle("Untitled Document");
        } catch (error) {
            console.error('Failed to create new document:', error);
            this.showError('Failed to create new document');
        }
    }

    // Open document from file
    async openDocument() {
        try {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';

            input.onchange = async (event) => {
                const file = event.target.files[0];
                if (file) {
                    const text = await file.text();
                    await this.editor.loadDocument(text);
                    this.updateDocumentTitle(file.name);
                }
            };

            input.click();
        } catch (error) {
            console.error('Failed to open document:', error);
            this.showError('Failed to open document');
        }
    }

    // Save document to file
    async saveDocument() {
        try {
            const documentState = await this.editor.saveDocument();
            const blob = new Blob([documentState], { type: 'application/json' });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = this.getDocumentTitle() + '.json';
            a.click();

            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Failed to save document:', error);
            this.showError('Failed to save document');
        }
    }

    // Export to MusicXML (stub)
    exportMusicXML() {
        this.showStubMessage('MusicXML export is not implemented in this POC');
    }

    // Export to LilyPond (stub)
    exportLilyPond() {
        this.showStubMessage('LilyPond export is not implemented in this POC');
    }

    // Show stub message
    showStubMessage(feature) {
        alert(feature);
    }

    // Get document title
    getDocumentTitle() {
        return this.documentTitle || 'Untitled Document';
    }

    // Update document title
    updateDocumentTitle(title) {
        this.documentTitle = title;
        document.title = `${title} - Music Notation Editor`;
    }

    // Show error message
    showError(message) {
        console.error(message);
        // Could also show in UI error panel
    }
}
```

---

## Performance Contracts

### Response Time Targets

```javascript
// src/js/performance-contracts.js - Performance monitoring
class PerformanceMonitor {
    constructor() {
        this.metrics = new Map();
        this.targets = {
            focusActivation: 10,      // ms
            typingLatency: 50,         // ms
            navigationSpeed: 16,       // ms (60fps)
            beatDerivation: 10,        // ms
            renderTime: 10,           // ms
        };
    }

    // Measure operation performance
    measure(operationName, operation) {
        const startTime = performance.now();
        const result = operation();
        const endTime = performance.now();
        const duration = endTime - startTime;

        this.recordMetric(operationName, duration);
        this.checkTarget(operationName, duration);

        return result;
    }

    // Measure async operation performance
    async measureAsync(operationName, operation) {
        const startTime = performance.now();
        const result = await operation();
        const endTime = performance.now();
        const duration = endTime - startTime;

        this.recordMetric(operationName, duration);
        this.checkTarget(operationName, duration);

        return result;
    }

    // Record performance metric
    recordMetric(operationName, duration) {
        if (!this.metrics.has(operationName)) {
            this.metrics.set(operationName, []);
        }

        const metricHistory = this.metrics.get(operationName);
        metricHistory.push(duration);

        // Keep only last 100 measurements
        if (metricHistory.length > 100) {
            metricHistory.shift();
        }
    }

    // Check if performance meets target
    checkTarget(operationName, duration) {
        const target = this.targets[operationName];
        if (target && duration > target) {
            console.warn(`Performance warning: ${operationName} took ${duration.toFixed(2)}ms (target: ${target}ms)`);
        }
    }

    // Get performance statistics
    getStatistics(operationName) {
        const metricHistory = this.metrics.get(operationName) || [];
        if (metricHistory.length === 0) {
            return null;
        }

        const sorted = [...metricHistory].sort((a, b) => a - b);
        const sum = metricHistory.reduce((a, b) => a + b, 0);

        return {
            count: metricHistory.length,
            average: sum / metricHistory.length,
            min: sorted[0],
            max: sorted[sorted.length - 1],
            p50: sorted[Math.floor(sorted.length * 0.5)],
            p95: sorted[Math.floor(sorted.length * 0.95)],
            p99: sorted[Math.floor(sorted.length * 0.99)],
        };
    }

    // Generate performance report
    generateReport() {
        const report = {};

        for (const [operationName] of this.metrics) {
            report[operationName] = this.getStatistics(operationName);
        }

        return report;
    }
}
```

---

## Error Handling Contracts

### Error Types and Handling

```javascript
// src/js/error-handling.js - Error handling system
class ErrorHandler {
    constructor(editor) {
        this.editor = editor;
        this.errorLog = [];
        this.setupErrorHandlers();
    }

    // Setup global error handlers
    setupErrorHandlers() {
        // WASM errors
        window.addEventListener('unhandledrejection', (event) => {
            this.handleWasmError(event.reason);
        });

        // JavaScript errors
        window.addEventListener('error', (event) => {
            this.handleJavaScriptError(event.error);
        });
    }

    // Handle WASM errors
    handleWasmError(error) {
        const errorInfo = {
            type: 'wasm',
            message: error.message || 'Unknown WASM error',
            stack: error.stack,
            timestamp: new Date().toISOString(),
            context: this.getEditorContext(),
        };

        this.logError(errorInfo);
        this.showErrorToUser(errorInfo);
    }

    // Handle JavaScript errors
    handleJavaScriptError(error) {
        const errorInfo = {
            type: 'javascript',
            message: error.message || 'Unknown JavaScript error',
            stack: error.stack,
            timestamp: new Date().toISOString(),
            context: this.getEditorContext(),
        };

        this.logError(errorInfo);
        this.showErrorToUser(errorInfo);
    }

    // Get current editor context for error reporting
    getEditorContext() {
        return {
            documentTitle: this.editor.getDocumentTitle(),
            cursorPosition: this.editor.getCursorPosition(),
            hasSelection: this.editor.hasSelection(),
            focusState: this.editor.hasFocus(),
        };
    }

    // Log error for debugging
    logError(errorInfo) {
        this.errorLog.push(errorInfo);

        // Keep only last 100 errors
        if (this.errorLog.length > 100) {
            this.errorLog.shift();
        }

        // Log to console
        console.error('Editor Error:', errorInfo);

        // Update error display in UI
        this.updateErrorDisplay();
    }

    // Show error to user
    showErrorToUser(errorInfo) {
        // Update console errors tab
        this.updateConsoleErrorsTab(errorInfo);

        // Show non-blocking notification
        this.showNotification(errorInfo.message, 'error');
    }

    // Update console errors tab
    updateConsoleErrorsTab(errorInfo) {
        const errorsTab = document.getElementById('console-errors-tab');
        if (errorsTab) {
            const errorElement = document.createElement('div');
            errorElement.className = 'error-entry';
            errorElement.innerHTML = `
                <span class="error-time">${new Date(errorInfo.timestamp).toLocaleTimeString()}</span>
                <span class="error-type">${errorInfo.type.toUpperCase()}</span>
                <span class="error-message">${errorInfo.message}</span>
            `;

            errorsTab.appendChild(errorElement);
            errorsTab.scrollTop = errorsTab.scrollHeight;
        }
    }

    // Show notification to user
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;

        document.body.appendChild(notification);

        // Auto-remove after 5 seconds
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 5000);
    }

    // Get error log
    getErrorLog() {
        return [...this.errorLog];
    }

    // Clear error log
    clearErrorLog() {
        this.errorLog = [];
        this.updateErrorDisplay();
    }

    // Update error display in UI
    updateErrorDisplay() {
        const errorsTab = document.getElementById('console-errors-tab');
        if (errorsTab) {
            errorsTab.innerHTML = '';
            this.errorLog.forEach(error => {
                this.updateConsoleErrorsTab(error);
            });
        }
    }
}
```

---

## Validation Contracts

### Input Validation

```javascript
// src/js/validation.js - Input validation
class InputValidator {
    constructor() {
        this.patterns = {
            // Valid musical notation patterns
            pitchedElement: /^[A-Ga-gSrRgGmMPdDnN1-7][#b♯♭]*$/,
            unpitchedElement: /^[-'|" ]+$/,
            textToken: /^[A-Za-z0-9\s]+$/,

            // Tala patterns
            tala: /^[0-9+]+$/,

            // Document constraints
            maxLineLength: 1000,
            maxLines: 1, // POC constraint
        };
    }

    // Validate musical notation input
    validateMusicalNotation(text) {
        const errors = [];

        if (text.length === 0) {
            return { valid: true, errors: [] };
        }

        if (text.length > this.patterns.maxLineLength) {
            errors.push(`Text too long: ${text.length} characters (max: ${this.patterns.maxLineLength})`);
        }

        // Check each character/character combination
        const chars = this.graphemeSegments(text);

        chars.forEach((segment, index) => {
            if (this.patterns.pitchedElement.test(segment)) {
                // Valid pitched element
            } else if (this.patterns.unpitchedElement.test(segment)) {
                // Valid unpitched element
            } else if (this.patterns.textToken.test(segment)) {
                // Valid text token
            } else {
                errors.push(`Invalid musical notation at position ${index}: "${segment}"`);
            }
        });

        return {
            valid: errors.length === 0,
            errors: errors,
        };
    }

    // Validate tala input
    validateTala(tala) {
        if (!tala || tala.trim() === '') {
            return { valid: true, errors: [] }; // Empty is valid
        }

        if (!this.patterns.tala.test(tala)) {
            return {
                valid: false,
                errors: [`Invalid tala format: "${tala}". Only digits 0-9 and + are allowed.`],
            };
        }

        return { valid: true, errors: [] };
    }

    // Validate document structure
    validateDocument(document) {
        const errors = [];

        // Check required fields
        if (!document.metadata) {
            errors.push('Document missing metadata');
        }

        if (!document.lines || !Array.isArray(document.lines)) {
            errors.push('Document missing lines array');
        } else {
            // Check line count (POC constraint)
            if (document.lines.length > this.patterns.maxLines) {
                errors.push(`Too many lines: ${document.lines.length} (max: ${this.patterns.maxLines})`);
            }

            // Validate each line
            document.lines.forEach((line, index) => {
                const lineErrors = this.validateLine(line, index);
                errors.push(...lineErrors.map(err => `Line ${index + 1}: ${err}`));
            });
        }

        return {
            valid: errors.length === 0,
            errors: errors,
        };
    }

    // Validate line structure
    validateLine(line, lineIndex) {
        const errors = [];

        if (!line.lanes || !Array.isArray(line.lanes) || line.lanes.length !== 4) {
            errors.push('Line must have exactly 4 lanes');
            return errors;
        }

        // Validate each lane
        const laneNames = ['Upper', 'Letter', 'Lower', 'Lyrics'];
        line.lanes.forEach((lane, laneIndex) => {
            if (!Array.isArray(lane)) {
                errors.push(`${laneNames[laneIndex]} lane must be an array`);
                return;
            }

            // Validate Cells in lane
            lane.forEach((cell, cellIndex) => {
                const cellErrors = this.validateCell(cell, lineIndex, laneIndex, cellIndex);
                errors.push(...cellErrors.map(err => `${laneNames[laneIndex]} lane, cell ${cellIndex + 1}: ${err}`));
            });
        });

        return errors;
    }

    // Validate Cell structure
    validateCell(cell, lineIndex, laneIndex, cellIndex) {
        const errors = [];

        const requiredFields = ['grapheme', 'kind', 'lane', 'col'];
        requiredFields.forEach(field => {
            if (!(field in cell)) {
                errors.push(`Missing required field: ${field}`);
            }
        });

        if (cell.grapheme && typeof cell.grapheme !== 'string') {
            errors.push('grapheme must be a string');
        }

        if (cell.kind !== undefined && typeof cell.kind !== 'number') {
            errors.push('kind must be a number');
        }

        if (cell.col !== undefined && (typeof cell.col !== 'number' || cell.col < 0)) {
            errors.push('col must be a non-negative number');
        }

        return errors;
    }

    // Split text into grapheme clusters
    graphemeSegments(text) {
        // Use Intl.Segmenter if available, fallback to simple split
        if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
            const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
            return [...segmenter.segment(text)].map(segment => segment.segment);
        } else {
            // Simple fallback (not as accurate for complex characters)
            return text.split('');
        }
    }
}
```

---

## Conclusion

These API contracts define the complete interface between the WASM core logic and JavaScript user interface for the Music Notation Editor POC. The contracts ensure:

1. **Type Safety**: Clear interfaces between Rust and JavaScript components
2. **Performance**: Optimized data transfer and operation timing
3. **Error Handling**: Comprehensive error reporting and recovery
4. **Extensibility**: Clean separation of concerns for future enhancements
5. **User Experience**: Responsive interaction with immediate feedback

The contracts support all functional requirements from the specification while maintaining the performance targets and code quality standards established in the research phase.