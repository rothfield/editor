import { test } from '@playwright/test';

test('Final verification: Base flat vs Half-flat', async ({ page }) => {
  await page.goto('http://localhost:8080');
  await page.waitForSelector('[data-testid="editor-root"]');
  await page.waitForTimeout(2000);

  // Click Font Test tab
  await page.click('[data-testid="tab-font-test"]');
  await page.waitForTimeout(1000);
  await page.click('#font-test-show-all');
  await page.waitForTimeout(1000);

  // Set large font size for clarity
  await page.evaluate(() => {
    document.querySelector('#font-test-size').value = '48';
    document.querySelector('#font-test-size').dispatchEvent(new Event('change'));
  });
  await page.waitForTimeout(500);

  // Scroll to Number System
  const numberSection = page.locator('text=Number System').first();
  await numberSection.scrollIntoViewIfNeeded();

  // Get character "1" accidentals
  const char1Container = page.locator('.border.border-gray-300', {
    has: page.locator('text="1" - Natural (octave 0)')
  });

  const accidentalsGrid = char1Container.locator('.grid.grid-cols-4.gap-2').last();
  await accidentalsGrid.screenshot({
    path: 'artifacts/final-flat-vs-halfflat-comparison.png'
  });

  console.log('✓ Final comparison screenshot saved:');
  console.log('  artifacts/final-flat-vs-halfflat-comparison.png');
  console.log('');
  console.log('Expected results:');
  console.log('  1♭ (Flat):      Hollow head from Noto Music');
  console.log('  1hf♭ (Half-flat): Same hollow head + slash through stem');
});
