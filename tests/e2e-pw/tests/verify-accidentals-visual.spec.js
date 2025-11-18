/**
 * Visual verification test: Capture Font Test display with accidentals visible
 */

import { test, expect } from '@playwright/test';

test('Capture Font Test Number System with accidentals', async ({ page }) => {
  await page.goto('http://localhost:8080');

  // Wait for app
  await page.waitForSelector('[data-testid="editor-root"]', { state: 'visible', timeout: 10000 });

  // Open Inspector panel (if not already open)
  const inspectorBtn = page.locator('button:has-text("Inspector")');
  if (await inspectorBtn.isVisible()) {
    await inspectorBtn.click();
  }

  // Navigate to Font Test tab
  await page.waitForSelector('#tab-font-test', { state: 'visible', timeout: 5000 });
  await page.click('#tab-font-test');

  // Wait for Font Test grid to load
  await page.waitForSelector('#font-test-grid', { state: 'visible', timeout: 5000 });
  await page.waitForTimeout(1500); // Give time for full render

  // Scroll down to Number System section
  const numberSystemHeading = page.locator('h3:has-text("Number System")');
  await expect(numberSystemHeading).toBeVisible();
  await numberSystemHeading.scrollIntoViewIfNeeded();

  // Wait a bit for scroll to complete
  await page.waitForTimeout(500);

  // Take screenshot of the Number System section
  const numberSystemSection = page.locator('h3:has-text("Number System")').locator('..');
  await numberSystemSection.screenshot({ path: 'artifacts/number-system-accidentals.png' });

  console.log('✓ Screenshot captured: artifacts/number-system-accidentals.png');

  // Verify that accidentals are displayed with correct labels
  // Check for "♭" (flat), "hf♭" (half-flat), "𝄫" (double-flat), "♯" (sharp), "𝄪" (double-sharp)
  const flatLabel = page.locator('text="♭"').first();
  const sharpLabel = page.locator('text="♯"').first();

  await expect(flatLabel).toBeVisible();
  await expect(sharpLabel).toBeVisible();

  console.log('✓ Accidental symbols visible in Font Test');
});
