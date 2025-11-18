import { test, expect } from '@playwright/test';

test('Half-flat glyphs show in Font Test tab', async ({ page }) => {
  await page.goto('http://localhost:8080');

  // Wait for editor to load
  await page.waitForSelector('[data-testid="editor-root"]');
  await page.waitForTimeout(2000); // Wait for WASM to load

  // Click Font Test tab
  await page.click('[data-testid="tab-font-test"]');
  await page.waitForTimeout(1000);

  // Click "Show All" button to display comprehensive view
  await page.click('#font-test-show-all');
  await page.waitForTimeout(1000);

  // Take screenshot of entire Font Test tab
  const fontTestContent = page.locator('#tab-content-font-test');
  await fontTestContent.screenshot({
    path: 'artifacts/font-test-halfflat-full.png',
    fullPage: true
  });

  // Scroll down to find the Number System section
  const numberSection = page.locator('text=Number System').first();
  await numberSection.scrollIntoViewIfNeeded();
  await expect(numberSection).toBeVisible();
  await page.waitForTimeout(500);

  // Take screenshot of Number System section
  const numberSystemContainer = page.locator('.mb-6.border-b-2').filter({ hasText: 'Number System' });
  await numberSystemContainer.screenshot({
    path: 'artifacts/font-test-number-system.png'
  });

  // Look for half-flat glyphs (look for "hf♭" text which is the accidental label)
  const halfFlatGlyph = page.locator('text=1hf♭').first();
  await halfFlatGlyph.scrollIntoViewIfNeeded();

  // Take close-up of first character's accidentals (including half-flat)
  const firstChar = numberSystemContainer.locator('.border.border-gray-300').first();
  await firstChar.screenshot({
    path: 'artifacts/font-test-halfflat-closeup.png'
  });

  console.log('✓ Half-flat glyphs captured in Font Test tab');

  console.log('Screenshots saved:');
  console.log('- artifacts/font-test-halfflat-full.png');
  console.log('- artifacts/font-test-halfflat-closeup.png');
});
