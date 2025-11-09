import { test } from '@playwright/test';

test('Check Font Test tab and barline codepoints', async ({ page }) => {
  console.log('=== Font Test Inspection ===');
  
  // Visit app
  await page.goto('http://localhost:8080', { waitUntil: 'load' });
  console.log('Page loaded');
  
  // Wait for any content
  await page.waitForTimeout(2000);
  
  // Log all buttons
  const buttons = await page.locator('button').all();
  console.log(`Found ${buttons.length} buttons`);
  
  for (let i = 0; i < Math.min(15, buttons.length); i++) {
    const text = await buttons[i].textContent();
    console.log(`  Button ${i}: "${text}"`);
  }
  
  // Try clicking Font tab
  for (const btn of buttons) {
    const text = await btn.textContent();
    if (text && (text.includes('Font') || text.includes('font'))) {
      console.log(`\nClicking button: "${text}"`);
      await btn.click();
      await page.waitForTimeout(1000);
      break;
    }
  }
  
  // Take screenshot
  await page.screenshot({ path: '/tmp/font_test_screenshot.png', fullPage: true });
  console.log('Screenshot saved');
  
  // Try to find glyphs
  const glyphs = page.locator('.font-test-glyph');
  const count = await glyphs.count();
  console.log(`Found ${count} glyph elements`);
});
