import { test, expect } from '@playwright/test';

test('whitespace cell has non-zero width', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();
  await editor.click();

  // Type "1 2"
  await page.keyboard.type('1 2');
  await page.waitForTimeout(200);

  // Get all cells
  const allCells = page.locator('.char-cell');
  await expect(allCells).toHaveCount(3);

  // Get the whitespace cell (cell 1) - check the container which has the width
  const spaceCellContainer = page.locator('.cell-container').nth(1);
  const spaceBox = await spaceCellContainer.boundingBox();

  console.log(`Space cell-container width: ${spaceBox.width}px`);
  console.log(`Space cell-container X: ${spaceBox.x}px`);

  // Space container should have NON-ZERO width (minimum 8px per cell.rs:82)
  expect(spaceBox.width).toBeGreaterThan(0);

  // Also check that cell 2 is positioned AFTER the space
  const cell2 = allCells.nth(2);
  const cell2Box = await cell2.boundingBox();

  console.log(`Cell 2 X: ${cell2Box.x}px`);

  // Cell 2 should be to the right of the space cell
  expect(cell2Box.x).toBeGreaterThan(spaceBox.x);
});
