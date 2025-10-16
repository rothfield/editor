/**
 * Constants and Configuration
 *
 * Centralized configuration values and magic numbers used throughout
 * the Music Notation Editor application.
 */

// ============================================================================
// Typography Constants
// ============================================================================

/**
 * Base typography values
 * All layout dimensions are derived from these foundational typography measurements
 */
export const BASE_FONT_SIZE = 16;       // Base font size in pixels (body text)
export const BASE_LINE_HEIGHT = 16;     // Base line height in pixels
export const SMALL_FONT_SIZE = 12;      // Small font size for octave dots and tala
export const BRAVURA_FONT_SIZE = BASE_FONT_SIZE * 0.70;  // SMuFL music font size for barlines (70% of pitched element size)
export const BRAVURA_VERTICAL_OFFSET = BASE_FONT_SIZE * 0.4;  // Vertical offset for barline glyphs (40% of base font size)

// ============================================================================
// Layout Constants
// ============================================================================

/**
 * Left margin in pixels for notation rendering
 * Used to provide space for line labels and maintain consistent alignment
 */
export const LEFT_MARGIN_PX = 60;

/**
 * Default character width in pixels for layout calculations
 */
export const DEFAULT_CHAR_WIDTH_PX = 12;

/**
 * Cell vertical positioning and spacing
 * These values are typography-based: derived from BASE_FONT_SIZE
 */
export const CELL_Y_OFFSET = 32;        // Distance from top of line container to cell baseline (2 * BASE_FONT_SIZE)
export const CELL_HEIGHT = BASE_LINE_HEIGHT;      // Cell height matches base line height
export const CELL_VERTICAL_PADDING = 32; // Space above cells in line container (2 * BASE_FONT_SIZE)
export const CELL_BOTTOM_PADDING = 32;   // Space below cells in line container (2 * BASE_FONT_SIZE)

/**
 * Line container dimensions
 */
export const LINE_CONTAINER_HEIGHT = 80; // Total height: 32px above + 16px cell + 32px below

/**
 * Metadata and annotation positioning
 */
export const TALA_VERTICAL_OFFSET = 12;  // Distance above cells for tala characters
export const LYRICS_TOP_OFFSET = 52;     // Position below cells (32 + 16 + 4)
export const LYRICS_VERTICAL_GAP = 4;    // Gap between cell bottom and lyrics top

// ============================================================================
// Beat Loop Visualization
// ============================================================================

/**
 * Beat loop arc styling constants
 */
export const BEAT_LOOP_OFFSET_BELOW = 2;  // Gap between cell bottom and beat loop (px)
export const BEAT_LOOP_HEIGHT = 5;         // Height of beat loop arc (px)
export const BEAT_LOOP_BORDER_WIDTH = 2;   // Border thickness (px)
export const BEAT_LOOP_BORDER_COLOR = '#666'; // Beat loop arc color
export const BEAT_LOOP_BORDER_RADIUS = 12; // Corner radius for arc ends (px)

// ============================================================================
// Slur Visualization
// ============================================================================

/**
 * Slur arc styling constants
 */
export const SLUR_OFFSET_ABOVE = 10;       // Distance above cell top (px)
export const SLUR_HEIGHT = 5;              // Height of slur arc (px)
export const SLUR_BORDER_WIDTH = 1.5;      // Border thickness (px)
export const SLUR_BORDER_COLOR = '#4a5568'; // Slur arc color
export const SLUR_BORDER_RADIUS = 12;      // Corner radius for arc ends (px)

// ============================================================================
// Octave Visualization
// ============================================================================

/**
 * Octave dot styling constants
 */
export const OCTAVE_DOT_RADIUS = 3;        // Dot radius (px)
export const OCTAVE_DOT_OFFSET = 10;       // Distance from cell edge (px)
export const OCTAVE_DOT_SPACING = 9;       // Spacing between multiple dots (px)
export const OCTAVE_DOT_COLOR = '#000000'; // Dot color (black)

/**
 * Octave position values
 */
export const OCTAVE_POSITIONS = {
  TWO_UP: 2,
  ONE_UP: 1,
  MIDDLE: 0,
  ONE_DOWN: -1,
  TWO_DOWN: -2
};

// ============================================================================
// Element Types and Enums
// ============================================================================

/**
 * Element kind types
 */
export const ELEMENT_KINDS = {
  UNKNOWN: 0,
  PITCHED: 1,
  UNPITCHED: 2,
  UPPER_ANNOTATION: 3,
  LOWER_ANNOTATION: 4,
  TEXT: 5,
  BARLINE: 6,
  BREATH: 7,
  WHITESPACE: 8
};

/**
 * Element kind names mapping
 */
export const ELEMENT_KIND_NAMES = [
  'unknown',
  'pitched',
  'unpitched',
  'upper-annotation',
  'lower-annotation',
  'text',
  'barline',
  'breath',
  'whitespace'
];

/**
 * Pitch system types
 */
export const PITCH_SYSTEMS = {
  UNKNOWN: 0,
  NUMBER: 1,
  WESTERN: 2,
  SARGAM: 3,
  BHATKHANDE: 4,
  TABLA: 5
};

/**
 * Pitch system names mapping
 */
export const PITCH_SYSTEM_NAMES = [
  'unknown',
  'number',
  'western',
  'sargam',
  'bhatkhande',
  'tabla'
];

/**
 * Slur indicator values
 */
export const SLUR_INDICATORS = {
  NONE: 0,
  START: 1,
  END: 2
};

/**
 * Cell flags (bitfield)
 */
export const CELL_FLAGS = {
  HEAD_MARKER: 0x01,
  SELECTED: 0x02,
  FOCUSED: 0x04
};

// ============================================================================
// Focus and Event Management
// ============================================================================

/**
 * Focus management timing
 */
export const FOCUS_RETURN_TIMEOUT_MS = 50;  // Delay before returning focus to editor
export const FOCUS_ACTIVATION_THRESHOLD_MS = 1000; // Max time to log focus activation

/**
 * Keys that should have default behavior prevented when editor is focused
 */
export const PREVENT_DEFAULT_KEYS = [
  ' ',
  'Tab',
  'Shift+Tab',
  'ArrowUp',
  'ArrowDown',
  'F1',
  'F5',
  'F7',
  'F12',
  // Musical notation Alt commands
  'Alt+s', 'Alt+S',
  'Alt+u', 'Alt+U',
  'Alt+m', 'Alt+M',
  'Alt+l', 'Alt+L',
  'Alt+t', 'Alt+T'
];

/**
 * Modifier keys (to be ignored when pressed alone)
 */
export const MODIFIER_KEYS = ['Alt', 'Control', 'Shift', 'Meta', 'AltGraph'];

// ============================================================================
// Performance Monitoring
// ============================================================================

/**
 * Performance metrics update interval
 */
export const METRICS_UPDATE_INTERVAL_MS = 1000; // Update every second

/**
 * Maximum number of performance samples to keep
 */
export const MAX_PERFORMANCE_SAMPLES = 60; // Keep 60 samples (1 minute at 1/sec)

/**
 * Performance thresholds for warnings
 */
export const PERFORMANCE_THRESHOLDS = {
  TYPING_LATENCY_WARNING_MS: 50,
  RENDER_WARNING_MS: 100,
  BEAT_DERIVATION_WARNING_MS: 50
};

// ============================================================================
// Debug Panel
// ============================================================================

/**
 * Debug panel dimensions and styling
 */
export const DEBUG_PANEL_WIDTH = '384px';  // 96 * 4px (w-96)
export const DEBUG_PANEL_HEIGHT = '512px'; // 128 * 4px (h-128)
export const DEBUG_PANEL_Z_INDEX = 1000;

/**
 * Debug tab names
 */
export const DEBUG_TAB_NAMES = ['Document', 'Performance', 'Cells', 'Beats', 'System'];

// ============================================================================
// File Operations
// ============================================================================

/**
 * Supported file types
 */
export const FILE_TYPES = {
  JSON: {
    name: 'Music Notation Files',
    extensions: ['json']
  },
  TXT: {
    name: 'Text Files',
    extensions: ['txt']
  },
  ALL: {
    name: 'All Files',
    extensions: ['*']
  }
};

/**
 * Export formats
 */
export const EXPORT_FORMATS = {
  JSON: 'json',
  TXT: 'txt',
  NOTATION: 'notation',
  MUSICXML: 'musicxml',
  LILYPOND: 'lilypond'
};

/**
 * MIME types for file downloads
 */
export const MIME_TYPES = {
  JSON: 'application/json',
  TEXT: 'text/plain',
  HTML: 'text/html',
  CSS: 'text/css',
  JAVASCRIPT: 'application/javascript',
  WASM: 'application/wasm'
};

// ============================================================================
// Validation Patterns
// ============================================================================

/**
 * Regular expressions for notation validation
 */
export const NOTATION_PATTERNS = {
  NUMBER_SYSTEM: /^[1234567#b\s|]+$/,
  WESTERN_SYSTEM: /^[cdefgabCDEFGAB#b\s|]+$/,
  STRUCTURE_ELEMENTS: /^[|\-\s,']+$/,
  TEMPORAL_CHARS: /[1234567cdefgabCDEFGAB]/,
  ACCIDENTALS: /[#b]/,
  BEAT_SEPARATORS: /[|\s]/,
  TALA_INPUT: /^[0-9+]*$/
};

// ============================================================================
// Default Values
// ============================================================================

/**
 * Default document settings
 */
export const DEFAULT_DOCUMENT = {
  TITLE: 'Untitled Composition',
  TONIC: 'C',
  PITCH_SYSTEM: PITCH_SYSTEMS.NUMBER,
  TALA: 'teental',
  KEY_SIGNATURE: ''
};

/**
 * Default cursor position
 */
export const DEFAULT_CURSOR = {
  STAVE: 0,
  COLUMN: 0
};

/**
 * Dev server configuration
 */
export const DEV_SERVER = {
  PORT: 8080,
  HOST: 'localhost',
  WATCH_PATHS: ['src', 'dist', 'index.html']
};

// ============================================================================
// Z-Index Layers
// ============================================================================

/**
 * Z-index values for proper element stacking
 */
export const Z_INDEX = {
  BEAT_LOOPS: 1,
  OCTAVE_MARKINGS: 2,
  SLURS: 3,
  DEBUG_PANEL: 1000
};

// ============================================================================
// Timing and Animation
// ============================================================================

/**
 * Animation and transition durations
 */
export const ANIMATION_DURATION = {
  FOCUS_TRANSITION: 150,  // ms
  MENU_TRANSITION: 200,   // ms
  FADE: 300              // ms
};

/**
 * Debounce and throttle delays
 */
export const DEBOUNCE_DELAYS = {
  RESIZE: 150,      // ms
  INPUT: 100,       // ms
  SEARCH: 300       // ms
};

/**
 * URL cleanup delay for object URLs
 */
export const URL_REVOKE_DELAY_MS = 100;

// ============================================================================
// Hit Testing
// ============================================================================

/**
 * Padding around cell bounding boxes for hit testing
 */
export const HIT_BOX_PADDING = 2.0; // pixels

// ============================================================================
// Version Information
// ============================================================================

/**
 * Application version
 */
export const APP_VERSION = {
  VERSION: '0.1.0',
  NAME: 'Music Notation Editor POC'
};

/**
 * Document format version
 */
export const DOCUMENT_FORMAT_VERSION = '1.0';
