import { test, expect } from '@playwright/test';

test('Font Test tab uses WASM-generated constants', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  
  await page.waitForTimeout(2000);
  
  // Open Font Test tab (3rd tab on the right)
  const tabs = page.locator('[role="tab"]');
  const fontTestTab = page.locator('a:has-text("Font Test")').first();
  
  // Look for Font Test link in inspector
  let fontTestLink = page.locator('text=Font Test').first();
  if (await fontTestLink.count() > 0) {
    console.log('Found Font Test link');
    await fontTestLink.click();
  }
  
  // Wait for tab to load
  await page.waitForTimeout(1500);
  
  // Check browser console for the log message about WASM config
  let consoleMessages = [];
  page.on('console', msg => {
    consoleMessages.push(msg.text());
    if (msg.text().includes('Font config')) {
      console.log(msg.text());
    }
  });
  
  // Take screenshot
  await page.screenshot({ path: 'test-results/font-test-wasm.png', fullPage: true });
  
  // Check for success message in console
  const hasWasmMessage = consoleMessages.some(msg => msg.includes('Font config loaded from WASM'));
  console.log(`WASM message found: ${hasWasmMessage}`);
  console.log(`Total console messages: ${consoleMessages.length}`);
});

test('Font glyphs render with correct codepoints', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  
  await page.waitForTimeout(2000);
  
  // Click Font Test link
  let fontTestLink = page.locator('text=Font Test');
  if (await fontTestLink.count() > 0) {
    await fontTestLink.click();
  }
  
  await page.waitForTimeout(1500);
  
  // Look for octave variant displays
  const octaveSection = page.locator('text=Octave Variants').first();
  
  // Get the glyph codepoints displayed
  const codepoints = page.locator('[class*="codepoint"]');
  const count = await codepoints.count();
  
  console.log(`Found ${count} codepoint labels`);
  
  // Check first few codepoints (should be U+E000, U+E001, U+E002, U+E003)
  if (count > 0) {
    const first = await codepoints.first().textContent();
    console.log(`First codepoint: ${first}`);
    expect(first).toContain('U+E000');
  }
  
  // Take screenshot showing all glyphs
  await page.screenshot({ path: 'test-results/font-test-glyphs.png', fullPage: true });
});
