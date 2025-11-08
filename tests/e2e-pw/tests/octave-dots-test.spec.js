import { test, expect } from '@playwright/test';

test.describe('Octave Dots - Verification', () => {
  test('1 with octave +1 should render with dot above (U+E000)', async ({ page }) => {
    await page.goto('/');

    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible();
    await editor.click();

    // Type "1." which in number system means 1 with +1 octave
    await page.keyboard.type('1.');

    // Find the pitch cell
    const pitchCell = page.locator('.char-cell.kind-pitched').first();
    await expect(pitchCell).toBeVisible();

    // Get the text content (should be the glyph)
    const textContent = await pitchCell.textContent();
    const codepoint = textContent.charCodeAt(0);

    console.log(`1. renders as: U+${codepoint.toString(16).toUpperCase().padStart(4, '0')}`);
    console.log(`Expected: U+E000 (1 with +1 octave dot)`);

    // Should be the octave variant glyph
    expect(codepoint).toBe(0xE000);
  });

  test('1 with octave +2 should render (U+E001)', async ({ page }) => {
    await page.goto('/');

    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible();
    await editor.click();

    // Type "1.." which means 1 with +2 octaves
    await page.keyboard.type('1..');

    const pitchCell = page.locator('.char-cell.kind-pitched').first();
    await expect(pitchCell).toBeVisible();

    const textContent = await pitchCell.textContent();
    const codepoint = textContent.charCodeAt(0);

    console.log(`1.. renders as: U+${codepoint.toString(16).toUpperCase().padStart(4, '0')}`);

    expect(codepoint).toBe(0xE001);
  });

  test('All character octave variants exist in font', async ({ page }) => {
    await page.goto('/');

    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible();
    await editor.click();

    // Test several characters with octave shifts
    const testCases = [
      { notation: '1.', expected: 0xE000 },  // 1 with +1
      { notation: '2.', expected: 0xE004 },  // 2 is at index 1, so 0xE000 + (1*4) = 0xE004
      { notation: '3.', expected: 0xE008 },  // 3 is at index 2, so 0xE000 + (2*4) = 0xE008
    ];

    for (const testCase of testCases) {
      // Clear
      await page.keyboard.press('Control+A');
      await page.keyboard.press('Delete');

      // Type
      await page.keyboard.type(testCase.notation);

      // Get cell
      const pitchCell = page.locator('.char-cell.kind-pitched').first();
      await expect(pitchCell).toBeVisible();

      const textContent = await pitchCell.textContent();
      const codepoint = textContent.charCodeAt(0);

      console.log(`${testCase.notation}: U+${codepoint.toString(16).toUpperCase().padStart(4, '0')} (expected U+${testCase.expected.toString(16).toUpperCase().padStart(4, '0')})`);

      expect(codepoint).toBe(testCase.expected);
    }
  });
});
