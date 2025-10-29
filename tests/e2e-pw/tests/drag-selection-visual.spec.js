import { test, expect } from '../fixtures/editor.fixture';
import { typeInEditor } from '../utils/editor.helpers';

test.describe('Drag Selection Visual Feedback', () => {
  test('Click and drag creates selection without DOM errors', async ({ editorPage: page }) => {
    // Type some content
    await typeInEditor(page, '1 2 3 4 5');
    await page.waitForTimeout(500);

    // Wait for cells to be visible
    await page.waitForSelector('[data-cell-index]', { timeout: 5000 });

    // Get cell elements
    const cells = await page.locator('[data-cell-index]').all();
    console.log(`Found ${cells.length} cells`);
    expect(cells.length).toBeGreaterThan(2);

    // Get bounding boxes for first and third cells
    const firstCell = cells[0];
    const thirdCell = cells[2];

    const firstBox = await firstCell.boundingBox();
    const thirdBox = await thirdCell.boundingBox();

    if (!firstBox || !thirdBox) {
      throw new Error('Could not get cell bounding boxes');
    }

    // Calculate drag coordinates (center of cells)
    const startX = firstBox.x + firstBox.width / 2;
    const startY = firstBox.y + firstBox.height / 2;
    const endX = thirdBox.x + thirdBox.width / 2;
    const endY = thirdBox.y + thirdBox.height / 2;

    console.log(`Dragging from (${startX.toFixed(0)}, ${startY.toFixed(0)}) to (${endX.toFixed(0)}, ${endY.toFixed(0)})`);

    // Collect console messages during drag
    const consoleLogs = [];
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('❌') || text.includes('error')) {
        consoleLogs.push(text);
      }
    });

    // Perform click and drag using drag method instead of manual move
    await page.locator('[data-cell-index="0"]').dragTo(page.locator('[data-cell-index="2"]'));
    await page.waitForTimeout(500);

    // Check console for "Line element not found" errors
    const hasLineError = consoleLogs.some(log => log.includes('Line element not found'));

    console.log('Console errors during drag:', consoleLogs);

    // Should have no line element errors
    expect(hasLineError).toBe(false);
  });
});
