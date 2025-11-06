/**
 * Quick smoke test for ornament copy/paste functions
 * Verifies that the new cells-array pattern functions exist
 */

import { test, expect } from '@playwright/test';

test.describe('Ornament Copy/Paste - Function Availability', () => {
  test('should have all four ornament copy/paste functions available', async ({ page }) => {
    // 1. Load the page
    await page.goto('http://localhost:8080');
    await page.waitForLoadState('networkidle');

    const editor = page.locator('#notation-editor');
    await expect(editor).toBeVisible();

    // 2. Check that all ornament functions are available in WASM module
    const functionsAvailable = await page.evaluate(() => {
      const editor = window.MusicNotationApp.app().editor;
      const wasm = editor.wasmModule;

      return {
        copyOrnamentFromCell: typeof wasm.copyOrnamentFromCell === 'function',
        pasteOrnamentToCell: typeof wasm.pasteOrnamentToCell === 'function',
        clearOrnamentFromCell: typeof wasm.clearOrnamentFromCell === 'function',
        setOrnamentPlacementOnCell: typeof wasm.setOrnamentPlacementOnCell === 'function'
      };
    });

    console.log('WASM ornament functions availability:', functionsAvailable);

    expect(functionsAvailable.copyOrnamentFromCell).toBe(true);
    expect(functionsAvailable.pasteOrnamentToCell).toBe(true);
    expect(functionsAvailable.clearOrnamentFromCell).toBe(true);
    expect(functionsAvailable.setOrnamentPlacementOnCell).toBe(true);

    console.log('✅ All ornament copy/paste functions are available!');
  });

  test('cursor positioning logic - cell_index = cursor.col - 1', async ({ page }) => {
    // This test verifies the "effective selection" logic works correctly
    await page.goto('http://localhost:8080');
    await page.waitForLoadState('networkidle');

    const editor = page.locator('#notation-editor');
    await expect(editor).toBeVisible();

    // Type "123"
    await page.keyboard.type('123');
    await page.waitForTimeout(500);

    // Verify cursor position and calculate target cell index
    const cursorInfo = await page.evaluate(() => {
      const editor = window.MusicNotationApp.app().editor;
      const cursor = editor.theDocument.state.cursor;
      const line = editor.theDocument.lines[cursor.line];

      return {
        cursorCol: cursor.col,
        cellsLength: line.cells.length,
        targetCellIndex: cursor.col - 1,
        targetCellChar: line.cells[cursor.col - 1]?.char
      };
    });

    console.log('Cursor info:', cursorInfo);

    // After typing "123", cursor should be at col 3
    expect(cursorInfo.cursorCol).toBe(3);

    // Target cell index should be cursor.col - 1 = 2
    expect(cursorInfo.targetCellIndex).toBe(2);

    // Target cell should be "3" (the last character we typed)
    expect(cursorInfo.targetCellChar).toBe('3');

    console.log('✅ Cursor positioning logic correct: cell_index = cursor.col - 1');
  });
});
