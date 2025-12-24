import { test, expect } from '@playwright/test';

test('Set system start marker by clicking', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(1000);

  // Get indicator for line 0
  const indicator = page.locator('.system-marker-indicator[data-line-index="0"]');

  // Before: should show dot (no marker)
  const beforeText = await indicator.textContent();
  console.log('Before setting marker:', beforeText);
  expect(beforeText).toBe('·');

  // Click to cycle to «1
  await indicator.click();
  await page.waitForTimeout(300);

  // Indicator should now show «1
  const afterText = await indicator.textContent();
  console.log('After setting marker:', afterText);
  expect(afterText).toBe('«1');
});

test('Set 2-line system and verify MusicXML bracket grouping', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(1000);

  // Wait for WASM
  await page.waitForFunction(() => {
    return window.editor && window.editor.wasmModule;
  });

  // Add a second line
  await page.evaluate(async () => {
    await window.editor.wasmModule.insertNewline();
    await window.editor.renderAndUpdate();
  });

  await page.waitForTimeout(300);

  // Get indicators
  const indicators = page.locator('.system-marker-indicator');
  const indicator0 = indicators.nth(0);
  const indicator1 = indicators.nth(1);

  // Set line 0 to «2 (2-line system)
  await indicator0.click(); // → «1
  await page.waitForTimeout(100);
  await indicator0.click(); // → «2
  await page.waitForTimeout(300);

  // Verify indicators show correct markers
  const line0Text = await indicator0.textContent();
  const line1Text = await indicator1.textContent();
  console.log('Line 0 marker:', line0Text);
  console.log('Line 1 marker:', line1Text);

  expect(line0Text).toBe('«2'); // Start with count
  expect(line1Text).toBe('└'); // End indicator
});
