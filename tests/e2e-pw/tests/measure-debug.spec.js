import { test } from '@playwright/test';
import * as fs from 'fs';

test('measure glyph widths debug', async ({ page }) => {
  // Serve the debug HTML
  const html = fs.readFileSync('/tmp/debug-measurement.html', 'utf8');
  await page.setContent(html.replace('http://localhost:8080', 'http://localhost:8080'));

  // Wait for fonts to load
  await page.waitForFunction(() => document.fonts.ready);
  await page.waitForTimeout(500); // Extra safety

  // Get the results
  const results = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.font = '32px NotationFont';

    const ascii1 = ctx.measureText('1').width;
    const pua1 = ctx.measureText(String.fromCodePoint(0xE100)).width;

    return {
      ascii1,
      pua1,
      expected_advance: (572 / 1000) * 32,
      expected_visual: (266 / 1000) * 32
    };
  });

  console.log('=== Canvas Measurement Results (32px NotationFont) ===');
  console.log(`ASCII "1" measured width: ${results.ascii1}px`);
  console.log(`PUA U+E100 measured width: ${results.pua1}px`);
  console.log();
  console.log(`Expected advance width (from font): ${results.expected_advance.toFixed(3)}px`);
  console.log(`Expected visual width (from font): ${results.expected_visual.toFixed(3)}px`);
  console.log();
  console.log(`Measured vs Expected Advance: ${(results.pua1 - results.expected_advance).toFixed(3)}px difference`);
  console.log('==============================================');
});
