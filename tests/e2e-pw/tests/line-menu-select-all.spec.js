import { test, expect } from '@playwright/test';

test.describe('Line menu - Select Line', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:8080');
    await expect(page.getByTestId('editor-root')).toBeVisible();
  });

  test('Select Line menu item selects entire line', async ({ page }) => {
    const editor = page.getByTestId('editor-root');

    // Focus editor and type content
    await editor.click();
    await page.keyboard.type('S--r g-m P---');

    // Wait for rendering
    await page.waitForTimeout(100);

    // Get total number of cells
    const totalCells = await page.locator('.char-cell').count();
    expect(totalCells).toBeGreaterThan(0);

    console.log(`Total cells: ${totalCells}`);

    // Open Line menu
    const lineMenuButton = page.locator('#line-menu-button');
    await lineMenuButton.click();

    // Wait for menu to open
    await page.waitForTimeout(100);

    // Click "Select Line (triple-click)" menu item
    const selectAllItem = page.locator('#menu-select-all');
    await expect(selectAllItem).toBeVisible();
    await selectAllItem.click();

    // Wait for selection to update
    await page.waitForTimeout(200);

    // Check that all cells are selected
    const selectedCells = await page.locator('.char-cell.selected').count();

    console.log(`Selected cells: ${selectedCells}`);

    // Should have selected the entire line
    expect(selectedCells).toBe(totalCells);
  });

  test('Select Line works with multiple lines', async ({ page }) => {
    const editor = page.getByTestId('editor-root');

    // Focus editor
    await editor.click();

    // Type first line
    await page.keyboard.type('First line');
    await page.keyboard.press('Enter');

    // Type second line
    await page.keyboard.type('Second line');

    // Wait for rendering
    await page.waitForTimeout(100);

    // Get all lines
    const lines = await page.locator('.notation-line').all();
    expect(lines.length).toBe(2);

    // Get second line cell count
    const secondLineCells = await lines[1].locator('.char-cell').all();
    const secondLineCount = secondLineCells.length;

    console.log(`Second line cells: ${secondLineCount}`);

    // Cursor should be on second line - use Select Line
    const lineMenuButton = page.locator('#line-menu-button');
    await lineMenuButton.click();
    await page.waitForTimeout(100);

    const selectAllItem = page.locator('#menu-select-all');
    await selectAllItem.click();
    await page.waitForTimeout(200);

    // Check selected cells
    const selectedCells = await page.locator('.char-cell.selected').count();

    console.log(`Selected cells: ${selectedCells}`);

    // Should select only the second line (where cursor is)
    expect(selectedCells).toBe(secondLineCount);
  });
});
