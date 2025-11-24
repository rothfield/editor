import { test, expect } from '@playwright/test';

test.describe('1# Sharp Accidental Glyph - Verification', () => {
  test('1# should render with NotationFont font (glyph verification)', async ({ page }) => {
    // Navigate to editor
    await page.goto('/');

    // Get editor element
    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible();

    // Type "1#"
    await editor.click();
    await page.keyboard.type('1#');

    // Find the rendered pitch cell for 1#
    // Since we're using the actual glyph now, look for .char-cell.kind-pitched
    const pitchCell = page.locator('.char-cell.kind-pitched').first();
    await expect(pitchCell).toBeVisible();

    // Get the actual text content (should be the single glyph character)
    const textContent = await pitchCell.textContent();
    console.log(`Text content: "${textContent}"`);
    console.log(`Text content codepoint: U+${textContent.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`);

    // Get the computed font-family
    const fontFamily = await pitchCell.evaluate(el =>
      window.getComputedStyle(el).fontFamily
    );
    console.log(`Font family: ${fontFamily}`);

    // The font-family should be NotationFont
    expect(fontFamily).toContain('NotationFont');

    // The text content should be a single character with codepoint U+E019
    // (for '1' sharp in the NotationFont font)
    const codepoint = textContent.charCodeAt(0);
    console.log(`Expecting: U+E019 (${0xE019}), Got: U+${codepoint.toString(16).toUpperCase().padStart(4, '0')} (${codepoint})`);

    // Verify it's the correct glyph
    expect(codepoint).toBe(0xE019); // Single glyph from NotationFont PUA
  });

  test('1# character should not have data-accidental attribute (using glyph instead)', async ({ page }) => {
    await page.goto('/');

    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible();

    await editor.click();
    await page.keyboard.type('1#');

    // Find pitch cell
    const pitchCell = page.locator('.char-cell.kind-pitched').first();
    await expect(pitchCell).toBeVisible();

    // Should NOT have data-accidental attribute since we're using the glyph
    const hasAccidentalAttr = await pitchCell.evaluate(el =>
      el.getAttribute('data-accidental')
    );

    console.log(`data-accidental attribute: ${hasAccidentalAttr}`);
    expect(hasAccidentalAttr).toBeNull(); // Should be null since we're using the glyph
  });
});
