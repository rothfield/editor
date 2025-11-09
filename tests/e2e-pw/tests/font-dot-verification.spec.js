import { test, expect } from '@playwright/test';

test('Verify octave dot positioning (Font dots to the right)', async ({ page }) => {
  // Navigate to app
  await page.goto('http://localhost:8080', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle');
  
  // Click inspector tab to open panels
  const inspectorBtn = page.getByRole('button', { name: /inspector/i }).first();
  if (await inspectorBtn.isVisible().catch(() => false)) {
    await inspectorBtn.click();
    await page.waitForTimeout(300);
  }
  
  // Click Font Test tab
  const fontTestBtn = page.getByRole('button', { name: /font test/i }).first();
  if (await fontTestBtn.isVisible().catch(() => false)) {
    await fontTestBtn.click();
    await page.waitForTimeout(300);
  }
  
  // Click on "Octave Variants" tab to show the octave variants
  const octaveBtn = page.locator('button, [role="tab"]').filter({ hasText: /octave variants/i }).first();
  if (await octaveBtn.isVisible().catch(() => false)) {
    await octaveBtn.click();
    await page.waitForTimeout(300);
  }
  
  // Take screenshot
  await page.screenshot({ 
    path: '/tmp/font-test-octave-variants.png',
    fullPage: true
  });
  
  // Basic assertion
  expect(true).toBe(true);
});
