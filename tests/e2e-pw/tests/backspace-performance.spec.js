import { test, expect } from '@playwright/test';

test('Backspace should complete in under 500ms', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' });

  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();

  // Type some text
  await editor.click();
  await page.keyboard.type('hello world');
  await page.waitForTimeout(500);

  // Measure backspace performance
  const startTime = Date.now();
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(100); // Small wait for operation to complete
  const duration = Date.now() - startTime;

  console.log(`Backspace took: ${duration}ms`);

  // Should be under 500ms (27 seconds is 27000ms - WAY too slow)
  expect(duration).toBeLessThan(500);
});
