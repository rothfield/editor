/**
 * Test ornament application via manual selection
 * Demonstrates the selection-to-ornament feature by manually setting selection state
 */

import { test, expect } from '@playwright/test';

test.describe('Ornament via Manual Selection (until Shift+Arrow is implemented)', () => {
  test('manually set selection "23" from "123", press Alt+O to apply ornament to "1"', async ({ page }) => {
    await page.goto('/');
    const editor = page.locator('#notation-editor');
    await expect(editor).toBeVisible();
    await editor.click();

    // Type "123"
    await page.keyboard.type('123');
    await page.waitForTimeout(500);

    // Manually create selection from col 1 to col 3 (selecting "23")
    const selectionCreated = await page.evaluate(() => {
      const editor = window.MusicNotationApp.app().editor;

      // Use WASM to set selection
      // startSelection at col 1, then extend to col 3
      editor.wasmModule.startSelectionAt(0, 1);
      editor.wasmModule.extendSelectionTo(0, 3);

      // Verify selection was created
      const doc = editor.wasmModule.getDocumentSnapshot();
      return {
        cursor: doc.state.cursor,
        selection: doc.state.selection_manager?.current_selection,
        hasSelection: doc.state.selection_manager?.current_selection !== null &&
                     doc.state.selection_manager?.current_selection !== undefined
      };
    });

    console.log('Selection created:', selectionCreated);
    expect(selectionCreated.hasSelection).toBe(true);

    // Now press Alt+O to apply selected text as ornament
    await page.keyboard.press('Alt+o');
    await page.waitForTimeout(1000);

    // Verify ornament "23" was applied to note "1" (at col 0)
    const ornament = await page.evaluate(() => {
      const editor = window.MusicNotationApp.app().editor;
      return editor.wasmModule.getOrnamentAt(0, 0);
    });

    console.log('Ornament applied:', ornament);
    expect(ornament).not.toBe(null);
    expect(ornament.notation).toBe('23');

    console.log('✅ Manual selection "23" → ornament applied to "1"');
  });

  test('workflow simulation: type 456, manually select 56, apply to 4', async ({ page }) => {
    await page.goto('/');
    const editor = page.locator('#notation-editor');
    await expect(editor).toBeVisible();
    await editor.click();

    // Type "456"
    await page.keyboard.type('456');
    await page.waitForTimeout(500);

    // Manually select "56" (cols 1-3)
    await page.evaluate(() => {
      const editor = window.MusicNotationApp.app().editor;
      editor.wasmModule.startSelectionAt(0, 1);
      editor.wasmModule.extendSelectionTo(0, 3);
    });

    // Apply ornament
    await page.keyboard.press('Alt+o');
    await page.waitForTimeout(500);

    // Verify
    const ornament = await page.evaluate(() => {
      const editor = window.MusicNotationApp.app().editor;
      return editor.wasmModule.getOrnamentAt(0, 0);
    });

    expect(ornament.notation).toBe('56');

    console.log('✅ Ornament "56" applied to "4"');
  });

  test('verify selection-based ornament syncs to cells', async ({ page }) => {
    await page.goto('/');
    const editor = page.locator('#notation-editor');
    await expect(editor).toBeVisible();
    await editor.click();

    // Type, select, apply
    await page.keyboard.type('789');
    await page.evaluate(() => {
      const editor = window.MusicNotationApp.app().editor;
      editor.wasmModule.startSelectionAt(0, 1);
      editor.wasmModule.extendSelectionTo(0, 3);
    });
    await page.keyboard.press('Alt+o');
    await page.waitForTimeout(500);

    // Sync to cells
    const syncResult = await page.evaluate(() => {
      const editor = window.MusicNotationApp.app().editor;
      return editor.wasmModule.applyAnnotationOrnamentsToCells();
    });

    console.log('Sync result:', syncResult);
    expect(syncResult.success).toBe(true);
    expect(syncResult.ornaments_applied).toBe(1);

    // Verify cell has ornament cells
    const cell = await page.evaluate(() => {
      const editor = window.MusicNotationApp.app().editor;
      const doc = editor.wasmModule.getDocumentSnapshot();
      return {
        char: doc.lines[0].cells[0].char,
        ornamentCells: doc.lines[0].cells[0].ornament ?
          doc.lines[0].cells[0].ornament.cells.map(c => c.char) : null
      };
    });

    console.log('Cell with ornament:', cell);
    expect(cell.char).toBe('7');
    expect(cell.ornamentCells).toEqual(['8', '9']);

    console.log('✅ Selection-based ornament syncs correctly');
  });
});

test.describe('Future: Shift+Arrow Selection (not yet implemented)', () => {
  test.skip('type 123, Shift+Left×2 to select 23, Alt+O should add ornament', async ({ page }) => {
    // This test is skipped until Shift+Arrow key selection is implemented
    // in the keyboard handler

    await page.goto('/');
    const editor = page.locator('#notation-editor');
    await expect(editor).toBeVisible();
    await editor.click();

    await page.keyboard.type('123');

    // These should trigger selection, but currently don't
    await page.keyboard.press('Shift+ArrowLeft');
    await page.keyboard.press('Shift+ArrowLeft');

    await page.keyboard.press('Alt+o');

    // Would verify ornament applied
  });
});
