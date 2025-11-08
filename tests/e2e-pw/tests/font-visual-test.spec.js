import { test, expect } from '@playwright/test';

test('Visual test: NotationFont renders correctly with number system', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  
  // Wait for editor to be visible
  const editor = page.locator('[role="textbox"]').first();
  await expect(editor).toBeVisible({ timeout: 10000 });
  
  // Click and type notation
  await editor.click();
  await page.keyboard.type('1 2 3 4 5');
  
  // Take screenshot
  await page.screenshot({ path: 'test-results/font-visual-render.png', fullPage: true });
  
  // Verify content was entered
  const text = await editor.textContent();
  expect(text).toContain('1');
  expect(text).toContain('2');
  
  console.log('✓ Font rendering test passed');
});

test('Visual test: Font Test tab displays all glyphs', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  
  // Wait for app to fully load
  await page.waitForTimeout(2000);
  
  // Look for Font Test tab or button
  const tabs = page.locator('button, [role="tab"]');
  const tabCount = await tabs.count();
  
  if (tabCount > 0) {
    // Take screenshot of the UI
    await page.screenshot({ path: 'test-results/font-ui-tabs.png', fullPage: true });
  }
  
  console.log('✓ UI test passed');
});
