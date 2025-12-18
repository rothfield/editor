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
 * @param {string} str - The string
 * @param {number} charIndex - Character index (glyph position)
 * @returns {number} Code unit position for selectionStart/End
 */
function charIndexToCodeUnits(str, charIndex) {
  const chars = Array.from(str);
  // Sum the length of all characters up to charIndex
  let codeUnits = 0;
  for (let i = 0; i < charIndex && i < chars.length; i++) {
    codeUnits += chars[i].length; // 1 for BMP, 2 for surrogate pair
  }
  return codeUnits;
}

/**
 * Convert code unit position to character index
 * Handles surrogate pairs (characters in supplementary Unicode planes)
 * @param {string} str - The string
 * @param {number} codeUnitPos - Code unit position from selectionStart/End
 * @returns {number} Character index (glyph position)
 */
function codeUnitsToCharIndex(str, codeUnitPos) {
  let cu = 0;
  let ci = 0;
  for (const char of str) {
    if (cu >= codeUnitPos) return ci;
    cu += char.length; // 1 for BMP, 2 for surrogate pair
    ci++;
  }
  return ci;
}

/**
 * @typedef {import('../types/wasm-module').TextareaLineDisplay} TextareaLineDisplay
 * @typedef {import('../types/wasm-module').OverlayItem} OverlayItem
 */

class TextareaRenderer {
  /**
   * @param {HTMLElement} container - Container element for all notation lines
   * @param {Object} editor - Editor instance with wasmModule
   */
  constructor(container, editor) {
    /** @type {HTMLElement} */
    this.container = container;

    /** @type {Object} */
    this.editor = editor;

    /** @type {Map<number, HTMLElement>} - Line index to line container element */
    this._lineContainers = new Map();

    /** @type {Map<number, HTMLTextAreaElement>} - Line index to textarea element */
    this._textareas = new Map();

    /** @type {boolean} - Whether IME composition is in progress */
    this._isComposing = false;

    /** @type {boolean} - Whether initial render has happened (for auto-focus) */
    this._initialRenderDone = false;
  }

  /**
   * Render all lines from a TextareaDisplayList
   * @param {import('../types/wasm-module').TextareaDisplayList} displayList
   */
  renderAll(displayList) {
    // Remove extra line containers
    for (const [idx, container] of this._lineContainers) {
      if (idx >= displayList.lines.length) {
        container.remove();
        this._lineContainers.delete(idx);
        this._textareas.delete(idx);
        mirrorDivService.cleanup(this._textareas.get(idx));
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
        // Delay focus slightly to ensure DOM is ready
        requestAnimationFrame(() => {
          firstTextarea.focus();
          console.log('[TextareaRenderer] Auto-focused first textarea on initial render');
        });
      }
    }
  }

  /**
   * Render a single line
   * @param {TextareaLineDisplay} lineDisplay
   */
  renderLine(lineDisplay) {
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

    // Update textarea value from WASM (WASM is source of truth)
    // Keystrokes are trapped in events.js - textarea is just a display surface
    if (textarea.value !== lineDisplay.text) {
      textarea.value = lineDisplay.text;
    }

    // Apply cursor position from WASM (convert char index to code units for surrogate pairs)
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
   * @param {number} lineIndex
   * @returns {HTMLElement}
   */
  _createLineContainer(lineIndex) {
    const container = document.createElement('div');
    container.className = 'notation-line-container';
    container.dataset.lineIndex = String(lineIndex);
    container.dataset.testid = `notation-line-${lineIndex}`;

    // Create structure:
    // - line gutter (left side with system marker)
    // - line content wrapper
    //   - tala overlay (above)
    //   - textarea
    //   - lyric overlay (below)

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

    // Textarea will be inserted into contentWrapper

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
    const existingContainers = Array.from(this.container.querySelectorAll('.notation-line-container'));
    const insertBefore = existingContainers.find(el =>
      parseInt(el.dataset.lineIndex, 10) > lineIndex
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
   * @param {number} lineIndex
   * @param {HTMLElement} lineContainer
   * @returns {HTMLTextAreaElement}
   */
  _createTextarea(lineIndex, lineContainer) {
    const textarea = document.createElement('textarea');
    textarea.className = 'notation-textarea';
    textarea.dataset.lineIndex = String(lineIndex);
    textarea.dataset.testid = `notation-textarea-${lineIndex}`;

    // Textarea attributes for notation input
    textarea.rows = 1;
    textarea.wrap = 'off';
    textarea.spellcheck = false;
    textarea.autocomplete = 'off';
    textarea.autocorrect = 'off';
    textarea.autocapitalize = 'off';

    // Insert after tala overlay, before lyric overlay (both are in content wrapper)
    const contentWrapper = lineContainer.querySelector('.line-content-wrapper');
    const lyricOverlay = contentWrapper.querySelector('.lyric-overlay');
    contentWrapper.insertBefore(textarea, lyricOverlay);

    // Set up event handlers
    this._setupTextareaEvents(textarea, lineIndex);

    return textarea;
  }

  /**
   * Set up event handlers for a textarea
   * @param {HTMLTextAreaElement} textarea
   * @param {number} lineIndex
   */
  _setupTextareaEvents(textarea, lineIndex) {
    // Input event - send new value to WASM for parsing/normalization
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
      // Process IME result
      this._handleInput(textarea, lineIndex);
    });

    // Keyboard navigation (cross-line only - let browser handle within-line)
    textarea.addEventListener('keydown', (e) => {
      this._handleKeydown(e, textarea, lineIndex);
    });

    // Focus tracking
    textarea.addEventListener('focus', () => {
      this._handleFocus(textarea, lineIndex);
    });

    // Blur - show selection overlay if there's a selection
    textarea.addEventListener('blur', () => {
      this._handleBlur(textarea, lineIndex);
    });

    // Selection change
    textarea.addEventListener('select', () => {
      this._handleSelect(textarea, lineIndex);
    });

    // Scroll - reposition overlays
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
        // Could trigger line split here if desired
      }
    });

    // Double-click: browser's default word selection works for beats
    // (beats are separated by spaces, so word selection = beat selection)

    // Handle paste - let browser handle it, input event will process it
    // No need to intercept paste - we process whatever browser gives us
  }

  /**
   * Handle input event - send new value to WASM for parsing/normalization
   * @param {HTMLTextAreaElement} textarea
   * @param {number} lineIndex
   */
  _handleInput(textarea, lineIndex) {
    // Invalidate position cache since text changed
    mirrorDivService.invalidateCache(textarea);

    try {
      if (this.editor.wasmModule?.setLineText) {
        // Send new text to WASM - it parses, normalizes, returns display data
        // Get cursor position AFTER input (where browser placed it)
        const cursorCodeUnits = textarea.selectionStart;
        const inputValue = textarea.value;
        // Convert to character index for WASM
        const cursorCharIndex = codeUnitsToCharIndex(inputValue, cursorCodeUnits);
        const lineDisplay = this.editor.wasmModule.setLineText(lineIndex, inputValue, cursorCharIndex);

        if (lineDisplay) {
          // Only update textarea if WASM normalized differently
          if (inputValue !== lineDisplay.text) {
            textarea.value = lineDisplay.text;
            // Cursor position from WASM is character index, convert to code units
            if (lineDisplay.cursor_pos !== null) {
              const newCursorCodeUnits = charIndexToCodeUnits(lineDisplay.text, lineDisplay.cursor_pos);
              textarea.setSelectionRange(newCursorCodeUnits, newCursorCodeUnits);
            } else {
              // Fallback: preserve cursor position in character terms
              const chars = Array.from(lineDisplay.text);
              const newCharIndex = Math.min(cursorCharIndex, chars.length);
              const newCodeUnits = charIndexToCodeUnits(lineDisplay.text, newCharIndex);
              textarea.setSelectionRange(newCodeUnits, newCodeUnits);
            }
          }

          // Update overlays
          const lineContainer = this._lineContainers.get(lineIndex);
          if (lineContainer) {
            this._updateOverlays(lineContainer, textarea, lineDisplay);
          }

          // Trigger staff notation and inspector updates (but not textarea re-render)
          // Use requestAnimationFrame to avoid blocking input
          requestAnimationFrame(() => {
            // Schedule staff notation update (debounced)
            if (this.editor.renderCoordinator?.scheduleStaffNotationUpdate) {
              this.editor.renderCoordinator.scheduleStaffNotationUpdate();
            }
            // Update inspector tabs
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
   * @param {KeyboardEvent} e
   * @param {HTMLTextAreaElement} textarea
   * @param {number} lineIndex
   */
  _handleKeydown(e, textarea, lineIndex) {
    const text = textarea.value;
    // Convert code units to character index (handles surrogate pairs for PUA chars)
    const cursorCharIndex = codeUnitsToCharIndex(text, textarea.selectionStart);

    switch (e.key) {
      case 'ArrowUp':
        // Move to previous line (preserve character position, not code unit position)
        if (lineIndex > 0) {
          e.preventDefault();
          this._focusLineAtCharIndex(lineIndex - 1, cursorCharIndex);
        }
        break;

      case 'ArrowDown':
        // Move to next line (preserve character position, not code unit position)
        const maxLine = this._textareas.size - 1;
        if (lineIndex < maxLine) {
          e.preventDefault();
          this._focusLineAtCharIndex(lineIndex + 1, cursorCharIndex);
        }
        break;

      case 'ArrowLeft':
        // At start of line, move to end of previous line
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
        // At end of line, move to start of next line
        // Compare character index to character count (not code units)
        const charCount = Array.from(text).length;
        if (cursorCharIndex === charCount && lineIndex < this._textareas.size - 1) {
          e.preventDefault();
          this._focusLineAtCharIndex(lineIndex + 1, 0);
        }
        break;

      case 'Home':
        if (e.ctrlKey) {
          // Ctrl+Home: go to document start
          e.preventDefault();
          this._focusLineAtCharIndex(0, 0);
        }
        break;

      case 'End':
        if (e.ctrlKey) {
          // Ctrl+End: go to document end
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
        // Split line at cursor position
        e.preventDefault();
        this._handleEnter(textarea, lineIndex, cursorCharIndex);
        break;

      case 'Backspace':
        // At start of non-first line, join with previous line
        if (cursorCharIndex === 0 && lineIndex > 0) {
          e.preventDefault();
          this._handleBackspaceJoin(lineIndex);
        }
        // Otherwise, let browser handle normal backspace within line
        break;
    }
  }

  /**
   * Handle Enter key - split line at cursor position
   * @param {HTMLTextAreaElement} textarea
   * @param {number} lineIndex
   * @param {number} cursorCharIndex - Character position where to split
   */
  _handleEnter(textarea, lineIndex, cursorCharIndex) {
    try {
      if (this.editor.wasmModule?.splitLine) {
        // Call WASM to split the line
        const displayList = this.editor.wasmModule.splitLine(lineIndex, cursorCharIndex);

        if (displayList) {
          // Re-render all lines since line count changed
          this.renderAll(displayList);

          // Focus the new line (lineIndex + 1) at start
          const newLineIndex = lineIndex + 1;
          const newTextarea = this._textareas.get(newLineIndex);
          if (newTextarea) {
            newTextarea.focus();
            newTextarea.setSelectionRange(0, 0);
          }

          // Trigger staff notation and inspector updates
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
   * @param {number} lineIndex - Current line index (must be > 0)
   */
  _handleBackspaceJoin(lineIndex) {
    try {
      if (this.editor.wasmModule?.joinLines) {
        // Call WASM to join the lines
        const displayList = this.editor.wasmModule.joinLines(lineIndex);

        if (displayList) {
          // Re-render all lines since line count changed
          this.renderAll(displayList);

          // Focus the previous line at the join point
          const prevLineIndex = lineIndex - 1;
          const prevTextarea = this._textareas.get(prevLineIndex);
          if (prevTextarea) {
            prevTextarea.focus();
            // WASM sets cursor_pos, so renderLine will set cursor position
            // But we also need to ensure focus is correct
            const lineDisplay = displayList.lines[prevLineIndex];
            if (lineDisplay && lineDisplay.cursor_pos !== null) {
              const codeUnitPos = charIndexToCodeUnits(prevTextarea.value, lineDisplay.cursor_pos);
              prevTextarea.setSelectionRange(codeUnitPos, codeUnitPos);
            }
          }

          // Trigger staff notation and inspector updates
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
   * @param {number} lineIndex
   * @param {number} cursorPos - Code unit position
   * @deprecated Use _focusLineAtCharIndex for proper surrogate pair handling
   */
  _focusLine(lineIndex, cursorPos) {
    const textarea = this._textareas.get(lineIndex);
    if (textarea) {
      textarea.focus();
      const pos = Math.min(cursorPos, textarea.value.length);
      textarea.setSelectionRange(pos, pos);
    }
  }

  /**
   * Focus a specific line at a given character index (handles surrogate pairs)
   * Use this when preserving cursor position across lines with PUA characters.
   * @param {number} lineIndex
   * @param {number} charIndex - Character index (glyph position, not code units)
   */
  _focusLineAtCharIndex(lineIndex, charIndex) {
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
   * This refocuses the textarea so native browser selection is shown
   * instead of the custom overlay (which has positioning issues with surrogate pairs).
   * @param {number} lineIndex
   * @param {number} [cursorCharIndex] - Optional cursor position (char index)
   */
  focusLine(lineIndex, cursorCharIndex) {
    const textarea = this._textareas.get(lineIndex);
    if (!textarea) return;

    // Focus first to trigger overlay removal
    textarea.focus();

    // Get selection from WASM display list (char indices)
    const displayList = this.editor.wasmModule?.computeTextareaDisplayList?.();
    if (displayList && displayList.lines[lineIndex]) {
      const lineDisplay = displayList.lines[lineIndex];
      const text = textarea.value;

      if (lineDisplay.selection) {
        // Convert char indices to code units for setSelectionRange
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
   * @param {HTMLTextAreaElement} textarea
   * @param {number} lineIndex
   */
  _handleFocus(textarea, lineIndex) {
    // Remove selection overlay - browser's native selection will show
    this._removeSelectionOverlay(textarea, lineIndex);
    textarea.classList.remove('has-selection');
    console.log(`[TextareaRenderer] Focus on line ${lineIndex}`);
  }

  /**
   * Handle blur event - show selection overlay if there's a selection
   * @param {HTMLTextAreaElement} textarea
   * @param {number} lineIndex
   */
  _handleBlur(textarea, lineIndex) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;

    if (start !== end) {
      // Has selection - show overlay
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
   * @param {HTMLTextAreaElement} textarea
   * @param {number} lineIndex
   * @param {number} start
   * @param {number} end
   */
  _showSelectionOverlay(textarea, lineIndex, start, end) {
    const lineContainer = this._lineContainers.get(lineIndex);
    if (!lineContainer) return;

    // Remove existing overlay
    this._removeSelectionOverlay(textarea, lineIndex);

    // Get positions of selection start and end
    const positions = mirrorDivService.getCharacterPositions(textarea, [start, end]);
    const startPos = positions.get(start);
    const endPos = positions.get(end);

    if (!startPos || !endPos) return;

    // Create overlay element
    const overlay = document.createElement('div');
    overlay.className = 'textarea-selection-overlay';
    overlay.dataset.lineIndex = String(lineIndex);

    // Position overlay
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
   * @param {HTMLTextAreaElement} textarea
   * @param {number} lineIndex
   */
  _removeSelectionOverlay(textarea, lineIndex) {
    const lineContainer = this._lineContainers.get(lineIndex);
    if (!lineContainer) return;

    const overlay = lineContainer.querySelector('.textarea-selection-overlay');
    if (overlay) {
      overlay.remove();
    }
  }

  /**
   * Handle selection change
   * @param {HTMLTextAreaElement} textarea
   * @param {number} lineIndex
   */
  _handleSelect(textarea, lineIndex) {
    const text = textarea.value;
    // Convert code units to character indices (handles surrogate pairs for PUA chars)
    const start = codeUnitsToCharIndex(text, textarea.selectionStart);
    const end = codeUnitsToCharIndex(text, textarea.selectionEnd);
    console.log(`[TextareaRenderer] Selection on line ${lineIndex}: ${start}-${end}`);

    // Sync selection to WASM so edit menu actions work
    if (this.editor.wasmModule?.setSelection) {
      try {
        const anchor = { line: lineIndex, col: start };
        const head = { line: lineIndex, col: end };
        this.editor.wasmModule.setSelection(anchor, head);
        console.log(`[TextareaRenderer] Synced selection to WASM: line ${lineIndex}, ${start}-${end}`);
      } catch (err) {
        console.error('[TextareaRenderer] Failed to sync selection to WASM:', err);
      }
    }
  }

  /**
   * Update overlays (lyrics, tala) for a line
   * @param {HTMLElement} lineContainer
   * @param {HTMLTextAreaElement} textarea
   * @param {TextareaLineDisplay} lineDisplay
   */
  _updateOverlays(lineContainer, textarea, lineDisplay) {
    const talaOverlay = lineContainer.querySelector('.tala-overlay');
    const lyricOverlay = lineContainer.querySelector('.lyric-overlay');

    // Clear existing overlays
    talaOverlay.innerHTML = '';
    lyricOverlay.innerHTML = '';

    // Skip if no overlays
    if (lineDisplay.talas.length === 0 && lineDisplay.lyrics.length === 0) {
      return;
    }

    // Collect all indices to measure
    const allIndices = new Set();
    for (const item of lineDisplay.talas) {
      allIndices.add(item.char_index);
    }
    for (const item of lineDisplay.lyrics) {
      allIndices.add(item.char_index);
    }

    // Batch measure positions
    const positions = mirrorDivService.getCharacterPositions(textarea, [...allIndices]);

    // Position tala markers
    for (const tala of lineDisplay.talas) {
      const pos = positions.get(tala.char_index);
      if (pos) {
        const span = document.createElement('span');
        span.className = 'overlay-item tala-item';
        span.style.left = `${pos.x}px`;
        span.textContent = tala.content;
        talaOverlay.appendChild(span);
      }
    }

    // Position lyrics
    for (const lyric of lineDisplay.lyrics) {
      const pos = positions.get(lyric.char_index);
      if (pos) {
        const span = document.createElement('span');
        span.className = 'overlay-item lyric-item';
        span.style.left = `${pos.x}px`;
        span.textContent = lyric.content;
        lyricOverlay.appendChild(span);
      }
    }
  }

  /**
   * Reposition overlays (call on scroll)
   * @param {HTMLElement} lineContainer
   * @param {HTMLTextAreaElement} textarea
   */
  _repositionOverlays(lineContainer, textarea) {
    const talaItems = lineContainer.querySelectorAll('.tala-item');
    const lyricItems = lineContainer.querySelectorAll('.lyric-item');
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
   * @param {HTMLElement} lineContainer
   * @param {string|null} label
   */
  _updateLabel(lineContainer, label) {
    const labelEl = lineContainer.querySelector('.line-label');
    if (label) {
      labelEl.textContent = label;
      labelEl.style.display = '';
    } else {
      labelEl.style.display = 'none';
    }
  }

  /**
   * Update system marker indicator
   * @param {HTMLElement} lineContainer
   * @param {number} lineIndex
   */
  _updateSystemMarker(lineContainer, lineIndex) {
    const indicator = lineContainer.querySelector('.system-marker-indicator');
    if (!indicator) return;

    // Query WASM for current marker value
    let marker = null;
    try {
      if (this.editor.wasmModule?.getSystemMarker) {
        marker = this.editor.wasmModule.getSystemMarker(lineIndex);
      }
    } catch (e) {
      // Ignore errors - marker just stays at default
    }

    // Update indicator display (WASM returns "<<", ">>", or "")
    if (marker === '<<') {
      indicator.textContent = '«';
      indicator.classList.add('marker-active');
    } else if (marker === '>>') {
      indicator.textContent = '»';
      indicator.classList.add('marker-active');
    } else {
      indicator.textContent = '·';
      indicator.classList.remove('marker-active');
    }
  }

  /**
   * Get textarea for a line
   * @param {number} lineIndex
   * @returns {HTMLTextAreaElement|undefined}
   */
  getTextarea(lineIndex) {
    return this._textareas.get(lineIndex);
  }

  /**
   * Get focused line index
   * @returns {number|null}
   */
  getFocusedLineIndex() {
    const activeElement = document.activeElement;
    if (activeElement?.classList.contains('notation-textarea')) {
      return parseInt(activeElement.dataset.lineIndex, 10);
    }
    return null;
  }

  /**
   * Focus the first textarea (for use after creating new document)
   */
  focusFirstTextarea() {
    const firstTextarea = this._textareas.get(0);
    if (firstTextarea) {
      firstTextarea.focus();
      firstTextarea.setSelectionRange(0, 0);
    }
  }

  /**
   * Clean up all resources
   */
  cleanup() {
    for (const textarea of this._textareas.values()) {
      mirrorDivService.cleanup(textarea);
    }
    this._textareas.clear();
    this._lineContainers.clear();
    this.container.innerHTML = '';
  }
}

export default TextareaRenderer;

// Export helper functions for use by other modules (e.g., tests, events)
export { charIndexToCodeUnits, codeUnitsToCharIndex };
