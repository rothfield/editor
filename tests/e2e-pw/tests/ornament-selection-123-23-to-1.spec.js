/**
 * E2E Test: Exact workflow for applying ornament via selection
 * Type "123", select "23" with Shift+Left×2, press Alt+O
 * Should apply ornament "23" to note "1"
 */

import { test, expect } from '@playwright/test';

test.describe('Ornament via Selection: 123 → select 23 → Alt+O', () => {
  test('type 123, Shift+Left×2 to select 23, Alt+O should add ornament 23 to note 1', async ({ page }) => {
    // Navigate to editor
    await page.goto('/');
    const editor = page.locator('#notation-editor');
    await expect(editor).toBeVisible();
    await editor.click();

    // Step 1: Type "123"
    console.log('Step 1: Typing "123"...');
    await page.keyboard.type('123');
    await page.waitForTimeout(500);

    // Verify text was typed
    const docAfterTyping = await page.evaluate(() => {
      const editor = window.MusicNotationApp.app().editor;
      const doc = editor.wasmModule.getDocumentSnapshot();
      return {
        lineCount: doc.lines.length,
        cellCount: doc.lines[0].cells.length,
        cells: doc.lines[0].cells.map(c => c.char),
        cursor: doc.state.cursor
      };
    });

    console.log('After typing "123":', docAfterTyping);
    expect(docAfterTyping.cells).toEqual(['1', '2', '3']);
    expect(docAfterTyping.cursor.col).toBe(3); // Cursor after "3"

    // Step 2: Select "23" with Shift+Left×2
    console.log('Step 2: Selecting "23" with Shift+Left×2...');
    await page.keyboard.press('Shift+ArrowLeft');
    await page.keyboard.press('Shift+ArrowLeft');
    await page.waitForTimeout(300);

    // Verify selection
    const selectionState = await page.evaluate(() => {
      const editor = window.MusicNotationApp.app().editor;
      const doc = editor.wasmModule.getDocumentSnapshot();
      return {
        cursor: doc.state.cursor,
        selection: doc.state.selection_manager?.current_selection,
        hasSelection: doc.state.selection_manager?.current_selection !== null &&
                     doc.state.selection_manager?.current_selection !== undefined
      };
    });

    console.log('Selection state:', selectionState);
    expect(selectionState.hasSelection).toBe(true);
    expect(selectionState.cursor.col).toBe(1); // Cursor moved to col 1
    expect(selectionState.selection.anchor.col).toBe(3); // Anchor at original position
    expect(selectionState.selection.head.col).toBe(1); // Head at current position

    // This means selection is from col 1 to col 3, which includes "23"

    // Step 3: Press Alt+O to apply selection as ornament
    console.log('Step 3: Pressing Alt+O to apply ornament...');
    await page.keyboard.press('Alt+o');
    await page.waitForTimeout(1000); // Give time for ornament to apply and render

    // Step 4: Verify ornament "23" was applied to note "1" (at col 0)
    const ornamentResult = await page.evaluate(() => {
      const editor = window.MusicNotationApp.app().editor;
      return editor.wasmModule.getOrnamentAt(0, 0);
    });

    console.log('Ornament applied to note 1:', ornamentResult);
    expect(ornamentResult).not.toBe(null);
    expect(ornamentResult.notation).toBe('23');
    expect(ornamentResult.placement).toBe('after');

    // Verify the document structure
    const finalDoc = await page.evaluate(() => {
      const editor = window.MusicNotationApp.app().editor;
      const doc = editor.wasmModule.getDocumentSnapshot();
      return {
        cells: doc.lines[0].cells.map(c => c.char),
        ornaments: editor.wasmModule.getOrnamentsForLine(0)
      };
    });

    console.log('Final document state:', finalDoc);
    expect(finalDoc.ornaments.length).toBe(1);
    expect(finalDoc.ornaments[0].notation).toBe('23');
    expect(finalDoc.ornaments[0].col).toBe(0); // Ornament on note at col 0

    console.log('✅ SUCCESS: Typed "123", selected "23", pressed Alt+O, ornament "23" applied to "1"');
  });

  test('verify ornament syncs to cells and exports correctly', async ({ page }) => {
    await page.goto('/');
    const editor = page.locator('#notation-editor');
    await expect(editor).toBeVisible();
    await editor.click();

    // Type and select
    await page.keyboard.type('123');
    await page.keyboard.press('Shift+ArrowLeft');
    await page.keyboard.press('Shift+ArrowLeft');
    await page.keyboard.press('Alt+o');
    await page.waitForTimeout(1000);

    // Trigger sync
    const syncResult = await page.evaluate(() => {
      const editor = window.MusicNotationApp.app().editor;
      return editor.wasmModule.applyAnnotationOrnamentsToCells();
    });

    console.log('Sync result:', syncResult);
    expect(syncResult.success).toBe(true);
    expect(syncResult.ornaments_applied).toBe(1);

    // Check cell has ornament
    const cellWithOrnament = await page.evaluate(() => {
      const editor = window.MusicNotationApp.app().editor;
      const doc = editor.wasmModule.getDocumentSnapshot();
      const cell = doc.lines[0].cells[0];

      return {
        char: cell.char,
        hasOrnament: cell.ornament !== null && cell.ornament !== undefined,
        ornamentCells: cell.ornament ? cell.ornament.cells.map(c => c.char) : null
      };
    });

    console.log('Cell with ornament:', cellWithOrnament);
    expect(cellWithOrnament.char).toBe('1');
    expect(cellWithOrnament.hasOrnament).toBe(true);
    expect(cellWithOrnament.ornamentCells).toEqual(['2', '3']);

    console.log('✅ Ornament synced to cells correctly');
  });

  test('multiple applications: 456 → select 56 → apply to 4, then 789 → select 89 → apply to 7', async ({ page }) => {
    await page.goto('/');
    const editor = page.locator('#notation-editor');
    await expect(editor).toBeVisible();
    await editor.click();

    // First ornament: 456 → 56 on 4
    console.log('First ornament: 456 → select 56 → apply to 4');
    await page.keyboard.type('456');
    await page.keyboard.press('Shift+ArrowLeft');
    await page.keyboard.press('Shift+ArrowLeft');
    await page.keyboard.press('Alt+o');
    await page.waitForTimeout(500);

    // Add space and second note
    await page.keyboard.press('End');
    await page.keyboard.type(' 789');
    await page.keyboard.press('Shift+ArrowLeft');
    await page.keyboard.press('Shift+ArrowLeft');
    await page.keyboard.press('Alt+o');
    await page.waitForTimeout(500);

    // Verify both ornaments
    const ornaments = await page.evaluate(() => {
      const editor = window.MusicNotationApp.app().editor;
      return editor.wasmModule.getOrnamentsForLine(0);
    });

    console.log('All ornaments:', ornaments);
    expect(ornaments.length).toBe(2);
    expect(ornaments[0].notation).toBe('56');
    expect(ornaments[0].col).toBe(0); // On "4"
    expect(ornaments[1].notation).toBe('89');
    expect(ornaments[1].col).toBe(4); // On "7" (after space)

    console.log('✅ Multiple selection-based ornaments work correctly');
  });
});
