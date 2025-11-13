import { test, expect } from '@playwright/test';

test('nbsp (whitespace) is a beat element, not a separator', async ({ page }) => {
  await page.goto('/');

  const editor = page.locator('[data-testid="editor-root"]');
  await expect(editor).toBeVisible();

  // Type "1 2" (1, space, 2)
  await editor.click();
  await page.keyboard.type('1 2');

  // Wait for rendering to complete
  await page.waitForTimeout(500);

  // Count rendered cells
  const cellCount = await page.locator('.char-cell').count();
  console.log('Cell count:', cellCount);

  // Verify: 3 cells rendered (1, nbsp, 2)
  expect(cellCount).toBe(3);

  // Get the character content of each cell
  const cellTexts = await page.locator('.char-cell').allTextContents();
  console.log('Cell texts:', cellTexts.map(t => t === '\u00A0' ? '<nbsp>' : t));

  // Verify cell content
  expect(cellTexts[0]).toBe('1');
  expect(cellTexts[1]).toBe('\u00A0'); // nbsp
  expect(cellTexts[2]).toBe('2');

  // Verify cells have visible width
  const cell1 = page.locator('.char-cell').nth(0);
  const cell2 = page.locator('.char-cell').nth(1); // nbsp
  const cell3 = page.locator('.char-cell').nth(2);

  const width1 = await cell1.evaluate(el => el.getBoundingClientRect().width);
  const width2 = await cell2.evaluate(el => el.getBoundingClientRect().width);
  const width3 = await cell3.evaluate(el => el.getBoundingClientRect().width);

  console.log('Cell widths:', { width1, width2, width3 });

  // nbsp should have visible width (not zero)
  expect(width2).toBeGreaterThan(0);

  console.log('✅ SUCCESS: nbsp stored directly in document and rendered with visible width');
});
