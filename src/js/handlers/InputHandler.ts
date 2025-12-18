/**
 * InputHandler - Handles text input with JS-owned buffer architecture
 *
 * This handler uses beforeinput events to intercept input before the browser
 * mutates the textarea. Simple chars are handled JS-only for speed, while
 * combining chars (sharps, flats, barlines) go to WASM for proper combining.
 *
 * Architecture:
 * - JS owns text buffer (Line.codepoints) as source of truth
 * - WASM returns patches for mutations (no full string copies)
 * - Debounced WASM parse for beat grouping / slur rendering
 */

import { Line, COMBINING_CHARS, isSimpleChar, initSimpleChars } from '~models/TextBuffer';
import type { Patch } from '~types/wasm-module';
import type { WASMModule } from '~types/wasm-module';

interface InputHandlerOptions {
  /** WASM module instance */
  wasmModule: WASMModule;
  /** Pitch system (1=Number, 2=Western, 3=Sargam) */
  pitchSystem: number;
  /** Debounce delay for WASM parse (ms) */
  parseDebounceMs?: number;
  /** Callback when line content changes */
  onLineChange?: (lineIndex: number, line: Line) => void;
  /** Callback to trigger render updates */
  onRenderNeeded?: () => void;
}

interface CompositionState {
  preValue: string;
  preSelStart: number;
  preSelEnd: number;
}

export class InputHandler {
  private wasmModule: WASMModule;
  private lines: Map<number, Line> = new Map();
  private parseTimer: ReturnType<typeof setTimeout> | null = null;
  private parseDebounceMs: number;
  private charsSinceWasmParse: number = 0;
  private compositionState: CompositionState | null = null;
  private onLineChange?: (lineIndex: number, line: Line) => void;
  private onRenderNeeded?: () => void;
  private initialized: boolean = false;

  constructor(options: InputHandlerOptions) {
    this.wasmModule = options.wasmModule;
    this.parseDebounceMs = options.parseDebounceMs ?? 200;
    this.onLineChange = options.onLineChange;
    this.onRenderNeeded = options.onRenderNeeded;

    // Initialize simple chars from WASM
    this.initSimpleChars(options.pitchSystem);
  }

  /**
   * Initialize simple chars whitelist from WASM
   */
  private async initSimpleChars(pitchSystem: number): Promise<void> {
    try {
      if (this.wasmModule.getSimpleChars) {
        const cps = this.wasmModule.getSimpleChars(pitchSystem);
        initSimpleChars(cps);
        this.initialized = true;
        console.log('[InputHandler] Simple chars initialized for pitch system', pitchSystem);
      }
    } catch (err) {
      console.error('[InputHandler] Failed to init simple chars:', err);
    }
  }

  /**
   * Get or create a Line for the given index
   */
  getLine(lineIndex: number): Line {
    let line = this.lines.get(lineIndex);
    if (!line) {
      line = new Line();
      this.lines.set(lineIndex, line);
    }
    return line;
  }

  /**
   * Set line content from string (for initialization)
   */
  setLineFromString(lineIndex: number, text: string): void {
    const line = Line.fromString(text);
    this.lines.set(lineIndex, line);
  }

  /**
   * Attach event handlers to a textarea
   */
  attachToTextarea(textarea: HTMLTextAreaElement, lineIndex: number): void {
    // beforeinput - intercept before browser mutates
    textarea.addEventListener('beforeinput', (e) => {
      this.handleBeforeInput(e, textarea, lineIndex);
    });

    // IME composition
    textarea.addEventListener('compositionstart', () => {
      this.handleCompositionStart(textarea);
    });

    textarea.addEventListener('compositionend', () => {
      this.handleCompositionEnd(textarea, lineIndex);
    });

    // Paste - use clipboard API (e.data unreliable for paste)
    textarea.addEventListener('paste', (e) => {
      this.handlePaste(e, textarea, lineIndex);
    });
  }

  /**
   * Handle beforeinput event - intercept before browser mutates
   */
  private handleBeforeInput(
    e: InputEvent,
    textarea: HTMLTextAreaElement,
    lineIndex: number
  ): void {
    // Let browser handle composition (IME)
    if (e.isComposing) return;

    const line = this.getLine(lineIndex);

    if (e.inputType === 'insertText' && e.data) {
      e.preventDefault();
      const cps = [...e.data].map(c => c.codePointAt(0)!);
      const [selStartCp, selEndCp] = this.getSelectionCp(textarea, line);
      const newCursor = this.insertCps(lineIndex, line, selStartCp, selEndCp, cps);
      this.updateTextareaAndCursor(textarea, line, newCursor);
    }

    if (e.inputType === 'deleteContentBackward') {
      e.preventDefault();
      const [selStartCp, selEndCp] = this.getSelectionCp(textarea, line);
      const newCursor = this.deleteRange(lineIndex, line, selStartCp, selEndCp);
      this.updateTextareaAndCursor(textarea, line, newCursor);
    }

    if (e.inputType === 'deleteContentForward') {
      e.preventDefault();
      const [selStartCp, selEndCp] = this.getSelectionCp(textarea, line);
      // Forward delete: if collapsed, delete char after cursor
      const newCursor = this.deleteForward(lineIndex, line, selStartCp, selEndCp);
      this.updateTextareaAndCursor(textarea, line, newCursor);
    }
  }

  /**
   * Handle composition start - snapshot state
   */
  private handleCompositionStart(textarea: HTMLTextAreaElement): void {
    this.compositionState = {
      preValue: textarea.value,
      preSelStart: textarea.selectionStart,
      preSelEnd: textarea.selectionEnd
    };
  }

  /**
   * Handle composition end - diff and apply
   */
  private handleCompositionEnd(
    textarea: HTMLTextAreaElement,
    lineIndex: number
  ): void {
    if (!this.compositionState) return;

    const line = this.getLine(lineIndex);
    const { preValue, preSelStart, preSelEnd } = this.compositionState;

    // Diff: what range was replaced?
    const oldLen = preValue.length;
    const newLen = textarea.value.length;

    // Extract what was inserted (browser already did it)
    const insertedText = textarea.value.slice(
      preSelStart,
      preSelStart + (newLen - oldLen + (preSelEnd - preSelStart))
    );

    // Convert to codepoints
    const cps = [...insertedText].map(c => c.codePointAt(0)!);

    // Convert UTF-16 selection to codepoint indices
    const selStartCp = line.utf16ToCp(preSelStart);
    const selEndCp = line.utf16ToCp(preSelEnd);

    // Apply via WASM (normalize the inserted text)
    const newCursor = this.insertCps(lineIndex, line, selStartCp, selEndCp, cps);

    // Update textarea with normalized result
    this.updateTextareaAndCursor(textarea, line, newCursor);
    this.compositionState = null;
  }

  /**
   * Handle paste event
   */
  private handlePaste(
    e: ClipboardEvent,
    textarea: HTMLTextAreaElement,
    lineIndex: number
  ): void {
    e.preventDefault();
    const text = e.clipboardData?.getData('text/plain') || '';
    if (!text) return;

    const line = this.getLine(lineIndex);
    const cps = [...text].map(c => c.codePointAt(0)!);
    const [selStartCp, selEndCp] = this.getSelectionCp(textarea, line);
    const newCursor = this.insertCps(lineIndex, line, selStartCp, selEndCp, cps);
    this.updateTextareaAndCursor(textarea, line, newCursor);
  }

  /**
   * Get current selection as codepoint indices
   */
  private getSelectionCp(textarea: HTMLTextAreaElement, line: Line): [number, number] {
    const utf16Start = textarea.selectionStart;
    const utf16End = textarea.selectionEnd;
    return [line.utf16ToCp(utf16Start), line.utf16ToCp(utf16End)];
  }

  /**
   * Insert codepoints, replacing selection
   * Returns new cursor position (codepoint index)
   */
  insertCps(
    lineIndex: number,
    line: Line,
    selStartCp: number,
    selEndCp: number,
    cps: number[]
  ): number {
    const cp = cps[0];

    // Multi-char, combining char, or selection → WASM mutation
    if (cps.length > 1 || COMBINING_CHARS.has(cp) || selStartCp !== selEndCp) {
      try {
        const patch = this.wasmModule.insertCps(
          new Uint32Array(line.codepoints),
          selStartCp,
          selEndCp,
          new Uint32Array(cps)
        );
        line.applyPatch(patch);
        this.charsSinceWasmParse = 0;
        this.scheduleWasmParse();
        this.notifyLineChange(lineIndex, line);
        return patch.new_cursor_cp;
      } catch (err) {
        console.error('[InputHandler] insertCps WASM failed:', err);
        // Fallback to JS-only
      }
    }

    // Simple char → JS-only mutation
    if (isSimpleChar(cp)) {
      line.codepoints.splice(selStartCp, 0, cp);
      line.dirty = true;
      this.charsSinceWasmParse++;

      // Every few chars → trigger WASM parse for beat grouping / slur redraw
      if (this.charsSinceWasmParse >= 3) {
        this.immediateWasmParse(lineIndex, line);
        this.charsSinceWasmParse = 0;
      } else {
        this.scheduleWasmParse();
      }

      this.notifyLineChange(lineIndex, line);
      return selStartCp + 1;
    }

    // Not simple char but single char - still use WASM
    try {
      const patch = this.wasmModule.insertCps(
        new Uint32Array(line.codepoints),
        selStartCp,
        selEndCp,
        new Uint32Array(cps)
      );
      line.applyPatch(patch);
      this.charsSinceWasmParse = 0;
      this.scheduleWasmParse();
      this.notifyLineChange(lineIndex, line);
      return patch.new_cursor_cp;
    } catch (err) {
      console.error('[InputHandler] insertCps WASM failed:', err);
      // Fallback: just insert
      line.codepoints.splice(selStartCp, 0, cp);
      line.dirty = true;
      this.scheduleWasmParse();
      this.notifyLineChange(lineIndex, line);
      return selStartCp + 1;
    }
  }

  /**
   * Delete selection (or char before cursor if collapsed)
   * Returns new cursor position
   */
  deleteRange(
    lineIndex: number,
    line: Line,
    selStartCp: number,
    selEndCp: number
  ): number {
    try {
      const patch = this.wasmModule.deleteRange(
        new Uint32Array(line.codepoints),
        selStartCp,
        selEndCp
      );
      line.applyPatch(patch);
      this.scheduleWasmParse();
      this.notifyLineChange(lineIndex, line);
      return patch.new_cursor_cp;
    } catch (err) {
      console.error('[InputHandler] deleteRange WASM failed:', err);
      // Fallback: JS-only delete
      if (selStartCp === selEndCp) {
        // Backspace
        if (selStartCp === 0) return 0;
        line.codepoints.splice(selStartCp - 1, 1);
        line.dirty = true;
        this.scheduleWasmParse();
        this.notifyLineChange(lineIndex, line);
        return selStartCp - 1;
      } else {
        // Delete selection
        line.codepoints.splice(selStartCp, selEndCp - selStartCp);
        line.dirty = true;
        this.scheduleWasmParse();
        this.notifyLineChange(lineIndex, line);
        return selStartCp;
      }
    }
  }

  /**
   * Delete forward (delete key)
   */
  deleteForward(
    lineIndex: number,
    line: Line,
    selStartCp: number,
    selEndCp: number
  ): number {
    if (selStartCp !== selEndCp) {
      // Has selection - same as backspace
      return this.deleteRange(lineIndex, line, selStartCp, selEndCp);
    }

    // Forward delete: delete char at cursor
    if (selStartCp >= line.length) return selStartCp; // At end, nothing to delete

    // Delete the char at cursor position
    line.codepoints.splice(selStartCp, 1);
    line.dirty = true;
    this.scheduleWasmParse();
    this.notifyLineChange(lineIndex, line);
    return selStartCp;
  }

  /**
   * Schedule debounced WASM parse
   */
  private scheduleWasmParse(): void {
    if (this.parseTimer) {
      clearTimeout(this.parseTimer);
    }
    this.parseTimer = setTimeout(() => {
      this.parseAllDirtyLines();
    }, this.parseDebounceMs);
  }

  /**
   * Immediate WASM parse for a single line (for visual updates)
   * Syncs JS buffer to WASM and updates display
   */
  private immediateWasmParse(lineIndex: number, line: Line): void {
    try {
      // Convert codepoints to string and sync to WASM
      const text = line.toString();

      // setLineText returns display data after parsing
      // The text property contains PUA glyphs which are the rendered cells
      if (this.wasmModule.setLineText) {
        const cursorPos = line.length; // End of line for immediate parse
        const lineDisplay = this.wasmModule.setLineText(lineIndex, text, cursorPos);

        if (lineDisplay) {
          // WASM has processed the text - mark as clean
          line.dirty = false;
        }
      }
    } catch (err) {
      console.error('[InputHandler] immediateWasmParse failed:', err);
    }

    this.onRenderNeeded?.();
  }

  /**
   * Parse all dirty lines
   * Syncs dirty lines to WASM and updates display
   */
  private parseAllDirtyLines(): void {
    let anyParsed = false;

    for (const [lineIndex, line] of this.lines) {
      if (line.dirty) {
        try {
          // Convert codepoints to string and sync to WASM
          const text = line.toString();

          if (this.wasmModule.setLineText) {
            const cursorPos = line.length;
            const lineDisplay = this.wasmModule.setLineText(lineIndex, text, cursorPos);

            if (lineDisplay) {
              // WASM has processed the text - mark as clean
              anyParsed = true;
            }
          }
        } catch (err) {
          console.error(`[InputHandler] parseAllDirtyLines failed for line ${lineIndex}:`, err);
        }

        line.dirty = false;
      }
    }

    if (anyParsed) {
      this.onRenderNeeded?.();
    }
  }

  /**
   * Notify that a line changed
   */
  private notifyLineChange(lineIndex: number, line: Line): void {
    this.onLineChange?.(lineIndex, line);
  }

  /**
   * Update textarea value and cursor position
   */
  updateTextareaAndCursor(
    textarea: HTMLTextAreaElement,
    line: Line,
    newCursorCp: number
  ): void {
    // Render codepoints to textarea
    textarea.value = line.toString();

    // Convert codepoint cursor to UTF-16 offset
    const utf16Offset = line.cpToUtf16(newCursorCp);
    textarea.setSelectionRange(utf16Offset, utf16Offset);
  }

  /**
   * Clean up timers
   */
  dispose(): void {
    if (this.parseTimer) {
      clearTimeout(this.parseTimer);
      this.parseTimer = null;
    }
  }
}

export default InputHandler;
