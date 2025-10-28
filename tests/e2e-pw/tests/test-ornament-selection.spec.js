import { test, expect } from '@playwright/test';

test('ornament: Ctrl+O and Shift+Left Arrow selection', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();
  await editor.click();

  // Type some content
  await page.keyboard.type('456');
  await page.waitForTimeout(300);

  // Position cursor at cell 2 (the "6")
  await page.keyboard.press('End');

  // Try Ctrl+O to enter ornament mode
  await page.keyboard.press('Control+O');
  await page.waitForTimeout(200);

  const modeInfo = await page.evaluate(() => {
    const app = window.MusicNotationApp.app();
    const ornamentMode = app.editor.theDocument.state.ornamentMode;
    console.log('Ornament mode:', ornamentMode);
    return { ornamentMode };
  });

  console.log('Mode after Ctrl+O:', modeInfo.ornamentMode);

  // Try Shift+Left Arrow to extend selection
  await page.keyboard.press('Shift+ArrowLeft');
  await page.waitForTimeout(200);

  const selectionInfo = await page.evaluate(() => {
    const app = window.MusicNotationApp.app();
    const selection = app.editor.getSelection();
    const text = app.editor.getSelectedText();
    const ornamentMode = app.editor.theDocument.state.ornamentMode;

    return {
      ornamentMode,
      selection: selection ? { start: selection.start, end: selection.end } : null,
      selectedText: text
    };
  });

  console.log('After Shift+Left Arrow:');
  console.log('  Ornament mode:', selectionInfo.ornamentMode);
  console.log('  Selection:', selectionInfo.selection);
  console.log('  Selected text:', selectionInfo.selectedText);

  expect(selectionInfo.ornamentMode).toBe(true);
  expect(selectionInfo.selection).not.toBeNull();
});
