/**
 * Debug Enter key - check what WASM returns
 */

import { test, expect } from '@playwright/test';

test('Debug Enter key - check WASM response', async ({ page }) => {
  const logs = [];

  page.on('console', msg => {
    const text = msg.text();
    logs.push(text);
  });

  await page.goto('/');
  const editor = page.locator('[data-testid="editor-root"]');
  await expect(editor).toBeVisible();
  await editor.click();

  // Type text
  await editor.type('12');
  await page.waitForTimeout(200);

  // Press Enter
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);

  // Find the insertNewline result and cursor update logs
  const insertNewlineLog = logs.find(log => log.includes('WASM insertNewline returned'));
  const cursorLogs = logs.filter(log => log.includes('Cursor moved to new line'));

  console.log('\n=== ENTER KEY DEBUG ===');
  if (insertNewlineLog) {
    console.log('Found insertNewline log:');
    console.log(insertNewlineLog);

    // Try to parse the object
    const match = insertNewlineLog.match(/returned: (.+)$/);
    if (match) {
      console.log('\nTrying to understand the structure...');
      console.log('Raw:', match[1]);
    }
  } else {
    console.log('ERROR: No insertNewline log found!');
  }

  console.log('\nCursor update logs:');
  cursorLogs.forEach(log => console.log(log));

  // Check cursor position
  const cursorPosition = page.locator('#editor-cursor-position');
  const cursorText = await cursorPosition.textContent();
  console.log('Cursor position after Enter:', cursorText);

  // Check actual document state
  const doc = await page.evaluate(() => {
    return {
      lineCount: window.editor?.theDocument?.lines?.length,
      cursorLine: window.editor?.theDocument?.state?.cursor?.line,
      cursorCol: window.editor?.theDocument?.state?.cursor?.col
    };
  });
  console.log('Document state:', doc);

  // Always pass - this is debug only
  expect(true).toBe(true);
});
