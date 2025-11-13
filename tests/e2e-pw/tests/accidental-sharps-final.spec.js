import { test, expect } from '@playwright/test';

test.describe('Sharp Accidentals - Complete Feature Test', () => {
  test('1# renders as single U+E1F0 glyph from NotationFont font', async ({ page }) => {
    await page.goto('/');

    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible();
    await editor.click();

    await page.keyboard.type('1#');

    const pitchCell = page.locator('.char-cell.kind-pitched').first();
    await expect(pitchCell).toBeVisible();

    // Verify it's the sharp glyph
    const textContent = await pitchCell.textContent();
    const codepoint = textContent.charCodeAt(0);

    expect(codepoint).toBe(0xE1F0);

    // Verify font family
    const fontFamily = await pitchCell.evaluate(el =>
      window.getComputedStyle(el).fontFamily
    );
    expect(fontFamily).toContain('NotationFont');

    // Verify no data-accidental attribute (we're using the glyph, not CSS workaround)
    const hasAccidental = await pitchCell.evaluate(el =>
      el.getAttribute('data-accidental')
    );
    expect(hasAccidental).toBeNull();
  });

  test('2# renders as single U+E1F1 glyph', async ({ page }) => {
    await page.goto('/');
    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible();
    await editor.click();

    await page.keyboard.type('2#');
    await page.waitForTimeout(200); // Allow rendering to complete

    const pitchCell = page.locator('.char-cell.kind-pitched').first();
    await expect(pitchCell).toBeVisible();

    const textContent = await pitchCell.textContent();
    const codepoint = textContent.charCodeAt(0);

    expect(codepoint).toBe(0xE1F1);
  });

  test('3# renders as single U+E1F2 glyph', async ({ page }) => {
    await page.goto('/');
    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible();
    await editor.click();

    await page.keyboard.type('3#');

    const pitchCell = page.locator('.char-cell.kind-pitched').first();
    await expect(pitchCell).toBeVisible();

    const textContent = await pitchCell.textContent();
    const codepoint = textContent.charCodeAt(0);

    expect(codepoint).toBe(0xE1F2);
  });

  test.skip('Sharp accidental continuation character - OBSOLETE (no continuation cells in new architecture)', async ({ page }) => {
    // This test is no longer relevant: continuation cells have been removed.
    // Accidentals like "1#" are now single cells with composite glyph rendering.
  });

  test('4# renders as single U+E1F3 glyph', async ({ page }) => {
    await page.goto('/');
    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible();
    await editor.click();

    await page.keyboard.type('4#');

    const pitchCell = page.locator('.char-cell.kind-pitched').first();
    await expect(pitchCell).toBeVisible();

    const textContent = await pitchCell.textContent();
    const codepoint = textContent.charCodeAt(0);

    expect(codepoint).toBe(0xE1F3);
  });

  test('Sharp glyphs use NotationFont font consistently', async ({ page }) => {
    await page.goto('/');
    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible();
    await editor.click();

    // Test multiple sharps
    const testCases = ['1#', '2#', '3#', 'C#', 'D#'];

    for (const notation of testCases) {
      // Clear
      await page.keyboard.press('Control+A');
      await page.keyboard.press('Delete');

      // Type
      await page.keyboard.type(notation);

      // Check font
      const pitchCell = page.locator('.char-cell.kind-pitched').first();
      await expect(pitchCell).toBeVisible();

      const fontFamily = await pitchCell.evaluate(el =>
        window.getComputedStyle(el).fontFamily
      );

      expect(fontFamily).toContain('NotationFont');
    }
  });

  test('Sharp accidentals render in PUA range (U+E1F0-U+E21E)', async ({ page }) => {
    await page.goto('/');
    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible();
    await editor.click();

    // Test that all sharps render in the expected codepoint range
    // Default pitch system is Number, so test with 1-7
    const testCases = ['1#', '2#', '3#', '4#', '5#', '6#', '7#'];

    for (const notation of testCases) {
      // Clear
      await page.keyboard.press('Control+A');
      await page.keyboard.press('Delete');

      // Type
      await page.keyboard.type(notation);

      // Check codepoint is in PUA sharp range
      const pitchCell = page.locator('.char-cell.kind-pitched').first();
      await expect(pitchCell).toBeVisible();

      const textContent = await pitchCell.textContent();
      const codepoint = textContent.charCodeAt(0);

      // All sharp glyphs should be in range U+E1F0 to U+E21E
      expect(codepoint).toBeGreaterThanOrEqual(0xE1F0);
      expect(codepoint).toBeLessThanOrEqual(0xE21E);
    }
  });
});
