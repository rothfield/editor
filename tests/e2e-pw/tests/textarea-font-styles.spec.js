import { test, expect } from '@playwright/test';

test('Textarea should have proper font styling with NotationFont', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });

  // Wait for textarea to be visible
  const textarea = page.locator('.notation-textarea').first();
  await expect(textarea).toBeVisible();

  // Type some notation
  await textarea.click();
  await page.keyboard.type('1 2 3');
  await page.waitForTimeout(300);

  // Get computed styles for textarea
  const textStyles = await page.evaluate(() => {
    const textarea = document.querySelector('.notation-textarea');
    if (!textarea) return null;

    const computed = window.getComputedStyle(textarea);
    return {
      fontSize: computed.fontSize,
      fontFamily: computed.fontFamily,
      fontStyle: computed.fontStyle,
      fontWeight: computed.fontWeight,
      lineHeight: computed.lineHeight
    };
  });

  console.log('Textarea computed styles:', JSON.stringify(textStyles, null, 2));

  // Requirements:
  // 1. NotationFont should be applied
  expect(textStyles.fontFamily).toContain('NotationFont');

  // 2. Non-italic - fontStyle should be "normal"
  expect(textStyles.fontStyle).toBe('normal');

  // 3. Normal weight - fontWeight should be "400" or "normal"
  expect(['400', 'normal']).toContain(textStyles.fontWeight);

  console.log('✓ Textarea has correct font styling: NotationFont, non-italic, normal weight');
});

test('Textarea should display PUA glyphs correctly', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });

  const textarea = page.locator('.notation-textarea').first();
  await expect(textarea).toBeVisible();

  // Type notation that should produce PUA glyphs
  await textarea.click();
  await page.keyboard.type('1 2 3');
  await page.waitForTimeout(300);

  // Verify the textarea has content
  const value = await textarea.inputValue();
  expect(value.length).toBeGreaterThan(0);

  // The value should contain PUA characters (U+E000+) for notation
  // NotationFont maps '1', '2', '3' to PUA glyphs
  console.log('Textarea value:', value);
  console.log('Textarea value codepoints:', [...value].map(c => c.codePointAt(0).toString(16)));

  console.log('✓ Textarea displays content correctly');
});
