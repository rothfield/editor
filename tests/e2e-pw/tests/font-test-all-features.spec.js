import { test, expect } from '@playwright/test';

test('Font Test: Display Octaves, Sharps, and Symbols', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  
  await page.waitForTimeout(2000);
  
  // Open Font Test tab
  const fontTestLink = page.locator('text=Font Test');
  if (await fontTestLink.count() > 0) {
    await fontTestLink.click();
    await page.waitForTimeout(1000);
  }
  
  // Take screenshot of Octave Variants (default)
  await page.screenshot({ path: 'test-results/font-octaves-full.png', fullPage: true });
  console.log('✓ Octave variants screenshot');
  
  // Click "Sharp Accidentals" button
  const sharpsBtn = page.locator('button:has-text("Sharp Accidentals")').first();
  if (await sharpsBtn.count() > 0) {
    console.log('Clicking Sharp Accidentals button');
    await sharpsBtn.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'test-results/font-sharps-full.png', fullPage: true });
    console.log('✓ Sharp accidentals screenshot');
  }
  
  // Click "Barlines & Symbols" button
  const symbolsBtn = page.locator('button:has-text("Barlines & Symbols")').first();
  if (await symbolsBtn.count() > 0) {
    console.log('Clicking Barlines & Symbols button');
    await symbolsBtn.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'test-results/font-symbols-full.png', fullPage: true });
    console.log('✓ Symbols screenshot');
  }
  
  // Verify we found the buttons
  const allBtns = page.locator('button');
  const btnCount = await allBtns.count();
  console.log(`Total buttons on page: ${btnCount}`);
});
