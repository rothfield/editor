import { test, expect } from '@playwright/test';

test.describe('Triple-click line selection', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:8080');
    await expect(page.getByTestId('editor-root')).toBeVisible();
  });

  test('triple-click selects entire line', async ({ page }) => {
    const editor = page.getByTestId('editor-root');

    // Focus editor
    await editor.click();

    // Type a line of content: "S--r g-m P---"
    await page.keyboard.type('S--r g-m P---');

    // Wait for rendering
    await page.waitForTimeout(100);

    // Get all char cells
    const cells = await page.locator('.char-cell').all();
    const totalCells = cells.length;
    expect(totalCells).toBeGreaterThan(0);

    console.log(`Total cells in line: ${totalCells}`);

    // Triple-click on a cell in the middle of the line
    const middleCell = cells[Math.floor(totalCells / 2)];
    await middleCell.click({ clickCount: 3 });

    // Wait for selection to update
    await page.waitForTimeout(200);

    // Check that all cells in the line are selected
    const selectedCells = await page.locator('.char-cell.selected').count();

    console.log(`Selected cells: ${selectedCells}`);

    // Should have selected the entire line
    expect(selectedCells).toBe(totalCells);
  });

  test('triple-click selects only current line in multi-line document', async ({ page }) => {
    const editor = page.getByTestId('editor-root');

    // Focus editor
    await editor.click();

    // Type first line
    await page.keyboard.type('First line');

    // Press Enter to create a new line
    await page.keyboard.press('Enter');

    // Type second line
    await page.keyboard.type('Second line');

    // Wait for rendering
    await page.waitForTimeout(100);

    // Get all notation lines
    const lines = await page.locator('.notation-line').all();
    expect(lines.length).toBe(2);

    // Get cells from first line only
    const firstLineCells = await lines[0].locator('.char-cell').all();
    const firstLineCount = firstLineCells.length;

    console.log(`First line cells: ${firstLineCount}`);

    // Triple-click on first line
    if (firstLineCells.length > 0) {
      await firstLineCells[0].click({ clickCount: 3 });

      // Wait for selection
      await page.waitForTimeout(200);

      // Check selected cells
      const selectedCells = await page.locator('.char-cell.selected').count();

      console.log(`Selected cells: ${selectedCells}`);

      // Should select only the first line
      expect(selectedCells).toBe(firstLineCount);
    }
  });
});
