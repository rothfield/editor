import { test, expect } from '@playwright/test';

test('Space character renders with visible width', async ({ page }) => {
  await page.goto('/');

  const editor = page.locator('[data-testid="editor-root"]');
  await expect(editor).toBeVisible();
  await editor.click();

  // Type: 1<space>2
  await page.keyboard.type('1 2');

  // Check that space cell exists in DOM and has width
  const cells = page.locator('.char-cell');
  await expect(cells).toHaveCount(3); // "1", " ", "2"

  // Get bounding boxes
  const box1 = await cells.nth(0).boundingBox();
  const boxSpace = await cells.nth(1).boundingBox();
  const box2 = await cells.nth(2).boundingBox();

  // Space should have non-zero width
  expect(boxSpace).not.toBeNull();
  expect(boxSpace.width).toBeGreaterThan(0);

  // "2" should be to the right of "1" (with space in between)
  expect(box2.x).toBeGreaterThan(box1.x + box1.width);
});
