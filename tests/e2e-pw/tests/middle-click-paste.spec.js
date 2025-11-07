import { test, expect } from '@playwright/test';

test.describe('Middle-Click Paste Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="editor-root"]', { state: 'visible' });
  });

  test('Middle-click paste from clipboard (fallback when no primary selection)', async ({ page }) => {
    const editor = page.getByTestId('editor-root');

    // Type some content
    await editor.click();
    await page.keyboard.type('1 2 3');
    await page.waitForTimeout(200);

    // Copy the first cell
    const cells = await page.locator('[data-cell-index]').all();
    if (cells.length > 0) {
      await cells[0].click();
      await page.keyboard.press('Control+c');
      await page.waitForTimeout(300);
    }

    // Move cursor to end
    await page.keyboard.press('End');
    await page.waitForTimeout(100);

    // Get initial cell count and content
    const cellsBefore = await page.locator('[data-cell-index]').count();

    // Middle-click to paste (button = 'middle' in Playwright)
    const editorRect = await editor.boundingBox();
    if (editorRect) {
      await page.mouse.click(
        editorRect.x + editorRect.width / 2,
        editorRect.y + editorRect.height / 2,
        { button: 'middle' }
      );
      await page.waitForTimeout(500);
    }

    // Verify that content was pasted by checking cell count increased
    const cellsAfter = await page.locator('[data-cell-index]').count();

    // Verify the paste actually happened
    expect(cellsAfter).toBeGreaterThan(cellsBefore);
  });

  test('Middle-click with no content shows warning', async ({ page }) => {
    const consoleLogs = [];
    page.on('console', msg => {
      consoleLogs.push(msg.text());
    });

    const editor = page.getByTestId('editor-root');

    // Start fresh (no copy)
    await editor.click();
    await page.waitForTimeout(100);

    const cellsBefore = await page.locator('[data-cell-index]').count();

    // Middle-click with empty clipboard
    const editorRect = await editor.boundingBox();
    if (editorRect) {
      await page.mouse.click(
        editorRect.x + editorRect.width / 2,
        editorRect.y + editorRect.height / 2,
        { button: 'middle' }
      );
      await page.waitForTimeout(300);
    }

    const cellsAfter = await page.locator('[data-cell-index]').count();
    console.log(`Console logs: ${JSON.stringify(consoleLogs)}`);

    // Nothing should change
    expect(cellsAfter).toBe(cellsBefore);

    // Should see warning
    const warningLog = consoleLogs.find(log => log.includes('Nothing to paste'));
    expect(warningLog).toBeTruthy();
  });
});
