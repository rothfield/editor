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
 * Diagnostic severity level
 */
export type DiagnosticSeverity = 'error' | 'warning' | 'info' | 'hint';

/**
 * A single diagnostic mark (e.g., highlighting an orphan slur)
 */
export interface DiagnosticMark {
  line: number;
  col: number;
  len: number;
  severity: DiagnosticSeverity;
  kind: string;
  message: string;
}

/**
 * Collection of diagnostic marks
 */
export interface Diagnostics {
  marks: DiagnosticMark[];
}

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
 * A patch representing a text mutation
 * Patches describe a range to replace and the replacement codepoints.
 */
export interface Patch {
  /** Start of range to replace (codepoint index, inclusive) */
  start_cp: number;
  /** End of range to replace (codepoint index, exclusive) */
  end_cp: number;
  /** Replacement codepoints */
  replacement: number[];
  /** New cursor position after applying patch */
  new_cursor_cp: number;
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
   * @param cache - Object mapping glyph strings to their measured widths
   */
  setGlyphWidthCache(cache: Record<string, number>): void;

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
   * Set system start marker with line count
   * @param lineIndex - Line to set marker on
   * @param count - Number of lines in the system (1-99)
   * @returns Array of truncations if overlaps detected
   */
  setSystemStart(lineIndex: number, count: number): Array<{
    line: number;
    oldCount: number;
    newCount: number;
  }>;

  /**
   * Get system start count for a line
   * @param lineIndex - Line to check
   * @returns Number of lines in system, or 0 if not a system start
   */
  getSystemStart(lineIndex: number): number;

  /**
   * Clear system start marker from a line
   * @param lineIndex - Line to clear marker from
   */
  clearSystemStart(lineIndex: number): void;

  /**
   * Get line's role within a system (for visual grouping)
   * @param lineIndex - Line to check
   * @returns Role object with type and optional count
   */
  getLineSystemRole(lineIndex: number): {
    type: 'start' | 'middle' | 'end' | 'standalone';
    count?: number;
  };

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
   * Paste text at a position (parses PUA or ASCII text into cells)
   * Used for Ctrl+V to paste from system clipboard
   */
  pasteText(
    row: number,
    col: number,
    text: string
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
   * Export document to MusicXML format with polyphonic alignment
   * Ensures all parts have identical measure counts via measurization
   */
  exportMusicXMLPolyphonic(): string;

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

  /**
   * Export document as ASCII markup (human-readable characters with XML tags)
   */
  exportAsASCIIMarkup(): string;

  /**
   * Export document as codepoint markup (PUA glyphs with XML tags)
   */
  exportAsCodepointMarkup(): string;

  /**
   * Export selection as ASCII markup (human-readable with octave context)
   * Used by "Copy as ASCII Markup" menu item
   */
  exportSelectionAsAsciiMarkup(
    startRow: number,
    startCol: number,
    endRow: number,
    endCol: number
  ): string;

  /**
   * Export selection as PUA markup (codepoint glyphs with octave context)
   * Used by "Copy as PUA Markup" menu item
   */
  exportSelectionAsPuaMarkup(
    startRow: number,
    startCol: number,
    endRow: number,
    endCol: number
  ): string;

  /**
   * Render notation markup to PUA codepoints
   *
   * Supports tags:
   * - Document: <title>, <composer>, <system>, <lyrics>
   * - Inline: <sup>, <slur>, <nl/>, octaves, accidentals
   *
   * @param pitchSystem - Pitch system (0=number, 1=western, 2=sargam, 3=doremi)
   * @param markup - Notation markup string
   * @returns Rendered document with PUA codepoint strings
   */
  renderNotation(pitchSystem: number, markup: string): any;

  /**
   * Import notation markup and convert to Document structure
   *
   * Parses markup and creates a full Document that can be loaded into the editor.
   * Use loadDocument() to actually load the returned document.
   *
   * @param pitchSystem - Pitch system (0=number, 1=western, 2=sargam, 3=doremi)
   * @param markup - Notation markup string with tags like <title>, <system>, <lyrics>, etc.
   * @returns Full Document object
   */
  importNotationMarkup(pitchSystem: number, markup: string): Document;

  /**
   * Get documentation for all supported markup tags
   *
   * Returns a markdown-formatted string listing all supported tags organized by category.
   * This is the single source of truth for markup language capabilities.
   *
   * @returns Markdown documentation string
   */
  getSupportedMarkupTags(): string;

  /**
   * Check if a markup tag is supported
   *
   * Returns true if the tag name (including aliases) is in the registry.
   *
   * @param tagName - Tag name to check (e.g., "title", "tit", "sup", "up")
   * @returns true if tag is supported, false otherwise
   */
  isMarkupTagSupported(tagName: string): boolean;

  // ========== Superscript Glyph API ==========

  /**
   * Get superscript glyph
   *
   * Returns the 75% scaled superscript version of a source glyph with optional overline.
   * Used for rendering grace notes in the editor.
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

  /**
   * Convert a normal pitch codepoint to its superscript equivalent
   *
   * @param normalCp - Normal pitch codepoint (ASCII 0x20-0x7E or PUA 0xE000+)
   * @returns Superscript codepoint (0xF8000+) or 0 if conversion not possible
   */
  toSuperscript(normalCp: number): number;

  /**
   * Convert a superscript codepoint back to its normal equivalent
   *
   * @param superCp - Superscript codepoint (0xF8000+)
   * @returns Normal codepoint or 0 if not a valid superscript
   */
  fromSuperscript(superCp: number): number;

  // ========== Superscript Selection API (Grace Note Conversion) ==========

  /**
   * Convert selected cells to superscript (grace notes)
   *
   * Superscript pitches are rhythm-transparent and attach to the previous normal pitch.
   *
   * @param line - Line number
   * @param startCol - Start column (inclusive)
   * @param endCol - End column (exclusive)
   * @returns Result with success flag and count of converted cells
   */
  selectionToSuperscript(
    line: number,
    startCol: number,
    endCol: number
  ): { success: boolean; cells_converted: number; error?: string };

  /**
   * Convert superscript cells back to normal
   *
   * @param line - Line number
   * @param startCol - Start column (inclusive)
   * @param endCol - End column (exclusive)
   * @returns Result with success flag and count of converted cells
   */
  superscriptToNormal(
    line: number,
    startCol: number,
    endCol: number
  ): { success: boolean; cells_converted: number; error?: string };

  // ========== Textarea Rendering API ==========

  /**
   * Get textarea display data for a single line
   * Returns the line text with PUA glyphs plus overlay positions (lyrics, tala)
   *
   * @param lineIndex - Index of the line in the document
   * @returns TextareaLineDisplay with text and overlay positions
   */
  getTextareaLineData(lineIndex: number): TextareaLineDisplay;

  /**
   * Get textarea display data for all lines in the document
   *
   * Phase 1 of lyric rendering: Returns text content, pitched_char_indices, and syllable_texts.
   * JS should measure note positions and syllable widths, then call computeLyricLayout().
   *
   * @returns TextareaDisplayList with all lines
   */
  getTextareaDisplayList(): TextareaDisplayList;

  /**
   * Compute lyric layout with collision avoidance (Phase 2)
   *
   * Takes measured note positions and syllable widths from JS,
   * returns final x_px positions for each lyric.
   *
   * @param lineIndex - Line index
   * @param notePositions - Array of x_px for each pitched note (from mirror div)
   * @param syllableWidths - Array of pixel widths for each syllable
   * @returns Array of OverlayItem with final x_px positions
   */
  computeLyricLayout(lineIndex: number, notePositions: number[], syllableWidths: number[]): OverlayItem[];

  /**
   * Set text content for a line (textarea mode input sync)
   *
   * @param lineIndex - Line index to update
   * @param text - New text content
   * @param cursorCharPos - Optional cursor character position in input text
   * @returns Updated TextareaLineDisplay for the line
   */
  setLineText(lineIndex: number, text: string, cursorCharPos?: number): TextareaLineDisplay;

  /**
   * Split a line at the given cell position
   *
   * Creates a new line after the current one, moving content after the split
   * point to the new line. Cursor is moved to start of new line.
   *
   * @param lineIndex - Line index to split
   * @param cellPos - Cell position where to split (0 = before first cell)
   * @returns Updated TextareaDisplayList (all lines, since count changed)
   */
  splitLine(lineIndex: number, cellPos: number): TextareaDisplayList;

  /**
   * Join a line with the previous line
   *
   * Removes the line at lineIndex and appends its cells to the previous line.
   * Cursor is positioned at the join point (where the previous line ended).
   * Does nothing if lineIndex is 0 (first line has no previous line to join).
   *
   * @param lineIndex - Line index to join with previous (must be > 0 to have effect)
   * @returns Updated TextareaDisplayList (all lines, since count may have changed)
   */
  joinLines(lineIndex: number): TextareaDisplayList;
}

/**
 * Textarea line display data
 */
export interface TextareaLineDisplay {
  /** Line index in document */
  line_index: number;
  /** Text content for the textarea (includes PUA glyphs) */
  text: string;
  /** Optional cursor position (character index in text) */
  cursor_pos: number | null;
  /** Optional selection range */
  selection: TextRange | null;
  /** Lyrics overlay items (initially empty, computed by computeLyricLayout) */
  lyrics: OverlayItem[];
  /** Tala marker overlay items */
  talas: OverlayItem[];
  /** Optional line label */
  label: string | null;
  /** Character indices of pitched notes (for JS to measure positions) */
  pitched_char_indices: number[];
  /** Syllable texts (for JS to measure widths) */
  syllable_texts: string[];
}

/**
 * Text range for selection
 */
export interface TextRange {
  start: number;
  end: number;
}

/**
 * Overlay item with final pixel position
 */
export interface OverlayItem {
  /** Final x position in pixels (relative to textarea content box) */
  x_px: number;
  /** Content to display (syllable, tala marker, etc.) */
  content: string;
  /** Anchor char index (for reference/debugging, not for positioning) */
  anchor_char_index: number;
}

/**
 * Textarea display list for entire document
 */
export interface TextareaDisplayList {
  /** All lines as textarea displays */
  lines: TextareaLineDisplay[];
  /** Document title (optional) */
  title: string | null;
  /** Document composer (optional) */
  composer: string | null;
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
