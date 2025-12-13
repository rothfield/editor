/**
 * Debug test for slur unicode mismatch issue
 */
import { test, expect } from '@playwright/test';
import { openTab, readPaneText } from '../helpers/inspectors.js';

test.beforeEach(async ({ page }) => {
  // Collect console logs
  page.on('console', msg => {
    console.log(`[BROWSER] ${msg.type()}: ${msg.text()}`);
  });

  await page.goto('http://localhost:8080');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
});

test('debug slur unicode mismatch', async ({ page }) => {
  const editor = page.locator('#notation-editor');
  await editor.click();
  await page.waitForTimeout(200);

  // Type simple notes
  await page.keyboard.type('1 2 3 4 5');
  await page.waitForTimeout(200);

  // Debug: Check what was typed and cell state
  const beforeSelection = await page.evaluate(() => {
    const app = window.MusicNotationApp?.app();
    const wasm = app?.editor?.wasmModule;
    const doc = wasm?.getDocument?.();
    const line = doc?.lines?.[0];

    return {
      cellCount: line?.cells?.length,
      cells: line?.cells?.map((c, i) => ({
        idx: i,
        char: c.char,
        charCode: c.char?.charCodeAt(0)?.toString(16),
        kind: c.kind
      })),
      text: line?.text,
      caretInfo: wasm?.getCaretInfo?.()
    };
  });

  console.log('=== Before selection ===');
  console.log('Cell count:', beforeSelection.cellCount);
  console.log('Text:', beforeSelection.text);
  console.log('Caret:', JSON.stringify(beforeSelection.caretInfo));
  console.log('Cells:', JSON.stringify(beforeSelection.cells, null, 2));

  // Move to start, then right to '2'
  await page.keyboard.press('Home');
  await page.waitForTimeout(100);

  const afterHome = await page.evaluate(() => {
    const app = window.MusicNotationApp?.app();
    return app?.editor?.wasmModule?.getCaretInfo?.();
  });
  console.log('After Home:', JSON.stringify(afterHome));

  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(100);

  const afterRight = await page.evaluate(() => {
    const app = window.MusicNotationApp?.app();
    return app?.editor?.wasmModule?.getCaretInfo?.();
  });
  console.log('After ArrowRight:', JSON.stringify(afterRight));

  // Select 3 characters with Shift+ArrowRight
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('Shift+ArrowRight');
    await page.waitForTimeout(50);

    const selInfo = await page.evaluate(() => {
      const app = window.MusicNotationApp?.app();
      return app?.editor?.wasmModule?.getSelectionInfo?.();
    });
    console.log(`After Shift+ArrowRight ${i+1}:`, JSON.stringify(selInfo));
  }

  // Get final selection state
  const selectionState = await page.evaluate(() => {
    const app = window.MusicNotationApp?.app();
    const wasm = app?.editor?.wasmModule;
    return {
      selectionInfo: wasm?.getSelectionInfo?.(),
      editorSelection: app?.editor?.getSelection?.(),
      slursBeforeApply: wasm?.getSlursForLine?.(0)
    };
  });

  console.log('=== Selection State Before Alt+S ===');
  console.log('selectionInfo:', JSON.stringify(selectionState.selectionInfo));
  console.log('editorSelection:', JSON.stringify(selectionState.editorSelection));
  console.log('slursBeforeApply:', JSON.stringify(selectionState.slursBeforeApply));

  // Apply slur
  await page.keyboard.press('Alt+s');
  await page.waitForTimeout(300);

  // Check slur state after apply
  const afterSlur = await page.evaluate(() => {
    const app = window.MusicNotationApp?.app();
    const wasm = app?.editor?.wasmModule;
    const doc = wasm?.getDocument?.();
    const line = doc?.lines?.[0];

    return {
      slurs: wasm?.getSlursForLine?.(0),
      annotationSlurs: doc?.annotation_layer?.slurs,
      cells: line?.cells?.map((c, i) => ({
        idx: i,
        char: c.char,
        charCode: c.char?.charCodeAt(0)?.toString(16),
        slurIndicator: c.slur_indicator
      }))
    };
  });

  console.log('=== After Alt+S ===');
  console.log('slurs:', JSON.stringify(afterSlur.slurs));
  console.log('annotationSlurs:', JSON.stringify(afterSlur.annotationSlurs));
  console.log('cells:', JSON.stringify(afterSlur.cells, null, 2));

  // Trigger export
  await openTab(page, 'tab-musicxml');
  const musicxml = await readPaneText(page, 'pane-musicxml');

  console.log('=== MusicXML Export ===');
  const slurMatches = musicxml.match(/<slur[^>]*>/g);
  console.log('Slur tags found:', slurMatches?.length || 0);
  console.log('Slur tags:', slurMatches);

  // Check cell state after export (applyAnnotationSlursToCells should have been called)
  const afterExport = await page.evaluate(() => {
    const app = window.MusicNotationApp?.app();
    const wasm = app?.editor?.wasmModule;
    const doc = wasm?.getDocument?.();
    const line = doc?.lines?.[0];

    return {
      cells: line?.cells?.map((c, i) => ({
        idx: i,
        char: c.char,
        slurIndicator: c.slur_indicator
      }))
    };
  });

  console.log('=== After Export ===');
  console.log('cells:', JSON.stringify(afterExport.cells, null, 2));

  // The actual assertion
  expect(slurMatches).not.toBeNull();
  expect(slurMatches?.length).toBe(2);
});
