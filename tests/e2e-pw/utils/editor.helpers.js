/**
 * Helper utilities for testing the Music Notation Editor
 */

/**
 * Get the current state of the editor document
 */
export async function getEditorState(page) {
  return await page.evaluate(() => {
    if (!window.MusicNotationApp || !window.MusicNotationApp.app()) {
      throw new Error('Music editor not initialized');
    }

    const app = window.MusicNotationApp.app();
    const editor = app.editor;
    const doc = editor?.theDocument || editor?.document;

    return {
      lineCount: doc?.lines?.length || 0,
      lines: doc?.lines?.map((line) => ({
        content: line.map((cell) => cell.char || '').join(''),
      })) || [],
      cursorPosition: editor?.getCursorPosition?.(),
      hasFocus: document.activeElement?.id === 'notation-editor',
    };
  });
}

/**
 * Parse input sequence supporting special keys
 * Examples: "hello", "1 2 3", "{Enter}", "{ArrowLeft}3", "hello{Enter}{ArrowLeft}world"
 * Special keys: Enter, ArrowLeft, ArrowRight, ArrowUp, ArrowDown, Backspace, Delete, Home, End, Tab, Escape
 */
function parseInputSequence(input) {
  const sequence = [];
  let i = 0;

  while (i < input.length) {
    if (input[i] === '{') {
      // Find matching }
      const endIdx = input.indexOf('}', i);
      if (endIdx === -1) break;

      const keyName = input.substring(i + 1, endIdx);
      sequence.push({ type: 'key', name: keyName });
      i = endIdx + 1;
    } else {
      // Regular character
      sequence.push({ type: 'char', value: input[i] });
      i++;
    }
  }

  return sequence;
}

/**
 * Type text into the editor with optional delay, supporting special keys
 * Examples: typeInEditor(page, "1{ArrowLeft}2", { delay: 50 })
 */
export async function typeInEditor(page, text, options = {}) {
  const { delay = 0 } = options;
  await page.focus('#notation-editor');

  const sequence = parseInputSequence(text);

  for (const item of sequence) {
    if (item.type === 'key') {
      await page.keyboard.press(item.name);
    } else {
      await page.keyboard.type(item.value);
    }

    if (delay > 0) {
      await page.waitForTimeout(delay);
    }
  }
}

/**
 * Clear all content in the editor
 */
export async function clearEditor(page) {
  await page.focus('#notation-editor');
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(50);
}

/**
 * Get the cursor position in the editor
 */
export async function getCursorPosition(page) {
  return await page.evaluate(() => {
    const app = window.MusicNotationApp?.app();
    return app?.editor?.getCursorPosition?.();
  });
}

/**
 * Move cursor to a specific position
 */
export async function setCursorPosition(page, line, lane, position) {
  await page.evaluate(
    ([l, la, p]) => {
      const app = window.MusicNotationApp?.app();
      if (app?.editor?.setCursorPosition) {
        app.editor.setCursorPosition(l, la, p);
      }
    },
    [line, lane, position]
  );
}

/**
 * Get the rendered content as text
 */
export async function getRenderedContent(page) {
  return await page.evaluate(() => {
    // Try multiple selectors to find rendered content
    let content = '';

    // Method 1: Get from notation-line divs with char-cells inside
    const notationLines = document.querySelectorAll('.notation-line');
    if (notationLines.length > 0) {
      content = Array.from(notationLines)
        .map((line) => {
          const cells = line.querySelectorAll('.char-cell');
          return Array.from(cells)
            .map((cell) => cell.textContent || '')
            .join('');
        })
        .join('\n');
    }

    // Fallback: Get from data-line-index divs
    if (!content) {
      const lines = document.querySelectorAll('[data-line-index]');
      if (lines.length > 0) {
        content = Array.from(lines)
          .map((line) => {
            const cells = line.querySelectorAll('[data-cell-index]');
            return Array.from(cells)
              .map((cell) => cell.textContent || '')
              .join('');
          })
          .join('\n');
      }
    }

    return content;
  });
}

/**
 * Wait for editor to be ready
 */
export async function waitForEditorReady(page, options = {}) {
  const { timeout = 10000 } = options;
  await page.waitForFunction(
    () => typeof window.MusicNotationApp !== 'undefined' && window.MusicNotationApp.app() !== null,
    { timeout }
  );
}

/**
 * Take a labeled screenshot for debugging
 */
export async function takeScreenshot(page, name) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `test-${name}-${timestamp}.png`;
  await page.screenshot({ path: filename, fullPage: true });
  console.log(`Screenshot saved: ${filename}`);
  return filename;
}

/**
 * Press arrow keys to move cursor
 */
export async function moveCursor(page, direction, count = 1) {
  const keyMap = {
    up: 'ArrowUp',
    down: 'ArrowDown',
    left: 'ArrowLeft',
    right: 'ArrowRight',
  };

  if (!keyMap[direction]) {
    throw new Error(`Invalid direction: ${direction}`);
  }

  for (let i = 0; i < count; i++) {
    await page.keyboard.press(keyMap[direction]);
    await page.waitForTimeout(50);
  }
}

/**
 * Simulate Return/Enter key press
 */
export async function pressReturn(page) {
  await page.keyboard.press('Enter');
  await page.waitForTimeout(100);
}

/**
 * Select all text in editor
 */
export async function selectAll(page) {
  await page.keyboard.press('Control+a');
  await page.waitForTimeout(50);
}

/**
 * Copy selected text
 */
export async function copy(page) {
  await page.keyboard.press('Control+c');
  await page.waitForTimeout(50);
}

/**
 * Paste text
 */
export async function paste(page) {
  await page.keyboard.press('Control+v');
  await page.waitForTimeout(50);
}

/**
 * Get all console messages that occurred during test
 */
export async function captureConsoleMessages(page) {
  const messages = [];
  page.on('console', (msg) => {
    messages.push({
      type: msg.type(),
      text: msg.text(),
    });
  });
  return messages;
}

/**
 * Assert editor contains specific text (case-insensitive)
 */
export async function assertEditorContains(page, text) {
  const content = await getRenderedContent(page);
  if (!content.toLowerCase().includes(text.toLowerCase())) {
    throw new Error(`Editor does not contain "${text}". Current content:\n${content}`);
  }
}

/**
 * Wait for a specific character to appear in the editor
 */
export async function waitForCharacter(page, char, options = {}) {
  const { timeout = 5000 } = options;
  await page.waitForFunction(
    (searchChar) => {
      const content = Array.from(document.querySelectorAll('[data-cell-index]'))
        .map((cell) => cell.textContent)
        .join('');
      return content.includes(searchChar);
    },
    char,
    { timeout }
  );
}

/**
 * Get the current line count
 */
export async function getLineCount(page) {
  return await page.evaluate(() => {
    const app = window.MusicNotationApp?.app();
    return app?.editor?.document?.lines?.length || 0;
  });
}

/**
 * Wait for a specific line count
 */
export async function waitForLineCount(page, count, options = {}) {
  const { timeout = 5000 } = options;
  await page.waitForFunction(
    (targetCount) => {
      const app = window.MusicNotationApp?.app();
      return (app?.editor?.document?.lines?.length || 0) === targetCount;
    },
    count,
    { timeout }
  );
}

/**
 * Get the current pitch system
 * @returns {Object} Pitch system info { value, name }
 *   - 0: Unknown
 *   - 1: Number (default)
 *   - 2: Western
 *   - 3: Sargam
 *   - 4: Bhatkhande
 *   - 5: Tabla
 */
export async function getPitchSystem(page) {
  return await page.evaluate(() => {
    const app = window.MusicNotationApp?.app();
    if (!app?.editor) {
      throw new Error('Editor not initialized');
    }

    const editor = app.editor;
    const pitchSystemValue = editor.getCurrentPitchSystem?.() || 1;
    const pitchSystemNames = {
      0: 'Unknown',
      1: 'Number',
      2: 'Western',
      3: 'Sargam',
      4: 'Bhatkhande',
      5: 'Tabla'
    };

    return {
      value: pitchSystemValue,
      name: pitchSystemNames[pitchSystemValue] || 'Unknown'
    };
  });
}
