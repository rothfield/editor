import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('Half-flat slash visual verification', async ({ page }) => {
  // Navigate to the visual test page
  const testPagePath = path.join(__dirname, '../../../test-halfflat-visual.html');
  await page.goto(`file://${testPagePath}`);

  // Wait for font to load
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000); // Give extra time for font rendering

  // Take screenshot of the entire page
  await page.screenshot({
    path: 'artifacts/halfflat-visual-full.png',
    fullPage: true
  });

  // Take close-up screenshot of the large half-flat glyph
  const largeGlyph = page.locator('#halfflat-large');
  await expect(largeGlyph).toBeVisible();
  await largeGlyph.screenshot({
    path: 'artifacts/halfflat-glyph-closeup.png'
  });

  // Take screenshot of comparison section
  const comparison = page.locator('.comparison');
  await comparison.screenshot({
    path: 'artifacts/halfflat-comparison.png'
  });

  console.log('Screenshots saved to artifacts/');
  console.log('- halfflat-visual-full.png: Full page view');
  console.log('- halfflat-glyph-closeup.png: Close-up of half-flat glyph');
  console.log('- halfflat-comparison.png: Comparison of natural, flat, and half-flat');
});
