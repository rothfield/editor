/**
 * TextareaRenderer - Renders notation lines using textareas
 *
 * This renderer replaces cell-by-cell DOM rendering with one textarea per line.
 * NotationFont PUA glyphs handle all visual rendering (octave dots, underlines, slurs).
 * Overlays (lyrics, tala) are positioned using the MirrorDivService.
 */

import { mirrorDivService } from './mirror-div-service.js';

/**
 * Convert character index to code unit position
 * Handles surrogate pairs (characters in supplementary Unicode planes)
 */
export function charIndexToCodeUnits(str: string, charIndex: number): number {
  const chars = Array.from(str);
  let codeUnits = 0;
  for (let i = 0; i < charIndex && i < chars.length; i++) {
    codeUnits += chars[i].length;
  }
  return codeUnits;
}

/**
 * Convert code unit position to character index
 * Handles surrogate pairs (characters in supplementary Unicode planes)
 */
export function codeUnitsToCharIndex(str: string, codeUnitPos: number): number {
  let cu = 0;
  let ci = 0;
  for (const char of str) {
    if (cu >= codeUnitPos) return ci;
    cu += char.length;
    ci++;
  }
  return ci;
}

interface Selection {
  start: number;
  end: number;
}

interface OverlayItem {
  /** Final x position in pixels (relative to textarea content box) */
  x_px: number;
  /** Content to display */
  content: string;
  /** Anchor char index (for reference, not positioning) */
  anchor_char_index: number;
}

interface TextareaLineDisplay {
  line_index: number;
  text: string;
  cursor_pos: number | null;
  selection: Selection | null;
  label: string | null;
  talas: OverlayItem[];
  lyrics: OverlayItem[];
  /** Character indices of pitched notes (for measuring positions) */
  pitched_char_indices: number[];
  /** Syllable texts (for measuring widths) */
  syllable_texts: string[];
}

interface TextareaDisplayList {
  lines: TextareaLineDisplay[];
}

interface Editor {
  wasmModule?: {
    setLineText?: (lineIndex: number, text: string, cursorPos: number) => TextareaLineDisplay;
    splitLine?: (lineIndex: number, cursorPos: number) => TextareaDisplayList;
    joinLines?: (lineIndex: number) => TextareaDisplayList;
    setSelection?: (anchor: { line: number; col: number }, head: { line: number; col: number }) => void;
    computeTextareaDisplayList?: () => TextareaDisplayList;
    computeLyricLayout?: (lineIndex: number, notePositions: number[], syllableWidths: number[]) => OverlayItem[];
    getLineSystemRole?: (lineIndex: number) => {
      type: 'start' | 'middle' | 'end' | 'standalone';
      count?: number;
    };
  };
  renderCoordinator?: {
    scheduleStaffNotationUpdate?: () => void;
  };
  inspectorCoordinator?: {
    updateDocumentDisplay?: () => void;
  };
}

class TextareaRenderer {
  private container: HTMLElement;
  private editor: Editor;
  private _lineContainers: Map<number, HTMLElement> = new Map();
  private _textareas: Map<number, HTMLTextAreaElement> = new Map();
  private _isComposing: boolean = false;
  private _initialRenderDone: boolean = false;

  constructor(container: HTMLElement, editor: Editor) {
    this.container = container;
    this.editor = editor;
  }

  /**
   * Render all lines from a TextareaDisplayList
   */
  renderAll(displayList: TextareaDisplayList): void {
    // Remove extra line containers
    for (const [idx, container] of this._lineContainers) {
      if (idx >= displayList.lines.length) {
        container.remove();
        this._lineContainers.delete(idx);
        const textarea = this._textareas.get(idx);
        if (textarea) {
          mirrorDivService.cleanup(textarea);
        }
        this._textareas.delete(idx);
      }
    }

    // Render each line
    for (const lineDisplay of displayList.lines) {
      this.renderLine(lineDisplay);
    }

    // Auto-focus first textarea only on initial render
    if (!this._initialRenderDone && this._textareas.size > 0) {
      this._initialRenderDone = true;
      const firstTextarea = this._textareas.get(0);
      if (firstTextarea) {
        requestAnimationFrame(() => {
          firstTextarea.focus();
          console.log('[TextareaRenderer] Auto-focused first textarea on initial render');
        });
      }
    }
  }

  /**
   * Render a single line
   */
  renderLine(lineDisplay: TextareaLineDisplay): void {
    const lineIndex = lineDisplay.line_index;

    // Get or create line container
    let lineContainer = this._lineContainers.get(lineIndex);
    if (!lineContainer) {
      lineContainer = this._createLineContainer(lineIndex);
      this._lineContainers.set(lineIndex, lineContainer);
    }

    // Get or create textarea
    let textarea = this._textareas.get(lineIndex);
    if (!textarea) {
      textarea = this._createTextarea(lineIndex, lineContainer);
      this._textareas.set(lineIndex, textarea);
    }

    // Update textarea value from WASM
    if (textarea.value !== lineDisplay.text) {
      textarea.value = lineDisplay.text;
    }

    // Apply cursor position from WASM
    if (lineDisplay.cursor_pos !== null) {
      const codeUnitPos = charIndexToCodeUnits(lineDisplay.text, lineDisplay.cursor_pos);
      textarea.setSelectionRange(codeUnitPos, codeUnitPos);
    }
    if (lineDisplay.selection) {
      const startUnits = charIndexToCodeUnits(lineDisplay.text, lineDisplay.selection.start);
      const endUnits = charIndexToCodeUnits(lineDisplay.text, lineDisplay.selection.end);
      textarea.setSelectionRange(startUnits, endUnits);
    }

    // Update overlays
    this._updateOverlays(lineContainer, textarea, lineDisplay);

    // Update label
    this._updateLabel(lineContainer, lineDisplay.label);

    // Update system marker indicator
    this._updateSystemMarker(lineContainer, lineIndex);
  }

  /**
   * Create a line container element
   */
  private _createLineContainer(lineIndex: number): HTMLElement {
    const container = document.createElement('div');
    container.className = 'notation-line-container';
    container.dataset.lineIndex = String(lineIndex);
    container.dataset.testid = `notation-line-${lineIndex}`;

    // Line gutter with system marker indicator
    const lineGutter = document.createElement('div');
    lineGutter.className = 'line-gutter';

    const systemMarker = document.createElement('div');
    systemMarker.className = 'system-marker-indicator';
    systemMarker.dataset.lineIndex = String(lineIndex);
    systemMarker.textContent = '·';
    lineGutter.appendChild(systemMarker);

    container.appendChild(lineGutter);

    // Content wrapper for textarea and overlays
    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'line-content-wrapper';

    const talaOverlay = document.createElement('div');
    talaOverlay.className = 'overlay-container tala-overlay';
    talaOverlay.setAttribute('aria-hidden', 'true');
    contentWrapper.appendChild(talaOverlay);

    const lyricOverlay = document.createElement('div');
    lyricOverlay.className = 'overlay-container lyric-overlay';
    lyricOverlay.setAttribute('aria-hidden', 'true');
    contentWrapper.appendChild(lyricOverlay);

    container.appendChild(contentWrapper);

    // Optional label
    const labelEl = document.createElement('div');
    labelEl.className = 'line-label';
    labelEl.style.display = 'none';
    container.appendChild(labelEl);

    // Insert in correct position
    const existingContainers = Array.from(
      this.container.querySelectorAll<HTMLElement>('.notation-line-container')
    );
    const insertBefore = existingContainers.find(el =>
      parseInt(el.dataset.lineIndex || '0', 10) > lineIndex
    );

    if (insertBefore) {
      this.container.insertBefore(container, insertBefore);
    } else {
      this.container.appendChild(container);
    }

    return container;
  }

  /**
   * Create a textarea for a line
   */
  private _createTextarea(lineIndex: number, lineContainer: HTMLElement): HTMLTextAreaElement {
    const textarea = document.createElement('textarea');
    textarea.className = 'notation-textarea';
    textarea.dataset.lineIndex = String(lineIndex);
    textarea.dataset.testid = `notation-textarea-${lineIndex}`;

    // Textarea attributes for notation input
    textarea.rows = 1;
    textarea.wrap = 'off';
    textarea.spellcheck = false;
    textarea.autocomplete = 'off';
    textarea.setAttribute('autocorrect', 'off');
    textarea.setAttribute('autocapitalize', 'off');

    // Insert after tala overlay, before lyric overlay
    const contentWrapper = lineContainer.querySelector('.line-content-wrapper');
    const lyricOverlay = contentWrapper?.querySelector('.lyric-overlay');
    if (contentWrapper && lyricOverlay) {
      contentWrapper.insertBefore(textarea, lyricOverlay);
    }

    // Set up event handlers
    this._setupTextareaEvents(textarea, lineIndex);

    return textarea;
  }

  /**
   * Set up event handlers for a textarea
   */
  private _setupTextareaEvents(textarea: HTMLTextAreaElement, lineIndex: number): void {
    // Input event
    textarea.addEventListener('input', () => {
      if (!this._isComposing) {
        this._handleInput(textarea, lineIndex);
      }
    });

    // IME composition events
    textarea.addEventListener('compositionstart', () => {
      this._isComposing = true;
    });

    textarea.addEventListener('compositionend', () => {
      this._isComposing = false;
      this._handleInput(textarea, lineIndex);
    });

    // Keyboard navigation
    textarea.addEventListener('keydown', (e) => {
      this._handleKeydown(e, textarea, lineIndex);
    });

    // Focus tracking
    textarea.addEventListener('focus', () => {
      this._handleFocus(textarea, lineIndex);
    });

    // Blur
    textarea.addEventListener('blur', () => {
      this._handleBlur(textarea, lineIndex);
    });

    // Selection change
    textarea.addEventListener('select', () => {
      this._handleSelect(textarea, lineIndex);
    });

    // Scroll
    textarea.addEventListener('scroll', () => {
      const lineContainer = this._lineContainers.get(lineIndex);
      if (lineContainer) {
        this._repositionOverlays(lineContainer, textarea);
      }
    });

    // Prevent multi-line input
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
      }
    });
  }

  /**
   * Handle input event
   */
  private _handleInput(textarea: HTMLTextAreaElement, lineIndex: number): void {
    mirrorDivService.invalidateCache(textarea);

    try {
      if (this.editor.wasmModule?.setLineText) {
        const cursorCodeUnits = textarea.selectionStart;
        const inputValue = textarea.value;
        const cursorCharIndex = codeUnitsToCharIndex(inputValue, cursorCodeUnits);
        const lineDisplay = this.editor.wasmModule.setLineText(lineIndex, inputValue, cursorCharIndex);

        if (lineDisplay) {
          if (inputValue !== lineDisplay.text) {
            textarea.value = lineDisplay.text;
            if (lineDisplay.cursor_pos !== null) {
              const newCursorCodeUnits = charIndexToCodeUnits(lineDisplay.text, lineDisplay.cursor_pos);
              textarea.setSelectionRange(newCursorCodeUnits, newCursorCodeUnits);
            } else {
              const chars = Array.from(lineDisplay.text);
              const newCharIndex = Math.min(cursorCharIndex, chars.length);
              const newCodeUnits = charIndexToCodeUnits(lineDisplay.text, newCharIndex);
              textarea.setSelectionRange(newCodeUnits, newCodeUnits);
            }
          }

          const lineContainer = this._lineContainers.get(lineIndex);
          if (lineContainer) {
            this._updateOverlays(lineContainer, textarea, lineDisplay);
          }

          requestAnimationFrame(() => {
            if (this.editor.renderCoordinator?.scheduleStaffNotationUpdate) {
              this.editor.renderCoordinator.scheduleStaffNotationUpdate();
            }
            if (this.editor.inspectorCoordinator?.updateDocumentDisplay) {
              this.editor.inspectorCoordinator.updateDocumentDisplay();
            }
          });
        }
      }
    } catch (err) {
      console.error('[TextareaRenderer] setLineText failed:', err);
    }
  }

  /**
   * Handle keydown event for navigation
   */
  private _handleKeydown(e: KeyboardEvent, textarea: HTMLTextAreaElement, lineIndex: number): void {
    const text = textarea.value;
    const cursorCharIndex = codeUnitsToCharIndex(text, textarea.selectionStart);

    switch (e.key) {
      case 'ArrowUp':
        if (lineIndex > 0) {
          e.preventDefault();
          this._focusLineAtCharIndex(lineIndex - 1, cursorCharIndex);
        }
        break;

      case 'ArrowDown':
        const maxLine = this._textareas.size - 1;
        if (lineIndex < maxLine) {
          e.preventDefault();
          this._focusLineAtCharIndex(lineIndex + 1, cursorCharIndex);
        }
        break;

      case 'ArrowLeft':
        if (cursorCharIndex === 0 && lineIndex > 0) {
          e.preventDefault();
          const prevTextarea = this._textareas.get(lineIndex - 1);
          if (prevTextarea) {
            prevTextarea.focus();
            prevTextarea.setSelectionRange(prevTextarea.value.length, prevTextarea.value.length);
          }
        }
        break;

      case 'ArrowRight':
        const charCount = Array.from(text).length;
        if (cursorCharIndex === charCount && lineIndex < this._textareas.size - 1) {
          e.preventDefault();
          this._focusLineAtCharIndex(lineIndex + 1, 0);
        }
        break;

      case 'Home':
        if (e.ctrlKey) {
          e.preventDefault();
          this._focusLineAtCharIndex(0, 0);
        }
        break;

      case 'End':
        if (e.ctrlKey) {
          e.preventDefault();
          const lastLine = this._textareas.size - 1;
          const lastTextarea = this._textareas.get(lastLine);
          if (lastTextarea) {
            lastTextarea.focus();
            lastTextarea.setSelectionRange(lastTextarea.value.length, lastTextarea.value.length);
          }
        }
        break;

      case 'Enter':
        e.preventDefault();
        this._handleEnter(textarea, lineIndex, cursorCharIndex);
        break;

      case 'Backspace':
        if (cursorCharIndex === 0 && lineIndex > 0) {
          e.preventDefault();
          this._handleBackspaceJoin(lineIndex);
        }
        break;
    }
  }

  /**
   * Handle Enter key - split line at cursor position
   */
  private _handleEnter(textarea: HTMLTextAreaElement, lineIndex: number, cursorCharIndex: number): void {
    try {
      if (this.editor.wasmModule?.splitLine) {
        const displayList = this.editor.wasmModule.splitLine(lineIndex, cursorCharIndex);

        if (displayList) {
          this.renderAll(displayList);

          const newLineIndex = lineIndex + 1;
          const newTextarea = this._textareas.get(newLineIndex);
          if (newTextarea) {
            newTextarea.focus();
            newTextarea.setSelectionRange(0, 0);
          }

          requestAnimationFrame(() => {
            if (this.editor.renderCoordinator?.scheduleStaffNotationUpdate) {
              this.editor.renderCoordinator.scheduleStaffNotationUpdate();
            }
            if (this.editor.inspectorCoordinator?.updateDocumentDisplay) {
              this.editor.inspectorCoordinator.updateDocumentDisplay();
            }
          });
        }
      }
    } catch (err) {
      console.error('[TextareaRenderer] splitLine failed:', err);
    }
  }

  /**
   * Handle Backspace at beginning of line - join with previous line
   */
  private _handleBackspaceJoin(lineIndex: number): void {
    try {
      if (this.editor.wasmModule?.joinLines) {
        const displayList = this.editor.wasmModule.joinLines(lineIndex);

        if (displayList) {
          this.renderAll(displayList);

          const prevLineIndex = lineIndex - 1;
          const prevTextarea = this._textareas.get(prevLineIndex);
          if (prevTextarea) {
            prevTextarea.focus();
            const lineDisplay = displayList.lines[prevLineIndex];
            if (lineDisplay && lineDisplay.cursor_pos !== null) {
              const codeUnitPos = charIndexToCodeUnits(prevTextarea.value, lineDisplay.cursor_pos);
              prevTextarea.setSelectionRange(codeUnitPos, codeUnitPos);
            }
          }

          requestAnimationFrame(() => {
            if (this.editor.renderCoordinator?.scheduleStaffNotationUpdate) {
              this.editor.renderCoordinator.scheduleStaffNotationUpdate();
            }
            if (this.editor.inspectorCoordinator?.updateDocumentDisplay) {
              this.editor.inspectorCoordinator.updateDocumentDisplay();
            }
          });
        }
      }
    } catch (err) {
      console.error('[TextareaRenderer] joinLines failed:', err);
    }
  }

  /**
   * Focus a specific line at a given cursor position (code units)
   * @deprecated Use _focusLineAtCharIndex for proper surrogate pair handling
   */
  private _focusLine(lineIndex: number, cursorPos: number): void {
    const textarea = this._textareas.get(lineIndex);
    if (textarea) {
      textarea.focus();
      const pos = Math.min(cursorPos, textarea.value.length);
      textarea.setSelectionRange(pos, pos);
    }
  }

  /**
   * Focus a specific line at a given character index (handles surrogate pairs)
   */
  private _focusLineAtCharIndex(lineIndex: number, charIndex: number): void {
    const textarea = this._textareas.get(lineIndex);
    if (textarea) {
      textarea.focus();
      const text = textarea.value;
      const chars = Array.from(text);
      const safeCharIndex = Math.min(charIndex, chars.length);
      const codeUnitPos = charIndexToCodeUnits(text, safeCharIndex);
      textarea.setSelectionRange(codeUnitPos, codeUnitPos);
    }
  }

  /**
   * Focus a line and restore selection from WASM state.
   */
  focusLine(lineIndex: number, cursorCharIndex?: number): void {
    const textarea = this._textareas.get(lineIndex);
    if (!textarea) return;

    textarea.focus();

    const displayList = this.editor.wasmModule?.computeTextareaDisplayList?.();
    if (displayList && displayList.lines[lineIndex]) {
      const lineDisplay = displayList.lines[lineIndex];
      const text = textarea.value;

      if (lineDisplay.selection) {
        const startUnits = charIndexToCodeUnits(text, lineDisplay.selection.start);
        const endUnits = charIndexToCodeUnits(text, lineDisplay.selection.end);
        textarea.setSelectionRange(startUnits, endUnits);
      } else if (lineDisplay.cursor_pos !== null) {
        const codeUnitPos = charIndexToCodeUnits(text, lineDisplay.cursor_pos);
        textarea.setSelectionRange(codeUnitPos, codeUnitPos);
      } else if (cursorCharIndex !== undefined) {
        const codeUnitPos = charIndexToCodeUnits(text, cursorCharIndex);
        textarea.setSelectionRange(codeUnitPos, codeUnitPos);
      }
    }
  }

  /**
   * Handle focus event
   */
  private _handleFocus(textarea: HTMLTextAreaElement, lineIndex: number): void {
    this._removeSelectionOverlay(textarea, lineIndex);
    textarea.classList.remove('has-selection');
    console.log(`[TextareaRenderer] Focus on line ${lineIndex}`);
  }

  /**
   * Handle blur event
   */
  private _handleBlur(textarea: HTMLTextAreaElement, lineIndex: number): void {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;

    if (start !== end) {
      textarea.classList.add('has-selection');
      this._showSelectionOverlay(textarea, lineIndex, start, end);
      console.log(`[TextareaRenderer] Blur with selection on line ${lineIndex}: ${start}-${end}`);
    } else {
      textarea.classList.remove('has-selection');
      this._removeSelectionOverlay(textarea, lineIndex);
    }
  }

  /**
   * Show selection overlay when textarea is unfocused
   */
  private _showSelectionOverlay(
    textarea: HTMLTextAreaElement,
    lineIndex: number,
    start: number,
    end: number
  ): void {
    const lineContainer = this._lineContainers.get(lineIndex);
    if (!lineContainer) return;

    this._removeSelectionOverlay(textarea, lineIndex);

    const positions = mirrorDivService.getCharacterPositions(textarea, [start, end]);
    const startPos = positions.get(start);
    const endPos = positions.get(end);

    if (!startPos || !endPos) return;

    const overlay = document.createElement('div');
    overlay.className = 'textarea-selection-overlay';
    overlay.dataset.lineIndex = String(lineIndex);

    const textareaRect = textarea.getBoundingClientRect();
    const containerRect = lineContainer.getBoundingClientRect();

    overlay.style.left = `${textareaRect.left - containerRect.left + startPos.x - textarea.scrollLeft}px`;
    overlay.style.top = `${textarea.offsetTop}px`;
    overlay.style.width = `${endPos.x - startPos.x}px`;
    overlay.style.height = `${textarea.offsetHeight}px`;

    lineContainer.appendChild(overlay);
  }

  /**
   * Remove selection overlay
   */
  private _removeSelectionOverlay(textarea: HTMLTextAreaElement, lineIndex: number): void {
    const lineContainer = this._lineContainers.get(lineIndex);
    if (!lineContainer) return;

    const overlay = lineContainer.querySelector('.textarea-selection-overlay');
    if (overlay) {
      overlay.remove();
    }
  }

  /**
   * Handle selection change
   */
  private _handleSelect(textarea: HTMLTextAreaElement, lineIndex: number): void {
    const text = textarea.value;
    const start = codeUnitsToCharIndex(text, textarea.selectionStart);
    const end = codeUnitsToCharIndex(text, textarea.selectionEnd);
    console.log(`[TextareaRenderer] Selection on line ${lineIndex}: ${start}-${end}`);

    if (this.editor.wasmModule?.setSelection) {
      try {
        const anchor = { line: lineIndex, col: start };
        const head = { line: lineIndex, col: end };
        this.editor.wasmModule.setSelection(anchor as any, head as any);
        console.log(`[TextareaRenderer] Synced selection to WASM: line ${lineIndex}, ${start}-${end}`);
      } catch (err) {
        console.error('[TextareaRenderer] Failed to sync selection to WASM:', err);
      }
    }
  }

  /**
   * Update overlays (lyrics, tala) for a line
   *
   * Flow:
   * 1. For talas: measure anchor_char_index positions, render at measured x + padding
   * 2. For lyrics: measure note positions and syllable widths, call WASM computeLyricLayout,
   *    then render at the x_px positions returned by WASM
   */
  private _updateOverlays(
    lineContainer: HTMLElement,
    textarea: HTMLTextAreaElement,
    lineDisplay: TextareaLineDisplay
  ): void {
    const talaOverlay = lineContainer.querySelector('.tala-overlay');
    const lyricOverlay = lineContainer.querySelector('.lyric-overlay');

    if (!talaOverlay || !lyricOverlay) return;

    talaOverlay.innerHTML = '';
    lyricOverlay.innerHTML = '';

    // === TALA RENDERING ===
    // Talas use anchor_char_index - measure those positions and render
    // Mirror div copies textarea's padding-left, so measurements already include padding offset
    if (lineDisplay.talas.length > 0) {
      const talaIndices = lineDisplay.talas.map(t => t.anchor_char_index);
      const talaPositions = mirrorDivService.getCharacterPositions(textarea, talaIndices);

      for (const tala of lineDisplay.talas) {
        const pos = talaPositions.get(tala.anchor_char_index);
        if (pos) {
          const span = document.createElement('span');
          span.className = 'overlay-item tala-item';
          span.style.left = `${pos.x}px`;
          span.textContent = tala.content;
          talaOverlay.appendChild(span);
        }
      }
    }

    // === LYRIC RENDERING ===
    // Phase 2: Measure positions and widths, call WASM, render at returned x_px
    if (lineDisplay.syllable_texts && lineDisplay.syllable_texts.length > 0) {
      // 1. Measure note positions (from pitched_char_indices)
      // Mirror div copies textarea's padding-left, so measurements already include padding offset
      const notePositions: number[] = [];
      if (lineDisplay.pitched_char_indices && lineDisplay.pitched_char_indices.length > 0) {
        const positions = mirrorDivService.getCharacterPositions(
          textarea,
          lineDisplay.pitched_char_indices
        );
        for (const charIndex of lineDisplay.pitched_char_indices) {
          const pos = positions.get(charIndex);
          notePositions.push(pos ? pos.x : 0);
        }
      }

      // 2. Measure syllable widths
      const syllableWidths: number[] = [];
      const measureEl = document.createElement('span');
      measureEl.className = 'overlay-item lyric-item';
      measureEl.style.visibility = 'hidden';
      measureEl.style.position = 'absolute';
      lyricOverlay.appendChild(measureEl);

      for (const syllableText of lineDisplay.syllable_texts) {
        measureEl.textContent = syllableText;
        syllableWidths.push(measureEl.getBoundingClientRect().width);
      }

      lyricOverlay.removeChild(measureEl);

      // 3. Call WASM to compute final positions with collision avoidance
      let lyrics: OverlayItem[] = [];
      if (this.editor.wasmModule?.computeLyricLayout) {
        try {
          lyrics = this.editor.wasmModule.computeLyricLayout(
            lineDisplay.line_index,
            notePositions,
            syllableWidths
          );
        } catch (err) {
          console.error('[TextareaRenderer] computeLyricLayout failed:', err);
        }
      }

      // 4. Render lyrics at WASM-computed x_px positions (no JS collision detection!)
      for (const lyric of lyrics) {
        const span = document.createElement('span');
        span.className = 'overlay-item lyric-item';
        span.style.left = `${lyric.x_px}px`;
        span.textContent = lyric.content;
        lyricOverlay.appendChild(span);
      }
    }
  }

  /**
   * Reposition overlays (call on scroll)
   */
  private _repositionOverlays(lineContainer: HTMLElement, textarea: HTMLTextAreaElement): void {
    const talaItems = lineContainer.querySelectorAll<HTMLElement>('.tala-item');
    const lyricItems = lineContainer.querySelectorAll<HTMLElement>('.lyric-item');
    const scrollLeft = textarea.scrollLeft;

    for (const item of talaItems) {
      const baseLeft = parseFloat(item.dataset.baseLeft || item.style.left);
      item.dataset.baseLeft = String(baseLeft);
      item.style.left = `${baseLeft - scrollLeft}px`;
    }

    for (const item of lyricItems) {
      const baseLeft = parseFloat(item.dataset.baseLeft || item.style.left);
      item.dataset.baseLeft = String(baseLeft);
      item.style.left = `${baseLeft - scrollLeft}px`;
    }
  }

  /**
   * Update line label
   */
  private _updateLabel(lineContainer: HTMLElement, label: string | null): void {
    const labelEl = lineContainer.querySelector<HTMLElement>('.line-label');
    if (!labelEl) return;
    if (label) {
      labelEl.textContent = label;
      labelEl.style.display = '';
    } else {
      labelEl.style.display = 'none';
    }
  }

  /**
   * Update system marker indicator
   */
  private _updateSystemMarker(lineContainer: HTMLElement, lineIndex: number): void {
    const indicator = lineContainer.querySelector('.system-marker-indicator');
    if (!indicator) return;

    let role: { type: 'start' | 'middle' | 'end' | 'standalone'; count?: number } | null = null;
    try {
      if (this.editor.wasmModule?.getLineSystemRole) {
        role = this.editor.wasmModule.getLineSystemRole(lineIndex);
      }
    } catch (e) {
      // Ignore errors
    }

    if (!role) {
      // Fallback if WASM not available
      indicator.textContent = '·';
      indicator.classList.remove('marker-active');
      indicator.setAttribute('title', 'Standalone - Click to start system');
      return;
    }

    if (role.type === 'start') {
      const staffWord = role.count === 1 ? 'staff' : 'staves';
      indicator.textContent = `«${role.count}`;
      indicator.classList.add('marker-active');
      indicator.setAttribute('title', `Starts system of ${role.count} ${staffWord} - Click to cycle`);
    } else if (role.type === 'middle') {
      indicator.textContent = '├';
      indicator.classList.add('marker-active');
      indicator.setAttribute('title', 'Middle of system - Click start line to edit');
    } else if (role.type === 'end') {
      indicator.textContent = '└';
      indicator.classList.add('marker-active');
      indicator.setAttribute('title', 'End of system - Click start line to edit');
    } else {
      indicator.textContent = '·';
      indicator.classList.remove('marker-active');
      indicator.setAttribute('title', 'Standalone - Click to start system');
    }
  }

  /**
   * Get textarea for a line
   */
  getTextarea(lineIndex: number): HTMLTextAreaElement | undefined {
    return this._textareas.get(lineIndex);
  }

  /**
   * Get focused line index
   */
  getFocusedLineIndex(): number | null {
    const activeElement = document.activeElement as HTMLElement | null;
    if (activeElement?.classList.contains('notation-textarea')) {
      return parseInt(activeElement.dataset.lineIndex || '0', 10);
    }
    return null;
  }

  /**
   * Focus the first textarea
   */
  focusFirstTextarea(): void {
    const firstTextarea = this._textareas.get(0);
    if (firstTextarea) {
      firstTextarea.focus();
      firstTextarea.setSelectionRange(0, 0);
    }
  }

  /**
   * Clean up all resources
   */
  cleanup(): void {
    for (const textarea of this._textareas.values()) {
      mirrorDivService.cleanup(textarea);
    }
    this._textareas.clear();
    this._lineContainers.clear();
    this.container.innerHTML = '';
  }
}

export default TextareaRenderer;
