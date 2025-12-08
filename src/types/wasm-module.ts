/**
 * Type-safe interface for WASM module functions
 *
 * This interface provides proper TypeScript types for all WASM functions,
 * replacing the `any` return types in the auto-generated .d.ts file.
 *
 * Organization mirrors WASMBridge.js function categories.
 */

import type {
  Pos,
  CaretInfo,
  SelectionInfo,
  BeatSelectionResult,
  OctaveShiftResult,
  DocumentOperationResult,
  FontConfig,
  Document,
  Cell
} from './wasm.js';

/**
 * Layout configuration for computeLayout
 */
export interface LayoutConfig {
  baseFontSize?: number;
  cellWidth?: number;
  cellHeight?: number;
  lineSpacing?: number;
  pageWidth?: number;
}

/**
 * Display list returned from computeLayout
 */
export interface DisplayList {
  lines: DisplayListLine[];
  totalHeight: number;
  totalWidth: number;
}

export interface DisplayListLine {
  line: number;
  cells: Cell[];
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Position for mouse operations
 */
export interface MousePosition {
  line: number;
  col: number;
  x?: number;
  y?: number;
}

/**
 * Constraint definition
 */
export interface ConstraintDefinition {
  id: string;
  name: string;
  allowed_pitches: string[];
  description?: string;
}

/**
 * Tala (rhythm) definition
 */
export interface TalaDefinition {
  name: string;
  beats: number;
  divisions: number[];
}

/**
 * Complete WASM module interface
 * This is the interface for `this.wasmModule` in the Editor class and WASMBridge
 */
export interface WASMModule {
  // ========== Font & Configuration ==========

  /**
   * Export complete font configuration to JavaScript
   * Returns font codepoints for all pitch systems, barlines, ornaments, etc.
   */
  getFontConfig(): FontConfig;

  /**
   * Set the global glyph width cache (for text measurement)
   */
  setGlyphWidthCache(cacheJson: string): void;

  // ========== Pitch System API ==========

  /**
   * Get list of available pitch systems
   */
  getAvailablePitchSystems(): string[];

  // ========== Document Lifecycle ==========

  /**
   * Create a new empty document with default settings
   */
  createNewDocument(): Document;

  /**
   * Load a document into WASM state (synchronize JS → WASM)
   */
  loadDocument(documentJs: Document): void;

  /**
   * Get current document snapshot from WASM state
   */
  getDocumentSnapshot(): Document;

  // ========== Document Metadata ==========

  /**
   * Set document title
   */
  setTitle(title: string): void;

  /**
   * Set document composer
   */
  setComposer(composer: string): void;

  /**
   * Set document-level pitch system (Number, Western, Sargam, Doremi)
   */
  setDocumentPitchSystem(pitchSystem: number): void;

  /**
   * Set document-level tonic (e.g., "C", "D", "Sa")
   */
  setDocumentTonic(tonic: string): void;

  /**
   * Set document-level key signature
   */
  setDocumentKeySignature(keySignature: string): void;

  // ========== Line-Level Metadata ==========

  /**
   * Set label for a specific line (e.g., "Violin I")
   */
  setLineLabel(lineIndex: number, label: string): void;

  /**
   * Set lyrics text for a line
   */
  setLineLyrics(lineIndex: number, lyrics: string): void;

  /**
   * Set tala (rhythmic cycle) for a line
   */
  setLineTala(lineIndex: number, tala: string): void;

  /**
   * Set tala using modern format
   */
  setLineTalaModern(lineIndex: number, tala: string): TalaDefinition;

  /**
   * Set pitch system for a specific line (overrides document default)
   */
  setLinePitchSystem(lineIndex: number, pitchSystem: number): void;

  /**
   * Set tonic for a specific line
   */
  setLineTonic(lineIndex: number, tonic: string): void;

  /**
   * Set key signature for a specific line
   */
  setLineKeySignature(lineIndex: number, keySignature: string): void;

  /**
   * Mark line as starting a new system (page break)
   */
  setLineNewSystem(lineIndex: number, newSystem: boolean): void;

  /**
   * Set staff role (e.g., "treble", "bass", "percussion")
   */
  setLineStaffRole(lineIndex: number, role: string): void;

  /**
   * Set system marker for multi-system grouping (LilyPond-style << and >>)
   * @param lineIndex - Line to set marker on
   * @param marker - "start" (<<), "end" (>>), or "" (clear)
   */
  setSystemMarker(lineIndex: number, marker: string): void;

  /**
   * Get system marker for a line
   * @param lineIndex - Line to check
   * @returns "start", "end", or null
   */
  getSystemMarker(lineIndex: number): string | null;

  // ========== Text Editing Operations (WASM-First) ==========

  /**
   * Insert text at cursor position
   */
  insertText(text: string): DocumentOperationResult;

  /**
   * Delete character at cursor (backspace)
   */
  deleteAtCursor(): DocumentOperationResult;

  /**
   * Delete character forward (delete key)
   */
  deleteForward(): DocumentOperationResult;

  /**
   * Insert newline at cursor
   */
  insertNewline(): DocumentOperationResult;

  /**
   * Replace a range of text with new text
   */
  editReplaceRange(
    startRow: number,
    startCol: number,
    endRow: number,
    endCol: number,
    text: string
  ): DocumentOperationResult;

  // ========== Recursive Descent Parser API (Legacy) ==========

  /**
   * Insert a character into a cell array at cursor position
   * @deprecated Use insertText() instead
   */
  insertCharacter(
    cellsJs: Cell[],
    char: string,
    cursorPos: number,
    pitchSystem: number
  ): Cell[];

  /**
   * Parse text string into cell array
   * @deprecated Use document-level operations instead
   */
  parseText(text: string, pitchSystem: number): Cell[];

  /**
   * Delete character from cell array
   * @deprecated Use deleteAtCursor() or deleteForward() instead
   */
  deleteCharacter(cellsJs: Cell[], cursorPos: number): Cell[];

  // ========== Line Manipulation ==========

  /**
   * Split line at a character position (insert line break)
   */
  splitLineAtPosition(staveIndex: number, charPos: number): DocumentOperationResult;

  // ========== Layered Architecture API ==========

  /**
   * Select the whole beat at the cursor position
   */
  selectWholeBeat(line: number, col: number): BeatSelectionResult;

  /**
   * Shift octaves for a selection range by a delta
   */
  shiftOctave(
    line: number,
    startCol: number,
    endCol: number,
    delta: number
  ): OctaveShiftResult;

  /**
   * Set octave for all pitched elements in a selection to an absolute value
   */
  setOctave(
    line: number,
    startCol: number,
    endCol: number,
    targetOctave: number
  ): OctaveShiftResult;

  // ========== Slur Operations ==========

  /**
   * Toggle slur on/off for a selection
   */
  toggleSlur(
    line: number,
    startCol: number,
    endCol: number
  ): DocumentOperationResult;

  /**
   * Apply slur to a range (layered architecture)
   */
  applySlurLayered(
    line: number,
    startCol: number,
    endCol: number
  ): DocumentOperationResult;

  /**
   * Remove slur from a range
   */
  removeSlurLayered(
    line: number,
    startCol: number,
    endCol: number
  ): DocumentOperationResult;

  /**
   * Get all slurs for a line
   */
  getSlursForLine(line: number): Array<{
    start: number;
    end: number;
    direction?: 'up' | 'down';
  }>;

  /**
   * Apply slurs from annotation layer to cells
   */
  applyAnnotationSlursToCells(): { [line: number]: number };

  // ========== Ornament Operations ==========

  /**
   * Apply ornament at a position using text notation
   */
  applyOrnamentLayered(
    line: number,
    col: number,
    notation: string,
    placement: string
  ): DocumentOperationResult;

  /**
   * Remove ornament at a position
   */
  removeOrnamentLayered(
    line: number,
    col: number
  ): DocumentOperationResult;

  /**
   * Set ornament placement at a position (update existing ornament)
   */
  setOrnamentPlacementLayered(
    line: number,
    col: number,
    placement: string
  ): DocumentOperationResult;

  /**
   * Get ornament at a position
   */
  getOrnamentAt(
    line: number,
    col: number
  ): { notation: string; placement: string } | null;

  /**
   * Get all ornaments for a line
   */
  getOrnamentsForLine(line: number): Array<{
    col: number;
    notation: string;
    placement: string;
  }>;

  /**
   * Apply ornaments from annotation layer to cells
   */
  applyAnnotationOrnamentsToCells(): { [line: number]: number };

  // ========== Ornament Cell-Level Operations ==========

  /**
   * Copy ornament from a cell (returns notation string)
   */
  copyOrnamentFromCell(cellsJs: Cell[], cellIndex: number): string;

  /**
   * Paste ornament to a cell using notation text
   */
  pasteOrnamentToCell(
    cellsJs: Cell[],
    cellIndex: number,
    notationText: string,
    placement: string
  ): Cell[];

  /**
   * Paste ornament cells directly to a cell
   */
  pasteOrnamentCells(
    cellsJs: Cell[],
    cellIndex: number,
    ornamentCellsJs: Cell[],
    placement: string
  ): Cell[];

  /**
   * Clear ornament from a cell
   */
  clearOrnamentFromCell(cellsJs: Cell[], cellIndex: number): Cell[];

  /**
   * Set ornament placement on a cell ('before', 'after', or 'ontop')
   */
  setOrnamentPlacementOnCell(
    cellsJs: Cell[],
    cellIndex: number,
    placement: string
  ): Cell[];

  // ========== Copy/Paste Operations ==========

  /**
   * Copy cells from a range
   */
  copyCells(
    startRow: number,
    startCol: number,
    endRow: number,
    endCol: number
  ): { text: string; cells: Cell[] };

  /**
   * Paste cells at a position
   */
  pasteCells(
    startRow: number,
    startCol: number,
    endRow: number,
    endCol: number,
    cellsJson: Cell[]
  ): DocumentOperationResult;

  /**
   * Get the current primary selection register
   */
  getPrimarySelection(): { text: string; cells: Cell[] } | null;

  /**
   * Update primary selection register
   */
  updatePrimarySelection(
    startRow: number,
    startCol: number,
    endRow: number,
    endCol: number,
    cellsJson: Cell[]
  ): void;

  // ========== Undo/Redo ==========

  /**
   * Undo last operation
   */
  undo(): DocumentOperationResult;

  /**
   * Redo last undone operation
   */
  redo(): DocumentOperationResult;

  /**
   * Check if undo is available
   */
  canUndo(): boolean;

  /**
   * Check if redo is available
   */
  canRedo(): boolean;

  // ========== Layout & Rendering ==========

  /**
   * Compute layout for rendering (cell positions, line wrapping, etc.)
   */
  computeLayout(documentJs: Document, configJs: LayoutConfig): DisplayList;

  // ========== Cursor & Caret ==========

  /**
   * Get current caret info (position, desired column)
   */
  getCaretInfo(): CaretInfo;

  // ========== Selection ==========

  /**
   * Get current selection info (anchor, head, range)
   */
  getSelectionInfo(): SelectionInfo;

  /**
   * Set selection with anchor and head positions
   */
  setSelection(anchor: Pos, head: Pos): void;

  /**
   * Clear current selection
   */
  clearSelection(): void;

  /**
   * Start selection at current cursor position
   */
  startSelection(): void;

  /**
   * Start selection at a specific position
   */
  startSelectionAt(line: number, col: number): void;

  /**
   * Extend selection to current cursor position
   */
  extendSelection(): void;

  /**
   * Extend selection to a specific position
   */
  extendSelectionTo(line: number, col: number): void;

  // ========== Cursor Movement ==========

  /**
   * Move cursor left
   * @param extend - Whether to extend selection while moving
   */
  moveLeft(extend: boolean): CaretInfo;

  /**
   * Move cursor right
   * @param extend - Whether to extend selection while moving
   */
  moveRight(extend: boolean): CaretInfo;

  /**
   * Move cursor up
   * @param extend - Whether to extend selection while moving
   */
  moveUp(extend: boolean): CaretInfo;

  /**
   * Move cursor down
   * @param extend - Whether to extend selection while moving
   */
  moveDown(extend: boolean): CaretInfo;

  /**
   * Move cursor to start of line
   * @param extend - Whether to extend selection while moving
   */
  moveHome(extend: boolean): CaretInfo;

  /**
   * Move cursor to end of line
   * @param extend - Whether to extend selection while moving
   */
  moveEnd(extend: boolean): CaretInfo;

  // ========== Mouse Operations ==========

  /**
   * Handle mouse down event
   */
  mouseDown(posJs: MousePosition): CaretInfo;

  /**
   * Handle mouse move event
   */
  mouseMove(posJs: MousePosition): CaretInfo;

  /**
   * Handle mouse up event
   */
  mouseUp(posJs: MousePosition): CaretInfo;

  /**
   * Select beat at mouse position
   */
  selectBeatAtPosition(posJs: MousePosition): SelectionInfo;

  /**
   * Select entire line at mouse position
   */
  selectLineAtPosition(posJs: MousePosition): SelectionInfo;

  // ========== Constraint System ==========

  /**
   * Get all predefined constraints (scales, modes, etc.)
   */
  getPredefinedConstraints(): ConstraintDefinition[];

  /**
   * Check if a pitch is allowed in a constraint
   */
  isPitchAllowed(constraintId: string, pitchCode: string): boolean;

  /**
   * Set active constraint (null to disable)
   */
  setActiveConstraint(constraintId: string | null): void;

  /**
   * Get currently active constraint
   */
  getActiveConstraint(): ConstraintDefinition | null;

  /**
   * Get constraint notes for a pitch system
   */
  getConstraintNotes(
    constraintId: string,
    pitchSystemStr: string
  ): string[];

  /**
   * Check if a pitch is allowed against active constraint
   */
  checkPitchAgainstActiveConstraint(pitchCode: string): boolean;

  // ========== Position Conversion ==========

  /**
   * Get maximum character position in document
   */
  getMaxCharPosition(docJs: Document): number;

  /**
   * Convert character position to cell index
   */
  charPosToCellIndex(
    docJs: Document,
    charPos: number
  ): { line: number; cellIndex: number } | null;

  /**
   * Convert cell index to character position
   */
  cellIndexToCharPos(docJs: Document, cellIndex: number): number;

  /**
   * Convert character position to pixel coordinate
   */
  charPosToPixel(
    docJs: Document,
    displayListJs: DisplayList,
    charPos: number
  ): number;

  /**
   * Convert cell column to pixel coordinate
   */
  cellColToPixel(
    docJs: Document,
    displayListJs: DisplayList,
    cellCol: number
  ): number;

  // ========== Export/Import Operations ==========

  /**
   * Export document to MusicXML format
   */
  exportMusicXML(): string;

  /**
   * Import MusicXML file and convert to Document
   * @param musicxmlString - MusicXML 3.1 document as string
   * @returns Document object
   */
  importMusicXML(musicxmlString: string): Document;

  /**
   * Convert MusicXML to LilyPond format
   */
  convertMusicXMLToLilyPond(
    musicxml: string,
    settingsJson?: string
  ): string;

  /**
   * Export document to MIDI (Uint8Array)
   * @param tpq - Ticks per quarter note
   */
  exportMIDI(tpq: number): Uint8Array;

  /**
   * Export document to MIDI with tempo
   * @param tpq - Ticks per quarter note
   * @param tempoBpm - Tempo in beats per minute (optional)
   */
  exportMIDIDirect(tpq: number, tempoBpm?: number): Uint8Array;

  /**
   * Generate IR (Intermediate Representation) JSON
   */
  generateIRJson(): string;

  /**
   * Export document as plain text using NotationFont PUA glyphs
   */
  exportAsText(): string;

  // ========== Ornament Edit Mode ==========

  /**
   * Toggle ornament edit mode on/off
   */
  toggleOrnamentEditMode(): void;

  // ========== Superscript Glyph API (for ornament rendering) ==========

  /**
   * Get superscript glyph for ornament rendering
   *
   * Returns the 75% scaled superscript version of a source glyph with optional overline.
   * Used for rendering grace notes and ornaments in the editor.
   *
   * @param sourceCp - Source codepoint (ASCII 0x20-0x7E or PUA pitch glyph)
   * @param overlineVariant - 0=none, 1=left-cap, 2=middle, 3=right-cap
   * @returns Superscript codepoint in Supplementary PUA-A (0xF0000+), or 0 if not found
   */
  getSuperscriptGlyph(sourceCp: number, overlineVariant: number): number;

  /**
   * Check if a codepoint is a superscript glyph
   *
   * @param cp - Codepoint to check
   * @returns true if in Supplementary PUA-A superscript range
   */
  isSuperscriptGlyph(cp: number): boolean;

  /**
   * Get the overline variant from a superscript glyph codepoint
   *
   * @param cp - Superscript codepoint
   * @returns Overline variant (0-3) or 255 if not a superscript glyph
   */
  getSuperscriptOverline(cp: number): number;
}

/**
 * Type guard to check if WASM module is initialized
 */
export function isWASMModuleInitialized(
  module: unknown
): module is WASMModule {
  return (
    module !== null &&
    typeof module === 'object' &&
    typeof (module as WASMModule).getFontConfig === 'function' &&
    typeof (module as WASMModule).getCaretInfo === 'function'
  );
}

/**
 * WASM initialization result
 */
export interface WASMInitResult {
  success: boolean;
  module?: WASMModule;
  error?: string;
}
