import { test, expect } from '@playwright/test';

test.describe('Debug: 2# Sharp Accidental', () => {
  test('Type 2# and check rendered glyph', async ({ page }) => {
    await page.goto('/');

    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible();
    await editor.click();

    // Clear any existing content
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Delete');

    // Type "2#"
    await page.keyboard.type('2#');

    // Find the pitch cell
    const pitchCell = page.locator('.char-cell.kind-pitched').first();
    await expect(pitchCell).toBeVisible();

    // Get all information
    const textContent = await pitchCell.textContent();
    const codepoint = textContent.charCodeAt(0);

    const fontFamily = await pitchCell.evaluate(el =>
      window.getComputedStyle(el).fontFamily
    );

    const classes = await pitchCell.evaluate(el =>
      el.className
    );

    const dataAttrs = await pitchCell.evaluate(el => {
      const attrs = {};
      for (const attr of el.attributes) {
        if (attr.name.startsWith('data-')) {
          attrs[attr.name] = attr.value;
        }
      }
      return attrs;
    });

    console.log('=== 2# Debug Info ===');
    console.log(`Text content: "${textContent}"`);
    console.log(`Codepoint: U+${codepoint.toString(16).toUpperCase().padStart(4, '0')} (decimal: ${codepoint})`);
    console.log(`Expected: U+E037 (decimal: ${0xE037})`);
    console.log(`Font family: ${fontFamily}`);
    console.log(`Classes: ${classes}`);
    console.log(`Data attributes:`, JSON.stringify(dataAttrs, null, 2));

    // Check if it's the sharp glyph
    if (codepoint === 0xE037) {
      console.log('✓ 2# renders as expected sharp glyph U+E037');
    } else {
      console.log(`✗ 2# renders as U+${codepoint.toString(16).toUpperCase().padStart(4, '0')} instead of U+E037`);
    }
  });
});
