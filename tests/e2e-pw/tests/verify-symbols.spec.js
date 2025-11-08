import { test } from '@playwright/test';

test('Screenshot: Verify Bravura symbols rendering', async ({ page }) => {
  await page.goto('http://localhost:8080/');

  // Click Font Test tab
  const fontTestTab = page.getByTestId('tab-font-test');
  await fontTestTab.click();

  // Click symbols button
  const symbolsBtn = page.locator('#font-test-show-symbols');
  await symbolsBtn.click();
  await page.waitForTimeout(500);

  // Take full screenshot
  const grid = page.locator('#font-test-grid');
  await grid.screenshot({ path: '/tmp/symbols-final.png' });
  console.log('✅ Symbols screenshot saved');
});
