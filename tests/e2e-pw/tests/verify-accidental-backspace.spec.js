import { test, expect } from '@playwright/test';

/**
 * Verify semantic accidental-first backspace behavior:
 * 1. Type "1#" - creates 1 cell with sharp accidental
 * 2. First backspace - removes accidental, keeps pitch (cell count stays 1)
 * 3. Second backspace - deletes pitch entirely (cell count becomes 0)
 */
test('Accidental backspace preserves pitch, removes accidental', async ({ page }) => {
  await page.goto('http://localhost:8080');

  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();

  // Type "1#"
  await editor.click();
  await page.keyboard.type('1#');
  await page.waitForTimeout(100);

  // Check we have 1 cell before backspace
  const cellsBefore = page.locator('[data-cell-index]');
  const countBefore = await cellsBefore.count();
  console.log(`Before backspace: ${countBefore} cell(s)`);
  expect(countBefore).toBe(1);

  // Press backspace - should remove accidental but keep pitch
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(100);

  // Should still have 1 cell (pitch preserved)
  const cellsAfter = page.locator('[data-cell-index]');
  const countAfter = await cellsAfter.count();
  console.log(`After backspace: ${countAfter} cell(s)`);
  expect(countAfter).toBe(1); // Key assertion: cell still exists

  // Press backspace again - now should delete the pitch entirely
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(100);

  const cellsFinal = page.locator('[data-cell-index]');
  const countFinal = await cellsFinal.count();
  console.log(`After second backspace: ${countFinal} cell(s)`);
  expect(countFinal).toBe(0); // Now the cell is deleted

  console.log('SUCCESS: First backspace removed accidental, second backspace deleted pitch');
});
