import { test, expect } from '@playwright/test';

test('Debug triple-click behavior', async ({ page }) => {
  // Listen to console messages
  page.on('console', msg => console.log('[BROWSER]:', msg.text()));

  // Listen to errors
  page.on('pageerror', error => console.log('[PAGE ERROR]:', error.message));

  await page.goto('http://localhost:8080');
  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();

  // Focus editor
  await editor.click();

  // Type content
  await page.keyboard.type('S--r g-m P---');

  // Wait for rendering
  await page.waitForTimeout(500);

  // Get all cells
  const cells = await page.locator('.char-cell').all();
  console.log(`Found ${cells.length} cells`);

  if (cells.length > 0) {
    // Get the middle cell
    const middleCell = cells[Math.floor(cells.length / 2)];
    const box = await middleCell.boundingBox();
    console.log('Middle cell bounding box:', box);

    // Perform triple-click
    console.log('Performing triple-click on middle cell...');
    await middleCell.click({ clickCount: 3 });

    // Wait for any async operations
    await page.waitForTimeout(500);

    // Check selection state
    const selectedCells = await page.locator('.char-cell.selected').count();
    console.log(`After triple-click: ${selectedCells} cells selected`);
  }
});
