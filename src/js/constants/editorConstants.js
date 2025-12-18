/**
 * editorConstants - Magic numbers and configuration values
 *
 * Centralizes hard-coded values for easier maintenance
 */

// Layout constants
export const DEFAULT_LINE_Y_OFFSET = 32; // Default Y offset for lines in pixels
export const PIXELS_PER_CHARACTER = 12; // Width per character for hitbox calculations
export const DEFAULT_LINE_HEIGHT = 16; // Default line height in pixels
export const HIT_AREA_PADDING = 2.0; // Padding around hitboxes for easier clicking

// Timing constants
export const HITBOX_UPDATE_DELAY = 100; // Delay in ms before updating hitbox display
export const STAFF_NOTATION_DEBOUNCE = 100; // Debounce delay for staff notation updates in ms
export const DRAG_SELECTION_CLEAR_DELAY = 100; // Delay before clearing drag flag in ms

// Console history limits
export const MAX_CONSOLE_ERRORS = 100; // Maximum number of error entries to keep
export const MAX_CONSOLE_WARNINGS = 50; // Maximum number of warning entries to keep
export const MAX_CONSOLE_LOGS = 200; // Maximum number of log entries to keep
export const MAX_ERROR_HISTORY = 100; // Maximum errors to keep for pattern analysis

// CSS class names
export const CSS_CLASSES = {
  // Cursor
  CURSOR_INDICATOR: 'cursor-indicator',
  CURSOR_BLINKING: 'blinking',
  CURSOR_FOCUSED: 'focused',

  // Selection
  SELECTED: 'selected',

  // Lines
  NOTATION_LINE: 'notation-line',
  CHAR_CELL: 'char-cell',

  // Beat visualization
  BEAT_LOOP_FIRST: 'beat-loop-first',
  BEAT_LOOP_MIDDLE: 'beat-loop-middle',
  BEAT_LOOP_LAST: 'beat-loop-last',

  // Editor state
  EDITOR_FOCUSED: 'focused'
};

// DOM selectors
export const DOM_SELECTORS = {
  // Inspector panels
  IR_DISPLAY: 'ir-display',
  MUSICXML_SOURCE: 'musicxml-source',
  LILYPOND_SOURCE: 'lilypond-source',
  HTML_CONTENT: 'html-content',
  DISPLAYLIST_DISPLAY: 'displaylist-display',
  PERSISTENT_JSON: 'persistent-json',
  HITBOXES_CONTAINER: 'hitboxes-container',

  // Console tabs
  CONSOLE_ERRORS_LIST: 'console-errors-list',
  CONSOLE_WARNINGS_LIST: 'console-warnings-list',
  CONSOLE_LOG_LIST: 'console-log-list',

  // Status displays (editor status bar)
  CURSOR_POSITION: 'editor-cursor-position',
  CHAR_COUNT: 'editor-char-count',
  SELECTION_INFO: 'editor-selection-status',
  PITCH_SYSTEM: 'editor-pitch-system',
  SUPERSCRIPT_EDIT_MODE_DISPLAY: 'superscript-edit-mode-display',

  // Editor
  EDITOR_CONTAINER: 'editor-container'
};

// Notation patterns (regex)
export const NOTATION_PATTERNS = {
  // Sargam pitch system (Sa Re Ga Ma Pa Dha Ni)
  SARGAM: /^[SRGMPDNsrgmpdn#b\s|]+$/,

  // Western pitch system (C D E F G A B)
  WESTERN: /^[cdefgabCDEFGAB#b\s|]+$/,

  // Digits for tala
  TALA_DIGITS: /^[0-9+\s]+$/,

  // F-keys to exclude from text input
  F_KEYS: /[Ff][0-9]/
};

// LilyPond conversion settings
export const LILYPOND_SETTINGS = {
  target_lilypond_version: "2.24.0",
  language: "English",
  convert_directions: true,
  convert_lyrics: true,
  convert_chord_symbols: true
};

// Error pattern detection threshold
export const ERROR_PATTERN_THRESHOLD = 3; // Number of repetitions before flagging a pattern
export const MIN_ERRORS_FOR_PATTERN_ANALYSIS = 5; // Minimum errors before analyzing patterns

export default {
  DEFAULT_LINE_Y_OFFSET,
  PIXELS_PER_CHARACTER,
  DEFAULT_LINE_HEIGHT,
  HIT_AREA_PADDING,
  HITBOX_UPDATE_DELAY,
  STAFF_NOTATION_DEBOUNCE,
  DRAG_SELECTION_CLEAR_DELAY,
  MAX_CONSOLE_ERRORS,
  MAX_CONSOLE_WARNINGS,
  MAX_CONSOLE_LOGS,
  MAX_ERROR_HISTORY,
  CSS_CLASSES,
  DOM_SELECTORS,
  NOTATION_PATTERNS,
  LILYPOND_SETTINGS,
  ERROR_PATTERN_THRESHOLD,
  MIN_ERRORS_FOR_PATTERN_ANALYSIS
};
