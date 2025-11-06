/**
 * Manual test for ornament copy/paste functionality
 * Tests the refactored cells-array pattern
 */

import { test, expect } from '@playwright/test';

test.describe('Ornament Copy/Paste - Cells-Array Pattern', () => {
  test('should copy and paste ornament using new cells-array pattern', async ({ page }) => {
    // 1. Load the page
    await page.goto('http://localhost:8080');
    await page.waitForLoadState('networkidle');

    const editor = page.locator('#notation-editor');
    await expect(editor).toBeVisible();

    // 2. Type a note: "1"
    await page.keyboard.type('1');
    await page.waitForTimeout(500);

    // 3. Create an ornament on the note manually via JavaScript
    //    (simulating what the ornament dialog would do)
    await page.evaluate(() => {
      const editor = window.MusicNotationApp.app().editor;
      const cursor = editor.theDocument.state.cursor;
      const line = editor.theDocument.lines[cursor.line];

      // Create ornament cells for "23" (two grace notes)
      const ornamentCells = [
        {
          char: '2',
          kind: { name: 'PitchedElement' },
          col: 0,
          octave: 0,
          accidental: { name: 'None' },
          ornament_indicator: { name: 'None' },
          slur_indicator: { name: 'None' },
          ornament: null
        },
        {
          char: '3',
          kind: { name: 'PitchedElement' },
          col: 1,
          octave: 0,
          accidental: { name: 'None' },
          ornament_indicator: { name: 'None' },
          slur_indicator: { name: 'None' },
          ornament: null
        }
      ];

      // Attach ornament to the first cell (the "1" note)
      line.cells[0].ornament = {
        cells: ornamentCells,
        placement: 'before'
      };

      // Re-render
      editor.renderAndUpdate();
    });

    await page.waitForTimeout(500);

    // 4. Verify ornament is attached
    const hasOrnament = await page.evaluate(() => {
      const editor = window.MusicNotationApp.app().editor;
      const cursor = editor.theDocument.state.cursor;
      const line = editor.theDocument.lines[cursor.line];
      return line.cells[0].ornament !== null;
    });
    expect(hasOrnament).toBe(true);

    // 5. Copy the ornament using the new cells-array pattern
    //    Cursor is at position 1 (after the "1"), so cell_index = cursor.col - 1 = 0
    const notation = await page.evaluate(() => {
      const editor = window.MusicNotationApp.app().editor;
      const cursor = editor.theDocument.state.cursor;
      const line = editor.theDocument.lines[cursor.line];

      const cellIndex = cursor.col - 1; // Effective selection logic
      return editor.wasmModule.copyOrnamentFromCell(line.cells, cellIndex);
    });

    console.log('Copied notation:', notation);
    expect(notation).toBe('23');

    // 6. Type another note: "4"
    await page.keyboard.type('4');
    await page.waitForTimeout(500);

    // 7. Paste the ornament to the new note using the new cells-array pattern
    //    Cursor is now at position 2 (after the "4"), so cell_index = cursor.col - 1 = 1
    await page.evaluate((copiedNotation) => {
      const editor = window.MusicNotationApp.app().editor;
      const cursor = editor.theDocument.state.cursor;
      const line = editor.theDocument.lines[cursor.line];

      const cellIndex = cursor.col - 1; // Effective selection logic
      const updatedCells = editor.wasmModule.pasteOrnamentToCell(
        line.cells,
        cellIndex,
        copiedNotation,
        'after'
      );

      // Update line.cells with modified array (cells-array pattern)
      line.cells = updatedCells;

      // Re-render
      editor.renderAndUpdate();
    }, notation);

    await page.waitForTimeout(500);

    // 8. Verify ornament is pasted to the second cell
    const secondCellOrnament = await page.evaluate(() => {
      const editor = window.MusicNotationApp.app().editor;
      const cursor = editor.theDocument.state.cursor;
      const line = editor.theDocument.lines[cursor.line];
      const ornament = line.cells[1].ornament;
      if (!ornament) return null;
      return {
        cellCount: ornament.cells.length,
        placement: ornament.placement,
        notation: ornament.cells.map(c => c.char).join('')
      };
    });

    expect(secondCellOrnament).not.toBeNull();
    expect(secondCellOrnament.notation).toBe('23');
    expect(secondCellOrnament.placement).toBe('after');
    expect(secondCellOrnament.cellCount).toBe(2);

    console.log('✅ Copy/paste successful!', secondCellOrnament);

    // 9. Test clear ornament
    await page.evaluate(() => {
      const editor = window.MusicNotationApp.app().editor;
      const cursor = editor.theDocument.state.cursor;
      const line = editor.theDocument.lines[cursor.line];

      const cellIndex = cursor.col - 1; // Target cell 1 (the "4")
      const updatedCells = editor.wasmModule.clearOrnamentFromCell(line.cells, cellIndex);

      line.cells = updatedCells;
      editor.renderAndUpdate();
    });

    await page.waitForTimeout(500);

    // 10. Verify ornament is cleared
    const ornamentCleared = await page.evaluate(() => {
      const editor = window.MusicNotationApp.app().editor;
      const cursor = editor.theDocument.state.cursor;
      const line = editor.theDocument.lines[cursor.line];
      return line.cells[1].ornament === null;
    });

    expect(ornamentCleared).toBe(true);
    console.log('✅ Clear ornament successful!');

    // 11. Test set placement
    //     First, re-paste the ornament
    await page.evaluate((copiedNotation) => {
      const editor = window.MusicNotationApp.app().editor;
      const cursor = editor.theDocument.state.cursor;
      const line = editor.theDocument.lines[cursor.line];

      const cellIndex = cursor.col - 1;
      const updatedCells = editor.wasmModule.pasteOrnamentToCell(
        line.cells,
        cellIndex,
        copiedNotation,
        'before'
      );

      line.cells = updatedCells;
      editor.renderAndUpdate();
    }, notation);

    await page.waitForTimeout(500);

    //     Now change placement to "after"
    await page.evaluate(() => {
      const editor = window.MusicNotationApp.app().editor;
      const cursor = editor.theDocument.state.cursor;
      const line = editor.theDocument.lines[cursor.line];

      const cellIndex = cursor.col - 1;
      const updatedCells = editor.wasmModule.setOrnamentPlacementOnCell(
        line.cells,
        cellIndex,
        'after'
      );

      line.cells = updatedCells;
      editor.renderAndUpdate();
    });

    await page.waitForTimeout(500);

    // 12. Verify placement changed
    const updatedPlacement = await page.evaluate(() => {
      const editor = window.MusicNotationApp.app().editor;
      const cursor = editor.theDocument.state.cursor;
      const line = editor.theDocument.lines[cursor.line];
      return line.cells[1].ornament?.placement;
    });

    expect(updatedPlacement).toBe('after');
    console.log('✅ Set placement successful!');
  });
});
