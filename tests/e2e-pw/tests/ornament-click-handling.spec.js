// @ts-check
import { test, expect } from '@playwright/test';

/**
 * Test that ornaments don't interfere with mouse click handling.
 *
 * Issue: Ornamental cells (rhythm-transparent floating elements) were being
 * included in click detection, but they lack data-cell-index attributes,
 * causing "Invalid last cell index - defaulting to 0" errors.
 */
test.describe('Ornament Click Handling', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#notation-editor');
    await page.click('#notation-editor');
  });

  test('clicking after ornament should position cursor correctly', async ({ page }) => {
    // Type "123"
    await page.keyboard.type('123');

    // Select "23" with shift+left arrow twice
    await page.keyboard.press('Shift+ArrowLeft');
    await page.keyboard.press('Shift+ArrowLeft');

    // Add ornament with Ctrl+O
    await page.keyboard.press('Control+o');

    // Wait for ornament to render
    await page.waitForTimeout(100);

    // Get the position of the main "3" character cell
    const mainCells = await page.locator('.notation-line .char-cell[data-cell-index]').all();
    expect(mainCells.length).toBeGreaterThan(0);

    // Get the last main cell (should be "3")
    const lastMainCell = mainCells[mainCells.length - 1];
    const box = await lastMainCell.boundingBox();
    expect(box).not.toBeNull();

    // Click to the right of the last main cell
    const clickX = box.x + box.width + 10;
    const clickY = box.y + box.height / 2;
    await page.mouse.click(clickX, clickY);

    // Wait for cursor update
    await page.waitForTimeout(50);

    // Check that no console errors occurred
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error' || msg.text().includes('Invalid last cell index')) {
        consoleErrors.push(msg.text());
      }
    });

    // Click again to trigger any potential errors
    await page.mouse.click(clickX, clickY);
    await page.waitForTimeout(50);

    // Verify no "Invalid last cell index" errors
    expect(consoleErrors.filter(e => e.includes('Invalid last cell index'))).toHaveLength(0);
  });

  test('ornament cells should not have data-cell-index', async ({ page }) => {
    // Type "123"
    await page.keyboard.type('123');

    // Select "23" and add ornament
    await page.keyboard.press('Shift+ArrowLeft');
    await page.keyboard.press('Shift+ArrowLeft');
    await page.keyboard.press('Control+o');
    await page.waitForTimeout(100);

    // Check that ornamental cells (zero-width floating) don't have data-cell-index
    const ornamentalCells = await page.locator('.notation-line .ornament-cell, .notation-line [style*="width: 0"]').all();

    for (const cell of ornamentalCells) {
      const hasIndex = await cell.getAttribute('data-cell-index');
      // Ornamental cells should NOT have data-cell-index
      expect(hasIndex).toBeNull();
    }
  });

  test('main cells should have valid data-cell-index', async ({ page }) => {
    // Type "123"
    await page.keyboard.type('123');

    // Get all main cells with data-cell-index
    const mainCells = await page.locator('.notation-line .char-cell[data-cell-index]').all();

    // Should have at least 3 cells for "1", "2", "3"
    expect(mainCells.length).toBeGreaterThanOrEqual(3);

    // Each should have a valid numeric index
    for (const cell of mainCells) {
      const index = await cell.getAttribute('data-cell-index');
      expect(index).not.toBeNull();
      expect(parseInt(index, 10)).not.toBeNaN();
    }
  });
});
