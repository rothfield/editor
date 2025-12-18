/**
 * E2E Test: Slur persistence after pressing space
 *
 * Bug fixed: Slurs now encoded as overline PUA variants in cell.char,
 * so they persist when setLineText rebuilds cells.
 */

import { test, expect } from '@playwright/test';
import { openTab, readPaneText } from '../helpers/inspectors.js';

test.describe('Slur persistence via overline encoding', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    const editor = page.locator('#notation-editor');
    await expect(editor).toBeVisible();

    // Clear any existing content
    await editor.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(200);
  });

  test('slur persists after pressing space', async ({ page }) => {
    const editor = page.locator('#notation-editor');
    await editor.click();

    // Type "12"
    await page.keyboard.type('12');
    await page.waitForTimeout(100);

    // Select all
    await page.keyboard.press('Control+A');

    // Apply slur (Alt+S)
    await page.keyboard.press('Alt+S');

    // Verify slur exists (check via getSlursForLine)
    const slursBefore = await page.evaluate(() => {
      return window.editor.wasmModule.getSlursForLine(0);
    });
    console.log('Slurs before space:', JSON.stringify(slursBefore));
    expect(slursBefore.length).toBe(1);

    // Press End to move cursor to end (deselect)
    await page.keyboard.press('End');

    // Press space
    await page.keyboard.press(' ');

    // Wait for UI to update
    await page.waitForTimeout(100);

    // Verify slur still exists
    const slursAfter = await page.evaluate(() => {
      return window.editor.wasmModule.getSlursForLine(0);
    });
    console.log('Slurs after space:', JSON.stringify(slursAfter));

    // Slur should persist!
    expect(slursAfter.length).toBe(1);
    expect(slursAfter[0].start.col).toBe(0);
    expect(slursAfter[0].end.col).toBe(2); // "12" is cols 0-1, end is exclusive
  });

  test('slur shows in displaylist overline column', async ({ page }) => {
    const editor = page.locator('#notation-editor');
    await editor.click();

    // Type "12"
    await page.keyboard.type('12');
    await page.waitForTimeout(100);

    // Select all and apply slur
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Alt+S');

    // Open displaylist tab
    await openTab(page, 'tab-displaylist');

    // Check displaylist shows overline states
    const displaylistText = await readPaneText(page, 'pane-displaylist');
    console.log('Displaylist:', displaylistText);

    // Should contain "Left" for first cell and "Right" for last
    expect(displaylistText).toContain('Left');
  });

  test('slur expands when inserting within span', async ({ page }) => {
    const editor = page.locator('#notation-editor');
    await editor.click();

    // Type "12"
    await page.keyboard.type('12');
    await page.waitForTimeout(100);

    // Select all and apply slur
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Alt+S');
    await page.waitForTimeout(100);

    // Verify initial slur: [Left, Right]
    const slursBefore = await page.evaluate(() => {
      return window.editor.wasmModule.getSlursForLine(0);
    });
    console.log('Slurs before insert:', JSON.stringify(slursBefore));
    expect(slursBefore.length).toBe(1);
    expect(slursBefore[0].start.col).toBe(0);
    expect(slursBefore[0].end.col).toBe(2); // exclusive end

    // Move cursor between 1 and 2 (Home, then Right)
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(50);

    // Insert "3" between 1 and 2 → "132"
    await page.keyboard.type('3');
    await page.waitForTimeout(100);

    // Verify slur expanded: should now span 0-3 (exclusive end)
    const slursAfter = await page.evaluate(() => {
      return window.editor.wasmModule.getSlursForLine(0);
    });
    console.log('Slurs after insert:', JSON.stringify(slursAfter));

    expect(slursAfter.length).toBe(1);
    expect(slursAfter[0].start.col).toBe(0);
    expect(slursAfter[0].end.col).toBe(3); // expanded to cover 3 cells

    // Verify via displaylist that all 3 cells have proper overline states
    await openTab(page, 'tab-displaylist');
    const displaylistText = await readPaneText(page, 'pane-displaylist');
    console.log('Displaylist after insert:', displaylistText);

    // Should have Left, Middle, Right for the 3 cells
    expect(displaylistText).toContain('Left');
    expect(displaylistText).toContain('Middle');
    expect(displaylistText).toContain('Right');
  });

  test('slur covers spaces with overlines', async ({ page }) => {
    const editor = page.locator('#notation-editor');
    await editor.click();

    // Type "1 2" (with space in between - space creates beat boundary)
    await page.keyboard.type('1 2');
    await page.waitForTimeout(100);

    // Select all and apply slur
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Alt+S');
    await page.waitForTimeout(100);

    // Verify slur spans all 3 cells (including space)
    const slurs = await page.evaluate(() => {
      return window.editor.wasmModule.getSlursForLine(0);
    });
    console.log('Slurs for "1 2":', JSON.stringify(slurs));
    expect(slurs.length).toBe(1);
    expect(slurs[0].start.col).toBe(0);
    expect(slurs[0].end.col).toBe(3); // 3 cells: 1, space, 2

    // Verify via displaylist that ALL cells (including space) have overlines
    await openTab(page, 'tab-displaylist');
    const displaylistText = await readPaneText(page, 'pane-displaylist');
    console.log('Displaylist for "1 2" with slur:', displaylistText);

    // Count occurrences of each overline state
    // We should have Left (1), Middle (space), Right (2)
    const leftCount = (displaylistText.match(/\tLeft\t/g) || []).length;
    const middleCount = (displaylistText.match(/\tMiddle\t/g) || []).length;
    const rightCount = (displaylistText.match(/\tRight\t/g) || []).length;

    console.log(`Overline counts - Left: ${leftCount}, Middle: ${middleCount}, Right: ${rightCount}`);

    // All 3 cells should have overlines
    expect(leftCount).toBeGreaterThanOrEqual(1);
    expect(middleCount).toBeGreaterThanOrEqual(1);
    expect(rightCount).toBeGreaterThanOrEqual(1);
  });
});
