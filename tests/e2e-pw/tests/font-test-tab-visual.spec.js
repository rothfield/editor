import { test, expect } from '@playwright/test';

test('Font Test Tab: View all available glyphs', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  
  // Wait for app to load
  await page.waitForTimeout(2000);
  
  // Look for font test button/tab - try different selectors
  let fontTestButton = page.locator('button:has-text("Font")').first();
  
  // If not found by text, try finding tab with "Font" label
  if (!(await fontTestButton.isVisible())) {
    fontTestButton = page.locator('[role="tab"]:has-text("Font")').first();
  }
  
  // If still not found, try looking for any button containing "Test"
  if (!(await fontTestButton.isVisible())) {
    fontTestButton = page.locator('button:has-text("Test")').first();
  }
  
  // Try to find by any visible button in the interface
  const allButtons = page.locator('button');
  const count = await allButtons.count();
  console.log(`Found ${count} buttons`);
  
  // List first 10 button texts
  for (let i = 0; i < Math.min(10, count); i++) {
    const text = await allButtons.nth(i).textContent();
    console.log(`  Button ${i}: "${text}"`);
  }
  
  // Take a screenshot to see the UI
  await page.screenshot({ path: 'test-results/font-tab-search.png', fullPage: true });
});
