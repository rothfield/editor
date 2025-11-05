import { test, expect } from '../fixtures/editor.fixture';
import { typeInEditor } from '../utils/editor.helpers';

test.describe('Selection Header Display', () => {
  test('Header shows correct cell count after selection (not NaN)', async ({ editorPage: page }) => {
    // Type some content
    await typeInEditor(page, '1 2 3 4 5');
    await page.waitForTimeout(300);

    // Get cells
    const cells = await page.locator('[data-cell-index]').all();
    expect(cells.length).toBeGreaterThan(3);

    // Select cells 0-2 (3 cells) via drag
    const firstCell = cells[0];
    const thirdCell = cells[2];
    await firstCell.dragTo(thirdCell);
    await page.waitForTimeout(300);

    // Check selection info in header
    const selectionInfo = page.locator('#selection-info');
    await expect(selectionInfo).toBeVisible();

    const selectionText = await selectionInfo.textContent();
    console.log('Selection info text:', selectionText);

    // Should NOT contain NaN
    expect(selectionText).not.toContain('NaN');

    // Should show a valid number of cells
    expect(selectionText).toMatch(/Selected: \d+ cells/);

    // Should show the selected text content
    expect(selectionText).toContain('cells (');
  });

  test('Header shows "No selection" when nothing is selected', async ({ editorPage: page }) => {
    // Type some content
    await typeInEditor(page, '1 2 3');
    await page.waitForTimeout(300);

    // Click somewhere to ensure no selection
    await page.keyboard.press('Home');
    await page.waitForTimeout(200);

    // Check selection info shows "No selection"
    const selectionInfo = page.locator('#selection-info');
    await expect(selectionInfo).toBeVisible();

    const selectionText = await selectionInfo.textContent();
    console.log('Selection info text (no selection):', selectionText);

    expect(selectionText).toBe('No selection');
  });

  test('Header updates when selection changes', async ({ editorPage: page }) => {
    // Type some content
    await typeInEditor(page, '1 2 3 4 5');
    await page.waitForTimeout(300);

    const cells = await page.locator('[data-cell-index]').all();

    // First selection: cells 0-1 (2 cells)
    await cells[0].dragTo(cells[1]);
    await page.waitForTimeout(300);

    let selectionInfo = page.locator('#selection-info');
    let text1 = await selectionInfo.textContent();
    console.log('First selection:', text1);

    expect(text1).not.toContain('NaN');
    expect(text1).toMatch(/Selected: \d+ cells/);

    // Second selection: cells 0-3 (4 cells)
    await cells[0].dragTo(cells[3]);
    await page.waitForTimeout(300);

    let text2 = await selectionInfo.textContent();
    console.log('Second selection:', text2);

    expect(text2).not.toContain('NaN');
    expect(text2).toMatch(/Selected: \d+ cells/);

    // The two selections should be different
    expect(text1).not.toBe(text2);
  });

  test('Header shows correct count for single cell selection', async ({ editorPage: page }) => {
    // Type some content
    await typeInEditor(page, '1 2 3');
    await page.waitForTimeout(300);

    // Select single cell via shift+arrow
    await page.keyboard.press('Home');
    await page.waitForTimeout(100);
    await page.keyboard.press('Shift+ArrowRight');
    await page.waitForTimeout(300);

    const selectionInfo = page.locator('#selection-info');
    const selectionText = await selectionInfo.textContent();
    console.log('Single cell selection:', selectionText);

    // Should NOT contain NaN
    expect(selectionText).not.toContain('NaN');

    // Should show selection
    expect(selectionText).toMatch(/Selected: \d+ cells/);
  });
});
