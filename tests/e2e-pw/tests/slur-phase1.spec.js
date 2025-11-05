import { test, expect } from '@playwright/test';

/**
 * Test Phase 1 slur API (WASM-first with internal DOCUMENT)
 */
test('Slur: Apply and toggle using new Phase 1 API', async ({ page }) => {
  // Capture console messages for debugging
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('ERROR') || text.includes('Failed') || text.includes('slur') ||
        text.includes('WASM') || text.includes('Phase 1')) {
      console.log(`[BROWSER] ${text}`);
    }
  });

  // Capture page errors
  page.on('pageerror', err => {
    console.log(`[PAGE ERROR] ${err.message}`);
  });

  await page.goto('/');

  // Wait for editor to be ready
  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();

  console.log('1. Editor visible, typing test content...');
  await editor.click();
  await page.keyboard.type('S r G m');

  console.log('2. Waiting for content to render...');
  await page.waitForTimeout(500);

  // Check document state
  const docState1 = await page.evaluate(() => {
    const app = window.MusicNotationApp?.app();
    const doc = app?.editor?.theDocument;
    return {
      lineCount: doc?.lines?.length || 0,
      line0CellCount: doc?.lines?.[0]?.cells?.length || 0
    };
  });
  console.log('3. Document state:', docState1);
  expect(docState1.line0CellCount).toBeGreaterThan(0);

  console.log('4. Selecting cells 0-2 (first two pitches)...');
  // Select from position 0 to position 2
  await page.evaluate(() => {
    const app = window.MusicNotationApp?.app();
    const editor = app?.editor;
    if (editor && editor.wasmModule) {
      // Use WASM selection API - setSelection expects Pos objects {line, col}
      const anchor = { line: 0, col: 0 };
      const head = { line: 0, col: 2 };
      editor.wasmModule.setSelection(anchor, head);
      editor.updateSelectionDisplay();
    }
  });

  await page.waitForTimeout(200);

  console.log('5. Applying slur using Alt+S (Phase 1 API)...');
  await page.keyboard.press('Alt+KeyS');

  await page.waitForTimeout(500);

  // Check if slur was applied by examining cells
  const slurState = await page.evaluate(() => {
    const app = window.MusicNotationApp?.app();
    const doc = app?.editor?.theDocument;
    const cells = doc?.lines?.[0]?.cells || [];
    return {
      cell0: cells[0] ? {
        char: cells[0].char,
        slur_indicator: cells[0].slur_indicator,
        allKeys: Object.keys(cells[0])
      } : null,
      cell1: cells[1] ? {
        char: cells[1].char,
        slur_indicator: cells[1].slur_indicator,
        allKeys: Object.keys(cells[1])
      } : null
    };
  });

  console.log('6. Slur state after apply (detailed):', JSON.stringify(slurState, null, 2));
  expect(slurState.cell0).not.toBeNull();
  expect(slurState.cell1).not.toBeNull();

  // slur_indicator is serialized as {name: "slur_start", value: 1} by serde
  expect(slurState.cell0.slur_indicator?.name).toBe('slur_start');
  expect(slurState.cell0.slur_indicator?.value).toBe(1);
  expect(slurState.cell1.slur_indicator?.name).toBe('slur_end');
  expect(slurState.cell1.slur_indicator?.value).toBe(2);

  console.log('7. Toggling slur off (should remove it)...');
  await page.keyboard.press('Alt+KeyS');
  await page.waitForTimeout(500);

  // Check if slur was removed
  const slurStateAfterToggle = await page.evaluate(() => {
    const app = window.MusicNotationApp?.app();
    const doc = app?.editor?.theDocument;
    const cells = doc?.lines?.[0]?.cells || [];
    return {
      cell0: cells[0] ? {
        char: cells[0].char,
        slur_indicator: cells[0].slur_indicator
      } : null,
      cell1: cells[1] ? {
        char: cells[1].char,
        slur_indicator: cells[1].slur_indicator
      } : null
    };
  });

  console.log('8. Slur state after toggle off:', JSON.stringify(slurStateAfterToggle, null, 2));
  // After toggle off, slur_indicator should be {name: "none", value: 0}
  expect(slurStateAfterToggle.cell0.slur_indicator?.name).toBe('none');
  expect(slurStateAfterToggle.cell0.slur_indicator?.value).toBe(0);
  expect(slurStateAfterToggle.cell1.slur_indicator?.name).toBe('none');
  expect(slurStateAfterToggle.cell1.slur_indicator?.value).toBe(0);

  console.log('9. Test completed successfully - Phase 1 slur API works!');
});
