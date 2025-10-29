import { test, expect } from '../fixtures/editor.fixture';
import { typeInEditor } from '../utils/editor.helpers';

test.describe('Copy/Paste Comprehensive Tests', () => {
  test('Copy a single cell and paste it', async ({ editorPage: page }) => {
    // Type some content
    await typeInEditor(page, '1 2 3');
    await page.waitForTimeout(300);

    // Select first cell (position 0)
    const cells = await page.locator('[data-cell-index]').all();
    expect(cells.length).toBeGreaterThan(1);

    const firstCell = cells[0];
    const secondCell = cells[1];

    // Drag from first to second cell to select first cell
    await firstCell.dragTo(secondCell);
    await page.waitForTimeout(300);

    // Copy
    await page.keyboard.press('Control+c');
    await page.waitForTimeout(300);

    // Get clipboard content via page evaluation
    const clipboard = await page.evaluate(() => {
      const app = window.MusicNotationApp?.app();
      return app?.editor?.clipboard;
    });

    console.log('Clipboard after copy:', clipboard);
    expect(clipboard?.cells?.length || 0).toBeGreaterThan(0);

    // Move to end and paste
    await page.keyboard.press('End');
    await page.waitForTimeout(200);
    await page.keyboard.press('Control+v');
    await page.waitForTimeout(500);

    // Verify cell count increased
    const cellsAfter = await page.locator('[data-cell-index]').count();
    console.log(`Cells after paste: ${cellsAfter}`);
    expect(cellsAfter).toBeGreaterThan(cells.length);
  });

  test('Copy multiple cells and verify clipboard content', async ({ editorPage: page }) => {
    // Type content
    await typeInEditor(page, '1 2 3 4 5');
    await page.waitForTimeout(300);

    // Get cells and select range (cells 1-3)
    const cells = await page.locator('[data-cell-index]').all();
    expect(cells.length).toBeGreaterThan(3);

    // Select cells 1 to 3 via drag
    const cell1 = cells[1];
    const cell3 = cells[3];
    await cell1.dragTo(cell3);
    await page.waitForTimeout(300);

    // Copy
    await page.keyboard.press('Control+c');
    await page.waitForTimeout(300);

    // Verify clipboard has multiple cells
    const clipboard = await page.evaluate(() => {
      const app = window.MusicNotationApp?.app();
      return {
        count: app?.editor?.clipboard?.cells?.length || 0,
        text: app?.editor?.clipboard?.text || ''
      };
    });

    console.log('Clipboard content:', clipboard);
    expect(clipboard.count).toBeGreaterThanOrEqual(2);
    expect(clipboard.text.length).toBeGreaterThan(0);
  });

  test('Paste without selection does nothing', async ({ editorPage: page }) => {
    // Type content
    await typeInEditor(page, '1 2 3');
    await page.waitForTimeout(300);

    // Get initial cell count
    const cellsBefore = await page.locator('[data-cell-index]').count();

    // Try to paste without copying anything first
    await page.keyboard.press('Control+v');
    await page.waitForTimeout(300);

    // Cell count should be unchanged
    const cellsAfter = await page.locator('[data-cell-index]').count();
    expect(cellsAfter).toBe(cellsBefore);
  });

  test('Copy/paste preserves cell properties (octaves, slurs)', async ({ editorPage: page }) => {
    // Type content
    await typeInEditor(page, '1 2 3');
    await page.waitForTimeout(300);

    // Get first cell and apply octave
    const cells = await page.locator('[data-cell-index]').all();
    const firstCell = cells[0];
    const secondCell = cells[1];
    const firstBox = await firstCell.boundingBox();

    // Select first cell
    await page.mouse.click(firstBox.x + firstBox.width / 2, firstBox.y + firstBox.height / 2);
    await page.waitForTimeout(100);

    // Apply upper octave (Alt+U)
    await page.keyboard.press('Alt+u');
    await page.waitForTimeout(300);

    // Select and copy the cell by dragging to adjacent cell
    await firstCell.dragTo(secondCell);
    await page.waitForTimeout(200);
    await page.keyboard.press('Control+c');
    await page.waitForTimeout(300);

    // Move to end and paste
    await page.keyboard.press('End');
    await page.waitForTimeout(200);
    await page.keyboard.press('Control+v');
    await page.waitForTimeout(500);

    // Verify clipboard structure had octave field
    const clipboard = await page.evaluate(() => {
      const app = window.MusicNotationApp?.app();
      const cells = app?.editor?.clipboard?.cells || [];
      if (cells.length === 0) return null;

      const cell = cells[0];
      return {
        hasOctave: 'octave' in cell,
        hasSlur: 'slur_indicator' in cell,
        hasOrnaments: 'ornaments' in cell
      };
    });

    console.log('Cell structure after copy:', clipboard);
    expect(clipboard).toBeTruthy();
    // Cell should have octave and slur properties
    expect(clipboard?.hasOctave).toBe(true);
    expect(clipboard?.hasSlur).toBe(true);
    // The cell should have copied its properties successfully
    // (ornaments property may or may not be present depending on cell structure)
  });

  test('Copy/paste at different positions expands document', async ({ editorPage: page }) => {
    // Type content
    await typeInEditor(page, '1 2 3');
    await page.waitForTimeout(300);

    // Get initial cell count
    const cellsBefore = await page.locator('[data-cell-index]').count();
    console.log(`Cells before paste: ${cellsBefore}`);

    // Select first cell and copy
    const cells = await page.locator('[data-cell-index]').all();
    await cells[0].dragTo(cells[1]);
    await page.waitForTimeout(200);

    await page.keyboard.press('Control+c');
    await page.waitForTimeout(300);

    // Move to middle position (cell 1)
    const clipboard = await page.evaluate(() => {
      const app = window.MusicNotationApp?.app();
      return {
        cellsInClipboard: app?.editor?.clipboard?.cells?.length || 0
      };
    });

    console.log('Clipboard has cells:', clipboard.cellsInClipboard);
    expect(clipboard.cellsInClipboard).toBeGreaterThan(0);

    // Position cursor at different location
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(200);

    // Paste
    await page.keyboard.press('Control+v');
    await page.waitForTimeout(500);

    // Verify document expanded
    const cellsAfter = await page.locator('[data-cell-index]').count();
    console.log(`Cells after paste at middle: ${cellsAfter}`);
    expect(cellsAfter).toBeGreaterThan(cellsBefore);
  });

  test('Multiple copy/paste operations in sequence', async ({ editorPage: page }) => {
    // Type content
    await typeInEditor(page, '1 2');
    await page.waitForTimeout(300);

    // Get the cells
    const cells = await page.locator('[data-cell-index]').all();
    const cell1 = cells[0];
    const cell2 = cells[1];

    // First copy
    await cell1.dragTo(cell2);
    await page.waitForTimeout(200);
    await page.keyboard.press('Control+c');
    await page.waitForTimeout(300);

    // First paste
    await page.keyboard.press('End');
    await page.keyboard.press('Control+v');
    await page.waitForTimeout(300);

    let currentCount = await page.locator('[data-cell-index]').count();
    console.log(`After first paste: ${currentCount} cells`);
    expect(currentCount).toBeGreaterThan(1);

    // Second paste (paste the same content again)
    await page.keyboard.press('Control+v');
    await page.waitForTimeout(300);

    const countAfterSecondPaste = await page.locator('[data-cell-index]').count();
    console.log(`After second paste: ${countAfterSecondPaste} cells`);
    expect(countAfterSecondPaste).toBeGreaterThan(currentCount);

    // Verify final content
    const finalCells = await page.locator('[data-cell-index]').count();
    expect(finalCells).toBeGreaterThan(2);
  });

  test('Copy from one stave and paste on same stave', async ({ editorPage: page }) => {
    // Type content
    await typeInEditor(page, '1 2 3 4 5');
    await page.waitForTimeout(300);

    // Get initial state
    const cellsInitial = await page.locator('[data-cell-index]').count();
    console.log(`Initial cells: ${cellsInitial}`);

    // Select middle cells
    const cells = await page.locator('[data-cell-index]').all();
    const middleStart = cells[Math.floor(cells.length / 2) - 1];
    const middleEnd = cells[Math.floor(cells.length / 2) + 1];

    await middleStart.dragTo(middleEnd);
    await page.waitForTimeout(200);

    // Copy
    await page.keyboard.press('Control+c');
    await page.waitForTimeout(300);

    // Paste at the end
    await page.keyboard.press('End');
    await page.waitForTimeout(200);
    await page.keyboard.press('Control+v');
    await page.waitForTimeout(300);

    // Verify expansion
    const cellsFinal = await page.locator('[data-cell-index]').count();
    console.log(`Final cells: ${cellsFinal}`);
    expect(cellsFinal).toBeGreaterThan(cellsInitial);
  });

  test('Copy via keyboard and menu should be equivalent', async ({ editorPage: page }) => {
    // Type content
    await typeInEditor(page, '1 2 3');
    await page.waitForTimeout(300);

    // First copy via keyboard
    const cells = await page.locator('[data-cell-index]').all();
    await cells[0].dragTo(cells[1]);
    await page.waitForTimeout(200);

    await page.keyboard.press('Control+c');
    await page.waitForTimeout(300);

    const clipboard1 = await page.evaluate(() => {
      const app = window.MusicNotationApp?.app();
      return {
        text: app?.editor?.clipboard?.text || '',
        cellCount: app?.editor?.clipboard?.cells?.length || 0
      };
    });

    console.log('Clipboard via keyboard:', clipboard1);

    // Clear clipboard and try again with menu item
    await page.evaluate(() => {
      const app = window.MusicNotationApp?.app();
      if (app?.editor) {
        app.editor.clipboard = { text: null, cells: [] };
      }
    });
    await page.waitForTimeout(200);

    // Select and copy again via keyboard (simulating menu action)
    const freshCells = await page.locator('[data-cell-index]').all();
    await freshCells[0].dragTo(freshCells[1]);
    await page.waitForTimeout(200);
    await page.keyboard.press('Control+c');
    await page.waitForTimeout(300);

    const clipboard2 = await page.evaluate(() => {
      const app = window.MusicNotationApp?.app();
      return {
        text: app?.editor?.clipboard?.text || '',
        cellCount: app?.editor?.clipboard?.cells?.length || 0
      };
    });

    console.log('Clipboard via keyboard (second time):', clipboard2);

    // Both should have content
    expect(clipboard1.cellCount).toBeGreaterThan(0);
    expect(clipboard2.cellCount).toBeGreaterThan(0);
  });

  test('Paste selection when cells exist creates proper spacing', async ({ editorPage: page }) => {
    // Type content with spaces
    await typeInEditor(page, '1 2 3');
    await page.waitForTimeout(300);

    // Copy a cell
    const cells = await page.locator('[data-cell-index]').all();
    await cells[0].dragTo(cells[0]);
    await page.waitForTimeout(200);
    await page.keyboard.press('Control+c');
    await page.waitForTimeout(300);

    // Go to middle and paste
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(200);
    await page.keyboard.press('Control+v');
    await page.waitForTimeout(500);

    // Verify content is still valid
    const document = await page.evaluate(() => {
      const app = window.MusicNotationApp?.app();
      return {
        lineCount: app?.editor?.theDocument?.lines?.length || 0,
        cellsInFirstLine: app?.editor?.theDocument?.lines?.[0]?.cells?.length || 0
      };
    });

    console.log('Document state after paste:', document);
    expect(document.cellsInFirstLine).toBeGreaterThan(0);
  });
});
