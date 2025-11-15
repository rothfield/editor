import { test, expect } from '@playwright/test';
import {
  waitForEditorReady,
  typeInEditor
} from '../utils/editor.helpers.js';

test.describe('Visual Highlight After Edit Operations', () => {
  test.beforeEach(async ({ page }) => {
    // Capture ALL browser console logs to debug
    page.on('console', msg => {
      const text = msg.text();
      // Log everything to see what's coming through
      console.log('[BROWSER]', text);
    });

    await page.goto('/');
    await waitForEditorReady(page);
  });

  test('should show visual highlight after Alt+S slur operation', async ({ page }) => {
    // Type content
    await typeInEditor(page, '1 2 3 4 5');
    await page.waitForTimeout(200);

    // Check document structure before selection
    const docBefore = await page.evaluate(() => {
      const app = window.MusicNotationApp?.app();
      const doc = app.editor.getDocument();
      return {
        line0: doc.lines[0].cells.map((c, i) => ({
          index: i,
          char: c.char,
          col: c.col,
          kind: c.kind
        }))
      };
    });
    console.log('[Visual Test] Document cells:', JSON.stringify(docBefore, null, 2));

    // Select range
    await page.evaluate(() => {
      const app = window.MusicNotationApp?.app();
      app.editor.wasmModule.setSelection(
        { line: 0, col: 0 },
        { line: 0, col: 5 }
      );
      app.editor.render();
    });
    await page.waitForTimeout(200);

    // Check selection state
    const selectionInfo = await page.evaluate(() => {
      const app = window.MusicNotationApp?.app();
      return app.editor.wasmModule.getSelectionInfo();
    });
    console.log('[Visual Test] Selection info:', JSON.stringify(selectionInfo, null, 2));

    // Apply slur
    console.log(`[TEST @ ${Date.now()}] Pressing Alt+S...`);
    await page.keyboard.press('Alt+s');
    await page.waitForTimeout(300);
    console.log(`[TEST @ ${Date.now()}] After 300ms wait`);

    // Check selection state AFTER Alt+S
    const selectionAfter = await page.evaluate(() => {
      const app = window.MusicNotationApp?.app();
      return app.editor.wasmModule.getSelectionInfo();
    });
    console.log('[Visual Test] Selection AFTER Alt+S:', JSON.stringify(selectionAfter, null, 2));

    // Check if cells have "selected" class in DOM
    const selectedCells = await page.evaluate(() => {
      const cells = document.querySelectorAll('.char-cell');
      return Array.from(cells).map(cell => ({
        hasSelectedClass: cell.classList.contains('selected'),
        classes: Array.from(cell.classList),
        index: cell.dataset.cellIndex
      }));
    });

    console.log('[Visual Test] Cells after Alt+S:', JSON.stringify(selectedCells, null, 2));

    // Count how many cells have the "selected" class
    const selectedCount = selectedCells.filter(c => c.hasSelectedClass).length;
    console.log('[Visual Test] Selected cells count:', selectedCount);

    // Should have visual highlights (selected class) on cells 0-4
    expect(selectedCount).toBeGreaterThan(0);
  });
});
