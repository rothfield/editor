import { test, expect } from '@playwright/test';

test('check glyph width cache values', async ({ page }) => {
  await page.goto('http://localhost:8080');

  // Wait for editor to load
  await page.waitForTimeout(2000);

  // Check the cache values
  const cacheInfo = await page.evaluate(() => {
    // Access the measurement service through the window
    const editor = window.editorInstance;
    if (!editor || !editor.measurementService) {
      return { error: 'Editor not found' };
    }

    const measurements = {};

    // Try to get widths for ASCII "1" and PUA U+E100
    const ascii1 = editor.measurementService.measureText('1');
    const pua1 = editor.measurementService.measureText(String.fromCodePoint(0xE100));

    // Also try to access the WASM function directly
    let wasmWidth = null;
    if (editor.wasmModule && editor.wasmModule.get_glyph_width) {
      const pua1Char = String.fromCodePoint(0xE100);
      wasmWidth = editor.wasmModule.get_glyph_width(pua1Char);
    }

    return {
      ascii1_js: ascii1,
      pua1_js: pua1,
      wasmWidth,
      hasMeasurementService: !!editor.measurementService,
      hasWasmModule: !!editor.wasmModule
    };
  });

  console.log('=== Cache Values ===');
  console.log(JSON.stringify(cacheInfo, null, 2));

  // Now type "11" and check the display list
  const editorRoot = page.locator('[data-testid="editor-root"]');
  await expect(editorRoot).toBeVisible();

  await editorRoot.click();
  await page.keyboard.type('11');

  // Wait for layout to update
  await page.waitForTimeout(500);

  // Check display list
  const displayListInfo = await page.evaluate(() => {
    const editor = window.editorInstance;
    if (!editor) return { error: 'No editor' };

    const displayList = editor.displayList;
    if (!displayList || !displayList.lines || displayList.lines.length === 0) {
      return { error: 'No display list' };
    }

    const firstLine = displayList.lines[0];
    const cells = firstLine.cells || [];

    return {
      cellCount: cells.length,
      cells: cells.map(c => ({
        char: c.char,
        charLength: c.char?.length || 0,
        codePoint: c.char ? c.char.codePointAt(0) : null,
        width: c.w,
        x: c.x
      }))
    };
  });

  console.log('=== Display List ===');
  console.log(JSON.stringify(displayListInfo, null, 2));
});
