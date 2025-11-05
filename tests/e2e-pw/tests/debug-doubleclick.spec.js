import { test, expect } from '@playwright/test';

test('Debug double-click behavior', async ({ page }) => {
  // Listen to console messages
  page.on('console', msg => console.log('[BROWSER]:', msg.text()));

  // Listen to errors
  page.on('pageerror', error => console.log('[PAGE ERROR]:', error.message));

  await page.goto('http://localhost:8080');
  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();

  // Focus editor
  await editor.click();

  // Type a simple beat: "S--r"
  await page.keyboard.type('S--r');

  // Wait for rendering
  await page.waitForTimeout(500);

  // Check how many cells we have
  const cells = await page.locator('.char-cell').all();
  console.log(`Found ${cells.length} cells`);

  if (cells.length > 0) {
    // Get the position of the first cell
    const firstCell = cells[0];
    const box = await firstCell.boundingBox();
    console.log('First cell bounding box:', box);

    // Perform double-click on first cell
    console.log('Performing double-click on first cell...');
    await firstCell.dblclick();

    // Wait for any async operations
    await page.waitForTimeout(500);

    // Check selection state
    const selectedCells = await page.locator('.char-cell.selected').count();
    console.log(`After double-click: ${selectedCells} cells selected`);

    // Check if there's any selection in the document model
    const selectionInfo = await page.evaluate(() => {
      const editor = window.editorInstance;
      if (!editor || !editor.wasmModule) {
        return { error: 'No editor or wasmModule' };
      }
      try {
        const selection = editor.wasmModule.getSelectionInfo(editor.theDocument);
        return { success: true, selection };
      } catch (e) {
        return { error: e.message };
      }
    });
    console.log('Selection info from WASM:', JSON.stringify(selectionInfo, null, 2));
  }
});
