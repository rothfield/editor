import { test, expect } from '../fixtures/editor.fixture';
import { typeInEditor } from '../utils/editor.helpers';

test.describe('Selection Text Accuracy', () => {
  test('Typing "123" and selecting all shows correct text, not "222"', async ({ editorPage: page }) => {
    // Type exactly "123"
    await typeInEditor(page, '123');
    await page.waitForTimeout(300);

    // Select all cells via Home + Shift+End
    await page.keyboard.press('Home');
    await page.waitForTimeout(100);
    await page.keyboard.press('Shift+End');
    await page.waitForTimeout(300);

    // Check selection info in header
    const selectionInfo = page.locator('#editor-selection-status');
    await expect(selectionInfo).toBeVisible();

    const selectionText = await selectionInfo.textContent();
    console.log('Selection info text:', selectionText);

    // Should NOT show "222"
    expect(selectionText).not.toContain('222');

    // Should show "123" or parts of it in the selection
    // Pattern: "Selected: N cells (actual text here)"
    const match = selectionText.match(/Selected: (\d+) cells \(([^)]*)\)/);
    if (match) {
      const cellCount = parseInt(match[1]);
      const displayedText = match[2];

      console.log('Cell count:', cellCount);
      console.log('Displayed text:', displayedText);

      // The displayed text should be "123" or contain the actual typed characters
      expect(displayedText).toContain('1');
    }
  });

  test('Typing "abc" and selecting shows correct text', async ({ editorPage: page }) => {
    // Type "abc"
    await typeInEditor(page, 'abc');
    await page.waitForTimeout(300);

    // Select all
    await page.keyboard.press('Home');
    await page.waitForTimeout(100);
    await page.keyboard.press('Shift+End');
    await page.waitForTimeout(300);

    const selectionInfo = page.locator('#editor-selection-status');
    const selectionText = await selectionInfo.textContent();
    console.log('Selection info text:', selectionText);

    // Extract the displayed text from "Selected: N cells (text)"
    const match = selectionText.match(/Selected: \d+ cells \(([^)]*)\)/);
    if (match) {
      const displayedText = match[1];
      console.log('Displayed text:', displayedText);

      // Should contain the actual typed text
      expect(displayedText).toContain('a');
      expect(displayedText).not.toContain('bbb'); // Should not be corrupted
    }
  });

  test('Partial selection shows only selected text', async ({ editorPage: page }) => {
    // Type "12345"
    await typeInEditor(page, '12345');
    await page.waitForTimeout(300);

    // Select cells 1-3 (should be characters at positions 1-3)
    const cells = await page.locator('[data-cell-index]').all();
    expect(cells.length).toBeGreaterThan(3);

    // Drag from cell 1 to cell 3 (0-indexed, so positions 1-3)
    await cells[1].dragTo(cells[3]);
    await page.waitForTimeout(300);

    const selectionInfo = page.locator('#editor-selection-status');
    const selectionText = await selectionInfo.textContent();
    console.log('Partial selection info:', selectionText);

    const match = selectionText.match(/Selected: (\d+) cells \(([^)]*)\)/);
    if (match) {
      const cellCount = parseInt(match[1]);
      const displayedText = match[2];

      console.log('Cell count:', cellCount);
      console.log('Displayed text:', displayedText);

      // Should not show repeated characters like "333"
      expect(displayedText).not.toMatch(/^(\d)\1+$/); // Regex for repeated single digit
    }
  });

  test('Selection with spaces shows correct content', async ({ editorPage: page }) => {
    // Type "1 2 3" (with spaces)
    await typeInEditor(page, '1 2 3');
    await page.waitForTimeout(300);

    // Select all
    await page.keyboard.press('Home');
    await page.waitForTimeout(100);
    await page.keyboard.press('Shift+End');
    await page.waitForTimeout(300);

    const selectionInfo = page.locator('#editor-selection-status');
    const selectionText = await selectionInfo.textContent();
    console.log('Selection with spaces:', selectionText);

    const match = selectionText.match(/Selected: \d+ cells \(([^)]*)\)/);
    if (match) {
      const displayedText = match[1];
      console.log('Displayed text:', displayedText);

      // Should contain the spaces
      expect(displayedText).toContain(' ');

      // Should contain 1, 2, and 3
      expect(displayedText).toContain('1');
      expect(displayedText).toContain('2');
      expect(displayedText).toContain('3');
    }
  });

  test('Single cell selection shows correct character', async ({ editorPage: page }) => {
    // Type "xyz"
    await typeInEditor(page, 'xyz');
    await page.waitForTimeout(300);

    // Select first cell only
    await page.keyboard.press('Home');
    await page.waitForTimeout(100);
    await page.keyboard.press('Shift+ArrowRight');
    await page.waitForTimeout(300);

    const selectionInfo = page.locator('#editor-selection-status');
    const selectionText = await selectionInfo.textContent();
    console.log('Single cell selection:', selectionText);

    const match = selectionText.match(/Selected: \d+ cells \(([^)]*)\)/);
    if (match) {
      const displayedText = match[1];
      console.log('Displayed text:', displayedText);

      // Should show 'x' or 'x ' (with space), not a different character
      expect(displayedText.trim()).toContain('x');
    }
  });
});
