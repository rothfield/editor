import { test, expect } from '@playwright/test';

test('Backspace text tokens should be fast', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' });

  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();

  // Type multiple text tokens to create continuations
  await editor.click();
  await page.keyboard.type('hello world foo bar baz');
  await page.waitForTimeout(300);

  // Verify text cells were created
  const cellCount = await page.evaluate(() => {
    const doc = window.MusicNotationApp?.app()?.editor?.theDocument;
    return doc?.lines?.[0]?.cells?.length || 0;
  });

  console.log(`Created ${cellCount} cells`);
  expect(cellCount).toBeGreaterThan(15); // Multiple text tokens with continuations

  // Now measure backspace performance on text tokens
  const durations = [];

  for (let i = 0; i < 5; i++) {
    const start = Date.now();
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(50);
    const duration = Date.now() - start;
    durations.push(duration);
    console.log(`Backspace ${i + 1}: ${duration}ms`);
  }

  const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
  console.log(`Average backspace duration: ${avgDuration}ms`);

  // Each backspace should be under 500ms
  for (const duration of durations) {
    expect(duration).toBeLessThan(500);
  }
});
