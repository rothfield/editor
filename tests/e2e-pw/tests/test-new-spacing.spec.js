import { test, expect } from '@playwright/test';
import { waitForEditorReady } from '../utils/editor.helpers.js';

test('verify new "11" spacing after font fix', async ({ page }) => {
  // Force cache bypass to load new font
  await page.goto('/', { waitUntil: 'networkidle' });

  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();
  await waitForEditorReady(page);

  // Type "11"
  await editor.click();
  await page.keyboard.type('11');
  await page.waitForTimeout(500);

  // Get canvas measurement
  const canvasMeasurement = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.font = '32px NotationFont';

    const pua1 = String.fromCodePoint(0xE100);
    return ctx.measureText(pua1).width;
  });

  console.log(`\n=== New Spacing Verification ===`);
  console.log(`PUA U+E100 canvas width: ${canvasMeasurement}px`);
  console.log(`Expected: ~8.5-9px (down from 18px)`);
  console.log(`\nIf this shows ~9px, the fix worked! ✓`);
  console.log(`If this still shows ~18px, browser cache needs clearing.`);
  console.log(`================================\n`);

  // Verify the measurement is in the expected range
  expect(canvasMeasurement).toBeGreaterThan(8);
  expect(canvasMeasurement).toBeLessThan(10);
});
