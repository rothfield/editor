import { test } from '@playwright/test';

test('check Chrome measurements with current font', async ({ page }) => {
  const logs = [];
  page.on('console', msg => logs.push(msg.text()));

  await page.goto('http://localhost:8080');
  await page.waitForTimeout(3000);

  // Find DEBUG lines
  const debugLines = logs.filter(log => log.includes('[DEBUG]'));

  console.log('\n=== Chrome Measurements ===');
  debugLines.forEach(log => console.log(log));
  console.log('===========================\n');

  // Also directly measure
  const directMeasurement = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.font = '32px NotationFont';

    const pua1 = String.fromCodePoint(0xE100);
    return ctx.measureText(pua1).width;
  });

  console.log(`Direct measurement of U+E100: ${directMeasurement}px`);
  console.log(`Expected: ~8.5px\n`);
});
