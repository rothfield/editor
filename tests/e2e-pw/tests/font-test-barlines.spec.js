import { test } from '@playwright/test';
import fs from 'fs';
import path from 'path';

test('Screenshot Font Test tab', async ({ page }) => {
  await page.goto('http://localhost:8080', { waitUntil: 'networkidle' });
  
  // Wait for inspector
  const inspector = page.locator('[data-testid="inspector-root"]');
  if (await inspector.count() === 0) {
    console.log('Inspector not found');
    return;
  }
  
  // Find and click Font Test tab
  const buttons = page.locator('button');
  const count = await buttons.count();
  
  for (let i = 0; i < count; i++) {
    const btn = buttons.nth(i);
    const text = await btn.textContent();
    console.log(`Button ${i}: "${text}"`);
    if (text && text.includes('Font')) {
      console.log(`Clicking Font Test button at index ${i}`);
      await btn.click();
      await page.waitForTimeout(1000);
      break;
    }
  }
  
  // Take screenshot
  await page.screenshot({ path: '/tmp/font_test_tab.png' });
  console.log('Screenshot saved to /tmp/font_test_tab.png');
  
  // Try to find and log glyph information
  const glyphItems = page.locator('.font-test-glyph-item');
  const itemCount = await glyphItems.count();
  console.log(`Found ${itemCount} glyph items`);
  
  // Log first few items
  for (let i = 0; i < Math.min(5, itemCount); i++) {
    const item = glyphItems.nth(i);
    const label = await item.locator('.font-test-glyph-label').textContent();
    const cp = await item.locator('.font-test-glyph-codepoint').textContent();
    console.log(`Item ${i}: "${label}" → ${cp}`);
  }
});
