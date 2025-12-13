/**
 * TypeScript interfaces for WASM API
 *
 * These types extend the auto-generated editor_wasm.d.ts with proper type safety
 * for objects currently typed as `any`.
 */

// Re-export WASM classes that are properly typed
export {
  CaretInfo,
  Pos,
  Position,
  Range,
  Selection,
  SelectionInfo,
  SlurSpan,
  SlurVisual,
  BeatConfig,
  BeatDeriver,
  BeatSpan,
  BeatVisual,
  TextStyle
} from '../../dist/pkg/editor_wasm.js';

/**
 * Cell structure from WASM
 * This is the fundamental unit of the notation system
 */
export interface Cell {
  /** Display character (may be multi-codepoint glyph) */
  char: string;

  /** Element kind identifier */
  kind: ElementKind;

  /** Pitch code (for pitched elements) */
  pitch_code?: number;

  /** Column position in line */
  col: number;

  /** Cell flags (selected, focused, etc.) */
  flags: number;

  /** Octave modifier (-2, -1, 0, 1, 2) */
  octave?: number;

  /** Whether this cell is a superscript (grace note/ornament) */
  superscript?: boolean;

  /** Accidental (sharp, flat, natural) */
  accidental?: string;

  /** Slur indicator data */
  slur_indicator?: SlurIndicator;

  /** Lyric syllable */
  lyric?: string;

  // Layout/rendering fields
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  baseline?: number;
}

/**
 * Element kind enum
 */
export enum ElementKind {
  Pitch = 0,
  Rest = 1,
  Barline = 2,
  Space = 3,
  Dash = 4,
  Unknown = 5
}

/**
 * Slur indicator on a cell
 */
export interface SlurIndicator {
  kind: 'start' | 'end';
  direction?: 'up' | 'down';
}

/**
 * Document structure
 */
export interface Document {
  title: string;
  composer: string;
  lines: DocumentLine[];
  pitch_system: PitchSystem;
  constraints: DocumentConstraints;
}

/**
 * Single line in the document
 */
export interface DocumentLine {
  cells: Cell[];
  label?: string;
  lyrics?: string;
  pitch_system: PitchSystem;
  tonic?: string;
  key_signature?: string;
  time_signature?: string;
  tala?: string;
}

/**
 * Pitch system enum
 */
export enum PitchSystem {
  Unknown = 0,
  Number = 1,
  Western = 2,
  Sargam = 3,
  Doremi = 4
}

/**
 * Document constraints/settings
 */
export interface DocumentConstraints {
  default_pitch_system: PitchSystem;
  enable_slurs: boolean;
  enable_lyrics: boolean;
  [key: string]: any;
}

/**
 * WASM function return types (replacing `any`)
 */

/** Result from selectWholeBeat */
export interface BeatSelectionResult {
  line: number;
  start_col: number;
  end_col: number;
  text: string;
  success: boolean;
}

/** Result from shiftOctave */
export interface OctaveShiftResult {
  line: number;
  start_col: number;
  end_col: number;
  shifted_count: number;
  skipped_count: number;
  new_text: string;
  success: boolean;
}

/** Dirty line info */
export interface DirtyLine {
  row: number;
}

/** Nested caret info from document operations */
export interface OperationCaretInfo {
  caret?: {
    line?: number;
    col?: number;
  };
}

/** Result from document operations */
export interface DocumentOperationResult {
  success: boolean;
  message?: string;
  error?: string;
  dirty_lines?: DirtyLine[];
  caret?: OperationCaretInfo;
  new_cursor_col?: number;
}

/** Font configuration */
export interface FontConfig {
  systems: PitchSystemConfig[];
  symbols: Record<string, number>;
}

export interface PitchSystemConfig {
  name: string;
  base_chars: string[];
  octave_variants: number[];
  sharp_variants: number[];
}

/**
 * Export IR (Intermediate Representation) types
 */
export interface ExportLine {
  measures: ExportMeasure[];
}

export interface ExportMeasure {
  events: ExportEvent[];
}

export interface ExportEvent {
  note_data?: NoteData;
  rest_duration?: number;
  barline?: string;
}

export interface NoteData {
  pitch: string;
  duration: number;
  octave: number;
  accidental?: string;
  slur_data?: SlurData;
  tie_data?: TieData;
}

export interface SlurData {
  is_start: boolean;
  is_end: boolean;
  direction?: 'up' | 'down';
}

export interface TieData {
  is_start: boolean;
  is_end: boolean;
}
