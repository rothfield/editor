import { test, expect } from '@playwright/test';

/**
 * Cursor positioning after accidental composite glyphs
 *
 * Verifies that cursor position can be correctly queried from JavaScript after typing
 * sequences containing accidental composite glyphs.
 *
 * Expected behavior:
 * - "1#23" creates 3 cells (not 4!):
 *   • Cell 0: "1#" (single composite glyph U+E1F0)
 *   • Cell 1: "2"
 *   • Cell 2: "3"
 * - Cursor should be at column 3 (after the 3rd cell)
 * - JavaScript can query cursor position via window.musicEditor.wasmModule.getCaretInfo()
 */
test.describe('Cursor Position After Accidentals', () => {
  test('Cursor should be after "3" when typing "1#23"', async ({ page }) => {
    await page.goto('/');

    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible();

    await editor.click();

    // Type accidental sequence
    await page.keyboard.type('1#23');
    await page.waitForTimeout(200);

    // Check rendered cells
    const cells = await page.locator('.char-cell').all();
    console.log(`\nNumber of cells: ${cells.length}`);

    // CRITICAL: "1#23" should create exactly 3 cells, not 4!
    // "1#" becomes ONE composite glyph cell, then "2" and "3"
    expect(cells.length).toBe(3);

    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      const text = await cell.textContent();
      const codepoint = text.charCodeAt(0);
      const col = await cell.getAttribute('data-column');

      console.log(`Cell ${i}: "${text}" (U+${codepoint.toString(16).toUpperCase().padStart(4, '0')}) at column ${col}`);
    }

    // Verify first cell is composite glyph
    const firstCellText = await cells[0].textContent();
    expect(firstCellText.charCodeAt(0)).toBe(0xE1F0); // 1# composite glyph

    // Verify second cell is "2"
    const secondCellText = await cells[1].textContent();
    expect(secondCellText).toBe('2');

    // Verify third cell is "3"
    const thirdCellText = await cells[2].textContent();
    expect(thirdCellText).toBe('3');

    // Get cursor position from WASM state
    const cursorInfo = await page.evaluate(() => {
      const editor = window.musicEditor;
      if (editor && editor.wasmModule && editor.wasmModule.getCaretInfo) {
        return editor.wasmModule.getCaretInfo();
      }
      return null;
    });

    console.log(`\nCursor position from WASM: ${JSON.stringify(cursorInfo)}`);

    // Check visual cursor position
    const cursorIndicator = page.locator('.cursor-indicator');
    const cursorVisible = await cursorIndicator.isVisible().catch(() => false);

    if (cursorVisible) {
      // Get the cursor's left position from its style
      const cursorLeft = await cursorIndicator.evaluate(el => {
        return parseFloat(el.style.left);
      });
      console.log(`Visual cursor left position: ${cursorLeft}px`);

      // Calculate expected cursor position using editor's cellColToPixel()
      // (NEW: direct cell column → pixel, one cell = one glyph model)
      const expectedCursorLeft = await page.evaluate(() => {
        const editor = window.musicEditor;
        if (editor && editor.cellColToPixel) {
          const cellCol = editor.getCursorPosition(); // Gets cell column from cursor.col
          return editor.cellColToPixel(cellCol);
        }
        return null;
      });

      console.log(`Expected cursor position (from WASM): ${expectedCursorLeft}px`);

      // Cursor should be positioned at the expected location
      if (expectedCursorLeft !== null) {
        expect(cursorLeft).toBeCloseTo(expectedCursorLeft, 0);
      } else {
        console.log('⚠ Could not calculate expected cursor position from WASM');
      }
    } else {
      console.log('⚠ Visual cursor indicator not found');
    }

    // Alternative: Check if typing continues at the right position
    await page.keyboard.type('4');
    await page.waitForTimeout(100);

    const cellsAfter = await page.locator('.char-cell').all();
    console.log(`\nAfter typing "4", cell count: ${cellsAfter.length}`);

    // "1#234" should create 4 cells: 1# (ONE composite cell), 2, 3, 4
    expect(cellsAfter.length).toBe(4);

    // Last cell should be "4"
    const lastCell = cellsAfter[cellsAfter.length - 1];
    const lastText = await lastCell.textContent();
    console.log(`Last cell text: "${lastText}"`);
    expect(lastText).toBe('4');
  });

  test('Cursor column increments correctly through accidental sequence', async ({ page }) => {
    await page.goto('/');

    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible();
    await editor.click();

    const sequence = ['1', '#', '2', '3'];
    // After "1": cursor at col 1 (after the "1")
    // After "#": "1#" merges into ONE cell at col 0, cursor stays at col 1
    // After "2": "2" at col 1, cursor moves to col 2
    // After "3": "3" at col 2, cursor moves to col 3
    const expectedColumns = [1, 1, 2, 3];

    for (let i = 0; i < sequence.length; i++) {
      await page.keyboard.type(sequence[i]);
      await page.waitForTimeout(50);

      const cursorInfo = await page.evaluate(() => {
        const editor = window.musicEditor;
        if (editor && editor.wasmModule && editor.wasmModule.getCaretInfo) {
          return editor.wasmModule.getCaretInfo();
        }
        return null;
      });

      console.log(`After typing "${sequence[i]}": cursor at column ${cursorInfo?.caret?.col} (expected: ${expectedColumns[i]})`);

      // Cursor column should match expected progression
      if (cursorInfo?.caret?.col !== undefined) {
        expect(cursorInfo.caret.col).toBe(expectedColumns[i]);
      }
    }
  });

  test('Backspace from end of "1#23" positions cursor correctly', async ({ page }) => {
    await page.goto('/');

    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible();
    await editor.click();

    await page.keyboard.type('1#23');
    await page.waitForTimeout(200);

    // Backspace once (should delete "3")
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(100);

    const cells = await page.locator('.char-cell').all();
    console.log(`\nAfter backspace, cell count: ${cells.length}`);
    expect(cells.length).toBe(2); // Should have 1# and 2

    // Cursor should be after "2" (column 2)
    const cursorInfo = await page.evaluate(() => {
      const editor = window.musicEditor;
      if (editor && editor.wasmModule && editor.wasmModule.getCaretInfo) {
        return editor.wasmModule.getCaretInfo();
      }
      return null;
    });

    console.log(`Cursor position after backspace: ${JSON.stringify(cursorInfo)}`);

    // Cursor should be at column 2 (after "2")
    expect(cursorInfo?.caret?.col).toBe(2);
  });

  test('Arrow right navigates correctly through "1#23"', async ({ page }) => {
    await page.goto('/');

    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible();
    await editor.click();

    await page.keyboard.type('1#23');
    await page.waitForTimeout(200);

    // Move cursor to start
    await page.keyboard.press('Home');
    await page.waitForTimeout(100);

    // Press right arrow and check positions
    // "1#23" creates 3 cells: 1# (col 0), 2 (col 1), 3 (col 2)
    // Arrow right should move: col 0 → 1 → 2 → 3
    const positions = [];

    for (let i = 0; i < 4; i++) {
      const cursorInfo = await page.evaluate(() => {
        const editor = window.musicEditor;
        if (editor && editor.wasmModule && editor.wasmModule.getCaretInfo) {
          return editor.wasmModule.getCaretInfo();
        }
        return null;
      });

      positions.push(cursorInfo?.caret?.col);
      console.log(`Position ${i}: column ${cursorInfo?.caret?.col}`);

      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(50);
    }

    // Expected: [0, 1, 2, 3]
    // - Position 0: cursor at col 0 (before 1# cell)
    // - Position 1: cursor at col 1 (after 1# cell, before 2 cell)
    // - Position 2: cursor at col 2 (after 2 cell, before 3 cell)
    // - Position 3: cursor at col 3 (after 3 cell, at end)
    console.log(`Positions: ${positions.join(', ')}`);
    if (positions.every(p => p !== undefined)) {
      expect(positions).toEqual([0, 1, 2, 3]);
    }
  });
});
