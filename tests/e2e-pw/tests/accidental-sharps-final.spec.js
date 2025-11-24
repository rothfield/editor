import { test, expect } from '@playwright/test';

test.describe('Sharp Accidentals - Complete Feature Test', () => {
  test('1# renders as single U+E019 glyph from NotationFont font', async ({ page }) => {
    await page.goto('/');

    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible();
    await editor.click();

    await page.keyboard.type('1#');

    const pitchCell = page.locator('.char-cell.kind-pitched').first();
    await expect(pitchCell).toBeVisible();

    // Verify it's the sharp glyph (30-variant architecture: 0xE000 + 0*30 + 25 = 0xE019)
    const textContent = await pitchCell.textContent();
    const codepoint = textContent.charCodeAt(0);

    expect(codepoint).toBe(0xE019);

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

  test('2# renders as single U+E037 glyph', async ({ page }) => {
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

    expect(codepoint).toBe(0xE037); // 0xE000 + 1*30 + 25
  });

  test('3# renders as single U+E055 glyph', async ({ page }) => {
    await page.goto('/');
    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible();
    await editor.click();

    await page.keyboard.type('3#');

    const pitchCell = page.locator('.char-cell.kind-pitched').first();
    await expect(pitchCell).toBeVisible();

    const textContent = await pitchCell.textContent();
    const codepoint = textContent.charCodeAt(0);

    expect(codepoint).toBe(0xE055); // 0xE000 + 2*30 + 25
  });

  test.skip('Sharp accidental continuation character - OBSOLETE (no continuation cells in new architecture)', async ({ page }) => {
    // This test is no longer relevant: continuation cells have been removed.
    // Accidentals like "1#" are now single cells with composite glyph rendering.
  });

  test('4# renders as single U+E073 glyph', async ({ page }) => {
    await page.goto('/');
    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible();
    await editor.click();

    await page.keyboard.type('4#');

    const pitchCell = page.locator('.char-cell.kind-pitched').first();
    await expect(pitchCell).toBeVisible();

    const textContent = await pitchCell.textContent();
    const codepoint = textContent.charCodeAt(0);

    expect(codepoint).toBe(0xE073); // 0xE000 + 3*30 + 25
  });

  test('Sharp glyphs use NotationFont font consistently', async ({ page }) => {
    await page.goto('/');
    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible();
    await editor.click();

    // Test multiple sharps (Number system only - default pitch system)
    const testCases = ['1#', '2#', '3#', '4#', '5#'];

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

  test('Sharp accidentals render in PUA range with correct offsets (30-variant architecture)', async ({ page }) => {
    await page.goto('/');
    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible();
    await editor.click();

    // Test that all sharps render with the expected codepoints
    // Default pitch system is Number (PUA base 0xE000), sharps at variant offset 25
    // Formula: 0xE000 + (degree_index * 30) + 25
    const testCases = [
      { notation: '1#', expectedCodepoint: 0xE019 }, // degree 0
      { notation: '2#', expectedCodepoint: 0xE037 }, // degree 1
      { notation: '3#', expectedCodepoint: 0xE055 }, // degree 2
      { notation: '4#', expectedCodepoint: 0xE073 }, // degree 3
      { notation: '5#', expectedCodepoint: 0xE091 }, // degree 4
      { notation: '6#', expectedCodepoint: 0xE0AF }, // degree 5
      { notation: '7#', expectedCodepoint: 0xE0CD }, // degree 6
    ];

    for (const testCase of testCases) {
      // Clear
      await page.keyboard.press('Control+A');
      await page.keyboard.press('Delete');

      // Re-focus editor after deletion
      await editor.click();

      // Type
      await page.keyboard.type(testCase.notation);

      // Check codepoint matches expected
      const pitchCell = page.locator('.char-cell.kind-pitched').first();
      await expect(pitchCell).toBeVisible();

      const textContent = await pitchCell.textContent();
      const codepoint = textContent.charCodeAt(0);

      expect(codepoint).toBe(testCase.expectedCodepoint);
    }
  });
});
