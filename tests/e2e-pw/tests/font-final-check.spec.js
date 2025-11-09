import { test } from '@playwright/test';

test('Final Font Test verification with screenshot', async ({ page }) => {
  await page.goto('http://localhost:8080', { waitUntil: 'load' });
  await page.waitForTimeout(2000);
  
  // Click Font Test tab
  const buttons = await page.locator('button').all();
  for (const btn of buttons) {
    const text = await btn.textContent();
    if (text && text.includes('Font Test')) {
      await btn.click();
      await page.waitForTimeout(500);
      break;
    }
  }
  
  // Click Barlines & Symbols button
  const allBtns = page.locator('button');
  const btnCount = await allBtns.count();
  for (let i = 0; i < btnCount; i++) {
    const btn = allBtns.nth(i);
    const text = await btn.textContent();
    if (text && (text.includes('Barlines') || text.includes('Symbols'))) {
      await btn.click();
      await page.waitForTimeout(1000);
      break;
    }
  }
  
  // Take screenshot
  await page.screenshot({ path: '/tmp/font_test_barlines_fixed.png', fullPage: true });
  console.log('✓ Screenshot saved');
});
