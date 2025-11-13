import { test, expect } from '@playwright/test';

test('DEBUG: what gets rendered after 1 2', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();
  await editor.click();

  // Type "1 2"
  await page.keyboard.type('1 2');
  await page.waitForTimeout(200);

  // Check what's in the DOM
  const allCells = page.locator('.char-cell');
  const cellCount = await allCells.count();
  console.log(`Total cells after '1 2': ${cellCount}`);

  for (let i = 0; i < cellCount; i++) {
    const cell = allCells.nth(i);
    const text = await cell.innerText();
    const classes = await cell.getAttribute('class');
    console.log(`  Cell ${i}: text="${text}" classes="${classes}"`);
  }

  // Also check notation lines
  const notationLines = page.locator('.notation-line');
  const lineCount = await notationLines.count();
  console.log(`Notation lines: ${lineCount}`);
});
