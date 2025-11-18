/**
 * Capture full Font Test page for visual verification
 */

import { test, expect } from '@playwright/test';

test('Capture full Font Test page', async ({ page }) => {
  await page.goto('http://localhost:8080');
  await page.waitForSelector('[data-testid="editor-root"]', { state: 'visible', timeout: 10000 });

  // Open Inspector
  const inspectorBtn = page.locator('button:has-text("Inspector")');
  if (await inspectorBtn.isVisible()) {
    await inspectorBtn.click();
  }

  // Click Font Test tab
  await page.click('#tab-font-test');
  await page.waitForSelector('#font-test-grid', { state: 'visible', timeout: 5000 });
  await page.waitForTimeout(2000); // Full render

  // Scroll to Number System heading
  await page.evaluate(() => {
    const heading = [...document.querySelectorAll('h3')].find(h => h.textContent.includes('Number System'));
    if (heading) heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  await page.waitForTimeout(1000);

  // Take full page screenshot
  await page.screenshot({ path: 'artifacts/font-test-full-page.png', fullPage: true });

  console.log('✓ Full page screenshot saved: artifacts/font-test-full-page.png');
});
