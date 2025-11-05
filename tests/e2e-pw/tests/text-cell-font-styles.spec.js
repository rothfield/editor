import { test, expect } from '@playwright/test';

test('Text cells should have proper font styling', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' });

  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();

  // Type text token "hello"
  await editor.click();
  await page.keyboard.type('hello');
  await page.waitForTimeout(300);

  // Get computed styles for text cells
  const textStyles = await page.evaluate(() => {
    const containers = document.querySelectorAll('.cell-container');
    const firstCell = containers[0];
    const cellContent = firstCell?.querySelector('.cell-content');
    const span = cellContent?.querySelector('span');

    if (!span) return null;

    const computed = window.getComputedStyle(span);
    return {
      char: span.textContent,
      fontSize: computed.fontSize,
      fontFamily: computed.fontFamily,
      fontStyle: computed.fontStyle,
      fontWeight: computed.fontWeight,
      fontVariant: computed.fontVariant,
      verticalAlign: computed.verticalAlign,
      lineHeight: computed.lineHeight
    };
  });

  console.log('Text cell computed styles:', JSON.stringify(textStyles, null, 2));

  // Requirements:
  // 1. Same baseline (not superscripted) - verticalAlign should be "baseline"
  expect(textStyles.verticalAlign).toBe('baseline');

  // 2. Non-italic - fontStyle should be "normal"
  expect(textStyles.fontStyle).toBe('normal');

  // 3. Proportional font - fontFamily should be sans-serif (not monospace)
  expect(textStyles.fontFamily).toMatch(/sans|segoe|helvetica|arial/i);

  // 4. Normal weight - fontWeight should be "400" or "normal"
  expect(['400', 'normal']).toContain(textStyles.fontWeight);

  console.log('✓ Text cells have correct font styling: non-italic, proportional, normal weight, baseline');
});
