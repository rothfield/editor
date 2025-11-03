import { test, expect } from '@playwright/test';

test.describe('Double-click beat selection', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:8080');
    await expect(page.getByTestId('editor-root')).toBeVisible();
  });

  test('double-click selects beat when clicking on beat element', async ({ page }) => {
    const editor = page.getByTestId('editor-root');

    // Focus editor
    await editor.click();

    // Type a simple beat: "S--r"
    await page.keyboard.type('S--r');

    // Wait for rendering
    await page.waitForTimeout(100);

    // Get all char cells
    const cells = await page.locator('.char-cell').all();
    expect(cells.length).toBeGreaterThan(0);

    // Double-click on the second character (middle of the beat)
    await cells[1].dblclick();

    // Wait a bit for selection to update
    await page.waitForTimeout(100);

    // Check that selection is active (visual indicator)
    const selectedCells = await page.locator('.char-cell.selected').count();

    // Should have selected the entire beat (4 cells: S, -, -, r)
    expect(selectedCells).toBe(4);

    console.log(`✓ Beat selection: ${selectedCells} cells selected`);
  });

  test('double-click selects character group when clicking on non-beat element', async ({ page }) => {
    const editor = page.getByTestId('editor-root');

    // Focus editor
    await editor.click();

    // Type text (not a beat)
    await page.keyboard.type('hello');

    // Wait for rendering
    await page.waitForTimeout(100);

    // Double-click on a character
    const cells = await page.locator('.char-cell').all();
    if (cells.length > 0) {
      await cells[0].dblclick();

      // Wait for selection
      await page.waitForTimeout(100);

      // Should have selected at least one cell
      const selectedCells = await page.locator('.char-cell.selected').count();
      expect(selectedCells).toBeGreaterThanOrEqual(1);

      console.log(`✓ Character group selection: ${selectedCells} cells selected`);
    }
  });

  test('double-click on second beat selects only that beat', async ({ page }) => {
    const editor = page.getByTestId('editor-root');

    // Focus editor
    await editor.click();

    // Type two beats separated by spaces: "S--r  g-m"
    await page.keyboard.type('S--r  g-m');

    // Wait for rendering
    await page.waitForTimeout(100);

    // Get all cells
    const cells = await page.locator('.char-cell').all();

    // Double-click on the second beat (around index 6-8)
    // Beat 1: S--r (0-3), spaces (4-5), Beat 2: g-m (6-8)
    if (cells.length > 6) {
      await cells[7].dblclick(); // Click on the dash in second beat

      // Wait for selection
      await page.waitForTimeout(100);

      // Check selected cells
      const selectedCells = await page.locator('.char-cell.selected').all();
      const selectedCount = selectedCells.length;

      // Should select the second beat (3 cells: g, -, m)
      expect(selectedCount).toBe(3);

      // Verify the first beat is NOT selected
      const firstCellSelected = await cells[0].evaluate(el => el.classList.contains('selected'));
      expect(firstCellSelected).toBe(false);

      console.log(`✓ Second beat selection: ${selectedCount} cells selected, first beat not selected`);
    }
  });
});
