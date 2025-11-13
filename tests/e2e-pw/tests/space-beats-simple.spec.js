import { test, expect } from '@playwright/test';

test('CORE: space character creates separate beats (12 34 = 2 arcs)', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();
  await editor.click();

  // Type: "12 34" (two beats separated by space)
  await page.keyboard.type('12 34');
  await page.waitForTimeout(200);

  // Should have 2 beat arcs (one for "12", one for "34")
  const beatArcs = page.locator('#beat-loops path');
  const count = await beatArcs.count();

  console.log(`Beat arc count: ${count}`);

  // If this fails, spaces are NOT delimiting beats
  expect(count).toBe(2);
});

test('CORE: no space means single beat (1234 = 1 arc)', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();
  await editor.click();

  // Type: "1234" (one beat, no spaces)
  await page.keyboard.type('1234');
  await page.waitForTimeout(200);

  // Should have 1 beat arc
  const beatArcs = page.locator('#beat-loops path');
  await expect(beatArcs).toHaveCount(1);
});
