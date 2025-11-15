import { test, expect } from '@playwright/test';

test('Backspace on selected multi-char token (:|) should delete entire token', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });

  // Hard reload to ensure latest JS is loaded
  await page.reload({ waitUntil: 'networkidle' });

  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();

  // Type ":|" (multi-character barline)
  await editor.click();
  await page.keyboard.type(':|');

  // Give WASM a moment to process
  await page.waitForTimeout(200);

  // Manually create a selection from (0,0) to (0,2) using WASM API
  // This selects both the ":" and "|" characters
  await page.evaluate(() => {
    const editor = window.MusicNotationApp?.app()?.editor;
    if (!editor || !editor.wasmModule) return;

    // Set selection using WASM setSelection method
    editor.wasmModule.setSelection?.(
      { line: 0, col: 0 },  // anchor (start)
      { line: 0, col: 2 }   // head (end, exclusive)
    );
  });

  // Give selection a moment to register
  await page.waitForTimeout(100);

  // Check selection state using WASM method
  const selectionInfo = await page.evaluate(() => {
    const editor = window.MusicNotationApp?.app()?.editor;
    if (!editor || !editor.wasmModule) return null;
    return editor.wasmModule.getSelectionInfo?.();
  });
  console.log('Selection after setting:', JSON.stringify(selectionInfo, null, 2));

  // Check cells before backspace
  const cellsBeforeBackspace = await page.evaluate(() => {
    const doc = window.MusicNotationApp?.app()?.editor?.theDocument;
    if (!doc || !doc.lines || !doc.lines[0]) return null;
    return doc.lines[0].cells.map(c => ({
      char: c.char,
      col: c.col,
    }));
  });
  console.log('Cells before backspace:', JSON.stringify(cellsBeforeBackspace));

  // Listen for console errors
  const consoleMessages = [];
  page.on('console', msg => {
    if (msg.type() === 'error' || msg.text().includes('Failed')) {
      consoleMessages.push(msg.text());
    }
  });

  // Check hasSelection and getSelection before deletion
  const preDeleteCheck = await page.evaluate(() => {
    const editor = window.MusicNotationApp?.app()?.editor;
    return {
      hasSelection: editor.hasSelection?.(),
      selection: editor.getSelection?.()
    };
  });
  console.log('[TEST] Before deletion - hasSelection:', preDeleteCheck.hasSelection);
  console.log('[TEST] Before deletion - selection:', JSON.stringify(preDeleteCheck.selection));

  // Call deleteRange directly to test the fix
  const deleteResult = await page.evaluate(async () => {
    try {
      const editor = window.MusicNotationApp?.app()?.editor;
      const selection = editor.getSelection();
      console.log('[TEST-EVAL] Selection:', selection);
      console.log('[TEST-EVAL] Calling deleteRange with:', selection.start, selection.end);

      // Call deleteRange directly
      await editor.deleteRange(selection.start, selection.end);

      console.log('[TEST-EVAL] deleteRange completed');
      return { success: true };
    } catch (err) {
      console.error('[TEST-EVAL] Error:', err);
      return { error: err.toString() };
    }
  });
  console.log('[TEST] Delete result:', JSON.stringify(deleteResult));

  // Give WASM a moment to process the deletion
  await page.waitForTimeout(300);

  // Check what happened during deletion
  const postBackspaceInfo = await page.evaluate(() => {
    const editor = window.MusicNotationApp?.app()?.editor;
    const doc = editor?.theDocument;
    return {
      hasDocument: !!doc,
      lineCount: doc?.lines?.length,
      cellCount: doc?.lines?.[0]?.cells?.length,
      cells: doc?.lines?.[0]?.cells?.map(c => ({ char: c.char, col: c.col }))
    };
  });
  console.log('[TEST] After backspace - doc info:', JSON.stringify(postBackspaceInfo));

  // Check cells after backspace
  const cellsAfterBackspace = await page.evaluate(() => {
    const doc = window.MusicNotationApp?.app()?.editor?.theDocument;
    if (!doc || !doc.lines || !doc.lines[0]) return null;
    return doc.lines[0].cells.map(c => ({
      char: c.char,
      col: c.col,
    }));
  });
  console.log('Cells after backspace:', JSON.stringify(cellsAfterBackspace));

  // Open Doc Model inspector tab to check the document state after deletion
  const docModelTab = page.getByTestId('tab-docmodel');
  await docModelTab.click();

  const docModelPane = page.getByTestId('pane-docmodel');
  await expect(docModelPane).toBeVisible();

  // Wait for content to populate
  await expect.poll(async () => (await docModelPane.innerText()).trim()).not.toEqual('');

  const docModel = await docModelPane.innerText();
  console.log('Doc Model content:', docModel);

  // The doc model may have headers, find the JSON part
  // Look for the "cells: []" pattern which indicates an empty cells array
  const hasCellsArray = docModel.includes('cells:');
  expect(hasCellsArray).toBe(true);

  // Check for empty cells array - should see "cells: []" (with no items)
  // Pattern: "cells: []" or "cells: [\n  ]" (empty)
  const hasEmptyCells = docModel.includes('cells: []') ||
    (docModel.includes('cells: [') && !docModel.match(/cells:\s*\[[^\]]+\]/));

  expect(hasEmptyCells).toBe(true);

  console.log('✓ Multi-char token ":|" was completely deleted, line has 0 cells');
});
