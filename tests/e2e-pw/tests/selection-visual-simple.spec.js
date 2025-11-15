import { test, expect } from '@playwright/test';
import {
  waitForEditorReady,
  typeInEditor
} from '../utils/editor.helpers.js';

test.describe('Selection Visual Rendering (Simple Test)', () => {
  test.beforeEach(async ({ page }) => {
    // Minimal logging
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('[RENDERER]') || text.includes('[WASM]') || text.includes('selected')) {
        console.log('[BROWSER]', text);
      }
    });

    await page.goto('/');
    await waitForEditorReady(page);
  });

  test('should show "selected" class when selection is set programmatically', async ({ page }) => {
    // Type content
    await typeInEditor(page, '1 2 3 4 5');
    await page.waitForTimeout(200);

    // Set selection programmatically (no keyboard events involved)
    await page.evaluate(() => {
      const app = window.MusicNotationApp?.app();
      app.editor.wasmModule.setSelection(
        { line: 0, col: 0 },
        { line: 0, col: 5 }
      );
    });

    // Render with the selection
    await page.evaluate(() => {
      const app = window.MusicNotationApp?.app();
      app.editor.render();
    });

    await page.waitForTimeout(300);

    // Check if "selected" class appears in DOM
    const selectedCells = await page.evaluate(() => {
      const cells = document.querySelectorAll('.char-cell');
      return Array.from(cells).map(cell => ({
        hasSelectedClass: cell.classList.contains('selected'),
        classes: Array.from(cell.classList),
        col: cell.dataset.column
      }));
    });

    console.log('[TEST] Selected cells:', JSON.stringify(selectedCells.filter(c => c.hasSelectedClass), null, 2));

    // Should have "selected" class on cells with col 0-4
    const selectedCount = selectedCells.filter(c => c.hasSelectedClass).length;
    console.log('[TEST] Total cells with "selected" class:', selectedCount);

    expect(selectedCount).toBeGreaterThan(0);
  });
});
