import { test, expect } from '@playwright/test';

test('keyboard: Shift+Left Arrow selection', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();
  await editor.click();

  // Type "456"
  await page.keyboard.type('456');
  await page.waitForTimeout(300);

  // Move to end
  await page.keyboard.press('End');
  await page.waitForTimeout(100);

  console.log('\n=== BEFORE SHIFT+LEFT ===');
  let selInfo = await page.evaluate(() => {
    const app = window.MusicNotationApp.app();
    const sel = app.editor.getSelection();
    const cursorPos = app.editor.getCursorPosition();
    return {
      hasSelection: !!sel,
      cursorPos,
      selection: sel ? { start: sel.start, end: sel.end } : null
    };
  });
  console.log('Cursor pos:', selInfo.cursorPos);
  console.log('Selection:', selInfo.selection);

  // Press Shift+Left once
  console.log('\n=== PRESSING SHIFT+LEFT ARROW ===');
  await page.keyboard.press('Shift+ArrowLeft');
  await page.waitForTimeout(200);

  selInfo = await page.evaluate(() => {
    const app = window.MusicNotationApp.app();
    const sel = app.editor.getSelection();
    const cursorPos = app.editor.getCursorPosition();
    const text = sel ? app.editor.getSelectedText() : '';
    return {
      cursorPos,
      selection: sel ? { start: sel.start, end: sel.end } : null,
      selectedText: text
    };
  });
  console.log('After 1st Shift+Left:');
  console.log('  Cursor pos:', selInfo.cursorPos);
  console.log('  Selection:', selInfo.selection);
  console.log('  Selected text:', `"${selInfo.selectedText}"`);

  // Press Shift+Left again
  console.log('\n=== PRESSING SHIFT+LEFT ARROW AGAIN ===');
  await page.keyboard.press('Shift+ArrowLeft');
  await page.waitForTimeout(200);

  selInfo = await page.evaluate(() => {
    const app = window.MusicNotationApp.app();
    const sel = app.editor.getSelection();
    const cursorPos = app.editor.getCursorPosition();
    const text = sel ? app.editor.getSelectedText() : '';
    return {
      cursorPos,
      selection: sel ? { start: sel.start, end: sel.end } : null,
      selectedText: text
    };
  });
  console.log('After 2nd Shift+Left:');
  console.log('  Cursor pos:', selInfo.cursorPos);
  console.log('  Selection:', selInfo.selection);
  console.log('  Selected text:', `"${selInfo.selectedText}"`);

  expect(selInfo.selectedText).toBe('56');
  expect(selInfo.selection.start).toBe(1);
  expect(selInfo.selection.end).toBe(2);
});
