import { test, expect } from '@playwright/test';
import { waitForEditorReady } from '../utils/editor.helpers';

test.describe('Initial Page Load - Typing Bug', () => {
  test('FAILING: typing should work immediately on initial page load', async ({ page }) => {
    // Navigate to fresh page (simulating first-time user)
    await page.goto('/');

    // Wait for editor to be visible
    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible();

    // Wait for WASM/app initialization
    await waitForEditorReady(page);

    // Click to focus (simulates user clicking into editor)
    await editor.click();
    await page.waitForTimeout(100); // Small stabilization wait

    // Verify cursor is visible
    const cursorVisible = await page.evaluate(() => {
      const cursor = document.querySelector('.cursor-indicator');
      return cursor &&
             cursor.style.display !== 'none' &&
             cursor.offsetHeight > 0;
    });
    expect(cursorVisible).toBe(true);

    // BUG: Type immediately after initial load (using number system)
    await page.keyboard.type('1 2 3');
    await page.waitForTimeout(300);

    // Check if characters actually appeared in document
    const docContent = await page.evaluate(() => {
      const app = window.MusicNotationApp?.app();
      const cells = app?.editor?.theDocument?.lines?.[0]?.cells || [];
      return {
        cellCount: cells.length,
        content: cells.map(c => c.char).join(''),
        hasCells: cells.length > 0
      };
    });

    console.log('After typing "1 2 3" on initial load:', docContent);

    // EXPECTED: Should have cells with 1, space, 2, space, 3
    expect(docContent.hasCells).toBe(true);
    expect(docContent.content).toContain('1');
    expect(docContent.content).toContain('2');
    expect(docContent.content).toContain('3');
    expect(docContent.cellCount).toBeGreaterThanOrEqual(3);
  });

  test('FAILING: bar syntax typing on initial load', async ({ page }) => {
    await page.goto('/');

    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible();

    await waitForEditorReady(page);

    // Focus the editor
    await editor.click();
    await page.waitForTimeout(100);

    // Type measure syntax with number system and dashes
    await page.keyboard.type('| 1--2 -- 3 4 |');
    await page.waitForTimeout(300);

    // Verify content
    const docContent = await page.evaluate(() => {
      const app = window.MusicNotationApp?.app();
      const cells = app?.editor?.theDocument?.lines?.[0]?.cells || [];
      return {
        cellCount: cells.length,
        content: cells.map(c => c.char).join(''),
        hasCells: cells.length > 0
      };
    });

    console.log('After typing "| 1--2 -- 3 4 |" on initial load:', docContent);

    expect(docContent.hasCells).toBe(true);
    expect(docContent.cellCount).toBeGreaterThanOrEqual(5);
  });

  test('CONTROL: typing works after page load + Ctrl+A, Backspace sequence', async ({ page }) => {
    // This pattern DOES work (used by the test fixture)
    await page.goto('/');

    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible();

    await waitForEditorReady(page);

    // Focus and clear (this is what the fixture does)
    await editor.click();
    await page.waitForTimeout(100);

    // The "magic" sequence that makes typing work
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(100);

    // NOW typing should work
    await page.keyboard.type('4 5 6');
    await page.waitForTimeout(300);

    const docContent = await page.evaluate(() => {
      const app = window.MusicNotationApp?.app();
      const cells = app?.editor?.theDocument?.lines?.[0]?.cells || [];
      return {
        cellCount: cells.length,
        content: cells.map(c => c.char).join(''),
        hasCells: cells.length > 0
      };
    });

    console.log('After Ctrl+A, Backspace + typing "4 5 6":', docContent);

    // This test should PASS, proving the bug is specific to initial load
    expect(docContent.hasCells).toBe(true);
    expect(docContent.content).toContain('4');
    expect(docContent.content).toContain('5');
    expect(docContent.content).toContain('6');
  });
});
